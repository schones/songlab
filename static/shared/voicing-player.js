/**
 * voicing-player.js
 * =================
 * Thin Tone.js player for /voicings. Plays a schedule from
 * voicing-playback-model.js `toSchedule()` on a Salamander piano sampler.
 * Tone (UMD global, the same pinned cdnjs build the rest of the app uses) and
 * the samples load lazily on the first play, through shared promises that
 * reset on failure — the Verovio loader pattern in voicing-staff.js.
 *
 * Usage:
 *   const player = new VoicingPlayer({ onState: s => … });   // 'idle' | 'loading' | 'ready' | 'playing' | 'blocked' | 'error'
 *   const result = await player.play(schedule, { onNote, onPiece, onEnd, startAt });
 *     result: { played: true, startedAt } | { played: false, reason: 'muted' | 'blocked' | 'error' | 'empty' }
 *     startAt  (optional) the AudioContext time (seconds) at which schedule time 0 lies — the
 *                                         Transport start; a note at schedule time t sounds at startAt + t +
 *                                         START_DELAY. A number, or a function (now) => number called once
 *                                         everything is loaded, right before the Transport starts, with `now`
 *                                         = Tone.now() (the earliest start). Default / anything earlier: now.
 *                                         The player's count-in anchors its click here (metronome.js).
 *     startedAt                           the time actually used
 *     onNote(note, 'on' | 'off')          at each note's attack and release (frame-aligned via Tone.Draw);
 *                                         a lead-in note fires 'on' at the bar start (schedule.barStart) if it
 *                                         is still sounding then, and not at all if it ended before
 *     onPiece(piece, 'on' | 'off', note)  for each of the note's staff pieces ({ staffId, time, duration })
 *     onEnd({ stopped })                  when the schedule runs out, or on stop()
 *   player.stop();                                              // releases every note immediately
 *
 * Gesture: call play() from the click handler. Tone.start() is awaited there;
 * if the context is still not running afterwards (the activation expired
 * during a slow first load) the state becomes 'blocked' and play() returns
 * { played: false, reason: 'blocked' } — the page asks for another click.
 * Playback respects the global AudioToggle mute, as keyboard-view does.
 */

const TONE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';

/**
 * Salamander Grand Piano, vendored in static/vendor/salamander/ (29 mp3s,
 * ~2 MB) from github.com/Tonejs/audio at commit 869b6f8d9cdd — the last one
 * touching salamander/, 2020-04-30. Author Alexander Holm, CC BY 3.0; see
 * static/vendor/salamander/README.md. jsDelivr could not serve the repo (229 MB,
 * over its 50 MB limit) and GitHub Pages cannot be pinned, hence vendoring.
 */
const SALAMANDER_VERSION = '869b6f8d9cddb47d966238c012041480b1ce517a';
const SALAMANDER_BASE = '/static/vendor/salamander/';   // pinned by the vendored copy; SALAMANDER_VERSION records its commit
const SALAMANDER_URLS = {
  A0: 'A0.mp3',  C1: 'C1.mp3',  'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',  C2: 'C2.mp3',  'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',  C3: 'C3.mp3',  'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',  C4: 'C4.mp3',  'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',  C5: 'C5.mp3',  'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',  C6: 'C6.mp3',  'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',  C7: 'C7.mp3',  'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
};

/** Pitch-class spellings Tone's note parser reads: ASCII sharps, the spelling of the SALAMANDER_URLS keys. */
const SAMPLER_PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * The name to hand a Tone.Sampler for a midi number: "C#4", "A#3" (60 → "C4").
 * Every sampler call on the site goes through this one. Display spellings
 * (parseNote / pcToNote: "C♯", "B♭") are NOT sampler names — Tone's parser
 * does not read ♯ / ♭, the name becomes NaN and the note never sounds.
 * @param {number} midi
 * @returns {string}
 */
