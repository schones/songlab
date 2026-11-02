/**
 * meter-rules.js
 * ==============
 * Meter-aware duration splitting and beaming for the follow-along player's
 * staff (player-staff-model.js) — pure functions, no DOM, Node-runnable. The
 * same rules are to be mirrored in tools/pieces/meter_rules.py for the review
 * page; tests/fixtures/meter-rules-cases.json is the shared case file both
 * self-tests load, so the two cannot drift silently.
 *
 *   meterLevels(time, beatsPerBar) → grid
 *       { ok, meter, bar, units, levels, beatLevel, beam8, beam16, beamWhole, offbeatAcrossBeat, warning }
 *       levels[0] = [0] (the bar start); levels[k] = every multiple of units[k-1]
 *       in [0, bar), so each level contains the coarser ones. Known meters
 *       (2/2, 2/4, 3/4, 4/4, 6/8) come from METERS; anything else, or a
 *       beatsPerBar that disagrees with the meter, falls back to 1-quarter
 *       beats with no half-bar level and sets `warning` (ok = false).
 *   splitDur(quarters) → [{ q, dur, dots }]
 *       greedy longest-first, onset-blind (the inner "written values" step).
 *   splitSpan(on, dur, grid, { strict, syncopation }) → [{ at, q, dur, dots }]
 *       beat-aware: a span is one written value when it is in the duration
 *       table and starts on a point at least as strong as anything it crosses,
 *       or (notes only, not `strict`) starts one level below the single point
 *       it crosses — the displaced beat — where the meter allows it. With
 *       syncopation 'beats' (default) a note that starts off the beat never
 *       crosses a beat-level point, so the displaced beat survives only below
 *       the beat (𝅘𝅥𝅯 ♪ 𝅘𝅥𝅯 inside a beat; ♪ ♩ ♪ inside a 2/2 or 6/8 beat) and
 *       3/4 1.5:1 is ♪⌒♪; with 'displaced' it is allowed at the beat too
 *       (♪ ♩ ♪, ♩ 𝅗𝅥 ♩ in 2/2) except across the 6/8 beat. Notes that start on
 *       a beat or stronger are unaffected (4/4 1:2 and 3/4 1:2 are one half).
 *       Otherwise a strong start takes the longest value first and recurses
 *       on the rest; a weak start splits at the first point of the coarsest
 *       crossed level and recurses on both halves. Rests use strict = true.
 *   beamRuns(pieces, grid) → [[index…]…]
 *       runs of two or more consecutive beamable pieces (q < 1: 8th/16th/32nd,
 *       dotted or not; not rest, not space) that lie inside one beam group.
 *       Groups are beam8 long (one beat; the half-note beat in 2/2); a run
 *       holding 16ths or 32nds regroups at beam16 (only differs in 2/2); a
 *       span of beamWhole (the half-bar in 4/4, the bar in 2/4 and 3/4) that
 *       is nothing but plain eighths beams as one group. Rests and spaces
 *       break runs; ties are invisible here.
 *   selfTest() → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/meter-rules.js').then(m => m.selfTest())"
 */

const EPS = 1e-6;   // norm values sit on a 0.125-quarter grid

// ════════════════════════════════════════════════════════════════════
// DURATION TABLE
// ════════════════════════════════════════════════════════════════════

/** [quarters, MEI @dur, dots] longest first. No tuplets: the norm grid is 1/32. */
const DUR_TABLE = [
  [6, '1', 1], [4, '1', 0], [3, '2', 1], [2, '2', 0], [1.5, '4', 1], [1, '4', 0],
  [0.75, '8', 1], [0.5, '8', 0], [0.375, '16', 1], [0.25, '16', 0], [0.125, '32', 0],
];

/** Quarters → [{ q, dur, dots }], greedy longest first; a remainder under 1/32 is dropped. */
function splitDur(quarters) {
  const out = [];
  let rem = quarters;
  while (rem > EPS) {
    const hit = DUR_TABLE.find(([v]) => v <= rem + EPS);
    if (!hit) break;
    out.push({ q: hit[0], dur: hit[1], dots: hit[2] });
    rem -= hit[0];
  }
  return out;
}

