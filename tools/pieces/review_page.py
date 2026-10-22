#!/usr/bin/env python3
"""
review_page.py — vote across three normalized reads of a scanned song and build
the review page (stage 3 of the public piece pilot). Standard library only.

  python3 tools/pieces/review_page.py --claude A.json --audiveris B.json --third C.json \
      --crops crops --out review.html [--votes votes.json] [--bar-len 4]

Vote per disputed bar+staff (claude ≠ audiveris under diff_reads' normalization):
  claude == third     → resolved, loser audiveris
  audiveris == third  → resolved, loser claude
  otherwise           → three-way (or 'no third read' when the third is missing)

Page sections, in priority order:
  a) three-way splits: crop, the three readings as notation (Verovio, from
     per-staff MusicXML snippets) with JSON, a choice claude/audiveris/third/none
  b) resolved by vote where claude lost (collapsed)
  c) claude ≈ audiveris agree but claude's read listed an uncertain spot (collapsed,
     "looks wrong" checkbox)
  d) spelling-only differences, one table
Choices collect into a JSON textarea (copy button). Also writes --votes.
"""
import argparse, json, os, sys, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diff_reads import compare, normalize_staff, midi_of, STAFFS, EPS

CLEF = {'voice': ('G', 2), 'rh': ('G', 2), 'lh': ('F', 4)}
DIV = 8   # divisions per quarter: 32nds = 1
TYPES = [(4, 'whole', 0), (3, 'half', 1), (2, 'half', 0), (1.5, 'quarter', 1), (1, 'quarter', 0), (0.75, 'eighth', 1),
         (0.5, 'eighth', 0), (0.375, '16th', 1), (0.25, '16th', 0), (0.125, '32nd', 0)]

def note_type(d):
    for q, t, dots in TYPES:
        if abs(d - q) < 1e-6: return t, dots, True
    nearest = min(TYPES, key=lambda x: abs(x[0] - d))
    return nearest[1], nearest[2], False

