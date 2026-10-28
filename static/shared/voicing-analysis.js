/**
 * voicing-analysis.js
 * ===================
 * Analysis engine for voiced chord progressions: interval tension,
 * melody-vs-voicing tension, named-vs-played chord tones, and
 * upper-voice motion between bars — every comp event scored.
 *
 * Pure functions — no DOM, no HarmonyState writes. Standard MIDI
 * internally (C4 = 60). Spelled note names ("B♭4", ASCII "Bb4") are
 * the source of truth where available; midi numbers are accepted
 * everywhere a note is expected and spelled chord-relatively when a
 * name is needed.
 *
 * Data model: tools/voicings/schema.md
 * Plan:       docs/active-plans/voicing-explorer-build-plan.md
 *
 * Depends on:
 *   - transforms.js  → CHORD_TYPES (interval sets), pcToNote
 *
 * Exports:
 *   parseNote, parseSymbol, intervalTension, melodyTension,
 *   namedVsPlayed, voiceMotion, barNeighbours, analyzeProgression,
 *   toHarmonyNotes, tensionWeight, TENSION_WEIGHTS, OCTAVE_DISCOUNTS,
 *   INTERVAL_LABELS, LOCAL_CHORD_TYPES, selfTest
 *
 * Tension: every bass/voicing pair (and each melody pitch against every
 * comp note, weighted by duration) is reduced to its interval class
 * (span mod 12) and scored by TENSION_WEIGHTS × OCTAVE_DISCOUNTS[class]
 * per extra octave. See tools/voicings/schema.md "Tension scoring".
 *
 * Self-test (from the repo root):
 *   node --input-type=module -e "import('./static/shared/voicing-analysis.js').then(m => m.selfTest())"
 */

import { CHORD_TYPES, pcToNote } from './transforms.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

/**
 * Tension weight by interval class (span mod 12), and the per-class
 * discount applied once per extra octave. Minor 2nds and tritones keep
 * rubbing in any register (m9 = 3 × 2/3 = 2, m16 = 3 × (2/3)², tritone
 * + octave = 2 × 2/3); major 2nds and major 7ths are extensions beyond
 * the first octave, not rubs (M9 = M14 = 0). Classes not listed score
 * 0 in any register.
 */
const TENSION_WEIGHTS  = { 1: 3, 2: 1, 6: 2, 11: 1 };
const OCTAVE_DISCOUNTS = { 1: 2 / 3, 2: 0, 6: 2 / 3, 11: 0 };
/** Simple-interval label per class; compounds are named by _intervalLabel. */
const INTERVAL_LABELS = { 1: 'm2', 2: 'M2', 6: 'TT', 11: 'M7' };
const _COMPOUND_LABELS = { 1: ['m2', 'm9', 'm16'], 2: ['M2', 'M9', 'M16'], 6: ['TT', 'TT+8', 'TT+15'], 11: ['M7', 'M14', 'M21'] };
/** byInterval buckets (the chart's series). Class-1 compounds keep the 'm9' bucket; other classes bucket by simple label. */
const INTERVAL_KEYS   = ['m2', 'M2', 'TT', 'M7', 'm9'];

/** Weight for a span in semitones: class weight × OCTAVE_DISCOUNTS[class]^(extra octaves), 0 for unweighted classes. */
function tensionWeight(span) {
  const c = span % 12, o = Math.floor(span / 12);
  const w = TENSION_WEIGHTS[c];
  if (!w) return 0;
  return o === 0 ? w : w * Math.pow(OCTAVE_DISCOUNTS[c], o);
}
function _intervalLabel(span) {
  const c = span % 12, o = Math.floor(span / 12);
  const names = _COMPOUND_LABELS[c];
  return names ? (names[o] || `${names[0]}+${o}8va`) : null;
}
function _intervalBucket(span) {
  const c = span % 12;
  if (c === 1) return span > 12 ? 'm9' : 'm2';
  return INTERVAL_LABELS[c] || null;
}

/**
 * Chord types transforms.js lacks. Same shape as CHORD_TYPES entries.
 * Logged in docs/registry-inventory.md (§9).
 */
const LOCAL_CHORD_TYPES = {
  '6':        { intervals: [0, 4, 7, 9],          symbol: '6',       name: 'Major 6th',             base: 'major' },
  'm6':       { intervals: [0, 3, 7, 9],          symbol: 'm6',      name: 'Minor 6th',             base: 'minor' },
  '6/9':      { intervals: [0, 4, 7, 9, 14],      symbol: '6/9',     name: 'Major 6/9',             base: 'major' },
  '7#11':     { intervals: [0, 4, 7, 10, 18],     symbol: '7♯11',    name: 'Dominant 7th ♯11',      base: 'major' },
  '7b9':      { intervals: [0, 4, 7, 10, 13],     symbol: '7♭9',     name: 'Dominant 7th ♭9',       base: 'major' },
  '7#9':      { intervals: [0, 4, 7, 10, 15],     symbol: '7♯9',     name: 'Dominant 7th ♯9',       base: 'major' },
  '7b13':     { intervals: [0, 4, 7, 10, 20],     symbol: '7♭13',    name: 'Dominant 7th ♭13',      base: 'major' },
  '7b9#11':   { intervals: [0, 4, 7, 10, 13, 18], symbol: '7♭9♯11',  name: 'Dominant 7th ♭9 ♯11',   base: 'major' },
  '7#5':      { intervals: [0, 4, 8, 10],         symbol: '7♯5',     name: 'Dominant 7th ♯5',       base: 'augmented' },
  '13':       { intervals: [0, 4, 7, 10, 14, 21], symbol: '13',      name: 'Dominant 13th',         base: 'major' },
  '13#11':    { intervals: [0, 4, 7, 10, 14, 18, 21], symbol: '13♯11', name: 'Dominant 13th ♯11',   base: 'major' },
  // Levine T1: G7alt = G7(♭9, ♯9, ♯11, ♭13). Only root, 3rd and ♭7 are named
  // (option A of the 2026-10-28 read-and-report); `alt` tells the speller
  // and the Explore pool that the colour is the four alterations, never
  // the natural 5, 9 or 13.
  '7alt':     { intervals: [0, 4, 10],            symbol: '7alt',    name: 'Altered dominant',      base: 'major', alt: true },
  '9sus4':    { intervals: [0, 5, 7, 10, 14],     symbol: '9sus4',   name: 'Dominant 9th sus4',     base: null },
  'm11':      { intervals: [0, 3, 7, 10, 14, 17], symbol: 'm11',     name: 'Minor 11th',            base: 'minor' },
  'maj7#11':  { intervals: [0, 4, 7, 11, 18],     symbol: 'maj7♯11', name: 'Major 7th ♯11',         base: 'major' },
  'maj7#5':   { intervals: [0, 4, 8, 11],         symbol: 'maj7♯5',  name: 'Major 7th ♯5',          base: 'augmented' },
  'maj9#5':   { intervals: [0, 4, 8, 11, 14],     symbol: 'maj9♯5',  name: 'Major 9th ♯5',          base: 'augmented' },
  'maj13':    { intervals: [0, 4, 7, 11, 14, 21], symbol: 'maj13',   name: 'Major 13th',            base: 'major' },
};

/**
 * Symbol suffix → chord type id in CHORD_TYPES or LOCAL_CHORD_TYPES. Keys
 * are in the form _normaliseSuffix produces: ASCII # and b, Δ expanded to
 * maj7 (Levine T2), and - / + before an extension turned into b / # (Levine
 * T4), so "7-9" is looked up as "7b9". A leading "-" is minor (Levine T3)
 * and a leading "+" augmented; those keys are listed as written.
 */
