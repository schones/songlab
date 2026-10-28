/**
 * voicing-explore.js
 * ==================
 * Explore core for /voicings: generate alternative voicings for one comp
 * event, score them with the analysis engine, rank them against a tension
 * target, and apply chosen voicings as a non-destructive override layer.
 *
 * Explore never re-classifies. It writes comp[i].voicing only — never
 * bass, bassLine or melody. Roles are the interface (RADAR 2026-10-16);
 * a future transcription aid proposes them, Explore re-voices within them.
 *
 * Pure functions — no DOM. Standard MIDI internally (C4 = 60); candidate
 * voicings are spelled chord-relatively (the engine's named-vs-played
 * speller) with octaves, so they drop straight into the schema.
 *
 * Depends on: voicing-analysis.js (parseNote, parseSymbol, intervalTension,
 *             melodyTension, voiceMotion, namedVsPlayed, barNeighbours)
 *
 * Exports:
 *   chordTones(symbolOrParsed)                     → { parsed, named, pool, dominant } | null
 *   voicedNeighbours(progression, bar, eventIndex) → { prev, next }  (nearest events WITH a voicing: { bar, event, events, bass, voicing })
 *   eventContext(progression, bar, eventIndex)     → ctx for generate/score, or null
 *   pieceCeiling(progression)                      → highest comp voicing note in the piece (midi)
 *   shapeKey(voicing, bass, parsed)                → { key, degrees, aboveBass, count } | null  (one voicing's shape)
 *   harvestShapes(progression, analysis?, opts)    → shape library: [{ key, name, degrees, aboveBass, count, bars }]
 *   mergeShapes(...libraries)                      → one library, identical layouts merged
 *   applyShape(shape, parsed, bass, context?)      → { ok, voicing, midis, degrees, aboveBass } | { ok:false, reason }
 *   generateCandidates(ctx, opts)                  → { candidates, range, pool, skipped, warnings, removed }
 *   dominantRuleText(clause) / dominantRuleReason(clause) / dominantRuleViolation(degrees)  → the rule as text / a removal reason / the first clause a candidate breaks
 *   scoreCandidate(candidate, ctx, opts)           → scored candidate
 *   rankKey(candidate, target)                     → [distance, motion.total, omitted]
 *   rankCandidates(scored, { target })             → sorted copy with rank + distance
 *   expandOverrides(progression, overrides)        → overrides plus tie propagation
 *   applyOverrides(progression, overrides)         → new progression (input untouched)
 *   overrideKey(bar, eventIndex)                   → "bar:event"
 *   selfTest()
 *
 * Candidate rules (decisions 2026-10-16, Session 6):
 *   Tone pool   named chord tones (slash bass included) + the 9th; dominant
 *               types (major 3rd + minor 7th) also get the 13th and ♯11.
 *               The 9th is skipped when the symbol names an altered 9th.
 *   Count       same as the original (bounded 2–4; 3 when the original is
 *               empty); countRange 1 adds ±1.
 *   Register    every voicing note in [bass + 2, lowest melody note sounding
 *               in the event − 1]; without melody in the event, up to the
 *               piece's ceiling (pieceCeiling: its highest comp voicing
 *               note; opts.ceiling overrides). Span lowest→highest ≤
 *               opts.maxSpan (12).
 *   Shapes      harvested from the loaded piece by default (opts.shapes
 *               for a wider library): a shape is the degree labels of a
 *               voicing plus its layout above the bass. Re-instantiated
 *               by degree against the target chord: R/3/5/7 take the
 *               target's version (♭3, ♭5/♯5, ♭7/♭♭7 … by its type);
 *               9/11/13 keep their harvested accidental; a degree the
 *               target cannot supply (a 3rd on sus4, a 7th on a triad, a
 *               9th against a named ♭9) skips the shape with a reason.
 *               Shapes are exempt from the tone pool and the bass-double
 *               rule (they are the player's vocabulary), not from the
 *               melody rule, window, span or voice count. A voicing
 *               reachable from both sources is one candidate with both
 *               tags in `sources` ("symbol", "shape:<name or degrees>").
 *   Melody      applies whether or not the melody is in the analysis; no
 *               unison with a melody pitch; seconds allowed and scored.
 *               Fallback: when the window is too narrow because the melody
 *               dips within the event (no candidate of the wanted count
 *               fits) the bound is the melody note at the event onset and
 *               later clashes score as tension; range.fallback reports it.
 *   Doubling    no pitch class twice; the bass pitch class is excluded
 *               unless opts.allowBassDouble.
 *   Dominant    on dominant types only (DOMINANT_RULE): every candidate
 *   rule        must sound the ♭7, and one with ♯11 must also sound the
 *               3rd (bass + voicing). Dropped candidates are returned in
 *               `removed` with a reason; the bar's own voicing is exempt;
 *               opts.dominantRule false switches it off.
 *   Ranking     distance from the tension target (rounded to TARGET_STEP, 0.5), then
 *               total motion (in + out), then fewer omitted named tones.
 *
 * Self-test (from the repo root):
 *   node --input-type=module -e "import('./static/shared/voicing-explore.js').then(m => m.selfTest())"
 */

import {
  parseNote, parseSymbol, intervalTension, melodyTension, voiceMotion, namedVsPlayed, barNeighbours,
} from './voicing-analysis.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const EPS = 0.01;                   // beats in the data are rounded to 4 decimals
const MIN_ABOVE_BASS = 2;           // lowest voicing note at least a major 2nd over the bass (bar 1: A3 over G3)
const DEFAULT_MAX_SPAN = 12;        // lowest → highest voicing note (every shape in both fixtures fits)
const FALLBACK_CEILING = 72;        // C5: only for a context without a progression (pieceCeiling is the rule)
/** Known shapes, keyed by degrees@layout (see harvestShapes). */
const SHAPE_NAMES = {
  '9-3-5@2.4.7':  '2-3-5 cluster',
  '7-♯11@6.14':   'pair over slash bass',   // the ♭7 is stored as 7 (the target supplies its own 7th)
  '5-3@7.16':     'bass–5th–10th shell',
};
/** Harvested degree label → shape degree: R/3/5/7 lose their accidental (the target supplies its own), extensions keep theirs. */
const DEGREE_CLASS = {
  R: 'R', '3': '3', '♭3': '3', '5': '5', '♭5': '5', '♯5': '5', '7': '7', '♭7': '7', '♭♭7': '7',
  '6': '13', '2': '9', '4': '11',
  '♭9': '♭9', '9': '9', '♯9': '♯9', '11': '11', '♯11': '♯11', '♭13': '♭13', '13': '13',
};
const EXTENSION_SEMIS = { '♭9': 1, '9': 2, '♯9': 3, '11': 5, '♯11': 6, '♭13': 8, '13': 9 };
/**
 * Dominant rule (heuristic, from listening: bar 21 of the private piece,
 * rag bar 12 event 2). On a dominant chord type, by degree class over
 * bass + voicing, clauses in order: a candidate without `when` must sound
 * `needs` (every candidate needs the ♭7); one carrying `when` must also
 * sound `needs` (♯11 also needs the 3rd). The old "13 needs ♭7" is implied
 * by the first clause. The bar's own voicing is exempt. Exported so the
 * explainer can quote it: DOMINANT_RULE.map(dominantRuleText) → the rule,
 * dominantRuleReason(clause) → the reason a removed candidate carries.
 */
const DOMINANT_RULE = [
  { needs: ['7'] },
  { when: '♯11', needs: ['3'] },
];
const DOMINANT_RULE_WORDS = { '3': '3rd', '7': '♭7' };
const MIN_COUNT = 2, MAX_COUNT = 4;
const DEFAULT_COUNT = 3;            // when the original voicing is empty
const TARGET_STEP = 0.5;            // tension-target granularity: ranking buckets, and the page's − / + nudges
const EXPLORE_ROWS = 12;            // ranked rows the Explore panel shows (the page reads this)
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ════════════════════════════════════════════════════════════════════
// NOTES
// ════════════════════════════════════════════════════════════════════

const ruleWords = clause => clause.needs.map(d => DOMINANT_RULE_WORDS[d]).join(' and ');
/** One clause as a rule: "every candidate needs the ♭7", "♯11 also needs the 3rd". */
function dominantRuleText(clause) { return clause.when ? `${clause.when} also needs the ${ruleWords(clause)}` : `every candidate needs the ${ruleWords(clause)}`; }
/** One clause as the reason a candidate was removed: "no ♭7", "♯11 without the 3rd". */
function dominantRuleReason(clause) { return clause.when ? `${clause.when} without the ${ruleWords(clause)}` : `no ${ruleWords(clause)}`; }
/** The reason for the first clause a set of sounding degree classes breaks, or null. */
function dominantRuleViolation(degreeClasses) {
  const has = new Set(degreeClasses.map(d => DEGREE_CLASS[d] ?? d));
  for (const clause of DOMINANT_RULE) if ((!clause.when || has.has(clause.when)) && !clause.needs.every(d => has.has(d))) return dominantRuleReason(clause);
  return null;
}

function midiOf(n) { const p = parseNote(n); return p && p.midi != null ? p.midi : NaN; }
function near(a, b) { return Math.abs(a - b) < EPS; }
function r3(x) { return Math.round(x * 1000) / 1000; }

