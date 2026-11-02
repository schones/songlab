/**
 * player-staff.js
 * ===============
 * Grand staff for the follow-along player: one line (a range of bars) of a
 * norm document engraved with Verovio in the page's light frame. The MEI
 * comes from player-staff-model.js; the toolkit is the shared lazy
 * singleton from voicing-staff.js (its options are re-applied here before
 * every render, so the two pages can share one WASM instance).
 *
 * Usage:
 *   const staff = new PlayerStaff('pl-staff');
 *   await staff.render(norm, 1);                 // bar 1; the latest call wins
 *   await staff.render(norm, 5, { to: 8 });      // a line (bars 5–8)
 *   staff.setNoteState('pl-b1-1-0', 'expected'); // 'expected' | 'correct' | 'wrong' | null
 *   staff.clearStates();
 *   staff.setDimmed(ids);                        // the other hand, drawn faint (pl-note--dim); [] clears
 *   staff.setBarMarker(6);                       // faint tint behind bar 6's measure; null clears
 *   staff.hits                                   // { id → { midi, bar, staff, hand, onset, at, tieStop } }
 *   staff.noteIds({ bar, hand })                 // ids in drawing order, optionally filtered
 *   staff.range                                  // { from, to } of the drawn bars, or null
 *
 * States are classes on g.note (pl-note--expected / --correct / --wrong);
 * the CSS colours them blue / green / red, as the keyboard does. pl-note--dim
 * is independent of the state (an unselected hand stays dim whatever happens).
 *
 * Line change: when render() is asked for a different range than the one
 * drawn, the old SVG is cloned into an overlay (pointer-events: none, ids
 * stripped) and slides up and out while the new SVG slides in from below
 * (forward) — or the reverse when paging back. The new SVG is live at once:
 * states, the marker and hit lookups all go to it. prefers-reduced-motion
 * makes it a hard cut. The host keeps its height through the transition
 * (locked, then eased to the new height) so the page does not jump.
 *
 * The SVG is sized by width (width: 100%, height: auto), so the staff fills
 * its panel; a denser line is drawn smaller than a sparser one.
 *
 * No MIDI, no sound, no clicks here: the page wires those.
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

const TRANSITION_MS = 250;            // slide-and-fade on a line change
const TRANSITION_FALLBACK_MS = 400;   // overlay removal when transitionend never fires
const SLIDE = '30%';                  // translateY distance for the out / in SVGs
const MARKER_PAD = 0.12;              // marker rect extends above / below the measure bbox by this fraction of its height
const SVG_NS = 'http://www.w3.org/2000/svg';

const CSS = /* css */ `
.pl-staff-wrap { position: relative; width: 100%; min-height: 200px; --pl-bar-marker: rgba(45, 95, 138, 0.10); }
[data-theme="dark"] .pl-staff-wrap { --pl-bar-marker: rgba(58, 139, 201, 0.22); }
/* The host clips the slide-and-fade; its height is locked by script during a line change. */
.pl-staff-svg { position: relative; overflow: hidden; }
/* Sized by width: a line of bars fills the panel; height follows the viewBox ratio. */
.pl-staff-svg svg { display: block; width: 100%; height: auto; color: var(--text-primary, #141210); fill: currentColor; }
.pl-staff-overlay { position: absolute; top: 0; left: 0; right: 0; pointer-events: none; }
.pl-staff-anim { transition: transform ${TRANSITION_MS}ms ease-out, opacity ${TRANSITION_MS}ms ease-out; }
.pl-staff-svg g.note { transition: color 80ms linear; }
.pl-staff-svg g.note.pl-note--expected { color: var(--accent-blue, #2D5F8A); fill: var(--accent-blue, #2D5F8A); }
.pl-staff-svg g.note.pl-note--correct  { color: var(--accent-green, #1E7B34); fill: var(--accent-green, #1E7B34); }
.pl-staff-svg g.note.pl-note--wrong    { color: var(--accent-coral, #B9341F); fill: var(--accent-coral, #B9341F); }
.pl-staff-svg g.note.pl-note--dim      { opacity: 0.35; }
.pl-staff-svg rect.pl-bar-marker       { fill: var(--pl-bar-marker); stroke: none; }
.pl-staff-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; color: var(--text-muted, #4E4A43); pointer-events: none; }
.pl-staff-wrap[data-state="ready"] .pl-staff-status { display: none; }
.pl-staff-wrap[data-state="loading"] .pl-staff-svg, .pl-staff-wrap[data-state="error"] .pl-staff-svg { opacity: 0.3; }
.pl-staff-wrap[data-state="error"] .pl-staff-status { color: var(--accent-coral, #B9341F); }
`;

