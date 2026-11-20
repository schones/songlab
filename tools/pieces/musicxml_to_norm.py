#!/usr/bin/env python3
"""
musicxml_to_norm.py — convert a two-staff piano MusicXML score (Soundslice,
MuseScore; .musicxml / .xml, or compressed .mxl) into norm, the per-bar JSON
the follow-along player loads (see README.md). Standard library only. The
measure reader is lifted from mxl_to_norm.py (the Audiveris converter, which
stays as it is); rests, validation and the --clef / --lines parsers are
midi_to_norm.py's.

Importer rules
  1. Part and hands. The score's single two-staff part is read, whatever it
     is named: staff 1 → rh, staff 2 → lh; `voice` is always []. With several
     parts, the only two-staff part is taken; anything else is refused.
  2. Bars. Bars are numbered by position (1, 2, 3, …), not by the file's
     measure numbers. --bars FROM-TO imports that range renumbered from 1;
     clefs, lines, key, time and tempo are resolved as they stand at the
     first bar of the range.
  3. Notes. Onsets and durations are exact fractions of the file's
     <divisions>. Voices within a staff are flattened: notes with the same
     onset, duration and tie state become one event (pitches low → high);
     others stay separate events, longer first. A note tied to the same
     pitch later in the same bar is written as one note of the summed length
     (as midi_to_norm writes sounding spans; the player splits and ties it
     again by the meter); ties across a bar line are start / stop / both. Pitches are spelled as the
     file spells them (<step>, <alter>, <octave>); MusicXML pitches are
     sounding pitches, so ottava marks are not applied again. Cue notes are
     skipped. Grace notes become { "grace": [...] } before the event they
     ornament.
  4. Rests. The file's rests are dropped and every gap in the union of the
     sounding spans is written as one filler rest (midi_to_norm rule 6).
  5. Fingering. <fingering> is carried into the event as `fingering`: one
     entry per pitch, in the order of `pitches`, an integer 1–5 or null for a
     pitch with none (any other text is kept as a string). Absent when no
     pitch of the event has one. Nothing draws it yet.
  6. From the file, each overridable by flag: time and beatsPerBar (--time,
     --beats-per-bar); key from <fifths> and <mode>, major when there is no
     mode (--key); clefs with their changes (--clef, per hand); lines from
     <print new-system="yes"/> or new-page (--lines, --bars-per-line; none in
     the file → no `lines`); tempo in quarters per minute, a metronome mark
     preferred over <sound tempo> (--tempo); tempoMarking from the words
     printed with the metronome mark (--tempo-marking); title from
     <work-title> or <movement-title> (--title; required when the file has
     none, as is --piece).
  7. Play order. Bars stay as written; repeats are NOT unrolled. --play-order
     "1-32,9-32,9-16,33-36" (bar numbers after --bars renumbering) is
     expanded into form.playOrder. Without the flag it is derived from
     barline repeats and numbered endings when the range has any; D.S., D.C.
     and coda jumps are not derived (a note is printed when the piece has
     them).
  7b. Repeats and navigation marks, for display (the player draws them; it
     does not follow them). `repeats` { "start": [bar…], "end": [bar…] }
     from the file's barline repeats; `marks` { type: [bar…] } with the
     types segno, coda, toCoda, dsAlCoda, dcAlCoda, dsAlFine, dcAlFine, fine
     from <segno>, <coda>, the <sound> jump attributes and the printed words
     ("To Coda", "D.S. al Coda", "Fine", …). A coda sign printed with "To
     Coda" is the toCoda mark, not the coda. A bare D.S. or D.C. is "al
     Coda" when the range has a coda or To Coda mark, else "al Fine". One
     flag per type replaces what the file gave for that type: --segno 9
     --to-coda 16 --ds-al-coda 32 --coda 33, --repeat-start 9 --repeat-end
     32 (bar lists "9,41", numbered after --bars; "none" clears). Both
     fields are rebuilt on every import, never kept from an existing file.
  8. Refused, naming the bar, with nothing written: a pickup or otherwise
     short bar, tuplets, a time or key change inside the range, a clef other
     than treble and bass, unpitched notes. A clef change in the middle of a
     bar takes effect from the next bar and is noted in that bar's
     `uncertain`.
  9. Validation. Every staff must pass midi_to_norm.validate_staff or
     nothing is written.
 10. Left out: lyrics, fermatas, dynamics, double barlines, slurs,
     articulations, pedal, chord symbols.
 11. Re-import. When the output file exists, its hand-written fields — feel,
     anchors, songNotes, feelNote, syncopation, accompaniment, and tempo /
     tempoMarking when
     they differ and no flag set them — are kept and listed; --fresh drops
     them.

Output: reader "musicxml"; `source` names the file (name only, never its
path) and the range.

Usage (from the repo root):
  python3 tools/pieces/musicxml_to_norm.py score.musicxml --piece my-piece --title "My Piece"
  Flags: --out (default static/private/pieces/<slug>.norm.json), --bars 1-36,
  --play-order "1-32,9-32,33-36", --key "B♭ minor", --time 3/4,
  --beats-per-bar 3, --tempo 148, --tempo-marking "Fast", --clef
  lh:treble@1,bass@9, --lines 1,5,9 | --bars-per-line 4, --reader, --fresh,
  --repeat-start / --repeat-end BARS, --segno / --coda / --to-coda /
  --ds-al-coda / --dc-al-coda / --ds-al-fine / --dc-al-fine / --fine BARS.
"""
import argparse
import datetime
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from midi_to_norm import (validate_staff, with_rests, parse_key, parse_lines, parse_clefs,   # noqa: E402
                          parse_bars_per_line, parse_time, fmt, MAJOR_FIFTHS, MINOR_FIFTHS)
