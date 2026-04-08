/**
 * keyboard-view.js
 * ================
 * Lightweight piano keyboard with a HarmonyState-driven highlight layer.
 * Renders an adjustable range of DOM-based piano keys and optionally plays
 * notes via Tone.js Sampler (Salamander Grand Piano samples).
 *
 * Pure rendering module — game logic lives elsewhere.
 *
 * Consumed by:
 *   - relative_key_trainer  → linked keyboard visualization
 *   - harmony_trainer       → interval highlight feedback
 *   - integration test page → linked component demo
 *
 * Depends on:
 *   - transforms.js   → noteToPC, pcToNote
 *   - harmony-state.js → HarmonyState
 *   - Tone.js          → Sampler (loaded from CDN or bundled by consumer)
 *
 * Exposes: window.KeyboardView  (also ES-module export)
 */

import { noteToPC, pcToNote } from './transforms.js';
import { HarmonyState } from './harmony-state.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const WHITE_W = 40;   // white key width, px
const WHITE_H = 150;  // white key height, px
const BLACK_W = 24;   // black key width, px
const BLACK_H = 100;  // black key height, px

/** Pitch class → is black key? */
const BLACK_PCS = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

/** Ordered pitch classes within one octave (C=0 … B=11). */
const OCTAVE_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Salamander sample mapping (same URLs as Skratch Studio AudioBridge). */
const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLER_URLS = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3',
};

// ════════════════════════════════════════════════════════════════════
// NOTE RANGE HELPERS
// ════════════════════════════════════════════════════════════════════

