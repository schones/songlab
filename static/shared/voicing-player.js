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
 *   const result = await player.play(schedule, { onNote, onEnd });
 *     result: { played: true } | { played: false, reason: 'muted' | 'blocked' | 'error' | 'empty' }
 *     onNote(note, 'on' | 'off')  at each note's attack and release (frame-aligned via Tone.Draw)
 *     onEnd({ stopped })          when the schedule runs out, or on stop()
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
   * @param {{ onNote?: (note, phase: 'on'|'off') => void, onEnd?: ({ stopped: boolean }) => void }} [callbacks]
   */
  async play(schedule, { onNote = () => {}, onEnd = () => {} } = {}) {
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
    this._part = new Tone.Part((time, note) => {
      const name = Tone.Frequency(note.midi, 'midi').toNote();
      const velocity = (VELOCITY[note.role] || 0.6) * (note.leadIn ? LEAD_IN_GAIN : 1);
      sampler.triggerAttackRelease(name, Math.max(note.duration, 0.02), time, velocity);
      Tone.Draw.schedule(() => onNote(note, 'on'), time);
      Tone.Draw.schedule(() => onNote(note, 'off'), time + note.duration);
    }, schedule.notes.map(n => [n.time + START_DELAY, n]));
    this._part.start(0);
    this._endId = transport.scheduleOnce(time => {
      Tone.Draw.schedule(() => { if (this._part) this._finish(false); }, time);
    }, schedule.duration + START_DELAY + END_TAIL);
    transport.start();
    this._setState('playing');
    return { played: true };
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

export { VoicingPlayer, loadTone, loadSampler, SALAMANDER_VERSION, SALAMANDER_BASE, SALAMANDER_URLS };

if (typeof window !== 'undefined') {
  window.VoicingPlayer = VoicingPlayer;
}