/** Spell a midi number with a given pitch-class name ("C♭" at 59 → "C♭4"), octave by the letter. */
function spellMidi(midi, name) {
  const p = parseNote(name);
  if (!p || p.letter == null) return parseNote(midi).name + (Math.floor(midi / 12) - 1);
  const octave = Math.round((midi - LETTER_PC[p.letter] - p.acc) / 12) - 1;
  return p.name + octave;
}

/** Quarters during which a melody event sounds inside [beat, beat + dur). */
function overlap(m, beat, dur) {
  const a = Number(m.beat) || 0, d = Number(m.dur) || 0;
  return Math.min(a + d, beat + dur) - Math.max(a, beat);
}

// ════════════════════════════════════════════════════════════════════
// CHORD TONES
// ════════════════════════════════════════════════════════════════════

/** A dominant type names a major 3rd and a minor 7th (dom7, dom9, 7♯11, 7♭9, 7♯9; not 7sus4). */
function isDominant(parsed) {
  const ivs = new Set(parsed.intervals.map(i => i % 12));
  return ivs.has(4) && ivs.has(10);
}

/**
 * Named tones and the Explore tone pool for a chord symbol.
 *
 * @returns {{ parsed, named: Array<{pc, degree, name}>, pool: Array<{pc, degree, name, named:boolean}>, dominant:boolean }|null}
 *   named = the symbol's tones (slash bass included); pool = named plus the
 *   extensions above, each spelled chord-relatively. null when unparsed.
 *
 * Pool rules (heuristic), by semitone above the root:
 *   - 9 (2) on every type, unless the type names a ♭9 or ♯9 (an altered 9th
 *     displaces the natural one).
 *   - dominant types (major 3rd + minor 7th) add 13 (9) and ♯11 (6).
 *   - `def.alt` (7alt, Levine T1): ♭9 ♯9 ♯11 ♭13 (1 3 6 8) and no 5, 9 or 13.
 *   - half-diminished (minor 3rd, ♭5, minor 7th): 11 (5) and ♭13 (8), never
 *     ♭9 — Locrian's avoid note (Levine H3); 9 stays in, from Locrian ♯2
 *     (Levine H4); ♭13 is a scale tone in both modes (Levine H5).
 */
function chordTones(symbolOrParsed) {
  const parsed = typeof symbolOrParsed === 'string' ? parseSymbol(symbolOrParsed) : symbolOrParsed;
  if (!parsed) return null;
  const root = parsed.rootPC;
  const ivs = new Set(parsed.intervals.map(i => i % 12));
  const namedPCs = [];
  for (const iv of parsed.intervals) { const pc = (root + iv) % 12; if (!namedPCs.includes(pc)) namedPCs.push(pc); }
  if (parsed.bassPC != null && !namedPCs.includes(parsed.bassPC)) namedPCs.push(parsed.bassPC);
  const dominant = isDominant(parsed);
  const alt = !!parsed.def?.alt;
  const halfDim = ivs.has(3) && ivs.has(6) && ivs.has(10) && !ivs.has(7);
  const altered9 = ivs.has(1) || ivs.has(3) && dominant;   // a named ♭9, or a ♯9 on a dominant (3 is the ♭3 elsewhere)
  const extSemis = [];
  if (alt) extSemis.push(1, 3, 6, 8);
  else {
    if (!altered9) extSemis.push(2);
    if (dominant) extSemis.push(9, 6);
    if (halfDim) extSemis.push(5, 8);
  }
  const extPCs = extSemis.map(s => (root + s) % 12);
  const allPCs = [...namedPCs, ...extPCs.filter(pc => !namedPCs.includes(pc))];
  // Spell every pool tone through the engine's chord-relative speller (midi input → degree + name).
  const nvp = namedVsPlayed(parsed, allPCs.map(pc => 60 + pc));
  const label = new Map();
  for (const e of [...nvp.present, ...nvp.added]) label.set(e.pc, e);
  const entry = pc => ({ pc, degree: label.get(pc)?.degree ?? '?', name: label.get(pc)?.name ?? parseNote(pc).name });
  const named = namedPCs.map(entry);
  const pool = allPCs.map(pc => ({ ...entry(pc), named: namedPCs.includes(pc) }));
  return { parsed, named, pool, dominant };
}

// ════════════════════════════════════════════════════════════════════
// NEIGHBOURS
// ════════════════════════════════════════════════════════════════════

const hasVoicing = ev => !!(ev && Array.isArray(ev.voicing) && ev.voicing.length);

/**
 * Nearest comp events WITH a voicing before and after (bar, eventIndex):
 * earlier events of the same bar first, then the performance predecessors
 * (barNeighbours) bar by bar; likewise forward. Bars without a voicing
 * (rag 5–8, bare basses) are skipped — Explore's motion reference is the
 * most recent voicing, not the raw predecessor. Cycles in playOrder stop
 * at the first revisited bar.
 *
 * @returns {{ prev: {bar, event, events, bass, voicing}|null, next: {bar, event, events, bass, voicing}|null }}
 *   `events` is how many comp events that bar has (the describer says "bar 4" or "bar 4, event 2").
 */
function voicedNeighbours(progression, barNumber, eventIndex = 0) {
  const bars = progression.bars || [];
  const byNum = new Map(bars.map(b => [b.bar, b]));
  const { prev, next } = barNeighbours(progression);
  const ref = (bar, i) => ({ bar: bar.bar, event: i, events: bar.comp.length, bass: bar.comp[i].bass, voicing: bar.comp[i].voicing.slice() });
  const walk = (dir) => {
    const bar = byNum.get(barNumber);
    if (!bar) return null;
    const comp = bar.comp || [];
    if (dir < 0) { for (let i = eventIndex - 1; i >= 0; i--) if (hasVoicing(comp[i])) return ref(bar, i); }
    else { for (let i = eventIndex + 1; i < comp.length; i++) if (hasVoicing(comp[i])) return ref(bar, i); }
    const seen = new Set([barNumber]);
    let n = dir < 0 ? prev[barNumber] : next[barNumber];
    while (n != null && !seen.has(n)) {
      seen.add(n);
      const b = byNum.get(n);
      const c = (b && b.comp) || [];
      if (dir < 0) { for (let i = c.length - 1; i >= 0; i--) if (hasVoicing(c[i])) return ref(b, i); }
      else { for (let i = 0; i < c.length; i++) if (hasVoicing(c[i])) return ref(b, i); }
      n = dir < 0 ? prev[n] : next[n];
    }
    return null;
  };
  return { prev: walk(-1), next: walk(1) };
}

// ════════════════════════════════════════════════════════════════════
// CONTEXT
// ════════════════════════════════════════════════════════════════════

/** Chord symbol in effect at a beat of a bar: the last of its symbols at or before it, else the carried one. */
function symbolAt(progression, barIndex, beat) {
  const bars = progression.bars || [];
  const own = bars[barIndex].symbols || [];
  let sym = null;
  for (const s of own) if (Number(s.beat) <= beat + EPS) sym = s.symbol;
  if (sym) return sym;
  if (own.length) return own[0].symbol;   // onset before the bar's first symbol: the carried one would be right, but keep the engine's rule
  for (let i = barIndex - 1; i >= 0; i--) { const s = bars[i].symbols || []; if (s.length) return s[s.length - 1].symbol; }
  return null;
}

/**
 * Everything generate/score need for one comp event, read from the progression.
 *
 * @returns {{ bar, event, symbol, parsed, bass, bassSource, voicing, melody, beat, dur, beatsPerBar, prevVoicing, nextVoicing, neighbours }|null}
 */
function eventContext(progression, barNumber, eventIndex = 0) {
  const bars = progression.bars || [];
  const idx = bars.findIndex(b => b.bar === barNumber);
  if (idx < 0) return null;
  const bar = bars[idx];
  const ev = (bar.comp || [])[eventIndex];
  if (!ev) return null;
  const symbol = symbolAt(progression, idx, Number(ev.beat) || 0);
  const beatsPerBar = progression.beatsPerBar
    || (progression.timeSignature ? (() => { const m = String(progression.timeSignature).match(/^(\d+)\/(\d+)$/); return m ? (parseInt(m[1], 10) * 4) / parseInt(m[2], 10) : 4; })() : 4);
  const neighbours = voicedNeighbours(progression, barNumber, eventIndex);
  return {
    progression,
    bar: barNumber, event: eventIndex, symbol, parsed: symbol ? parseSymbol(symbol) : null,
    bass: ev.bass, bassSource: ev.bassSource, voicing: (ev.voicing || []).slice(), melody: (bar.melody || []).map(m => ({ ...m })),
    beat: Number(ev.beat) || 0, dur: Number(ev.dur) || 0, beatsPerBar,
    prevVoicing: neighbours.prev ? neighbours.prev.voicing : null,
    nextVoicing: neighbours.next ? neighbours.next.voicing : null,
    neighbours,
  };
}

// ════════════════════════════════════════════════════════════════════
// SHAPES
// ════════════════════════════════════════════════════════════════════

