#!/usr/bin/env python3
"""
midi_to_norm.py — convert a two-track piano MIDI recording (tracks "RH" and
"LH") into norm, the per-bar JSON used by tools/pieces (see README.md).
Standard library only; the SMF reader is an extended copy of the one in
tools/voicings/check_midi.py (per-track notes, track names, time signature,
tempo and key signature meta events).

Output document: { "piece", "reader": "midi", "source", "date", "key", "time",
"beatsPerBar", "tempo" (bpm, optional), "bars": [ { "bar", "voice": [],
"rh": [...], "lh": [...], "uncertain": [...] } ] } — the norm shape, plus the
optional `tempo` this converter adds.

Converter rules
  1. Units. Ticks become quarters (ticks / division). Every value is kept as a
     Fraction until it is written, so snapping is exact.
  2. Onset grid. --grid G (quarters, default 0.5 = an 8th) is the recording's
     quantisation. Each onset snaps to the nearest multiple of G. An onset that
     is not exactly on the grid is still snapped, and the slip is recorded in
     the bar's `uncertain` list with the raw and snapped values (staff, beat,
     pitch), so a reviewer can see what the converter decided. An onset
     exactly halfway between two grid points (a 16th before the beat on an
     8th grid) rounds to the even multiple, i.e. towards the beat for
     anticipations into an odd beat — check those flags by ear.
  3. Durations. Each duration snaps to the nearest multiple of G, with a
     minimum of one G (a snap to zero is bumped and recorded). The note is then
     clipped at the next snapped onset of the same pitch on the same staff (a
     re-struck note cannot overlap itself; a clip is recorded). Two attacks of
     the same pitch that snap to the same onset are one note: the duplicate is
     dropped and recorded. Gaps shorter than half a grid vanish in the
     rounding (legato assumption). A remaining gap between a note's snapped
     end and the next snapped onset in the same hand (any pitch) becomes a
     rest only if it is >= --min-rest (quarters, default = --grid, so by
     default every on-grid gap is a rest); a shorter gap is closed by
     extending the note to that onset (recorded). Rests then follow rule 6.
  4. Chords. Within a staff, notes with the same snapped onset and the same
     snapped duration become one event (pitches sorted low → high); notes with
     the same onset but different durations stay separate events, longer
     first, as the README's flattened-voice rule requires.
  5. Bar split. Bars are `beatsPerBar` quarters long from tick 0 (no pickup).
     An event that crosses a bar line is cut at the line: the first piece gets
     tie "start", each continuation tie "stop" (or "both" when it crosses the
     next line too).
  6. Filler rests. Per bar and staff, every gap in the union of the sounding
     spans becomes one rest event, so the staff sums to `beatsPerBar`; a staff
     with no notes in a bar is one whole-bar rest. (`voice` is always [].)
  7. Validation. Before writing, every bar and staff is checked: the sounding
     spans and rests together cover [0, beatsPerBar) with no gap, no rest
     overlaps a sounding span, and nothing extends past the bar. A failure
     stops the run.
  8. Pitch spelling. From --key (the file's FF 59 key signature is ignored:
     the prelude's says C). Diatonic notes take their key-signature spelling;
     chromatic notes are spelled with the key's accidental direction (flats in
     flat keys and C major / A minor except F♯; sharps in sharp keys). Unicode
     ♭ / ♯, scientific octave (C4 = 60).
  9. Ignored. Control changes (sustain pedal), velocity, channel, program and
     pitch-bend data. Grace notes are not detected: an ornament that was
     recorded as a short early attack simply snaps like any other note (and is
     flagged if it lands off the grid).

Usage (from the repo root):
  python3 tools/pieces/midi_to_norm.py --piece prelude-winston-first-16 --key "B♭ minor" \\
      --out static/private/pieces/prelude-winston-first-16.norm.json \\
      static/private/pieces/prelude-winston-first-16.mid
  Flags: --time N/D and --beats-per-bar override the file's time signature;
  --grid 0.5 (quarters); --min-rest Q (quarters, default = --grid) is the
  shortest gap written as a rest; --rh-track RH --lh-track LH name the tracks
  (case-insensitive); --reader midi names the read.
"""
import argparse
import datetime
import json
import re
import sys
from fractions import Fraction
from pathlib import Path

# ── Minimal Standard MIDI File reader (after tools/voicings/check_midi.py) ──

def read_varlen(data, i):
    v = 0
    while True:
        b = data[i]; i += 1
        v = (v << 7) | (b & 0x7F)
        if not b & 0x80:
            return v, i