const oneValue = q => { const hit = DUR_TABLE.find(([v]) => Math.abs(v - q) < EPS); return hit ? { q: hit[0], dur: hit[1], dots: hit[2] } : null; };

// ════════════════════════════════════════════════════════════════════
// METERS
// ════════════════════════════════════════════════════════════════════

/**
 * Beat hierarchy per meter, in quarters. `units` are the sub-bar levels,
 * coarsest first, down to the 32nd; `beat` is the beat length (its level is
 * grid.beatLevel); beam8 / beam16 are the beam-group lengths for eighths and
 * for 16ths/32nds; beamWhole is the span that beams as one when it is all
 * plain eighths (null: never); offbeatAcrossBeat says whether, under
 * syncopation 'displaced', the exception may cross a level-1 point.
 */
const METERS = {
  '4/4': { bar: 4, units: [2, 1, 0.5, 0.25, 0.125], beat: 1,   beam8: 1,   beam16: 1,   beamWhole: 2,    offbeatAcrossBeat: true },
  '2/4': { bar: 2, units: [1, 0.5, 0.25, 0.125],    beat: 1,   beam8: 1,   beam16: 1,   beamWhole: 2,    offbeatAcrossBeat: true },
  '3/4': { bar: 3, units: [1, 0.5, 0.25, 0.125],    beat: 1,   beam8: 1,   beam16: 1,   beamWhole: 3,    offbeatAcrossBeat: true },
  '2/2': { bar: 4, units: [2, 1, 0.5, 0.25, 0.125], beat: 2,   beam8: 2,   beam16: 1,   beamWhole: null, offbeatAcrossBeat: true },
  '6/8': { bar: 3, units: [1.5, 0.5, 0.25, 0.125],  beat: 1.5, beam8: 1.5, beam16: 1.5, beamWhole: null, offbeatAcrossBeat: false },
};
const FALLBACK_UNITS = [1, 0.5, 0.25, 0.125];
const SYNCOPATIONS = ['beats', 'displaced'];

/** '3/4' → { count, unit }; null when unparseable. */
function parseTime(text) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text || '');
  return m ? { count: +m[1], unit: +m[2] } : null;
}

function pointsOf(unit, bar) {
  const pts = [];
  for (let k = 0; k * unit < bar - EPS; k++) pts.push(k * unit);
  return pts;
}

/**
 * @param {string} time          the norm's time signature, e.g. '3/4'
 * @param {number} [beatsPerBar] the norm's bar length in quarters, when it gives one
 */
function meterLevels(time, beatsPerBar) {
  const parsed = parseTime(time);
  const key = parsed ? `${parsed.count}/${parsed.unit}` : null;
  const def = key ? METERS[key] : null;
  const given = typeof beatsPerBar === 'number' && beatsPerBar > EPS ? beatsPerBar : null;
  let warning = null;
  if (!def) warning = `meter ${JSON.stringify(time)} has no beat table; splitting and beaming use 1-quarter beats`;
  else if (given != null && Math.abs(given - def.bar) > EPS) warning = `beatsPerBar ${given} overrides ${key} (${def.bar} q); splitting and beaming use 1-quarter beats`;
  const bar = given ?? (def ? def.bar : parsed ? parsed.count * 4 / parsed.unit : 4);
  const spec = warning ? { units: FALLBACK_UNITS, beat: 1, beam8: 1, beam16: 1, beamWhole: null, offbeatAcrossBeat: true } : def;
  const units = spec.units.filter(u => u < bar + EPS);
  return {
    ok: !warning, meter: warning ? null : key, bar, units,
    levels: [[0], ...units.map(u => pointsOf(u, bar))],
    beatLevel: Math.max(0, units.indexOf(spec.beat) + 1),
    beam8: spec.beam8, beam16: spec.beam16, beamWhole: spec.beamWhole, offbeatAcrossBeat: spec.offbeatAcrossBeat,
    warning,
  };
}

// ════════════════════════════════════════════════════════════════════
// SPLITTING
// ════════════════════════════════════════════════════════════════════