const SUFFIX_TO_TYPE = {
  '': 'major', 'maj': 'major', 'M': 'major',
  'm': 'minor', 'min': 'minor', '-': 'minor', 'mi': 'minor',
  'dim': 'diminished', 'o': 'diminished',
  'aug': 'augmented', '+': 'augmented',
  '7': 'dom7', 'maj7': 'maj7', 'M7': 'maj7', 'ma7': 'maj7',
  'm7': 'min7', 'min7': 'min7', '-7': 'min7', 'mi7': 'min7',   // Dmi7 (Levine T2)
  'dim7': 'dim7', 'o7': 'dim7',
  'm7b5': 'half-dim7', '-7b5': 'half-dim7', 'h7': 'half-dim7', 'h': 'half-dim7',
  'mmaj7': 'minmaj7', 'mMaj7': 'minmaj7', 'minmaj7': 'minmaj7', 'mM7': 'minmaj7', 'm(maj7)': 'minmaj7',
  '-maj7': 'minmaj7', '-M7': 'minmaj7', '-(maj7)': 'minmaj7',
  'sus4': 'sus4', 'sus': 'sus4', 'sus2': 'sus2', '7sus4': '7sus4', '7sus': '7sus4',
  '9sus4': '9sus4', '9sus': '9sus4',
  'add9': 'add9', '9': 'dom9', 'maj9': 'maj9', 'M9': 'maj9', 'm9': 'min9', 'min9': 'min9', '-9': 'min9',
  'm11': 'm11', 'min11': 'm11', '-11': 'm11',
  '13': '13', 'maj13': 'maj13', 'M13': 'maj13', '13#11': '13#11',
  '6': '6', 'm6': 'm6', '-6': 'm6', '6/9': '6/9', '69': '6/9', '6add9': '6/9',
  '7#11': '7#11', '7b9': '7b9', '7#9': '7#9', '7b13': '7b13', '7b9#11': '7b9#11',
  '7#5': '7#5', '+7': '7#5', '7+': '7#5', 'aug7': '7#5', '7alt': '7alt',
  'maj7#11': 'maj7#11', 'M7#11': 'maj7#11', 'maj9#5': 'maj9#5', 'M9#5': 'maj9#5',
  'maj7#5': 'maj7#5', 'M7#5': 'maj7#5', '+maj7': 'maj7#5', 'maj7+': 'maj7#5',
};

const LETTERS   = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Major-scale semitone for each letter step above the root (0 = root). */
const STEP_PC   = [0, 2, 4, 5, 7, 9, 11];
/** Degree number for each letter step, as chord-tone labels use them. */
const STEP_DEGREE = ['R', '9', '3', '11', '5', '13', '7'];
const ACC_STR   = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '♯♯' };
/** The altered dominant's colour: ♭9, ♯9, ♯11, ♭13 as semitones above the root (Levine T1). */
const _ALT_SEMIS = [1, 3, 6, 8];

// ════════════════════════════════════════════════════════════════════
// NOTES
// ════════════════════════════════════════════════════════════════════

const _NOTE_RE = /^([A-Ga-g])([#♯b♭x\-]*)(-?\d+)?$/;

/**
 * Parse a note. Accepts spelled strings with or without octave
 * ("B♭4", "Bb4", "F#3", "E-3", "B♭") or a midi number.
 *
 * @returns {{ midi:number|null, pc:number, letter:string|null, acc:number, octave:number|null, name:string }|null}
 *   name is the pitch-class spelling without octave ("B♭"); for midi
 *   input it is the sharp spelling from transforms.pcToNote.
 */
function parseNote(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const midi = Math.round(input);
    const pc = ((midi % 12) + 12) % 12;
    return { midi, pc, letter: null, acc: 0, octave: Math.floor(midi / 12) - 1, name: pcToNote(pc) };
  }
  if (typeof input !== 'string') return null;
  const m = input.trim().match(_NOTE_RE);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let acc = 0;
  for (const ch of m[2]) {
    if (ch === '#' || ch === '♯') acc += 1;
    else if (ch === 'x') acc += 2;
    else if (ch === 'b' || ch === '♭' || ch === '-') acc -= 1;
  }
  const pc = ((LETTER_PC[letter] + acc) % 12 + 12) % 12;
  const octave = m[3] != null ? parseInt(m[3], 10) : null;
  const midi = octave != null ? (octave + 1) * 12 + LETTER_PC[letter] + acc : null;
  const name = letter + (ACC_STR[String(acc)] ?? (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc)));
  return { midi, pc, letter, acc, octave, name };
}

/** Midi number from a note (string or number). NaN when unparseable or octave-less. */
function toMidi(input) {
  const n = parseNote(input);
  return n && n.midi != null ? n.midi : NaN;
}

/**
 * Degree label and spelled name for a note relative to a chord root.
 *
 * A tone the chord type names takes the type's degree name (A over Cdim7
 * is ♭♭7, E♭ over C7♯9 is ♯9, F over C7sus4 is 4 whether played or
 * missing); the written name is kept as written, never respelled. A tone
 * the type does not name keeps the letter-based label (B♭ over Gmaj7 →
 * ♭3, A over Cmaj7 → 13); a midi number with no letter falls back to the
 * chord-aware semitone table and is spelled chord-relatively.
 */