def read_midi(path):
    """Return (division, tracks, meta).
    tracks: [{'name': str, 'notes': [(start_tick, end_tick, pitch, channel, velocity)], 'unclosed': [pitch]}]
    meta: {'time': (num, den) | None, 'tempo_us': int | None, 'key': (sharps_flats, minor) | None}
    (the first time signature, tempo and key signature in the file)."""
    data = Path(path).read_bytes()
    if data[:4] != b'MThd':
        raise ValueError(f'{path}: not a MIDI file')
    ntrks = int.from_bytes(data[10:12], 'big')
    division = int.from_bytes(data[12:14], 'big')
    if division & 0x8000:
        raise ValueError(f'{path}: SMPTE time division is not supported')
    i, tracks, meta = 14, [], {'time': None, 'tempo_us': None, 'key': None}
    for _ in range(ntrks):
        if data[i:i + 4] != b'MTrk':
            raise ValueError(f'{path}: bad track header at byte {i}')
        length = int.from_bytes(data[i + 4:i + 8], 'big'); i += 8
        end, t, status, open_notes = i + length, 0, None, {}
        track = {'name': '', 'notes': [], 'unclosed': []}
        while i < end:
            delta, i = read_varlen(data, i); t += delta
            b = data[i]
            if b & 0x80:
                status = b; i += 1
            if status == 0xFF:
                kind = data[i]; i += 1
                ln, i = read_varlen(data, i); payload = data[i:i + ln]; i += ln
                if kind == 0x03 and not track['name']:
                    track['name'] = payload.decode('utf-8', 'replace').strip()
                elif kind == 0x51 and meta['tempo_us'] is None and ln == 3:
                    meta['tempo_us'] = int.from_bytes(payload, 'big')
                elif kind == 0x58 and meta['time'] is None and ln >= 2:
                    meta['time'] = (payload[0], 2 ** payload[1])
                elif kind == 0x59 and meta['key'] is None and ln == 2:
                    sf = payload[0] - 256 if payload[0] > 127 else payload[0]
                    meta['key'] = (sf, payload[1] == 1)
                continue
            if status in (0xF0, 0xF7):
                ln, i = read_varlen(data, i); i += ln; continue
            kind, ch = status & 0xF0, status & 0x0F
            if kind in (0x80, 0x90, 0xA0, 0xB0, 0xE0):
                d1, d2 = data[i], data[i + 1]; i += 2
            else:
                d1, d2 = data[i], 0; i += 1
            if kind == 0x90 and d2 > 0:
                open_notes.setdefault((ch, d1), []).append((t, d2))
            elif kind == 0x80 or (kind == 0x90 and d2 == 0):
                starts = open_notes.get((ch, d1))
                if starts:
                    s, vel = starts.pop(0)
                    track['notes'].append((s, t, d1, ch, vel))
        for (ch, pitch), starts in open_notes.items():
            for s, vel in starts:
                track['notes'].append((s, t, pitch, ch, vel)); track['unclosed'].append(pitch)
        track['notes'].sort()
        tracks.append(track)
        i = end
    return division, tracks, meta


# ── Key and pitch spelling ──

MAJOR_FIFTHS = {'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F♯': 6, 'C♯': 7,
                'F': -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7}
MINOR_FIFTHS = {'A': 0, 'E': 1, 'B': 2, 'F♯': 3, 'C♯': 4, 'G♯': 5, 'D♯': 6, 'A♯': 7,
                'D': -1, 'G': -2, 'C': -3, 'F': -4, 'B♭': -5, 'E♭': -6, 'A♭': -7}
SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B']          # order of sharps; flats are the reverse
LETTER_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
FLAT_SPELLING = {0: 'C', 1: 'D♭', 2: 'D', 3: 'E♭', 4: 'E', 5: 'F', 6: 'G♭', 7: 'G', 8: 'A♭', 9: 'A', 10: 'B♭', 11: 'B'}
SHARP_SPELLING = {0: 'C', 1: 'C♯', 2: 'D', 3: 'D♯', 4: 'E', 5: 'F', 6: 'F♯', 7: 'G', 8: 'G♯', 9: 'A', 10: 'A♯', 11: 'B'}


def key_fifths(text):
    """'B♭' / 'Bb' / 'B♭m' / 'Bbm' / 'B♭ minor' / 'b♭ min' / 'E major' → fifths (as review_page.key_fifths)."""
    m = re.match(r'^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(m|min|minor|maj|major)?\s*$', text or '', re.I)
    if not m: raise ValueError(f'bad key {text!r}')
    root = m.group(1).upper() + m.group(2).replace('#', '♯').replace('b', '♭')
    mode = (m.group(3) or '').lower()
    table = MINOR_FIFTHS if mode in ('m', 'min', 'minor') else MAJOR_FIFTHS
    if root not in table: raise ValueError(f'no key signature for {text!r}')
    return table[root]