/** Highest comp voicing note in the piece (midi); null when it has none. Bass and melody do not count. */
function pieceCeiling(progression) {
  let top = null;
  for (const b of (progression && progression.bars) || []) for (const e of b.comp || []) for (const n of e.voicing || []) {
    const m = midiOf(n);
    if (!isNaN(m) && (top == null || m > top)) top = m;
  }
  return top;
}

/** Chord-relative spelling of a pitch class against a parsed symbol (the engine's speller). */
function spellPC(parsed, pc) {
  const nvp = namedVsPlayed(parsed, [60 + pc]);
  const e = [...nvp.present, ...nvp.added].find(x => x.pc === pc);
  return e ? e.name : parseNote(pc).name;
}

/**
 * Semitones above the root for a shape degree on a target chord, or a
 * reason the target cannot supply it. R/3/5/7 come from the type's
 * intervals; extensions are root + their fixed offset unless the type
 * names a different version of the same extension.
 * @returns {{ semis:number }|{ reason:string }}
 */
function resolveDegree(parsed, degree) {
  const ivs = new Set(parsed.intervals.map(i => i % 12));
  const pick = (options, what) => { for (const o of options) if (ivs.has(o)) return { semis: o }; return { reason: `no ${what} in ${parsed.display}` }; };
  switch (degree) {
    case 'R': return { semis: 0 };
    case '3': return pick([4, 3], '3rd');
    case '5': return pick([7, 6, 8], '5th');
    case '7': return ivs.has(11) ? { semis: 11 } : ivs.has(10) ? { semis: 10 } : parsed.type === 'dim7' ? { semis: 9 } : { reason: `no 7th in ${parsed.display}` };
    default: {
      const semis = EXTENSION_SEMIS[degree];
      if (semis == null) return { reason: `unknown degree ${degree}` };
      const number = degree.replace(/[♭♯]/g, '');
      const siblings = Object.entries(EXTENSION_SEMIS).filter(([d]) => d !== degree && d.replace(/[♭♯]/g, '') === number);
      const named = parsed.intervals.filter(i => i > 12).map(i => i % 12);   // extensions the symbol names (14 → 2, 18 → 6)
      for (const [d, s] of siblings) if (named.includes(s) && !named.includes(semis)) return { reason: `${parsed.display} names ${d}, not ${degree}` };
      return { semis };
    }
  }
}

/**
 * The shape of one voicing on one chord: its degree labels (engine
 * named-vs-played, by written spelling, collapsed through DEGREE_CLASS so
 * ♭3 / ♭7 variants match) in ascending order, and its layout in semitones
 * above the bass. `key` is "degrees@layout" ("3-7@4.10"). Shared by
 * harvestShapes and voicing-describe.js. null without a parsed symbol, a
 * bass with a midi value, or any voicing note.
 *
 * @param {string[]} voicing
 * @param {string} bass
 * @param {object|null} parsed  parseSymbol() result
 * @returns {{ key:string, degrees:string[], aboveBass:number[], count:number }|null}
 */
function shapeKey(voicing, bass, parsed) {
  const bassMidi = midiOf(bass);
  if (!parsed || isNaN(bassMidi) || !Array.isArray(voicing) || !voicing.length) return null;
  const nvp = namedVsPlayed(parsed, [bass, ...voicing]);
  const byPC = new Map([...nvp.present, ...nvp.added].map(e => [e.pc, e.degree]));
  const notes = voicing.map(n => ({ midi: midiOf(n), pc: parseNote(n).pc })).sort((a, b) => a.midi - b.midi);
  const degrees = notes.map(n => DEGREE_CLASS[byPC.get(n.pc)] ?? byPC.get(n.pc) ?? '?');
  const aboveBass = notes.map(n => n.midi - bassMidi);
  return { key: `${degrees.join('-')}@${aboveBass.join('.')}`, degrees, aboveBass, count: notes.length };
}

/**
 * Harvest every comp voicing of a progression as a shape: its degree
 * labels (engine named-vs-played, by written spelling) in ascending order
 * plus its layout above the bass. Identical degrees + layout merge, keeping
 * the bar list ("17" or "26.1" for a later event; opts.label prefixes them
 * when libraries from several pieces are merged). Known shapes carry a name.
 *
 * @param {object} progression
 * @param {{ bars: Array<{ bar, events: Array<{ symbol }> }> }} [analysis]  analyzeProgression() result: supplies the symbol at each event; without it the symbol is read from the bar
 * @param {{ label?: string }} [opts]
 * @returns {Array<{ key, name: string|null, degrees: string[], aboveBass: number[], count: number, bars: string[] }>}
 */
function harvestShapes(progression, analysis = null, opts = {}) {
  const shapes = new Map();
  const bars = (progression && progression.bars) || [];
  bars.forEach((bar, idx) => {
    const an = analysis ? analysis.bars.find(b => b.bar === bar.bar) : null;
    (bar.comp || []).forEach((ev, i) => {
      if (!hasVoicing(ev)) return;
      const symbol = an && an.events[i] ? an.events[i].symbol : symbolAt(progression, idx, Number(ev.beat) || 0);
      const parsed = symbol ? parseSymbol(symbol) : null;
      const sk = shapeKey(ev.voicing, ev.bass, parsed);
      if (!sk) return;
      const { key, degrees, aboveBass, count } = sk;
      const label = `${opts.label || ''}${bar.bar}${(bar.comp || []).length > 1 ? '.' + i : ''}`;
      const cur = shapes.get(key) || { key, name: SHAPE_NAMES[key] || null, degrees, aboveBass, count, bars: [] };
      cur.bars.push(label);
      shapes.set(key, cur);
    });
  });
  return [...shapes.values()];
}

/** Merge shape libraries (from several pieces): identical keys combine their bar lists. */
function mergeShapes(...libraries) {
  const out = new Map();
  for (const lib of libraries) for (const s of lib || []) {
    const cur = out.get(s.key);
    if (cur) cur.bars = [...cur.bars, ...s.bars];
    else out.set(s.key, { ...s, bars: s.bars.slice() });
  }
  return [...out.values()];
}

/** Source tag for a shape: its name, else its degrees and layout. */
function shapeTag(shape) { return `shape:${shape.name || shape.key}`; }

/**
 * Re-instantiate a shape on a target chord over a given bass. Each degree
 * resolves against the target type (resolveDegree); each pitch class is
 * placed at the midi nearest the shape's layout above the bass. When a
 * context window is given and the placement falls outside it, the whole
 * shape is tried an octave down, then up. Rejections carry a reason.
 *
 * @param {object} shape  from harvestShapes
 * @param {object|string} parsed  parseSymbol() result or symbol
 * @param {string|number} bass
 * @param {{ low?: number, high?: number, maxSpan?: number, melodyMidis?: Set<number> }} [context]
 */
function applyShape(shape, parsedOrSymbol, bass, context = {}) {
  const parsed = typeof parsedOrSymbol === 'string' ? parseSymbol(parsedOrSymbol) : parsedOrSymbol;
  const bassMidi = midiOf(bass);
  if (!parsed) return { ok: false, reason: 'unparsed symbol' };
  if (isNaN(bassMidi)) return { ok: false, reason: 'no bass' };
  const pcs = [];
  for (const d of shape.degrees) {
    const r = resolveDegree(parsed, d);
    if (r.reason) return { ok: false, reason: r.reason };
    pcs.push((parsed.rootPC + r.semis) % 12);
  }
  if (new Set(pcs).size !== pcs.length) return { ok: false, reason: `two degrees land on one pitch class in ${parsed.display}` };
  const place = (pc, hint) => { const base = hint - (((hint - pc) % 12) + 12) % 12; return hint - base < base + 12 - hint ? base : base + 12; };   // nearest, ties upward
  const midis = shape.aboveBass.map((h, i) => place(pcs[i], bassMidi + h));
  for (let i = 1; i < midis.length; i++) if (midis[i] <= midis[i - 1]) return { ok: false, reason: 'layout collapsed on the target' };
  const maxSpan = context.maxSpan ?? DEFAULT_MAX_SPAN;
  if (midis[midis.length - 1] - midis[0] > maxSpan) return { ok: false, reason: `span ${midis[midis.length - 1] - midis[0]} exceeds ${maxSpan}` };
  const fits = ms => (context.low == null || ms[0] >= context.low) && (context.high == null || ms[ms.length - 1] <= context.high)
    && !(context.melodyMidis && ms.some(m => context.melodyMidis.has(m)));
  let placed = null;
  for (const shift of [0, -12, 12]) { const ms = midis.map(m => m + shift); if (ms[0] > bassMidi && fits(ms)) { placed = ms; break; } }
  if (!placed) return { ok: false, reason: `outside the window ${context.low ?? '…'}–${context.high ?? '…'}` };
  return {
    ok: true,
    voicing: placed.map((m, i) => spellMidi(m, spellPC(parsed, pcs[i]))),
    midis: placed, degrees: shape.degrees.slice(), aboveBass: placed.map(m => m - bassMidi),
  };
}

// ════════════════════════════════════════════════════════════════════
// GENERATE
// ════════════════════════════════════════════════════════════════════

function clampCount(n) { return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n)); }

/** Voice counts to generate: the original's (bounded), ±countRange. */
function voiceCounts(originalCount, countRange = 0) {
  const base = originalCount >= MIN_COUNT ? clampCount(originalCount) : DEFAULT_COUNT;
  const out = [];
  for (let k = base - countRange; k <= base + countRange; k++) if (k >= MIN_COUNT && k <= MAX_COUNT) out.push(k);
  return out;
}

