/**
 * voicing-keyboard.js
 * ===================
 * Small page-owned keyboard for the Voicing Explorer Analyze page.
 * Colors keys by role — bass (gold), voicing (blue), melody (green) — and
 * labels lit keys with their written spelling. Independent of
 * keyboard-view.js and HarmonyState. Keys are laid out from a white-key
 * unit that grows with the container so the keyboard spans its panel
 * (a ResizeObserver relays them); below the base unit the wrap scrolls.
 *
 * Usage:
 *   const kb = new VoicingKeyboard('vp-keyboard', { low: 'C2', high: 'B5' });
 *   //   options.height     white-key height in px (default 112; black keys keep the 70/112 ratio)
 *   //   options.ariaLabel  the keyboard's aria-label (default 'Keyboard showing the selected bar')
 *   kb.setRange(24, 95);                 // midi or spelled; rebuilds the keys
 *   kb.render({ bass: 'D3', voicing: ['F♯3', 'G3', 'A3', 'D4'], melody: [] });
 *   kb.setHighlight(62);                 // ring one key, or a Set/array of midis; null clears
 *   kb.setPlaying([{ midi, role }]);     // playback follow: only these keys lit, by role; null restores render()
 */

import { parseNote } from './voicing-analysis.js';

const WHITE_W = 28, WHITE_H = 112, BLACK_W = 17, BLACK_H = 70;
const MAX_UNIT = 64;   // widest white key: on a very wide panel the keyboard stops growing and centres
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
/** Horizontal offset of a black key from its left white neighbour, as a fraction of WHITE_W. */
const BLACK_OFFSET = { 1: 0.62, 3: 0.72, 6: 0.60, 8: 0.66, 10: 0.74 };

const ROLE_COLORS = {
  bass:    'var(--accent-gold, #D4A03C)',
  voicing: 'var(--accent-blue-bright, #3A8BC9)',
  melody:  'var(--accent-green, #4CAF50)',
};

const CSS = /* css */ `
.vk-wrap { width: 100%; overflow-x: auto; overflow-y: hidden; }
.vk { position: relative; height: ${WHITE_H}px; user-select: none; margin: 0 auto; }
.vk-key { position: absolute; top: 0; box-sizing: border-box; border-radius: 0 0 4px 4px;
  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px;
  font-family: var(--font-family-base, system-ui, sans-serif); font-size: 10px; line-height: 1;
  transition: background-color 120ms ease, box-shadow 120ms ease; }
.vk-key--white { height: ${WHITE_H}px; background: #ECE8DC; border: 1px solid #2A2620; color: #6B6457; z-index: 1; }
.vk-key--black { height: ${BLACK_H}px; background: #1A1A22; border: 1px solid #0E0E12; color: #C7C2B5; z-index: 2; border-radius: 0 0 3px 3px; }
.vk-key__label { opacity: 0; font-weight: 700; white-space: nowrap; }
.vk-key--octave .vk-key__label { opacity: 0.55; font-weight: 400; }
.vk-key--lit .vk-key__label { opacity: 1; color: #fff; text-shadow: 0 0 2px rgba(0,0,0,0.6); }
.vk-key--bass    { background: ${ROLE_COLORS.bass};    box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
.vk-key--voicing { background: ${ROLE_COLORS.voicing}; box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
.vk-key--melody  { background: ${ROLE_COLORS.melody};  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
.vk-key--black.vk-key--bass    { background: ${ROLE_COLORS.bass}; }
.vk-key--black.vk-key--voicing { background: ${ROLE_COLORS.voicing}; }
.vk-key--black.vk-key--melody  { background: ${ROLE_COLORS.melody}; }
.vk-key--hit { outline: 3px solid #fff; outline-offset: -3px; }
`;

class VoicingKeyboard {
  /**
   * @param {string|Element} container
   * @param {{ low?: string, high?: string, height?: number, ariaLabel?: string }} [options]
   *   low / high: spelled notes with octave; default C2–B5.
   *   height: white-key height in px; omitted = the stylesheet's WHITE_H. ariaLabel: default 'Keyboard showing the selected bar'.
   */
  constructor(container, options = {}) {
    this._container = typeof container === 'string' ? document.getElementById(container) : container;
    const low = parseNote(options.low || 'C2'), high = parseNote(options.high || 'B5');
    this._low = low.midi;
    this._high = high.midi;
    this._height = Number(options.height) > 0 ? Number(options.height) : null;   // null: CSS defaults apply
    this._ariaLabel = options.ariaLabel || 'Keyboard showing the selected bar';
    this._keys = new Map();   // midi → element
    this._roles = {};         // last render() roles, restored after setPlaying(null)
    this._wrap = null;
    this._unit = WHITE_W;     // current white-key width in px
    this._observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this._layout()) : null;

    if (!document.getElementById('vk-styles')) {
      const st = document.createElement('style');
      st.id = 'vk-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this._build();
  }

  /**
   * @param {{ bass?: string|number|null, voicing?: Array<string|number>, melody?: Array<string|number> }} roles
   *   Priority when a pitch has several roles: bass > melody > voicing.
   */
  render(roles = {}) {
    this._roles = roles;
    this._apply(roles);
  }

  /** Rebuild the keys for a new range (midi numbers or spelled notes). Re-applies the last render(). */
  setRange(low, high) {
    const lo = typeof low === 'number' ? low : parseNote(low).midi;
    const hi = typeof high === 'number' ? high : parseNote(high).midi;
    if (lo == null || hi == null || hi < lo) return;
    if (lo === this._low && hi === this._high) return;
    this._low = lo; this._high = hi;
    if (this._wrap) this._wrap.remove();
    this._keys = new Map();
    this._build();
    this._apply(this._roles);
  }

