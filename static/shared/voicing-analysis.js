/**
 * voicing-analysis.js
 * ===================
 * Analysis engine for voiced chord progressions: interval tension,
 * melody-vs-voicing tension, named-vs-played chord tones, and
 * upper-voice motion between bars.
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
 *   namedVsPlayed, voiceMotion, analyzeProgression, toHarmonyNotes,
 *   TENSION_WEIGHTS, INTERVAL_LABELS, LOCAL_CHORD_TYPES, selfTest
 *
 * Self-test (from the repo root):
 *   node --input-type=module -e "import('./static/shared/voicing-analysis.js').then(m => m.selfTest())"
 */

import { CHORD_TYPES, pcToNote } from './transforms.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

/** Tension weight by exact semitone distance. Anything else scores 0. */
const TENSION_WEIGHTS = { 1: 3, 2: 1, 6: 2, 11: 1, 13: 2 };
const INTERVAL_LABELS = { 1: 'm2', 2: 'M2', 6: 'TT', 11: 'M7', 13: 'm9' };
const INTERVAL_KEYS   = ['m2', 'M2', 'TT', 'M7', 'm9'];

/**
 * Chord types transforms.js lacks. Same shape as CHORD_TYPES entries.
 * Logged in docs/registry-inventory.md (§9).
 */
const LOCAL_CHORD_TYPES = {
  '6':        { intervals: [0, 4, 7, 9],          symbol: '6',       name: 'Major 6th',             base: 'major' },
  'm6':       { intervals: [0, 3, 7, 9],          symbol: 'm6',      name: 'Minor 6th',             base: 'minor' },
  '7#11':     { intervals: [0, 4, 7, 10, 18],     symbol: '7♯11',    name: 'Dominant 7th ♯11',      base: 'major' },
  '7b9':      { intervals: [0, 4, 7, 10, 13],     symbol: '7♭9',     name: 'Dominant 7th ♭9',       base: 'major' },
  '7#9':      { intervals: [0, 4, 7, 10, 15],     symbol: '7♯9',     name: 'Dominant 7th ♯9',       base: 'major' },
  'maj7#11':  { intervals: [0, 4, 7, 11, 18],     symbol: 'maj7♯11', name: 'Major 7th ♯11',         base: 'major' },
  'maj9#5':   { intervals: [0, 4, 8, 11, 14],     symbol: 'maj9♯5',  name: 'Major 9th ♯5',          base: 'augmented' },
};

/** Symbol suffix (ASCII-normalised) → chord type id in CHORD_TYPES or LOCAL_CHORD_TYPES. */
const SUFFIX_TO_TYPE = {
  '': 'major', 'maj': 'major', 'M': 'major',
  'm': 'minor', 'min': 'minor', '-': 'minor',
  'dim': 'diminished', 'o': 'diminished',
  'aug': 'augmented', '+': 'augmented',
  '7': 'dom7', 'maj7': 'maj7', 'M7': 'maj7', 'ma7': 'maj7',
  'm7': 'min7', 'min7': 'min7', '-7': 'min7',
  'dim7': 'dim7', 'o7': 'dim7',
  'm7b5': 'half-dim7', 'h7': 'half-dim7', 'h': 'half-dim7',
  'mmaj7': 'minmaj7', 'mM7': 'minmaj7', 'mmaj7': 'minmaj7', 'm(maj7)': 'minmaj7',
  'sus4': 'sus4', 'sus': 'sus4', 'sus2': 'sus2', '7sus4': '7sus4', '7sus': '7sus4',
  'add9': 'add9', '9': 'dom9', 'maj9': 'maj9', 'M9': 'maj9', 'm9': 'min9', 'min9': 'min9',
  '6': '6', 'm6': 'm6', '7#11': '7#11', '7b9': '7b9', '7#9': '7#9',
  'maj7#11': 'maj7#11', 'M7#11': 'maj7#11', 'maj9#5': 'maj9#5', 'M9#5': 'maj9#5',
};

