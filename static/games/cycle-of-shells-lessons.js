/**
 * cycle-of-shells-lessons.js
 * ==========================
 * Pure lesson data and helpers for the Cycle of Shells tutorial ("Find Your
 * Way Home", docs/find-your-way-home.md). A lesson is a hand-built list of
 * steps; the page walks the steps exactly as it walks a lap's targets, with
 * per-step flags saying what the learner plays, what is shown and how much
 * help is on screen. No DOM, no audio.
 *
 * Stage 1 holds Lesson 3 only ("Find the smallest movement"); the step shape
 * is meant to carry Lessons 1–5.
 *
 * Depends on:
 *   - cycle-of-shells-core.js → buildLap (the phrase's targets), followUp (the question a step asks), checkAnswer (self-test)
 *
 * Exports:
 *   LESSON_DEFS                       → { [id]: LessonDef }, the hand-written lessons
 *   lessonIds()                       → ids with a definition, ascending
 *   buildLesson(id)                   → Lesson | null   (id: number or numeric string)
 *   buildSteps(def)                   → Lesson from any LessonDef (buildLesson's worker; self-test and later lessons)
 *   stepUpHints(base, misses)         → the hint level a step shows after `misses` wrong answers
 *   supplyBass(target, midis)         → the played notes with the step's root put underneath (input 'guides')
 *   createHoldTracker(prev, target)   → { noteOn, noteOff, held, reset }: did the common tone stay down through the move?
 *   lessonTag(step)                   → { id, round, step, input } for the result log (detail.lesson)
 *   HINT_LEVELS, INPUT_KINDS, MIN_NOTES, MISSES_PER_HINT_STEP, SHOW_DEFAULTS, selfTest
 *
 * LessonDef (authoring shape):
 *   { id, title, home, intro?, done?, rounds: [{ title, steps: [StepDef] }] }
 *   StepDef:
 *     chord   'ii' | 'V' | 'I'      the chord of the home key's phrase to play — or
 *     target  Target                a ready-made core target (Lesson 1's Cmaj7 / C7 / Cm7 on one root)
 *     key     'F'                   another home for this step (Lesson 4); default: the lesson's home
 *     after   'ii' | 'V' | 'I' | Target | null
 *                                   the chord this step moves from: the guide's arrows, the rule line and
 *                                   the question are about after → chord. null: a fresh start, no move shown.
 *     input   'guides'              two notes, the 3rd and 7th; the page supplies (shows, sounds) the root
 *             'shell'               root, 3rd and 7th, as the drill
 *             'tones'               all the chord tones in any order (Lessons 1, 2, 4; checker not built yet)
 *     hints   'guided' | 'names' | 'none'   the step's starting hint level (see stepUpHints)
 *     show    { symbol, role, form, home, root }   what is on screen; missing keys take SHOW_DEFAULTS
 *                                   (root defaults to true only for input 'guides')
 *     prompt  string                the instruction line for the step
 *     hold    boolean               the move must be made with the common tone kept down (MIDI only)
 *     ask     boolean               after a correct answer, ask the two-part question about after → chord
 *
 * Lesson (built):
 *   { id, title, home, homeDisplay, intro, done, rounds: [{ title, steps: n }], steps: [Step] }
 *   Step:
 *     { index, lesson, round (1-based), roundTitle, roundCount, stepInRound (1-based), roundSteps,
 *       target, prev (Target|null), input, minNotes, hints, show, prompt, hold,
 *       ask: 'ii-V' | 'V-I' | null }
 *
 * Hints: HINT_LEVELS runs from most help to least. A step starts at its own
 * level; every MISSES_PER_HINT_STEP (2) wrong answers on that step turn the
 * hint up one level, never past 'guided'. The next step starts at its own
 * level again.
 *
 * Self-test (from the repo root):
 *   node --input-type=module -e "import('./static/games/cycle-of-shells-lessons.js').then(m => m.selfTest())"
 */

import { buildLap, followUp, checkAnswer } from './cycle-of-shells-core.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

/** Most help first. A later level (roles only) slots in between 'names' and 'none'. */
const HINT_LEVELS = ['guided', 'names', 'none'];
const INPUT_KINDS = ['guides', 'shell', 'tones'];
/** Notes a submission needs per input kind ('tones': at least root, 3rd and 7th). */
const MIN_NOTES = { guides: 2, shell: 3, tones: 3 };
const MISSES_PER_HINT_STEP = 2;
const SHOW_DEFAULTS = { symbol: true, role: true, form: true, home: true };
const ROLES = ['ii', 'V', 'I'];

