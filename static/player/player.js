/**
 * player.js
 * =========
 * Page glue for /player (Milestone 1): wires the existing pieces together.
 *
 *   PlayerStaff            player-staff.js            one line engraved, note states, bar marker
 *   lineRanges / lineIndexFor
 *                          player-staff-model.js      norm.lines → the lines the staff shows
 *   buildSteps / attachIds / createFollower
 *                          player-follow.js           step list + wait-for-me matcher
 *   createShellInput       games/cycle-of-shells-input.js   MIDI device + de-duplicated notes
 *   VoicingKeyboard        shared/voicing-keyboard.js on-screen keys (clickable)
 *   VoicingPlayer / loadTone / SALAMANDER_*
 *                          shared/voicing-player.js   schedule playback (Listen); the echo's own sampler is built here from the same samples
 *   listenSchedule / pieceBpm / tempoLabel
 *                          player-listen.js           bar range → timed notes for VoicingPlayer
 *
 * Nothing musical lives here: the norm → steps → ids mapping is the
 * follower's, the engraving is the staff's. This file owns the DOM, the
 * device <select>, the keyboard state classes (pl-key--*), the status line
 * and the sound switches.
 *
 * Render unit: a line (state.lines from lineRanges(norm); state.line is its
 * index). state.bar is the active bar within the line: only its notes are
 * coloured (earlier steps green, the current step blue / green) and it gets
 * the staff's bar marker; the other bars of the line stay plain. The
 * follower is per piece; it advances through the line, and showLine() is
 * called when its next step leaves the drawn range. ← / → page by line,
 * Shift+← / → move by bar.
 *
 * Loop for practice (state.loop mirrors follower.loop()): "Repeat bar" /
 * "Repeat line" toggles act on the current bar / drawn line; tapping two
 * bars on the staff loops that range (state.pendingBar between the taps);
 * "Move on after" (LOOP_EXIT_KEY) is the follower's exitAfter. Setting a
 * loop jumps to its first bar. Prev / Next / Shift+arrows that land outside
 * the range, loading a piece, and a hands change with nothing for that hand
 * in the range turn it off. R restarts at the loop start while looping.
 * The looped bars are tinted on the staff (PlayerStaff 'loop' / 'pending').
 * Pass counts are per hand: a hands change rebuilds the follower, so the
 * outgoing hand's { pass, cleanStreak } is kept in loopCounts (player-follow
 * createLoopCounts) and the incoming hand's is passed back as setLoop's
 * `resume`. A new range, clearing the loop and R reset all three.
 *
 * Trouble spots (player-trouble.js): one pass at a time is recorded — a full
 * run of the piece or one loop pass — from the moment the follower sits at
 * the first step of its range (syncPass: load, restart, loop set / wrap,
 * navigation to the start) until it is done or wraps. Any other jump cancels
 * the recording. At the end of a pass the raw per-step rows go to
 * console.table, and from the second pass of the same piece / hands / range
 * (passHistory: counted at pass end, cleared on piece load, kept across R)
 * the flagged bars are shown under the loop controls with a "Loop these"
 * button (the 1a setLoop) and tinted 'trouble' on the staff; a new loop or
 * piece clears them. Nothing flagged → "Clean pass!".
 *
 * No stress (state.noStress, NO_STRESS_KEY): the follower runs in its
 * 'forgiving' mode (player-follow.js): wrong notes are 'stray' and do
 * nothing here (no red, no count), catch-up jumps report `skipped` steps
 * whose unplayed notes stay plain (follower.skippedNotes in paintStates),
 * Done is a cheer, no trouble pass is recorded (syncPass cancels) and
 * "Move on after" is disabled (forgiving loops run until turned off).
 * Toggling keeps the position (setMode on the live follower).
 *
 * Practice-log hook: practiceEvent(type, detail) is the one funnel the
 * future log (createResultLog, key songlab_results_player) will hang off;
 * today it console.debugs. state.practice.playedMs is active time from
 * note attacks in either mode (player-trouble createPracticeClock: a gap
 * over IDLE_GAP_MS adds nothing).
 *
 * Sound: MIDI echo and on-screen clicks play on the page's own Tone.Sampler
 * (loadEchoSampler: the Salamander samples of voicing-player.js, a second
 * instance) at Tone.immediate(), so live notes neither wait for the
 * context's lookAhead nor share sources with Listen's sampler (a release
 * would cut a Listen note of the same pitch; Listen's releaseAll would
 * silence a held echo).
 *
 * Listen (2a, 2a.1; state.listen, TEMPO_KEY): "▶ Listen" / Space plays the
 * loop range, or the drawn line, once, both hands, at state.tempoPct of the
 * piece's tempo (player-listen listenSchedule on the shared VoicingPlayer).
 * Muted (AudioToggle): Listen does not start and nothing changes.
 * While it plays, judge() does nothing (MIDI and clicks still sound per the
 * usual rules, nothing is judged, counted, recorded or clocked), the
 * follower's paint is cleared and each note lights 'playing' (gold) on the
 * staff and the keyboard as it sounds — its ids looked up at sound time in
 * the drawn line's hits (hitIndex), so tied pieces on a later line light
 * too. A range that spans lines turns the page on Tone.Transport, a little
 * before each line's first bar (listenTurnTo: staff.render without the
 * slide, the follower untouched), and sounding notes are re-lit after the
 * render. Stop, the end of the range, a play() that does not start, and any
 * navigation or state change (every handler calls stopListen() first) run
 * finishListen(): the original line is re-drawn when the page was turned
 * and paintStates() restores the follower exactly as it was.
 *
 * Debug handle: window.__player (state, load, showLine, stepLine, stepBar, setLoop, clearLoop, setNoStress, listen, stopListen, tempo, trouble, practice, staff, keyboard, …).
 */

