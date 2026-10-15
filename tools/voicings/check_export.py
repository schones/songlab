#!/usr/bin/env python3
"""
check_export.py — self-test for export_json.py (bass lookback and bassLine).

Run from the repo root:
    python3 tools/voicings/check_export.py

Synthetic bars first (one case per rule), then, when the private source and
its exported JSON are present, the shapes of bars 4, 20, 25–27 and a check
that the comp events of every bar still match the committed export.
"""
import importlib.util
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('export_json', REPO / 'tools/voicings/export_json.py')
ex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex)

results = []


def check(label, actual, expected):
    ok = actual == expected
    results.append(ok)
    print(f'  {"✓" if ok else "✗"} {label}' + ('' if ok else f'\n      got:      {actual!r}\n      expected: {expected!r}'))


def shape(events):
    return [(e['beat'], e['dur']) for e in events]


def bar(bass, chord, prev_bass=None, bpb=3, mel='r:3', syms=()):
    prev_ev = ex.parse_voice(prev_bass) if prev_bass else None
    return ex.convert_bar(1, (list(syms), mel, bass, chord), 'T', 'user', prev_ev, bpb)


print('\n─── export_json.py check ───\n')
print('  comp.bass lookback')
b = bar('C3:3', 'r:1 [E3 G3]:2')
check('bass onset in this bar before the chord → that bass, sounding',      (b['comp'][0]['bass'], b['comp'][0]['voicing']), ('C3', ['E3', 'G3']))
b = bar('C3:1 r:1 G2:1', 'r:1 [E3 G3]:1 r:1')
check('bass onset in this bar, no longer sounding (oom-pah) → still that bass', (b['comp'][0]['bass'], b['comp'][0]['voicing']), ('C3', ['E3', 'G3']))
b = bar('r:1 D3:2', '[F3 A3]:1 r:2', prev_bass='C3:3')
check('no bass yet; previous bar\'s bass reaches the bar line → previous bass', b['comp'][0]['bass'], 'C3')
b = bar('r:1 D3:2', '[F3 A3]:1 r:2', prev_bass='C3:2~ r:1'.replace('~ r:1', '~'))
check('no bass yet; previous bar\'s bass tied → previous bass',               b['comp'][0]['bass'], 'C3')
b = bar('r:1 D3:2', '[F3 A3]:1 r:2', prev_bass='C3:2 r:1')
check('no bass yet; previous bass stopped before the bar line → lowest chord note', (b['comp'][0]['bass'], b['comp'][0]['voicing']), ('F3', ['A3']))
b = bar('r:1 D3:2', '[F3 A3]:1 r:2')
check('no bass yet; no previous bar → lowest chord note',                     b['comp'][0]['bass'], 'F3')
b = bar('[C2 C3]:3', 'r:1 [E3 G3]:2')
check('octave dyad in the bass voice → bass is the lower note, upper joins the voicing', (b['comp'][0]['bass'], b['comp'][0]['voicing']), ('C2', ['C3', 'E3', 'G3']))
b = bar('C3:1 D3:1 E3:1', 'r:3')
check('chord voice silent → events keyed to bass onsets, bass = itself',       [(e['beat'], e['bass'], e['voicing']) for e in b['comp']], [(0, 'C3', []), (1, 'D3', []), (2, 'E3', [])])

print('  bassLine')
b = bar('C3:3', 'r:1 [E3 G3]:2')
check('held bass under a later chord → one dotted-half event at beat 0',      b['bassLine'], [{'beat': 0, 'dur': 3, 'note': 'C3'}])
b = bar('C3:1 D3:1 g:E-3 E3:.5 D3:.5', '[G3 B-3 D4]:1 r:2')
check('walk under a held chord → four events, grace dropped',                 shape(b['bassLine']), [(0, 1), (1, 1), (2, 0.5), (2.5, 0.5)])
b = bar('[C2 C3]:2~ r:1', 'r:3')
check('dyad + tie → lower note, tie kept',                                     b['bassLine'], [{'beat': 0, 'dur': 2, 'note': 'C2', 'tie': True}])
b = bar('arp:[C2 G2]:3', 'r:1 [E3 G3]:2')
check('arp flag kept on bassLine and on the comp event',                       (b['bassLine'][0].get('arp'), b['comp'][0].get('arp')), (True, True))
b = bar('r:3', 'r:1 [E3 G3]:2')
check('silent bass voice → empty bassLine, lowest chord note is the bass',     (b['bassLine'], b['comp'][0]['bass']), ([], 'E3'))

src_path = REPO / 'static/private/score_src.py'
json_path = REPO / 'static/private/dont-be-sad.json'
if src_path.exists():
    print('\n  acceptance: static/private/score_src.py')
    src = ex.load_src(src_path)
    bars, prev = {}, None
    for n in sorted(src.BARS):
        bars[n] = ex.convert_bar(n, src.BARS[n], 'x', 'x', prev, 3)
        prev = ex.parse_voice(src.BARS[n][2])
    check('bar 4  bassLine: quarter, quarter, eighth, eighth',  shape(bars[4]['bassLine']), [(0, 1), (1, 1), (2, 0.5), (2.5, 0.5)])
    check('bar 20 bassLine: same walk (dyad reduced to one note)', shape(bars[20]['bassLine']), [(0, 1), (1, 1), (2, 0.5), (2.5, 0.5)])
    check('bars 25–27 bassLine: one dotted half at beat 0',    [shape(bars[n]['bassLine']) for n in (25, 26, 27)], [[(0, 3)]] * 3)
    check('bar 26: two comp events share the beat-0 bass',     [e['beat'] for e in bars[26]['comp']] + [bars[26]['comp'][0]['bass'] == bars[26]['comp'][1]['bass']], [1, 2, True])
    check('every bar has a bassLine',                           all(b['bassLine'] for b in bars.values()), True)
    if json_path.exists():
        doc = json.loads(json_path.read_text())
        committed = {b['bar']: b['comp'] for b in doc['bars']}
        diffs = [n for n in bars if bars[n]['comp'] != committed.get(n)]
        check('comp events unchanged vs the exported JSON (lookback changes no bass)', diffs, [])
else:
    print('\n  acceptance: static/private/score_src.py not present — skipped')

passed = sum(results)
print(f'\n─── {passed}/{len(results)} passed ───\n')
sys.exit(0 if passed == len(results) else 1)
