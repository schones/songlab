#!/usr/bin/env python3
"""
ly_to_src.py — convert a small subset of a LilyPond piano score into the
score_src token grammar that export_json.py reads.

Written for Mutopia's Maple Leaf Rag (maple.ly, LilyPond 2.14.2, two
\\relative blocks "top" and "bottom", volta repeat with two endings).
Not a general LilyPond parser.

Handles: \\relative pitch with ' and , (after a chord the next note is
relative to the chord's first note), Dutch note names with is/es and the
as/es short forms, ! and ? forced accidentals, durations with dots, ties
(~), rests (r, s), <chords>, \\partial, \\repeat volta N { } and
\\alternative { { } { } }, bar checks (|).
Skips: dynamics, markup, articulations, slurs, \\clef, \\stem*, \\change,
\\break, \\override, \\key, \\time.

Reduction (also stated in the fixture's attribution.notes):
  melody       = the top note of each right-hand event
  bass voice   = left-hand events that are a single note or an octave dyad
                 (export_json.py keeps the lower note in bassLine)
  chord voice  = every other left-hand event
  pickup bar   = dropped; right-hand inner tones dropped

Usage (from the repo root):
  python3 tools/voicings/ly_to_src.py --ly tests/fixtures/maple-leaf-rag.ly \\
      --out tests/fixtures/maple-leaf-rag.src.py
"""
import argparse
import re
from fractions import Fraction
from pathlib import Path

