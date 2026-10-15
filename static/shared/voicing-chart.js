/**
 * voicing-chart.js
 * ================
 * Per-bar tension chart for the Voicing Explorer Analyze page. Inline
 * SVG, stacked by interval type, with section labels, bar numbers, an
 * upper-voice-motion row, and keyboard-navigable bar selection.
 *
 * Pure view: renders from an analyzeProgression() result and a
 * selected bar number; reports clicks / arrow keys through onSelect.
 * Never touches HarmonyState.
 *
 * Usage:
 *   const chart = new VoicingChart('vp-chart', { onSelect: n => select(n) });
 *   chart.render(progression, analysis, selectedBar);
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stack order bottom → top, with the agreed colors. */
const INTERVAL_SERIES = [
  { key: 'm2', label: 'minor 2nd', color: '#E8735F' },
  { key: 'm9', label: 'minor 9th', color: '#C77DBA' },
  { key: 'TT', label: 'tritone',   color: '#D9A441' },
  { key: 'M2', label: 'major 2nd', color: '#4C82C2' },
  { key: 'M7', label: 'major 7th', color: '#A9CBE8' },
];

const LAYOUT = {
  minBarW: 22,     // px per bar; the SVG grows (and scrolls) rather than shrinking below this
  axisW: 26,
  padR: 8,
  sectionH: 22,
  plotH: 130,
  numbersH: 18,
  motionH: 20,
  padB: 4,
};

const CSS = /* css */ `
.vc-wrap { position: relative; width: 100%; overflow-x: auto; overflow-y: hidden; }
.vc-svg { display: block; max-width: none; flex: none; font-family: var(--font-family-base, system-ui, sans-serif); }
.vc-svg:focus { outline: none; }
.vc-svg:focus-visible { outline: 2px solid var(--accent-gold, #D4A03C); outline-offset: 2px; border-radius: 4px; }
.vc-grid { stroke: var(--border-subtle, #23232E); stroke-width: 1; }
.vc-axis-label { fill: var(--text-muted, #726C5F); font-size: 10px; }
.vc-section-label { fill: var(--text-secondary, #C7C2B5); font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
.vc-section-line { stroke: var(--border-strong, #43434F); stroke-width: 1; }
.vc-bar { cursor: pointer; }
.vc-bar:focus { outline: none; }
.vc-bar--arranged .vc-seg { fill-opacity: 0.55; }
.vc-bar--arranged .vc-num { fill: var(--text-muted, #726C5F); }
.vc-hit { fill: transparent; }
.vc-bar:hover .vc-hit { fill: rgba(255, 255, 255, 0.04); }
.vc-num { fill: var(--text-tertiary, #9A9486); font-size: 10px; text-anchor: middle; }
.vc-motion { fill: var(--text-secondary, #C7C2B5); font-size: 10px; text-anchor: middle; }
.vc-motion--none { fill: var(--text-ghost, #4A4538); }
.vc-select { fill: none; stroke: var(--accent-gold, #D4A03C); stroke-width: 2; rx: 2; }
.vc-bar--selected .vc-num { fill: var(--accent-gold, #D4A03C); font-weight: 700; }
.vc-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: var(--font-size-2xs, 0.8rem); color: var(--text-tertiary, #9A9486); }
.vc-legend__item { display: inline-flex; align-items: center; gap: 6px; }
.vc-legend__swatch { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.vc-legend__swatch--arranged { opacity: 0.55; }
`;

