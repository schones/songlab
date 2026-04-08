/**
 * intro-audio.js
 * ==============
 * Shared audio utilities for the Tonnetz intro module.
 * Used by ch1-sound.js and future chapter modules.
 *
 * Exports:
 *   CHROMATIC, SALAMANDER_BASE, SAMPLER_URLS
 *   noteFreq(noteName, octave), toAscii(name)
 *   ensureTone(), ensureSampler()
 *   playSamplerNote(note, dur), playSamplerAttack(note), releaseSamplerNote(note)
 *   buildKeyboard(container, startOctave, numOctaves, opts)
 *   injectSharedCSS()
 *   registerCleanup(fn)
 */

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

export const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';

export const SAMPLER_URLS = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3',
};

/** Note definitions for one octave, C through B. */
export const CHROMATIC = [
  { name: 'C',  pc: 0,  isBlack: false },
  { name: 'C♯', pc: 1,  isBlack: true  },
  { name: 'D',  pc: 2,  isBlack: false },
  { name: 'D♯', pc: 3,  isBlack: true  },
  { name: 'E',  pc: 4,  isBlack: false },
  { name: 'F',  pc: 5,  isBlack: false },
  { name: 'F♯', pc: 6,  isBlack: true  },
  { name: 'G',  pc: 7,  isBlack: false },
  { name: 'G♯', pc: 8,  isBlack: true  },
  { name: 'A',  pc: 9,  isBlack: false },
  { name: 'A♯', pc: 10, isBlack: true  },
  { name: 'B',  pc: 11, isBlack: false },
];

/** Interval step patterns. */
export const MAJOR_PATTERN = [2, 2, 1, 2, 2, 2, 1];
export const MINOR_PATTERN = [2, 1, 2, 2, 1, 2, 2];

/**
 * Returns an array of 7 pitch classes for the given root and interval pattern.
 * buildScale(0, MAJOR_PATTERN) → [0, 2, 4, 5, 7, 9, 11]
 */
export function buildScale(rootPc, pattern) {
  const pcs = [];
  let current = rootPc % 12;
  pcs.push(current);
  for (let i = 0; i < pattern.length - 1; i++) {
    current = (current + pattern[i]) % 12;
    pcs.push(current);
  }
  return pcs;
}

/**
 * Returns the triad (root, third, fifth) built from a scale at a given degree
 * by taking every other scale note, wrapping around.
 */
export function buildTriad(scalePCs, degreeIndex) {
  const i = degreeIndex;
  return [scalePCs[i], scalePCs[(i + 2) % 7], scalePCs[(i + 4) % 7]];
}

/**
 * Returns the quality of a triad given three pitch classes.
 * root-to-third: 4 semitones → major; 3 → minor; 3+3 → dim.
 */
export function chordQuality([r, t, f]) {
  const int1 = (t - r + 12) % 12;
  const int2 = (f - t + 12) % 12;
  if (int1 === 3 && int2 === 3) return 'dim';
  if (int1 === 3) return 'minor';
  return 'major';
}

/** Roman numeral labels for the 7 diatonic scale degrees. */
export const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

/** Frequency of a note: A4=440, equal temperament. */
export function noteFreq(noteName, octave) {
  const pc = CHROMATIC.find(n => n.name === noteName)?.pc ?? 0;
  const midi = (octave + 1) * 12 + pc;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert sharp unicode to ASCII for Tone.js (C♯ → C#). */
export function toAscii(name) {
  return name.replace(/♯/g, '#').replace(/♭/g, 'b');
}

// ════════════════════════════════════════════════════════════════════
// AUDIO STATE
// ════════════════════════════════════════════════════════════════════

let _toneStarted = false;
let _toneLoadPromise = null;
let _sampler = null;
let _samplerLoading = false;
let _samplerReady = false;

// ════════════════════════════════════════════════════════════════════
// AUDIO FUNCTIONS
// ════════════════════════════════════════════════════════════════════

/** Ensure Tone.js is available, loading it from CDN if needed. */
function _ensureToneLoaded() {
  if (window.Tone) return Promise.resolve();
  if (_toneLoadPromise) return _toneLoadPromise;
  _toneLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Tone.js'));
    document.head.appendChild(script);
  });
  return _toneLoadPromise;
}

export async function ensureTone() {
  if (_toneStarted) return;
  await _ensureToneLoaded();
  await Tone.start();
  _toneStarted = true;
}

export async function ensureSampler() {
  if (_sampler || _samplerLoading) return;
  await _ensureToneLoaded();
  _samplerLoading = true;
  const vol = new Tone.Volume(-6).toDestination();
  _sampler = new Tone.Sampler({
    urls: SAMPLER_URLS,
    baseUrl: SALAMANDER_BASE,
    release: 1.5,
    onload: () => { _samplerReady = true; },
    onerror: (err) => console.warn('[intro-audio] Sampler load error:', err),
  }).connect(vol);
}