const LETTERS   = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Major-scale semitone for each letter step above the root (0 = root). */
const STEP_PC   = [0, 2, 4, 5, 7, 9, 11];
/** Degree number for each letter step, as chord-tone labels use them. */
const STEP_DEGREE = ['R', '9', '3', '11', '5', '13', '7'];
const ACC_STR   = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '♯♯' };

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
 * Uses the written letter when the note has one (B♭ over G → ♭3);
 * otherwise falls back to the semitone table (chord-aware) and spells
 * the result chord-relatively.
 */
function _degreeOf(note, root, chordDef) {
  if (note.letter) {
    const steps = (LETTERS.indexOf(note.letter) - LETTERS.indexOf(root.letter) + 7) % 7;
    const expected = (root.pc + STEP_PC[steps]) % 12;
    let diff = ((note.pc - expected) % 12 + 12) % 12;
    if (diff > 6) diff -= 12;
    const base = STEP_DEGREE[steps];
    const degree = (ACC_STR[String(diff)] ?? '') + base;
    return { degree, name: note.name };
  }
  const semis = ((note.pc - root.pc) % 12 + 12) % 12;
  return _spellDegree(root, semis, chordDef);
}

/**
 * Chord-relative degree label + spelling from a semitone offset.
 * Used for omitted chord tones (no written form) and midi-only input.
 */
