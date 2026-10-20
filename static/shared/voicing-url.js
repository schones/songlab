/**
 * voicing-url.js
 * ==============
 * The /voicings URL, both ways. Pure, no DOM: Node-runnable.
 *
 *   /voicings?piece=<name>&bar=<n>&event=<n>&melody=1
 *
 * `bar` is the written bar number; `event` is the comp event within it,
 * 1-BASED as the page shows it ("bar 12, event 2"). Internally the page keeps
 * state.selectedEvent 0-based; resolveRequestedSelection() does the shift.
 *
 *   parseVoicingsParams(search)  → { piece, melody, bar, event }
 *       search  a query string ("?piece=x&bar=3"), with or without the "?",
 *               or a URLSearchParams. piece: a valid name or null; melody:
 *               boolean (exactly "1"); bar / event: positive integers or null
 *               (0, negatives, fractions and junk → null).
 *   resolveRequestedSelection(analysis, { bar, event })  → { bar, eventIndex } | null
 *       analysis  analyzeProgression() result ({ bars: [{ bar, events, maxEvent }] }).
 *       null when bar is null, not in the analysis, or has no comp events.
 *       eventIndex: event − 1 clamped to the bar's events; null when no
 *       event was requested (the page then picks the bar's default event).
 *   voicingsUrl({ piece, bar, event, melody })  → the query path, params in that order, nulls omitted
 *   PIECE_NAME_RE
 *   selfTest()
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/shared/voicing-url.js').then(m => m.selfTest())"
 */

const PIECE_NAME_RE = /^[a-z0-9-]+$/;   // app.py _VOICING_PIECE_RE

/** Positive integer from a query value, else null. */
function positiveInt(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function parseVoicingsParams(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search ?? ''));
  const piece = params.get('piece');
  return {
    piece: piece && PIECE_NAME_RE.test(piece) ? piece : null,
    melody: params.get('melody') === '1',
    bar: positiveInt(params.get('bar')),
    event: positiveInt(params.get('event')),
  };
}

function resolveRequestedSelection(analysis, { bar, event } = {}) {
  if (bar == null || !analysis || !Array.isArray(analysis.bars)) return null;
  const b = analysis.bars.find(x => x.bar === bar);
  if (!b || !Array.isArray(b.events) || !b.events.length) return null;
  const eventIndex = event == null ? null : Math.min(Math.max(event - 1, 0), b.events.length - 1);
  return { bar, eventIndex };
}

function voicingsUrl({ piece = null, bar = null, event = null, melody = false } = {}) {
  const params = new URLSearchParams();
  if (piece) params.set('piece', piece);
  if (bar != null) params.set('bar', String(bar));
  if (event != null) params.set('event', String(event));
  if (melody) params.set('melody', '1');
  const q = params.toString();
  return `/voicings${q ? `?${q}` : ''}`;
}

export { parseVoicingsParams, resolveRequestedSelection, voicingsUrl, PIECE_NAME_RE, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  let passed = 0, total = 0;
  const assert = (name, got, want) => {
    total++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) passed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`}`);
  };
  console.log('\n─── voicing-url.js self-test ───\n');

  const P = parseVoicingsParams;
  assert('full link', P('?piece=maple-leaf-rag&bar=12&event=2&melody=1'), { piece: 'maple-leaf-rag', melody: true, bar: 12, event: 2 });
  assert('without the ?', P('piece=fixture&bar=3'), { piece: 'fixture', melody: false, bar: 3, event: null });
  assert('URLSearchParams input', P(new URLSearchParams('bar=7')), { piece: null, melody: false, bar: 7, event: null });
  assert('empty / null', [P(''), P(null), P('?')], [{ piece: null, melody: false, bar: null, event: null }, { piece: null, melody: false, bar: null, event: null }, { piece: null, melody: false, bar: null, event: null }]);
  assert('bar: 0, negative, fraction, junk, empty → null', ['0', '-3', '2.5', 'x', '', '1e3', ' 4 '].map(v => P(`bar=${encodeURIComponent(v)}`).bar), [null, null, null, null, null, null, 4]);
  assert('event: same rules', ['0', '-1', '1.0', 'two', '3'].map(v => P(`event=${v}`).event), [null, null, null, null, 3]);
  assert('melody only when exactly 1', ['1', '0', 'true', 'yes', ''].map(v => P(`melody=${v}`).melody), [true, false, false, false, false]);
  assert('piece: invalid names dropped', ['Maple', 'a b', '../x', 'ok-1'].map(v => P(`piece=${encodeURIComponent(v)}`).piece), [null, null, null, 'ok-1']);
  assert('huge bar → null', P('bar=99999999999999999999').bar, null);

  const analysis = { bars: [
    { bar: 1, events: [{}, {}], maxEvent: 1 },
    { bar: 2, events: [], maxEvent: null },
    { bar: 4, events: [{}], maxEvent: 0 },
  ] };
  const R = (bar, event) => resolveRequestedSelection(analysis, { bar, event });
  assert('bar + event → 0-based index', R(1, 2), { bar: 1, eventIndex: 1 });
  assert('event 1 → index 0', R(1, 1), { bar: 1, eventIndex: 0 });
  assert('event past the end clamps', R(1, 9), { bar: 1, eventIndex: 1 });
  assert('no event → eventIndex null (page default)', R(4, null), { bar: 4, eventIndex: null });
  assert('bar with no comp events → null', R(2, 1), null);
  assert('bar not in the piece → null', [R(3, 1), R(99, null)], [null, null]);
  assert('no bar → null even with an event', R(null, 2), null);
  assert('no analysis → null', [resolveRequestedSelection(null, { bar: 1 }), resolveRequestedSelection({}, { bar: 1 }), resolveRequestedSelection(analysis)], [null, null, null]);

  assert('voicingsUrl full', voicingsUrl({ piece: 'maple-leaf-rag', bar: 12, event: 2, melody: true }), '/voicings?piece=maple-leaf-rag&bar=12&event=2&melody=1');
  assert('voicingsUrl omits nulls and false', [voicingsUrl({ piece: 'fixture' }), voicingsUrl({ piece: 'fixture', bar: 3 }), voicingsUrl({})], ['/voicings?piece=fixture', '/voicings?piece=fixture&bar=3', '/voicings']);
  assert('round trip', P(voicingsUrl({ piece: 'fixture', bar: 5, event: 1, melody: true }).split('?')[1]), { piece: 'fixture', melody: true, bar: 5, event: 1 });

  console.log(`\n─── ${passed}/${total} passed ───\n`);
  return { passed, total };
}
