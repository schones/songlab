/**
 * player-steady.js
 * ================
 * "Band slows down for me": the judge behind play-along's steady-rhythm
 * rule. The band (the clock: guide, accompaniment, click, drums) slows one
 * notch when the learner is struggling and stops when the learner stops.
 * A missed note changes nothing, and nothing here ever raises the tempo.
 * Pure logic — no DOM, no audio, no clock; Node-runnable. player.js feeds
 * it what the timing log (player-playalong.js) says about each expected
 * note and asks for a verdict at every barline.
 *
 *   STEADY                      every threshold, in one place (below)
 *   createSteadyJudge(config = STEADY) → judge
 *     reset()                   a start or a resume: the bars so far are forgotten and the
 *                               next GRACE_BARS bars are not judged. The gap since the last
 *                               drop is kept (MIN_BARS_BETWEEN_DROPS holds across a pause).
 *     clear()                   reset() and forget the last drop too (another piece)
 *     barline(key) → { action: 'none' | 'slow' | 'stop', bars }
 *         the clock reaches the barline that opens bar `key` (any string naming one
 *         played bar: pass + seq). The bars before it are judged first — `bars` is the
 *         window the verdict was read from — then `key` becomes the bar under way.
 *     expected(key) / hit(key) / missed(key)
 *         a note the learner should play in bar `key` was registered / paired with a
 *         played note / given up on. Counts stay live after the bar has ended: a late
 *         verdict on its last note is there at the next barline.
 *     key(key)                  a key went down while the clock was in bar `key` (any pitch)
 *     slowed()                  the page acted on a 'slow': the gap to the next drop starts here
 *     bars()                    the bars so far, oldest first (debug)
 *   nextPct(pct, config = STEADY) → the slider percentage one notch down, or null at the floor
 *   easeSteps(fromPct, toPct, config = STEADY) → [pct, …] the percentages on the way down, last = toPct
 *
 *   The rule, at a barline, over the bars that HAD expected notes for the learner
 *   (rests and the other hand's bars count for neither; grace bars are left out):
 *     stop   the last STOP_BARS of them had no note played by the learner at all:
 *            no expected note hit and no key down while the clock was in the bar.
 *     slow   the last JUDGE_BARS of them: at least STRUGGLE_MISSED of their expected
 *            notes were missed, pooled — and none of those bars was clean (one bad
 *            bar beside a clean one is one bad bar: nothing), the newest was not
 *            silent (that may be a stop under way: it is never also a drop), and
 *            MIN_BARS_BETWEEN_DROPS bars have been played since the last drop.
 *   'stop' wins over 'slow'. A note still inside its hit window at the barline is
 *   neither hit nor missed yet: it is expected, not missed, so the judge never
 *   drops on a note that may still come.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-steady.js').then(m => m.selfTest())"
 */

/** Every threshold of "Band slows down for me". player.js reads them at use, so a console / test may change one. */
const STEADY = {
  JUDGE_BARS: 2,               // struggling is read over this many bars that had expected notes
  STRUGGLE_MISSED: 0.5,        // …when at least this share of their expected notes was missed
  STOP_BARS: 2,                // stopped: this many bars with expected notes in a row with no note played at all
  GRACE_BARS: 1,               // bars after a start or a resume that are not judged
  DROP_PCT: 10,                // one notch: points on the tempo slider's percentage (100 % → 90 %)
  FLOOR_PCT: 50,               // never slowed below this percentage
  MIN_BARS_BETWEEN_DROPS: 4,   // bars played between one drop and the next
  EASE_BARS: 1,                // a drop is eased in over this many bars (at the tempo it leaves)
  EASE_STEPS: 10,              // …in this many equal steps (never finer than a slider point)
  MESSAGE_MS: 4000,            // "slowed to 90% to keep it steady" stays on the status line this long
};

/** The slider percentage one notch below `pct`, or null when there is no room above the floor. */
function nextPct(pct, config = STEADY) {
  const from = Number(pct);
  if (!Number.isFinite(from) || from <= config.FLOOR_PCT) return null;
  return Math.max(config.FLOOR_PCT, from - config.DROP_PCT);
}

/** The whole percentages from `fromPct` down to `toPct`, EASE_STEPS of them at most, the last one `toPct` exactly. */
function easeSteps(fromPct, toPct, config = STEADY) {
  const n = Math.max(1, Math.min(Math.round(config.EASE_STEPS) || 1, Math.round(Math.abs(fromPct - toPct)) || 1));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const pct = i === n ? toPct : Math.round(fromPct + (toPct - fromPct) * i / n);
    if (pct !== out[out.length - 1]) out.push(pct);
  }
  return out;
}

