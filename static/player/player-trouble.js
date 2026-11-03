/**
 * player-trouble.js
 * =================
 * Trouble spots for the player page: which bars of a pass went badly, as a
 * suggestion ("loop these"), not a grade. Pure logic, no DOM, Node-runnable
 * like player-follow.js. The page records one pass at a time (a full run of
 * the piece, or one pass of a loop) and scores it when it ends.
 *
 *   createPassRecorder(steps, { now })  → recorder
 *       start({ from, to }, stepIndex, t?)   a pass over bars from..to begins with steps[stepIndex] current
 *       skipTiming()                         the current step's time will not count (it is on a freshly drawn line)
 *       miss(step, midi, t?)                 a wrong note while `step` is current; a midi expected by the NEXT step
 *                                            (score order) is an anticipation, counted apart from misses
 *       complete(step, t?)                   `step` completed now; the next step becomes current now
 *       end(t?)                              → pass { from, to, steps: [row] } and stops recording; null when idle
 *       cancel()                             stop recording without a pass (navigation broke the run)
 *       active()                             → whether a pass is being recorded
 *       row: { index, bar, ms, misses, anticipations }
 *           ms: time from becoming current to completion; null when unmeasured.
 *           The first step of a pass is unmeasured (the player is getting ready,
 *           or coming back from a loop wrap), and so is the first step after a
 *           line change (eyes move to the next system, the page transitions).
 *   scorePass(pass)                      → score
 *       { medianMs, slowMs, bars: [barScore], ranges: [range] }
 *       barScore: { bar, steps, stumbles, slow, misses, anticipations, problems, score, flagged }
 *           stumbles: steps with ≥ 1 miss (hunting around on one step is one problem, not many)
 *           slow:     steps taking ≥ HESITATION_FACTOR × the pass's median step time, and
 *                     ≥ HESITATION_MIN_MS (a floor: a fast or synchronous run flags nothing)
 *           problems: steps that are a stumble or slow (or both: still one)
 *           score:    problems / steps; flagged when ≥ BAR_THRESHOLD
 *       range: { from, to, misses, slow, stumbles, weight }
 *           flagged neighbours merged, ranked by weight (misses + slow steps), the top
 *           TOP_N kept, returned in bar order. [] means a clean pass.
 *   troubleLabel(range)                  → 'bars 6–7 (4 misses, 1 slow step)'
 *   shouldSuggest(passNumber)            → true from MIN_PASS_TO_SUGGEST on (first reads are fumbly)
 *   passKey(piece, hands, from, to)      → history key: suggestions start on the second pass of the same
 *                                          piece, hands and range (a hand's first read is also a first read)
 *   createPassHistory()                  → { record(key) → pass number, count(key), reset() }
 *   passRows(pass, score)                → rows for console.table (one per completed step)
 *   createPracticeClock({ idleGapMs = IDLE_GAP_MS, now })  → clock   (the future practice log's "time spent")
 *       note(t?)        a note was played: the gap since the previous note is added to playedMs
 *                       when it is at most idleGapMs; a longer gap adds NOTHING (not the cap:
 *                       a 30 s pause is a break, not 30 s of practice). The first note adds 0.
 *       playedMs()      active time so far; reset() starts over; lastNoteAt() → t or null
 *       Counts the same in strict and forgiving mode: it only sees note attacks.
 *   selfTest()                           → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-trouble.js').then(m => m.selfTest())"
 */

// Thresholds (tune from the console.table output of real passes).
const HESITATION_FACTOR = 3;      // a step is slow at this multiple of the pass's median step time …
const HESITATION_MIN_MS = 1000;   // … and never under this (ms)
const BAR_THRESHOLD = 0.34;       // problems / steps at which a bar is flagged (one step of three)
const TOP_N = 3;                  // ranges shown at most
const MIN_PASS_TO_SUGGEST = 2;    // suggestions from this pass of the same piece / hands / range on

const IDLE_GAP_MS = 30000;        // a gap between notes longer than this is a break: it adds nothing to played time

const THRESHOLDS = Object.freeze({ HESITATION_FACTOR, HESITATION_MIN_MS, BAR_THRESHOLD, TOP_N, MIN_PASS_TO_SUGGEST, IDLE_GAP_MS });

// ════════════════════════════════════════════════════════════════════
// RECORDER
// ════════════════════════════════════════════════════════════════════