/** Melody pitches sounding during the event, and the one at its onset (else the first to enter). */
function melodyInEvent(melody, beat, dur) {
  const inEvent = (melody || []).filter(m => overlap(m, beat, dur) > EPS)
    .map(m => ({ ...m, midi: midiOf(m.note ?? m.midi) })).filter(m => !isNaN(m.midi));
  const atOnset = inEvent.find(m => Number(m.beat) <= beat + EPS && Number(m.beat) + Number(m.dur) > beat + EPS)
    || inEvent.slice().sort((a, b) => a.beat - b.beat)[0] || null;
  return { inEvent, atOnset, low: inEvent.length ? Math.min(...inEvent.map(m => m.midi)) : null };
}

/**
 * Enumerate voicings of the chord symbol for one event.
 *
 * @param {object} ctx  from eventContext(), or { parsed|symbol, bass, voicing, melody, beat, dur }
 * @param {{ countRange?: 0|1, counts?: number[], maxSpan?: number, ceiling?: number, allowBassDouble?: boolean,
 *           shapes?: Array|null }} [opts]  shapes: library to draw from (default: harvested from ctx.progression; [] for none)
 * @returns {{ candidates: Array<Candidate>, range: { low, high, ceiling, melodyLow, fallback, onsetMelody, counts },
 *             pool, skipped: Array<{ shape, reason }>, warnings }}
 *   Candidate: { voicing: string[], midis: number[], count, degrees: string[], aboveBass: number[], sources: string[] }
 */
function generateCandidates(ctx, opts = {}) {
  const warnings = [];
  const parsed = ctx.parsed || (ctx.symbol ? parseSymbol(ctx.symbol) : null);
  const tones = parsed ? chordTones(parsed) : null;
  const bassMidi = midiOf(ctx.bass);
  const empty = { candidates: [], range: null, pool: tones ? tones.pool : [], skipped: [], warnings };
  if (!tones) { warnings.push(`no parsable chord symbol (${ctx.symbol ?? 'none'})`); return empty; }
  if (isNaN(bassMidi)) { warnings.push(`no bass note`); return empty; }

  const maxSpan = opts.maxSpan ?? DEFAULT_MAX_SPAN;
  const ceiling = opts.ceiling ?? (ctx.progression ? pieceCeiling(ctx.progression) : null) ?? FALLBACK_CEILING;
  const counts = opts.counts || voiceCounts((ctx.voicing || []).length, opts.countRange || 0);
  const bassPC = ((bassMidi % 12) + 12) % 12;
  const pool = tones.pool.filter(t => opts.allowBassDouble || t.pc !== bassPC);
  const mel = melodyInEvent(ctx.melody, ctx.beat, ctx.dur);
  const low = bassMidi + MIN_ABOVE_BASS;
  const melodyMidis = new Set(mel.inEvent.map(m => m.midi));

  const enumerate = (high) => {
    const placements = [];
    for (const t of pool) for (let m = low; m <= high; m++) if (((m % 12) + 12) % 12 === t.pc) placements.push({ ...t, midi: m });
    placements.sort((a, b) => a.midi - b.midi);
    const out = [];
    const pick = [];
    const rec = (start, k) => {
      if (pick.length === k) {
        out.push(pick.map(p => ({ ...p })));
        return;
      }
      for (let i = start; i < placements.length; i++) {
        const p = placements[i];
        if (pick.length && (p.midi - pick[0].midi > maxSpan || pick.some(q => q.pc === p.pc))) continue;
        if (melodyMidis.has(p.midi)) continue;   // never a unison with the melody
        pick.push(p); rec(i + 1, k); pick.pop();
      }
    };
    for (const k of counts) rec(0, k);
    return out;
  };

  let high = mel.low != null ? mel.low - 1 : ceiling;
  let fallback = false;
  let sets = enumerate(high);
  if (!sets.length && mel.atOnset && mel.atOnset.midi - 1 > high) {
    fallback = true;
    high = mel.atOnset.midi - 1;
    sets = enumerate(high);
  }
  const byMidis = new Map();   // "m,m,m" → candidate (dedupe across sources)
  const add = (cand, tag) => {
    const k = cand.midis.join(',');
    const cur = byMidis.get(k);
    if (cur) { if (!cur.sources.includes(tag)) cur.sources.push(tag); return; }
    byMidis.set(k, { ...cand, sources: [tag] });
  };
  for (const set of sets) add({
    voicing: set.map(p => spellMidi(p.midi, p.name)),
    midis: set.map(p => p.midi),
    count: set.length,
    degrees: set.map(p => p.degree),
    aboveBass: set.map(p => p.midi - bassMidi),
  }, 'symbol');

  // Harvested shapes: the player's vocabulary, re-voiced on this chord under the same window, span and count.
  const skipped = [];
  const library = opts.shapes !== undefined ? (opts.shapes || []) : (ctx.progression ? harvestShapes(ctx.progression) : []);
  const win = { low, high, maxSpan, melodyMidis };
  for (const shape of library) {
    if (!counts.includes(shape.count)) continue;
    const r = applyShape(shape, parsed, ctx.bass, win);
    if (!r.ok) { skipped.push({ shape: shape.name || shape.key, reason: r.reason }); continue; }
    add({ voicing: r.voicing, midis: r.midis, count: r.midis.length, degrees: r.degrees, aboveBass: r.aboveBass }, shapeTag(shape));
  }
  const all = [...byMidis.values()].sort((a, b) => a.midis.join(',').localeCompare(b.midis.join(',')));
  // Dominant rule: a hard filter on both sources, dominant types only; the
  // bass degree counts as sounding; the bar's own voicing is never dropped.
  const removed = [];
  let candidates = all;
  if (tones.dominant && opts.dominantRule !== false) {
    const bassDegree = (tones.pool.find(t => t.pc === bassPC) || {}).degree;
    const original = ctx.voicing || [];
    candidates = [];
    for (const c of all) {
      const reason = dominantRuleViolation(bassDegree ? [...c.degrees, bassDegree] : c.degrees);
      if (reason && !(original.length && sameVoicing(c.voicing, original))) removed.push({ ...c, reason }); else candidates.push(c);
    }
  }
  return {
    candidates,
    range: { low, high, ceiling, melodyLow: mel.low, fallback, onsetMelody: mel.atOnset ? mel.atOnset.midi : null, counts },
    pool, skipped, warnings, removed,
  };
}

// ════════════════════════════════════════════════════════════════════
// SCORE AND RANK
// ════════════════════════════════════════════════════════════════════

/**
 * Score one candidate (or any voicing) in its event context with the
 * engine's own functions, exactly as analyzeProgression scores an event:
 * comp tension, melody tension over the event window (when includeMelody),
 * named-vs-played against the symbol, motion in from the previous voiced
 * event and out to the next.
 *
 * @param {{ voicing: string[] }|string[]} candidate
 * @param {object} ctx  from eventContext() (parsed, bass, melody, beat, dur, beatsPerBar, prevVoicing, nextVoicing)
 * @param {{ includeMelody?: boolean }} [opts]
 * @returns scored copy: { ...candidate, tension: { total, comp, melody, byInterval }, motion: { in, out, total }, namedVsPlayed, omitted, added }
 */
function scoreCandidate(candidate, ctx, opts = {}) {
  const cand = Array.isArray(candidate) ? { voicing: candidate } : candidate;
  const voicing = cand.voicing || [];
  const includeMelody = !!opts.includeMelody;
  const comp = intervalTension(ctx.bass, voicing);
  const melody = includeMelody ? melodyTension(ctx.melody, ctx.bass, voicing, ctx.beatsPerBar, { beat: ctx.beat, dur: ctx.dur }) : null;
  const byInterval = {};
  for (const k of Object.keys(comp.byInterval)) byInterval[k] = r3(comp.byInterval[k] + (melody ? melody.byInterval[k] : 0));
  const total = r3(comp.score + (melody ? melody.score : 0));
  const pitches = [ctx.bass, ...voicing];
  if (includeMelody) for (const m of ctx.melody || []) if (overlap(m, ctx.beat, ctx.dur) > EPS) pitches.push(m.note ?? m.midi);
  const nvp = ctx.parsed ? namedVsPlayed(ctx.parsed, pitches) : null;
  const motionIn = ctx.prevVoicing ? voiceMotion(ctx.prevVoicing, voicing) : null;
  const motionOut = ctx.nextVoicing ? voiceMotion(voicing, ctx.nextVoicing) : null;
  return {
    ...cand,
    midis: cand.midis || voicing.map(midiOf),
    tension: { total, comp, melody, byInterval },
    motion: { in: motionIn, out: motionOut, total: (motionIn ? motionIn.total : 0) + (motionOut ? motionOut.total : 0) },
    namedVsPlayed: nvp,
    omitted: nvp ? nvp.omitted.length : 0,
    added: nvp ? nvp.added.length : 0,
  };
}

/** Distance from the target in chart units, rounded to the nearest TARGET_STEP. */
function targetDistance(total, target) { return Math.round(Math.abs(total - target) / TARGET_STEP) * TARGET_STEP; }