from mxl_to_norm import ACC, midi_of                                                        # noqa: E402

REPO = Path(__file__).resolve().parents[2]
HANDS = {1: 'rh', 2: 'lh'}
KEPT_FIELDS = ('feel', 'anchors', 'songNotes', 'feelNote', 'syncopation', 'accompaniment')
BEAT_UNITS = {'whole': 4, 'half': 2, 'quarter': 1, 'eighth': Fraction(1, 2), '16th': Fraction(1, 4), '32nd': Fraction(1, 8)}
FIFTHS_MAJOR = {v: k for k, v in MAJOR_FIFTHS.items()}
FIFTHS_MINOR = {v: k for k, v in MINOR_FIFTHS.items()}


MARK_TYPES = ('segno', 'coda', 'toCoda', 'dsAlCoda', 'dcAlCoda', 'dsAlFine', 'dcAlFine', 'fine')   # as player-staff-model.js
MARK_FLAGS = {t: re.sub(r'[A-Z]', lambda m: '_' + m.group(0).lower(), t) for t in MARK_TYPES}       # toCoda → to_coda (--to-coda)
MARK_WORDS = (                                         # printed words → mark; 'ds' / 'dc' are settled by mark_types()
    (r'\bto\s+coda\b', 'toCoda'),
    (r'\b(d\.?\s*s\.?|dal\s+segno)\s+al\s+coda\b', 'dsAlCoda'), (r'\b(d\.?\s*c\.?|da\s+capo)\s+al\s+coda\b', 'dcAlCoda'),
    (r'\b(d\.?\s*s\.?|dal\s+segno)\s+al\s+fine\b', 'dsAlFine'), (r'\b(d\.?\s*c\.?|da\s+capo)\s+al\s+fine\b', 'dcAlFine'),
    (r'^\s*(d\.\s*s\.?|dal\s+segno)\s*$', 'ds'), (r'^\s*(d\.\s*c\.?|da\s+capo)\s*$', 'dc'),
    (r'^\s*fine\.?\s*$', 'fine'),
)


class Refused(ValueError):
    """The file holds something the norm cannot express, or a flag is wrong."""


# ── Reading ──

def load_xml(path):
    """.musicxml / .xml, or a compressed .mxl (the rootfile named in META-INF/container.xml)."""
    path = str(path)
    if path.lower().endswith('.mxl'):
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            target = None
            if 'META-INF/container.xml' in names:
                rootfile = ET.fromstring(z.read('META-INF/container.xml')).find('.//{*}rootfile')
                if rootfile is not None:
                    target = rootfile.get('full-path')
            if target not in names:
                scores = [n for n in names if not n.startswith('META-INF') and n.lower().endswith(('.xml', '.musicxml'))]
                if not scores:
                    raise Refused(f'{os.path.basename(path)}: no score inside the .mxl')
                target = scores[0]
            root = ET.fromstring(z.read(target))
    else:
        root = ET.parse(path).getroot()
    if root.tag != 'score-partwise':
        raise Refused(f'{os.path.basename(path)}: expected a <score-partwise> MusicXML file, found <{root.tag}>')
    return root


def pick_part(root):
    parts = root.findall('part')
    if not parts:
        raise Refused('the file has no <part>')
    two = [p for p in parts if any((a.findtext('staves') or '').strip() == '2' for a in p.iter('attributes'))]
    if len(two) == 1:
        return two[0]
    if len(parts) == 1:
        return parts[0]
    names = {sp.get('id'): (sp.findtext('part-name') or '').strip() for sp in root.iter('score-part')}
    listing = ', '.join(f"{p.get('id')} {names.get(p.get('id'), '')!r}" for p in parts)
    raise Refused(f'expected one two-staff piano part; the file has {len(parts)} parts ({listing}), {len(two)} of them two-staff')


def spell(pitch_el):
    alter = int(float(pitch_el.findtext('alter') or 0))
    if alter not in ACC:
        raise Refused(f'pitch alteration {alter} is not supported')
    return f"{pitch_el.findtext('step')}{ACC[alter]}{int(pitch_el.findtext('octave'))}"


def finger_of(note):
    texts = [(f.text or '').strip() for f in note.iter('fingering')]
    texts = [t for t in texts if t]
    if not texts:
        return None
    text = '-'.join(texts)
    return int(text) if re.match(r'^[1-5]$', text) else text


