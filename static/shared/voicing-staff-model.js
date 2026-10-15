/**
 * voicing-staff-model.js
 * ======================
 * Bar model and MEI converter for the /voicings staff panel. Pure functions,
 * no DOM: Node-runnable like voicing-analysis.js.
 *
 *   buildBarModel(progression, barNumber, { split })  → model (see below)
 *   toMEI(model, colors)                               → one-measure MEI string
 *   SPLIT_MIDI                                         → 64 (E4): voicing notes at or
 *                                                        above it go to the treble staff
 *   splitDur(quarters)                                 → notation values (exported for tests)
 *   selfTest()                                         → console report, { passed, total }
 *
 * Grand staff layout:
 *   treble  layer 1 = melody (stems up)         layer 2 = upper voicing (stems down)
 *   bass    layer 1 = lower voicing (stems up)  layer 2 = bass (stems down)
 * A voice that is all rests is dropped when the other voice on its staff
 * sounds. A second-voice rest coinciding with a first-voice rest is hidden.
 *
 * Ties. Outgoing ties are drawn only when the same pitch sounds at beat 0 of
 * the next bar (or of the next event in this bar); a flagged note with no
 * match goes to model.warnings instead. The last bar draws unmatched ties.
 * Incoming ties use the same matching against the previous bar's last event.
 * "Previous" and "next" are the performance neighbours — the bars around
 * the bar's first occurrence in form.playOrder — so a second ending follows
 * the bar before the first ending; without a playOrder, written order.
 *
 * Bass voice. When the bar carries a bassLine (schema v1, optional), the bass
 * staff's second voice is drawn from it as written — held basses under later
 * chord attacks, walks under a sustained chord — and comp[].bass is ignored
 * for layout. Without a bassLine the bass voice falls back to comp[].bass at
 * each comp event. Bass ties match the neighbours' bassLine the same way.
 *
 * Accidentals carry per letter + octave per staff within the bar, key-aware;
 * tied-in notes show none.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/shared/voicing-staff-model.js').then(m => m.selfTest())"
 */

import { parseNote } from './voicing-analysis.js';

const SPLIT_MIDI = 64;
const EPS = 0.01;   // beats in the data are rounded to 4 decimals (triplets: 0.3333)

const DEFAULT_COLORS = { bass: '#D4A03C', voicing: '#3A8BC9', melody: '#4CAF50' };

// ════════════════════════════════════════════════════════════════════
// DURATIONS, KEYS
// ════════════════════════════════════════════════════════════════════

/** [quarters, value, dots, tuplet] — longest first. Tuplet entries are triplet eighths/quarters. */
const DUR_TABLE = [
  [4, 'w', 0], [3, 'h', 1], [2, 'h', 0], [1.5, 'q', 1], [1, 'q', 0], [0.75, '8', 1],
  [2 / 3, 'q', 0, true], [0.5, '8', 0], [1 / 3, '8', 0, true], [0.25, '16', 0],
];

/** Quarters → [{ q, dur, dots, tuplet }], greedy longest-first. */
function splitDur(quarters) {
  const out = [];
  let rem = quarters;
  while (rem > EPS) {
    const hit = DUR_TABLE.find(([v]) => v <= rem + EPS);
    if (!hit) break;
    out.push({ q: hit[0], dur: hit[1], dots: hit[2], tuplet: !!hit[3] });
    rem -= hit[0];
  }
  return out;
}