export function playSamplerNote(noteWithOctave, duration) {
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  if (!_samplerReady || !_sampler) return;
  _sampler.triggerAttackRelease(noteWithOctave, duration || '4n', Tone.now());
}

export function playSamplerAttack(noteWithOctave) {
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  if (!_samplerReady || !_sampler) return;
  _sampler.triggerAttack(noteWithOctave, Tone.now());
}

export function releaseSamplerNote(noteWithOctave) {
  if (!_samplerReady || !_sampler) return;
  _sampler.triggerRelease(noteWithOctave, Tone.now() + 0.3);
}

// ════════════════════════════════════════════════════════════════════
// SHARED CSS (injected once)
// ════════════════════════════════════════════════════════════════════

const SHARED_CSS = /* css */ `

/* ── Shared widget styling ─────────────────────────────────── */

.intro-widget {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 16px;
  font-family: var(--font-main, 'Nunito', system-ui, sans-serif);
}

.intro-widget__label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-secondary, #636e72);
  letter-spacing: 0.04em;
}

.intro-freq-display {
  font-size: 1.6rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, #2d3436);
  min-width: 7ch;
  text-align: center;
}

/* ── Keyboard ──────────────────────────────────────────────── */

.intro-kb {
  position: relative;
  display: inline-flex;
  height: var(--intro-kb-h, 130px);
  user-select: none;
  -webkit-user-select: none;
}

.intro-kb-key {
  position: relative;
  border-radius: 0 0 5px 5px;
  box-sizing: border-box;
  transition: background 0.08s, box-shadow 0.08s;
  cursor: grab;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}

.intro-kb-key--white {
  background: var(--keyboard-white-key-bg, #e8e8f0);
  border: 1px solid var(--color-border, #ccc);
  width: var(--intro-kb-ww, 38px);
  height: var(--intro-kb-h, 130px);
  z-index: 1;
}

.intro-kb-key--black {
  background: var(--keyboard-black-key-bg, #1a1a2e);
  border: 1px solid #000;
  width: var(--intro-kb-bw, 24px);
  height: calc(var(--intro-kb-h, 130px) * 0.65);
  margin-left: calc(var(--intro-kb-bw, 24px) / -2);
  margin-right: calc(var(--intro-kb-bw, 24px) / -2);
  z-index: 2;
}

.intro-kb-key--pressed.intro-kb-key--white,
.intro-kb-key--active.intro-kb-key--white {
  background: var(--color-primary, #6c5ce7);
  box-shadow: 0 0 12px rgba(108, 92, 231, 0.5);
}

.intro-kb-key--pressed.intro-kb-key--black,
.intro-kb-key--active.intro-kb-key--black {
  background: var(--color-primary-light, #a29bfe);
  box-shadow: 0 0 12px rgba(108, 92, 231, 0.5);
}

/* Drag-to-play cursor */
.intro-kb--dragging .intro-kb-key {
  cursor: grabbing;
}

/* QWERTY hint label */
.intro-kb-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #b2bec3);
  text-align: center;
  margin-top: 2px;
  letter-spacing: 0.02em;
}

/* Octave highlight (same-note color) */
.intro-kb-key--octave-hl.intro-kb-key--white {
  background: var(--color-secondary, #00cec9);
  box-shadow: inset 0 0 0 2px var(--color-secondary, #00cec9);
}

.intro-kb-key--octave-hl.intro-kb-key--black {
  background: var(--color-secondary-light, #81ecec);
  box-shadow: inset 0 0 0 2px var(--color-secondary-light, #81ecec);
}

/* Pattern highlight (keyboard pattern section) */
.intro-kb-key--pattern-hl.intro-kb-key--white {
  background: var(--color-accent, #fdcb6e);
  box-shadow: inset 0 0 0 2px var(--color-accent-dark, #f39c12);
}

.intro-kb-key--group-2.intro-kb-key--black {
  box-shadow: 0 0 10px rgba(108, 92, 231, 0.6);
}

.intro-kb-key--group-3.intro-kb-key--black {
  box-shadow: 0 0 10px rgba(0, 206, 201, 0.6);
}

.intro-kb-label {
  font-size: 9px;
  font-weight: 700;
  pointer-events: none;
  line-height: 1;
  padding-bottom: 5px;
  opacity: 0;
  transition: opacity 0.12s;
}

.intro-kb-key--white .intro-kb-label {
  color: #555;
}

.intro-kb-key--black .intro-kb-label {
  color: rgba(220, 220, 230, 0.85);
  padding-bottom: 3px;
}

.intro-kb-key--show-label .intro-kb-label,
.intro-kb-key--active .intro-kb-label,
.intro-kb-key--pressed .intro-kb-label,
.intro-kb-key--octave-hl .intro-kb-label,
.intro-kb-key--pattern-hl .intro-kb-label {
  opacity: 1;
}

.intro-kb-key--active .intro-kb-label,
.intro-kb-key--pressed .intro-kb-label {
  color: #fff;
}

.intro-kb-info {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary, #2d3436);
  text-align: center;
  min-height: 1.5em;
}

/* ── Keyboard scroll wrapper ──────────────────────────────── */
.intro-kb-scroll {
  width: 100%;
  max-width: 540px;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 4px 4px;
}

/* ── A4 pulse animation ─────────────────────────────────── */

@keyframes intro-a4-pulse {
  0%, 100% { background: var(--keyboard-white-key-bg, #e8e8f0); box-shadow: none; }
  50% {
    background: color-mix(in srgb, var(--color-primary, #6c5ce7) 25%, var(--keyboard-white-key-bg, #e8e8f0));
    box-shadow: 0 0 10px rgba(108, 92, 231, 0.4);
  }
}

.intro-kb-key--a4-pulse.intro-kb-key--white {
  animation: intro-a4-pulse 1.8s ease-in-out infinite;
}

/* ── Responsive ────────────────────────────────────────────── */

@media (max-width: 480px) {
  .intro-kb-key--white { width: 30px !important; }
  .intro-kb-key--black { width: 20px !important; margin-left: -10px; margin-right: -10px; }
  .intro-kb { height: 110px; }
}
`;