/**
 * The ranking key of a scored candidate: [distance from the tension target
 * (TARGET_STEP buckets), total motion, omitted named tones]. Lower sorts
 * first, component by component; rankCandidates breaks full ties by voicing
 * text. Exported so the describer can explain a rank by the first component
 * that differs from its neighbours.
 */
function rankKey(c, target = 0) { return [targetDistance(c.tension.total, target), c.motion.total, c.omitted]; }

/**
 * Rank scored candidates by rankKey, then voicing text.
 * Returns a sorted copy with `rank` (1-based) and `distance`.
 */
function rankCandidates(scored, { target = 0 } = {}) {
  const out = scored.map(c => ({ ...c, distance: targetDistance(c.tension.total, target) }));
  out.sort((a, b) => {
    const ka = rankKey(a, target), kb = rankKey(b, target);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a.voicing.join(' ').localeCompare(b.voicing.join(' '));
  });
  out.forEach((c, i) => { c.rank = i + 1; });
  return out;
}

// ════════════════════════════════════════════════════════════════════
// OVERRIDES
// ════════════════════════════════════════════════════════════════════

function overrideKey(bar, eventIndex) { return `${bar}:${eventIndex}`; }
function parseKey(key) { const [b, e] = String(key).split(':'); return { bar: Number(b), event: Number(e) }; }
const sameVoicing = (a, b) => a.length === b.length && a.every((n, i) => midiOf(n) === midiOf(b[i]));
const toEntries = o => (o instanceof Map ? [...o.entries()] : Object.entries(o || {}));
const voicingOf = v => (Array.isArray(v) ? v : v && v.voicing) || [];

/**
 * Overrides with tie propagation: an override on a comp event that ties
 * into the next bar also applies to that bar's beat-0 event when it
 * carries the same original voicing (bar 43 → its hold at 44), and on
 * down the chain. Explicit overrides win over propagated ones.
 *
 * @param {Object|Map} overrides  "bar:event" → string[] | { voicing: string[] }
 * @returns {Object} "bar:event" → { voicing: string[], propagatedFrom?: "bar:event" }
 */
function expandOverrides(progression, overrides) {
  const bars = progression.bars || [];
  const byNum = new Map(bars.map(b => [b.bar, b]));
  const { next } = barNeighbours(progression);
  const out = {};
  for (const [key, v] of toEntries(overrides)) out[key] = { voicing: voicingOf(v).slice() };
  for (const [key, v] of toEntries(overrides)) {
    let { bar, event } = parseKey(key);
    const seen = new Set();
    for (;;) {
      const b = byNum.get(bar);
      const ev = b && (b.comp || [])[event];
      if (!ev || !ev.tie || seen.has(bar)) break;
      seen.add(bar);
      const nb = byNum.get(next[bar]);
      const first = nb && (nb.comp || [])[0];
      if (!first || !near(Number(first.beat) || 0, 0) || !sameVoicing(first.voicing || [], ev.voicing || [])) break;
      const k = overrideKey(nb.bar, 0);
      if (!(k in out)) out[k] = { voicing: voicingOf(v).slice(), propagatedFrom: key };
      bar = nb.bar; event = 0;
    }
  }
  return out;
}

/**
 * A copy of the progression with the overrides applied: comp[i].voicing
 * replaced and the bar's source set to "user". Nothing else is touched
 * (bass, bassLine, melody, symbols, ties), and the input is not mutated.
 */