def key_text(fifths, mode):
    table = FIFTHS_MINOR if mode == 'minor' else FIFTHS_MAJOR
    if fifths not in table:
        raise Refused(f'key signature of {fifths} fifths is not supported')
    return table[fifths] + (' minor' if mode == 'minor' else '')


def tempo_of(direction):
    """A <direction> → (kind, quarters per minute, words) or None. kind 'metronome' | 'sound'."""
    words = ' '.join((w.text or '').strip() for w in direction.iter('words') if (w.text or '').strip()) or None
    met = direction.find('.//metronome')
    if met is not None:
        unit, per = met.findtext('beat-unit'), (met.findtext('per-minute') or '').strip()
        m = re.search(r'\d+(\.\d+)?', per)
        if unit in BEAT_UNITS and m:
            factor = Fraction(BEAT_UNITS[unit]) * (Fraction(3, 2) if met.find('beat-unit-dot') is not None else 1)
            return 'metronome', float(Fraction(m.group(0)) * factor), words
    snd = direction.find('sound')
    if snd is not None and snd.get('tempo'):
        return 'sound', float(snd.get('tempo')), words
    return None


def direction_marks(direction):
    """A <direction> → the navigation marks it prints or sounds: a set of MARK_TYPES, plus the
    provisional 'ds' / 'dc' (a D.S. or D.C. that does not say where it ends) and 'codaSign'."""
    found = set()
    words = ' '.join((w.text or '').strip() for w in direction.iter('words'))
    for pattern, mark in MARK_WORDS:
        if re.search(pattern, words, re.I):
            found.add(mark)
    for snd in direction.iter('sound'):
        if snd.get('tocoda'): found.add('toCoda')
        if snd.get('fine'): found.add('fine')
        if snd.get('segno'): found.add('segno')
        if snd.get('coda'): found.add('coda')
        if snd.get('dalsegno') and not found & {'dsAlCoda', 'dsAlFine'}: found.add('ds')
        if snd.get('dacapo') and not found & {'dcAlCoda', 'dcAlFine'}: found.add('dc')
    if direction.find('.//segno') is not None: found.add('segno')
    if direction.find('.//coda') is not None: found.add('codaSign')
    if found & {'dsAlCoda', 'dsAlFine'}: found.discard('ds')
    if found & {'dcAlCoda', 'dcAlFine'}: found.discard('dc')
    return found


def mark_types(measures):
    """The marks of each measure, settled: → [set of MARK_TYPES] in measure order. A coda sign in a
    bar that says To Coda belongs to that mark; elsewhere it is the coda. A bare D.S. / D.C. is
    "al Coda" when the range has a coda or To Coda, else "al Fine"."""
    out = []
    for m in measures:
        found = set(m['marks'])
        if 'codaSign' in found:
            found.discard('codaSign')
            if 'toCoda' not in found: found.add('coda')
        out.append(found)
    has_coda = any(f & {'coda', 'toCoda'} for f in out)
    for found in out:
        for bare, coda, fine in (('ds', 'dsAlCoda', 'dsAlFine'), ('dc', 'dcAlCoda', 'dcAlFine')):
            if bare in found:
                found.discard(bare); found.add(coda if has_coda else fine)
    return out


def parse_bar_list(text, flag, count):
    """'9' / '9,41' → [9, 41] (ascending, within 1..count); 'none' → []."""
    if text.strip().lower() == 'none':
        return []
    bars = []
    for item in text.split(','):
        if not re.match(r'^\s*\d+\s*$', item):
            raise Refused(f'bad {flag} {text!r}: expected BAR[,BAR...] or none')
        bar = int(item)
        if bar < 1 or bar > count:
            raise Refused(f'bad {flag} {text!r}: bar {bar} is outside the piece (1–{count})')
        bars.append(bar)
    return sorted(set(bars))


def clean_tempo(bpm):
    bpm = round(float(bpm), 1)
    return int(bpm) if abs(bpm - round(bpm)) < 0.05 else bpm


