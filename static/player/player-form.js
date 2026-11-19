/**
 * player-form.js
 * ==============
 * The played sequence of a piece: the order its written bars are PLAYED in
 * when repeats and jumps (D.S., To Coda, …) are followed. The norm keeps
 * bars as written and lists the playing order in form.playOrder
 * (tools/pieces/README.md); nothing is unrolled in the data. Pure logic, no
 * DOM, no audio; Node-runnable like player-listen.js.
 *
 * A position in the played order is a `seq`: a 0-based index into the
 * order. Run Rudolph Run has 36 written bars and 68 seqs; written bar 9 is
 * seq 8, 32 and 56.
 *
 *   playOrderOf(norm)              → [bar, …] | null
 *       form.playOrder when it is a non-empty list of bar numbers that all
 *       exist in norm.bars; null otherwise (no form: the piece plays as written).
 *   barNumbersOf(norm)             → the written bar numbers, ascending
 *   playedSequence(order, { fromSeq = 0, toSeq = last }) → [bar, …]
 *       the written bars of that seq range, in played order ([] when empty)
 *   barAtSeq(order, seq)           → the written bar at a seq, or null
 *   firstSeqOf(order, bar)         → the first seq a written bar is played at, or -1
 *   isJump(order, seq, bars)       → whether the move INTO `seq` is not "the next written
 *       bar" (bars: barNumbersOf): a repeat back, a D.S., a skip to the coda. seq 0 is never one.
 *   nextLineAt(order, seq, lineOf, { fromSeq = 0 }) → { line, seq, bar, jump } | null
 *       The line played after the line `seq` is on: the first played bar ahead
 *       that is on a different line (lineOf(bar) → line index), with its seq
 *       and `jump` (isJump needs bars: pass { bars }). null: nothing follows.
 *   prevLineAt(order, seq, lineOf, { fromSeq = 0 }) → { line, seq, bar } | null
 *       The line played before it: the last played bar behind, not before
 *       fromSeq (where the run began), that is on a different line.
 *   jumpLabel(target, { from, codas })  → '↩ bar 9' | '→ Coda' | '→ bar 21'
 *       A short name for a jump to written bar `target` from written bar
 *       `from`: the coda when `target` is one of `codas`, else back or ahead.
 *   selfTest()                     → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-form.js').then(m => m.selfTest())"
 */

const isBarNumber = x => typeof x === 'number' && Number.isFinite(x);

/** The written bar numbers of a norm, ascending. */
function barNumbersOf(norm) {
  return (Array.isArray(norm && norm.bars) ? norm.bars : []).map(b => b && b.bar).filter(isBarNumber).sort((a, b) => a - b);
}

/** form.playOrder when it is usable (non-empty, every entry a bar of the piece), else null. */
function playOrderOf(norm) {
  const order = norm && norm.form && norm.form.playOrder;
  if (!Array.isArray(order) || !order.length) return null;
  const have = new Set(barNumbersOf(norm));
  return order.every(b => isBarNumber(b) && have.has(b)) ? order.slice() : null;
}

function playedSequence(order, { fromSeq = 0, toSeq } = {}) {
  if (!Array.isArray(order)) return [];
  const a = Math.max(0, Math.floor(fromSeq) || 0);
  const b = Math.min(order.length - 1, toSeq == null ? order.length - 1 : Math.floor(toSeq));
  return b >= a ? order.slice(a, b + 1) : [];
}

const barAtSeq = (order, seq) => (Array.isArray(order) && Number.isInteger(seq) && seq >= 0 && seq < order.length ? order[seq] : null);
const firstSeqOf = (order, bar) => (Array.isArray(order) ? order.indexOf(bar) : -1);

/** Whether the move into `seq` leaves written order: order[seq] is not the bar written right after order[seq - 1]. */
function isJump(order, seq, bars) {
  if (!Array.isArray(order) || !(seq > 0) || seq >= order.length) return false;
  const i = Array.isArray(bars) ? bars.indexOf(order[seq - 1]) : -1;
  const successor = i >= 0 ? bars[i + 1] : order[seq - 1] + 1;
  return order[seq] !== successor;
}