import { PlayerStaff } from './player-staff.js';
import { buildSteps, attachIds, createFollower, createLoopCounts } from './player-follow.js';
import { createPassRecorder, createPassHistory, createPracticeClock, scorePass, troubleLabel, shouldSuggest, passKey, passRows, THRESHOLDS } from './player-trouble.js';
import { lineRanges, lineIndexFor } from './player-staff-model.js';
import { createShellInput } from '../games/cycle-of-shells-input.js';
import { VoicingKeyboard } from '../shared/voicing-keyboard.js';
import { loadTone, loadSampler, VoicingPlayer, SALAMANDER_URLS, SALAMANDER_BASE } from '../shared/voicing-player.js';
import { listenSchedule, pieceBpm, tempoLabel, DEFAULT_BPM } from './player-listen.js';

const DEVICE_KEY = 'songlab_player_midi_device';   // createShellInput has a fixed key; mapped through its injectable storage
const SOUND_KEY = 'songlab_player_midi_sound';     // "Sound for MIDI notes" checkbox; off by default
const LOOP_EXIT_KEY = 'songlab_player_loop_exit';  // "Move on after N clean passes" select (0 = off); default 3
const LOOP_EXIT_DEFAULT = 3;
const NO_STRESS_KEY = 'songlab_player_no_stress';  // "No stress" checkbox (forgiving follower); off by default
const TEMPO_KEY = 'songlab_player_tempo_pct';       // Listen tempo slider, percent of the piece's tempo (25–110, step 5); default 100
const TEMPO_DEFAULT = 100;
const TEMPO_MIN = 25, TEMPO_MAX = 200, TEMPO_STEP = 1;
const TURN_LEAD = 0.15;                              // seconds before a line's first bar that Listen turns the page (VoicingPlayer plays 80 ms after the schedule time, so the sound follows the turn by ~230 ms)
const ECHO_VELOCITY = 0.7;                           // as cycle-of-shells.js
const CLICK_SECONDS = 0.6;                           // on-screen key: attack + release
const WRONG_FLASH_MS = 500;
const CORRECT_FLASH_MS = 400;                        // minimum green on a key (clicks release at once)
const KEY_MARGIN = 3;                                // keys past the piece's lowest / highest
const KEY_STATES = ['expected', 'correct', 'wrong', 'held', 'playing'];
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
  noStress: $('pl-no-stress'),
  sound: $('pl-sound'),
  prev: $('pl-prev'), next: $('pl-next'), barLabel: $('pl-bar-label'),
  status: $('pl-status'), restart: $('pl-restart'),
  loopBar: $('pl-loop-bar'), loopLine: $('pl-loop-line'), loopExit: $('pl-loop-exit'), noStressHint: $('pl-no-stress-hint'),
  listen: $('pl-listen'), tempo: $('pl-tempo'), tempoReadout: $('pl-tempo-readout'),
  trouble: $('pl-trouble'),
  staffHost: $('pl-staff'),
  keyboardHost: $('pl-keyboard'),
};

const state = {
  piece: null, norm: null, pieces: [],
  lines: [], lineWarnings: [],   // lineRanges(norm): [{ from, to }] and why norm.lines was ignored, if it was
  line: -1,                      // index into lines of the drawn line
  bar: null,                     // the active bar within the drawn line
  hands: 'both',
  noStress: false,        // forgiving follower; see the header
  steps: [], follower: null,
  wrong: 0,
  loop: null,             // follower.loop(): { from, to, exitAfter, pass, cleanStreak } or null
  pendingBar: null,       // tap-to-select: the first tapped bar, waiting for the second
  trouble: null,          // the last scored pass: { pass, score, number, suggested } (console / debug)
  practice: null,         // { playedMs } active time in either mode (set below; practice-log hook)
  tempoPct: TEMPO_DEFAULT,   // Listen tempo, percent of the piece's tempo (TEMPO_KEY)
  listen: { active: false, token: 0, range: null, schedule: null, sounding: new Set() },   // Listen under way; see the header
  held: new Set(),        // midis down on the MIDI device (de-duplicated by the input)
  echoing: new Set(),     // midis sounding on the sampler for MIDI echo
  audioStarted: false,
};
const staff = new PlayerStaff('pl-staff');
const loopCounts = createLoopCounts();     // per-hand { pass, cleanStreak } for the active loop range
const passHistory = createPassHistory();   // passes per piece / hands / range (suggestions from the second); cleared on piece load. Not `history`: that is window.history
let recorder = createPassRecorder([]);     // the pass under way, rebuilt with the follower
const practiceClock = createPracticeClock();   // active time: gaps between notes up to IDLE_GAP_MS
state.practice = { get playedMs() { return practiceClock.playedMs(); }, get lastNoteAt() { return practiceClock.lastNoteAt(); } };

/**
 * Practice-log hook: everything the future log will record passes through
 * here. Types so far: 'load' { piece }, 'pass' { number, from, to, hands,
 * noStress, ranges }, 'mode' { noStress }. Time spent is state.practice.playedMs.
 */
function practiceEvent(type, detail = {}) {
  console.debug(`[player] practice ${type}`, { ...detail, playedMs: practiceClock.playedMs() });
}
let keyboard = null;
let input = null;
let sampler = null;
const keyTimers = new Map();   // `${midi}:${state}` → timeout id

// ════════════════════════════════════════════════════════════════════
// SOUND
// ════════════════════════════════════════════════════════════════════

const muted = () => !!(window.AudioToggle && window.AudioToggle.isMuted());
const midiSound = () => !!(els.sound && els.sound.checked);

