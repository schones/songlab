#!/usr/bin/env python3
"""
Fixture test for tools/pieces/musicxml_to_norm.py. Standard library only.

  python3 tests/pieces/test_musicxml_to_norm.py

Each case converts a small hand-written MusicXML file from
tests/fixtures/musicxml/ and compares the result exactly with the expected
norm JSON beside it (<name>[.<variant>].expected.json — deliberately not
norm-<slug>.json, so /player's picker never lists them), or expects a refusal
whose message names the bar. The date is pinned. Exits 1 on any failure.

Also: a compressed .mxl built from a fixture gives the same norm; re-import
keeps the hand-written fields unless --fresh; and, only when
~/songlab-imports/run-rudolph.musicxml exists on this machine, that file
converts to 72 valid bars (nothing from it is stored here).
"""
import contextlib
import io
import json
import sys
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools' / 'pieces'))
sys.dont_write_bytecode = True
import musicxml_to_norm as mx   # noqa: E402

FIX = REPO / 'tests' / 'fixtures' / 'musicxml'
DATE = '2026-01-01'
NO_TITLE = dict(piece='clef-change', title='Clef Change')

# (label, fixture, variant, convert() arguments)
CASES = [
    ('two staves, chords and ties', 'mx-basic', None, {}),
    ('clef changes at a bar start and at a bar end', 'mx-clef-change', None, NO_TITLE),
    ('--bars 2-3: renumbered, clefs as they stand at bar 2', 'mx-clef-change', 'bars-2-3', dict(NO_TITLE, bars='2-3')),
    ('line breaks from new-system; sound tempo at bar 1', 'mx-line-breaks', None, {}),
    ('--bars 3-5: lines renumbered, tempo from the metronome mark at bar 3', 'mx-line-breaks', 'bars-3-5', dict(bars='3-5')),
    ('flags override the file: key, tempo, marking, lines, clefs, slug', 'mx-line-breaks', 'flags',
     dict(piece='flags', title='Flags', key='A minor', tempo=72, tempo_marking='Slow', bars_per_line=2, clefs=['lh:treble@1,bass@4'])),
    ('backup and forward, two voices on one staff', 'mx-backup-forward', None, {}),
    ('barline repeat → repeats and form.playOrder', 'mx-repeat', None, {}),
    ('--play-order replaces the derived order', 'mx-repeat', 'play-order', dict(play_order='1-4,2-3,4')),
    ('first and second endings → form.playOrder', 'mx-endings', None, {}),
    ('fingering, one entry per pitch', 'mx-fingering', None, {}),
    ('marks from the file: segno, toCoda (with its coda sign), dsAlCoda, coda, dcAlCoda; repeats', 'mx-marks-coda', None, {}),
    ('--bars 2-5: marks and repeats renumbered', 'mx-marks-coda', 'bars-2-5', dict(bars='2-5')),
    ('marks from the file: fine, a bare D.S. → dsAlFine, dcAlFine', 'mx-marks-fine', None, {}),
    ('mark and repeat flags on a file without marks; "none" clears the file\'s repeat end', 'mx-repeat', 'mark-flags',
     dict(marks={'segno': '2', 'toCoda': '3', 'dsAlCoda': '4', 'coda': '4', 'fine': '1,3'}, repeat_end='none')),
    ('a mark flag replaces the file\'s bars for that type only', 'mx-marks-coda', 'flag-replaces', dict(marks={'coda': '6', 'dcAlCoda': 'none'})),
]

# (label, fixture, convert() arguments, words the refusal must contain)
REFUSALS = [
    ('pickup bar', 'mx-pickup', {}, ['bar 1', 'pickup']),
    ('triplet', 'mx-triplet', {}, ['bar 2', 'tuplets']),
    ('no title and no --title', 'mx-clef-change', {}, ['--title']),
    ('--play-order past the last bar', 'mx-repeat', dict(play_order='1-5'), ['bar 5', 'last bar (4)']),
    ('--bars past the last bar', 'mx-repeat', dict(bars='3-9'), ['4 bars']),
    ('a mark flag past the last bar', 'mx-repeat', dict(marks={'segno': '9'}), ['--segno', 'bar 9']),
    ('a mark flag that is not a bar list', 'mx-repeat', dict(marks={'toCoda': 'x'}), ['--to-coda']),
    ('--repeat-start past the last bar', 'mx-repeat', dict(repeat_start='7'), ['--repeat-start', 'bar 7']),
]