/** Parse "C3" → { pc: 0, octave: 3, midi: 48 } */
function _parseNote(noteStr) {
  const m = noteStr.match(/^([A-Ga-g][#♯b♭]?)(\d)$/);
  if (!m) return null;
  const pc = noteToPC(m[1]);
  const octave = parseInt(m[2], 10);
  return { pc, octave, midi: octave * 12 + pc + 12 };
}

/** MIDI number → { pc, octave, noteName, noteWithOctave, isBlack } */
function _midiToInfo(midi) {
  const pc = (midi - 12) % 12;
  const octave = Math.floor((midi - 12) / 12);
  const noteName = pcToNote(pc);        // uses sharps (C♯, D♯…)
  const asciiName = noteName.replace(/♯/g, '#').replace(/♭/g, 'b');
  return {
    pc,
    octave,
    noteName,
    noteWithOctave: `${asciiName}${octave}`,
    isBlack: BLACK_PCS.has(pc),
  };
}

/** Build the ordered key list for a MIDI range [lowMidi, highMidi]. */
function _buildKeys(lowMidi, highMidi) {
  const keys = [];
  for (let midi = lowMidi; midi <= highMidi; midi++) {
    keys.push(_midiToInfo(midi));
  }
  return keys;
}

// ════════════════════════════════════════════════════════════════════
// CSS (injected once, same pattern as tonnetz-neighborhood.js)
// ════════════════════════════════════════════════════════════════════

const KV_CSS = /* css */ `

/* ── Container ───────────────────────────────────────────── */

.kv-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-family: var(--font-family, system-ui, -apple-system, sans-serif);
  user-select: none;
  -webkit-user-select: none;
}

/* ── Keyboard row ────────────────────────────────────────── */

.kv-keyboard {
  position: relative;
  display: flex;
  height: var(--keyboard-white-key-h, ${WHITE_H}px);
}

/* ── Keys ────────────────────────────────────────────────── */

.kv-key {
  position: relative;
  border-radius: 0 0 var(--radius-sm, 4px) var(--radius-sm, 4px);
  transition: background 0.1s, box-shadow 0.1s;
  box-sizing: border-box;
  flex-shrink: 0;
}

.kv-key--white {
  background: var(--keyboard-white-key-bg, #e8e8f0);
  border: 1px solid var(--color-border, #ccc);
  width: var(--keyboard-white-key-w, ${WHITE_W}px);
  height: var(--keyboard-white-key-h, ${WHITE_H}px);
  z-index: 1;
}

.kv-key--black {
  background: var(--keyboard-black-key-bg, #1a1a2e);
  border: 1px solid #000;
  width: var(--keyboard-black-key-w, ${BLACK_W}px);
  height: var(--keyboard-black-key-h, ${BLACK_H}px);
  margin-left: calc(var(--keyboard-black-key-w, ${BLACK_W}px) / -2);
  margin-right: calc(var(--keyboard-black-key-w, ${BLACK_W}px) / -2);
  z-index: 2;
}

/* ── Clickable states ────────────────────────────────────── */

.kv-keyboard--input .kv-key,
.kv-keyboard--both .kv-key {
  cursor: pointer;
}
.kv-keyboard--display .kv-key {
  cursor: default;
  pointer-events: none;
}

.kv-key--pressed.kv-key--white {
  background: var(--color-primary, #6c5ce7);
  box-shadow: 0 0 10px var(--color-primary, #6c5ce7);
}
.kv-key--pressed.kv-key--black {
  background: var(--color-primary, #6c5ce7);
  box-shadow: 0 0 10px var(--color-primary, #6c5ce7);
}

/* ── Highlight sources ───────────────────────────────────── */

.kv-key--triad.kv-key--white {
  background: var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7));
  box-shadow: inset 0 0 0 2px var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7));
}
.kv-key--triad.kv-key--black {
  background: var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7));
  box-shadow: inset 0 0 0 2px var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7));
}

.kv-key--interval.kv-key--white {
  background: var(--keyboard-highlight-secondary, var(--color-secondary, #00cec9));
  box-shadow: inset 0 0 0 2px var(--keyboard-highlight-secondary, var(--color-secondary, #00cec9));
}
.kv-key--interval.kv-key--black {
  background: var(--keyboard-highlight-secondary, var(--color-secondary, #00cec9));
  box-shadow: inset 0 0 0 2px var(--keyboard-highlight-secondary, var(--color-secondary, #00cec9));
}

.kv-key--scale.kv-key--white {
  background: color-mix(in srgb, var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7)) 20%, var(--keyboard-white-key-bg, #e8e8f0));
}
.kv-key--scale.kv-key--black {
  background: color-mix(in srgb, var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7)) 25%, var(--keyboard-black-key-bg, #1a1a2e));
}

.kv-key--user.kv-key--white {
  box-shadow: inset 0 0 0 3px var(--color-primary, #6c5ce7);
}
.kv-key--user.kv-key--black {
  box-shadow: inset 0 0 0 3px var(--color-primary, #6c5ce7);
}

/* ── Ghost key (moving tone old position) ────────────────── */

.kv-key--ghost.kv-key--white {
  background: var(--keyboard-ghost, rgba(180, 180, 180, 0.4));
  box-shadow: inset 0 0 0 2px var(--keyboard-ghost, rgba(180, 180, 180, 0.6));
  opacity: 0.55;
}
.kv-key--ghost.kv-key--black {
  background: var(--keyboard-ghost, rgba(120, 120, 140, 0.5));
  box-shadow: inset 0 0 0 2px var(--keyboard-ghost, rgba(120, 120, 140, 0.6));
  opacity: 0.55;
}

/* ── Moving-tone emphasis (new position) ─────────────────── */

.kv-key--moving.kv-key--white {
  background: #E8913A;
  box-shadow: 0 0 14px #E8913A;
  animation: kv-glow 1s ease-in-out infinite alternate;
}
.kv-key--moving.kv-key--black {
  background: #E8913A;
  box-shadow: 0 0 14px #E8913A;
  animation: kv-glow 1s ease-in-out infinite alternate;
}

/* ── Common-tone dot ─────────────────────────────────────── */

.kv-common-dot {
  display: none;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 50%;
  background: #4A90D9;
  border: 1.5px solid #fff;
  pointer-events: none;
  z-index: 3;
}
.kv-key--white .kv-common-dot {
  width: 10px;
  height: 10px;
  bottom: 24px;
}
.kv-key--black .kv-common-dot {
  width: 8px;
  height: 8px;
  bottom: 14px;
}
.kv-key--common-tone .kv-common-dot {
  display: block;
}

/* ── Note name label ─────────────────────────────────────── */

.kv-note-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 600;
  pointer-events: none;
  line-height: 1;
  white-space: nowrap;
}
.kv-key--white .kv-note-label {
  color: var(--keyboard-label-color, #555);
}
.kv-key--black .kv-note-label {
  color: rgba(200, 200, 210, 0.8);
}
.kv-key--triad .kv-note-label,
.kv-key--interval .kv-note-label,
.kv-key--pressed .kv-note-label {
  color: #fff;
}

/* ── Chord / interval info label ─────────────────────────── */

.kv-info-label {
  font-size: var(--font-size-sm, 14px);
  font-weight: 700;
  color: var(--keyboard-label-color, var(--color-text, #333));
  text-align: center;
  min-height: 1.4em;
}

/* ── Animations ──────────────────────────────────────────── */

@keyframes kv-glow {
  from { box-shadow: 0 0 8px  #E8913A; }
  to   { box-shadow: 0 0 18px #E8913A; }
}

/* ── Progression common-tone pulse (gold flash, 500ms fade) ── */

.kv-key--prog-common-tone.kv-key--white {
  animation: kv-prog-pulse 0.5s ease-out forwards;
}
.kv-key--prog-common-tone.kv-key--black {
  animation: kv-prog-pulse-black 0.5s ease-out forwards;
}

@keyframes kv-prog-pulse {
  0%   { background: #fbbf24; box-shadow: 0 0 14px #fbbf24; }
  100% { background: var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7));
         box-shadow: inset 0 0 0 2px var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7)); }
}
@keyframes kv-prog-pulse-black {
  0%   { background: #fbbf24; box-shadow: 0 0 14px #fbbf24; }
  100% { background: var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7));
         box-shadow: inset 0 0 0 2px var(--keyboard-highlight-primary, var(--color-primary, #6c5ce7)); }
}

@media (prefers-reduced-motion: reduce) {
  .kv-key--moving { animation: none; }
  .kv-key--prog-common-tone { animation: none; }
}
`;

// ════════════════════════════════════════════════════════════════════
// INSTRUMENT ENGINE (multi-instrument, lazy load)
// ════════════════════════════════════════════════════════════════════

/**
 * Notes to sample when loading a soundfont — spaced every minor 3rd so
 * Tone.Sampler can pitch-shift to fill the gaps while keeping the
 * download small (~17 samples).
 */
const _SF_SUBSET = [
  'C2', 'Eb2', 'Gb2', 'A2',
  'C3', 'Eb3', 'Gb3', 'A3',
  'C4', 'Eb4', 'Gb4', 'A4',
  'C5', 'Eb5', 'Gb5', 'A5',
  'C6',
];

/** Enharmonic flat→sharp map for notes used in our subset. */
const _FLAT_TO_SHARP = { Eb: 'D#', Gb: 'F#' };

const MUSYNGKITE_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/';

/**
 * Available voice soundfonts — keys are soundfont filenames (without the -mp3.js
 * suffix), values are human-readable display labels used by the UI.
 * Both are served from MUSYNGKITE_BASE; no other URL config is needed.
 */
const VOICE_TYPES = {
  choir_aahs: 'Choir',
  voice_oohs: 'Oohs',
};

/**
 * Per-instrument state records.
 *   state: 'unloaded' | 'loading' | 'loaded' | 'error'
 *   _promise: in-flight load promise (prevents duplicate fetches)
 */
const _instState = {
  piano:  { sampler: null, volume: null, state: 'unloaded', _promise: null },
  guitar: { sampler: null, volume: null, state: 'unloaded', _promise: null },
  voice:  { sampler: null, volume: null, state: 'unloaded', _promise: null, sfName: 'choir_aahs' },
};

let _activeInst = 'piano';

// ── Active sampler lookup ──────────────────────────────────────────

/** Return the currently active Tone.Sampler, or fall back to piano, or null. */
function _getActiveSampler() {
  const inst = _instState[_activeInst];
  if (inst?.state === 'loaded') return inst.sampler;
  // While the chosen instrument is still loading, fall back to piano if available
  const piano = _instState.piano;
  return piano.state === 'loaded' ? piano.sampler : null;
}

// ── Piano (Salamander) ─────────────────────────────────────────────

function _ensurePiano() {
  const inst = _instState.piano;
  if (inst._promise) return inst._promise;
  if (typeof Tone === 'undefined') {
    console.warn('[KeyboardView] Tone.js not loaded — audio playback disabled');
    inst.state = 'error';
    return Promise.reject(new Error('Tone.js not loaded'));
  }
  inst.state = 'loading';
  inst._promise = new Promise((resolve, reject) => {
    inst.volume = new Tone.Volume(-6).toDestination();
    inst.sampler = new Tone.Sampler({
      urls: SAMPLER_URLS,
      baseUrl: SALAMANDER_BASE,
      onload: () => { inst.state = 'loaded'; resolve(inst.sampler); },
      onerror: (err) => { inst.state = 'error'; reject(err); },
    }).connect(inst.volume);
  });
  return inst._promise;
}

// ── Voice / choir (MusyngKite soundfont) ──────────────────────────

/**
 * Fetch a MusyngKite soundfont JS file, parse the embedded base-64 data URIs,
 * pick a sparse subset of notes, and return a Tone.Sampler wired to the
 * same volume node chain.
 */
async function _loadSoundfontSampler(sfName) {
  const url = `${MUSYNGKITE_BASE}${sfName}-mp3.js`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`[KeyboardView] Soundfont fetch failed (${resp.status}): ${url}`);
  const text = await resp.text();

  // File format: `MIDI.Soundfont.xxx = { "C2": "data:audio/mp3;base64,...", ... };`
  // Anchored to the assignment line to avoid matching the `=== 'undefined'` guard clauses.
  const sfMatch = /MIDI\.Soundfont\.\w+\s*=\s*(\{[\s\S]+\})\s*;?\s*$/.exec(text);
  if (!sfMatch) throw new Error(`[KeyboardView] Unexpected soundfont format: ${sfName}`);
  // Use Function constructor instead of JSON.parse: soundfont files are JS object
  // literals (not strict JSON) and may contain trailing commas after the last entry.
  // This is safe because the source is the known CDN gleitz.github.io/midi-js-soundfonts,
  // not user input.
  // eslint-disable-next-line no-new-func
  const allNotes = new Function('return ' + sfMatch[1])();

  // Build URL subset — try flat name first, then sharp enharmonic equivalent
  const urls = {};
  for (const target of _SF_SUBSET) {
    const m = target.match(/^([A-G][b#]?)(\d)$/);
    if (!m) continue;
    const [, notePart, oct] = m;
    const altPart = _FLAT_TO_SHARP[notePart];   // e.g. 'Eb' → 'D#'
    if (allNotes[target]) {
      urls[target] = allNotes[target];
    } else if (altPart && allNotes[altPart + oct]) {
      urls[altPart + oct] = allNotes[altPart + oct];
    }
  }

  return new Promise((resolve, reject) => {
    const vol = new Tone.Volume(-6).toDestination();
    const s = new Tone.Sampler({
      urls,
      release: 1.2,
      onload: () => resolve({ sampler: s, volume: vol }),
      onerror: reject,
    }).connect(vol);
  });
}

function _ensureVoice() {
  const inst = _instState.voice;
  if (inst._promise) return inst._promise;
  if (typeof Tone === 'undefined') {
    inst.state = 'error';
    return Promise.reject(new Error('Tone.js not loaded'));
  }
  inst.state = 'loading';
  inst._promise = _loadSoundfontSampler(inst.sfName)
    .then(({ sampler, volume }) => {
      inst.sampler = sampler;
      inst.volume = volume;
      inst.state = 'loaded';
      return sampler;
    })
    .catch(err => {
      inst.state = 'error';
      inst._promise = null;   // allow retry on next setInstrument('voice') call
      throw err;
    });
  return inst._promise;
}

// ── Guitar (MusyngKite acoustic_guitar_steel soundfont) ───────────

function _ensureGuitar() {
  const inst = _instState.guitar;
  if (inst._promise) return inst._promise;
  if (typeof Tone === 'undefined') {
    inst.state = 'error';
    return Promise.reject(new Error('Tone.js not loaded'));
  }
  inst.state = 'loading';
  inst._promise = _loadSoundfontSampler('acoustic_guitar_steel')
    .then(({ sampler, volume }) => {
      inst.sampler = sampler;
      inst.volume = volume;
      inst.state = 'loaded';
      return sampler;
    })
    .catch(err => {
      inst.state = 'error';
      inst._promise = null;   // allow retry on next setInstrument('guitar') call
      throw err;
    });
  return inst._promise;
}

// ── Smart proxy ────────────────────────────────────────────────────

/**
 * Returned by getSampler() so existing callers (e.g. relative-key-trainer.js)
 * automatically route through whichever instrument is currently active,
 * without any changes on their end.
 */
const _samplerProxy = {
  triggerAttack(notes, time, velocity) {
    const s = _getActiveSampler();
    if (s) s.triggerAttack(notes, time, velocity);
  },
  triggerRelease(notes, time) {
    const s = _getActiveSampler();
    if (s) s.triggerRelease(notes, time);
  },
  triggerAttackRelease(notes, dur, time, velocity) {
    const s = _getActiveSampler();
    if (s) s.triggerAttackRelease(notes, dur, time, velocity);
  },
  releaseAll() {
    const s = _getActiveSampler();
    if (s) s.releaseAll();
  },
  get volume() {
    return _instState[_activeInst].volume;
  },
};

// ── Internal note helpers ──────────────────────────────────────────

function _playNote(noteWithOctave) {
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  const s = _getActiveSampler();
  if (!s) return;
  if (Tone.context.state !== 'running') Tone.start();
  s.triggerAttack(noteWithOctave, Tone.now());
}

function _stopNote(noteWithOctave) {
  const s = _getActiveSampler();
  if (!s) return;
  s.triggerRelease(noteWithOctave, Tone.now() + 0.1);
}

function _destroyAllSamplers() {
  for (const inst of Object.values(_instState)) {
    if (inst.sampler) {
      try { inst.sampler.releaseAll(); inst.sampler.dispose(); } catch (_) { }
      inst.sampler = null;
    }
    if (inst.volume) {
      try { inst.volume.dispose(); } catch (_) { }
      inst.volume = null;
    }
    inst.state = 'unloaded';
    inst._promise = null;
  }
  _activeInst = 'piano';
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════

const KeyboardView = {
  _container: null,
  _wrapEl: null,
  _keyboardEl: null,
  _infoLabelEl: null,
  _unsub: null,
  _opts: {},
  _keys: [],
  _keyEls: {},          // noteWithOctave → DOM element
  _lowMidi: 48,         // C3
  _highMidi: 83,        // B5
  _pressedKey: null,

  /**
   * Create the keyboard, subscribe to HarmonyState, do initial render.
   *
   * @param {string} containerId  ID of a <div> to render keyboard into
   * @param {Object} [options]
   * @param {{ low: string, high: string }} [options.range]
   *    Override HarmonyState.keyboardRange. E.g. { low: "C3", high: "B5" }
   * @param {string} [options.mode]  Override HarmonyState.keyboardMode
   * @param {boolean} [options.showLabels]  Override annotations.showNoteNames
   * @param {Function} [options.onNotePlay]  (note, octave) => {}
   */
  init(containerId, options) {
    options = options || {};
    if (this._wrapEl) this.destroy();

    this._opts = options;
    this._container = document.getElementById(containerId);
    if (!this._container) {
      console.error(`[KeyboardView] Container #${containerId} not found`);
      return;
    }

    // Inject CSS once
    if (!document.getElementById('kv-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'kv-styles';
      styleEl.textContent = KV_CSS;
      document.head.appendChild(styleEl);
    }

    // Determine range
    const stState = HarmonyState.get();
    const rangeSrc = options.range || stState.keyboardRange || { low: 'C3', high: 'B5' };
    const low = _parseNote(rangeSrc.low);
    const high = _parseNote(rangeSrc.high);
    this._lowMidi = low ? low.midi : 48;
    this._highMidi = high ? high.midi : 83;

    // Build keys
    this._keys = _buildKeys(this._lowMidi, this._highMidi);

    // Init sampler if mode needs audio
    const mode = options.mode || stState.keyboardMode || 'display';
    if (mode === 'input' || mode === 'both') {
      _ensurePiano();
    }

    // Build DOM
    this._buildDOM(mode, stState);

    // Subscribe
    this._unsub = HarmonyState.on((st) => this.render(st));
  },

  /**
   * Change visible range and re-render.
   */
  setRange(low, high) {
    const l = _parseNote(low);
    const h = _parseNote(high);
    if (!l || !h) return;
    this._lowMidi = l.midi;
    this._highMidi = h.midi;
    this._keys = _buildKeys(this._lowMidi, this._highMidi);

    // Rebuild DOM
    const state = HarmonyState.get();
    const mode = this._opts.mode || state.keyboardMode || 'display';
    if (this._keyboardEl) {
      this._keyboardEl.remove();
      this._keyboardEl = null;
    }
    this._keyEls = {};
    this._buildKeyboard(mode);
    this._wrapEl.insertBefore(this._keyboardEl, this._infoLabelEl);
    this.render(state);
  },

  /**
   * Full re-render from a HarmonyState snapshot.
   */
  render(state) {
    if (!this._wrapEl) return;

    const ann = state.annotations || {};
    const mode = this._opts.mode || state.keyboardMode || 'display';

    // ── Update mode class ──────────────────────────────────────
    this._keyboardEl.className = `kv-keyboard kv-keyboard--${mode}`;

    // Ensure sampler for playable modes
    if (mode === 'input' || mode === 'both') {
      _ensurePiano();
    }

    // ── Collect highlight data ─────────────────────────────────
    const highlights = new Map();  // "pc_octave" → { source, color }

    if (mode !== 'input') {
      for (const an of (state.activeNotes || [])) {
        const pc = noteToPC(an.note);
        if (isNaN(pc)) continue;
        if (an.source === 'user') {
          // Octave-specific: only highlight the exact key the user toggled
          const k = `${pc}_${an.octave}`;
          if (!highlights.has(k)) {
            highlights.set(k, { source: an.source, color: an.color });
          }
        } else {
          // All other sources (triad, interval, scale): apply to every octave in range
          for (const key of this._keys) {
            if (key.pc === pc) {
              const k = `${key.pc}_${key.octave}`;
              // First source wins priority: triad > interval > scale > user
              if (!highlights.has(k)) {
                highlights.set(k, { source: an.source, color: an.color });
              }
            }
          }
        }
      }
    }

    // ── Common tones & moving tone ─────────────────────────────
    const commonTonePCs = new Set();
    const movingFrom = new Set();  // PC of ghost position
    const movingTo = new Set();  // PC of new position
    const at = state.activeTransform;

    if (at) {
      if (ann.showCommonTones && at.commonTones) {
        at.commonTones.forEach(n => commonTonePCs.add(noteToPC(n)));
      }
      if (ann.showMovingTone && at.movingTone) {
        if (at.movingTone.from) movingFrom.add(noteToPC(at.movingTone.from));
        if (at.movingTone.to) movingTo.add(noteToPC(at.movingTone.to));
      }
    }

    // ── Progression common tones ──────────────────────────────
    const progCommonPCs = new Set();
    if (state._progressionEvent && state._progressionCommonTones) {
      state._progressionCommonTones.forEach(n => {
        const pc = noteToPC(n);
        if (!isNaN(pc)) progCommonPCs.add(pc);
      });
    }

    // ── Apply classes to keys ──────────────────────────────────
    const showNames = this._opts.showLabels != null
      ? this._opts.showLabels
      : (ann.showNoteNames !== false);

    for (const key of this._keys) {
      const el = this._keyEls[key.noteWithOctave];
      if (!el) continue;

      // Reset highlight classes
      el.classList.remove(
        'kv-key--triad', 'kv-key--interval', 'kv-key--scale', 'kv-key--user',
        'kv-key--ghost', 'kv-key--moving', 'kv-key--common-tone',
        'kv-key--prog-common-tone',
      );

      // Source highlight
      const hk = `${key.pc}_${key.octave}`;
      const hl = highlights.get(hk);
      if (hl) {
        el.classList.add(`kv-key--${hl.source}`);
      }

      // Ghost (old moving-tone position)
      if (movingFrom.has(key.pc) && !movingTo.has(key.pc)) {
        el.classList.add('kv-key--ghost');
      }
      // Emphasized moving-tone (new position)
      if (movingTo.has(key.pc)) {
        el.classList.add('kv-key--moving');
      }
      // Common-tone dot (transform mode)
      if (commonTonePCs.has(key.pc) && (hl || movingTo.has(key.pc))) {
        el.classList.add('kv-key--common-tone');
      }
      // Progression common-tone pulse (gold flash on shared keys)
      if (progCommonPCs.has(key.pc) && hl) {
        el.classList.add('kv-key--prog-common-tone');
      }

      // Note label
      const label = el.querySelector('.kv-note-label');
      if (label) {
        label.style.display = showNames ? '' : 'none';
      }
    }

    // ── Info label (chord / interval name) ─────────────────────
    if (this._infoLabelEl) {
      let text = '';
      if (ann.showChordLabel && (state.activeTriads || []).length > 0) {
        const primary = state.activeTriads.find(t => t.role === 'primary');
        if (primary) {
          text = `${primary.root} ${primary.quality}`;
        }
      }
      if (state.activeInterval && state.activeInterval.label) {
        text = state.activeInterval.label;
      }
      this._infoLabelEl.textContent = text;
    }
  },

  /**
   * Return a Promise resolving with a smart proxy once the piano sampler has
   * loaded. The proxy automatically routes triggerAttack / triggerRelease /
   * triggerAttackRelease / releaseAll to whichever instrument is active at
   * call time — callers never need to hold a reference to the raw sampler.
   */
  getSampler() {
    _ensurePiano();
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const { state } = _instState.piano;
        if (state === 'loaded') { clearInterval(check); resolve(_samplerProxy); }
        else if (state === 'error') { clearInterval(check); reject(new Error('[KeyboardView] Piano sampler failed to load')); }
      }, 100);
    });
  },

  /**
   * Switch the active instrument. Lazily loads the soundfont on first use.
   * @param {'piano'|'guitar'|'voice'} name
   * @returns {Promise<void>} Resolves when the instrument is ready to play.
   */
  async setInstrument(name) {
    if (!_instState[name]) throw new Error(`[KeyboardView] Unknown instrument: "${name}"`);
    _activeInst = name;
    if (name === 'piano') {
      await _ensurePiano();
    } else if (name === 'guitar') {
      await _ensureGuitar();
    } else if (name === 'voice') {
      await _ensureVoice();
    }
  },

  /** Return the name of the currently active instrument ('piano', 'guitar', or 'voice'). */
  getInstrument() {
    return _activeInst;
  },

  /**
   * Return the loading state for a named instrument.
   * @param {'piano'|'guitar'|'voice'} name
   * @returns {'unloaded'|'loading'|'loaded'|'error'}
   */
  getInstrumentLoadingState(name) {
    return _instState[name]?.state ?? 'unloaded';
  },

  /**
   * Return true if the named instrument is fully loaded and ready to play.
   * @param {'piano'|'guitar'|'voice'} name
   * @returns {boolean}
   */
  isInstrumentLoaded(name) {
    return _instState[name]?.state === 'loaded';
  },

  /**
   * Return the active voice soundfont name (e.g. 'choir_aahs', 'voice_oohs').
   * @returns {string}
   */
  getVoiceType() {
    return _instState.voice.sfName;
  },

  /**
   * Return a shallow copy of the VOICE_TYPES catalogue { sfName: label }.
   * @returns {Record<string, string>}
   */
  getVoiceTypes() {
    return { ...VOICE_TYPES };
  },

  /**
   * Change the voice soundfont. Disposes the current voice sampler if a
   * different type is requested so the next setInstrument('voice') call
   * fetches and builds the new soundfont from scratch.
   *
   * Does NOT start loading — call setInstrument('voice') afterwards to
   * trigger the load (or let the existing _switchInstrument flow do it).
   *
   * @param {string} sfName - Key from VOICE_TYPES (e.g. 'choir_aahs')
   */
  setVoiceType(sfName) {
    if (!VOICE_TYPES[sfName]) throw new Error(`[KeyboardView] Unknown voice type: "${sfName}"`);
    const inst = _instState.voice;
    if (inst.sfName === sfName) return;   // nothing to do
    // Dispose the current voice sampler so the next load uses the new sfName.
    if (inst.sampler) {
      try { inst.sampler.releaseAll(); inst.sampler.dispose(); } catch (_) { }
      inst.sampler = null;
    }
    if (inst.volume) {
      try { inst.volume.dispose(); } catch (_) { }
      inst.volume = null;
    }
    inst.state = 'unloaded';
    inst._promise = null;
    inst.sfName = sfName;
  },

  /**
   * Unsubscribe, remove DOM, dispose sampler.
   */
  destroy() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    if (this._wrapEl && this._wrapEl.parentNode) {
      this._wrapEl.parentNode.removeChild(this._wrapEl);
    }
    this._wrapEl = null;
    this._keyboardEl = null;
    this._infoLabelEl = null;
    this._container = null;
    this._keyEls = {};
    this._keys = [];
    this._pressedKey = null;
    _destroyAllSamplers();
  },

  // ══════════════════════════════════════════════════════════════
  // INTERNAL — DOM CONSTRUCTION
  // ══════════════════════════════════════════════════════════════

  _buildDOM(mode, state) {
    const wrap = document.createElement('div');
    wrap.className = 'kv-wrap';

    // Info label (above keyboard)
    const infoLabel = document.createElement('div');
    infoLabel.className = 'kv-info-label';
    wrap.appendChild(infoLabel);
    this._infoLabelEl = infoLabel;

    // Build keyboard row
    this._buildKeyboard(mode);
    wrap.appendChild(this._keyboardEl);

    this._container.appendChild(wrap);
    this._wrapEl = wrap;

    // Initial render
    this.render(state);
  },

  _buildKeyboard(mode) {
    const kb = document.createElement('div');
    kb.className = `kv-keyboard kv-keyboard--${mode}`;

    this._keyEls = {};

    for (const key of this._keys) {
      const el = document.createElement('div');
      el.className = `kv-key kv-key--${key.isBlack ? 'black' : 'white'}`;
      el.dataset.note = key.noteWithOctave;
      el.dataset.pc = key.pc;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', key.noteWithOctave);

      // Note name label
      const label = document.createElement('span');
      label.className = 'kv-note-label';
      label.textContent = key.noteName;
      el.appendChild(label);

      // Common-tone dot
      const dot = document.createElement('span');
      dot.className = 'kv-common-dot';
      dot.setAttribute('aria-hidden', 'true');
      el.appendChild(dot);

      // Click/touch events
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._handleKeyDown(key, el);
      });
      el.addEventListener('mouseup', () => this._handleKeyUp(key, el));
      el.addEventListener('mouseleave', () => this._handleKeyUp(key, el));
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._handleKeyDown(key, el);
      });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        this._handleKeyUp(key, el);
      });

      this._keyEls[key.noteWithOctave] = el;
      kb.appendChild(el);
    }

    this._keyboardEl = kb;
  },

  _handleKeyDown(key, el) {
    const state = HarmonyState.get();
    const mode = this._opts.mode || state.keyboardMode || 'display';
    if (mode === 'display') return;

    this._pressedKey = key.noteWithOctave;
    el.classList.add('kv-key--pressed');

    // Internal audio can be suppressed so the caller manages playback directly.
    if (!this._opts.noInternalAudio) {
      _playNote(key.noteWithOctave);
    }

    if (this._opts.onNotePlay) {
      this._opts.onNotePlay(key.noteName, key.octave);
    }
  },

  _handleKeyUp(key, el) {
    if (this._pressedKey !== key.noteWithOctave) return;
    this._pressedKey = null;
    el.classList.remove('kv-key--pressed');
    if (!this._opts.noInternalAudio) {
      _stopNote(key.noteWithOctave);
    }
  },
};

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { KeyboardView, _loadSoundfontSampler as loadSoundfontSampler, VOICE_TYPES };

