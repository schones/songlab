#!/usr/bin/env python3
"""
export_json.py — convert a practice-score source (score_src.py) into a
voiced-progression JSON file for the Voicing Explorer analysis engine.

Usage (from the repo root):
    python3 tools/voicings/export_json.py
    python3 tools/voicings/export_json.py --src static/private/score_src.py \
        --out static/private/dont-be-sad.json

No music21 dependency: the token grammar of score_src.py is parsed here.
Schema: tools/voicings/schema.md. Engine: static/shared/voicing-analysis.js.

Token grammar (per voice string, space separated):
    PITCH:dur        note            e.g. "B-4:.5"   (music21 spelling: - = flat)
    [P P P]:dur      chord           e.g. "[A3 B3 D4]:2"
    r:dur            rest
    suffix "~"       tie into the next note of the same voice
    prefix "g:"      grace note (omitted from the export)
    prefix "arp:"    arpeggiated chord (flagged on the comp event)
    dur              quarters: "1", ".5", "1/3"

Comp events are keyed to chord-voice onsets: each one carries the chord
voice's notes plus whatever the bass voice is sounding at that moment.
If the chord voice is silent for the whole bar, bass-voice onsets are
used instead. Bass-voice motion under a silent chord voice (the pickup
walks in bars 4 and 20) is not exported as an event in v1.
"""
import argparse
import importlib.util
import json
import re
import sys
from fractions import Fraction
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = 1

# ── Pitch ────────────────────────────────────────────────────────────

_LETTER_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
_PITCH_RE = re.compile(r'^([A-G])([#\-]*)(-?\d+)$')


def parse_pitch(tok):
    """'B-4' -> ('B♭4', 70). music21 spelling in, Unicode spelling out."""
    m = _PITCH_RE.match(tok)
    if not m:
        raise ValueError(f'bad pitch token: {tok!r}')
    letter, acc, octave = m.group(1), m.group(2), int(m.group(3))
    offset = acc.count('#') - acc.count('-')
    midi = (octave + 1) * 12 + _LETTER_PC[letter] + offset
    spelled = letter + acc.replace('#', '♯').replace('-', '♭') + str(octave)
    return spelled, midi


def parse_dur(s):
    if '/' in s:
        return Fraction(s)
    if '.' in s:
        return Fraction(s).limit_denominator(8)
    return Fraction(int(s))


# ── Voice parsing ────────────────────────────────────────────────────

def parse_voice(text):
    """Return a list of events {beat, dur, pitches:[(spelled, midi)], rest, tie, arp}.
    Grace notes are dropped. Beats are Fractions in quarters."""
    toks = text.split()
    joined, i = [], 0
    while i < len(toks):
        t = toks[i]
        if '[' in t and ']' not in t:
            while ']' not in t:
                i += 1
                t += ' ' + toks[i]
        joined.append(t)
        i += 1

    events, beat = [], Fraction(0)
    for t in joined:
        if t.startswith('g:'):
            continue
        arp = t.startswith('arp:')
        if arp:
            t = t[4:]
        tie = t.endswith('~')
        t = t.rstrip('~')
        p, d = t.rsplit(':', 1)
        dur = parse_dur(d)
        if p == 'r':
            ev = dict(beat=beat, dur=dur, pitches=[], rest=True, tie=False, arp=False)
        elif p.startswith('['):
            pitches = [parse_pitch(x) for x in p.strip('[]').split()]
            ev = dict(beat=beat, dur=dur, pitches=pitches, rest=False, tie=tie, arp=arp)
        else:
            ev = dict(beat=beat, dur=dur, pitches=[parse_pitch(p)], rest=False, tie=tie, arp=arp)
        events.append(ev)
        beat += dur
    return events


def sounding_at(events, t):
    """Pitches of non-rest events sounding at beat t."""
    out = []
    for ev in events:
        if not ev['rest'] and ev['beat'] <= t < ev['beat'] + ev['dur']:
            out.extend(ev['pitches'])
    return out


def num(fr):
    """Fraction -> int when integral, else float rounded to 4 places."""
    return int(fr) if fr.denominator == 1 else round(float(fr), 4)


# ── Bar conversion ───────────────────────────────────────────────────

def comp_events(bass_text, chord_text):
    bass_ev = parse_voice(bass_text)
    chord_ev = parse_voice(chord_text)
    onsets = [ev for ev in chord_ev if not ev['rest']]
    keyed_to_chord = bool(onsets)
    if not keyed_to_chord:
        onsets = [ev for ev in bass_ev if not ev['rest']]

    out = []
    for ev in onsets:
        notes = list(ev['pitches'])
        if keyed_to_chord:
            notes += sounding_at(bass_ev, ev['beat'])
        # dedupe by midi, keep first spelling; sort low -> high
        seen, uniq = set(), []
        for sp, mid in sorted(notes, key=lambda x: x[1]):
            if mid in seen:
                continue
            seen.add(mid)
            uniq.append((sp, mid))
        if not uniq:
            continue
        rec = {
            'beat': num(ev['beat']),
            'dur': num(ev['dur']),
            'bass': uniq[0][0],
            'voicing': [sp for sp, _ in uniq[1:]],
        }
        arp = ev['arp'] or any(b['arp'] for b in bass_ev
                               if not b['rest'] and b['beat'] <= ev['beat'] < b['beat'] + b['dur'])
        if arp:
            rec['arp'] = True
        if ev['tie']:
            rec['tie'] = True
        out.append(rec)
    return out


