/**
 * player-steady.js
 * ================
 * "Band slows down for me": the judge behind play-along's steady-rhythm
 * rule. It keeps a running steadiness score S (0…1) from the learner's
 * hits and misses; the band's tempo (the clock: guide, accompaniment,
 * click, drums) follows that score gradually, down and back up, as a
 * share of the learner's chosen speed, and the band stops when the
 * learner stops. Pure logic — no DOM, no audio, no clock; Node-runnable.
 * player.js feeds it what the timing log (player-playalong.js) says about
 * each expected note and asks for a verdict at every barline.
 *
 *   STEADY                      every threshold, in one place (below)
 *   createSteadyJudge(config = STEADY) → judge
 *     clear()                   a start (another piece, the box ticked): nothing is remembered,
 *                               S is 1 again, and the next GRACE_BARS bars are not judged
 *     reset({ comfort })        a resume from a pause: the bars so far are forgotten and the next
 *                               GRACE_BARS bars are not judged, but S is kept. `comfort: true` (a
 *                               resume after the band stopped by itself): an S below COMFORT is put
 *                               at COMFORT, so the band does not go on slowing while the learner
 *                               plays cleanly again; the tempo comes back at the usual rate.
 *     barline(key) → { action: 'hold' | 'follow' | 'stop', score, reason, ended }
 *         the clock reaches the barline that opens bar `key` (any string naming one
 *         played bar: pass + seq). The bars before it are judged first, then `key`
 *         becomes the bar under way. `score` is S at this barline. 'follow': the bar
 *         that ended had expected notes, so the tempo may move toward what S asks for
 *         (desiredPct, stepPct — the page does that). 'hold': the tempo stays where it
 *         is; `reason` says why ('grace bar', 'no expected notes', 'nothing played').
 *         'stop': see below.
 *         `ended`: the bar that has just ended, as the judge saw it (null at a run's
 *         first barline) — for the dev panel's readout (player-dev.js).
 *     expected(key) / hit(key) / missed(key)
 *         a note the learner should play in bar `key` was registered / paired with a
 *         played note / given up on. A hit moves S toward 1 and a miss moves it toward
 *         0 — an exponential moving average with a half-life of HALF_LIFE_NOTES notes —
 *         whenever the timing log decides the note, the bar ended or not. Notes of a
 *         grace bar are tallied but do not move S. Nor do the misses of a bar in which
 *         the learner played nothing: a bar's misses are held back until something is
 *         played in it (a hit on one of its notes, or a key down in it), and if nothing
 *         ever is, S stays where it was for that bar and the tempo holds at its barline.
 *     key(key, own = true)      a key went down while the clock was in bar `key` (any pitch).
 *                               `own: false`: it was a hit on ANOTHER bar's note (the next
 *                               downbeat struck a little early) — still a key down for the stop
 *                               rule, but not something played in this bar for the score.
 *     score()                   S now
 *     bars()                    the bars so far, oldest first (debug)
 *   desiredPct(score, config = STEADY) → the tempo S asks for, as a percentage of the target
 *         (the tempo slider's value): 100 at or above COMFORT, falling linearly to
 *         FLOOR × 100 as S falls to BOTTOM, the floor below that. Not rounded.
 *   stepPct(currentPct, desired, config = STEADY) → the whole percentage to be at after this
 *         barline: toward `desired` by whole points, at most MAX_SLOWER_PER_BAR down or
 *         MAX_FASTER_PER_BAR up; a difference of less than one point is ignored.
 *   easeSteps(fromPct, toPct, config = STEADY) → [pct, …] the whole percentages on the way, last = toPct
 *
 *   The stop, at a barline, over the bars that HAD expected notes for the learner
 *   (rests and the other hand's bars count for neither; grace bars are left out):
 *   the last STOP_BARS of them had no note played by the learner at all — no expected
 *   note hit and no key down while the clock was in the bar. 'stop' wins: the tempo
 *   is not moved at that barline.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-steady.js').then(m => m.selfTest())"
 */