export function injectSharedCSS() {
  if (document.getElementById('intro-audio-styles')) return;
  const el = document.createElement('style');
  el.id = 'intro-audio-styles';
  el.textContent = SHARED_CSS;
  document.head.appendChild(el);
}

// ════════════════════════════════════════════════════════════════════
// KEYBOARD BUILDER
// ════════════════════════════════════════════════════════════════════

/**
 * Build a playable mini-keyboard.
 * @param {HTMLElement} container
 * @param {number} startOctave  e.g. 4
 * @param {number} numOctaves   e.g. 1
 * @param {Object} [opts]
 * @param {Function} [opts.onNoteDown]  (noteName, octave, keyEl) => {}
 * @param {Function} [opts.onNoteUp]    (noteName, octave, keyEl) => {}
 * @param {boolean}  [opts.showLabels]  show note names on all keys
 * @returns {{ el: HTMLElement, keys: Map<string, HTMLElement>, cleanup: Function }}
 */
export function buildKeyboard(container, startOctave, numOctaves, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'intro-kb';

  const keys = new Map(); // "C4" → el
  let pressedKey = null;

  // ── Drag-to-play state ──────────────────────────────────────────
  let _dragging = false;
  let _dragNote = null;

  function _dragPress(noteId, noteName, oct, el) {
    if (_dragNote === noteId) return;
    if (_dragNote) {
      const prevEl = keys.get(_dragNote);
      if (prevEl) prevEl.classList.remove('intro-kb-key--pressed');
      releaseSamplerNote(_dragNote);
      if (opts.onNoteUp) {
        const prev = CHROMATIC.find(n => toAscii(n.name) === _dragNote.slice(0, -1));
        if (prev) opts.onNoteUp(prev.name, parseInt(_dragNote.slice(-1)), prevEl);
      }
    }
    _dragNote = noteId;
    el.classList.add('intro-kb-key--pressed');
    playSamplerAttack(noteId);
    if (opts.onNoteDown) opts.onNoteDown(noteName, oct, el);
  }

  function _dragRelease() {
    if (_dragNote) {
      const el = keys.get(_dragNote);
      if (el) el.classList.remove('intro-kb-key--pressed');
      releaseSamplerNote(_dragNote);
      if (opts.onNoteUp) {
        const noteStr = _dragNote;
        const el2 = keys.get(noteStr);
        const oct = parseInt(noteStr.slice(-1));
        const name = noteStr.slice(0, -1);
        const chromNote = CHROMATIC.find(n => toAscii(n.name) === name);
        if (chromNote && opts.onNoteUp) opts.onNoteUp(chromNote.name, oct, el2);
      }
    }
    _dragging = false;
    _dragNote = null;
    wrap.classList.remove('intro-kb--dragging');
  }

  // Mouse drag handlers on the container
  const onMouseOver = (e) => {
    if (!_dragging) return;
    const keyEl = e.target.closest('.intro-kb-key');
    if (!keyEl) return;
    const noteId = keyEl.dataset.note;
    const noteName = keyEl.dataset.noteName;
    const oct = parseInt(keyEl.dataset.octave);
    _dragPress(noteId, noteName, oct, keyEl);
  };
  wrap.addEventListener('mouseover', onMouseOver);

  // Touch drag: use document-level touchmove + elementFromPoint
  const onTouchMove = (e) => {
    if (!_dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const keyEl = el.closest('.intro-kb-key');
    if (!keyEl || !keys.has(keyEl.dataset.note)) return;
    const noteId = keyEl.dataset.note;
    const noteName = keyEl.dataset.noteName;
    const oct = parseInt(keyEl.dataset.octave);
    _dragPress(noteId, noteName, oct, keyEl);
  };
  document.addEventListener('touchmove', onTouchMove, { passive: false });

  // Global mouseup/touchend to end drag even outside the keyboard
  const onWindowMouseUp = () => {
    if (_dragging) _dragRelease();
  };
  const onWindowTouchEnd = () => {
    if (_dragging) _dragRelease();
  };
  window.addEventListener('mouseup', onWindowMouseUp);
  window.addEventListener('touchend', onWindowTouchEnd);

  for (let oct = startOctave; oct < startOctave + numOctaves; oct++) {
    for (const note of CHROMATIC) {
      const el = document.createElement('div');
      const noteId = `${toAscii(note.name)}${oct}`;
      el.className = `intro-kb-key intro-kb-key--${note.isBlack ? 'black' : 'white'}`;
      if (opts.showLabels) el.classList.add('intro-kb-key--show-label');
      el.dataset.note = noteId;
      el.dataset.noteName = note.name;
      el.dataset.octave = oct;
      el.dataset.pc = note.pc;

      const label = document.createElement('span');
      label.className = 'intro-kb-label';
      label.textContent = note.name;
      el.appendChild(label);

      // Pointer events (click + drag start)
      const down = (e) => {
        e.preventDefault();
        ensureTone();
        ensureSampler();
        _dragging = true;
        _dragNote = null;
        wrap.classList.add('intro-kb--dragging');
        _dragPress(noteId, note.name, oct, el);
        pressedKey = noteId;
      };
      const up = () => {
        if (pressedKey !== noteId) return;
        pressedKey = null;
      };

      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); up(); });

      keys.set(noteId, el);
      wrap.appendChild(el);
    }
  }

  // ── QWERTY keyboard mapping (octave 4) ─────────────────────────
  const QWERTY_MAP = {
    a: `C4`, w: `C#4`, s: `D4`, e: `D#4`, d: `E4`,
    f: `F4`, t: `F#4`, g: `G4`, y: `G#4`, h: `A4`,
    u: `A#4`, j: `B4`,
  };
  const _qwertyHeld = new Set();

  const onKeyDown = (e) => {
    if (e.repeat) return;
    const section = container.closest('.intro-section');
    if (section && !section.classList.contains('intro-section--active')) return;
    const noteId = QWERTY_MAP[e.key.toLowerCase()];
    if (!noteId) return;
    if (_qwertyHeld.has(noteId)) return;
    const el = keys.get(noteId);
    if (!el) return;
    _qwertyHeld.add(noteId);
    ensureTone();
    ensureSampler();
    el.classList.add('intro-kb-key--pressed');
    playSamplerAttack(noteId);
    const noteName = el.dataset.noteName;
    const oct = parseInt(el.dataset.octave);
    if (opts.onNoteDown) opts.onNoteDown(noteName, oct, el);
  };

  const onKeyUp = (e) => {
    const noteId = QWERTY_MAP[e.key.toLowerCase()];
    if (!noteId) return;
    if (!_qwertyHeld.has(noteId)) return;
    _qwertyHeld.delete(noteId);
    const el = keys.get(noteId);
    if (!el) return;
    el.classList.remove('intro-kb-key--pressed');
    releaseSamplerNote(noteId);
    const noteName = el.dataset.noteName;
    const oct = parseInt(el.dataset.octave);
    if (opts.onNoteUp) opts.onNoteUp(noteName, oct, el);
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // ── Hint label ──────────────────────────────────────────────────
  const hint = document.createElement('div');
  hint.className = 'intro-kb-hint intro-widget__label';
  hint.textContent = 'drag across keys or use A S D F G H J to play';
  container.appendChild(wrap);
  container.appendChild(hint);

  return {
    el: wrap,
    keys,
    cleanup: () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('touchend', onWindowTouchEnd);
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// CLEANUP
// ════════════════════════════════════════════════════════════════════

const _cleanupFns = [];

/**
 * Register a cleanup function to run on page unload.
 * Each chapter module calls this once with its own teardown logic.
 */
export function registerCleanup(fn) {
  _cleanupFns.push(fn);
}

function _sharedCleanup() {
  if (_sampler) {
    try { _sampler.releaseAll(); _sampler.dispose(); } catch (_) {}
    _sampler = null;
    _samplerReady = false;
    _samplerLoading = false;
  }
  _cleanupFns.forEach(fn => { try { fn(); } catch (_) {} });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', _sharedCleanup);
  window.addEventListener('pagehide', _sharedCleanup);
}
