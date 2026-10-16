/**
 * voicing-staff.js
 * ================
 * Engraved grand staff for the selected bar on /voicings. Builds the bar model
 * (voicing-staff-model.js), converts it to MEI, and renders it with Verovio.
 * The toolkit (WASM, ~2 MB gzipped) loads lazily on the first render from
 * jsDelivr, pinned; the panel shows a loading state meanwhile and an
 * "unavailable" state if the load fails. Melody is always drawn.
 *
 * Usage:
 *   const staff = new VoicingStaff('vp-staff', { onNoteClick: note => … });
 *   staff.render(progression, 17);   // async; the latest call wins
 *   staff.highlight(noteId);         // or null to clear
 *   staff.setPlaying(ids);           // Set / array of notehead ids sounding now; null or empty clears
 *
 * onNoteClick receives { id, midi, name, role, bar, event } for a notehead
 * (event = comp event index for comp notes, null for bassLine / melody
 * notes), or null when the user clicks empty staff area. setEvent(index)
 * dims the comp notes of the other events. setPlaying(ids) lights the given
 * noteheads on top of the dim state (playback follow); each tied piece of a
 * note is its own id, so a dotted or cross-beat note lights piece by piece.
 */

import { buildBarModel, toMEI } from './voicing-staff-model.js';
import { ROLE_COLORS } from './voicing-keyboard.js';

const VEROVIO_VERSION = '6.3.0';
const VEROVIO_BASE = `https://cdn.jsdelivr.net/npm/verovio@${VEROVIO_VERSION}/dist/`;   // one constant to switch to static/vendor/
const VEROVIO_OPTIONS = {
  breaks: 'none', scale: 50, adjustPageHeight: true, pageWidth: 3000,
  header: 'none', footer: 'none',
  pageMarginTop: 40, pageMarginBottom: 20, pageMarginLeft: 20, pageMarginRight: 20,
  svgViewBox: true, svgHtml5: false, spacingStaff: 8, justifyVertically: false,
};

let _toolkit = null;
/** Lazily import Verovio's ES module build; the promise is shared and reset on failure. */
function loadToolkit() {
  if (!_toolkit) {
    _toolkit = (async () => {
      const [wasm, esm] = await Promise.all([
        import(VEROVIO_BASE + 'verovio-module.mjs'),
        import(VEROVIO_BASE + 'verovio.mjs'),
      ]);
      const module = await wasm.default();
      const tk = new esm.VerovioToolkit(module);
      tk.setOptions(VEROVIO_OPTIONS);
      return tk;
    })().catch(err => { _toolkit = null; throw err; });
  }
  return _toolkit;
}

const CSS = /* css */ `
.vs-wrap { position: relative; min-height: 140px; border-radius: var(--radius-md, 8px); background: var(--bg-deep, #0F0F14); color: var(--text-primary, #F2EFE6); padding: 8px; }
.vs-svg { display: flex; justify-content: center; }
.vs-svg svg { display: block; width: 100%; height: auto; max-width: 420px; color: var(--text-primary, #F2EFE6); fill: currentColor; }
/* Verovio strokes use currentColor; fills default to black. Role-colored notes carry their own fill/color attributes and win. */
.vs-svg g.note { cursor: pointer; }
.vs-svg g.note.vs-note--hit { filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px rgba(255,255,255,0.8)); }
.vs-svg g.note.vs-note--dim { opacity: 0.3; }
.vs-svg g.note.vs-note--playing, .vs-svg g.note.vs-note--playing.vs-note--dim { opacity: 1; filter: drop-shadow(0 0 2px currentColor) drop-shadow(0 0 7px rgba(255,255,255,0.9)); }
.vs-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; font-size: var(--font-size-xs, 12px); color: var(--text-muted, #8A8678); pointer-events: none; }
.vs-wrap[data-state="ready"] .vs-status { display: none; }
.vs-wrap[data-state="loading"] .vs-svg, .vs-wrap[data-state="error"] .vs-svg { opacity: 0.3; }
`;

/** Resolve ROLE_COLORS (CSS var() strings) to concrete colors Verovio can embed. */
function resolveColors() {
  const out = {};
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  for (const [role, value] of Object.entries(ROLE_COLORS)) {
    const m = value.match(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/);
    out[role] = m ? ((cs && cs.getPropertyValue(m[1]).trim()) || (m[2] || '').trim()) : value;
  }
  return out;
}