const STATES = ['expected', 'correct', 'wrong'];
const CSS_escape = s => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));
const reducedMotion = () => !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

class PlayerStaff {
  /** @param {string|Element} host  the element to fill (its placeholder content is replaced) */
  constructor(host) {
    this._host = typeof host === 'string' ? document.getElementById(host) : host;
    if (!this._host) throw new Error('PlayerStaff: host not found');
    this.hits = {};
    this.range = null;
    this._states = new Map();   // id → state
    this._token = 0;
    this._svg = null;           // the live SVG (the overlay's clone is never queried)
    this._overlay = null;       // the outgoing SVG during a line change
    this._overlayTimer = 0;
    this._markerBar = null;

    if (!document.getElementById('pl-staff-styles')) {
      const st = document.createElement('style');
      st.id = 'pl-staff-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this._wrap = document.createElement('div');
    this._wrap.className = 'pl-staff-wrap';
    this._wrap.dataset.state = 'empty';
    this._wrap.innerHTML = '<div class="pl-staff-svg" role="img" aria-label="Staff notation for the current line"></div><div class="pl-staff-status"></div>';
    this._svgHost = this._wrap.querySelector('.pl-staff-svg');
    this._status = this._wrap.querySelector('.pl-staff-status');
    this._host.textContent = '';
    this._host.appendChild(this._wrap);
  }

  /**
   * Engrave bar `bar` (through `options.to` for a range). Resolves to
   * { hits, warnings } when drawn, or null when superseded or failed. A
   * different range than the drawn one plays the slide-and-fade transition.
   */
  async render(norm, bar, { to } = {}) {
    const token = ++this._token;
    const last = to ?? bar;
    this.hits = {}; this._states = new Map(); this._markerBar = null;
    let built;
    try { built = toMEI(norm, { from: bar, to: last }); }
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
    if (!tk.loadData(built.mei)) { this._setState('error', `Bar${last !== bar ? `s ${bar}–${last}` : ` ${bar}`} could not be engraved`); return null; }
    this._swapSvg(tk.renderToSVG(1), bar, last);
    this._svgHost.setAttribute('aria-label', last !== bar ? `Staff notation for bars ${bar} to ${last}` : `Staff notation for bar ${bar}`);
    for (const [id, hit] of Object.entries(built.hits)) if (this._find(id)) this.hits[id] = hit;
    this.range = { from: bar, to: last };
    this._setState('ready', '');
    return { hits: this.hits, warnings: built.warnings };
  }

  /** Mark one note: 'expected' | 'correct' | 'wrong' | null (clear). Returns false when the id is not drawn. */
  setNoteState(id, state) {
    const el = this._find(id);
    if (!el) return false;
    for (const s of STATES) el.classList.toggle(`pl-note--${s}`, s === state);
    if (state) this._states.set(id, state); else this._states.delete(id);
    return true;
  }

  getNoteState(id) { return this._states.get(id) || null; }

  clearStates() { for (const id of [...this._states.keys()]) this.setNoteState(id, null); }

  /** Draw exactly these notes faint (pl-note--dim); orthogonal to setNoteState. */
  setDimmed(ids) {
    const want = new Set(ids || []);
    if (!this._svg) return;
    for (const el of this._svg.querySelectorAll('g.note.pl-note--dim')) if (!want.has(el.id)) el.classList.remove('pl-note--dim');
    for (const id of want) { const el = this._find(id); if (el) el.classList.add('pl-note--dim'); }
  }

  /** Drawn note ids in document order, optionally for one bar / hand. */
  noteIds({ bar, hand } = {}) {
    return Object.values(this.hits).filter(h => (bar == null || h.bar === bar) && (hand == null || h.hand === hand)).map(h => h.id);
  }

  /**
   * Faint tinted rectangle behind the measure that holds `bar` (found through
   * one of the bar's drawn notes → g.measure → getBBox; inserted as the
   * measure's first child so it paints under everything). null clears. A
   * bar with no drawn notes gets no marker. Returns true when a marker shows.
   */
  setBarMarker(bar) {
    if (!this._svg) return false;
    if (bar != null && bar === this._markerBar && this._svg.querySelector('rect.pl-bar-marker')) return true;
    for (const r of this._svg.querySelectorAll('rect.pl-bar-marker')) r.remove();
    this._markerBar = null;
    if (bar == null) return false;
    let measure = null;
    for (const id of this.noteIds({ bar })) {
      const el = this._find(id);
      measure = el && el.closest('g.measure');
      if (measure) break;
    }
    if (!measure) return false;
    let box;
    try { box = measure.getBBox(); } catch (_) { return false; }   // not rendered (display: none)
    if (!box || !(box.width > 0) || !(box.height > 0)) return false;
    const pad = box.height * MARKER_PAD;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'pl-bar-marker');
    rect.setAttribute('x', String(box.x));
    rect.setAttribute('y', String(box.y - pad));
    rect.setAttribute('width', String(box.width));
    rect.setAttribute('height', String(box.height + 2 * pad));
    measure.insertBefore(rect, measure.firstChild);
    this._markerBar = bar;
    return true;
  }

