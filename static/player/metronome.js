/**
 * metronome.js
 * ============
 * Click track and count-in for the player (2b): a lookahead scheduler on
 * the Web Audio clock — Tone's AudioContext, the one Listen's sampler plays
 * on — that is independent of Tone.Transport (VoicingPlayer stops and
 * cancels the Transport on every play / stop) and of the player itself.
 * Since 3 the player does not use the scheduler below (start / countIn):
 * its beat clock (beat-clock.js) owns the time and calls click() for each
 * beat, so the click follows live tempo changes with everything else. No
 * DOM; the scheduler core is Node-runnable with the fake audio adapter the
 * self-test uses.
 *
 *   patternFor(time, beatsPerBar) → { bar, beats, accents, warning }
 *       in quarters, from meter-rules meterLevels: `beats` is the grid's beat
 *       level (4/4: 0 1 2 3; 3/4: 0 1 2; 6/8: 0 1.5; 2/2: 0 2), `accents` its
 *       strongest level (the bar start). An unknown meter falls back the way
 *       meterLevels does (1-quarter beats, `warning` set).
 *   beatQuarters(pattern, k) → quarters from the origin to beat k (k ≥ 0, across bars)
 *   isAccent(pattern, k)     → whether beat k is on an accent point
 *
 *   createMetronome({ audio, timer }) → metronome; `metronome` below is the page's one.
 *     start(atAudioTime, bpm, meter, { bars } = {})
 *         clicks from a downbeat at `atAudioTime` (seconds on the AudioContext
 *         clock; it may already be in the past — beats already due are skipped
 *         silently and the click joins at the next one) for `bars` bars, or until
 *         stop(). `meter` is a pattern from patternFor, a time string ('3/4') or
 *         { time, beatsPerBar } (a norm). Replaces a running click.
 *     stop({ countIn = true } = {})
 *         silence now: the running click and every click already scheduled, and
 *         (unless countIn: false) a count-in under way.
 *     setTempo(bpm)
 *         clicks not yet sounding are re-spaced from the last one that is, at the
 *         new tempo (count-in included).
 *     setVolume(0–100)   immediately; remembered for the next click
 *     countIn(bars, bpm, meter, { at } = {}) → the audio time bar 1 starts
 *         `bars` bars of clicks from `at` (default: right away), then nothing —
 *         start() the click at the returned time for the piece itself. A count-in
 *         clicks whether or not the click is on. Replaces a count-in under way.
 *     click(atAudioTime, { accent = false, countIn = false } = {})
 *         ONE click at that audio time — how the shared beat clock (beat-clock.js)
 *         drives the metronome since 3: the clock says when each beat happens, the
 *         page calls click() from its 'beat' listener (count-in beats always, the
 *         rest while the Metronome checkbox is on). Mute and volume apply as for a
 *         run; a time already past is skipped. stop() cancels the ones not yet
 *         sounded (stop({ countIn: false }) leaves the count-in's).
 *     running            true while a start() / countIn() run is scheduled
 *
 *   Clock: setInterval every INTERVAL_MS, each tick scheduling the beats that
 *   fall within LOOKAHEAD of context.currentTime — the standard Web Audio
 *   lookahead pattern (Wilson, "A Tale of Two Clocks"). Clicks are short
 *   synthesized sines (accent / beat: two pitches, two levels) on their own
 *   Tone.Gain into Tone's destination, apart from the note sampler and the
 *   echo sampler. The site mute (AudioToggle) skips the sound but not the
 *   timing, as everything else on the site does.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/metronome.js').then(m => m.selfTest())"
 */

import { meterLevels } from './meter-rules.js';

const EPS = 1e-6;
const LOOKAHEAD = 0.15;        // seconds of beats scheduled ahead of the clock
const INTERVAL_MS = 25;        // scheduler tick
const LEAD = 0.05;             // a count-in started "now" clicks this much later (scheduling headroom)
const RETIME_MARGIN = 0.02;    // setTempo leaves a click this close to sounding alone
const CLICK_SECONDS = 0.045;   // one click, attack to silence
const CLICKS = { accent: { freq: 1600, gain: 1 }, beat: { freq: 1000, gain: 0.65 } };
const DEFAULT_VOLUME = 70;
const DEFAULT_BPM = 90;