function _spellDegree(root, semis, chordDef) {
  const ivs = new Set((chordDef?.intervals || []).map(i => i % 12));
  const id = chordDef?.id || '';
  const has = s => ivs.has(s);
  let degree;
  switch (semis % 12) {
    case 0:  degree = 'R'; break;
    case 1:  degree = '♭9'; break;
    case 2:  degree = id === 'sus2' ? '2' : '9'; break;
    case 3:  degree = has(4) ? '♯9' : '♭3'; break;
    case 4:  degree = '3'; break;
    case 5:  degree = (id === 'sus4' || id === '7sus4') ? '4' : '11'; break;
    case 6:  degree = has(7) ? '♯11' : '♭5'; break;
    case 7:  degree = '5'; break;
    case 8:  degree = has(7) ? '♭13' : '♯5'; break;
    case 9:  degree = id === 'dim7' ? '♭♭7' : (id === '6' || id === 'm6' ? '6' : '13'); break;
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

const _SYM_RE = /^([A-G])([#♯b♭\-]?)(.*?)(?:\/([A-G])([#♯b♭\-]?))?$/;

/**
 * Parse a chord symbol such as "Gm7/F", "A7♯11/C♯", "E-maj7".
 *
 * @returns {{ root:string, rootPC:number, type:string, intervals:number[],
 *             bass:string|null, bassPC:number|null, display:string, def:Object }|null}
 *   `type` is the id in CHORD_TYPES or LOCAL_CHORD_TYPES. null if the
 *   root or suffix is not understood.
 */
function parseSymbol(symbol) {
  if (typeof symbol !== 'string') return null;
  const m = symbol.trim().match(_SYM_RE);
  if (!m) return null;
  const root = parseNote(m[1] + m[2]);
  const suffixRaw = m[3];
  const suffix = suffixRaw.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj').replace(/°/g, 'o').replace(/ø/g, 'h');
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
 * scored by exact semitone distance (TENSION_WEIGHTS).
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
      const w = TENSION_WEIGHTS[d];
      if (!w) continue;
      const label = INTERVAL_LABELS[d];
      byInterval[label] += w;
      rubs.push({ lo: notes[i].raw, hi: notes[j].raw, semitones: d, label, weight: w });
    }
  }
  const score = INTERVAL_KEYS.reduce((s, k) => s + byInterval[k], 0);
  return { score, byInterval, rubs };
}

/**
 * Melody-vs-voicing tension. Melody durations are summed per pitch
 * within the bar; each pitch is checked against every comp note
 * (bass included); contribution = weight × dur / beatsPerBar.
 * Melody-vs-melody intervals are not scored.
 *
 * @param {Array<{note:string|number, dur:number}>} melody
 * @param {string|number} bass
 * @param {Array<string|number>} voicing
 * @param {number} beatsPerBar
 */
function melodyTension(melody, bass, voicing, beatsPerBar) {
  const byInterval = _emptyByInterval();
  const rubs = [];
  if (!melody || !melody.length || !beatsPerBar) return { score: 0, byInterval, rubs };

  // aggregate per pitch, keep first spelling
  const perPitch = new Map();
  for (const ev of melody) {
    const midi = toMidi(ev.note ?? ev.midi);
    if (isNaN(midi)) continue;
    const cur = perPitch.get(midi) || { raw: ev.note ?? ev.midi, midi, dur: 0 };
    cur.dur += Number(ev.dur) || 0;
    perPitch.set(midi, cur);
  }
  const comp = [bass, ...(voicing || [])]
    .map(n => ({ raw: n, midi: toMidi(n) }))
    .filter(n => !isNaN(n.midi));

  for (const m of [...perPitch.values()].sort((a, b) => a.midi - b.midi)) {
    for (const c of comp) {
      const d = Math.abs(m.midi - c.midi);
      const w = TENSION_WEIGHTS[d];
      if (!w) continue;
      const label = INTERVAL_LABELS[d];
      const contribution = w * m.dur / beatsPerBar;
      byInterval[label] = _round(byInterval[label] + contribution);
      rubs.push({ melody: m.raw, against: c.raw, semitones: d, label, dur: m.dur, contribution: _round(contribution) });
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
 * Voices are paired low-to-high. Returns null when the voice counts
 * differ or either voicing is empty.
 */
function voiceMotion(prevVoicing, voicing) {
  const a = (prevVoicing || []).map(toMidi).filter(m => !isNaN(m)).sort((x, y) => x - y);
  const b = (voicing || []).map(toMidi).filter(m => !isNaN(m)).sort((x, y) => x - y);
  if (!a.length || !b.length || a.length !== b.length) return null;
  const perVoice = a.map((from, i) => ({ from, to: b[i], delta: b[i] - from }));
  const total = perVoice.reduce((s, v) => s + Math.abs(v.delta), 0);
  return { total, perVoice };
}

// ════════════════════════════════════════════════════════════════════
// PROGRESSION
// ════════════════════════════════════════════════════════════════════

/**
 * Analyze a whole voiced progression (schema: tools/voicings/schema.md).
 * Uses the first comp event of each bar. Empty `symbols` carry the
 * previous bar's symbol forward.
 *
 * @param {Object} progression
 * @param {{ includeMelody?:boolean }} [opts]
 * @returns {{ beatsPerBar:number, bars:Array<BarResult> }}
 *
 * BarResult: { bar, section, source, effectiveSymbol, parsed, comp, melody,
 *              total, byInterval, namedVsPlayed, motion, hold }
 */
function analyzeProgression(progression, opts = {}) {
  const includeMelody = !!opts.includeMelody;
  const beatsPerBar = progression.beatsPerBar
    || (progression.timeSignature ? _beatsFromSig(progression.timeSignature) : 4);
  const results = [];
  let carried = null;
  let prevVoicing = null;

  for (const bar of progression.bars || []) {
    const symbols = bar.symbols || [];
    const hold = symbols.length === 0;
    const effectiveSymbol = hold ? carried : symbols[0].symbol;
    if (!hold) carried = symbols[symbols.length - 1].symbol;
    const parsed = effectiveSymbol ? parseSymbol(effectiveSymbol) : null;

    const ev = (bar.comp || [])[0] || null;
    const bass = ev ? ev.bass : null;
    const voicing = ev ? (ev.voicing || []) : [];

    const comp = ev ? intervalTension(bass, voicing) : { score: 0, byInterval: _emptyByInterval(), rubs: [] };
    const melody = (ev && includeMelody)
      ? melodyTension(bar.melody || [], bass, voicing, beatsPerBar)
      : null;

    const byInterval = _emptyByInterval();
    for (const k of INTERVAL_KEYS) byInterval[k] = _round(comp.byInterval[k] + (melody ? melody.byInterval[k] : 0));
    const total = _round(comp.score + (melody ? melody.score : 0));

    const pitches = ev ? [bass, ...voicing] : [];
    if (ev && includeMelody) for (const m of bar.melody || []) pitches.push(m.note ?? m.midi);
    const nvp = parsed && ev ? namedVsPlayed(parsed, pitches) : null;

    const motion = (ev && prevVoicing) ? voiceMotion(prevVoicing, voicing) : null;
    if (ev) prevVoicing = voicing;

    results.push({
      bar: bar.bar, section: bar.section, source: bar.source,
      effectiveSymbol, hold, parsed: parsed ? { ...parsed, _root: undefined } : null,
      comp, melody, total, byInterval, namedVsPlayed: nvp, motion,
    });
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
  TENSION_WEIGHTS, INTERVAL_LABELS, LOCAL_CHORD_TYPES,
  parseNote, parseSymbol, intervalTension, melodyTension, namedVsPlayed,
  voiceMotion, analyzeProgression, toHarmonyNotes, selfTest,
};

if (typeof window !== 'undefined') {
  window.VoicingAnalysis = {
    TENSION_WEIGHTS, INTERVAL_LABELS, LOCAL_CHORD_TYPES,
    parseNote, parseSymbol, intervalTension, melodyTension, namedVsPlayed,
    voiceMotion, analyzeProgression, toHarmonyNotes,
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

  // ── Unit: notes & symbols ─────────────────────────────────────────
  assert('parseNote("B♭4").midi = 70', parseNote('B♭4').midi, 70);
  assert('parseNote("Bb4") ≡ parseNote("B-4") (midi)', parseNote('Bb4').midi, parseNote('B-4').midi);
  assert('parseNote(60) → C4', [parseNote(60).name, parseNote(60).octave], ['C', 4]);
  assert('parseSymbol("A7♯11/C♯")', (({ root, type, bass, display }) => ({ root, type, bass, display }))(parseSymbol('A7♯11/C♯')),
    { root: 'A', type: '7#11', bass: 'C♯', display: 'A7♯11/C♯' });
  assert('parseSymbol("E-maj7").display = E♭maj7', parseSymbol('E-maj7').display, 'E♭maj7');
  assert('parseSymbol("Gm9").type = min9 (from transforms)', parseSymbol('Gm9').type, 'min9');
  assert('parseSymbol("Xyz") = null', parseSymbol('Xyz'), null);
  assert('toHarmonyNotes(["F♯3", 62])', toHarmonyNotes(['F♯3', 62]),
    [{ note: 'F♯', octave: 3, source: 'user', color: null }, { note: 'D', octave: 4, source: 'user', color: null }]);

  // ── Fixture ──────────────────────────────────────────────────────
  const fixtureURL = new URL('../../tests/fixtures/voicing-fixture.json', import.meta.url);
  const fixture = JSON.parse(fs.readFileSync(fixtureURL, 'utf8'));
  const comp = analyzeProgression(fixture);
  const mel  = analyzeProgression(fixture, { includeMelody: true });
  const C = n => comp.bars.find(b => b.bar === n);
  const M = n => mel.bars.find(b => b.bar === n);

  console.log('\n  fixture: tests/fixtures/voicing-fixture.json');
  assert('bar 1  m2 cluster alone → 3',                 C(1).total, 3);
  assert('bar 1  rub labels = [m2]',                     C(1).comp.rubs.map(r => r.label), ['m2']);
  assert('bar 2  M7 (11 semitones) → 1',                 C(2).total, 1);
  assert('bar 3  same PCs at 13 semitones (m9) → 2',     C(3).total, 2);
  assert('bar 3  slash bass B is present as 7',          fmt(C(3).namedVsPlayed.present), ['C·R', 'B·7']);
  assert('bar 4  tritone alone → 2',                     C(4).total, 2);
  assert('bar 4  C7/E: present 3, ♭7; omitted R, 5',     [fmt(C(4).namedVsPlayed.present), fmt(C(4).namedVsPlayed.omitted)],
    [['E·3', 'B♭·♭7'], ['C·R', 'G·5']]);
  assert('bar 5  Gm7/F → 3 (first comp event only)',     C(5).total, 3);
  assert('bar 5  present ♭3 5 ♭7; omitted R; added 9',   [fmt(C(5).namedVsPlayed.present), fmt(C(5).namedVsPlayed.omitted), fmt(C(5).namedVsPlayed.added)],
    [['B♭·♭3', 'D·5', 'F·♭7'], ['G·R'], ['A·9']]);
  assert('bar 6  A7♯11/C♯ → TT 2',                       C(6).total, 2);
  assert('bar 6  D♯ spelled as ♯11; omitted A·R E·5',    [fmt(C(6).namedVsPlayed.present), fmt(C(6).namedVsPlayed.omitted)],
    [['C♯·3', 'G·♭7', 'D♯·♯11'], ['A·R', 'E·5']]);
  assert('bar 7  comp 0, melody m2 2 beats of 4 → 1.5',  [C(7).total, M(7).total], [0, 1.5]);
  assert('bar 7  melody rub contribution 1.5',           M(7).melody.rubs.map(r => r.contribution), [1.5]);
  assert('bar 8  written B♭ over Gmaj7 labels ♭3',       fmt(M(8).namedVsPlayed.added), ['B♭·♭3']);
  assert('bar 8  comp-only has no added tones',          fmt(C(8).namedVsPlayed.added), []);
  assert('bar 9→10 three voices up 2 each → 6',          C(10).motion.total, 6);
  assert('bar 10→11 voice count differs → null',         C(11).motion, null);
  assert('bar 12 hold carries G7',                       [C(12).hold, C(12).effectiveSymbol], [true, 'G7']);
  assert('bar 11→12 identical voicing → motion 0',       C(12).motion.total, 0);
  assert('midi-only voicing spells chord-relatively',    fmt(namedVsPlayed('A7#11', [49, 55, 63]).present), ['C♯·3', 'G·♭7', 'D♯·♯11']);

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
    near  ('bar 17 tension 5.0 (with melody)',     B(pm, 17).total, 5.0);
    assert('bar 1 omitted F♯·7, added A·9',        [fmt(B(pc, 1).namedVsPlayed.omitted), fmt(B(pc, 1).namedVsPlayed.added)], [['F♯·7'], ['A·9']]);
    assert('bar 17 with melody adds A·9, B♭·♭3',   fmt(B(pm, 17).namedVsPlayed.added), ['A·9', 'B♭·♭3']);
    assert('bars 1→2→3 upper-voice motion 1, 2',   [B(pc, 2).motion.total, B(pc, 3).motion.total], [1, 2]);
    assert('bar 4 hold carries E♭maj7, motion 0',  [B(pc, 4).effectiveSymbol, B(pc, 4).motion.total], ['E♭maj7', 0]);
    assert('bars 18→19 motion 11 (sorted upper voices)', B(pc, 19).motion.total, 11);
    near  ('bar 16 with melody 2.67',              B(pm, 16).total, 2.67);
    near  ('bar 18 with melody 4.0',               B(pm, 18).total, 4.0);
    near  ('bar 26 with melody 2.0',               B(pm, 26).total, 2.0);
    assert('bar 26 slash bass F (not in maj9♯5) is present as 5', fmt(B(pc, 26).namedVsPlayed.present), ['D·3', 'F♯·♯5', 'A·7', 'F·5']);
  } else {
    console.log('\n  acceptance: static/private/dont-be-sad.json not present — skipped');
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
