/**
 * voicing-keyboard.js
 * ===================
 * Small page-owned keyboard for the Voicing Explorer Analyze page.
 * Colors keys by role — bass (gold), voicing (blue), melody (green,
 * reserved for Session 5) — and labels lit keys with their written
 * spelling. Independent of keyboard-view.js and HarmonyState.
 *
 * Usage:
 *   const kb = new VoicingKeyboard('vp-keyboard', { low: 'C2', high: 'B5' });
 *   kb.render({ bass: 'D3', voicing: ['F♯3', 'G3', 'A3', 'D4'], melody: [] });
 */

import { parseNote } from './voicing-analysis.js';

const WHITE_W = 28, WHITE_H = 112, BLACK_W = 17, BLACK_H = 70;
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
.vk { position: relative; height: ${WHITE_H}px; user-select: none; }
.vk-key { position: absolute; top: 0; box-sizing: border-box; border-radius: 0 0 4px 4px;
  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px;
  font-family: var(--font-family-base, system-ui, sans-serif); font-size: 10px; line-height: 1;
  transition: background-color 120ms ease, box-shadow 120ms ease; }
.vk-key--white { width: ${WHITE_W}px; height: ${WHITE_H}px; background: #ECE8DC; border: 1px solid #2A2620; color: #6B6457; z-index: 1; }
.vk-key--black { width: ${BLACK_W}px; height: ${BLACK_H}px; background: #1A1A22; border: 1px solid #0E0E12; color: #C7C2B5; z-index: 2; border-radius: 0 0 3px 3px; }
.vk-key__label { opacity: 0; font-weight: 700; white-space: nowrap; }
.vk-key--octave .vk-key__label { opacity: 0.55; font-weight: 400; }
.vk-key--lit .vk-key__label { opacity: 1; color: #fff; text-shadow: 0 0 2px rgba(0,0,0,0.6); }
.vk-key--bass    { background: ${ROLE_COLORS.bass};    box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
.vk-key--voicing { background: ${ROLE_COLORS.voicing}; box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
.vk-key--melody  { background: ${ROLE_COLORS.melody};  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
.vk-key--black.vk-key--bass    { background: ${ROLE_COLORS.bass}; }
.vk-key--black.vk-key--voicing { background: ${ROLE_COLORS.voicing}; }
.vk-key--black.vk-key--melody  { background: ${ROLE_COLORS.melody}; }
`;

class VoicingKeyboard {
  /**
   * @param {string|Element} container
   * @param {{ low?: string, high?: string }} [options]  Spelled notes with octave; default C2–B5.
   */
  constructor(container, options = {}) {
    this._container = typeof container === 'string' ? document.getElementById(container) : container;
    const low = parseNote(options.low || 'C2'), high = parseNote(options.high || 'B5');
    this._low = low.midi;
    this._high = high.midi;
    this._keys = new Map();   // midi → element

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
    for (const el of this._keys.values()) {
      el.classList.remove('vk-key--lit', 'vk-key--bass', 'vk-key--voicing', 'vk-key--melody');
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

  destroy() { this._wrap.remove(); }

  // ── internal ────────────────────────────────────────────────────

  _build() {
    this._wrap = document.createElement('div');
    this._wrap.className = 'vk-wrap';
    const kb = document.createElement('div');
    kb.className = 'vk';
    kb.setAttribute('role', 'img');
    kb.setAttribute('aria-label', 'Keyboard showing the selected bar');

    let whiteIdx = 0;
    let whites = 0;
    for (let m = this._low; m <= this._high; m++) if (!BLACK_PCS.has(m % 12)) whites++;
    kb.style.width = `${whites * WHITE_W}px`;

    for (let m = this._low; m <= this._high; m++) {
      const pc = m % 12, octave = Math.floor(m / 12) - 1;
      const black = BLACK_PCS.has(pc);
      const el = document.createElement('div');
      el.className = `vk-key vk-key--${black ? 'black' : 'white'}`;
      el.dataset.midi = String(m);
      const label = document.createElement('span');
      label.className = 'vk-key__label';
      if (black) {
        const leftWhiteIdx = whiteIdx - 1;
        el.style.left = `${(leftWhiteIdx + BLACK_OFFSET[pc]) * WHITE_W}px`;
        el.dataset.defaultLabel = '';
      } else {
        el.style.left = `${whiteIdx * WHITE_W}px`;
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
  }
}

export { VoicingKeyboard, ROLE_COLORS };

if (typeof window !== 'undefined') {
  window.VoicingKeyboard = VoicingKeyboard;
}
