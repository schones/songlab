#!/usr/bin/env python3
"""
apply_votes.py — merge two or three normalized reads of a scanned song and the
reviewer's choices from the review page into one resolved norm read (stage 4 of
the public piece pipeline). Standard library only. Norm format: tools/pieces/README.md.

  python3 tools/pieces/apply_votes.py PRIMARY.json COMPARISON.json [TIEBREAK.json] \
      --choices choices.json --out resolved.norm.json

Reads are positional, named by their "reader" field; the first is the primary
(piece, title, key, time, beatsPerBar and form are carried from it, and its bar
list defines the output). Comparison is diff_reads' (same spans of onset, midi
and end, same grace list; ties merged; spelling ignored), exactly as
review_page.py decides whether a bar+staff is disputed.

Choices file: the JSON copied from the review page's textarea —
  { "picks": { "<bar>-<staff>": "<reader>" | "none", ... },
    "wrong": [ "<bar>-<staff>", ... ],          section (c) "looks wrong" checks
    "text":  { "<bar>-<staff>": "correction", ... } }   free text per staff

Resolution per bar and staff (voice, rh, lh), in this order:
  1. every reader with a reading agrees (at least two) → "agree", events from the
                                                          first of them
  2. a pick names a reader with a reading              → "pick",  events from that reader
  3. a majority (two of three) agree over a dissenter  → "vote",  events from the first
                                                          reader (in command-line
                                                          order) of the majority
  4. anything else does not get guessed: a "none" pick, a "looks wrong" flag, a
     free-text correction on any staff, or no majority. These are collected and
     listed (bar, staff, text); nothing is written; exit status 1.
Who has a reading: a read with no bar for a bar number abstains there. The
primary and comparison reads are complete, so a staff missing from one of their
bars is an empty staff; the tie-break read covers only the staffs it was asked
about (review_page.py consults it only on disputes), so a staff missing from one
of its bars is no reading. An abstaining reader can neither agree nor dissent.
Ties and spelling follow the chosen reader; events are copied verbatim.

Output: a norm document with reader "resolved", bars in the primary's order, each
{bar, voice, rh, lh}, plus
  "provenance": { "<bar>-<staff>": { "source": "<reader>", "how": "agree"|"pick"|"vote" } }
so every staff's origin is traceable (README: Document fields).

Before writing, the script checks: every staff of every bar sums to the bar
length (midi_to_norm's validate_staff, grace events set aside) and every pitched
event has parseable pitches; bar numbers run continuously from the first to the
last; every output staff compares equal to its source reader's staff; every pick
in the choices file was used (a key that matched no bar+staff, named an unknown
reader, named a reader with no reading there, or fell to rule 1 is listed).
Validation failure → nothing written, exit 2; unused picks → nothing written,
exit 3. The output is deterministic: re-running on the same inputs produces a
byte-identical file.
"""
import argparse, copy, json, os, re, sys
from fractions import Fraction
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diff_reads import compare, midi_of, STAFFS
from midi_to_norm import validate_staff

KEY_RE = re.compile(r'^(\d+)-(voice|rh|lh)$')


def same(a, b):
    return compare(a, b)[0] != 'disagree'


def parse_key(key):
    m = KEY_RE.match(key)
    return (int(m.group(1)), m.group(2)) if m else None


