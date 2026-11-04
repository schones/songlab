/**
 * player-listen.js
 * ================
 * Playback schedule for the player's "Listen" (2a): a bar range of a norm
 * document as timed notes for VoicingPlayer (shared/voicing-player.js). Pure
 * logic, no DOM, no Tone; Node-runnable like player-follow.js. The norm is
 * the shared note model documented in tools/pieces/README.md.
 *
 *   listenSchedule(norm, { from, to = from, bpm }) → { notes, duration, bars, from, to, bpm, secPerQuarter, barQuarters }
 *       notes     [{ time, duration, midi, role, bar, hand, onset, spans }] in VoicingPlayer's
 *                 shape (seconds from the downbeat of `from`), both hands always, in time
 *                 order. role: 'melody' for rh, 'bass' for lh (VoicingPlayer's velocity
 *                 table). bar / hand / onset / midi name the attack; spans lists every
 *                 { bar, onset } the note is drawn at (its attack plus each tie
 *                 continuation), so the page can find the staff ids of whatever line is
 *                 drawn when the note sounds (toMEI hits match on bar, hand, midi, onset,
 *                 as player-follow attachIds does).
 *       duration  seconds from `from`'s downbeat to `to`'s end (bars in range × bar length)
 *       bars      [{ bar, time }] start time of each bar in range (page turns)
 *       Bar length in quarters is meter-rules meterLevels(norm.time, norm.beatsPerBar).bar,
 *       the same the staff model uses. bpm is quarter notes per minute.
 *       Ties: a continuation ("stop" / "both") extends the note it continues (same
 *       hand and midi, most recent attack in the schedule) instead of re-attacking,
 *       and adds its span. A continuation with no attack in the range — the tie
 *       arrives from before `from` — sounds as a fresh attack at its own onset
 *       (Listen only; buildSteps makes no step for it). Rests and grace events are
 *       skipped. Every note ends at the range end at the latest; nothing starts
 *       before `from`.
 *   pieceBpm(norm)            → { bpm, assumed }: norm.tempo, else DEFAULT_BPM with assumed: true
 *   tempoLabel(pct, bpm)      → '60% · 49 bpm' (quarter-note bpm at that percentage, rounded)
 *   selfTest()                → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-listen.js').then(m => m.selfTest())"
 */

import { parseNote } from '../shared/voicing-analysis.js';
import { meterLevels } from './meter-rules.js';

const EPS = 1e-6;   // norm values sit on a 0.125-quarter grid
const HANDS = ['rh', 'lh'];
const ROLE = { rh: 'melody', lh: 'bass' };
const DEFAULT_BPM = 90;   // when the norm has no tempo (scan reads)

const midiOf = name => { const p = parseNote(name); return p && p.midi != null ? p.midi : null; };
const round = x => Math.round(x * 1e6) / 1e6;

/** The piece's tempo in quarter notes per minute; DEFAULT_BPM (assumed: true) when the norm has none. */
function pieceBpm(norm) {
  const t = norm && norm.tempo;
  return typeof t === 'number' && t > 0 ? { bpm: t, assumed: false } : { bpm: DEFAULT_BPM, assumed: true };
}

/** 'NN% · MM bpm' for the slider readout. */
function tempoLabel(pct, bpm) {
  return `${Math.round(pct)}% · ${Math.round(bpm * pct / 100)} bpm`;
}

/**
 * @param {object} norm
 * @param {{ from: number, to?: number, bpm: number }} options  bar range (inclusive) and quarter-note bpm
 */
function listenSchedule(norm, { from, to = from, bpm } = {}) {
  const a = Math.min(from, to), b = Math.max(from, to);
  const tempo = typeof bpm === 'number' && bpm > 0 ? bpm : DEFAULT_BPM;
  const secPerQuarter = 60 / tempo;
  const barQuarters = meterLevels(norm && norm.time, norm && norm.beatsPerBar).bar;
  const barSeconds = barQuarters * secPerQuarter;
  const bars = (Array.isArray(norm && norm.bars) ? norm.bars : [])
    .filter(x => x && typeof x.bar === 'number' && x.bar >= a && x.bar <= b)
    .slice().sort((x, y) => x.bar - y.bar);

  const notes = [];
  const barTimes = [];
  const lastAttack = {};   // `${hand}:${midi}` → note, for tie continuations
  const end = bars.length * barSeconds;

  bars.forEach((barData, i) => {
    const barStart = i * barSeconds;
    barTimes.push({ bar: barData.bar, time: round(barStart) });
    const events = [];
    for (const hand of HANDS) {
      for (const ev of Array.isArray(barData[hand]) ? barData[hand] : []) {
        if (!ev || ev.rest || ev.grace || typeof ev.onset !== 'number' || typeof ev.dur !== 'number' || !Array.isArray(ev.pitches) || !ev.pitches.length) continue;
        events.push({ hand, ev });
      }
    }
    events.sort((x, y) => (x.ev.onset - y.ev.onset) || HANDS.indexOf(x.hand) - HANDS.indexOf(y.hand));
    for (const { hand, ev } of events) {
      const continues = ev.tie === 'stop' || ev.tie === 'both';
      const start = barStart + ev.onset * secPerQuarter;
      const stop = Math.min(end, start + ev.dur * secPerQuarter);
      if (start >= end - EPS) continue;   // past the range (an event outside its bar)
      for (const name of ev.pitches) {
        const midi = midiOf(name);
        if (midi == null) continue;
        const key = `${hand}:${midi}`;
        const prev = continues ? lastAttack[key] : null;
        if (prev) {   // held over: extend, do not re-attack
          prev._end = Math.max(prev._end, stop);
          prev.spans.push({ bar: barData.bar, onset: ev.onset });
          continue;
        }
        const note = { time: round(start), duration: 0, midi, role: ROLE[hand], bar: barData.bar, hand, onset: ev.onset, spans: [{ bar: barData.bar, onset: ev.onset }], _end: stop };
        notes.push(note);
        lastAttack[key] = note;
      }
    }
  });
  for (const n of notes) { n.duration = round(Math.max(0, n._end - n.time)); delete n._end; }
  notes.sort((x, y) => (x.time - y.time) || (x.midi - y.midi) || HANDS.indexOf(x.hand) - HANDS.indexOf(y.hand));
  return { notes, duration: round(end), bars: barTimes, from: a, to: b, bpm: tempo, secPerQuarter, barQuarters };
}