let _echoSampler = null;
/** The page's own piano for live notes (echo, clicks): the vendored Salamander samples (cached after VoicingPlayer's load, or vice versa) on a second Tone.Sampler. Shared promise, reset on failure. */
function loadEchoSampler() {
  if (!_echoSampler) {
    _echoSampler = loadTone().then(Tone => new Promise((resolve, reject) => {
      const volume = new Tone.Volume(-6).toDestination();
      const s = new Tone.Sampler({
        urls: SALAMANDER_URLS, baseUrl: SALAMANDER_BASE, release: 1,
        onload: () => resolve(s),
        onerror: err => reject(err instanceof Error ? err : new Error('Salamander samples failed to load')),
      }).connect(volume);
    })).catch(err => { _echoSampler = null; throw err; });
  }
  return _echoSampler;
}
async function ensureSampler() {
  if (sampler) return sampler;
  try { sampler = await loadEchoSampler(); } catch (err) { console.warn('[player] piano unavailable:', err); sampler = null; }
  return sampler;
}
/** Live notes sound now, not lookAhead (100 ms) later; scheduled playback (Listen) keeps its lead. */
const immediate = () => (window.Tone ? window.Tone.immediate() : undefined);

/** Tone.start() must run inside a user gesture: the first click or key press on the page. */
async function startAudio() {
  if (state.audioStarted) return;
  state.audioStarted = true;
  try { if (window.Tone) await window.Tone.start(); } catch (err) { console.warn('[player] Tone.start failed:', err); }
  ensureSampler();                   // preload the echo piano; not awaited
  loadSampler().catch(() => {});     // and Listen's (VoicingPlayer loads it on play; the samples are shared by the browser cache)
}
document.addEventListener('pointerdown', startAudio, { capture: true });
document.addEventListener('keydown', startAudio, { capture: true });

// MIDI echo, as cycle-of-shells.js echoOn / echoOff: only while the key is still down.
function echoOn(midi) {
  if (!state.audioStarted || muted() || !midiSound()) return;
  ensureSampler().then(s => {
    if (s && state.held.has(midi) && !state.echoing.has(midi)) { state.echoing.add(midi); s.triggerAttack(noteName(midi), immediate(), ECHO_VELOCITY); }
  });
}
function echoOff(midi) {
  if (!state.echoing.has(midi)) return;
  state.echoing.delete(midi);
  if (sampler) sampler.triggerRelease(noteName(midi), immediate());
}
function echoAllOff() { for (const m of [...state.echoing]) echoOff(m); }

