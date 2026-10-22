/**
 * cycle-of-shells.js
 * ==================
 * Page layer for the Cycle of Shells game (/games/cycle-of-shells). Wires
 * the pure core (targets, checker, submit detector) and the MIDI wrapper to
 * the DOM, the VoicingKeyboard and the voicing-player piano. All game logic
 * lives in cycle-of-shells-core.js; this file only wires and renders.
 *
 * Depends on:
 *   - cycle-of-shells-core.js   → buildLap, describeMove, checkAnswer, createSubmitDetector, CYCLE
 *   - cycle-of-shells-input.js  → createShellInput (MIDI)
 *   - voicing-keyboard.js       → VoicingKeyboard (display + on-screen input via onKeyClick)
 *   - voicing-player.js         → VoicingPlayer (Hear it), loadSampler (live echo); one piano on the page
 *
 * Lifecycle (hand-rolled, as Scale Builder):
 *   init(params) → DOM wiring, settings restored → start overlay click →
 *   Tone.start(), MIDI init, lap built (resume or URL params) → targets
 *   advance on each correct answer, no timers.
 *
 * Settings (localStorage, prefix 'cycleOfShells.'): mode, startKey, hidePath,
 * pedalSubmit, echo (per device name), resume ({ index, mode, startKey });
 * the MIDI device name is kept by the input wrapper under
 * 'cycleOfShells.midiDevice'.
 *
 * Stage 4 hooks: `hooks.onAccepted(target, result, submission)` and
 * `hooks.onLapComplete(lap)` are called when set; `getState()` exposes the
 * current target and counters for the follow-up question, result logging
 * and /learn links.
 */

import { buildLap, describeMove, checkAnswer, createSubmitDetector, CYCLE } from './cycle-of-shells-core.js';
import { createShellInput } from './cycle-of-shells-input.js';
import { VoicingKeyboard } from '../shared/voicing-keyboard.js';
import { VoicingPlayer, loadSampler } from '../shared/voicing-player.js';
import { parseNote } from '../shared/voicing-analysis.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'cycleOfShells.';
const KEYBOARD_RANGE = { low: 'C2', high: 'C5' };
const SETTLE_MS = 150;
const MIN_NOTES = 3;
const MISSES_BEFORE_SHOW_ME = 2;
const HEAR_SECONDS = 1.4;
const ECHO_VELOCITY = 0.7;
const ECHO_DEFAULT_OFF = new Set(['RD-2000']);   // devices that make their own sound
const FORM_TEXT = { '3-below': '3rd below 7th', '7-below': '7th below 3rd' };
const FORM_SHORT = { '3-below': '3rd below', '7-below': '7th below' };
const PHRASES_PER_KEY = { both: 2, single: 1 };

// ════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

const settings = { mode: 'both', startKey: 'C', hidePath: false, pedalSubmit: false };
let lap = [];
let index = 0;
let misses = 0;
let showMe = false;
let prevAccepted = null;          // the player's last accepted right hand (midis), for coaching
let lapComplete = false;
let audioStarted = false;

const held = new Set();           // MIDI notes down (after the wrapper's de-duplication)
const staged = new Set();         // on-screen clicks waiting for Check
let keyboard = null;
let input = null;
let detector = null;
let player = null;
let sampler = null;
let playing = null;               // Set of midis sounding from Hear it, for keyboard follow
const echoing = new Set();        // midis currently echoed on the sampler

/** Stage 4 hooks (follow-up question, result logging, /learn links). */
const hooks = { onAccepted: null, onLapComplete: null };

// ════════════════════════════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════════════════════════════

const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(STORAGE_PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
  },
};

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

const target = () => lap[index] || null;
const noteName = midi => { const p = parseNote(midi); return p.name + p.octave; };
const pcName = name => name.replace(/-?\d+$/, '');
const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Normalise a key given by URL or settings to a CYCLE key string, or null. */
function normaliseKey(key) {
  if (!key) return null;
  const p = parseNote(String(key).replace(/♭/g, 'b').replace(/♯/g, '#'));
  if (!p) return null;
  const match = CYCLE.find(k => parseNote(k.key).pc === p.pc);
  return match ? match.key : null;
}

function echoDefault() { return !ECHO_DEFAULT_OFF.has(input && input.deviceName); }
function echoEnabled() {
  const map = store.get('echo', {});
  const name = (input && input.deviceName) || '(none)';
  return typeof map[name] === 'boolean' ? map[name] : echoDefault();
}
function setEcho(on) {
  const map = store.get('echo', {});
  map[(input && input.deviceName) || '(none)'] = !!on;
  store.set('echo', map);
}
function muted() { return !!(window.AudioToggle && window.AudioToggle.isMuted()); }

