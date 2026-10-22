/**
 * cycle-of-shells-staff.js
 * ========================
 * Pure helper for the game's staff panel (no DOM, no Verovio): turns one or
 * two shell chords into the MEI string the shared staff model engraves
 * (voicing-staff-model.js: buildBarModel + toMEI), with the game's
 * conventions on top:
 *   - no key signature (the bar is in C) and every accidental written on its
 *     own chord. The shared model carries an accidental through the bar, as
 *     notation does; here each slot is a separate chord, so flats and sharps
 *     are put back on every note that has one, and a natural the carry rule
 *     adds (B after B♭ on the same line) is kept;
 *   - split at middle C: notes below C4 on the bass staff, C4 and above on
 *     the treble (the shared default is E4);
 *   - whole notes in an 8/4 bar (two slots: previous, current) or a 4/4 bar
 *     (one slot: the notes being held). The shared model always writes a
 *     time signature and fills empty slots with rests; the page hides both
 *     with CSS;
 *   - bass gold, every other note blue (the page passes its own shades). A
 *     bass at or above C4 (a right hand held alone) is drawn on the treble
 *     with the voicing; the shared model colours it blue there, so its id
 *     comes back in goldIds for the page to recolour after rendering;
 *   - a chord may be marked `dim`: its notehead ids come back so the page can
 *     fade them after Verovio has rendered (MEI has no per-note opacity).
 *
 *   staffMEI(chords, { slots = 2, colors }) → { mei, dimIds, goldIds, noteIds, notes, empty }
 *     chords: up to `slots` entries, right-aligned — the last entry sits in the
 *       last slot, so the current chord is always on the right:
 *       { bass: 'D2' | null, voicing: ['F3', 'C4'], dim?: boolean }
 *       bass null: no bass voice; every note is drawn as a voicing note.
 *   heldChord(names) → { bass, voicing } | null
 *     names: spelled notes with octaves, any order. The lowest is the bass, as
 *     the keyboard colours it.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/games/cycle-of-shells-staff.js').then(m => m.selfTest())"
 */

import { buildBarModel, toMEI } from '../shared/voicing-staff-model.js';
import { parseNote } from '../shared/voicing-analysis.js';

const SPLIT_MIDI = 60;          // middle C: below → bass staff, at or above → treble
const SLOT_BEATS = 4;           // one whole note per slot
const COLORS = { bass: '#8F6600', voicing: '#2B6FA3' };   // the game page's key fills (WCAG AA on #FCFBF8)

const midiOf = name => { const p = parseNote(name); return p && p.midi != null ? p.midi : NaN; };

/** The lowest note is the bass (as the keyboard colours it); the rest is the voicing. */
function heldChord(names) {
  const sorted = [...new Set((names || []).filter(n => Number.isFinite(midiOf(n))))].sort((a, b) => midiOf(a) - midiOf(b));
  if (!sorted.length) return null;
  return { bass: sorted[0], voicing: sorted.slice(1) };
}

/**
 * @param {Array<{ bass: string|null, voicing: string[], dim?: boolean }>} chords
 * @param {{ slots?: number, colors?: { bass?: string, voicing?: string } }} [options]
 */