/** On-screen keys always sound (unless the page is muted). */
function clickSound(midi) {
  if (muted()) return;
  ensureSampler().then(s => { if (s) s.triggerAttackRelease(noteName(midi), CLICK_SECONDS, immediate(), ECHO_VELOCITY); });
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
const followMode = () => (state.noStress ? 'forgiving' : 'strict');
const otherHand = () => (state.hands === 'rh' ? 'lh' : state.hands === 'lh' ? 'rh' : null);

/** Rebuild the step list and follower for the current hands; the follower starts at `bar` (or the first bar). */
function rebuildFollower(bar) {
  state.steps = state.norm ? buildSteps(state.norm, { hands: state.hands }, staff.hits) : [];
  state.follower = createFollower(state.steps, { mode: followMode() });
  recorder = createPassRecorder(state.steps);
  if (bar != null) state.follower.jumpTo(bar);
}

/**
 * Colours live in the current bar only: an id is painted when it is drawn
 * in state.bar, or when `step` is the follower's current step (its tied
 * continuations in the next bar belong to it). Everything else stays plain.
 */
function paintable(id, step) {
  if (state.follower && step === state.follower.current()) return true;
  const h = staff.hits[id];
  return !!h && h.bar === state.bar;
}

/**
 * Paint the staff and keyboard from the follower: steps before the current
 * one → correct (their notes in the current bar only); the current step →
 * pressed notes correct, the rest expected; the unselected hand dimmed
 * within the current bar; the bar marker behind the current bar.
 */
function paintStates() {
  staff.clearStates();
  clearKeys(['expected']);   // green and red flashes end on their own (or on release)
  const other = otherHand();
  staff.setDimmed(other && state.bar != null ? staff.noteIds({ hand: other, bar: state.bar }) : []);
  staff.setBarMarker(state.bar);
  const f = state.follower;
  if (!f) { updateStatus(); return; }
  const cur = f.current();
  for (const s of state.steps) {
    if (cur && s.index >= cur.index) break;
    const skipped = f.skippedNotes(s);   // passed over by a No-stress catch-up: plain, not green
    for (const n of s.notes) if (!skipped.has(n.midi)) for (const id of n.ids) if (paintable(id, s)) staff.setNoteState(id, 'correct');
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

const barsText = (from, to) => (from === to ? `bar ${from}` : `bars ${from}–${to}`);

function updateStatus() {
  const f = state.follower;
  if (!state.norm || !f) { els.status.textContent = ''; els.restart.hidden = true; return; }
  if (state.pendingBar != null) {
    const pl = lineOf(state.pendingBar);
    const where = pl >= 0 && pl !== state.line ? ` (on line ${pl + 1})` : '';
    els.status.textContent = `Bar ${state.pendingBar} tapped${where} · tap the last bar of the range (or bar ${state.pendingBar} again) · Esc cancels`;
    els.restart.hidden = true;
    return;
  }
  if (f.done()) {
    els.status.textContent = state.noStress ? 'Nice — you played it through!' : `Done! ${state.wrong} wrong note${state.wrong === 1 ? '' : 's'}`;
    els.restart.hidden = false;
    return;
  }
  const cur = f.current();
  const L = state.loop;
  let where;
  if (L) where = `Looping ${barsText(L.from, L.to)} · ${state.hands === 'both' ? '' : `${state.hands.toUpperCase()} `}pass ${L.pass}${state.noStress ? '' : ` · clean ${L.cleanStreak}${L.exitAfter > 0 ? ` / ${L.exitAfter}` : ''}`}`;
  else {
    where = cur.bar === state.bar ? `Bar ${cur.bar}` : `Bar ${cur.bar} (showing line ${state.line + 1}, bar ${state.bar})`;   // a paged-to line with no steps for this hand at its first bar
    where += ` · step ${cur.index + 1} / ${state.steps.length}`;
  }
  els.status.textContent = state.noStress ? where : `${where} · wrong: ${state.wrong}`;
  els.restart.hidden = true;
}

/** A note attack from the MIDI device or an on-screen key. */
function judge(midi) {
  const f = state.follower;
  if (!f || state.listen.active) return;   // Listen: the note sounds (echo / click) but is not judged, counted, recorded or clocked
  practiceClock.note();   // time spent counts the same in both modes
  const r = f.noteOn(midi);
  if (r.result === 'wrong') {
    state.wrong += 1;
    recorder.miss(r.step, midi);
    flashKey(midi, 'wrong', WRONG_FLASH_MS);
    updateStatus();
    return;
  }
  if (r.result !== 'correct') return;   // 'ignored', or a No-stress 'stray': nothing shown, nothing counted
  for (const n of r.step.notes) if (n.midi === midi) for (const id of n.ids) if (paintable(id, r.step)) staff.setNoteState(id, 'correct');   // both hands when the pitch is doubled
  setKey(midi, 'expected', false);
  flashKey(midi, 'correct', CORRECT_FLASH_MS);
  if (!r.completed && !r.skipped) { updateStatus(); return; }
  if (r.completed) recorder.complete(r.step);
  if (r.done || r.looped || r.loopExited) endPass();   // a full run or a loop pass is over: score it
  if (r.looped || r.loopExited) {
    const L = state.loop;
    if (r.loopExited && L) banner(`Moved on after ${L.exitAfter} clean pass${L.exitAfter === 1 ? '' : 'es'} of ${barsText(L.from, L.to)}.`);
    syncLoop();   // pass / streak changed, or the loop cleared itself
    syncPass();   // the next loop pass begins at the loop start; after an exit, nothing is recorded
  }
  const next = f.current();
  if (next && !inDrawnRange(next.bar)) { recorder.skipTiming(); showLine(lineOf(next.bar), { bar: next.bar, keep: true }); }   // the next step is on another line (or the loop start): its time is not counted
  else {
    if (next && next.bar !== state.bar) { state.bar = next.bar; updateBarNav(); }   // bar change within the line: repaint, no re-render
    paintStates();
  }
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
  stopListen();
  rebuildFollower(state.bar);
  if (state.loop) {   // re-apply on the new follower with this hand's own pass count (loopCounts); off when the range has nothing for this hand
    const { from, to } = state.loop;
    if (!state.follower.setLoop(from, to, { exitAfter: loopExitAfter(), resume: loopCounts.get(state.hands, from, to) })) banner(`Loop off: ${barsText(from, to)} ${from === to ? 'has' : 'have'} no notes for the ${handName()}.`);
    syncLoop();
  }
  syncPass();
  const cur = state.follower.current();
  if (cur && !inDrawnRange(cur.bar)) showLine(lineOf(cur.bar), { bar: cur.bar, keep: true });   // this line has nothing for that hand from here on
  else {
    if (cur && cur.bar !== state.bar) { state.bar = cur.bar; updateBarNav(); }   // this bar has nothing for that hand
    paintStates();
  }
});

// ── No stress ────────────────────────────────────────────────────
/** Forgiving follower on / off; keeps the position. Cancels the trouble pass under way when turned on; re-syncs it when turned off. */
function setNoStress(on) {
  const want = !!on;
  if (want === state.noStress) { els.noStress.checked = want; return state.noStress; }
  stopListen();
  state.noStress = want;
  els.noStress.checked = want;
  try { localStorage.setItem(NO_STRESS_KEY, want ? '1' : '0'); } catch (_) { /* storage unavailable */ }
  if (state.follower) state.follower.setMode(followMode());
  if (want) { if (recorder.active()) console.log('[player] pass recording cancelled: No stress on'); recorder.cancel(); clearTrouble(); state.trouble = null; clearKeys(['wrong']); }
  else syncPass();
  syncLoop();      // "Move on after" + hint + status
  paintStates();
  practiceEvent('mode', { noStress: want });
  return state.noStress;
}
els.noStress.addEventListener('change', () => { setNoStress(els.noStress.checked); els.noStress.blur(); });
try { state.noStress = localStorage.getItem(NO_STRESS_KEY) === '1'; } catch (_) { state.noStress = false; }
els.noStress.checked = state.noStress;

// ════════════════════════════════════════════════════════════════════
// LINE / BAR NAVIGATION
// ════════════════════════════════════════════════════════════════════

const lineOf = bar => lineIndexFor(state.lines, bar);
const inDrawnRange = bar => { const d = staff.range; return !!d && bar >= d.from && bar <= d.to; };
/** The follower's current bar when it lies in `range`, else `fallback` (a paged-to line with nothing for this hand at its start). */
function activeBar(range, fallback) {
  const cur = state.follower ? state.follower.current() : null;
  return cur && range && cur.bar >= range.from && cur.bar <= range.to ? cur.bar : fallback;
}

function updateBarNav() {
  const k = state.line, K = state.lines.length;
  els.barLabel.textContent = K && k >= 0 ? `Line ${k + 1} / ${K} · Bar ${state.bar}` : 'Line – / – · Bar –';
  els.prev.disabled = !(k > 0);
  els.next.disabled = !(k >= 0 && k < K - 1);
}

/**
 * Engrave line `index` (state.lines[index]), attach its ids to the steps
 * and repaint, with `bar` (default: the line's first bar) as the active
 * bar. With `keep` the follower stays where it is (auto-paging after a
 * step completes, restart, a hands change); otherwise it jumps to `bar`'s
 * first step and the pressed notes are cleared (Prev / Next, arrows).
 * A re-render of the drawn line (same range) has no transition; `animate:
 * false` skips it for a line change too (the restore after Listen).
 */
async function showLine(index, { bar, keep = false, animate = true } = {}) {
  if (!state.norm) return;
  const range = state.lines[index];
  if (!range) return;
  state.line = index;
  const want = bar != null ? bar : range.from;
  if (!keep) { if (state.follower) state.follower.jumpTo(want); clearKeys(['expected', 'correct', 'wrong']); syncPass(); }
  state.bar = activeBar(range, want);
  updateBarNav();
  const result = await staff.render(state.norm, range.from, { to: range.to, animate });
  if (!result) return;   // superseded by a later render, or failed (the staff shows why)
  const warnings = [...state.lineWarnings, ...result.warnings.map(w => `line ${index + 1}: ${w}`)];
  banner(warnings.join('; '));
  attachIds(state.steps, result.hits);
  paintStates();
}

/** ← / → and the buttons: the previous / next line, from its first bar. */
function stepLine(delta) {
  const j = state.line + delta;
  if (state.line < 0 || j < 0 || j >= state.lines.length) return;
  stopListen();
  leaveLoopFor(state.lines[j].from);
  showLine(j);
}

/** Shift+← / →: the previous / next bar; re-rendered (with the transition) only when it is on another line. */
function stepBar(delta) {
  const bars = barNumbers();
  const i = bars.indexOf(state.bar);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= bars.length) return;
  stopListen();
  const bar = bars[j];
  leaveLoopFor(bar);
  goToBar(bar);
}

/** Jump the follower to `bar` and show it: a re-render only when it is on another line. */
function goToBar(bar) {
  const line = lineOf(bar);
  if (line !== state.line || !inDrawnRange(bar)) { showLine(line, { bar }); return; }
  if (state.follower) state.follower.jumpTo(bar);
  syncPass();
  clearKeys(['expected', 'correct', 'wrong']);
  state.bar = activeBar(state.lines[state.line], bar);
  updateBarNav();
  paintStates();
}

/** Navigation that lands outside the looped range turns the loop off; inside it, the loop stays. */
function leaveLoopFor(bar) {
  const L = state.loop;
  if (L && (bar < L.from || bar > L.to)) clearLoop();
}

/** R: from the top, or from the loop start while looping (the pass counts of all three hands start over). */
function restart() {
  if (!state.norm) return;
  const bars = barNumbers();
  if (!bars.length) return;
  stopListen();
  state.wrong = 0;
  cancelPending();
  const f = state.follower;
  let bar;
  if (f && state.loop) {
    const { from, to } = state.loop;
    loopCounts.reset();
    f.setLoop(null); f.setLoop(from, to, { exitAfter: loopExitAfter() });
    const cur = f.jumpTo(from);
    syncLoop();
    bar = cur ? cur.bar : from;
  } else {
    const cur = f ? f.reset() : null;
    bar = cur ? cur.bar : bars[0];
  }
  syncPass();
  clearKeys(['expected', 'correct', 'wrong']);
  showLine(Math.max(0, lineOf(bar)), { bar, keep: true });
}

// ════════════════════════════════════════════════════════════════════
// LOOP
// ════════════════════════════════════════════════════════════════════

const handName = () => (state.hands === 'rh' ? 'right hand' : state.hands === 'lh' ? 'left hand' : 'either hand');

function loopExitAfter() {
  const n = parseInt(els.loopExit.value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
try {
  const saved = localStorage.getItem(LOOP_EXIT_KEY);
  const v = saved == null ? LOOP_EXIT_DEFAULT : parseInt(saved, 10);
  els.loopExit.value = String([...els.loopExit.options].some(o => o.value === String(v)) ? v : LOOP_EXIT_DEFAULT);
} catch (_) { els.loopExit.value = String(LOOP_EXIT_DEFAULT); }

/** state.loop from the follower; toggles, staff tint, status and the active hand's saved counts follow. */
function syncLoop() {
  state.loop = state.follower ? state.follower.loop() : null;
  const L = state.loop;
  if (L) loopCounts.save(state.hands, L); else loopCounts.reset();   // a different range resets the other hands' counts inside save
  const line = state.lines[state.line];
  const on = !!state.norm;
  els.loopBar.disabled = !on; els.loopLine.disabled = !on;
  els.loopExit.disabled = state.noStress;
  els.noStressHint.hidden = !state.noStress;
  els.loopBar.setAttribute('aria-pressed', String(!!(L && state.bar != null && L.from === state.bar && L.to === state.bar)));
  els.loopLine.setAttribute('aria-pressed', String(!!(L && line && L.from === line.from && L.to === line.to)));
  staff.setBarTint('loop', L ? barNumbers().filter(b => b >= L.from && b <= L.to) : []);
  updateStatus();
}

/**
 * Loop bars from..to for the selected hands and jump to the range start
 * (jump: false keeps the follower where it is, for the console). Returns
 * the follower's loop, or null (loop off, banner note) when the range has
 * no steps for these hands. opts.exitAfter overrides the select.
 */
function setLoop(from, to = from, { exitAfter, jump = true } = {}) {
  const f = state.follower;
  if (!f) return null;
  stopListen();
  cancelPending();
  clearTrouble();   // a loop starting is the suggestion taken (or superseded)
  const r = f.setLoop(from, to, { exitAfter: exitAfter == null ? loopExitAfter() : exitAfter });
  if (!r) {
    const a = Math.min(from, to), b = Math.max(from, to);
    banner(`Loop off: ${barsText(a, b)} ${a === b ? 'has' : 'have'} no notes for the ${handName()}.`);
    syncLoop();
    syncPass();
    return null;
  }
  if (jump) goToBar(r.from); else syncPass();   // goToBar syncs the pass itself
  syncLoop();
  return state.loop;
}

function clearLoop() {
  stopListen();
  if (state.follower) state.follower.setLoop(null);
  syncLoop();
  syncPass();   // the range changed under the recording
}

/** Tap-to-select on the staff: the first tap marks a bar as pending; the second tap loops the range. */
function onBarTap(bar) {
  if (!state.follower) return;
  stopListen();
  if (state.pendingBar == null) {
    state.pendingBar = bar;
    staff.setBarTint('pending', [bar]);
    updateStatus();
    return;
  }
  const first = state.pendingBar;
  cancelPending();
  setLoop(first, bar);
}
function cancelPending() {
  if (state.pendingBar == null) return;
  state.pendingBar = null;
  staff.setBarTint('pending', []);
  updateStatus();
}
staff.onBarTap = onBarTap;
/** A pending tap survives paging (Prev / Next here; the arrow keys never cancel), so a range can span lines; any other click cancels it. */
const keepsPending = t => t instanceof Node && (els.staffHost.contains(t) || els.prev.contains(t) || els.next.contains(t));
document.addEventListener('pointerdown', e => {
  if (state.pendingBar != null && !keepsPending(e.target)) cancelPending();
}, { capture: true });

els.loopBar.addEventListener('click', () => {
  els.loopBar.blur();
  if (els.loopBar.getAttribute('aria-pressed') === 'true') clearLoop();
  else if (state.bar != null) setLoop(state.bar, state.bar);
});
els.loopLine.addEventListener('click', () => {
  els.loopLine.blur();
  const line = state.lines[state.line];
  if (els.loopLine.getAttribute('aria-pressed') === 'true') clearLoop();
  else if (line) setLoop(line.from, line.to);
});
els.loopExit.addEventListener('change', () => {
  try { localStorage.setItem(LOOP_EXIT_KEY, els.loopExit.value); } catch (_) { /* storage unavailable */ }
  if (state.loop && state.follower) { state.follower.setLoop(state.loop.from, state.loop.to, { exitAfter: loopExitAfter() }); syncLoop(); }   // same range: passes kept
  els.loopExit.blur();
});

els.prev.addEventListener('click', () => stepLine(-1));
els.next.addEventListener('click', () => stepLine(1));
els.restart.addEventListener('click', restart);
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest('input, select, textarea, [contenteditable]')) return;
  const move = e.shiftKey ? stepBar : stepLine;
  if (e.key === 'ArrowLeft') { move(-1); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { move(1); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') { restart(); e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Spacebar') { if (state.listen.active) stopListen(); else listen(); e.preventDefault(); }   // preventDefault: a focused button must not click as well
  else if (e.key === 'Escape' && state.pendingBar != null) { cancelPending(); e.preventDefault(); }
});

// ════════════════════════════════════════════════════════════════════
// LISTEN (player-listen.js schedule on the shared VoicingPlayer)
// ════════════════════════════════════════════════════════════════════

const listenPlayer = new VoicingPlayer();
let hitIndex = new Map();        // `${bar}|${hand}|${midi}|${onset}` → [id] from staff.hits, rebuilt after every render while listening
const playingKeys = new Map();   // midi → number of sounding notes (a pitch doubled in both hands keeps its key lit until the last ends)
const hitKey = (bar, hand, midi, onset) => `${bar}|${hand}|${midi}|${Math.round(onset * 1000)}`;

function indexHits() {
  hitIndex = new Map();
  for (const h of Object.values(staff.hits)) {
    const k = hitKey(h.bar, h.hand, h.midi, h.onset);
    if (!hitIndex.has(k)) hitIndex.set(k, []);
    hitIndex.get(k).push(h.id);
  }
}
/** The drawn ids of a schedule note: every piece of every span (attack + tie continuations) on the drawn line. */
function noteIdsOf(note) {
  const ids = [];
  for (const sp of note.spans) for (const id of hitIndex.get(hitKey(sp.bar, note.hand, note.midi, sp.onset)) || []) ids.push(id);
  return ids;
}
function lightNote(note, on) {
  const L = state.listen;
  if (on) L.sounding.add(note); else L.sounding.delete(note);
  for (const id of noteIdsOf(note)) staff.setNoteState(id, on ? 'playing' : null);
  const n = (playingKeys.get(note.midi) || 0) + (on ? 1 : -1);
  if (n > 0) playingKeys.set(note.midi, n); else playingKeys.delete(note.midi);
  setKey(note.midi, 'playing', n > 0);
}
/** After a page turn: the notes still sounding light on the new line (a tie's continuation pieces, a long note). */
function relightSounding() {
  for (const note of state.listen.sounding) for (const id of noteIdsOf(note)) staff.setNoteState(id, 'playing');
}

// ── Tempo slider (percent of the piece's tempo; remembered) ──────
function clampPct(v) {
  const n = Math.round(Number(v) / TEMPO_STEP) * TEMPO_STEP;
  return Number.isFinite(n) ? Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, n)) : TEMPO_DEFAULT;
}
/** Set the slider percentage (clamped to 25–110, step 5) and its readout "60% · 49 bpm"; applies on the next Listen. */
function setTempoPct(pct, { save = true } = {}) {
  state.tempoPct = clampPct(pct);
  els.tempo.value = String(state.tempoPct);
  els.tempoReadout.textContent = state.norm ? tempoLabel(state.tempoPct, pieceBpm(state.norm).bpm) : `${state.tempoPct}%`;
  if (save) { try { localStorage.setItem(TEMPO_KEY, String(state.tempoPct)); } catch (_) { /* storage unavailable */ } }
  return state.tempoPct;
}
try { setTempoPct(localStorage.getItem(TEMPO_KEY) ?? TEMPO_DEFAULT, { save: false }); } catch (_) { setTempoPct(TEMPO_DEFAULT, { save: false }); }
els.tempo.addEventListener('input', () => setTempoPct(els.tempo.value));
els.tempo.addEventListener('change', () => els.tempo.blur());   // so Space / arrows go back to the page

