/**
 * player-band.js
 * ==============
 * The accompaniment as the band: a solo piece names a second norm (its
 * duet part) that Listen and play-along play underneath on the same beat
 * clock. Pure logic for the page — no DOM, no audio; Node-runnable.
 *
 * The solo's norm carries (tools/pieces/README.md):
 *   "accompaniment": { "piece": "<slug>", "soloTranspose": 12 }
 * `piece` is the slug of the accompaniment's own norm; `soloTranspose` is
 * how far, in semitones, the solo is played from where it is written while
 * the band plays (12: an octave higher, as the printed duet says).
 *
 *   accompanimentOf(norm)       → { piece, soloTranspose } | null
 *       null when the field is absent or its slug is not a piece name; a missing
 *       or unusable soloTranspose is 0.
 *   checkBand(solo, band)       → { ok, refused, warnings }
 *       ok: false with `refused` (why) when the two cannot share a clock: a
 *       different time signature or bar length. Otherwise ok with warnings for
 *       what differs and is taken from the solo: tempo, the bars each has, the
 *       play order.
 *   runSequence(solo, range)    → [bar, …]
 *       The solo's bars in the order a transport range plays them — the form's
 *       seq range when it follows the play order (range.form), else its written
 *       bars from..to. The band is laid on this by bar number (player-listen
 *       listenSchedule({ sequence })), so it is in step whatever the solo does
 *       and a bar the band lacks is silent.
 *   shiftRange(lo, hi, semitones) → { lo, hi } covering the range both as written and shifted
 *   transposeLabel(semitones)   → '8va with the band' | '8vb with the band' | '+5 semitones with the band' | ''
 *   selfTest()                  → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-band.js').then(m => m.selfTest())"
 */

import { meterLevels } from './meter-rules.js';
import { playOrderOf, playedSequence, barNumbersOf } from './player-form.js';

const SLUG = /^[a-z0-9-]+$/;
const MAX_TRANSPOSE = 36;

function accompanimentOf(norm) {
  const a = norm && norm.accompaniment;
  if (!a || typeof a !== 'object' || typeof a.piece !== 'string' || !SLUG.test(a.piece)) return null;
  const t = a.soloTranspose;
  return { piece: a.piece, soloTranspose: Number.isInteger(t) && Math.abs(t) <= MAX_TRANSPOSE ? t : 0 };
}

const barQuarters = norm => meterLevels(norm && norm.time, norm && norm.beatsPerBar).bar;
const list = bars => (bars.length > 6 ? `${bars.slice(0, 6).join(', ')}, …` : bars.join(', '));

function checkBand(solo, band) {
  const out = { ok: true, refused: null, warnings: [] };
  if (!band || !Array.isArray(band.bars) || !band.bars.length) return { ok: false, refused: 'it has no bars', warnings: [] };
  const st = String((solo && solo.time) || ''), bt = String(band.time || '');
  if (st !== bt || Math.abs(barQuarters(solo) - barQuarters(band)) > 1e-6) return { ok: false, refused: `it is in ${bt || 'an unknown meter'}, the piece in ${st || 'an unknown meter'}`, warnings: [] };
  if (typeof band.tempo === 'number' && typeof solo.tempo === 'number' && band.tempo !== solo.tempo) out.warnings.push(`its tempo is ${band.tempo}, the piece's ${solo.tempo}: playing at the piece's`);
  const sb = barNumbersOf(solo), bb = barNumbersOf(band), has = new Set(bb), mine = new Set(sb);
  const missing = sb.filter(b => !has.has(b)), extra = bb.filter(b => !mine.has(b));
  if (missing.length) out.warnings.push(`it has no bar ${list(missing)}: silent there`);
  if (extra.length) out.warnings.push(`its bar ${list(extra)} ${extra.length === 1 ? 'is' : 'are'} not in the piece: not played`);
  const so = playOrderOf(solo), bo = playOrderOf(band);
  if (bo && JSON.stringify(so) !== JSON.stringify(bo)) out.warnings.push('its play order differs: following the piece\'s');
  return out;
}

function runSequence(solo, range) {
  if (!range) return [];
  if (range.form) return playedSequence(range.form.order, { fromSeq: range.form.fromSeq, toSeq: range.form.toSeq });
  const a = Math.min(range.from, range.to), b = Math.max(range.from, range.to);
  return barNumbersOf(solo).filter(n => n >= a && n <= b);
}

const shiftRange = (lo, hi, semitones) => { const s = Number.isInteger(semitones) ? semitones : 0; return { lo: Math.min(lo, lo + s), hi: Math.max(hi, hi + s) }; };