// ════════════════════════════════════════════════════════════════════
// LAP
// ════════════════════════════════════════════════════════════════════

function startLap({ resumeIndex = 0 } = {}) {
  lap = buildLap({ mode: settings.mode, startKey: settings.startKey });
  index = Math.min(Math.max(0, resumeIndex), lap.length - 1);
  misses = 0; showMe = false; prevAccepted = null; lapComplete = false;
  staged.clear();
  if (detector) detector.reset();
  saveResume();
  setFeedback('', null);
  $('cos-coaching').textContent = '';
  render();
}

function saveResume() { store.set('resume', { index, mode: settings.mode, startKey: settings.startKey }); }

function advance() {
  misses = 0; showMe = false; staged.clear();
  index++;
  if (index >= lap.length) {
    index = lap.length - 1;
    lapComplete = true;
    store.set('resume', { index: 0, mode: settings.mode, startKey: settings.startKey });
    if (hooks.onLapComplete) hooks.onLapComplete(lap.slice());
  } else {
    saveResume();
  }
  render();
}

// ════════════════════════════════════════════════════════════════════
// SUBMISSION
// ════════════════════════════════════════════════════════════════════

/**
 * Check a set of midis against the current target. `source` is 'midi' or 'screen'.
 */
function submit(midis, source) {
  const t = target();
  if (!t || lapComplete) return;
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const result = checkAnswer(t, sorted, prevAccepted);
  if (result.correct) {
    // The core's message already is the coaching line when there is one; the second line carries any further coaching.
    setFeedback(result.message, 'success');
    $('cos-coaching').textContent = result.coaching.slice(1).map(c => c.message).join(' ');
    prevAccepted = sorted.slice(1);
    if (hooks.onAccepted) hooks.onAccepted(t, result, { midis: sorted, source });
    advance();
    return;
  }
  if (result.errors[0].code === 'TOO_FEW_NOTES' && source === 'midi') {
    // A lone tap or two notes from the keyboard is not an attempt at the shell: say what is needed, no miss counted.
    setFeedback(result.message, 'info');
    return;
  }
  misses++;
  setFeedback(result.message, 'miss');
  $('cos-coaching').textContent = '';
  if (misses >= MISSES_BEFORE_SHOW_ME) $('btn-show').hidden = false;
  renderKeyboard();
}

function setFeedback(text, kind) {
  const el = $('cos-feedback');
  el.textContent = text;
  el.classList.remove('game-feedback--success', 'game-feedback--miss', 'game-feedback--info');
  if (kind) el.classList.add(`game-feedback--${kind}`);
}

// ════════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════════

function render() {
  const t = target();
  if (!t) return;
  const keyOrder = lap.filter(x => x.role === 'ii' && x.formSlot === 1).map(x => x.key);
  const keyNo = keyOrder.indexOf(t.key) + 1;
  const chordNo = ['ii', 'V', 'I'].indexOf(t.role) + 1;
  const phrases = PHRASES_PER_KEY[settings.mode];
  $('cos-home').textContent = `Home: ${t.keyDisplay}`;
  $('cos-progress').textContent = lapComplete
    ? 'Lap complete'
    : `Key ${keyNo} of ${keyOrder.length}` + (phrases > 1 ? ` · phrase ${t.formSlot} of ${phrases}` : '') + ` · chord ${chordNo} of 3`;
  $('cos-symbol').textContent = t.display;
  $('cos-role').textContent = t.role;
  $('cos-form').textContent = FORM_TEXT[t.form];
  renderPath();
  renderKeyboard();
  $('btn-show').hidden = !(misses >= MISSES_BEFORE_SHOW_ME && !lapComplete);
  $('btn-check').disabled = lapComplete;
  $('cos-pedal-hint').hidden = !settings.pedalSubmit;
  if (lapComplete) setFeedback('Lap complete — every key, every shell. Restart to go round again.', 'success');
}

function renderPath() {
  const el = $('cos-path');
  el.classList.toggle('cos-path--hidden', settings.hidePath);
  el.innerHTML = '';
  const t = target();
  if (!t || index === 0) return;
  const prev = lap[index - 1];
  const move = describeMove(prev.upper, t.upper, { form: FORM_SHORT[t.form] });
  if (move.kind === 'replace') { el.textContent = capitalize(move.summary); return; }
  const degreeOf = midi => { const u = prev.upper.find(x => x.midi === midi); return u ? (u.degree.includes('3') ? '3rd' : '7th') : ''; };
  for (const v of move.voices) {
    const span = document.createElement('span');
    span.className = 'cos-path__voice';
    const label = document.createElement('span');
    label.className = 'cos-path__label';
    label.textContent = `${degreeOf(v.from)}: `;
    span.appendChild(label);
    const from = pcName((prev.upper.find(x => x.midi === v.from) || {}).name || noteName(v.from));
    const to = pcName((t.upper.find(x => x.midi === v.to) || {}).name || noteName(v.to));
    span.appendChild(document.createTextNode(v.delta === 0 ? `${from} stays` : `${from} → ${to}, ${v.label}`));
    el.appendChild(span);
  }
}