# (label, fixture, text to replace, replacement, words the refusal must contain) — variants made in a temp folder
VARIANTS = [
    ('alto clef', 'mx-clef-change', '<clef number="2"><sign>F</sign><line>4</line></clef>', '<clef number="2"><sign>C</sign><line>3</line></clef>',
     ['bar 2', 'lh', 'treble and bass']),
    ('time change inside the range', 'mx-repeat', '<measure number="3">',
     '<measure number="3"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>', ['bar 3', 'time signature']),
    ('key change inside the range', 'mx-repeat', '<measure number="3">',
     '<measure number="3"><attributes><key><fifths>1</fifths></key></attributes>', ['bar 3', 'key signature']),
]

passed = total = 0


def check(label, ok, detail=''):
    global passed, total
    total += 1; passed += bool(ok)
    print(f"{'  ok  ' if ok else 'FAILED'} {label}" + (f'\n       {detail}' if detail and not ok else ''))


def expected(name, variant=None):
    path = FIX / f"{name}{'.' + variant if variant else ''}.expected.json"
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def first_difference(a, b, where='doc'):
    if type(a) is not type(b): return f'{where}: {a!r} != {b!r}'
    if isinstance(a, dict):
        if list(a) != list(b): return f'{where}: fields {list(a)} != {list(b)}'
        return next((d for k in a if (d := first_difference(a[k], b[k], f'{where}.{k}'))), None)
    if isinstance(a, list):
        if len(a) != len(b): return f'{where}: {len(a)} items != {len(b)}'
        return next((d for i in range(len(a)) if (d := first_difference(a[i], b[i], f'{where}[{i}]'))), None)
    return None if a == b else f'{where}: {a!r} != {b!r}'


def refusal(path, args):
    try:
        mx.convert(path, date=DATE, **args)
    except ValueError as e:
        return str(e)
    return None