/**
 * @param {number} on     start, quarters from the bar start
 * @param {number} dur    length in quarters
 * @param {object} grid   from meterLevels
 * @param {{ strict?: boolean, syncopation?: 'beats' | 'displaced' }} [opts]
 *        strict: no displaced-beat exception at all (rests);
 *        syncopation: 'beats' (default) keeps the exception below the beat only,
 *        'displaced' allows it at the beat as well (♪ ♩ ♪, ♩ 𝅗𝅥 ♩ in 2/2)
 * @returns {{ at: number, q: number, dur: string, dots: number }[]}
 */
function splitSpan(on, dur, grid, opts = {}) {
  const strict = !!opts.strict;
  const displacedAtBeat = opts.syncopation === 'displaced';
  const levels = grid.levels;
  const out = [];
  const push = (at, d) => out.push({ at, q: d.q, dur: d.dur, dots: d.dots });
  const rec = (on, dur) => {
    if (dur <= EPS) return;
    const off = on + dur;
    const inside = k => levels[k].filter(p => p > on + EPS && p < off - EPS);
    const L = levels.findIndex(pts => pts.some(p => p > on + EPS && p < off - EPS));        // coarsest level crossed
    let s = levels.findIndex(pts => pts.some(p => Math.abs(p - on) < EPS));               // coarsest level holding the start
    if (s < 0) s = levels.length;                                                           // off-grid start: weaker than everything
    if (L < 0) { let c = on; for (const d of splitDur(dur)) { push(c, d); c += d.q; } return; }   // nothing crossed
    const one = oneValue(dur);
    if (one) {
      const strong = s <= L;
      const offBeatAcrossBeat = s > grid.beatLevel && L <= grid.beatLevel;     // starts off the beat, hides a beat
      const displaced = !strict && s === L + 1 && inside(L).length === 1
        && (grid.offbeatAcrossBeat || L !== 1) && (displacedAtBeat || !offBeatAcrossBeat);
      if (strong || displaced) { push(on, one); return; }
    }
    if (s <= L) {                                   // strong start: longest value first, then the rest
      const first = splitDur(dur)[0];
      if (!first) return;
      push(on, first);
      rec(on + first.q, dur - first.q);
      return;
    }
    const p = inside(L)[0];                         // weak start: show the first strong point crossed
    rec(on, p - on);
    rec(p, off - p);
  };
  rec(on, dur);
  return out;
}

// ════════════════════════════════════════════════════════════════════
// BEAMING
// ════════════════════════════════════════════════════════════════════

const beamable = p => !p.rest && !p.space && p.q > EPS && p.q < 1 - EPS;

/**
 * @param {{ at: number, q: number, rest?: boolean, space?: boolean }[]} pieces  one layer, in order
 * @param {object} grid  from meterLevels
 * @returns {number[][]}  runs of piece indices, each of length ≥ 2, in order
 */