def melody_events(text):
    out, prev = [], None
    for ev in parse_voice(text):
        if ev['rest']:
            prev = None
            continue
        for sp, mid in ev['pitches']:
            # merge a tied continuation of the same pitch within the bar
            if prev is not None and prev['_tie'] and prev['_midi'] == mid \
                    and prev['beat'] + prev['_dur'] == ev['beat']:
                prev['_dur'] += ev['dur']
                prev['dur'] = num(prev['_dur'])
                prev['_tie'] = ev['tie']
                continue
            rec = {'beat': num(ev['beat']), 'dur': num(ev['dur']), 'note': sp,
                   '_midi': mid, '_dur': ev['dur'], '_tie': ev['tie']}
            out.append(rec)
            prev = rec
    for rec in out:
        if rec['_tie']:
            rec['tie'] = True
        for k in ('_midi', '_dur', '_tie'):
            del rec[k]
    return out


_SYM_RE = re.compile(r'^([A-G])([#\-]?)(.*?)(?:/([A-G])([#\-]?))?$')


def convert_symbol(fig):
    """'E-maj7' -> 'E♭maj7'; 'A7#11/C#' -> 'A7♯11/C♯'."""
    m = _SYM_RE.match(fig)
    if not m:
        raise ValueError(f'bad chord figure: {fig!r}')
    root, racc, suffix, bass, bacc = m.groups()
    acc = lambda a: a.replace('#', '♯').replace('-', '♭')
    s = root + acc(racc) + suffix.replace('#', '♯').replace('b', '♭')
    if bass:
        s += '/' + bass + acc(bacc)
    return s


def convert_bar(n, entry, section, source):
    syms, mel, bass, chv = entry
    symbols, annotation = [], None
    for off, fig in syms:
        if fig.startswith('('):
            annotation = fig.strip('()')
        else:
            symbols.append({'beat': num(Fraction(off)), 'symbol': convert_symbol(fig)})
    return {
        'bar': n,
        'section': section,
        'source': source,
        'symbols': symbols,
        'annotation': annotation,
        'comp': comp_events(bass, chv),
        'melody': melody_events(mel),
    }


# ── Form ─────────────────────────────────────────────────────────────

def play_order(bar_numbers, repeats, endings):
    """Expand repeats and numbered endings into a playback bar order."""
    starts, ends = repeats.get('start', []), repeats.get('end', [])
    spans = list(zip(sorted(starts), sorted(ends)))
    order, i, bars = [], 0, sorted(bar_numbers)
    while i < len(bars):
        b = bars[i]
        span = next((s for s in spans if s[0] == b), None)
        if span is None:
            order.append(b)
            i += 1
            continue
        s, e = span
        e1 = endings.get(1)
        e2 = endings.get(2)
        if e1 and s <= e1[0] <= e:
            order += list(range(s, e + 1))              # first pass incl. 1st ending
            order += list(range(s, e1[0]))              # second pass up to the ending
            order += list(range(e2[0], e2[1] + 1))      # 2nd ending
            i = bars.index(e2[1]) + 1
        else:
            order += list(range(s, e + 1)) * 2
            i = bars.index(e) + 1
    return order


# ── Main ─────────────────────────────────────────────────────────────

def load_src(path):
    spec = importlib.util.spec_from_file_location('score_src', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def section_for(n, text_marks):
    label = 'Intro'
    for start in sorted(text_marks):
        if n >= start:
            label = text_marks[start].split(' — ')[0].strip()
    return label


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=str(REPO / 'static/private/score_src.py'))
    ap.add_argument('--out', default=str(REPO / 'static/private/dont-be-sad.json'))
    ap.add_argument('--title', default="Don't Be Sad")
    ap.add_argument('--key', default='G')
    ap.add_argument('--time', default='3/4')
    ap.add_argument('--tempo', type=int, default=93)
    ap.add_argument('--arranged-from', type=int, default=21,
                    help='first bar whose voicings are arranged rather than transcribed')
    args = ap.parse_args()

    src = load_src(args.src)
    num_, den = (int(x) for x in args.time.split('/'))
    beats_per_bar = num(Fraction(num_ * 4, den))

    bars = []
    for n in sorted(src.BARS):
        section = section_for(n, getattr(src, 'TEXT', {}))
        source = 'arranged' if n >= args.arranged_from else 'transcribed'
        bars.append(convert_bar(n, src.BARS[n], section, source))

    repeats = getattr(src, 'REPEATS', {'start': [], 'end': []})
    endings = getattr(src, 'ENDINGS', {})
    doc = {
        'schemaVersion': SCHEMA_VERSION,
        'title': args.title,
        'key': args.key,
        'timeSignature': args.time,
        'beatsPerBar': beats_per_bar,
        'tempo': args.tempo,
        'form': {
            'repeats': [[s, e] for s, e in zip(sorted(repeats.get('start', [])),
                                               sorted(repeats.get('end', [])))],
            'endings': {str(k): list(v) for k, v in endings.items()},
            'playOrder': play_order(src.BARS.keys(), repeats, endings),
        },
        'bars': bars,
    }

    # sanity: every bar's comp + melody fit the bar
    for b in bars:
        for ev in b['comp'] + b['melody']:
            if ev['beat'] + ev['dur'] > beats_per_bar + 1e-9:
                print(f"warn: bar {b['bar']} event exceeds bar length: {ev}", file=sys.stderr)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    print(f'wrote {out} — {len(bars)} bars, play order {len(doc["form"]["playOrder"])} bars')


if __name__ == '__main__':
    main()
