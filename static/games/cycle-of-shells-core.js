/**
 * cycle-of-shells-core.js
 * =======================
 * Pure core for the Cycle of Shells learning game: ii–V–I shell voicings
 * (root in the bass, 3rd and 7th above, no 5th) around the cycle of
 * fourths, checked chord by chord from MIDI input.
 *
 * No DOM, no audio, no Tone. Standard MIDI internally (C4 = 60).
 *
 * Depends on:
 *   - voicing-analysis.js → parseNote, parseSymbol, namedVsPlayed, voiceMotion
 *   - voicing-explore.js  → spellMidi, DEGREE_CLASS
 *
 * Exports:
 *   buildLap({ mode, startKey })                  → targets, one per chord (see Target below)
 *   describeMove(prevUpper, upper, opts?)         → { kind: 'step'|'replace', voices, summary }
 *   checkAnswer(target, heldMidis, prevPlayedUpper?) → { correct, errors, coaching, message, played }
 *   createSubmitDetector({ minNotes, settleMs, pedalSubmit }) → { noteOn, noteOff, pedal, reset, held }
 *   followUp(prevTarget, target, opts?)           → { prompt, answerPC, answerName, explanation, accepts }
 *   noteLabel(name)                               → "C♭4 (B3)" for awkward spellings, else the name unchanged
 *   phraseRecipe(target, opts?)                   → recipe line for a phrase's first chord, or null
 *   moveRule(prevTarget, target, opts?)           → { kind: 'fall'|'seam'|'replace', ok, text } for every other chord
 *   (checkAnswer, describeMove, followUp, phraseRecipe and moveRule take opts.dual to format note names with noteLabel)
 *   CYCLE, FORMS, PREFERRED_BAND, OUTER_BAND, BASS_OCTAVE, selfTest
 *
 * Decisions (Stage 1 prompt, 2026-10-22):
 *   Cycle      C F B♭ E♭ A♭ D♭ G♭ B E A D G, then C again (G♭ then B, not C♭).
 *              The 36 symbols are hard-coded, spelled per key.
 *   Shell      bass = root; right hand = 3rd and 7th, two forms:
 *              '3-below' (3rd lower) and '7-below' (7th lower). Inside a
 *              phrase the forms alternate: ii X, V other, I X.
 *   Lap modes  'both' (default: each key twice, one phrase per form) and
 *              'single' (one phrase per key).
 *   Bands      preferred E♭3–F4, outer C3–G4 (inclusive). Every placement
 *              decision considers phrases that fit the preferred band first;
 *              only when the required form has none does it consider the
 *              outer band. Then minimal total motion from the previous
 *              chord's right hand (ties → the lower placement).
 *   Placement  "smooth entry, jump at the seam": a lap from C starts
 *              3-below with Dm7 = F3 C4. Entering a new key chooses form
 *              and octave together (all three chords in band, then minimal
 *              motion). A second phrase in the same key takes the other
 *              form. Inside a phrase each chord takes the minimal-motion
 *              placement of its prescribed form; that is always 0 or −1
 *              per voice, so a phrase never jumps or leaves its band.
 *   Bass       root in octave 2 for display; the checker accepts the root
 *              in any octave as long as it is the lowest note.
 *   Checker    form-strict, octave-flexible. Error precedence:
 *              TOO_FEW_NOTES, WRONG_ROOT, ROOT_NOT_LOWEST, WRONG_QUALITY,
 *              MISSING_GUIDE_TONE, EXTRA_NOTE, WRONG_FORM, TOO_WIDE. The
 *              omitted 5th is never an error. Coaching (COMMON_TONE_MOVED)
 *              never makes an answer wrong.
 *   Detector   lift to submit: nothing commits until every key is up. The
 *              answer is the most recent held set that persisted settleMs
 *              (150) before the full release; if none did, the set right
 *              after the last note-on. Optional pedal submit: a sustain
 *              press commits the held set at once; with it on, full
 *              releases never submit (they only re-arm the pedal).
 *              Sustain's own meaning is ignored.
 *
 * Target:
 *   { index, key, keyDisplay, phrase, formSlot (1|2), role ('ii'|'V'|'I'),
 *     symbol, display, form, band ('preferred'|'outer'),
 *     bass: { name, midi, degree:'R' },
 *     upper: [{ name, midi, degree }, { name, midi, degree }]   // lower, higher
 *     degrees: [lowerDegree, higherDegree] }
 *
 * Self-test (from the repo root):
 *   node --input-type=module -e "import('./static/games/cycle-of-shells-core.js').then(m => m.selfTest())"
 */

import { parseNote, parseSymbol, namedVsPlayed, voiceMotion } from '../shared/voicing-analysis.js';
import { spellMidi, DEGREE_CLASS } from '../shared/voicing-explore.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

/** The cycle, in order, with each key's ii–V–I spelled per key (ASCII accidentals; parseSymbol spells the displays). */
const CYCLE = [
  { key: 'C',  symbols: ['Dm7',  'G7',  'Cmaj7']  },
  { key: 'F',  symbols: ['Gm7',  'C7',  'Fmaj7']  },
  { key: 'Bb', symbols: ['Cm7',  'F7',  'Bbmaj7'] },
  { key: 'Eb', symbols: ['Fm7',  'Bb7', 'Ebmaj7'] },
  { key: 'Ab', symbols: ['Bbm7', 'Eb7', 'Abmaj7'] },
  { key: 'Db', symbols: ['Ebm7', 'Ab7', 'Dbmaj7'] },
  { key: 'Gb', symbols: ['Abm7', 'Db7', 'Gbmaj7'] },
  { key: 'B',  symbols: ['C#m7', 'F#7', 'Bmaj7']  },
  { key: 'E',  symbols: ['F#m7', 'B7',  'Emaj7']  },
  { key: 'A',  symbols: ['Bm7',  'E7',  'Amaj7']  },
  { key: 'D',  symbols: ['Em7',  'A7',  'Dmaj7']  },
  { key: 'G',  symbols: ['Am7',  'D7',  'Gmaj7']  },
];
const ROLES = ['ii', 'V', 'I'];
const FORMS = ['3-below', '7-below'];
const PREFERRED_BAND = { name: 'preferred', low: 51, high: 65 };   // E♭3 … F4
const OUTER_BAND     = { name: 'outer',     low: 48, high: 67 };   // C3 … G4
const BANDS = [PREFERRED_BAND, OUTER_BAND];
const BASS_OCTAVE = 2;
/** Reference right hand for a lap's first phrase (Dm7 3-below = F3 C4): the C lap starts there with motion 0. */
const LAP_START_REFERENCE = [53, 60];
const PLACE_LOW = 24, PLACE_HIGH = 96;   // search window for octave placements

const DEGREE_WORDS = { R: 'root', '3': '3rd', '5': '5th', '7': '7th', '9': '9th', '11': '11th', '13': '13th', '6': '6th', '2': '2nd', '4': '4th' };

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

const pcOf = m => ((m % 12) + 12) % 12;
const other = form => (form === '3-below' ? '7-below' : '3-below');
const sortNum = a => a.slice().sort((x, y) => x - y);
/** "3rd", "♭7", "root" … for a namedVsPlayed degree label. */
function degreeWord(degree) { return DEGREE_WORDS[degree] || degree; }
const capitalize = str => (str ? str[0].toUpperCase() + str.slice(1) : str);

const FLAT_NAMES  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
/**
 * Display label for a note name: awkward spellings (C♭, F♭, E♯, B♯, any
 * double accidental) become "C♭ (B)" — the correct spelling first, the key
 * actually pressed in brackets, octaves kept when given ("C♭4 (B3)").
 * Ordinary names come back unchanged.
 */
