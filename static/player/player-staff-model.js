/**
 * player-staff-model.js
 * =====================
 * Norm → MEI for the follow-along player's grand staff. Pure functions, no
 * DOM; Node-runnable like cycle-of-shells-core.js. The norm is the shared
 * note model documented in tools/pieces/README.md (bars[].rh / .lh events
 * with onset / dur in quarters from the bar start, pitches spelled from the
 * key, filler rests, ties across bar lines, optional clefs).
 *
 *   toMEI(norm, { from, to, beams = true })  → { mei, hits, warnings }
 *       mei       one <section> with a <measure> per bar from..to (inclusive)
 *       hits      { [noteId]: { id, midi, name, bar, staff, hand, onset, at, q, tieStop } }
 *       warnings  strings: skipped graces, overruns, unparseable pitches, …
 *   splitDur(quarters)          → [{ q, dur, dots }] longest first (meter-rules.js, re-exported for tests)
 *   keyFifths(text)             → fifths from 'B♭ minor' / 'Bbm' / 'F' …; null when unparseable
 *   clefFor(norm, hand, bar, bars) → 'treble' | 'bass'
 *   lineRanges(norm, { barsPerLine = 4 }) → { ranges: [{ from, to }], warnings }
 *       the staff lines the player shows: norm.lines (line-start bars) when
 *       valid, else the sorted bars chunked positionally by barsPerLine (with a
 *       warning when norm.lines was present but invalid)
 *   lineIndexFor(ranges, bar)   → index of the range holding bar, or -1
 *   selfTest()                  → console report, { passed, total }
 *
 * Layout: staff 1 = rh, staff 2 = lh, one braced staffGrp. Key signature from
 * norm.key, meter from norm.time. Clefs from norm.clefs (the clef in force at
 * each bar, per hand; a change inside the range is written as a <clef> at the
 * start of that bar) or, without norm.clefs, by range: treble when the hand's
 * lowest note in the rendered range is C4 (MIDI 60) or above, else bass.
 *
 * Events whose onsets overlap inside a hand go to a second layer (greedy, as
 * review_page.staff_musicxml). Durations are split into tied pieces by the
 * meter's beat hierarchy (meter-rules.js splitSpan: a note may hide a beat
 * only as the displaced-beat syncopation ♪ ♩ ♪ / ♩ 𝅗𝅥 ♩; rests never do), and
 * runs of two or more eighths or shorter inside one beat group are wrapped in
 * <beam> (meter-rules.js beamRuns; `beams: false` turns this off for
 * comparison). A rest is <rest>; a hand that does not sound in the bar is
 * <mRest/>. Accidentals follow the key signature
 * with bar memory per letter + octave per staff (review_page.assign_accidentals);
 * a tied-into note never shows one.
 *
 * Ids are pl-b{bar}-{staff}-{n}. In hits, `onset` is the attack onset of the
 * event the piece belongs to (what a follower matches on) and `at` is where
 * the piece is drawn; `tieStop` is true for the continuation pieces of a split
 * duration and for events the norm marks tie "stop" — none of these expects a
 * new attack.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-staff-model.js').then(m => m.selfTest())"
 */

import { parseNote } from '../shared/voicing-analysis.js';
import { splitDur, splitSpan, beamRuns, meterLevels, parseTime } from './meter-rules.js';

const EPS = 1e-6;   // norm values sit on a 0.125-quarter grid

// ════════════════════════════════════════════════════════════════════
// KEYS, CLEFS
// ════════════════════════════════════════════════════════════════════

const MAJOR_FIFTHS = { 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F♯': 6, 'C♯': 7,
                       'F': -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7 };