// ════════════════════════════════════════════════════════════════════
// BEAT PATTERN
// ════════════════════════════════════════════════════════════════════

/**
 * @param {string} [time]         the norm's time signature, e.g. '3/4'
 * @param {number} [beatsPerBar]  the norm's bar length in quarters, when it gives one
 */
function patternFor(time, beatsPerBar) {
  const g = meterLevels(time, beatsPerBar);
  const level = Math.min(g.beatLevel, g.levels.length - 1);
  const beats = (g.levels[level] && g.levels[level].length ? g.levels[level] : [0]).slice();
  return { bar: g.bar, beats, accents: g.levels[0].slice(), warning: g.warning };
}

/** A pattern as given, or built from a time string or a norm-like { time, beatsPerBar }. */
function toPattern(meter) {
  if (meter && Array.isArray(meter.beats) && meter.beats.length && typeof meter.bar === 'number') return meter;
  if (typeof meter === 'string') return patternFor(meter);
  if (meter && typeof meter === 'object') return patternFor(meter.time, meter.beatsPerBar);
  return patternFor(undefined);
}

/** Quarters from the origin (a downbeat) to beat k. */
function beatQuarters(pattern, k) {
  const n = pattern.beats.length;
  return Math.floor(k / n) * pattern.bar + pattern.beats[k % n];
}

function isAccent(pattern, k) {
  const q = pattern.beats[k % pattern.beats.length];
  return pattern.accents.some(a => Math.abs(a - q) < EPS);
}

const bpmOf = bpm => (typeof bpm === 'number' && bpm > 0 && Number.isFinite(bpm) ? bpm : DEFAULT_BPM);
const clampVolume = v => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_VOLUME; };
/** Slider 0–100 → gain: squared for a usable low end, under a ceiling that sits with the piano at -6 dB. */
const gainOf = v => Math.pow(clampVolume(v) / 100, 2) * 0.9;

// ════════════════════════════════════════════════════════════════════
// AUDIO ADAPTER (Tone's context; a fake stands in under Node)
// ════════════════════════════════════════════════════════════════════

/**
 * { ready(), now(), muted(), setVolume(v), click({ time, freq, gain }) → { cancel() } }
 * over window.Tone: the clicks' Tone.Gain is made on the first click (after
 * the page's Tone.start gesture, so no context is created early).
 */
function toneAudio() {
  let volume = null, level = DEFAULT_VOLUME;
  const T = () => (typeof window !== 'undefined' ? window.Tone : null);
  const ensureVolume = Tone => volume || (volume = new Tone.Gain(gainOf(level)).toDestination());
  return {
    ready: () => !!(T() && T().context),
    now: () => T().context.currentTime,
    muted: () => !!(typeof window !== 'undefined' && window.AudioToggle && window.AudioToggle.isMuted()),
    setVolume(v) {
      level = clampVolume(v);
      if (volume) { try { volume.gain.rampTo(gainOf(level), 0.02); } catch (_) { volume.gain.value = gainOf(level); } }
    },
    click({ time, freq, gain }) {
      const Tone = T();
      const ctx = Tone.context;
      const out = ensureVolume(Tone);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(gain, time + 0.002);
      env.gain.exponentialRampToValueAtTime(0.001, time + CLICK_SECONDS);
      osc.connect(env);
      Tone.connect(env, out);
      osc.start(time);
      osc.stop(time + CLICK_SECONDS);
      let done = false;
      const dispose = () => { if (done) return; done = true; try { osc.disconnect(); } catch (_) { /* gone */ } try { env.disconnect(); } catch (_) { /* gone */ } };
      osc.onended = dispose;
      return {
        cancel() {   // silent at once, whether the click is queued or sounding
          try { env.gain.cancelScheduledValues(0); env.gain.value = 0; } catch (_) { /* gone */ }
          try { osc.stop(ctx.currentTime); } catch (_) { /* not started, or stopped already */ }
          dispose();
        },
      };
    },
  };
}

