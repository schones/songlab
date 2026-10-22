#!/usr/bin/env python3
"""collect_third.py — merge per-bar third-read files (third/bar-NN.json) into one normalized read.
   python3 tools/pieces/collect_third.py --dir sources/work/third --out sources/work/igr-read-third.json"""
import argparse, glob, json, os
ap = argparse.ArgumentParser(); ap.add_argument('--dir', required=True); ap.add_argument('--out', required=True); ap.add_argument('--piece', default='i-got-rhythm')
a = ap.parse_args()
bars, notes = [], {}
for f in sorted(glob.glob(os.path.join(a.dir, 'bar-*.json'))):
    try: d = json.load(open(f, encoding='utf-8'))
    except Exception as e: print('skip', f, e); continue
    bar = {'bar': int(d['bar'])}
    for st in ('voice', 'rh', 'lh'):
        if st in d: bar[st] = d[st]
    if d.get('notes'): notes[bar['bar']] = d['notes']
    bars.append(bar)
bars.sort(key=lambda b: b['bar'])
json.dump({'piece': a.piece, 'reader': 'third', 'source': 'independent agents, one per bar, crops only', 'bars': bars, 'notes': notes}, open(a.out, 'w'), ensure_ascii=False, indent=1)
print(f'wrote {a.out}: {len(bars)} bars, staffs:', {b['bar']: [k for k in b if k != 'bar'] for b in bars})