/** Button + readout follow the loaded piece (load / unload). */
function syncListen() {
  els.listen.disabled = !state.norm;
  setTempoPct(state.tempoPct, { save: false });
}

/** The range Listen plays: the loop while looping, else the drawn line. */
function listenRange() {
  if (state.loop) return { from: state.loop.from, to: state.loop.to };
  const line = state.lines[state.line];
  return line ? { from: line.from, to: line.to } : null;
}

/**
 * Play the range once at the slider's tempo. Resolves true when playback
 * started. Muted: nothing happens at all. A play() that does not start
 * (blocked, samples missing, superseded) restores the page like the end of
 * playback would, with a banner for blocked / error. stopListen() during the first (loading)
 * await is honoured: the restore runs then, and the playback is stopped as
 * soon as play() reports it started, with no page turns scheduled.
 */
async function listen() {
  const L = state.listen;
  if (!state.norm || L.active || muted()) return false;
  const range = listenRange();
  if (!range) return false;
  startAudio();
  const { bpm: base, assumed } = pieceBpm(state.norm);
  const bpm = base * state.tempoPct / 100;
  const schedule = listenSchedule(state.norm, { from: range.from, to: range.to, bpm });
  if (!schedule.notes.length) { banner(`Nothing to play in ${barsText(range.from, range.to)}.`); return false; }
  cancelPending();
  const token = ++L.token;
  L.active = true; L.range = range; L.schedule = schedule; L.sounding = new Set(); playingKeys.clear();
  if (assumed) banner(`No tempo in this piece: playing at ${Math.round(bpm)} bpm (${state.tempoPct}% of an assumed ${DEFAULT_BPM}).`);
  // The follower's paint goes; held keys stay. paintStates() brings it back in finishListen.
  staff.clearStates(); staff.setDimmed([]); staff.setBarMarker(null); clearKeys(['expected', 'correct', 'wrong']);
  indexHits();
  els.listen.textContent = '■ Stop'; els.listen.setAttribute('aria-pressed', 'true');
  const result = await listenPlayer.play(schedule, {
    onNote: (note, phase) => { if (L.token === token) lightNote(note, phase === 'on'); },
    onEnd: () => { if (L.token === token) finishListen(); },
  });
  if (!result.played) {
    if (L.token === token) finishListen();
    if (result.reason === 'blocked') banner('The browser blocked audio: click the page, then press Listen again.');
    else if (result.reason === 'error') banner('Piano samples did not load; Listen is unavailable.', true);
    return false;
  }
  if (L.token !== token || !L.active) { listenPlayer.stop(); return false; }   // stopped while play() was loading: it started anyway → stop now, no page turns
  scheduleTurns(schedule, token);
  return true;
}