def spelling_table(fifths):
    """pitch class → spelled name without octave, for a key signature of `fifths`."""
    table = dict(FLAT_SPELLING if fifths <= 0 else SHARP_SPELLING)
    if fifths == 0:
        table[6] = 'F♯'
    signature = SHARPS[:fifths] if fifths > 0 else SHARPS[::-1][:-fifths]
    acc = '♯' if fifths > 0 else '♭'
    for letter in signature:
        pc = (LETTER_PC[letter] + (1 if fifths > 0 else -1)) % 12
        table[pc] = letter + acc
    return table


def spell_midi(midi, table):
    name = table[midi % 12]
    offset = sum(1 for c in name if c == '♯') - sum(1 for c in name if c == '♭')
    octave = (midi - offset) // 12 - 1          # the letter's octave (C♭4 = 59, B♯3 = 60)
    return f'{name}{octave}'


# ── Conversion ──

def fmt(x):
    """Fraction → JSON number: int when whole, else float."""
    return int(x) if x.denominator == 1 else float(x)


def snap(x, grid):
    return round(x / grid) * grid


def beat_label(onset):
    """Onset in quarters from the bar start → the README's 'beat N' wording (1-based, fractional)."""
    b = onset + 1
    return f'beat {fmt(b)}' if b.denominator == 1 else f'beat {float(b):.3g}'


