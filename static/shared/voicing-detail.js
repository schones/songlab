/**
 * voicing-detail.js
 * =================
 * Selected-bar detail for the Voicing Explorer Analyze page: event chips
 * (one per comp event, consecutive identical events collapsed), then the
 * selected event's chord symbol, bass / voicing notes, tension, motion,
 * "intervals that rub", and named-vs-played. Renders from one BarResult
 * of analyzeProgression() and an event index into its events[].
 *
 * Usage:
 *   const detail = new VoicingDetail({ info: 'vp-info', rubs: 'vp-rubs', nvp: 'vp-nvp' },
 *                                    { onSelectEvent: index => … });
 *   detail.render(barResult, eventIndex);
 */

import { INTERVAL_SERIES } from './voicing-chart.js';
import { parseNote } from './voicing-analysis.js';

const INTERVAL_COLOR = Object.fromEntries(INTERVAL_SERIES.map(s => [s.key, s.color]));
const INTERVAL_NAME  = Object.fromEntries(INTERVAL_SERIES.map(s => [s.key, s.label]));
/** Compound rub labels from the engine (minor 2nds and tritones keep rubbing across octaves). */
Object.assign(INTERVAL_NAME, { m16: 'minor 16th', 'TT+8': 'tritone + octave', 'TT+15': 'tritone + two octaves' });

const CSS = /* css */ `
.vd-symbol { font-size: var(--font-size-xl, 1.8rem); font-weight: 500; letter-spacing: -0.01em; color: var(--text-primary); margin: 0; }
.vd-symbol__bar { font-size: var(--font-size-sm, 1rem); color: var(--text-muted); font-weight: 400; margin-right: 8px; }
.vd-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 10px; }
.vd-tag { font-size: var(--font-size-2xs, 0.8rem); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-color); color: var(--text-secondary); }
.vd-tag--hold { border-color: var(--accent-gold); color: var(--accent-gold); }
.vd-events { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; }
.vd-chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 3px 9px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-raised); color: var(--text-secondary); font: inherit; font-size: var(--font-size-xs, 0.85rem); cursor: pointer; line-height: 1.3; }
.vd-chip:hover { border-color: var(--border-strong); color: var(--text-primary); }
.vd-chip--selected { border-color: var(--accent-gold, #D4A03C); color: var(--text-primary); box-shadow: inset 0 0 0 1px var(--accent-gold, #D4A03C); }
.vd-chip__beat { color: var(--text-muted); font-size: var(--font-size-2xs, 0.75rem); font-variant-numeric: tabular-nums; }
.vd-chip__sym { font-weight: 500; }
.vd-chip__count { color: var(--text-muted); font-size: var(--font-size-2xs, 0.75rem); }
.vd-chip__tension { font-variant-numeric: tabular-nums; color: var(--text-muted); }
.vd-chip__tension--hot { color: var(--accent-coral, #E87461); }
.vd-rows { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: var(--font-size-sm, 1rem); align-items: baseline; }
.vd-rows dt { color: var(--text-muted); font-size: var(--font-size-2xs, 0.8rem); text-transform: uppercase; letter-spacing: 0.05em; }
.vd-rows dd { margin: 0; color: var(--text-primary); }
.vd-note { display: inline-block; padding: 1px 7px; border-radius: 4px; margin: 0 4px 4px 0; font-weight: 500; color: #fff; }
.vd-note--bass    { background: var(--accent-gold, #D4A03C); }
.vd-note--voicing { background: var(--accent-blue-bright, #3A8BC9); }
.vd-tension { font-size: var(--font-size-lg, 1.4rem); font-weight: 500; }
.vd-motion__free { color: var(--text-muted); font-size: var(--font-size-2xs, 0.8rem); margin-left: 6px; }
.vd-list { list-style: none; margin: 0; padding: 0; font-size: var(--font-size-sm, 1rem); }
.vd-list li { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--border-subtle); }
.vd-list li:last-child { border-bottom: none; }
.vd-swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.vd-pair { font-weight: 500; min-width: 7.5em; }
.vd-ivl { color: var(--text-secondary); flex: 1; }
.vd-weight { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.vd-empty { color: var(--text-muted); font-style: italic; font-size: var(--font-size-sm, 1rem); }
.vd-nvp { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: var(--font-size-sm, 1rem); align-items: baseline; }
.vd-nvp dt { color: var(--text-muted); font-size: var(--font-size-2xs, 0.8rem); text-transform: uppercase; letter-spacing: 0.05em; }
.vd-nvp dd { margin: 0; }
.vd-deg { display: inline-block; margin: 0 8px 4px 0; white-space: nowrap; }
.vd-deg__name { font-weight: 500; color: var(--text-primary); }
.vd-deg__label { color: var(--text-secondary); margin-left: 3px; font-size: var(--font-size-2xs, 0.8rem); }
.vd-deg--omitted .vd-deg__name { color: var(--accent-coral, #E87461); text-decoration: line-through; text-decoration-color: rgba(232,116,97,0.6); }
.vd-deg--added .vd-deg__name { color: var(--accent-gold, #D4A03C); }
`;