/** Stop playback (no-op when nothing plays); the restore runs synchronously (VoicingPlayer.stop → onEnd), or here when play() is still loading. */
function stopListen() {
  const L = state.listen;
  if (!L.active) return;
  listenPlayer.stop();            // → onEnd → finishListen when playing
  if (L.active) finishListen();   // still loading: nothing to stop yet; listen() stops it when play() resolves
}

/** Playback over or stopped: clear the gold, put the original line back if the page was turned, repaint the follower. */
function finishListen() {
  const L = state.listen;
  if (!L.active) return;
  L.active = false; L.token++;   // late callbacks of this playback are dropped
  for (const note of [...L.sounding]) lightNote(note, false);
  L.sounding.clear(); playingKeys.clear();
  staff.clearStates(); clearKeys(['playing']);
  els.listen.textContent = '▶ Listen'; els.listen.setAttribute('aria-pressed', 'false');
  const want = state.lines[state.line];
  if (want && staff.range && (staff.range.from !== want.from || staff.range.to !== want.to)) showLine(state.line, { bar: state.bar, keep: true, animate: false });
  else paintStates();
}

/**
 * Page turns for a range that spans lines: on the running Transport (play()
 * started it from 0; its own cancel(0) at stop / end clears these), TURN_LEAD
 * before the first bar of each new line, frame-aligned with Tone.Draw. A turn
 * already due (the range starts on a line that is not drawn) happens now.
 */
