/**
 * voicing-playback-model.js
 * =========================
 * Pure playback model for /voicings: turns one bar of a voiced progression
 * (schema v1, tools/voicings/schema.md) into a time-ordered note list, and
 * that list into a schedule in seconds. No DOM, no Tone — Node-runnable like
 * voicing-analysis.js and voicing-staff-model.js. The thin Tone.js player
 * consumes the schedule.
 *
 *   buildPlaybackList(progression, barNumber, { scope, eventIndex, includeMelody })
 *     → { tempo, beatsPerBar, scope, bar, predecessor, leadInStart, notes, warnings }
 *   toSchedule(playback, { arpStepMs })
 *     → { secondsPerQuarter, barStart, duration, notes }
 *   selfTest()                                          → console report, { passed, total }
 *
 * Playback note (quarters, start relative to the selected bar's beat 0):
 *   { midi, name, start, duration, role, event, staffId, leadIn, roll }
 *   role     'bass' | 'voicing' | 'melody' — the staff model's role for the note
 *   event    comp event index for comp-derived notes, else null
 *   staffId  the note's first notehead id on the staff (null for lead-in notes)
 *   leadIn   true for notes of the predecessor bar (negative start)
 *   roll     { index, count } on the members of an arpeggiated attack, else null
 *
 * Bar scope. The notes are the staff model's voices with tied pieces merged,
 * so the bass merge rule is the staff's: bassLine notes only when the bar has
 * a bassLine; comp.bass joins the chord only when it is not a bass-voice note;
 * without a bassLine, comp.bass plays with the event's duration. Tied-in
 * beat-0 tails are not re-attacked: the originating note in the performance
 * predecessor (form.playOrder, first occurrence — the bar model's `prev`)
 * sounds through, and playback starts at the earliest onset among those
 * originating notes, but never more than LEAD_IN_MAX_BEATS before the bar
 * (LEAD-IN). Everything in the predecessor from that point plays; a note
 * already sounding at that point is struck there and held through. The
 * lead-in stays inside the predecessor bar (its own tied-in tails are
 * re-attacked); bar 1 has none. Only voices that will sound take part: with
 * includeMelody false, melody ties neither trigger nor extend the lead-in. A
 * bass carried from the predecessor by the
 * exporter's lookback (comp.bass with no bassLine onset at or before the chord)
 * is held into the bar the same way, through the last comp event that claims it.
 *
 * Event scope. comp.bass + voicing for the event window, plus the melody notes
 * overlapping the window, clipped to it (what the analysis scores). No lead-in.
 *
 * Rolls. An arp-flagged comp event rolls its chord bottom to top. The bass
 * leads the roll only when the bassLine note under the chord is also flagged
 * arp and attacks together with the chord (in bar scope a rolled bass that
 * sounded earlier, e.g. a rolled octave on the downbeat under a chord on beat
 * 2, is not part of the chord's roll). toSchedule spaces the roll ARP_STEP_MS
 * apart, caps the total spread at ROLL_SPREAD_FRACTION of the event's duration,
 * and holds every note to the event end.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/shared/voicing-playback-model.js').then(m => m.selfTest())"
 */

import { parseNote } from './voicing-analysis.js';
import { buildBarModel } from './voicing-staff-model.js';

const EPS = 0.01;                  // beats in the data are rounded to 4 decimals
const DEFAULT_TEMPO = 100;
const ARP_STEP_MS = 35;
const ROLL_SPREAD_FRACTION = 1 / 3;
const LEAD_IN_MAX_BEATS = 1;       // quarters: the lead-in never starts earlier than this before the bar
const ROLE_ORDER = { bass: 0, voicing: 1, melody: 2 };

const midiOf = name => parseNote(name).midi;
const lastOf = list => (list && list.length ? list[list.length - 1] : null);
const near = (a, b) => Math.abs(a - b) < EPS;
const r4 = x => Math.round(x * 10000) / 10000;

// ════════════════════════════════════════════════════════════════════
// NOTES OF ONE BAR
// ════════════════════════════════════════════════════════════════════

/**
 * The bar model's voices as playback notes: rests dropped, pieces linked by
 * tieNext (split durations, ties into the next event of the voice) merged into
 * one note. `tieIn` marks a beat-0 tail of a tie from the predecessor.
 */
function notesFromModel(model) {
  const notes = [];
  for (const events of Object.values(model.voices)) {
    const byId = new Map();
    for (const ev of events) if (!ev.rest) for (const n of ev.notes) byId.set(n.id, { ev, n });
    const consumed = new Set();
    for (const ev of events) {
      if (ev.rest) continue;
      for (const n of ev.notes) {
        if (consumed.has(n.id)) continue;
        let end = ev.beat + ev.q, cur = n;
        while (cur.tieNext && byId.has(cur.tieNext)) {
          const next = byId.get(cur.tieNext);
          consumed.add(next.n.id);
          end = Math.max(end, next.ev.beat + next.ev.q);
          cur = next.n;
        }
        notes.push({
          midi: n.midi, name: n.name, start: ev.beat, duration: end - ev.beat, role: n.role,
          event: ev.event ?? null, staffId: n.id, leadIn: false, roll: null, tieIn: !!n.tieIn,
        });
      }
    }
  }
  return notes;
}