function _degreeOf(note, root, chordDef) {
  const semis = ((note.pc - root.pc) % 12 + 12) % 12;
  // On 7alt the four alterations are what the symbol means (Levine T1), so
  // they take the type's names (E♭ → ♯9) even though only R, 3 and ♭7 are
  // named intervals for the omitted list.
  const named = (chordDef?.intervals || []).some(i => i % 12 === semis)
    || (!!chordDef?.alt && _ALT_SEMIS.includes(semis));
  if (named || !note.letter) {
    const spelled = _spellDegree(root, semis, chordDef);
    return { degree: spelled.degree, name: note.letter ? note.name : spelled.name };
  }
  const steps = (LETTERS.indexOf(note.letter) - LETTERS.indexOf(root.letter) + 7) % 7;
  const expected = (root.pc + STEP_PC[steps]) % 12;
  let diff = ((note.pc - expected) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  const base = STEP_DEGREE[steps];
  const degree = (ACC_STR[String(diff)] ?? '') + base;
  return { degree, name: note.name };
}

/**
 * Chord-relative degree label + spelling from a semitone offset.
 * Used for named tones (whatever their written form), omitted chord
 * tones and midi-only input. Rows are decided by the type's intervals,
 * not its id, so new types inherit them.
 */
function _spellDegree(root, semis, chordDef) {
  const ivs = new Set((chordDef?.intervals || []).map(i => i % 12));
  const id = chordDef?.id || '';
  const alt = !!chordDef?.alt;
  const has = s => ivs.has(s);
  const hasThird = has(3) || has(4);
  const hasSeventh = has(10) || has(11);
  let degree;
  switch (semis % 12) {
    case 0:  degree = 'R'; break;
    case 1:  degree = '♭9'; break;
    case 2:  degree = id === 'sus2' ? '2' : '9'; break;
    case 3:  degree = has(4) ? '♯9' : '♭3'; break;
    case 4:  degree = '3'; break;
    // Levine T5: 4 on sus chords (no 3rd), 11 on dominant and minor chords.
    case 5:  degree = hasThird ? '11' : '4'; break;
    // Levine T1: on an altered dominant the raised 4th is the ♯11 even with no 5th named.
    case 6:  degree = has(7) || alt ? '♯11' : '♭5'; break;
    case 7:  degree = '5'; break;
    // ♯5 only when the type names an augmented 5th; otherwise a 13th.
    case 8:  degree = has(8) ? '♯5' : '♭13'; break;
    // Levine T6: 6 on a sixth chord (no 7th), 13 when there is a 7th; dim7's 7th is ♭♭7.
    case 9:  degree = has(3) && has(6) && has(9) && !hasSeventh ? '♭♭7' : (has(9) && !hasSeventh ? '6' : '13'); break;
    case 10: degree = '♭7'; break;
    case 11: degree = '7'; break;
  }
  // letter from the degree number, accidental to hit the pitch class
  const num = parseInt(degree.replace(/[^0-9R]/g, '') || '1', 10);
  const steps = degree === 'R' ? 0 : (num - 1) % 7;
  const letter = LETTERS[(LETTERS.indexOf(root.letter) + steps) % 7];
  const targetPC = (root.pc + semis) % 12;
  // accidental relative to the letter's natural pitch (not the scale degree)
  let diff = ((targetPC - LETTER_PC[letter]) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  const name = letter + (ACC_STR[String(diff)] ?? '');
  return { degree, name };
}

// ════════════════════════════════════════════════════════════════════
// CHORD SYMBOLS
// ════════════════════════════════════════════════════════════════════

/** Root and slash bass take ♯/♭ (# / b) only: "-" is never a root accidental (Levine T3, T4). */
const _SYM_RE = /^([A-G])([#♯b♭]?)(.*?)(?:\/([A-G])([#♯b♭]?))?$/;

/**
 * Suffix as written → the SUFFIX_TO_TYPE key.
 *   ♯ ♭ ° ø   → # b o h
 *   Δ         → maj7 on its own or before a non-digit (CΔ, CΔ♯11); maj
 *               before a digit (Δ7, Δ9, Δ13). Levine T2.
 *   - / +     → b / # when directly before 5, 9, 11 or 13 anywhere after
 *               the first character (C7-9 = C7♭9, C7+11 = C7♯11, C7+5 =
 *               C7♯5). At the first character they are the quality:
 *               "-" minor (C-9 = Cm9), "+" augmented (C+7). Levine T3, T4.
 */
function _normaliseSuffix(raw) {
  let s = raw.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/°/g, 'o').replace(/ø/g, 'h');
  s = s.replace(/Δ(?=\d)/g, 'maj').replace(/Δ/g, 'maj7');
  s = s.replace(/[-+](?=(?:5|9|11|13)(?!\d))/g, (sign, offset) => (offset === 0 ? sign : sign === '-' ? 'b' : '#'));
  return s;
}

/**
 * Parse a chord symbol such as "Gm7/F", "A7♯11/C♯", "E-Δ7", "C7-9".
 *
 * @returns {{ root:string, rootPC:number, type:string, intervals:number[],
 *             bass:string|null, bassPC:number|null, display:string, def:Object }|null}
 *   `type` is the id in CHORD_TYPES or LOCAL_CHORD_TYPES. null if the
 *   root or suffix is not understood. `def` carries the type's fields
 *   (`alt: true` on 7alt).
 */
function parseSymbol(symbol) {
  if (typeof symbol !== 'string') return null;
  const m = symbol.trim().match(_SYM_RE);
  if (!m) return null;
  const root = parseNote(m[1] + m[2]);
  const suffixRaw = m[3];
  const suffix = _normaliseSuffix(suffixRaw);
  const type = SUFFIX_TO_TYPE[suffix];
  if (!type) return null;
  const def = CHORD_TYPES[type] || LOCAL_CHORD_TYPES[type];
  if (!def) return null;
  const bass = m[4] ? parseNote(m[4] + (m[5] || '')) : null;
  const display = root.name + suffixRaw.replace(/#/g, '♯').replace(/b/g, '♭')
    + (bass ? '/' + bass.name : '');
  return {
    root: root.name,
    rootPC: root.pc,
    type,
    intervals: def.intervals.slice(),
    bass: bass ? bass.name : null,
    bassPC: bass ? bass.pc : null,
    display,
    def: { id: type, ...def },
    _root: root,
  };
}

// ════════════════════════════════════════════════════════════════════
// TENSION
// ════════════════════════════════════════════════════════════════════

function _emptyByInterval() {
  return { m2: 0, M2: 0, TT: 0, M7: 0, m9: 0 };
}

function _round(x) { return Math.round(x * 1000) / 1000; }

/**
 * Interval tension of a comp voicing: every pair among bass + voicing,
 * scored by interval class with an octave discount (tensionWeight).
 *
 * @param {string|number} bass
 * @param {Array<string|number>} voicing
 * @returns {{ score:number, byInterval:Object, rubs:Array<{lo,hi,semitones,label,weight}> }}
 */
function intervalTension(bass, voicing) {
  const notes = [bass, ...(voicing || [])]
    .map(n => ({ raw: n, midi: toMidi(n) }))
    .filter(n => !isNaN(n.midi))
    .sort((a, b) => a.midi - b.midi);
  const byInterval = _emptyByInterval();
  const rubs = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const d = notes[j].midi - notes[i].midi;
      const w = tensionWeight(d);
      if (!w) continue;
      const bucket = _intervalBucket(d);
      byInterval[bucket] = _round(byInterval[bucket] + w);
      rubs.push({ lo: notes[i].raw, hi: notes[j].raw, semitones: d, label: _intervalLabel(d), weight: _round(w) });
    }
  }
  const score = _round(INTERVAL_KEYS.reduce((s, k) => s + byInterval[k], 0));
  return { score, byInterval, rubs };
}

/** Quarters during which a melody event sounds inside a comp event's span. */
function _overlap(m, ev) {
  const a = Number(m.beat) || 0, b = Number(ev.beat) || 0;
  return Math.min(a + (Number(m.dur) || 0), b + (Number(ev.dur) || 0)) - Math.max(a, b);
}

/**
 * Melody-vs-voicing tension. Melody durations are summed per pitch —
 * within the whole bar, or, given a window {beat, dur} (a comp event's
 * span), only the time each melody note overlaps that window; each
 * pitch is checked against every comp note (bass included);
 * contribution = weight × dur / beatsPerBar. Melody-vs-melody intervals
 * are not scored.
 *
 * @param {Array<{beat:number, note:string|number, dur:number}>} melody
 * @param {string|number} bass
 * @param {Array<string|number>} voicing
 * @param {number} beatsPerBar
 * @param {{beat:number, dur:number}|null} [window]
 */
function melodyTension(melody, bass, voicing, beatsPerBar, window = null) {
  const byInterval = _emptyByInterval();
  const rubs = [];
  if (!melody || !melody.length || !beatsPerBar) return { score: 0, byInterval, rubs };

  // aggregate per pitch, keep first spelling; with a window, only the overlap counts
  const perPitch = new Map();
  for (const ev of melody) {
    const midi = toMidi(ev.note ?? ev.midi);
    if (isNaN(midi)) continue;
    let dur = Number(ev.dur) || 0;
    if (window) {
      dur = _overlap(ev, window);
      if (dur <= 1e-9) continue;
    }
    const cur = perPitch.get(midi) || { raw: ev.note ?? ev.midi, midi, dur: 0 };
    cur.dur += dur;
    perPitch.set(midi, cur);
  }
  const comp = [bass, ...(voicing || [])]
    .map(n => ({ raw: n, midi: toMidi(n) }))
    .filter(n => !isNaN(n.midi));

  for (const m of [...perPitch.values()].sort((a, b) => a.midi - b.midi)) {
    for (const c of comp) {
      const d = Math.abs(m.midi - c.midi);
      const w = tensionWeight(d);
      if (!w) continue;
      const bucket = _intervalBucket(d);
      const contribution = w * m.dur / beatsPerBar;
      byInterval[bucket] = _round(byInterval[bucket] + contribution);
      rubs.push({ melody: m.raw, against: c.raw, semitones: d, label: _intervalLabel(d), dur: m.dur, contribution: _round(contribution) });
    }
  }
  const score = _round(INTERVAL_KEYS.reduce((s, k) => s + byInterval[k], 0));
  return { score, byInterval, rubs };
}

// ════════════════════════════════════════════════════════════════════
// NAMED VS PLAYED
// ════════════════════════════════════════════════════════════════════

/**
 * Compare a chord symbol's tones with the pitches actually played.
 *
 * @param {string|Object} symbolOrParsed  Chord symbol or parseSymbol() result
 * @param {Array<string|number>} pitches  Played notes (bass, voicing, optionally melody)
 * @returns {{ symbol:string, present:Array, omitted:Array, added:Array }|null}
 *   Each entry: { pc, name, degree }. present/omitted follow the chord
 *   template order; added entries are ordered by pitch class from root.
 */
function namedVsPlayed(symbolOrParsed, pitches) {
  const parsed = typeof symbolOrParsed === 'string' ? parseSymbol(symbolOrParsed) : symbolOrParsed;
  if (!parsed) return null;
  const root = parsed._root || parseNote(parsed.root);
  const def = parsed.def || { id: parsed.type, intervals: parsed.intervals };

  // played pitch classes, first (lowest) spelling wins
  const played = new Map();
  for (const p of (pitches || []).map(parseNote).filter(Boolean).sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0))) {
    if (!played.has(p.pc)) played.set(p.pc, p);
  }

  const present = [], omitted = [];
  const namedPCs = new Set();
  for (const iv of parsed.intervals) {
    const pc = (root.pc + iv) % 12;
    if (namedPCs.has(pc)) continue;
    namedPCs.add(pc);
    if (played.has(pc)) {
      const n = played.get(pc);
      const { degree, name } = _degreeOf(n, root, def);
      present.push({ pc, name, degree });
    } else {
      const { degree, name } = _spellDegree(root, iv % 12, def);
      omitted.push({ pc, name, degree });
    }
  }
  // A slash bass is named by the symbol even when it is not a tone of the
  // chord type (B♭maj9♯5/F names F, the natural 5th). Treat it as named.
  if (parsed.bassPC != null && !namedPCs.has(parsed.bassPC)) {
    const pc = parsed.bassPC;
    namedPCs.add(pc);
    const bassNote = parseNote(parsed.bass);
    if (played.has(pc)) {
      const { degree, name } = _degreeOf(played.get(pc), root, def);
      present.push({ pc, name, degree });
    } else {
      const { degree, name } = _degreeOf(bassNote, root, def);
      omitted.push({ pc, name, degree });
    }
  }
  const added = [];
  for (const [pc, n] of played) {
    if (namedPCs.has(pc)) continue;
    const { degree, name } = _degreeOf(n, root, def);
    added.push({ pc, name, degree, _rel: (pc - root.pc + 12) % 12 });
  }
  added.sort((a, b) => a._rel - b._rel);
  added.forEach(a => delete a._rel);

  return { symbol: parsed.display, present, omitted, added };
}

