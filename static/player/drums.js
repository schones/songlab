/**
 * drums.js
 * ========
 * A drum groove in place of the click (C): recorded one-shots on the Web
 * Audio clock — Tone's AudioContext, as metronome.js — and the pattern as
 * clock items. Four small samples (static/audio/drums/, CC0; CREDITS.txt
 * there), each with a synthesized stand-in that plays while the samples load
 * or when a file fails, so nothing goes silent. No Tone synths, no scheduler
 * of its own: the shared beat clock (beat-clock.js) says when, the page calls
 * hit() / stick() with the exact audio time. No DOM; Node-runnable with the
 * fake audio adapter the self-test uses.
 *
 *   drumsFor(time, beatsPerBar) → { ok, reason }
 *       4/4 only (a four-quarter bar with four quarter beats). Anything else:
 *       ok false and a short `reason` for the page ("Drums need 4/4: …"); the
 *       click plays instead.
 *   GROOVE                      one straight 4/4 bar: kick on beats 1 and 3,
 *       snare on 2 and 4, closed hi-hat on every eighth — [{ q, drum, level }],
 *       q in quarters from the downbeat, in time order. `level` is the hit's
 *       velocity, 0–1: 1 except the off-beat hats (HAT_OFFBEAT), so the hat is a
 *       little louder on the beat than between beats.
 *   grooveItems(bars, { barQuarters = 4 }) → [{ q, kind: 'hit', drum, level, part: 'drums' }]
 *       the groove over `bars` bars as clock items (start()'s `items`, q from the
 *       range start), so the hits follow tempo, loops, the form, pause and resume
 *       exactly as the notes do. Never an item at the range end.
 *
 *   createDrums({ audio }) → drums; `drums` below is the page's kit.
 *     hit(atAudioTime, drum, { countIn = false, accent = false, level = 1 } = {}) → sounded?
 *         ONE hit — 'kick' | 'snare' | 'hat' | 'stick' — at that audio time, at
 *         `level` (0–1) of the drum's own gain. A time already past, a muted page
 *         and an unknown drum are skipped (false).
 *     stick(atAudioTime, { accent = false } = {}) → sounded?
 *         a count-in stick click: a short bright tick, not the metronome's sine;
 *         `accent` (the bar's first beat) is a little louder. Counted as count-in.
 *     stop({ countIn = true } = {})
 *         silence now: every hit queued or sounding is cancelled (with
 *         countIn: false the count-in's sticks are left to sound).
 *     setGain(gain)      the kit's output gain — the player's mixer (player-mixer.js) sets it
 *     load()             → Promise of the samples' status; fetches and decodes the four
 *                        files once (the page calls it when audio starts; the first hit
 *                        does too). Never rejects.
 *     samples            { state: 'idle' | 'loading' | 'ready' | 'partial' | 'failed', loaded: [drum], failed: [drum] }
 *     queued             [{ time, drum, countIn }] not yet over (debugging / tests)
 *
 *   createSampleLoader({ files, fetchData, decode }) → { load(), get(drum), status }
 *       the once-only loader behind load(): files { drum: url }, fetchData(url) →
 *       Promise<ArrayBuffer>, decode(arrayBuffer) → Promise<AudioBuffer>. Each drum
 *       loads on its own: get(drum) is its buffer once decoded, null before that
 *       and for good if its file failed (the others still play their samples).
 *
 *   Sounds (DRUM_SPECS; toneAudio below). Samples: one hit each from Karoryfer
 *   Samples' "Gogodze Phu Vol II" (CC0 1.0) — kick, snare centre, closed
 *   hi-hat, and a sidestick for the count-in — mono FLAC, trimmed to the
 *   onset, each normalised to -1 dBFS, so `gain` alone sets the balance inside
 *   the kit. Fallback synths (spec.synth): kick = a sine falling 150 → 50 Hz;
 *   snare = white noise through a band-pass; hat = white noise through a
 *   high-pass, very short; stick = a triangle tick falling 2500 → 1800 Hz in
 *   30 ms. Either way each hit has its own gain node (the cancel handle zeroes
 *   it) into ONE Tone.Gain (the kit's level) to Tone's destination, apart from
 *   the pianos and the click; the page's mixer sets the kit against everything
 *   else. The site mute skips the sound, not the timing.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/drums.js').then(m => m.selfTest())"
 */