function _el(tag, attrs = {}, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

class VoicingChart {
  /**
   * @param {string|Element} container
   * @param {{ onSelect?: (bar:number) => void, onStepEvent?: (delta:number) => void }} [options]
   *   onStepEvent fires on Shift+←/→ (step the selected comp event; the page decides what that means).
   */
  constructor(container, options = {}) {
    this._container = typeof container === 'string' ? document.getElementById(container) : container;
    this._onSelect = options.onSelect || (() => {});
    this._onStepEvent = options.onStepEvent || null;
    this._progression = null;
    this._analysis = null;
    this._selected = null;
    this._barEls = new Map();

    if (!document.getElementById('vc-styles')) {
      const st = document.createElement('style');
      st.id = 'vc-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    this._wrap = document.createElement('div');
    this._wrap.className = 'vc-wrap';
    this._container.appendChild(this._wrap);

    this._legend = document.createElement('div');
    this._legend.className = 'vc-legend';
    this._container.appendChild(this._legend);
    this._renderLegend();

    this._resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (this._analysis) this._draw(); })
      : null;
    if (this._resizeObserver) this._resizeObserver.observe(this._container);
  }

  /** Full render. */
  render(progression, analysis, selectedBar) {
    this._progression = progression;
    this._analysis = analysis;
    this._selected = selectedBar;
    this._draw();
  }

  /** Cheap update of the selection only. */
  setSelected(bar) {
    this._selected = bar;
    if (!this._analysis) return;
    for (const [n, g] of this._barEls) {
      const sel = n === bar;
      g.classList.toggle('vc-bar--selected', sel);
      g.setAttribute('tabindex', sel ? '0' : '-1');
      const rect = g.querySelector('.vc-select');
      if (rect) rect.style.display = sel ? '' : 'none';
    }
    this._scrollIntoView(bar);
  }

  focusSelected() {
    const g = this._barEls.get(this._selected);
    if (g) g.focus({ preventScroll: true });
  }

  destroy() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._wrap.remove();
    this._legend.remove();
  }

  // ── internal ────────────────────────────────────────────────────

  _renderLegend() {
    this._legend.textContent = '';
    for (const s of INTERVAL_SERIES) {
      const item = document.createElement('span');
      item.className = 'vc-legend__item';
      const sw = document.createElement('span');
      sw.className = 'vc-legend__swatch';
      sw.style.background = s.color;
      item.append(sw, document.createTextNode(s.label));
      this._legend.appendChild(item);
    }
    const arranged = document.createElement('span');
    arranged.className = 'vc-legend__item';
    const sw = document.createElement('span');
    sw.className = 'vc-legend__swatch vc-legend__swatch--arranged';
    sw.style.background = 'var(--text-secondary, #C7C2B5)';
    arranged.append(sw, document.createTextNode('arranged (faded) vs transcribed'));
    this._legend.appendChild(arranged);
  }

  _draw() {
    const bars = this._analysis.bars;
    const n = bars.length;
    this._wrap.textContent = '';
    this._barEls.clear();
    if (!n) return;

    const L = LAYOUT;
    const availW = Math.max(0, this._container.clientWidth - 2);
    const barW = Math.max(L.minBarW, Math.floor((availW - L.axisW - L.padR) / n));
    const W = L.axisW + barW * n + L.padR;
    const H = L.sectionH + L.plotH + L.numbersH + L.motionH + L.padB;
    const plotTop = L.sectionH;
    const plotBot = plotTop + L.plotH;

    const maxTotal = Math.max(1, ...bars.map(b => b.total));
    const yMax = Math.ceil(maxTotal);
    const y = v => plotBot - (v / yMax) * (L.plotH - 6);

    const svg = _el('svg', {
      class: 'vc-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`,
      style: `width:${W}px;height:${H}px`,
      role: 'group', 'aria-label': 'Tension per bar', tabindex: '-1',
    });

    // grid + axis labels
    for (let v = 0; v <= yMax; v++) {
      svg.appendChild(_el('line', { class: 'vc-grid', x1: L.axisW, x2: W - L.padR, y1: y(v), y2: y(v) }));
      if (v % (yMax > 6 ? 2 : 1) === 0) {
        svg.appendChild(_el('text', { class: 'vc-axis-label', x: L.axisW - 6, y: y(v) + 3, 'text-anchor': 'end' }, String(v)));
      }
    }

    // section labels + brackets
    let secStart = 0;
    for (let i = 0; i <= n; i++) {
      const cur = i < n ? bars[i].section : null;
      if (i === n || cur !== bars[secStart].section) {
        const x1 = L.axisW + secStart * barW + 2;
        const x2 = L.axisW + i * barW - 2;
        svg.appendChild(_el('line', { class: 'vc-section-line', x1, x2, y1: L.sectionH - 6, y2: L.sectionH - 6 }));
        svg.appendChild(_el('text', { class: 'vc-section-label', x: x1, y: L.sectionH - 10 }, bars[secStart].section || ''));
        secStart = i;
      }
    }

    // bars
    bars.forEach((b, i) => {
      const x0 = L.axisW + i * barW;
      const g = _el('g', {
        class: `vc-bar${b.source === 'arranged' ? ' vc-bar--arranged' : ''}${b.bar === this._selected ? ' vc-bar--selected' : ''}`,
        role: 'button',
        tabindex: b.bar === this._selected ? '0' : '-1',
        'aria-label': `Bar ${b.bar}, ${b.effectiveSymbol || 'no chord'}, tension ${b.total}`,
        'data-bar': b.bar,
      });
      g.appendChild(_el('rect', { class: 'vc-hit', x: x0, y: plotTop, width: barW, height: H - plotTop }));

      // stacked segments
      let acc = 0;
      const inner = Math.max(2, barW - 4);
      for (const s of INTERVAL_SERIES) {
        const v = b.byInterval[s.key] || 0;
        if (v <= 0) continue;
        const yTop = y(acc + v), yBot = y(acc);
        g.appendChild(_el('rect', {
          class: 'vc-seg', x: x0 + 2, y: yTop, width: inner, height: Math.max(1, yBot - yTop), fill: s.color,
        }));
        acc += v;
      }

      // selection outline (hidden unless selected)
      const sel = _el('rect', { class: 'vc-select', x: x0 + 1, y: plotTop + 1, width: barW - 2, height: L.plotH - 2 });
      if (b.bar !== this._selected) sel.style.display = 'none';
      g.appendChild(sel);

      // bar number
      g.appendChild(_el('text', { class: 'vc-num', x: x0 + barW / 2, y: plotBot + 13 }, String(b.bar)));

      // motion
      const mot = b.motion ? String(b.motion.total) : '·';
      g.appendChild(_el('text', {
        class: `vc-motion${b.motion ? '' : ' vc-motion--none'}`,
        x: x0 + barW / 2, y: plotBot + L.numbersH + 13,
      }, mot));

      g.addEventListener('click', () => this._onSelect(b.bar));
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._onSelect(b.bar); }
      });
      svg.appendChild(g);
      this._barEls.set(b.bar, g);
    });

    // motion row label
    svg.appendChild(_el('text', { class: 'vc-axis-label', x: L.axisW - 6, y: plotBot + L.numbersH + 13, 'text-anchor': 'end' }, 'mov'));

    // arrow keys step the selection while the chart has focus; Shift+arrows step the comp event
    svg.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.shiftKey && this._onStepEvent) {
        e.preventDefault();
        this._onStepEvent(e.key === 'ArrowRight' ? 1 : -1);
        this.focusSelected();
        return;
      }
      const idx = bars.findIndex(b => b.bar === this._selected);
      if (idx < 0) return;
      const next = bars[idx + (e.key === 'ArrowRight' ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      this._onSelect(next.bar);
      this.focusSelected();
    });

    this._wrap.appendChild(svg);
    this._scrollIntoView(this._selected);
  }

  _scrollIntoView(bar) {
    const g = this._barEls.get(bar);
    if (!g || !this._wrap) return;
    const hit = g.querySelector('.vc-hit');
    if (!hit) return;
    const x = parseFloat(hit.getAttribute('x'));
    const w = parseFloat(hit.getAttribute('width'));
    const left = this._wrap.scrollLeft, right = left + this._wrap.clientWidth;
    if (x < left + 8) this._wrap.scrollLeft = Math.max(0, x - 40);
    else if (x + w > right - 8) this._wrap.scrollLeft = x + w - this._wrap.clientWidth + 40;
  }
}

export { VoicingChart, INTERVAL_SERIES };

if (typeof window !== 'undefined') {
  window.VoicingChart = VoicingChart;
}