function scheduleTurns(schedule, token) {
  const Tone = window.Tone;
  const L = state.listen;
  let drawn = state.line;
  for (const { bar, time } of schedule.bars) {
    const line = lineOf(bar);
    if (line < 0 || line === drawn) continue;
    drawn = line;
    const at = time - TURN_LEAD;
    const turn = () => { if (L.active && L.token === token) listenTurnTo(line, token); };
    if (!Tone || at <= Tone.Transport.seconds + 0.05) turn();
    else Tone.Transport.scheduleOnce(t => Tone.Draw.schedule(turn, t), at);
  }
}

/** Draw line `index` for Listen only: no slide, the follower and state.line / state.bar untouched; sounding notes re-lit once drawn. */
async function listenTurnTo(index, token) {
  const L = state.listen;
  const range = state.lines[index];
  if (!range || !L.active) return;
  const result = await staff.render(state.norm, range.from, { to: range.to, animate: false });
  if (!result || !L.active || L.token !== token) return;
  indexHits();
  relightSounding();
}

els.listen.addEventListener('click', () => { els.listen.blur(); if (state.listen.active) stopListen(); else listen(); });

// ════════════════════════════════════════════════════════════════════
// TROUBLE SPOTS
// ════════════════════════════════════════════════════════════════════

/** The range a pass covers: the loop while looping, else the whole piece (first to last step bar). */
function passRange() {
  const L = state.follower ? state.follower.loop() : null;
  if (L) return { from: L.from, to: L.to };
  if (!state.steps.length) return null;
  return { from: state.steps[0].bar, to: state.steps[state.steps.length - 1].bar };
}