function transposeLabel(semitones) {
  if (!Number.isInteger(semitones) || semitones === 0) return '';
  if (semitones === 12) return '8va with the band';
  if (semitones === -12) return '8vb with the band';
  if (semitones === 24) return '15ma with the band';
  return `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'} with the band`;
}

export { accompanimentOf, checkBand, runSequence, shiftRange, transposeLabel, selfTest };

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
  const piece = (bars, extra = {}) => ({ time: '4/4', beatsPerBar: 4, tempo: 148, bars: bars.map(bar => ({ bar })), ...extra });

  console.log('\n─── player-band.js self-test ───\n');

  // ── the field ───────────────────────────────────────────────────
  assert('accompanimentOf: the slug and the transposition', accompanimentOf({ accompaniment: { piece: 'run-rudolph-run-duet', soloTranspose: 12 } }), { piece: 'run-rudolph-run-duet', soloTranspose: 12 });
  assert('no transposition, or an unusable one, is 0', [accompanimentOf({ accompaniment: { piece: 'a-b' } }), accompanimentOf({ accompaniment: { piece: 'a-b', soloTranspose: 1.5 } }), accompanimentOf({ accompaniment: { piece: 'a-b', soloTranspose: 99 } })].map(a => a.soloTranspose), [0, 0, 0]);
  assert('absent, not an object, or a slug that is not a piece name → null', [accompanimentOf({}), accompanimentOf(null), accompanimentOf({ accompaniment: 'x' }), accompanimentOf({ accompaniment: { piece: '../etc' } }), accompanimentOf({ accompaniment: { piece: '' } })], [null, null, null, null, null]);

  // ── can they share a clock ──────────────────────────────────────
  const ORDER = [...span(1, 8), ...span(3, 8)];
  const SOLO = piece(span(1, 8), { form: { playOrder: ORDER } });
  assert('the same shape: ok, nothing to say', checkBand(SOLO, piece(span(1, 8), { form: { playOrder: ORDER } })), { ok: true, refused: null, warnings: [] });
  assert('a different time signature refuses the band', (r => [r.ok, r.refused])(checkBand(SOLO, piece(span(1, 8), { time: '3/4', beatsPerBar: 3 }))), [false, 'it is in 3/4, the piece in 4/4']);
  assert('…as does the same signature with another bar length, or no bars at all', [checkBand(SOLO, piece(span(1, 8), { beatsPerBar: 2 })).ok, checkBand(SOLO, piece([])).ok, checkBand(SOLO, null).ok], [false, false, false]);
  assert('a different tempo warns: the piece\'s is used', checkBand(SOLO, piece(span(1, 8), { tempo: 120 })).warnings, ['its tempo is 120, the piece\'s 148: playing at the piece\'s']);
  assert('a band a bar short, and one with bars the piece lacks, warn', [checkBand(SOLO, piece([1, 2, 3, 4, 6, 7, 8])).warnings, checkBand(SOLO, piece(span(1, 10))).warnings], [['it has no bar 5: silent there'], ['its bar 9, 10 are not in the piece: not played']]);
  assert('a different play order warns; a band with none of its own does not', [checkBand(SOLO, piece(span(1, 8), { form: { playOrder: span(1, 8) } })).warnings, checkBand(SOLO, piece(span(1, 8))).warnings, checkBand(SOLO, piece(span(1, 8))).ok], [['its play order differs: following the piece\'s'], [], true]);

  // ── the sequence the band is laid on ────────────────────────────
  assert('a written range: the solo\'s own bars from..to, in order (gaps in the numbers kept)', [runSequence(SOLO, { from: 3, to: 5 }), runSequence(piece([1, 2, 15, 16]), { from: 16, to: 2 }), runSequence(SOLO, null)], [[3, 4, 5], [2, 15, 16], []]);
  assert('a run that follows the form: that seq range of the play order', runSequence(SOLO, { from: 7, to: 8, form: { order: ORDER, fromSeq: 6, toSeq: 9 } }), [7, 8, 3, 4]);

  // ── the octave ──────────────────────────────────────────────────
  assert('shiftRange: the range as written and as shifted (G3–G4 up an octave → G3–G5)', [shiftRange(55, 67, 12), shiftRange(55, 67, -12), shiftRange(55, 67, 0), shiftRange(55, 67, undefined)], [{ lo: 55, hi: 79 }, { lo: 43, hi: 67 }, { lo: 55, hi: 67 }, { lo: 55, hi: 67 }]);
  assert('transposeLabel', [transposeLabel(12), transposeLabel(-12), transposeLabel(24), transposeLabel(5), transposeLabel(-1), transposeLabel(0)], ['8va with the band', '8vb with the band', '15ma with the band', '+5 semitones with the band', '−1 semitone with the band', '']);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
