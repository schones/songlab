/**
 * beat-clock.js
 * =============
 * The player's one musical clock (3): it runs in BEATS, on the Web Audio
 * clock (Tone's AudioContext) with a lookahead scheduler, like metronome.js
 * and for the same reason — not Tone.Transport, which VoicingPlayer stops and
 * cancels. Listen, play-along, the metronome and the page turns all hang off
 * it, so they share one position and stay in phase when the tempo changes
 * while it runs. No DOM, no Tone import; Node-runnable with the fake audio
 * adapter the self-test uses.
 *
 *   createBeatClock({ audio, timer }) → clock
 *     configure({ bars, meter })
 *         bars   the piece's bar numbers in order (they need not be contiguous)
 *         meter  a metronome.js pattern, a time string ('3/4') or { time, beatsPerBar }
 *     setTempo(bpm)          quarter notes per minute; LIVE — see "Tempo" below. `tempo` reads it.
 *     start({ fromBar, toBar, startBar, loop = false, countInBars = 0, items = [], at }) → { startTime, barOneTime, from, to, start } | null
 *         Runs fromBar..toBar (defaults: the seek bar or the first bar, the last
 *         bar). loop: wraps to fromBar after toBar until stop(); otherwise the
 *         clock ends itself after toBar. countInBars bars of beats come first,
 *         once (never again on a loop pass). `at` is the audio time the run
 *         (the count-in, when there is one) begins; default now + LEAD.
 *         items: [{ q, … }] things to dispatch by beat position, q = quarters
 *         from fromBar's downbeat (0 ≤ q ≤ range length; an item AT the range
 *         end belongs to the pass that is ending — a note-off). Replayed on
 *         every loop pass. null when the range holds no bars.
 *         startBar (a bar of the range; default fromBar): the run begins at ITS
 *         downbeat — after the count-in, which leads straight into it — and goes
 *         on to toBar; a loop then wraps to fromBar as usual. Items before it are
 *         skipped on that first pass (a resume after a pause). barOneTime is the
 *         audio time of that first downbeat, `start` the bar.
 *     stop()                 now: nothing more is dispatched and every callback
 *                            not yet run is dropped (due events, at()). Emits 'stopped'.
 *     seek(bar)              running: the position continues at `bar`'s downbeat from the
 *                            scheduling horizon (≤ LOOKAHEAD away), inside the range only
 *                            (false otherwise). Stopped: the next start()'s default fromBar.
 *     on(type, fn)           AHEAD of time: called when the event is scheduled, up to
 *                            LOOKAHEAD before it happens, with its exact audioTime —
 *                            schedule sound from here.
 *     onDue(type, fn)        ON time: called when the audio clock reaches the event
 *                            (within one scheduler tick) — paint from here.
 *                            Both return an unsubscribe function.
 *     at(audioTime, fn)      run fn when the audio clock reaches audioTime; dropped by stop()
 *     positionAt(audioTime)  → { bar, beat, pass, countIn, audioTime } on the current tempo
 *                            (exact around now; null when not running). position() = now.
 *     running, range         range: { from, to, loop } of the run, or null
 *
 *   Events — every payload is a position { bar, beat, audioTime, pass }: `beat` is
 *   quarters from the bar's start (0-based, the norm's `onset`), `pass` counts loop
 *   passes from 1.
 *     beat          + { index, accent, countIn }   index: the beat's number in the bar (0-based)
 *                   per the meter pattern; during the count-in countIn is true and bar is null
 *     bar           each bar's downbeat (not during the count-in)
 *     countInStart  + { bars }   /   countInEnd      only when countInBars > 0; once
 *     loopWrap      + { from, to }   the downbeat that starts pass 2, 3, …
 *     item          + { item }       one of start()'s items, at its position
 *     ended         the end of toBar (no loop); `running` is false from its due time
 *     seek          after a running seek
 *     stopped       stop() (both listener sets, at once)
 *   Order at one instant: the ending pass's items (q = range end), loopWrap, bar,
 *   beat, items.
 *
 *   Tempo: the position is a straight line from an anchor (audio time ↔ quarters)
 *   at the current bpm. setTempo moves the anchor to the scheduling horizon — the
 *   position already dispatched — and continues from there at the new bpm, so
 *   nothing scheduled is re-timed and everything after it (clicks, notes, bars,
 *   wraps) is on the one new line: in phase by construction. The change is heard
 *   at most LOOKAHEAD later.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/beat-clock.js').then(m => m.selfTest())"
 */

import { toPattern, beatQuarters, isAccent } from './metronome.js';

