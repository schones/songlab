#!/usr/bin/env python3
"""collect_third.py — merge per-bar read files (DIR/bar-NN.json) into one normalized read.
   python3 tools/pieces/collect_third.py --dir sources/work/third --piece i-got-rhythm \
       --out sources/work/igr-read-third.json [--reader third] [--key B♭] [--time 2/2] [--beats-per-bar 4]
   Norm format: tools/pieces/README.md. --key/--time/--beats-per-bar are optional and are
   written to the output metadata when given."""
import argparse, glob, json, os
ap = argparse.ArgumentParser()
ap.add_argument('--dir', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--piece', required=True, help='piece slug, e.g. i-got-rhythm')
ap.add_argument('--reader', default='third', help='reader name written to the output (default: third)')
ap.add_argument('--key', help='key string, e.g. "B♭" or "B♭ minor"')
ap.add_argument('--time', help='time signature N/D')
ap.add_argument('--beats-per-bar', type=float, help='quarters per bar')
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
doc = {'piece': a.piece, 'reader': a.reader, 'source': 'independent agents, one per bar, crops only'}
if a.key: doc['key'] = a.key
if a.time: doc['time'] = a.time
if a.beats_per_bar is not None: doc['beatsPerBar'] = int(a.beats_per_bar) if a.beats_per_bar == int(a.beats_per_bar) else a.beats_per_bar
doc['bars'] = bars; doc['notes'] = notes
json.dump(doc, open(a.out, 'w'), ensure_ascii=False, indent=1)
print(f'wrote {a.out}: {len(bars)} bars, staffs:', {b['bar']: [k for k in b if k != 'bar'] for b in bars})
