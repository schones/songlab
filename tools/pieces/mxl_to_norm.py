#!/usr/bin/env python3
"""
mxl_to_norm.py — convert Audiveris MusicXML (.mxl or .xml) into the normalized
per-bar JSON used to diff two reads of a scanned song (stage 2 of the public
piece pilot). Standard library only.

Normalized JSON (same shape as the hand read):
  { "piece", "source", "reader": "audiveris", "bars": [
      { "bar": n, "voice": [...], "rh": [...], "lh": [...] } ] }
  event: { "onset": quarters from bar start, "dur": quarters, "pitches": ["B♭2", ...],
           "rest": bool, "tie": null|"start"|"stop"|"both" }
         or { "grace": ["F2", "G2"] } placed before the event it ornaments.
  Voices within a staff are flattened into one onset-sorted list (chords with the
  same onset and duration are merged). Ottava marks are applied to the pitch.

Mapping (Audiveris): the part named Piano → staff 1 = rh, staff 2 = lh, and the
Voice part that has notes → voice. Where Audiveris missed the brace (the last
system of each page of the I Got Rhythm scan) it exports the three staves as
three single-staff "Voice" parts in top-to-bottom order; in a measure whose
Piano part is empty, the non-empty Voice parts are therefore taken in part
order as voice, rh, lh. Measure numbers are per page; the offset shifts them
to refrain bar numbers.

Usage (from the repo root):
  python3 tools/pieces/mxl_to_norm.py --piece i-got-rhythm --key B♭ --time 2/2 --beats-per-bar 4 \
      --out sources/work/igr-read-audiveris.json \
      sources/work/audiveris/igr-p3.mxl:0 sources/work/audiveris/igr-p4.mxl:17
  (each input is <file>[:<bar offset>]; offset is added to the measure number;
  --key/--time/--beats-per-bar are optional and are written to the output
  metadata when given — review_page.py reads them from the primary read)
"""
import argparse, json, re, sys, zipfile
import xml.etree.ElementTree as ET
from fractions import Fraction

ACC = {-2: '♭♭', -1: '♭', 0: '', 1: '♯', 2: '♯♯'}

def load_xml(path):
    if path.endswith('.mxl'):
        z = zipfile.ZipFile(path)
        names = [n for n in z.namelist() if n.endswith('.xml') and not n.startswith('META-INF')]
        return ET.fromstring(z.read(names[0]))
    return ET.parse(path).getroot()

def spell(pitch_el, octave_shift):
    step = pitch_el.findtext('step'); alter = int(float(pitch_el.findtext('alter') or 0)); octave = int(pitch_el.findtext('octave'))
    return f"{step}{ACC.get(alter, '?')}{octave + octave_shift}"

def part_names(root):
    return {sp.get('id'): (sp.findtext('part-name') or '').strip() for sp in root.iter('score-part')}

def measure_events(measure, divisions, state):
    """→ {staff: [event...]} for one measure. state carries divisions and octave shifts across measures."""
    out = {}
    t = Fraction(0); last_note_t = Fraction(0)
    pending_grace = {}
    for el in measure:
        tag = el.tag
        if tag == 'attributes':
            d = el.findtext('divisions')
            if d: state['div'] = int(d)
        elif tag == 'backup':
            t -= Fraction(int(el.findtext('duration')), state['div'])
        elif tag == 'forward':
            t += Fraction(int(el.findtext('duration')), state['div'])
        elif tag == 'direction':
            for ds in el.iter('octave-shift'):
                staff = int(el.findtext('staff') or 1); typ = ds.get('type'); size = int(ds.get('size') or 8)
                if typ == 'stop': state['ottava'][staff] = 0
                else: state['ottava'][staff] = (size - 1) // 7 * (1 if typ == 'down' else -1) * -1   # 'down' = sounds lower
        elif tag == 'note':
            staff = int(el.findtext('staff') or 1)
            is_chord = el.find('chord') is not None
            is_rest = el.find('rest') is not None
            grace = el.find('grace') is not None
            dur = Fraction(int(el.findtext('duration') or 0), state['div'])
            pitch_el = el.find('pitch')
            name = spell(pitch_el, state['ottava'].get(staff, 0)) if pitch_el is not None else None
            ties = {tt.get('type') for tt in el.findall('tie')}
            tie = 'both' if {'start', 'stop'} <= ties else ('start' if 'start' in ties else ('stop' if 'stop' in ties else None))
            evs = out.setdefault(staff, [])
            if grace:
                pending_grace.setdefault(staff, []).append(name); continue
            onset = last_note_t if is_chord else t
            if is_chord and evs and not evs[-1].get('grace') and evs[-1]['onset'] == onset:
                if name: evs[-1]['pitches'].append(name)
                if tie and not evs[-1]['tie']: evs[-1]['tie'] = tie
            else:
                if pending_grace.get(staff): evs.append({'grace': pending_grace.pop(staff)})
                evs.append({'onset': onset, 'dur': dur, 'pitches': [name] if name else [], 'rest': is_rest, 'tie': tie})
            if not is_chord:
                last_note_t = t; t += dur
    # flatten voices: merge identical (onset, dur) events, sort by onset
    for staff, evs in out.items():
        merged = []
        for e in evs:
            if 'grace' in e: merged.append(e); continue
            hit = next((m for m in merged if 'grace' not in m and m['onset'] == e['onset'] and m['dur'] == e['dur'] and m['rest'] == e['rest']), None)
            if hit and not e['rest']:
                hit['pitches'] = sorted(set(hit['pitches'] + e['pitches']), key=midi_of); hit['tie'] = hit['tie'] or e['tie']
            elif hit and e['rest']:
                pass
            else: merged.append(e)
        # a rest that overlaps a sounding event in another voice is dropped
        sounding = [m for m in merged if 'grace' not in m and not m['rest']]
        keep = []
        for m in merged:
            if 'grace' in m or not m['rest']: keep.append(m); continue
            if not any(s['onset'] < m['onset'] + m['dur'] and m['onset'] < s['onset'] + s['dur'] for s in sounding): keep.append(m)
        order = sorted(range(len(keep)), key=lambda i: (keep[i].get('onset', keep[i+1]['onset'] if i+1 < len(keep) and 'onset' in keep[i+1] else 0), 0 if 'grace' in keep[i] else 1))
        out[staff] = [keep[i] for i in order]
        for m in out[staff]:
            if 'grace' not in m:
                m['pitches'] = sorted(m['pitches'], key=midi_of); m['onset'] = float(m['onset']); m['dur'] = float(m['dur'])
    return out