def read_measures(part):
    """Every measure of the part, in order → a list of dicts:
      index (1-based position), number (the file's), implicit, length (quarters reached),
      notes {staff: [note]}, graces, attrs in force at the bar's start (divisions aside):
      time (n, d) | None, key (fifths, mode) | None, clefs_start {staff: (sign, line, octave)},
      late_clefs (staves whose clef changed in the middle of the previous bar), new_system,
      tempos [(kind, bpm, words)], forward / backward / times (repeats), ending_start (numbers) /
      ending_stop, tuplet, unpitched, marks (direction_marks), time_change, key_change.
    note: {on, dur, name, tie, finger, grace}"""
    out = []
    div = 1
    time = key = None
    clefs = {}
    pending_clefs = {}            # a change met after the bar's start: applied from the next bar
    late_noted = set()            # … the staves where that change sat in the middle of the bar, not at its end
    for index, measure in enumerate(part.findall('measure'), 1):
        rec = {'index': index, 'number': measure.get('number') or str(index), 'implicit': measure.get('implicit') == 'yes',
               'notes': {1: [], 2: []}, 'new_system': False, 'tempos': [], 'forward': False, 'backward': False, 'times': 2,
               'ending_start': None, 'ending_stop': False, 'tuplet': False, 'unpitched': False, 'marks': set(),
               'late_clefs': sorted(late_noted), 'time_change': None, 'key_change': None}
        clefs.update(pending_clefs); pending_clefs = {}; late_noted = set()
        pending_at = {}
        t = Fraction(0); last_t = Fraction(0); reach = Fraction(0)
        started = False                              # a note or rest has been met in this measure
        pending_grace = {}
        for el in measure:
            tag = el.tag
            if tag == 'attributes':
                d = el.findtext('divisions')
                if d: div = int(d)
                tm = el.find('time')
                if tm is not None and tm.findtext('beats') and tm.findtext('beat-type'):
                    try:
                        new = (int(tm.findtext('beats')), int(tm.findtext('beat-type')))
                    except ValueError:
                        raise Refused(f"bar {index}: time signature {tm.findtext('beats')}/{tm.findtext('beat-type')} is not supported") from None
                    if time is not None and new != time: rec['time_change'] = new
                    time = new
                k = el.find('key')
                if k is not None and k.findtext('fifths') is not None:
                    new = (int(k.findtext('fifths')), (k.findtext('mode') or 'major').strip().lower())
                    if key is not None and new != key: rec['key_change'] = new
                    key = new
                for c in el.findall('clef'):
                    staff = int(c.get('number') or 1)
                    new = (c.findtext('sign'), c.findtext('line'), c.findtext('clef-octave-change') or '0')
                    if not started or t == 0:
                        clefs[staff] = new
                    elif new != clefs.get(staff):
                        pending_clefs[staff] = new; pending_at[staff] = t
            elif tag == 'backup':
                t -= Fraction(int(el.findtext('duration')), div)
            elif tag == 'forward':
                t += Fraction(int(el.findtext('duration')), div); reach = max(reach, t)
            elif tag == 'print':
                if el.get('new-system') == 'yes' or el.get('new-page') == 'yes': rec['new_system'] = True
            elif tag == 'direction' or tag == 'sound':
                holder = el if tag == 'direction' else ET.Element('direction')
                if tag == 'sound': holder.append(el)
                tempo = tempo_of(holder)
                if tempo: rec['tempos'].append(tempo)
                rec['marks'] |= direction_marks(holder)
            elif tag == 'barline':
                rp = el.find('repeat')
                if rp is not None:
                    if rp.get('direction') == 'forward': rec['forward'] = True
                    elif rp.get('direction') == 'backward':
                        rec['backward'] = True
                        if (rp.get('times') or '').isdigit(): rec['times'] = int(rp.get('times'))
                en = el.find('ending')
                if en is not None:
                    if en.get('type') == 'start':
                        rec['ending_start'] = {int(x) for x in re.findall(r'\d+', en.get('number') or '')}
                    elif en.get('type') in ('stop', 'discontinue'):
                        rec['ending_stop'] = True
            elif tag == 'note':
                if el.find('cue') is not None: continue
                if el.find('time-modification') is not None: rec['tuplet'] = True
                staff = int(el.findtext('staff') or 1)
                is_chord = el.find('chord') is not None
                grace = el.find('grace') is not None
                pitch_el = el.find('pitch')
                if pitch_el is None and el.find('rest') is None: rec['unpitched'] = True
                dur = Fraction(int(el.findtext('duration') or 0), div)
                started = True
                if grace:
                    if pitch_el is not None: pending_grace.setdefault(staff, []).append(spell(pitch_el))
                    continue
                onset = last_t if is_chord else t
                if pitch_el is not None and staff in rec['notes']:
                    ties = {x.get('type') for x in el.findall('tie')}
                    tie = 'both' if {'start', 'stop'} <= ties else ('start' if 'start' in ties else ('stop' if 'stop' in ties else None))
                    rec['notes'][staff].append({'on': onset, 'dur': dur, 'name': spell(pitch_el), 'tie': tie, 'finger': finger_of(el),
                                                'grace': pending_grace.pop(staff, None)})
                elif pitch_el is not None:
                    raise Refused(f'bar {index}: a note on staff {staff}; only staves 1 and 2 are read')
                if not is_chord:
                    last_t = t; t += dur; reach = max(reach, t)
        rec['length'] = reach
        late_noted = {staff for staff, at in pending_at.items() if at < reach}
        rec['time'] = time; rec['key'] = key; rec['clefs_start'] = dict(clefs)
        out.append(rec)
    return out


# ── Building ──

def clef_name(clef, bar, hand):
    sign, line, octave = clef
    if (sign, line or '2', octave) == ('G', '2', '0'): return 'treble'
    if (sign, line or '4', octave) == ('F', '4', '0'): return 'bass'
    shown = f'{sign}{line or ""}' + (f' (octave {octave})' if octave != '0' else '')
    raise Refused(f'bar {bar}: {hand} clef {shown} is not supported (treble and bass only)')