const MINOR_FIFTHS = { 'A': 0, 'E': 1, 'B': 2, 'F♯': 3, 'C♯': 4, 'G♯': 5, 'D♯': 6, 'A♯': 7,
                       'D': -1, 'G': -2, 'C': -3, 'F': -4, 'B♭': -5, 'E♭': -6, 'A♭': -7 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER  = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** 'B♭' / 'Bb' / 'B♭m' / 'B♭ minor' / 'E major' → fifths (review_page.key_fifths); null when unparseable. */
function keyFifths(text) {
  const m = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(m|min|minor|maj|major)?\s*$/i.exec(text || '');
  if (!m) return null;
  const root = m[1].toUpperCase() + m[2].replace('#', '♯').replace('b', '♭');
  const mode = (m[3] || '').toLowerCase();
  const table = ['m', 'min', 'minor'].includes(mode) ? MINOR_FIFTHS : MAJOR_FIFTHS;
  return root in table ? table[root] : null;
}

function keyAccidentals(fifths) {
  const m = {};
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach(l => (m[l] = 1));
  else FLAT_ORDER.slice(0, -fifths).forEach(l => (m[l] = -1));
  return m;
}

const CLEF_DEF = { treble: { shape: 'G', line: 2 }, bass: { shape: 'F', line: 4 } };
const midiOf = name => { const p = parseNote(name); return p && p.midi != null ? p.midi : null; };

/**
 * Clef for one hand at one bar. norm.clefs[hand] gives the clef in force
 * (last change at or before the bar); without it, the hand's lowest note in
 * `bars` (the rendered range) decides: treble at or above C4, else bass.
 */
function clefFor(norm, hand, bar, bars) {
  const list = norm && norm.clefs && Array.isArray(norm.clefs[hand]) ? norm.clefs[hand] : null;
  if (list) {
    let clef = null;
    for (const c of list) if (c && c.bar <= bar && CLEF_DEF[c.clef]) clef = c.clef;
    if (clef) return clef;
  }
  let low = Infinity;
  for (const b of bars || []) for (const ev of b[hand] || []) for (const p of ev.pitches || []) {
    const m = midiOf(p);
    if (m != null && m < low) low = m;
  }
  if (low === Infinity) return hand === 'lh' ? 'bass' : 'treble';
  return low >= 60 ? 'treble' : 'bass';
}

// ════════════════════════════════════════════════════════════════════
// LINES
// ════════════════════════════════════════════════════════════════════

const DEFAULT_BARS_PER_LINE = 4;

/**
 * The staff lines the player shows, as inclusive bar ranges. norm.lines is a
 * list of line-start bars (tools/pieces/README.md): line k runs from lines[k]
 * to lines[k + 1] - 1, the last to the final bar. It is used when it is a
 * non-empty array that starts at the first bar, is strictly increasing and
 * names only bars in the piece; otherwise the sorted bar numbers are chunked
 * positionally, `barsPerLine` at a time (default 4), and a warning says why
 * norm.lines was ignored when it was present.
 */
function lineRanges(norm, { barsPerLine = DEFAULT_BARS_PER_LINE } = {}) {
  const warnings = [];
  const bars = (Array.isArray(norm && norm.bars) ? norm.bars : [])
    .filter(b => b && typeof b.bar === 'number').map(b => b.bar).sort((a, b) => a - b);
  if (!bars.length) return { ranges: [], warnings };
  const last = bars[bars.length - 1];
  const lines = norm.lines;
  if (lines !== undefined) {
    const present = new Set(bars);
    const missing = Array.isArray(lines) ? lines.find(b => !present.has(b)) : undefined;
    const why = !Array.isArray(lines) ? 'not an array'
      : !lines.length ? 'empty'
      : lines[0] !== bars[0] ? `does not start at the first bar (${bars[0]})`
      : lines.some((b, i) => i > 0 && !(b > lines[i - 1])) ? 'not strictly increasing'
      : missing !== undefined ? `names a bar not in the piece (${JSON.stringify(missing)})`
      : null;
    if (!why) return { ranges: lines.map((from, i) => ({ from, to: i + 1 < lines.length ? lines[i + 1] - 1 : last })), warnings };
    warnings.push(`lines ${JSON.stringify(lines)} ignored: ${why}; using ${barsPerLine} bars per line`);
  }
  const n = Number.isInteger(barsPerLine) && barsPerLine >= 1 ? barsPerLine : DEFAULT_BARS_PER_LINE;
  const ranges = [];
  for (let i = 0; i < bars.length; i += n) ranges.push({ from: bars[i], to: bars[Math.min(i + n, bars.length) - 1] });
  return { ranges, warnings };
}

/** Index of the range that holds `bar`, or -1. */
function lineIndexFor(ranges, bar) {
  return (Array.isArray(ranges) ? ranges : []).findIndex(r => r && bar >= r.from && bar <= r.to);
}

// ════════════════════════════════════════════════════════════════════
// LAYOUT
// ════════════════════════════════════════════════════════════════════

const HANDS = [{ hand: 'rh', staff: 1 }, { hand: 'lh', staff: 2 }];

/** Greedy layers (review_page.staff_musicxml): an event joins the first layer that is free at its onset. */
function assignLayers(events) {
  const sorted = events.slice().sort((a, b) => (a.onset - b.onset) || (b.dur - a.dur));
  const layers = [];
  for (const e of sorted) {
    const layer = layers.find(L => L[L.length - 1].onset + L[L.length - 1].dur <= e.onset + EPS);
    if (layer) layer.push(e); else layers.push([e]);
  }
  return layers;
}

/**
 * One hand of one bar → { layers: [[piece]], notes: [note] }.
 * piece: { at, q, dur, dots, rest, space, notes }
 * note:  { id, midi, name, letter, acc, octave, bar, staff, hand, onset, at, q,
 *          tieStop, tieIn, tieOut, tieNext, accidShow }
 */
function layoutHand(norm, barData, { hand, staff, beatsPerBar, grid, warnings, counter }) {
  const bar = barData.bar;
  const raw = Array.isArray(barData[hand]) ? barData[hand] : [];
  const events = [];
  for (const ev of raw) {
    if (ev && ev.grace) { warnings.push(`bar ${bar} ${hand}: grace ${JSON.stringify(ev.grace)} skipped (not drawn)`); continue; }
    if (!ev || typeof ev.onset !== 'number' || typeof ev.dur !== 'number') { warnings.push(`bar ${bar} ${hand}: event without onset/dur skipped`); continue; }
    let { onset, dur } = ev;
    if (onset < -EPS || onset >= beatsPerBar - EPS) { warnings.push(`bar ${bar} ${hand}: event at ${onset} q is outside the bar, skipped`); continue; }
    if (onset + dur > beatsPerBar + EPS) { warnings.push(`bar ${bar} ${hand}: event at ${onset} q runs past the bar, clipped`); dur = beatsPerBar - onset; }
    if (dur <= EPS) continue;
    const pitches = ev.rest || !Array.isArray(ev.pitches) ? [] : ev.pitches;
    const parsed = [];
    for (const p of pitches) {
      const n = parseNote(p);
      if (!n || n.midi == null) { warnings.push(`bar ${bar} ${hand}: pitch ${JSON.stringify(p)} unreadable, dropped`); continue; }
      parsed.push({ ...n, src: p });
    }
    if (pitches.length && !parsed.length) continue;
    parsed.sort((a, b) => a.midi - b.midi);
    events.push({ onset, dur, rest: !parsed.length, pitches: parsed, tie: ev.tie || null });
  }

  const layers = [];
  const notes = [];
  for (const [li, evs] of assignLayers(events).entries()) {
    const pieces = [];
    let cursor = 0;
    const fill = (from, q) => {
      for (const d of splitSpan(from, q, grid, { strict: true })) pieces.push({ ...d, rest: li === 0, space: li > 0, notes: [] });
    };
    for (const e of evs) {
      if (e.onset > cursor + EPS) fill(cursor, e.onset - cursor);
      const parts = splitSpan(e.onset, e.dur, grid, { strict: e.rest });   // rests never hide a beat
      if (Math.abs(parts.reduce((s, d) => s + d.q, 0) - e.dur) > EPS) warnings.push(`bar ${bar} ${hand}: duration ${e.dur} q at ${e.onset} q is finer than 1/32, remainder dropped`);
      parts.forEach((d, pi) => {
        const c = d.at;
        const piece = { ...d, rest: e.rest, space: false, notes: [] };
        if (!e.rest) {
          for (const p of e.pitches) {
            const id = `pl-b${bar}-${staff}-${counter.n++}`;
            const last = pi === parts.length - 1;
            const tieStart = e.tie === 'start' || e.tie === 'both';
            const tieStop = e.tie === 'stop' || e.tie === 'both';
            const note = {
              id, midi: p.midi, name: p.name + p.octave, letter: p.letter, acc: p.acc, octave: p.octave,
              bar, staff, hand, onset: e.onset, at: c, q: d.q,
              tieStop: pi > 0 || tieStop,
              tieIn: pi === 0 && tieStop,                                 // the norm says a tie arrives here
              tieOut: last && tieStart ? (Math.abs(e.onset + e.dur - beatsPerBar) < EPS ? 'bar' : 'next') : null,
              tieNext: null, accidShow: null,
            };
            piece.notes.push(note);
            notes.push(note);
          }
          if (pi > 0) pieces[pieces.length - 1].notes.forEach((prev, k) => { prev.tieNext = piece.notes[k].id; });
        }
        pieces.push(piece);
      });
      cursor = e.onset + e.dur;
    }
    if (cursor < beatsPerBar - EPS) fill(cursor, beatsPerBar - cursor);
    layers.push(pieces);
  }
  if (!layers.length) layers.push(splitSpan(0, beatsPerBar, grid, { strict: true }).map(d => ({ ...d, rest: true, space: false, notes: [] })));

  // A norm tie "start" that ends inside the bar → the next event of the hand at that point with the same pitch.
  for (const n of notes) {
    if (n.tieOut !== 'next') continue;
    const end = n.at + n.q;
    const target = notes.find(x => x !== n && !x.tieStop && x.midi === n.midi && Math.abs(x.at - end) < EPS);
    n.tieOut = null;
    if (target) { n.tieNext = target.id; target.tieStop = true; target.tieIn = false; }
    else warnings.push(`bar ${bar} ${hand}: ${n.name} at ${n.onset} q is tied but nothing continues it at ${end} q`);
  }
  return { layers, notes };
}

/** Key-aware accidental display for one staff of one bar, chronological, keyed by letter + octave. */
function markAccidentals(notes, keyAcc) {
  const state = {};
  const sorted = notes.slice().sort((a, b) => (a.at - b.at) || (a.midi - b.midi));
  for (const n of sorted) {
    const k = n.letter + n.octave;
    const current = k in state ? state[k] : (keyAcc[n.letter] || 0);
    if (n.tieStop) { state[k] = n.acc; continue; }
    if (n.acc !== current) n.accidShow = n.acc;
    state[k] = n.acc;
  }
}

// ════════════════════════════════════════════════════════════════════
// MEI
// ════════════════════════════════════════════════════════════════════

const ACCID = { '-2': 'ff', '-1': 'f', '0': 'n', '1': 's', '2': 'ss' };
const keysigAttr = fifths => (fifths > 0 ? `${fifths}s` : fifths < 0 ? `${-fifths}f` : '0');
const escapeXML = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function noteXML(n, durAttrs = '') {
  const a = [`xml:id="${n.id}"`, durAttrs, `pname="${n.letter.toLowerCase()}"`, `oct="${n.octave}"`];
  if (n.accidShow != null) a.push(`accid="${ACCID[n.accidShow]}"`);
  else if (n.acc) a.push(`accid.ges="${ACCID[n.acc]}"`);
  return `<note ${a.filter(Boolean).join(' ')}/>`;
}

function pieceXML(p) {
  const d = `dur="${p.dur}"${p.dots ? ` dots="${p.dots}"` : ''}`;
  if (p.space) return `<space ${d}/>`;
  if (p.rest) return `<rest ${d}/>`;
  if (p.notes.length === 1) return noteXML(p.notes[0], d);
  return `<chord ${d}>${p.notes.map(n => noteXML(n)).join('')}</chord>`;
}

/** Pieces → layer body, with runs of two or more beamable pieces wrapped in <beam> (spaces and rests never are). */
function piecesXML(pieces, grid, beams) {
  const starts = new Set(), ends = new Set();
  if (beams && grid) for (const run of beamRuns(pieces, grid)) { starts.add(run[0]); ends.add(run[run.length - 1]); }
  return pieces.map((p, i) => `${starts.has(i) ? '<beam>' : ''}${pieceXML(p)}${ends.has(i) ? '</beam>' : ''}`).join('');
}

function layerXML(pieces, n, clefChange, grid, beams = true) {
  const silent = pieces.every(p => p.rest || p.space);
  const body = silent && n === 1 ? '<mRest/>' : silent ? '' : piecesXML(pieces, grid, beams);
  if (!body && !clefChange) return '';
  return `<layer n="${n}">${clefChange || ''}${body}</layer>`;
}

/**
 * @param {object} norm                 the norm document (tools/pieces/README.md)
 * @param {{ from: number, to: number, beams?: boolean }} range   bar numbers, inclusive; a single bar uses from == to;
 *                                      beams: false writes no <beam> (ids and ties are identical either way)
 * @returns {{ mei: string, hits: object, warnings: string[] }}
 */
function toMEI(norm, { from, to, beams = true } = {}) {
  const warnings = [];
  const allBars = Array.isArray(norm && norm.bars) ? norm.bars : [];
  if (!allBars.length) throw new Error('toMEI: norm has no bars');
  const first = from ?? allBars[0].bar, last = to ?? first;
  const bars = allBars.filter(b => b && b.bar >= first && b.bar <= last).sort((a, b) => a.bar - b.bar);
  if (!bars.length) throw new Error(`toMEI: no bars in ${first}..${last}`);

  let fifths = keyFifths(norm.key);
  if (fifths == null) { warnings.push(`key ${JSON.stringify(norm.key)} not understood; using C`); fifths = 0; }
  let meter = parseTime(norm.time);
  if (!meter) { warnings.push(`time ${JSON.stringify(norm.time)} not understood; using 4/4`); meter = { count: 4, unit: 4 }; }
  const beatsPerBar = typeof norm.beatsPerBar === 'number' ? norm.beatsPerBar : meter.count * 4 / meter.unit;
  const grid = meterLevels(`${meter.count}/${meter.unit}`, beatsPerBar);
  if (grid.warning) warnings.push(grid.warning);
  const keyAcc = keyAccidentals(fifths);
  const lastBar = allBars[allBars.length - 1].bar;

  // Clefs: per bar from norm.clefs, else one fallback clef per hand for the whole range.
  const clefAt = (hand, bar) => clefFor(norm, hand, bar, bars);
  const startClef = { rh: clefAt('rh', bars[0].bar), lh: clefAt('lh', bars[0].bar) };

  // Lay every bar out, then link ties across bars, then mark accidentals.
  const models = bars.map(barData => {
    const counter = { n: 0 };
    const hands = {};
    for (const { hand, staff } of HANDS) {
      counter.n = 0;
      hands[hand] = layoutHand(norm, barData, { hand, staff, beatsPerBar, grid, warnings, counter });
    }
    return { bar: barData.bar, hands };
  });
  models.forEach((m, i) => {
    const next = models[i + 1];
    for (const { hand } of HANDS) for (const n of m.hands[hand].notes) {
      if (n.tieOut !== 'bar' || !next) continue;
      const target = next.hands[hand].notes.find(x => x.midi === n.midi && Math.abs(x.at) < EPS && (x.tieIn || !x.tieStop));
      if (target) { n.tieNext = target.id; n.tieOut = null; target.tieStop = true; target.tieIn = false; target.linked = true; }
      else warnings.push(`bar ${m.bar} ${hand}: ${n.name} is tied into bar ${next.bar}, which has no ${n.name} at its start`);
    }
  });
  models.forEach((m, i) => {
    for (const { hand } of HANDS) {
      if (i > 0) for (const n of m.hands[hand].notes) if (n.tieIn && !n.linked) warnings.push(`bar ${m.bar} ${hand}: ${n.name} is marked tie stop but bar ${models[i - 1].bar} does not tie into it`);
      markAccidentals(m.hands[hand].notes, keyAcc);
    }
  });

  const hits = {};
  const measures = models.map((m, i) => {
    const prevBar = i > 0 ? models[i - 1].bar : null;
    const staves = HANDS.map(({ hand, staff }) => {
      const clef = clefAt(hand, m.bar);
      const change = i > 0 && clef !== clefAt(hand, prevBar) ? `<clef shape="${CLEF_DEF[clef].shape}" line="${CLEF_DEF[clef].line}"/>` : '';
      const layers = m.hands[hand].layers.map((pieces, li) => layerXML(pieces, li + 1, li === 0 ? change : '', grid, beams)).filter(Boolean);
      return `<staff n="${staff}">${layers.join('')}</staff>`;
    });
    const controls = [];
    for (const { hand } of HANDS) for (const n of m.hands[hand].notes) {
      hits[n.id] = { id: n.id, midi: n.midi, name: n.name, bar: n.bar, staff: n.staff, hand: n.hand, onset: n.onset, at: n.at, q: n.q, tieStop: !!n.tieStop };
      if (n.tieIn && !n.linked) controls.push(`<tie tstamp="0" endid="#${n.id}"/>`);
      if (n.tieNext) controls.push(`<tie startid="#${n.id}" endid="#${n.tieNext}"/>`);
      if (n.tieOut === 'bar') controls.push(`<tie startid="#${n.id}" tstamp2="0m+${beatsPerBar + 1}"/>`);
    }
    const right = m.bar === lastBar ? 'end' : 'single';
    return `<measure n="${m.bar}" right="${right}">\n      ${staves.join('\n      ')}${controls.length ? '\n      ' + controls.join('\n      ') : ''}\n    </measure>`;
  });

  const staffDef = (n, clef) =>
    `<staffDef n="${n}" lines="5" clef.shape="${CLEF_DEF[clef].shape}" clef.line="${CLEF_DEF[clef].line}" keysig="${keysigAttr(fifths)}" meter.count="${meter.count}" meter.unit="${meter.unit}"/>`;
  const title = escapeXML(norm.title || norm.piece || 'untitled');

  const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>${title} — bars ${bars[0].bar}–${bars[bars.length - 1].bar}</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp symbol="brace" bar.thru="true">${staffDef(1, startClef.rh)}${staffDef(2, startClef.lh)}</staffGrp></scoreDef>
    <section>
    ${measures.join('\n    ')}
    </section>
  </score></mdiv></body></music>
</mei>`;
  return { mei, hits, warnings };
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { toMEI, splitDur, keyFifths, parseTime, clefFor, lineRanges, lineIndexFor, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/player/player-staff-model.js').then(m => m.selfTest())"
//
// Runs a fixture copied from the prelude norm (bars 1, 4, 5, 6, 8, 9, 11, 13,
// 15, 16 of static/private/pieces/prelude-winston-first-16.norm.json,
// 2026-10-30) plus synthetic bars, then a smoke pass over that file when it
// exists. Beat-aware splitting and beaming rules themselves are tested in
// meter-rules.js against tests/fixtures/meter-rules-cases.json; here the
// asserts cover their effect on the MEI (ids, ties, <beam> placement).

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const count = (s, re) => (s.match(re) || []).length;
  const staffBody = (mei, bar, staff) => { const m = new RegExp(`<measure n="${bar}"[\\s\\S]*?<staff n="${staff}">([\\s\\S]*?)</staff>`).exec(mei); return m ? m[1] : null; };
  const measureTies = (mei, bar) => { const m = new RegExp(`<measure n="${bar}"[\\s\\S]*?</measure>`).exec(mei); return m ? (m[0].match(/<tie [^>]*\/>/g) || []) : []; };
  const staffDefs = mei => (mei.match(/<staffDef [^>]*\/>/g) || []).map(s => /clef\.shape="(\w)"/.exec(s)[1]);
  const ev = (onset, dur, pitches, tie = null) => ({ onset, dur, pitches, rest: false, tie });
  const rest = (onset, dur) => ({ onset, dur, pitches: [], rest: true, tie: null });

  console.log('\n─── player-staff-model.js self-test ───\n');

  // Fixture: bars copied from the prelude norm; 2–3, 7, 10, 12, 14 stand in as single rests so the clef list reads correctly.
  const PRELUDE = {
    piece: 'prelude-fixture', title: 'Prelude fixture', key: 'B♭ minor', time: '3/4', beatsPerBar: 3, tempo: 82,
    clefs: { lh: [{ bar: 1, clef: 'treble' }, { bar: 9, clef: 'bass' }], rh: [{ bar: 1, clef: 'treble' }] },
    bars: [
      { bar: 1, voice: [], rh: [ev(0, 2.5, ['D6']), ev(2.5, 0.5, ['D6'])], lh: [ev(0, 0.5, ['G4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])], uncertain: [] },
      ...[2, 3].map(bar => ({ bar, voice: [], rh: [rest(0, 3)], lh: [rest(0, 3)], uncertain: [] })),
      { bar: 4, voice: [], rh: [ev(0, 2.5, ['F5']), ev(2.5, 0.25, ['G5']), ev(2.75, 0.25, ['D5'])], lh: [ev(0, 0.5, ['D4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])], uncertain: [] },
      { bar: 5, voice: [], rh: [ev(0, 1, ['F5']), ev(1, 1, ['E♭5']), ev(2, 1, ['E♭5'])], lh: [ev(0, 0.5, ['C4']), ev(0.5, 2.5, ['G4'])], uncertain: [] },
      { bar: 6, voice: [], rh: [ev(0, 1, ['D5']), ev(1, 1.5, ['C5']), ev(2.5, 0.5, ['D5'])], lh: [ev(0, 0.5, ['B♭3']), ev(0.5, 2.5, ['F4'])], uncertain: [] },
      { bar: 7, voice: [], rh: [rest(0, 3)], lh: [rest(0, 3)], uncertain: [] },
      { bar: 8, voice: [], rh: [ev(0, 1, ['F5']), ev(1, 1, ['E♭5']), ev(2, 1, ['D5'])], lh: [ev(0, 0.5, ['B♭3']), ev(0.5, 2.5, ['F4'])], uncertain: [] },
      { bar: 9, voice: [], rh: [ev(0, 0.5, ['D5']), ev(0.5, 0.5, ['E♭5']), ev(1, 1, ['F5']), ev(2, 1, ['D5'])], lh: [ev(0, 0.5, ['B♭2']), ev(0.5, 2.5, ['F3'])], uncertain: [] },
      { bar: 10, voice: [], rh: [rest(0, 3)], lh: [rest(0, 3)], uncertain: [] },
      { bar: 11, voice: [], rh: [ev(0, 1, ['D5']), ev(1, 0.5, ['F4']), ev(1.5, 0.5, ['G4']), ev(2, 0.5, ['B♭4']), ev(2.5, 0.5, ['C5'])], lh: [ev(0, 0.5, ['E♭3']), ev(0.5, 2.5, ['B♭3'])], uncertain: [] },
      { bar: 12, voice: [], rh: [rest(0, 3)], lh: [rest(0, 3)], uncertain: [] },
      { bar: 13, voice: [], rh: [ev(0, 1.5, ['E♭5']), ev(1.5, 1.5, ['G5'])], lh: [ev(0, 0.5, ['C3']), ev(0.5, 0.5, ['G3']), ev(1, 2, ['E♭4'])], uncertain: [] },
      { bar: 14, voice: [], rh: [rest(0, 3)], lh: [rest(0, 3)], uncertain: [] },
      { bar: 15, voice: [], rh: [ev(0, 1, ['E♭5']), ev(1, 1, ['C5']), ev(2, 0.5, ['D5']), ev(2.5, 0.5, ['C5', 'D5'], 'start')], lh: [ev(0, 0.5, ['A2']), ev(0.5, 2.5, ['G3'])], uncertain: [] },
      { bar: 16, voice: [], rh: [ev(0, 1, ['C5', 'D5'], 'stop'), rest(1, 2)], lh: [ev(0, 1, ['A2']), ev(1, 2, ['G♭3'])], uncertain: [] },
    ],
  };

  // ── splitDur ─────────────────────────────────────────────────────
  const vals = q => splitDur(q).map(d => d.dur + '.'.repeat(d.dots));
  assert('splitDur: 2.5 → half + 8th (largest first)', vals(2.5), ['2', '8']);
  assert('splitDur: 0.75 → dotted 8th, 1.5 → dotted quarter, 3 → dotted half', [vals(0.75), vals(1.5), vals(3)], [['8.'], ['4.'], ['2.']]);
  assert('splitDur: 1.75 → dotted quarter + 16th, 0.125 → 32nd', [vals(1.75), vals(0.125)], [['4.', '16'], ['32']]);
  assert('keyFifths: B♭ minor −5, Bbm −5, F −1, E major 4, junk null', ['B♭ minor', 'Bbm', 'F', 'E major', 'H'].map(keyFifths), [-5, -5, -1, 4, null]);

  // ── Bar 1: the D6 2.5 q split, ids, hits ──────────────────────────
  const b1 = toMEI(PRELUDE, { from: 1, to: 1 });
  assert('bar 1: no warnings', b1.warnings, []);
  assert('bar 1: grand staff, 5 flats, 3/4, both treble (lh from norm.clefs)', [count(b1.mei, /symbol="brace"/g), count(b1.mei, /keysig="5f"/g), count(b1.mei, /meter\.count="3" meter\.unit="4"/g), staffDefs(b1.mei)], [1, 2, 2, ['G', 'G']]);
  assert('bar 1 rh: D6 half tied to 8th (♮ shown once: D♭ is in the key), then D6 8th; the two eighths of beat 3 beam (the tie does not matter)', staffBody(b1.mei, 1, 1),
    '<layer n="1"><note xml:id="pl-b1-1-0" dur="2" pname="d" oct="6" accid="n"/><beam><note xml:id="pl-b1-1-1" dur="8" pname="d" oct="6"/><note xml:id="pl-b1-1-2" dur="8" pname="d" oct="6"/></beam></layer>');
  assert('bar 1 rh: one tie, piece 0 → piece 1', measureTies(b1.mei, 1), ['<tie startid="#pl-b1-1-0" endid="#pl-b1-1-1"/>']);
  assert('bar 1 lh: G4 8th (♮) and B♭4 8th (in the key: accid.ges only) beamed, D5 half (♮)', staffBody(b1.mei, 1, 2),
    '<layer n="1"><beam><note xml:id="pl-b1-2-0" dur="8" pname="g" oct="4" accid="n"/><note xml:id="pl-b1-2-1" dur="8" pname="b" oct="4" accid.ges="f"/></beam><note xml:id="pl-b1-2-2" dur="2" pname="d" oct="5" accid="n"/></layer>');
  assert('bar 1 hits: continuation piece has tieStop, attack onset kept, drawn position in at', [b1.hits['pl-b1-1-0'], b1.hits['pl-b1-1-1'], b1.hits['pl-b1-1-2']], [
    { id: 'pl-b1-1-0', midi: 86, name: 'D6', bar: 1, staff: 1, hand: 'rh', onset: 0, at: 0, q: 2, tieStop: false },
    { id: 'pl-b1-1-1', midi: 86, name: 'D6', bar: 1, staff: 1, hand: 'rh', onset: 0, at: 2, q: 0.5, tieStop: true },
    { id: 'pl-b1-1-2', midi: 86, name: 'D6', bar: 1, staff: 1, hand: 'rh', onset: 2.5, at: 2.5, q: 0.5, tieStop: false }]);
  assert('bar 1 hits: 6 notes, every id in the MEI', [Object.keys(b1.hits).length, Object.keys(b1.hits).every(id => b1.mei.includes(`xml:id="${id}"`))], [6, true]);

  // ── Carol bars 4, 5, 6, 11, 13: beat-aware splits and beams in 3/4 ──
  const beams = body => (body.match(/<beam>[\s\S]*?<\/beam>/g) || []).map(b => (b.match(/xml:id="([^"]+)"/g) || []).map(x => x.slice(8, -1)));
  const b4 = toMEI(PRELUDE, { from: 4, to: 4 });
  assert('bar 4 rh: F5 half tied to 8th, then two 16ths; the 8th and both 16ths of beat 3 are one beam (♪ 𝅘𝅥𝅯 𝅘𝅥𝅯)', [staffBody(b4.mei, 4, 1), measureTies(b4.mei, 4)],
    ['<layer n="1"><note xml:id="pl-b4-1-0" dur="2" pname="f" oct="5"/><beam><note xml:id="pl-b4-1-1" dur="8" pname="f" oct="5"/><note xml:id="pl-b4-1-2" dur="16" pname="g" oct="5" accid="n"/><note xml:id="pl-b4-1-3" dur="16" pname="d" oct="5" accid="n"/></beam></layer>', ['<tie startid="#pl-b4-1-0" endid="#pl-b4-1-1"/>']]);
  const b5 = toMEI(PRELUDE, { from: 5, to: 5 });
  assert('bar 5 lh: G4 2.5 q from the and-of-1 → 8th at 0.5 tied to half at beat 2 (not half + 8th); C4 and G4 eighths beam', [staffBody(b5.mei, 5, 2), measureTies(b5.mei, 5), [b5.hits['pl-b5-2-1'].at, b5.hits['pl-b5-2-1'].q, b5.hits['pl-b5-2-2'].at, b5.hits['pl-b5-2-2'].q, b5.hits['pl-b5-2-2'].tieStop]],
    ['<layer n="1"><beam><note xml:id="pl-b5-2-0" dur="8" pname="c" oct="4"/><note xml:id="pl-b5-2-1" dur="8" pname="g" oct="4" accid="n"/></beam><note xml:id="pl-b5-2-2" dur="2" pname="g" oct="4"/></layer>', ['<tie startid="#pl-b5-2-1" endid="#pl-b5-2-2"/>'], [0.5, 0.5, 1, 2, true]]);
  assert('bar 5 rh: three quarters, no beams, no ties', [count(staffBody(b5.mei, 5, 1), /<beam>/g), count(staffBody(b5.mei, 5, 1), /dur="4"/g), b5.warnings], [0, 3, []]);
  const b6 = toMEI(PRELUDE, { from: 6, to: 6 });
  assert('bar 6 rh: C5 dotted quarter on beat 2 stays one value; the lone D5 8th at 2.5 keeps its flag', staffBody(b6.mei, 6, 1),
    '<layer n="1"><note xml:id="pl-b6-1-0" dur="4" pname="d" oct="5" accid="n"/><note xml:id="pl-b6-1-1" dur="4" dots="1" pname="c" oct="5"/><note xml:id="pl-b6-1-2" dur="8" pname="d" oct="5"/></layer>');
  const b11 = toMEI(PRELUDE, { from: 11, to: 11 });
  assert('bar 11 rh: ♩ ♪♪♪♪ → two beams of two (beats 2 and 3), never one of four or 3+3; ids unchanged', beams(staffBody(b11.mei, 11, 1)), [['pl-b11-1-1', 'pl-b11-1-2'], ['pl-b11-1-3', 'pl-b11-1-4']]);
  assert('bar 11: every id once, hits in piece order', [Object.keys(b11.hits), Object.keys(b11.hits).every(id => count(b11.mei, new RegExp(`xml:id="${id}"`, 'g')) === 1)],
    [['pl-b11-1-0', 'pl-b11-1-1', 'pl-b11-1-2', 'pl-b11-1-3', 'pl-b11-1-4', 'pl-b11-2-0', 'pl-b11-2-1', 'pl-b11-2-2'], true]);
  const b9 = toMEI(PRELUDE, { from: 9, to: 9 });
  assert('bar 9 rh: ♪ ♪ ♩ ♩ → beat-1 eighths beam; lh ♪ ♪⌒𝅗𝅥 beams beat 1', [beams(staffBody(b9.mei, 9, 1)), beams(staffBody(b9.mei, 9, 2))], [[['pl-b9-1-0', 'pl-b9-1-1']], [['pl-b9-2-0', 'pl-b9-2-1']]]);
  const b13 = toMEI(PRELUDE, { from: 13, to: 13 });
  assert('bar 13 rh: ♩. ♩. (a dotted quarter from the and-of-2 is the displaced beat) — no split, no beam', [staffBody(b13.mei, 13, 1), measureTies(b13.mei, 13)],
    ['<layer n="1"><note xml:id="pl-b13-1-0" dur="4" dots="1" pname="e" oct="5" accid.ges="f"/><note xml:id="pl-b13-1-1" dur="4" dots="1" pname="g" oct="5" accid="n"/></layer>', []]);

  // ── Chord, rest, cross-bar tie: bars 15 and 16 ────────────────────
  const b15 = toMEI(PRELUDE, { from: 15, to: 15 });
  assert('bar 15 rh: chord event → <chord> with two notes (D♮ already shown earlier in the bar)', (staffBody(b15.mei, 15, 1).match(/<chord [\s\S]*?<\/chord>/) || [])[0], '<chord dur="8"><note xml:id="pl-b15-1-3" pname="c" oct="5"/><note xml:id="pl-b15-1-4" pname="d" oct="5"/></chord>');
  assert('bar 15 alone: the chord ties out to the bar line (tstamp2); the lh split tie is by id', measureTies(b15.mei, 15), ['<tie startid="#pl-b15-1-3" tstamp2="0m+4"/>', '<tie startid="#pl-b15-1-4" tstamp2="0m+4"/>', '<tie startid="#pl-b15-2-1" endid="#pl-b15-2-2"/>']);
  assert('bar 15 lh: bass clef from norm.clefs, 2.5 q G3 from the and-of-1 → 8th tied to half at beat 2; the A2 and G3 eighths beam', [staffDefs(b15.mei)[1], staffBody(b15.mei, 15, 2)], ['F',
    '<layer n="1"><beam><note xml:id="pl-b15-2-0" dur="8" pname="a" oct="2" accid="n"/><note xml:id="pl-b15-2-1" dur="8" pname="g" oct="3" accid="n"/></beam><note xml:id="pl-b15-2-2" dur="2" pname="g" oct="3"/></layer>']);
  assert('bar 15 rh: the D5 8th and the C5+D5 chord 8th of beat 3 share a beam', (staffBody(b15.mei, 15, 1).match(/<beam>[\s\S]*?<\/beam>/) || [])[0],
    '<beam><note xml:id="pl-b15-1-2" dur="8" pname="d" oct="5" accid="n"/><chord dur="8"><note xml:id="pl-b15-1-3" pname="c" oct="5"/><note xml:id="pl-b15-1-4" pname="d" oct="5"/></chord></beam>');
  const b16 = toMEI(PRELUDE, { from: 16, to: 16 });
  assert('bar 16 alone: tie arrives from the bar line (tstamp 0), chord quarter then half rest', [measureTies(b16.mei, 16), staffBody(b16.mei, 16, 1)],
    [['<tie tstamp="0" endid="#pl-b16-1-0"/>', '<tie tstamp="0" endid="#pl-b16-1-1"/>'], '<layer n="1"><chord dur="4"><note xml:id="pl-b16-1-0" pname="c" oct="5"/><note xml:id="pl-b16-1-1" pname="d" oct="5"/></chord><rest dur="2"/></layer>']);
  assert('bar 16: tie-stop notes have tieStop in hits, last bar ends with a final bar line', [b16.hits['pl-b16-1-0'].tieStop, b16.hits['pl-b16-1-1'].tieStop, count(b16.mei, /right="end"/g)], [true, true, 1]);
  assert('bar 16 lh: A2 shows ♮, G♭3 is in the 5-flat signature (accid.ges only)', staffBody(b16.mei, 16, 2), '<layer n="1"><note xml:id="pl-b16-2-0" dur="4" pname="a" oct="2" accid="n"/><note xml:id="pl-b16-2-1" dur="2" pname="g" oct="3" accid.ges="f"/></layer>');
  const b1516 = toMEI(PRELUDE, { from: 15, to: 16 });
  assert('bars 15–16 together: two measures, the chord ties by id into bar 16, no bar-line ties', [count(b1516.mei, /<measure /g), measureTies(b1516.mei, 15), measureTies(b1516.mei, 16), b1516.warnings],
    [2, ['<tie startid="#pl-b15-1-3" endid="#pl-b16-1-0"/>', '<tie startid="#pl-b15-1-4" endid="#pl-b16-1-1"/>', '<tie startid="#pl-b15-2-1" endid="#pl-b15-2-2"/>'], [], []]);
  const silent = toMEI({ key: 'C', time: '4/4', bars: [{ bar: 1, rh: [rest(0, 4)], lh: [] }] }, { from: 1, to: 1 });
  assert('whole-bar rest (explicit) and an empty hand both become <mRest/>', [staffBody(silent.mei, 1, 1), staffBody(silent.mei, 1, 2)], ['<layer n="1"><mRest/></layer>', '<layer n="1"><mRest/></layer>']);

  // ── Clefs: a change inside the range, and the fallback rule ───────
  const b89 = toMEI(PRELUDE, { from: 8, to: 9 });
  assert('bars 8–9: lh starts treble, bar 9 opens with a bass clef change on the lh', [staffDefs(b89.mei), staffBody(b89.mei, 9, 2).startsWith('<layer n="1"><clef shape="F" line="4"/>'), staffBody(b89.mei, 8, 2).includes('<clef')], [['G', 'G'], true, false]);
  const noClefs = { ...PRELUDE, clefs: undefined };
  assert('fallback (no norm.clefs): bar 1 lh lowest G4 ≥ C4 → treble; bar 15 lh lowest A2 → bass', [staffDefs(toMEI(noClefs, { from: 1, to: 1 }).mei), staffDefs(toMEI(noClefs, { from: 15, to: 15 }).mei)], [['G', 'G'], ['G', 'F']]);
  assert('fallback: the range decides (bars 1–9 lh includes B♭2 → bass for the whole range, no clef change)', [staffDefs(toMEI(noClefs, { from: 1, to: 9 }).mei), count(toMEI(noClefs, { from: 1, to: 9 }).mei, /<clef /g)], [['G', 'F'], 0]);
  assert('fallback: a hand with no notes in the range defaults by hand (rh treble, lh bass)', staffDefs(toMEI({ key: 'C', time: '4/4', bars: [{ bar: 1, rh: [], lh: [] }] }, { from: 1, to: 1 }).mei), ['G', 'F']);
  assert('clefFor: C4 itself is treble, B3 is bass', [clefFor({}, 'lh', 1, [{ lh: [ev(0, 1, ['C4'])] }]), clefFor({}, 'lh', 1, [{ lh: [ev(0, 1, ['B3'])] }])], ['treble', 'bass']);

  // ── Accidental memory ────────────────────────────────────────────
  const ACC = { key: 'B♭ minor', time: '3/4', bars: [{ bar: 1,
    rh: [ev(0, 0.5, ['A4']), ev(0.5, 0.5, ['A4']), ev(1, 0.5, ['A♭4']), ev(1.5, 0.5, ['A♭5']), ev(2, 0.5, ['A4', 'C5']), ev(2.5, 0.5, ['G5'])],
    lh: [ev(0, 2.5, ['A3']), ev(2.5, 0.5, ['A3'])] }] };
  const acc = toMEI(ACC, { from: 1, to: 1 });
  const shown = (mei, staff, bar = 1) => (staffBody(mei, bar, staff).match(/<note [^>]*\/>/g) || []).map(s => (/pname="(\w)" oct="(\d)"(?: accid="(\w+)")?/.exec(s)).slice(1, 4).map(x => x ?? '-').join(''));
  assert('accidentals rh: A♮ shown once, A♭ needs its flat back, A♭5 is another octave (none), A♮ in a chord shown again, C none, G♮ shown',
    shown(acc.mei, 1), ['a4n', 'a4-', 'a4f', 'a5-', 'a4n', 'c5-', 'g5n']);
  assert('accidentals lh: A3 2.5 q shows ♮ on the first piece only; the re-struck A3 needs none', shown(acc.mei, 2), ['a3n', 'a3-', 'a3-']);
  assert('accidentals: a tied-into note (norm tie stop) shows none even when it differs from the key', (() => {
    const T = { key: 'B♭ minor', time: '3/4', bars: [{ bar: 1, rh: [ev(0, 3, ['A4'], 'start')], lh: [] }, { bar: 2, rh: [ev(0, 1, ['A4'], 'stop'), ev(1, 1, ['A4']), rest(2, 1)], lh: [] }] };
    return shown(toMEI(T, { from: 2, to: 2 }).mei, 1, 2);
  })(), ['a4-', 'a4-']);

  // ── Layers, graces, bad data ─────────────────────────────────────
  const OV = { key: 'C', time: '4/4', bars: [{ bar: 1, rh: [ev(0, 4, ['E5']), ev(0, 1, ['C4']), ev(1, 1, ['D4']), rest(2, 2)], lh: [{ grace: ['B3'] }, ev(0, 4, ['C3'])] }] };
  const ov = toMEI(OV, { from: 1, to: 1 });
  assert('overlapping events → two layers; the longer note takes layer 1; layer 2 gaps are <space>', staffBody(ov.mei, 1, 1),
    '<layer n="1"><note xml:id="pl-b1-1-0" dur="1" pname="e" oct="5"/></layer><layer n="2"><note xml:id="pl-b1-1-1" dur="4" pname="c" oct="4"/><note xml:id="pl-b1-1-2" dur="4" pname="d" oct="4"/><rest dur="2"/></layer>');
  assert('grace events are skipped with a warning', ov.warnings, ['bar 1 lh: grace ["B3"] skipped (not drawn)']);

  // ── 4/4 synthetic bars S1 / S2 (report §5 groups 1, 2, 9–11), 6/8, fallback ──
  const S = { key: 'C', time: '4/4', bars: [
    { bar: 1, rh: [ev(0, 0.5, ['C5']), ev(0.5, 1, ['D5']), ev(1.5, 1.5, ['E5']), ev(3, 1, ['F5'])], lh: [] },
    { bar: 2, rh: [ev(0, 1, ['C5']), ev(1, 2, ['D5']), ev(3, 1, ['E5'])], lh: [ev(0, 0.5, ['C3']), ev(0.5, 2, ['D3']), ev(2.5, 1.5, ['E3'])] },
    { bar: 3, rh: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(t => ev(t, 0.5, ['C5']))
    , lh: [ev(0, 0.5, ['C3']), ev(0.5, 0.25, ['D3']), ev(0.75, 0.25, ['E3']), ev(1, 0.5, ['F3']), ev(1.5, 0.5, ['G3']), rest(2, 2)] },
    { bar: 4, rh: [ev(0, 0.5, ['C5']), rest(0.5, 0.5), ev(1, 0.5, ['D5']), rest(1.5, 0.5), ev(2, 2, ['E5'])], lh: [rest(0, 0.5), ev(0.5, 0.5, ['C3']), ev(1, 0.5, ['D3']), rest(1.5, 0.5), ev(2, 2, ['E3'])] },
    { bar: 5, rh: [ev(0, 4, ['G5']), ev(0, 0.5, ['C5']), ev(1, 0.5, ['D5']), ev(1.5, 0.5, ['E5']), ev(2, 2, ['F5'])], lh: [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]].map(([t, d]) => ev(t, d, ['C3'])) },
  ] };
  const s1 = toMEI(S, { from: 1, to: 1 }), s2 = toMEI(S, { from: 2, to: 2 }), s3 = toMEI(S, { from: 3, to: 3 }), s4 = toMEI(S, { from: 4, to: 4 }), s5 = toMEI(S, { from: 5, to: 5 });
  assert('S1 rh: ♪ ♩ ♪⌒♩ ♩ — the and-of-2 note splits at beat 3, nothing beams, one tie', [staffBody(s1.mei, 1, 1), measureTies(s1.mei, 1)],
    ['<layer n="1"><note xml:id="pl-b1-1-0" dur="8" pname="c" oct="5"/><note xml:id="pl-b1-1-1" dur="4" pname="d" oct="5"/><note xml:id="pl-b1-1-2" dur="8" pname="e" oct="5"/><note xml:id="pl-b1-1-3" dur="4" pname="e" oct="5"/><note xml:id="pl-b1-1-4" dur="4" pname="f" oct="5"/></layer>', ['<tie startid="#pl-b1-1-2" endid="#pl-b1-1-3"/>']]);
  assert('S1 hits: the split note keeps its attack onset 1.5 on both pieces; the second is tieStop', [s1.hits['pl-b1-1-2'], s1.hits['pl-b1-1-3']].map(h => [h.onset, h.at, h.q, h.tieStop]), [[1.5, 1.5, 0.5, false], [1.5, 2, 1, true]]);
  assert('S2 rh: ♩ 𝅗𝅥 ♩ unsplit; lh: ♪ ♩.⌒♪ ♩. (half from the and-of-1 shows the middle), no beams', [staffBody(s2.mei, 2, 1), staffBody(s2.mei, 2, 2), count(s2.mei, /<beam>/g)],
    ['<layer n="1"><note xml:id="pl-b2-1-0" dur="4" pname="c" oct="5"/><note xml:id="pl-b2-1-1" dur="2" pname="d" oct="5"/><note xml:id="pl-b2-1-2" dur="4" pname="e" oct="5"/></layer>',
     '<layer n="1"><note xml:id="pl-b2-2-0" dur="8" pname="c" oct="3"/><note xml:id="pl-b2-2-1" dur="4" dots="1" pname="d" oct="3"/><note xml:id="pl-b2-2-2" dur="8" pname="d" oct="3"/><note xml:id="pl-b2-2-3" dur="4" dots="1" pname="e" oct="3"/></layer>', 0]);
  assert('S3 rh: eight eighths → two beams of four (half-bar rule); lh: ♪ 𝅘𝅥𝅯𝅘𝅥𝅯 ♪ ♪ 𝄻 → a mixed beam of three, a beam of two, then one half rest', [beams(staffBody(s3.mei, 3, 1)).map(b => b.length), beams(staffBody(s3.mei, 3, 2)), staffBody(s3.mei, 3, 2).endsWith('</beam><rest dur="2"/></layer>')],
    [[4, 4], [['pl-b3-2-0', 'pl-b3-2-1', 'pl-b3-2-2'], ['pl-b3-2-3', 'pl-b3-2-4']], true]);
  assert('S4: rests break beams (rh ♪ 𝄾 ♪ 𝄾); eighths at 0.5 and 1.0 straddle a beat boundary (lh 𝄾 ♪ ♪ 𝄾) → no beams at all', [count(s4.mei, /<beam>/g), staffBody(s4.mei, 4, 2)],
    [0, '<layer n="1"><rest dur="8"/><note xml:id="pl-b4-2-0" dur="8" pname="c" oct="3"/><note xml:id="pl-b4-2-1" dur="8" pname="d" oct="3"/><rest dur="8"/><note xml:id="pl-b4-2-2" dur="2" pname="e" oct="3"/></layer>']);
  assert('S5 rh layer 2: ♪ <space> ♪ ♪ 𝅗𝅥 → the space breaks like a rest, the beat-2 pair beams, the space stays outside the beam', staffBody(s5.mei, 5, 1),
    '<layer n="1"><note xml:id="pl-b5-1-0" dur="1" pname="g" oct="5"/></layer><layer n="2"><note xml:id="pl-b5-1-1" dur="8" pname="c" oct="5"/><space dur="8"/><beam><note xml:id="pl-b5-1-2" dur="8" pname="d" oct="5"/><note xml:id="pl-b5-1-3" dur="8" pname="e" oct="5"/></beam><note xml:id="pl-b5-1-4" dur="2" pname="f" oct="5"/></layer>');
  assert('S5 lh: ♪♪♪♪ ♩ ♪♪ → one beam of four and one of two', beams(staffBody(s5.mei, 5, 2)).map(b => b.length), [4, 2]);
  const C68 = { key: 'C', time: '6/8', bars: [{ bar: 1, rh: [0, 0.5, 1, 1.5, 2, 2.5].map(t => ev(t, 0.5, ['C5'])), lh: [ev(0, 0.5, ['C3']), ev(0.5, 0.5, ['D3']), ev(1, 1, ['E3']), ev(2, 1, ['F3'])] }] };
  const c68 = toMEI(C68, { from: 1, to: 1 });
  assert('6/8: six eighths → two beams of three; lh ♪ ♪ ♩ ♩ → the quarter from 8th 3 splits at the dotted-quarter beat and ties, the quarter on 8th 5 stays', [c68.warnings, beams(staffBody(c68.mei, 1, 1)).map(b => b.length), staffBody(c68.mei, 1, 2), measureTies(c68.mei, 1)],
    [[], [3, 3], '<layer n="1"><beam><note xml:id="pl-b1-2-0" dur="8" pname="c" oct="3"/><note xml:id="pl-b1-2-1" dur="8" pname="d" oct="3"/><note xml:id="pl-b1-2-2" dur="8" pname="e" oct="3"/></beam><note xml:id="pl-b1-2-3" dur="8" pname="e" oct="3"/><note xml:id="pl-b1-2-4" dur="4" pname="f" oct="3"/></layer>', ['<tie startid="#pl-b1-2-2" endid="#pl-b1-2-3"/>']]);
  const fb = toMEI({ key: 'C', time: '7/8', bars: [{ bar: 1, rh: [ev(0, 1, ['C5']), ev(1, 2, ['D5']), ev(3, 0.5, ['E5'])], lh: [] }] }, { from: 1, to: 1 });
  assert('7/8: staffDef keeps 7/8, the grid falls back to 1-quarter beats with a warning; the half on beat 2 is one value', [count(fb.mei, /meter\.count="7" meter\.unit="8"/g), fb.warnings, count(staffBody(fb.mei, 1, 1), /dur="2"/g)],
    [2, ['meter "7/8" has no beat table; splitting and beaming use 1-quarter beats'], 1]);
  const ovr = toMEI({ key: 'C', time: '4/4', beatsPerBar: 3, bars: [{ bar: 1, rh: [ev(0, 1.5, ['C5']), ev(1.5, 1.5, ['D5'])], lh: [] }] }, { from: 1, to: 1 });
  assert('beatsPerBar 3 under 4/4: fallback grid (no half-bar) with a warning; 1.5:1.5 stays a dotted quarter', [ovr.warnings, count(staffBody(ovr.mei, 1, 1), /dots="1"/g), count(ovr.mei, /<tie /g)],
    [['beatsPerBar 3 overrides 4/4 (4 q); splitting and beaming use 1-quarter beats'], 2, 0]);
  const bad = toMEI({ key: 'C', time: '4/4', bars: [{ bar: 1, rh: [ev(0, 5, ['C5'])], lh: [ev(3, 1, ['C3'])] }] }, { from: 1, to: 1 });
  assert('overrun is clipped and warned; a late first event gets a leading rest (3 q → dotted half, largest first)', [bad.warnings, staffBody(bad.mei, 1, 2)], [['bar 1 rh: event at 0 q runs past the bar, clipped'], '<layer n="1"><rest dur="2" dots="1"/><note xml:id="pl-b1-2-0" dur="4" pname="c" oct="3"/></layer>']);
  let threw = null;
  try { toMEI(PRELUDE, { from: 40, to: 41 }); } catch (e) { threw = e.message; }
  assert('a range outside the piece throws', threw, 'toMEI: no bars in 40..41');

  // ── Lines: norm.lines, the positional default, lineIndexFor ──────
  const barsOf = ns => ({ key: 'C', time: '4/4', bars: ns.map(bar => ({ bar, rh: [rest(0, 4)], lh: [] })) });
  const R = (...pairs) => pairs.map(([from, to]) => ({ from, to }));
  const SIXTEEN = barsOf(Array.from({ length: 16 }, (_, i) => i + 1));
  const FOUR_BY_FOUR = R([1, 4], [5, 8], [9, 12], [13, 16]);
  assert('lineRanges: no norm.lines, 16 bars → four lines of 4, no warnings', lineRanges(SIXTEEN), { ranges: FOUR_BY_FOUR, warnings: [] });
  assert('lineRanges: no norm.lines, 10 bars → the last line is short (9–10)', lineRanges(barsOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).ranges, R([1, 4], [5, 8], [9, 10]));
  assert('lineRanges: lines [1,5,9,13] → as the default; [1,7] → 1–6, 7–16', [lineRanges({ ...SIXTEEN, lines: [1, 5, 9, 13] }).ranges, lineRanges({ ...SIXTEEN, lines: [1, 7] })], [FOUR_BY_FOUR, { ranges: R([1, 6], [7, 16]), warnings: [] }]);
  assert('lineRanges: lines [3,7] (not starting at the first bar) → default chunking + one warning', lineRanges({ ...SIXTEEN, lines: [3, 7] }), { ranges: FOUR_BY_FOUR, warnings: ['lines [3,7] ignored: does not start at the first bar (1); using 4 bars per line'] });
  const reason = r => (/ignored: (.*); using/.exec(r.warnings[0] || '') || [])[1] || null;
  assert('lineRanges: invalid shapes (not an array, empty, non-increasing, past the end, duplicate) → default + one warning each',
    ['1,5', [], [1, 9, 5], [1, 5, 40], [1, 5, 5]].map(lines => { const r = lineRanges({ ...SIXTEEN, lines }); return [r.ranges.length, r.warnings.length, reason(r)]; }),
    [[4, 1, 'not an array'], [4, 1, 'empty'], [4, 1, 'not strictly increasing'], [4, 1, 'names a bar not in the piece (40)'], [4, 1, 'not strictly increasing']]);
  const SPARSE = barsOf([1, 8, 9, 15, 16]);
  assert('lineRanges: non-contiguous fixture bars chunk by position, not by bar arithmetic (2 per line → 1–8, 9–15, 16–16)', lineRanges(SPARSE, { barsPerLine: 2 }).ranges, R([1, 8], [9, 15], [16, 16]));
  assert('lineRanges: explicit lines over non-contiguous bars → 1–8, 9–16', lineRanges({ ...SPARSE, lines: [1, 9] }).ranges, R([1, 8], [9, 16]));
  assert('lineRanges: barsPerLine 1 → one line per bar (today\'s behaviour); 0 / junk → 4', [lineRanges(barsOf([1, 2, 3]), { barsPerLine: 1 }).ranges, lineRanges(SIXTEEN, { barsPerLine: 0 }).ranges.length, lineRanges(SIXTEEN, { barsPerLine: 'x' }).ranges.length], [R([1, 1], [2, 2], [3, 3]), 4, 4]);
  assert('lineRanges: no bars / no norm → no ranges, no warnings', [lineRanges({ bars: [] }), lineRanges(null)], [{ ranges: [], warnings: [] }, { ranges: [], warnings: [] }]);
  assert('lineRanges: the PRELUDE fixture (1–16, no lines) → four lines; lineIndexFor finds bar 9 in line 2', (() => { const r = lineRanges(PRELUDE); return [r.ranges, r.warnings, lineIndexFor(r.ranges, 9)]; })(), [FOUR_BY_FOUR, [], 2]);
  assert('lineIndexFor: first bar → 0, a middle bar → 1, the last bar → 3, outside → -1, empty / junk ranges → -1', [lineIndexFor(FOUR_BY_FOUR, 1), lineIndexFor(FOUR_BY_FOUR, 6), lineIndexFor(FOUR_BY_FOUR, 16), lineIndexFor(FOUR_BY_FOUR, 17), lineIndexFor([], 1), lineIndexFor(null, 1)], [0, 1, 3, -1, -1, -1]);

  // ── Smoke pass over the real prelude norm when present ───────────
  try {
    const fs = await import('node:fs');
    const path = new URL('../private/pieces/prelude-winston-first-16.norm.json', import.meta.url);
    if (fs.existsSync(path)) {
      const norm = JSON.parse(fs.readFileSync(path, 'utf8'));
      const singles = norm.bars.map(b => toMEI(norm, { from: b.bar, to: b.bar }));
      const whole = toMEI(norm, { from: norm.bars[0].bar, to: norm.bars[norm.bars.length - 1].bar });
      const idsOnce = r => Object.keys(r.hits).every(id => count(r.mei, new RegExp(`xml:id="${id}"`, 'g')) === 1);
      assert(`prelude: ${norm.bars.length} bars render singly and as one range, no warnings`, [singles.every(r => r.warnings.length === 0), whole.warnings, singles.every(idsOnce), idsOnce(whole)], [true, [], true, true]);
      assert('prelude: hit counts agree between single bars and the whole range', singles.reduce((s, r) => s + Object.keys(r.hits).length, 0), Object.keys(whole.hits).length);
      assert('prelude (G minor): bar 1 rh D6 2.5 q splits half + 8th, D is diatonic so no ♮ (the fixture is B♭ minor); lh bass clef from bar 9', [staffBody(singles[0].mei, 1, 1), staffDefs(singles[8].mei)],
        ['<layer n="1"><note xml:id="pl-b1-1-0" dur="2" pname="d" oct="6"/><beam><note xml:id="pl-b1-1-1" dur="8" pname="d" oct="6"/><note xml:id="pl-b1-1-2" dur="8" pname="d" oct="6"/></beam></layer>', ['G', 'F']]);
      const by = r => Object.values(r.hits).map(h => [h.id, h.at, h.q, h.tieStop]);
      assert('prelude: lh bars 5–12 (2.5 q from the and-of-1) → 8th at 0.5 tied to half at 1, every bar', [5, 6, 7, 8, 9, 10, 11, 12].map(b => by(singles[b - 1]).filter(h => h[0].startsWith(`pl-b${b}-2-`))),
        [5, 6, 7, 8, 9, 10, 11, 12].map(b => [[`pl-b${b}-2-0`, 0, 0.5, false], [`pl-b${b}-2-1`, 0.5, 0.5, false], [`pl-b${b}-2-2`, 1, 2, true]]));
      assert('prelude: <beam> count per bar (lh beat 1 everywhere but 16; rh beat 3 in 1–4 and 15, two in 11, one in 10 and 12)', norm.bars.map(b => count(staffBody(whole.mei, b.bar, 1), /<beam>/g) + count(staffBody(whole.mei, b.bar, 2), /<beam>/g)),
        [2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 3, 2, 1, 2, 2, 0]);
      const bare = toMEI(norm, { from: norm.bars[0].bar, to: norm.bars[norm.bars.length - 1].bar, beams: false });
      assert('prelude: beams: false → identical hits, identical ties, no <beam>, same MEI once the wrappers are removed', [JSON.stringify(bare.hits) === JSON.stringify(whole.hits), count(bare.mei, /<beam>/g), bare.mei === whole.mei.replace(/<\/?beam>/g, '')], [true, 0, true]);
      const pl = lineRanges(norm);
      assert(`prelude: lines (${'lines' in norm ? 'norm.lines ' + JSON.stringify(norm.lines) : 'default, 4 per line'}) → 1–4, 5–8, 9–12, 13–16, no warnings`, [pl.ranges, pl.warnings], [[{ from: 1, to: 4 }, { from: 5, to: 8 }, { from: 9, to: 12 }, { from: 13, to: 16 }], []]);
    } else console.log('  · static/private/pieces/prelude-winston-first-16.norm.json not present; smoke pass skipped');
  } catch (e) { console.log(`  · smoke pass skipped (${e.message})`); }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
