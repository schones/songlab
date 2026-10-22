#!/usr/bin/env python3
"""
diff_reads.py — compare two (or three) normalized reads of a scanned song per
bar and staff (stage 3 of the public piece pilot). Standard library only.

Normalization before comparing (the stage-1 rules):
  * pitches compared as midi numbers (spelling differences reported separately)
  * voices already flattened per staff by the readers; events are compared as
    sounding spans {(onset, midi, end)} with within-bar ties merged (a 'stop'
    event continuing a 'start' at the same midi is absorbed into the span)
  * ottava already applied by the readers
  * grace notes compared as an ordered list of midis, separately
  * rests are not compared (they follow from the spans)

Classes per bar+staff:
  agree          same spans, same grace list, same spellings
  spelling-only  same spans and graces, at least one pitch spelled differently
  disagree       anything else; flagged audiveris-broken when the Audiveris staff's
                 total length is not the bar length (default 4 quarters)

  python3 tools/pieces/diff_reads.py A.json B.json [--bar-len 4] [--out diff.json]
  As a module: normalize_staff(events) → {'spans': set, 'graces': list, 'names': dict}
                compare(a_events, b_events) → (class, detail)
"""
import argparse, json, re, sys

LETTER_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
STAFFS = ('voice', 'rh', 'lh')
EPS = 1e-6

def midi_of(name):
    m = re.match(r'^([A-G])([♯♭#b♮]*)(-?\d+)$', name)
    if not m: raise ValueError(f'bad pitch {name!r}')
    acc = sum(1 for c in m.group(2) if c in '♯#') - sum(1 for c in m.group(2) if c in '♭b')
    return (int(m.group(3)) + 1) * 12 + LETTER_PC[m.group(1)] + acc

def normalize_staff(events):
    """→ {'spans': {(onset, midi, end)}, 'graces': [midi...], 'names': {(onset, midi): name}, 'end': float}"""
    spans = {}            # (onset, midi) → end, for open spans
    done = set(); names = {}; graces = []; end = 0.0
    open_ties = {}        # midi → (onset, end) of a span that ended with tie start
    for e in events:
        if 'grace' in e:
            graces += [midi_of(p) for p in e['grace']]; continue
        on, du = float(e['onset']), float(e['dur']); end = max(end, on + du)
        if e.get('rest'): continue
        for p in e['pitches']:
            m = midi_of(p)
            if e.get('tie') in ('stop', 'both') and m in open_ties and abs(open_ties[m][1] - on) < EPS:
                o0 = open_ties[m][0]; done.discard((o0, m, open_ties[m][1])); done.add((o0, m, on + du))
                if e.get('tie') == 'both': open_ties[m] = (o0, on + du)
                else: del open_ties[m]
                continue
            done.add((on, m, on + du)); names[(round(on, 4), m)] = p
            if e.get('tie') in ('start', 'both'): open_ties[m] = (on, on + du)
    spans = {(round(a, 4), m, round(z, 4)) for a, m, z in done}
    return {'spans': spans, 'graces': graces, 'names': names, 'end': round(end, 4)}

def compare(a_events, b_events):
    A, B = normalize_staff(a_events), normalize_staff(b_events)
    if A['spans'] != B['spans'] or A['graces'] != B['graces']:
        only_a = sorted(A['spans'] - B['spans']); only_b = sorted(B['spans'] - A['spans'])
        return 'disagree', {'only_a': only_a, 'only_b': only_b, 'graces_a': A['graces'], 'graces_b': B['graces']}
    diff = [(k, A['names'][k], B['names'][k]) for k in A['names'] if k in B['names'] and A['names'][k] != B['names'][k]]
    if diff:
        return 'spelling-only', {'spellings': [{'onset': k[0], 'midi': k[1], 'a': na, 'b': nb} for k, na, nb in sorted(diff)]}
    return 'agree', {}

def same(a_events, b_events):
    return compare(a_events, b_events)[0] != 'disagree'

def diff_reads(a, b, bar_len=4.0):
    A = {x['bar']: x for x in a['bars']}; Bm = {x['bar']: x for x in b['bars']}
    out = []
    for n in sorted(set(A) | set(Bm)):
        for st in STAFFS:
            ea = A.get(n, {}).get(st, []); eb = Bm.get(n, {}).get(st, [])
            cls, detail = compare(ea, eb)
            rec = {'bar': n, 'staff': st, 'class': cls, **detail}
            if cls == 'disagree':
                endb = normalize_staff(eb)['end']
                rec['audiveris_broken'] = abs(endb - bar_len) > EPS or not any(not e.get('rest') for e in eb if 'grace' not in e)
                rec['b_end'] = endb
            out.append(rec)
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b')
    ap.add_argument('--bar-len', type=float, default=4.0); ap.add_argument('--out')
    args = ap.parse_args()
    a = json.load(open(args.a)); b = json.load(open(args.b))
    res = diff_reads(a, b, args.bar_len)
    counts = {}
    for r in res: counts[r['class']] = counts.get(r['class'], 0) + 1
    broken = sum(1 for r in res if r.get('audiveris_broken'))
    print(f"{a.get('reader')} vs {b.get('reader')}: {counts} (disagree with b broken: {broken})")
    for r in res:
        if r['class'] != 'agree':
            print(f"  bar {r['bar']:2d} {r['staff']:5s} {r['class']}{' [b broken]' if r.get('audiveris_broken') else ''}")
    if args.out: json.dump(res, open(args.out, 'w'), ensure_ascii=False, indent=1); print('wrote', args.out)

if __name__ == '__main__':
    main()