def merge_ties(notes):
    """A note tied to the same pitch later in the bar becomes one note of the summed length
    (rule 3): norm events are sounding spans, as midi_to_norm writes them, and the player
    splits and ties them again by the meter. Ties across the bar line are left alone."""
    out = [dict(n) for n in notes]
    merged = True
    while merged:
        merged = False
        for a in out:
            if a['tie'] not in ('start', 'both'):
                continue
            b = next((x for x in out if x is not a and x['name'] == a['name'] and x['on'] == a['on'] + a['dur']
                      and x['tie'] in ('stop', 'both')), None)
            if b is None:
                continue
            arrives, leaves = a['tie'] == 'both', b['tie'] == 'both'
            a['dur'] += b['dur']
            a['tie'] = 'both' if arrives and leaves else 'stop' if arrives else 'start' if leaves else None
            if a['finger'] is None: a['finger'] = b['finger']
            out.remove(b); merged = True
            break
    return out


def staff_events(notes, bpb):
    """One staff of one bar: notes → norm events with filler rests (Fractions; see jsonable)."""
    notes = merge_ties(notes)
    groups = {}
    for n in notes:
        groups.setdefault((n['on'], n['dur'], n['tie']), []).append(n)
    events = []
    for (on, dur, tie), ns in groups.items():
        ns.sort(key=lambda n: midi_of(n['name']))
        names, fingers, seen = [], [], set()
        for n in ns:                                   # the same pitch twice (two voices in unison) is one pitch
            if n['name'] in seen:
                continue
            seen.add(n['name']); names.append(n['name']); fingers.append(n['finger'])
        e = {'onset': on, 'dur': dur, 'pitches': names, 'rest': False, 'tie': tie}
        if any(f is not None for f in fingers): e['fingering'] = fingers
        grace = [p for n in ns for p in (n['grace'] or [])]
        if grace: e['_grace'] = grace
        events.append(e)
    return with_rests(events, bpb)


def jsonable(events):
    out = []
    for e in events:
        if e.get('_grace'): out.append({'grace': e['_grace']})
        j = {'onset': fmt(e['onset']), 'dur': fmt(e['dur']), 'pitches': e['pitches'], 'rest': e['rest'], 'tie': e['tie']}
        if 'fingering' in e: j['fingering'] = e['fingering']
        out.append(j)
    return out


def parse_range(text, what='--bars'):
    m = re.match(r'^\s*(\d+)\s*[-–]\s*(\d+)\s*$', text or '')
    if not m or int(m.group(1)) < 1 or int(m.group(2)) < int(m.group(1)):
        raise Refused(f'bad {what} {text!r}: expected FROM-TO, e.g. 1-36')
    return int(m.group(1)), int(m.group(2))


def parse_play_order(text, count):
    """'1-32,9-32,9-16,33-36' → the bars in playing order, each within 1..count."""
    order = []
    for item in (text or '').split(','):
        m = re.match(r'^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$', item)
        if not m:
            raise Refused(f'bad --play-order {text!r}: {item.strip()!r} is not BAR or FROM-TO')
        a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else a
        if a < 1 or b < a:
            raise Refused(f'bad --play-order {text!r}: {item.strip()!r} runs backwards or starts below 1')
        if b > count:
            raise Refused(f'bad --play-order {text!r}: bar {b} is past the last bar ({count})')
        order.extend(range(a, b + 1))
    return order


def derive_play_order(measures):
    """Barline repeats and numbered endings → the bars (1-based within `measures`) in playing order;
    None when the range has no repeat. Jumps (D.S., D.C., coda) are not followed."""
    if not any(m['backward'] or m['forward'] for m in measures):
        return None
    ending = {}                                        # bar position → the ending numbers it sits under
    current = None
    for i, m in enumerate(measures):
        if m['ending_start'] is not None: current = m['ending_start']
        if current: ending[i] = current
        if m['ending_stop']: current = None
    order, i, start, passes, guard = [], 0, 0, {}, 0
    pass_no = 1
    while i < len(measures):
        guard += 1
        if guard > 100 * len(measures):
            raise Refused('the repeats in this range do not resolve; pass --play-order')
        m = measures[i]
        if m['forward'] and start != i:
            start = i; pass_no = 1
        if i in ending and pass_no not in ending[i]:
            i += 1; continue
        order.append(i + 1)
        if m['backward']:
            done = passes.get(i, 0) + 1
            if done < m['times']:
                passes[i] = done; pass_no = done + 1; i = start; continue
            passes[i] = 0; pass_no = 1; start = i + 1
        elif m['ending_stop'] and pass_no > 1:         # the last ending is over: the repeat is done
            pass_no = 1; start = i + 1
        i += 1
    return order


def slugify(title):
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')