export { listenSchedule, pieceBpm, tempoLabel, DEFAULT_BPM, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const ev = (onset, dur, pitches, tie = null) => ({ onset, dur, pitches, rest: false, tie });
  const rest = (onset, dur) => ({ onset, dur, pitches: [], rest: true, tie: null });
  const brief = n => `${n.hand}${n.midi}@${n.time}+${n.duration}`;

  console.log('\n─── player-listen.js self-test ───\n');

  // Shapes from the Carol norm: bar 1 (both hands), bars 10–11 (D5 tied across the bar line), a 4/4 piece with graces.
  const CAROL = {
    piece: 'carol-fixture', key: 'G minor', time: '3/4', beatsPerBar: 3, tempo: 82,
    bars: [
      { bar: 1, rh: [ev(0, 2.5, ['D6']), ev(2.5, 0.5, ['D6'])], lh: [ev(0, 0.5, ['G4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])] },
      { bar: 2, rh: [ev(0, 2.5, ['D6']), ev(2.5, 0.5, ['C6'])], lh: [ev(0, 0.5, ['F4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])] },
      { bar: 10, rh: [ev(0, 2.5, ['E♭5']), ev(2.5, 0.5, ['D5'], 'start')], lh: [ev(0, 3, ['G3'])] },
      { bar: 11, rh: [ev(0, 1, ['D5'], 'stop'), rest(1, 2)], lh: [ev(0, 3, ['A3'])] },
      { bar: 12, rh: [ev(0, 3, ['C5'])], lh: [ev(0, 3, ['F3'])] },
    ],
  };
  const D6 = 86, G4 = 67, Bb4 = 70, D5 = 74, C6 = 84, Eb5 = 75, G3 = 55, A3 = 57, C5 = 72, F3 = 53;

  // ── seconds at a given bpm ───────────────────────────────────────
  const s120 = listenSchedule(CAROL, { from: 1, bpm: 120 });
  assert('3/4 bar at 120 bpm: duration 1.5 s, one bar at time 0, secPerQuarter 0.5', [s120.duration, s120.bars, s120.secPerQuarter, s120.barQuarters], [1.5, [{ bar: 1, time: 0 }], 0.5, 3]);
  assert('bar 1 at 120 bpm: D6 2.5 q → 1.25 s; lh G4 0.25 s, B♭4 at 0.25 s, D5 at 0.5 s for 1 s; D6 again at 1.25 s', s120.notes.map(brief), ['lh67@0+0.25', 'rh86@0+1.25', 'lh70@0.25+0.25', 'lh74@0.5+1', 'rh86@1.25+0.25']);
  assert('both hands present with their roles; bar / hand / onset / midi carried', s120.notes.map(n => [n.role, n.bar, n.hand, n.onset, n.midi]), [['bass', 1, 'lh', 0, G4], ['melody', 1, 'rh', 0, D6], ['bass', 1, 'lh', 0.5, Bb4], ['bass', 1, 'lh', 1, D5], ['melody', 1, 'rh', 2.5, D6]]);
  const s82 = listenSchedule(CAROL, { from: 1, to: 2, bpm: 82 });
  assert('two bars at 82 bpm: duration 6 × 60/82 s, bar 2 starts at 3 × 60/82 s', [s82.duration, s82.bars.map(b => b.time)], [round(360 / 82), [0, round(180 / 82)]]);
  assert('bar 2 notes are offset by the bar start; C6 at 2.5 q ends at the range end', s82.notes.filter(n => n.bar === 2).map(n => [n.midi, n.time, round(n.time + n.duration)]).slice(-1), [[C6, round(180 / 82 + 2.5 * 60 / 82), round(360 / 82)]]);
  assert('60% of 82 bpm reads 49', [tempoLabel(60, 82), tempoLabel(100, 82), tempoLabel(25, 90)], ['60% · 49 bpm', '100% · 82 bpm', '25% · 23 bpm']);
  assert('pieceBpm: the norm tempo, else 90 assumed', [pieceBpm(CAROL), pieceBpm({ bars: [] }), pieceBpm({ tempo: 0 })], [{ bpm: 82, assumed: false }, { bpm: 90, assumed: true }, { bpm: 90, assumed: true }]);

  // ── tie merging across a bar line ───────────────────────────────
  const tie = listenSchedule(CAROL, { from: 10, to: 11, bpm: 120 });
  const d5 = tie.notes.filter(n => n.midi === D5);
  assert('bar 10 D5 tied into bar 11: one note, 0.5 + 1 q = 0.75 s, no re-attack at the downbeat', [d5.length, d5[0].time, d5[0].duration, tie.notes.filter(n => n.bar === 11).map(n => n.midi)], [1, 1.25, 0.75, [A3]]);
  assert('the tied note carries both spans (bar 10 at 2.5, bar 11 at 0)', d5[0].spans, [{ bar: 10, onset: 2.5 }, { bar: 11, onset: 0 }]);
  assert('bars 10–11: E♭5 and G3 whole bar, A3 in bar 11; the rest makes no note', tie.notes.map(brief), ['lh55@0+1.5', 'rh75@0+1.25', 'rh74@1.25+0.75', 'lh57@1.5+1.5']);

  // ── clipping at the range end ───────────────────────────────────
  const clip = listenSchedule(CAROL, { from: 10, bpm: 120 });
  const d5c = clip.notes.find(n => n.midi === D5);
  assert('range ends at bar 10: the D5 tied past it is cut at the range end (0.25 s), one span', [d5c.time, d5c.duration, d5c.spans, clip.duration], [1.25, 0.25, [{ bar: 10, onset: 2.5 }], 1.5]);

  // ── a continuation at the range start sounds as a fresh attack (Listen only) ──
  const cont = listenSchedule(CAROL, { from: 11, to: 12, bpm: 120 });
  assert('loop from bar 11: the D5 tied in from bar 10 attacks at time 0 for 0.5 s, span bar 11 at 0', cont.notes.filter(n => n.midi === D5).map(n => [n.time, n.duration, n.spans, n.role]), [[0, 0.5, [{ bar: 11, onset: 0 }], 'melody']]);
  assert('bars 11–12: 4 notes, bar 12 at 1.5 s', [cont.notes.length, cont.bars], [4, [{ bar: 11, time: 0 }, { bar: 12, time: 1.5 }]]);

  // ── rests, graces, 4/4 ──────────────────────────────────────────
  const FOUR = {
    piece: 'four-fixture', key: 'C', time: '4/4',
    bars: [
      { bar: 1, rh: [rest(0, 1), ev(1, 3, ['C5', 'E5'])], lh: [{ grace: ['F2', 'G2'] }, ev(0, 2, ['C3']), rest(2, 2)] },
      { bar: 2, rh: [ev(0, 2, ['D5'], 'start'), ev(2, 2, ['D5'], 'both')], lh: [ev(0, 4, ['G2'])] },
      { bar: 3, rh: [ev(0, 4, ['D5'], 'stop')], lh: [ev(0, 4, ['G2'])] },
    ],
  };
  const four = listenSchedule(FOUR, { from: 1, to: 3, bpm: 60 });
  assert('4/4 at 60 bpm: 4 s per bar, 12 s for three bars, no beatsPerBar needed', [four.duration, four.bars.map(b => b.time), four.barQuarters], [12, [0, 4, 8], 4]);
  assert('rests and the grace event make no note; the chord gives two notes at 1 s for 3 s', four.notes.filter(n => n.bar === 1).map(brief), ['lh48@0+2', 'rh72@1+3', 'rh76@1+3']);
  assert('tie "start" → "both" → "stop" across bars 2–3: one D5 of 8 s with three spans', four.notes.filter(n => n.midi === D5).map(n => [n.time, n.duration, n.spans]), [[4, 8, [{ bar: 2, onset: 0 }, { bar: 2, onset: 2 }, { bar: 3, onset: 0 }]]]);
  assert('no tie on the lh G2: re-attacked in bar 3', four.notes.filter(n => n.midi === 43).map(n => n.time), [4, 8]);
  assert('an empty range / unknown bars → nothing', [listenSchedule(FOUR, { from: 9, bpm: 60 }).notes.length, listenSchedule({ bars: [] }, { from: 1, bpm: 60 }).duration], [0, 0]);
  assert('a reversed range is swapped', [listenSchedule(FOUR, { from: 3, to: 1, bpm: 60 }).from, listenSchedule(FOUR, { from: 3, to: 1, bpm: 60 }).to], [1, 3]);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