class VoicingStaff {
  /**
   * @param {string|Element} container
   * @param {{ onNoteClick?: (note: object|null) => void }} [options]
   */
  constructor(container, options = {}) {
    this._container = typeof container === 'string' ? document.getElementById(container) : container;
    this._onNoteClick = options.onNoteClick || (() => {});
    this._colors = resolveColors();
    this._hits = new Map();     // svg id → { id, midi, name, role, bar, event }
    this._hitEl = null;
    this._playing = new Set();   // notehead ids lit by setPlaying
    this._token = 0;
    this._event = null;
    this.model = null;

    if (!document.getElementById('vs-styles')) {
      const st = document.createElement('style');
      st.id = 'vs-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this._wrap = document.createElement('div');
    this._wrap.className = 'vs-wrap';
    this._wrap.dataset.state = 'empty';
    this._wrap.innerHTML = '<div class="vs-svg" role="img" aria-label="Staff notation for the selected bar"></div><div class="vs-status"></div>';
    this._svgHost = this._wrap.querySelector('.vs-svg');
    this._status = this._wrap.querySelector('.vs-status');
    this._container.appendChild(this._wrap);

    this._svgHost.addEventListener('click', e => {
      const g = e.target instanceof Element ? e.target.closest('g.note') : null;
      const hit = g && this._hits.get(g.id);
      this.highlight(hit ? hit.id : null);
      this._onNoteClick(hit || null);
    });
  }

  /**
   * Render one bar. Resolves when drawn, or when superseded by a later call.
   * @param {{ event?: number|null }} [options]  comp event to keep bright (others dimmed)
   */
  async render(progression, barNumber, options = {}) {
    const token = ++this._token;
    this._hits.clear(); this._hitEl = null; this._playing = new Set();
    this._event = options.event ?? null;
    this.model = buildBarModel(progression, barNumber);
    if (!this.model) { this._setState('error', `No data for bar ${barNumber}`); return; }
    for (const w of this.model.warnings) console.warn(`[voicing-staff] ${w}`);
    const mei = toMEI(this.model, this._colors);

    let tk;
    if (!_toolkit) this._setState('loading', 'Loading notation…');
    try { tk = await loadToolkit(); }
    catch (err) {
      console.error('[voicing-staff] Verovio failed to load', err);
      if (token === this._token) this._setState('error', 'Notation unavailable (Verovio did not load)');
      return;
    }
    if (token !== this._token) return;

    if (!tk.loadData(mei)) { this._setState('error', 'Notation could not be engraved for this bar'); return; }
    this._svgHost.innerHTML = tk.renderToSVG(1);
    for (const ev of Object.values(this.model.voices).flat()) for (const n of ev.notes) {
      if (this._svgHost.querySelector(`#${CSS_escape(n.id)}`)) this._hits.set(n.id, { id: n.id, midi: n.midi, name: n.name, role: n.role, bar: barNumber, event: ev.event ?? null });
    }
    this._applyEventDim();
    this._setState('ready', '');
  }

  /** Keep one comp event's notes bright and dim the others' (null = all bright). */
  setEvent(index) {
    this._event = index ?? null;
    this._applyEventDim();
  }

  _applyEventDim() {
    for (const [id, hit] of this._hits) {
      const el = this._svgHost.querySelector(`#${CSS_escape(id)}`);
      if (!el) continue;
      el.classList.toggle('vs-note--dim', this._event != null && hit.event != null && hit.event !== this._event);
    }
  }

  /** Light the noteheads sounding now (playback follow); null or empty restores the normal state. */
  setPlaying(ids) {
    const next = new Set(ids || []);
    for (const id of this._playing) if (!next.has(id)) { const el = this._svgHost.querySelector(`#${CSS_escape(id)}`); if (el) el.classList.remove('vs-note--playing'); }
    for (const id of next) if (!this._playing.has(id)) { const el = this._svgHost.querySelector(`#${CSS_escape(id)}`); if (el) el.classList.add('vs-note--playing'); }
    this._playing = next;
  }

  /** Highlight one note group by id; null clears. */
  highlight(noteId) {
    if (this._hitEl) this._hitEl.classList.remove('vs-note--hit');
    this._hitEl = noteId ? this._svgHost.querySelector(`#${CSS_escape(noteId)}`) : null;
    if (this._hitEl) this._hitEl.classList.add('vs-note--hit');
  }

  clear() {
    this._token++;
    this.model = null; this._hits.clear(); this._hitEl = null; this._event = null; this._playing = new Set();
    this._svgHost.innerHTML = '';
    this._setState('empty', '');
  }

  destroy() { this._wrap.remove(); }

  _setState(state, text) {
    this._wrap.dataset.state = state;
    this._status.textContent = text;
  }
}

const CSS_escape = s => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

export { VoicingStaff };

if (typeof window !== 'undefined') {
  window.VoicingStaff = VoicingStaff;
}