  /**
   * Playback follow: light exactly these keys by role (bass > melody > voicing
   * when a pitch has several); null restores the last render(). Clears rings.
   * @param {Array<{ midi:number, role:string }>|null} sounding
   */
  setPlaying(sounding) {
    if (!sounding) { this._apply(this._roles); return; }
    const roles = { bass: null, voicing: [], melody: [] };
    for (const n of sounding) {
      if (n.role === 'bass') roles.bass = roles.bass == null ? n.midi : Math.min(roles.bass, n.midi);
      else if (n.role === 'melody') roles.melody.push(n.midi);
      else roles.voicing.push(n.midi);
    }
    if (roles.bass != null) for (const n of sounding) if (n.role === 'bass' && n.midi !== roles.bass) roles.voicing.push(n.midi);
    this._apply(roles);
  }

  _apply(roles = {}) {
    for (const el of this._keys.values()) {
      el.classList.remove('vk-key--lit', 'vk-key--bass', 'vk-key--voicing', 'vk-key--melody', 'vk-key--hit');
      const label = el.querySelector('.vk-key__label');
      label.textContent = el.dataset.defaultLabel;
    }
    const apply = (list, role) => {
      for (const n of list || []) {
        const p = parseNote(n);
        if (!p || p.midi == null) continue;
        const el = this._keys.get(p.midi);
        if (!el) continue;
        if (el.classList.contains('vk-key--bass')) continue;
        if (role === 'voicing' && el.classList.contains('vk-key--melody')) continue;
        el.classList.remove('vk-key--voicing', 'vk-key--melody');
        el.classList.add('vk-key--lit', `vk-key--${role}`);
        el.querySelector('.vk-key__label').textContent = p.name;
      }
    };
    apply(roles.bass != null ? [roles.bass] : [], 'bass');
    apply(roles.melody, 'melody');
    apply(roles.voicing, 'voicing');
  }

  clear() { this.render({}); }

  /** Ring keys on top of their role color: one midi, or a Set/array of midis; null clears. Cleared by render(). */
  setHighlight(midis) {
    for (const el of this._keys.values()) el.classList.remove('vk-key--hit');
    if (midis == null) return;
    const list = typeof midis === 'number' || typeof midis === 'string' ? [midis] : [...midis];
    for (const m of list) { const el = this._keys.get(Number(m)); if (el) el.classList.add('vk-key--hit'); }
  }

  destroy() { if (this._observer) this._observer.disconnect(); this._wrap.remove(); }

  /** Lay the keys out from the white-key unit that fills the wrap (never below WHITE_W, never above MAX_UNIT). */
  _layout() {
    if (!this._wrap) return;
    const kb = this._wrap.firstElementChild;
    const whites = Number(kb.dataset.whites) || 1;
    const avail = this._wrap.clientWidth;
    const unit = Math.max(WHITE_W, Math.min(MAX_UNIT, Math.floor(avail / whites)));
    if (unit === this._unit && kb.style.width) return;
    this._unit = unit;
    kb.style.width = `${whites * unit}px`;
    for (const el of this._keys.values()) {
      const black = el.classList.contains('vk-key--black');
      el.style.left = `${Number(el.dataset.slot) * unit}px`;
      el.style.width = `${black ? Math.round(unit * BLACK_W / WHITE_W) : unit}px`;
    }
  }

  // ── internal ────────────────────────────────────────────────────

  _build() {
    this._wrap = document.createElement('div');
    this._wrap.className = 'vk-wrap';
    const kb = document.createElement('div');
    kb.className = 'vk';
    kb.setAttribute('role', 'img');
    kb.setAttribute('aria-label', this._ariaLabel);
    if (this._height) kb.style.height = `${this._height}px`;

    let whiteIdx = 0;
    let whites = 0;
    for (let m = this._low; m <= this._high; m++) if (!BLACK_PCS.has(m % 12)) whites++;
    kb.dataset.whites = String(whites);

    for (let m = this._low; m <= this._high; m++) {
      const pc = m % 12, octave = Math.floor(m / 12) - 1;
      const black = BLACK_PCS.has(pc);
      const el = document.createElement('div');
      el.className = `vk-key vk-key--${black ? 'black' : 'white'}`;
      el.dataset.midi = String(m);
      if (this._height) el.style.height = `${black ? Math.round(this._height * BLACK_H / WHITE_H) : this._height}px`;
      const label = document.createElement('span');
      label.className = 'vk-key__label';
      if (black) {
        el.dataset.slot = String(whiteIdx - 1 + BLACK_OFFSET[pc]);   // position in white-key units; _layout() turns it into px
        el.dataset.defaultLabel = '';
      } else {
        el.dataset.slot = String(whiteIdx);
        if (pc === 0) { el.classList.add('vk-key--octave'); el.dataset.defaultLabel = `C${octave}`; }
        else el.dataset.defaultLabel = '';
        whiteIdx++;
      }
      label.textContent = el.dataset.defaultLabel;
      el.appendChild(label);
      kb.appendChild(el);
      this._keys.set(m, el);
    }
    this._wrap.appendChild(kb);
    this._container.appendChild(this._wrap);
    this._unit = 0;
    this._layout();
    if (this._observer) { this._observer.disconnect(); this._observer.observe(this._wrap); }
  }
}

export { VoicingKeyboard, ROLE_COLORS };

if (typeof window !== 'undefined') {
  window.VoicingKeyboard = VoicingKeyboard;
}