/** Every threshold of "Band slows down for me". player.js and the judge read them at use, so a console, a test or the dev panel (player-dev.js, ?dev=1) may change one mid-run. */
const STEADY = {
  HALF_LIFE_NOTES: 12,         // the score's memory: after this many notes an old note counts half
  COMFORT: 0.8,                // at or above this score the band plays at the learner's speed
  BOTTOM: 0.35,                // at or below this score the band is at the floor; in between, in proportion
  FLOOR: 0.5,                  // the slowest the band goes, as a share of the learner's speed
  MAX_SLOWER_PER_BAR: 5,       // points (percent of the learner's speed) the band may slow at one barline
  MAX_FASTER_PER_BAR: 3,       // …and may speed up
  STOP_BARS: 2,                // stopped: this many bars with expected notes in a row with no note played at all
  GRACE_BARS: 1,               // bars after a start or a resume whose notes do not count
  EASE_BARS: 1,                // a tempo change is eased in over this many bars (at the tempo it leaves)
  EASE_STEPS: 10,              // …in this many equal steps (never finer than a point)
  PILL_MS: 2500,               // "Easing off" / "Back to your speed" hold over the staff this long before they fade
};

const EPS = 1e-9;

/** The tempo the score asks for, as a percentage of the target. */
function desiredPct(score, config = STEADY) {
  const floor = Math.min(1, Math.max(0, Number(config.FLOOR) || 0)) * 100;
  const s = Number(score);
  if (!Number.isFinite(s) || s >= config.COMFORT) return 100;
  if (s <= config.BOTTOM || config.COMFORT <= config.BOTTOM) return floor;
  return floor + (100 - floor) * (s - config.BOTTOM) / (config.COMFORT - config.BOTTOM);
}

/** One barline's move from `currentPct` toward `desired`: whole points, inside the per-bar limit for its direction; under one point of difference, none. */
function stepPct(currentPct, desired, config = STEADY) {
  const diff = Number(desired) - currentPct;
  if (!Number.isFinite(diff) || Math.abs(diff) < 1 - EPS) return currentPct;
  const limit = Number(diff < 0 ? config.MAX_SLOWER_PER_BAR : config.MAX_FASTER_PER_BAR) || 0;
  const points = Math.min(Math.floor(limit + EPS), Math.floor(Math.abs(diff) + EPS));
  return points >= 1 ? currentPct + Math.sign(diff) * points : currentPct;
}

/** The whole percentages from `fromPct` to `toPct` (down or up), EASE_STEPS of them at most, the last one `toPct` exactly. */
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
  let bars = [];              // { key, grace, expected, hits, missed, keys, played, held } in played order; the last one is under way. played: something was played in it (for the score); held: its misses not yet fed into S
  let byKey = new Map();
  let grace = config.GRACE_BARS;
  let score = 1;              // S

  const silent = b => b.hits === 0 && b.keys === 0;
  const bump = (key, field) => { const b = byKey.get(key); if (b) b[field] += 1; return b || null; };
  /** How far one note moves S toward its end of the scale. */
  const weight = () => { const h = Number(config.HALF_LIFE_NOTES); return h > 0 ? 1 - Math.pow(0.5, 1 / h) : 1; };
  const miss = () => { score -= score * weight(); };
  /** Something was played in the bar: the misses held back so far count now, and its later ones at once. */
  const played = b => { b.played = true; for (; b.held > 0; b.held -= 1) miss(); };

  return {
    reset({ comfort = false } = {}) {
      bars = []; byKey = new Map(); grace = config.GRACE_BARS;
      if (comfort && score < config.COMFORT) score = Math.min(1, Number(config.COMFORT) || 0);
    },
    clear() { this.reset(); score = 1; },
    barline(key) {
      const ended = bars.length ? { ...bars[bars.length - 1] } : null;
      const judged = bars.filter(b => !b.grace && b.expected > 0);
      const stopWin = judged.slice(-config.STOP_BARS);
      let action = 'hold', reason = '';
      if (stopWin.length >= config.STOP_BARS && stopWin.every(silent)) { action = 'stop'; reason = `${stopWin.length} silent bar${stopWin.length === 1 ? '' : 's'}`; }
      else if (!ended) reason = 'first barline';
      else if (ended.grace) reason = 'grace bar';
      else if (ended.expected === 0) reason = 'no expected notes';
      else if (!ended.played) reason = 'nothing played';
      else action = 'follow';
      const bar = { key, grace: grace > 0, expected: 0, hits: 0, missed: 0, keys: 0, played: false, held: 0 };
      if (grace > 0) grace -= 1;
      bars.push(bar); byKey.set(key, bar);
      return { action, score, reason, ended };
    },
    expected: key => !!bump(key, 'expected'),
    hit(key) { const b = bump(key, 'hits'); if (b) { played(b); if (!b.grace) score += (1 - score) * weight(); } return !!b; },
    missed(key) { const b = bump(key, 'missed'); if (b && !b.grace) { if (b.played) miss(); else b.held += 1; } return !!b; },
    key(key, own = true) { const b = bump(key, 'keys'); if (b && own) played(b); return !!b; },
    score: () => score,
    bars: () => bars.map(b => ({ ...b })),
  };
}