function createPassRecorder(steps, { now = () => Date.now() } = {}) {
  const list = Array.isArray(steps) ? steps : [];
  let pass = null;   // { from, to, rows }
  let cur = null;    // { index, bar, began, measured, misses, anticipations }

  const at = t => (typeof t === 'number' ? t : now());
  const track = (step, t, measured) => { cur = step ? { index: step.index, bar: step.bar, began: at(t), measured, misses: 0, anticipations: 0 } : null; };

  function start(range, stepIndex, t) {
    const from = range ? Number(range.from) : NaN, to = range ? Number(range.to) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to)) { cancel(); return; }
    pass = { from: Math.min(from, to), to: Math.max(from, to), rows: [] };
    track(list[stepIndex] || null, t, false);
  }

  function skipTiming() { if (cur) cur.measured = false; }

  function miss(step, midi, t) {
    if (!pass || !step) return;
    if (!cur || cur.index !== step.index) track(step, t, false);   // out of sync with the page: pick the step up, unmeasured
    const next = list[step.index + 1];
    if (next && next.expected && next.expected.has(midi)) cur.anticipations += 1;
    else cur.misses += 1;
  }

  function complete(step, t) {
    if (!pass || !step) return;
    const tt = at(t);
    if (!cur || cur.index !== step.index) track(step, tt, false);
    pass.rows.push({ index: cur.index, bar: cur.bar, ms: cur.measured ? Math.max(0, tt - cur.began) : null, misses: cur.misses, anticipations: cur.anticipations });
    track(list[step.index + 1] || null, tt, true);
  }

  function end() {
    if (!pass) return null;
    const out = { from: pass.from, to: pass.to, steps: pass.rows };
    pass = null; cur = null;
    return out;
  }

  function cancel() { pass = null; cur = null; }

  return { start, skipTiming, miss, complete, end, cancel, active: () => !!pass };
}

// ════════════════════════════════════════════════════════════════════
// SCORING
// ════════════════════════════════════════════════════════════════════