def convert(path, *, piece=None, title=None, reader='musicxml', key=None, time=None, beats_per_bar=None, tempo=None,
            tempo_marking=None, clefs=None, lines=None, bars_per_line=None, bars=None, play_order=None, date=None,
            repeat_start=None, repeat_end=None, marks=None):
    """→ (doc, stats). Raises Refused (a ValueError) with a message naming the bar."""
    root = load_xml(path)
    file_title = next((t.strip() for t in (root.findtext('work/work-title'), root.findtext('movement-title')) if t and t.strip()), None)
    title = title or file_title
    if not title:
        raise Refused('the file has no title: pass --title and --piece')
    if not piece:
        if not file_title:
            raise Refused('the file has no title: pass --piece (the slug) as well')
        piece = slugify(title)
    if not re.match(r'^[a-z0-9-]+$', piece):
        raise Refused(f'bad --piece {piece!r}: lower-case letters, digits and hyphens only')
    if lines is not None and bars_per_line is not None:
        raise Refused('--lines and --bars-per-line are mutually exclusive')
    clef_flags = parse_clefs(clefs)
    line_flags = parse_lines(lines) if lines is not None else None
    bars_per_line = parse_bars_per_line(bars_per_line) if bars_per_line is not None else None

    every = read_measures(pick_part(root))
    lo, hi = parse_range(bars) if bars else (1, len(every))
    if hi > len(every):
        raise Refused(f'--bars {bars}: the file has {len(every)} bars')
    chosen = every[lo - 1:hi]
    rel = lambda m: m['index'] - lo + 1                # bar number in the output
    label = lambda m: f'bar {rel(m)}' + (f' (bar {m["index"]} of the file)' if lo > 1 else '')
    first = chosen[0]

    # time and key: as they stand at the first bar; no change inside the range
    for m in chosen[1:]:
        if m['time_change']: raise Refused(f'{label(m)}: the time signature changes to {m["time_change"][0]}/{m["time_change"][1]}; one per piece (import the sections separately with --bars)')
        if m['key_change']: raise Refused(f'{label(m)}: the key signature changes; one per piece (import the sections separately with --bars)')
    time_sig = parse_time(time) if time else first['time']
    if time_sig is None:
        raise Refused('no time signature in the file: pass --time N/D')
    bpb = Fraction(beats_per_bar).limit_denominator(64) if beats_per_bar is not None else Fraction(time_sig[0] * 4, time_sig[1])
    if key:
        parse_key(key)                                 # validates
    elif first['key'] is not None:
        key = key_text(*first['key'])
    else:
        raise Refused('no key signature in the file: pass --key')

    # refusals that name a bar
    for m in chosen:
        if m['tuplet']: raise Refused(f'{label(m)}: tuplets are not supported by the norm')
        if m['unpitched']: raise Refused(f'{label(m)}: unpitched notes are not supported')
        if m['length'] < bpb:
            kind = 'a pickup bar' if (m is every[0] or m['implicit']) else 'a short bar'
            raise Refused(f'{label(m)}: {kind} ({fmt(m["length"])} of {fmt(bpb)} quarters); the norm has no pickup bars')

    # clefs: in force at each bar's start, per hand
    clef_out, notes_on = {}, {}
    for staff, hand in HANDS.items():
        changes, current = [], None
        for m in chosen:
            at_start = m['clefs_start'].get(staff)     # the clef in force at the bar's first beat
            if at_start is None:
                continue
            name = clef_name(at_start, rel(m), hand)
            if name != current:
                changes.append({'bar': rel(m), 'clef': name}); current = name
            if staff in m['late_clefs'] and m is not chosen[0]:
                notes_on.setdefault(rel(m), []).append(f'{hand}: the clef changes in the middle of bar {rel(m) - 1}; written from this bar')
        if changes:
            if changes[0]['bar'] != 1: changes[0]['bar'] = 1
            clef_out[hand] = changes
    for hand, changes in clef_flags.items():
        for c in changes:
            if c['bar'] > len(chosen): raise Refused(f"--clef {hand}: bar {c['bar']} is past the last bar ({len(chosen)})")
        clef_out[hand] = changes
    clef_out = {h: clef_out[h] for h in ('lh', 'rh') if h in clef_out}

    # lines
    if line_flags is not None:
        if line_flags[-1] > len(chosen): raise Refused(f'--lines: bar {line_flags[-1]} is past the last bar ({len(chosen)})')
        line_starts = line_flags
    elif bars_per_line is not None:
        line_starts = list(range(1, len(chosen) + 1, bars_per_line))
    else:
        breaks = [rel(m) for m in chosen[1:] if m['new_system']]
        line_starts = [1] + breaks if breaks else None

    # tempo: the mark in force at the first bar (a metronome mark before a <sound tempo>), else the first later one
    notes = []
    file_tempo = file_marking = None
    in_force = {}
    for m in every[:lo]:
        for kind, bpm, words in m['tempos']: in_force[kind] = (bpm, words)
    later = [(m, t) for m in chosen[1:] for t in m['tempos']]
    if in_force:
        file_tempo, file_marking = in_force.get('metronome') or in_force['sound']
    elif later:
        m, (kind, file_tempo, file_marking) = later[0]
        notes.append(f'no tempo at the first bar; taken from {label(m)}')
    changes = sorted({rel(m) for m, t in later if abs(t[1] - (file_tempo or t[1])) > 0.05})
    if changes:
        notes.append(f"tempo changes inside the range (bar {', '.join(map(str, changes))}) are not carried: one tempo per piece")
    if tempo is not None:
        if float(tempo) <= 0: raise Refused(f'bad --tempo {tempo!r}')
        out_tempo = clean_tempo(tempo)
    else:
        out_tempo = clean_tempo(file_tempo) if file_tempo else None
    out_marking = tempo_marking or file_marking

    # bars
    out_bars, problems = [], []
    for m in chosen:
        bar = {'bar': rel(m), 'voice': [], 'rh': [], 'lh': []}
        for staff, hand in HANDS.items():
            events = staff_events(m['notes'][staff], bpb)
            for p in validate_staff(events, bpb):
                problems.append(f'{label(m)} {hand}: {p}')
            bar[hand] = jsonable(events)
        bar['uncertain'] = notes_on.get(rel(m), [])
        out_bars.append(bar)
    if problems:
        raise Refused('validation failed:\n  ' + '\n  '.join(problems))

    # play order
    derived = False
    if play_order:
        order = parse_play_order(play_order, len(chosen))
    else:
        order = derive_play_order(chosen); derived = order is not None
    # repeats and navigation marks (display): from the file, each type replaceable by its flag
    count = len(chosen)
    repeats = {'start': [rel(m) for m in chosen if m['forward']], 'end': [rel(m) for m in chosen if m['backward']]}
    if repeat_start is not None: repeats['start'] = parse_bar_list(repeat_start, '--repeat-start', count)
    if repeat_end is not None: repeats['end'] = parse_bar_list(repeat_end, '--repeat-end', count)
    settled = mark_types(chosen)
    mark_out = {}
    for mark in MARK_TYPES:
        given = (marks or {}).get(mark)
        found = parse_bar_list(given, '--' + MARK_FLAGS[mark].replace('_', '-'), count) if given is not None \
            else [rel(m) for m, f in zip(chosen, settled) if mark in f]
        if found: mark_out[mark] = found
    unknown = sorted(set(marks or {}) - set(MARK_TYPES))
    if unknown:
        raise Refused(f"unknown mark type {', '.join(unknown)} (known: {', '.join(MARK_TYPES)})")
    jumps = [t for t in mark_out if t not in ('segno', 'coda', 'fine')]
    if jumps and not play_order:
        notes.append(f"the piece has {', '.join(jumps)} marks; jumps are not derived — pass --play-order")

    name = os.path.basename(str(path))
    doc = {'piece': piece, 'title': title, 'reader': reader,
           'source': f'{name} (' + (f'bars {lo}–{hi} of {len(every)}, renumbered from 1; ' if bars else '') + 'staff 1 → rh, staff 2 → lh)',
           'date': date or datetime.date.today().isoformat(),
           'key': key, 'time': f'{time_sig[0]}/{time_sig[1]}', 'beatsPerBar': fmt(bpb)}
    if out_tempo: doc['tempo'] = out_tempo
    if out_marking: doc['tempoMarking'] = out_marking
    if clef_out: doc['clefs'] = clef_out
    if line_starts: doc['lines'] = line_starts
    if repeats['start'] or repeats['end']: doc['repeats'] = repeats
    if mark_out: doc['marks'] = mark_out
    if order: doc['form'] = {'playOrder': order}
    doc['bars'] = out_bars
    stats = {'bars': len(chosen), 'file_bars': len(every), 'notes': notes, 'derived_order': derived,
             'file_tempo': clean_tempo(file_tempo) if file_tempo else None, 'file_marking': file_marking,
             'tempo_flag': tempo is not None, 'marking_flag': tempo_marking is not None,
             'fingerings': sum(1 for b in out_bars for h in ('rh', 'lh') for e in b[h] for f in e.get('fingering', []) if f is not None)}
    return doc, stats