const realTimer = () => ({
  set: (fn, ms) => setInterval(fn, ms),
  clear: id => clearInterval(id),
});

// ════════════════════════════════════════════════════════════════════
// SCHEDULER
// ════════════════════════════════════════════════════════════════════

/**
 * @param {{ audio?: object, timer?: { set, clear } }} [deps]  the audio adapter (toneAudio by default) and the interval timer
 */
function createMetronome({ audio = toneAudio(), timer = realTimer() } = {}) {
  const runs = [];      // { kind: 'click' | 'countIn', origin, bpm, pattern, total, k, nextTime, queued: [{ k, time, handle }] }
  let shots = [];       // click(): [{ time, countIn, handle }] single clicks an outside clock asked for
  let timerId = null;

  const ensureTimer = () => { if (timerId == null) timerId = timer.set(tick, INTERVAL_MS); };
  const clearTimer = () => { if (timerId != null) { timer.clear(timerId); timerId = null; } };
  const interval = (run, from, to) => (beatQuarters(run.pattern, to) - beatQuarters(run.pattern, from)) * 60 / run.bpm;

  function removeRuns(pred) {
    const now = audio.ready() ? audio.now() : 0;
    for (const run of runs.filter(pred)) {
      for (const q of run.queued) if (q.handle && q.time + CLICK_SECONDS > now) q.handle.cancel();
      runs.splice(runs.indexOf(run), 1);
    }
    if (!runs.length) clearTimer();
  }

  function addRun(kind, origin, bpm, meter, bars) {
    const pattern = toPattern(meter);
    const total = Number.isFinite(bars) ? Math.max(0, Math.round(bars)) * pattern.beats.length : Infinity;
    removeRuns(r => r.kind === kind);
    const run = { kind, origin, bpm: bpmOf(bpm), pattern, total, k: 0, nextTime: origin, queued: [] };
    runs.push(run);
    ensureTimer();
    tick();
    return run;
  }

  /** Schedule every beat due within the lookahead; drop runs that are over. */
  function tick() {
    if (!runs.length) { clearTimer(); return; }
    if (!audio.ready()) return;
    const now = audio.now();
    for (const run of runs) {
      while (run.k < run.total && run.nextTime < now + LOOKAHEAD) {
        const k = run.k, time = run.nextTime;
        let handle = null;
        if (time >= now - EPS && !audio.muted()) {   // a beat already due (a run anchored in the past) passes silently
          const spec = isAccent(run.pattern, k) ? CLICKS.accent : CLICKS.beat;
          handle = audio.click({ time, freq: spec.freq, gain: spec.gain });
        }
        run.queued.push({ k, time, handle });
        run.k = k + 1;
        run.nextTime = time + interval(run, k, k + 1);
      }
      // Keep the recent past (setTempo re-spaces from the last beat sounding) and always the last entry.
      run.queued = run.queued.filter((q, i, all) => q.time + 1 > now || i === all.length - 1);
    }
    for (const run of [...runs]) {
      if (run.k >= run.total && run.queued.every(q => q.time + CLICK_SECONDS <= now)) runs.splice(runs.indexOf(run), 1);
    }
    if (!runs.length) clearTimer();
  }

  return {
    start(atAudioTime, bpm, meter, { bars = Infinity } = {}) {
      const at = Number.isFinite(atAudioTime) ? atAudioTime : (audio.ready() ? audio.now() + LEAD : 0);
      addRun('click', at, bpm, meter, bars);
    },
    stop({ countIn = true } = {}) {
      removeRuns(r => countIn || r.kind !== 'countIn');
      const now = audio.ready() ? audio.now() : 0;
      for (const s of shots) if ((countIn || !s.countIn) && s.time + CLICK_SECONDS > now) s.handle.cancel();
      shots = shots.filter(s => !countIn && s.countIn && s.time + CLICK_SECONDS > now);
    },
    click(atAudioTime, { accent = false, countIn = false } = {}) {
      if (!audio.ready() || !Number.isFinite(atAudioTime)) return false;
      const now = audio.now();
      shots = shots.filter(s => s.time + CLICK_SECONDS > now);
      if (atAudioTime < now - EPS || audio.muted()) return false;   // already due, or muted: passes silently
      const spec = accent ? CLICKS.accent : CLICKS.beat;
      shots.push({ time: atAudioTime, countIn: !!countIn, handle: audio.click({ time: atAudioTime, freq: spec.freq, gain: spec.gain }) });
      return true;
    },
    setTempo(bpm) {
      const b = bpmOf(bpm);
      if (!audio.ready()) { for (const run of runs) run.bpm = b; return; }
      const now = audio.now();
      for (const run of runs) {
        if (run.bpm === b) continue;
        run.bpm = b;
        const cut = run.queued.filter(q => q.time > now + RETIME_MARGIN);   // queued, not yet sounding: re-timed
        for (const q of cut) if (q.handle) q.handle.cancel();
        if (cut.length) { run.queued = run.queued.filter(q => !cut.includes(q)); run.k = cut[0].k; }
        const prev = run.queued[run.queued.length - 1];   // the last beat sounding or sounded
        if (prev) run.nextTime = prev.time + interval(run, prev.k, run.k);
        else if (cut.length) run.nextTime = cut[0].time;   // not started yet: the first beat keeps its time
      }
      tick();
    },
    setVolume(v) { audio.setVolume(clampVolume(v)); },
    countIn(bars, bpm, meter, { at } = {}) {
      const pattern = toPattern(meter);
      const n = Math.max(0, Math.round(Number(bars) || 0));
      const start = Number.isFinite(at) ? at : (audio.ready() ? audio.now() + LEAD : 0);
      removeRuns(r => r.kind === 'countIn');
      if (n > 0) addRun('countIn', start, bpm, pattern, n);
      return start + n * pattern.bar * 60 / bpmOf(bpm);
    },
    get running() { return runs.length > 0; },
    /** Read-only view for debugging / tests: [{ kind, k, total, nextTime, queued: [{ k, time, sounds }] }]. */
    get runs() { return runs.map(r => ({ kind: r.kind, bpm: r.bpm, k: r.k, total: r.total, nextTime: r.nextTime, queued: r.queued.map(q => ({ k: q.k, time: q.time, sounds: !!q.handle })) })); },
    _tick: tick,
  };
}