LETTER_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi_of(name):
    m = re.match(r'^([A-G])([♯♭]*)(-?\d+)$', name)
    if not m: return 0
    return (int(m.group(3)) + 1) * 12 + LETTER_PC[m.group(1)] + m.group(2).count('♯') - m.group(2).count('♭')

def has_notes(evs):
    return any('grace' in e or not e['rest'] for e in evs)

def convert(path, offset):
    root = load_xml(path); names = part_names(root)
    per_part = {}   # part id → {bar: {staff: events}}
    order = []
    for part in root.findall('part'):
        pid = part.get('id'); order.append(pid); per_part[pid] = {}
        state = {'div': 1, 'ottava': {}}
        for measure in part.findall('measure'):
            n = int(re.sub(r'\D', '', measure.get('number'))) + offset
            per_part[pid][n] = measure_events(measure, None, state)
    bars = []
    for n in sorted({n for d in per_part.values() for n in d}):
        piano = [pid for pid in order if names.get(pid, '').lower().startswith('piano')]
        voices = [pid for pid in order if pid not in piano]
        bar = {'bar': n, 'voice': [], 'rh': [], 'lh': []}
        pevs = per_part[piano[0]].get(n, {}) if piano else {}
        if has_notes(pevs.get(1, [])) or has_notes(pevs.get(2, [])):
            bar['rh'] = pevs.get(1, []); bar['lh'] = pevs.get(2, [])
            with_notes = [pid for pid in voices if has_notes(per_part[pid].get(n, {}).get(1, []))]
            bar['voice'] = per_part[(with_notes or voices)[0]].get(n, {}).get(1, []) if voices else []
            bar['mapping'] = 'piano-part'
        else:
            # brace missed: single-staff Voice parts top to bottom = voice, rh, lh
            with_notes = [pid for pid in voices if has_notes(per_part[pid].get(n, {}).get(1, []))]
            for key, pid in zip(('voice', 'rh', 'lh'), with_notes):
                bar[key] = per_part[pid].get(n, {}).get(1, [])
            bar['mapping'] = f'split-staves:{",".join(with_notes)}'
        bars.append(bar)
    return bars

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', help='<file.mxl|file.xml>[:<bar offset>]')
    ap.add_argument('--out', required=True); ap.add_argument('--piece', required=True, help='piece slug, e.g. i-got-rhythm')
    ap.add_argument('--reader', default='audiveris', help='reader name written to the output (default: audiveris)')
    ap.add_argument('--key', help='key string for the output metadata, e.g. "B♭" or "B♭ minor"')
    ap.add_argument('--time', help='time signature N/D for the output metadata')
    ap.add_argument('--beats-per-bar', type=float, help='quarters per bar for the output metadata')
    a = ap.parse_args()
    bars = []
    for spec in a.inputs:
        path, _, off = spec.partition(':')
        bars += convert(path, int(off or 0))
    doc = {'piece': a.piece, 'source': ', '.join(s.split(':')[0] for s in a.inputs), 'reader': a.reader}
    if a.key: doc['key'] = a.key
    if a.time: doc['time'] = a.time
    if a.beats_per_bar is not None: doc['beatsPerBar'] = int(a.beats_per_bar) if a.beats_per_bar == int(a.beats_per_bar) else a.beats_per_bar
    doc['bars'] = bars
    json.dump(doc, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(f'wrote {a.out}: {len(bars)} bars')

if __name__ == '__main__':
    main()