def run_main(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        mx.main([str(a) for a in argv])
    return out.getvalue()


def main():
    for label, name, variant, args in CASES:
        want = expected(name, variant)
        try:
            got = json.loads(json.dumps(mx.convert(FIX / f'{name}.musicxml', date=DATE, **args)[0], ensure_ascii=False))
        except ValueError as e:
            check(label, False, f'refused: {e}'); continue
        check(label, want is not None and first_difference(got, want) is None,
              'no expected file' if want is None else first_difference(got, want))

    for label, name, args, words in REFUSALS:
        msg = refusal(FIX / f'{name}.musicxml', args)
        check(f'refused: {label}', msg is not None and all(w in msg for w in words), f'message: {msg!r}')

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for label, name, old, new, words in VARIANTS:
            text = (FIX / f'{name}.musicxml').read_text(encoding='utf-8')
            assert old in text, (name, old)
            path = tmp / f'{name}-variant.musicxml'
            path.write_text(text.replace(old, new, 1), encoding='utf-8')
            msg = refusal(path, NO_TITLE)
            check(f'refused: {label}', msg is not None and all(w in msg for w in words), f'message: {msg!r}')

        # compressed .mxl: same notes; only `source` names the other file
        mxl = tmp / 'mx-basic.mxl'
        with zipfile.ZipFile(mxl, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>')
            z.write(FIX / 'mx-basic.musicxml', 'score.musicxml')
        got = mx.convert(mxl, date=DATE)[0]
        want = expected('mx-basic')
        check('.mxl gives the same norm', want is not None and got['source'].startswith('mx-basic.mxl ')
              and {k: v for k, v in got.items() if k != 'source'} == {k: v for k, v in want.items() if k != 'source'})
        check('source holds the file name, not its path', str(tmp) not in json.dumps(got) and '/' not in got['source'])

        # re-import: hand-written fields survive, --fresh drops them, --tempo wins over a kept tempo
        out = tmp / 'basic.norm.json'
        run_main(FIX / 'mx-basic.musicxml', '--out', out)
        first = json.loads(out.read_text(encoding='utf-8'))
        hand = {'tempo': 60, 'feel': 'rubato', 'anchors': [1, 2], 'syncopation': 'displaced',
                'songNotes': [{'id': 'feel', 'title': 'Feel', 'body': 'Gently.'}]}
        out.write_text(json.dumps({**first, **hand}, ensure_ascii=False), encoding='utf-8')
        said = run_main(FIX / 'mx-basic.musicxml', '--out', out)
        again = json.loads(out.read_text(encoding='utf-8'))
        check('re-import keeps feel, anchors, songNotes, syncopation and the edited tempo',
              all(again.get(k) == v for k, v in hand.items()) and again['bars'] == first['bars'] and list(again)[-1] == 'bars',
              f'fields: {list(again)}')
        check('re-import prints the kept fields', 'kept from the existing file: tempo, feel, anchors, songNotes, syncopation' in said, said)
        said = run_main(FIX / 'mx-basic.musicxml', '--out', out, '--tempo', '100')
        again = json.loads(out.read_text(encoding='utf-8'))
        check('re-import with --tempo: the flag wins, the rest is kept', again['tempo'] == 100 and again['feel'] == 'rubato' and 'tempo,' not in said, said)
        run_main(FIX / 'mx-basic.musicxml', '--out', out, '--fresh')
        fresh = json.loads(out.read_text(encoding='utf-8'))
        check('--fresh drops them', {**fresh, 'date': DATE} == {**first, 'date': DATE} and 'feel' not in fresh)

        # the command line: one flag per mark type
        out = tmp / 'cli.norm.json'
        said = run_main(FIX / 'mx-repeat.musicxml', '--out', out, '--segno', '2', '--to-coda', '3', '--ds-al-coda', '4', '--coda', '4',
                        '--dc-al-coda', '1', '--ds-al-fine', '1', '--dc-al-fine', '1', '--fine', '1', '--repeat-start', '1', '--repeat-end', '4')
        cli = json.loads(out.read_text(encoding='utf-8'))
        check('command line: every mark flag and both repeat flags reach the file',
              cli.get('marks') == {'segno': [2], 'coda': [4], 'toCoda': [3], 'dsAlCoda': [4], 'dcAlCoda': [1], 'dsAlFine': [1], 'dcAlFine': [1], 'fine': [1]}
              and cli.get('repeats') == {'start': [1], 'end': [4]}, f"{cli.get('marks')} {cli.get('repeats')}")
        check('command line: the marks are printed, with a note that jumps are not derived', 'marks: segno 2' in said and 'jumps are not derived' in said, said)
        cli['feel'] = 'strict'; cli['marks'] = {'fine': [2]}; cli['repeats'] = {'start': [3], 'end': []}
        out.write_text(json.dumps(cli, ensure_ascii=False), encoding='utf-8')
        run_main(FIX / 'mx-repeat.musicxml', '--out', out)
        again = json.loads(out.read_text(encoding='utf-8'))
        check('re-import: marks and repeats are rebuilt from the file and flags, not kept; feel is kept',
              'marks' not in again and again.get('repeats') == {'start': [2], 'end': [3]} and again.get('feel') == 'strict', f"{again.get('marks')} {again.get('repeats')}")

    local = Path.home() / 'songlab-imports' / 'run-rudolph.musicxml'
    if local.exists():
        try:
            doc, _ = mx.convert(local, piece='local-check', title='Local check', date=DATE)
            check('local file: 72 valid bars', len(doc['bars']) == 72, f"{len(doc['bars'])} bars")
        except ValueError as e:
            check('local file: 72 valid bars', False, f'refused: {e}')
    else:
        print('  --   local file check skipped (~/songlab-imports/run-rudolph.musicxml not present)')

    print(f'\n{passed}/{total} passed')
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