function staffMEI(chords, { slots = 2, colors = {} } = {}) {
  const list = (chords || []).filter(Boolean).slice(-slots);
  const beats = slots * SLOT_BEATS;
  const comp = [], bassLine = [];
  const dimBeats = new Set(), goldBeats = new Set();
  list.forEach((ch, i) => {
    const beat = (slots - list.length + i) * SLOT_BEATS;
    const voicing = [...new Set(ch.voicing || [])].sort((a, b) => midiOf(a) - midiOf(b));
    if (ch.bass && midiOf(ch.bass) < SPLIT_MIDI) {
      comp.push({ beat, dur: SLOT_BEATS, bass: ch.bass, bassSource: 'voice', voicing });
      bassLine.push({ beat, dur: SLOT_BEATS, note: ch.bass });
    } else if (ch.bass) {
      // A bass at or above middle C belongs on the treble: with no bassLine entry at
      // this beat the model draws comp.bass with the voicing (blue); goldIds recolours it.
      comp.push({ beat, dur: SLOT_BEATS, bass: ch.bass, bassSource: 'voice', voicing });
      goldBeats.add(beat);
    } else if (voicing.length) {
      // No bass voice: comp.bass must be a note (the model reads it), so the lowest
      // voicing note stands in and is drawn with the rest.
      comp.push({ beat, dur: SLOT_BEATS, bass: voicing[0], bassSource: 'inferred', voicing: voicing.slice(1) });
    } else {
      return;
    }
    if (ch.dim) dimBeats.add(beat);
  });
  const progression = {
    schemaVersion: 1, key: 'C', timeSignature: `${beats}/4`, beatsPerBar: beats,
    bars: [{ bar: 1, symbols: [], comp, bassLine, melody: [] }],
  };
  const model = buildBarModel(progression, 1, { split: SPLIT_MIDI });
  const bassAt = new Map(comp.map(ev => [ev.beat, ev.bass]));
  const notes = [];
  for (const events of Object.values(model.voices)) for (const ev of events) {
    if (ev.rest) continue;
    for (const n of ev.notes) {
      if (n.acc) n.accidShow = n.acc;   // each chord carries its own accidentals; a carry-rule natural stays
      const gold = goldBeats.has(ev.beat) && n.name === bassAt.get(ev.beat);
      notes.push({ id: n.id, name: n.name, role: gold ? 'bass' : n.role, drawnAs: n.role, beat: ev.beat, dim: dimBeats.has(ev.beat), gold });
    }
  }
  return {
    mei: toMEI(model, { ...COLORS, ...colors }),
    dimIds: notes.filter(n => n.dim).map(n => n.id),
    goldIds: notes.filter(n => n.gold).map(n => n.id),
    noteIds: notes.map(n => n.id),
    notes,
    empty: notes.length === 0,
  };
}