/** Keys lit: Hear-it playback if sounding, else Show-me target plus held/staged rings, else held/staged by role. */
function renderKeyboard() {
  if (!keyboard) return;
  const t = target();
  if (playing) return;   // setPlaying() owns the keys during Hear it
  const live = [...new Set([...held, ...staged])].sort((a, b) => a - b);
  if (showMe && t) {
    keyboard.render({ bass: t.bass.name, voicing: t.upper.map(u => u.name) });
    keyboard.setHighlight(live);
    return;
  }
  keyboard.render(live.length ? { bass: live[0], voicing: live.slice(1) } : {});
}

// ════════════════════════════════════════════════════════════════════
// AUDIO
// ════════════════════════════════════════════════════════════════════

async function ensureSampler() {
  if (sampler) return sampler;
  try { sampler = await loadSampler(); } catch (err) { console.warn('[cycle-of-shells] piano unavailable:', err); sampler = null; }
  return sampler;
}

function echoOn(midi) {
  if (!audioStarted || muted() || !echoEnabled()) return;
  ensureSampler().then(s => { if (s && held.has(midi) && !echoing.has(midi)) { echoing.add(midi); s.triggerAttack(noteName(midi), undefined, ECHO_VELOCITY); } });
}
function echoOff(midi) {
  if (!echoing.has(midi)) return;
  echoing.delete(midi);
  if (sampler) sampler.triggerRelease(noteName(midi));
}

async function hearIt() {
  const t = target();
  if (!t || !player) return;
  const notes = [
    { midi: t.bass.midi, time: 0, duration: HEAR_SECONDS, role: 'bass' },
    ...t.upper.map(u => ({ midi: u.midi, time: 0, duration: HEAR_SECONDS, role: 'voicing' })),
  ];
  playing = new Map();
  const result = await player.play({ notes, duration: HEAR_SECONDS, barStart: 0 }, {
    onNote: (note, phase) => {
      if (!playing) return;
      if (phase === 'on') playing.set(note.midi, note.role); else playing.delete(note.midi);
      keyboard.setPlaying([...playing].map(([midi, role]) => ({ midi, role })));
    },
    onEnd: () => { playing = null; keyboard.setPlaying(null); renderKeyboard(); },
  });
  if (!result.played) { playing = null; renderKeyboard(); if (result.reason === 'blocked') setFeedback('Click Hear it again to enable audio.', 'info'); }
}

// ════════════════════════════════════════════════════════════════════
// INPUT
// ════════════════════════════════════════════════════════════════════

function makeDetector() {
  detector = createSubmitDetector({ minNotes: MIN_NOTES, settleMs: SETTLE_MS, pedalSubmit: settings.pedalSubmit });
}

function onMidiNoteOn(midi, t) {
  held.add(midi);
  echoOn(midi);
  detector.noteOn(midi, t);
  renderKeyboard();
}
function onMidiNoteOff(midi, t) {
  held.delete(midi);
  echoOff(midi);
  const sub = detector.noteOff(midi, t);
  renderKeyboard();
  if (sub) submit(sub.midis, 'midi');
}
function onPedal(value, t) {
  const sub = detector.pedal(value, t);
  if (sub) submit(sub.midis, 'midi');
}

function onKeyClick(midi) {
  if (lapComplete) return;
  if (staged.has(midi)) staged.delete(midi); else staged.add(midi);
  renderKeyboard();
}

async function setupMidi() {
  input = createShellInput();
  input.on('noteOn', onMidiNoteOn);
  input.on('noteOff', onMidiNoteOff);
  input.on('pedal', onPedal);
  input.on('status', text => { $('set-device-status').textContent = text; });
  input.on('devices', refreshDeviceList);
  await input.init();
  refreshDeviceList();
  refreshEchoControl();
}