export { STEADY, createSteadyJudge, desiredPct, stepPct, easeSteps, selfTest };

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
   * Play bars through a judge as the page does. Each bar is [expected, hits, extraKeys = 0]: the hits come first,
   * the rest of the expected notes are missed; every hit is also a key down. Returns, for the barline that ENDS
   * each bar, 'stop' or the band's percentage after it (it starts at `pct`).
   */
  const run = (list, { judge = createSteadyJudge(), config = STEADY, pct = 100 } = {}) => {
    const out = [];
    list.forEach(([expected, hits, extra = 0], i) => {
      const key = `${run.n}:${i}`;
      if (i === 0) judge.barline(key);
      for (let n = 0; n < expected; n++) judge.expected(key);
      for (let n = 0; n < hits; n++) { judge.hit(key); judge.key(key); }
      for (let n = 0; n < expected - hits; n++) judge.missed(key);
      for (let n = 0; n < extra; n++) judge.key(key);
      const v = judge.barline(`${run.n}:${i + 1}`);
      if (v.action === 'follow') pct = stepPct(pct, desiredPct(v.score, config), config);
      out.push(v.action === 'stop' ? 'stop' : pct);
    });
    run.n += 1;
    return out;
  };
  run.n = 1;
  const CLEAN = [4, 4], BAD = [4, 1], REST = [0, 0], SILENT = [4, 0];
  const r3 = x => Math.round(x * 1000) / 1000;

  // ── the score ───────────────────────────────────────────────────
  {
    const j = createSteadyJudge();
    j.barline('g'); j.expected('g'); j.missed('g');
    assert('S starts at 1, and a grace bar\'s notes do not move it', [j.score(), j.bars()[0].missed], [1, 1]);
    j.barline('a'); j.key('a');
    for (let i = 0; i < 12; i++) { j.expected('a'); j.missed('a'); }
    assert('twelve misses (the half-life) halve it', r3(j.score()), 0.5);
    for (let i = 0; i < 12; i++) { j.expected('a'); j.hit('a'); }
    assert('twelve hits take it half-way back to 1', r3(j.score()), 0.75);
    j.barline('b');
    j.missed('a');
    assert('a late verdict on a note of a bar that has ended still counts', r3(j.score()), r3(0.75 * Math.pow(0.5, 1 / 12)));
    assert('a count for a bar the judge never saw is refused, and S stays', [j.expected('zz'), j.hit('zz'), j.missed('zz'), j.key('zz'), r3(j.score())], [false, false, false, false, r3(0.75 * Math.pow(0.5, 1 / 12))]);
    const s = j.score();
    j.reset();
    assert('reset (a resume) keeps S; clear (a start) puts it back to 1', [j.score() === s, (j.clear(), j.score())], [true, 1]);
    const quick = createSteadyJudge({ ...STEADY, HALF_LIFE_NOTES: 1, GRACE_BARS: 0 });
    quick.barline('a'); quick.key('a'); quick.expected('a'); quick.missed('a');
    assert('a custom half-life is honoured (one note: one miss halves it)', quick.score(), 0.5);
  }

  // ── tempo from score ────────────────────────────────────────────
  assert('desired: 100 at and above the comfort level, the floor at and below the bottom, a straight line between', [1, 0.8, 0.575, 0.35, 0.1, 0].map(s => r3(desiredPct(s))), [100, 100, 75, 50, 50, 50]);
  assert('desired honours a custom floor and levels', [0.9, 0.7, 0.5].map(s => r3(desiredPct(s, { ...STEADY, COMFORT: 0.9, BOTTOM: 0.5, FLOOR: 0.6 }))), [100, 80, 60]);
  assert('a step is whole points, at most 5 down and 3 up', [stepPct(100, 80), stepPct(100, 97.6), stepPct(80, 100), stepPct(80, 82.9), stepPct(98, 100)], [95, 98, 83, 82, 100]);
  assert('a difference under one point is ignored, either way', [stepPct(100, 99.3), stepPct(90, 90.9), stepPct(90, 89.01), stepPct(90, 89)], [100, 90, 90, 89]);
  assert('a limit of 0 never moves that way; nonsense is no move', [stepPct(100, 60, { ...STEADY, MAX_SLOWER_PER_BAR: 0 }), stepPct(60, 100, { ...STEADY, MAX_FASTER_PER_BAR: 0 }), stepPct(90, NaN)], [100, 60, 90]);
  assert('the ease: whole points on the way, ending on the target, down or up', [easeSteps(100, 95), easeSteps(92, 95), easeSteps(99, 100)], [[99, 98, 97, 96, 95], [93, 94, 95], [100]]);
  assert('fewer steps than points: still whole, still ending on the target', easeSteps(100, 90, { ...STEADY, EASE_STEPS: 4 }), [98, 95, 93, 90]);

  // ── the band following the learner ──────────────────────────────
  assert('a clean run stays at the target', run([CLEAN, CLEAN, CLEAN, CLEAN]), [100, 100, 100, 100]);
  assert('an isolated miss, even a bad bar on its own, is absorbed by the comfort zone', run([CLEAN, [4, 3], CLEAN, BAD, CLEAN, CLEAN]), [100, 100, 100, 100, 100, 100]);
  assert('bad bars: nothing after the first, then down by at most 5 a bar', run([CLEAN, BAD, BAD, BAD, BAD]), [100, 100, 95, 90, 85]);
  assert('…and clean playing brings it back by at most 3 a bar, to the target and no higher (it lags the score both ways)', run([CLEAN, BAD, BAD, BAD, CLEAN, CLEAN, CLEAN, CLEAN, CLEAN, CLEAN, CLEAN, CLEAN]), [100, 100, 95, 90, 89, 92, 95, 98, 100, 100, 100, 100]);
  assert('bad for long enough: the floor, and no lower', run(Array(16).fill(BAD)).slice(-3), [50, 50, 50]);
  assert('a bar with no expected notes leaves the tempo where it is, though the score asks for less', run([CLEAN, BAD, BAD, REST, REST, BAD]), [100, 100, 95, 95, 95, 90]);
  assert('the grace bar does not count: bad from the start drops one bar later', run([BAD, BAD, BAD, BAD]), [100, 100, 95, 90]);

  // ── a bar with nothing played ───────────────────────────────────
  assert('a bar in which nothing was played holds the tempo, though the score asks for less; the bad bar after it moves it again', run([CLEAN, BAD, BAD, SILENT, BAD]), [100, 100, 95, 95, 90]);
  {
    const j = createSteadyJudge(), same = createSteadyJudge();
    run([CLEAN, BAD, BAD], { judge: same });
    run([CLEAN, BAD, BAD, SILENT], { judge: j });
    assert('…and its misses do not feed the score: S is where it was before the bar, with the four misses tallied', [j.score() === same.score(), j.score() < 1, j.bars().slice(-2)[0].missed], [true, true, 4]);
    const k = createSteadyJudge({ ...STEADY, GRACE_BARS: 0 });
    k.barline('a');
    for (let i = 0; i < 3; i++) { k.expected('a'); k.missed('a'); }
    assert('misses are held back while nothing has been played in the bar', k.score(), 1);
    k.key('a', false);
    assert('a key down that hit another bar\'s note (the next downbeat, early) is not something played in this bar', [k.score(), k.bars()[0].keys], [1, 1]);
    k.key('a');
    assert('a key down in the bar: the held misses count now, and later ones at once', [r3(k.score()), (k.missed('a'), r3(k.score()))], [r3(Math.pow(0.5, 3 / 12)), r3(Math.pow(0.5, 4 / 12))]);
    const h = createSteadyJudge({ ...STEADY, GRACE_BARS: 0 });
    h.barline('a'); h.expected('a'); h.missed('a'); h.barline('b'); h.hit('a');
    assert('a late hit on a bar\'s own note counts as played too: its held miss, then the hit', r3(h.score()), r3(1 - (1 - Math.pow(0.5, 1 / 12)) * Math.pow(0.5, 1 / 12)));
  }
  assert('a bar with a key down but nothing hit still counts its misses', run([CLEAN, [4, 0, 1], [4, 0, 1]]), [100, 100, 95]);

  // ── stopped ─────────────────────────────────────────────────────
  assert('two silent bars in a row: stop, and no tempo move at that barline', run([CLEAN, CLEAN, SILENT, SILENT]), [100, 100, 100, 'stop']);
  assert('a key down in the bar — any key, nothing hit — is not silence: no stop', run([CLEAN, CLEAN, [4, 0, 1], [4, 0, 1]]).includes('stop'), false);
  assert('silent from the start: the first bar is not judged, stop after the third', run([SILENT, SILENT, SILENT]), [100, 100, 'stop']);
  assert('rests are never silence: any number of them, no stop', run([CLEAN, CLEAN, REST, REST, REST, REST]), [100, 100, 100, 100, 100, 100]);
  assert('…and two silent bars either side of a rest are two in a row', run([CLEAN, CLEAN, SILENT, REST, SILENT]), [100, 100, 100, 100, 'stop']);
  {
    const j = createSteadyJudge();
    run([CLEAN, CLEAN, SILENT], { judge: j });
    j.reset();
    assert('reset (a resume): the silent bar before it is forgotten, the first bar is grace — stop only after two more', run([SILENT, SILENT, SILENT], { judge: j }), [100, 100, 'stop']);
    const k = createSteadyJudge();
    const before = run([CLEAN, BAD, BAD, BAD, SILENT, SILENT], { judge: k });
    const low = k.score();
    k.reset({ comfort: true });
    assert('a resume after the band stopped by itself: a score below the comfort level is put at it', [before.slice(-3), low < STEADY.COMFORT, k.score()], [[90, 90, 'stop'], true, STEADY.COMFORT]);
    assert('…so clean playing brings the tempo straight back, 3 points a bar (the first bar is grace)', run([CLEAN, CLEAN, CLEAN, CLEAN, CLEAN], { judge: k, pct: 90 }), [90, 93, 96, 99, 100]);
    const m = createSteadyJudge();
    run([CLEAN, BAD, BAD, BAD], { judge: m });
    const kept = m.score();
    m.reset();
    assert('a resume after a pause the learner chose keeps the score as it was: the tempo still follows it down first', [m.score() === kept, run([CLEAN, CLEAN, CLEAN], { judge: m, pct: 90 })], [true, [90, 89, 92]]);
    const hi = createSteadyJudge();
    run([CLEAN, [4, 3], CLEAN], { judge: hi });
    const above = hi.score();
    hi.reset({ comfort: true });
    assert('a score already above the comfort level is left alone', [above > STEADY.COMFORT, hi.score() === above], [true, true]);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
