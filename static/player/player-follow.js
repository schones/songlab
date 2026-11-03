/**
 * player-follow.js
 * ================
 * Wait-for-me follower for the player page: pure logic, no DOM, no MIDI, no
 * audio; Node-runnable like player-staff-model.js. The norm is the shared
 * note model documented in tools/pieces/README.md.
 *
 *   buildSteps(norm, { hands }, hits?) → [step]
 *       One step per distinct attack onset (bar, onset) across the selected
 *       hands ('rh' | 'lh' | 'both', default 'both'), in score order.
 *       step: { index, bar, onset, notes: [{ midi, hand, bar, onset, ids, spans }], expected: Set<midi> }
 *       Rests, graces and tie "stop" / "both" events make no step: a tied
 *       continuation is held, not re-attacked. Instead the continuation is
 *       recorded as an extra span on the note it continues (same hand, same
 *       midi, most recent attack), so ids drawn for it belong to that step.
 *   attachIds(steps, hits)             → steps (same array)
 *       Adds staff-note ids from a toMEI `hits` map to every note whose
 *       (bar, hand, onset, midi) matches one of the note's spans. All pieces
 *       of a split duration match because toMEI gives every piece the attack
 *       onset. Idempotent and cumulative, so the page can call it once per
 *       rendered bar range. buildSteps calls it when `hits` is given.
 *   createFollower(steps)              → follower
 *       noteOn(midi)  → { result: 'correct' | 'wrong' | 'ignored', step, done, completed }
 *           correct:  midi is expected in the current step and not yet pressed in it
 *           ignored:  midi already pressed in this step (a re-strike), or no steps left
 *           wrong:    anything else; never advances
 *           completed: this note finished the step (the follower has advanced)
 *           step:     the step the note was judged against (null when none left)
 *           done:     no steps remain after this call
 *       A step completes when every expected midi has been pressed since the
 *       step began, in any order; the notes need not be held together
 *       (decided 2026-10-30: attacked-since-step, so a released note never blocks).
 *       noteOff(midi)  no effect on matching (wait mode ignores release timing)
 *       current()      the current step or null when done
 *       pressed()      Set of correct midis pressed so far in the current step
 *       reset()        back to the first step
 *       jumpTo(bar)    first step at or after that bar (past the end → done); returns current()
 *
 *       Loop for practice (a detour: the walk-through pauses inside a bar
 *       range, it does not stop):
 *       setLoop(from, to = from, { exitAfter = 0 })  → loop() or null
 *           Loop bars from..to (a reversed range is swapped). Returns null and
 *           clears the loop when the range has no steps for these hands. Does
 *           not move the follower: steps before the range play into it. Setting
 *           the same range again only updates exitAfter (passes are kept); a
 *           different range starts at pass 1.
 *       setLoop(null)  clears the loop
 *       loop()         { from, to, exitAfter, pass, cleanStreak } or null
 *           pass:        the pass under way, from 1
 *           cleanStreak: clean passes in a row so far (a pass is clean when no
 *                        wrong note was played on a step inside the range)
 *       Wrap rule: when a step inside the range completes and the next step is
 *       past `to` (or the piece ends), the follower goes back to the first step
 *       at or after `from`; noteOn reports looped: true and done stays false.
 *       With exitAfter N > 0, the N-th clean pass in a row clears the loop at
 *       the wrap point instead and play continues past `to` (loopExited: true).
 *       jumpTo and reset keep the loop.
 *   selfTest()                         → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-follow.js').then(m => m.selfTest())"
 */

import { parseNote } from '../shared/voicing-analysis.js';

const EPS = 1e-6;   // norm values sit on a 0.125-quarter grid
const HANDS = ['rh', 'lh'];

const near = (a, b) => Math.abs(a - b) < EPS;
const midiOf = name => { const p = parseNote(name); return p && p.midi != null ? p.midi : null; };

function handsOf(hands) {
  if (hands === 'rh' || hands === 'lh') return [hands];
  if (Array.isArray(hands)) return HANDS.filter(h => hands.includes(h));
  return HANDS.slice();
}

// ════════════════════════════════════════════════════════════════════
// STEPS
// ════════════════════════════════════════════════════════════════════