import { patternFor } from './metronome.js';

const EPS = 1e-6;
const SAMPLE_BASE = '/static/audio/drums/';   // the four one-shots; CREDITS.txt there names the kit and the source file of each
/**
 * Per drum: `file` (the sample, every one normalised to -1 dBFS), `gain` (the
 * sample's level: the balance inside the kit), `seconds` (the sample's length —
 * how long a hit counts as sounding), and `synth`, the stand-in while the
 * sample is not there: its own `gain` (peak of its envelope), `seconds` and
 * what makes the sound.
 * Sample gains, against the files' level over their first 50 ms (kick -10.1,
 * snare -13.3, hat -22.2, stick -15.3 dBFS): the snare sits about 10 dB
 * under the kick, the on-beat hat about 12.5 dB under the snare. The kick's
 * gain is over 1 on purpose (raised from 0.85 by ear, 2026-11-20): what
 * matters is the peak after the kit's output gain, at most 0.6 (the mixer's
 * ceiling in player.js). Mixing these files sample for sample, kick + snare +
 * hat started together peak at 1.27 before that gain — 0.76 after it at the
 * top of the volume slider — and the kick could go to about 1.8 before the
 * three could clip. Re-check if a file, a gain or the ceiling changes.
 */
const DRUM_SPECS = {
  kick: { file: 'kick.flac', gain: 1.35, seconds: 0.40, synth: { gain: 0.9, seconds: 0.28, osc: { type: 'sine', from: 150, to: 50, sweep: 0.09 } } },
  snare: { file: 'snare.flac', gain: 0.6, seconds: 0.26, synth: { gain: 0.5, seconds: 0.16, noise: { type: 'bandpass', frequency: 1800, Q: 0.6 } } },
  hat: { file: 'hat.flac', gain: 0.4, seconds: 0.20, synth: { gain: 0.16, seconds: 0.045, noise: { type: 'highpass', frequency: 7000, Q: 0.7 } } },
  stick: { file: 'stick.flac', gain: 0.75, seconds: 0.15, synth: { gain: 0.55, seconds: 0.03, osc: { type: 'triangle', from: 2500, to: 1800, sweep: 0.02 } } },
};
const STICK_ACCENT = 1.3;      // the count-in's first beat of a bar, against the others
const HAT_OFFBEAT = 0.7;       // a hat between beats, against one on the beat (about -3 dB): not machine-identical
/** The levels inside the kit that are not a drum's own gain, read at each hit (player.js drumItem): the dev panel (player-dev.js, ?dev=1) may change one mid-run. */
const DRUM_MIX = { hatOffbeat: HAT_OFFBEAT };
const NOISE_SECONDS = 0.5;     // the shared white-noise buffer of the fallback synths (longer than any noise drum)

/** One straight bar of 4/4, in time order (the kick / snare before the hat at one position). */
const GROOVE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].flatMap(q => {
  const hits = [];
  if (q === 0 || q === 2) hits.push({ q, drum: 'kick', level: 1 });
  if (q === 1 || q === 3) hits.push({ q, drum: 'snare', level: 1 });
  hits.push({ q, drum: 'hat', level: Number.isInteger(q) ? 1 : HAT_OFFBEAT });
  return hits;
});

/** Can the groove play this meter? 4/4 only. */
function drumsFor(time, beatsPerBar) {
  const t = String(time == null ? '' : time).trim();
  const p = patternFor(time, beatsPerBar);
  const ok = t === '4/4' && !p.warning && Math.abs(p.bar - 4) < EPS && p.beats.length === 4;
  return ok ? { ok: true, reason: '' } : { ok: false, reason: `Drums need 4/4: this piece is in ${t || 'an unknown meter'}, so the click plays.` };
}