LETTER_STEP = {'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6}
LETTER_PC = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
ACC = {'': 0, 'is': 1, 'es': -1, 's': -1, 'isis': 2, 'eses': -2, 'ses': -2}

# ── Source blocks ────────────────────────────────────────────────────

def extract_block(text, name):
    """Return (relative_start, body) for `name = \\relative <pitch> { ... }`."""
    m = re.search(r'^\s*' + re.escape(name) + r'\s*=\s*\\relative\s+([a-g][\',]*)\s*\{', text, re.M)
    if not m:
        raise ValueError(f'block {name!r} not found')
    i = m.end()
    depth, j = 1, i
    while depth:
        c = text[j]
        depth += (c == '{') - (c == '}')
        j += 1
    return m.group(1), text[i:j - 1]


def strip_noise(body):
    body = re.sub(r'%.*', '', body)
    # markup blocks (nested braces), attached with _ ^ - or bare
    while True:
        m = re.search(r'[_^-]?\\markup\s*\{', body)
        if not m:
            break
        i = m.end(); depth = 1
        while depth:
            depth += (body[i] == '{') - (body[i] == '}'); i += 1
        body = body[:m.start()] + ' ' + body[i:]
    body = re.sub(r'\\override[^\n]*', ' ', body)
    body = re.sub(r'\\change\s+Staff\s*=\s*"[^"]*"', ' ', body)
    body = re.sub(r'\\clef\s+(?:"[^"]*"|\w+)', ' ', body)
    body = re.sub(r'\\key\s+[a-g][eis]*\s+\\(?:major|minor)', ' ', body)
    body = re.sub(r'\\time\s+\d+/\d+', ' ', body)
    body = re.sub(r'\\bar\s+"[^"]*"', ' ', body)
    body = re.sub(r'\\(?:stemUp|stemDown|stemNeutral|break|noBreak)\b', ' ', body)
    body = re.sub(r'[_^-]?\\(?:ff+|f|mf|mp|p+|sfz|fp|<|>|!)(?![a-zA-Z])', ' ', body)   # dynamics, hairpins
    body = re.sub(r'[_^-]?[()]', ' ', body)                                            # slurs and phrasing
    body = re.sub(r'[_^-]?\\[\w.]+\s*#\S+', ' ', body)                                 # remaining property commands
    body = re.sub(r'[_^-][.>^+_!]', ' ', body)                                         # articulations
    return body


# ── Tokenizer ────────────────────────────────────────────────────────

TOKEN_RE = re.compile(r'''
    (?P<kw>volta)
  | (?P<chord><[^>]*>[\d.]*~?)          # <notes>dur~
  | (?P<note>[a-g](?:isis|eses|is|es|ses|s)?[!?]?[',]*[\d.]*~?)
  | (?P<rest>[rs][\d.]*)
  | (?P<cmd>\\[A-Za-z]+)
  | (?P<num>\d+/?\d*)
  | (?P<brace>[{}])
  | (?P<bar>\|)
  | (?P<tie>~)
''', re.X)


def tokenize(body):
    out, pos = [], 0
    for m in TOKEN_RE.finditer(body):
        gap = body[pos:m.start()]
        if gap.strip():
            raise ValueError(f'unparsed text: {gap.strip()!r} before {m.group(0)!r}')
        pos = m.end()
        out.append((m.lastgroup, m.group(0)))
    tail = body[pos:]
    if tail.strip():
        raise ValueError(f'unparsed tail: {tail.strip()!r}')
    return out


# ── Pitches & durations ──────────────────────────────────────────────

NOTE_RE = re.compile(r'^([a-g])(isis|eses|is|es|ses|s)?[!?]?([\',]*)([\d.]*)(~?)$')


def parse_note(tok, ref):
    """tok like "as'16~"; ref = (letter_step, octave) of the relative reference.
    Returns ((spelled, midi, (step, octave)), dur_str, tied)."""
    m = NOTE_RE.match(tok)
    if not m:
        raise ValueError(f'bad note token {tok!r}')
    letter, acc, marks, dur, tie = m.groups()
    acc = acc or ''
    if acc == 's' and letter not in ('a', 'e'):
        raise ValueError(f'bad accidental in {tok!r}')
    step = LETTER_STEP[letter]
    ref_step, ref_oct = ref
    diff = step - ref_step
    octave = ref_oct - 1 if diff > 3 else ref_oct + 1 if diff < -3 else ref_oct
    octave += marks.count("'") - marks.count(',')
    offset = ACC[acc]
    midi = (octave + 1) * 12 + LETTER_PC[letter] + offset
    spelled = letter.upper() + ('#' * offset if offset > 0 else '-' * -offset) + str(octave)
    return (spelled, midi, (step, octave)), dur, bool(tie)


def parse_dur(dur_str, cur):
    """LilyPond duration string → Fraction quarters; empty = current."""
    if not dur_str:
        return cur
    m = re.match(r'^(\d+)(\.*)$', dur_str)
    if not m:
        raise ValueError(f'bad duration {dur_str!r}')
    q = Fraction(4, int(m.group(1)))
    total, add = q, q
    for _ in m.group(2):
        add /= 2; total += add
    return total


def fmt_dur(q):
    if q.denominator == 1:
        return str(q.numerator)
    s = str(float(q))
    return s[1:] if s.startswith('0.') else s


# ── Events ───────────────────────────────────────────────────────────

def read_events(tokens, start_ref):
    """Walk the token stream. Returns dict with 'pickup', 'body' (list of bars),
    'alternatives' (list of bars). A bar is a list of events
    {pitches:[(spelled, midi)], dur:Fraction, rest:bool, tie:bool}."""
    ref = start_ref
    cur = Fraction(1)          # LilyPond default duration: quarter
    pickup, body, alts = [], [], []
    segment = []               # events since the last bar check
    where = 'pickup'           # pickup | body | alt
    depth = 0
    i = 0

    def flush():
        nonlocal segment
        if where == 'pickup':
            pickup.extend(segment)
        elif where == 'body':
            if segment:
                body.append(segment)
        segment = []

    while i < len(tokens):
        kind, tok = tokens[i]
        if kind == 'cmd':
            if tok == '\\partial':
                i += 2; continue                       # \partial 8
            if tok == '\\repeat':
                i += 3                                  # \repeat volta 2
                assert tokens[i] == ('brace', '{'), tokens[i]
                flush(); where = 'body'; depth = 1; i += 1; continue
            if tok == '\\alternative':
                i += 1
                assert tokens[i] == ('brace', '{'), tokens[i]
                where = 'alt'; i += 1
                while tokens[i] == ('brace', '{'):
                    i += 1; segment = []
                    while tokens[i] != ('brace', '}'):
                        kind, tok = tokens[i]
                        if kind in ('chord', 'note', 'rest'):
                            ev, ref, cur = make_event(kind, tok, ref, cur)
                            segment.append(ev)
                        elif kind == 'tie':
                            segment[-1]['tie'] = True             # "<...> ~" with a space
                        elif kind != 'bar':
                            raise ValueError(f'unexpected {tok!r} in alternative')
                        i += 1
                    alts.append(segment); segment = []; i += 1
                assert tokens[i] == ('brace', '}'), tokens[i]
                return {'pickup': pickup, 'body': body, 'alternatives': alts}
            raise ValueError(f'unhandled command {tok!r}')
        if kind == 'brace':
            if tok == '{':
                depth += 1
            else:
                depth -= 1
                if where == 'body' and depth == 0:
                    flush(); where = 'after'
            i += 1; continue
        if kind == 'bar':
            flush(); i += 1; continue
        if kind in ('chord', 'note', 'rest'):
            ev, ref, cur = make_event(kind, tok, ref, cur)
            segment.append(ev); i += 1; continue
        if kind == 'tie':
            (segment or pickup)[-1]['tie'] = True; i += 1; continue   # "<...> ~" with a space
        if kind in ('num', 'kw'):
            i += 1; continue
        raise ValueError(f'unhandled token {tok!r}')
    flush()
    return {'pickup': pickup, 'body': body, 'alternatives': alts}


def make_event(kind, tok, ref, cur):
    if kind == 'rest':
        m = re.match(r'^[rs]([\d.]*)$', tok)
        dur = parse_dur(m.group(1), cur)
        return {'pitches': [], 'dur': dur, 'rest': True, 'tie': False}, ref, dur
    if kind == 'note':
        (sp, midi, pos), dur_s, tie = parse_note(tok, ref)
        dur = parse_dur(dur_s, cur)
        return {'pitches': [(sp, midi)], 'dur': dur, 'rest': False, 'tie': tie}, pos, dur
    m = re.match(r'^<([^>]*)>([\d.]*)(~?)$', tok)
    names, dur_s, tie = m.group(1).split(), m.group(2), bool(m.group(3))
    pitches, first_pos, r = [], None, ref
    for n in names:
        (sp, midi, pos), _, _ = parse_note(n, r)
        pitches.append((sp, midi))
        if first_pos is None:
            first_pos = pos
        r = pos
    dur = parse_dur(dur_s, cur)
    return {'pitches': pitches, 'dur': dur, 'rest': False, 'tie': tie}, first_pos, dur


# ── Reduction to the token grammar ───────────────────────────────────

def tok(pitches, dur, tie):
    body = pitches[0] if len(pitches) == 1 else '[' + ' '.join(pitches) + ']'
    return f'{body}:{fmt_dur(dur)}' + ('~' if tie else '')


def merge_rests(tokens):
    out = []
    for t in tokens:
        if t[0] == 'r' and out and out[-1][0] == 'r' and not out[-1].endswith('~'):
            a = Fraction(out[-1].split(':')[1]); b = Fraction(t.split(':')[1])
            out[-1] = f'r:{fmt_dur(a + b)}'
        else:
            out.append(t)
    return out


def melody_string(bar):
    toks = []
    for ev in bar:
        if ev['rest']:
            toks.append(f"r:{fmt_dur(ev['dur'])}")
        else:
            top = max(ev['pitches'], key=lambda p: p[1])[0]
            toks.append(tok([top], ev['dur'], ev['tie']))
    return ' '.join(merge_rests(toks))


def is_bass_event(ev):
    if ev['rest']:
        return False
    midis = sorted(p[1] for p in ev['pitches'])
    return len(midis) == 1 or (len(midis) == 2 and (midis[1] - midis[0]) % 12 == 0)


def lh_strings(bar):
    bass, chord = [], []
    for ev in bar:
        r = f"r:{fmt_dur(ev['dur'])}"
        if ev['rest']:
            bass.append(r); chord.append(r)
        elif is_bass_event(ev):
            bass.append(tok([p[0] for p in sorted(ev['pitches'], key=lambda p: p[1])], ev['dur'], ev['tie'])); chord.append(r)
        else:
            chord.append(tok([p[0] for p in sorted(ev['pitches'], key=lambda p: p[1])], ev['dur'], ev['tie'])); bass.append(r)
    return ' '.join(merge_rests(bass)), ' '.join(merge_rests(chord))


def bars_of(parsed):
    return parsed['body'] + parsed['alternatives']


def check_lengths(bars, beats, label):
    for n, bar in enumerate(bars, 1):
        total = sum(ev['dur'] for ev in bar)
        if total != beats:
            raise ValueError(f'{label} bar {n} sums to {total} quarters, expected {beats}')


# ── Maple Leaf Rag specifics ─────────────────────────────────────────

# Chord symbols are NOT in the Mutopia edition (rags carry none) and were not
# written by Dustin: an earlier Claude session derived them by analysing the
# reduction (2026-10). Corrected 2026-10-19: the first version put the top note
# of the chord cluster in the slash; a slash names the bass, so now a slash
# appears only when the lowest sounding note is not the root, and names that
# note (the dim7 bars stay unslashed by decision). The JSON carries
# chordSymbols: 'derived' so /voicings can say so.
# Beats in quarters. Figures in the exporter's grammar (- = flat).
SYMBOLS = {
    1:  [(0, 'A-')],
    2:  [(0, 'E-7/B-')],
    3:  [(0, 'A-')],
    4:  [(0, 'E-7/B-')],
    5:  [(0, 'F-')],
    6:  [(0, 'F-'), (1, 'E-7')],
    7:  [(0, 'A-')],
    8:  [(0, 'A-')],
    9:  [(0, 'Bdim7')],
    10: [(0, 'A-/E-')],
    11: [(0, 'F-'), (1, 'A-/E-')],
    12: [(0, 'A-/E-'), (0.5, 'E-7'), (1, 'A-')],
    13: [(0, 'Bdim7')],
    14: [(0, 'A-/E-')],
    15: [(0, 'F-'), (1, 'A-/E-')],
    16: [(0, 'A-/E-'), (0.5, 'E-7'), (1, 'A-'), (1.5, 'E-')],
    17: [(0, 'A-/E-'), (0.5, 'E-7'), (1, 'A-')],
}

META = {
    'title': 'Maple Leaf Rag (A strain)',
    'key': 'A-',
    'timeSignature': '2/4',
    'tempo': 88,
    'arrangedFrom': 999,
    'chordSymbols': 'derived',
    'attribution': {
        'composer': 'Scott Joplin (1868–1917), c. 1899',
        'source': 'Mutopia Project, Mutopia-2011/11/13-23',
        'url': 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=23',
        'edition': 'Reproduction of original edition (1899), typeset in LilyPond 2.14.2',
        'typesetter': 'Chris Sawer (maintainer, Mutopia Project)',
        'license': 'Public Domain (Creative Commons public domain mark)',
        'notes': (
            'Reduction of the A strain (bars 1–15 plus first and second endings as bars 16 and 17; '
            'the eighth-note pickup is dropped). melody = the top note of each right-hand event; '
            'right-hand inner tones and octave doublings are dropped. bass voice = left-hand single '
            'notes and octave dyads, of which bassLine keeps the lower note; chord voice = every other '
            'left-hand event. Chord symbols are not part of the edition: an earlier Claude session '
            'derived them by analysis (chordSymbols: derived). '
            'Staff-vs-PDF differences that follow from these rules are expected.'
        ),
    },
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ly', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--beats', type=int, default=2, help='quarters per bar')
    args = ap.parse_args()

    text = Path(args.ly).read_text()
    rh_start, rh_body = extract_block(text, 'top')
    lh_start, lh_body = extract_block(text, 'bottom')
    start_ref = lambda s: (LETTER_STEP[s[0]], 3 + s.count("'") - s.count(','))
    rh = read_events(tokenize(strip_noise(rh_body)), start_ref(rh_start))
    lh = read_events(tokenize(strip_noise(lh_body)), start_ref(lh_start))
    rh_bars, lh_bars = bars_of(rh), bars_of(lh)
    beats = Fraction(args.beats)
    check_lengths(rh_bars, beats, 'RH'); check_lengths(lh_bars, beats, 'LH')
    if len(rh_bars) != len(lh_bars):
        raise ValueError(f'RH has {len(rh_bars)} bars, LH {len(lh_bars)}')

    lines = ['# Maple Leaf Rag (Scott Joplin, c. 1899) — A strain, reduced. GENERATED by',
             '# tools/voicings/ly_to_src.py from tests/fixtures/maple-leaf-rag.ly',
             '# (Mutopia-2011/11/13-23, Public Domain). See META["attribution"]["notes"]',
             '# for the reduction rules. Chord symbols are not in the edition: derived by',
             '# analysis in an earlier Claude session (see SYMBOLS in ly_to_src.py).',
             '#',
             '# Each bar: (chord symbols, melody, bass voice, chord voice) — the grammar of',
             '# static/private/score_src.py, read by tools/voicings/export_json.py.',
             '',
             'BARS = {']
    for n, (r, l) in enumerate(zip(rh_bars, lh_bars), 1):
        bass, chord = lh_strings(l)
        lines.append(f'  {n}: ({SYMBOLS.get(n, [])!r}, {melody_string(r)!r}, {bass!r}, {chord!r}),')
    lines += ['}', '',
              f'REPEATS = {{"start": [1], "end": [{len(rh["body"]) + 1}]}}',
              f'ENDINGS = {{1: ({len(rh["body"]) + 1}, {len(rh["body"]) + 1}), 2: ({len(rh["body"]) + 2}, {len(rh["body"]) + 2})}}',
              'TEXT = {1: "A"}', '',
              'META = ' + repr(META).replace("{'", "{\n  '").replace(", '", ",\n  '") + '\n']
    Path(args.out).write_text('\n'.join(lines))
    print(f'wrote {args.out}: {len(rh_bars)} bars ({len(rh["body"])} + {len(rh["alternatives"])} endings); pickup dropped: RH {len(rh["pickup"])} ev, LH {len(lh["pickup"])} ev')


if __name__ == '__main__':
    main()