/**
 * @param {object} norm                       the norm document
 * @param {{ hands?: 'rh'|'lh'|'both'|string[] }} [options]
 * @param {object} [hits]                     toMEI hits map (id → { midi, bar, hand, onset, … })
 * @returns {Array<{ index, bar, onset, notes, expected }>}
 */
function buildSteps(norm, { hands = 'both' } = {}, hits = null) {
  const bars = (Array.isArray(norm && norm.bars) ? norm.bars : []).filter(b => b && typeof b.bar === 'number').slice().sort((a, b) => a.bar - b.bar);
  const selected = handsOf(hands);
  const steps = [];
  const lastAttack = {};   // `${hand}:${midi}` → note, for tie continuations

  for (const barData of bars) {
    const bar = barData.bar;
    const events = [];
    for (const hand of selected) {
      for (const ev of Array.isArray(barData[hand]) ? barData[hand] : []) {
        if (!ev || ev.rest || ev.grace || typeof ev.onset !== 'number' || !Array.isArray(ev.pitches) || !ev.pitches.length) continue;
        events.push({ hand, ev });
      }
    }
    events.sort((a, b) => (a.ev.onset - b.ev.onset) || HANDS.indexOf(a.hand) - HANDS.indexOf(b.hand));

    let step = null;
    for (const { hand, ev } of events) {
      const continues = ev.tie === 'stop' || ev.tie === 'both';
      for (const name of ev.pitches) {
        const midi = midiOf(name);
        if (midi == null) continue;
        const key = `${hand}:${midi}`;
        if (continues) {
          const prev = lastAttack[key];
          if (prev) prev.spans.push({ bar, onset: ev.onset });
          continue;   // held over, not re-attacked (an orphan stop is simply not expected)
        }
        if (!step || step.bar !== bar || !near(step.onset, ev.onset)) {
          step = steps.find(s => s.bar === bar && near(s.onset, ev.onset)) || null;
          if (!step) { step = { index: steps.length, bar, onset: ev.onset, notes: [], expected: new Set() }; steps.push(step); }
        }
        let note = step.notes.find(n => n.midi === midi && n.hand === hand);
        if (!note) { note = { midi, hand, bar, onset: ev.onset, ids: [], spans: [{ bar, onset: ev.onset }] }; step.notes.push(note); }
        step.expected.add(midi);
        lastAttack[key] = note;
      }
    }
  }
  // Score order inside a step: low to high, rh before lh for a doubled pitch.
  for (const s of steps) s.notes.sort((a, b) => (a.midi - b.midi) || HANDS.indexOf(a.hand) - HANDS.indexOf(b.hand));
  return hits ? attachIds(steps, hits) : steps;
}

/** Add toMEI ids to every note whose spans match; cumulative and idempotent. */
function attachIds(steps, hits) {
  if (!hits) return steps;
  const list = Object.values(hits);
  for (const step of steps) for (const note of step.notes) {
    for (const h of list) {
      if (!h || h.midi !== note.midi || h.hand !== note.hand) continue;
      if (!note.spans.some(sp => sp.bar === h.bar && near(sp.onset, h.onset))) continue;
      if (!note.ids.includes(h.id)) note.ids.push(h.id);
    }
  }
  return steps;
}

// ════════════════════════════════════════════════════════════════════
// FOLLOWER
// ════════════════════════════════════════════════════════════════════