const EPS = 1e-9;
const LOOKAHEAD = 0.15;     // seconds dispatched ahead of the audio clock
const INTERVAL_MS = 25;     // scheduler tick
const LEAD = 0.08;          // a run started "now" begins this much later (scheduling headroom)
const DEFAULT_BPM = 90;
const TYPES = ['beat', 'bar', 'countInStart', 'countInEnd', 'loopWrap', 'item', 'ended', 'seek', 'stopped'];

const bpmOf = bpm => (typeof bpm === 'number' && bpm > 0 && Number.isFinite(bpm) ? bpm : DEFAULT_BPM);

/** { ready(), now() } over window.Tone's context. */
function toneClock() {
  const T = () => (typeof window !== 'undefined' ? window.Tone : null);
  return {
    ready: () => !!(T() && T().context),
    now: () => T().context.currentTime,
  };
}

const realTimer = () => ({
  set: (fn, ms) => setInterval(fn, ms),
  clear: id => clearInterval(id),
});

/**
 * @param {{ audio?: { ready: () => boolean, now: () => number }, timer?: { set, clear } }} [deps]
 */
function createBeatClock({ audio = toneClock(), timer = realTimer() } = {}) {
  const ahead = Object.fromEntries(TYPES.map(t => [t, new Set()]));
  const due = Object.fromEntries(TYPES.map(t => [t, new Set()]));
  let bars = [1];
  let pattern = toPattern('4/4');
  let bpm = DEFAULT_BPM;
  let run = null;          // the run under way; see start()
  let seekBar = null;      // seek() while stopped
  let queue = [];          // [{ time, fn }] callbacks waiting for the audio clock
  let generation = 0;      // bumped by stop(): a drain under way stops there
  let timerId = null;

  const ensureTimer = () => { if (timerId == null) timerId = timer.set(tick, INTERVAL_MS); };
  const clearTimer = () => { if (timerId != null) { timer.clear(timerId); timerId = null; } };
  const call = (set, payload) => { for (const fn of [...set]) { try { fn(payload); } catch (err) { console.error('[beat-clock]', err); } } };

  const timeOf = u => run.anchorTime + (u - run.anchorU) * 60 / bpm;
  const uAt = t => run.anchorU + (t - run.anchorTime) * bpm / 60;

  /** Position of run-line quarter u (u ≥ 0): the bar it falls in, quarters into it, the pass. */
  function where(u) {
    const barsIn = Math.floor(u / pattern.bar + 1e-7);
    const pass = run.loop ? Math.floor(barsIn / run.nBars) + 1 : 1;
    const bi = run.loop ? barsIn % run.nBars : Math.min(barsIn, run.nBars - 1);
    const beat = Math.max(0, u - (run.loop ? barsIn : bi) * pattern.bar);
    return { bar: bars[run.i0 + bi], beat: Math.round(beat * 1e6) / 1e6, pass };
  }

  /** Tell the ahead listeners now, the due listeners when the audio clock gets there. */
  function emit(type, payload) {
    call(ahead[type], payload);
    queue.push({ time: payload.audioTime, fn: () => call(due[type], payload) });
  }

  /** The next beat's run-line position, or Infinity when the (unlooped) range has no more. */
  function nextBeatU() {
    const u = beatQuarters(pattern, run.k) - run.countInQ + (run.k < run.ciBeats ? run.startU : 0);   // the count-in sits right before the start position
    return !run.loop && u >= run.len - EPS ? Infinity : u;
  }
  /** The next item with its run-line position; `tail`: it sits at the range end (it closes the pass that is ending). */
  function nextItem() {
    const items = run.items;
    if (!items.length) return null;
    if (run.itemIdx >= items.length) {
      if (!run.loop) return null;
      run.itemLap += 1; run.itemIdx = 0;
    }
    const item = items[run.itemIdx];
    return { u: run.itemLap * run.len + item.q, item, tail: item.q >= run.len - EPS };
  }

  function emitBeat(u) {
    const n = pattern.beats.length;
    const index = run.k % n;
    const audioTime = timeOf(u);
    const accent = isAccent(pattern, run.k);
    if (run.k < run.ciBeats) {   // count-in
      if (run.k === 0) emit('countInStart', { bar: null, beat: 0, pass: 1, audioTime, bars: run.countInBars });
      emit('beat', { bar: null, beat: pattern.beats[index], pass: 1, audioTime, index, accent, countIn: true });
      return;
    }
    const pos = { ...where(u + 1e-7), beat: pattern.beats[index], audioTime };
    if (index === 0) {
      if (run.countInBars > 0 && !run.countInEnded) { run.countInEnded = true; emit('countInEnd', { ...pos }); }
      if (pos.pass > 1 && pos.bar === bars[run.i0]) emit('loopWrap', { ...pos, from: bars[run.i0], to: bars[run.i0 + run.nBars - 1] });
      emit('bar', { ...pos });
    }
    emit('beat', { ...pos, index, accent, countIn: false });
  }

  function emitItem(it) {
    const audioTime = timeOf(it.u);
    const pos = it.tail
      ? { bar: bars[run.i0 + run.nBars - 1], beat: pattern.bar, pass: run.itemLap + 1 }   // the end of the last bar, not the next downbeat
      : where(it.u + 1e-7);
    emit('item', { ...pos, audioTime, item: it.item });
  }

  /** Dispatch everything before run-line position uH, in order. */
  function dispatch(uH) {
    for (;;) {
      const ub = nextBeatU();
      const it = nextItem();
      const iu = it ? it.u : Infinity;
      if (it && (iu < ub - EPS || (iu <= ub + EPS && it.tail))) {
        if (iu >= uH) break;
        emitItem(it); run.itemIdx += 1;
        continue;
      }
      if (ub !== Infinity) {
        if (ub >= uH) break;
        emitBeat(ub); run.k += 1;
        if (run.k === run.ciBeats) run.k += run.skipBeats;   // the count-in is over: on to startBar's beats
        continue;
      }
      // Nothing left before the end of an unlooped range.
      if (run.len >= uH) break;
      const audioTime = timeOf(run.len);
      const done = run;
      run.ended = true;
      call(ahead.ended, { bar: bars[run.i0 + run.nBars - 1], beat: pattern.bar, pass: 1, audioTime });
      queue.push({ time: audioTime, fn: () => { if (run === done) run = null; call(due.ended, { bar: bars[done.i0 + done.nBars - 1], beat: pattern.bar, pass: 1, audioTime }); } });
      break;
    }
    run.uDone = Math.max(run.uDone, Math.min(uH, run.loop ? Infinity : run.len));
  }

  function drain(now) {
    if (!queue.length) return;
    const ready = queue.filter(e => e.time <= now + EPS).sort((a, b) => a.time - b.time);
    if (!ready.length) return;
    queue = queue.filter(e => e.time > now + EPS);
    const gen = generation;
    for (const e of ready) {
      if (gen !== generation) break;   // stop() from inside a callback
      try { e.fn(); } catch (err) { console.error('[beat-clock]', err); }
    }
  }

  function tick() {
    if (!run && !queue.length) { clearTimer(); return; }
    if (!audio.ready()) return;
    const now = audio.now();
    if (run && !run.ended) dispatch(uAt(now + LOOKAHEAD));
    drain(now);
    if (!run && !queue.length) clearTimer();
  }

  function stop() {
    if (!run && !queue.length) return false;
    const audioTime = audio.ready() ? audio.now() : 0;
    run = null; queue = []; generation += 1;
    clearTimer();
    call(ahead.stopped, { audioTime });
    call(due.stopped, { audioTime });
    return true;
  }

  const clock = {
    configure({ bars: list, meter } = {}) {
      if (Array.isArray(list) && list.length) bars = list.filter(b => typeof b === 'number').slice().sort((a, b) => a - b);
      if (meter !== undefined) pattern = toPattern(meter);
      return clock;
    },
    setTempo(value) {
      const b = bpmOf(value);
      if (run && b !== bpm) {   // re-anchor at the horizon: what is dispatched keeps its time, the rest follows the new tempo
        const t = timeOf(run.uDone);
        run.anchorU = run.uDone; run.anchorTime = t;
      }
      bpm = b;
      if (run) tick();
      return bpm;
    },
    get tempo() { return bpm; },
    start({ fromBar, toBar, startBar, loop = false, countInBars = 0, items = [], at } = {}) {
      stop();
      const from = fromBar != null ? fromBar : (seekBar != null ? seekBar : bars[0]);
      const to = toBar != null ? toBar : bars[bars.length - 1];
      const a = Math.min(from, to), b = Math.max(from, to);
      const i0 = bars.findIndex(x => x >= a);
      let i1 = -1;
      for (let i = 0; i < bars.length; i++) if (bars[i] <= b) i1 = i;
      if (i0 < 0 || i1 < i0) return null;
      seekBar = null;
      const n = Math.max(0, Math.round(Number(countInBars) || 0));
      const startTime = Number.isFinite(at) ? at : (audio.ready() ? audio.now() + LEAD : 0);
      const countInQ = n * pattern.bar;
      const nBars = i1 - i0 + 1;
      const si = startBar != null ? bars.indexOf(startBar) - i0 : 0;
      const bi = si > 0 && si < nBars ? si : 0;     // bars into the range the run begins at
      const startU = bi * pattern.bar;
      const ciBeats = n * pattern.beats.length, skipBeats = bi * pattern.beats.length;
      const list = (Array.isArray(items) ? items : []).filter(x => x && typeof x.q === 'number').slice().sort((x, y) => x.q - y.q);
      const firstItem = list.findIndex(x => x.q >= startU - EPS);
      run = {
        i0, nBars, len: nBars * pattern.bar, loop: !!loop,
        countInBars: n, countInQ, countInEnded: false,
        startU, ciBeats, skipBeats, ciUntil: startU,   // ciUntil: positions before it are the count-in (positionAt)
        anchorU: startU - countInQ, anchorTime: startTime, uDone: startU - countInQ,
        k: ciBeats ? 0 : skipBeats,    // next beat, counted from the start of the count-in (range beats: from fromBar's downbeat + ciBeats)
        items: list,
        itemLap: 0, itemIdx: firstItem < 0 ? list.length : firstItem,
        ended: false,
      };
      ensureTimer();
      tick();
      return { startTime, barOneTime: startTime + countInQ * 60 / bpm, from: bars[i0], to: bars[i1], start: bars[i0 + bi] };
    },
    stop,
    seek(bar) {
      if (!run || run.ended) { seekBar = bar; return true; }
      const bi = bars.indexOf(bar) - run.i0;
      if (bi < 0 || bi >= run.nBars) return false;
      const lap = run.loop ? Math.max(0, Math.floor(run.uDone / run.len + 1e-7)) : 0;
      const target = lap * run.len + bi * pattern.bar;
      const t = timeOf(run.uDone);
      run.anchorU = target; run.anchorTime = t; run.uDone = target; run.ciUntil = 0;
      run.k = (run.countInBars + lap * run.nBars + bi) * pattern.beats.length;
      run.itemLap = lap;
      const q = bi * pattern.bar;
      const idx = run.items.findIndex(x => x.q >= q - EPS);
      run.itemIdx = idx < 0 ? run.items.length : idx;
      emit('seek', { ...where(target + 1e-7), audioTime: t });
      tick();
      return true;
    },
    on(type, fn) {
      if (!ahead[type]) throw new Error(`beat-clock: unknown event ${type}`);
      ahead[type].add(fn);
      return () => ahead[type].delete(fn);
    },
    onDue(type, fn) {
      if (!due[type]) throw new Error(`beat-clock: unknown event ${type}`);
      due[type].add(fn);
      return () => due[type].delete(fn);
    },
    at(audioTime, fn) {
      queue.push({ time: audioTime, fn });
      ensureTimer();
    },
    positionAt(audioTime) {
      if (!run) return null;
      const u = uAt(audioTime);
      if (u < run.ciUntil - EPS) return { bar: null, beat: Math.round((((u % pattern.bar) + pattern.bar) % pattern.bar) * 1e6) / 1e6, pass: 1, countIn: true, audioTime };
      return { ...where(run.loop ? u : Math.min(u, run.len)), countIn: false, audioTime };
    },
    position() { return run && audio.ready() ? clock.positionAt(audio.now()) : null; },
    get running() { return !!run; },
    get range() { return run ? { from: bars[run.i0], to: bars[run.i0 + run.nBars - 1], loop: run.loop } : null; },
    _tick: tick,
  };
  return clock;
}