function createSteadyJudge(config = STEADY) {
  let bars = [];              // { key, grace, expected, hits, missed, keys } in played order; the last one is under way
  let byKey = new Map();
  let grace = config.GRACE_BARS;
  let sinceDrop = Infinity;   // bars played since the last drop
  let opening = true;         // the next barline opens a run (a start or a resume): no bar has been played before it

  const silent = b => b.hits === 0 && b.keys === 0;
  const of = key => byKey.get(key) || null;
  const bump = (key, field) => { const b = of(key); if (b) b[field] += 1; return !!b; };

  function judge() {
    const judged = bars.filter(b => !b.grace && b.expected > 0);
    const stopWin = judged.slice(-config.STOP_BARS);
    if (stopWin.length >= config.STOP_BARS && stopWin.every(silent)) return { action: 'stop', bars: stopWin };
    const win = judged.slice(-config.JUDGE_BARS);
    if (win.length < config.JUDGE_BARS) return { action: 'none', bars: win };
    const expected = win.reduce((n, b) => n + b.expected, 0), missed = win.reduce((n, b) => n + b.missed, 0);
    const struggling = missed / expected >= config.STRUGGLE_MISSED && win.every(b => b.missed > 0) && !silent(win[win.length - 1]);
    return { action: struggling && sinceDrop >= config.MIN_BARS_BETWEEN_DROPS ? 'slow' : 'none', bars: win };
  }

  return {
    reset() { bars = []; byKey = new Map(); grace = config.GRACE_BARS; opening = true; },
    clear() { this.reset(); sinceDrop = Infinity; },
    barline(key) {
      if (!opening) sinceDrop += 1;
      opening = false;
      const verdict = judge();
      const bar = { key, grace: grace > 0, expected: 0, hits: 0, missed: 0, keys: 0 };
      if (grace > 0) grace -= 1;
      bars.push(bar); byKey.set(key, bar);
      return { action: verdict.action, bars: verdict.bars.map(b => ({ ...b })) };
    },
    expected: key => bump(key, 'expected'),
    hit: key => bump(key, 'hits'),
    missed: key => bump(key, 'missed'),
    key: key => bump(key, 'keys'),
    slowed() { sinceDrop = 0; },
    bars: () => bars.map(b => ({ ...b })),
  };
}