export { staffMEI, heldChord, SPLIT_MIDI, COLORS, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  let passed = 0, total = 0;
  const assert = (name, actual, expected) => {
    total++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) passed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    got:      ${JSON.stringify(actual)}\n    expected: ${JSON.stringify(expected)}`}`);
  };
  const attrs = (mei, id) => (mei.match(new RegExp(`<note xml:id="${id}"[^>]*/>`)) || [''])[0];
  const count = (s, re) => (s.match(re) || []).length;
  console.log('cycle-of-shells-staff selfTest');

  // Guided: Dm7 (faded) → G7, both under middle C except C4.
  let r = staffMEI([{ bass: 'D2', voicing: ['F3', 'C4'], dim: true }, { bass: 'G2', voicing: ['F3', 'B3'] }]);
  assert('two chords: six noteheads, three dimmed (the previous chord)', [r.noteIds.length, r.dimIds.length, r.empty], [6, 3, false]);
  assert('dim ids are the first chord\'s bass and voicing notes', r.notes.filter(n => n.dim).map(n => n.name).sort(), ['C4', 'D2', 'F3']);
  assert('split at middle C: C4 on the treble, F3 on the bass staff', [r.notes.find(n => n.name === 'C4').id.includes('upper'), r.notes.find(n => n.name === 'F3').id.includes('lower')], [true, true]);
  assert('whole notes everywhere, no ties, no chord symbols', [count(r.mei, /dur="1"/g) > 0, count(r.mei, /dur="[^1]"/g), count(r.mei, /<tie/g), count(r.mei, /<harm/g)], [true, 0, 0, 0]);
  assert('no key signature (C), 8/4 bar', [count(r.mei, /keysig="0"/g), count(r.mei, /meter.count="8"/g)], [2, 2]);
  assert('bass gold, voicing blue (page shades)', [attrs(r.mei, r.notes.find(n => n.name === 'G2').id).includes('color="#8F6600"'), attrs(r.mei, r.notes.find(n => n.name === 'B3').id).includes('color="#2B6FA3"')], [true, true]);
  assert('colors option overrides', staffMEI([{ bass: 'C2', voicing: ['E3'] }], { colors: { bass: '#123456' } }).mei.includes('color="#123456"'), true);

  // Accidentals: each chord shows its own; a natural after a flat on the same line stays.
  r = staffMEI([{ bass: 'A♭2', voicing: ['G♭3', 'C♭4'], dim: true }, { bass: 'D♭2', voicing: ['F3', 'C♭4'] }]);
  const cb = r.notes.filter(n => n.name === 'C♭4').map(n => attrs(r.mei, n.id).includes('accid="f"'));
  assert('C♭4 shows its flat in both chords (no carry)', cb, [true, true]);
  assert('A♭2, G♭3, D♭2 flats written; F3 plain', r.notes.filter(n => n.name !== 'C♭4').map(n => `${n.name}:${attrs(r.mei, n.id).includes('accid="f"')}`).sort(), ['A♭2:true', 'D♭2:true', 'F3:false', 'G♭3:true']);
  r = staffMEI([{ bass: 'C2', voicing: ['E3', 'B♭3'], dim: true }, { bass: 'C2', voicing: ['E3', 'B3'] }]);
  assert('B3 after B♭3 on the same line gets a natural', attrs(r.mei, r.notes.filter(n => n.name === 'B3')[0].id).includes('accid="n"'), true);
  r = staffMEI([{ bass: 'F♯2', voicing: ['E3', 'A♯3'] }]);
  assert('sharps written', r.notes.map(n => `${n.name}:${attrs(r.mei, n.id).includes('accid="s"')}`).sort(), ['A♯3:true', 'E3:false', 'F♯2:true']);

  // One chord in two slots sits on the right (a rest fills the first slot).
  r = staffMEI([{ bass: 'D2', voicing: ['F3', 'C4'] }]);
  assert('first chord of a lap: three notes at beat 4, nothing dimmed', [r.notes.map(n => n.beat), r.dimIds], [[4, 4, 4], []]);
  assert('the first slot is a rest (the bass voice\'s copy hidden as a space under the voicing\'s rest)', [/<staff n="2"><layer n="1"><rest dur="1"\/><note/.test(r.mei), /<layer n="2"><space dur="1"\/><note/.test(r.mei)], [true, true]);

  // Held notes: one slot.
  assert('heldChord: the lowest note is the bass', heldChord(['C4', 'D2', 'F3']), { bass: 'D2', voicing: ['F3', 'C4'] });
  assert('heldChord: a right hand alone — the lowest is still the bass', heldChord(['F4', 'D4']), { bass: 'D4', voicing: ['F4'] });
  assert('heldChord: nothing held → null', [heldChord([]), heldChord(null)], [null, null]);
  r = staffMEI([heldChord(['D4', 'F4'])], { slots: 1 });
  assert('bass at or above C4: drawn on the treble with the voicing, flagged gold for the page', [r.notes.map(n => `${n.name}:${n.role}:${n.drawnAs}`), r.notes.every(n => n.id.includes('upper')), r.goldIds.length, count(r.mei, /meter.count="4"/g)], [['D4:bass:voicing', 'F4:voicing:voicing'], true, 1, 2]);
  assert('…the gold id is D4\'s', r.notes.find(n => n.id === r.goldIds[0]).name, 'D4');
  r = staffMEI([{ bass: null, voicing: ['D4', 'F4'] }], { slots: 1 });
  assert('bass null: both drawn as voicing, nothing gold', [r.notes.map(n => n.role), r.goldIds], [['voicing', 'voicing'], []]);
  r = staffMEI([{ bass: 'D2', voicing: ['F3', 'C4'] }], { slots: 1 });
  assert('a normal bass: no gold ids (the model colours it)', r.goldIds, []);
  r = staffMEI([heldChord(['D2'])], { slots: 1 });
  assert('a lone bass note: one gold note on the bass staff', [r.notes.map(n => `${n.name}:${n.role}`), attrs(r.mei, r.notes[0].id).includes('color="#8F6600"')], [['D2:bass'], true]);
  r = staffMEI([], { slots: 1 });
  assert('nothing held: an empty staff (whole-bar rests only)', [r.empty, r.noteIds, count(r.mei, /<mRest\/>/g), count(r.mei, /<note/g)], [true, [], 2, 0]);
  r = staffMEI([null, heldChord([])], { slots: 1 });
  assert('null entries are skipped', r.empty, true);

  console.log(`\n${passed}/${total} passed`);
  return { passed, total };
}