export { createBeatClock, LOOKAHEAD, INTERVAL_MS, LEAD, selfTest };

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

  console.log('\n─── beat-clock.js self-test ───\n');

  const fakeAudio = () => { const a = { t: 0 }; a.ready = () => true; a.now = () => a.t; return a; };
  const fakeTimer = () => { const t = { fn: null, cleared: 0 }; t.set = fn => { t.fn = fn; return 1; }; t.clear = () => { t.fn = null; t.cleared++; }; return t; };
  /** Advance the fake clock to `to` in 25 ms ticks, running the scheduler each time. */
  const advance = (audio, timer, to) => { while (audio.t < to - 1e-9) { audio.t = Math.min(to, audio.t + INTERVAL_MS / 1000); if (timer.fn) timer.fn(); } };
  /** A clock on fakes that records every ahead event as [type, bar, beat, time] and every due event's type and firing time. */
  function rig({ bars = [1, 2, 3, 4], meter = '4/4', bpm = 120 } = {}) {
    const audio = fakeAudio(), timer = fakeTimer();
    const clock = createBeatClock({ audio, timer });
    clock.configure({ bars, meter });
    clock.setTempo(bpm);
    const log = [], dueLog = [];
    for (const type of TYPES) {
      clock.on(type, p => log.push({ type, ...p, audioTime: r3(p.audioTime) }));
      clock.onDue(type, p => dueLog.push({ type, at: r3(audio.t), audioTime: r3(p.audioTime) }));
    }
    const of = type => log.filter(e => e.type === type);
    return { audio, timer, clock, log, dueLog, of, go: to => advance(audio, timer, to) };
  }

  // ── a plain run: two bars of 4/4 at 120 (0.5 s a beat) from t = 1 ──
  {
    const R = rig();
    const started = R.clock.start({ fromBar: 1, toBar: 2, at: 1 });
    assert('start returns the run\'s times and range; nothing is dispatched before the lookahead window', [started, R.log.length, R.clock.running], [{ startTime: 1, barOneTime: 1, from: 1, to: 2, start: 1 }, 0, true]);
    R.go(0.9);
    assert('within 150 ms of the downbeat: bar 1 and its first beat are dispatched ahead, with the exact time', R.log.map(e => [e.type, e.bar, e.beat, e.audioTime]), [['bar', 1, 0, 1], ['beat', 1, 0, 1]]);
    assert('…but the due listeners have not run yet', R.dueLog.length, 0);
    R.go(1.0);
    assert('at the downbeat the due listeners run', R.dueLog.map(e => [e.type, e.at]), [['bar', 1], ['beat', 1]]);
    R.go(6);
    assert('eight beats half a second apart, then no more', R.of('beat').map(e => e.audioTime), [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
    assert('positions are { bar, beat (quarters into the bar), index }; the downbeat is the accent', R.of('beat').slice(3, 6).map(e => [e.bar, e.beat, e.index, e.accent, e.pass]), [[1, 3, 3, false, 1], [2, 0, 0, true, 1], [2, 1, 1, false, 1]]);
    assert('bar events on each downbeat', R.of('bar').map(e => [e.bar, e.audioTime]), [[1, 1], [2, 3]]);
    assert('ended at the end of bar 2 (t = 5): ahead once, due at 5, then not running and the timer cleared', [R.of('ended').map(e => [e.bar, e.beat, e.audioTime]), R.dueLog.filter(e => e.type === 'ended').map(e => e.at), R.clock.running, R.timer.fn], [[[2, 4, 5]], [5], false, null]);
    assert('no count-in, no loop: none of those events', [R.of('countInStart').length, R.of('countInEnd').length, R.of('loopWrap').length], [0, 0, 0]);
  }

  // ── items by beat position, and a 3/4 piece with gaps in its bar numbers ──
  {
    const R = rig({ bars: [1, 2, 15, 16], meter: '3/4', bpm: 60 });
    const items = [{ q: 0, id: 'a' }, { q: 2.5, id: 'b' }, { q: 3, id: 'c' }, { q: 6, id: 'd' }, { q: 9, id: 'off' }];
    R.clock.start({ fromBar: 2, at: 0.5, items });
    R.go(12);
    assert('items land on their quarters from the range start (1 s a quarter at 60)', R.of('item').map(e => [e.item.id, e.audioTime]), [['a', 0.5], ['b', 3], ['c', 3.5], ['d', 6.5], ['off', 9.5]]);
    assert('…with the bar and beat they fall on (bars 2, 15, 16); an item at the range end is the END of the last bar', R.of('item').map(e => [e.item.id, e.bar, e.beat]), [['a', 2, 0], ['b', 2, 2.5], ['c', 15, 0], ['d', 16, 0], ['off', 16, 3]]);
    assert('toBar defaults to the last bar: bars 2, 15, 16, ended at 9.5', [R.of('bar').map(e => e.bar), R.of('ended')[0].audioTime], [[2, 15, 16], 9.5]);
    assert('the range-end item is dispatched before `ended`', R.log.filter(e => e.type === 'item' || e.type === 'ended').slice(-2).map(e => e.type), ['item', 'ended']);
  }

  // ── live tempo change keeps phase ───────────────────────────────
  {
    const R = rig({ bpm: 60 });
    const items = [0, 1, 2, 3, 4, 5, 6, 7].map(q => ({ q, id: `n${q}` }));
    R.clock.start({ fromBar: 1, toBar: 2, at: 1, items });
    R.go(2.2);   // beats at 1 and 2 dispatched; the horizon is 2.35 s = quarter 1.35
    R.clock.setTempo(120);
    R.go(8);
    const beats = R.of('beat').map(e => e.audioTime), notes = R.of('item').map(e => e.audioTime);
    assert('60 → 120 bpm at t = 2.2: beats 1, 2 keep their time; the rest run at half a second from the horizon (quarter 1.35 at 2.35 s)', beats, [1, 2, 2.675, 3.175, 3.675, 4.175, 4.675, 5.175]);
    assert('every note is still exactly on its beat (same audio time, before and after the change)', notes, beats);
    assert('bar 2 and the end follow the same line: bar 2 at 3.675, ended at 5.675', [R.of('bar').map(e => e.audioTime), R.of('ended')[0].audioTime], [[1, 3.675], 5.675]);
    assert('nothing was dispatched twice', [beats.length, notes.length], [8, 8]);
  }
  {
    const R = rig({ bpm: 120 });
    R.clock.start({ fromBar: 1, toBar: 4, at: 0.1 });
    R.go(1);
    for (const b of [90, 61, 143, 200, 30, 120]) { R.clock.setTempo(b); R.go(R.audio.t + 0.33); }
    R.go(40);
    const beats = R.of('beat');
    assert('six tempo changes in two seconds: still 16 beats, in order, strictly increasing in time, bars 1–4', [beats.length, beats.every((e, i) => i === 0 || e.audioTime > beats[i - 1].audioTime), [...new Set(beats.map(e => e.bar))]], [16, true, [1, 2, 3, 4]]);
    assert('setTempo validates (a bad value falls back to 90) and `tempo` reads it', [R.clock.setTempo('x'), R.clock.setTempo(72), R.clock.tempo], [90, 72, 72]);
  }

  // ── loop wrap ───────────────────────────────────────────────────
  {
    const R = rig();   // 4/4 at 120: a bar is 2 s
    const items = [{ q: 0, id: 'on' }, { q: 8, id: 'off' }];
    R.clock.start({ fromBar: 2, toBar: 3, loop: true, at: 0, items });
    R.go(11);
    assert('loop 2–3: bars 2 3 2 3 2 3, never ended', [R.of('bar').map(e => e.bar), R.of('ended').length, R.clock.running], [[2, 3, 2, 3, 2, 3], 0, true]);
    assert('loopWrap on the downbeat of pass 2 and 3, with the range', R.of('loopWrap').map(e => [e.pass, e.bar, e.from, e.to, e.audioTime]), [[2, 2, 2, 3, 4], [3, 2, 2, 3, 8]]);
    assert('beats carry the pass', [...new Set(R.of('beat').map(e => `${e.pass}:${e.bar}`))], ['1:2', '1:3', '2:2', '2:3', '3:2', '3:3']);
    assert('items repeat every pass; the range-end item closes its own pass (bar 3, beat 4, pass n) at the wrap time', R.of('item').map(e => [e.item.id, e.pass, e.bar, e.beat, e.audioTime]).slice(0, 5), [['on', 1, 2, 0, 0], ['off', 1, 3, 4, 4], ['on', 2, 2, 0, 4], ['off', 2, 3, 4, 8], ['on', 3, 2, 0, 8]]);
    assert('order at the wrap: the ending pass\'s item, loopWrap, bar, beat, the new pass\'s item', R.log.filter(e => e.audioTime === 4).map(e => e.type), ['item', 'loopWrap', 'bar', 'beat', 'item']);
    assert('positionAt: mid-bar 3 of pass 2 (t = 6.5 → quarter 13 → bar 3, beat 1)', (p => [p.bar, p.beat, p.pass, p.countIn])(R.clock.positionAt(6.5)), [3, 1, 2, false]);
    R.clock.stop();
  }

  // ── count-in once ───────────────────────────────────────────────
  {
    const R = rig({ bars: [1, 2], meter: '3/4', bpm: 120 });   // a bar is 1.5 s
    const started = R.clock.start({ fromBar: 1, toBar: 2, loop: true, countInBars: 1, at: 1 });
    R.go(12);
    assert('a 1-bar count-in: bar one is 1.5 s after the start', [started.startTime, started.barOneTime], [1, 2.5]);
    assert('three count-in beats (accent first), bar null, then the piece', R.of('beat').slice(0, 4).map(e => [e.countIn, e.bar, e.accent, e.audioTime]), [[true, null, true, 1], [true, null, false, 1.5], [true, null, false, 2], [false, 1, true, 2.5]]);
    assert('count-in only on the first pass: 3 count-in beats in 3+ passes, countInStart / countInEnd once each', [R.of('beat').filter(e => e.countIn).length, R.of('countInStart').map(e => [e.bars, e.audioTime]), R.of('countInEnd').map(e => [e.bar, e.audioTime]), R.of('loopWrap').length >= 2], [3, [[1, 1]], [[1, 2.5]], true]);
    assert('no bar event during the count-in; the wraps go straight to bar 1', R.of('bar').slice(0, 4).map(e => [e.bar, e.audioTime]), [[1, 2.5], [2, 4], [1, 5.5], [2, 7]]);
    assert('positionAt during the count-in says so', (p => [p.countIn, p.bar])(R.clock.positionAt(1.2)), [true, null]);
    R.clock.stop();
  }
  {
    const R = rig({ bpm: 60 });
    R.clock.start({ fromBar: 1, toBar: 1, countInBars: 2, at: 0 });
    R.go(1.2);
    R.clock.setTempo(120);   // mid count-in
    R.go(20);
    assert('a tempo change during the count-in: still 8 count-in beats then 4 of the bar, bar 1 on the new line', [R.of('beat').filter(e => e.countIn).length, R.of('beat').filter(e => !e.countIn).length, R.of('countInEnd')[0].audioTime === R.of('bar')[0].audioTime], [8, 4, true]);
  }

  // ── startBar: a run that begins inside its range (resume after a pause) ──
  {
    const R = rig();   // 4/4 at 120: a bar is 2 s
    const items = [0, 4, 8, 12].map((q, i) => ({ q, id: `b${i + 1}` })).concat([{ q: 10, id: 'mid3' }, { q: 16, id: 'off' }]);
    const s = R.clock.start({ fromBar: 1, toBar: 4, startBar: 3, loop: true, countInBars: 1, at: 1, items });
    assert('startBar 3 with a 1-bar count-in: the first downbeat is bar 3, one bar after the start', [s.barOneTime, s.from, s.to, s.start], [3, 1, 4, 3]);
    assert('positionAt in the count-in, then in bar 3', [(p => [p.countIn, p.bar])(R.clock.positionAt(2)), (p => [p.countIn, p.bar, p.beat, p.pass])(R.clock.positionAt(3.5))], [[true, null], [false, 3, 1, 1]]);
    R.go(12.5);
    assert('four count-in beats, then bars 3 4 and the loop wraps to bar 1: 3 4 1 2 3', [R.of('beat').filter(e => e.countIn).map(e => e.audioTime), R.of('bar').map(e => [e.bar, e.audioTime, e.pass])], [[1, 1.5, 2, 2.5], [[3, 3, 1], [4, 5, 1], [1, 7, 2], [2, 9, 2], [3, 11, 2]]]);
    assert('beats run on without a gap or a repeat (every 0.5 s from the start)', R.of('beat').every((e, i, all) => i === 0 || r3(e.audioTime - all[i - 1].audioTime) === 0.5), true);
    assert('items before bar 3 are skipped on the first pass only; the wrap is pass 2', [R.of('item').map(e => [e.item.id, e.audioTime]), R.of('loopWrap').map(e => [e.pass, e.bar, e.audioTime]), R.of('countInEnd').map(e => [e.bar, e.audioTime])], [[['b3', 3], ['mid3', 4], ['b4', 5], ['off', 7], ['b1', 7], ['b2', 9], ['b3', 11], ['mid3', 12]], [[2, 1, 7]], [[3, 3]]]);
    R.clock.stop();
    const T = rig();
    const t = T.clock.start({ fromBar: 1, toBar: 4, startBar: 4, at: 0.5, items });
    T.go(6);
    assert('no count-in, no loop, startBar 4: bar 4 at once, ended one bar later', [t.barOneTime, t.start, T.of('bar').map(e => [e.bar, e.audioTime]), T.of('item').map(e => e.item.id), T.of('ended')[0].audioTime], [0.5, 4, [[4, 0.5]], ['b4', 'off'], 2.5]);
    assert('a startBar outside the range is ignored (the run begins at fromBar)', (x => [x.start, x.barOneTime])(T.clock.start({ fromBar: 2, toBar: 3, startBar: 9, at: 10 })), [2, 10]);
    T.clock.stop();
  }

  // ── stop cancels scheduled events ───────────────────────────────
  {
    const R = rig();
    let late = 0;
    R.clock.start({ fromBar: 1, toBar: 4, at: 1, items: [{ q: 0, id: 'a' }, { q: 1, id: 'b' }] });
    R.clock.at(1.3, () => { late += 1; });
    R.go(0.95);   // bar, beat and item a are dispatched ahead for t = 1; none is due yet
    const dispatched = R.log.length;
    assert('before stop: three events dispatched ahead, none due', [R.log.map(e => e.type), R.dueLog.length], [['bar', 'beat', 'item'], 0]);
    assert('stop() returns true and reports stopped', [R.clock.stop(), R.clock.running, R.log[R.log.length - 1].type], [true, false, 'stopped']);
    R.go(6);
    assert('after stop: nothing more is dispatched, the events already dispatched never come due, at() is dropped, the timer is cleared', [R.log.length - dispatched, R.dueLog.filter(e => e.type !== 'stopped').length, late, R.timer.fn, R.timer.cleared], [1, 0, 0, null, 1]);
    assert('stop() with nothing running is a no-op', R.clock.stop(), false);
  }
  {
    const R = rig();
    const seen = [];
    R.clock.onDue('beat', p => { seen.push(p.audioTime); if (seen.length === 2) R.clock.stop(); });
    R.clock.start({ fromBar: 1, toBar: 4, at: 0 });
    R.go(5);
    assert('stop() from inside a due listener: that is the last one', seen, [0, 0.5]);
    const again = R.clock.start({ fromBar: 3, at: 6 });
    R.go(11);
    assert('a new start after a stop runs normally (bars 3–4 from t = 6)', [again.from, again.to, R.of('bar').filter(e => e.audioTime >= 6).map(e => e.bar)], [3, 4, [3, 4]]);
  }

  // ── at(), seek, bad ranges ──────────────────────────────────────
  {
    const R = rig();
    const fired = [];
    R.clock.start({ fromBar: 1, toBar: 1, at: 0 });
    R.clock.at(2.4, () => fired.push(r3(R.audio.t)));   // after the run's end (2.0)
    R.go(3);
    assert('at(): runs when the audio clock gets there, also after the run ended; the timer stops once the queue is empty', [fired, R.timer.fn], [[2.4], null]);
  }
  {
    const R = rig();   // a bar is 2 s
    R.clock.start({ fromBar: 1, toBar: 4, at: 0, items: [{ q: 0, id: 'b1' }, { q: 4, id: 'b2' }, { q: 8, id: 'b3' }, { q: 12, id: 'b4' }] });
    R.go(1.0);   // horizon 1.15 s = quarter 2.3
    assert('seek(3) while running: true; outside the range or unknown: false', [R.clock.seek(3), R.clock.seek(9)], [true, false]);
    R.go(8);
    assert('the position continues at bar 3\'s downbeat from the horizon (1.15 s): bars 1, 3, 4; bar 2\'s item is skipped', [R.of('bar').map(e => [e.bar, e.audioTime]), R.of('item').map(e => e.item.id)], [[[1, 0], [3, 1.15], [4, 3.15]], ['b1', 'b3', 'b4']]);
    assert('…and it ends two bars later (5.15 s)', R.of('ended')[0].audioTime, 5.15);
    R.clock.seek(2);
    const s = R.clock.start({ at: 10 });
    assert('seek while stopped is the next start\'s fromBar', [s.from, s.to], [2, 4]);
    R.clock.stop();
    assert('a range with no bars → null; a reversed range is swapped', [R.clock.start({ fromBar: 7, toBar: 9 }), (x => [x.from, x.to])(R.clock.start({ fromBar: 3, toBar: 2, at: 20 }))], [null, [2, 3]]);
    R.clock.stop();
    let threw = false;
    try { R.clock.on('nope', () => {}); } catch (_) { threw = true; }
    assert('an unknown event name throws', threw, true);
  }

  // ── the metronome driven by the clock ───────────────────────────
  {
    const { createMetronome } = await import('./metronome.js');
    const R = rig({ bars: [1, 2], meter: '3/4', bpm: 120 });
    const clicks = [];
    const m = createMetronome({ audio: { ready: () => true, now: () => R.audio.t, muted: () => false, setVolume() {}, click: ({ time, freq }) => { const c = { time: r3(time), freq, cancelled: false }; clicks.push(c); return { cancel() { c.cancelled = true; } }; } }, timer: fakeTimer() });
    let metroOn = false;
    R.clock.on('beat', p => { if (p.countIn || metroOn) m.click(p.audioTime, { accent: p.accent, countIn: p.countIn }); });
    R.clock.start({ fromBar: 1, toBar: 2, countInBars: 1, at: 0.5 });
    R.go(2.6);          // the count-in (0.5 1 1.5) and beats 2 and 2.5 pass with the click off
    metroOn = true;     // joins at the next beat
    R.go(3.9);
    R.clock.stop(); m.stop();
    assert('count-in clicks with the click off (accent first); switched on mid-run it joins on the grid', clicks.map(c => [c.time, c.freq]), [[0.5, 1600], [1, 1000], [1.5, 1000], [3, 1000], [3.5, 1600], [4, 1000]]);
    assert('stop() cancels the click already queued for 4.0', clicks.filter(c => c.cancelled).map(c => c.time), [4]);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