function noteLabel(name) {
  const p = parseNote(name);
  if (!p || !p.letter || p.acc === 0) return String(name);
  const awkward = Math.abs(p.acc) >= 2 || WHITE_PCS.has(p.pc);
  if (!awkward) return String(name);
  const pressed = WHITE_PCS.has(p.pc) ? FLAT_NAMES[p.pc] : (p.acc < 0 ? FLAT_NAMES : SHARP_NAMES)[p.pc];
  const octave = p.midi != null ? String(Math.floor(p.midi / 12) - 1) : '';
  return `${p.name}${p.octave != null ? p.octave : ''} (${pressed}${octave})`;
}
/** Name formatter for the dual-label option. */
const labeller = opts => (opts && opts.dual ? noteLabel : (n => n));
/** Spelled name with octave for a midi against a chord (chord-relative letter, octave by the letter). */
function spellAgainst(parsed, midi) {
  const nvp = namedVsPlayed(parsed, [midi]);
  const e = [...nvp.present, ...nvp.added].find(x => x.pc === pcOf(midi));
  return { name: spellMidi(midi, e ? e.name : parseNote(midi).name), pcName: e ? e.name : parseNote(midi).name, degree: e ? e.degree : '?' };
}

/**
 * The shell's tones for a symbol: root, 3rd and 7th as { pc, name, degree }
 * (chord-relative spelling), plus the parsed symbol.
 */
function shellTones(symbol) {
  const parsed = typeof symbol === 'string' ? parseSymbol(symbol) : symbol;
  if (!parsed) return null;
  const iv3 = parsed.intervals.find(i => i === 3 || i === 4);
  const iv7 = parsed.intervals.find(i => i === 10 || i === 11);
  if (iv3 == null || iv7 == null) return null;
  const nvp = namedVsPlayed(parsed, [60 + parsed.rootPC, 60 + (parsed.rootPC + iv3) % 12, 60 + (parsed.rootPC + iv7) % 12]);
  const byPC = new Map(nvp.present.map(e => [e.pc, e]));
  const tone = pc => ({ pc, name: byPC.get(pc).name, degree: byPC.get(pc).degree });
  return { parsed, root: tone(parsed.rootPC), third: tone((parsed.rootPC + iv3) % 12), seventh: tone((parsed.rootPC + iv7) % 12) };
}

/** Lower and higher tone of a form. */
function formTones(tones, form) {
  return form === '3-below' ? [tones.third, tones.seventh] : [tones.seventh, tones.third];
}

/** Every octave placement [lower, higher] of a form within the search window (higher within an octave above lower). */
function placements(tones, form) {
  const [lo, hi] = formTones(tones, form);
  const gap = (hi.pc - lo.pc + 12) % 12;
  const out = [];
  for (let m = PLACE_LOW; m <= PLACE_HIGH; m++) if (pcOf(m) === lo.pc) out.push([m, m + gap]);
  return out;
}

const motion = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const inBand = (band, v) => v[0] >= band.low && v[1] <= band.high;

/** Minimal-motion placement of a form from a previous right hand (ties → the lower placement). */
function nearestPlacement(tones, form, prev) {
  let best = null;
  for (const v of placements(tones, form)) {
    const m = motion(v, prev);
    if (!best || m < best.m) best = { v, m };
  }
  return best.v;
}

/** The three right hands of a phrase from the ii's placement: V takes the other form, I the phrase's form, each by minimal motion. */
function phraseFrom(keyTones, form, start) {
  const ii = start;
  const V = nearestPlacement(keyTones[1], other(form), ii);
  const I = nearestPlacement(keyTones[2], form, V);
  return [ii, V, I];
}

/**
 * Place a phrase: for the allowed forms, the preferred band first, then the
 * outer band; among phrases fitting a band, minimal motion of the ii from
 * `prev`; ties → the lower placement, then the earlier form in FORMS.
 * @returns {{ form, band, hands:[number[],number[],number[]] }|null}
 */