/**
 * Start recording a pass when the follower sits at the first step of its
 * range (load, restart, a loop set or wrapped, navigation to the start);
 * cancel the recording otherwise (any other jump breaks the run).
 */
function syncPass() {
  const f = state.follower;
  const range = f ? passRange() : null;
  const cur = f ? f.current() : null;
  if (!range || !cur || state.noStress) { recorder.cancel(); return; }   // No stress: nothing is recorded
  const first = state.steps.find(s => s.bar >= range.from && s.bar <= range.to);
  if (first && first.index === cur.index) { recorder.start(range, cur.index); console.log(`[player] pass recording: ${barsText(range.from, range.to)} (${state.hands}) from step ${cur.index}`); }
  else { if (recorder.active()) console.log(`[player] pass recording cancelled at step ${cur.index} (bar ${cur.bar})`); recorder.cancel(); }
}

/** The pass under way is over: score it, log the raw rows, show the suggestion (from the second pass of this piece / hands / range). */
function endPass() {
  const pass = recorder.end();
  if (!pass || !state.piece) { if (state.noStress) state.trouble = null; return; }   // an unrecorded No-stress pass leaves no stale strict-mode suggestion behind
  const number = passHistory.record(passKey(state.piece, state.hands, pass.from, pass.to));
  const score = scorePass(pass);
  const suggested = shouldSuggest(number);
  state.trouble = { pass, score, number, suggested };
  practiceEvent('pass', { number, from: pass.from, to: pass.to, hands: state.hands, noStress: state.noStress, ranges: score.ranges.map(r => [r.from, r.to]) });
  const med = score.medianMs == null ? '–' : `${Math.round(score.medianMs)} ms`;
  console.log(`[player] pass ${number} of ${barsText(pass.from, pass.to)} (${state.hands}) · ${pass.steps.length} steps · median step ${med}, slow ≥ ${score.slowMs == null ? '–' : `${Math.round(score.slowMs)} ms`} · ${score.ranges.length ? `trouble: ${score.ranges.map(troubleLabel).join(', ')}` : 'clean'}${suggested ? '' : ` · first pass: suggestions from pass ${THRESHOLDS.MIN_PASS_TO_SUGGEST}`}`);
  console.table(passRows(pass, score));
  showTrouble(score, suggested);
}

function showTrouble(score, suggested) {
  const el = els.trouble;
  el.textContent = '';
  el.classList.remove('pl-trouble--clean');
  if (!score.ranges.length) {
    el.classList.add('pl-trouble--clean');
    const label = document.createElement('span'); label.className = 'pl-trouble__label'; label.textContent = 'Clean pass!';
    el.appendChild(label);
    el.hidden = false;
    staff.setBarTint('trouble', []);
    return;
  }
  if (!suggested) { el.hidden = true; staff.setBarTint('trouble', []); return; }
  const label = document.createElement('span'); label.className = 'pl-trouble__label'; label.textContent = 'Trouble spots:';
  el.appendChild(label);
  for (const r of score.ranges) {
    const spot = document.createElement('span'); spot.className = 'pl-trouble__spot';
    const text = document.createElement('span'); text.textContent = troubleLabel(r);
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Loop these';
    btn.setAttribute('aria-label', `Loop ${barsText(r.from, r.to)}`);
    btn.addEventListener('click', () => { btn.blur(); setLoop(r.from, r.to); });
    spot.append(text, btn);
    el.appendChild(spot);
  }
  el.hidden = false;
  staff.setBarTint('trouble', barNumbers().filter(b => score.ranges.some(r => b >= r.from && b <= r.to)));
}

function clearTrouble() {
  els.trouble.hidden = true;
  els.trouble.textContent = '';
  staff.setBarTint('trouble', []);
}

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
  stopListen();
  state.norm = null; state.bar = null; state.steps = []; state.follower = null; state.wrong = 0;
  state.lines = []; state.lineWarnings = []; state.line = -1;
  cancelPending(); clearTrouble(); recorder.cancel();
  updateBarNav(); staff.clear(); clearKeys(); syncLoop(); syncListen();
}

async function load(name) {
  stopListen();
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
      const lr = lineRanges(norm);
      state.lines = lr.ranges; state.lineWarnings = lr.warnings; state.line = -1;
      for (const w of lr.warnings) console.warn(`[player] ${name}: ${w}`);
      mountKeyboard(norm);
      clearKeys();
      staff.clear();          // old hits must not attach to the new piece's steps
      cancelPending(); clearTrouble();
      passHistory.reset();    // pass counts start over with the piece (a restart keeps them: it begins the next pass)
      rebuildFollower(null);  // a new follower: no loop
      syncLoop();
      syncListen();
      syncPass();             // the first pass of the piece begins at step 0
      practiceEvent('load', { piece: name });
      const cur = state.follower.current();
      const bar = cur ? cur.bar : bars[0];
      showLine(Math.max(0, lineOf(bar)), { bar, keep: true });
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
  state, load, pieces: () => state.pieces, staff, showLine, stepLine, stepBar, restart,
  setLoop, clearLoop, setNoStress,
  listen, stopListen, get tempo() { return state.tempoPct; }, set tempo(v) { setTempoPct(v); }, listenPlayer,
  get trouble() { return state.trouble; }, get practice() { return state.practice; }, loopCounts, passHistory, get recorder() { return recorder; }, thresholds: THRESHOLDS,
  get keyboard() { return keyboard; }, get input() { return input; }, get follower() { return state.follower; }, get steps() { return state.steps; },
  noteOn: onMidiNoteOn, noteOff: onMidiNoteOff,
};