def resolve(docs, names, choices):
    """→ (bars, provenance, unresolved, pick_use)
    bars: output bar records; provenance: key → {source, how};
    unresolved: [{key, bar, staff, reason, text}]; pick_use: key → how the pick fared
    ('used', or a reason it was not)."""
    picks = choices.get('picks', {}) or {}
    wrong = set(choices.get('wrong', []) or [])
    text = choices.get('text', {}) or {}
    R = [{b['bar']: b for b in d['bars']} for d in docs]
    primary = R[0]
    bars, prov, unresolved = [], {}, []
    pick_use = {k: None for k in picks}

    def events_of(i, n, st):
        """Reader i's reading of bar n, staff st; None (no reading) when the read has no bar n, or
        when a tie-break read (third and later) has the bar but not the staff."""
        if n not in R[i]: return None
        return R[i][n].get(st, []) if i < 2 else R[i][n].get(st)

    for n in sorted(primary):
        rec = {'bar': n}
        for st in STAFFS:
            key = f'{n}-{st}'
            readings = {name: events_of(i, n, st) for i, name in enumerate(names)}
            present = [name for name in names if readings[name] is not None]
            pick = picks.get(key)
            note = text.get(key)
            source = how = None
            problem = None

            if key in wrong:
                problem = 'flagged "looks wrong"'
            elif pick == 'none':
                problem = 'pick "none"'
            elif note:
                problem = 'free-text correction'

            if problem is None:
                # 1. every reader with a reading agrees (at least two of them)
                if len(present) >= 2 and all(same(readings[present[0]], readings[x]) for x in present[1:]):
                    source, how = present[0], 'agree'
                # 2. the reviewer's pick
                elif pick is not None and pick in names and readings[pick] is not None:
                    source, how = pick, 'pick'
                else:
                    # 3. majority
                    for cand in present:
                        group = [x for x in present if same(readings[cand], readings[x])]
                        if len(group) >= 2 and len(group) * 2 > len(names):
                            source, how = group[0], 'vote'
                            break
                if source is None:
                    problem = f'no majority among {present}' if present else 'no reading in any read'

            if pick is not None and pick != 'none':
                if how == 'pick': pick_use[key] = 'used'
                elif pick not in names: pick_use[key] = f'unknown reader {pick!r} (readers: {", ".join(names)})'
                elif readings[pick] is None: pick_use[key] = f'{pick} has no bar {n}'
                elif how == 'agree': pick_use[key] = 'not needed: the reads agree'
                elif how == 'vote': pick_use[key] = 'overtaken by vote'
                else: pick_use[key] = 'staff unresolved'

            if problem is not None:
                unresolved.append({'key': key, 'bar': n, 'staff': st, 'reason': problem, 'text': note or ''})
                continue
            rec[st] = copy.deepcopy(readings[source])
            prov[key] = {'source': source, 'how': how}
        bars.append(rec)

    for key in picks:
        if pick_use[key] is None:
            if parse_key(key) is None: pick_use[key] = 'malformed key (want <bar>-<voice|rh|lh>)'
            elif parse_key(key)[0] not in primary: pick_use[key] = f'no bar {parse_key(key)[0]} in the primary read'
            elif picks[key] == 'none': pick_use[key] = 'pick "none" (unresolved)'
            else: pick_use[key] = 'not used'
    return bars, prov, unresolved, pick_use


def validate(bars, prov, docs, names, bar_len):
    """→ list of problem strings (empty when sound)."""
    problems = []
    R = [{b['bar']: b for b in d['bars']} for d in docs]
    bpb = Fraction(bar_len)
    for rec in bars:
        n = rec['bar']
        for st in STAFFS:
            key = f'{n}-{st}'
            events = rec.get(st)
            if events is None: problems.append(f'bar {n} {st}: missing'); continue
            plain = []
            for e in events:
                if 'grace' in e:
                    for p in e['grace']:
                        try: midi_of(p)
                        except ValueError as ex: problems.append(f'bar {n} {st}: {ex}')
                    continue
                try:
                    plain.append({'onset': Fraction(e['onset']), 'dur': Fraction(e['dur']), 'rest': bool(e.get('rest'))})
                except (TypeError, ValueError, KeyError) as ex:
                    problems.append(f'bar {n} {st}: bad event {e!r} ({ex})'); continue
                if not e.get('rest'):
                    if not e.get('pitches'): problems.append(f'bar {n} {st}: sounding event at {e["onset"]} with no pitches')
                    for p in e.get('pitches', []):
                        try: midi_of(p)
                        except ValueError as ex: problems.append(f'bar {n} {st}: {ex}')
            for p in validate_staff(plain, bpb):
                problems.append(f'bar {n} {st}: {p}')
            src = prov.get(key)
            if src is None: problems.append(f'bar {n} {st}: no provenance'); continue
            i = names.index(src['source'])
            if n not in R[i] or not same(events, R[i][n].get(st, [])):
                problems.append(f'bar {n} {st}: output differs from its source {src["source"]}')
    nums = [rec['bar'] for rec in bars]
    if not nums: problems.append('no bars')
    else:
        missing = sorted(set(range(nums[0], nums[-1] + 1)) - set(nums))
        if missing: problems.append(f'bars missing from the run {nums[0]}–{nums[-1]}: {missing}')
        if nums != sorted(nums) or len(set(nums)) != len(nums): problems.append(f'bar numbers not ascending and unique: {nums}')
    return problems