function midiToNoteName(midi) {
  const m = Math.round(Number(midi));
  if (!Number.isFinite(m)) throw new TypeError(`midiToNoteName: not a midi number: ${midi}`);
  return `${SAMPLER_PC_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

const VELOCITY = { bass: 0.75, voicing: 0.6, melody: 0.8 };
const LEAD_IN_GAIN = 0.85;       // lead-in notes a touch softer than the bar itself
const START_DELAY = 0.08;        // seconds of scheduling headroom after now
const END_TAIL = 0.1;            // seconds after the last release before onEnd
const START_TIMEOUT_MS = 1500;   // Tone.start() without a live gesture can hang: give up and report 'blocked'

let _tone = null;
/** Load Tone.js once (UMD global); the promise is shared and reset on failure. */
function loadTone() {
  if (typeof window !== 'undefined' && window.Tone) return Promise.resolve(window.Tone);
  if (!_tone) {
    _tone = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TONE_URL;
      s.onload = () => (window.Tone ? resolve(window.Tone) : reject(new Error('Tone.js loaded but window.Tone is missing')));
      s.onerror = () => reject(new Error('Tone.js failed to load'));
      document.head.appendChild(s);
    }).catch(err => { _tone = null; throw err; });
  }
  return _tone;
}

let _sampler = null;
/** Load the piano once; shared promise, reset on failure. Resolves to the Tone.Sampler. */
function loadSampler() {
  if (!_sampler) {
    _sampler = loadTone().then(Tone => new Promise((resolve, reject) => {
      const volume = new Tone.Volume(-6).toDestination();
      const sampler = new Tone.Sampler({
        urls: SALAMANDER_URLS,
        baseUrl: SALAMANDER_BASE,
        release: 1,
        onload: () => resolve(sampler),
        onerror: err => reject(err instanceof Error ? err : new Error('Salamander samples failed to load')),
      }).connect(volume);
    })).catch(err => { _sampler = null; throw err; });
  }
  return _sampler;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

class VoicingPlayer {
  /** @param {{ onState?: (state: string) => void }} [options] */
  constructor(options = {}) {
    this._onState = options.onState || (() => {});
    this._state = 'idle';
    this._part = null;
    this._endId = null;
    this._sampler = null;
    this._onEnd = null;
    this._token = 0;
  }

  get state() { return this._state; }
  get playing() { return this._state === 'playing'; }

  _setState(state) {
    if (this._state === state) return;
    this._state = state;
    this._onState(state);
  }

  /**
   * Play a schedule. Stops any current playback first. Must be called from a
   * user gesture the first time (Tone.start()).
   * @param {{ notes: Array, duration: number }} schedule  from toSchedule()
   * @param {{ onNote?: (note, phase: 'on'|'off') => void, onPiece?: (piece, phase: 'on'|'off', note) => void, onEnd?: ({ stopped: boolean }) => void, startAt?: number | ((now: number) => number) }} [callbacks]
   */
  async play(schedule, { onNote = () => {}, onPiece = () => {}, onEnd = () => {}, startAt } = {}) {
    if (this.playing) this.stop();
    if (typeof window !== 'undefined' && window.AudioToggle && window.AudioToggle.isMuted()) return { played: false, reason: 'muted' };
    if (!schedule || !schedule.notes || !schedule.notes.length) return { played: false, reason: 'empty' };
    const token = ++this._token;

    let Tone;
    try {
      if (!this._sampler) this._setState('loading');
      Tone = await loadTone();
      // Resume inside the gesture; a resume that never settles means the activation is gone.
      await Promise.race([Tone.start(), sleep(START_TIMEOUT_MS)]);
      if (Tone.context.state !== 'running') { this._setState('blocked'); return { played: false, reason: 'blocked' }; }
      this._sampler = await loadSampler();
    } catch (err) {
      console.error('[voicing-player]', err);
      this._setState('error');
      return { played: false, reason: 'error', error: err };
    }
    if (token !== this._token) return { played: false, reason: 'superseded' };

    const sampler = this._sampler;
    const transport = Tone.Transport;
    transport.stop();
    transport.cancel(0);
    transport.position = 0;

    this._onEnd = onEnd;
    const visibleFrom = Number(schedule.barStart) || 0;   // nothing lights before the selected bar's beat 0
    this._part = new Tone.Part((time, note) => {
      const name = midiToNoteName(note.midi);
      const velocity = (VELOCITY[note.role] || 0.6) * (note.leadIn ? LEAD_IN_GAIN : 1);
      sampler.triggerAttackRelease(name, Math.max(note.duration, 0.02), time, velocity);
      const lightAt = time + Math.max(0, visibleFrom - note.time), lightEnd = time + note.duration;
      if (lightEnd > lightAt + 1e-6) {
        Tone.Draw.schedule(() => onNote(note, 'on'), lightAt);
        Tone.Draw.schedule(() => onNote(note, 'off'), lightEnd);
      }
      // Staff pieces have their own spans (tied noteheads of one note); times are relative to the note's.
      for (const piece of note.pieces || []) {
        const at = time + (piece.time - note.time);
        Tone.Draw.schedule(() => onPiece(piece, 'on', note), at);
        Tone.Draw.schedule(() => onPiece(piece, 'off', note), at + piece.duration);
      }
    }, schedule.notes.map(n => [n.time + START_DELAY, n]));
    this._part.start(0);
    this._endId = transport.scheduleOnce(time => {
      Tone.Draw.schedule(() => { if (this._part) this._finish(false); }, time);
    }, schedule.duration + START_DELAY + END_TAIL);
    // Transport time 0 at `startedAt` on the context clock: now, or later when the caller says so (a count-in).
    const now = Tone.now();
    const wanted = typeof startAt === 'function' ? startAt(now) : startAt;
    const startedAt = Number.isFinite(wanted) ? Math.max(now, wanted) : now;
    transport.start(startedAt);
    this._setState('playing');
    return { played: true, startedAt };
  }

  /** Stop now: future notes cancelled, sounding notes released. */
  stop() {
    if (!this.playing) return;
    this._finish(true);
  }

  _finish(stopped) {
    const Tone = window.Tone;
    if (Tone) {
      try {
        Tone.Transport.stop();
        Tone.Transport.cancel(0);
        Tone.Draw.cancel(0);
      } catch (_) { /* nothing to cancel */ }
      if (this._sampler) { try { this._sampler.releaseAll(); } catch (_) { } }
    }
    if (this._part) { try { this._part.dispose(); } catch (_) { } this._part = null; }
    this._endId = null;
    const onEnd = this._onEnd;
    this._onEnd = null;
    this._setState('ready');
    if (onEnd) onEnd({ stopped });
  }
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
//   node --input-type=module -e "import('./static/shared/voicing-player.js').then(m => m.selfTest())"
// Every piano key (midi 21–108) must map to a name the sampler accepts.
// Under Node the vendored sample files are checked on disk; in a browser
// with Tone loaded (window.Tone) the names also go through Tone's own parser.
// ════════════════════════════════════════════════════════════════════

/** Tone 14's note grammar (Tone.Frequency): letter, optional b / # / x / bb, octave. Anything else parses to NaN. */
const _TONE_NOTE_RE = /^([a-g](?:bb|b|#|x)?)(-?[0-9]+)$/i;
const _TONE_NOTE_PC = { cbb: -2, cb: -1, c: 0, 'c#': 1, cx: 2, dbb: 0, db: 1, d: 2, 'd#': 3, dx: 4, ebb: 2, eb: 3, e: 4, 'e#': 5, ex: 6, fbb: 3, fb: 4, f: 5, 'f#': 6, fx: 7, gbb: 5, gb: 6, g: 7, 'g#': 8, gx: 9, abb: 7, ab: 8, a: 9, 'a#': 10, ax: 11, bbb: 9, bb: 10, b: 11, 'b#': 12, bx: 13 };
/** Midi for a note name as Tone reads it, or NaN (what the sampler would get). */
function _toneMidi(name) {
  const m = String(name).match(_TONE_NOTE_RE);
  return m ? _TONE_NOTE_PC[m[1].toLowerCase()] + (parseInt(m[2], 10) + 1) * 12 : NaN;
}

async function selfTest() {
  let pass = 0, fail = 0;
  const assert = (label, ok, detail = '') => { if (ok) pass++; else { fail++; console.error(`FAIL: ${label}${detail ? ' — ' + detail : ''}`); } };
  const LOW = 21, HIGH = 108;   // A0–C8, the 88 keys
  const sampleMidis = Object.keys(SALAMANDER_URLS).map(_toneMidi);
  assert('every sample key is a name Tone reads', sampleMidis.every(Number.isFinite), Object.keys(SALAMANDER_URLS).filter(k => !Number.isFinite(_toneMidi(k))).join(' '));

  const seenPcs = new Set();
  for (let midi = LOW; midi <= HIGH; midi++) {
    const name = midiToNoteName(midi);
    seenPcs.add(midi % 12);
    assert(`midi ${midi} → "${name}" is a name the sampler accepts`, _TONE_NOTE_RE.test(name));
    assert(`midi ${midi} → "${name}" reads back as ${midi}`, _toneMidi(name) === midi, `got ${_toneMidi(name)}`);
    const nearest = Math.min(...sampleMidis.map(s => Math.abs(s - midi)));
    assert(`midi ${midi} ("${name}") has a sample within 3 semitones`, nearest <= 3, `nearest is ${nearest} away`);
    if (typeof window !== 'undefined' && window.Tone) assert(`Tone reads "${name}" as ${midi}`, window.Tone.Frequency(name).toMidi() === midi);
  }
  assert('all 12 pitch classes covered', seenPcs.size === 12);
  assert('black keys are ASCII sharps', [61, 63, 66, 68, 70].map(midiToNoteName).join(' ') === 'C#4 D#4 F#4 G#4 A#4');
  assert('60 is C4; 21 is A0; 108 is C8', [60, 21, 108].map(midiToNoteName).join(' ') === 'C4 A0 C8');
  // The regression: display spellings are not sampler names.
  assert('"C♯4" and "B♭3" are NOT names the sampler accepts', Number.isNaN(_toneMidi('C♯4')) && Number.isNaN(_toneMidi('B♭3')));
  let threw = false; try { midiToNoteName('x'); } catch (_) { threw = true; }
  assert('a non-number throws instead of naming a note', threw);

  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const fs = await import('node:fs'), url = await import('node:url');
    const dir = url.fileURLToPath(new URL('../vendor/salamander/', import.meta.url));
    for (const file of Object.values(SALAMANDER_URLS)) assert(`sample file ${file} is vendored`, fs.existsSync(dir + file));
  }

  console.log(`voicing-player selfTest: ${pass}/${pass + fail} passed`);
  return { pass, fail };
}

export {
  VoicingPlayer, loadTone, loadSampler, midiToNoteName, selfTest, SALAMANDER_VERSION, SALAMANDER_BASE, SALAMANDER_URLS,
  // Explainer layer (Session 6.5): read-only constants for interpolation into content.
  TONE_URL, VELOCITY, LEAD_IN_GAIN, START_TIMEOUT_MS, START_DELAY,
};

if (typeof window !== 'undefined') {
  window.VoicingPlayer = VoicingPlayer;
}
