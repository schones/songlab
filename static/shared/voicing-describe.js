/**
 * voicing-describe.js
 * ===================
 * Learner-facing description of one voicing: what shape it is, where its
 * guide tones sit, what colour it adds or leaves out, how it moves from
 * the previous voiced event, and (for an Explore candidate) why it ranked
 * where it did. Pure — no DOM. The docked Theory card on /voicings renders
 * the sections; the /learn topics carry the theory.
 *
 *   describeVoicing(event, context) → Section[]
 *
 *   event    an analyzeProgression() EventResult, or a scored Explore
 *            candidate (scoreCandidate). Both carry voicing and
 *            namedVsPlayed; an EventResult also carries bass.
 *   context  { parsed, bass?, bassSource?, prev, next, includeMelody,
 *              rank?, rows?, target?, total?, originalTotal? }
 *            parsed         parseSymbol() result for the symbol in effect
 *            bass           the event's bass when the event has none
 *                           (candidates): eventContext().bass
 *            bassSource     'voice' | 'carried' | 'inferred' (data field; the
 *                           event's own wins). An inferred bass is the chord's
 *                           lowest note with no bass line under it, and every
 *                           bass-relative sentence says "the lowest note".
 *            prev / next    voicedNeighbours() refs { bar, event, events, bass, voicing }
 *            includeMelody  whether event.namedVsPlayed counted the melody
 *            rank / rows / target   for a previewed candidate: its rank, the
 *                           ranked rows shown (rankCandidates output) and the
 *                           tension target; the "Why it ranked here" section
 *                           appears only when all three are present.
 *            total          how many candidates were ranked (optional)
 *            originalTotal  the bar's own voicing's tension (optional)
 *            removed        generateCandidates().removed: candidates the
 *                           dominant rule dropped, each with a reason (optional)
 *   Section  { id, title, kind: 'fact' | 'heuristic', items: [{ text, term?, kind? }], see_also: string[] }
 *            `term` is a GLOSSARY key (voicing-explainer-content.js) the
 *            renderer resolves with glossaryLookup(); `see_also` are topic
 *            slugs. An item's `kind`, when present, overrides the section's
 *            (a heuristic remark inside a fact section). Sections come in
 *            this order, each omitted when it cannot be computed:
 *            shape, guide-tones, colour-tones, omissions, motion, why-ranked.
 *
 * Omissions is its own section (kind 'heuristic') rather than an item inside
 * Colour tones: the list of extensions is a fact; "routine" vs "notable" is
 * a rule of thumb. Colour tones carries item-level heuristics only where an
 * engine label is unusual for the symbol (an alteration on a non-dominant,
 * a 7th played over a plain triad).
 *
 * All text is claude-draft: plain, learner-facing, matching the registry
 * topics. Verify before relying on it. Degree labels and interval sizes
 * come from the engine (namedVsPlayed, voiceMotion, rankKey); the catalogue
 * names and the sentences around them are the draft.
 *
 * Self-test (from the repo root, public data only):
 *   node --input-type=module -e "import('./static/shared/voicing-describe.js').then(m => m.selfTest())"
 */

import { parseNote, namedVsPlayed, voiceMotion } from './voicing-analysis.js';
import { shapeKey, chordTones, rankKey, DEGREE_CLASS, TARGET_STEP } from './voicing-explore.js';
import { glossaryLookup } from './voicing-explainer-content.js';

// ════════════════════════════════════════════════════════════════════
// SHAPE CATALOGUE (claude-draft)
// ════════════════════════════════════════════════════════════════════
//
// Keyed by DEGREE_CLASS-collapsed degrees, bottom to top above the bass
// (shapeKey), so ♭3 / ♭7 variants match. `requires` are degree classes the
// chord symbol must name for the match to hold: a 3rd and 7th played over
// a plain triad are not a shell of that triad. `quality`, when present,
// is a predicate on the type's intervals (mod 12): the dominant forms with
// the 13th for the 5th match only a dominant type, and Levine's two major
// forms only a major 7th type. The card prints the shape's degrees as the
// engine labels them (♭3–5–♭7–9 on Cm7), after a fixed name. Rootless
// shapes are named by their bottom note, never A/B: Levine's A and B
// positions name a whole II–V–I by its bottom notes (Levine R6), which the
// rootless-voicings topic will explain. `text(ctx)` gets { shell, rootClause }
// — see shellText() and rootClause() — so the shell wording and the root
// sentence fit the chord and bass in front of the learner. This is the only
// shape catalogue the explainer layer publishes; voicing-explore.js's
// private SHAPE_NAMES (the piece-specific library) is never surfaced here.

const QUALITY = {
  dominant: ivs => ivs.has(4) && ivs.has(10),   // major 3rd + minor 7th, as chordTones().dominant
  major7:   ivs => ivs.has(4) && ivs.has(11),   // maj7 family: maj7, maj9, maj7♯11, maj13, maj7♯5 …
  // Major quality with a maj7 or a 6 named and no ♭7: the maj7 family plus 6 and 6/9.
  // Levine R2: the I chord voiced 3–5–6–9 is the 6/9 chord, so C6 and C6/9 own the shape too.
  major:    ivs => ivs.has(4) && !ivs.has(10) && (ivs.has(11) || ivs.has(9)),
};
const SHAPE_CATALOGUE = [
  { degrees: ['3', '7'], requires: ['3', '7'], name: 'Shell voicing, 3rd below the 7th', term: 'shell', topic: 'guide-tones-and-shells', text: c => c.shell },
  { degrees: ['7', '3'], requires: ['3', '7'], name: 'Shell voicing, 7th below the 3rd', term: 'shell', topic: 'guide-tones-and-shells', text: c => c.shell },
  { degrees: ['3', '5', '7', '9'], requires: ['3', '7'], name: 'Rootless voicing, 3rd on the bottom', term: 'rootless voicing', topic: 'rootless-voicings',
    text: c => `the 9th sits on top; ${c.rootClause}` },
  { degrees: ['7', '9', '3', '5'], requires: ['3', '7'], name: 'Rootless voicing, 7th on the bottom', term: 'rootless voicing', topic: 'rootless-voicings',
    text: c => `the 5th sits on top; ${c.rootClause}` },
  { degrees: ['3', '13', '7', '9'], requires: ['3', '7'], quality: 'dominant', name: 'Rootless voicing, 3rd on the bottom', term: 'rootless voicing', topic: 'rootless-voicings',
    text: c => `the 13th stands in for the 5th; ${c.rootClause}` },
  { degrees: ['7', '9', '3', '13'], requires: ['3', '7'], quality: 'dominant', name: 'Rootless voicing, 7th on the bottom', term: 'rootless voicing', topic: 'rootless-voicings',
    text: c => `the 13th stands in for the 5th; ${c.rootClause}` },
  // Levine R2: CΔ in A position is 3–5–6–9 (E G A D), no major 7th, which is why it can be written C69.
  // The key is in degree classes (6 → 13); the card prints the engine's 6. Matches maj7-family, 6 and 6/9 types.
  { degrees: ['3', '5', '13', '9'], requires: ['3'], quality: 'major', name: 'Rootless voicing, 3rd on the bottom, 6 in place of the major 7th', term: 'rootless voicing', topic: 'rootless-voicings',
    text: c => `reads as a 6/9 sound; ${c.rootClause}` },
  // Levine R4: CΔ in B position is 7–R–3–5 (B C E G): the root is in the voicing but not on the bottom.
  { degrees: ['7', 'R', '3', '5'], requires: ['3', '7'], quality: 'major7', name: 'Major 7th on the bottom, root just above it', term: 'shape', topic: 'rootless-voicings',
    text: () => 'the root is in the voicing, a half step over the 7th, so this is not a rootless voicing' },
];
const CATALOGUE_SUMMARY = 'shell, rootless voicing, or a major 7th form';

// ════════════════════════════════════════════════════════════════════
// WORDS
// ════════════════════════════════════════════════════════════════════

const SIMPLE_INTERVALS = ['a unison', 'a minor 2nd', 'a major 2nd', 'a minor 3rd', 'a major 3rd', 'a perfect 4th', 'a tritone',
  'a perfect 5th', 'a minor 6th', 'a major 6th', 'a minor 7th', 'a major 7th', 'an octave'];
/** Formal names worth adding in parentheses (learner phrasing is "a major 3rd + an octave"). */
const FORMAL_COMPOUND = { 15: 'a minor 10th', 16: 'a major 10th', 19: 'a 12th' };
const EXTENSION_CLASSES = new Set(['9', '11', '13', '♭9', '♯9', '♯11', '♭13']);
const ALTERED = new Set(['♭9', '♯9', '♯11', '♭13']);

function midiOf(n) { const p = parseNote(n); return p && p.midi != null ? p.midi : NaN; }
function pcOf(n) { const p = parseNote(n); return p ? p.pc : null; }
function degClass(d) { return DEGREE_CLASS[d] ?? d; }
function r3(x) { return Math.round(x * 1000) / 1000; }

/** "a tritone", "a minor 7th + an octave", "a major 3rd + an octave (a major 10th)" for a semitone count (sign ignored). */
function intervalName(semis) {
  const s = Math.abs(semis);
  if (s <= 12) return SIMPLE_INTERVALS[s];
  if (s === 24) return 'two octaves';
  if (s === 36) return 'three octaves';
  if (s < 24) return `${SIMPLE_INTERVALS[s - 12]} + an octave${FORMAL_COMPOUND[s] ? ` (${FORMAL_COMPOUND[s]})` : ''}`;
  if (s < 36) return `${SIMPLE_INTERVALS[s - 24]} + two octaves`;
  return `${s} semitones`;
}
/** Motion-sized: "a half step", "a whole step", else the interval name. */
function stepName(semis) {
  const s = Math.abs(semis);
  return s === 1 ? 'a half step' : s === 2 ? 'a whole step' : intervalName(s);
}
function direction(delta) { return delta > 0 ? 'up' : delta < 0 ? 'down' : 'holds'; }

/** Which voice a note is, by its index in the ascending voicing. */
function voiceLabel(i, n) {
  if (n === 1) return 'the only voice';
  if (n === 2) return i === 0 ? 'the lower voice' : 'the upper voice';
  if (i === 0) return 'the bottom voice';
  if (i === n - 1) return 'the top voice';
  return 'an inner voice';
}

/** Spoken form of a degree label: "root", "3rd", "♭7", "♭♭7 (the diminished 7th)". */
function degreeWord(d) {
  if (d === 'R') return 'root';
  if (d === '3') return '3rd';
  if (d === '5') return '5th';
  if (d === '7') return '7th';
  if (d === '♭♭7') return '♭♭7 (the diminished 7th)';
  return d;
}
/** The named 2nd, 4th or 6th a sus / sixth chord carries in place of a 3rd or 7th (Levine T5, T6): "4th". */
const LOW_DEGREE_WORD = { '2': '2nd', '4': '4th', '6': '6th' };
/** Intervals mod 12 the type names. */
function intervalSet(parsed) { return new Set(parsed.intervals.map(i => i % 12)); }
/** Half-diminished: minor 3rd, ♭5 and minor 7th with no perfect 5th (Levine H1). */
function isHalfDim(ivs) { return ivs.has(3) && ivs.has(6) && ivs.has(10) && !ivs.has(7); }
function capital(s) { return s[0].toUpperCase() + s.slice(1); }