const pcOf = m => ((m % 12) + 12) % 12;
const sortNum = a => a.slice().sort((x, y) => x - y);

// ════════════════════════════════════════════════════════════════════
// LESSONS
// ════════════════════════════════════════════════════════════════════

const g = (chord, after, extra) => ({ chord, after, input: 'guides', ...extra });

const LESSON_DEFS = {
  3: {
    id: 3,
    title: 'Find the smallest movement',
    home: 'C',
    intro: 'Two notes at a time. The root is played for you.',
    done: 'In a ii–V–I the 7th falls a half step to the next chord’s 3rd. The other note stays where it is and changes its job.',
    rounds: [
      {
        title: 'Copy each shape',
        steps: [
          g('ii', null, { hints: 'guided', prompt: 'The root, D, is played for you. Copy the two lit notes: F and C, the 3rd and 7th of Dm7.' }),
          g('V', 'ii', { hints: 'guided', prompt: 'G7, over G: F and B. This time the 7th is underneath.' }),
          g('I', 'V', { hints: 'guided', prompt: 'Cmaj7, over C: E and B.' }),
        ],
      },
      {
        title: 'Hold F, move C',
        steps: [
          g('V', 'ii', { hints: 'guided', hold: true, ask: true, prompt: 'Play F and C again. Keep F down and move only C, down to B. Then let go.' }),
        ],
      },
      {
        title: 'Hold B, move F',
        steps: [
          g('I', 'V', { hints: 'guided', hold: true, ask: true, prompt: 'Play F and B. Keep B down and move only F, down to E. Then let go.' }),
        ],
      },
      {
        title: 'Connect all three',
        steps: [
          g('ii', null, { hints: 'names', prompt: 'Now connect all three. The keys are no longer lit; the line under the chord still names each move. Start with Dm7.' }),
          g('V', 'ii', { hints: 'names', prompt: 'On to G7. One note stays, one falls.' }),
          g('I', 'V', { hints: 'names', prompt: 'And home, to Cmaj7.' }),
          g('ii', null, { hints: 'none', prompt: 'Once more, with nothing shown. Dm7.' }),
          g('V', 'ii', { hints: 'none', ask: true, prompt: 'G7.' }),
          g('I', 'V', { hints: 'none', ask: true, prompt: 'Cmaj7.' }),
        ],
      },
    ],
  },
};

const lessonIds = () => Object.keys(LESSON_DEFS).map(Number).sort((a, b) => a - b);

// ════════════════════════════════════════════════════════════════════
// BUILD
// ════════════════════════════════════════════════════════════════════

/** The three targets of a key's first phrase (the drill's own placement), by role. */
function phraseOf(key, cache) {
  if (!cache.has(key)) {
    const ts = buildLap({ mode: 'single', startKey: key }).slice(0, 3);
    cache.set(key, Object.fromEntries(ts.map(t => [t.role, t])));
  }
  return cache.get(key);
}

/**
 * Resolve a LessonDef into a Lesson: every step gets its targets and its
 * defaults. Throws on a definition that cannot be played (unknown chord,
 * input or hint level; a question or a hold on a step with nothing to move
 * from; a question about a pair the rule does not hold for).
 */