/** The groove over `bars` bars as clock items, q in quarters from the range start. */
function grooveItems(bars, { barQuarters = 4 } = {}) {
  const n = Math.max(0, Math.floor(Number(bars) || 0));
  const items = [];
  for (let b = 0; b < n; b++) for (const h of GROOVE) items.push({ q: b * barQuarters + h.q, kind: 'hit', drum: h.drum, level: h.level, part: 'drums' });
  return items;
}

// ════════════════════════════════════════════════════════════════════
// SAMPLES (loaded once; a drum without its buffer plays its synth)
// ════════════════════════════════════════════════════════════════════

/**
 * @param {{ files: Object<string,string>, fetchData: (url: string) => Promise<ArrayBuffer>, decode: (data: ArrayBuffer) => Promise<object> }} deps
 */
function createSampleLoader({ files, fetchData, decode }) {
  const names = Object.keys(files || {});
  const buffers = {}, failed = [];
  let promise = null, pending = 0;
  const status = () => {
    const loaded = names.filter(n => buffers[n]);
    const state = !promise ? 'idle' : pending > 0 ? 'loading' : failed.length === 0 ? 'ready' : loaded.length ? 'partial' : 'failed';
    return { state, loaded, failed: failed.slice() };
  };
  return {
    /** Fetch and decode every file, once: later calls return the same promise. Resolves to the status; a file that fails is only reported. */
    load() {
      if (promise) return promise;
      pending = names.length;
      promise = Promise.all(names.map(async name => {
        try {
          const buffer = await decode(await fetchData(files[name]));
          if (!buffer) throw new Error('nothing decoded');
          buffers[name] = buffer;
        } catch (err) {
          failed.push(name);
          console.warn(`[drums] ${files[name]} did not load: the synthesized ${name} plays instead.`, err && err.message ? err.message : err);
        } finally { pending -= 1; }
      })).then(status);
      return promise;
    },
    get: name => buffers[name] || null,
    get status() { return status(); },
  };
}

// ════════════════════════════════════════════════════════════════════
// AUDIO ADAPTER (Tone's context; a fake stands in under Node)
// ════════════════════════════════════════════════════════════════════

/**
 * { ready(), now(), muted(), setGain(g), load(), samples, play({ time, drum, level }) → { cancel(), sampled } }
 * over window.Tone. The kit's Tone.Gain and the noise buffer are made on the
 * first hit (after the page's Tone.start gesture, so no context is created
 * early); the samples are fetched on load() or the first hit, whichever
 * comes first, and decoded on Tone's context.
 */