  clear() {
    this._token++;
    this.hits = {}; this._states = new Map(); this.range = null; this._markerBar = null;
    this._endTransition();
    this._svgHost.innerHTML = '';
    this._svg = null;
    this._setState('empty', '');
  }

  destroy() { this._endTransition(); this._wrap.remove(); }

  _find(id) { return this._svg ? this._svg.querySelector(`#${CSS_escape(id)}`) : null; }

  _setState(state, text) {
    this._wrap.dataset.state = state;
    this._status.textContent = text;
  }

  /**
   * Put the new SVG in the host. When a different range than `this.range`
   * was drawn (and motion is allowed), the old SVG is cloned into an overlay
   * that slides out while the new one slides in; forward when `from` is
   * past the old range's start, backward otherwise.
   */
  _swapSvg(html, from, to) {
    const host = this._svgHost;
    const old = this._svg;
    const prev = this.range;
    const animate = !!(old && prev && (from !== prev.from || to !== prev.to) && !reducedMotion());
    this._endTransition();   // a transition still running ends now: its overlay goes first

    let overlay = null;
    let oldHeight = 0;
    if (animate) {
      oldHeight = host.getBoundingClientRect().height;
      overlay = document.createElement('div');
      overlay.className = 'pl-staff-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      const clone = old.cloneNode(true);
      clone.removeAttribute('id');
      for (const el of clone.querySelectorAll('[id]')) if (!el.closest('defs')) el.removeAttribute('id');   // glyph <symbol>s keep theirs for the <use>s
      overlay.appendChild(clone);
    }

    host.innerHTML = html;
    this._svg = host.querySelector('svg');
    if (!animate || !this._svg) return;

    const svg = this._svg;
    const forward = from > prev.from;
    host.appendChild(overlay);   // after the live SVG, so it paints on top
    this._overlay = overlay;

    // Start positions (no transition), then force layout, then the end positions with the transition on.
    host.style.transition = 'none';
    host.style.height = `${oldHeight}px`;
    svg.style.transform = `translateY(${forward ? '' : '-'}${SLIDE})`;
    svg.style.opacity = '0';
    overlay.style.transform = 'translateY(0)';
    overlay.style.opacity = '1';
    const newHeight = svg.getBoundingClientRect().height;   // forces layout; transforms do not change it

    host.style.transition = `height ${TRANSITION_MS}ms ease-out`;
    host.style.height = `${newHeight}px`;
    svg.classList.add('pl-staff-anim');
    overlay.classList.add('pl-staff-anim');
    svg.style.transform = 'translateY(0)';
    svg.style.opacity = '1';
    overlay.style.transform = `translateY(${forward ? '-' : ''}${SLIDE})`;
    overlay.style.opacity = '0';

    const finish = () => { if (this._overlay === overlay) this._endTransition(); };
    overlay.addEventListener('transitionend', finish, { once: true });
    this._overlayTimer = setTimeout(finish, TRANSITION_FALLBACK_MS);
  }

  /** Remove the outgoing overlay and the transition styles; the live SVG and host return to their natural layout. */
  _endTransition() {
    if (this._overlayTimer) { clearTimeout(this._overlayTimer); this._overlayTimer = 0; }
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    const host = this._svgHost;
    host.style.transition = ''; host.style.height = '';
    const svg = this._svg;
    if (svg) { svg.classList.remove('pl-staff-anim'); svg.style.transform = ''; svg.style.opacity = ''; }
  }
}

export { PlayerStaff, PLAYER_OPTIONS };