const KEY_FIFTHS = { 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F♯': 6, 'C♯': 7,
                     'F': -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER  = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

function keyAccidentals(fifths) {
  const m = {};
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach(l => (m[l] = 1));
  else FLAT_ORDER.slice(0, -fifths).forEach(l => (m[l] = -1));
  return m;
}

const midiOf = name => parseNote(name).midi;
const lastOf = list => (list && list.length ? list[list.length - 1] : null);
const firstAtZero = list => (list && list.length && Math.abs(list[0].beat) < EPS ? list[0] : null);
const compMidis = ev => new Set([ev.bass, ...(ev.voicing || [])].map(midiOf));

// ════════════════════════════════════════════════════════════════════
// VOICE LAYOUT
// ════════════════════════════════════════════════════════════════════

/**
 * Lay one voice out across the bar: rests fill the gaps, odd durations split
 * into tied pieces, triplets are grouped.
 * items: [{ beat, dur, src, notes: [{ name, tieIn, tieOut }] }]
 *   tieOut: 'bar' (into the next bar) | 'next' (into the next event here) | null
 * events: [{ beat, q, dur, dots, tuplet, rest, hidden?, wholeBar?, src?, notes }]
 */
function layoutVoice(items, { beatsPerBar, bar, voice, role }) {
  const out = [];
  let cursor = 0, n = 0;
  const pushRests = (from, q) => {
    let c = from;
    for (const d of splitDur(q)) { out.push({ beat: c, ...d, rest: true, notes: [] }); c += d.q; }
  };
  for (const it of items.slice().sort((a, b) => a.beat - b.beat)) {
    if (it.beat > cursor + EPS) pushRests(cursor, it.beat - cursor);
    const parts = splitDur(it.dur);
    let c = it.beat;
    const pieces = parts.map((d, pi) => {
      const notes = it.notes.map(src => {
        const p = parseNote(src.name);
        return {
          name: src.name, letter: p.letter, acc: p.acc, octave: p.octave, midi: p.midi, pc: p.pc, role,
          id: `vs-b${bar}-${voice}-${n++}`,
          tieIn: pi === 0 && !!src.tieIn,
          tieOut: pi === parts.length - 1 ? (src.tieOut || null) : null,
          tieNext: null,
          accidShow: null,
        };
      });
      const ev = { beat: c, ...d, rest: false, notes, src: pi === 0 ? it.src : undefined };
      c += d.q;
      return ev;
    });
    // Tied pieces of one split duration.
    for (let i = 0; i < pieces.length - 1; i++) pieces[i].notes.forEach((nt, k) => { nt.tieNext = pieces[i + 1].notes[k].id; });
    out.push(...pieces);
    cursor = it.beat + it.dur;
  }
  if (cursor < beatsPerBar - EPS) pushRests(cursor, beatsPerBar - cursor);
  if (out.length === 1 && out[0].rest) out[0].wholeBar = true;
  groupTuplets(out);
  linkInternalTies(out);
  return out;
}

/** Consecutive tuplet-valued events form one triplet group per beat. */
function groupTuplets(events) {
  let start = -1, sum = 0;
  const close = (end) => { events[start].tupletStart = true; events[end].tupletEnd = true; start = -1; };
  events.forEach((ev, i) => {
    if (ev.tuplet) {
      if (start < 0) { start = i; sum = 0; }
      sum += ev.q;
      if (sum >= 1 - EPS) close(i);
    } else if (start >= 0) close(i - 1);
  });
  if (start >= 0) close(events.length - 1);
}

/** tieOut 'next' → the matching pitch in the next sounding event of the voice. */
function linkInternalTies(events) {
  const sounding = events.filter(e => !e.rest);
  sounding.forEach((ev, i) => {
    for (const nt of ev.notes) {
      if (nt.tieOut !== 'next') continue;
      const target = sounding[i + 1] && sounding[i + 1].notes.find(x => x.midi === nt.midi);
      nt.tieOut = null;
      if (target) nt.tieNext = target.id;
    }
  });
}

/** Hide a second-voice rest that coincides exactly with a first-voice rest. */
function dedupeRests(primary, secondary) {
  for (const ev of secondary) {
    if (ev.rest && primary.some(p => p.rest && Math.abs(p.beat - ev.beat) < EPS && Math.abs(p.q - ev.q) < EPS)) ev.hidden = true;
  }
}

/** Key-aware accidental display per staff, chronological, keyed by letter + octave. */
function markAccidentals(voices, keyAcc) {
  const state = {};
  const events = voices.flat().filter(e => !e.rest).sort((a, b) => a.beat - b.beat);
  for (const ev of events) for (const n of ev.notes) {
    const k = n.letter + n.octave;
    const current = k in state ? state[k] : (keyAcc[n.letter] || 0);
    if (n.tieIn) { state[k] = n.acc; continue; }
    if (n.acc !== current) { n.accidShow = n.acc; state[k] = n.acc; }
  }
}

/** [prevBar, nextBar] around the bar's first occurrence in form.playOrder; written order without one. */
function performanceNeighbours(progression, barNumber) {
  const order = progression.form && Array.isArray(progression.form.playOrder) && progression.form.playOrder.length
    ? progression.form.playOrder : (progression.bars || []).map(b => b.bar);
  const i = order.indexOf(barNumber);
  if (i < 0) return [null, null];
  return [i > 0 ? order[i - 1] : null, i < order.length - 1 ? order[i + 1] : null];
}

/** Chord symbols for the bar; an empty symbols[] holds the previous symbol. */
function barSymbols(bars, idx) {
  const own = bars[idx].symbols;
  if (own && own.length) return own.map(s => ({ beat: s.beat, text: s.symbol, hold: false }));
  for (let i = idx - 1; i >= 0; i--) {
    const s = bars[i].symbols;
    if (s && s.length) return [{ beat: 0, text: s[s.length - 1].symbol, hold: true }];
  }
  return [];
}

// ════════════════════════════════════════════════════════════════════
// BAR MODEL
// ════════════════════════════════════════════════════════════════════

/**
 * @param {object} progression  schema v1 document
 * @param {number} barNumber
 * @param {{ split?: number }} [options]  MIDI split between lower and upper voicing (default SPLIT_MIDI)
 * @returns {object|null} model, or null when the bar is absent
 */
function buildBarModel(progression, barNumber, { split = SPLIT_MIDI } = {}) {
  const bars = progression.bars || [];
  const idx = bars.findIndex(b => b.bar === barNumber);
  if (idx < 0) return null;
  const bar = bars[idx];
  const [prevNum, nextNum] = performanceNeighbours(progression, barNumber);
  const byNum = n => (n == null ? null : bars.find(b => b.bar === n) || null);
  const prev = byNum(prevNum), next = byNum(nextNum);
  const [count, unit] = String(progression.timeSignature || '4/4').split('/').map(Number);
  const beatsPerBar = progression.beatsPerBar || count;
  const keyName = String(progression.key || 'C').replace('#', '♯').replace(/b$/, '♭');
  const keyFifths = KEY_FIFTHS[keyName] ?? 0;
  const warnings = [];

  // Tie matching sets. null target = last bar, draw unmatched.
  const prevComp = lastOf(prev && prev.comp), prevMel = lastOf(prev && prev.melody);
  const compIn = prevComp && prevComp.tie ? compMidis(prevComp) : new Set();
  const melIn  = prevMel && prevMel.tie ? midiOf(prevMel.note) : null;
  const nextComp = firstAtZero(next && next.comp), nextMel = firstAtZero(next && next.melody);
  const compOut = next ? (nextComp ? compMidis(nextComp) : new Set()) : null;
  const melOut  = next ? (nextMel ? new Set([midiOf(nextMel.note)]) : new Set()) : null;

  const tieOutFor = (flagged, midi, targets, isLast, role, name) => {
    if (!flagged) return null;
    if (!isLast) return 'next';
    if (targets === null || targets.has(midi)) return 'bar';
    warnings.push(`bar ${barNumber}: ${role} ${name} is tied but bar ${next.bar} has no ${name} at beat 0 — tie not drawn`);
    return null;
  };

  const bassItems = [], lowerItems = [], upperItems = [], melItems = [];
  const comp = bar.comp || [], melody = bar.melody || [];
  const bassLine = Array.isArray(bar.bassLine) ? bar.bassLine : null;
  // With a bassLine, comp.bass is normally a bass-voice note already drawn there.
  // When it is not (the exporter's "lowest chord note" fallback), it is a chord
  // note and must be drawn with the voicing.
  const prevBassCarry = (() => {
    if (!bassLine || !prev) return null;
    const last = Array.isArray(prev.bassLine) ? lastOf(prev.bassLine) : null;
    return last && (last.tie || Math.abs(last.beat + last.dur - beatsPerBar) < EPS) ? midiOf(last.note) : null;
  })();
  const bassFromLine = (ev) => {
    const prior = bassLine.filter(b => b.beat <= ev.beat + EPS);
    const m = prior.length ? midiOf(prior[prior.length - 1].note) : prevBassCarry;
    return m != null && m === midiOf(ev.bass);
  };
  comp.forEach((ev, i) => {
    const isFirst = i === 0 && Math.abs(ev.beat) < EPS, isLast = i === comp.length - 1;
    const note = (name, role) => {
      const m = midiOf(name);
      return { name, tieIn: isFirst && compIn.has(m), tieOut: tieOutFor(ev.tie, m, compOut, isLast, role, name) };
    };
    if (!bassLine) bassItems.push({ beat: ev.beat, dur: ev.dur, src: i, notes: [note(ev.bass, 'bass')] });
    const lower = [], upper = [];
    const chordNotes = bassLine && ev.bass != null && !bassFromLine(ev) ? [ev.bass, ...(ev.voicing || [])] : (ev.voicing || []);
    for (const name of chordNotes) (midiOf(name) >= split ? upper : lower).push(note(name, 'voicing'));
    if (lower.length) lowerItems.push({ beat: ev.beat, dur: ev.dur, src: i, notes: lower });
    if (upper.length) upperItems.push({ beat: ev.beat, dur: ev.dur, src: i, notes: upper });
  });
  if (bassLine) {
    // Bass ties match the neighbours' bassLine; a neighbour without one offers its comp bass.
    const prevBL = !prev ? null : Array.isArray(prev.bassLine) ? lastOf(prev.bassLine) : (prevComp ? { note: prevComp.bass, tie: prevComp.tie } : null);
    const nextBL = !next ? null : Array.isArray(next.bassLine) ? firstAtZero(next.bassLine) : (nextComp ? { note: nextComp.bass } : null);
    const blIn  = prevBL && prevBL.tie ? midiOf(prevBL.note) : null;
    const blOut = next ? (nextBL ? new Set([midiOf(nextBL.note)]) : new Set()) : null;
    bassLine.forEach((ev, i) => {
      const m = midiOf(ev.note);
      bassItems.push({ beat: ev.beat, dur: ev.dur, notes: [{
        name: ev.note, tieIn: i === 0 && Math.abs(ev.beat) < EPS && m === blIn,
        tieOut: tieOutFor(ev.tie, m, blOut, i === bassLine.length - 1, 'bass', ev.note),
      }] });
    });
  }
  melody.forEach((ev, i) => {
    const m = midiOf(ev.note);
    melItems.push({ beat: ev.beat, dur: ev.dur, notes: [{
      name: ev.note, tieIn: i === 0 && Math.abs(ev.beat) < EPS && m === melIn,
      tieOut: tieOutFor(ev.tie, m, melOut, i === melody.length - 1, 'melody', ev.note),
    }] });
  });

  const lay = (items, voice, role) => layoutVoice(items, { beatsPerBar, bar: barNumber, voice, role });
  const voices = {
    melody: lay(melItems, 'melody', 'melody'),
    upper:  lay(upperItems, 'upper', 'voicing'),
    lower:  lay(lowerItems, 'lower', 'voicing'),
    bass:   lay(bassItems, 'bass', 'bass'),
  };
  dedupeRests(voices.melody, voices.upper);
  dedupeRests(voices.lower, voices.bass);
  const keyAcc = keyAccidentals(keyFifths);
  markAccidentals([voices.melody, voices.upper], keyAcc);
  markAccidentals([voices.lower, voices.bass], keyAcc);

  // Arpeggiated comp events → id lists across the voicing voices plus the bass
  // note sounding at (or most recently before) the chord onset.
  const bassAt = beat => {
    if (!bassLine) return null;
    const prior = voices.bass.filter(e => !e.rest && e.beat <= beat + EPS);
    return prior.length ? prior[prior.length - 1] : null;
  };
  const arps = comp.map((ev, i) => {
    if (!ev.arp) return null;
    const ids = [voices.bass, voices.lower, voices.upper].flat().filter(e => e.src === i).flatMap(e => e.notes.map(n => n.id));
    const b = bassAt(ev.beat);
    if (b) ids.unshift(...b.notes.map(n => n.id));
    return ids;
  }).filter(ids => ids && ids.length);

  return {
    bar: barNumber, section: bar.section, source: bar.source,
    keyName, keyFifths, meter: { count, unit }, beatsPerBar,
    symbols: barSymbols(bars, idx),
    arps, arp: arps.length > 0,
    voices, split, bassFrom: bassLine ? 'bassLine' : 'comp',
    prev: prev ? prev.bar : null, next: next ? next.bar : null,
    warnings,
  };
}

// ════════════════════════════════════════════════════════════════════
// MEI
// ════════════════════════════════════════════════════════════════════

const MEI_DUR = { w: 1, h: 2, q: 4, '8': 8, '16': 16 };
const ACCID   = { '-2': 'ff', '-1': 'f', '0': 'n', '1': 's', '2': 'ss' };

function keysig(fifths) { return fifths > 0 ? `${fifths}s` : fifths < 0 ? `${-fifths}f` : '0'; }

function noteXML(n, colors, durAttrs = '') {
  const a = [`xml:id="${n.id}"`, durAttrs, `pname="${n.letter.toLowerCase()}"`, `oct="${n.octave}"`, `color="${colors[n.role]}"`];
  if (n.accidShow != null) a.push(`accid="${ACCID[n.accidShow]}"`);
  else if (n.acc) a.push(`accid.ges="${ACCID[n.acc]}"`);
  return `<note ${a.filter(Boolean).join(' ')}/>`;
}

function eventXML(ev, colors) {
  const d = `dur="${MEI_DUR[ev.dur]}"${ev.dots ? ` dots="${ev.dots}"` : ''}`;
  let xml;
  if (ev.rest) xml = ev.hidden ? `<space ${d}/>` : ev.wholeBar ? '<mRest/>' : `<rest ${d}/>`;
  else if (ev.notes.length === 1) xml = noteXML(ev.notes[0], colors, d);
  else xml = `<chord ${d}>${ev.notes.map(n => noteXML(n, colors)).join('')}</chord>`;
  return (ev.tupletStart ? '<tuplet num="3" numbase="2">' : '') + xml + (ev.tupletEnd ? '</tuplet>' : '');
}

const hasSound = events => events.some(e => !e.rest);

/** Two layers when both sound; one layer when the other voice is all rests. */
function staffXML(n, primary, secondary, colors) {
  const layers = [];
  if (hasSound(primary) || !hasSound(secondary)) layers.push(primary);
  if (hasSound(secondary)) layers.push(secondary);
  return `<staff n="${n}">${layers.map((evs, i) => `<layer n="${i + 1}">${evs.map(e => eventXML(e, colors)).join('')}</layer>`).join('')}</staff>`;
}

/**
 * @param {object} model   from buildBarModel
 * @param {{ bass?: string, voicing?: string, melody?: string }} [colors]  CSS colors per role
 */
function toMEI(model, colors = {}) {
  const c = { ...DEFAULT_COLORS, ...colors };
  const { voices: v, meter, keyFifths, beatsPerBar } = model;
  const ks = keysig(keyFifths);
  const staffDef = (n, shape, line) =>
    `<staffDef n="${n}" lines="5" clef.shape="${shape}" clef.line="${line}" keysig="${ks}" meter.count="${meter.count}" meter.unit="${meter.unit}"/>`;

  const controls = [];
  for (const s of model.symbols) controls.push(`<harm staff="1" tstamp="${s.beat + 1}" place="above">${s.text}${s.hold ? ' (hold)' : ''}</harm>`);
  for (const ids of model.arps) controls.push(`<arpeg plist="${ids.map(id => '#' + id).join(' ')}" order="up"/>`);
  for (const ev of Object.values(v).flat()) for (const n of ev.notes) {
    if (n.tieIn)  controls.push(`<tie tstamp="0" endid="#${n.id}"/>`);
    if (n.tieNext) controls.push(`<tie startid="#${n.id}" endid="#${n.tieNext}"/>`);
    if (n.tieOut === 'bar') controls.push(`<tie startid="#${n.id}" tstamp2="0m+${beatsPerBar + 1}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>bar ${model.bar}</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp symbol="brace" bar.thru="true">${staffDef(1, 'G', 2)}${staffDef(2, 'F', 4)}</staffGrp></scoreDef>
    <section><measure right="single">
      ${staffXML(1, v.melody, v.upper, c)}
      ${staffXML(2, v.lower, v.bass, c)}
      ${controls.join('\n      ')}
    </measure></section>
  </score></mdiv></body></music>
</mei>`;
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { buildBarModel, toMEI, splitDur, SPLIT_MIDI, DEFAULT_COLORS, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/shared/voicing-staff-model.js').then(m => m.selfTest())"
//
// Runs a synthetic three-bar progression, then a smoke pass over
// tests/fixtures/voicing-fixture.json, then static/private/dont-be-sad.json
// when that file exists.

async function selfTest() {
  const fs = await import('node:fs');
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const names = evs => evs.map(e => e.rest ? (e.hidden ? '(rest)' : e.wholeBar ? 'REST' : 'rest') : e.notes.map(n => n.name).join('+'));
  const vals  = evs => evs.map(e => e.dur + '.'.repeat(e.dots) + (e.tuplet ? '³' : ''));
  const flagged = (evs, key) => evs.flatMap(e => e.notes).filter(n => n[key]).map(n => n.name);
  const accid = evs => evs.flatMap(e => e.notes).map(n => `${n.name}:${n.accidShow == null ? '-' : ACCID[n.accidShow]}`);
  const count = (s, re) => (s.match(re) || []).length;

  console.log('\n─── voicing-staff-model.js self-test ───\n');

  // ── Synthetic: G major, 3/4 ──────────────────────────────────────
  const SYN = {
    schemaVersion: 1, title: 'synthetic', key: 'G', timeSignature: '3/4', beatsPerBar: 3, tempo: 100,
    bars: [
      { bar: 1, section: 'T', source: 'user', symbols: [{ beat: 0, symbol: 'Gm7/F' }], annotation: null,
        comp: [{ beat: 1, dur: 2, bass: 'F3', voicing: ['B♭3', 'D4', 'A4'], tie: true }], melody: [] },
      { bar: 2, section: 'T', source: 'user', symbols: [{ beat: 0, symbol: 'Cmaj7' }], annotation: null,
        comp: [{ beat: 0, dur: 3, bass: 'C3', voicing: ['G3', 'E4', 'F4'], tie: true }],
        melody: [{ beat: 0, dur: 1, note: 'B♭4' }, { beat: 1, dur: 1, note: 'B♭3' },
                 { beat: 2, dur: 0.3333, note: 'G4' }, { beat: 2.3333, dur: 0.3333, note: 'A4' }, { beat: 2.6667, dur: 0.3333, note: 'G4', tie: true }] },
      { bar: 3, section: 'T', source: 'user', symbols: [], annotation: null,
        comp: [{ beat: 0, dur: 3, bass: 'C3', voicing: ['G3', 'E4', 'F4'], tie: true }],
        melody: [{ beat: 0, dur: 3, note: 'G4', tie: true }] },
    ],
  };
  const b1 = buildBarModel(SYN, 1), b2 = buildBarModel(SYN, 2), b3 = buildBarModel(SYN, 3);
  const m1 = toMEI(b1), m2 = toMEI(b2), m3 = toMEI(b3);

  console.log('  synthetic: bar 1 (first bar, leading rest, empty melody, unmatched tie out)');
  assert('SPLIT_MIDI = 64',                               SPLIT_MIDI, 64);
  assert('bar 1 has no previous bar',                     b1.prev, null);
  assert('split 64: lower B♭3+D4, upper A4',              [names(b1.voices.lower), names(b1.voices.upper)], [['rest', 'B♭3+D4'], ['rest', 'A4']]);
  assert('split 60 moves D4 to the upper voice',          names(buildBarModel(SYN, 1, { split: 60 }).voices.upper), ['rest', 'D4+A4']);
  assert('leading rest: quarter rest then half',          vals(b1.voices.lower), ['q', 'h']);
  assert('bass rest coincides with lower rest → hidden',  names(b1.voices.bass), ['(rest)', 'F3']);
  assert('empty melody → whole-bar rest',                 [names(b1.voices.melody), !!b1.voices.melody[0].wholeBar], [['REST'], true]);
  assert('MEI: all-rest melody dropped, treble has the upper voice alone', [count(m1, /<mRest\/>/g), count(m1, /<layer n="2">/g)], [0, 1]);
  assert('MEI: no upper voicing → melody whole-bar rest as <mRest/>', (() => { const m = toMEI(buildBarModel(SYN, 1, { split: 80 })); return [count(m, /<mRest\/>/g), count(m, /<layer n="2">/g)]; })(), [1, 1]);
  assert('MEI: hidden rest is a <space>',                 count(m1, /<space /g), 1);
  assert('no incoming ties in bar 1',                     flagged(Object.values(b1.voices).flat(), 'tieIn'), []);
  assert('tie flagged but bar 2 has none of these pitches → no tie, 4 warnings',
         [flagged(Object.values(b1.voices).flat(), 'tieOut').length, b1.warnings.length, count(m1, /<tie /g)], [0, 4, 0]);
  assert('warning names the pitch and the next bar',      /bass F3 is tied but bar 2/.test(b1.warnings[0]), true);
  assert('accidentals in G: F3 natural, B♭3 flat, D4/A4 none', accid(b1.voices.bass).concat(accid(b1.voices.lower), accid(b1.voices.upper)),
         ['F3:n', 'B♭3:f', 'D4:-', 'A4:-']);
  assert('chord symbol as <harm>',                        /<harm staff="1" tstamp="1" place="above">Gm7\/F<\/harm>/.test(m1), true);

  console.log('  synthetic: bar 2 (matched ties out, octave-specific accidentals, triplet)');
  assert('comp tie → bar 3 has all four pitches at beat 0: 4 ties out', flagged([...b2.voices.bass, ...b2.voices.lower, ...b2.voices.upper], 'tieOut'), ['C3', 'G3', 'E4', 'F4']);
  assert('melody G4 tied → bar 3 melody starts on G4: tie out',       flagged(b2.voices.melody, 'tieOut'), ['G4']);
  assert('no warnings when every tie matches',             b2.warnings, []);
  assert('MEI: 5 ties out to the bar line',                count(m2, /<tie startid="#[^"]+" tstamp2="0m\+4"\/>/g), 5);
  assert('B♭4 and B♭3 on the treble both show a flat; second B♭4 would not', accid(b2.voices.melody).slice(0, 2), ['B♭4:f', 'B♭3:f']);
  assert('upper F4 shows a natural (key has F♯)',          accid(b2.voices.upper), ['G3:-', 'E4:-', 'F4:n'].slice(1)); // upper is E4, F4
  assert('dotted half: dur h, dots 1',                      vals(b2.voices.bass), ['h.']);
  assert('triplet: three tuplet eighths grouped',           vals(b2.voices.melody), ['q', 'q', '8³', '8³', '8³']);
  assert('triplet group start/end on first/last eighth',    [b2.voices.melody[2].tupletStart, b2.voices.melody[4].tupletEnd, !!b2.voices.melody[3].tupletStart], [true, true, false]);
  assert('MEI: one <tuplet num="3" numbase="2">',           count(m2, /<tuplet num="3" numbase="2">/g), 1);

  console.log('  synthetic: bar 3 (last bar, ties in, unmatched ties out drawn)');
  assert('bar 3 has no next bar',                           b3.next, null);
  assert('ties in on all four comp notes and the melody',   flagged(Object.values(b3.voices).flat(), 'tieIn'), ['G4', 'E4', 'F4', 'G3', 'C3']);
  assert('last bar: flagged ties out drawn without a match', flagged(Object.values(b3.voices).flat(), 'tieOut').length, 5);
  assert('MEI: 5 ties in from the bar line, 5 out',         [count(m3, /<tie tstamp="0" endid=/g), count(m3, /tstamp2="0m\+4"/g)], [5, 5]);
  assert('tied-in F4 shows no accidental',                  accid(b3.voices.upper), ['E4:-', 'F4:-']);
  assert('empty symbols[] holds Cmaj7',                     b3.symbols, [{ beat: 0, text: 'Cmaj7', hold: true }]);
  assert('absent bar → null',                               buildBarModel(SYN, 9), null);
  const FORM = { ...SYN, form: { repeats: [[1, 2]], endings: { '1': [2, 2], '2': [3, 3] }, playOrder: [1, 2, 1, 3] } };
  assert('performance neighbours: 2nd ending (bar 3) follows bar 1, bar 2 leads back to bar 1',
         [buildBarModel(FORM, 3).prev, buildBarModel(FORM, 2).next, buildBarModel(FORM, 1).prev], [1, 1, null]);
  assert('ties in bar 3 then match bar 1\'s tie, not bar 2\'s',   flagged(Object.values(buildBarModel(FORM, 3).voices).flat(), 'tieIn'), []);

  console.log('  durations');
  assert('splitDur(2.5) = h + 8',                           splitDur(2.5).map(d => d.dur), ['h', '8']);
  assert('split pieces are tied internally',                (() => { const m = buildBarModel({ ...SYN, bars: [{ ...SYN.bars[0], comp: [{ beat: 0, dur: 2.5, bass: 'C3', voicing: ['E3'] }] }] }, 1);
                                                               return [vals(m.voices.bass), !!m.voices.bass[0].notes[0].tieNext]; })(), [['h', '8', '8'], true]);

  // ── bassLine: bass voice from the bar's bassLine when present ────
  console.log('  bassLine');
  const BL = { ...SYN, bars: [
    { bar: 1, section: 'T', source: 'user', symbols: [{ beat: 0, symbol: 'Cmaj7' }], annotation: null,
      comp: [{ beat: 1, dur: 1, bass: 'C3', voicing: ['E4', 'G4'] }, { beat: 2, dur: 1, bass: 'C3', voicing: ['F4', 'A4'], arp: true }],
      bassLine: [{ beat: 0, dur: 3, note: 'C3', tie: true }], melody: [] },
    { bar: 2, section: 'T', source: 'user', symbols: [], annotation: null,
      comp: [{ beat: 0, dur: 1, bass: 'C3', voicing: ['E4'] }],
      bassLine: [{ beat: 0, dur: 1, note: 'C3' }, { beat: 1, dur: 1, note: 'D3' }, { beat: 2, dur: 1, note: 'E3' }], melody: [] },
  ] };
  const l1 = buildBarModel(BL, 1), l2 = buildBarModel(BL, 2);
  assert('held bass under two chords: one dotted half at beat 0',  [names(l1.voices.bass), vals(l1.voices.bass), l1.bassFrom], [['C3'], ['h.'], 'bassLine']);
  assert('chords still rest at beat 0 in their own voice',           names(l1.voices.upper), ['rest', 'E4+G4', 'F4+A4']);
  assert('bass tie out matched by bar 2\'s bassLine at beat 0',     [flagged(l1.voices.bass, 'tieOut'), l1.warnings], [['C3'], []]);
  assert('bar 2 bass tie in',                                        flagged(l2.voices.bass, 'tieIn'), ['C3']);
  assert('walk under one chord: three bass notes',                   names(l2.voices.bass), ['C3', 'D3', 'E3']);
  assert('arp on the second chord spans F4+A4 and the held bass',    l1.arps.map(ids => ids.length), [3]);
  assert('MEI: bass layer starts with the note, no leading rest',    /<layer n="[12]"><note [^>]*pname="c" oct="3"/.test(toMEI(l1)), true);
  const noBL = { ...BL, bars: BL.bars.map(({ bassLine, ...rest }) => rest) };
  assert('without bassLine: comp path, bass re-struck per event',    [names(buildBarModel(noBL, 1).voices.bass), buildBarModel(noBL, 1).bassFrom], [['rest', 'C3', 'C3'], 'comp']);

  // ── Fixture smoke pass ───────────────────────────────────────────
  const fixURL = new URL('../../tests/fixtures/voicing-fixture.json', import.meta.url);
  const fixture = JSON.parse(fs.readFileSync(fixURL, 'utf8'));
  console.log('\n  fixture: tests/fixtures/voicing-fixture.json');
  const sums = fixture.bars.map(b => { const m = buildBarModel(fixture, b.bar); return Object.values(m.voices).every(v => Math.abs(v.reduce((s, e) => s + e.q, 0) - m.beatsPerBar) < EPS); });
  assert('every voice of every bar sums to beatsPerBar',    sums.every(Boolean), true);
  assert('4/4 empty melody is a whole-bar rest',            names(buildBarModel(fixture, 1).voices.melody), ['REST']);
  assert('bar 5 (two comp events) lays out both',           buildBarModel(fixture, 5).voices.bass.filter(e => !e.rest).length, 2);
  assert('every bar converts to MEI with a brace',          fixture.bars.every(b => /symbol="brace"/.test(toMEI(buildBarModel(fixture, b.bar)))), true);

  // ── Rag fixture (public): Maple Leaf Rag A strain ───────────────
  const ragURL = new URL('../../tests/fixtures/voicing-maple-leaf-rag.json', import.meta.url);
  if (fs.existsSync(ragURL)) {
    console.log('\n  rag: tests/fixtures/voicing-maple-leaf-rag.json');
    const rag = JSON.parse(fs.readFileSync(ragURL, 'utf8'));
    const R = n => buildBarModel(rag, n);
    assert('17 bars in 2/4, every voice of every bar sums to 2 beats',
      [rag.bars.length, rag.bars.every(b => Object.values(R(b.bar).voices).every(v => Math.abs(v.reduce((s, e) => s + e.q, 0) - 2) < EPS))], [17, true]);
    assert('bar 1: oom-pah bass from bassLine (two eighths), chords on the off-beats',
      [vals(R(1).voices.bass), names(R(1).voices.lower)], [['8', 'q', '8'], ['rest', 'E♭3+A♭3+C4', 'E♭3+A♭3+C4', 'rest']]);
    assert('bar 1: bassLine keeps the lower note of the octave',    names(R(1).voices.bass).filter(x => x !== 'rest'), ['A♭2', 'A2']);
    assert('bar 9: chords on every eighth, no bass voice (empty bassLine → whole-bar rest)', [R(9).bassFrom, names(R(9).voices.bass)], ['bassLine', ['REST']]);
    assert('bar 9: the fallback bass D4 is drawn with the chord (below the E4 split, so on the bass staff)', [names(R(9).voices.lower), names(R(9).voices.upper)[0]], [['D4', 'D4', 'D4', 'D4'], 'F4+A♭4+B4']);
    assert('bar 17: fallback basses E♭3, E♭3, A♭3 drawn with their chords',   names(R(17).voices.lower).filter(x => x !== 'rest'), ['E♭3+A♭3+C4', 'E♭3+G3+D♭4', 'A♭3+C4']);
    assert('bar 1: the looked-back bass A♭2 is not duplicated into the chords', names(R(1).voices.lower).filter(x => x !== 'rest'), ['E♭3+A♭3+C4', 'E♭3+A♭3+C4']);
    assert('bar 2: melody tie within the bar is one event, no warnings', [names(R(2).voices.melody).length, R(2).warnings], [5, []]);
    assert('endings: 16 leads back to 1, 17 follows 15 and ends',      [R(16).next, R(17).prev, R(17).next], [1, 15, null]);
    const ragWarnings = rag.bars.flatMap(b => R(b.bar).warnings);
    assert('no tie warnings across the strain',                        ragWarnings, []);
  } else {
    console.log('\n  rag: tests/fixtures/voicing-maple-leaf-rag.json not present — skipped');
  }

  // ── Acceptance: Don't Be Sad (private, optional) ─────────────────
  const privURL = new URL('../private/dont-be-sad.json', import.meta.url);
  if (fs.existsSync(privURL)) {
    console.log('\n  acceptance: static/private/dont-be-sad.json');
    const prog = JSON.parse(fs.readFileSync(privURL, 'utf8'));
    const B = n => buildBarModel(prog, n);
    const sound = evs => evs.filter(e => !e.rest).reduce((s, e) => s + e.notes.length, 0);
    assert('bar 2: comp only, leading rest, melody whole-bar rest', [vals(B(2).voices.lower), names(B(2).voices.melody)], [['q', 'h'], ['REST']]);
    assert('bar 17: 4-note arpeggio (was 5: the D4 octave doubling of the bass no longer joins the voicing)', B(17).arps.map(ids => ids.length), [4]);
    assert('bar 17: melody tie out matched in bar 18',          [flagged(B(17).voices.melody, 'tieOut').length, B(17).warnings], [1, []]);
    assert('bar 19: 1 tie in (melody), 5 ties out',             [flagged(Object.values(B(19).voices).flat(), 'tieIn').length, flagged(Object.values(B(19).voices).flat(), 'tieOut').length], [1, 5]);
    assert('bar 10: triplet on beat 3',                         vals(B(10).voices.melody), ['h', '8³', '8³', '8³']);
    assert('bar 26: two comp events, 6 comp notes (one held bass, was 7 re-struck before bassLine)', sound(B(26).voices.bass) + sound(B(26).voices.lower) + sound(B(26).voices.upper), 6);
    assert('bar 1: no previous, no ties in',                    [B(1).prev, flagged(Object.values(B(1).voices).flat(), 'tieIn')], [null, []]);
    if (prog.bars.every(b => Array.isArray(b.bassLine))) {
      assert('bassLine: bars 25–27 bass is a dotted half on the downbeat', [25, 26, 27].map(n => vals(B(n).voices.bass)), [['h.'], ['h.'], ['h.']]);
      assert('bassLine: bar 26 bass is one note under two chords',  [names(B(26).voices.bass), names(B(26).voices.lower)], [['F2'], ['rest', 'A3+D4', 'A♭3+D4']]);
      assert('bassLine: bar 20 walk draws four bass notes',          vals(B(20).voices.bass), ['q', 'q', '8', '8']);
      assert('bassLine: bar 4 walk draws four bass notes',           vals(B(4).voices.bass), ['q', 'q', '8', '8']);
    } else {
      console.log('  (private JSON has no bassLine — re-export to test the bass voice)');
    }
    assert('bar 44: no next, no warnings',                      [B(44).next, B(44).warnings], [null, []]);
    const allWarnings = prog.bars.flatMap(b => B(b.bar).warnings);
    console.log(`  (${allWarnings.length} tie warning${allWarnings.length === 1 ? '' : 's'} across ${prog.bars.length} bars${allWarnings.length ? ':\n    ' + allWarnings.join('\n    ') : ''})`);
  } else {
    console.log('\n  acceptance: static/private/dont-be-sad.json not present — skipped');
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