function buildSteps(def) {
  const cache = new Map();
  const fail = (where, what) => { throw new Error(`cycle-of-shells-lessons: lesson ${def.id}, ${where}: ${what}`); };
  const steps = [];
  def.rounds.forEach((round, r) => {
    round.steps.forEach((sd, s) => {
      const where = `round ${r + 1} step ${s + 1}`;
      const key = sd.key || def.home;
      const resolve = (x, what) => {
        if (x && typeof x === 'object') return x;
        if (!ROLES.includes(x)) fail(where, `unknown ${what} ${JSON.stringify(x)}`);
        return phraseOf(key, cache)[x];
      };
      const target = resolve(sd.target || sd.chord, 'chord');
      const prev = sd.after == null ? null : resolve(sd.after, 'after');
      if (!INPUT_KINDS.includes(sd.input)) fail(where, `unknown input ${sd.input}`);
      if (!HINT_LEVELS.includes(sd.hints)) fail(where, `unknown hint level ${sd.hints}`);
      if ((sd.ask || sd.hold) && !prev) fail(where, 'ask / hold need an `after` chord');
      let ask = null;
      if (sd.ask) {
        const q = followUp(prev, target);
        if (!q.ok || !q.transition) fail(where, `no question for ${q.from} → ${q.to}`);
        ask = q.transition;
      }
      steps.push({
        index: steps.length, lesson: def.id, round: r + 1, roundTitle: round.title, roundCount: def.rounds.length,
        stepInRound: s + 1, roundSteps: round.steps.length,
        target, prev, input: sd.input, minNotes: MIN_NOTES[sd.input], hints: sd.hints,
        show: { ...SHOW_DEFAULTS, root: sd.input === 'guides', ...(sd.show || {}) },
        prompt: sd.prompt || '', hold: !!sd.hold, ask,
      });
    });
  });
  const homeTarget = steps.length ? steps[0].target : null;
  return {
    id: def.id, title: def.title, home: def.home, homeDisplay: (homeTarget && homeTarget.key === def.home && homeTarget.keyDisplay) || def.home,
    intro: def.intro || '', done: def.done || '',
    rounds: def.rounds.map(r => ({ title: r.title, steps: r.steps.length })), steps,
  };
}

/** The lesson with this id (number or numeric string), or null when there is none. */
function buildLesson(id) {
  const n = typeof id === 'number' ? id : /^\d+$/.test(String(id == null ? '' : id).trim()) ? Number(String(id).trim()) : NaN;
  const def = LESSON_DEFS[n];
  return def ? buildSteps(def) : null;
}

// ════════════════════════════════════════════════════════════════════
// HELPERS FOR THE PAGE
// ════════════════════════════════════════════════════════════════════

/** A step's hint level after `misses` wrong answers: one level more help per MISSES_PER_HINT_STEP, never past 'guided'. */
function stepUpHints(base, misses = 0) {
  const i = HINT_LEVELS.indexOf(base);
  if (i < 0) return HINT_LEVELS[0];
  return HINT_LEVELS[Math.max(0, i - Math.floor(Math.max(0, misses) / MISSES_PER_HINT_STEP))];
}

/**
 * Input 'guides': the learner plays the 3rd and 7th, the page supplies the
 * root. Returns the played notes (sorted, de-duplicated) with the target's
 * root underneath them, lowered by octaves until it is the lowest note, so
 * the core's checkAnswer reads the set as a shell. A learner who plays the
 * root as well (three or more notes, the lowest one the root) is taken at
 * their word: nothing is added.
 */
function supplyBass(target, midis) {
  const played = sortNum([...new Set((midis || []).filter(m => Number.isFinite(m)))]);
  if (!played.length) return [target.bass.midi];
  if (played.length >= 3 && pcOf(played[0]) === pcOf(target.bass.midi)) return played;
  let bass = target.bass.midi;
  while (bass >= played[0] && bass - 12 >= 0) bass -= 12;
  return [bass, ...played];
}

/**
 * Did the common tone stay down through the move from `prev` to `target`?
 * Feed it the note-ons and note-offs of one attempt. It arms when the whole
 * previous shape is down (both of prev's upper notes, any octave), follows
 * the key(s) holding the note the two chords share, and reports held() once
 * the target's two notes are down while one of those keys has never come up.
 * Lifting the common tone disarms it until the previous shape is played
 * again. reset() between attempts.
 * `stay` is the shared pitch class (null when the chords share no upper note:
 * held() is then never true).
 */
function createHoldTracker(prev, target) {
  const fromPcs = prev.upper.map(u => pcOf(u.midi)), toPcs = target.upper.map(u => pcOf(u.midi));
  const stayPc = fromPcs.find(pc => toPcs.includes(pc));
  const down = new Set();
  let anchors = [];          // keys holding the common tone since the previous shape was down
  let done = false;
  const has = pc => [...down].some(m => pcOf(m) === pc);
  return {
    stay: stayPc == null ? null : stayPc,
    noteOn(midi) {
      down.add(midi);
      if (stayPc == null) return;
      if (!anchors.length && fromPcs.every(has)) anchors = [...down].filter(m => pcOf(m) === stayPc);
      if (anchors.length && toPcs.every(has)) done = true;
    },
    noteOff(midi) {
      down.delete(midi);
      anchors = anchors.filter(m => down.has(m));
    },
    held: () => done,
    reset() { down.clear(); anchors = []; done = false; },
  };
}

