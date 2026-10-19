#!/usr/bin/env python3
"""
check_midi.py — verify a voiced-progression fixture against a reference MIDI
file from the same source (Mutopia's maple.mid for the Maple Leaf Rag).

Checks, reported by bar:
  1. every fixture note is in the MIDI at the same pitch: melody and bassLine
     notes must START at the fixture's onset (tie continuations across bar
     lines excepted); comp voicing notes must be SOUNDING at the chord onset;
     comp.bass must have STARTED at or before the chord onset within the bar
     (the lookback allows a bass that has already stopped) or be sounding
     there (a bass carried over from the previous bar);
  2. at each melody onset the highest MIDI note starting there is the melody
     note; at each bassLine onset the lowest MIDI note starting there is the
     bass note.

The MIDI is downloaded to a temp dir unless --midi points to a file. No
dependencies beyond the standard library (tiny SMF reader below).

Usage (from the repo root):
  python3 tools/voicings/check_midi.py --fixture tests/fixtures/voicing-maple-leaf-rag.json \\
      [--midi path/or/url] [--pickup 0.5]
"""
import argparse
import json
import sys
import tempfile
import urllib.request
from fractions import Fraction
from pathlib import Path

MUTOPIA_MIDI = 'https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid'

# ── Minimal Standard MIDI File reader ────────────────────────────────

def read_varlen(data, i):
    v = 0
    while True:
        b = data[i]; i += 1
        v = (v << 7) | (b & 0x7F)
        if not b & 0x80:
            return v, i


def read_midi(path):
    """Return (division, notes) with notes = [(start_tick, end_tick, pitch)]."""
    data = Path(path).read_bytes()
    assert data[:4] == b'MThd', 'not a MIDI file'
    ntrks = int.from_bytes(data[10:12], 'big')
    division = int.from_bytes(data[12:14], 'big')
    i, notes = 14, []
    for _ in range(ntrks):
        assert data[i:i + 4] == b'MTrk'
        length = int.from_bytes(data[i + 4:i + 8], 'big'); i += 8
        end, t, status, open_notes = i + length, 0, None, {}
        while i < end:
            delta, i = read_varlen(data, i); t += delta
            b = data[i]
            if b & 0x80:
                status = b; i += 1
            if status == 0xFF:
                i += 1; ln, i = read_varlen(data, i); i += ln; continue
            if status in (0xF0, 0xF7):
                ln, i = read_varlen(data, i); i += ln; continue
            kind, ch = status & 0xF0, status & 0x0F
            if kind in (0x80, 0x90, 0xA0, 0xB0, 0xE0):
                d1, d2 = data[i], data[i + 1]; i += 2
            else:
                d1, d2 = data[i], 0; i += 1
            if kind == 0x90 and d2 > 0:
                open_notes.setdefault((ch, d1), []).append(t)
            elif kind == 0x80 or (kind == 0x90 and d2 == 0):
                starts = open_notes.get((ch, d1))
                if starts:
                    notes.append((starts.pop(0), t, d1))
        i = end
    return division, notes


# ── Pitch names ──────────────────────────────────────────────────────

LETTER_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi_of(name):
    letter, rest = name[0], name[1:]
    acc = rest.rstrip('-0123456789')
    octave = int(rest[len(acc):])
    offset = sum(1 if c in '#♯' else -1 for c in acc)
    return (octave + 1) * 12 + LETTER_PC[letter] + offset