/** The page's metronome, on Tone's context. */
const metronome = createMetronome();

export { metronome, createMetronome, patternFor, beatQuarters, isAccent, toPattern, gainOf, DEFAULT_VOLUME, LOOKAHEAD, INTERVAL_MS, CLICK_SECONDS, selfTest };

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

  console.log('\n─── metronome.js self-test ───\n');

  // ── patterns ──────────────────────────────────────────────────
  assert('4/4: beats on every quarter, accent on the bar', [patternFor('4/4').bar, patternFor('4/4').beats, patternFor('4/4').accents], [4, [0, 1, 2, 3], [0]]);
  assert('3/4 with beatsPerBar 3 (the Carol norm): three beats', patternFor('3/4', 3).beats, [0, 1, 2]);
  assert('6/8: two dotted-quarter beats; 2/2: two half-note beats', [patternFor('6/8').beats, patternFor('2/2').beats], [[0, 1.5], [0, 2]]);
  assert('unknown meter: 1-quarter beats over the fallback bar, warning set', [patternFor('7/8').beats, typeof patternFor('7/8').warning, patternFor(undefined).beats], [[0, 1, 2, 3], 'string', [0, 1, 2, 3]]);
  assert('toPattern: a pattern, a time string, a norm', [toPattern({ bar: 3, beats: [0, 1, 2], accents: [0] }).beats, toPattern('2/4').beats, toPattern({ time: '6/8' }).beats], [[0, 1, 2], [0, 1], [0, 1.5]]);
  const p34 = patternFor('3/4');
  assert('beatQuarters across bars: beat 4 of 3/4 is bar 2 beat 2 → 4 q; 6/8 beat 3 → 4.5 q', [beatQuarters(p34, 4), beatQuarters(patternFor('6/8'), 3)], [4, 4.5]);
  assert('isAccent: 0, 3, 6 in 3/4', [0, 1, 2, 3, 6].map(k => isAccent(p34, k)), [true, false, false, true, true]);
  assert('gainOf: 0 → 0, 100 → 0.9, 70 → 0.441', [gainOf(0), gainOf(100), r3(gainOf(70)), r3(gainOf('x'))], [0, 0.9, 0.441, r3(gainOf(70))]);

  // ── the scheduler on a fake clock ──────────────────────────────
  function fakeAudio() {
    const a = { t: 0, mutedFlag: false, played: [], cancelled: [], volume: null };
    a.ready = () => true;
    a.now = () => a.t;
    a.muted = () => a.mutedFlag;
    a.setVolume = v => { a.volume = v; };
    a.click = ({ time, freq, gain }) => {
      const entry = { time: r3(time), freq, gain, cancelled: false };
      a.played.push(entry);
      return { cancel() { entry.cancelled = true; a.cancelled.push(r3(time)); } };
    };
    a.sounding = () => a.played.filter(e => !e.cancelled).map(e => e.time);
    return a;
  }
  const fakeTimer = () => { const t = { fn: null, cleared: 0 }; t.set = fn => { t.fn = fn; return 1; }; t.clear = () => { t.fn = null; t.cleared++; }; return t; };
  /** Advance the fake clock to `to` in 25 ms ticks, running the scheduler each time. */
  const advance = (audio, timer, to) => { while (audio.t < to - EPS) { audio.t = Math.min(to, audio.t + INTERVAL_MS / 1000); if (timer.fn) timer.fn(); } };

  // start(): a 3/4 click at 120 bpm (0.5 s per beat) from t = 1, two bars
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    m.start(1, 120, '3/4', { bars: 2 });
    assert('start: nothing before the lookahead window, timer running', [audio.played.length, !!timer.fn, m.running], [0, true, true]);
    advance(audio, timer, 1.0);
    assert('within 150 ms of the first beat it is scheduled, on time', audio.sounding(), [1]);
    advance(audio, timer, 5);
    assert('two bars of 3/4: six clicks half a second apart, then no more', audio.sounding(), [1, 1.5, 2, 2.5, 3, 3.5]);
    assert('accent on the downbeats only (1600 Hz), beats at 1000 Hz', audio.played.map(e => e.freq), [1600, 1000, 1000, 1600, 1000, 1000]);
    assert('over: the run is dropped and the timer cleared', [m.running, timer.fn, timer.cleared], [false, null, 1]);
  }

  // a run anchored in the past joins at the next beat
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    audio.t = 2.2;
    m.start(1, 120, '3/4', { bars: 2 });
    advance(audio, timer, 5);
    assert('start at 1 when it is 2.2: beats 1 … 2 pass silently, the click joins at 2.5 and keeps the bar count', audio.sounding(), [2.5, 3, 3.5]);
  }

  // count-in → start handoff, and stop
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    audio.t = 0.5;
    const barOne = m.countIn(1, 120, '3/4', { at: 0.6 });
    assert('countIn(1 bar of 3/4 at 120) from 0.6 → bar 1 at 2.1', r3(barOne), 2.1);
    m.start(barOne, 120, '3/4', { bars: 1 });
    advance(audio, timer, 2.3);
    assert('count-in clicks at 0.6 1.1 1.6, the piece\'s downbeat at 2.1: no double click, no gap', audio.sounding(), [0.6, 1.1, 1.6, 2.1]);
    m.stop();
    assert('stop: runs gone, the queued click (2.6) cancelled', [m.running, audio.cancelled.length, audio.sounding()], [false, audio.cancelled.length, [0.6, 1.1, 1.6, 2.1]]);
    advance(audio, timer, 4);
    assert('nothing more after stop', audio.sounding(), [0.6, 1.1, 1.6, 2.1]);
  }
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    const barOne = m.countIn(2, 60, '4/4');   // from now + LEAD
    assert('countIn default start: now + LEAD; 2 bars of 4/4 at 60 → 8 s later', [r3(barOne)], [r3(LEAD + 8)]);
    assert('countIn(0) clicks nothing and returns its start time', [r3(m.countIn(0, 60, '4/4', { at: 3 })), m.runs.filter(r => r.kind === 'countIn').length], [3, 0]);
    m.stop();
  }

  // stop({ countIn: false }) leaves the count-in
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    const barOne = m.countIn(1, 120, '2/4', { at: 0.1 });
    m.start(barOne, 120, '2/4');
    m.stop({ countIn: false });
    assert('the click is off, the count-in stays', m.runs.map(r => r.kind), ['countIn']);
    advance(audio, timer, 2);
    assert('count-in sounds in full, nothing after', audio.sounding(), [0.1, 0.6]);
  }

  // mute skips the sound, keeps the time
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    m.start(0.2, 120, '2/4', { bars: 2 });
    advance(audio, timer, 0.6);   // 0.2 sounded, 0.7 queued
    audio.mutedFlag = true;
    advance(audio, timer, 1.5);   // 1.2 passes muted
    audio.mutedFlag = false;      // 1.7 is scheduled after the unmute
    advance(audio, timer, 3);
    assert('muted beats pass silently; the grid is unchanged after unmute', [audio.sounding(), m.runs.length], [[0.2, 0.7, 1.7], 0]);
  }

  // setTempo re-spaces from the last sounding click
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    m.start(0.1, 60, '4/4');   // one beat a second
    advance(audio, timer, 1.2);   // 0.1 and 1.1 scheduled; 1.1 sounding now
    m.setTempo(120);
    advance(audio, timer, 2.7);
    assert('60 → 120 bpm at t = 1.2: 0.1, 1.1 stay; then 1.6, 2.1, 2.6 (half-second beats from the last click)', audio.sounding(), [0.1, 1.1, 1.6, 2.1, 2.6]);
    audio.t = 2.65;   // 2.6 sounded, 2.7 … queued? (lookahead 0.15 at 2.65 reaches 2.8: 3.1 not yet)
    advance(audio, timer, 3.0);   // 3.1 queued at t ≈ 2.95
    m.setTempo(30);
    const cancelled = audio.cancelled.slice();
    advance(audio, timer, 6);
    assert('120 → 30 bpm at t = 3.0: the queued 3.1 is cancelled, the next click is 2 s after 2.6', [cancelled, audio.sounding().slice(-2)], [[3.1], [2.6, 4.6]]);
    m.stop();
    assert('setVolume reaches the adapter, clamped to 0–100', [m.setVolume(150), audio.volume], [undefined, 100]);
  }

  // click(): single clicks for an outside clock (beat-clock.js)
  {
    const audio = fakeAudio(), timer = fakeTimer();
    const m = createMetronome({ audio, timer });
    audio.t = 1;
    assert('click(): one click at the given time, accent or beat; a past time and a muted one are skipped', [m.click(1.1, { accent: true, countIn: true }), m.click(1.6, { countIn: true }), m.click(2.1), m.click(0.5), (audio.mutedFlag = true, m.click(2.6)), audio.played.map(e => [e.time, e.freq])], [true, true, true, false, false, [[1.1, 1600], [1.6, 1000], [2.1, 1000]]]);
    audio.mutedFlag = false;
    assert('click() starts no run and no timer', [m.running, timer.fn], [false, null]);
    audio.t = 1.3;   // 1.1 has sounded
    m.stop({ countIn: false });
    assert('stop({ countIn: false }) cancels the plain click only', audio.cancelled, [2.1]);
    m.stop();
    assert('stop() cancels the count-in click still to come; the one already sounded is left alone', audio.cancelled, [2.1, 1.6]);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
