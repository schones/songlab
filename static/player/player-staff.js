/**
 * player-staff.js
 * ===============
 * Grand staff for the follow-along player: one bar (or a range) of a norm
 * document engraved with Verovio in the page's light frame. The MEI comes
 * from player-staff-model.js; the toolkit is the shared lazy singleton from
 * voicing-staff.js (its options are re-applied here before every render,
 * so the two pages can share one WASM instance).
 *
 * Usage:
 *   const staff = new PlayerStaff('pl-staff');
 *   await staff.render(norm, 1);                 // bar 1; the latest call wins
 *   await staff.render(norm, 15, { to: 16 });    // a range
 *   staff.setNoteState('pl-b1-1-0', 'expected'); // 'expected' | 'correct' | 'wrong' | null
 *   staff.clearStates();
 *   staff.hits                                   // { id → { midi, bar, staff, hand, onset, at, tieStop } }
 *   staff.noteIds({ bar, hand })                 // ids in drawing order, optionally filtered
 *
 * States are classes on g.note (pl-note--expected / --correct / --wrong);
 * the CSS colours them blue / green / red, as the keyboard will. No MIDI,
 * no sound, no clicks here: the page wires those.
 */

import { loadToolkit } from '../shared/voicing-staff.js';
import { toMEI } from './player-staff-model.js';

/** Applied before every render (the toolkit is shared with /voicings, which sets its own). */
const PLAYER_OPTIONS = {
  breaks: 'none', scale: 40, adjustPageHeight: true, pageWidth: 2100,
  header: 'none', footer: 'none',
  pageMarginTop: 30, pageMarginBottom: 30, pageMarginLeft: 40, pageMarginRight: 40,
  svgViewBox: true, svgHtml5: false, spacingStaff: 10, justifyVertically: false,
};

const CSS = /* css */ `
.pl-staff-wrap { position: relative; width: 100%; min-height: 200px; }
.pl-staff-svg { display: flex; justify-content: center; }
/* breaks:'none' sizes the page to its content, so one bar is a small viewBox: size by height, not width. */
.pl-staff-svg svg { display: block; height: clamp(260px, 40vh, 440px); width: auto; max-width: 100%; color: var(--text-primary, #141210); fill: currentColor; }
.pl-staff-svg g.note { transition: color 80ms linear; }
.pl-staff-svg g.note.pl-note--expected { color: var(--accent-blue, #2D5F8A); fill: var(--accent-blue, #2D5F8A); }
.pl-staff-svg g.note.pl-note--correct  { color: var(--accent-green, #1E7B34); fill: var(--accent-green, #1E7B34); }
.pl-staff-svg g.note.pl-note--wrong    { color: var(--accent-coral, #B9341F); fill: var(--accent-coral, #B9341F); }
.pl-staff-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; color: var(--text-muted, #4E4A43); pointer-events: none; }
.pl-staff-wrap[data-state="ready"] .pl-staff-status { display: none; }
.pl-staff-wrap[data-state="loading"] .pl-staff-svg, .pl-staff-wrap[data-state="error"] .pl-staff-svg { opacity: 0.3; }
.pl-staff-wrap[data-state="error"] .pl-staff-status { color: var(--accent-coral, #B9341F); }
`;

const STATES = ['expected', 'correct', 'wrong'];
const CSS_escape = s => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

class PlayerStaff {
  /** @param {string|Element} host  the element to fill (its placeholder content is replaced) */
  constructor(host) {
    this._host = typeof host === 'string' ? document.getElementById(host) : host;
    if (!this._host) throw new Error('PlayerStaff: host not found');
    this.hits = {};
    this.range = null;
    this._states = new Map();   // id → state
    this._token = 0;

    if (!document.getElementById('pl-staff-styles')) {
      const st = document.createElement('style');
      st.id = 'pl-staff-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this._wrap = document.createElement('div');
    this._wrap.className = 'pl-staff-wrap';
    this._wrap.dataset.state = 'empty';
    this._wrap.innerHTML = '<div class="pl-staff-svg" role="img" aria-label="Staff notation for the current bar"></div><div class="pl-staff-status"></div>';
    this._svgHost = this._wrap.querySelector('.pl-staff-svg');
    this._status = this._wrap.querySelector('.pl-staff-status');
    this._host.textContent = '';
    this._host.appendChild(this._wrap);
  }

  /**
   * Engrave bar `bar` (through `options.to` for a range). Resolves to
   * { hits, warnings } when drawn, or null when superseded or failed.
   */
  async render(norm, bar, { to } = {}) {
    const token = ++this._token;
    this.hits = {}; this._states = new Map();
    let built;
    try { built = toMEI(norm, { from: bar, to: to ?? bar }); }
    catch (err) { this._setState('error', err.message); return null; }
    for (const w of built.warnings) console.warn(`[player-staff] ${w}`);

    let tk;
    this._setState('loading', 'Loading notation…');
    try { tk = await loadToolkit(); }
    catch (err) {
      console.error('[player-staff] Verovio failed to load', err);
      if (token === this._token) this._setState('error', 'Notation unavailable (Verovio did not load)');
      return null;
    }
    if (token !== this._token) return null;

    tk.setOptions(PLAYER_OPTIONS);
    if (!tk.loadData(built.mei)) { this._setState('error', `Bar ${bar} could not be engraved`); return null; }
    this._svgHost.innerHTML = tk.renderToSVG(1);
    this._svgHost.setAttribute('aria-label', to != null && to !== bar ? `Staff notation for bars ${bar} to ${to}` : `Staff notation for bar ${bar}`);
    for (const [id, hit] of Object.entries(built.hits)) if (this._svgHost.querySelector(`#${CSS_escape(id)}`)) this.hits[id] = hit;
    this.range = { from: bar, to: to ?? bar };
    this._setState('ready', '');
    return { hits: this.hits, warnings: built.warnings };
  }

  /** Mark one note: 'expected' | 'correct' | 'wrong' | null (clear). Returns false when the id is not drawn. */
  setNoteState(id, state) {
    const el = this._svgHost.querySelector(`#${CSS_escape(id)}`);
    if (!el) return false;
    for (const s of STATES) el.classList.toggle(`pl-note--${s}`, s === state);
    if (state) this._states.set(id, state); else this._states.delete(id);
    return true;
  }

  getNoteState(id) { return this._states.get(id) || null; }

  clearStates() { for (const id of [...this._states.keys()]) this.setNoteState(id, null); }

  /** Drawn note ids in document order, optionally for one bar / hand. */
  noteIds({ bar, hand } = {}) {
    return Object.values(this.hits).filter(h => (bar == null || h.bar === bar) && (hand == null || h.hand === hand)).map(h => h.id);
  }

  clear() {
    this._token++;
    this.hits = {}; this._states = new Map(); this.range = null;
    this._svgHost.innerHTML = '';
    this._setState('empty', '');
  }

  destroy() { this._wrap.remove(); }

  _setState(state, text) {
    this._wrap.dataset.state = state;
    this._status.textContent = text;
  }
}

export { PlayerStaff, PLAYER_OPTIONS };