function _h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Group consecutive events with the same symbol, bass and voicing: [{ first, count, event }]. */
function groupEvents(events) {
  const groups = [];
  const key = e => `${e.symbol}|${e.bass}|${(e.voicing || []).join(',')}`;
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && key(last.event) === key(e)) last.count++;
    else groups.push({ first: e.index, count: 1, event: e });
  }
  return groups;
}

/** MIDI number → spelled name with octave (sharps; pitch-class names from the engine). */
function noteName(midi) {
  const p = parseNote(midi);
  return p ? `${p.name}${p.octave}` : String(midi);
}

class VoicingDetail {
  /**
   * @param {{ info: string|Element, rubs: string|Element, nvp: string|Element }} targets
   * @param {{ onSelectEvent?: (index:number) => void }} [options]
   */
  constructor(targets, options = {}) {
    const get = t => typeof t === 'string' ? document.getElementById(t) : t;
    this._info = get(targets.info);
    this._rubs = get(targets.rubs);
    this._nvp  = get(targets.nvp);
    this._onSelectEvent = options.onSelectEvent || (() => {});
    if (!document.getElementById('vd-styles')) {
      const st = document.createElement('style');
      st.id = 'vd-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
  }

  /**
   * @param {Object|null} bar          BarResult from analyzeProgression
   * @param {number|null} eventIndex   index into bar.events (null = no event)
   */
  render(bar, eventIndex) {
    const event = bar && eventIndex != null ? bar.events[eventIndex] || null : null;
    this._renderInfo(bar, event);
    this._renderRubs(bar, event);
    this._renderNvp(bar, event);
  }

  clear() { this.render(null, null); }

  _renderInfo(bar, event) {
    const root = this._info;
    root.textContent = '';
    if (!bar) { root.appendChild(_h('p', 'vd-empty', 'No bar selected.')); return; }

    const symbolText = event ? (event.namedVsPlayed ? event.namedVsPlayed.symbol : event.symbol) : (bar.parsed ? bar.parsed.display : bar.effectiveSymbol);
    const h = _h('h2', 'vd-symbol');
    h.appendChild(_h('span', 'vd-symbol__bar', `Bar ${bar.bar}`));
    h.appendChild(document.createTextNode(symbolText || '—'));
    root.appendChild(h);

    const tags = _h('div', 'vd-tags');
    if (bar.hold) tags.appendChild(_h('span', 'vd-tag vd-tag--hold', 'hold'));
    if (bar.section) tags.appendChild(_h('span', 'vd-tag', bar.section));
    if (bar.source) tags.appendChild(_h('span', 'vd-tag', bar.source));
    root.appendChild(tags);

    // Event chips: one per group of consecutive identical events.
    if (bar.events.length) {
      const ul = _h('ul', 'vd-events');
      ul.setAttribute('aria-label', 'Comp events in this bar');
      for (const g of groupEvents(bar.events)) {
        const li = _h('li');
        const selected = event && event.index >= g.first && event.index < g.first + g.count;
        const btn = _h('button', 'vd-chip' + (selected ? ' vd-chip--selected' : ''));
        btn.type = 'button';
        btn.dataset.event = String(g.first);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.appendChild(_h('span', 'vd-chip__beat', `${g.event.beat + 1}`));
        btn.appendChild(_h('span', 'vd-chip__sym', g.event.namedVsPlayed ? g.event.namedVsPlayed.symbol : (g.event.symbol || '—')));
        if (g.count > 1) btn.appendChild(_h('span', 'vd-chip__count', `×${g.count}`));
        btn.appendChild(_h('span', 'vd-chip__tension' + (g.event.total > 0 ? ' vd-chip__tension--hot' : ''), String(g.event.total)));
        btn.addEventListener('click', () => this._onSelectEvent(g.first));
        li.appendChild(btn);
        ul.appendChild(li);
      }
      root.appendChild(ul);
    }

    const dl = _h('dl', 'vd-rows');
    const row = (label, node) => { dl.appendChild(_h('dt', null, label)); const dd = _h('dd'); dd.appendChild(node); dl.appendChild(dd); };

    const bassWrap = _h('span');
    if (event && event.bass) bassWrap.appendChild(_h('span', 'vd-note vd-note--bass', event.bass));
    else bassWrap.appendChild(_h('span', 'vd-empty', 'none'));
    row('Bass', bassWrap);

    const voWrap = _h('span');
    if (event && event.voicing && event.voicing.length) for (const n of event.voicing) voWrap.appendChild(_h('span', 'vd-note vd-note--voicing', n));
    else voWrap.appendChild(_h('span', 'vd-empty', 'none'));
    row('Voicing', voWrap);

    row('Tension', _h('span', 'vd-tension', String(event ? event.total : bar.total)));

    // Motion: "into" for the first event (from the performance predecessor), the within-bar step otherwise.
    const mot = _h('span');
    if (!event) mot.appendChild(_h('span', 'vd-empty', 'n/a'));
    else {
      const m = event.index === 0 ? bar.motion : event.motion;
      const label = event.index === 0 ? 'into' : 'step';
      if (!m) mot.appendChild(_h('span', 'vd-empty', event.index === 0 ? 'n/a (no previous voicing)' : 'n/a'));
      else {
        mot.appendChild(document.createTextNode(`${label}: ${m.total} semitone${m.total === 1 ? '' : 's'}`));
        if (m.unmatched && m.unmatched.length) {
          mot.appendChild(_h('span', 'vd-motion__free', `free: ${m.unmatched.map(u => u.name || noteName(u.midi)).join(', ')}`));
        }
      }
    }
    row('Motion', mot);
    root.appendChild(dl);
  }

  _renderRubs(bar, event) {
    const root = this._rubs;
    root.textContent = '';
    const comp = event ? event.comp.rubs : [];
    const mel = event && event.melody ? event.melody.rubs : [];
    if (!comp.length && !mel.length) { root.appendChild(_h('p', 'vd-empty', event ? 'No rubs in this voicing.' : '—')); return; }
    const ul = _h('ul', 'vd-list');
    for (const r of comp) {
      const li = _h('li');
      const sw = _h('span', 'vd-swatch'); sw.style.background = INTERVAL_COLOR[r.label] || INTERVAL_COLOR[r.label.replace(/\+.*$|16$/, m => m === '16' ? '2' : '')] || '#888';
      li.appendChild(sw);
      li.appendChild(_h('span', 'vd-pair', `${r.lo}–${r.hi}`));
      li.appendChild(_h('span', 'vd-ivl', `${INTERVAL_NAME[r.label] || r.label} · ${r.semitones} st`));
      li.appendChild(_h('span', 'vd-weight', `+${r.weight}`));
      ul.appendChild(li);
    }
    for (const r of mel) {
      const li = _h('li');
      const sw = _h('span', 'vd-swatch'); sw.style.background = INTERVAL_COLOR[r.label] || '#888';
      li.appendChild(sw);
      li.appendChild(_h('span', 'vd-pair', `${r.melody} / ${r.against}`));
      li.appendChild(_h('span', 'vd-ivl', `${INTERVAL_NAME[r.label] || r.label} · ${r.semitones} st · melody ${r.dur} beat${r.dur === 1 ? '' : 's'}`));
      li.appendChild(_h('span', 'vd-weight', `+${r.contribution}`));
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }

  _renderNvp(bar, event) {
    const root = this._nvp;
    root.textContent = '';
    const nvp = event && event.namedVsPlayed;
    if (!nvp) { root.appendChild(_h('p', 'vd-empty', event && event.symbol ? 'Chord symbol not understood.' : '—')); return; }
    const dl = _h('dl', 'vd-nvp');
    const row = (label, list, cls) => {
      dl.appendChild(_h('dt', null, label));
      const dd = _h('dd');
      if (!list.length) dd.appendChild(_h('span', 'vd-empty', 'none'));
      for (const e of list) {
        const s = _h('span', `vd-deg ${cls}`);
        s.appendChild(_h('span', 'vd-deg__name', e.name));
        s.appendChild(_h('span', 'vd-deg__label', e.degree));
        dd.appendChild(s);
      }
      dl.appendChild(dd);
    };
    row('Played', nvp.present, 'vd-deg--present');
    row('Left out', nvp.omitted, 'vd-deg--omitted');
    row('Added', nvp.added, 'vd-deg--added');
    root.appendChild(dl);
  }
}

export { VoicingDetail, groupEvents };

if (typeof window !== 'undefined') {
  window.VoicingDetail = VoicingDetail;
}