function median(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function scorePass(pass) {
  const rows = pass && Array.isArray(pass.steps) ? pass.steps : [];
  const measured = rows.filter(r => typeof r.ms === 'number').map(r => r.ms);
  const medianMs = median(measured);
  const slowMs = medianMs == null ? null : Math.max(HESITATION_MIN_MS, HESITATION_FACTOR * medianMs);

  const byBar = new Map();
  for (const r of rows) {
    let b = byBar.get(r.bar);
    if (!b) { b = { bar: r.bar, steps: 0, stumbles: 0, slow: 0, misses: 0, anticipations: 0, problems: 0, score: 0, flagged: false }; byBar.set(r.bar, b); }
    b.steps += 1;
    b.misses += r.misses || 0;
    b.anticipations += r.anticipations || 0;
    const stumble = (r.misses || 0) > 0;
    const slow = slowMs != null && typeof r.ms === 'number' && r.ms >= slowMs;
    if (stumble) b.stumbles += 1;
    if (slow) b.slow += 1;
    if (stumble || slow) b.problems += 1;
  }
  const bars = [...byBar.values()].sort((a, b) => a.bar - b.bar);
  for (const b of bars) { b.score = b.steps ? b.problems / b.steps : 0; b.flagged = b.score >= BAR_THRESHOLD; }

  // Flagged neighbours merge into ranges.
  const merged = [];
  for (const b of bars) {
    if (!b.flagged) continue;
    const last = merged[merged.length - 1];
    if (last && b.bar === last.to + 1) { last.to = b.bar; last.misses += b.misses; last.slow += b.slow; last.stumbles += b.stumbles; }
    else merged.push({ from: b.bar, to: b.bar, misses: b.misses, slow: b.slow, stumbles: b.stumbles });
  }
  for (const r of merged) r.weight = r.misses + r.slow;
  const ranges = merged.slice().sort((a, b) => b.weight - a.weight || a.from - b.from).slice(0, TOP_N).sort((a, b) => a.from - b.from);
  return { medianMs, slowMs, bars, ranges };
}

const barsText = (from, to) => (from === to ? `bar ${from}` : `bars ${from}–${to}`);

function troubleLabel(range) {
  const parts = [];
  if (range.misses > 0) parts.push(`${range.misses} miss${range.misses === 1 ? '' : 'es'}`);
  if (range.slow > 0) parts.push(`${range.slow} slow step${range.slow === 1 ? '' : 's'}`);
  return `${barsText(range.from, range.to)}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

const shouldSuggest = passNumber => Number(passNumber) >= MIN_PASS_TO_SUGGEST;

const passKey = (piece, hands, from, to) => `${piece}|${hands}|${Math.min(from, to)}-${Math.max(from, to)}`;

function createPassHistory() {
  const counts = new Map();
  return {
    record(key) { const n = (counts.get(key) || 0) + 1; counts.set(key, n); return n; },
    count(key) { return counts.get(key) || 0; },
    reset() { counts.clear(); },
  };
}

/** One row per completed step, for console.table. */
function passRows(pass, score) {
  const slowMs = score && score.slowMs;
  return (pass && pass.steps ? pass.steps : []).map(r => ({
    step: r.index, bar: r.bar, ms: r.ms == null ? '' : Math.round(r.ms),
    misses: r.misses, anticip: r.anticipations,
    stumble: r.misses > 0 ? '●' : '', slow: slowMs != null && typeof r.ms === 'number' && r.ms >= slowMs ? '●' : '',
  }));
}

// ════════════════════════════════════════════════════════════════════
// PRACTICE CLOCK
// ════════════════════════════════════════════════════════════════════

function createPracticeClock({ idleGapMs = IDLE_GAP_MS, now = () => Date.now() } = {}) {
  const cap = Math.max(0, Number(idleGapMs) || 0);
  let played = 0;
  let last = null;
  return {
    note(t) {
      const tt = typeof t === 'number' ? t : now();
      if (last != null) { const gap = tt - last; if (gap >= 0 && gap <= cap) played += gap; }
      last = tt;
      return played;
    },
    playedMs: () => played,
    lastNoteAt: () => last,
    reset() { played = 0; last = null; },
  };
}

export { createPassRecorder, scorePass, troubleLabel, shouldSuggest, passKey, createPassHistory, passRows, createPracticeClock, THRESHOLDS, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/player/player-trouble.js').then(m => m.selfTest())"
//
// Synthetic passes: `pass(spec)` builds { from, to, steps } from one entry per
// bar, each a list of [ms, misses, anticipations] per step.

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(ok);
    console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  console.log('\n─── player-trouble.js self-test ───\n');

  const pass = (spec, from = 1) => {
    const steps = [];
    let index = 0;
    spec.forEach((bar, i) => { for (const [ms, misses = 0, anticipations = 0] of bar) steps.push({ index: index++, bar: from + i, ms, misses, anticipations }); });
    return { from, to: from + spec.length - 1, steps };
  };
  const ok = ms => [ms, 0, 0];
  const clean3 = [ok(500), ok(500), ok(500)];
  const rangesOf = s => s.ranges.map(r => [r.from, r.to, r.misses, r.slow]);

  // ── recorder ──────────────────────────────────────────────────────
  // Four steps over bars 1–2; a fake clock the test advances by hand.
  const S = [
    { index: 0, bar: 1, expected: new Set([60, 64]) },
    { index: 1, bar: 1, expected: new Set([65]) },
    { index: 2, bar: 2, expected: new Set([67]) },
    { index: 3, bar: 2, expected: new Set([72]) },
  ];
  let clock = 1000;
  const rec = createPassRecorder(S, { now: () => clock });
  assert('idle recorder: not active, end() is null, miss / complete are no-ops', (rec.miss(S[0], 61), rec.complete(S[0]), [rec.active(), rec.end()]), [false, null]);
  rec.start({ from: 1, to: 2 }, 0);
  clock += 4000; rec.complete(S[0]);                         // first step: 4 s getting ready, unmeasured
  clock += 300; rec.miss(S[1], 61); clock += 200; rec.miss(S[1], 62); clock += 500; rec.complete(S[1]);   // two misses, 1000 ms
  clock += 250; rec.miss(S[2], 72); clock += 250; rec.complete(S[2]);   // 72 is expected by step 3: anticipation, 500 ms
  clock += 700; rec.complete(S[3]);
  const p1 = rec.end();
  assert('recorder: a pass over 1–2 with one row per completed step; the first step is unmeasured; misses and ms per step', p1, { from: 1, to: 2, steps: [
    { index: 0, bar: 1, ms: null, misses: 0, anticipations: 0 },
    { index: 1, bar: 1, ms: 1000, misses: 2, anticipations: 0 },
    { index: 2, bar: 2, ms: 500, misses: 0, anticipations: 1 },
    { index: 3, bar: 2, ms: 700, misses: 0, anticipations: 0 },
  ] });
  assert('after end(): idle again, end() null', [rec.active(), rec.end()], [false, null]);
  rec.start({ from: 2, to: 1 }, 0);
  rec.complete(S[0]); clock += 100;
  rec.skipTiming();                                           // step 1 came up on a freshly drawn line
  clock += 9000; rec.complete(S[1]);
  clock += 400; rec.complete(S[2]);
  const p2 = rec.end();
  assert('skipTiming(): the first step after a line change is unmeasured (ms null), the next one measured again; a reversed range is swapped', [p2.from, p2.to, p2.steps.map(r => r.ms)], [1, 2, [null, null, 400]]);
  rec.start({ from: 1, to: 2 }, 0);
  rec.complete(S[0]);
  rec.cancel();
  assert('cancel(): no pass, nothing recorded afterwards', [rec.active(), rec.end(), (rec.complete(S[1]), rec.end())], [false, null, null]);
  rec.start({ from: 1, to: 2 }, 0);
  clock += 100; rec.complete(S[2]);                           // the page jumped without telling the recorder: step 2 is picked up unmeasured
  clock += 300; rec.complete(S[3]);
  assert('a completion for a step the recorder was not tracking is picked up unmeasured; the next step is timed', rec.end().steps.map(r => [r.index, r.ms]), [[2, null], [3, 300]]);
  assert('start with a bad range leaves the recorder idle', (rec.start(null, 0), rec.active()), false);

  // ── scoring ───────────────────────────────────────────────────────
  const cleanPass = pass([clean3, clean3, clean3, clean3]);
  let s = scorePass(cleanPass);
  assert('clean pass: median 500, nothing flagged, no ranges', [s.medianMs, s.slowMs, s.bars.every(b => !b.flagged), s.ranges], [500, 1500, true, []]);

  const fumbled = pass([clean3, [ok(500), [2500, 3], [1200, 1]], clean3, clean3]);
  s = scorePass(fumbled);
  assert('one fumbled bar (2 of 3 steps with misses): only bar 2 flagged; its range carries the miss count', [s.bars.map(b => b.flagged), rangesOf(s), s.bars[1].stumbles, s.bars[1].problems], [[false, true, false, false], [[2, 2, 4, 1]], 2, 2]);
  assert('a step that is a stumble and slow is one problem, not two', s.bars[1].problems, 2);
  assert('troubleLabel: misses and slow steps', [troubleLabel(s.ranges[0]), troubleLabel({ from: 12, to: 12, misses: 0, slow: 1 }), troubleLabel({ from: 3, to: 4, misses: 1, slow: 0 })], ['bar 2 (4 misses, 1 slow step)', 'bar 12 (1 slow step)', 'bars 3–4 (1 miss)']);

  const slowBar = pass([clean3, clean3, [ok(500), ok(1600), ok(2000)], clean3]);
  s = scorePass(slowBar);
  assert('a slow bar with no misses: steps ≥ 3× the median (1500 ms) flag the bar; no misses in the label', [rangesOf(s), troubleLabel(s.ranges[0])], [[[3, 3, 0, 2]], 'bar 3 (2 slow steps)']);

  const careful = pass([[ok(2000), ok(2200), ok(1900)], [ok(2100), ok(2000), ok(2400)], [ok(1800), ok(2000), ok(2300)]]);
  s = scorePass(careful);
  assert('a slow, careful player (uniform 2 s steps) is not flagged anywhere: the threshold is relative', [s.medianMs, s.slowMs, s.ranges], [2000, 6000, []]);

  const quick = pass([[ok(0), ok(0), ok(0)], [ok(0), ok(5), ok(0)], [ok(0), ok(0), ok(900)]]);
  s = scorePass(quick);
  assert('a synchronous / very fast run: the HESITATION_MIN_MS floor keeps 5 ms and 900 ms steps from being slow', [s.medianMs, s.slowMs, s.ranges], [0, 1000, []]);

  const anticipating = pass([clean3, [[500, 0, 2], [500, 0, 1], ok(500)], clean3]);
  s = scorePass(anticipating);
  assert('anticipation (a note of the next step) is not a miss: bar 2 is not flagged', [s.bars[1].anticipations, s.bars[1].stumbles, s.ranges], [3, 0, []]);

  const neighbours = pass([clean3, clean3, clean3, clean3, clean3, [[900, 2], [700, 1], ok(500)], [[800, 1], ok(500), [700, 1]], clean3]);
  s = scorePass(neighbours);
  assert('neighbouring flagged bars 6 and 7 merge into one range with the summed misses', rangesOf(s), [[6, 7, 5, 0]]);
  assert('one stumble in a three-step bar (0.33) stays under BAR_THRESHOLD', scorePass(pass([clean3, [[900, 1], ok(500), ok(500)]])).ranges, []);

  const many = pass([[[600, 1], ok(500)], clean3, [[600, 3], ok(500)], clean3, [[600, 2], ok(500)], clean3, [[600, 5], ok(500)], clean3, [[600, 1], ok(500)]]);
  s = scorePass(many);
  assert('top-N cap: five separate problem bars → the three heaviest (bars 3, 5, 7), in bar order', [s.bars.filter(b => b.flagged).length, rangesOf(s)], [5, [[3, 3, 3, 0], [5, 5, 2, 0], [7, 7, 5, 0]]]);

  const unmeasured = pass([[[null, 0], ok(500)], [[null, 2], ok(500)]]);
  s = scorePass(unmeasured);
  assert('unmeasured steps (ms null) still count misses but are never slow; one stumble in a 2-step bar flags it', [s.medianMs, rangesOf(s)], [500, [[2, 2, 2, 0]]]);
  assert('an empty pass scores to nothing', scorePass({ from: 1, to: 1, steps: [] }), { medianMs: null, slowMs: null, bars: [], ranges: [] });

  // ── history / suppression ─────────────────────────────────────────
  const h = createPassHistory();
  const k = passKey('carol', 'both', 1, 16);
  assert('passKey normalises a reversed range', passKey('carol', 'lh', 7, 6), 'carol|lh|6-7');
  assert('first pass of a piece / hands / range: no suggestions; from the second: yes', [shouldSuggest(h.record(k)), shouldSuggest(h.record(k)), h.count(k)], [false, true, 2]);
  assert('another hand or range is its own first read', [h.count(passKey('carol', 'lh', 1, 16)), shouldSuggest(h.record(passKey('carol', 'both', 6, 7)))], [0, false]);

  // Two whole-piece passes separated by a restart (the page's R / Restart: end the run, start a new recording at step 0 on the same range).
  const h2 = createPassHistory();
  const rec2 = createPassRecorder(S, { now: () => clock });
  const runOnce = () => {
    rec2.start({ from: 1, to: 2 }, 0);                       // restart → syncPass
    clock += 500; rec2.complete(S[0]);
    clock += 500; rec2.miss(S[1], 61); rec2.miss(S[1], 62); clock += 500; rec2.complete(S[1]);   // bar 1 fumbled
    clock += 500; rec2.complete(S[2]); clock += 500; rec2.complete(S[3]);
    const done = rec2.end();                                 // r.done → endPass
    const n = h2.record(passKey('carol', 'both', done.from, done.to));
    return { n, suggested: shouldSuggest(n), ranges: scorePass(done).ranges.map(r => [r.from, r.to]) };
  };
  assert('two passes separated by a restart: the second is pass 2 of the same key and suggests the fumbled bar', [runOnce(), runOnce()], [{ n: 1, suggested: false, ranges: [[1, 1]] }, { n: 2, suggested: true, ranges: [[1, 1]] }]);
  assert('history is per key, not per recorder: reset() (piece load) starts the count over', (h2.reset(), runOnce().n), 1);

  // ── console rows ──────────────────────────────────────────────────
  const rows = passRows(fumbled, scorePass(fumbled));
  assert('passRows: one row per step with stumble / slow marks', [rows.length, rows[4], rows[0].ms], [12, { step: 4, bar: 2, ms: 2500, misses: 3, anticip: 0, stumble: '●', slow: '●' }, 500]);

  // ── practice clock ────────────────────────────────────────────────
  const pc = createPracticeClock({ idleGapMs: 30000 });
  assert('practice clock: the first note adds nothing; gaps within the cap add up', [pc.note(1000), pc.note(2000), pc.note(2500)], [0, 1000, 1500]);
  assert('practice clock: a gap over IDLE_GAP_MS adds nothing (not the cap); the next gap counts again', [pc.note(2500 + 31000), pc.note(2500 + 31000 + 400)], [1500, 1900]);
  assert('practice clock: a gap of exactly the cap counts; reset starts over', [pc.note(2500 + 31000 + 400 + 30000), (pc.reset(), [pc.playedMs(), pc.lastNoteAt()])], [31900, [0, null]]);
  assert('practice clock: THRESHOLDS carries IDLE_GAP_MS', THRESHOLDS.IDLE_GAP_MS, 30000);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