/** The bassLine entry at or most recently before a beat (sounding or not). */
function bassLineAt(bassLine, beat) {
  const prior = (bassLine || []).filter(b => b.beat <= beat + EPS);
  return prior.length ? prior[prior.length - 1] : null;
}

/** roll: { index, count } on the members, bottom to top. */
function assignRoll(members) {
  const sorted = members.slice().sort((a, b) => a.midi - b.midi);
  sorted.forEach((n, i) => { n.roll = { index: i, count: sorted.length }; });
}

/** Bar scope rolls: each arp-flagged comp event's chord notes, plus a bassLine note flagged arp attacking with the chord. */
function assignBarRolls(bar, model, notes) {
  (bar.comp || []).forEach((ev, i) => {
    if (!ev.arp) return;
    const members = notes.filter(n => n.event === i && n.role !== 'bass' && near(n.start, ev.beat));
    if (model.bassFrom === 'bassLine') {
      const bl = bassLineAt(bar.bassLine, ev.beat);
      if (bl && bl.arp && near(bl.beat, ev.beat)) {
        const bass = notes.find(n => n.role === 'bass' && n.midi === midiOf(bl.note) && near(n.start, bl.beat));
        if (bass) members.push(bass);
      }
    }
    if (members.length) assignRoll(members);
  });
}

// ════════════════════════════════════════════════════════════════════
// BAR SCOPE
// ════════════════════════════════════════════════════════════════════

/**
 * A bass the exporter carried from the predecessor: comp.bass of the first comp
 * event with no bassLine onset at or before it, equal to the predecessor's last
 * bassLine note when that note is tied or reaches the bar line (the staff
 * model's prevBassCarry, which keeps the note off this bar's staff).
 * @returns {{ midi:number, end:number }|null}  end = last claiming comp event's end
 */
function carriedBass(bar, model, prevBar) {
  const comp = bar.comp || [];
  if (model.bassFrom !== 'bassLine' || !comp.length || !prevBar) return null;
  const bassLine = bar.bassLine;
  const last = Array.isArray(prevBar.bassLine) ? lastOf(prevBar.bassLine) : null;
  if (!last || !(last.tie || near(last.beat + last.dur, model.beatsPerBar))) return null;
  const midi = midiOf(last.note);
  let end = null;
  for (const ev of comp) {
    if (bassLine.some(b => b.beat <= ev.beat + EPS) || midiOf(ev.bass) !== midi) break;
    end = Math.max(end ?? 0, ev.beat + ev.dur);
  }
  return end == null ? null : { midi, end };
}

function barScope(progression, bar, model, barNotes, includeMelody, warnings) {
  const bpb = model.beatsPerBar;
  const sounding = notes => (includeMelody ? notes : notes.filter(n => n.role !== 'melody'));
  barNotes = sounding(barNotes);
  assignBarRolls(bar, model, barNotes);
  const prevBar = model.prev != null ? (progression.bars || []).find(b => b.bar === model.prev) : null;
  if (!prevBar) return { notes: barNotes, leadInStart: null };

  // The predecessor as a standalone bar (its own tied-in tails re-attack: the lead-in is capped there).
  // Only voices that will sound take part: with the melody off, melody ties neither trigger nor extend the lead-in.
  const prevModel = buildBarModel(progression, model.prev);
  const prevNotes = sounding(notesFromModel(prevModel));
  assignBarRolls(prevBar, prevModel, prevNotes);
  const reaches = n => n.start + n.duration >= bpb - EPS;
  const findHeld = (role, midi) => prevNotes
    .filter(n => n.role === role && n.midi === midi && reaches(n))
    .sort((a, b) => b.start - a.start)[0] || null;

  let T = null;
  const hold = (held, extra) => {
    held.duration += extra;
    held.leadIn = true;
    T = T == null ? held.start : Math.min(T, held.start);
  };

  const keep = [];
  for (const n of barNotes) {
    if (n.tieIn && n.start < EPS) {
      const held = findHeld(n.role, n.midi);
      if (held) { hold(held, n.duration); continue; }        // tail sounds through, not re-attacked
      warnings.push(`bar ${bar.bar}: ${n.role} ${n.name} is tied in but bar ${model.prev} has no ${n.name} reaching the bar line — re-attacked`);
    }
    keep.push(n);
  }
  const carried = carriedBass(bar, model, prevBar);
  if (carried) {
    const held = findHeld('bass', carried.midi);
    if (held) hold(held, carried.end);
    else warnings.push(`bar ${bar.bar}: bass carried from bar ${model.prev} not found there — not held`);
  }
  if (T == null) return { notes: keep, leadInStart: null };
  T = Math.max(T, bpb - LEAD_IN_MAX_BEATS);

  const leadIn = [];
  for (const n of prevNotes) {
    if (n.start + n.duration <= T + EPS) continue;
    const clipped = n.start < T - EPS;
    const start = clipped ? T : n.start;
    leadIn.push({
      ...n, start: start - bpb, duration: n.duration - (start - n.start),
      leadIn: true, staffId: null, event: null, tieIn: false, roll: clipped ? null : n.roll,
    });
  }
  return { notes: [...leadIn, ...keep], leadInStart: T - bpb };
}

