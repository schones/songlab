/**
 * player.js
 * =========
 * Page glue for /player (Milestone 1): wires the existing pieces together.
 *
 *   PlayerStaff            player-staff.js            one bar engraved, note states
 *   buildSteps / attachIds / createFollower
 *                          player-follow.js           step list + wait-for-me matcher
 *   createShellInput       games/cycle-of-shells-input.js   MIDI device + de-duplicated notes
 *   VoicingKeyboard        shared/voicing-keyboard.js on-screen keys (clickable)
 *   loadSampler            shared/voicing-player.js   shared Salamander piano
 *
 * Nothing musical lives here: the norm → steps → ids mapping is the
 * follower's, the engraving is the staff's. This file owns the DOM, the
 * device <select>, the keyboard state classes (pl-key--*), the status line
 * and the sound switches.
 *
 * Debug handle: window.__player (state, load, showBar, staff, keyboard, …).
 */

import { PlayerStaff } from './player-staff.js';
import { buildSteps, attachIds, createFollower } from './player-follow.js';
import { createShellInput } from '../games/cycle-of-shells-input.js';
import { VoicingKeyboard } from '../shared/voicing-keyboard.js';
import { loadSampler } from '../shared/voicing-player.js';

const DEVICE_KEY = 'songlab_player_midi_device';   // createShellInput has a fixed key; mapped through its injectable storage
const SOUND_KEY = 'songlab_player_midi_sound';     // "Sound for MIDI notes" checkbox; off by default
const ECHO_VELOCITY = 0.7;                           // as cycle-of-shells.js
const CLICK_SECONDS = 0.6;                           // on-screen key: attack + release
const WRONG_FLASH_MS = 500;
const CORRECT_FLASH_MS = 400;                        // minimum green on a key (clicks release at once)
const KEY_MARGIN = 3;                                // keys past the piece's lowest / highest
const KEY_STATES = ['expected', 'correct', 'wrong', 'held'];
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** ASCII spelling for Tone (parseNote gives ♯, which Tone's note parser does not read). */
const noteName = midi => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

const $ = id => document.getElementById(id);
const els = {
  title: $('pl-piece-title'), meta: $('pl-meta'), banner: $('pl-banner'),
  select: $('pl-piece-select'),
  device: $('pl-device-select'), deviceStatus: $('pl-device-status'),
  hands: $('pl-hands'),
  sound: $('pl-sound'),
  prev: $('pl-prev'), next: $('pl-next'), barLabel: $('pl-bar-label'),
  status: $('pl-status'), restart: $('pl-restart'),
  keyboardHost: $('pl-keyboard'),
};

const state = {
  piece: null, norm: null, pieces: [], bar: null,
  hands: 'both',
  steps: [], follower: null,
  wrong: 0,
  held: new Set(),        // midis down on the MIDI device (de-duplicated by the input)
  echoing: new Set(),     // midis sounding on the sampler for MIDI echo
  audioStarted: false,
};
const staff = new PlayerStaff('pl-staff');
let keyboard = null;
let input = null;
let sampler = null;
const keyTimers = new Map();   // `${midi}:${state}` → timeout id

// ════════════════════════════════════════════════════════════════════
// SOUND
// ════════════════════════════════════════════════════════════════════

const muted = () => !!(window.AudioToggle && window.AudioToggle.isMuted());
const midiSound = () => !!(els.sound && els.sound.checked);

async function ensureSampler() {
  if (sampler) return sampler;
  try { sampler = await loadSampler(); } catch (err) { console.warn('[player] piano unavailable:', err); sampler = null; }
  return sampler;
}

/** Tone.start() must run inside a user gesture: the first click or key press on the page. */
async function startAudio() {
  if (state.audioStarted) return;
  state.audioStarted = true;
  try { if (window.Tone) await window.Tone.start(); } catch (err) { console.warn('[player] Tone.start failed:', err); }
  ensureSampler();   // preload; not awaited
}
document.addEventListener('pointerdown', startAudio, { capture: true });
document.addEventListener('keydown', startAudio, { capture: true });

// MIDI echo, as cycle-of-shells.js echoOn / echoOff: only while the key is still down.
function echoOn(midi) {
  if (!state.audioStarted || muted() || !midiSound()) return;
  ensureSampler().then(s => {
    if (s && state.held.has(midi) && !state.echoing.has(midi)) { state.echoing.add(midi); s.triggerAttack(noteName(midi), undefined, ECHO_VELOCITY); }
  });
}
function echoOff(midi) {
  if (!state.echoing.has(midi)) return;
  state.echoing.delete(midi);
  if (sampler) sampler.triggerRelease(noteName(midi));
}
function echoAllOff() { for (const m of [...state.echoing]) echoOff(m); }

/** On-screen keys always sound (unless the page is muted). */
function clickSound(midi) {
  if (muted()) return;
  ensureSampler().then(s => { if (s) s.triggerAttackRelease(noteName(midi), CLICK_SECONDS, undefined, ECHO_VELOCITY); });
}

// ════════════════════════════════════════════════════════════════════
// KEYBOARD STATES (pl-key--expected / --correct / --wrong / --held)
// ════════════════════════════════════════════════════════════════════

const keyEl = midi => (keyboard ? els.keyboardHost.querySelector(`.vk-key[data-midi="${midi}"]`) : null);

function setKey(midi, st, on) {
  const el = keyEl(midi);
  if (el) el.classList.toggle(`pl-key--${st}`, !!on);
}
function clearKeys(states = KEY_STATES) {
  if (!keyboard) return;
  for (const el of els.keyboardHost.querySelectorAll('.vk-key')) for (const s of states) el.classList.remove(`pl-key--${s}`);
  for (const [k, t] of keyTimers) if (states.includes(k.split(':')[1])) { clearTimeout(t); keyTimers.delete(k); }
}
/** Light a key for at least `ms`; a held MIDI key keeps it until release (see onNoteOff). */
function flashKey(midi, st, ms) {
  const k = `${midi}:${st}`;
  if (keyTimers.has(k)) clearTimeout(keyTimers.get(k));
  setKey(midi, st, true);
  keyTimers.set(k, setTimeout(() => {
    keyTimers.delete(k);
    if (st === 'correct' && state.held.has(midi)) return;   // still down: onNoteOff clears it
    setKey(midi, st, false);
  }, ms));
}

/** Keyboard range from the piece: lowest / highest attacked midi (both hands), a few keys of margin, snapped outward to white keys. */
function pieceRange(norm) {
  let lo = Infinity, hi = -Infinity;
  for (const s of buildSteps(norm, { hands: 'both' })) for (const n of s.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
  if (!isFinite(lo)) { lo = 48; hi = 83; }
  lo -= KEY_MARGIN; hi += KEY_MARGIN;
  while (BLACK_PCS.has(lo % 12)) lo--;
  while (BLACK_PCS.has(hi % 12)) hi++;
  return { low: Math.max(21, lo), high: Math.min(108, hi) };
}

function mountKeyboard(norm) {
  const { low, high } = pieceRange(norm);
  if (!keyboard) {
    els.keyboardHost.textContent = '';
    keyboard = new VoicingKeyboard(els.keyboardHost, { low: noteName(low), high: noteName(high), height: 120, ariaLabel: 'Keyboard: expected notes in blue, correct green, wrong red', onKeyClick: onKeyClick });
  } else {
    keyboard.setRange(low, high);
  }
}

// ════════════════════════════════════════════════════════════════════
// STEPS, FOLLOWER AND STATES
// ════════════════════════════════════════════════════════════════════

const barNumbers = () => (state.norm && Array.isArray(state.norm.bars) ? state.norm.bars.map(b => b.bar) : []);
const otherHand = () => (state.hands === 'rh' ? 'lh' : state.hands === 'lh' ? 'rh' : null);

/** Rebuild the step list and follower for the current hands; the follower starts at `bar` (or the first bar). */
function rebuildFollower(bar) {
  state.steps = state.norm ? buildSteps(state.norm, { hands: state.hands }, staff.hits) : [];
  state.follower = createFollower(state.steps);
  if (bar != null) state.follower.jumpTo(bar);
}

/**
 * Paint the staff and keyboard from the follower: steps of the drawn bar
 * before the current one → correct; the current step → pressed notes
 * correct, the rest expected; the unselected hand dimmed.
 */
function paintStates() {
  staff.clearStates();
  clearKeys(['expected']);   // green and red flashes end on their own (or on release)
  const other = otherHand();
  staff.setDimmed(other ? staff.noteIds({ hand: other }) : []);
  const f = state.follower;
  if (!f) { updateStatus(); return; }
  const cur = f.current();
  const drawn = staff.range;
  if (drawn) {
    for (const s of state.steps) {
      if (cur && s.index >= cur.index) break;
      if (s.bar < drawn.from || s.bar > drawn.to) continue;
      for (const n of s.notes) for (const id of n.ids) staff.setNoteState(id, 'correct');
    }
  }
  if (cur) {
    const pressed = f.pressed();
    for (const n of cur.notes) {
      const st = pressed.has(n.midi) ? 'correct' : 'expected';
      for (const id of n.ids) staff.setNoteState(id, st);
      setKey(n.midi, st, true);
    }
  }
  for (const m of state.held) setKey(m, 'held', true);
  updateStatus();
}

function updateStatus() {
  const f = state.follower;
  if (!state.norm || !f) { els.status.textContent = ''; els.restart.hidden = true; return; }
  if (f.done()) {
    els.status.textContent = `Done! ${state.wrong} wrong note${state.wrong === 1 ? '' : 's'}`;
    els.restart.hidden = false;
    return;
  }
  const cur = f.current();
  const where = cur.bar === state.bar ? `Bar ${cur.bar}` : `Bar ${cur.bar} (showing ${state.bar})`;   // a paged-to bar with no steps for this hand
  els.status.textContent = `${where} · step ${cur.index + 1} / ${state.steps.length} · wrong: ${state.wrong}`;
  els.restart.hidden = true;
}

/** A note attack from the MIDI device or an on-screen key. */
function judge(midi) {
  const f = state.follower;
  if (!f) return;
  const r = f.noteOn(midi);
  if (r.result === 'wrong') {
    state.wrong += 1;
    flashKey(midi, 'wrong', WRONG_FLASH_MS);
    updateStatus();
    return;
  }
  if (r.result !== 'correct') return;
  for (const n of r.step.notes) if (n.midi === midi) for (const id of n.ids) staff.setNoteState(id, 'correct');   // both hands when the pitch is doubled
  setKey(midi, 'expected', false);
  flashKey(midi, 'correct', CORRECT_FLASH_MS);
  if (!r.completed) { updateStatus(); return; }
  const next = f.current();
  const drawn = staff.range;
  if (next && (!drawn || next.bar < drawn.from || next.bar > drawn.to)) showBar(next.bar, { keep: true });
  else paintStates();
}

// ════════════════════════════════════════════════════════════════════
// INPUT
// ════════════════════════════════════════════════════════════════════

function onMidiNoteOn(midi) {
  state.held.add(midi);
  setKey(midi, 'held', true);
  echoOn(midi);
  judge(midi);
}
function onMidiNoteOff(midi) {
  state.held.delete(midi);
  setKey(midi, 'held', false);
  if (!keyTimers.has(`${midi}:correct`)) setKey(midi, 'correct', false);   // a finished flash waits for the release
  echoOff(midi);
  if (state.follower) state.follower.noteOff(midi);
}
function onKeyClick(midi) {
  startAudio();
  clickSound(midi);
  judge(midi);
  if (state.follower) state.follower.noteOff(midi);
}

/** Device <select> + status, as cycle-of-shells.js setupMidi / refreshDeviceList. */
async function setupMidi() {
  const storage = playerDeviceStorage();
  input = createShellInput({ storage });
  input.on('noteOn', onMidiNoteOn);
  input.on('noteOff', onMidiNoteOff);
  input.on('status', text => { els.deviceStatus.textContent = text; });
  input.on('devices', refreshDeviceList);
  try { await input.init(); } catch (err) { els.deviceStatus.textContent = `MIDI unavailable: ${err.message}`; }
  refreshDeviceList();
}
/** createShellInput remembers the device under its own key; this storage view keeps the player's choice under DEVICE_KEY. */
function playerDeviceStorage() {
  let ls = null;
  try { ls = window.localStorage; } catch (_) { ls = null; }
  return {
    getItem: () => { try { return ls ? ls.getItem(DEVICE_KEY) : null; } catch (_) { return null; } },
    setItem: (_, v) => { try { ls && ls.setItem(DEVICE_KEY, v); } catch (_) { /* storage unavailable */ } },
    removeItem: () => { try { ls && ls.removeItem(DEVICE_KEY); } catch (_) { /* storage unavailable */ } },
  };
}
function refreshDeviceList() {
  if (!input) return;
  const sel = els.device;
  const list = input.listDevices();
  const current = input.deviceName || '';
  sel.textContent = '';
  if (!list.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(no MIDI inputs)'; sel.appendChild(o); sel.disabled = true; return; }
  sel.disabled = false;
  for (const d of list) {
    const o = document.createElement('option');
    o.value = d.name; o.textContent = d.name;
    if (d.name === current) o.selected = true;
    sel.appendChild(o);
  }
}
els.device.addEventListener('change', e => { if (input && e.target.value) input.selectDevice(e.target.value); });

// ── Sound for MIDI notes (off by default; remembered) ─────────────
try { els.sound.checked = localStorage.getItem(SOUND_KEY) === '1'; } catch (_) { els.sound.checked = false; }
els.sound.addEventListener('change', () => {
  try { localStorage.setItem(SOUND_KEY, els.sound.checked ? '1' : '0'); } catch (_) { /* storage unavailable */ }
  if (els.sound.checked) ensureSampler(); else echoAllOff();
  els.sound.blur();
});

// ── Hands ────────────────────────────────────────────────────────
els.hands.addEventListener('change', e => {
  if (!(e.target instanceof HTMLInputElement) || !e.target.checked) return;
  state.hands = e.target.value === 'lh' || e.target.value === 'rh' ? e.target.value : 'both';
  e.target.blur();   // so ← / → / R go back to the page, not the radio group
  if (!state.norm) return;
  rebuildFollower(state.bar);
  const cur = state.follower.current();
  if (cur && cur.bar !== state.bar) showBar(cur.bar, { keep: true });   // this bar has nothing for that hand
  else paintStates();
});

// ════════════════════════════════════════════════════════════════════
// BAR NAVIGATION
// ════════════════════════════════════════════════════════════════════

function updateBarNav() {
  const bars = barNumbers();
  const i = bars.indexOf(state.bar);
  els.barLabel.textContent = bars.length && i >= 0 ? `Bar ${state.bar} / ${bars[bars.length - 1]}` : 'Bar – / –';
  els.prev.disabled = !(i > 0);
  els.next.disabled = !(i >= 0 && i < bars.length - 1);
}

/**
 * Engrave `bar`, attach its ids to the steps and repaint. With `keep` the
 * follower stays where it is (auto-paging after a step completes);
 * otherwise it jumps to the bar's first step (Prev / Next / ← / →).
 */
async function showBar(bar, { keep = false } = {}) {
  if (!state.norm) return;
  state.bar = bar;
  updateBarNav();
  if (!keep) { if (state.follower) state.follower.jumpTo(bar); clearKeys(['expected', 'correct', 'wrong']); }
  const result = await staff.render(state.norm, bar);
  if (!result) return;   // superseded by a later render, or failed (the staff shows why)
  if (result.warnings.length) banner(`Bar ${bar}: ${result.warnings.join('; ')}`);
  else banner('');
  attachIds(state.steps, result.hits);
  paintStates();
}

function stepBar(delta) {
  const bars = barNumbers();
  const i = bars.indexOf(state.bar);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= bars.length) return;
  showBar(bars[j]);
}

function restart() {
  if (!state.norm) return;
  const bars = barNumbers();
  if (!bars.length) return;
  state.wrong = 0;
  const cur = state.follower ? state.follower.reset() : null;
  clearKeys(['expected', 'correct', 'wrong']);
  showBar(cur ? cur.bar : bars[0], { keep: true });
}

els.prev.addEventListener('click', () => stepBar(-1));
els.next.addEventListener('click', () => stepBar(1));
els.restart.addEventListener('click', restart);
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest('input, select, textarea, [contenteditable]')) return;
  if (e.key === 'ArrowLeft') { stepBar(-1); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { stepBar(1); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') { restart(); e.preventDefault(); }
});

// ════════════════════════════════════════════════════════════════════
// PIECES
// ════════════════════════════════════════════════════════════════════

function banner(text, isError = false) {
  els.banner.hidden = !text;
  els.banner.textContent = text || '';
  els.banner.classList.toggle('pl-banner--error', isError);
}

function showHeader(name, norm) {
  els.title.textContent = (typeof norm.title === 'string' && norm.title.trim()) ? norm.title : name;
  const parts = [];
  if (norm.key)  parts.push(norm.key);
  if (norm.time) parts.push(norm.time);
  if (norm.tempo) parts.push(`${norm.tempo} bpm`);
  parts.push(`${Array.isArray(norm.bars) ? norm.bars.length : 0} bars`);
  els.meta.textContent = '';
  for (const p of parts) { const s = document.createElement('span'); s.textContent = p; els.meta.appendChild(s); }
}

function unload() {
  state.norm = null; state.bar = null; state.steps = []; state.follower = null; state.wrong = 0;
  updateBarNav(); staff.clear(); clearKeys(); updateStatus();
}

async function load(name) {
  banner('');
  els.title.textContent = '…';
  els.meta.textContent = '';
  try {
    const res = await fetch(`/player/data/${encodeURIComponent(name)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      state.piece = name; unload();
      els.title.textContent = name;
      banner(`No data for “${name}” (${res.status}). Expected static/private/pieces/${name}.norm.json or tests/fixtures/norm-${name}.json.`, true);
      return;
    }
    const norm = await res.json();
    state.piece = name; state.norm = norm; state.wrong = 0;
    showHeader(name, norm);
    const bars = barNumbers();
    if (bars.length) {
      mountKeyboard(norm);
      clearKeys();
      staff.clear();          // old hits must not attach to the new piece's steps
      rebuildFollower(null);
      const cur = state.follower.current();
      showBar(cur ? cur.bar : bars[0], { keep: true });
    } else { unload(); banner('This piece has no bars.', true); }
    const url = new URL(window.location.href);
    url.searchParams.set('piece', name);
    history.replaceState(null, '', url);
  } catch (err) {
    banner(`Could not load “${name}”: ${err.message}`, true);
  }
}

function fillPicker(list, selected) {
  els.select.textContent = '';
  for (const source of ['private', 'public']) {
    const group = list.filter(p => p.source === source);
    if (!group.length) continue;
    const og = document.createElement('optgroup');
    og.label = source === 'private' ? 'local (private)' : 'public';
    for (const p of group) {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = source === 'private' ? `${p.title} (local)` : p.title;
      og.appendChild(o);
    }
    els.select.appendChild(og);
  }
  const has = [...els.select.options].some(o => o.value === selected);
  if (has) els.select.value = selected; else els.select.selectedIndex = -1;
}

async function loadPieceList() {
  try {
    const res = await fetch('/player/pieces', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    state.pieces = Array.isArray(list) ? list : [];
  } catch (_) {
    state.pieces = [];
  }
  if (!state.pieces.length) {
    els.select.textContent = '';
    const o = document.createElement('option'); o.value = ''; o.textContent = '(no pieces found)';
    els.select.appendChild(o);
  }
  return state.pieces;
}

els.select.addEventListener('change', () => { if (els.select.value) load(els.select.value); });

// ════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════

const checkedHand = els.hands.querySelector('input:checked');
if (checkedHand) state.hands = checkedHand.value === 'lh' || checkedHand.value === 'rh' ? checkedHand.value : 'both';

const requested = new URLSearchParams(window.location.search).get('piece');
const pieces = await loadPieceList();
const first = requested || (pieces[0] && pieces[0].name) || null;
if (pieces.length) fillPicker(pieces, first);
if (first) load(first);
else banner('No pieces available. Run tools/pieces/midi_to_norm.py to write static/private/pieces/<slug>.norm.json.', true);
setupMidi();   // not awaited: the piece loads while the browser asks for MIDI access

// Debug handle for the browser console (no behaviour depends on it).
window.__player = {
  state, load, pieces: () => state.pieces, staff, showBar, restart,
  get keyboard() { return keyboard; }, get input() { return input; }, get follower() { return state.follower; }, get steps() { return state.steps; },
  noteOn: onMidiNoteOn, noteOff: onMidiNoteOff,
};