# ── Check ────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fixture', required=True)
    ap.add_argument('--midi', default=MUTOPIA_MIDI, help='path or URL')
    ap.add_argument('--pickup', type=float, default=0.5, help='quarters before written bar 1 in the MIDI')
    ap.add_argument('--tol', type=int, default=1, help='tick tolerance')
    args = ap.parse_args()

    doc = json.loads(Path(args.fixture).read_text())
    if args.midi.startswith('http'):
        tmp = Path(tempfile.mkdtemp()) / 'reference.mid'
        urllib.request.urlretrieve(args.midi, tmp)
        midi_path = tmp
    else:
        midi_path = Path(args.midi)
    division, notes = read_midi(midi_path)
    bpb = Fraction(doc['beatsPerBar'])
    tick = lambda q: int(round(float(q) * division))

    # Written bar → MIDI offset: first occurrence in the (unfolded) play order.
    order = (doc.get('form') or {}).get('playOrder') or [b['bar'] for b in doc['bars']]
    first_index = {}
    for i, b in enumerate(order):
        first_index.setdefault(b, i)
    offset = lambda bar: Fraction(args.pickup).limit_denominator(64) + first_index[bar] * bpb

    starts_at = {}
    for s, e, p in notes:
        starts_at.setdefault(s, []).append(p)

    def starting(t):
        out = []
        for s in range(t - args.tol, t + args.tol + 1):
            out += starts_at.get(s, [])
        return out

    def sounding(t, p):
        return any(s - args.tol <= t < e and pp == p for s, e, pp in notes)

    def started_within(t0, t1, p):
        return any(t0 - args.tol <= s <= t1 + args.tol and pp == p for s, e, pp in notes)

    problems = {}
    counts = {'notes': 0, 'onsets': 0}
    report = lambda bar, msg: problems.setdefault(bar, []).append(msg)
    last_event = {'melody': None, 'bass': None}      # previous bar's last event per voice, for ties across bar lines

    for bar in doc['bars']:
        n = bar['bar']
        base = offset(n)
        at = lambda beat: tick(base + Fraction(beat).limit_denominator(64))

        def voice(events, label, extreme):
            prev = last_event[label]
            for ev in events:
                p = midi_of(ev['note']); t = at(ev['beat'])
                if prev is not None and prev.get('_bar') == n:
                    joined = abs(prev['beat'] + prev['dur'] - ev['beat']) < 1e-6
                else:   # previous bar's last event: a tie reaches this bar's beat 0
                    joined = prev is not None and abs(ev['beat']) < 1e-6 and abs(prev['beat'] + prev['dur'] - float(bpb)) < 1e-6
                continuation = prev is not None and prev.get('tie') and midi_of(prev['note']) == p and joined
                prev = dict(ev, _bar=n)
                last_event[label] = prev
                if continuation:
                    continue
                counts['notes'] += 1; counts['onsets'] += 1
                st = starting(t)
                if p not in st:
                    report(n, f"{label} {ev['note']} @{ev['beat']}: no MIDI note starts there" + (f" (starting: {sorted(st)})" if st else ''))
                    continue
                ext = extreme(st)
                if ext != p:
                    report(n, f"{label} {ev['note']} @{ev['beat']}: MIDI {'top' if extreme is max else 'bottom'} note there is {ext}, not {p}")

        voice(bar.get('melody', []), 'melody', max)
        voice(bar.get('bassLine', []), 'bass', min)
        for ev in bar.get('comp', []):
            t = at(ev['beat'])
            for name in ev.get('voicing', []):
                counts['notes'] += 1
                p = midi_of(name)
                if not sounding(t, p):
                    report(n, f"comp {name} @{ev['beat']}: not sounding in the MIDI")
            counts['notes'] += 1
            pb = midi_of(ev['bass'])
            if not (started_within(at(0), t, pb) or sounding(t, pb)):
                report(n, f"comp.bass {ev['bass']} @{ev['beat']}: no such bass started in this bar at or before the chord, and none sounding")

    print(f'\n─── check_midi: {Path(args.fixture).name} vs {Path(str(midi_path)).name} ───')
    print(f'  division {division} ticks/quarter · {len(notes)} MIDI notes · {len(doc["bars"])} bars · pickup {args.pickup} q')
    print(f'  checked {counts["notes"]} fixture notes, {counts["onsets"]} melody/bass onsets')
    if problems:
        for n in sorted(problems):
            print(f'  bar {n}:')
            for msg in problems[n]:
                print(f'    ✗ {msg}')
        print(f'\n─── {sum(len(v) for v in problems.values())} mismatches in {len(problems)} bars ───\n')
        sys.exit(1)
    print('  ✓ every fixture note found; melody is the top and bass the bottom at every onset')
    print('\n─── 0 mismatches ───\n')


if __name__ == '__main__':
    main()