/** The lesson tag a step's log entries carry (core chordEntry / followUpEntry `lesson`). */
function lessonTag(step) {
  return { id: step.lesson, round: step.round, step: step.index + 1, input: step.input };
}

export {
  LESSON_DEFS, lessonIds, buildLesson, buildSteps, stepUpHints, supplyBass, createHoldTracker, lessonTag,
  HINT_LEVELS, INPUT_KINDS, MIN_NOTES, MISSES_PER_HINT_STEP, SHOW_DEFAULTS, selfTest,
};

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const throws = fn => { try { fn(); return false; } catch (_) { return true; } };
  const N = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const n = s => { const m = /^([A-G])(♭|♯)?(-?\d)$/.exec(s); return 12 * (Number(m[3]) + 1) + N[m[1]] + (m[2] === '♭' ? -1 : m[2] === '♯' ? 1 : 0); };

  console.log('\n─── cycle-of-shells-lessons.js self-test ───\n');

  // ── Lesson 3 ─────────────────────────────────────────────────────
  const L = buildLesson(3);
  const shape = st => `${st.target.display} ${st.target.upper.map(u => u.name).join(' ')}`;
  assert('ids; lookup by number or string; unknown ids give null', [lessonIds(), buildLesson('3').id, buildLesson(' 3 ').id, buildLesson(9), buildLesson('x'), buildLesson(null), buildLesson('3a')], [[3], 3, 3, null, null, null, null]);
  assert('Lesson 3: title, home, four rounds', [L.title, L.home, L.homeDisplay, L.rounds], ['Find the smallest movement', 'C', 'C',
    [{ title: 'Copy each shape', steps: 3 }, { title: 'Hold F, move C', steps: 1 }, { title: 'Hold B, move F', steps: 1 }, { title: 'Connect all three', steps: 6 }]]);
  assert('round 1 copies the doc\'s shapes: Dm7 F–C, G7 F–B, Cmaj7 E–B', L.steps.slice(0, 3).map(shape), ['Dm7 F3 C4', 'G7 F3 B3', 'Cmaj7 E3 B3']);
  assert('the supplied roots are D, G, C', L.steps.slice(0, 3).map(st => st.target.bass.name), ['D2', 'G2', 'C2']);
  assert('every step: two notes over a supplied root, symbol shown', L.steps.every(st => st.input === 'guides' && st.minNotes === 2 && st.show.root && st.show.symbol && st.show.role && st.show.home), true);
  assert('rounds 2 and 3: one move each, from the chord before, common tone held, question asked',
    L.steps.filter(st => st.round === 2 || st.round === 3).map(st => [st.prev.display, st.target.display, st.hold, st.ask, st.hints]),
    [['Dm7', 'G7', true, 'ii-V', 'guided'], ['G7', 'Cmaj7', true, 'V-I', 'guided']]);
  assert('hints step down across the lesson: guided, then names, then none', L.steps.map(st => st.hints),
    ['guided', 'guided', 'guided', 'guided', 'guided', 'names', 'names', 'names', 'none', 'none', 'none']);
  assert('the last pass shows nothing and asks at both changes', L.steps.slice(-3).map(st => [st.target.display, st.prev && st.prev.display, st.ask]), [['Dm7', null, null], ['G7', 'Dm7', 'ii-V'], ['Cmaj7', 'G7', 'V-I']]);
  assert('a phrase\'s first chord moves from nothing (no arrows, no rule line)', L.steps.filter(st => st.target.role === 'ii').every(st => st.prev === null), true);
  assert('indices, rounds and positions are consistent', [L.steps.map(st => st.index), L.steps.map(st => `${st.round}.${st.stepInRound}/${st.roundSteps}`), L.steps.every(st => st.roundCount === 4 && st.lesson === 3)],
    [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ['1.1/3', '1.2/3', '1.3/3', '2.1/1', '3.1/1', '4.1/6', '4.2/6', '4.3/6', '4.4/6', '4.5/6', '4.6/6'], true]);
  assert('every step has a prompt; the lesson has an intro and a closing line', [L.steps.every(st => st.prompt.length > 0), L.intro.length > 0, L.done.length > 0], [true, true, true]);
  assert('every question a step asks holds (7th falls a half step, 3rd stays)', L.steps.filter(st => st.ask).every(st => { const q = followUp(st.prev, st.target); return q.ok && q.transition === st.ask; }), true);
  assert('lessonTag', lessonTag(L.steps[3]), { id: 3, round: 2, step: 4, input: 'guides' });

  // ── The step shape fits the other lessons ─────────────────────────
  const adhoc = { symbol: 'C7', display: 'C7', form: '3-below', role: 'V', key: 'F', bass: { name: 'C2', midi: 36 }, upper: [{ name: 'E3', midi: 52, degree: '3' }, { name: 'B♭3', midi: 58, degree: '♭7' }] };
  const X = buildSteps({ id: 99, title: 'Shape check', home: 'C', rounds: [
    { title: 'Same root (Lesson 1)', steps: [{ target: adhoc, after: null, input: 'tones', hints: 'guided', prompt: 'Change Cmaj7 to C7 by moving one note.' }] },
    { title: 'Hidden chord (Lesson 2)', steps: [{ chord: 'V', after: 'ii', input: 'shell', hints: 'none', show: { symbol: false }, prompt: 'Which chord is missing?' }] },
    { title: 'Another home (Lesson 4)', steps: [{ chord: 'ii', key: 'F', after: null, input: 'guides', hints: 'names', prompt: 'Home is F.' }, { chord: 'V', key: 'F', after: 'ii', input: 'guides', hints: 'names', ask: true }] },
  ] });
  assert('a ready-made target, a hidden symbol, a full shell, another key: all build', X.steps.map(st => [st.target.display, st.input, st.minNotes, st.show.symbol, st.show.root, st.ask]),
    [['C7', 'tones', 3, true, false, null], ['G7', 'shell', 3, false, false, null], ['Gm7', 'guides', 2, true, true, null], ['C7', 'guides', 2, true, true, 'ii-V']]);
  assert('the F phrase is the drill\'s own: Gm7 F–B♭, C7 E–B♭', X.steps.slice(2).map(shape), ['Gm7 F3 B♭3', 'C7 E3 B♭3']);
  const bad = step => () => buildSteps({ id: 98, title: 'Bad', home: 'C', rounds: [{ title: 'r', steps: [step] }] });
  assert('bad definitions throw: unknown chord, input, hint level; ask or hold with nothing to move from; a question across a seam',
    [bad({ chord: 'IV', after: null, input: 'guides', hints: 'none' }), bad({ chord: 'ii', after: null, input: 'chords', hints: 'none' }), bad({ chord: 'ii', after: null, input: 'guides', hints: 'roles' }),
      bad({ chord: 'V', after: null, input: 'guides', hints: 'none', ask: true }), bad({ chord: 'V', after: null, input: 'guides', hints: 'none', hold: true }), bad({ chord: 'ii', after: 'I', input: 'guides', hints: 'none', ask: true })].map(throws),
    [true, true, true, true, true, true]);

  // ── stepUpHints ──────────────────────────────────────────────────
  assert('stepUpHints from none: none, none, names, names, guided, guided, guided', [0, 1, 2, 3, 4, 5, 9].map(m => stepUpHints('none', m)), ['none', 'none', 'names', 'names', 'guided', 'guided', 'guided']);
  assert('stepUpHints from names and guided; an unknown level reads as guided', [stepUpHints('names', 1), stepUpHints('names', 2), stepUpHints('guided', 6), stepUpHints('what', 0), stepUpHints('none')], ['names', 'guided', 'guided', 'guided', 'none']);

  // ── supplyBass + the core checker ────────────────────────────────
  const [dm7, g7, cmaj7] = [L.steps[0].target, L.steps[1].target, L.steps[2].target];
  assert('supplyBass: the root goes underneath', [supplyBass(dm7, [n('C4'), n('F3')]), supplyBass(dm7, [n('F3'), n('C4'), n('F3')])], [[38, 53, 60], [38, 53, 60]]);
  assert('supplyBass: played at or below the root → the root drops an octave under it', [supplyBass(dm7, [n('F2'), n('C3')]), supplyBass(dm7, [n('C2'), n('F2')]), supplyBass(dm7, [n('D2'), n('C3')])], [[38, 41, 48], [26, 36, 41], [26, 38, 48]]);
  assert('supplyBass: a learner who plays the root too is not given a second one; nothing played → the root alone', [supplyBass(dm7, [n('D2'), n('F3'), n('C4')]), supplyBass(dm7, [n('D3'), n('F3'), n('C4')]), supplyBass(dm7, [])], [[38, 53, 60], [50, 53, 60], [38]]);
  const check = (t, names, prevUpper) => checkAnswer(t, supplyBass(t, names.map(n)), prevUpper ? prevUpper.map(n) : null);
  assert('two notes pass as the shell: Dm7 F–C, G7 F–B, Cmaj7 E–B', [check(dm7, ['F3', 'C4']).correct, check(g7, ['F3', 'B3']).correct, check(cmaj7, ['E3', 'B3']).correct], [true, true, true]);
  assert('…in another octave too, and with the full shell played', [check(dm7, ['F4', 'C5']).correct, check(dm7, ['F2', 'C3']).correct, check(dm7, ['D2', 'F3', 'C4']).correct], [true, true, true]);
  assert('the core\'s messages carry over: wrong quality, wrong order, a missing guide tone',
    [check(g7, ['F♯3', 'B3']).message, check(dm7, ['C3', 'F3']).message, check(dm7, ['F3', 'A3']).errors[0].code],
    ['F♯ makes it a major 7th — G7 needs F.', 'Right notes, wrong order — 3-below puts the ♭3 (F) under the ♭7 (C).', 'MISSING_GUIDE_TONE']);
  assert('the common tone played in another octave is coached, not refused', (r => [r.correct, r.message])(check(g7, ['F4', 'B4'], ['F3', 'C4'])), [true, "Right shell. F could have stayed — it's in both chords."]);

  // ── Hold tracker ─────────────────────────────────────────────────
  const run = (tr, evs) => { for (const [ev, name] of evs) (ev === 'on' ? tr.noteOn : tr.noteOff)(n(name)); return tr.held(); };
  const tr = () => createHoldTracker(dm7, g7);
  assert('the common tone of Dm7 → G7 is F; of G7 → Cmaj7, B', [tr().stay, createHoldTracker(g7, cmaj7).stay], [5, 11]);
  assert('F C, lift C, add B: held', run(tr(), [['on', 'F3'], ['on', 'C4'], ['off', 'C4'], ['on', 'B3']]), true);
  assert('…and it stays true through the final release', run(tr(), [['on', 'F3'], ['on', 'C4'], ['off', 'C4'], ['on', 'B3'], ['off', 'F3'], ['off', 'B3']]), true);
  assert('F C, lift both, play F B: not held', run(tr(), [['on', 'F3'], ['on', 'C4'], ['off', 'C4'], ['off', 'F3'], ['on', 'F3'], ['on', 'B3']]), false);
  assert('F B played straight away (no Dm7 shape first): not held', run(tr(), [['on', 'F3'], ['on', 'B3']]), false);
  assert('B added before C comes up (overlap): held', run(tr(), [['on', 'C4'], ['on', 'F3'], ['on', 'B3'], ['off', 'C4']]), true);
  assert('the held F is the one that counts: F3 C4, lift F3, play F4 B4 → not held', run(tr(), [['on', 'F3'], ['on', 'C4'], ['off', 'F3'], ['off', 'C4'], ['on', 'F4'], ['on', 'B4']]), false);
  assert('a broken hold can be started again from the Dm7 shape', run(tr(), [['on', 'F3'], ['on', 'C4'], ['off', 'F3'], ['off', 'C4'], ['on', 'F3'], ['on', 'C4'], ['off', 'C4'], ['on', 'B3']]), true);
  assert('any octave: F4 C5, lift C5, add B4', run(tr(), [['on', 'F4'], ['on', 'C5'], ['off', 'C5'], ['on', 'B4']]), true);
  assert('G7 → Cmaj7: F B, keep B, F down to E', run(createHoldTracker(g7, cmaj7), [['on', 'F3'], ['on', 'B3'], ['off', 'F3'], ['on', 'E3']]), true);
  assert('reset clears a finished hold', (t => { run(t, [['on', 'F3'], ['on', 'C4'], ['off', 'C4'], ['on', 'B3']]); t.reset(); return t.held(); })(tr()), false);
  assert('chords with no shared upper note never report a hold', (t => [t.stay, run(t, [['on', 'E3'], ['on', 'B3'], ['on', 'F3'], ['on', 'B♭3']])])(createHoldTracker(cmaj7, X.steps[2].target)), [null, false]);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