def keep_hand_written(doc, existing, stats):
    """Re-import (rule 11): copy the hand-written fields of the existing norm file into `doc`.
    → [field names kept], in document order."""
    kept = []
    if not isinstance(existing, dict):
        return kept
    for field, flagged in (('tempo', stats['tempo_flag']), ('tempoMarking', stats['marking_flag'])):
        if field in existing and not flagged and existing[field] != doc.get(field):
            doc[field] = existing[field]; kept.append(field)
    for field in KEPT_FIELDS:
        if field in existing:
            doc[field] = existing[field]; kept.append(field)
    # keep the usual field order: the hand-written fields sit before `bars`
    bars = doc.pop('bars'); form = doc.pop('form', None)
    if form: doc['form'] = form
    doc['bars'] = bars
    return kept


def compact_ranges(order):
    out, i = [], 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and order[j + 1] == order[j] + 1: j += 1
        out.append(str(order[i]) if i == j else f'{order[i]}-{order[j]}')
        i = j + 1
    return ','.join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description='two-staff piano MusicXML (.musicxml / .xml / .mxl) → norm JSON')
    ap.add_argument('input', help='MusicXML file')
    ap.add_argument('--piece', help='piece slug, e.g. run-rudolph-run (required when the file has no title)')
    ap.add_argument('--title', help='piece title (required when the file has none)')
    ap.add_argument('--out', help='output path (default static/private/pieces/<slug>.norm.json)')
    ap.add_argument('--bars', metavar='FROM-TO', help='import this bar range (by position in the file), renumbered from 1')
    ap.add_argument('--play-order', metavar='A-B[,C-D...]', help='playing order written to form.playOrder, e.g. "1-32,9-32,9-16,33-36" '
                    '(bar numbers after --bars); default: derived from barline repeats, if any. Bars are never unrolled.')
    ap.add_argument('--key', help='key with optional mode, e.g. "C", "B♭ minor"; default: the file\'s <fifths> and <mode>')
    ap.add_argument('--time', help='time signature N/D; default: the file\'s')
    ap.add_argument('--beats-per-bar', type=float, help='quarters per bar; default N × 4 / D')
    ap.add_argument('--tempo', type=float, help='quarters per minute; default: the file\'s metronome mark, else <sound tempo>')
    ap.add_argument('--tempo-marking', help='tempo text, e.g. "Fast"; default: the words printed with the metronome mark')
    ap.add_argument('--clef', action='append', metavar='HAND:CLEF@BAR[,CLEF@BAR...]', help='replace one hand\'s clefs (as midi_to_norm.py)')
    lines_group = ap.add_mutually_exclusive_group()
    lines_group.add_argument('--lines', metavar='BAR[,BAR...]', help='line-start bars; default: the file\'s system breaks')
    lines_group.add_argument('--bars-per-line', metavar='N', help='write `lines` as every Nth bar from 1')
    ap.add_argument('--repeat-start', metavar='BARS', help='bars that open with a repeat sign, e.g. 9 or 9,41 (after --bars); default: the file\'s; "none" clears')
    ap.add_argument('--repeat-end', metavar='BARS', help='bars that close with a repeat sign; default: the file\'s')
    for mark, dest in MARK_FLAGS.items():
        ap.add_argument('--' + dest.replace('_', '-'), dest='mark_' + dest, metavar='BARS',
                        help=f'bars carrying the {mark} mark (drawn, not followed); default: the file\'s')
    ap.add_argument('--reader', default='musicxml', help='reader name written to the output (default musicxml)')
    ap.add_argument('--fresh', action='store_true', help='do not keep hand-written fields from an existing output file')
    a = ap.parse_args(argv)
    try:
        doc, stats = convert(a.input, piece=a.piece, title=a.title, reader=a.reader, key=a.key, time=a.time,
                             beats_per_bar=a.beats_per_bar, tempo=a.tempo, tempo_marking=a.tempo_marking, clefs=a.clef,
                             lines=a.lines, bars_per_line=a.bars_per_line, bars=a.bars, play_order=a.play_order,
                             repeat_start=a.repeat_start, repeat_end=a.repeat_end,
                             marks={mark: getattr(a, 'mark_' + dest) for mark, dest in MARK_FLAGS.items()
                                    if getattr(a, 'mark_' + dest) is not None})
    except (ValueError, ET.ParseError, zipfile.BadZipFile, OSError) as e:
        raise SystemExit(f'refused: {e}')
    out = Path(a.out) if a.out else REPO / 'static' / 'private' / 'pieces' / f"{doc['piece']}.norm.json"
    kept, existed = [], out.exists()
    if existed and not a.fresh:
        try:
            kept = keep_hand_written(doc, json.loads(out.read_text(encoding='utf-8')), stats)
        except ValueError:
            print(f'note: {out} exists but is not JSON; nothing kept from it')
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    order = doc.get('form', {}).get('playOrder')
    print(f"wrote {out}: {stats['bars']} bars" + (f" (of {stats['file_bars']})" if a.bars else '')
          + f", {doc['time']} ({doc['beatsPerBar']} q/bar), key {doc['key']}"
          + (f", tempo {doc['tempo']} bpm" if 'tempo' in doc else ', no tempo')
          + (f" ({doc['tempoMarking']})" if 'tempoMarking' in doc else '')
          + (f", lines {','.join(map(str, doc['lines']))}" if 'lines' in doc else '')
          + f"; {stats['fingerings']} fingerings")
    if order:
        print(f"play order ({'derived from repeats' if stats['derived_order'] else 'from --play-order'}): {compact_ranges(order)} — {len(order)} bars played")
    if 'tempo' in doc and stats['file_tempo'] and stats['tempo_flag'] and doc['tempo'] != stats['file_tempo']:
        print(f"note: --tempo {doc['tempo']} replaces the file's {stats['file_tempo']}")
    if 'repeats' in doc:
        print(f"repeats: start {','.join(map(str, doc['repeats']['start'])) or '–'}, end {','.join(map(str, doc['repeats']['end'])) or '–'}")
    if 'marks' in doc:
        print('marks: ' + ', '.join(f"{k} {','.join(map(str, v))}" for k, v in doc['marks'].items()))
    for n in stats['notes']:
        print(f'note: {n}')
    if kept:
        print(f"kept from the existing file: {', '.join(kept)} (--fresh to drop)")
    elif existed and a.fresh:
        print('--fresh: nothing kept from the existing file')
    return doc


if __name__ == '__main__':
    main()