def quantise_track(notes, division, grid, min_rest, bpb, staff, table):
    """Raw (start_tick, end_tick, pitch, ch, vel) → list of {'on': Fraction, 'end': Fraction, 'midi': int}
    in absolute quarters, plus uncertain notes {bar: [str]} (rules 2 and 3)."""
    uncertain = {}

    def flag(onset, text):
        bar = int(onset // bpb) + 1
        uncertain.setdefault(bar, []).append(f'{staff} {beat_label(onset - (bar - 1) * bpb)}: {text}')

    quantised = []
    for start, end, pitch, _ch, _vel in sorted(notes):
        raw_on = Fraction(start, division); raw_dur = Fraction(end - start, division)
        on = snap(raw_on, grid); dur = snap(raw_dur, grid)
        name = spell_midi(pitch, table)
        notes_ = []
        if on != raw_on:
            notes_.append(f'onset {float(raw_on):.3f} q → {fmt(on)} q (off the {fmt(grid)} grid)')
        if dur < grid:
            notes_.append(f'dur {float(raw_dur):.3f} q → {fmt(grid)} q (bumped to one grid)')
            dur = grid
        quantised.append({'on': on, 'end': on + dur, 'midi': pitch, 'name': name, 'raw_on': raw_on, 'raw_dur': raw_dur, 'notes': notes_})

    # clip at the next onset of the same pitch; drop duplicates that snapped onto the same onset
    out = []
    by_pitch = {}
    for n in quantised:
        by_pitch.setdefault(n['midi'], []).append(n)
    for pitch, seq in by_pitch.items():
        seq.sort(key=lambda n: (n['on'], n['raw_on']))
        kept = []
        for n in seq:
            if kept and kept[-1]['on'] == n['on']:
                flag(n['on'], f"{n['name']} onset {float(n['raw_on']):.3f} q dur {float(n['raw_dur']):.3f} q dropped: a second attack of the same note snapped to {fmt(n['on'])} q")
                continue
            kept.append(n)
        for a, b in zip(kept, kept[1:]):
            if a['end'] > b['on']:
                a['notes'].append(f"dur {float(a['raw_dur']):.3f} q → {fmt(b['on'] - a['on'])} q (clipped at the next {a['name']})")
                a['end'] = b['on']
        out.extend(kept)
    # close gaps shorter than min_rest: extend the note to the next onset in this hand (any pitch)
    onsets = sorted({n['on'] for n in out})
    for n in out:
        nxt = next((o for o in onsets if o > n['on']), None)
        if nxt is not None and n['end'] < nxt and nxt - n['end'] < min_rest:
            n['notes'].append(f"dur {float(n['raw_dur']):.3f} q → {fmt(nxt - n['on'])} q (gap {fmt(nxt - n['end'])} q < min rest {fmt(min_rest)} q; extended to the next onset)")
            n['end'] = nxt
    for n in out:
        if n['notes']:
            flag(n['on'], f"{n['name']} " + '; '.join(n['notes']) + f" — written onset {fmt(n['on'])} q dur {fmt(n['end'] - n['on'])} q")
    out.sort(key=lambda n: (n['on'], n['midi']))
    return out, uncertain


def group_chords(notes):
    """Rule 4: same onset and end → one event, pitches low → high; same onset, different end → separate, longer first."""
    groups = {}
    for n in notes:
        groups.setdefault((n['on'], n['end']), []).append(n)
    events = []
    for (on, end), ns in sorted(groups.items(), key=lambda kv: (kv[0][0], -kv[0][1])):
        ns.sort(key=lambda n: n['midi'])
        events.append({'on': on, 'end': end, 'pitches': [n['name'] for n in ns]})
    return events


def split_bars(events, bpb):
    """Rule 5: cut events at bar lines with ties. → {bar: [event dicts with onset/dur relative to the bar]}"""
    bars = {}
    for e in events:
        on, end = e['on'], e['end']
        first = True
        while on < end:
            bar = int(on // bpb) + 1
            bar_end = bar * bpb
            piece_end = min(end, bar_end)
            continues = piece_end < end
            tie = None
            if first and continues: tie = 'start'
            elif not first and continues: tie = 'both'
            elif not first: tie = 'stop'
            bars.setdefault(bar, []).append({'onset': on - (bar - 1) * bpb, 'dur': piece_end - on, 'pitches': list(e['pitches']), 'rest': False, 'tie': tie})
            on = piece_end; first = False
    return bars


def with_rests(events, bpb):
    """Rule 6: fill every gap in the union of sounding spans with one rest; a silent bar is one whole-bar rest."""
    spans = sorted((e['onset'], e['onset'] + e['dur']) for e in events)
    rests = []
    cursor = Fraction(0)
    for s, e in spans:
        if s > cursor:
            rests.append({'onset': cursor, 'dur': s - cursor, 'pitches': [], 'rest': True, 'tie': None})
        cursor = max(cursor, e)
    if cursor < bpb:
        rests.append({'onset': cursor, 'dur': bpb - cursor, 'pitches': [], 'rest': True, 'tie': None})
    out = events + rests
    out.sort(key=lambda e: (e['onset'], e['rest'], -e['dur']))
    return out


def validate_staff(events, bpb):
    """Rule 7. Returns a list of problems (empty when the staff is sound)."""
    problems = []
    sounding = [(e['onset'], e['onset'] + e['dur']) for e in events if not e['rest']]
    rests = [(e['onset'], e['onset'] + e['dur']) for e in events if e['rest']]
    for s, e in sounding + rests:
        if s < 0 or e > bpb: problems.append(f'span {fmt(s)}–{fmt(e)} outside the bar')
        if e <= s: problems.append(f'span {fmt(s)}–{fmt(e)} has no length')
    for rs, re_ in rests:
        for s, e in sounding:
            if s < re_ and rs < e: problems.append(f'rest {fmt(rs)}–{fmt(re_)} overlaps a note {fmt(s)}–{fmt(e)}')
    cursor = Fraction(0)
    for s, e in sorted(sounding + rests):
        if s > cursor: problems.append(f'gap {fmt(cursor)}–{fmt(s)}')
        cursor = max(cursor, e)
    if cursor != bpb: problems.append(f'staff ends at {fmt(cursor)}, bar is {fmt(bpb)}')
    return problems


def jsonable(e):
    return {'onset': fmt(e['onset']), 'dur': fmt(e['dur']), 'pitches': e['pitches'], 'rest': e['rest'], 'tie': e['tie']}


def parse_time(text):
    m = re.match(r'^\s*(\d+)\s*/\s*(\d+)\s*$', text or '')
    if not m: raise ValueError(f'bad time signature {text!r}')
    return int(m.group(1)), int(m.group(2))


def find_track(tracks, name):
    hits = [t for t in tracks if t['name'].lower() == name.lower()]
    if len(hits) != 1:
        names = ', '.join(repr(t['name']) for t in tracks)
        raise SystemExit(f'track {name!r}: {"not found" if not hits else "ambiguous"} (tracks: {names})')
    return hits[0]


def convert(path, *, piece, reader, key, grid, min_rest=None, time=None, beats_per_bar=None, rh_track='RH', lh_track='LH'):
    division, tracks, meta = read_midi(path)
    fifths = key_fifths(key)
    table = spelling_table(fifths)
    time_sig = parse_time(time) if time else meta['time']
    if time_sig is None:
        raise SystemExit('no time signature in the file: pass --time N/D')
    bpb = Fraction(beats_per_bar) if beats_per_bar is not None else Fraction(time_sig[0] * 4, time_sig[1])
    grid = Fraction(grid)
    min_rest = Fraction(min_rest) if min_rest is not None else grid
    staves = {'rh': find_track(tracks, rh_track), 'lh': find_track(tracks, lh_track)}

    per_staff, uncertain = {}, {}
    for staff, track in staves.items():
        notes, unc = quantise_track(track['notes'], division, grid, min_rest, bpb, staff, table)
        per_staff[staff] = split_bars(group_chords(notes), bpb)
        for bar, items in unc.items():
            uncertain.setdefault(bar, []).extend(items)
        for pitch in track['unclosed']:
            uncertain.setdefault(1, []).append(f'{staff}: {spell_midi(pitch, table)} had no note-off; closed at the end of the track')

    last = max([b for d in per_staff.values() for b in d] + [1])
    bars, problems = [], []
    for n in range(1, last + 1):
        bar = {'bar': n, 'voice': [], 'rh': [], 'lh': []}
        for staff in ('rh', 'lh'):
            events = with_rests(per_staff[staff].get(n, []), bpb)
            for p in validate_staff(events, bpb):
                problems.append(f'bar {n} {staff}: {p}')
            bar[staff] = [jsonable(e) for e in events]
        bar['uncertain'] = uncertain.get(n, [])
        bars.append(bar)
    if problems:
        raise SystemExit('validation failed:\n  ' + '\n  '.join(problems))

    doc = {
        'piece': piece,
        'reader': reader,
        'source': f'{path} ({rh_track} → rh, {lh_track} → lh; {fmt(grid)}-quarter grid, rests ≥ {fmt(min_rest)} q)',
        'date': datetime.date.today().isoformat(),
        'key': key,
        'time': f'{time_sig[0]}/{time_sig[1]}',
        'beatsPerBar': fmt(bpb),
    }
    if meta['tempo_us']:
        bpm = round(60_000_000 / meta['tempo_us'], 1)
        doc['tempo'] = int(bpm) if abs(bpm - round(bpm)) < 0.05 else bpm
    doc['bars'] = bars
    stats = {'division': division, 'tracks': {s: len(t['notes']) for s, t in staves.items()},
             'bars': last, 'uncertain': sum(len(b['uncertain']) for b in bars), 'file_key': meta['key']}
    return doc, stats


def main():
    ap = argparse.ArgumentParser(description='two-track (RH/LH) piano MIDI → norm JSON')
    ap.add_argument('input', help='Standard MIDI File (type 0 or 1)')
    ap.add_argument('--piece', required=True, help='piece slug, e.g. prelude-winston-first-16')
    ap.add_argument('--out', required=True, help='output path, e.g. static/private/pieces/<slug>.norm.json')
    ap.add_argument('--key', required=True, help='key with optional mode: "B♭", "B♭m", "B♭ minor" (the file\'s key meta is ignored)')
    ap.add_argument('--time', help='time signature N/D; default: the file\'s time signature')
    ap.add_argument('--beats-per-bar', type=float, help='quarters per bar; default N × 4 / D')
    ap.add_argument('--grid', default='0.5', help='quantisation grid in quarters (default 0.5 = 8th notes)')
    ap.add_argument('--min-rest', help='shortest gap written as a rest, in quarters (default = --grid); shorter gaps extend the note')
    ap.add_argument('--rh-track', default='RH', help='name of the right-hand track (default RH)')
    ap.add_argument('--lh-track', default='LH', help='name of the left-hand track (default LH)')
    ap.add_argument('--reader', default='midi', help='reader name written to the output (default midi)')
    a = ap.parse_args()
    doc, stats = convert(a.input, piece=a.piece, reader=a.reader, key=a.key, grid=a.grid, min_rest=a.min_rest, time=a.time,
                         beats_per_bar=a.beats_per_bar, rh_track=a.rh_track, lh_track=a.lh_track)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    print(f"wrote {a.out}: {stats['bars']} bars, {doc['time']} ({doc['beatsPerBar']} q/bar), key {doc['key']}"
          f"{', tempo ' + str(doc['tempo']) + ' bpm' if 'tempo' in doc else ''}; "
          f"notes rh {stats['tracks']['rh']} lh {stats['tracks']['lh']}; {stats['uncertain']} uncertain; "
          f"division {stats['division']}; file key meta {stats['file_key']} (ignored)")


if __name__ == '__main__':
    main()