// ════════════════════════════════════════════════════════════════════
// VOICE MOTION
// ════════════════════════════════════════════════════════════════════

/**
 * Upper-voice motion between two voicings (bass excluded by the caller).
 * The voices of the smaller voicing are assigned to distinct voices of
 * the larger one so that the summed |semitones| is minimal (all
 * pairings tried; voicings are ≤ 5 notes). Unmatched voices of the
 * larger voicing cost nothing and are reported in `unmatched`. With
 * equal counts this is the low-to-high pairing. Null when either
 * voicing is empty.
 *
 * @returns {{ total:number, perVoice:Array<{from,to,delta}>, matched:number,
 *             unmatched:Array<{side:'from'|'to', midi:number, name:string}> }|null}
 */
function voiceMotion(prevVoicing, voicing) {
  const names = new Map();   // midi → spelled name as given (first wins)
  for (const n of [...(prevVoicing || []), ...(voicing || [])]) { const m = toMidi(n); if (!isNaN(m) && !names.has(m)) names.set(m, typeof n === 'string' ? n : parseNote(m).name + parseNote(m).octave); }
  const a = (prevVoicing || []).map(toMidi).filter(m => !isNaN(m)).sort((x, y) => x - y);
  const b = (voicing || []).map(toMidi).filter(m => !isNaN(m)).sort((x, y) => x - y);
  if (!a.length || !b.length) return null;
  const prevIsSmall = a.length <= b.length;
  const small = prevIsSmall ? a : b, large = prevIsSmall ? b : a;
  let best = null;
  const used = new Array(large.length).fill(false), pick = [];
  const search = (i, cost) => {
    if (best && cost >= best.cost) return;
    if (i === small.length) { best = { cost, pick: pick.slice() }; return; }
    for (let j = 0; j < large.length; j++) {
      if (used[j]) continue;
      used[j] = true; pick.push(j);
      search(i + 1, cost + Math.abs(small[i] - large[j]));
      pick.pop(); used[j] = false;
    }
  };
  search(0, 0);
  const perVoice = small.map((m, i) => {
    const other = large[best.pick[i]];
    return prevIsSmall ? { from: m, to: other, delta: other - m } : { from: other, to: m, delta: m - other };
  }).sort((x, y) => x.from - y.from);
  const unmatched = large.map((m, j) => (best.pick.includes(j) ? null : { side: prevIsSmall ? 'to' : 'from', midi: m, name: names.get(m) })).filter(Boolean);
  return { total: best.cost, perVoice, matched: small.length, unmatched };
}

/**
 * Performance neighbours of each bar: the bars before and after its FIRST
 * occurrence in form.playOrder (written order without one). A second
 * ending's predecessor is the bar before the first ending; a repeat's last
 * bar has the repeat's first bar as successor. The last bar played has
 * no successor; the first has no predecessor.
 *
 * @returns {{ prev: Object<number, number|null>, next: Object<number, number|null> }}
 */
function barNeighbours(progression) {
  const bars = progression.bars || [];
  const order = progression.form && Array.isArray(progression.form.playOrder) && progression.form.playOrder.length
    ? progression.form.playOrder : bars.map(b => b.bar);
  const prev = {}, next = {};
  order.forEach((b, i) => {
    if (b in prev) return;
    prev[b] = i > 0 ? order[i - 1] : null;
    next[b] = i < order.length - 1 ? order[i + 1] : null;
  });
  return { prev, next };
}

/** Performance predecessor of each bar (see barNeighbours). */
function _predecessors(progression) {
  return barNeighbours(progression).prev;
}

// ════════════════════════════════════════════════════════════════════
// PROGRESSION
// ════════════════════════════════════════════════════════════════════