function beamRuns(pieces, grid) {
  if (!pieces.length) return [];
  const within = (p, start, end) => p.at >= start - EPS && p.at + p.q <= end + EPS;
  const groups = [];
  if (grid.beamWhole) {
    for (let st = 0; st < grid.bar - EPS; st += grid.beamWhole) {
      const end = Math.min(st + grid.beamWhole, grid.bar);
      const inside = pieces.filter(p => within(p, st, end));
      const allPlain = inside.length >= 2 && inside.every(p => beamable(p) && Math.abs(p.q - 0.5) < EPS)
        && Math.abs(inside.reduce((s, p) => s + p.q, 0) - (end - st)) < EPS;
      if (allPlain) groups.push({ start: st, end, whole: true });
    }
  }
  for (let st = 0; st < grid.bar - EPS; st += grid.beam8) {
    const end = Math.min(st + grid.beam8, grid.bar);
    if (!groups.some(g => g.start <= st + EPS && g.end >= end - EPS)) groups.push({ start: st, end, whole: false });
  }
  const groupOf = p => (beamable(p) ? groups.findIndex(g => within(p, g.start, g.end)) : -1);

  // A run that holds 16ths or 32nds regroups at beam16 (2/2: per quarter inside the half-note beat).
  const refine = run => {
    const g = groups[groupOf(pieces[run[0]])];
    if (g.whole || grid.beam16 >= grid.beam8 - EPS || !run.some(i => pieces[i].q < 0.5 - EPS)) return [run];
    const sub = i => {
      const p = pieces[i];
      const k = Math.floor((p.at - g.start + EPS) / grid.beam16);
      return within(p, g.start + k * grid.beam16, g.start + (k + 1) * grid.beam16) ? k : -1;
    };
    const out = [];
    let cur = [];
    const flush = () => { if (cur.length >= 2) out.push(cur); cur = []; };
    for (const i of run) {
      const k = sub(i);
      if (k < 0) { flush(); continue; }
      if (cur.length && sub(cur[cur.length - 1]) !== k) flush();
      cur.push(i);
    }
    flush();
    return out;
  };

  const runs = [];
  let run = [];
  const flush = () => { if (run.length >= 2) runs.push(...refine(run)); run = []; };
  pieces.forEach((p, i) => {
    const g = groupOf(p);
    if (g < 0) { flush(); return; }
    if (run.length && groupOf(pieces[run[run.length - 1]]) !== g) flush();
    run.push(i);
  });
  flush();
  return runs;
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { DUR_TABLE, METERS, SYNCOPATIONS, parseTime, meterLevels, splitDur, splitSpan, beamRuns, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/player/meter-rules.js').then(m => m.selfTest())"
//
// Loads tests/fixtures/meter-rules-cases.json (Node only; the browser never
// runs this) and asserts every case, then a few grid-shape checks. The case
// file is the shared contract with the Python mirror.

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  console.log('\n─── meter-rules.js self-test ───\n');

  // ── Grid shapes ──────────────────────────────────────────────────
  const g44 = meterLevels('4/4', 4);
  assert('4/4: bar 4, levels bar / halves / beats / 8ths / 16ths / 32nds, beam per beat, half-bar eighth option', [g44.ok, g44.bar, g44.levels.slice(0, 3), g44.levels.length, g44.beam8, g44.beam16, g44.beamWhole, g44.warning], [true, 4, [[0], [0, 2], [0, 1, 2, 3]], 6, 1, 1, 2, null]);
  assert('beatLevel: 4/4 → 2 (quarters under the half-bar), 3/4 and 2/4 → 1, 2/2 → 1 (half-note beats), 6/8 → 1 (dotted quarters), fallback → 1', ['4/4', '3/4', '2/4', '2/2', '6/8', '7/8'].map(t => meterLevels(t).beatLevel), [2, 1, 1, 1, 1, 1]);
  const g68 = meterLevels('6/8');
  assert('6/8: bar 3, dotted-quarter beats, no offbeat exception across the beat', [g68.bar, g68.levels[1], g68.levels[2], g68.beam8, g68.offbeatAcrossBeat], [3, [0, 1.5], [0, 0.5, 1, 1.5, 2, 2.5], 1.5, false]);
  assert('2/2: 4/4 levels with half-note beam groups and 16ths per quarter', [meterLevels('2/2').levels[1], meterLevels('2/2').beam8, meterLevels('2/2').beam16, meterLevels('2/2').beamWhole], [[0, 2], 2, 1, null]);
  assert('3/4 with beatsPerBar 3 (the Carol norm) is not an override', [meterLevels('3/4', 3).ok, meterLevels('3/4', 3).warning], [true, null]);
  const g78 = meterLevels('7/8');
  assert('7/8: unknown meter → fallback, bar 3.5, 1-quarter beats, warning', [g78.ok, g78.bar, g78.levels[1], g78.beamWhole, typeof g78.warning], [false, 3.5, [0, 1, 2, 3], null, 'string']);
  const gov = meterLevels('4/4', 3);
  assert('4/4 with beatsPerBar 3 → fallback to a 3 q bar of 1-quarter beats, no half-bar level, warning', [gov.ok, gov.bar, gov.levels[1], gov.warning], [false, 3, [0, 1, 2], 'beatsPerBar 3 overrides 4/4 (4 q); splitting and beaming use 1-quarter beats']);
  assert('junk time → fallback 4 q bar with a warning', [meterLevels('fast').ok, meterLevels('fast').bar, meterLevels(undefined).bar], [false, 4, 4]);

  // ── The shared case file ─────────────────────────────────────────
  let cases = null;
  try {
    const fs = await import('node:fs');
    const path = new URL('../../tests/fixtures/meter-rules-cases.json', import.meta.url);
    cases = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) { console.log(`  ✗ tests/fixtures/meter-rules-cases.json not loadable (${e.message})`); results.push(false); }
  if (cases) {
    const grids = {};
    const gridFor = c => { const k = `${c.meter}|${c.beatsPerBar ?? ''}`; return grids[k] || (grids[k] = meterLevels(c.meter, c.beatsPerBar)); };
    for (const c of cases.split) {
      const grid = gridFor(c);
      const got = splitSpan(c.on, c.dur, grid, { strict: !!c.rest, syncopation: c.syncopation }).map(p => [p.at, p.q]);
      assert(`split ${c.group}: ${c.meter}${c.beatsPerBar != null ? ` (beatsPerBar ${c.beatsPerBar})` : ''}${c.syncopation ? ` [${c.syncopation}]` : ''} ${c.rest ? 'rest ' : ''}${c.on}:${c.dur} — ${c.label}`, got, c.pieces);
      if (c.fallback != null) assert(`split ${c.group}: ${c.meter} grid fallback = ${c.fallback}`, !grid.ok, c.fallback);
    }
    for (const c of cases.beam) {
      const grid = gridFor(c);
      const pieces = c.pieces.map(([at, q, kind]) => ({ at, q, rest: kind === 'rest', space: kind === 'space', notes: kind === 'chord' ? [1, 2] : kind === 'note' ? [1] : [] }));
      assert(`beam ${c.group}: ${c.meter} — ${c.label}`, beamRuns(pieces, grid), c.runs);
    }
    assert(`case file: ${cases.split.length} split cases and ${cases.beam.length} beam cases, every split keeps the span's length`,
      cases.split.every(c => Math.abs(c.pieces.reduce((s, [, q]) => s + q, 0) - c.dur) < EPS && Math.abs(c.pieces[0][0] - c.on) < EPS), true);
  }

  // ── splitSpan details the case file does not cover ───────────────
  assert('splitSpan: pieces carry MEI dur/dots (4/4 1.5:1.5 → 8th at 1.5, quarter at 2)', splitSpan(1.5, 1.5, g44), [{ at: 1.5, q: 0.5, dur: '8', dots: 0 }, { at: 2, q: 1, dur: '4', dots: 0 }]);
  assert('splitSpan: a remainder finer than 1/32 is dropped (sum < dur, like splitDur)', splitSpan(0, 0.3, g44).reduce((s, p) => s + p.q, 0), 0.25);
  assert('splitSpan: zero / negative length → nothing', [splitSpan(1, 0, g44), splitSpan(1, -1, g44)], [[], []]);
  const q = (on, dur, opts) => splitSpan(on, dur, g44, opts).map(p => [p.at, p.q]);
  assert('splitSpan syncopation: default = beats (♪ ♩ ♪ splits); displaced keeps the quarter; junk value behaves as beats; strict ignores both', [q(0.5, 1), q(0.5, 1, { syncopation: 'beats' }), q(0.5, 1, { syncopation: 'displaced' }), q(0.5, 1, { syncopation: 'x' }), q(0.5, 1, { strict: true, syncopation: 'displaced' })],
    [[[0.5, 0.5], [1, 0.5]], [[0.5, 0.5], [1, 0.5]], [[0.5, 1]], [[0.5, 0.5], [1, 0.5]], [[0.5, 0.5], [1, 0.5]]]);
  assert('splitSpan syncopation: 4/4 1:2 and 1:3 (start on a beat) are one value under both modes; 0.25:0.5 (below the beat) too', [q(1, 2), q(1, 3), q(0.25, 0.5), q(1, 2, { syncopation: 'displaced' })], [[[1, 2]], [[1, 3]], [[0.25, 0.5]], [[1, 2]]]);
  assert('splitDur unchanged: 2.5 → half + 8th, 1.75 → dotted quarter + 16th', [splitDur(2.5).map(d => d.q), splitDur(1.75).map(d => d.q)], [[2, 0.5], [1.5, 0.25]]);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
