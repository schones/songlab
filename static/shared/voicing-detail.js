/**
 * voicing-detail.js
 * =================
 * Selected-bar detail for the Voicing Explorer Analyze page: chord
 * symbol and bar info, bass / voicing notes, "intervals that rub", and
 * named-vs-played. Renders from one BarResult of analyzeProgression().
 *
 * Usage:
 *   const detail = new VoicingDetail({ info: 'vp-info', rubs: 'vp-rubs', nvp: 'vp-nvp' });
 *   detail.render(barResult, compEvent);
 */

import { INTERVAL_SERIES } from './voicing-chart.js';

const INTERVAL_COLOR = Object.fromEntries(INTERVAL_SERIES.map(s => [s.key, s.color]));
const INTERVAL_NAME  = Object.fromEntries(INTERVAL_SERIES.map(s => [s.key, s.label]));

const CSS = /* css */ `
.vd-symbol { font-size: var(--font-size-xl, 1.8rem); font-weight: 500; letter-spacing: -0.01em; color: var(--text-primary); margin: 0; }
.vd-symbol__bar { font-size: var(--font-size-sm, 1rem); color: var(--text-muted); font-weight: 400; margin-right: 8px; }
.vd-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 12px; }
.vd-tag { font-size: var(--font-size-2xs, 0.8rem); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-color); color: var(--text-secondary); }
.vd-tag--hold { border-color: var(--accent-gold); color: var(--accent-gold); }
.vd-rows { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: var(--font-size-sm, 1rem); align-items: baseline; }
.vd-rows dt { color: var(--text-muted); font-size: var(--font-size-2xs, 0.8rem); text-transform: uppercase; letter-spacing: 0.05em; }
.vd-rows dd { margin: 0; color: var(--text-primary); }
.vd-note { display: inline-block; padding: 1px 7px; border-radius: 4px; margin: 0 4px 4px 0; font-weight: 500; color: #fff; }
.vd-note--bass    { background: var(--accent-gold, #D4A03C); }
.vd-note--voicing { background: var(--accent-blue-bright, #3A8BC9); }
.vd-tension { font-size: var(--font-size-lg, 1.4rem); font-weight: 500; }
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

class VoicingDetail {
  /** @param {{ info: string|Element, rubs: string|Element, nvp: string|Element }} targets */
  constructor(targets) {
    const get = t => typeof t === 'string' ? document.getElementById(t) : t;
    this._info = get(targets.info);
    this._rubs = get(targets.rubs);
    this._nvp  = get(targets.nvp);
    if (!document.getElementById('vd-styles')) {
      const st = document.createElement('style');
      st.id = 'vd-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
  }

  /**
   * @param {Object|null} bar   BarResult from analyzeProgression
   * @param {Object|null} comp  The comp event the analysis used (bar.comp[0] from the data)
   */
  render(bar, comp) {
    this._renderInfo(bar, comp);
    this._renderRubs(bar);
    this._renderNvp(bar);
  }

  clear() { this.render(null, null); }

  _renderInfo(bar, comp) {
    const root = this._info;
    root.textContent = '';
    if (!bar) { root.appendChild(_h('p', 'vd-empty', 'No bar selected.')); return; }

    const h = _h('h2', 'vd-symbol');
    h.appendChild(_h('span', 'vd-symbol__bar', `Bar ${bar.bar}`));
    h.appendChild(document.createTextNode(bar.parsed ? bar.parsed.display : (bar.effectiveSymbol || '—')));
    root.appendChild(h);

    const tags = _h('div', 'vd-tags');
    if (bar.hold) tags.appendChild(_h('span', 'vd-tag vd-tag--hold', 'hold'));
    if (bar.section) tags.appendChild(_h('span', 'vd-tag', bar.section));
    if (bar.source) tags.appendChild(_h('span', 'vd-tag', bar.source));
    root.appendChild(tags);

    const dl = _h('dl', 'vd-rows');
    const row = (label, node) => { dl.appendChild(_h('dt', null, label)); const dd = _h('dd'); dd.appendChild(node); dl.appendChild(dd); };

    const bassWrap = _h('span');
    if (comp && comp.bass) bassWrap.appendChild(_h('span', 'vd-note vd-note--bass', comp.bass));
    else bassWrap.appendChild(_h('span', 'vd-empty', 'none'));
    row('Bass', bassWrap);

    const voWrap = _h('span');
    if (comp && comp.voicing && comp.voicing.length) for (const n of comp.voicing) voWrap.appendChild(_h('span', 'vd-note vd-note--voicing', n));
    else voWrap.appendChild(_h('span', 'vd-empty', 'none'));
    row('Voicing', voWrap);

    row('Tension', _h('span', 'vd-tension', String(bar.total)));

    const mot = _h('span', null, bar.motion ? `${bar.motion.total} semitones` : 'n/a (voice count changed)');
    row('Motion', mot);
    root.appendChild(dl);
  }

  _renderRubs(bar) {
    const root = this._rubs;
    root.textContent = '';
    const rubs = bar ? bar.comp.rubs : [];
    if (!rubs.length) { root.appendChild(_h('p', 'vd-empty', bar ? 'No rubs in this voicing.' : '—')); return; }
    const ul = _h('ul', 'vd-list');
    for (const r of rubs) {
      const li = _h('li');
      const sw = _h('span', 'vd-swatch'); sw.style.background = INTERVAL_COLOR[r.label] || '#888';
      li.appendChild(sw);
      li.appendChild(_h('span', 'vd-pair', `${r.lo}–${r.hi}`));
      li.appendChild(_h('span', 'vd-ivl', `${INTERVAL_NAME[r.label] || r.label} · ${r.semitones} st`));
      li.appendChild(_h('span', 'vd-weight', `+${r.weight}`));
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }

  _renderNvp(bar) {
    const root = this._nvp;
    root.textContent = '';
    const nvp = bar && bar.namedVsPlayed;
    if (!nvp) { root.appendChild(_h('p', 'vd-empty', bar && bar.effectiveSymbol ? 'Chord symbol not understood.' : '—')); return; }
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

export { VoicingDetail };

if (typeof window !== 'undefined') {
  window.VoicingDetail = VoicingDetail;
}