/**
 * Analyze a whole voiced progression (schema: tools/voicings/schema.md).
 * Every comp event is scored; empty `symbols` carry the previous bar's
 * symbol forward.
 *
 * @param {Object} progression
 * @param {{ includeMelody?:boolean }} [opts]
 * @returns {{ beatsPerBar:number, bars:Array<BarResult> }}
 *
 * EventResult (one per comp event, in order):
 *   { index, beat, dur, symbol, bass, bassSource, voicing, comp, melody, total,
 *     byInterval, namedVsPlayed, motion }
 *   bassSource is copied from the data ('voice' | 'carried' | 'inferred', or
 *   undefined) for display; the analysis treats every bass the same.
 *   symbol is the chord symbol in effect at the event's onset (the last
 *   of the bar's symbols at or before it, else the carried one) and
 *   namedVsPlayed is scored against it; melody is scored by time overlap
 *   with the event (null without the melody option); motion is the step
 *   from the previous event in the bar (null for the first).
 *
 * BarResult:
 *   { bar, section, source, effectiveSymbol, hold, parsed,
 *     events: EventResult[], maxEvent: index|null, predecessor: bar|null,
 *     comp, melody, total, byInterval,   // of the max-tension event (ties → the earlier)
 *     namedVsPlayed,                      // of the first event (what the page shows until 4b)
 *     motion,                             // last event of the performance predecessor → first event here
 *     motionWithin }                      // { total, steps } across this bar's events, or null
 * Bars with no comp event: events [], maxEvent null, zeros/nulls.
 * Melody that sounds while no comp event sounds is not scored.
 */
function analyzeProgression(progression, opts = {}) {
  const includeMelody = !!opts.includeMelody;
  const beatsPerBar = progression.beatsPerBar
    || (progression.timeSignature ? _beatsFromSig(progression.timeSignature) : 4);
  const empty = () => ({ score: 0, byInterval: _emptyByInterval(), rubs: [] });
  const pred = _predecessors(progression);
  const results = [];
  const byBar = new Map();
  let carried = null;

  for (const bar of progression.bars || []) {
    const symbols = bar.symbols || [];
    const hold = symbols.length === 0;
    const effectiveSymbol = hold ? carried : symbols[0].symbol;
    if (!hold) carried = symbols[symbols.length - 1].symbol;
    const parsed = effectiveSymbol ? parseSymbol(effectiveSymbol) : null;
    const compEvents = bar.comp || [];
    const melodyEvents = bar.melody || [];
    // Symbol in effect at a beat: the last of this bar's symbols at or before it, else the carried one.
    const symbolAt = beat => {
      let sym = effectiveSymbol;
      for (const s of symbols) if (Number(s.beat) <= Number(beat) + 1e-9) sym = s.symbol;
      return sym;
    };

    const events = compEvents.map((ev, i) => {
      const bass = ev.bass, voicing = ev.voicing || [];
      const symbol = symbolAt(ev.beat);
      const parsedAt = symbol === effectiveSymbol ? parsed : (symbol ? parseSymbol(symbol) : null);
      const comp = intervalTension(bass, voicing);
      const melody = includeMelody ? melodyTension(melodyEvents, bass, voicing, beatsPerBar, { beat: ev.beat, dur: ev.dur }) : null;
      const byInterval = _emptyByInterval();
      for (const k of INTERVAL_KEYS) byInterval[k] = _round(comp.byInterval[k] + (melody ? melody.byInterval[k] : 0));
      const total = _round(comp.score + (melody ? melody.score : 0));
      const pitches = [bass, ...voicing];
      if (includeMelody) for (const m of melodyEvents) if (_overlap(m, ev) > 1e-9) pitches.push(m.note ?? m.midi);
      const nvp = parsedAt ? namedVsPlayed(parsedAt, pitches) : null;
      const motion = i > 0 ? voiceMotion(compEvents[i - 1].voicing || [], voicing) : null;
      return { index: i, beat: ev.beat, dur: ev.dur, symbol, bass, bassSource: ev.bassSource, voicing, comp, melody, total, byInterval, namedVsPlayed: nvp, motion };
    });

    let maxEvent = null;
    events.forEach((e, i) => { if (maxEvent === null || e.total > events[maxEvent].total) maxEvent = i; });
    const top = maxEvent === null ? null : events[maxEvent];
    const first = events[0] || null;
    const steps = events.slice(1).map(e => e.motion);
    const motionWithin = steps.length ? { total: steps.reduce((t, m) => t + (m ? m.total : 0), 0), steps } : null;

    const result = {
      bar: bar.bar, section: bar.section, source: bar.source,
      effectiveSymbol, hold, parsed: parsed ? { ...parsed, _root: undefined } : null,
      events, maxEvent, predecessor: pred[bar.bar] ?? null,
      comp: top ? top.comp : empty(),
      melody: top ? top.melody : null,
      total: top ? top.total : 0,
      byInterval: top ? top.byInterval : _emptyByInterval(),
      namedVsPlayed: first ? first.namedVsPlayed : null,
      motion: null,
      motionWithin,
    };
    results.push(result);
    byBar.set(bar.bar, result);
  }

  // Motion in: last event of the performance predecessor → first event of this bar.
  for (const r of results) {
    const prev = r.predecessor != null ? byBar.get(r.predecessor) : null;
    const prevLast = prev && prev.events.length ? prev.events[prev.events.length - 1] : null;
    r.motion = r.events.length && prevLast ? voiceMotion(prevLast.voicing, r.events[0].voicing) : null;
  }
  return { beatsPerBar, bars: results };
}

function _beatsFromSig(sig) {
  const m = String(sig).match(/^(\d+)\/(\d+)$/);
  return m ? (parseInt(m[1], 10) * 4) / parseInt(m[2], 10) : 4;
}

// ════════════════════════════════════════════════════════════════════
// HARMONYSTATE BRIDGE
// ════════════════════════════════════════════════════════════════════

/**
 * Convert notes to HarmonyState activeNotes entries. source:'user' is
 * the only path keyboard-view places at an exact octave.
 * Spelled input keeps its spelling; midi input is spelled with sharps.
 */