function applyOverrides(progression, overrides) {
  const expanded = expandOverrides(progression, overrides);
  const byBar = new Map();
  for (const [key, v] of Object.entries(expanded)) {
    const { bar, event } = parseKey(key);
    if (!byBar.has(bar)) byBar.set(bar, new Map());
    byBar.get(bar).set(event, v.voicing);
  }
  return {
    ...progression,
    bars: (progression.bars || []).map(bar => {
      const evs = byBar.get(bar.bar);
      if (!evs) return bar;
      const comp = (bar.comp || []).map((ev, i) => (evs.has(i) ? { ...ev, voicing: evs.get(i).slice() } : ev));
      return { ...bar, source: 'user', comp };
    }),
  };
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export {
  chordTones, voicedNeighbours, eventContext, pieceCeiling, shapeKey, harvestShapes, mergeShapes, applyShape, resolveDegree,
  generateCandidates, scoreCandidate, rankKey, rankCandidates,
  expandOverrides, applyOverrides, overrideKey, voiceCounts, spellMidi,
  MIN_ABOVE_BASS, DEFAULT_MAX_SPAN, SHAPE_NAMES, selfTest,
  // Explainer layer (Session 6.5): read-only constants for interpolation into content.
  TARGET_STEP, EXPLORE_ROWS, MIN_COUNT, MAX_COUNT, DEFAULT_COUNT, FALLBACK_CEILING, DEGREE_CLASS, EXTENSION_SEMIS, targetDistance,
  DOMINANT_RULE, dominantRuleText, dominantRuleReason, dominantRuleViolation,
};

if (typeof window !== 'undefined') {
  window.VoicingExplore = {
    chordTones, voicedNeighbours, eventContext, pieceCeiling, shapeKey, harvestShapes, mergeShapes, applyShape, resolveDegree,
    generateCandidates, scoreCandidate, rankKey, rankCandidates,
    expandOverrides, applyOverrides, overrideKey, voiceCounts, spellMidi,
    MIN_ABOVE_BASS, DEFAULT_MAX_SPAN, SHAPE_NAMES,
    TARGET_STEP, EXPLORE_ROWS, MIN_COUNT, MAX_COUNT, DEFAULT_COUNT, FALLBACK_CEILING, DEGREE_CLASS, EXTENSION_SEMIS, targetDistance,
    DOMINANT_RULE, dominantRuleText, dominantRuleReason, dominantRuleViolation,
  };
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/shared/voicing-explore.js').then(m => m.selfTest())"
//
// Unit cases, then tests/fixtures/voicing-fixture.json and
// tests/fixtures/voicing-maple-leaf-rag.json, then static/private/dont-be-sad.json
// when that file exists.

async function selfTest() {
  const fs = await import('node:fs');
  const { analyzeProgression } = await import('./voicing-analysis.js');
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const load = rel => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
  const pcsOf = t => t.pool.map(p => p.pc).sort((a, b) => a - b);
  const has = (list, voicing) => list.some(c => sameVoicing(c.voicing, voicing));

  console.log('\n─── voicing-explore.js self-test ───\n');

  // ── Unit: chord tones and pool ───────────────────────────────────
  assert('Gm7/F named = G B♭ D F (slash bass already a tone)', chordTones('Gm7/F').named.map(n => n.name), ['G', 'B♭', 'D', 'F']);
  assert('Gm7/F pool adds the 9th only (A); not dominant', [chordTones('Gm7/F').pool.map(p => p.name), chordTones('Gm7/F').dominant], [['G', 'B♭', 'D', 'F', 'A'], false]);
  assert('C7 pool: named + 9 + 13 + ♯11 (D, A, F♯), dominant', [chordTones('C7').pool.map(p => `${p.name}·${p.degree}`), chordTones('C7').dominant],
    [['C·R', 'E·3', 'G·5', 'B♭·♭7', 'D·9', 'A·13', 'F♯·♯11'], true]);
  assert('C7♯11 pool dedupes the named ♯11', chordTones('C7♯11').pool.map(p => p.name), ['C', 'E', 'G', 'B♭', 'F♯', 'D', 'A']);
  assert('C7♭9 skips the natural 9th', chordTones('C7b9').pool.map(p => p.degree), ['R', '3', '5', '♭7', '♭9', '13', '♯11']);
  assert('Cmaj7, Cm7, Cdim7 get no 13/♯11', [chordTones('Cmaj7').pool.length, chordTones('Cm7').pool.length, chordTones('Cdim7').pool.length], [5, 5, 5]);
  assert('C7sus4 is not dominant (no 3rd)', chordTones('C7sus4').dominant, false);
  // E1–E5: pools for the Levine types (read-and-report §1, §5; Prompt 2 items 5–6)
  assert('E1 C7alt pool: R 3 ♭7 then ♭9 ♯9 ♯11 ♭13 — no 5, 9 or 13 (Levine T1); dominant', [chordTones('C7alt').pool.map(p => `${p.name}·${p.degree}`), chordTones('C7alt').dominant],
    [['C·R', 'E·3', 'B♭·♭7', 'D♭·♭9', 'D♯·♯9', 'F♯·♯11', 'A♭·♭13'], true]);
  assert('E2 C13 pool names the 13 once, no duplicate', [chordTones('C13').pool.filter(p => p.degree === '13').length, chordTones('C13').pool.map(p => p.degree)], [1, ['R', '3', '5', '♭7', '9', '13', '♯11']]);
  assert('E3 C9sus4: not dominant; the 4 is in the pool (Levine T5)', [chordTones('C9sus4').dominant, chordTones('C9sus4').pool.map(p => p.degree)], [false, ['R', '4', '5', '♭7', '9']]);
  assert('E4 Cm7♭5 pool offers 9, 11 and ♭13 and never ♭9 (Levine H3–H5)', chordTones('Cm7♭5').pool.map(p => `${p.name}·${p.degree}`), ['C·R', 'E♭·♭3', 'G♭·♭5', 'B♭·♭7', 'D·9', 'F·11', 'A♭·♭13']);
  assert('E4 Cø7 reaches the same pool through the ø suffix', chordTones('Cø7').pool.map(p => p.degree), ['R', '♭3', '♭5', '♭7', '9', '11', '♭13']);
  assert('C7♯9 skips the natural 9th (altered9 on a dominant ♯9)', chordTones('C7♯9').pool.map(p => p.degree), ['R', '3', '5', '♭7', '♯9', '13', '♯11']);
  assert('Cm7 (minor 3rd, not dominant) still gets the natural 9', chordTones('Cm7').pool.map(p => p.degree), ['R', '♭3', '5', '♭7', '9']);
  assert('B♭maj9♯5/F named includes the slash F as 5', chordTones('B♭maj9♯5/F').named.map(n => `${n.name}·${n.degree}`), ['B♭·R', 'D·3', 'F♯·♯5', 'A·7', 'C·9', 'F·5']);
  assert('unparsed symbol → null', chordTones('Xyz'), null);
  assert('spellMidi keeps the letter\'s octave (C♭ at 59 → C♭4, B♯ at 60 → B♯3)', [spellMidi(59, 'C♭'), spellMidi(60, 'B♯'), parseNote(spellMidi(59, 'C♭')).midi], ['C♭4', 'B♯3', 59]);
  assert('voiceCounts: same by default, ±1 bounded 2–4, empty original → 3', [voiceCounts(3), voiceCounts(2, 1), voiceCounts(4, 1), voiceCounts(0)], [[3], [2, 3], [3, 4], [3]]);

  // ── Unit: generation on a constructed event ──────────────────────
  const ev = (symbol, bass, voicing, melody, beat = 0, dur = 4) => ({ symbol, parsed: parseSymbol(symbol), bass, voicing, melody, beat, dur, beatsPerBar: 4, prevVoicing: null, nextVoicing: null });
  const g1 = generateCandidates(ev('Gmaj7', 'G3', ['A3', 'B3', 'D4'], [{ beat: 0, dur: 4, note: 'B4' }]));
  assert('Gmaj7 over G3 under B4: window A3..B♭4, no fallback', [g1.range.low, g1.range.high, g1.range.fallback], [57, 70, false]);
  assert('…the original cluster A3 B3 D4 is a candidate; all 3 voices', [has(g1.candidates, ['A3', 'B3', 'D4']), g1.candidates.every(c => c.count === 3)], [true, true]);
  assert('…every candidate: below the melody, above bass + 2, span ≤ 12, no doubled pc, no bass pc',
    g1.candidates.every(c => c.midis.every(m => m < 71 && m >= 57) && c.midis[c.midis.length - 1] - c.midis[0] <= 12
      && new Set(c.midis.map(m => m % 12)).size === c.count && !c.midis.some(m => m % 12 === 7)), true);
  assert('…candidates are spelled chord-relatively (F♯, not G♭)', g1.candidates.some(c => c.voicing.includes('F♯4')) && !g1.candidates.some(c => c.voicing.some(n => n.startsWith('G♭'))), true);
  const g1b = generateCandidates(ev('Gmaj7', 'G3', ['A3', 'B3', 'D4'], [{ beat: 0, dur: 4, note: 'B4' }]), { allowBassDouble: true });
  assert('allowBassDouble admits G in the voicing', g1b.candidates.some(c => c.midis.some(m => m % 12 === 7)), true);
  const g1c = generateCandidates(ev('Gmaj7', 'G3', ['A3', 'B3', 'D4'], [{ beat: 0, dur: 4, note: 'B4' }]), { countRange: 1 });
  assert('countRange 1 → counts 2, 3, 4', [...new Set(g1c.candidates.map(c => c.count))].sort(), [2, 3, 4]);
  const g2 = generateCandidates(ev('Gmaj7', 'G3', [], []));
  assert('no melody and no progression in the context: fallback ceiling C5; empty original → 3 voices', [g2.range.high, g2.range.counts], [72, [3]]);
  // Melody rule holds with the melody out of the analysis: generation never sees includeMelody.
  const gm = generateCandidates(ev('C', 'C3', ['E3', 'G3', 'C4'], [{ beat: 0, dur: 4, note: 'E4' }]));
  assert('melody constraint with includeMelody false (generation is toggle-blind): all below E4, no unison', gm.candidates.every(c => c.midis.every(m => m < 64)), true);
  // Fallback: melody dips within the event so the strict window is empty.
  const dip = [{ beat: 0, dur: 2, note: 'C5' }, { beat: 2, dur: 2, note: 'E3' }];
  const gf = generateCandidates(ev('C', 'C3', ['E3', 'G3', 'C4'], dip));
  assert('fallback fires on a melody dip: bound moves to the onset C5, flagged', [gf.range.fallback, gf.range.high, gf.candidates.length > 0], [true, 71, true]);
  assert('…and no candidate doubles the dipped melody E3 at unison', gf.candidates.every(c => !c.midis.includes(52)), true);
  const gnf = generateCandidates(ev('C', 'C3', ['E3', 'G3', 'C4'], [{ beat: 0, dur: 2, note: 'C5' }, { beat: 2, dur: 2, note: 'G4' }]));
  assert('no fallback when the dip still leaves room', [gnf.range.fallback, gnf.range.high], [false, 66]);
  const gu = generateCandidates({ symbol: null, parsed: null, bass: 'C3', voicing: [], melody: [], beat: 0, dur: 4, beatsPerBar: 4 });
  assert('no symbol → no candidates, one warning', [gu.candidates.length, gu.warnings.length], [0, 1]);

  // ── Unit: dominant rule ──────────────────────────────────────────
  const classesOf = c => c.degrees.map(d => DEGREE_CLASS[d] ?? d);
  const gd = generateCandidates(ev('C7', 'C3', ['E3', 'B♭3'], []), { countRange: 1 });
  assert('dominant rule: every kept candidate sounds the ♭7, and one with ♯11 sounds the 3rd too',
    gd.candidates.every(c => { const cl = classesOf(c); return cl.includes('7') && (!cl.includes('♯11') || cl.includes('3')); }), true);
  assert('…both clauses fire, each removed candidate carries its reason', [...new Set(gd.removed.map(r => r.reason))].sort(), ['no ♭7', '♯11 without the 3rd']);
  assert('…a candidate without the ♭7 is removed for that reason (E3 G3 on C7)', gd.removed.find(r => sameVoicing(r.voicing, ['E3', 'G3']))?.reason, 'no ♭7');
  assert('…13 without the ♭7 now falls under the ♭7 clause (E3 A3)', gd.removed.find(r => sameVoicing(r.voicing, ['E3', 'A3']))?.reason, 'no ♭7');
  assert('…removed candidates really break the rule', gd.removed.every(c => dominantRuleViolation(classesOf(c)) === c.reason), true);
  const gdOff = generateCandidates(ev('C7', 'C3', ['E3', 'B♭3'], []), { countRange: 1, dominantRule: false });
  assert('…opts.dominantRule false keeps them all', [gdOff.candidates.length, gdOff.removed.length], [gd.candidates.length + gd.removed.length, 0]);
  const sharpShape = { key: '♯11-7@6.11', name: null, degrees: ['♯11', '7'], aboveBass: [6, 11], count: 2, bars: ['x'] };
  const gnd = generateCandidates(ev('Cmaj7', 'C3', ['E3', 'B3'], []), { shapes: [sharpShape] });
  assert('a ♯11 shape on Cmaj7 (not dominant) is untouched', [has(gnd.candidates, ['F♯3', 'B3']), gnd.removed.length], [true, 0]);
  const gds = generateCandidates(ev('C7', 'C3', ['E3', 'B♭3'], []), { shapes: [sharpShape] });
  assert('the same shape on C7 is removed with the ♯11 reason (it has the ♭7, not the 3rd)', [has(gds.candidates, ['F♯3', 'B♭3']), gds.removed.find(r => sameVoicing(r.voicing, ['F♯3', 'B♭3']))?.reason], [false, '♯11 without the 3rd']);
  const gnd7 = generateCandidates(ev('Cmaj7', 'C3', ['E3', 'G3'], []));
  assert('non-dominant: candidates without a 7th are untouched (E3 G3 on Cmaj7)', [has(gnd7.candidates, ['E3', 'G3']), gnd7.removed.length], [true, 0]);
  const gex = generateCandidates(ev('C7', 'C3', ['F♯3', 'B♭3'], []));
  assert('the bar\'s own voicing is exempt even when it breaks the rule', [has(gex.candidates, ['F♯3', 'B♭3']), gex.removed.some(r => sameVoicing(r.voicing, ['F♯3', 'B♭3']))], [true, false]);
  const gsl = generateCandidates(ev('C7/E', 'E3', ['G3', 'B♭3'], []));
  assert('the bass counts as sounding: ♭7 + ♯11 over a slash 3rd is kept', has(gsl.candidates, ['B♭3', 'F♯4']), true);
  const gs7 = generateCandidates(ev('C7/B♭', 'B♭2', ['E3', 'G3'], []), { countRange: 1 });
  assert('a slash ♭7 bass satisfies the ♭7 clause (E3 G3 and E3 G3 D4 kept on C7/B♭)', [has(gs7.candidates, ['E3', 'G3']), has(gs7.candidates, ['E3', 'G3', 'D4']), gs7.removed.every(r => r.reason === '♯11 without the 3rd')], [true, true, true]);
  assert('dominantRuleText / dominantRuleReason quote the constants', [DOMINANT_RULE.map(dominantRuleText), DOMINANT_RULE.map(dominantRuleReason)], [['every candidate needs the ♭7', '♯11 also needs the 3rd'], ['no ♭7', '♯11 without the 3rd']]);

  // ── Unit: scoring and ranking ────────────────────────────────────
  const sc = ev('Gm7/F', 'F3', ['A3', 'B♭3', 'D4'], [{ beat: 0, dur: 2, note: 'C5' }, { beat: 2, dur: 2, note: 'B♭4' }]);
  sc.prevVoicing = ['A3', 'B3', 'D4']; sc.nextVoicing = ['G3', 'B♭3', 'D4'];
  const s1 = scoreCandidate(['A3', 'B♭3', 'D4'], sc);
  assert('scoreCandidate: comp 3 (m2), motion in 1 + out 2 = 3, omitted G·R', [s1.tension.total, s1.motion.in.total, s1.motion.out.total, s1.motion.total, s1.namedVsPlayed.omitted.map(o => o.name)], [3, 1, 2, 3, ['G']]);
  const s1m = scoreCandidate(['A3', 'B♭3', 'D4'], sc, { includeMelody: true });
  assert('…with melody: C5/B♭3 M9 is 0, B♭4/A3 m9 2 × 2/4 → 4', s1m.tension.total, 4);
  const s2 = scoreCandidate(['B♭3', 'D4', 'F4'], sc);
  assert('a candidate without the 9th has no rub: total 0, omitted G', [s2.tension.total, s2.omitted], [0, 1]);
  const ranked = rankCandidates([s2, s1], { target: 3 });
  assert('rank by target distance: the m2 voicing first at target 3', [ranked[0].voicing, ranked[0].distance, ranked[1].distance, ranked.map(r => r.rank)], [['A3', 'B♭3', 'D4'], 0, 3, [1, 2]]);
  assert('rank by target distance: the plain voicing first at target 0', rankCandidates([s1, s2], { target: 0 })[0].voicing, ['B♭3', 'D4', 'F4']);
  const tie1 = { ...s2, voicing: ['X'], motion: { total: 5 }, omitted: 0 }, tie2 = { ...s2, voicing: ['Y'], motion: { total: 2 }, omitted: 3 };
  assert('equal distance: less motion wins before fewer omitted', rankCandidates([tie1, tie2], { target: 0 }).map(r => r.voicing[0]), ['Y', 'X']);
  assert('distance rounds to 0.5', [targetDistance(3.556, 3), targetDistance(2.2, 3), targetDistance(1.333, 1)], [0.5, 1, 0.5]);

  // ── Fixture: neighbours, overrides, regression ───────────────────
  const fixture = load('../../tests/fixtures/voicing-fixture.json');
  console.log('\n  fixture: tests/fixtures/voicing-fixture.json');
  const nb = barNeighbours(fixture);
  assert('barNeighbours without playOrder: written order; ends open', [nb.prev[1], nb.next[1], nb.prev[12], nb.next[12]], [null, 2, 11, null]);
  assert('voicedNeighbours bar 5 event 1: prev is bar 5 event 0, next is bar 6', (({ prev, next }) => [[prev.bar, prev.event], [next.bar, next.event]])(voicedNeighbours(fixture, 5, 1)), [[5, 0], [6, 0]]);
  const fx = analyzeProgression(fixture), fxm = analyzeProgression(fixture, { includeMelody: true });
  const regress = (prog, an, anm) => prog.bars.every(b => (b.comp || []).every((e, i) => {
    const ctx = eventContext(prog, b.bar, i);
    const s = scoreCandidate(ctx.voicing, ctx), sm = scoreCandidate(ctx.voicing, ctx, { includeMelody: true });
    const E = an.bars.find(x => x.bar === b.bar).events[i], EM = anm.bars.find(x => x.bar === b.bar).events[i];
    return s.tension.total === E.total && sm.tension.total === EM.total
      && JSON.stringify(s.namedVsPlayed) === JSON.stringify(E.namedVsPlayed) && JSON.stringify(sm.namedVsPlayed) === JSON.stringify(EM.namedVsPlayed);
  }));
  assert('regression: scoring the original voicing of every event reproduces the engine\'s total and named-vs-played (melody on and off)', regress(fixture, fx, fxm), true);
  assert('motion in for bar 10 (prev bar 9 voiced) = engine motion 6', [scoreCandidate(eventContext(fixture, 10).voicing, eventContext(fixture, 10)).motion.in.total, fx.bars.find(b => b.bar === 10).motion.total], [6, 6]);
  assert('motion out of bar 10 = engine motion into bar 11 (3)', scoreCandidate(eventContext(fixture, 10).voicing, eventContext(fixture, 10)).motion.out.total, 3);
  assert('eventContext: hold bar 12 carries G7; bar 5 event 1 keeps Gm7/F', [eventContext(fixture, 12).symbol, eventContext(fixture, 5, 1).symbol], ['G7', 'Gm7/F']);
  const ov = applyOverrides(fixture, { [overrideKey(9, 0)]: ['E3', 'G3', 'B3'] });
  assert('applyOverrides: bar 9 voicing replaced, source user; bass untouched', [ov.bars[8].comp[0].voicing, ov.bars[8].source, ov.bars[8].comp[0].bass], [['E3', 'G3', 'B3'], 'user', 'C3']);
  assert('…input not mutated; other bars are the same objects', [fixture.bars[8].comp[0].voicing, fixture.bars[8].source, ov.bars[7] === fixture.bars[7], ov.bars[8] !== fixture.bars[8]], [['E3', 'G3', 'C4'], fixture.bars[8].source, true, true]);
  const ovA = analyzeProgression(ov);
  assert('…analysis changes only in bar 9 (and motion into 10)', fx.bars.map((b, i) => b.total === ovA.bars[i].total && (b.motion?.total ?? null) === (ovA.bars[i].motion?.total ?? null) ? null : b.bar).filter(Boolean), [9, 10]);
  // Tie propagation on a constructed pair: bar 11 ties into the hold at 12 (same voicing).
  const tied = { ...fixture, bars: fixture.bars.map(b => (b.bar === 11 ? { ...b, comp: [{ ...b.comp[0], tie: true }] } : b)) };
  const ex = expandOverrides(tied, { '11:0': ['F3', 'B3', 'D4'] });
  assert('tie propagation: override on tied bar 11 also lands on bar 12 beat 0', [Object.keys(ex), ex['12:0'].propagatedFrom], [['11:0', '12:0'], '11:0']);
  assert('…and applies', applyOverrides(tied, { '11:0': ['F3', 'B3', 'D4'] }).bars[11].comp[0].voicing, ['F3', 'B3', 'D4']);
  assert('…but not when the next bar\'s voicing differs from the original', Object.keys(expandOverrides({ ...tied, bars: tied.bars.map(b => (b.bar === 12 ? { ...b, comp: [{ ...b.comp[0], voicing: ['F3', 'G3', 'B3'] }] } : b)) }, { '11:0': ['F3', 'B3', 'D4'] })), ['11:0']);
  assert('…explicit override on the tied-to bar wins', expandOverrides(tied, { '11:0': ['F3', 'B3', 'D4'], '12:0': ['G3', 'B3', 'F4'] })['12:0'].voicing, ['G3', 'B3', 'F4']);
  assert('…no propagation without a tie flag', Object.keys(expandOverrides(fixture, { '11:0': ['F3', 'B3', 'D4'] })), ['11:0']);

  // ── Rag (public) ─────────────────────────────────────────────────
  const ragURL = new URL('../../tests/fixtures/voicing-maple-leaf-rag.json', import.meta.url);
  if (fs.existsSync(ragURL)) {
    const rag = load('../../tests/fixtures/voicing-maple-leaf-rag.json');
    console.log('\n  rag: tests/fixtures/voicing-maple-leaf-rag.json');
    const rn = barNeighbours(rag);
    assert('barNeighbours by playOrder: 16 → 1 (repeat), 15 → 16, 17 ← 15, 17 → none', [rn.next[16], rn.next[15], rn.prev[17], rn.next[17]], [1, 16, 15, null]);
    const v9 = voicedNeighbours(rag, 9, 0);
    assert('bar 9 looks back past the bare basses of 5–8 to bar 4 (its last event)', [v9.prev.bar, v9.prev.event, v9.prev.voicing], [4, 1, ['E♭3', 'G3', 'D♭4']]);
    assert('bar 4 event 1 looks forward past 5–8 to bar 9', [voicedNeighbours(rag, 4, 1).next.bar, voicedNeighbours(rag, 4, 1).next.event], [9, 0]);
    assert('bar 16 (1st ending, last event) looks forward to bar 1 via the repeat', voicedNeighbours(rag, 16, 2).next.bar, 1);
    assert('bar 1 event 0 has no previous voicing', voicedNeighbours(rag, 1, 0).prev, null);
    const ra = analyzeProgression(rag), ram = analyzeProgression(rag, { includeMelody: true });
    assert('regression: rag originals reproduce the engine (melody on and off)', regress(rag, ra, ram), true);
    assert('pieceCeiling(rag) = D♭5 (73, bar 12 event 1)', pieceCeiling(rag), 73);
    const ragLib = harvestShapes(rag, ra, { label: 'rag ' });
    assert('rag library: 7 shapes, bar labels prefixed; bar 1 shape is 5-R-3 over 7.12.16', [ragLib.length, ragLib.find(s => s.bars.includes('rag 1.0')).key], [7, '5-R-3@7.12.16']);
    assert('mergeShapes unions bar lists by key', mergeShapes(ragLib, ragLib).find(s => s.key === '5-R-3@7.12.16').bars.length, 8);
    assert('rag bar 1 original (root doubled over the bass) is a candidate via its shape', generateCandidates(eventContext(rag, 1, 0)).candidates.find(c => sameVoicing(c.voicing, ['E♭3', 'A♭3', 'C4'])).sources, ['shape:5-R-3@7.12.16']);
    const g = generateCandidates(eventContext(rag, 2, 0));
    assert('rag bar 2 (E♭7/B♭ over B♭2): original E♭3 G3 D♭4 is a candidate; pool has 13 and ♯11, minus the bass pc (the 5th)',
      [has(g.candidates, ['E♭3', 'G3', 'D♭4']), g.pool.map(p => p.degree)], [true, ['R', '3', '♭7', '9', '13', '♯11']]);
  }

  // ── Acceptance: Don't Be Sad (private, optional) ─────────────────
  const privURL = new URL('../private/dont-be-sad.json', import.meta.url);
  if (fs.existsSync(privURL)) {
    console.log('\n  acceptance: static/private/dont-be-sad.json');
    const prog = load('../private/dont-be-sad.json');
    const pa = analyzeProgression(prog), pam = analyzeProgression(prog, { includeMelody: true });
    assert('regression: every private event reproduces the engine (melody on and off)', regress(prog, pa, pam), true);
    const pn = barNeighbours(prog);
    assert('barNeighbours: 36 → 21 (repeat), 28 → 29 (1st ending), 37 ← 28, 44 → none', [pn.next[36], pn.next[28], pn.prev[37], pn.next[44]], [21, 29, 28, null]);
    const reproduce = (opts) => { const out = []; for (const b of prog.bars) b.comp.forEach((e, i) => {
      if (!has(generateCandidates(eventContext(prog, b.bar, i), opts).candidates, e.voicing)) out.push(`${b.bar}${b.comp.length > 1 ? '.' + i : ''}`);
    }); return out; };
    assert('symbol source alone reproduces every original voicing except 19, 20 (added 11 on Cmaj7)', reproduce({ shapes: [] }), ['19', '20']);
    assert('with the harvested library every original is a candidate', reproduce({}), []);
    // ── Shapes (part 2) ──
    const lib = harvestShapes(prog);
    const named = Object.fromEntries(lib.filter(s => s.name).map(s => [s.name, s]));
    assert('three named shapes found with their bars', Object.fromEntries(Object.entries(named).map(([n, s]) => [n, s.bars])),
      { '2-3-5 cluster': ['1', '5', '9', '13', '14', '33'], 'bass–5th–10th shell': ['15'], 'pair over slash bass': ['16'] });
    assert('cluster = degrees 9-3-5 over 2.4.7; pair = 7-♯11 over 6.14 (♭7 stored as 7); shell = 5-3 over 7.16',
      [named['2-3-5 cluster'].degrees, named['2-3-5 cluster'].aboveBass, named['pair over slash bass'].degrees, named['bass–5th–10th shell'].aboveBass],
      [['9', '3', '5'], [2, 4, 7], ['7', '♯11'], [7, 16]]);
    assert('harvest with the analysis argument gives the same library', JSON.stringify(harvestShapes(prog, pa)) === JSON.stringify(lib), true);
    assert('bar 1\'s cluster applied to bar 2\'s symbol reproduces bar 2 (minor 3rd supplied by Gm7)', applyShape(named['2-3-5 cluster'], 'Gm7/F', 'F3').voicing, ['A3', 'B♭3', 'D4']);
    assert('…and to bar 14\'s reproduces bar 14', applyShape(named['2-3-5 cluster'], 'Amaj7', 'A3').voicing, ['B3', 'C♯4', 'E4']);
    const c19 = eventContext(prog, 19), g19 = generateCandidates(c19);
    const orig19 = g19.candidates.find(c => sameVoicing(c.voicing, c19.voicing));
    assert('bar 19 original (G3 E4 F4, added 11) is a candidate from its shape only', orig19 && orig19.sources, ['shape:5-3-11@7.16.17']);
    assert('bar 20 likewise', generateCandidates(eventContext(prog, 20)).candidates.find(c => sameVoicing(c.voicing, ['G3', 'E4', 'F4'])).sources, ['shape:5-3-11@7.16.17']);
    const c1 = eventContext(prog, 1), g1p = generateCandidates(c1);
    assert('dedupe: bar 1\'s own cluster carries the symbol tag and both cluster shapes (bar 2\'s variant lands on the same notes)', g1p.candidates.find(c => sameVoicing(c.voicing, c1.voicing)).sources, ['symbol', 'shape:2-3-5 cluster', 'shape:9-3-5@4.5.9']);
    assert('skip reasons: no 3rd on sus4, no 7th on a triad, 9 against a named ♭9',
      [applyShape(named['2-3-5 cluster'], 'Csus4', 'C3').reason, applyShape({ degrees: ['3', '7'], aboveBass: [4, 11] }, 'C', 'C3').reason, applyShape(named['2-3-5 cluster'], 'C7b9', 'C3').reason],
      ['no 3rd in Csus4', 'no 7th in C', 'C7♭9 names ♭9, not 9']);
    assert('…and generateCandidates reports them (bar 28 C7♯11: shape with a natural 11 skips)', generateCandidates(eventContext(prog, 28)).skipped.some(s => /names ♯11, not 11/.test(s.reason)), true);
    assert('pieceCeiling(private) = G4 (67); bar 1 (no melody) range uses it and every candidate respects it',
      [pieceCeiling(prog), g1p.range.ceiling, g1p.range.high, g1p.candidates.every(c => c.midis[c.midis.length - 1] <= 67)], [67, 67, 67, true]);
    const obey = []; for (const b of prog.bars) b.comp.forEach((e, i) => {
      const ctx = eventContext(prog, b.bar, i), g = generateCandidates(ctx);
      const mel = new Set((ctx.melody || []).filter(m => overlap(m, ctx.beat, ctx.dur) > EPS).map(m => midiOf(m.note)));
      for (const c of g.candidates) if (!(c.midis[0] >= g.range.low && c.midis[c.midis.length - 1] <= g.range.high && c.midis[c.midis.length - 1] - c.midis[0] <= 12 && !c.midis.some(m => mel.has(m)))) obey.push(`${b.bar}:${i} ${c.voicing.join(' ')}`);
    });
    assert('every candidate of every event, shaped or not, obeys window, span and the melody rule', obey, []);
    assert('shape-only candidates exist in the B section', prog.bars.filter(b => b.bar >= 21 && b.bar <= 44).some(b => generateCandidates(eventContext(prog, b.bar)).candidates.some(c => !c.sources.includes('symbol'))), true);
    const c17 = eventContext(prog, 17);
    const s17 = scoreCandidate(c17.voicing, c17), e17 = pa.bars.find(b => b.bar === 17).events[0];
    assert('bar 17 (arp): scored total and motion in from bar 16 equal the engine\'s', [s17.tension.total, s17.motion.in.total], [e17.total, pa.bars.find(b => b.bar === 17).motion.total]);
    const c23 = eventContext(prog, 23);
    const r23 = rankCandidates(generateCandidates(c23).candidates.map(c => scoreCandidate(c, c23)), { target: pa.bars.find(b => b.bar === 23).events[0].total });
    assert('bar 23 (B♭maj7, no rubs): with target = original, rank 1 has distance 0', r23[0].distance, 0);
    const r23hot = rankCandidates(generateCandidates(c23).candidates.map(c => scoreCandidate(c, c23)), { target: 3 });
    assert('bar 23 at target 3: the top candidate has a minor 2nd (A–B♭ or similar), tension ≥ 2.5', r23hot[0].tension.total >= 2.5, true);
    // Fallback frequency in the arranged B section (bars 21–44).
    const B = prog.bars.filter(b => b.bar >= 21 && b.bar <= 44);
    let events = 0, fallbacks = [];
    for (const b of B) b.comp.forEach((e, i) => { events++; const g = generateCandidates(eventContext(prog, b.bar, i)); if (g.range.fallback) fallbacks.push(`${b.bar}:${i}`); });
    console.log(`  B section: ${events} events, fallback fired in ${fallbacks.length}${fallbacks.length ? ' (' + fallbacks.join(', ') + ')' : ''}`);
    assert('B section: fallback never fires', fallbacks, []);
  } else {
    console.log('\n  acceptance: static/private/dont-be-sad.json not present — skipped');
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
