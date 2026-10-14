import copy, sys
from fractions import Fraction
from music21 import (stream, note, chord, meter, key, clef, tempo, harmony,
                     expressions, bar, spanner, metadata, tie, layout, duration)
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from score_src import BARS, REPEATS, ENDINGS, TEXT

def dur(s):
    return Fraction(s) if '/' in s else Fraction(s).limit_denominator(8) if '.' in s else Fraction(int(s))

def parse_voice(text):
    """Return list of music21 objects (graces included, ties flagged)."""
    out, grace_next, toks = [], None, text.split()
    i = 0
    # re-join chord tokens split on spaces
    joined = []
    while i < len(toks):
        t = toks[i]
        if '[' in t and ']' not in t:
            while ']' not in t:
                i += 1; t += ' ' + toks[i]
        joined.append(t); i += 1
    for t in joined:
        if t.startswith('g:'):
            g = note.Note(t[2:]); g = g.getGrace(); g.duration.slash = True
            out.append(g); continue
        arp = t.startswith('arp:')
        if arp: t = t[4:]
        tied = t.endswith('~'); t = t.rstrip('~')
        p, d = t.rsplit(':', 1)
        ql = dur(d)
        if p == 'r':
            obj = note.Rest(quarterLength=ql)
        elif p.startswith('['):
            obj = chord.Chord(p.strip('[]').split(), quarterLength=ql)
        else:
            obj = note.Note(p, quarterLength=ql)
        if arp: obj.expressions.append(expressions.ArpeggioMark())
        obj._tieStart = tied
        out.append(obj)
    return out

import re
def chord_symbol(fig):
    if fig.startswith('('):
        te = expressions.TextExpression(fig); te.placement = 'above'
        return te
    m = re.match(r'^([A-G][-#]?)(.*?)(?:/([A-G][-#]?))?$', fig)
    root, kind, bassn = m.group(1), m.group(2), m.group(3)
    base = {'maj7':'maj7','m7':'m7','7':'7','7#11':'7','maj9#5':'maj7'}[kind]
    cs = harmony.ChordSymbol(root + base + ('/' + bassn if bassn else ''))
    cs.chordKindStr = kind
    cs.writeAsChord = False
    return cs

score = stream.Score()
md = metadata.Metadata()
md.title = "Don't Be Sad  (Brad Mehldau)"
md.composer = "Brad Mehldau"
score.metadata = md

rh = stream.PartStaff(id='RH'); lh = stream.PartStaff(id='LH')
rh.partName = 'Piano'
for n in sorted(BARS):
    syms, mel, bass, chv = BARS[n]
    m1 = stream.Measure(number=n); m2 = stream.Measure(number=n)
    if n == 1:
        m1.append([clef.TrebleClef(), key.Key('G'), meter.TimeSignature('3/4')])
        m1.insert(0, tempo.MetronomeMark(text='Gently, swing 8ths', number=93, referent='quarter'))
        m2.append([clef.BassClef(), key.Key('G'), meter.TimeSignature('3/4')])
    if n in TEXT:
        te = expressions.RehearsalMark(TEXT[n]) if len(TEXT[n]) < 8 else expressions.TextExpression(TEXT[n])
        if isinstance(te, expressions.TextExpression): te.placement = 'above'
        m1.insert(0, te)
    for o in parse_voice(mel):
        m1.append(o)
    for off, fig in syms:
        m1.insert(off, chord_symbol(fig))
    v1 = stream.Voice(id='1'); v2 = stream.Voice(id='2')
    for o in parse_voice(bass): v1.append(o)
    for o in parse_voice(chv):
        if isinstance(o, note.Rest): o.style.hideObjectOnPrint = True
        elif hasattr(o, 'stemDirection'): o.stemDirection = 'up'
        v2.append(o)
    for o in v1.notes: o.stemDirection = 'down'
    m2.insert(0, v1); m2.insert(0, v2)
    for m in (m1, m2):
        if n in REPEATS['start']: m.leftBarline = bar.Repeat(direction='start')
        if n in REPEATS['end']: m.rightBarline = bar.Repeat(direction='end')
        if n == max(BARS): m.rightBarline = bar.Barline('final')
    if n > 1 and (n-1) % 4 == 0:
        m1.insert(0, layout.SystemLayout(isNew=True))
    rh.append(m1); lh.append(m2)

# ties: walk each voice-sequence
def apply_ties(seq):
    seq = [o for o in seq if not isinstance(o, harmony.ChordSymbol) and not o.duration.isGrace]
    for a, b in zip(seq, seq[1:]):
        if getattr(a, '_tieStart', False):
            a.tie = tie.Tie('start') if a.tie is None else tie.Tie('continue')
            b.tie = tie.Tie('stop')
apply_ties(list(rh.recurse().notesAndRests))
for vid in ('1', '2'):
    seq = []
    for m in lh.getElementsByClass(stream.Measure):
        for v in m.voices:
            if v.id == vid: seq.extend(v.notesAndRests)
    apply_ties(seq)
# fix 'stop' then 'start' on same note -> continue
for o in list(rh.recurse().notes) + list(lh.recurse().notes):
    pass

# endings
for num, (a, b) in ENDINGS.items():
    for part in (rh, lh):
        ms = [m for m in part.getElementsByClass(stream.Measure) if a <= m.number <= b]
        part.insert(0, spanner.RepeatBracket(ms, number=num))

score.insert(0, rh); score.insert(0, lh)
score.insert(0, layout.StaffGroup([rh, lh], name='Piano', abbreviation='Pno.', symbol='brace'))

out = sys.argv[1]
score.write('musicxml', fp=f'{out}/Dont_Be_Sad.musicxml')
order = list(range(1,21))*2 + list(range(21,37)) + list(range(21,29)) + list(range(37,45))
play = stream.Score()
for part in (rh, lh):
    meas = {m.number: m for m in part.getElementsByClass(stream.Measure)}
    np_ = stream.Part()
    for i, n in enumerate(order):
        m = copy.deepcopy(meas[n]); m.number = i + 1
        m.leftBarline = None; m.rightBarline = None
        for el in list(m.recurse().getElementsByClass((meter.TimeSignature, key.Key, clef.Clef, tempo.MetronomeMark))):
            if i > 0: el.activeSite.remove(el)
        np_.append(m)
    play.insert(0, np_)
play.write('midi', fp=f'{out}/Dont_Be_Sad.mid')
print('midi bars:', len(order), 'quarters:', play.highestTime)
# sanity: bar durations
for part in (rh, lh):
    for m in part.getElementsByClass(stream.Measure):
        if m.voices:
            for v in m.voices:
                if v.duration.quarterLength != 3: print('BAD', part.id, m.number, 'voice', v.id, v.duration.quarterLength)
        elif m.duration.quarterLength != 3:
            print('BAD', part.id, m.number, m.duration.quarterLength)
print('done')