if (typeof window !== 'undefined') {
  window.KeyboardView = KeyboardView;
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST  (manual — run in browser console after importing)
// ════════════════════════════════════════════════════════════════════

/* --- Self-test: uncomment this block to run ---

(function selfTest() {
  const results = [];
  function assert(label, ok) {
    results.push({ label, pass: !!ok });
    console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}`);
  }

  console.log("\n─── keyboard-view.js self-test ───\n");

  // Create a test container
  const div = document.createElement('div');
  div.id = 'kv-selftest';
  div.style.cssText = 'width:900px;position:fixed;top:10px;left:10px;z-index:99999;background:#fff;border:2px solid #333;padding:10px;';
  document.body.appendChild(div);

  // 1. init with default range (C3–B5)
  HarmonyState.reset();
  KeyboardView.init('kv-selftest');
  const kb = div.querySelector('.kv-keyboard');
  assert("init() creates a .kv-keyboard element", kb !== null);

  const whiteKeys = div.querySelectorAll('.kv-key--white');
  const blackKeys = div.querySelectorAll('.kv-key--black');
  assert("Default range C3–B5: 22 white keys", whiteKeys.length === 22);
  assert("Default range C3–B5: 15 black keys", blackKeys.length === 15);

  const totalKeys = whiteKeys.length + blackKeys.length;
  assert("Total keys = 37 (3 octaves C3 to B5)", totalKeys === 37);

  // 2. setTriad C major → C, E, G highlighted
  HarmonyState.setTriad("C", "major");
  const triadKeys = div.querySelectorAll('.kv-key--triad');
  // C, E, G across all octaves in range (3 octaves = 3 of each = 9)
  assert("setTriad(C,major) highlights keys with .kv-key--triad (≥3)", triadKeys.length >= 3);

  // Verify specific pitch classes are highlighted
  const triadPCs = new Set();
  triadKeys.forEach(el => triadPCs.add(parseInt(el.dataset.pc, 10)));
  assert("Highlighted PCs include 0 (C)", triadPCs.has(0));
  assert("Highlighted PCs include 4 (E)", triadPCs.has(4));
  assert("Highlighted PCs include 7 (G)", triadPCs.has(7));

  // 3. setInterval C→E → two keys highlighted with .kv-key--interval
  HarmonyState.setInterval("C", 4, "E", 4);
  const intervalKeys = div.querySelectorAll('.kv-key--interval');
  assert("setInterval(C,E) highlights keys with .kv-key--interval (≥2)", intervalKeys.length >= 2);
  const intervalPCs = new Set();
  intervalKeys.forEach(el => intervalPCs.add(parseInt(el.dataset.pc, 10)));
  assert("Interval PCs include 0 (C)", intervalPCs.has(0));
  assert("Interval PCs include 4 (E)", intervalPCs.has(4));

  // 4. Info label shows interval name
  const infoLabel = div.querySelector('.kv-info-label');
  assert("Info label shows 'Major 3rd'", infoLabel && infoLabel.textContent === "Major 3rd");

  // 5. Mode = display → clicks should NOT trigger onNotePlay
  HarmonyState.update({ keyboardMode: "display" });
  let playTriggered = false;
  KeyboardView._opts.onNotePlay = () => { playTriggered = true; };
  // Simulate: find a white key and dispatch mousedown
  const testKey = div.querySelector('.kv-key--white');
  if (testKey) {
    testKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    testKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }
  assert("Display mode: click does NOT trigger onNotePlay", !playTriggered);

  // 6. Mode = input → clicks should trigger onNotePlay
  HarmonyState.update({ keyboardMode: "input" });
  KeyboardView.render(HarmonyState.get());
  playTriggered = false;
  if (testKey) {
    testKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    testKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }
  assert("Input mode: click triggers onNotePlay", playTriggered);

  // 7. destroy() cleans up
  KeyboardView.destroy();
  assert("destroy() removes keyboard from container", div.querySelector('.kv-keyboard') === null);

  // Cleanup
  div.remove();
  HarmonyState.reset();

  // Summary
  const passed = results.filter(r => r.pass).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
})();

--- End self-test --- */