// ════════════════════════════════════════════════════════════════════
// EVENT SCOPE
// ════════════════════════════════════════════════════════════════════

function eventScope(bar, model, barNotes, eventIndex, warnings) {
  const comp = bar.comp || [];
  const i = eventIndex == null ? 0 : eventIndex;
  const ev = comp[i];
  if (!ev) { warnings.push(`bar ${bar.bar}: no comp event ${i}`); return []; }
  const end = ev.beat + ev.dur;
  const staffOf = (midi, pred) => { const n = barNotes.find(x => x.midi === midi && pred(x)); return n ? n.staffId : null; };
  const note = (midi, name, start, duration, role, event, staffId) => ({ midi, name, start, duration, role, event, staffId, leadIn: false, roll: null });

  const bassMidi = midiOf(ev.bass);
  const bassStaff = staffOf(bassMidi, n => n.event === i)
    ?? staffOf(bassMidi, n => n.role === 'bass' && n.start <= ev.beat + EPS && n.start + n.duration > ev.beat + EPS)
    ?? staffOf(bassMidi, n => n.role === 'bass' && n.start <= ev.beat + EPS);
  const bass = note(bassMidi, ev.bass, ev.beat, ev.dur, 'bass', i, bassStaff);
  const chord = (ev.voicing || []).map(name => { const m = midiOf(name); return note(m, name, ev.beat, ev.dur, 'voicing', i, staffOf(m, n => n.event === i)); });
  const melody = [];
  for (const m of bar.melody || []) {
    const a = Number(m.beat) || 0, d = Number(m.dur) || 0;
    const overlap = Math.min(a + d, end) - Math.max(a, ev.beat);
    if (overlap <= EPS) continue;
    const midi = midiOf(m.note);
    melody.push(note(midi, m.note, Math.max(a, ev.beat), overlap, 'melody', null, staffOf(midi, n => n.role === 'melody' && near(n.start, a))));
  }
  if (ev.arp) {
    const members = chord.slice();
    const bl = model.bassFrom === 'bassLine' ? bassLineAt(bar.bassLine, ev.beat) : null;
    if (bl && bl.arp && midiOf(bl.note) === bassMidi) members.push(bass);
    if (members.length) assignRoll(members);
  }
  return [bass, ...chord, ...melody];
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC
// ════════════════════════════════════════════════════════════════════

/**
 * @param {object} progression  schema v1 document
 * @param {number} barNumber    written bar number (as everywhere on the page)
 * @param {{ scope?: 'bar'|'event', eventIndex?: number|null, includeMelody?: boolean }} [options]
 */
function buildPlaybackList(progression, barNumber, { scope = 'bar', eventIndex = null, includeMelody = true } = {}) {
  const warnings = [];
  const tempo = Number(progression.tempo) || DEFAULT_TEMPO;
  const out = { tempo, beatsPerBar: null, scope, bar: barNumber, predecessor: null, leadInStart: null, notes: [], warnings };
  const model = buildBarModel(progression, barNumber);
  if (!model) { warnings.push(`bar ${barNumber}: not in the progression`); return out; }
  out.beatsPerBar = model.beatsPerBar;
  out.predecessor = model.prev;
  warnings.push(...model.warnings);
  const bar = progression.bars.find(b => b.bar === barNumber);
  const barNotes = notesFromModel(model);

  let notes;
  if (scope === 'event') {
    notes = eventScope(bar, model, barNotes, eventIndex, warnings);
  } else {
    const res = barScope(progression, bar, model, barNotes, includeMelody, warnings);
    notes = res.notes;
    out.leadInStart = res.leadInStart == null ? null : r4(res.leadInStart);
  }
  if (!includeMelody) notes = notes.filter(n => n.role !== 'melody');

  out.notes = notes
    .sort((a, b) => a.start - b.start || a.midi - b.midi || ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .map(n => ({ midi: n.midi, name: n.name, start: r4(n.start), duration: r4(n.duration), role: n.role,
                 event: n.event ?? null, staffId: n.staffId ?? null, leadIn: !!n.leadIn, roll: n.roll || null }));
  return out;
}

/**
 * Seconds. Time 0 is the first onset (the lead-in start in bar scope, else the
 * bar's beat 0; the event's onset in event scope); `barStart` is where the
 * selected bar's beat 0 falls. Rolls are applied here: members of one attack
 * are offset arpStepMs apart bottom to top, the total spread capped at
 * ROLL_SPREAD_FRACTION of the event's duration, and each note shortened so it
 * still ends with the event.
 */
function toSchedule(playback, { arpStepMs = ARP_STEP_MS } = {}) {
  const spq = 60 / (Number(playback.tempo) || DEFAULT_TEMPO);
  const src = playback.notes || [];
  const minStart = src.length ? Math.min(...src.map(n => n.start)) : 0;
  const origin = playback.scope === 'event' ? minStart : Math.min(0, minStart);
  const notes = src.map(n => ({
    midi: n.midi, name: n.name, role: n.role, event: n.event, staffId: n.staffId, leadIn: n.leadIn, roll: n.roll,
    time: (n.start - origin) * spq, duration: n.duration * spq,
  }));

  const groups = new Map();
  for (const n of notes) {
    if (!n.roll) continue;
    const key = `${n.leadIn ? 'L' : 'B'}:${n.time.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const g of groups.values()) {
    const count = g[0].roll.count;
    if (count < 2) continue;
    const eventDur = Math.min(...g.map(n => n.duration));
    const step = Math.min(arpStepMs / 1000, (eventDur * ROLL_SPREAD_FRACTION) / (count - 1));
    for (const n of g) { const off = step * n.roll.index; n.time += off; n.duration -= off; }
  }

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  for (const n of notes) { n.time = Math.round(n.time * 1e6) / 1e6; n.duration = Math.round(n.duration * 1e6) / 1e6; }
  const duration = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0);
  return { secondsPerQuarter: spq, barStart: -origin * spq, duration, notes };
}

export { buildPlaybackList, toSchedule, ARP_STEP_MS, ROLL_SPREAD_FRACTION, LEAD_IN_MAX_BEATS, selfTest };

if (typeof window !== 'undefined') {
  window.VoicingPlaybackModel = { buildPlaybackList, toSchedule, ARP_STEP_MS, ROLL_SPREAD_FRACTION, LEAD_IN_MAX_BEATS };
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/shared/voicing-playback-model.js').then(m => m.selfTest())"
//
// Runs a synthetic progression, then tests/fixtures/voicing-fixture.json and
// tests/fixtures/voicing-maple-leaf-rag.json, then static/private/dont-be-sad.json
// when that file exists.

async function selfTest() {
  const fs = await import('node:fs');
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const near1 = (label, actual, expected, eps = 1e-6) => {
    const pass = typeof actual === 'number' && Math.abs(actual - expected) <= eps;
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${actual}\n      expected: ${expected}`);
  };
  const brief = n => `${n.role[0]}:${n.name}@${n.start}+${n.duration}${n.leadIn ? '←' : ''}${n.roll ? `[${n.roll.index}/${n.roll.count}]` : ''}`;
  const names = ns => ns.map(brief);
  const role = (ns, r) => ns.filter(n => n.role === r);
  const minStart = ns => Math.min(...ns.map(n => n.start));
  const dupes = ns => ns.filter((a, i) => ns.some((b, j) => j < i && b.midi === a.midi && near(b.start, a.start))).map(brief);
  const withinBar = (p, ns) => ns.every(n => n.leadIn ? n.start >= -p.beatsPerBar - EPS : n.start >= -EPS && n.start + n.duration <= p.beatsPerBar + EPS);
  const positive = ns => ns.every(n => n.duration > EPS);
  const bar = (prog, n, o) => buildPlaybackList(prog, n, o);

  console.log('\n─── voicing-playback-model.js self-test ───\n');

  // ── Synthetic: C major, 4/4, 120 bpm (0.5 s per quarter) ─────────
  const SYN = {
    schemaVersion: 1, title: 'synthetic', key: 'C', timeSignature: '4/4', beatsPerBar: 4, tempo: 120,
    bars: [
      { bar: 1, section: 'A', source: 'user', symbols: [{ beat: 0, symbol: 'C' }], annotation: null,
        comp: [{ beat: 0, dur: 4, bass: 'C2', voicing: ['E3', 'G3'], tie: true }],
        bassLine: [{ beat: 0, dur: 4, note: 'C2', tie: true }],
        melody: [{ beat: 0, dur: 2, note: 'E4' }, { beat: 2, dur: 2, note: 'G4', tie: true }] },
      { bar: 2, section: 'A', source: 'user', symbols: [{ beat: 0, symbol: 'C' }, { beat: 2, symbol: 'Dm' }], annotation: null,
        comp: [{ beat: 0, dur: 2, bass: 'C2', voicing: ['E3', 'G3'] }, { beat: 2, dur: 2, bass: 'D2', voicing: ['F3', 'A3'], arp: true }],
        bassLine: [{ beat: 0, dur: 2, note: 'C2' }, { beat: 2, dur: 2, note: 'D2', arp: true }],
        melody: [{ beat: 0, dur: 1, note: 'G4' }, { beat: 1, dur: 3, note: 'A4' }] },
      { bar: 3, section: 'A', source: 'user', symbols: [{ beat: 0, symbol: 'Em' }], annotation: null,
        comp: [{ beat: 1, dur: 0.25, bass: 'E2', voicing: ['G3', 'B3', 'E4'], arp: true }],
        bassLine: [{ beat: 0, dur: 4, note: 'E2', arp: true }],
        melody: [{ beat: 0, dur: 1.5, note: 'B4' }, { beat: 1.5, dur: 2.5, note: 'C5' }] },
      { bar: 4, section: 'A', source: 'user', symbols: [{ beat: 0, symbol: 'Am' }], annotation: null,
        comp: [{ beat: 0, dur: 4, bass: 'A1', voicing: ['C3', 'E3'] }],
        melody: [] },                                            // no bassLine (hand-written)
      { bar: 5, section: 'A', source: 'user', symbols: [{ beat: 0, symbol: 'Dm/F' }], annotation: null,
        comp: [{ beat: 0, dur: 4, bass: 'F3', voicing: ['A3', 'D4'] }],
        bassLine: [],                                              // comp.bass is a chord note
        melody: [] },
      { bar: 6, section: 'B', source: 'user', symbols: [{ beat: 0, symbol: 'G' }], annotation: null,
        comp: [{ beat: 2, dur: 2, bass: 'G2', voicing: ['B3', 'D4'] }],
        bassLine: [{ beat: 0, dur: 4, note: 'G2' }],
        melody: [{ beat: 0, dur: 4, note: 'D5' }] },
      { bar: 7, section: 'B', source: 'user', symbols: [], annotation: null,
        comp: [{ beat: 0, dur: 2, bass: 'G2', voicing: ['B3', 'D4'] }, { beat: 2, dur: 2, bass: 'G2', voicing: ['B3', 'F4'] }],
        bassLine: [],                                              // bass carried from bar 6 by lookback
        melody: [] },
      { bar: 8, section: 'B', source: 'user', symbols: [{ beat: 0, symbol: 'C' }], annotation: null,
        comp: [{ beat: 0, dur: 4, bass: 'C2', voicing: ['E3', 'G3'] }],
        bassLine: [{ beat: 0, dur: 2, note: 'C2' }, { beat: 2, dur: 2, note: 'G2' }],
        melody: [{ beat: 0, dur: 3, note: 'E5' }, { beat: 3, dur: 1, note: 'D5', tie: true }] },
      { bar: 9, section: 'B', source: 'user', symbols: [{ beat: 0, symbol: 'C' }], annotation: null,
        comp: [{ beat: 0, dur: 4, bass: 'C2', voicing: ['E3', 'G3'] }],
        bassLine: [{ beat: 0, dur: 4, note: 'C2' }],
        melody: [{ beat: 0, dur: 2, note: 'D5' }, { beat: 2, dur: 2, note: 'C5' }] },
    ],
  };
  const S = n => bar(SYN, n);

  console.log('  synthetic');
  assert('bar 1: three voices merged in time order, bass once (bassLine covers comp.bass)',
    names(S(1).notes), ['b:C2@0+4', 'v:E3@0+4', 'v:G3@0+4', 'm:E4@0+2', 'm:G4@2+2']);
  assert('bar 1: no predecessor, no lead-in',               [S(1).predecessor, S(1).leadInStart], [null, null]);
  assert('bar 1: staffIds come from the bar model',          S(1).notes.map(n => n.staffId), ['vs-b1-bass-0', 'vs-b1-lower-0', 'vs-b1-lower-1', 'vs-b1-melody-0', 'vs-b1-melody-1']);
  const s2 = S(2);
  assert('bar 2: earliest tied onset is bar 1 beat 0, capped at one beat before the bar', s2.leadInStart, -1);
  assert('bar 2: tails not re-attacked; originating notes struck at the lead-in start and held through (C2 1+2, E3/G3 1+2, G4 1+1); E4 ended before it',
    names(s2.notes.filter(n => n.leadIn)), ['b:C2@-1+3←', 'v:E3@-1+3←', 'v:G3@-1+3←', 'm:G4@-1+2←']);
  assert('bar 2: nothing of its own at beat 0; own notes from beat 1',
    names(s2.notes.filter(n => !n.leadIn)), ['m:A4@1+3', 'b:D2@2+2[0/3]', 'v:F3@2+2[1/3]', 'v:A3@2+2[2/3]']);
  assert('bar 2: lead-in notes carry no staffId or event',    s2.notes.filter(n => n.leadIn).map(n => [n.staffId, n.event]), [[null, null], [null, null], [null, null], [null, null]]);
  assert('bar 2: bass leads the roll (bassLine arp, attacks with the chord)', s2.notes.find(n => n.name === 'D2').roll, { index: 0, count: 3 });
  const s3 = S(3);
  assert('bar 3: rolled bass on the downbeat is not in the chord roll on beat 2',
    names(s3.notes), ['b:E2@0+4', 'm:B4@0+1.5', 'v:G3@1+0.25[0/3]', 'v:B3@1+0.25[1/3]', 'v:E4@1+0.25[2/3]', 'm:C5@1.5+2.5']);
  assert('bar 3: includeMelody false removes role melody only', names(bar(SYN, 3, { includeMelody: false }).notes), ['b:E2@0+4', 'v:G3@1+0.25[0/3]', 'v:B3@1+0.25[1/3]', 'v:E4@1+0.25[2/3]']);
  assert('bar 4: no bassLine → comp.bass with the event duration', names(S(4).notes), ['b:A1@0+4', 'v:C3@0+4', 'v:E3@0+4']);
  assert('bar 5: comp.bass that is a chord note plays once, with the chord', names(S(5).notes), ['v:F3@0+4', 'v:A3@0+4', 'v:D4@0+4']);
  const s7 = S(7);
  assert('bar 7: bass carried from bar 6 is struck at the cap and held through both claiming events (1 + 4)', names(s7.notes.filter(n => n.leadIn)), ['b:G2@-1+5←', 'v:B3@-1+1←', 'v:D4@-1+1←', 'm:D5@-1+1←']);
  assert('bar 7: lead-in start capped at -1 (the held bass began at -4)', s7.leadInStart, -1);
  assert('bar 7: own notes are the chords only (no bass on the staff, none re-struck)', names(s7.notes.filter(n => !n.leadIn)), ['v:B3@0+2', 'v:D4@0+2', 'v:B3@2+2', 'v:F4@2+2']);
  const s9 = S(9);
  assert('bar 9: lead-in from beat 3 of bar 8 (within the cap); notes already sounding there are struck at it',
    names(s9.notes.filter(n => n.leadIn)), ['b:G2@-1+1←', 'v:E3@-1+1←', 'v:G3@-1+1←', 'm:D5@-1+3←']);
  assert('bar 9: lead-in start -1',                           s9.leadInStart, -1);
  assert('bar 9: own melody starts at beat 2 (the beat-0 tail is the lead-in note)', names(s9.notes.filter(n => !n.leadIn)), ['b:C2@0+4', 'v:E3@0+4', 'v:G3@0+4', 'm:C5@2+2']);
  assert('synthetic: no warnings',                            SYN.bars.flatMap(b => S(b.bar).warnings), []);

  // event scope
  const e3 = bar(SYN, 3, { scope: 'event', eventIndex: 0 });
  assert('event: bar 3 event 0 = comp.bass + voicing for the window, melody clipped to it, bass leads the roll',
    names(e3.notes), ['b:E2@1+0.25[0/4]', 'v:G3@1+0.25[1/4]', 'v:B3@1+0.25[2/4]', 'v:E4@1+0.25[3/4]', 'm:B4@1+0.25']);
  assert('event: no lead-in; staffIds resolved (bass from the bassLine note sounding, chord from the event, melody from its onset)',
    [e3.leadInStart, e3.notes.map(n => n.staffId)], [null, ['vs-b3-bass-0', 'vs-b3-lower-0', 'vs-b3-lower-1', 'vs-b3-upper-0', 'vs-b3-melody-0']]);
  const e2 = bar(SYN, 2, { scope: 'event', eventIndex: 0 });
  assert('event: bar 2 event 0 re-attacks the tied-in chord (event scope has no lead-in)', names(e2.notes), ['b:C2@0+2', 'v:E3@0+2', 'v:G3@0+2', 'm:G4@0+1', 'm:A4@1+1']);
  assert('event: bar 2 event 1 without melody',               names(bar(SYN, 2, { scope: 'event', eventIndex: 1, includeMelody: false }).notes), ['b:D2@2+2[0/3]', 'v:F3@2+2[1/3]', 'v:A3@2+2[2/3]']);
  assert('event: missing event index → empty with a warning', (p => [p.notes, p.warnings])(bar(SYN, 4, { scope: 'event', eventIndex: 3 })), [[], ['bar 4: no comp event 3']]);

  // toSchedule
  const t2 = toSchedule(s2);
  near1('schedule: bar 2 time 0 is the lead-in start, barStart 0.5 s (1 quarter at 120)', t2.barStart, 0.5);
  near1('schedule: bar 2 total duration 2.5 s (one beat of bar 1 + bar 2)',  t2.duration, 2.5);
  const roll2 = t2.notes.filter(n => n.roll).map(n => [n.name, n.time, n.duration]);
  assert('schedule: bar 2 roll D2 F3 A3 at 35 ms steps, held to the event end',
    roll2.map(([n, t, d]) => [n, Math.round((t - 1.5) * 1000), Math.round((t + d) * 1000)]), [['D2', 0, 2500], ['F3', 35, 2500], ['A3', 70, 2500]]);
  const t3 = toSchedule(s3);
  const roll3 = t3.notes.filter(n => n.roll);
  near1('schedule: bar 3 short event (0.125 s) caps the spread at 1/3 of it',  roll3[2].time - roll3[0].time, 0.125 / 3);
  near1('schedule: bar 3 roll members still end together',                     Math.max(...roll3.map(n => n.time + n.duration)) - Math.min(...roll3.map(n => n.time + n.duration)), 0);
  assert('schedule: arpStepMs option changes the step',                        (s => Math.round((s.notes.filter(n => n.roll)[1].time - s.notes.filter(n => n.roll)[0].time) * 1000))(toSchedule(s2, { arpStepMs: 50 })), 50);
  const te = toSchedule(e3);
  assert('schedule: event scope starts at the event onset (time 0), barStart negative',  [te.notes[0].time, te.barStart], [0, -0.5]);
  near1('schedule: bar 1 without lead-in starts at beat 0',                    toSchedule(S(1)).barStart, 0);

  // ── Fixtures ─────────────────────────────────────────────────────
  const load = rel => { const u = new URL(rel, import.meta.url); return fs.existsSync(u) ? JSON.parse(fs.readFileSync(u, 'utf8')) : null; };
  const invariants = (label, prog) => {
    const all = prog.bars.map(b => bar(prog, b.bar));
    assert(`${label}: no note attacked twice at the same onset (comp.bass never re-strikes the bass)`, all.flatMap(p => dupes(p.notes)), []);
    assert(`${label}: every note inside its bar (lead-in inside the predecessor), positive durations`, all.every(p => withinBar(p, p.notes) && positive(p.notes)), true);
    assert(`${label}: every own note has a staffId; lead-in notes have none`, all.every(p => p.notes.every(n => n.leadIn ? n.staffId === null : typeof n.staffId === 'string')), true);
    assert(`${label}: no playback warnings`, all.flatMap(p => p.warnings), []);
    const events = prog.bars.flatMap(b => (b.comp || []).map((_, i) => bar(prog, b.bar, { scope: 'event', eventIndex: i })));
    assert(`${label}: event scope — bass + voicing at the onset, melody within the window, no lead-in`,
      events.every(p => p.leadInStart === null && positive(p.notes) && p.notes.every(n => !n.leadIn)), true);
  };

  const fixture = load('../../tests/fixtures/voicing-fixture.json');
  console.log('\n  fixture: tests/fixtures/voicing-fixture.json');
  invariants('fixture', fixture);
  assert('fixture bar 5 (no bassLine): two events, comp.bass with each event', names(bar(fixture, 5).notes).filter(s => s.startsWith('b:')), ['b:F3@0+2', 'b:F3@2+2']);

  const rag = load('../../tests/fixtures/voicing-maple-leaf-rag.json');
  console.log('\n  rag: tests/fixtures/voicing-maple-leaf-rag.json');
  invariants('rag', rag);
  const R = (n, o) => bar(rag, n, o);
  assert('rag bar 1: bass from bassLine (A♭2 at 0, A2 at 1.5), not re-struck under the chords', names(role(R(1).notes, 'bass')), ['b:A♭2@0+0.5', 'b:A2@1.5+0.5']);
  assert('rag bar 1: chords at 0.5 and 1, melody six notes, no lead-in',  [role(R(1).notes, 'voicing').length, role(R(1).notes, 'melody').length, R(1).leadInStart], [6, 6, null]);
  assert('rag bar 9 (empty bassLine): comp.bass is a chord note, plays once per event', names(R(9).notes).filter(s => s.includes('D4')).length, (rag.bars.find(b => b.bar === 9).comp.filter(e => e.bass === 'D4').length));
  assert('rag bar 10: melody tied in from bar 9 → lead-in from that note',  [R(10).predecessor, R(10).leadInStart < 0, R(10).notes.filter(n => n.leadIn && n.role === 'melody').length], [9, true, 1]);
  assert('rag (2/4): every lead-in starts within one quarter of the bar', rag.bars.map(b => R(b.bar).leadInStart).filter(x => x != null).every(x => x >= -LEAD_IN_MAX_BEATS - EPS), true);
  assert('rag lead-in starts (melody on): sixteenth-note ties, all -0.25', rag.bars.map(b => [b.bar, R(b.bar).leadInStart]).filter(([, x]) => x != null), [[10, -0.25], [11, -0.25], [13, -0.25], [14, -0.25], [15, -0.25]]);
  assert('rag bars 16 and 17: predecessor 15 via playOrder, no lead-in',    [R(16).predecessor, R(17).predecessor, R(16).leadInStart, R(17).leadInStart], [15, 15, null, null]);
  assert('rag bar 1 on the repeat is still bar 1: predecessor null (first occurrence)', R(1).predecessor, null);
  assert('rag bar 17 event 2: bass A♭3 is a chord note; event scope still names it bass', names(R(17, { scope: 'event', eventIndex: 2, includeMelody: false }).notes), ['b:A♭3@1+0.5', 'v:C4@1+0.5']);
  near1('rag schedule: 88 bpm → 0.6818 s per quarter', toSchedule(R(1)).secondsPerQuarter, 60 / 88);
  assert('rag: melody off → no lead-ins at all (the rag ties only melody)', rag.bars.filter(b => R(b.bar, { includeMelody: false }).leadInStart != null).map(b => b.bar), []);
  const ragOn = rag.bars.filter(b => R(b.bar).leadInStart != null).map(b => b.bar);
  console.log(`  (rag lead-ins with melody on: ${ragOn.length} bars — ${ragOn.join(' ')}; melody off: 0)`);

  const prog = load('../../static/private/dont-be-sad.json');
  if (prog) {
    console.log('\n  acceptance: static/private/dont-be-sad.json');
    invariants('private', prog);
    const P = (n, o) => bar(prog, n, o);
    const p4 = P(4);
    assert('bar 4: tied bass and chord from bar 3 → lead-in capped at -1; both struck there and held across the bar line', [p4.leadInStart, names(p4.notes.filter(n => n.leadIn))],
      [-1, ['b:E♭3@-1+2←', 'v:G3@-1+2←', 'v:B♭3@-1+2←', 'v:D4@-1+2←']]);
    assert('bar 4: nothing re-attacked at beat 0; the walk follows',   names(p4.notes.filter(n => !n.leadIn)), ['b:D3@1+1', 'b:E3@2+0.5', 'b:D3@2.5+0.5']);
    assert('bar 1: no lead-in',                                        [P(1).predecessor, P(1).leadInStart], [null, null]);
    assert('bar 25: dotted-half bass on the downbeat under the chord from beat 1, no lead-in (bar 24 ties nothing)',
      [P(25).leadInStart, names(P(25).notes).slice(0, 4)], [null, ['b:G2@0+3', 'm:D4@0+1', 'v:F3@1+2', 'v:B♭3@1+2']]);
    assert('bar 26: one held F2 under both chords; lead-in from bar 25 beat 2.5 (tied melody C5) clips bar 25\'s bass',
      names(role(P(26).notes, 'bass')), ['b:G2@-0.5+0.5←', 'b:F2@0+3']);
    const p27 = P(27);
    assert('bar 27: melody B♭4 tied in → lead-in from bar 26 beat 2.5; bass and second chord clipped to start there',
      [p27.leadInStart, names(p27.notes.filter(n => n.leadIn))], [-0.5, ['b:F2@-0.5+0.5←', 'v:A♭3@-0.5+0.5←', 'v:D4@-0.5+0.5←', 'm:B♭4@-0.5+2.5←']]);
    assert('bar 27: own notes start with the bass at 0, no melody at 0', names(p27.notes.filter(n => !n.leadIn)), ['b:E♭2@0+3', 'v:G3@1+2', 'v:B♭3@1+2', 'v:D4@1+2']);
    const p17 = P(17);
    assert('bar 17: rolled bass D3 on the downbeat is alone (roll null); chord on beat 2 rolls three',
      names(p17.notes.filter(n => n.role !== 'melody')), ['b:D3@0+3', 'v:F♯3@1+2[0/3]', 'v:G3@1+2[1/3]', 'v:A3@1+2[2/3]']);
    assert('bar 17 event 0: bass leads the roll (bassLine arp)',       names(P(17, { scope: 'event', eventIndex: 0, includeMelody: false }).notes), ['b:D3@1+2[0/4]', 'v:F♯3@1+2[1/4]', 'v:G3@1+2[2/4]', 'v:A3@1+2[3/4]']);
    assert('bar 26 event 0: melody C5 clipped to the 1-beat window, event 1 melody C5 at 2',
      [names(role(P(26, { scope: 'event', eventIndex: 0 }).notes, 'melody')), names(role(P(26, { scope: 'event', eventIndex: 1 }).notes, 'melody'))], [['m:C5@1+1'], ['m:C5@2+0.5', 'm:B♭4@2.5+0.5']]);
    assert('bar 21: predecessor 20 (first occurrence), lead-in none',   [P(21).predecessor, P(21).leadInStart], [20, null]);
    const p26off = P(26, { includeMelody: false });
    assert('bar 26, melody off: no lead-in from the tied C5; nothing of bar 25 clipped in',
      [p26off.leadInStart, names(p26off.notes)], [null, ['b:F2@0+3', 'v:A3@1+1', 'v:D4@1+1', 'v:F♯4@1+1', 'v:A♭3@2+1', 'v:D4@2+1']]);
    assert('bar 26, melody on: half-beat melody tie unchanged at -0.5 (under the cap), bar 25 bass struck there',
      [P(26).leadInStart, names(role(P(26).notes, 'bass'))], [-0.5, ['b:G2@-0.5+0.5←', 'b:F2@0+3']]);
    const p4off = P(4, { includeMelody: false });
    assert('bar 4, melody off: comp and bass ties still give the (capped) lead-in',
      [p4off.leadInStart, names(p4off.notes.filter(n => n.leadIn))], [-1, ['b:E♭3@-1+2←', 'v:G3@-1+2←', 'v:B♭3@-1+2←', 'v:D4@-1+2←']]);
    const synOff = bar(SYN, 9, { includeMelody: false });
    assert('synthetic bar 9, melody off: its only tie-in is melody → no lead-in, bar 8 untouched',
      [synOff.leadInStart, names(synOff.notes)], [null, ['b:C2@0+4', 'v:E3@0+4', 'v:G3@0+4']]);
    near1('bar 4 schedule: barStart = 1 quarter at 93 bpm',           toSchedule(p4).barStart, 60 / 93);
    assert('private: every lead-in starts within one quarter of the bar', prog.bars.map(b => P(b.bar).leadInStart).filter(x => x != null).every(x => x >= -LEAD_IN_MAX_BEATS - EPS), true);
    const leadIns = prog.bars.filter(b => P(b.bar).leadInStart != null).map(b => b.bar);
    const leadInsOff = prog.bars.filter(b => P(b.bar, { includeMelody: false }).leadInStart != null).map(b => b.bar);
    console.log(`  (lead-ins with melody on: ${leadIns.length} bars — ${leadIns.join(' ')})`);
    console.log(`  (lead-ins with melody off: ${leadInsOff.length} bars — ${leadInsOff.join(' ')})`);
  } else {
    console.log('\n  acceptance: static/private/dont-be-sad.json not present — skipped');
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