function refreshDeviceList() {
  if (!input) return;
  const sel = $('set-device');
  const list = input.listDevices();
  const current = input.deviceName || '';
  sel.innerHTML = '';
  if (!list.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(no MIDI inputs)'; sel.appendChild(o); sel.disabled = true; return; }
  sel.disabled = false;
  for (const d of list) {
    const o = document.createElement('option');
    o.value = d.name; o.textContent = d.name;
    if (d.name === current) o.selected = true;
    sel.appendChild(o);
  }
}

function refreshEchoControl() {
  $('set-echo').checked = echoEnabled();
  const name = input && input.deviceName;
  $('set-echo-note').textContent = name ? `for ${name}` : 'for the on-screen keyboard';
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

function loadSettings(params) {
  settings.mode = store.get('mode', 'both') === 'single' ? 'single' : 'both';
  settings.startKey = normaliseKey(store.get('startKey', 'C')) || 'C';
  settings.hidePath = !!store.get('hidePath', false);
  settings.pedalSubmit = !!store.get('pedalSubmit', false);
  // URL params override the remembered lap for this visit (not persisted).
  const urlKey = params && normaliseKey(params.key);
  const urlMode = params && (params.mode === 'single' || params.mode === 'both') ? params.mode : null;
  if (urlKey) settings.startKey = urlKey;
  if (urlMode) settings.mode = urlMode;
  return { fromUrl: !!(urlKey || urlMode) };
}

function wireSettings() {
  const keySel = $('set-key');
  for (const k of CYCLE) {
    const o = document.createElement('option');
    o.value = k.key; o.textContent = parseNote(k.key).name;
    keySel.appendChild(o);
  }
  keySel.value = settings.startKey;
  $('set-mode').value = settings.mode;
  $('set-hidepath').checked = settings.hidePath;
  $('set-pedal').checked = settings.pedalSubmit;

  $('cos-settings').addEventListener('toggle', () => { if ($('cos-settings').open) { refreshDeviceList(); refreshEchoControl(); } });
  $('set-device').addEventListener('change', e => { if (input && e.target.value) { input.selectDevice(e.target.value); refreshEchoControl(); } });
  $('set-echo').addEventListener('change', e => { setEcho(e.target.checked); if (!e.target.checked) for (const m of [...echoing]) echoOff(m); });
  $('set-pedal').addEventListener('change', e => {
    settings.pedalSubmit = e.target.checked;
    store.set('pedalSubmit', settings.pedalSubmit);
    makeDetector();
    $('cos-pedal-hint').hidden = !settings.pedalSubmit;
  });
  $('set-hidepath').addEventListener('change', e => { settings.hidePath = e.target.checked; store.set('hidePath', settings.hidePath); renderPath(); });

  const restartWith = (what, apply, revert) => {
    if (!window.confirm(`Change ${what} and restart the lap?`)) { revert(); return; }
    apply();
    store.set('mode', settings.mode);
    store.set('startKey', settings.startKey);
    startLap();
  };
  $('set-mode').addEventListener('change', e => restartWith('the lap mode', () => { settings.mode = e.target.value; }, () => { e.target.value = settings.mode; }));
  $('set-key').addEventListener('change', e => restartWith('the start key', () => { settings.startKey = e.target.value; }, () => { e.target.value = settings.startKey; }));
}

// ════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════

export function init(params = null) {
  const { fromUrl } = loadSettings(params);
  keyboard = new VoicingKeyboard('cos-keyboard', { ...KEYBOARD_RANGE, ariaLabel: 'Keyboard for playing the shell', onKeyClick });
  player = new VoicingPlayer();
  makeDetector();
  wireSettings();

  $('btn-hear').addEventListener('click', hearIt);
  $('btn-check').addEventListener('click', () => submit([...staged], 'screen'));
  $('btn-show').addEventListener('click', () => { showMe = true; renderKeyboard(); setFeedback(`${target().display}: ${target().bass.name} under ${target().upper.map(u => u.name).join(' ')}. Now you play it.`, 'info'); });
  $('btn-restart').addEventListener('click', () => startLap());

  $('start-overlay').addEventListener('click', async () => {
    if (audioStarted) return;
    try { await Tone.start(); } catch (err) { console.warn('[cycle-of-shells] Tone.start failed:', err); }
    audioStarted = true;
    $('start-overlay').style.display = 'none';
    $('main-content').style.display = 'block';
    await setupMidi();
    ensureSampler();   // preload the piano for Hear it and echo; not awaited
    // Resume where the player left off, unless the URL asked for a different lap.
    const resume = store.get('resume', null);
    const canResume = resume && resume.mode === settings.mode && resume.startKey === settings.startKey && !fromUrl;
    startLap({ resumeIndex: canResume ? resume.index : 0 });
  });
}

/** Current state for Stage 4 (follow-up question, logging, links) and tests. */
export function getState() {
  return { index, target: target(), lapLength: lap.length, misses, showMe, lapComplete, settings: { ...settings }, held: [...held], staged: [...staged], deviceName: input ? input.deviceName : null };
}

export { hooks };