function toHarmonyNotes(notes) {
  return (notes || []).map(parseNote).filter(n => n && n.midi != null)
    .map(n => ({ note: n.name, octave: n.octave, source: 'user', color: null }));
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export {
  tensionWeight, TENSION_WEIGHTS, OCTAVE_DISCOUNTS, INTERVAL_LABELS, LOCAL_CHORD_TYPES,
  parseNote, parseSymbol, intervalTension, melodyTension, namedVsPlayed,
  voiceMotion, barNeighbours, analyzeProgression, toHarmonyNotes, selfTest,
  // Explainer layer (Session 6.5): read-only constants for interpolation into content.
  INTERVAL_KEYS, _COMPOUND_LABELS as COMPOUND_LABELS, SUFFIX_TO_TYPE, STEP_DEGREE,
};

if (typeof window !== 'undefined') {
  window.VoicingAnalysis = {
    tensionWeight, TENSION_WEIGHTS, OCTAVE_DISCOUNTS, INTERVAL_LABELS, LOCAL_CHORD_TYPES,
    parseNote, parseSymbol, intervalTension, melodyTension, namedVsPlayed,
    voiceMotion, barNeighbours, analyzeProgression, toHarmonyNotes,
    INTERVAL_KEYS, COMPOUND_LABELS: _COMPOUND_LABELS, SUFFIX_TO_TYPE, STEP_DEGREE,
  };
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/shared/voicing-analysis.js').then(m => m.selfTest())"
//
// Runs against tests/fixtures/voicing-fixture.json, then against
// static/private/dont-be-sad.json when that file exists.

async function selfTest() {
  const fs = await import('node:fs');
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const near = (label, actual, expected, eps = 0.01) => {
    const pass = typeof actual === 'number' && Math.abs(actual - expected) <= eps;
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${actual}\n      expected: ${expected}`);
  };
  const fmt = list => list.map(e => `${e.name}·${e.degree}`);

  console.log('\n─── voicing-analysis.js self-test ───\n');

  // ── Unit: tension weights (class × per-class octave discount) ────
  assert('OCTAVE_DISCOUNTS: m2 and TT 2/3, M2 and M7 0',  OCTAVE_DISCOUNTS, { 1: 2 / 3, 2: 0, 6: 2 / 3, 11: 0 });
  assert('1 (m2) → 3',                                    tensionWeight(1), 3);
  assert('13 (m9 = m2 + octave) → 2',                     tensionWeight(13), 2);
  assert('25 (m2 + two octaves) → 3 × (2/3)² = 4/3',      tensionWeight(25), 3 * (2 / 3) ** 2);
  assert('18 (tritone + octave) → 2 × 2/3',               tensionWeight(18), 2 * (2 / 3));
  assert('14 (M9) → 0: an extension, not a rub',          tensionWeight(14), 0);
  assert('23 (M14 = M7 + octave) → 0',                    tensionWeight(23), 0);
  assert('10 (m7) → 0',                                   tensionWeight(10), 0);
  assert('M9 pair produces no rub',                        intervalTension('C3', ['D4']).rubs, []);
  assert('25 buckets as m9, label m16',                    (({ byInterval, rubs }) => [byInterval.m9, rubs[0].label])(intervalTension('F2', ['F♯4'])), [1.333, 'm16']);

  // ── Unit: notes & symbols ─────────────────────────────────────────
  assert('parseNote("B♭4").midi = 70', parseNote('B♭4').midi, 70);
  assert('parseNote("Bb4") ≡ parseNote("B-4") (midi)', parseNote('Bb4').midi, parseNote('B-4').midi);
  assert('parseNote(60) → C4', [parseNote(60).name, parseNote(60).octave], ['C', 4]);
  assert('parseSymbol("A7♯11/C♯")', (({ root, type, bass, display }) => ({ root, type, bass, display }))(parseSymbol('A7♯11/C♯')),
    { root: 'A', type: '7#11', bass: 'C♯', display: 'A7♯11/C♯' });
  assert('P4 parseSymbol("E-maj7") = E minmaj7 (- is minor, never flat; was E♭maj7)', (({ root, type, display }) => [root, type, display])(parseSymbol('E-maj7')), ['E', 'minmaj7', 'E-maj7']);
  assert('parseSymbol("Gm9").type = min9 (from transforms)', parseSymbol('Gm9').type, 'min9');
  assert('parseSymbol("Xyz") = null', parseSymbol('Xyz'), null);
  assert('toHarmonyNotes(["F♯3", 62])', toHarmonyNotes(['F♯3', 62]),
    [{ note: 'F♯', octave: 3, source: 'user', color: null }, { note: 'D', octave: 4, source: 'user', color: null }]);

  // ── Unit: parser — "-" is minor (Levine T3), dash suffixes ──────────
  const sym = s => { const p = parseSymbol(s); return p ? [p.root, p.type] : null; };
  assert('P1 C-7 → C min7, display as written',             [...sym('C-7'), parseSymbol('C-7').display], ['C', 'min7', 'C-7']);
  assert('P2 B♭-7 and Bb-7 → B♭ min7',                       [sym('B♭-7'), sym('Bb-7')], [['B♭', 'min7'], ['B♭', 'min7']]);
  assert('P3 C-7♭5 and C-7b5 → half-dim7',                   [sym('C-7♭5'), sym('C-7b5')], [['C', 'half-dim7'], ['C', 'half-dim7']]);
  assert('P5 C-, C-9, C-6 → minor, min9, m6',                [sym('C-'), sym('C-9'), sym('C-6')], [['C', 'minor'], ['C', 'min9'], ['C', 'm6']]);
  assert('P8 m(maj7), mM7, mmaj7, mMaj7, minmaj7, mΔ7 → minmaj7', ['Cm(maj7)', 'CmM7', 'Cmmaj7', 'CmMaj7', 'Cminmaj7', 'CmΔ7'].map(s => sym(s)[1]), Array(6).fill('minmaj7'));
  assert('P9 parseNote still reads "-" as flat in a note name (E-3 = E♭3)', parseNote('E-3').midi, parseNote('E♭3').midi);
  assert('bare "sus" still parses as sus4',                   sym('Csus'), ['C', 'sus4']);
  assert('T2 Dmi7 → D min7; Dmi → D minor',                    [sym('Dmi7'), sym('Dmi')], [['D', 'min7'], ['D', 'minor']]);
  // ── Unit: parser — new types (§5b), alterations (Levine T4), Δ (Levine T2)
  const ivs = s => parseSymbol(s)?.intervals ?? null;
  assert('P6 13',                 ivs('C13'),       [0, 4, 7, 10, 14, 21]);
  assert('P6 9sus4 / 9sus',       [ivs('C9sus4'), ivs('C9sus')], [[0, 5, 7, 10, 14], [0, 5, 7, 10, 14]]);
  assert('P6 m11 / -11 / min11',  [ivs('Cm11'), ivs('C-11'), ivs('Cmin11')], Array(3).fill([0, 3, 7, 10, 14, 17]));
  assert('P6 7♭13',               ivs('C7♭13'),     [0, 4, 7, 10, 20]);
  assert('P6 7♯5 / +7 / 7+ / aug7 / 7#5', ['C7♯5', 'C+7', 'C7+', 'Caug7', 'C7#5'].map(ivs), Array(5).fill([0, 4, 8, 10]));
  assert('P6 maj7♯5 / +maj7 / maj7+', ['Cmaj7♯5', 'C+maj7', 'Cmaj7+'].map(ivs), Array(3).fill([0, 4, 8, 11]));
  assert('P6 6/9 / 69 / 6add9',   ['C6/9', 'C69', 'C6add9'].map(ivs), Array(3).fill([0, 4, 7, 9, 14]));
  assert('P6 maj13',              ivs('Cmaj13'),    [0, 4, 7, 11, 14, 21]);
  assert('P6 7♭9♯11, 13♯11',      [ivs('C7♭9♯11'), ivs('C13♯11')], [[0, 4, 7, 10, 13, 18], [0, 4, 7, 10, 14, 18, 21]]);
  assert('P6 7alt: R 3 ♭7 named, alt flag on def (Levine T1)', [ivs('C7alt'), parseSymbol('C7alt').def.alt], [[0, 4, 10], true]);
  assert('P7 C6/9/E → type 6/9 with bass E', (({ type, bass }) => [type, bass])(parseSymbol('C6/9/E')), ['6/9', 'E']);
  assert('T4 C7-9 = C7♭9, C7+11 = C7♯11, C7+5 = C7♯5', [sym('C7-9')[1], sym('C7+11')[1], sym('C7+5')[1]], ['7b9', '7#11', '7#5']);
  assert('T4 C7-9+11 = 7♭9♯11, Cm7-5 = half-dim7, C7-13 = 7♭13', [sym('C7-9+11')[1], sym('Cm7-5')[1], sym('C7-13')[1]], ['7b9#11', 'half-dim7', '7b13']);
  assert('T3/T4 leading sign is the quality: C-9 = Cm9, C+7 = C7♯5, C+ = aug', [sym('C-9')[1], sym('C+7')[1], sym('C+')[1]], ['min9', '7#5', 'augmented']);
  assert('T2 CΔ, CΔ7 → maj7; CΔ9 → maj9; CΔ♯11 → maj7♯11', ['CΔ', 'CΔ7', 'CΔ9', 'CΔ♯11'].map(s => sym(s)[1]), ['maj7', 'maj7', 'maj9', 'maj7#11']);
  assert('T2 C-Δ, C-Δ7 → minmaj7',                          [sym('C-Δ')[1], sym('C-Δ7')[1]], ['minmaj7', 'minmaj7']);
  assert('display keeps the suffix as written (C7-9, CΔ)',  [parseSymbol('C7-9').display, parseSymbol('CΔ').display], ['C7-9', 'CΔ']);

  // ── Unit: degree labels — named tones take the type's name (§1) ────
  const nv = (s, p) => { const r = namedVsPlayed(s, p); return [fmt(r.present), fmt(r.omitted), fmt(r.added)]; };
  assert('A1 Cdim7 with A written → A·♭♭7 (not 13), nothing omitted', nv('Cdim7', ['C3', 'E♭3', 'G♭3', 'A3']), [['C·R', 'E♭·♭3', 'G♭·♭5', 'A·♭♭7'], [], []]);
  assert('A2 Cdim7 without its 7th → omitted B♭♭·♭♭7',            nv('Cdim7', ['C3', 'E♭3', 'G♭3'])[1], ['B♭♭·♭♭7']);
  assert('A3 C7♯9 with E♭ written → E♭·♯9 (not ♭3)',              nv('C7♯9', ['C3', 'E3', 'B♭3', 'E♭4']), [['C·R', 'E·3', 'B♭·♭7', 'E♭·♯9'], ['G·5'], []]);
  assert('A4 C7♯9, E♭ played and E missing → ♯9 present, 3 omitted', nv('C7♯9', ['C3', 'B♭3', 'E♭4']), [['C·R', 'B♭·♭7', 'E♭·♯9'], ['E·3', 'G·5'], []]);
  assert('A5 C7♯9 with D♯ written → D♯·♯9 (unchanged)',            nv('C7♯9', ['C3', 'E3', 'B♭3', 'D♯4'])[0], ['C·R', 'E·3', 'B♭·♭7', 'D♯·♯9']);
  assert('A6 C7sus4 with F played → F·4 (Levine T5)',              nv('C7sus4', ['C3', 'F3', 'G3', 'B♭3'])[0], ['C·R', 'F·4', 'G·5', 'B♭·♭7']);
  assert('A7 C7sus4 with F missing → omitted F·4',                 nv('C7sus4', ['C3', 'G3', 'B♭3'])[1], ['F·4']);
  assert('A8 C6 with A played → A·6 (Levine T6)',                  nv('C6', ['C3', 'E3', 'G3', 'A3'])[0], ['C·R', 'E·3', 'G·5', 'A·6']);
  assert('A9 C6 with A missing → omitted A·6',                     nv('C6', ['C3', 'E3', 'G3'])[1], ['A·6']);
  assert('A10 Cm7♭5 with midi A♭ → added A♭·♭13 (was G♯·♯5)',      nv('Cm7♭5', [48, 51, 54, 56, 58])[2], ['A♭·♭13']);
  assert('A11 Cmaj7 with A written → added A·13 (unnamed: letter path, unchanged)', nv('Cmaj7', ['C3', 'E3', 'B3', 'A3'])[2], ['A·13']);
  assert('A12 Gmaj7 with B♭ written → added B♭·♭3 (letter path, unchanged)', nv('Gmaj7', ['G2', 'B3', 'B♭3'])[2], ['B♭·♭3']);
  assert('A13 plain C7 with E♭ written → added E♭·♭3 (unnamed on C7: spelling decides)', nv('C7', ['C3', 'E3', 'B♭3', 'E♭4'])[2], ['E♭·♭3']);
  assert('C13 with A → A·13; Cm6 with A → A·6; C6/9 → A·6 D·9',   [nv('C13', ['C3', 'E3', 'B♭3', 'A3'])[0].pop(), nv('Cm6', ['C3', 'E♭3', 'A3'])[0].pop(), nv('C6/9', ['C3', 'E3', 'A3', 'D4'])[0].slice(-2)], ['A·13', 'A·6', ['A·6', 'D·9']]);
  assert('Cdim7 with midi A♭ → added A♭·♭13 (was G♯·♯5)',          nv('Cdim7', [48, 51, 54, 57, 56])[2], ['A♭·♭13']);
  assert('C7♯5 with G♯ written → G♯·♯5 (named ♯5 stays ♯5)',       nv('C7♯5', ['C3', 'E3', 'G♯3', 'B♭3'])[0], ['C·R', 'E·3', 'G♯·♯5', 'B♭·♭7']);
  assert('C9sus4 with F → F·4; Cm11 with F → F·11 (Levine T5)',   [nv('C9sus4', ['C3', 'F3', 'B♭3', 'D4'])[0][1], nv('Cm11', ['C3', 'E♭3', 'B♭3', 'F4'])[0].pop()], ['F·4', 'F·11']);
  assert('C7alt by midi: R 3 ♭7 present; ♭9 ♯9 ♯11 ♭13 added, ♯11 spelled F♯ (Levine T1)', nv('C7alt', [48, 52, 58, 49, 51, 54, 56]), [['C·R', 'E·3', 'B♭·♭7'], [], ['D♭·♭9', 'D♯·♯9', 'F♯·♯11', 'A♭·♭13']]);
  assert('C7alt written: E♭ and A♭ keep their names, labelled ♯9 and ♭13', nv('C7alt', ['C3', 'E3', 'B♭3', 'E♭4', 'A♭4'])[2], ['E♭·♯9', 'A♭·♭13']);

  // ── Fixture ──────────────────────────────────────────────────────
  const fixtureURL = new URL('../../tests/fixtures/voicing-fixture.json', import.meta.url);
  const fixture = JSON.parse(fs.readFileSync(fixtureURL, 'utf8'));
  const comp = analyzeProgression(fixture);
  const mel  = analyzeProgression(fixture, { includeMelody: true });
  const C = n => comp.bars.find(b => b.bar === n);
  const M = n => mel.bars.find(b => b.bar === n);

  console.log('\n  fixture: tests/fixtures/voicing-fixture.json');
  assert('bar 1  m2 cluster alone → 3 (C2–B3 M14 is an extension, 0)', C(1).total, 3);
  assert('bar 1  rub labels = [m2]',                     C(1).comp.rubs.map(r => r.label), ['m2']);
  assert('bar 2  M7 (11 semitones) → 1',                 C(2).total, 1);
  assert('bar 3  same PCs at 13 semitones (m9) → 2',     C(3).total, 2);
  assert('bar 3  slash bass B is present as 7',          fmt(C(3).namedVsPlayed.present), ['C·R', 'B·7']);
  assert('bar 4  tritone alone → 2',                     C(4).total, 2);
  assert('bar 4  C7/E: present 3, ♭7; omitted R, 5',     [fmt(C(4).namedVsPlayed.present), fmt(C(4).namedVsPlayed.omitted)],
    [['E·3', 'B♭·♭7'], ['C·R', 'G·5']]);
  assert('bar 5  Gm7/F → 3 (two events scoring 3 and 2; the max event is reported)', [C(5).total, C(5).events.map(e => e.total), C(5).maxEvent], [3, [3, 2], 0]);
  assert('bar 5  present ♭3 5 ♭7; omitted R; added 9',   [fmt(C(5).namedVsPlayed.present), fmt(C(5).namedVsPlayed.omitted), fmt(C(5).namedVsPlayed.added)],
    [['B♭·♭3', 'D·5', 'F·♭7'], ['G·R'], ['A·9']]);
  assert('bar 6  A7♯11/C♯ → TT 2 (C♯3–D♯4 M9 is an extension, 0)', C(6).total, 2);
  assert('bar 6  D♯ spelled as ♯11; omitted A·R E·5',    [fmt(C(6).namedVsPlayed.present), fmt(C(6).namedVsPlayed.omitted)],
    [['C♯·3', 'G·♭7', 'D♯·♯11'], ['A·R', 'E·5']]);
  assert('bar 7  comp 0, melody m2 2 beats of 4 → 1.5',  [C(7).total, M(7).total], [0, 1.5]);
  assert('bar 7  melody rub contribution 1.5',           M(7).melody.rubs.map(r => r.contribution), [1.5]);
  assert('bar 8  written B♭ over Gmaj7 labels ♭3',       fmt(M(8).namedVsPlayed.added), ['B♭·♭3']);
  assert('bar 8  comp-only has no added tones',          fmt(C(8).namedVsPlayed.added), []);
  assert('bar 9→10 three voices up 2 each → 6',          C(10).motion.total, 6);
  assert('bar 10→11 three voices into four: optimal assignment 3, one unmatched', [C(11).motion.total, C(11).motion.unmatched.map(u => [u.side, u.midi])], [3, [['to', 59]]]);
  assert('bar 12 hold carries G7',                       [C(12).hold, C(12).effectiveSymbol], [true, 'G7']);
  assert('bar 11→12 identical voicing → motion 0',       C(12).motion.total, 0);
  assert('midi-only voicing spells chord-relatively',    fmt(namedVsPlayed('A7#11', [49, 55, 63]).present), ['C♯·3', 'G·♭7', 'D♯·♯11']);

  // ── Regression + rag (public) ─────────────────────────────────────
  const singleOK = res => res.bars.filter(b => b.events.length === 1).every(b => b.total === intervalTension(b.events[0].bass, b.events[0].voicing).score);
  assert('regression: fixture single-event bars keep their comp totals', singleOK(comp), true);
  const ragURL = new URL('../../tests/fixtures/voicing-maple-leaf-rag.json', import.meta.url);
  if (fs.existsSync(ragURL)) {
    const rag = JSON.parse(fs.readFileSync(ragURL, 'utf8'));
    const rc = analyzeProgression(rag);
    const R = n => rc.bars.find(b => b.bar === n);
    console.log('\n  rag: tests/fixtures/voicing-maple-leaf-rag.json');
    assert('regression: rag single-event bars keep their comp totals', singleOK(rc), true);
    assert('bar 9: four dim7 events, each two tritones → 4; within-bar motion 0', [R(9).events.map(e => e.total), R(9).motionWithin.total], [[4, 4, 4, 4], 0]);
    assert('bar 12: three events, max is the E♭7/D♭ chord',          [R(12).events.map(e => e.total), R(12).maxEvent], [[0, 2, 0], 1]);
    assert('bar 17 (2nd ending) follows bar 15; bar 1 has no predecessor', [R(17).predecessor, R(1).predecessor], [15, null]);
  }

  // ── Acceptance: Don't Be Sad (private, optional) ─────────────────
  const privURL = new URL('../private/dont-be-sad.json', import.meta.url);
  if (fs.existsSync(privURL)) {
    console.log('\n  acceptance: static/private/dont-be-sad.json');
    const prog = JSON.parse(fs.readFileSync(privURL, 'utf8'));
    const pc = analyzeProgression(prog);
    const pm = analyzeProgression(prog, { includeMelody: true });
    const B = (r, n) => r.bars.find(b => b.bar === n);
    assert('bar 2 tension 3',                      B(pc, 2).total, 3);
    assert('bar 3 tension 1',                      B(pc, 3).total, 1);
    assert('bar 17 tension 4 (comp)',              B(pc, 17).total, 4);
    near  ('bar 17 tension 4.333 (with melody; was 5.0: the beat-0 G4 sounds before the comp enters and is no longer scored)', B(pm, 17).total, 4.333);
    assert('bar 1 omitted F♯·7, added A·9',        [fmt(B(pc, 1).namedVsPlayed.omitted), fmt(B(pc, 1).namedVsPlayed.added)], [['F♯·7'], ['A·9']]);
    assert('bar 17 with melody adds A·9, B♭·♭3',   fmt(B(pm, 17).namedVsPlayed.added), ['A·9', 'B♭·♭3']);
    assert('bars 1→2→3 upper-voice motion 1, 2',   [B(pc, 2).motion.total, B(pc, 3).motion.total], [1, 2]);
    assert('bar 4 hold carries E♭maj7, motion 0',  [B(pc, 4).effectiveSymbol, B(pc, 4).motion.total], ['E♭maj7', 0]);
    assert('bars 18→19 motion 11 (sorted upper voices)', B(pc, 19).motion.total, 11);
    near  ('bar 16 with melody 3.556 (was 2.67 before option B: G4/C♯3 tritone + octave now 2 × 2/3 × 2/3 beats)', B(pm, 16).total, 3.556);
    near  ('bar 18 with melody 3.667 (was 4.0: melody before the comp onset unscored)', B(pm, 18).total, 3.667);
    near  ('bar 26 with melody 2.0 (was 3.333: C5 vs F♯4 counts only its 1-beat overlap)', B(pm, 26).total, 2.0);
    // ── per-event analysis (4a) ──
    assert('bar 26 events: comp tension 1.333 then 2; bar total = max = 2 from event 1',
           [B(pc, 26).events.map(e => e.total), B(pc, 26).total, B(pc, 26).maxEvent], [[1.333, 2], 2, 1]);
    assert('bar 26 with melody: events 2.0 and 2.0 (C5/F♯4 TT × 1 beat; event 2 has no rub)',
           [B(pm, 26).events.map(e => e.total), B(pm, 26).events[0].melody.rubs.map(r => r.melody + '/' + r.against + ':' + r.contribution)], [[2, 2], ['C5/F♯4:0.667']]);
    assert('bar 26 event 2 is scored against B♭7/F (the symbol at beat 2): D·3 A♭·♭7 F·5, omitted B♭·R',
           [B(pc, 26).events[1].symbol, fmt(B(pc, 26).events[1].namedVsPlayed.present), fmt(B(pc, 26).events[1].namedVsPlayed.omitted)], ['B♭7/F', ['D·3', 'F·5', 'A♭·♭7'], ['B♭·R']]);
    assert('bar 26 motion in = 8 (F3→A3, B♭3→D4; F♯4 free)',   [B(pc, 26).motion.total, B(pc, 26).motion.unmatched], [8, [{ side: 'to', midi: 66, name: 'F♯4' }]]);
    assert('bar 26 motion within = 1 (A3→A♭3, D4 stays; F♯4 free)', [B(pc, 26).motionWithin.total, B(pc, 26).motionWithin.steps[0].unmatched], [1, [{ side: 'from', midi: 66, name: 'F♯4' }]]);
    assert('bar 27 motion in = 1 from bar 26\'s last event (A♭3→G3; B♭3 free, spelled as written)', [B(pc, 27).motion.total, B(pc, 27).motion.unmatched], [1, [{ side: 'to', midi: 58, name: 'B♭3' }]]);
    assert('bar 37 (2nd ending) takes its motion from bar 28, its performance predecessor', B(pc, 37).predecessor, 28);
    const single = pc.bars.filter(b => b.events.length === 1);
    assert('regression: every single-event bar (' + single.length + ') keeps its comp total = intervalTension(first event)',
           single.every(b => b.total === intervalTension(b.events[0].bass, b.events[0].voicing).score), true);
    assert('bar 26 slash bass F (not in maj9♯5) is present as 5', fmt(B(pc, 26).namedVsPlayed.present), ['D·3', 'F♯·♯5', 'A·7', 'F·5']);
  } else {
    console.log('\n  acceptance: static/private/dont-be-sad.json not present — skipped');
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