function toneAudio() {
  let out = null, level = 1, noise = null, noiseCtx = null;
  const T = () => (typeof window !== 'undefined' ? window.Tone : null);
  const ensureOut = Tone => out || (out = new Tone.Gain(level).toDestination());
  const loader = createSampleLoader({
    files: Object.fromEntries(Object.entries(DRUM_SPECS).map(([drum, spec]) => [drum, SAMPLE_BASE + spec.file])),
    fetchData: async url => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    },
    decode: data => T().context.decodeAudioData(data),
  });
  const idle = () => Promise.resolve(loader.status);
  const load = () => (T() && T().context && typeof fetch === 'function' ? loader.load() : idle());
  function noiseBuffer(ctx) {
    if (noise && noiseCtx === ctx) return noise;
    const rate = ctx.sampleRate || 44100, len = Math.max(1, Math.round(rate * NOISE_SECONDS));
    const buf = ctx.createBuffer(1, len, rate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noise = buf; noiseCtx = ctx;
    return buf;
  }
  /** The recorded hit: the buffer through a gain node at its level (the sample carries its own envelope). */
  function sampleVoice(ctx, buffer, time, gain) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, time);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(env);
    src.start(time);   // plays to the buffer's end
    return { src, env, nodes: [src, env] };
  }
  /** The stand-in: an oscillator with a pitch drop, or filtered noise, under a gain envelope. */
  function synthVoice(ctx, synth, time, gain) {
    const end = time + synth.seconds;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, end);
    let src, filter = null;
    if (synth.osc) {
      src = ctx.createOscillator();
      src.type = synth.osc.type;
      src.frequency.setValueAtTime(synth.osc.from, time);
      src.frequency.exponentialRampToValueAtTime(synth.osc.to, time + synth.osc.sweep);
      src.connect(env);
    } else {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      filter = ctx.createBiquadFilter();
      filter.type = synth.noise.type;
      filter.frequency.value = synth.noise.frequency;
      filter.Q.value = synth.noise.Q;
      src.connect(filter);
      filter.connect(env);
    }
    src.start(time);
    src.stop(end);
    return { src, env, nodes: [src, filter, env] };
  }
  return {
    ready: () => !!(T() && T().context),
    now: () => T().context.currentTime,
    muted: () => !!(typeof window !== 'undefined' && window.AudioToggle && window.AudioToggle.isMuted()),
    setGain(g) {
      level = Math.max(0, Number(g) || 0);
      if (out) { try { out.gain.rampTo(level, 0.02); } catch (_) { out.gain.value = level; } }
    },
    load,
    get samples() { return loader.status; },
    play({ time, drum, level: velocity = 1 }) {
      const Tone = T(), ctx = Tone.context, spec = DRUM_SPECS[drum];
      const bus = ensureOut(Tone);
      load();   // once; a hit before the samples are in plays its synth
      const buffer = loader.get(drum);
      const voice = buffer ? sampleVoice(ctx, buffer, time, spec.gain * velocity) : synthVoice(ctx, spec.synth, time, spec.synth.gain * velocity);
      const { src, env, nodes } = voice;
      Tone.connect(env, bus);
      let done = false;
      const dispose = () => {
        if (done) return;
        done = true;
        for (const n of nodes) { if (n) { try { n.disconnect(); } catch (_) { /* gone */ } } }
      };
      src.onended = dispose;
      return {
        sampled: !!buffer,
        cancel() {   // silent at once, whether the hit is queued or sounding
          try { env.gain.cancelScheduledValues(0); env.gain.value = 0; } catch (_) { /* gone */ }
          try { src.stop(ctx.currentTime); } catch (_) { /* not started, or stopped already */ }
          dispose();
        },
      };
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// THE KIT
// ════════════════════════════════════════════════════════════════════

/**
 * @param {{ audio?: object }} [deps]  the audio adapter (toneAudio by default)
 */
function createDrums({ audio = toneAudio() } = {}) {
  let shots = [];   // [{ time, end, drum, countIn, handle }] hits queued or sounding

  function hit(atAudioTime, drum, { countIn = false, accent = false, level = 1 } = {}) {
    const spec = DRUM_SPECS[drum];
    if (!spec || !audio.ready() || !Number.isFinite(atAudioTime)) return false;
    const now = audio.now();
    shots = shots.filter(s => s.end > now);
    if (atAudioTime < now - EPS || audio.muted()) return false;   // already due, or muted: passes silently
    const l = Number(level);
    const velocity = (Number.isFinite(l) ? Math.min(1, Math.max(0, l)) : 1) * (accent ? STICK_ACCENT : 1);   // of the drum's own gain (the adapter's: sample or synth)
    shots.push({ time: atAudioTime, end: atAudioTime + spec.seconds, drum, countIn: !!countIn, handle: audio.play({ time: atAudioTime, drum, level: velocity }) });
    return true;
  }

  return {
    hit,
    stick: (atAudioTime, { accent = false } = {}) => hit(atAudioTime, 'stick', { countIn: true, accent }),
    stop({ countIn = true } = {}) {
      const now = audio.ready() ? audio.now() : 0;
      const keep = s => !countIn && s.countIn;
      for (const s of shots) if (!keep(s) && s.end > now) s.handle.cancel();
      shots = shots.filter(s => keep(s) && s.end > now);
    },
    setGain(g) { if (typeof audio.setGain === 'function') audio.setGain(Math.max(0, Number(g) || 0)); },
    load: () => (typeof audio.load === 'function' ? audio.load() : Promise.resolve({ state: 'idle', loaded: [], failed: [] })),
    get samples() { return audio.samples || { state: 'idle', loaded: [], failed: [] }; },
    get queued() { const now = audio.ready() ? audio.now() : 0; return shots.filter(s => s.end > now).map(s => ({ time: s.time, drum: s.drum, countIn: s.countIn })); },
  };
}

/** The page's kit, on Tone's context. */
const drums = createDrums();

export { drums, createDrums, createSampleLoader, drumsFor, grooveItems, GROOVE, DRUM_SPECS, DRUM_MIX, STICK_ACCENT, HAT_OFFBEAT, SAMPLE_BASE, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const r3 = x => Math.round(x * 1000) / 1000;

  console.log('\n─── drums.js self-test ───\n');

  // ── the meter ─────────────────────────────────────────────────
  assert('4/4 can have drums, with or without a bar length', [drumsFor('4/4').ok, drumsFor('4/4', 4), drumsFor(' 4/4 ').ok], [true, { ok: true, reason: '' }, true]);
  assert('3/4 falls back, and says why', drumsFor('3/4', 3), { ok: false, reason: 'Drums need 4/4: this piece is in 3/4, so the click plays.' });
  assert('6/8, 2/2 (a four-quarter bar, two beats), 2/4, an unknown meter, none at all, and a 4/4 with another bar length: all fall back', [drumsFor('6/8').ok, drumsFor('2/2').ok, drumsFor('2/4').ok, drumsFor('7/8').ok, drumsFor(undefined).ok, drumsFor('4/4', 3).ok, drumsFor(undefined).reason], [false, false, false, false, false, false, 'Drums need 4/4: this piece is in an unknown meter, so the click plays.']);

  // ── the pattern ───────────────────────────────────────────────
  const at = drum => GROOVE.filter(h => h.drum === drum).map(h => h.q);
  assert('the groove: kick on 1 and 3, snare on 2 and 4, hat on every eighth — straight', [at('kick'), at('snare'), at('hat')], [[0, 2], [1, 3], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]]);
  assert('…in time order, 12 hits to the bar, nothing but those three drums', [GROOVE.every((h, i) => i === 0 || h.q >= GROOVE[i - 1].q), GROOVE.length, [...new Set(GROOVE.map(h => h.drum))].sort()], [true, 12, ['hat', 'kick', 'snare']]);
  const two = grooveItems(2);
  assert('grooveItems(2): 24 clock items of part drums, kind hit, the second bar four quarters on', [two.length, two.every(i => i.part === 'drums' && i.kind === 'hit'), two.filter(i => i.drum === 'kick').map(i => i.q), two.filter(i => i.drum === 'snare').map(i => i.q)], [24, true, [0, 2, 4, 6], [1, 3, 5, 7]]);
  assert('no item at or past the range end; sorted by position', [Math.max(...two.map(i => i.q)), two.every((x, i) => i === 0 || x.q >= two[i - 1].q)], [7.5, true]);
  assert('no bars, or nonsense, is no items', [grooveItems(0), grooveItems(-1), grooveItems('x'), grooveItems(1.9).length], [[], [], [], 12]);
  const hats = GROOVE.filter(h => h.drum === 'hat');
  assert('the hat is a little louder on the beat than off it; kick and snare are always full', [hats.map(h => h.level), GROOVE.filter(h => h.drum !== 'hat').every(h => h.level === 1), HAT_OFFBEAT > 0.5 && HAT_OFFBEAT < 1], [[1, HAT_OFFBEAT, 1, HAT_OFFBEAT, 1, HAT_OFFBEAT, 1, HAT_OFFBEAT], true, true]);
  assert('…and the items carry that level to the kit', two.filter(i => i.drum === 'hat').slice(0, 3).map(i => i.level), [1, HAT_OFFBEAT, 1]);

  // ── the sounds' own shape ─────────────────────────────────────
  const SY = Object.fromEntries(Object.entries(DRUM_SPECS).map(([k, v]) => [k, v.synth]));
  assert('every drum has a sample file and a synth to stand in for it', Object.values(DRUM_SPECS).map(v => [/^[a-z]+\.flac$/.test(v.file), !!(v.synth.osc || v.synth.noise), v.seconds >= v.synth.seconds]), [[true, true, true], [true, true, true], [true, true, true], [true, true, true]]);
  assert('the synths: kick a sine with a pitch drop; snare and hat filtered noise; stick a short bright tick, not a sine', [(o => [o.type, o.from > o.to])(SY.kick.osc), SY.snare.noise.type, SY.hat.noise.type, (o => [o.type, o.from > 1600])(SY.stick.osc), SY.stick.seconds < 0.045], [['sine', true], 'bandpass', 'highpass', ['triangle', true], true]);
  assert('inside the kit the kick leads, the snare next, the hat under it — samples and synths alike; no pair of hits can clip', [DRUM_SPECS.kick.gain > DRUM_SPECS.snare.gain, DRUM_SPECS.snare.gain > DRUM_SPECS.hat.gain, SY.kick.gain > SY.snare.gain, SY.snare.gain > SY.hat.gain, DRUM_SPECS.stick.gain * STICK_ACCENT <= 1], [true, true, true, true, true]);

  // ── the sample loader ─────────────────────────────────────────
  {
    const gates = {}, asked = [];
    const fetchData = url => { asked.push(url); return new Promise((res, rej) => { gates[url] = { res, rej }; }); };
    const decode = async data => (data === 'junk' ? Promise.reject(new Error('bad data')) : { decoded: data });
    const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(String(a[0]));
    const L = createSampleLoader({ files: { kick: '/k', snare: '/s', hat: '/h', stick: '/t' }, fetchData, decode });
    assert('before load(): idle, no buffers, nothing fetched', [L.status, L.get('kick'), asked], [{ state: 'idle', loaded: [], failed: [] }, null, []]);
    const p = L.load();
    assert('load() fetches each file once; a second call is the same load', [asked, L.load() === p, L.status.state, L.get('kick')], [['/k', '/s', '/h', '/t'], true, 'loading', null]);
    gates['/k'].res('K'); await new Promise(r => setTimeout(r, 0));
    assert('a drum has its buffer as soon as its own file is in; the others are still without (their synths play)', [L.get('kick'), L.get('snare'), L.status], [{ decoded: 'K' }, null, { state: 'loading', loaded: ['kick'], failed: [] }]);
    gates['/s'].res('S'); gates['/h'].rej(new Error('HTTP 404')); gates['/t'].res('junk');
    const st = await p;
    console.warn = warn;
    assert('a file that is missing, and one that will not decode, fail alone: partial, never a rejection', [st, L.get('snare'), L.get('hat'), L.get('stick'), L.get('cowbell')], [{ state: 'partial', loaded: ['kick', 'snare'], failed: ['hat', 'stick'] }, { decoded: 'S' }, null, null, null]);
    assert('each failure is said once in the console, naming the stand-in', [warned.length, warned.every(w => /did not load: the synthesized (hat|stick) plays instead/.test(w))], [2, true]);
    const all = createSampleLoader({ files: { kick: '/k' }, fetchData: async () => 'K', decode: async d => ({ decoded: d }) });
    const none = createSampleLoader({ files: { kick: '/k' }, fetchData: async () => { throw new Error('offline'); }, decode });
    console.warn = () => {};
    const got = [(await all.load()).state, (await none.load()).state];
    console.warn = warn;
    assert('all in: ready; none in: failed', got, ['ready', 'failed']);
  }

  // ── the kit on a fake clock ───────────────────────────────────
  function fakeAudio() {
    const a = { t: 0, mutedFlag: false, isReady: true, played: [], cancelled: [], gains: [] };
    a.ready = () => a.isReady;
    a.now = () => a.t;
    a.muted = () => a.mutedFlag;
    a.setGain = g => { a.gains.push(g); };
    a.play = ({ time, drum, level }) => {
      const entry = { time: r3(time), drum, level: r3(level), cancelled: false };
      a.played.push(entry);
      return { cancel() { entry.cancelled = true; a.cancelled.push([drum, r3(time)]); } };
    };
    a.sounding = () => a.played.filter(e => !e.cancelled).map(e => [e.drum, e.time]);
    return a;
  }

  {
    const audio = fakeAudio(), d = createDrums({ audio });
    assert('level: the hit\'s velocity, 0–1 (an off-beat hat); nonsense is full, out of range is clamped', [d.hit(1.05, 'hat', { level: HAT_OFFBEAT }), d.hit(1.06, 'hat', { level: 'x' }), d.hit(1.07, 'hat', { level: 3 }), d.hit(1.08, 'hat', { level: -1 }), audio.played.map(e => e.level)], [true, true, true, true, [HAT_OFFBEAT, 1, 1, 0]]);
  }

  {
    const audio = fakeAudio(), d = createDrums({ audio });
    audio.t = 1;
    assert('hit(): one hit at the given time; a past time, an unknown drum and a bad time are skipped', [d.hit(1.1, 'kick'), d.hit(1.1, 'hat'), d.hit(1.6, 'snare'), d.hit(0.5, 'kick'), d.hit(1.2, 'cowbell'), d.hit(NaN, 'kick'), audio.sounding()], [true, true, true, false, false, false, [['kick', 1.1], ['hat', 1.1], ['snare', 1.6]]]);
    assert('a plain hit is at full level: the drum\'s own gain is the adapter\'s (sample or synth)', audio.played.map(e => e.level), [1, 1, 1]);
    audio.mutedFlag = true;
    assert('muted: skipped, the timing is the clock\'s', [d.hit(2, 'kick'), audio.played.length], [false, 3]);
    audio.mutedFlag = false;
    audio.isReady = false;
    assert('no audio yet: skipped', d.hit(2, 'kick'), false);
    audio.isReady = true;
    assert('queued: what has not finished sounding', d.queued, [{ time: 1.1, drum: 'kick', countIn: false }, { time: 1.1, drum: 'hat', countIn: false }, { time: 1.6, drum: 'snare', countIn: false }]);
    audio.t = 1.35;   // the hat (200 ms) is over; the kick (400 ms) still sounds; the snare is queued
    d.stop();
    assert('stop(): the sounding kick and the queued snare are cancelled; the hat, already over, is left alone', [audio.cancelled, d.queued], [[['kick', 1.1], ['snare', 1.6]], []]);
    d.stop();
    assert('stop() again cancels nothing twice', audio.cancelled.length, 2);
  }

  // count-in sticks
  {
    const audio = fakeAudio(), d = createDrums({ audio });
    assert('stick(): the count-in tick, the bar\'s first a little louder', [d.stick(0.5, { accent: true }), d.stick(1), audio.played.map(e => [e.drum, e.time, e.level])], [true, true, [['stick', 0.5, STICK_ACCENT], ['stick', 1, 1]]]);
    d.hit(1.5, 'kick'); d.hit(1.5, 'hat');
    audio.t = 0.7;   // the first stick (150 ms) has sounded
    d.stop({ countIn: false });
    assert('stop({ countIn: false }): the groove\'s queued hits go, the count-in\'s stick stays', [audio.cancelled, d.queued], [[['kick', 1.5], ['hat', 1.5]], [{ time: 1, drum: 'stick', countIn: true }]]);
    d.stop();
    assert('stop(): the stick still to come goes too; the one already sounded is left alone', audio.cancelled, [['kick', 1.5], ['hat', 1.5], ['stick', 1]]);
  }

  // the level
  {
    const audio = fakeAudio(), d = createDrums({ audio });
    d.setGain(0.35); d.setGain(-1); d.setGain('x');
    assert('setGain hands the adapter a gain as given, never negative', audio.gains, [0.35, 0, 0]);
    delete audio.setGain;
    assert('an adapter without setGain is left alone', d.setGain(0.5), undefined);
    assert('load() / samples pass through to the adapter; one without them reports idle', [await d.load(), d.samples], [{ state: 'idle', loaded: [], failed: [] }, { state: 'idle', loaded: [], failed: [] }]);
    audio.load = async () => ({ state: 'ready', loaded: ['kick'], failed: [] }); audio.samples = { state: 'ready', loaded: ['kick'], failed: [] };
    assert('…and the adapter\'s own when it has them', [(await d.load()).state, d.samples.state], ['ready', 'ready']);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