function placePhrase(keyTones, forms, prev) {
  for (const band of BANDS) {
    let best = null;
    for (const form of forms) {
      for (const start of placements(keyTones[0], form)) {
        const hands = phraseFrom(keyTones, form, start);
        if (!hands.every(h => inBand(band, h))) continue;
        const m = motion(start, prev);
        if (!best || m < best.m || (m === best.m && start[0] < best.hands[0][0])) best = { form, band: band.name, hands, m };
      }
    }
    if (best) return { form: best.form, band: best.band, hands: best.hands };
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════
// LAP
// ════════════════════════════════════════════════════════════════════

/**
 * Build one lap of targets.
 * @param {{ mode?: 'both'|'single', startKey?: string }} [opts]
 * @returns {Array<Target>}
 */
function buildLap({ mode = 'both', startKey = 'C' } = {}) {
  if (mode !== 'both' && mode !== 'single') throw new Error(`cycle-of-shells: unknown mode ${mode}`);
  const startIdx = CYCLE.findIndex(k => k.key === startKey || parseNote(k.key).pc === (parseNote(startKey) || {}).pc);
  if (startIdx < 0) throw new Error(`cycle-of-shells: unknown start key ${startKey}`);
  const order = [...CYCLE.slice(startIdx), ...CYCLE.slice(0, startIdx)];
  const targets = [];
  let prev = LAP_START_REFERENCE;
  let phraseNo = 0;
  for (const { key, symbols } of order) {
    const keyTones = symbols.map(shellTones);
    if (keyTones.some(t => !t)) throw new Error(`cycle-of-shells: cannot parse the ${key} phrase`);
    const slots = mode === 'both' ? [1, 2] : [1];
    let firstForm = null;
    for (const slot of slots) {
      const forms = slot === 1 ? FORMS : [other(firstForm)];
      const placed = placePhrase(keyTones, forms, prev);
      if (!placed) throw new Error(`cycle-of-shells: no in-band placement for the ${key} phrase (${forms.join('/')})`);
      if (slot === 1) firstForm = placed.form;
      placed.hands.forEach((hand, i) => {
        const tones = keyTones[i];
        const form = i === 1 ? other(placed.form) : placed.form;
        const [lo, hi] = formTones(tones, form);
        const bassMidi = (BASS_OCTAVE + 1) * 12 + tones.parsed.rootPC;
        targets.push({
          index: targets.length, key, keyDisplay: parseNote(key).name, phrase: phraseNo, formSlot: slot, role: ROLES[i],
          symbol: symbols[i], display: tones.parsed.display, form, band: placed.band,
          bass: { name: spellMidi(bassMidi, tones.root.name), midi: bassMidi, degree: 'R' },
          upper: [
            { name: spellMidi(hand[0], lo.name), midi: hand[0], degree: lo.degree },
            { name: spellMidi(hand[1], hi.name), midi: hand[1], degree: hi.degree },
          ],
          degrees: [lo.degree, hi.degree],
        });
      });
      prev = placed.hands[2];
      phraseNo++;
    }
  }
  return targets;
}

// ════════════════════════════════════════════════════════════════════
// MOVES
// ════════════════════════════════════════════════════════════════════

const midisOf = list => (list || []).map(n => (n && typeof n === 'object' ? n.midi : parseNote(n)?.midi)).filter(m => Number.isFinite(m));

function deltaLabel(delta) {
  if (delta === 0) return 'stays';
  const dir = delta > 0 ? 'up' : 'down';
  const n = Math.abs(delta);
  if (n === 1) return `${dir} a half step`;
  if (n === 2) return `${dir} a whole step`;
  if (n === 12) return `${dir} an octave`;
  if (n % 12 === 0) return `${dir} ${n / 12} octaves`;
  return `${dir} ${n} half steps`;
}

/**
 * Describe the right-hand move between two chords.
 * @param {Array<number|string|{midi}>} prevUpper
 * @param {Array<number|string|{midi, degree?}>} upper
 * @param {{ form?: string, newPhrase?: boolean }} [opts]  the new chord's form / whether it starts a phrase (wording only)
 * @returns {{ kind:'step'|'replace', voices:Array<{from,to,delta,label}>, total:number, summary:string }}
 *   'step': every |delta| ≤ 2, voices paired low-to-high (voiceMotion).
 *   'replace': a re-placement; voices paired by pitch class where possible
 *   (an octave shift reads as such), summary pitch-class-aware.
 */
function describeMove(prevUpper, upper, opts = {}) {
  const a = sortNum(midisOf(prevUpper)), b = sortNum(midisOf(upper));
  const vm = voiceMotion(a, b);
  if (!vm) return { kind: 'step', voices: [], total: 0, summary: '' };
  if (vm.perVoice.every(v => Math.abs(v.delta) <= 2)) {
    const voices = vm.perVoice.map(v => ({ ...v, label: deltaLabel(v.delta) }));
    const nl = labeller(opts);
    const summary = voices.map(v => `${nl(parseNote(v.from).name + parseNote(v.from).octave)} ${v.label}`).join(', ');
    return { kind: 'step', voices, total: vm.total, summary };
  }
  // Re-placement: pair by pitch class first, leftovers low-to-high.
  const voices = [];
  const usedB = new Set();
  const leftoverA = [];
  for (const from of a) {
    const j = b.findIndex((m, idx) => !usedB.has(idx) && pcOf(m) === pcOf(from));
    if (j >= 0) { usedB.add(j); voices.push({ from, to: b[j], delta: b[j] - from }); } else leftoverA.push(from);
  }
  const leftoverB = b.filter((_, idx) => !usedB.has(idx));
  leftoverA.forEach((from, i) => { if (leftoverB[i] != null) voices.push({ from, to: leftoverB[i], delta: leftoverB[i] - from }); });
  voices.sort((x, y) => x.from - y.from);
  voices.forEach(v => { v.label = deltaLabel(v.delta); });
  const samePCs = a.length === b.length && a.every(m => b.some(n => pcOf(n) === pcOf(m)));
  const lowerDeg = Array.isArray(upper) && upper[0] && typeof upper[0] === 'object' && upper[0].degree
    ? degreeWord(DEGREE_CLASS[upper[0].degree] === '7' ? '7' : DEGREE_CLASS[upper[0].degree] === '3' ? '3' : upper[0].degree)
    : null;
  let summary;
  const nl = labeller(opts);
  if (samePCs) summary = `same notes, ${lowerDeg || nl(parseNote(b[0]).name)} now on the bottom`;
  else if (opts.form) summary = `${opts.newPhrase === false ? 'new placement' : 'new phrase'}: start ${opts.form}`;
  else summary = `new placement: ${b.map(m => nl(parseNote(m).name + parseNote(m).octave)).join(' ')}`;
  return { kind: 'replace', voices, total: vm.total, summary };
}

// ════════════════════════════════════════════════════════════════════
// CHECKER
// ════════════════════════════════════════════════════════════════════

const QUALITY_WORDS = {
  '3:minor': 'makes it major', '3:min7': 'makes it major',
  '♭3:major': 'makes it minor', '♭3:maj7': 'makes it minor', '♭3:dom7': 'makes it minor',
  '7:dom7': 'makes it a major 7th', '7:min7': 'makes it a minor-major 7th',
  '♭7:maj7': 'makes it a dominant 7th',
};

/**
 * Check a held set against a target. Form-strict, octave-flexible.
 * @param {Target} target
 * @param {number[]} heldMidis
 * @param {Array<number|{midi}>} [prevPlayedUpper]  the right hand the player held on the previous chord (coaching)
 * @returns {{ correct:boolean, errors:Array<{code,message,…}>, coaching:Array<{code,message,…}>, message:string, played:{ bass, upper } }}
 */
function checkAnswer(target, heldMidis, prevPlayedUpper = null, opts = {}) {
  const nl = labeller(opts);
  const tones = shellTones(target.symbol);
  const parsed = tones.parsed;
  const held = [...new Set(midisOf(heldMidis))].sort((a, b) => a - b);
  const errors = [], coaching = [];
  const sp = m => spellAgainst(parsed, m);
  const display = parsed.display;
  const lowerTone = formTones(tones, target.form)[0], higherTone = formTones(tones, target.form)[1];

  if (held.length < 3) errors.push({ code: 'TOO_FEW_NOTES', count: held.length, message: held.length === 0 ? `Nothing played — ${display} needs root, ${degreeWord(tones.third.degree)} and ${degreeWord(tones.seventh.degree)}.` : `Only ${held.length} note${held.length === 1 ? '' : 's'} — a shell is three: root, ${degreeWord(tones.third.degree)} and ${degreeWord(tones.seventh.degree)}.` });

  const bass = held.length ? held[0] : null;
  const upper = held.slice(1);
  const rootPlayed = held.some(m => pcOf(m) === parsed.rootPC);
  if (bass != null && pcOf(bass) !== parsed.rootPC) {
    const b = sp(bass);
    if (!rootPlayed) errors.push({ code: 'WRONG_ROOT', midi: bass, name: b.name, degree: b.degree, message: `${nl(b.pcName)} is the ${degreeWord(b.degree)} of ${display}, not the root — the bass should be ${nl(tones.root.name)}.` });
    else errors.push({ code: 'ROOT_NOT_LOWEST', midi: bass, name: b.name, degree: b.degree, message: `${nl(tones.root.name)} is there but ${nl(b.pcName)} is underneath it — the root goes on the bottom.` });
  }

  const nvp = namedVsPlayed(parsed, held);
  const omittedClass = new Set(nvp.omitted.map(e => DEGREE_CLASS[e.degree]));
  // Wrong quality: a played 3rd/7th of the other quality while the named one is missing.
  for (const a of nvp.added) {
    const cls = DEGREE_CLASS[a.degree];
    if ((cls === '3' || cls === '7') && omittedClass.has(cls)) {
      const need = cls === '3' ? tones.third : tones.seventh;
      const how = QUALITY_WORDS[`${a.degree}:${parsed.type}`] || `is the wrong ${degreeWord(cls)}`;
      errors.push({ code: 'WRONG_QUALITY', pc: a.pc, name: a.name, degree: a.degree, needs: need.name, message: `${nl(a.name)} ${how} — ${display} needs ${nl(need.name)}.` });
    }
  }
  // Missing guide tone (the omitted 5th is never an error).
  for (const t of [tones.third, tones.seventh]) {
    if (!upper.some(m => pcOf(m) === t.pc)) {
      if (errors.some(e => e.code === 'WRONG_QUALITY' && DEGREE_CLASS[e.degree] === DEGREE_CLASS[t.degree])) continue;
      errors.push({ code: 'MISSING_GUIDE_TONE', pc: t.pc, name: t.name, degree: t.degree, message: `Missing the ${degreeWord(t.degree)} — ${display} needs ${nl(t.name)} above the bass.` });
    }
  }
  // Extra notes: anything above the bass that is not the 3rd or 7th (root doublings and 5ths included).
  const extras = upper.filter(m => pcOf(m) !== tones.third.pc && pcOf(m) !== tones.seventh.pc)
    .filter(m => !errors.some(e => e.code === 'WRONG_QUALITY' && e.pc === pcOf(m)));
  const guideCount = upper.filter(m => pcOf(m) === tones.third.pc || pcOf(m) === tones.seventh.pc).length;
  if (extras.length || guideCount > 2) {
    const dup = guideCount > 2 ? upper.filter((m, i) => upper.findIndex(n => pcOf(n) === pcOf(m)) !== i) : [];
    const list = [...extras, ...dup].map(sp);
    const what = list.map(e => e.degree === 'R' ? `${nl(e.pcName)} doubles the root` : e.degree === '5' ? `${nl(e.pcName)} is the 5th` : `${nl(e.pcName)} is the ${degreeWord(e.degree)}`).join(', ');
    errors.push({ code: 'EXTRA_NOTE', notes: list, message: `${what} — leave it out; the shell is just root, ${degreeWord(tones.third.degree)} and ${degreeWord(tones.seventh.degree)}.` });
  }
  // Form and width: only meaningful once the right hand is exactly the two guide tones.
  if (upper.length === 2 && guideCount === 2 && !extras.length) {
    const [lo, hi] = upper;
    if (pcOf(lo) !== lowerTone.pc) {
      errors.push({ code: 'WRONG_FORM', form: target.form, message: `Right notes, wrong order — ${target.form} puts the ${degreeWord(lowerTone.degree)} (${nl(lowerTone.name)}) under the ${degreeWord(higherTone.degree)} (${nl(higherTone.name)}).` });
    }
    if (hi - lo >= 12) {
      errors.push({ code: 'TOO_WIDE', span: hi - lo, message: `${nl(sp(lo).pcName)} and ${nl(sp(hi).pcName)} are ${hi - lo === 12 ? 'an octave' : 'more than an octave'} apart — keep the ${degreeWord(tones.third.degree)} and ${degreeWord(tones.seventh.degree)} within an octave.` });
    }
  }

  const correct = errors.length === 0;
  if (correct && prevPlayedUpper) {
    const prevMidis = midisOf(prevPlayedUpper);
    for (const t of [tones.third, tones.seventh]) {
      const was = prevMidis.find(m => pcOf(m) === t.pc);
      const now = upper.find(m => pcOf(m) === t.pc);
      if (was != null && now != null && was !== now) {
        coaching.push({ code: 'COMMON_TONE_MOVED', pc: t.pc, name: t.name, from: was, to: now, message: `Right shell. ${nl(t.name)} could have stayed — it's in both chords.` });
      }
    }
  }
  const played = { bass: bass != null ? sp(bass).name : null, upper: upper.map(m => sp(m).name) };
  const message = errors.length ? errors[0].message : coaching.length ? coaching[0].message
    : `${display} ✓ ${played.upper.map(nl).join(' ')} over ${nl(played.bass)}.`;
  return { correct, errors, coaching, message, played };
}

// ════════════════════════════════════════════════════════════════════
// SUBMIT DETECTOR
// ════════════════════════════════════════════════════════════════════

/**
 * Lift-to-submit detector with an optional pedal submit. Feed it note-ons,
 * note-offs and (optionally) sustain-pedal values with their times; it
 * returns a submission when one commits, else null. No timers: time is
 * read from the `t` arguments (ms, any monotonic clock); calls without a
 * time never settle and fall back to the last-note-on rule.
 *
 * Lift: the noteOff that empties the held set submits the most recent held
 * set that persisted ≥ settleMs before the release (a stray brush lifted
 * while the chord is held is ignored; a wrong note deliberately lifted
 * while the rest is held ≥ settleMs is excluded); if no set persisted that
 * long, the set right after the last note-on.
 * Pedal (pedalSubmit): a press (value crossing from < 64 to ≥ 64) with keys
 * held submits the held set immediately and disarms until every key is up;
 * presses with nothing held and releases do nothing. With pedalSubmit on,
 * a full release never submits — it only re-arms the pedal. With it off,
 * the lift rule above is the only way to submit.
 *
 * @param {{ minNotes?: number, settleMs?: number, pedalSubmit?: boolean }} [opts]
 * @returns {{ noteOn(midi, t?): null, noteOff(midi, t?): Submission|null, pedal(value, t?): Submission|null, reset(): void, held(): number[] }}
 *   Submission: { midis (sorted), count, short (count < minNotes), t, source: 'lift' | 'pedal', settled: boolean }
 */
function createSubmitDetector({ minNotes = 3, settleMs = 150, pedalSubmit = false } = {}) {
  const held = new Set();
  let snapshot = null;      // set right after the last note-on (fallback)
  let current = null;       // { midis, since }: the held set now and when it began
  let settled = null;       // most recent non-empty set that persisted ≥ settleMs
  let armed = true;         // false after a pedal submit until every key is up
  let pedalValue = 0;
  const hasTime = t => typeof t === 'number' && Number.isFinite(t);
  const submission = (midis, t, source, wasSettled) => ({ midis, count: midis.length, short: midis.length < minNotes, t, source, settled: wasSettled });
  /** Before the held set changes at time t: promote the current set if it has persisted long enough. */
  const closeSpan = t => {
    if (current && current.midis.length && hasTime(t) && hasTime(current.since) && t - current.since >= settleMs) settled = current.midis;
    current = null;
  };
  const openSpan = t => { current = { midis: sortNum([...held]), since: hasTime(t) ? t : null }; };
  const clear = () => { snapshot = null; current = null; settled = null; };
  return {
    noteOn(midi, t = null) {
      if (held.has(midi)) return null;        // duplicate channel / repeated note-on
      closeSpan(t);
      held.add(midi);
      snapshot = sortNum([...held]);
      openSpan(t);
      return null;
    },
    noteOff(midi, t = null) {
      if (!held.has(midi)) return null;
      closeSpan(t);
      held.delete(midi);
      if (held.size > 0) { openSpan(t); return null; }
      // Full release.
      const answer = settled || snapshot;
      const wasSettled = !!settled;
      const wasArmed = armed;
      armed = true;
      clear();
      if (pedalSubmit || !wasArmed || !answer) return null;
      return submission(answer, t, 'lift', wasSettled);
    },
    pedal(value, t = null) {
      const prev = pedalValue;
      pedalValue = value;
      if (!pedalSubmit) return null;
      const press = prev < 64 && value >= 64;
      if (!press || held.size === 0 || !armed) return null;
      armed = false;
      const midis = sortNum([...held]);
      clear();
      return submission(midis, t, 'pedal', true);
    },
    reset() { held.clear(); clear(); armed = true; pedalValue = 0; },
    held() { return sortNum([...held]); },
  };
}

// ════════════════════════════════════════════════════════════════════
// FOLLOW-UP
// ════════════════════════════════════════════════════════════════════

/**
 * "Which note moved?" for the step between two targets (built for V→I).
 * The answer is the previous chord's guide tone whose pitch class is not in
 * the new chord; answered by playing that pitch class in any octave.
 * @returns {{ prompt, answerPC, answerName, answerDegree, movedTo:{name,degree}, held:{name,degree}|null, explanation, accepts(midi):boolean }}
 */
function followUp(prevTarget, target, opts = {}) {
  const nl = labeller(opts);
  const p = shellTones(prevTarget.symbol), c = shellTones(target.symbol);
  const prevGuides = [p.third, p.seventh], curGuides = [c.third, c.seventh];
  const moved = prevGuides.find(t => !curGuides.some(u => u.pc === t.pc)) || null;
  const held = prevGuides.find(t => curGuides.some(u => u.pc === t.pc)) || null;
  const heldNow = held ? curGuides.find(u => u.pc === held.pc) : null;
  const movedTo = moved ? curGuides.find(u => !prevGuides.some(t => t.pc === u.pc)) : null;
  const semis = moved && movedTo ? ((movedTo.pc - moved.pc + 6 + 12) % 12) - 6 : 0;
  const explanation = moved
    ? `${nl(moved.name)}, the ${degreeWord(moved.degree)} of ${p.parsed.display}, ${semis < 0 ? 'falls' : 'rises'} ${Math.abs(semis) === 1 ? 'a half step' : Math.abs(semis) + ' half steps'} to ${nl(movedTo.name)}, the ${degreeWord(movedTo.degree)} of ${c.parsed.display}.`
      + (held ? ` ${nl(held.name)} holds — it's the ${degreeWord(held.degree)} of ${p.parsed.display} and the ${degreeWord(heldNow.degree)} of ${c.parsed.display}.` : '')
    : `Both guide tones hold from ${p.parsed.display} to ${c.parsed.display}.`;
  return {
    prompt: `Which note moved from ${p.parsed.display} to ${c.parsed.display}?`,
    answerPC: moved ? moved.pc : null, answerName: moved ? moved.name : null, answerDegree: moved ? moved.degree : null,
    movedTo: movedTo ? { name: movedTo.name, degree: movedTo.degree } : null,
    held: held ? { name: held.name, degree: held.degree } : null,
    explanation,
    accepts: midi => moved != null && pcOf(midi) === moved.pc,
  };
}

// ════════════════════════════════════════════════════════════════════
// RECIPE AND RULE LINES
// ════════════════════════════════════════════════════════════════════

const FORM_WORD = { '3-below': '3rd below', '7-below': '7th below' };

/**
 * Recipe for a phrase's first chord (the ii), or null for any other chord.
 * The ii's guide tones are the home key's 1 and 4 (its 7th and 3rd), and its
 * root is a whole step above home. A second phrase in the same key ('both'
 * mode) is the same notes the other way up.
 * @returns {{ kind:'home'|'again', text, one?, four?, root? }|null}
 */
function phraseRecipe(target, opts = {}) {
  if (!target || target.role !== 'ii') return null;
  const nl = labeller(opts);
  if (target.formSlot === 2) return { kind: 'again', text: `Again in ${target.keyDisplay}, ${FORM_WORD[target.form]}: same notes, the other way up` };
  const tones = shellTones(target.symbol);
  return {
    kind: 'home',
    text: `Home ${target.keyDisplay}: start on ${nl(tones.seventh.name)} and ${nl(tones.third.name)} (1 and 4) · root ${nl(tones.root.name)}`,
    one: tones.seventh.name, four: tones.third.name, root: tones.root.name,
  };
}

/**
 * The voice-leading rule from one target to the next, as a line of text.
 *   inside a phrase   'fall'    the previous chord's 7th falls a half step to the new 3rd; the other note holds
 *   between keys      'seam'    the I's 3rd rises a half step (to the new 7th), its 7th falls a half step (to the new 3rd)
 *   same key, new phrase ('both' mode)  'replace'  describeMove's summary
 * `ok` reports whether the rule actually holds for the pair (by pitch class).
 * @returns {{ kind:'fall'|'seam'|'replace', ok:boolean, text:string }}
 */
function moveRule(prevTarget, target, opts = {}) {
  const nl = labeller(opts);
  const p = shellTones(prevTarget.symbol), c = shellTones(target.symbol);
  if (prevTarget.phrase === target.phrase) {
    const ok = pcOf(p.seventh.pc - 1) === c.third.pc && p.third.pc === c.seventh.pc;
    return { kind: 'fall', ok, text: `The 7th falls: ${nl(p.seventh.name)} → ${nl(c.third.name)} · ${nl(c.seventh.name)} stays` };
  }
  if (prevTarget.key !== target.key) {
    const ok = pcOf(p.third.pc + 1) === c.seventh.pc && pcOf(p.seventh.pc - 1) === c.third.pc;
    return { kind: 'seam', ok, text: `3rd up, 7th down: ${nl(p.third.name)} → ${nl(c.seventh.name)} · ${nl(p.seventh.name)} → ${nl(c.third.name)}` };
  }
  const move = describeMove(prevTarget.upper, target.upper, { form: FORM_WORD[target.form], dual: !!opts.dual });
  return { kind: 'replace', ok: true, text: capitalize(move.summary) };
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export {
  buildLap, describeMove, checkAnswer, createSubmitDetector, followUp, shellTones,
  noteLabel, phraseRecipe, moveRule,
  CYCLE, FORMS, PREFERRED_BAND, OUTER_BAND, BASS_OCTAVE, selfTest,
};

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/games/cycle-of-shells-core.js').then(m => m.selfTest())"
//

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const rh = t => `${t.display} ${t.upper[0].name} ${t.upper[1].name}`;
  const n = s => parseNote(s).midi;

  console.log('\n─── cycle-of-shells-core.js self-test ───\n');

  // ── Symbols and spelling ─────────────────────────────────────────
  const all = CYCLE.flatMap(k => k.symbols);
  assert('36 symbols, all parse', [all.length, all.every(s => parseSymbol(s) && shellTones(s))], [36, true]);
  const single = buildLap({ mode: 'single', startKey: 'C' });
  const both = buildLap({ mode: 'both', startKey: 'C' });
  const noDouble = ts => ts.every(t => ![t.bass.name, ...t.upper.map(u => u.name)].some(nm => /♯♯|♭♭/.test(nm)));
  assert('no double accidentals in any target (single + both)', [noDouble(single), noDouble(both)], [true, true]);
  const byKey = (ts, key) => ts.filter(t => t.key === key && t.formSlot === 1).map(t => `${t.display} ${t.bass.name} ${t.upper[0].name} ${t.upper[1].name}`);
  assert('G♭ key spells A♭m7 C♭, D♭7 C♭, G♭maj7 B♭', byKey(single, 'Gb'), ['A♭m7 A♭2 G♭3 C♭4', 'D♭7 D♭2 F3 C♭4', 'G♭maj7 G♭2 F3 B♭3']);
  assert('B key spells C♯m7, F♯7 A♯, Bmaj7 D♯ A♯', byKey(single, 'B'), ['C♯m7 C♯2 E3 B3', 'F♯7 F♯2 E3 A♯3', 'Bmaj7 B2 D♯3 A♯3']);
  assert('every target spells with the key\'s accidentals (no ♯ in flat keys, no ♭ in sharp keys)',
    both.every(t => { const flat = /b/.test(t.key) || t.key === 'F'; const sharp = ['B', 'E', 'A', 'D', 'G'].includes(t.key); const names = [t.bass.name, ...t.upper.map(u => u.name)].join(''); return !(flat && /♯/.test(names)) && !(sharp && /♭/.test(names)); }), true);
  assert('degrees: ii ♭3/♭7, V 3/♭7, I 3/7 (in form order)', single.slice(0, 3).map(t => t.degrees), [['♭3', '♭7'], ['♭7', '3'], ['3', '7']]);
  assert('bass is the root in octave 2', single.slice(0, 3).map(t => `${t.bass.name}/${t.bass.midi}`), ['D2/38', 'G2/43', 'C2/36']);

  // ── 'single' lap ─────────────────────────────────────────────────
  assert('single: 36 targets, 12 phrases', [single.length, new Set(single.map(t => t.phrase)).size], [36, 12]);
  assert('single from C, first nine right hands', single.slice(0, 9).map(rh),
    ['Dm7 F3 C4', 'G7 F3 B3', 'Cmaj7 E3 B3', 'Gm7 F3 B♭3', 'C7 E3 B♭3', 'Fmaj7 E3 A3', 'Cm7 B♭3 E♭4', 'F7 A3 E♭4', 'B♭maj7 A3 D4']);
  assert('single: the B♭ phrase starts 7-below', single.find(t => t.symbol === 'Cm7').form, '7-below');
  const inPref = t => t.upper[0].midi >= PREFERRED_BAND.low && t.upper[1].midi <= PREFERRED_BAND.high;
  assert('single: all 36 in E♭3–F4, none uses the outer band', [single.every(inPref), single.every(t => t.band === 'preferred')], [true, true]);
  const inPhraseMoves = ts => ts.filter((t, i) => i > 0 && ts[i - 1].phrase === t.phrase).map((t, _, __) => { const p = ts[t.index - 1]; return [t.upper[0].midi - p.upper[0].midi, t.upper[1].midi - p.upper[1].midi]; });
  assert('single: every in-phrase move is 0 or −1 per voice', inPhraseMoves(single).every(d => d.every(x => x === 0 || x === -1)), true);
  assert('single: forms alternate inside every phrase', single.every((t, i) => t.role !== 'V' || (t.form === other(single[i - 1].form) && t.form === other(single[i + 1].form))), true);

  // ── 'both' lap ───────────────────────────────────────────────────
  assert('both from C, first eight right hands', both.slice(0, 8).map(rh),
    ['Dm7 F3 C4', 'G7 F3 B3', 'Cmaj7 E3 B3', 'Dm7 C4 F4', 'G7 B3 F4', 'Cmaj7 B3 E4', 'Gm7 B♭3 F4', 'C7 B♭3 E4']);
  assert('both: 72 targets, 24 phrases, each key once per form', [both.length, new Set(both.map(t => t.phrase)).size,
    CYCLE.every(k => new Set(both.filter(t => t.key === k.key && t.role === 'ii').map(t => t.form)).size === 2)], [72, 24, true]);
  const inOuter = t => t.upper[0].midi >= OUTER_BAND.low && t.upper[1].midi <= OUTER_BAND.high;
  assert('both: all 72 within C3–G4', both.every(inOuter), true);
  assert('both: every in-phrase move is 0 or −1 per voice (no jump inside a phrase)', inPhraseMoves(both).every(d => d.every(x => x === 0 || x === -1)), true);
  const outerPhrases = both.filter(t => t.band === 'outer' && t.role === 'ii').map(t => `${t.key}:${t.form}`);
  assert('both: outer band only on second phrases whose forced form cannot fit E♭3–F4',
    [both.filter(t => t.band === 'outer').every(t => t.formSlot === 2), outerPhrases],
    [true, ['Bb:3-below', 'Eb:7-below', 'Ab:3-below', 'Db:7-below', 'Gb:3-below', 'A:3-below', 'D:7-below', 'G:3-below']]);
  assert('both: preferred-band phrases all sit inside E♭3–F4', both.filter(t => t.band === 'preferred').every(inPref), true);
  assert('buildLap from another key rotates the cycle', buildLap({ mode: 'single', startKey: 'F' }).slice(0, 3).map(t => t.symbol), ['Gm7', 'C7', 'Fmaj7']);

  // ── describeMove ─────────────────────────────────────────────────
  const dm = describeMove(single[0].upper, single[1].upper);
  assert('Dm7 → G7: F stays, C down a half step (step)', [dm.kind, dm.voices.map(v => v.label)], ['step', ['stays', 'down a half step']]);
  const re = describeMove(both[2].upper, both[3].upper, { form: both[3].form });
  assert('Cmaj7 E3 B3 → Dm7 C4 F4: replace, new phrase 7-below', [re.kind, re.summary], ['replace', 'new phrase: start 7-below']);
  const same = describeMove([n('F3'), n('C4')], [{ midi: n('C4'), degree: '♭7' }, { midi: n('F4'), degree: '♭3' }]);
  assert('F3 C4 → C4 F4: same notes, 7th now on the bottom; F up an octave, C stays', [same.kind, same.summary, same.voices.map(v => v.label)],
    ['replace', 'same notes, 7th now on the bottom', ['up an octave', 'stays']]);
  const seam = describeMove(single[2].upper, single[3].upper);
  assert('Cmaj7 E3 B3 → Gm7 F3 B♭3 (single, smooth entry): a step move', [seam.kind, seam.voices.map(v => v.delta)], ['step', [1, -1]]);

  // ── checkAnswer ──────────────────────────────────────────────────
  const T = sym => single.find(t => t.symbol === sym);
  const codes = r => r.errors.map(e => e.code);
  const dm7 = T('Dm7'), g7 = T('G7'), cmaj7 = T('Cmaj7'), gm7 = T('Gm7');
  const ok1 = checkAnswer(dm7, [n('D2'), n('F3'), n('C4')]);
  assert('Dm7 3-below D2 F3 C4 passes', [ok1.correct, ok1.message], [true, 'Dm7 ✓ F3 C4 over D2.']);
  const ok2 = checkAnswer(g7, [n('G2'), n('F3'), n('B3')]);
  assert('G7 7-below G2 F3 B3 passes', ok2.correct, true);
  assert('octave-shifted (D3 F4 C5) passes', checkAnswer(dm7, [n('D3'), n('F4'), n('C5')]).correct, true);
  assert('bass two octaves down (D1) passes', checkAnswer(dm7, [n('D1'), n('F3'), n('C4')]).correct, true);
  assert('TOO_FEW_NOTES', codes(checkAnswer(dm7, [n('D2'), n('F3')]))[0], 'TOO_FEW_NOTES');
  const wr = checkAnswer(gm7, [n('C3'), n('B♭3'), n('F4')]);
  assert('WRONG_ROOT: C under Gm7 is the 11th', [codes(wr)[0], wr.message], ['WRONG_ROOT', 'C is the 11th of Gm7, not the root — the bass should be G.']);
  const rnl = checkAnswer(dm7, [n('C3'), n('D3'), n('F3')]);
  assert('ROOT_NOT_LOWEST: D present, C underneath', codes(rnl)[0], 'ROOT_NOT_LOWEST');
  const wq = checkAnswer(dm7, [n('D2'), n('F♯3'), n('C4')]);
  assert('WRONG_QUALITY: F♯ makes Dm7 major', [codes(wq), wq.message], [['WRONG_QUALITY'], 'F♯ makes it major — Dm7 needs F.']);
  const wq2 = checkAnswer(g7, [n('G2'), n('F♯3'), n('B3')]);
  assert('WRONG_QUALITY: F♯ on G7 is a major 7th', [codes(wq2), wq2.message], [['WRONG_QUALITY'], 'F♯ makes it a major 7th — G7 needs F.']);
  const mg = checkAnswer(dm7, [n('D2'), n('F3'), n('A3')]);
  assert('MISSING_GUIDE_TONE: F A over D lacks the ♭7 (A is also extra)', [codes(mg), mg.message], [['MISSING_GUIDE_TONE', 'EXTRA_NOTE'], 'Missing the ♭7 — Dm7 needs C above the bass.']);
  const ex = checkAnswer(dm7, [n('D2'), n('F3'), n('A3'), n('C4')]);
  assert('EXTRA_NOTE: the 5th', [codes(ex), ex.message], [['EXTRA_NOTE'], 'A is the 5th — leave it out; the shell is just root, ♭3 and ♭7.']);
  const ex2 = checkAnswer(dm7, [n('D2'), n('D3'), n('F3'), n('C4')]);
  assert('EXTRA_NOTE: a doubled root', [codes(ex2), ex2.message.startsWith('D doubles the root')], [['EXTRA_NOTE'], true]);
  const wf = checkAnswer(dm7, [n('D2'), n('C3'), n('F3')]);
  assert('WRONG_FORM: right notes, 7th on the bottom when 3-below is asked', [codes(wf), wf.message], [['WRONG_FORM'], 'Right notes, wrong order — 3-below puts the ♭3 (F) under the ♭7 (C).']);
  const tw = checkAnswer(dm7, [n('D2'), n('F3'), n('C5')]);
  assert('TOO_WIDE: F3 to C5', [codes(tw), tw.message.startsWith('F and C are more than an octave apart')], [['TOO_WIDE'], true]);
  assert('TOO_WIDE on a 7-below target too: G2 F3 B4', codes(checkAnswer(g7, [n('G2'), n('F3'), n('B4')])), ['TOO_WIDE']);
  assert('omitted 5th is never an error: no case reports the 5th as omitted', [ok1, ok2, wq, wf].every(r => !r.errors.some(e => e.code === 'MISSING_GUIDE_TONE' && e.degree === '5')), true);
  const ct = checkAnswer(g7, [n('G2'), n('F4'), n('B4')], [n('F3'), n('C4')]);
  assert('COMMON_TONE_MOVED fires on a correct G7 after Dm7 F3 C4 played an octave off', [ct.correct, ct.coaching.map(c => c.code), ct.message], [true, ['COMMON_TONE_MOVED'], "Right shell. F could have stayed — it's in both chords."]);
  const ct2 = checkAnswer(g7, [n('G2'), n('F3'), n('B3')], [n('F3'), n('C4')]);
  assert('no coaching when the common tone holds', [ct2.correct, ct2.coaching], [true, []]);
  const ctWrong = checkAnswer(g7, [n('G2'), n('F4'), n('B4'), n('D5')], [n('F3'), n('C4')]);
  assert('coaching never appears on a wrong answer', [ctWrong.correct, ctWrong.coaching.length], [false, 0]);
  assert('Cmaj7 with B♭: WRONG_QUALITY (dominant 7th)', checkAnswer(cmaj7, [n('C2'), n('E3'), n('B♭3')]).message, 'B♭ makes it a dominant 7th — Cmaj7 needs B.');

  // ── Submit detector ──────────────────────────────────────────────
  // Steps: ['on'|'off', midi, t] or ['pedal', value, t]; returns the last non-null result and how many committed.
  const run = (d, steps) => { let out = null, n = 0; for (const [ev, x, t] of steps) { const r = ev === 'on' ? d.noteOn(x, t) : ev === 'off' ? d.noteOff(x, t) : d.pedal(x, t); if (r) { out = r; n++; } } return { out, n }; };
  const det = () => createSubmitDetector({ minNotes: 3 });
  const plain = run(det(), [['on', 38, 0], ['on', 53, 5], ['on', 60, 10], ['off', 38, 500], ['off', 53, 505], ['off', 60, 510]]);
  assert('plain chord (held 490 ms): submitted on the last release, settled, source lift', [plain.out.midis, plain.out.short, plain.out.source, plain.out.settled, plain.n], [[38, 53, 60], false, 'lift', true, 1]);
  assert('…and nothing commits before the last release', (() => { const d = det(); d.noteOn(38, 0); d.noteOn(53, 0); d.noteOn(60, 0); return [d.noteOff(38, 400), d.noteOff(53, 401), d.held()]; })(), [null, null, [60]]);
  const swap = run(det(), [['on', 38, 0], ['on', 54, 0], ['on', 60, 0], ['off', 54, 400], ['on', 53, 420], ['off', 38, 800], ['off', 53, 801], ['off', 60, 802]]);
  assert('swap a wrong note mid-chord (times added; was the last-note-on rule): the lifted F♯ is excluded', swap.out.midis, [38, 53, 60]);
  const brush = run(det(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['on', 59, 300], ['off', 59, 350], ['off', 38, 600], ['off', 53, 601], ['off', 60, 602]]);
  assert('stray brush (50 ms) lifted while the chord is held: answer is the chord', brush.out.midis, [38, 53, 60]);
  const brush2 = run(det(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['on', 59, 300], ['off', 59, 350], ['off', 38, 360], ['off', 53, 361], ['off', 60, 362]]);
  assert('stray brush then an immediate release: the earlier settled chord wins', [brush2.out.midis, brush2.out.settled], [[38, 53, 60], true]);
  const lifted = run(det(), [['on', 38, 0], ['on', 53, 0], ['on', 54, 0], ['off', 54, 400], ['off', 38, 800], ['off', 53, 801]]);
  assert('deliberately lifted wrong note, rest held ≥150 ms: excluded (two notes, flagged short)', [lifted.out.midis, lifted.out.short], [[38, 53], true]);
  const stag = run(det(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['off', 60, 500], ['off', 38, 510], ['off', 53, 520]]);
  assert('staggered release (10 ms apart): full chord, one submission', [stag.out.midis, stag.n], [[38, 53, 60], 1]);
  const stab = run(det(), [['on', 38, 0], ['on', 53, 5], ['on', 60, 10], ['off', 38, 50], ['off', 53, 55], ['off', 60, 60]]);
  assert('very quick stab (60 ms): fallback to the set after the last note-on', [stab.out.midis, stab.out.settled], [[38, 53, 60], false]);
  const dup = run(det(), [['on', 38, 0], ['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['off', 38, 500], ['off', 53, 500], ['off', 60, 500]]);
  assert('duplicate note-on is ignored', dup.out.midis, [38, 53, 60]);
  const one = run(createSubmitDetector({ minNotes: 1 }), [['on', 53, 0], ['off', 53, 300]]);
  assert('single-note submission with minNotes 1', [one.out.midis, one.out.short], [[53], false]);
  const untimed = run(det(), [['on', 38], ['on', 54], ['on', 60], ['off', 54], ['on', 53], ['off', 38], ['off', 53], ['off', 60]]);
  assert('calls without times never settle: last-note-on rule applies', [untimed.out.midis, untimed.out.settled], [[38, 53, 60], false]);
  assert('noteOff of an unheld note is ignored; reset clears', (() => { const d = det(); d.noteOn(38, 0); const r = d.noteOff(40, 10); d.reset(); return [r, d.held()]; })(), [null, []]);
  // Pedal submit.
  const pd = () => createSubmitDetector({ minNotes: 3, pedalSubmit: true });
  const pedal = run(pd(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['pedal', 127, 100]]);
  assert('pedal press submits the held set at once (source pedal)', [pedal.out.midis, pedal.out.source, pedal.out.t], [[38, 53, 60], 'pedal', 100]);
  const pedalLift = run(pd(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['pedal', 127, 100], ['pedal', 0, 200], ['off', 38, 500], ['off', 53, 501], ['off', 60, 502]]);
  assert('the lift after a pedal submit does not submit again', [pedalLift.n, pedalLift.out.source], [1, 'pedal']);
  assert('pedal press with nothing held does nothing', run(pd(), [['pedal', 127, 0], ['pedal', 0, 50]]).n, 0);
  const across = run(pd(), [
    ['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['pedal', 127, 100],                 // chord 1: pedal submit
    ['off', 38, 300], ['off', 53, 300], ['off', 60, 300],                             // lift: nothing
    ['on', 43, 400], ['on', 53, 400], ['on', 59, 400], ['pedal', 127, 450],           // chord 2 under the held pedal: no new press
    ['off', 43, 800], ['off', 53, 800], ['off', 59, 800],                             // lift: a lift submission
    ['pedal', 0, 900], ['on', 36, 1000], ['on', 52, 1000], ['on', 59, 1000], ['pedal', 127, 1100],   // chord 3: new press
  ]);
  assert('pedal held across chords: pedal submits only on each new press (chord 2, lifted without a new press, never submits)', [across.n, across.out.midis, across.out.source], [2, [36, 52, 59], 'pedal']);
  const pedalSources = (() => { const d = pd(); const out = []; for (const s of [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['pedal', 127, 100], ['off', 38, 300], ['off', 53, 300], ['off', 60, 300], ['on', 43, 400], ['on', 53, 400], ['on', 59, 400], ['pedal', 127, 450], ['off', 43, 800], ['off', 53, 800], ['off', 59, 800]]) { const r = s[0] === 'on' ? d.noteOn(s[1], s[2]) : s[0] === 'off' ? d.noteOff(s[1], s[2]) : d.pedal(s[1], s[2]); if (r) out.push(r.source); } return out; })();
  assert('…sources: pedal only (no lift submissions with pedalSubmit on)', pedalSources, ['pedal']);
  assert('pedalSubmit on: a plain lift with no pedal press does not submit', run(pd(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['off', 38, 500], ['off', 53, 501], ['off', 60, 502]]).n, 0);
  assert('pedal releases do nothing; with pedalSubmit off a press does nothing', [run(pd(), [['on', 38, 0], ['pedal', 0, 10]]).n, run(det(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['pedal', 127, 10]]).n], [0, 0]);
  assert('a second pedal press while the keys are still held does not resubmit', run(pd(), [['on', 38, 0], ['on', 53, 0], ['on', 60, 0], ['pedal', 127, 100], ['pedal', 0, 200], ['pedal', 127, 300]]).n, 1);

  // ── followUp ─────────────────────────────────────────────────────
  const fu = followUp(g7, cmaj7);
  assert('G7 → Cmaj7: F moved (to E), B holds', [fu.prompt, fu.answerName, fu.movedTo.name, fu.held.name, fu.accepts(n('F5')), fu.accepts(n('B3'))],
    ['Which note moved from G7 to Cmaj7?', 'F', 'E', 'B', true, false]);
  assert('…explanation', fu.explanation, "F, the ♭7 of G7, falls a half step to E, the 3rd of Cmaj7. B holds — it's the 3rd of G7 and the 7th of Cmaj7.");
  const fu2 = followUp(T('F♯7') || single.find(t => t.symbol === 'F#7'), T('Bmaj7'));
  assert('F♯7 → Bmaj7: E moved to D♯, A♯ holds', [fu2.answerName, fu2.movedTo.name, fu2.held.name], ['E', 'D♯', 'A♯']);
  const fu3 = followUp(T('Db7'), T('Gbmaj7'));
  assert('D♭7 → G♭maj7: C♭ moved to B♭, F holds', [fu3.answerName, fu3.movedTo.name, fu3.held.name], ['C♭', 'B♭', 'F']);

  // ── noteLabel and dual labels ────────────────────────────────────
  assert('noteLabel: C♭4 → C♭4 (B3); C♭ → C♭ (B); E♯ → E♯ (F); B♯3 → B♯3 (C4); F♭ → F♭ (E)', ['C♭4', 'C♭', 'E♯', 'B♯3', 'F♭'].map(noteLabel), ['C♭4 (B3)', 'C♭ (B)', 'E♯ (F)', 'B♯3 (C4)', 'F♭ (E)']);
  assert('noteLabel: ordinary names unchanged; double accidentals labelled', ['B♭', 'F♯3', 'C', 'D♭♭', 'C♭♭', 'G𝄪'].map(noteLabel), ['B♭', 'F♯3', 'C', 'D♭♭ (C)', 'C♭♭ (B♭)', 'G𝄪']);
  assert('noteLabel: non-notes pass through', [noteLabel('stays'), noteLabel(null)], ['stays', 'null']);
  const db7 = single.find(t => t.symbol === 'Db7'), abm7 = single.find(t => t.symbol === 'Abm7');
  const wqCb = checkAnswer(db7, [n('D♭2'), n('F3'), n('C4')]);
  const wqCbDual = checkAnswer(db7, [n('D♭2'), n('F3'), n('C4')], null, { dual: true });
  assert('checkAnswer: default output unchanged; dual option labels C♭ (B)', [wqCb.message, wqCbDual.message], ['C makes it a major 7th — D♭7 needs C♭.', 'C makes it a major 7th — D♭7 needs C♭ (B).']);
  const okCb = checkAnswer(db7, [n('D♭2'), n('F3'), n('B3')], null, { dual: true });
  assert('checkAnswer dual: confirmation spells the pressed B as C♭4 (B3)', [okCb.correct, okCb.message, okCb.played.upper], [true, 'D♭7 ✓ F3 C♭4 (B3) over D♭2.', ['F3', 'C♭4']]);
  assert('followUp dual: explanation labels C♭ (B); answerName stays raw', (f => [f.explanation.includes('C♭ (B)'), f.answerName])(followUp(db7, T('Gbmaj7'), { dual: true })), [true, 'C♭']);

  // ── phraseRecipe ─────────────────────────────────────────────────
  assert('phraseRecipe Dm7 (C): Home C: start on C and F (1 and 4) · root D', phraseRecipe(single[0]).text, 'Home C: start on C and F (1 and 4) · root D');
  assert('phraseRecipe Cm7 (B♭)', phraseRecipe(single.find(t => t.symbol === 'Cm7')).text, 'Home B♭: start on B♭ and E♭ (1 and 4) · root C');
  assert('phraseRecipe A♭m7 (G♭) dual: C♭ (B)', phraseRecipe(abm7, { dual: true }).text, 'Home G♭: start on G♭ and C♭ (B) (1 and 4) · root A♭');
  assert('phraseRecipe: second phrase in a key → "Again in C, 7th below: same notes, the other way up"', phraseRecipe(both[3]).text, 'Again in C, 7th below: same notes, the other way up');
  assert('phraseRecipe: null for V and I', [phraseRecipe(single[1]), phraseRecipe(single[2])], [null, null]);
  assert('every ii: 7th is home\'s 1 and 3rd is home\'s 4 (by pitch class, all 12 keys)',
    single.filter(t => t.role === 'ii').every(t => { const r = phraseRecipe(t); const home = parseNote(t.key).pc; return parseNote(r.one).pc === home && parseNote(r.four).pc === (home + 5) % 12; }), true);

  // ── moveRule: every transition in both lap modes ──────────────────
  assert('moveRule Dm7 → G7: The 7th falls: C → B · F stays', moveRule(single[0], single[1]).text, 'The 7th falls: C → B · F stays');
  assert('moveRule Cmaj7 → Gm7 (seam): 3rd up, 7th down: E → F · B → B♭', moveRule(single[2], single[3]).text, '3rd up, 7th down: E → F · B → B♭');
  assert('moveRule Cmaj7 → Dm7 (both, same key): replace with the describeMove summary', [moveRule(both[2], both[3]).kind, moveRule(both[2], both[3]).text], ['replace', 'New phrase: start 7th below']);
  assert('moveRule A♭m7 → D♭7 dual: C♭ (B) stays', moveRule(abm7, db7, { dual: true }).text, 'The 7th falls: G♭ → F · C♭ (B) stays');
  for (const [name, ts] of [['single', single], ['both', both]]) {
    const kinds = { fall: 0, seam: 0, replace: 0 }, broken = [];
    for (let i = 1; i < ts.length; i++) {
      const r = moveRule(ts[i - 1], ts[i]);
      const expected = ts[i - 1].phrase === ts[i].phrase ? 'fall' : ts[i - 1].key !== ts[i].key ? 'seam' : 'replace';
      kinds[r.kind]++;
      if (r.kind !== expected || !r.ok) broken.push(`${ts[i - 1].display} → ${ts[i].display}: ${r.kind}${r.ok ? '' : ' (rule broken)'}`);
    }
    assert(`moveRule ${name} lap from C: every in-phrase move is one 7th falling a half step with the other note held, every seam is 3rd up / 7th down (${ts.length - 1} transitions)`, [broken, kinds], [[], name === 'single' ? { fall: 24, seam: 11, replace: 0 } : { fall: 48, seam: 11, replace: 12 }]);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