KEY_FIFTHS = -2   # B♭ major: B and E flat in the signature
SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
ACCIDENTAL = {-2: 'flat-flat', -1: 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp'}
LETTER_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def key_alter(step, fifths=KEY_FIFTHS):
    """Alter the key signature gives a letter: +1 for the first `fifths` sharps, −1 for the first −`fifths` flats."""
    if fifths > 0: return 1 if step in SHARPS[:fifths] else 0
    if fifths < 0: return -1 if step in SHARPS[::-1][:-fifths] else 0
    return 0

def parse_pitch(name):
    """'A♭3' → ('A', -1, 3). Accepts ♯ ♭ ♮ # b, doubled."""
    import re
    m = re.match(r'^([A-G])([♯♭#b♮]*)(-?\d+)$', name)
    if not m: raise ValueError(f'bad pitch {name!r}')
    alter = sum(1 for c in m.group(2) if c in '♯#') - sum(1 for c in m.group(2) if c in '♭b')
    return m.group(1), alter, int(m.group(3))

def pitch_xml(name, accidental=None):
    step, alter, octave = parse_pitch(name)
    acc = f'<accidental>{ACCIDENTAL[accidental]}</accidental>' if accidental is not None else ''
    return f"<pitch><step>{step}</step>{f'<alter>{alter}</alter>' if alter else ''}<octave>{octave}</octave></pitch>", acc

def assign_accidentals(notes, fifths=KEY_FIFTHS):
    """notes: list of dicts with 'order' (chronological sort key) and 'name'. Sets note['acc'] to the alter to
    display (→ <accidental>) when the note differs from the key signature or from the most recent earlier note
    on the same letter and octave in the bar; None when the reader would already read it right."""
    state = {}   # (step, octave) → alter currently in force for the reader
    for n in sorted(notes, key=lambda n: n['order']):
        step, alter, octave = parse_pitch(n['name'])
        current = state.get((step, octave), key_alter(step, fifths))
        n['acc'] = alter if alter != current else None
        state[(step, octave)] = alter

def staff_musicxml(events, staff, bar_len=4):
    """One measure, one part, voices assigned greedily; returns (MusicXML string, [json pitch names in writing order])."""
    sign, line = CLEF[staff]
    items = [e for e in events]
    voices = []   # list of lists of events (non-grace), each with 'g' attached graces
    pending = []
    for e in items:
        if 'grace' in e: pending.append(e['grace']); continue
        e = dict(e); e['_graces'] = pending; pending = []
        for v in voices:
            if v[-1]['onset'] + v[-1]['dur'] <= e['onset'] + 1e-6: v.append(e); break
        else: voices.append([e])
    if not voices: voices = [[{'onset': 0, 'dur': bar_len, 'pitches': [], 'rest': True, 'tie': None, '_graces': []}]]
    # Every pitched note, in writing order, with a chronological key for the accidental rule
    # (graces sort before the note they ornament; chord notes share an onset).
    notes = []
    for vi, v in enumerate(voices, 1):
        for ei, e in enumerate(v):
            for gi, g in enumerate(e['_graces']):
                for pi, p in enumerate(g): notes.append({'key': (vi, ei, 'g', gi, pi), 'order': (e['onset'], 0, gi, pi), 'name': p})
            if not (e.get('rest') or not e['pitches']):
                for pi, p in enumerate(sorted(e['pitches'], key=midi_of)): notes.append({'key': (vi, ei, 'n', 0, pi), 'order': (e['onset'], 1, 0, pi), 'name': p})
    assign_accidentals(notes)
    acc_of = {n['key']: n['acc'] for n in notes}
    written = []
    body = []
    for vi, v in enumerate(voices, 1):
        if vi > 1: body.append(f"<backup><duration>{int(bar_len * DIV)}</duration></backup>")
        t = 0.0
        for ei, e in enumerate(v):
            if e['onset'] > t + 1e-6:   # fill gap with a rest
                gap = e['onset'] - t; ty, dots, _ = note_type(gap)
                body.append(f"<note><rest/><duration>{round(gap * DIV)}</duration><voice>{vi}</voice><type>{ty}</type>{'<dot/>' * dots}</note>")
            for gi, g in enumerate(e['_graces']):
                for pi, p in enumerate(g):
                    px, acc = pitch_xml(p, acc_of[(vi, ei, 'g', gi, pi)]); written.append(p)
                    body.append(f"<note><grace slash=\"yes\"/>{px}<voice>{vi}</voice><type>eighth</type>{acc}</note>")
            ty, dots, exact = note_type(e['dur']); dur = max(1, round(e['dur'] * DIV))
            tie = e.get('tie')
            tie_xml = ''.join(f'<tie type="{x}"/>' for x in (['start', 'stop'] if tie == 'both' else [tie] if tie else []))
            tied_xml = ''.join(f'<tied type="{x}"/>' for x in (['start', 'stop'] if tie == 'both' else [tie] if tie else []))
            if e.get('rest') or not e['pitches']:
                body.append(f"<note><rest/><duration>{dur}</duration><voice>{vi}</voice><type>{ty}</type>{'<dot/>' * dots}</note>")
            else:
                for pi, p in enumerate(sorted(e['pitches'], key=midi_of)):
                    px, acc = pitch_xml(p, acc_of[(vi, ei, 'n', 0, pi)]); written.append(p)
                    body.append(f"<note>{'<chord/>' if pi else ''}{px}<duration>{dur}</duration>{tie_xml}<voice>{vi}</voice><type>{ty}</type>{'<dot/>' * dots}{acc}"
                                f"{'<notations>' + tied_xml + '</notations>' if tied_xml else ''}</note>")
            t = e['onset'] + e['dur']
        if t < bar_len - 1e-6:
            gap = bar_len - t; ty, dots, _ = note_type(gap)
            body.append(f"<note><rest/><duration>{round(gap * DIV)}</duration><voice>{vi}</voice><type>{ty}</type>{'<dot/>' * dots}</note>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name></part-name></score-part></part-list>'
           f'<part id="P1"><measure number="1"><attributes><divisions>{DIV}</divisions><key><fifths>{KEY_FIFTHS}</fifths></key><time symbol="cut"><beats>2</beats><beat-type>2</beat-type></time>'
           f'<clef><sign>{sign}</sign><line>{line}</line></clef></attributes>{"".join(body)}</measure></part></score-partwise>')
    return xml, written

def snippet_notes(xml):
    """Parse a snippet back: [{'midi', 'onset', 'acc', 'grace', 'step', 'octave'}] for every pitched <note>, in document order.
    onset in divisions, tracked through <duration>, <chord/> and <backup>."""
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    fifths = int(root.find('.//key/fifths').text)
    out = []; pos = 0; prev_start = 0
    for el in root.find('.//measure'):
        if el.tag == 'backup': pos -= int(el.find('duration').text); continue
        if el.tag == 'forward': pos += int(el.find('duration').text); continue
        if el.tag != 'note': continue
        grace = el.find('grace') is not None
        dur = 0 if grace else int(el.find('duration').text)
        start = prev_start if el.find('chord') is not None else pos
        pitch = el.find('pitch')
        if pitch is not None:
            step = pitch.find('step').text; alter = int(pitch.find('alter').text) if pitch.find('alter') is not None else 0; octave = int(pitch.find('octave').text)
            acc = el.find('accidental')
            out.append({'midi': (octave + 1) * 12 + LETTER_PC[step] + alter, 'onset': start, 'grace': grace, 'step': step, 'octave': octave,
                        'acc': {v: k for k, v in ACCIDENTAL.items()}[acc.text] if acc is not None else None})
        if el.find('chord') is None: prev_start = start; pos = start + dur
        else: pos = max(pos, start + dur)
    return out, fifths

def check_snippet(xml, written, events, sid=''):
    """Two checks on one snippet; returns (alter_wrong, display_wrong, messages).
    1. sounding: each pitched <note>'s midi (step+alter+octave) equals the midi of the JSON pitch it was written from,
       and the multiset of snippet midis equals the multiset of JSON pitches (so nothing was dropped or invented).
    2. displayed: reading the snippet as a musician would — key signature, then each visible <accidental> holding for
       that letter+octave until the end of the bar — every note's displayed pitch equals the JSON midi."""
    notes, fifths = snippet_notes(xml)
    msgs = []; alter_wrong = 0; display_wrong = 0
    want = [midi_of(p) for p in written]
    if len(notes) != len(want):
        msgs.append(f'{sid}: {len(notes)} pitched notes in XML, {len(want)} written'); alter_wrong += abs(len(notes) - len(want))
    for n, p in zip(notes, written):
        if n['midi'] != midi_of(p): alter_wrong += 1; msgs.append(f'{sid}: XML midi {n["midi"]} ≠ {p} ({midi_of(p)})')
    all_json = sorted(midi_of(p) for e in events for p in (e['grace'] if 'grace' in e else (e.get('pitches') or [])))
    if sorted(n['midi'] for n in notes) != all_json:
        msgs.append(f'{sid}: midi multiset differs: xml {sorted(n["midi"] for n in notes)} json {all_json}'); alter_wrong += 1
    state = {}
    for n, p in sorted(zip(notes, written), key=lambda t: (t[0]['onset'], 0 if t[0]['grace'] else 1)):
        k = (n['step'], n['octave'])
        if n['acc'] is not None: state[k] = n['acc']
        shown = state.get(k, key_alter(n['step'], fifths))
        displayed = (n['octave'] + 1) * 12 + LETTER_PC[n['step']] + shown
        if displayed != midi_of(p): display_wrong += 1; msgs.append(f'{sid}: {p} would be read as alter {shown:+d} (midi {displayed})')
    return alter_wrong, display_wrong, msgs

def brief(events):
    out = []
    for e in events:
        if 'grace' in e: out.append('g(' + ' '.join(e['grace']) + ')'); continue
        out.append(f"{e['onset']:g}+{e['dur']:g} " + ('R' if e.get('rest') or not e['pitches'] else ' '.join(e['pitches'])) + (f" ~{e['tie']}" if e.get('tie') else ''))
    return ' | '.join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--claude', required=True); ap.add_argument('--audiveris', required=True); ap.add_argument('--third')
    ap.add_argument('--crops', default='crops'); ap.add_argument('--out', required=True); ap.add_argument('--votes'); ap.add_argument('--bar-len', type=float, default=4.0)
    a = ap.parse_args()
    C = {b['bar']: b for b in json.load(open(a.claude))['bars']}
    A = {b['bar']: b for b in json.load(open(a.audiveris))['bars']}
    T = {b['bar']: b for b in json.load(open(a.third))['bars']} if a.third and os.path.exists(a.third) else {}
    items = []
    for n in sorted(C):
        for st in STAFFS:
            ec, ea = C[n].get(st, []), A.get(n, {}).get(st, [])
            cls, detail = compare(ec, ea)
            rec = {'bar': n, 'staff': st, 'class': cls, 'claude': ec, 'audiveris': ea, 'uncertain': [u for u in C[n].get('uncertain', []) if u.startswith(st) or u.startswith('as bar') or u.startswith('same')]}
            if cls == 'spelling-only': rec['spellings'] = detail['spellings']
            if cls == 'disagree':
                endb = normalize_staff(ea)['end']
                rec['audiveris_broken'] = abs(endb - a.bar_len) > EPS or not any(not e.get('rest') for e in ea if 'grace' not in e)
                et = T.get(n, {}).get(st) if n in T else None
                rec['third'] = et
                if et is None: rec['vote'] = 'no-third'
                elif compare(ec, et)[0] != 'disagree': rec['vote'] = 'resolved'; rec['winner'] = 'claude+third'; rec['loser'] = 'audiveris'
                elif compare(ea, et)[0] != 'disagree': rec['vote'] = 'resolved'; rec['winner'] = 'audiveris+third'; rec['loser'] = 'claude'
                else: rec['vote'] = 'three-way'
            items.append(rec)
    counts = {'agree': 0, 'spelling-only': 0, 'disputed': 0, 'resolved-claude-lost': 0, 'resolved-audiveris-lost': 0, 'three-way': 0, 'no-third': 0}
    for r in items:
        if r['class'] == 'agree': counts['agree'] += 1
        elif r['class'] == 'spelling-only': counts['spelling-only'] += 1
        else:
            counts['disputed'] += 1
            if r['vote'] == 'resolved': counts['resolved-claude-lost' if r['loser'] == 'claude' else 'resolved-audiveris-lost'] += 1
            else: counts[r['vote']] += 1
    if a.votes:
        json.dump({'counts': counts, 'items': [{k: v for k, v in r.items() if k not in ('claude', 'audiveris', 'third')} for r in items if r['class'] != 'agree']}, open(a.votes, 'w'), ensure_ascii=False, indent=1)

    # ── page ──
    sec_a = [r for r in items if r['class'] == 'disagree' and r['vote'] in ('three-way', 'no-third')]
    sec_b = [r for r in items if r['class'] == 'disagree' and r['vote'] == 'resolved' and r['loser'] == 'claude']
    sec_b2 = [r for r in items if r['class'] == 'disagree' and r['vote'] == 'resolved' and r['loser'] == 'audiveris']
    sec_c = [r for r in items if r['class'] in ('agree', 'spelling-only') and r['uncertain']]
    sec_d = [r for r in items if r['class'] == 'spelling-only']
    snippets = {}; check_totals = [0, 0, 0]; check_msgs = []
    def block(r, readers, choice):
        key = f"{r['bar']}-{r['staff']}"
        crop = f"{a.crops}/bar-{r['bar']:02d}-{r['staff']}.png"; whole = f"{a.crops}/bar-{r['bar']:02d}.png"
        cols = []
        for name in readers:
            ev = r.get(name)
            if ev is None: cols.append(f'<div class="col"><h4>{name}</h4><p class="muted">no read</p></div>'); continue
            sid = f"{key}-{name}"; snippets[sid], written = staff_musicxml(ev, r['staff'], a.bar_len)
            aw, dw, msgs = check_snippet(snippets[sid], written, ev, sid); check_totals[0] += aw; check_totals[1] += dw; check_totals[2] += len(written); check_msgs.extend(msgs)
            cols.append(f'<div class="col"><h4>{name}{" <span class=muted>(wrong length)</span>" if name == "audiveris" and r.get("audiveris_broken") else ""}</h4><div class="svg" data-snippet="{sid}"></div><pre>{html.escape(brief(ev))}</pre><details><summary>JSON</summary><pre class="json">{html.escape(json.dumps(ev, ensure_ascii=False))}</pre></details></div>')
        unc = ''.join(f'<li>{html.escape(u)}</li>' for u in r.get('uncertain', []))
        ch = ''
        if choice == 'pick':
            ch = ('<div class="choice">' + ''.join(f'<label><input type="radio" name="pick-{key}" value="{v}"> {v}</label>' for v in ('claude', 'audiveris', 'third', 'none'))
                  + f'<input type="text" class="none-text" data-key="{key}" placeholder="if none: what it should be"></div>')
        elif choice == 'wrong':
            ch = f'<div class="choice"><label><input type="checkbox" name="wrong-{key}"> looks wrong</label><input type="text" class="none-text" data-key="{key}" placeholder="what it should be"></div>'
        return (f'<div class="item" id="item-{key}"><h3>Bar {r["bar"]} · {r["staff"]}{" · " + r.get("winner", "") if r.get("winner") else ""}</h3>'
                f'<div class="crops"><a href="{whole}" target="_blank"><img src="{crop}" alt="bar {r["bar"]} {r["staff"]}"></a></div>'
                f'<div class="cols">{"".join(cols)}</div>{"<ul class=unc>" + unc + "</ul>" if unc else ""}{ch}</div>')
    def section(title, recs, readers, choice, open_=True, note=''):
        if not recs: return f'<section><h2>{title} <span class="muted">(none)</span></h2></section>'
        inner = ''.join(block(r, readers, choice) for r in recs)
        return f'<section><details {"open" if open_ else ""}><summary><h2>{title} <span class="muted">({len(recs)})</span></h2>{note}</summary>{inner}</details></section>'
    rows = ''.join(f"<tr><td>{r['bar']}</td><td>{r['staff']}</td><td>{html.escape(', '.join(f'{s['a']}↔{s['b']} @{s['onset']:g}' for s in r['spellings']))}</td></tr>" for r in sec_d)
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>I Got Rhythm — refrain review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{{font-family:system-ui,sans-serif;margin:0;padding:16px 24px 120px;background:#faf8f2;color:#1f1b16;max-width:1500px}}
h1{{font-size:1.4rem}} h2{{display:inline;font-size:1.1rem}} h3{{font-size:1rem;margin:0 0 6px}} h4{{margin:4px 0;font-size:.9rem}}
section{{margin:18px 0}} summary{{cursor:pointer;padding:6px 0}} .muted{{color:#8c8576;font-weight:400;font-size:.85em}}
.item{{border:1px solid #d9d2c0;border-radius:10px;background:#fff;padding:12px 14px;margin:10px 0}}
.crops img{{max-width:100%;max-height:260px;border:1px solid #e8e2d2;border-radius:6px}}
.cols{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:8px}}
.col{{border:1px solid #e8e2d2;border-radius:8px;padding:6px 8px;background:#fbf8ef;min-width:0}}
.svg svg{{width:100%;height:auto;max-height:170px}} .svg{{min-height:40px}}
pre{{white-space:pre-wrap;font-size:.78rem;margin:4px 0;word-break:break-word}} .json{{color:#6b6457}}
.unc{{font-size:.82rem;color:#4a4339;margin:6px 0 0 18px}} .choice{{margin-top:8px;font-size:.9rem}} .choice label{{margin-right:12px}}
.none-text{{width:100%;margin-top:6px;padding:4px 6px;font:inherit;font-size:.85rem}}
table{{border-collapse:collapse;font-size:.85rem}} td,th{{border-bottom:1px solid #e8e2d2;padding:3px 10px;text-align:left}}
#out{{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #d9d2c0;padding:8px 24px;display:flex;gap:10px;align-items:center}}
#out textarea{{flex:1;height:70px;font:12px ui-monospace,monospace}} button{{font:inherit;padding:6px 12px}}
.imp{{border:1px solid #d9d2c0;border-radius:10px;background:#fff;padding:8px 14px;margin:10px 0}} .imp textarea{{width:100%;height:90px;font:12px ui-monospace,monospace;box-sizing:border-box;margin:6px 0}}
</style></head><body>
<h1>I Got Rhythm — refrain (bars 1–34, second ending 35): three-read review</h1>
<p class="muted">Counts: {html.escape(json.dumps(counts))}. Notation is rendered from each read's JSON (Verovio); a read with the wrong bar length renders with filler rests. Click a crop for the whole bar.</p>
<details class="imp"><summary>Import previous choices</summary><p class="muted">Paste the JSON copied from an earlier version of this page ({{picks, wrong, text}}); it restores the radio picks, the "looks wrong" checks and the free text.</p>
<textarea id="imp" placeholder='{{"picks": {{"16-lh": "claude"}}, "wrong": ["6-voice"], "text": {{}}}}'></textarea><div><button id="impbtn">Import</button> <span id="impmsg" class="muted"></span></div></details>
{section('a) Unresolved — all three reads differ (or no third read)', sec_a, ('claude','audiveris','third'), 'pick', True)}
{section('b) Resolved by vote — claude outvoted', sec_b, ('claude','audiveris','third'), 'wrong', False, '<span class="muted"> audiveris + third agreed</span>')}
{section('b′) Resolved by vote — audiveris outvoted', sec_b2, ('claude','audiveris','third'), 'wrong', False, '<span class="muted"> claude + third agreed</span>')}
{section('c) Agreed, but my read flagged an uncertain spot', sec_c, ('claude',), 'wrong', False)}
<section><h2>d) Spelling-only differences <span class="muted">({len(sec_d)})</span></h2><table><tr><th>bar</th><th>staff</th><th>claude ↔ audiveris @onset</th></tr>{rows}</table></section>
<div id="out"><textarea id="json" readonly></textarea><button id="copy">Copy JSON</button></div>
<script type="module">
const SNIPPETS = {json.dumps(snippets)};
const out = document.getElementById('json');
function collect() {{
  const r = {{ picks: {{}}, wrong: [], text: {{}} }};
  for (const el of document.querySelectorAll('input[type=radio]:checked')) r.picks[el.name.slice(5)] = el.value;
  for (const el of document.querySelectorAll('input[type=checkbox]:checked')) r.wrong.push(el.name.slice(6));
  for (const el of document.querySelectorAll('.none-text')) if (el.value.trim()) r.text[el.dataset.key] = el.value.trim();
  out.value = JSON.stringify(r, null, 1);
}}
document.addEventListener('change', collect); document.addEventListener('input', collect); collect();
document.getElementById('copy').onclick = () => navigator.clipboard.writeText(out.value);
document.getElementById('impbtn').onclick = () => {{
  const msg = document.getElementById('impmsg');
  let d; try {{ d = JSON.parse(document.getElementById('imp').value); }} catch (e) {{ msg.textContent = 'not valid JSON: ' + e.message; return; }}
  const missing = []; let n = 0;
  const show = el => {{ for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; }};
  for (const [k, v] of Object.entries(d.picks || {{}})) {{
    const el = document.querySelector(`input[type=radio][name="pick-${{CSS.escape(k)}}"][value="${{CSS.escape(String(v))}}"]`);
    if (el) {{ el.checked = true; show(el); n++; }} else missing.push('pick ' + k + '=' + v);
  }}
  for (const k of d.wrong || []) {{
    const el = document.querySelector(`input[type=checkbox][name="wrong-${{CSS.escape(k)}}"]`);
    if (el) {{ el.checked = true; show(el); n++; }} else missing.push('wrong ' + k);
  }}
  for (const [k, v] of Object.entries(d.text || {{}})) {{
    const el = document.querySelector(`.none-text[data-key="${{CSS.escape(k)}}"]`);
    if (el) {{ el.value = v; show(el); n++; }} else missing.push('text ' + k);
  }}
  collect();
  msg.textContent = `restored ${{n}} item${{n === 1 ? '' : 's'}}` + (missing.length ? `; not on this page: ${{missing.join(', ')}}` : '');
}};
let tk = null;
async function toolkit() {{
  if (tk) return tk;
  const base = 'https://cdn.jsdelivr.net/npm/verovio@6.3.0/dist/';
  const [wasm, esm] = await Promise.all([import(base + 'verovio-module.mjs'), import(base + 'verovio.mjs')]);
  const mod = await wasm.default(); tk = new esm.VerovioToolkit(mod); window.__vrv = tk;   // debug handle for headless checks
  tk.setOptions({{ breaks: 'none', scale: 40, adjustPageHeight: true, pageWidth: 1400, header: 'none', footer: 'none', svgViewBox: true, pageMarginTop: 30, pageMarginBottom: 10, pageMarginLeft: 10, pageMarginRight: 10 }});
  return tk;
}}
const io = new IntersectionObserver(async entries => {{
  for (const en of entries) if (en.isIntersecting) {{
    const el = en.target; io.unobserve(el);
    try {{ const t = await toolkit(); if (t.loadData(SNIPPETS[el.dataset.snippet])) el.innerHTML = t.renderToSVG(1); else el.textContent = '(could not render)'; }}
    catch (e) {{ el.textContent = '(notation unavailable: ' + e.message + ')'; }}
  }}
}}, {{ rootMargin: '300px' }});
for (const el of document.querySelectorAll('.svg')) io.observe(el);
</script></body></html>'''
    if check_msgs:
        print('\n'.join(check_msgs), file=sys.stderr)
        sys.exit(f'SNIPPET CHECK FAILED: {check_totals[0]} notes with wrong sounding pitch, {check_totals[1]} notes that would be read at the wrong pitch, of {check_totals[2]} notes written; page NOT written')
    open(a.out, 'w', encoding='utf-8').write(page)
    print('counts:', counts); print('wrote', a.out, f'({len(snippets)} notation snippets)')
    print(f'snippet check: {check_totals[2]} notes written, all with the right sounding and displayed pitch')

if __name__ == '__main__':
    main()