function nextLineAt(order, seq, lineOf, { fromSeq = 0, bars = null } = {}) {
  const bar = barAtSeq(order, seq);
  if (bar == null || seq < fromSeq) return null;
  const here = lineOf(bar);
  for (let j = seq + 1; j < order.length; j++) {
    const line = lineOf(order[j]);
    if (line !== here) return { line, seq: j, bar: order[j], jump: isJump(order, j, bars) };
  }
  return null;
}

function prevLineAt(order, seq, lineOf, { fromSeq = 0 } = {}) {
  const bar = barAtSeq(order, seq);
  if (bar == null) return null;
  const here = lineOf(bar);
  for (let j = seq - 1; j >= Math.max(0, fromSeq); j--) {
    const line = lineOf(order[j]);
    if (line !== here) return { line, seq: j, bar: order[j] };
  }
  return null;
}

function jumpLabel(target, { from = null, codas = [] } = {}) {
  if (Array.isArray(codas) && codas.includes(target)) return '→ Coda';
  return from != null && target <= from ? `↩ bar ${target}` : `→ bar ${target}`;
}

export { playOrderOf, barNumbersOf, playedSequence, barAtSeq, firstSeqOf, isJump, nextLineAt, prevLineAt, jumpLabel, selfTest };

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
  const span = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  console.log('\n─── player-form.js self-test ───\n');

  // Run Rudolph Run's shape: 36 bars in lines of four; 1–32, 9–32, 9–16, 33–36.
  const ORDER = [...span(1, 32), ...span(9, 32), ...span(9, 16), ...span(33, 36)];
  const NORM = { bars: span(1, 36).map(bar => ({ bar })), lines: span(0, 8).map(i => 1 + 4 * i), form: { playOrder: ORDER }, marks: { coda: [33] } };
  const BARS = barNumbersOf(NORM);
  const lineOf = bar => Math.floor((bar - 1) / 4);

  // ── the order ───────────────────────────────────────────────────
  assert('playOrderOf: the norm\'s play order, 68 bars, a copy', [playOrderOf(NORM).length, playOrderOf(NORM) !== ORDER, playOrderOf(NORM)[32]], [68, true, 9]);
  assert('no form, an empty order, a bar the piece does not have, a non-number → null', [playOrderOf({ bars: NORM.bars }), playOrderOf({ ...NORM, form: { playOrder: [] } }), playOrderOf({ ...NORM, form: { playOrder: [1, 2, 99] } }), playOrderOf({ ...NORM, form: { playOrder: [1, '2'] } }), playOrderOf(null)], [null, null, null, null, null]);
  assert('barNumbersOf: ascending, whatever the file order', barNumbersOf({ bars: [{ bar: 16 }, { bar: 2 }, { bar: 15 }, {}] }), [2, 15, 16]);

  // ── a range of it, and looking bars up ──────────────────────────
  assert('playedSequence: the whole order by default; a seq range in played order', [playedSequence(ORDER).length, playedSequence(ORDER, { fromSeq: 30, toSeq: 34 }), playedSequence(ORDER, { fromSeq: 64 })], [68, [31, 32, 9, 10, 11], [33, 34, 35, 36]]);
  assert('…clamped to the order; an empty or reversed range → []', [playedSequence(ORDER, { fromSeq: 66, toSeq: 400 }), playedSequence(ORDER, { fromSeq: 9, toSeq: 3 }), playedSequence(null)], [[35, 36], [], []]);
  assert('barAtSeq: the written bar at a seq (bar 9 at 8, 32 and 56); null outside', [barAtSeq(ORDER, 0), barAtSeq(ORDER, 8), barAtSeq(ORDER, 32), barAtSeq(ORDER, 56), barAtSeq(ORDER, 67), barAtSeq(ORDER, 68), barAtSeq(ORDER, -1)], [1, 9, 9, 9, 36, null, null]);
  assert('firstSeqOf: the first time a bar is played; -1 when it never is', [firstSeqOf(ORDER, 1), firstSeqOf(ORDER, 9), firstSeqOf(ORDER, 20), firstSeqOf(ORDER, 33), firstSeqOf(ORDER, 40)], [0, 8, 19, 64, -1]);

  // ── jumps ───────────────────────────────────────────────────────
  assert('isJump: into bar 9 the first time no; the repeat back (seq 32, 56) and the coda (seq 64) yes; seq 0 never', [isJump(ORDER, 8, BARS), isJump(ORDER, 32, BARS), isJump(ORDER, 56, BARS), isJump(ORDER, 64, BARS), isJump(ORDER, 0, BARS), isJump(ORDER, 65, BARS)], [false, true, true, true, false, false]);
  assert('…bar numbers with a gap are not a jump when they are neighbours in the piece', [isJump([1, 2, 15, 16], 2, [1, 2, 15, 16]), isJump([1, 2, 15, 16], 2, null)], [false, true]);
  assert('jumpLabel: back, the coda, ahead', [jumpLabel(9, { from: 32, codas: [33] }), jumpLabel(33, { from: 16, codas: [33] }), jumpLabel(21, { from: 12 }), jumpLabel(9, { from: 9 })], ['↩ bar 9', '→ Coda', '→ bar 21', '↩ bar 9']);

  // ── the next line, by seq ───────────────────────────────────────
  const next = seq => { const n = nextLineAt(ORDER, seq, lineOf, { bars: BARS }); return n && [n.line, n.seq, n.bar, n.jump]; };
  assert('first time through: line k + 1 (from bar 1 → line 2 at bar 5; from bar 14 → bars 17–20)', [next(0), next(3), next(13)], [[1, 4, 5, false], [1, 4, 5, false], [4, 16, 17, false]]);
  assert('bars 29–32, first and second time: back to the line of bar 9, a jump', [next(28), next(31), next(52), next(55)], [[2, 32, 9, true], [2, 32, 9, true], [2, 56, 9, true], [2, 56, 9, true]]);
  assert('bars 13–16: bars 17–20 the first two times, the coda the third — the same line, a different next line', [next(12), next(36), next(60), next(63)], [[4, 16, 17, false], [4, 40, 17, false], [8, 64, 33, true], [8, 64, 33, true]]);
  assert('the coda line: nothing follows; a seq outside the order → null', [next(64), next(67), next(68)], [null, null, null]);
  const REP = [1, 2, 3, 4, 3, 4, 5, 6, 7, 8];   // bars 3–4 repeated inside line 1 (bars 1–4)
  assert('a repeat inside one line is not a line change: the next line is still line 2, entered without a jump', [nextLineAt(REP, 0, lineOf, { bars: span(1, 8) }), nextLineAt(REP, 4, lineOf, { bars: span(1, 8) })].map(n => [n.line, n.seq, n.bar, n.jump]), [[1, 6, 5, false], [1, 6, 5, false]]);
  const MID = [1, 2, 3, 4, 5, 6, 13, 14, 15, 16];   // To Coda in the middle of line 2 (bar 6 → 13)
  assert('a jump from the middle of a line: the next line is the target\'s', (n => [n.line, n.seq, n.bar, n.jump])(nextLineAt(MID, 4, lineOf, { bars: span(1, 16) })), [3, 6, 13, true]);

  // ── the line played before ──────────────────────────────────────
  const prev = (seq, fromSeq = 0) => { const p = prevLineAt(ORDER, seq, lineOf, { fromSeq }); return p && [p.line, p.seq, p.bar]; };
  assert('arriving at the coda (seq 64): the line just played is bars 13–16, not the written line before', [prev(64), prev(67)], [[3, 63, 16], [3, 63, 16]]);
  assert('back at bar 9 the second time: the line just played is bars 29–32', prev(32), [7, 31, 32]);
  assert('nothing behind: the first line, or a run that began on this line (fromSeq)', [prev(2), prev(66, 64), prev(64, 64)], [null, null, null]);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