def main():
    ap = argparse.ArgumentParser(description='Merge 2–3 norm reads and the review-page choices into one resolved read.')
    ap.add_argument('reads', nargs='+', metavar='READ', help='norm JSON files: primary, comparison, [tie-break]')
    ap.add_argument('--choices', help='choices JSON copied from the review page ({picks, wrong, text})')
    ap.add_argument('--out', required=True, help='resolved norm JSON to write')
    ap.add_argument('--bar-len', type=float, help='quarters per bar; default: the primary read\'s "beatsPerBar", else from "time"')
    a = ap.parse_args()
    if not 2 <= len(a.reads) <= 3: ap.error('give 2 or 3 read files')

    docs = [json.load(open(p, encoding='utf-8')) for p in a.reads]
    names = []
    for p, d in zip(a.reads, docs):
        name = d.get('reader')
        if not name: ap.error(f'{p}: no "reader" field')
        if name in names: ap.error(f'{p}: reader name {name!r} used twice')
        names.append(name)
    primary = docs[0]
    choices = json.load(open(a.choices, encoding='utf-8')) if a.choices else {}

    bar_len = a.bar_len
    if bar_len is None:
        bar_len = primary.get('beatsPerBar')
    if bar_len is None:
        m = re.match(r'^\s*(\d+)\s*/\s*(\d+)\s*$', primary.get('time') or '')
        bar_len = int(m.group(1)) * 4 / int(m.group(2)) if m else 4
        print(f'note: no beatsPerBar in the primary read; using {bar_len:g}', file=sys.stderr)

    bars, prov, unresolved, pick_use = resolve(docs, names, choices)

    if unresolved:
        print(f'{len(unresolved)} staff(s) not resolved — nothing written:')
        for u in unresolved:
            print(f'  bar {u["bar"]:2d} {u["staff"]:5s} {u["reason"]}' + (f': {u["text"]}' if u['text'] else ''))
        sys.exit(1)

    problems = validate(bars, prov, docs, names, bar_len)
    if problems:
        print(f'validation failed ({len(problems)} problem(s)) — nothing written:')
        for p in problems: print('  ' + p)
        sys.exit(2)

    unused = {k: v for k, v in pick_use.items() if v != 'used'}
    counts = {'agree': 0, 'pick': 0, 'vote': 0}
    for v in prov.values(): counts[v['how']] += 1
    nums = [rec['bar'] for rec in bars]
    print(f'readers: {", ".join(names)}; bars {nums[0]}–{nums[-1]} ({len(nums)} bars, {len(prov)} staffs)')
    print(f'resolved by agree: {counts["agree"]}, pick: {counts["pick"]}, vote: {counts["vote"]}')
    print(f'picks: {len(pick_use)} in the choices file, {len(pick_use) - len(unused)} used')
    if unused:
        print('unused picks — nothing written:')
        for k, v in unused.items(): print(f'  {k} = {choices["picks"][k]!r}: {v}')
        sys.exit(3)

    out = {'piece': primary.get('piece')}
    if primary.get('title'): out['title'] = primary['title']
    out['reader'] = 'resolved'
    out['source'] = (f'apply_votes.py: {" + ".join(names)}'
                     + (f', choices {os.path.basename(a.choices)}' if a.choices else ''))
    for f in ('key', 'time', 'beatsPerBar', 'form'):
        if f in primary: out[f] = primary[f]
    out['bars'] = bars
    out['provenance'] = prov
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
