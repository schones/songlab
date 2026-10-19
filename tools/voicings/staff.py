"""Render one small grand-staff SVG per bar, colored like the explorer keyboard.
Two sets: melody highlighted (mel) and melody ghosted (comp)."""
import re, sys, os
import verovio
from music21 import converter, stream, chord, note

SRC = sys.argv[1]           # cleaned Dont_Be_Sad.musicxml
OUT = sys.argv[2]           # output folder for svgs
os.makedirs(OUT, exist_ok=True)
GOLD, BLUE = '#A8740C', '#2D5F8A'
MEL = {'mel': '#1F8A70', 'comp': '#B4BCC7'}

def colored(variant):
    s = converter.parse(SRC)
    rh, lh = s.parts[0], s.parts[1]
    for n in rh.recurse().notes:
        if isinstance(n, chord.Chord) and n.__class__.__name__ == 'ChordSymbol':
            continue
        if hasattr(n, 'pitches') and n.__class__.__name__ not in ('ChordSymbol',):
            n.style.color = MEL[variant]
            if isinstance(n, chord.Chord):
                for x in n.notes: x.style.color = MEL[variant]
    for m in lh.getElementsByClass(stream.Measure):
        for vi, v in enumerate(m.voices):
            for n in v.notes:
                if vi == 0:
                    if isinstance(n, chord.Chord):
                        low = min(n.pitches, key=lambda p: p.midi)
                        for x in n.notes:
                            x.style.color = GOLD if x.pitch.midi == low.midi else BLUE
                    else:
                        n.style.color = GOLD
                else:
                    if isinstance(n, chord.Chord):
                        for x in n.notes: x.style.color = BLUE
                    else:
                        n.style.color = BLUE
    return s

for variant in ('mel', 'comp'):
    s = colored(variant)
    xml_path = f'{OUT}/_{variant}.musicxml'
    s.write('musicxml', fp=xml_path)
    x = open(xml_path).read()
    x = re.sub(r'\s*<(root|bass)-alter>0</(root|bass)-alter>', '', x)
    tk = verovio.toolkit()
    tk.setOptions({"scale": 42, "pageWidth": 900, "adjustPageWidth": True, "adjustPageHeight": True,
                   "header": "none", "footer": "none", "pageMarginLeft": 30, "pageMarginRight": 30,
                   "pageMarginTop": 20, "pageMarginBottom": 10, "svgRemoveXlink": True,
                   "breaks": "none", "spacingStaff": 6})
    tk.loadData(x)
    for n in range(1, 45):
        tk.select({"measureRange": f"{n}-{n}"})
        tk.redoLayout()
        svg = tk.renderToSVG(1)
        svg = re.sub(r'<style[^>]*>.*?</style>', '', svg, flags=re.S)
        svg = re.sub(r'<(path|rect|ellipse|polygon|polyline)(\s)', r'<\1 stroke="currentColor"\2', svg)
        # chord-symbol accidentals: map SMuFL code points to plain characters
        for cp, ch in {'': '♭', '': '♯', '': '', '': '♩'}.items():
            svg = svg.replace(cp, ch)
        open(f'{OUT}/m{n:02d}_{variant}.svg', 'w').write(svg)
    print(variant, 'done')