function createFollower(steps) {
  const list = Array.isArray(steps) ? steps : [];
  let idx = 0;
  let pressedSet = new Set();
  let loopState = null;   // { from, to, exitAfter, pass, cleanStreak, dirty, start } — start: index of the first step at/after from

  const current = () => (idx < list.length ? list[idx] : null);
  const done = () => idx >= list.length;
  const inLoop = step => !!(loopState && step && step.bar >= loopState.from && step.bar <= loopState.to);

  function noteOn(midi) {
    const step = current();
    if (!step) return { result: 'ignored', step: null, done: true, completed: false };
    if (!step.expected.has(midi)) {
      if (inLoop(step)) loopState.dirty = true;
      return { result: 'wrong', step, done: false, completed: false };
    }
    if (pressedSet.has(midi)) return { result: 'ignored', step, done: false, completed: false };
    pressedSet.add(midi);
    let completed = false, looped = false, loopExited = false;
    if (pressedSet.size >= step.expected.size) {
      idx += 1;
      pressedSet = new Set();
      completed = true;
      const next = current();
      if (inLoop(step) && (!next || next.bar > loopState.to)) {   // the pass ends here
        const L = loopState;
        L.cleanStreak = L.dirty ? 0 : L.cleanStreak + 1;
        L.dirty = false;
        if (L.exitAfter > 0 && L.cleanStreak >= L.exitAfter) { loopState = null; loopExited = true; }
        else { idx = L.start; L.pass += 1; looped = true; }
      }
    }
    const out = { result: 'correct', step, done: done(), completed };
    if (looped) out.looped = true;
    if (loopExited) out.loopExited = true;
    return out;
  }

  function setLoop(from, to = from, { exitAfter = 0 } = {}) {
    if (from == null) { loopState = null; return null; }
    let a = Number(from), b = Number(to);
    if (!Number.isFinite(a) || !Number.isFinite(b)) { loopState = null; return null; }
    if (b < a) [a, b] = [b, a];
    const start = list.findIndex(s => s.bar >= a && s.bar <= b);
    if (start < 0) { loopState = null; return null; }
    const n = Math.max(0, Number(exitAfter) || 0);
    if (loopState && loopState.from === a && loopState.to === b) loopState.exitAfter = n;   // same range: keep the pass count
    else loopState = { from: a, to: b, exitAfter: n, pass: 1, cleanStreak: 0, dirty: false, start };
    return loop();
  }

  function loop() {
    if (!loopState) return null;
    const { from, to, exitAfter, pass, cleanStreak } = loopState;
    return { from, to, exitAfter, pass, cleanStreak };
  }

  function noteOff() { /* wait mode: release timing is not part of matching */ }

  function reset() { idx = 0; pressedSet = new Set(); return current(); }

  function jumpTo(bar) {
    const i = list.findIndex(s => s.bar >= bar);
    idx = i < 0 ? list.length : i;
    pressedSet = new Set();
    return current();
  }

  return { noteOn, noteOff, current, pressed: () => new Set(pressedSet), reset, jumpTo, done, setLoop, loop, steps: list };
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { buildSteps, attachIds, createFollower, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/player/player-follow.js').then(m => m.selfTest())"
//
// Synthetic bars copied from the prelude norm (bars 1, 15, 16 of
// static/private/pieces/prelude-winston-first-16.norm.json, 2026-10-30), then
// the whole file when present (ids checked against player-staff-model.toMEI).

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const ev = (onset, dur, pitches, tie = null) => ({ onset, dur, pitches, rest: false, tie });
  const rest = (onset, dur) => ({ onset, dur, pitches: [], rest: true, tie: null });
  const brief = s => s ? `${s.bar}:${s.onset} ${s.notes.map(n => `${n.hand}${n.midi}`).join('+')}` : null;
  const r = x => [x.result, x.step ? x.step.index : null, x.done, x.completed];

  console.log('\n─── player-follow.js self-test ───\n');

  const FIX = {
    piece: 'prelude-fixture', key: 'G minor', time: '3/4', beatsPerBar: 3,
    bars: [
      { bar: 1, rh: [ev(0, 2.5, ['D6']), ev(2.5, 0.5, ['D6'])], lh: [ev(0, 0.5, ['G4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])] },
      { bar: 2, rh: [ev(0, 2.5, ['D6']), ev(2.5, 0.5, ['C6'])], lh: [ev(0, 0.5, ['F4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])] },
      { bar: 15, rh: [ev(0, 1, ['E♭5']), ev(1, 1, ['C5']), ev(2, 0.5, ['D5']), ev(2.5, 0.5, ['C5', 'D5'], 'start')], lh: [ev(0, 0.5, ['A2']), ev(0.5, 2.5, ['G3'])] },
      { bar: 16, rh: [ev(0, 1, ['C5', 'D5'], 'stop'), rest(1, 2)], lh: [ev(0, 1, ['A2']), ev(1, 2, ['F♯3'])] },
    ],
  };
  const D6 = 86, G4 = 67, Bb4 = 70, D5 = 74, C5 = 72, A2 = 45, Fs3 = 54, Eb5 = 75, C6 = 84;

  // ── buildSteps: bar 1, both hands ─────────────────────────────────
  const both = buildSteps(FIX, { hands: 'both' });
  assert('bar 1 both: steps at 0 (D6+G4), 0.5 (B♭4), 1 (D5), 2.5 (D6)', both.filter(s => s.bar === 1).map(brief), ['1:0 lh67+rh86', '1:0.5 lh70', '1:1 lh74', '1:2.5 rh86']);
  assert('steps are indexed in order and carry expected sets', [both.map(s => s.index), [...both[0].expected].sort((a, b) => a - b)], [both.map((_, i) => i), [G4, D6]]);
  assert('consecutive same-pitch steps: bar 1 D6 at 0 and D6 at 2.5 are separate attacks; bar 2 D6 at 0 again', both.filter(s => s.notes.some(n => n.midi === D6)).map(s => `${s.bar}:${s.onset}`), ['1:0', '1:2.5', '2:0']);

  // ── hands filter ─────────────────────────────────────────────────
  const rh = buildSteps(FIX, { hands: 'rh' }), lh = buildSteps(FIX, { hands: 'lh' });
  assert('hands filter: rh 2+2+4+0 = 8, lh 3+3+2+2 = 10, both = union of onsets = 15', [rh.length, lh.length, both.length], [8, 10, 15]);
  assert('hands filter: rh steps carry only rh notes; lh only lh', [rh.every(s => s.notes.every(n => n.hand === 'rh')), lh.every(s => s.notes.every(n => n.hand === 'lh'))], [true, true]);
  assert('both: the union has every rh and lh onset exactly once', (() => {
    const key = s => `${s.bar}:${s.onset}`;
    const union = new Set([...rh.map(key), ...lh.map(key)]);
    return [union.size, both.map(key).length, both.every(s => union.has(key(s)))];
  })(), [15, 15, true]);
  assert('default hands = both; array form works', [buildSteps(FIX).length, buildSteps(FIX, { hands: ['lh'] }).length], [15, 10]);

  // ── ties ─────────────────────────────────────────────────────────
  const b16 = both.filter(s => s.bar === 16);
  assert('bar 15→16 tie-stop chord is not a step in bar 16 (only the lh A2 at 0 and F♯3 at 1)', b16.map(brief), ['16:0 lh45', '16:1 lh54']);
  const tied = both.find(s => s.bar === 15 && near(s.onset, 2.5));
  assert('the bar 15 chord step carries the bar 16 continuation as a span on each note', tied.notes.map(n => [n.midi, n.spans]), [[C5, [{ bar: 15, onset: 2.5 }, { bar: 16, onset: 0 }]], [D5, [{ bar: 15, onset: 2.5 }, { bar: 16, onset: 0 }]]]);
  const orphan = buildSteps({ bars: [{ bar: 1, rh: [ev(0, 1, ['C5'], 'stop'), ev(1, 1, ['E5'])], lh: [] }] });
  assert('an orphan tie stop (nothing to continue) is skipped without a step', orphan.map(brief), ['1:1 rh76']);
  const graces = buildSteps({ bars: [{ bar: 1, rh: [{ grace: ['B3'] }, ev(0, 1, ['C4']), rest(1, 2)], lh: [{ onset: 0, dur: 1, pitches: ['??'], rest: false }] }] });
  assert('graces, rests and unreadable pitches make no step or note', graces.map(brief), ['1:0 rh60']);

  // ── ids from toMEI hits ──────────────────────────────────────────
  let toMEI = null;
  try { ({ toMEI } = await import('./player-staff-model.js')); } catch (e) { console.log(`  · player-staff-model.js not importable (${e.message}); id tests use a hand-made hits map`); }
  const hits1 = toMEI ? toMEI(FIX, { from: 1, to: 1 }).hits : {
    'pl-b1-1-0': { id: 'pl-b1-1-0', midi: D6, bar: 1, staff: 1, hand: 'rh', onset: 0, at: 0, tieStop: false },
    'pl-b1-1-1': { id: 'pl-b1-1-1', midi: D6, bar: 1, staff: 1, hand: 'rh', onset: 0, at: 2, tieStop: true },
    'pl-b1-1-2': { id: 'pl-b1-1-2', midi: D6, bar: 1, staff: 1, hand: 'rh', onset: 2.5, at: 2.5, tieStop: false },
    'pl-b1-2-0': { id: 'pl-b1-2-0', midi: G4, bar: 1, staff: 2, hand: 'lh', onset: 0, at: 0, tieStop: false },
    'pl-b1-2-1': { id: 'pl-b1-2-1', midi: Bb4, bar: 1, staff: 2, hand: 'lh', onset: 0.5, at: 0.5, tieStop: false },
    'pl-b1-2-2': { id: 'pl-b1-2-2', midi: D5, bar: 1, staff: 2, hand: 'lh', onset: 1, at: 1, tieStop: false },
  };
  const withIds = buildSteps(FIX, { hands: 'both' }, hits1);
  assert('bar 1 D6 at 0 carries both tied pieces (half + 8th); D6 at 2.5 only its own', [withIds[0].notes.find(n => n.midi === D6).ids, withIds[3].notes[0].ids], [['pl-b1-1-0', 'pl-b1-1-1'], ['pl-b1-1-2']]);
  assert('bar 1 lh notes carry one id each', withIds.slice(0, 3).map(s => s.notes.filter(n => n.hand === 'lh').map(n => n.ids)), [[['pl-b1-2-0']], [['pl-b1-2-1']], [['pl-b1-2-2']]]);
  assert('attachIds is cumulative and idempotent across bar ranges', (() => {
    const steps = buildSteps(FIX, { hands: 'both' });
    const h15 = toMEI ? toMEI(FIX, { from: 15, to: 15 }).hits : { a: { id: 'a', midi: C5, bar: 15, hand: 'rh', onset: 2.5 }, b: { id: 'b', midi: D5, bar: 15, hand: 'rh', onset: 2.5 } };
    const h16 = toMEI ? toMEI(FIX, { from: 16, to: 16 }).hits : { c: { id: 'c', midi: C5, bar: 16, hand: 'rh', onset: 0 }, d: { id: 'd', midi: D5, bar: 16, hand: 'rh', onset: 0 } };
    attachIds(steps, h15); attachIds(steps, h16); attachIds(steps, h16);
    const chord = steps.find(s => s.bar === 15 && near(s.onset, 2.5));
    return chord.notes.map(n => n.ids.length);
  })(), [2, 2]);
  if (toMEI) {
    const steps = buildSteps(FIX, { hands: 'both' }, toMEI(FIX, { from: 15, to: 16 }).hits);
    const chord = steps.find(s => s.bar === 15 && near(s.onset, 2.5));
    assert('toMEI 15–16: the chord step owns the bar 15 pieces and the bar 16 tie-stop pieces', chord.notes.map(n => n.ids), [['pl-b15-1-3', 'pl-b16-1-0'], ['pl-b15-1-4', 'pl-b16-1-1']]);
    const all = Object.keys(toMEI(FIX, { from: 15, to: 16 }).hits);
    const owned = new Set(steps.flatMap(s => s.notes.flatMap(n => n.ids)));
    assert('toMEI 15–16: every drawn id belongs to exactly one step', [all.length, all.every(id => owned.has(id)), steps.flatMap(s => s.notes.flatMap(n => n.ids)).length], [all.length, true, all.length]);
  }

  // ── follower: order-independent completion ────────────────────────
  let f = createFollower(both);
  assert('fresh follower: current is step 0, nothing pressed, not done', [f.current().index, [...f.pressed()], f.done()], [0, [], false]);
  assert('G4 first: correct, step 0 incomplete', r(f.noteOn(G4)), ['correct', 0, false, false]);
  assert('then D6: correct, completes step 0, advances to step 1', [r(f.noteOn(D6)), f.current().index, [...f.pressed()]], [['correct', 0, false, true], 1, []]);
  f = createFollower(both);
  assert('D6 first then G4 also completes step 0', [r(f.noteOn(D6)), r(f.noteOn(G4)), f.current().index], [['correct', 0, false, false], ['correct', 0, false, true], 1]);

  // ── follower: wrong and re-strike ─────────────────────────────────
  f = createFollower(both);
  f.noteOn(G4);
  assert('wrong note (C5) does not advance, does not count', [r(f.noteOn(C5)), f.current().index, [...f.pressed()]], [['wrong', 0, false, false], 0, [G4]]);
  assert('re-strike of a pressed note is ignored, still not advanced', [r(f.noteOn(G4)), f.current().index, [...f.pressed()]], [['ignored', 0, false, false], 0, [G4]]);
  assert('noteOff has no effect on matching', (f.noteOff(G4), [f.current().index, [...f.pressed()]]), [0, [G4]]);
  assert('the missing D6 then completes the step', [r(f.noteOn(D6)), f.current().index], [['correct', 0, false, true], 1]);
  assert('a note from the next step counts as wrong for the current one (D5 while B♭4 is expected)', [r(f.noteOn(D5)), f.current().index], [['wrong', 1, false, false], 1]);

  // ── follower: consecutive same-pitch steps ────────────────────────
  f = createFollower(rh);
  assert('rh: D6 completes step 0 (bar 1 at 0); step 1 (D6 at 2.5) needs a fresh attack', [r(f.noteOn(D6)), f.current().onset, [...f.pressed()]], [['correct', 0, false, true], 2.5, []]);
  assert('rh: the fresh D6 completes step 1; next is bar 2 D6', [r(f.noteOn(D6)), brief(f.current())], [['correct', 1, false, true], '2:0 rh86']);

  // ── follower: jumpTo, reset, done ─────────────────────────────────
  f = createFollower(both);
  f.noteOn(G4);
  assert('jumpTo(15): first step at or after bar 15, pressed cleared', [brief(f.jumpTo(15)), [...f.pressed()]], ['15:0 lh45+rh75', []]);
  assert('jumpTo(3) with no bar 3 in the fixture lands on bar 15', brief(f.jumpTo(3)), '15:0 lh45+rh75');
  assert('jumpTo past the end → done, current null, noteOn ignored', [f.jumpTo(99), f.done(), r(f.noteOn(D6))], [null, true, ['ignored', null, true, false]]);
  assert('reset: back to step 0, not done', [f.reset().index, f.done(), [...f.pressed()]], [0, false, []]);
  f = createFollower(both);
  f.jumpTo(16);
  assert('last steps: A2 then F♯3 finish the piece; done on the final correct note', [r(f.noteOn(A2)), r(f.noteOn(Fs3)), f.current()], [['correct', 13, false, true], ['correct', 14, true, true], null]);
  assert('empty step list: done at once', [createFollower([]).current(), createFollower([]).done(), r(createFollower([]).noteOn(60))], [null, true, ['ignored', null, true, false]]);

  // ── loop: set / clear, wrap, passes ───────────────────────────────
  // FIX bars: 1 (4 steps), 2 (4 steps), 15 (5 steps), 16 (2 steps, lh only)
  const rl = x => [x.result, x.step ? x.step.index : null, x.done, x.completed, !!x.looped, !!x.loopExited];
  const play = (fw, step) => { let last = null; for (const m of step.expected) last = fw.noteOn(m); return last; };   // every expected note, in order
  f = createFollower(both);
  assert('setLoop(1, 2): loop reported, pass 1, clean 0; the follower has not moved', [f.setLoop(1, 2), f.current().index], [{ from: 1, to: 2, exitAfter: 0, pass: 1, cleanStreak: 0 }, 0]);
  assert('setLoop(2, 1) swaps a reversed range; setLoop(15) alone loops one bar', [f.setLoop(2, 1).to, f.setLoop(15)], [2, { from: 15, to: 15, exitAfter: 0, pass: 1, cleanStreak: 0 }]);
  assert('setLoop(null) clears; loop() is null', [f.setLoop(null), f.loop()], [null, null]);
  assert('setLoop on a range with no steps for the hand clears and returns null (rh-only bar 16 is tied in)', (() => { const g = createFollower(rh); g.setLoop(1, 2); return [g.setLoop(16), g.loop()]; })(), [null, null]);
  assert('setLoop with the same range again keeps the pass count, updates exitAfter', (() => { const g = createFollower(both); g.setLoop(1, 2); play(g, both[0]); for (const st of both.slice(1, 8)) play(g, st); return [g.loop().pass, g.setLoop(1, 2, { exitAfter: 2 })]; })(), [2, { from: 1, to: 2, exitAfter: 2, pass: 2, cleanStreak: 1 }]);

  // Wrap at the end bar: bar 2's last step (index 7) completes → back to step 0, pressed cleared.
  f = createFollower(both);
  f.setLoop(1, 2);
  for (const st of both.slice(0, 7)) play(f, st);
  assert('loop 1–2: before the last step of bar 2, no wrap yet', [f.current().index, f.loop().pass], [7, 1]);
  f.noteOn(D5);   // wrong on the last step (C6 alone), in range
  assert('completing the last step in the range wraps to step 0 (looped, done false, pressed cleared); the wrong note made the pass dirty', [rl(f.noteOn(C6)), f.current().index, [...f.pressed()], f.loop()], [['correct', 7, false, true, true, false], 0, [], { from: 1, to: 2, exitAfter: 0, pass: 2, cleanStreak: 0 }]);
  for (const st of both.slice(0, 8)) play(f, st);
  assert('a clean second pass: pass 3, clean streak 1', [f.current().index, f.loop()], [0, { from: 1, to: 2, exitAfter: 0, pass: 3, cleanStreak: 1 }]);

  // Loop on the last bar: the piece would end, so it wraps instead of finishing.
  f = createFollower(both);
  f.setLoop(16);
  f.jumpTo(16);
  f.noteOn(A2);
  assert('loop on the last bar: the final step wraps to the first step of bar 16, done stays false', [rl(f.noteOn(Fs3)), brief(f.current()), f.done()], [['correct', 14, false, true, true, false], '16:0 lh45', false]);

  // Start before the range: steps before it play normally and into it; misses there do not spoil the pass.
  f = createFollower(both);
  f.setLoop(2);
  f.noteOn(C5);   // wrong in bar 1 (outside the range)
  for (const st of both.slice(0, 4)) assert.call(null, `bar 1 step ${st.index} plays into the loop (no wrap)`, rl(play(f, st)), ['correct', st.index, false, true, false, false]);
  assert('entering the range from before it: step 4, pass 1, not dirty', [f.current().index, f.loop().pass], [4, 1]);
  for (const st of both.slice(4, 8)) play(f, st);
  assert('the pass through bar 2 was clean despite the miss in bar 1; wrapped to step 4, not step 0', [f.loop(), f.current().index], [{ from: 2, to: 2, exitAfter: 0, pass: 2, cleanStreak: 1 }, 4]);

  // exitAfter: clean passes in a row clear the loop at the wrap point and play goes on.
  f = createFollower(both);
  f.setLoop(1, 2, { exitAfter: 2 });
  for (const st of both.slice(0, 8)) play(f, st);            // pass 1 clean
  assert('exitAfter 2: after one clean pass, still looping (clean 1)', [f.loop().cleanStreak, f.loop().pass, f.current().index], [1, 2, 0]);
  f.noteOn(C5);                                              // dirty pass 2
  for (const st of both.slice(0, 8)) play(f, st);
  assert('a dirty pass resets the streak to 0 and loops again', [f.loop().cleanStreak, f.loop().pass], [0, 3]);
  for (const st of both.slice(0, 8)) play(f, st);            // pass 3 clean → streak 1
  for (const st of both.slice(0, 7)) play(f, st);            // pass 4 up to the last step
  const exitResult = play(f, both[7]);
  assert('the second clean pass in a row exits: loopExited, loop cleared, play continues into bar 15', [rl(exitResult), f.loop(), brief(f.current())], [['correct', 7, false, true, false, true], null, '15:0 lh45+rh75']);

  // jumpTo / reset keep the loop.
  f = createFollower(both);
  f.setLoop(1, 2);
  f.jumpTo(15); f.reset();
  assert('jumpTo and reset keep the loop', f.loop(), { from: 1, to: 2, exitAfter: 0, pass: 1, cleanStreak: 0 });
  f.jumpTo(15);
  for (const st of both.slice(8, 15)) play(f, st);
  assert('steps outside the range never wrap: playing bars 15–16 to the end finishes the piece with the loop still set', [f.done(), f.loop() !== null], [true, true]);

  // ── the real prelude when present ────────────────────────────────
  try {
    const fs = await import('node:fs');
    const path = new URL('../private/pieces/prelude-winston-first-16.norm.json', import.meta.url);
    if (fs.existsSync(path)) {
      const norm = JSON.parse(fs.readFileSync(path, 'utf8'));
      const P = { rh: buildSteps(norm, { hands: 'rh' }), lh: buildSteps(norm, { hands: 'lh' }), both: buildSteps(norm, { hands: 'both' }) };
      const key = s => `${s.bar}:${s.onset}`;
      const union = new Set([...P.rh.map(key), ...P.lh.map(key)]);
      assert(`prelude: both (${P.both.length}) = union of rh (${P.rh.length}) and lh (${P.lh.length}) onsets`, [P.both.length === union.size, P.both.every(s => union.has(key(s)))], [true, true]);
      assert('prelude: first 6 steps (both)', P.both.slice(0, 6).map(brief), ['1:0 lh67+rh86', '1:0.5 lh70', '1:1 lh74', '1:2.5 rh86', '2:0 lh65+rh86', '2:0.5 lh70']);
      assert('prelude: bar 16 has no rh step (tied chord), lh A2 and F♯3 only', P.both.filter(s => s.bar === 16).map(brief), ['16:0 lh45', '16:1 lh54']);
      if (toMEI) {
        const whole = toMEI(norm, { from: norm.bars[0].bar, to: norm.bars[norm.bars.length - 1].bar });
        const steps = buildSteps(norm, { hands: 'both' }, whole.hits);
        const ids = steps.flatMap(s => s.notes.flatMap(n => n.ids));
        assert('prelude: every drawn id (incl. tie pieces) belongs to exactly one step', [ids.length, Object.keys(whole.hits).length, new Set(ids).size], [Object.keys(whole.hits).length, Object.keys(whole.hits).length, ids.length]);
        assert('prelude: bar 1 D6 at 0 carries both tie pieces', steps[0].notes.find(n => n.midi === D6).ids, ['pl-b1-1-0', 'pl-b1-1-1']);
        // Play the whole piece correctly, straight through.
        const f2 = createFollower(steps);
        let wrong = 0, last = null;
        for (const s of steps) for (const m of s.expected) { last = f2.noteOn(m); if (last.result !== 'correct') wrong++; }
        assert('prelude: playing every expected note in order finishes the piece with no wrong results', [wrong, last.done, f2.current()], [0, true, null]);
        // Loop bars 1–4 (both hands): two passes back to step 0 with no wrong results.
        const f3 = createFollower(steps);
        f3.setLoop(1, 4);
        const inRange = steps.filter(s => s.bar >= 1 && s.bar <= 4);
        let wrong3 = 0, wraps = 0;
        for (let pass = 0; pass < 2; pass++) for (const s of inRange) for (const m of s.expected) { const x = f3.noteOn(m); if (x.result !== 'correct') wrong3++; if (x.looped) wraps++; }
        assert(`prelude: loop 1–4 (${inRange.length} steps) for two passes: back to step 0 each time, no wrong results, pass 3 with 2 clean`, [wrong3, wraps, f3.current().index, f3.loop()], [0, 2, 0, { from: 1, to: 4, exitAfter: 0, pass: 3, cleanStreak: 2 }]);
        const f4 = createFollower(steps);
        f4.setLoop(1, 4, { exitAfter: 2 });
        let exited = null;
        for (let pass = 0; pass < 2; pass++) for (const s of inRange) for (const m of s.expected) { const x = f4.noteOn(m); if (x.loopExited) exited = x; }
        assert('prelude: with exitAfter 2 the second clean pass exits and play continues into bar 5', [!!exited, f4.loop(), f4.current() && f4.current().bar], [true, null, 5]);
      }
      console.log(`  · prelude step counts: rh ${P.rh.length}, lh ${P.lh.length}, both ${P.both.length}`);
      console.log('  · prelude first 6 steps (both):');
      for (const s of P.both.slice(0, 6)) console.log(`      ${s.index}  bar ${s.bar} onset ${s.onset}  ${s.notes.map(n => `${n.hand} ${n.midi}`).join(', ')}`);
    } else console.log('  · static/private/pieces/prelude-winston-first-16.norm.json not present; prelude pass skipped');
  } catch (e) { console.log(`  · prelude pass skipped (${e.message})`); }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