/**
 * "bar 4" when that bar has one comp event, "bar 4, event 2" (1-based, as
 * the page labels them) when it has several. A ref without `events`
 * (constructed) shows the event only when it is not the first.
 */
function eventName(ref) {
  const multi = ref.events != null ? ref.events > 1 : ref.event > 0;
  return `bar ${ref.bar}${multi ? `, event ${ref.event + 1}` : ''}`;
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

// ════════════════════════════════════════════════════════════════════
// DESCRIBE
// ════════════════════════════════════════════════════════════════════

/**
 * Voicing notes ascending with their engine degree labels, plus the bass's
 * label and the named-vs-played of bass + voicing alone (no melody).
 */
function readVoicing(voicing, bass, parsed) {
  const nvp = parsed ? namedVsPlayed(parsed, [bass, ...voicing]) : null;
  const byPC = new Map();
  if (nvp) for (const e of [...nvp.present, ...nvp.added]) byPC.set(e.pc, e);
  const notes = voicing
    .map(name => ({ name, midi: midiOf(name), pc: pcOf(name) }))
    .filter(n => !isNaN(n.midi))
    .sort((a, b) => a.midi - b.midi)
    .map(n => ({ ...n, degree: byPC.get(n.pc)?.degree ?? '?', cls: degClass(byPC.get(n.pc)?.degree ?? '?') }));
  const bassMidi = midiOf(bass), bassPC = pcOf(bass);
  const bassDegree = bass && byPC.has(bassPC) ? byPC.get(bassPC).degree : null;
  const named = new Map();   // degree class → named entry (present or omitted)
  if (nvp) for (const e of [...nvp.present, ...nvp.omitted]) if (!named.has(degClass(e.degree))) named.set(degClass(e.degree), e);
  return { notes, nvp, byPC, bassMidi, bassPC, bassDegree, named };
}

function section(id, title, kind, items, see_also) {
  return { id, title, kind, items, see_also: [...new Set(see_also)] };
}

/** Words for the bass: a real bass-voice note, or the chord's lowest note standing in for one. */
function bassWords(inferred) {
  return inferred
    ? { inferred, noun: 'lowest note', Noun: 'The lowest note', aside: " (there's no separate bass line here)" }
    : { inferred, noun: 'bass', Noun: 'Bass', aside: '' };
}

/**
 * The root sentence a rootless shape ends with, from where the root
 * actually is (read-and-report §4): left to the bass when the bass has it;
 * otherwise it is not sounded, and the sentence says what the bass is.
 */
function rootClause(v, parsed, B) {
  const { bassDegree } = v;
  const slash = !!parsed && parsed.bassPC != null;
  if (bassDegree === 'R') return `the root is left to the ${B.noun}`;
  if (!bassDegree) return 'the root is not sounded';
  if (slash) return `the root is not sounded; the ${B.noun} has the ${degreeWord(bassDegree)} instead`;
  return `the root is not sounded at all — the ${B.noun} is the ${degreeWord(bassDegree)}`;
}

/**
 * Shell wording. On a half-diminished chord the two guide tones alone do
 * not say the chord: ♭3 and ♭7 over the root read as a plain minor 7th
 * until the ♭5 arrives (Levine H1: ø is a minor 7th with a flatted 5th).
 */
function shellText(v, parsed, B) {
  const ivs = intervalSet(parsed);
  if (isHalfDim(ivs)) {
    const third = v.named.get('3'), seventh = v.named.get('7');
    return `the two guide tones over the ${B.noun} — but ${third.name} and ${seventh.name} over ${parsed.root} say ${parsed.root}m7 as readily as ${parsed.display}; for a half-diminished chord the ♭5 is part of the identity`;
  }
  // A named alteration that is not played: the shell says the plain seventh chord, not what the
  // symbol asks for (Levine T1: the alterations are what the symbol means; on 7alt all four).
  const missing = parsed.def?.alt
    ? [...ALTERED].filter(a => !v.notes.some(n => n.cls === a))
    : v.nvp.omitted.map(o => o.degree).filter(d => ALTERED.has(degClass(d)));
  if (missing.length) {
    const says = QUALITY.dominant(ivs) ? 'a dominant 7th' : QUALITY.major7(ivs) ? 'a major 7th' : 'the chord';
    return `the two guide tones over the ${B.noun} and nothing else — the smallest voicing that still says ${says}; the ${list(missing)} the symbol asks for ${missing.length > 1 ? 'are' : 'is'} not in it`;
  }
  return `the two guide tones over the ${B.noun} and nothing else — the smallest voicing that still says the chord`;
}

/** 1. Shape — catalogue match or the plain degree list, then layout, doubling and the bass. */
function shapeSection(v, bass, parsed, B) {
  const { notes, bassDegree, named } = v;
  const items = [];
  const see = ['voicings-as-shapes'];
  const sk = shapeKey(notes.map(n => n.name), bass, parsed);
  const ivs = intervalSet(parsed);
  const degreeList = list(notes.map(n => `${n.degree} (${n.name})`));
  const match = sk && SHAPE_CATALOGUE.find(c => c.degrees.join('-') === sk.degrees.join('-') && c.requires.every(r => named.has(r)) && (!c.quality || QUALITY[c.quality](ivs)));
  if (match) {
    const played = notes.map(n => n.degree).join('–');
    const ctx = { shell: shellText(v, parsed, B), rootClause: rootClause(v, parsed, B) };
    items.push({ text: `${match.name} (${played}): ${match.text(ctx)}. Degrees bottom to top: ${degreeList}.`, term: match.term });
    see.push(match.topic);
  } else {
    items.push({ text: `Degrees bottom to top: ${degreeList} — not one of the catalogue shapes (${CATALOGUE_SUMMARY}).`, term: 'shape' });
  }
  const slash = !!parsed && parsed.bassPC != null;
  const degreeLine = !!(parsed && bassDegree && (slash || bassDegree !== 'R'));   // the aside goes there when there is one, else on the layout line
  const bassWord = bassDegree ? ` (the ${degreeWord(bassDegree)})` : '';
  const layout = notes.map((n, i) => `${n.name} ${i === 0 ? 'is ' : ''}${intervalName(n.midi - v.bassMidi)}${i === 0 ? ' above it' : ''}`);
  const span = notes[notes.length - 1].midi - notes[0].midi;
  items.push({ text: `Layout ${B.inferred ? 'above' : 'over'} the ${B.noun} ${bass}${bassWord}${degreeLine ? '' : B.aside}: ${list(layout)}${notes.length > 1 ? `; the voicing spans ${intervalName(span)}` : ''}.`, term: 'register' });
  const doubles = notes.filter(n => n.pc === v.bassPC).map(n => `${n.name} doubles the ${B.noun} ${bass} ${intervalName(n.midi - v.bassMidi)} up`);
  for (let i = 1; i < notes.length; i++) for (let j = 0; j < i; j++) if (notes[i].pc === notes[j].pc) doubles.push(`${notes[i].name} doubles ${notes[j].name} ${intervalName(notes[i].midi - notes[j].midi)} up`);
  if (doubles.length) items.push({ text: `${list(doubles)}.` });
  if (degreeLine) {
    const subject = B.inferred ? `The lowest note, ${bass}${B.aside},` : `The bass ${bass}`;
    if (slash && v.bassPC !== parsed.bassPC) {
      items.push({ text: B.inferred
        ? `The symbol ${parsed.display} shows ${parsed.bass} in the bass; the lowest note here is ${bass}, the ${degreeWord(bassDegree)}${B.aside}.`
        : `The symbol ${parsed.display} shows ${parsed.bass} in the bass; the bass note in effect here is ${bass}, the ${degreeWord(bassDegree)}.`, term: 'slash bass' });
      see.push('chord-tones-and-roles');
    } else if (slash) {
      items.push({ text: `${subject} is the ${degreeWord(bassDegree)}, the slash bass in ${parsed.display}.`, term: 'slash bass' });
      see.push('chord-tones-and-roles');
    } else {
      items.push({ text: `${subject} is the ${degreeWord(bassDegree)}, not the root.`, term: 'degree' });
      see.push('chord-tones-and-roles');
    }
  }
  return section('shape', 'Shape', 'fact', items, see);
}

/** 2. Guide tones — where the 3rd and 7th sit, the interval between them, what is missing. */
function guideTonesSection(v, bass, parsed, B) {
  const { notes, named, bassDegree, nvp } = v;
  if (!parsed || !notes.length) return null;
  const dominant = !!chordTones(parsed)?.dominant;
  const ivs = intervalSet(parsed);
  const items = [];
  const see = ['guide-tones-and-shells'];
  const places = {};
  for (const cls of ['3', '7']) {
    const namedEntry = named.get(cls);
    // The symbol's own 3rd / 7th by pitch class (a ♯9 or ♭♭7 lower down shares the class but not the pc);
    // the class scan only when the symbol names none (sus chords, triads).
    const idx = namedEntry ? notes.findIndex(n => n.pc === namedEntry.pc) : notes.findIndex(n => n.cls === cls);
    const inBass = bassDegree && (namedEntry ? v.bassPC === namedEntry.pc : degClass(bassDegree) === cls);
    // Levine T5/T6: a sus or sixth chord names a 2nd, 4th or 6th where the 3rd or 7th would be.
    const standIn = !namedEntry && notes.find(n => (cls === '3' ? ['2', '4'] : ['6']).includes(n.degree) && nvp.present.some(p => p.pc === n.pc));
    if (idx >= 0) {
      const n = notes[idx];
      places[cls] = { midi: n.midi, name: n.name };
      const unnamed = namedEntry ? '' : ` — ${parsed.display} names no ${cls === '3' ? '3rd' : '7th'}, but one is played`;
      items.push({ text: `The ${degreeWord(n.degree)} (${n.name}) is ${voiceLabel(idx, notes.length)}${inBass ? `, and the ${B.noun} has it too` : ''}${unnamed}.` });
    } else if (inBass) {
      places[cls] = { midi: v.bassMidi, name: bass, bass: true };
      items.push({ text: B.inferred ? `The ${degreeWord(bassDegree)} (${bass}) is the lowest note, under the voicing.` : `The ${degreeWord(bassDegree)} (${bass}) is the bass, not part of the voicing.` });
    } else if (namedEntry) {
      // Levine R2 / T7: on the I chord the 6 stands in for the unplayed major 7th (3–5–6–9).
      const sixth = cls === '7' && notes.find(n => n.degree === '6');
      items.push({ text: `The ${degreeWord(namedEntry.degree)} (${namedEntry.name}) is not played${sixth ? `: the 6th (${sixth.name}) stands in its place` : ''}.` });
    } else if (standIn) {
      items.push({ text: `${parsed.display} names no ${cls === '3' ? '3rd' : '7th'}: the ${LOW_DEGREE_WORD[standIn.degree]} (${standIn.name}) stands in its place.` });
    } else {
      items.push({ text: `${parsed.display} names no ${cls === '3' ? '3rd' : '7th'}.` });
    }
  }
  items[0].term = 'guide tones';
  // Levine S6: sus chords function as V chords and resolve to the I as smoothly as a dominant 7th does.
  if (!named.has('3') && ivs.has(10)) {
    items.push({ text: 'A sus chord works as a V chord: it resolves to its I as smoothly as a dominant 7th does.', term: 'dominant seventh' });
  }
  if (places['3'] && places['7']) {
    const [lo, hi] = [places['3'], places['7']].sort((a, b) => a.midi - b.midi);
    const semis = hi.midi - lo.midi;
    const tritone = semis % 12 === 6;
    const where = lo.bass || hi.bass ? `from the ${B.noun} ${lo.name} up to ${hi.name}` : `from ${lo.name} up to ${hi.name}`;
    const why = tritone && dominant ? ' — the interval that gives a dominant its pull' : '';
    items.push({ text: `Between them, ${where}: ${intervalName(semis)}${why}.`, term: tritone ? 'tritone' : undefined });
    if (tritone) see.push('tritone');
  }
  return section('guide-tones', 'Guide tones', 'fact', items, see);
}

/** What a 7th played over a plain triad adds up to: "Cmaj7", "C7", "Cm7", "Cm(maj7)", or null. */
function impliedSeventh(parsed, rawDegree) {
  const ivs = new Set(parsed.intervals.map(i => i % 12));
  const major = ivs.has(4), minor = !major && ivs.has(3);
  if (!major && !minor) return null;
  if (rawDegree === '7') return `${parsed.root}${major ? 'maj7' : 'm(maj7)'}`;
  if (rawDegree === '♭7') return `${parsed.root}${major ? '7' : 'm7'}`;
  return null;
}

/** 3. Colour tones — extensions and alterations present, rubs with chord tones, unusual labels, what the melody adds. */
function colourTonesSection(v, event, bass, parsed, context, B) {
  const { notes, nvp, named } = v;
  if (!parsed || !nvp || !notes.length) return null;
  const items = [];
  const see = ['extensions', 'named-vs-played'];
  const dominant = !!chordTones(parsed)?.dominant;
  const ivs = intervalSet(parsed);
  const majorSeventhChord = ivs.has(4) && ivs.has(11);
  const halfDim = isHalfDim(ivs);
  const addedPCs = new Set(nvp.added.map(e => e.pc));
  const colour = notes.filter(n => !['R', '3', '5', '7'].includes(n.cls) || addedPCs.has(n.pc));
  const sounding = [...notes, ...(isNaN(v.bassMidi) ? [] : [{ name: bass, midi: v.bassMidi, degree: v.bassDegree || '?', bass: true }])];
  for (const n of colour) {
    const i = notes.indexOf(n);
    const isNamed = named.has(n.cls) && nvp.present.some(p => p.pc === n.pc);
    // A raw 2, 4 or 6 is a tone the symbol names in place of a 3rd or 7th (Levine T5, T6), not an extension.
    const low = n.degree in LOW_DEGREE_WORD;
    // Levine H5: on a minor-3rd chord the ♭13 is the ♭6 of the chord's scale — an extension there, not an alteration.
    const altered = ALTERED.has(n.cls) && !(n.cls === '♭13' && ivs.has(3));
    const kind = low ? (isNamed ? 'Chord tone' : 'Added tone') : altered ? 'Alteration' : EXTENSION_CLASSES.has(n.cls) ? 'Extension' : 'Added tone';
    const provenance = isNamed ? `named by ${parsed.display} and played` : `not named by ${parsed.display}`;
    const term = low ? (isNamed ? 'chord tones' : 'named vs played') : n.cls === '♯11' && dominant ? '♯11' : altered ? 'alterations' : EXTENSION_CLASSES.has(n.cls) ? 'extension' : 'named vs played';
    items.push({ text: `${kind} ${n.degree} (${n.name}) in ${voiceLabel(i, notes.length)}, ${provenance}.`, term });
    if (n.cls === '♯11' && dominant) see.push('sharp-eleven-on-dominants');
    // A rub: the colour tone a half step from a chord tone that is sounding.
    for (const o of sounding) {
      if (o === n || Math.abs(o.midi - n.midi) !== 1 || !['R', '3', '5', '7'].includes(degClass(o.degree))) continue;
      items.push({ text: `${n.degree} (${n.name}) sits a half step ${n.midi > o.midi ? 'above' : 'below'} the ${degreeWord(o.degree)} (${o.name}${o.bass ? `, the ${B.noun}` : ''}): a minor 2nd rub.`, term: 'rub' });
      see.push('intervals-that-rub');
    }
    // Labels that surprise: keep the fact above, explain here.
    if (n.cls === '♭13' && !isNamed && ivs.has(3)) {
      // Not a dominant sound here: the ♭6 is a scale tone on a minor-3rd chord. On ø it is in both
      // Locrian and Locrian ♯2 (Levine H5); 9 and 11 are the usual additions (Levine H3, H4).
      items.push(halfDim
        ? { text: `${n.degree} (${n.name}) is a scale tone on a half-diminished chord: the ♭6 of both Locrian and Locrian ♯2. The 9 and 11 are the more usual additions.`, term: 'extensions' }
        : { text: `A ${n.degree} on ${parsed.display} is the ♭6 of the chord's minor scale — diatonic colour rather than a dominant sound, though the 9 and 11 are the usual additions.`, term: 'extensions', kind: 'heuristic' });
    } else if (ALTERED.has(n.cls) && !isNamed && !dominant && !(n.cls === '♯11' && majorSeventhChord)) {
      items.push({ text: `A ${n.degree} is not a usual colour on ${parsed.display}: altered 9ths, 11ths and 13ths are dominant-chord sounds. Against this symbol the ${n.name} reads as a passing or neighbour tone rather than chord colour.`, term: 'alterations', kind: 'heuristic' });
    } else if (n.cls === '7' && !named.has('7')) {
      const implied = impliedSeventh(parsed, n.degree);
      items.push({ text: `${parsed.display} is written as a triad, but a ${degreeWord(n.degree)} is played: what sounds is ${implied || 'a seventh chord'}. The symbol is simpler than the voicing.`, term: 'chord symbol', kind: 'heuristic' });
    }
  }
  if (!colour.length) items.push({ text: `No colour tones: every voicing note is a chord tone ${parsed.display} names.`, term: 'chord tones' });
  if (context.includeMelody && event.namedVsPlayed) {
    const voicingPCs = new Set([...nvp.present, ...nvp.added].map(e => e.pc));
    const fromMelody = [...event.namedVsPlayed.present, ...event.namedVsPlayed.added].filter(e => !voicingPCs.has(e.pc));
    if (fromMelody.length) {
      items.push({ text: `With the melody counted, the panel also shows ${list(fromMelody.map(e => `${e.degree} (${e.name})`))}: that comes from the melody, not the voicing.`, term: 'melody toggle' });
      see.push('melody-toggle');
    }
  }
  return section('colour-tones', 'Colour tones', 'fact', items, see);
}

/** 4. Omissions — named tones not played, with the rule of thumb for each. */
function omissionsSection(v, parsed, B) {
  const { nvp } = v;
  if (!parsed || !nvp || !nvp.omitted.length) return null;
  const dominant = !!chordTones(parsed)?.dominant;
  const items = [];
  for (const o of nvp.omitted) {
    const cls = degClass(o.degree);
    const label = `${capital(degreeWord(o.degree))} (${o.name}) left out`;
    let text;
    if (o.degree === '5') text = `${label} — routine: the 5th is the chord tone most often dropped; it adds little that the root does not.`;
    else if (cls === '5') text = `${label} — notable: the altered 5th is part of what ${parsed.display} says; without it the chord loses that colour.`;
    else if (cls === 'R') text = B.inferred
      ? `${label}: no sounding note has it${B.aside}, so the chord is implied by its other tones rather than stated.`
      : `${label}, and the bass does not have it either, so the chord is implied by its other tones rather than stated.`;
    else if (cls === '3') text = `${label} — notable: a guide tone is missing. Without the 3rd the chord is open and ambiguous, major or minor.`;
    // Levine R2 / T7: the I chord voiced 3–5–6–9 leaves the major 7th out on purpose; the 6 takes its place.
    else if (cls === '7' && !dominant && v.notes.some(n => n.degree === '6')) text = `${label} by design: the 6 stands in for the major 7th, a common way to voice the I chord.`;
    else if (cls === '7') text = `${label} — notable: a guide tone is missing. ${dominant ? `Without the 7th, ${parsed.display} stops sounding like a dominant.` : 'Without the 7th what is left is a plain triad.'}`;
    else if (['2', '4', '6'].includes(o.degree)) text = `${label} — notable: it is the tone that makes ${parsed.display} what it is.`;
    // A named alteration is the symbol's point (Levine T1: the alterations are what 7alt means); without it the player played the plain chord.
    else if (ALTERED.has(cls)) text = `${label} — notable: the ${o.degree} is the colour ${parsed.display} asks for; without it ${dominant ? `this is plain ${parsed.root}7` : "the symbol's alteration is not heard"}.`;
    else text = `${label} — routine: a named extension is colour, not structure. Leaving it out keeps the chord's identity but not the symbol's flavour.`;
    items.push({ text, term: items.length ? undefined : 'omitted' });
  }
  return section('omissions', 'Omissions', 'heuristic', items, ['omitting-tones', 'guide-tones-and-shells']);
}

/** 5. Motion — from the previous voiced event: voice count, common tones, steps, leaps, bass; then a word on the next. */
function motionSection(v, bass, context, B) {
  const { notes } = v;
  const prev = context.prev;
  if (!prev || !Array.isArray(prev.voicing) || !prev.voicing.length || !notes.length) return null;
  const voicing = notes.map(n => n.name);
  const m = voiceMotion(prev.voicing, voicing);
  if (!m) return null;
  const nameOf = midi => { const n = [...prev.voicing, ...voicing].find(x => midiOf(x) === midi); return n || parseNote(midi).name; };
  const items = [];
  const lead = `From ${eventName(prev)}, the previous voiced event (${prev.voicing.join(' ')}${prev.bass ? ` over ${prev.bass}` : ''})`;
  const gained = m.unmatched.filter(u => u.side === 'to').map(u => u.name);
  const dropped = m.unmatched.filter(u => u.side === 'from').map(u => u.name);
  if (gained.length) items.push({ text: `${lead}: the voicing gains ${gained.length === 1 ? 'a voice' : `${gained.length} voices`} — ${list(gained)} ${gained.length === 1 ? 'has' : 'have'} no partner there.`, term: 'motion' });
  else if (dropped.length) items.push({ text: `${lead}: the voicing drops ${dropped.length === 1 ? 'a voice' : `${dropped.length} voices`} — ${list(dropped)} ${dropped.length === 1 ? 'has' : 'have'} no partner here.`, term: 'motion' });
  else items.push({ text: `${lead}. Total upper-voice motion: ${plural(m.total, 'semitone')}.`, term: 'motion' });
  const held = m.perVoice.filter(p => p.delta === 0);
  const steps = m.perVoice.filter(p => Math.abs(p.delta) > 0 && Math.abs(p.delta) <= 2);
  const leaps = m.perVoice.filter(p => Math.abs(p.delta) > 2);
  items.push({ text: held.length ? `Common tones: ${list(held.map(p => nameOf(p.to)))} held.` : 'No common tones.', term: 'common tone' });
  if (steps.length) items.push({ text: `By step: ${list(steps.map(p => `${nameOf(p.from)} → ${nameOf(p.to)} (${direction(p.delta)} ${stepName(p.delta)})`))}.` });
  if (leaps.length) {
    const big = leaps.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
    items.push({ text: `Largest leap: ${nameOf(big.from)} → ${nameOf(big.to)}, ${direction(big.delta)} ${intervalName(big.delta)}${leaps.length > 1 ? ` (${leaps.length} voices leap)` : ''}.` });
  } else if (steps.length) {
    items.push({ text: 'No leaps: every voice holds or moves by step.', term: 'voice leading' });
  }
  const prevBassMidi = midiOf(prev.bass), bassMidi = midiOf(bass);
  if (!isNaN(prevBassMidi) && !isNaN(bassMidi)) {
    const d = bassMidi - prevBassMidi;
    const upperSum = m.perVoice.reduce((t, p) => t + p.delta, 0);
    const upperMoves = m.perVoice.some(p => p.delta !== 0);
    const ups = m.perVoice.filter(p => p.delta > 0).length, downs = m.perVoice.filter(p => p.delta < 0).length;
    let text, term = 'bass line';
    if (d === 0 && !upperMoves) text = `${B.Noun} ${bass} holds, and so do the upper voices.`;
    else if (d === 0) { text = `${B.Noun} ${bass} holds while the upper voices move (oblique motion).`; term = 'oblique motion'; }
    else {
      const bassMove = `${B.Noun} moves ${direction(d)} ${intervalName(d)} (${prev.bass} → ${bass})`;
      if (!upperMoves) { text = `${bassMove} under held upper voices (oblique motion).`; term = 'oblique motion'; }
      else if (ups && downs) text = `${bassMove}; the upper voices split, some up and some down.`;
      else if (Math.sign(upperSum) === Math.sign(d)) { text = `${bassMove}, and the upper voices move with it (similar motion).`; term = 'similar motion'; }
      else { text = `${bassMove}, and the upper voices move against it (contrary motion).`; term = 'contrary motion'; }
    }
    items.push({ text, term });
  }
  const next = context.next;
  if (next && Array.isArray(next.voicing) && next.voicing.length) {
    const out = voiceMotion(voicing, next.voicing);
    if (out) items.push({ text: `On to ${eventName(next)} (${next.voicing.join(' ')}${next.bass ? ` over ${next.bass}` : ''}): ${plural(out.total, 'semitone')} of upper-voice motion.` });
  }
  return section('motion', 'Motion', 'fact', items, ['voice-leading']);
}

/**
 * 6. Why it ranked here — for a previewed candidate: its rankKey against
 * the rows directly above and below, explained by the first component that
 * differs. Rank 1 explains why it beat #2; the last row why it lost.
 */
function whyRankedSection(context) {
  const { rank, rows, target } = context;
  if (rank == null || !Array.isArray(rows) || !rows.length || target == null) return null;
  const idx = rows.findIndex(r => r.rank === rank);
  if (idx < 0 || !rows[idx].tension || !rows[idx].motion) return null;
  const me = rows[idx], above = rows[idx - 1] || null, below = rows[idx + 1] || null;
  const key = r => rankKey(r, target);
  const raw = r => r3(Math.abs(r.tension.total - target));
  const [dist, motion, omitted] = key(me);
  const items = [];
  const see = ['explore-ranking', 'tension-scoring'];
  const of = context.total ? ` of ${context.total}` : '';
  items.push({
    text: `Ranked #${rank}${of} at target ${target}: tension ${r3(me.tension.total)}, so ${dist} from the target once rounded to the nearest ${TARGET_STEP}; ${plural(motion, 'semitone')} of motion in and out; ${plural(omitted, 'named tone')} left out.`,
    term: 'ranking',
  });
  const label = r => `#${r.rank} (${r.voicing.join(' ')})`;
  const compare = (other, dir) => {
    const mine = key(me), theirs = key(other);
    const i = mine.findIndex((x, k) => x !== theirs[k]);
    const open = dir === 'above' ? `Below ${label(other)}` : `Above ${label(other)}`;
    const bucket = `distances round to the nearest ${TARGET_STEP}`;
    if (i < 0) return { text: `${open}: a tie on every count (target distance ${dist}, motion ${motion}, ${omitted} left out), so the order between them is alphabetical by voicing.`, term: 'ranking' };
    const because = ['target distance', 'motion', 'omissions'][i];
    const verb = {
      'target distance': dir === 'above' ? 'it is further from the target' : 'it is closer to the target',
      motion: dir === 'above' ? 'it moves more' : 'it moves less',
      omissions: dir === 'above' ? 'it leaves out more named tones' : 'it leaves out fewer named tones',
    }[because];
    const nums = `${mine[i]} against ${theirs[i]}`;
    if (i === 0) {
      const close = Math.abs(raw(me) - raw(other)) < TARGET_STEP ? ` The raw gap is small (${raw(me)} against ${raw(other)} from the target before rounding; ${bucket}), so a nudge of the target could swap them.` : '';
      return { text: `${open} because ${verb}: ${nums}.${close}`, term: 'tension target' };
    }
    const flip = raw(me) !== raw(other) && (raw(me) < raw(other)) === (dir === 'above');
    const tie = ` Both are ${dist} from the target${flip ? ` — this one is actually ${dir === 'above' ? 'closer' : 'further'} before rounding (${raw(me)} against ${raw(other)}), but ${bucket}` : ` (${bucket})`}, so the tie-break decides.`;
    return { text: `${open} because ${verb}: ${nums}.${tie}`, term: because === 'motion' ? 'motion' : 'omitted' };
  };
  if (above) items.push(compare(above, 'above'));
  if (below) items.push(compare(below, 'below'));
  if (context.originalTotal != null) {
    const diff = r3(me.tension.total - context.originalTotal);
    const rel = diff === 0 ? 'the same' : `${Math.abs(diff)} ${diff > 0 ? 'higher' : 'lower'}`;
    items.push({ text: `The bar's own voicing scores ${r3(context.originalTotal)}${target === r3(context.originalTotal) ? ' (the default target)' : ''}; this candidate is ${rel}.`, term: 'tension' });
  }
  if (Array.isArray(context.removed) && context.removed.length) {
    const reasons = [...new Set(context.removed.map(r => r.reason))].join('; ');
    items.push({ text: `${plural(context.removed.length, 'candidate')} removed by the dominant rule (${reasons}) before ranking.`, term: 'dominant rule' });
  }
  if (items.some(it => it.term === 'motion')) see.push('voice-leading');
  if (items.some(it => it.term === 'omitted')) see.push('omitting-tones');
  return section('why-ranked', 'Why it ranked here', 'heuristic', items, see);
}

/**
 * Describe one voicing. See the module header for the event and context
 * shapes. Returns [] when there is nothing to describe (no voicing and no
 * bass).
 */
function describeVoicing(event, context = {}) {
  const voicing = Array.isArray(event?.voicing) ? event.voicing : [];
  const bass = event?.bass ?? context.bass ?? null;
  const parsed = context.parsed || null;
  if (!voicing.length) {
    if (!bass) return [];
    return [section('shape', 'Shape', 'fact', [{ text: `No voicing on this event: the bass ${bass} plays alone.`, term: 'comp' }], ['roles-in-the-data'])];
  }
  const v = readVoicing(voicing, bass, parsed);
  if (!v.notes.length) return [];
  const B = bassWords((event?.bassSource ?? context.bassSource) === 'inferred');
  const sections = [];
  if (parsed && !isNaN(v.bassMidi)) sections.push(shapeSection(v, bass, parsed, B));
  else sections.push(section('shape', 'Shape', 'fact', [{ text: `Notes bottom to top: ${list(v.notes.map(n => n.name))}${bass ? ` over the ${B.noun} ${bass}` : ''}${parsed ? '' : ' — no chord symbol in effect, so no degrees'}.`, term: 'shape' }], ['voicings-as-shapes']));
  for (const s of [guideTonesSection(v, bass, parsed, B), colourTonesSection(v, event, bass, parsed, context, B), omissionsSection(v, parsed, B), motionSection(v, bass, context, B), whyRankedSection(context)]) {
    if (s) sections.push(s);
  }
  return sections;
}

/** Plain-text rendering, for the console and tests. */
function formatSections(sections) {
  return sections.map(s => `${s.title} [${s.kind}]\n${s.items.map(i => `  • ${i.text}${i.kind ? ` [${i.kind}]` : ''}${i.term ? `  ⟨${i.term}⟩` : ''}`).join('\n')}\n  see also: ${s.see_also.join(', ')}`).join('\n');
}

export { describeVoicing, formatSections, SHAPE_CATALOGUE, intervalName, selfTest };

if (typeof window !== 'undefined') {
  window.VoicingDescribe = { describeVoicing, formatSections, SHAPE_CATALOGUE, intervalName };
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs; public data only)
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  const fs = await import('node:fs');
  const { analyzeProgression, parseSymbol } = await import('./voicing-analysis.js');
  const { eventContext, voicedNeighbours, generateCandidates, scoreCandidate, rankCandidates } = await import('./voicing-explore.js');
  const { resolveSlug } = await import('./voicing-explainer-content.js');
  let passed = 0, total = 0;
  const check = (name, ok, detail = '') => { total++; if (ok) passed++; console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); };
  const load = rel => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
  const ctxOf = (prog, bar, i, includeMelody = false) => { const c = eventContext(prog, bar, i); return { parsed: c.parsed, bass: c.bass, prev: c.neighbours.prev, next: c.neighbours.next, includeMelody }; };
  const describeAt = (prog, an, bar, i = 0, includeMelody = false) => describeVoicing(an.bars.find(b => b.bar === bar).events[i], ctxOf(prog, bar, i, includeMelody));
  const byId = (sections, id) => sections.find(s => s.id === id) || null;
  const texts = sections => sections.flatMap(s => (s ? s.items.map(i => i.text) : ['(section missing)'])).join('\n');
  const ORDER = ['shape', 'guide-tones', 'colour-tones', 'omissions', 'motion', 'why-ranked'];

  console.log('\n─── voicing-describe.js self-test ───\n');

  // ── Structure over every public event ───────────────────────────
  const fixture = load('../../tests/fixtures/voicing-fixture.json');
  const rag = load('../../tests/fixtures/voicing-maple-leaf-rag.json');
  const problems = [];
  let events = 0, sectionsSeen = 0;
  for (const [label, prog] of [['fixture', fixture], ['rag', rag]]) {
    for (const includeMelody of [false, true]) {
      const an = analyzeProgression(prog, { includeMelody });
      for (const b of an.bars) b.events.forEach((e, i) => {
        events++;
        const out = describeVoicing(e, ctxOf(prog, b.bar, i, includeMelody));
        const where = `${label} ${b.bar}:${i}${includeMelody ? ' (melody)' : ''}`;
        const ids = out.map(s => s.id);
        if (new Set(ids).size !== ids.length) problems.push(`${where}: duplicate section ids`);
        if (ids.some((id, k) => k > 0 && ORDER.indexOf(id) <= ORDER.indexOf(ids[k - 1]))) problems.push(`${where}: order ${ids.join(',')}`);
        for (const s of out) {
          sectionsSeen++;
          if (!s.title || !['fact', 'heuristic'].includes(s.kind) || !Array.isArray(s.items) || !s.items.length || !Array.isArray(s.see_also)) problems.push(`${where}: ${s.id} malformed`);
          for (const slug of s.see_also) if (!resolveSlug(slug)) problems.push(`${where}: ${s.id} see_also ${slug}`);
          for (const it of s.items) {
            if (typeof it.text !== 'string' || !it.text.trim()) problems.push(`${where}: ${s.id} empty item`);
            for (const needle of ['undefined', 'NaN', 'null', '[object', '?']) if (it.text.includes(needle)) problems.push(`${where}: ${s.id} "${needle}" in "${it.text}"`);
            if (it.term !== undefined && !glossaryLookup(it.term)) problems.push(`${where}: ${s.id} term "${it.term}" not in GLOSSARY`);
            if (it.kind !== undefined && !['fact', 'heuristic'].includes(it.kind)) problems.push(`${where}: ${s.id} item kind ${it.kind}`);
          }
        }
        if (e.voicing.length && e.bass && !byId(out, 'shape')) problems.push(`${where}: no shape section`);
        if (byId(out, 'why-ranked')) problems.push(`${where}: why-ranked without rank context`);
      });
    }
  }
  check(`every public event describes cleanly (${events} events, ${sectionsSeen} sections)`, !problems.length, problems.slice(0, 6).join('\n    '));

  // ── Refactor: bass and event count on neighbour refs ────────────
  const nb = voicedNeighbours(fixture, 5, 1);
  check('voicedNeighbours refs carry bass and events', nb.prev.bass === 'F3' && nb.prev.events === 2 && nb.next.bass === 'C♯3' && nb.next.events === 1, JSON.stringify(nb));

  // ── Rag bar 12, event 2: E♭7 over E♭4, G4 D♭5 — the shell ───────
  const ra = analyzeProgression(rag);
  const r12 = describeAt(rag, ra, 12, 1);
  check('rag 12.2 is a shell, 3rd below the 7th', byId(r12, 'shape').items[0].term === 'shell' && /^Shell voicing, 3rd below the 7th/.test(byId(r12, 'shape').items[0].text), byId(r12, 'shape').items[0].text);
  check('rag 12.2 symbol is E♭7 with the root in the bass: no slash sentence', ra.bars.find(b => b.bar === 12).events[1].symbol === 'E♭7' && !/slash|shows .* in the bass/.test(texts([byId(r12, 'shape')])) && byId(r12, 'shape').items.length === 2, texts([byId(r12, 'shape')]));
  const r12a = describeAt(rag, ra, 12, 0);                        // A♭/E♭ over E♭4: the slash names the bass
  check('rag 12.1 (A♭/E♭, inferred bass): "The lowest note, E♭4 (there\'s no separate bass line here), is the 5th, the slash bass"', /The lowest note, E♭4 \(there's no separate bass line here\), is the 5th, the slash bass in A♭\/E♭\./.test(texts([byId(r12a, 'shape')])) && !/\bthe bass\b/.test(texts([byId(r12a, 'shape')])), texts([byId(r12a, 'shape')]));
  const r10 = describeAt(rag, ra, 10, 0);                        // A♭/E♭ over an inferred E♭4 (no bass line in bars 9–15)
  check('rag 10 (inferred bass): bassSource is on the event; shape, guide tones and motion all say "lowest note", never "bass"', ra.bars.find(b => b.bar === 10).events[0].bassSource === 'inferred' && /Layout above the lowest note E♭4 \(the 5th\): /.test(texts([byId(r10, 'shape')])) && /The lowest note, E♭4 \(there's no separate bass line here\), is the 5th, the slash bass in A♭\/E♭\./.test(texts([byId(r10, 'shape')])) && /^The lowest note moves up a minor 2nd \(D4 → E♭4\)/m.test(texts([byId(r10, 'motion')])) && !/\b[Bb]ass [A-G]/.test(texts(r10).replace(/slash bass/g, '')), texts(r10));
  check('rag 12.2 guide tones: 3rd lower, ♭7 upper, tritone with the dominant remark', /3rd \(G4\) is the lower voice/.test(texts([byId(r12, 'guide-tones')])) && /♭7 \(D♭5\) is the upper voice/.test(texts([byId(r12, 'guide-tones')])) && /a tritone — the interval that gives a dominant its pull/.test(texts([byId(r12, 'guide-tones')])));
  check('rag 12.2 omissions: perfect 5th routine, section heuristic', byId(r12, 'omissions').kind === 'heuristic' && /5th \(B♭\) left out — routine/.test(texts([byId(r12, 'omissions')])));
  check('rag 12.2 colour: none', /No colour tones/.test(texts([byId(r12, 'colour-tones')])));
  const m12 = byId(r12, 'motion');
  check('rag 12.2 motion names bar 12, event 1 (multi-event bar); both voices by step; oblique, "the lowest note" (inferred bass)', /^From bar 12, event 1/.test(m12.items[0].text) && /A♭4 → G4 \(down a half step\)/.test(texts([m12])) && /C5 → D♭5 \(up a half step\)/.test(texts([m12])) && m12.items.some(it => it.term === 'oblique motion' && /^The lowest note E♭4 holds while the upper voices move/.test(it.text)), texts([m12]));
  check('rag 12.2 (root, no slash): the aside lands on the layout line', /^Layout above the lowest note E♭4 \(the root\) \(there's no separate bass line here\): /.test(byId(r12, 'shape').items[1].text), byId(r12, 'shape').items[1].text);
  check('rag 12.2 motion mentions the next event (bar 12, event 3)', /On to bar 12, event 3/.test(texts([m12])));

  // ── Rag bar 9: Bdim7 over D4 (the ♭3 in the bass), F4 A♭4 B4 ─────
  const r9 = describeAt(rag, ra, 9, 0);
  check('rag 9 shape: no catalogue match, the lowest note (inferred) is the ♭3', byId(r9, 'shape').items[0].term === 'shape' && /not one of the catalogue shapes/.test(byId(r9, 'shape').items[0].text) && /The lowest note, D4 \(there's no separate bass line here\), is the ♭3, not the root/.test(texts([byId(r9, 'shape')])), texts([byId(r9, 'shape')]));
  check('rag 9 guide tones: ♭3 is the lowest note, ♭♭7 inner, tritone between them', /♭3 \(D4\) is the lowest note, under the voicing/.test(texts([byId(r9, 'guide-tones')])) && /♭♭7 \(the diminished 7th\) \(A♭4\) is an inner voice/.test(texts([byId(r9, 'guide-tones')])) && /from the lowest note D4 up to A♭4: a tritone\./.test(texts([byId(r9, 'guide-tones')])), texts([byId(r9, 'guide-tones')]));
  check('rag 9 (first event of the bar) motion looks back past bars 5–8 to bar 4, event 2', /^From bar 4, event 2/.test(byId(r9, 'motion').items[0].text), byId(r9, 'motion').items[0].text);
  check('rag 9: nothing omitted → no omissions section', byId(r9, 'omissions') === null);

  // ── Fixture bars ─────────────────────────────────────────────────
  const fa = analyzeProgression(fixture), fam = analyzeProgression(fixture, { includeMelody: true });
  const f4 = describeAt(fixture, fa, 4);                           // C7/E over E3, B♭3
  check('fixture 4 (C7/E): 3rd is the slash bass; ♭7 the only voice; tritone from the bass', /The bass E3 is the 3rd, the slash bass in C7\/E\./.test(texts([byId(f4, 'shape')])) && /♭7 \(B♭3\) is the only voice/.test(texts([byId(f4, 'guide-tones')])) && /from the bass E3 up to B♭3: a tritone — the interval/.test(texts([byId(f4, 'guide-tones')])), texts(f4));
  check('fixture 4 (voice bass) keeps the bass wording', fa.bars.find(b => b.bar === 4).events[0].bassSource === 'voice' && /The bass E3 is the 3rd, the slash bass in C7\/E\./.test(texts([byId(f4, 'shape')])) && /Layout over the bass E3/.test(texts([byId(f4, 'shape')])));
  const f5b = describeAt(fixture, fa, 5, 1);                       // Gm7/F: A3 B♭3 D4 → A♭3 D4
  const m5b = byId(f5b, 'motion');
  check('fixture 5.2: voice-count change leads the motion section and the total is omitted', /^From bar 5, event 1, the previous voiced event \(A3 B♭3 D4 over F3\): the voicing drops a voice — B♭3 has no partner here\.$/.test(m5b.items[0].text) && !/Total upper-voice motion/.test(texts([m5b])), texts([m5b]));
  check('D15 fixture 5.2: ♭9 on a minor 7th still gets the "not a usual colour" heuristic', byId(f5b, 'colour-tones').items.some(it => it.kind === 'heuristic' && /A ♭9 is not a usual colour on Gm7\/F/.test(it.text)), texts([byId(f5b, 'colour-tones')]));
  const f5 = describeAt(fixture, fa, 5, 0);
  check('fixture 5.1 (Gm7/F): 9 (A3) is an extension in the bottom voice; root left out', /Extension 9 \(A3\) in the bottom voice, not named by Gm7\/F/.test(texts([byId(f5, 'colour-tones')])) && /Root \(G\) left out, and the bass does not have it either/.test(texts([byId(f5, 'omissions')])), texts(f5));
  check('fixture 5.1: the 9 a half step under the ♭3 is reported as a rub', byId(f5, 'colour-tones').items.some(it => it.term === 'rub' && /9 \(A3\) sits a half step below the ♭3 \(B♭3\): a minor 2nd rub\./.test(it.text)) && byId(f5, 'colour-tones').see_also.includes('intervals-that-rub'), texts([byId(f5, 'colour-tones')]));
  check('fixture 5.1 motion: "From bar 4" with no event number (bar 4 has one event); gains 2 voices', /^From bar 4, the previous voiced event \(B♭3 over E3\): the voicing gains 2 voices — A3 and D4 have no partner there\.$/.test(byId(f5, 'motion').items[0].text), byId(f5, 'motion').items[0].text);
  const f1 = describeAt(fixture, fa, 1);                           // C over C2: B3 C4
  check('fixture 1 (C triad): added 7, C4 doubles the bass, 3rd not played', /Added tone 7 \(B3\)/.test(texts([byId(f1, 'colour-tones')])) && /C4 doubles the bass C2 two octaves up/.test(texts([byId(f1, 'shape')])) && /The 3rd \(E\) is not played/.test(texts([byId(f1, 'guide-tones')])) && /names no 7th, but one is played/.test(texts([byId(f1, 'guide-tones')])), texts(f1));
  check('fixture 1: the added 7 on a triad gets a heuristic item naming Cmaj7', byId(f1, 'colour-tones').items.some(it => it.kind === 'heuristic' && /C is written as a triad, but a 7th is played: what sounds is Cmaj7\./.test(it.text)), texts([byId(f1, 'colour-tones')]));
  check('fixture 1: B3 a half step under the doubled root is a rub', byId(f1, 'colour-tones').items.some(it => it.term === 'rub' && /7 \(B3\) sits a half step below the root \(C4\)/.test(it.text)), texts([byId(f1, 'colour-tones')]));
  check('fixture 1 has no previous voiced event → no motion section', byId(f1, 'motion') === null);
  const f6 = describeAt(fixture, fa, 6);                           // A7♯11/C♯: G3 D♯4
  check('fixture 6 (A7♯11/C♯): ♯11 named and played, links the ♯11 topic, no heuristic', /Alteration ♯11 \(D♯4\) in the upper voice, named by A7♯11\/C♯ and played/.test(texts([byId(f6, 'colour-tones')])) && byId(f6, 'colour-tones').see_also.includes('sharp-eleven-on-dominants') && !byId(f6, 'colour-tones').items.some(it => it.kind === 'heuristic'), texts([byId(f6, 'colour-tones')]));
  const f11 = describeAt(fixture, fa, 11);                         // G7 over G2: F3 G3 B3 D4
  check('fixture 11 (G7): plain degree list ♭7 R 3 5, root doubled, bass against the voices', /Degrees bottom to top: ♭7 \(F3\), R \(G3\), 3 \(B3\) and 5 \(D4\) — not one/.test(texts([byId(f11, 'shape')])) && /G3 doubles the bass G2 an octave up/.test(texts([byId(f11, 'shape')])) && /Bass moves down a perfect 5th \(D3 → G2\)/.test(texts([byId(f11, 'motion')])), texts(f11));
  check('fixture 11 layout uses learner phrasing for compound intervals', /F3 is a minor 7th above it, G3 an octave, B3 a major 3rd \+ an octave \(a major 10th\) and D4 a perfect 5th \+ an octave \(a 12th\)/.test(texts([byId(f11, 'shape')])), texts([byId(f11, 'shape')]));
  const f12 = describeAt(fixture, fa, 12);                         // hold bar: same voicing as 11
  check('fixture 12 (hold, same voicing): all common tones, bass holds', /Common tones: F3, G3, B3 and D4 held/.test(texts([byId(f12, 'motion')])) && /Bass G2 holds, and so do the upper voices/.test(texts([byId(f12, 'motion')])), texts([byId(f12, 'motion')]));
  const melodyCases = fam.bars.flatMap(b => b.events.map((e, i) => describeAt(fixture, fam, b.bar, i, true))).filter(out => /comes from the melody, not the voicing/.test(texts(out)));
  check('with the melody counted, some fixture event reports a tone that comes from the melody', melodyCases.length > 0);
  const noMelodyCases = fa.bars.flatMap(b => b.events.map((e, i) => describeAt(fixture, fa, b.bar, i, false))).filter(out => /comes from the melody/.test(texts(out)));
  check('…and none does with the melody off', noMelodyCases.length === 0);

  // ── Constructed voicings ─────────────────────────────────────────
  const make = (symbol, bass, voicing, context = {}) => {
    const parsed = parseSymbol(symbol);
    return describeVoicing({ voicing, bass, namedVsPlayed: namedVsPlayed(parsed, [bass, ...voicing]) }, { parsed, prev: null, next: null, includeMelody: false, ...context });
  };
  const shapeText = out => byId(out, 'shape').items[0].text;
  const aForm = make('Cm7', 'C3', ['E♭4', 'G4', 'B♭4', 'D5']);
  check('D5 rootless, 3rd on the bottom: Cm7 over C3, E♭4 G4 B♭4 D5 prints its degrees as played (♭3–5–♭7–9)', byId(aForm, 'shape').items[0].term === 'rootless voicing' && /^Rootless voicing, 3rd on the bottom \(♭3–5–♭7–9\): the 9th sits on top; the root is left to the bass\./.test(shapeText(aForm)) && byId(aForm, 'shape').see_also.includes('rootless-voicings'), shapeText(aForm));
  check('…9 (D5) on top reported as an extension; nothing omitted', /Extension 9 \(D5\) in the top voice/.test(texts([byId(aForm, 'colour-tones')])) && byId(aForm, 'omissions') === null, texts(aForm));
  const bForm = make('Cmaj7', 'C3', ['B3', 'D4', 'E4', 'G4']);
  check('rootless, 7th on the bottom: Cmaj7 over C3, B3 D4 E4 G4 (7–9–3–5)', byId(bForm, 'shape').items[0].term === 'rootless voicing' && /^Rootless voicing, 7th on the bottom \(7–9–3–5\): the 5th sits on top; the root is left to the bass\./.test(shapeText(bForm)), shapeText(bForm));
  const aDom = make('C7', 'C3', ['E3', 'A3', 'B♭3', 'D4']);
  check('D7 / D10 dominant form, 3rd on the bottom: C7 over C3, E3 A3 B♭3 D4 (3–13–♭7–9); root left to the bass', /^Rootless voicing, 3rd on the bottom \(3–13–♭7–9\): the 13th stands in for the 5th; the root is left to the bass\./.test(shapeText(aDom)), shapeText(aDom));
  const bDom = make('C7', 'C3', ['B♭3', 'D4', 'E4', 'A4']);
  check('dominant form, 7th on the bottom: C7 over C3, B♭3 D4 E4 A4 (♭7–9–3–13)', /^Rootless voicing, 7th on the bottom \(♭7–9–3–13\): the 13th stands in for the 5th/.test(shapeText(bDom)), shapeText(bDom));
  check('no A/B in any catalogue name', SHAPE_CATALOGUE.every(c => !/\b[AB]-form\b/.test(c.name)) && !/[AB]-form/.test(CATALOGUE_SUMMARY));
  // §3: the dominant forms match only dominant types (Levine R2/R4 give D-7 3–5–7–9 and 7–9–3–5, never 13 for the 5th).
  const d3 = make('Cm7', 'C3', ['E♭3', 'A3', 'B♭3', 'D4']);
  check('D3 Cm7 with ♭3 13 ♭7 9 is not "dominant version": plain degree list', byId(d3, 'shape').items[0].term === 'shape' && /not one of the catalogue shapes/.test(shapeText(d3)) && !/dominant/.test(shapeText(d3)), shapeText(d3));
  const d4 = make('Cmaj7', 'C3', ['B3', 'D4', 'E4', 'A4']);
  check('D4 Cmaj7 with 7 9 3 13 is not "dominant version" either', byId(d4, 'shape').items[0].term === 'shape' && /not one of the catalogue shapes/.test(shapeText(d4)), shapeText(d4));
  const d6 = make('Cm7♭5', 'C3', ['E♭3', 'G♭3', 'B♭3', 'D4']);
  check('D6 Cm7♭5 rootless, 3rd on the bottom, prints (♭3–♭5–♭7–9)', /^Rootless voicing, 3rd on the bottom \(♭3–♭5–♭7–9\)/.test(shapeText(d6)), shapeText(d6));
  // Levine's major forms (R2, R4) on maj7-family types only.
  const r2 = make('Cmaj7', 'C3', ['E3', 'G3', 'A3', 'D4']);
  check('R2 Cmaj7 over C3, E3 G3 A3 D4: 3rd on the bottom, 6 in place of the major 7th, prints (3–5–6–9), reads as a 6/9 sound', byId(r2, 'shape').items[0].term === 'rootless voicing' && /^Rootless voicing, 3rd on the bottom, 6 in place of the major 7th \(3–5–6–9\): reads as a 6\/9 sound; the root is left to the bass\./.test(shapeText(r2)) && byId(r2, 'shape').see_also.includes('rootless-voicings'), shapeText(r2));
  check('R2 …guide tones: "The 7th (B) is not played: the 6th (A3) stands in its place."', /^The 7th \(B\) is not played: the 6th \(A3\) stands in its place\.$/m.test(texts([byId(r2, 'guide-tones')])), texts([byId(r2, 'guide-tones')]));
  check('R2 …omissions: "left out by design: the 6 stands in for the major 7th", no "plain triad"', /^7th \(B\) left out by design: the 6 stands in for the major 7th, a common way to voice the I chord\.$/m.test(texts([byId(r2, 'omissions')])) && !/plain triad/.test(texts([byId(r2, 'omissions')])), texts([byId(r2, 'omissions')]));
  const r2six9 = make('C6/9', 'C3', ['E3', 'G3', 'A3', 'D4']), r2six = make('C6', 'C3', ['E3', 'G3', 'A3', 'D4']), r2triad = make('C', 'C3', ['E3', 'G3', 'A3', 'D4']);
  check('R2 shape also matches C6/9 and C6 (Levine R2: it is the 6/9 chord), prints (3–5–6–9); not a plain C triad', /6 in place of the major 7th \(3–5–6–9\)/.test(shapeText(r2six9)) && /6 in place of the major 7th \(3–5–6–9\)/.test(shapeText(r2six)) && /not one of the catalogue shapes/.test(shapeText(r2triad)), [shapeText(r2six9), shapeText(r2six), shapeText(r2triad)].join('\n'));
  check('R2 C6/9: "names no 7th: the 6th (A3) stands in its place"; no omissions section', /C6\/9 names no 7th: the 6th \(A3\) stands in its place\./.test(texts([byId(r2six9, 'guide-tones')])) && byId(r2six9, 'omissions') === null, texts(r2six9));
  const no7no6 = make('Cmaj7', 'C3', ['E3', 'G3', 'D4']);
  check('…Cmaj7 with neither 7th nor 6: plain "is not played" and "plain triad" stay', /^The 7th \(B\) is not played\.$/m.test(texts([byId(no7no6, 'guide-tones')])) && /plain triad/.test(texts([byId(no7no6, 'omissions')])), texts(no7no6));
  const r4 = make('Cmaj7', 'C3', ['B3', 'C4', 'E4', 'G4']);
  check('R4 Cmaj7 over C3, B3 C4 E4 G4: major 7th on the bottom, root just above it (7–R–3–5), not rootless', byId(r4, 'shape').items[0].term === 'shape' && /^Major 7th on the bottom, root just above it \(7–R–3–5\): the root is in the voicing, a half step over the 7th, so this is not a rootless voicing\./.test(shapeText(r4)) && byId(r4, 'shape').see_also.includes('rootless-voicings'), shapeText(r4));
  const r2m = make('Cm7', 'C3', ['E♭3', 'G3', 'A3', 'D4']);
  check('…the 6-for-7th form does not match a minor 7th (♭3 5 13 9 on Cm7)', byId(r2m, 'shape').items[0].term === 'shape' && /not one of the catalogue shapes/.test(shapeText(r2m)), shapeText(r2m));
  const r4d = make('C7', 'C3', ['B♭3', 'C4', 'E4', 'G4']);
  check('…nor does the 7–R–3–5 form match a dominant (♭7 R 3 5 on C7)', byId(r4d, 'shape').items[0].term === 'shape' && /not one of the catalogue shapes/.test(shapeText(r4d)), shapeText(r4d));
  // §4: the root clause follows the bass.
  const d8 = make('C7/E', 'E3', ['B♭3', 'D4', 'E4', 'G4']);
  check('D8 C7/E over E3: no "left to the bass"; "the bass has the 3rd instead"; the slash sentence stays', !/left to the bass/.test(shapeText(d8)) && /\(♭7–9–3–5\): the 5th sits on top; the root is not sounded; the bass has the 3rd instead\./.test(shapeText(d8)) && /The bass E3 is the 3rd, the slash bass in C7\/E\./.test(texts([byId(d8, 'shape')])), texts([byId(d8, 'shape')]));
  const d9 = make('C7', 'G2', ['B♭3', 'D4', 'E4', 'G4']);
  check('D9 C7 over G2 (no slash): "the root is not sounded at all — the bass is the 5th"', !/left to the bass/.test(shapeText(d9)) && /the root is not sounded at all — the bass is the 5th\./.test(shapeText(d9)), shapeText(d9));
  const d9i = describeVoicing({ voicing: ['B♭3', 'D4', 'E4', 'G4'], bass: 'G2', bassSource: 'inferred', namedVsPlayed: namedVsPlayed(parseSymbol('C7'), ['G2', 'B♭3', 'D4', 'E4', 'G4']) }, { parsed: parseSymbol('C7'), prev: null, next: null, includeMelody: false });
  check('…with an inferred bass the clause says "the lowest note is the 5th"', /the root is not sounded at all — the lowest note is the 5th\./.test(shapeText(d9i)), shapeText(d9i));
  const d9x = make('C7', 'D♭2', ['B♭3', 'D4', 'E4', 'G4']);
  check('…a bass outside the chord is still labelled (added ♭9): "the bass is the ♭9"', /the root is not sounded at all — the bass is the ♭9\./.test(shapeText(d9x)), shapeText(d9x));
  const shell = make('C7', 'C2', ['E3', 'B♭3']);
  check('C7 shell: E3 B♭3 over C2 → shell, 3rd below the 7th; tritone with the dominant remark; 5th routine', byId(shell, 'shape').items[0].term === 'shell' && /from E3 up to B♭3: a tritone — the interval that gives a dominant its pull/.test(texts([byId(shell, 'guide-tones')])) && /5th \(G\) left out — routine/.test(texts([byId(shell, 'omissions')])), texts(shell));
  const shell2 = make('C7', 'C2', ['B♭3', 'E4']);
  check('C7 shell the other way up: 7th below the 3rd', /^Shell voicing, 7th below the 3rd/.test(byId(shell2, 'shape').items[0].text), byId(shell2, 'shape').items[0].text);
  const triadShell = make('C', 'C2', ['E3', 'B♭3']);
  check('E3 B♭3 over a plain C triad is not called a shell; the ♭7 heuristic names C7', byId(triadShell, 'shape').items[0].term === 'shape' && /C names no 7th, but one is played/.test(texts([byId(triadShell, 'guide-tones')])) && /what sounds is C7\./.test(texts([byId(triadShell, 'colour-tones')])), texts(triadShell));
  const no3 = make('C7', 'C3', ['G3', 'B♭3']);
  check('missing 3rd: C7 over C3, G3 B♭3 → "3rd (E) is not played"; notable omission; no interval item', /The 3rd \(E\) is not played/.test(texts([byId(no3, 'guide-tones')])) && !/Between them/.test(texts([byId(no3, 'guide-tones')])) && /3rd \(E\) left out — notable/.test(texts([byId(no3, 'omissions')])), texts(no3));
  const no7 = make('G7', 'G2', ['B3', 'D4']);
  check('missing 7th on a dominant: "stops sounding like a dominant"', /♭7 \(F\) is not played/.test(texts([byId(no7, 'guide-tones')])) && /Without the 7th, G7 stops sounding like a dominant/.test(texts([byId(no7, 'omissions')])), texts(no7));
  const half = make('Cm7♭5', 'C3', ['E♭3', 'B♭3']);
  check('altered 5th left out is notable (Cm7♭5 without its ♭5)', /♭5 \(G♭\) left out — notable: the altered 5th is part of what Cm7♭5 says/.test(texts([byId(half, 'omissions')])), texts(half));
  check('D12 half-diminished shell: "say Cm7 as readily as Cm7♭5", the ♭5 is part of the identity', byId(half, 'shape').items[0].term === 'shell' && /^Shell voicing, 3rd below the 7th \(♭3–♭7\): the two guide tones over the bass — but E♭ and B♭ over C say Cm7 as readily as Cm7♭5; for a half-diminished chord the ♭5 is part of the identity\./.test(shapeText(half)), shapeText(half));
  check('…and the plain C7 shell keeps "still says the chord"', /the smallest voicing that still says the chord/.test(shapeText(shell)) && !/as readily as/.test(shapeText(shell)), shapeText(shell));
  // §2: guide tones by the named entry's pitch class; sus wording; 2/4/6 colour kind.
  const d1 = make('C7♯9', 'C3', ['B♭3', 'E♭4', 'E4']);
  check('D1 C7♯9 over C3, B♭3 E♭4 E4: the 3rd is E4 (top), not the ♯9; tritone with the dominant remark', /The 3rd \(E4\) is the top voice\./.test(texts([byId(d1, 'guide-tones')])) && /The ♭7 \(B♭3\) is the bottom voice\./.test(texts([byId(d1, 'guide-tones')])) && /from B♭3 up to E4: a tritone — the interval that gives a dominant its pull/.test(texts([byId(d1, 'guide-tones')])), texts([byId(d1, 'guide-tones')]));
  check('D1 …♯9 (E♭4) is an alteration, named and played; no heuristic', /Alteration ♯9 \(E♭4\) in an inner voice, named by C7♯9 and played\./.test(texts([byId(d1, 'colour-tones')])) && !byId(d1, 'colour-tones').items.some(it => it.kind === 'heuristic'), texts([byId(d1, 'colour-tones')]));
  const d1b = make('C7♯9', 'C3', ['E♭3', 'B♭3', 'E4']);
  check('…with the ♯9 below the 3rd the lookup still finds E4', /The 3rd \(E4\) is the top voice\./.test(texts([byId(d1b, 'guide-tones')])) && /from B♭3 up to E4: a tritone/.test(texts([byId(d1b, 'guide-tones')])), texts([byId(d1b, 'guide-tones')]));
  const d2 = make('C7sus4', 'C3', ['F3', 'G3', 'B♭3']);
  check('D2 C7sus4 over C3, F3 G3 B♭3: "names no 3rd: the 4th (F3) stands in its place"; sus-as-V line (Levine S6)', /^C7sus4 names no 3rd: the 4th \(F3\) stands in its place\.$/m.test(texts([byId(d2, 'guide-tones')])) && byId(d2, 'guide-tones').items.some(it => /^A sus chord works as a V chord: it resolves to its I as smoothly as a dominant 7th does\.$/.test(it.text) && it.kind === undefined) && !/Between them/.test(texts([byId(d2, 'guide-tones')])), texts([byId(d2, 'guide-tones')]));
  check('D2 …colour line is "Chord tone 4 (F3)", not "Extension"', /^Chord tone 4 \(F3\) in the bottom voice, named by C7sus4 and played\.$/m.test(texts([byId(d2, 'colour-tones')])) && !/Extension/.test(texts([byId(d2, 'colour-tones')])) && byId(d2, 'colour-tones').items[0].term === 'chord tones', texts([byId(d2, 'colour-tones')]));
  const d2b = make('C7sus4', 'C3', ['G3', 'B♭3']);
  check('…with the 4th missing: plain "names no 3rd", and the omission is notable', /^C7sus4 names no 3rd\.$/m.test(texts([byId(d2b, 'guide-tones')])) && /4 \(F\) left out — notable/.test(texts([byId(d2b, 'omissions')])), texts(d2b));
  const susTriad = make('Csus4', 'C3', ['F3', 'G3']);
  check('…a sus4 triad gets the stand-in line but no V-chord line (no ♭7)', /names no 3rd: the 4th \(F3\) stands in its place/.test(texts([byId(susTriad, 'guide-tones')])) && !/V chord/.test(texts([byId(susTriad, 'guide-tones')])), texts([byId(susTriad, 'guide-tones')]));
  const sixth = make('C6', 'C3', ['E3', 'G3', 'A3']);
  check('…C6: "names no 7th: the 6th (A3) stands in its place"; colour "Chord tone 6 (A3)"', /C6 names no 7th: the 6th \(A3\) stands in its place\./.test(texts([byId(sixth, 'guide-tones')])) && /^Chord tone 6 \(A3\) in the top voice, named by C6 and played\.$/m.test(texts([byId(sixth, 'colour-tones')])), texts(sixth));
  // §6a: ♭13 on a minor-3rd chord is a scale tone, not a dominant sound (Levine H5).
  const d11 = make('Cm7♭5', 'C3', ['E♭3', 'G♭3', 'A♭3', 'B♭3']);
  check('D11 Cm7♭5 with A♭: no "dominant-chord sounds"; a fact line names Locrian and Locrian ♯2', !/dominant-chord sounds/.test(texts([byId(d11, 'colour-tones')])) && byId(d11, 'colour-tones').items.some(it => it.kind === undefined && /^♭13 \(A♭3\) is a scale tone on a half-diminished chord: the ♭6 of both Locrian and Locrian ♯2\. The 9 and 11 are the more usual additions\.$/.test(it.text)), texts([byId(d11, 'colour-tones')]));
  check('D11 …the ♭13 on a minor-3rd type is an "Extension", not an "Alteration" (Levine H5)', /^Extension ♭13 \(A♭3\) in an inner voice, not named by Cm7♭5\.$/m.test(texts([byId(d11, 'colour-tones')])) && byId(d11, 'colour-tones').items[0].term === 'extension' && !/Alteration/.test(texts([byId(d11, 'colour-tones')])), texts([byId(d11, 'colour-tones')]));
  const domb13 = make('C7', 'C3', ['E3', 'A♭3', 'B♭3']);
  check('…an unnamed ♭13 on C7 is still an "Alteration"', /^Alteration ♭13 \(A♭3\) in an inner voice, not named by C7\.$/m.test(texts([byId(domb13, 'colour-tones')])), texts([byId(domb13, 'colour-tones')]));
  const m7b13 = make('Cm7', 'C3', ['E♭3', 'G3', 'A♭3', 'B♭3']);
  check('…♭13 on Cm7: heuristic "♭6 of the chord\'s minor scale", not a dominant sound', !/dominant-chord sounds/.test(texts([byId(m7b13, 'colour-tones')])) && byId(m7b13, 'colour-tones').items.some(it => it.kind === 'heuristic' && /A ♭13 on Cm7 is the ♭6 of the chord's minor scale/.test(it.text)), texts([byId(m7b13, 'colour-tones')]));
  // §6c: an omitted named alteration is notable.
  const d13 = make('C7♭9', 'C3', ['E3', 'B♭3']);
  check('D13 C7♭9 without its ♭9: "♭9 (D♭) left out — notable … without it this is plain C7"', /^♭9 \(D♭\) left out — notable: the ♭9 is the colour C7♭9 asks for; without it this is plain C7\.$/m.test(texts([byId(d13, 'omissions')])), texts([byId(d13, 'omissions')]));
  check('D13 …shell text: "still says a dominant 7th; the ♭9 the symbol asks for is not in it", never "still says the chord"', /^Shell voicing, 3rd below the 7th \(3–♭7\): the two guide tones over the bass and nothing else — the smallest voicing that still says a dominant 7th; the ♭9 the symbol asks for is not in it\./.test(shapeText(d13)) && !/still says the chord/.test(shapeText(d13)), shapeText(d13));
  const altShell = make('C7alt', 'C3', ['E3', 'B♭3']), b9s11 = make('C7♭9♯11', 'C3', ['B♭3', 'E4']), majS11 = make('Cmaj7♯11', 'C3', ['E3', 'B3']);
  check('…C7alt shell lists all four; C7♭9♯11 lists two ("are"); Cmaj7♯11 shell says "a major 7th"', /the ♭9, ♯9, ♯11 and ♭13 the symbol asks for are not in it\./.test(shapeText(altShell)) && /still says a dominant 7th; the ♭9 and ♯11 the symbol asks for are not in it\./.test(shapeText(b9s11)) && /still says a major 7th; the ♯11 the symbol asks for is not in it\./.test(shapeText(majS11)), [shapeText(altShell), shapeText(b9s11), shapeText(majS11)].join('\n'));
  const d14 = make('C9', 'C3', ['E3', 'B♭3']);
  check('D14 C9 without its 9: still routine', /^9 \(D\) left out — routine: a named extension is colour, not structure\./m.test(texts([byId(d14, 'omissions')])), texts([byId(d14, 'omissions')]));
  const majSharp11 = make('Cmaj7♯11', 'C3', ['E3', 'G3', 'B3']);
  check('…an omitted ♯11 on Cmaj7♯11 is notable, worded for a non-dominant', /^♯11 \(F♯\) left out — notable: the ♯11 is the colour Cmaj7♯11 asks for; without it the symbol's alteration is not heard\.$/m.test(texts([byId(majSharp11, 'omissions')])), texts([byId(majSharp11, 'omissions')]));
  const aug = make('Cmaj9♯5', 'C3', ['E3', 'B3', 'D4']);
  check('…and so is a ♯5 (Cmaj9♯5 without its ♯5)', /♯5 \(G♯\) left out — notable/.test(texts([byId(aug, 'omissions')])), texts(aug));
  check('no previous event → sections are shape, guide-tones, colour-tones, omissions (no motion)', shell.map(s => s.id).join(',') === 'shape,guide-tones,colour-tones,omissions', shell.map(s => s.id).join(','));
  const withPrev = make('C7', 'C3', ['E3', 'B♭3'], { prev: { bar: 4, event: 1, bass: 'G2', voicing: ['F3', 'B3'] } });
  const wm = byId(withPrev, 'motion');
  check('constructed prev without events: "bar 4, event 2"; half steps; contrary motion term', /^From bar 4, event 2, the previous voiced event \(F3 B3 over G2\)\. Total upper-voice motion: 2 semitones\./.test(wm.items[0].text) && /F3 → E3 \(down a half step\)/.test(texts([wm])) && wm.items.some(it => it.term === 'contrary motion' && /Bass moves up a perfect 4th \(G2 → C3\), and the upper voices move against it \(contrary motion\)/.test(it.text)), texts([wm]));
  const withPrev1 = make('C7', 'C3', ['E3', 'B♭3'], { prev: { bar: 4, event: 0, events: 1, bass: 'G2', voicing: ['F3', 'B3'] } });
  check('constructed prev in a one-event bar: "From bar 4" only', /^From bar 4, the previous/.test(byId(withPrev1, 'motion').items[0].text), byId(withPrev1, 'motion').items[0].text);
  const similar = make('Cmaj7', 'C3', ['E4', 'G4', 'B4'], { prev: { bar: 1, event: 0, events: 1, bass: 'G2', voicing: ['B3', 'D4', 'F♯4'] } });
  check('similar motion term when bass and voices move the same way', byId(similar, 'motion').items.some(it => it.term === 'similar motion'), texts([byId(similar, 'motion')]));
  const leap = make('Cmaj7', 'C3', ['E4', 'G4', 'B4'], { prev: { bar: 1, event: 0, bass: 'C3', voicing: ['E3', 'G3', 'B3'] } });
  check('octave leaps reported as the largest leap', /Largest leap: .* up an octave \(3 voices leap\)/.test(texts([byId(leap, 'motion')])), texts([byId(leap, 'motion')]));
  const candidate = describeVoicing({ voicing: ['E3', 'B♭3'], midis: [52, 58], namedVsPlayed: namedVsPlayed(parseSymbol('C7'), ['C2', 'E3', 'B♭3']) }, { parsed: parseSymbol('C7'), bass: 'C2', prev: null, next: null, includeMelody: false });
  check('a candidate (no bass of its own) takes the bass from the context', JSON.stringify(candidate) === JSON.stringify(shell));
  check('empty voicing with a bass → one shape item; nothing at all → []', describeVoicing({ voicing: [], bass: 'A♭3' }, { parsed: parseSymbol('A♭') }).length === 1 && /bass A♭3 plays alone/.test(describeVoicing({ voicing: [], bass: 'A♭3' }, {})[0].items[0].text) && describeVoicing({ voicing: [] }, {}).length === 0);
  check('no symbol in effect → shape lists the notes, nothing else', (out => out.length === 1 && /no chord symbol in effect/.test(out[0].items[0].text))(describeVoicing({ voicing: ['E3', 'G3'], bass: 'C3' }, { parsed: null })));
  check('catalogue terms and topics resolve', SHAPE_CATALOGUE.every(c => glossaryLookup(c.term) && resolveSlug(c.topic)));
  check('intervalName: learner phrasing, formal name only for 10ths and 12ths',
    [intervalName(6), intervalName(13), intervalName(-18), intervalName(16), intervalName(19), intervalName(24), intervalName(26)].join(' | ')
      === 'a tritone | a minor 2nd + an octave | a tritone + an octave | a major 3rd + an octave (a major 10th) | a perfect 5th + an octave (a 12th) | two octaves | a major 2nd + two octaves');

  // ── Why it ranked here (fixture bar 5, event 1 candidates) ───────
  const ctx5 = eventContext(fixture, 5, 0);
  const target = fa.bars.find(b => b.bar === 5).events[0].total;
  const ranked = rankCandidates(generateCandidates(ctx5).candidates.map(c => scoreCandidate(c, ctx5)), { target });
  const rows = ranked.slice(0, 12);
  const whyFor = row => describeVoicing(row, { parsed: ctx5.parsed, bass: ctx5.bass, prev: ctx5.neighbours.prev, next: ctx5.neighbours.next, includeMelody: false, rank: row.rank, rows, target, total: ranked.length, originalTotal: target });
  const mid = Math.floor(rows.length / 2), last = rows.length - 1;
  const w1 = byId(whyFor(rows[0]), 'why-ranked'), wLast = byId(whyFor(rows[last]), 'why-ranked'), wMid = byId(whyFor(rows[mid]), 'why-ranked');
  check(`why-ranked: rank 1 explains why it beat #2 and nothing above it (${rows.length} rows)`, w1 && w1.kind === 'heuristic' && /^Ranked #1 of \d+ at target/.test(w1.items[0].text) && w1.items.some(it => /^Above #2 \(/.test(it.text)) && !w1.items.some(it => /^Below #/.test(it.text)), w1 && texts([w1]));
  check('why-ranked: the last shown row explains why it lost to the row above, nothing below', wLast.items.some(it => new RegExp(`^Below #${rows[last - 1].rank} \\(`).test(it.text)) && !wLast.items.some(it => /^Above #/.test(it.text)), texts([wLast]));
  check('why-ranked: a middle row compares both ways and mentions the bar\'s own score as the default target', wMid.items.some(it => new RegExp(`^Below #${rows[mid - 1].rank} \\(`).test(it.text)) && wMid.items.some(it => new RegExp(`^Above #${rows[mid + 1].rank} \\(`).test(it.text)) && /scores .* \(the default target\)/.test(texts([wMid])), texts([wMid]));
  check('why-ranked: every "because" names the first differing rankKey component', rows.slice(1).every((row, i) => {
    const w = byId(whyFor(row), 'why-ranked'); const it = w.items.find(x => /^Below #/.test(x.text));
    const mine = rankKey(row, target), theirs = rankKey(rows[i], target); const k = mine.findIndex((x, j) => x !== theirs[j]);
    return k < 0 ? /a tie on every count/.test(it.text) : new RegExp(['further from the target', 'moves more', 'leaves out more'][k]).test(it.text);
  }));
  const ties = rows.slice(1).filter((row, i) => rankKey(row, target)[0] === rankKey(rows[i], target)[0]);
  check(`why-ranked: a tie on distance mentions the rounding bucket (${ties.length} ties among the rows)`, ties.length > 0 && ties.every(row => new RegExp(`distances round to the nearest ${TARGET_STEP}`).test(texts([byId(whyFor(row), 'why-ranked')]))));
  check('why-ranked: removed candidates get one line', /2 candidates removed by the dominant rule \(no ♭7; ♯11 without the 3rd\) before ranking\./.test(texts([byId(describeVoicing(rows[0], { parsed: ctx5.parsed, bass: ctx5.bass, rank: 1, rows, target, removed: [{ reason: 'no ♭7' }, { reason: '♯11 without the 3rd' }] }), 'why-ranked')])));
  check('why-ranked omitted without rank/rows/target', byId(describeVoicing(rows[0], { parsed: ctx5.parsed, bass: ctx5.bass, rank: 1, rows }), 'why-ranked') === null && byId(describeVoicing(rows[0], { parsed: ctx5.parsed, bass: ctx5.bass, rank: 1, target }), 'why-ranked') === null);

  console.log(`\n─── ${passed}/${total} passed ───\n`);
  return { passed, total };
}