export { STEADY, createSteadyJudge, nextPct, easeSteps, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════

function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  console.log('\n─── player-steady.js self-test ───\n');

  /**
   * Play bars through a judge. Each bar is [expected, hits, extraKeys = 0]: the rest of the expected notes
   * are missed; every hit is also a key down. Returns the action at the barline that ENDS each bar.
   */
  const run = (list, judge = createSteadyJudge()) => {
    const out = [];
    list.forEach(([expected, hits, extra = 0], i) => {
      const key = `1:${i}`;
      if (i === 0) judge.barline(key);
      for (let n = 0; n < expected; n++) judge.expected(key);
      for (let n = 0; n < hits; n++) { judge.hit(key); judge.key(key); }
      for (let n = 0; n < expected - hits; n++) judge.missed(key);
      for (let n = 0; n < extra; n++) judge.key(key);
      const v = judge.barline(`1:${i + 1}`);
      if (v.action === 'slow') judge.slowed();
      out.push(v.action);
    });
    return out;
  };
  const CLEAN = [4, 4], BAD = [4, 1], REST = [0, 0], SILENT = [4, 0];

  // ── struggling ──────────────────────────────────────────────────
  assert('a clean run: nothing, ever', run([CLEAN, CLEAN, CLEAN, CLEAN, CLEAN]), ['none', 'none', 'none', 'none', 'none']);
  assert('one missed note does nothing', run([CLEAN, [4, 3], CLEAN, CLEAN]), ['none', 'none', 'none', 'none']);
  assert('one bad bar does nothing — not even a wholly missed one beside a clean one (half the pool)', run([CLEAN, CLEAN, [4, 0, 1], CLEAN, CLEAN]), ['none', 'none', 'none', 'none', 'none']);
  assert('two bad bars: slow at the barline that ends the second', run([CLEAN, BAD, BAD]), ['none', 'none', 'slow']);
  assert('exactly half missed over the two bars, a miss in each: slow', run([CLEAN, [4, 3], [4, 1]]), ['none', 'none', 'slow']);
  assert('under half: nothing', run([CLEAN, [4, 3], [4, 2]]), ['none', 'none', 'none']);
  assert('the first bar after a start is not judged: two bad bars from the start drop one bar later', run([BAD, BAD, BAD]), ['none', 'none', 'slow']);
  assert('at least four bars between drops: the next one comes at the fourth barline after', run([CLEAN, BAD, BAD, BAD, BAD, BAD, BAD, BAD, BAD]), ['none', 'none', 'slow', 'none', 'none', 'none', 'slow', 'none', 'none']);
  assert('rest bars count for neither: bad, rest, rest, bad is two bad bars', run([CLEAN, BAD, REST, REST, BAD]), ['none', 'none', 'none', 'none', 'slow']);
  assert('…and a clean bar is not hidden by the rests after it', run([CLEAN, BAD, CLEAN, REST, REST]), ['none', 'none', 'none', 'none', 'none']);
  {
    const j = createSteadyJudge();
    j.barline('a'); j.barline('b');
    for (let i = 0; i < 4; i++) j.expected('b');
    j.missed('b'); j.missed('b'); j.hit('b'); j.key('b');   // the fourth is still inside its window
    j.barline('c');
    for (let i = 0; i < 4; i++) j.expected('c');
    j.missed('c'); j.hit('c'); j.key('c');                   // two still pending
    assert('a note still inside its window is expected but not missed: 3 of 8 so far, nothing', j.barline('d').action, 'none');
    j.missed('c');                                           // …and one of them is given up on after the barline
    assert('the count stays live: at the next barline that bar reads 2 of 4', j.barline('e').bars.filter(b => b.key === 'c').map(b => [b.expected, b.missed]), [[4, 2]]);
    assert('a count for a bar the judge never saw is refused', [j.expected('zz'), j.hit('zz'), j.missed('zz'), j.key('zz')], [false, false, false, false]);
  }

  // ── stopped ─────────────────────────────────────────────────────
  assert('two silent bars in a row: stop', run([CLEAN, CLEAN, SILENT, SILENT]), ['none', 'none', 'none', 'stop']);
  assert('one silent bar is nothing, and it is never a drop either — even after a bar with a miss', run([CLEAN, [4, 3], SILENT, CLEAN]), ['none', 'none', 'none', 'none']);
  assert('stop wins over slow: a bad bar, then silence, is a stop and no drop', run([CLEAN, BAD, SILENT, SILENT]), ['none', 'none', 'none', 'stop']);
  assert('a key down in the bar — any key, nothing hit — is not silence: bad bars, a drop', run([CLEAN, [4, 0, 1], [4, 0, 1]]), ['none', 'none', 'slow']);
  assert('silent from the start: the first bar is not judged, stop after the third', run([SILENT, SILENT, SILENT]), ['none', 'none', 'stop']);
  assert('rests are never silence: any number of them, no stop', run([CLEAN, CLEAN, REST, REST, REST, REST]), ['none', 'none', 'none', 'none', 'none', 'none']);
  assert('…and two silent bars either side of a rest are two in a row', run([CLEAN, CLEAN, SILENT, REST, SILENT]), ['none', 'none', 'none', 'none', 'stop']);
  assert('playing again after one silent bar: with a miss in it, the two bars pool to a drop', run([CLEAN, CLEAN, SILENT, [4, 3]]), ['none', 'none', 'none', 'slow']);

  // ── reset / clear ───────────────────────────────────────────────
  {
    const j = createSteadyJudge();
    run([CLEAN, CLEAN, SILENT], j);
    j.reset();
    assert('reset (a resume): the silent bar before it is forgotten, the first bar is grace — stop only after two more', run([SILENT, SILENT, SILENT], j), ['none', 'none', 'stop']);
    const k = createSteadyJudge();
    run([CLEAN, BAD, BAD], k);          // a drop at the last barline
    k.reset();
    assert('reset keeps the gap since the last drop: bad bars straight after a resume drop at the fourth barline, not the third', run([BAD, BAD, BAD, BAD], k), ['none', 'none', 'none', 'slow']);
    k.clear();
    assert('clear forgets the last drop too', run([BAD, BAD, BAD], k), ['none', 'none', 'slow']);
  }

  // ── the notch and the ease ──────────────────────────────────────
  assert('one notch is 10 points; 50 is the floor', [100, 90, 64, 55, 51, 50, 40, 200].map(p => nextPct(p)), [90, 80, 54, 50, 50, null, null, 190]);
  assert('nextPct refuses nonsense', [nextPct('x'), nextPct(NaN)], [null, null]);
  assert('the ease: ten whole points down, ending on the target', easeSteps(100, 90), [99, 98, 97, 96, 95, 94, 93, 92, 91, 90]);
  assert('a short notch (55 → 50) is five steps; one point is one step', [easeSteps(55, 50), easeSteps(51, 50)], [[54, 53, 52, 51, 50], [50]]);
  assert('fewer steps than points: still whole, still ending on the target', easeSteps(100, 90, { ...STEADY, EASE_STEPS: 4 }), [98, 95, 93, 90]);
  assert('a custom config is honoured (three bars, a third missed)', run([CLEAN, [3, 2], [3, 2], [3, 2]], createSteadyJudge({ ...STEADY, JUDGE_BARS: 3, STRUGGLE_MISSED: 1 / 3 })), ['none', 'none', 'none', 'slow']);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
