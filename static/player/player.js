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
 *   loadTone / SALAMANDER_*
 *                          shared/voicing-player.js   Tone + the piano samples; the page builds its own samplers (echo, guide) from them
 *   listenSchedule / pieceBpm / tempoLabel
 *                          player-listen.js           bar range → timed notes (the clock's items)
 *   createBeatClock        beat-clock.js              the shared beat clock: Listen, play-along, metronome, page turns (3)
 *   createTimingLog        player-playalong.js        play-along's expected / played pairing and per-pass timing log (3)
 *   metronome / patternFor  metronome.js               the click, driven by the clock's beats (2b, 3)
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
 * in the range turn it off, as do Esc and "✕ Clear loop" (cancelLoop, which
 * also drops a pending tap). R restarts at the loop start while looping.
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
 * context's lookAhead nor share sources with the guide piano Listen and
 * play-along use (a release would cut a guide note of the same pitch; the
 * guide's releaseAll would silence a held echo).
 *
 * Shared beat clock (3; beat-clock.js, `clock`): one clock in beats on
 * Tone's AudioContext with a lookahead scheduler — not Tone.Transport, and
 * VoicingPlayer is no longer used on this page. Listen, play-along, the
 * metronome and the page turns all run off it: notes are clock items by
 * quarter position (player-listen listenSchedule at 60 bpm, where a second
 * is a quarter; an 'on' and an 'off' per note), sounded from the clock's
 * ahead-of-time 'item' event at its exact audio time on the guide piano
 * (loadGuidePiano: a Tone.Sampler of its own through guideOut), painted
 * from the on-time one. The tempo slider calls clock.setTempo while it
 * runs: everything follows at once and stays in phase.
 *
 * Listen (2a, 2a.1, 3; state.listen with mode 'listen', TEMPO_KEY):
 * "▶ Listen" / Space. With a loop set it repeats the loop until stopped
 * (count-in on the first pass only); with none it plays from the current
 * bar to the END of the piece, turning pages (transportRange). Both hands.
 * Muted (AudioToggle): Listen does not start and nothing changes. While it
 * plays, judge() does nothing (MIDI and clicks still sound per the usual
 * rules, nothing is judged, counted, recorded or clocked), the follower's
 * paint is cleared and each note lights 'playing' (purple) on the staff
 * and the keyboard as it sounds — its ids looked up at sound time in the
 * drawn line's hits (hitIndex), so tied pieces on a later line light too —
 * and the bar marker follows the clock. A bar on another line turns the
 * page when the clock schedules it, up to 150 ms before its downbeat
 * (listenTurnTo: staff.render without the slide, the follower untouched;
 * repaintTransport puts the transport's paint back). Stop, the end of the
 * piece, a start that fails, and any navigation or state change (every
 * handler calls stopListen() first) run finishListen(): the original line
 * is re-drawn when the page was turned and paintStates() restores the
 * follower exactly as it was.
 *
 * Play-along (3; mode 'playalong'; player-playalong.js `timing`): "♪ Play
 * along" / P, Space pauses it. The same transport, range and looping as
 * Listen, and the score moves with the clock, never waiting. The whole
 * piece plays underneath at the Guide volume (GUIDE_KEY, 0–100, default
 * 35; 0 = click only: no notes are triggered). Hands decides which notes
 * are expected from you (isMine); the guide plays everything. Feedback is
 * light: a note of yours played within HIT_WINDOW_MS of its time flashes
 * green as it passes (flashNote); one you did not play is left faint for
 * the rest of that pass (L.missed, the staff's dim class). No counts, no
 * stats. Every expected and every played note goes into the quiet timing
 * log (pitch, bar / beat, actual audio time — audioTimeOf maps the key's
 * performance.now() onto the audio clock — and the offset in ms, early
 * negative); one log per pass — getLastPass() is the newest ended pass
 * with a played note in it, getPasses() the last ten. A played note that
 * paired with nothing is an extra: extra: true, offsetMs null.
 * Keys only: the pedal never counts. Practice mode is untouched (the
 * follower is not fed while a transport runs).
 *
 * Pause (3.1): Space, P and the strip's two buttons PAUSE the transport
 * in place (pauseListen → finishListen({ pause: true })): the clock and
 * the sound stop, the pass under way is closed in the timing log
 * (complete: false), but the page and the bar marker stay and the button
 * reads "▶ Resume" (state.listen.paused: { mode, range, bar }). Space, or
 * the same button / P, resumes (resumeListen): the same range from the
 * START of the bar it was paused in (beat-clock start({ startBar })), the
 * count-in setting first, a new pass in the log. While paused nothing is
 * judged (judge returns). R, every navigation and every state change go
 * through stopListen(), which ends a paused transport for good and puts
 * the practice page back, as it does for a playing one.
 *
 * Feel + Song notes (norm.feel / anchors / songNotes; tools/pieces/
 * README.md): piece information only — nothing here touches the
 * transport, the clock, the judging or the timing log. The Piece card
 * gets a FEEL row ("Rubato" / "Strict") when the piece sets one. Song
 * notes are the piece's ordered sections { id, title, body } (songNotesOf;
 * a legacy feelNote counts as the one section "feel"): a "Song notes"
 * button after the title, shown only when there are some, and N, toggle a
 * panel that slides in from the right over the page (setNotesOpen; fixed,
 * so the staff does not reflow), one heading + body per section
 * (renderRich: paragraphs, **bold**, *italic*). Close, Esc and N close it;
 * focus goes into the panel on open and back to the button on close; a
 * transport under way keeps running; open / closed is remembered per
 * piece (NOTES_OPEN_KEY). The FEEL value links to the "feel" section when
 * there is one. Anchors go to the staff (staff.setAnchors: gold ticks for
 * a bar list, gold-tinted barlines for 'downbeats') in every mode, and
 * note:expected / note:played / note:missed carry anchor: true for a note
 * at beat 1 of an anchor bar (isAnchor), so a later timing analysis can
 * weight them.
 *
 * Events + controller (3): `bus` emits playalong:start / stop, listen:start
 * / stop, pass:start / end, note:expected / played / missed;
 * window.songlabPlayer (also this module's export) is the controller —
 * listen, playAlong, stop, pause, resume, setTempo, setLoop, clearLoop, on,
 * getLastPass, getPasses.
 * The hook for the future scoring and coach; nothing on the page uses it.
 *
 * Metronome + count-in (2b, 3; state.metro, METRO_* keys, metronome.js):
 * the Listen card's bottom row — Metronome checkbox, click Volume 0–100,
 * Count-in 0 / 1 / 2 bars — all remembered. The clock drives the click:
 * its 'beat' listener calls metronome.click(audioTime) for every count-in
 * beat (whether or not the click is on) and, while the checkbox is on, for
 * every beat after — read per beat, so the checkbox joins or leaves
 * mid-play, and the click follows the live tempo with the notes. Stop /
 * Space during the count-in cancels it (clock.stop: no note is ever
 * scheduled); finishListen stops every click already queued.
 *
 * Sustain pedal (3; state.pedal / state.sustained): CC64 from the selected
 * input. For "Sound for my notes" only: while it is down a key release
 * does not stop the echo; lifting it releases every note whose key is
 * already up; re-striking a pedalled note releases and re-attacks it. A
 * device change or disconnect lets go of the pedal and everything it held.
 * Judging (practice and play-along) is by keys: state.held never includes
 * a pedalled note.
 *
 * Debug handle: window.__player (state, load, showLine, stepLine, stepBar, setLoop, clearLoop, setNoStress, listen, playAlong, stopListen, tempo, clock, timing, bus, metronome, trouble, practice, staff, keyboard, …).
 */

import { PlayerStaff } from './player-staff.js';
import { buildSteps, attachIds, createFollower, createLoopCounts } from './player-follow.js';
import { createPassRecorder, createPassHistory, createPracticeClock, scorePass, troubleLabel, shouldSuggest, passKey, passRows, THRESHOLDS } from './player-trouble.js';
import { lineRanges, lineIndexFor } from './player-staff-model.js';
import { createShellInput } from '../games/cycle-of-shells-input.js';
import { VoicingKeyboard } from '../shared/voicing-keyboard.js';
import { loadTone, SALAMANDER_URLS, SALAMANDER_BASE } from '../shared/voicing-player.js';   // Tone + the piano samples only; VoicingPlayer itself is no longer used here (3)
import { listenSchedule, pieceBpm, tempoLabel, DEFAULT_BPM } from './player-listen.js';
import { metronome, patternFor, DEFAULT_VOLUME as METRO_VOLUME_DEFAULT } from './metronome.js';
import { createBeatClock, LOOKAHEAD } from './beat-clock.js';
import { createTimingLog, audioTimeFromStamp, HIT_WINDOW_MS } from './player-playalong.js';

const DEVICE_KEY = 'songlab_player_midi_device';   // createShellInput has a fixed key; mapped through its injectable storage
const SOUND_KEY = 'songlab_player_midi_sound';     // "Sound for MIDI notes" checkbox; off by default
const LOOP_EXIT_KEY = 'songlab_player_loop_exit';  // "Move on after N clean passes" select (0 = off); default 3
const LOOP_EXIT_DEFAULT = 3;
const NO_STRESS_KEY = 'songlab_player_no_stress';  // "No stress" checkbox (forgiving follower); off by default
const TEMPO_KEY = 'songlab_player_tempo_pct';       // Listen tempo slider, percent of the piece's tempo (25–110, step 5); default 100
const TEMPO_DEFAULT = 100;
const TEMPO_MIN = 25, TEMPO_MAX = 200, TEMPO_STEP = 1;
const METRO_KEY = 'songlab_player_metro_on';          // Metronome checkbox (click while Listen plays); off by default
const METRO_VOLUME_KEY = 'songlab_player_metro_volume'; // click volume 0–100; default 70
const COUNT_IN_KEY = 'songlab_player_count_in';       // count-in bars 0 / 1 / 2 before Listen's first note; default 1
const COUNT_IN_DEFAULT = 1, COUNT_IN_MAX = 2;
const RACK_OPEN_KEY = 'songlab_player_rack_open';     // control rack open ('1') / closed ('0'); read only when auto-collapse is off
const RACK_AUTO_KEY = 'songlab_player_rack_auto';     // "Hide controls while playing" checkbox; on by default ('0' = off)
const RACK_MS = 150;                                   // the rack's open / close animation (player.html .pl-rack-shell)
const GUIDE_KEY = 'songlab_player_guide_volume';      // play-along "Guide volume" 0–100 (0 = click only); default 35
const GUIDE_DEFAULT = 35;
const NOTES_OPEN_KEY = 'songlab_player_notes_open';   // + ':<piece>' → '1' / '0': the Song notes panel open or closed, per piece; closed by default
const FEEL_LABELS = { rubato: 'Rubato', strict: 'Strict' };
const GUIDE_VELOCITY = { rh: 0.8, lh: 0.75 };        // Listen / guide note velocities (VoicingPlayer's melody / bass)
const HIT_WINDOW_S = HIT_WINDOW_MS / 1000;           // play-along: a played note pairs with an expected one within this (player-playalong.js)
const SETTLE_S = 0.1;                                // extra wait before a note is called missed (covers the output latency between the two clocks)
const END_TAIL_S = 0.1;                              // Listen: after the last bar's end before the page is restored
const PEDAL_DOWN = 64;                               // CC64 at or above this: sustain pedal down
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
  title: $('pl-piece-title'), banner: $('pl-banner'),
  infoKey: $('pl-info-key'), infoTime: $('pl-info-time'), infoTempo: $('pl-info-tempo'),   // Piece card
  infoFeelLabel: $('pl-info-feel-label'), infoFeelRow: $('pl-info-feel-row'), infoFeel: $('pl-info-feel'),   // Piece card: FEEL row
  notesBtn: $('pl-notes-btn'), notesPanel: $('pl-notes-panel'), notesBody: $('pl-notes-body'), notesClose: $('pl-notes-close'), notesHint: $('pl-shortcut-notes'),   // Song notes: header button, slide-in panel, the N hint
  select: $('pl-piece-select'),
  device: $('pl-device-select'), deviceStatus: $('pl-device-status'), deviceDot: $('pl-device-dot'), deviceLight: $('pl-device-light'),
  mute: $('pl-mute'),
  hands: $('pl-hands'),
  noStress: $('pl-no-stress'),
  sound: $('pl-sound'),           // "Sound for my notes": the echo of MIDI notes
  audioHint: $('pl-audio-hint'),  // "Click anywhere to turn on sound." (MIDI card; see startAudio)
  prev: $('pl-prev'), next: $('pl-next'), barLabel: $('pl-bar-label'),
  status: $('pl-status'), restart: $('pl-restart'),
  loopBar: $('pl-loop-bar'), loopLine: $('pl-loop-line'), loopClear: $('pl-loop-clear'), loopExit: $('pl-loop-exit'), noStressHint: $('pl-no-stress-hint'),
  listen: $('pl-listen'), playAlong: $('pl-playalong'), tempo: $('pl-tempo'), tempoReadout: $('pl-tempo-readout'),
  guide: $('pl-guide'), guideReadout: $('pl-guide-readout'),   // Listen card: play-along guide volume
  metro: $('pl-metro'), metroVolume: $('pl-metro-volume'), countIn: $('pl-count-in'),   // Listen card, bottom row (2b)
  trouble: $('pl-trouble'),
  rackShell: $('pl-rack'), rackToggle: $('pl-rack-toggle'), rackAuto: $('pl-rack-auto'),   // collapsible rack + ⚙ Controls (strip) + "Hide controls while playing" (Mode card)
  summary: $('pl-summary'), summaryText: $('pl-summary-text'), summaryDot: $('pl-summary-dot'), summaryDevice: $('pl-summary-device'),   // strip settings summary
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
  listen: { active: false, started: false, paused: null, startBar: null, run: 0, mode: null, token: 0, range: null, schedule: null, bar: null, pass: 1, drawn: -1, sounding: new Set(), flash: new Map(), missed: new Set(), guideOn: new Set() },   // the transport (Listen or play-along) under way; see the header. mode: 'listen' | 'playalong'; range: { from, to, loop }; paused: { mode, range, bar } while a transport is paused (else null); startBar: the bar this start began at (a resume: the paused bar); run: counts fresh starts (a resume keeps it); bar / pass: where the clock is; drawn: the line on the staff; flash / missed: play-along feedback
  guide: GUIDE_DEFAULT,      // play-along guide volume 0–100 (GUIDE_KEY)
  metro: { on: false, volume: METRO_VOLUME_DEFAULT, countIn: COUNT_IN_DEFAULT },   // Metronome row (METRO_KEY, METRO_VOLUME_KEY, COUNT_IN_KEY)
  rack: { open: false, auto: true, armed: false, pointer: false },   // control rack: open; auto-collapse on; armed = opened since the last auto-collapse; pointer = a drag inside it is under way (RACK_OPEN_KEY, RACK_AUTO_KEY)
  held: new Set(),        // midis down on the MIDI device (de-duplicated by the input)
  echoing: new Set(),     // midis sounding on the sampler for MIDI echo, key down
  sustained: new Set(),   // midis still sounding on the echo sampler with the key up: held by the pedal
  pedal: false,           // sustain pedal (CC64 ≥ 64) down
  audioStarted: false,    // the context has run at least once (the pianos are preloading)
  anchors: null,          // norm.anchors, normalised: null | 'downbeats' | Set of bar numbers (anchorsOf)
  notes: [],              // the piece's Song notes: [{ id, title, body }] (songNotesOf)
  noteHeadings: new Map(), // section id → its heading in the panel
  notesOpen: false,       // the Song notes panel is showing
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
let guidePiano = null;   // Listen / play-along guide: its own Tone.Sampler (loadGuidePiano)
let guideOut = null;     // …and the Tone.Gain it plays through (Guide volume)

/** The one musical clock: Listen, play-along, the metronome and the page turns all run off it (beat-clock.js). */
const clock = createBeatClock();
/** Play-along's quiet timing log (player-playalong.js): one entry per expected and per played note, per pass. */
const timing = createTimingLog();
/**
 * The player's event bus — the hook for the future scoring and coach
 * (window.songlabPlayer.on). Events: 'playalong:start' / 'playalong:stop',
 * 'listen:start' / 'listen:stop', 'pass:start' / 'pass:end' (with the loop
 * range; pass:end carries the pass's timing log), 'note:expected',
 * 'note:played', 'note:missed' — notes as { pitch, hand, bar, beat,
 * audioTime, offsetMs, pass, anchor } (anchor: the note is at beat 1 of
 * one of the piece's anchor bars, norm.anchors). on('*', (detail, type) => …) hears all.
 */
const bus = (() => {
  const map = new Map();
  return {
    on(type, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type).delete(fn);
    },
    emit(type, detail = {}) {
      for (const key of [type, '*']) for (const fn of [...(map.get(key) || [])]) { try { fn(detail, type); } catch (err) { console.error(`[player] ${type} listener`, err); } }
    },
  };
})();
const keyTimers = new Map();   // `${midi}:${state}` → timeout id

// ════════════════════════════════════════════════════════════════════
// SOUND
// ════════════════════════════════════════════════════════════════════

const muted = () => !!(window.AudioToggle && window.AudioToggle.isMuted());
const midiSound = () => !!(els.sound && els.sound.checked);

/** A Salamander piano (the vendored samples of voicing-player.js) on its own Tone.Sampler, connected to whatever `output(Tone)` returns. */
function makePiano(output) {
  return loadTone().then(Tone => new Promise((resolve, reject) => {
    const out = output(Tone);
    const s = new Tone.Sampler({
      urls: SALAMANDER_URLS, baseUrl: SALAMANDER_BASE, release: 1,
      onload: () => resolve(s),
      onerror: err => reject(err instanceof Error ? err : new Error('Salamander samples failed to load')),
    }).connect(out);
  }));
}
let _echoSampler = null;
/** The page's piano for live notes (echo, clicks). Shared promise, reset on failure. */
function loadEchoSampler() {
  if (!_echoSampler) _echoSampler = makePiano(Tone => new Tone.Volume(-6).toDestination()).catch(err => { _echoSampler = null; throw err; });
  return _echoSampler;
}
let _guidePiano = null;
/** The piano Listen and the play-along guide play on: a second sampler (the browser caches the files) through its own gain, so the Guide volume and a stop never touch live notes. */
function loadGuidePiano() {
  if (!_guidePiano) {
    _guidePiano = makePiano(Tone => { guideOut = new Tone.Gain(1).connect(new Tone.Volume(-6).toDestination()); return guideOut; })
      .catch(err => { _guidePiano = null; guideOut = null; throw err; });
  }
  return _guidePiano;
}
async function ensureSampler() {
  if (sampler) return sampler;
  try { sampler = await loadEchoSampler(); } catch (err) { console.warn('[player] piano unavailable:', err); sampler = null; }
  return sampler;
}
/** Live notes sound now, not lookAhead (100 ms) later; scheduled playback (Listen) keeps its lead. */
const immediate = () => (window.Tone ? window.Tone.immediate() : undefined);

const audioRunning = () => !!(window.Tone && window.Tone.context && window.Tone.context.state === 'running');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WAKE_TIMEOUT_MS = 400;   // Tone.start() with no user activation stays pending: give up and say so

/**
 * Wake the AudioContext. Chrome starts it suspended and only lets it run
 * after the page has had a user activation (a click or key press; sticky,
 * so a later resume() outside the handler also works), and MIDI input is
 * not one. Called on every pointerdown / keydown (capture), from the
 * "Sound for my notes" checkbox, the on-screen keys and Listen, and from
 * a MIDI note arriving while the context is suspended. Tone.js loads
 * lazily, so this loads it first rather than skipping the start (the
 * old one-shot flag did that, which left the context suspended until
 * mute/unmute or Listen woke it). Resolves to whether audio is running;
 * shared promise while a wake is under way. Not a user gesture and Chrome
 * refuses: the MIDI card shows "Click anywhere to turn on sound." until
 * the context runs (hideAudioHint, also from the context's own statechange).
 */
let _waking = null;
function startAudio({ fromMidi = false } = {}) {
  if (audioRunning()) { onAudioRunning(); return Promise.resolve(true); }
  if (_waking) return _waking;
  _waking = loadTone()
    .then(Tone => { watchAudioState(Tone); return Promise.race([Tone.start().then(() => true), sleep(WAKE_TIMEOUT_MS).then(() => false)]); })
    .then(() => audioRunning())
    .catch(err => { console.warn('[player] Tone.start failed:', err); return false; })
    .then(ok => {
      _waking = null;
      if (ok) onAudioRunning();
      else if (fromMidi) showAudioHint();
      return ok;
    });
  return _waking;
}
/** First time the context runs: preload the pianos. Every time: drop the hint. */
function onAudioRunning() {
  hideAudioHint();
  if (state.audioStarted) return;
  state.audioStarted = true;
  ensureSampler();                   // preload the echo piano; not awaited
  loadGuidePiano().catch(() => {});  // and Listen's / the guide's (the samples are shared by the browser cache)
}
/** A pending Tone.start() (no activation yet) resolves on the next gesture anywhere, even one our own listener misses: follow the context's state. */
let _watching = false;
function watchAudioState(Tone) {
  if (_watching || !Tone.context || typeof Tone.context.on !== 'function') return;
  _watching = true;
  Tone.context.on('statechange', () => { if (audioRunning()) onAudioRunning(); });
}
function showAudioHint() { if (els.audioHint && !audioRunning()) els.audioHint.hidden = false; }
function hideAudioHint() { if (els.audioHint) els.audioHint.hidden = true; }
document.addEventListener('pointerdown', () => startAudio(), { capture: true });
document.addEventListener('keydown', () => startAudio(), { capture: true });

// MIDI echo, as cycle-of-shells.js echoOn / echoOff: while the key is down — and, with the sustain pedal down, until the pedal lifts.
function echoOn(midi) {
  if (muted() || !midiSound()) return;
  const play = s => {
    if (!s || !state.held.has(midi) || state.echoing.has(midi)) return;
    if (state.sustained.delete(midi)) s.triggerRelease(noteName(midi), immediate());   // re-striking a pedalled note: the old one ends, the new attack is clean
    state.echoing.add(midi);
    s.triggerAttack(noteName(midi), immediate(), ECHO_VELOCITY);
  };
  if (audioRunning()) { ensureSampler().then(play); return; }
  if (els.audioHint && !els.audioHint.hidden) return;   // Chrome already refused once: the next click wakes it (no console warning per key)
  startAudio({ fromMidi: true }).then(ok => { if (ok) ensureSampler().then(play); });   // still held when the context runs: it sounds then
}
function echoOff(midi) {
  if (!state.echoing.has(midi)) return;
  state.echoing.delete(midi);
  if (state.pedal) { state.sustained.add(midi); return; }   // the pedal holds the sound; the key is up (judging never sees it: state.held is keys only)
  if (sampler) sampler.triggerRelease(noteName(midi), immediate());
}
/** Pedal up (or gone): every note it was holding whose key is already up stops. */
function releaseSustained() {
  for (const m of state.sustained) if (sampler) sampler.triggerRelease(noteName(m), immediate());
  state.sustained.clear();
}
/** Sustain pedal, CC64 from the selected input (createShellInput 'pedal'): sound only — it never holds a key for judging. */
function onPedal(value) {
  const down = Number(value) >= PEDAL_DOWN;
  if (down === state.pedal) return;
  state.pedal = down;
  if (!down) releaseSustained();
}
function echoAllOff() { for (const m of [...state.echoing]) echoOff(m); releaseSustained(); }

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
  els.restart.disabled = !state.norm || !f;   // ↺ Start over is always shown; it needs a piece
  els.loopClear.disabled = !state.norm || !f || (!state.loop && state.pendingBar == null);   // ✕ Clear loop: something to clear
  els.loopClear.hidden = els.loopClear.disabled;   // in the strip only while a loop (or a first tap) is set
  if (!state.norm || !f) { els.status.textContent = ''; return; }
  if (state.pendingBar != null) {
    const pl = lineOf(state.pendingBar);
    const where = pl >= 0 && pl !== state.line ? ` (on line ${pl + 1})` : '';
    els.status.textContent = `Bar ${state.pendingBar} tapped${where} · tap the last bar of the range (or bar ${state.pendingBar} again) · Esc cancels`;
    return;
  }
  if (f.done()) {
    els.status.textContent = state.noStress ? 'Nice — you played it through!' : `Done! ${state.wrong} wrong note${state.wrong === 1 ? '' : 's'}`;
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
}

/** A note attack from the MIDI device or an on-screen key. */
function judge(midi, perfMs) {
  const f = state.follower;
  if (state.listen.active) {   // Listen: the note sounds (echo / click) but is not judged, counted, recorded or clocked. Play-along: logged against the clock, not the follower
    if (state.listen.mode === 'playalong') playAlongNote(midi, perfMs);
    return;
  }
  if (state.listen.paused) return;   // paused: the score shows where the transport stopped, not the follower — nothing is judged until Resume or a full stop (R, any navigation)
  if (!f) return;
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

function onMidiNoteOn(midi, t) {   // t: performance.now() at the event (createShellInput)
  autoCollapse();   // the first note after the rack was opened closes it (never mid-drag inside it)
  state.held.add(midi);
  setKey(midi, 'held', true);
  echoOn(midi);
  judge(midi, t);
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
  judge(midi, performance.now());
  if (state.follower) state.follower.noteOff(midi);
}

/**
 * Device <select> + connected light + strip summary, all from the input's
 * one selection (input.deviceName / listDevices) in syncDevice. Hot-plug:
 * createShellInput resolves the selection on every MIDIAccess statechange
 * (also when the page loaded with no input) and emits 'status' + 'devices';
 * both land in syncDevice, as do load and a manual choice in the select.
 * Subscribed once; init is not called again, so handlers never double.
 */
let lastDevice = null;  // the device at the last syncDevice: a change (unplug, switch) lets go of the pedal
let midiMessage = '';   // the input's last status ("Connected: RD-2000", "Remembered device … not found", …): the light's tooltip
async function setupMidi() {
  const storage = playerDeviceStorage();
  input = createShellInput({ storage });
  input.on('noteOn', onMidiNoteOn);
  input.on('noteOff', onMidiNoteOff);
  input.on('pedal', onPedal);
  input.on('status', text => { midiMessage = text; syncDevice(); });
  input.on('devices', () => syncDevice());
  try { await input.init(); } catch (err) { midiMessage = `MIDI unavailable: ${err.message}`; }
  syncDevice();
}
/** Everything that shows the MIDI selection: the Device select rebuilt from the live list, the light, its tooltip, the strip summary. */
function syncDevice() {
  const name = input ? input.deviceName : null;
  const on = !!name;
  if (name !== lastDevice) {   // disconnected or switched: the input has released its keys (noteOff each); the pedal goes up with them, so nothing keeps sounding
    lastDevice = name;
    state.pedal = false;
    releaseSustained();
  }
  els.deviceDot.classList.toggle('pl-dot--on', on);
  els.deviceStatus.textContent = on ? 'Connected' : 'Not connected';
  els.deviceLight.title = midiMessage || 'Not connected yet';
  const sel = els.device;
  const list = input ? input.listDevices() : [];
  sel.textContent = '';
  if (!list.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(no MIDI inputs)'; sel.appendChild(o); sel.disabled = true; }
  else {
    sel.disabled = false;
    for (const d of list) {
      const o = document.createElement('option');
      o.value = d.name; o.textContent = d.name;
      if (d.name === name) o.selected = true;
      sel.appendChild(o);
    }
  }
  syncSummary();
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
els.device.addEventListener('change', e => {
  if (input && e.target.value) input.selectDevice(e.target.value);   // emits status + devices → syncDevice
  syncDevice();   // and once more here: a name that is gone snaps the select back to what is attached
});

// ── Mute (MIDI card): the site AudioToggle's state, changed through its button ──
const MUTE_ICON_ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const MUTE_ICON_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
function syncMute() {
  const m = muted();
  els.mute.innerHTML = `${m ? MUTE_ICON_OFF : MUTE_ICON_ON}<span>${m ? 'Muted' : 'Mute'}</span>`;
  els.mute.setAttribute('aria-pressed', String(m));
  els.mute.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  els.mute.title = m ? 'Sound off — click to unmute (same as the speaker in the header)' : 'Sound on — click to mute (same as the speaker in the header)';
}
els.mute.addEventListener('click', () => {
  els.mute.blur();
  const toggle = document.querySelector('.audio-toggle-btn');   // AudioToggle's own (hidden) button: flips its state, saves it, fires tonnetz:mute-changed
  if (toggle) toggle.click(); else syncMute();
});
window.addEventListener('tonnetz:mute-changed', syncMute);
if (window.AudioToggle) syncMute(); else window.addEventListener('DOMContentLoaded', syncMute);

// ── Sound for my notes (the echo; off by default; remembered) ─────
try { els.sound.checked = localStorage.getItem(SOUND_KEY) === '1'; } catch (_) { els.sound.checked = false; }
els.sound.addEventListener('change', () => {
  try { localStorage.setItem(SOUND_KEY, els.sound.checked ? '1' : '0'); } catch (_) { /* storage unavailable */ }
  if (els.sound.checked) { startAudio(); ensureSampler(); } else echoAllOff();   // the change is a gesture: wake the context here too (pointerdown already did, unless it was keyboard-toggled through a label)
  els.sound.blur();
});

// ── Hands ────────────────────────────────────────────────────────
els.hands.addEventListener('change', e => {
  if (!(e.target instanceof HTMLInputElement) || !e.target.checked) return;
  state.hands = e.target.value === 'lh' || e.target.value === 'rh' ? e.target.value : 'both';
  e.target.blur();   // so ← / → / R go back to the page, not the radio group
  syncSummary();
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
  if (state.listen.active || state.listen.paused) repaintTransport();   // a transport started (or paused) while this render was under way (Listen → Play along): its paint, not the follower's
  else paintStates();
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
  syncSummary();
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
/** Esc and ✕ Clear loop: drop a pending first tap and clear the active loop; the position stays where it is. */
function cancelLoop() {
  cancelPending();
  if (state.loop) clearLoop();   // toggles off, staff tint cleared, status without "Looping" (syncLoop)
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
els.loopClear.addEventListener('click', () => { els.loopClear.blur(); cancelLoop(); });
els.loopExit.addEventListener('change', () => {
  try { localStorage.setItem(LOOP_EXIT_KEY, els.loopExit.value); } catch (_) { /* storage unavailable */ }
  if (state.loop && state.follower) { state.follower.setLoop(state.loop.from, state.loop.to, { exitAfter: loopExitAfter() }); syncLoop(); }   // same range: passes kept
  els.loopExit.blur();
});

/** Global shortcuts yield these keys to a focused control that uses them itself: Space / Enter press a button, Enter follows a link (Space is given up on a link too, so a focused control never starts Listen). */
const ACTIVATION_KEYS = new Set([' ', 'Spacebar', 'Enter']);
const ACTIVATABLE = 'button, a[href], summary, [role="button"], [role="link"]';

els.prev.addEventListener('click', () => stepLine(-1));
els.next.addEventListener('click', () => stepLine(1));
els.restart.addEventListener('click', restart);
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest('input, select, textarea, [contenteditable]')) return;
  if (ACTIVATION_KEYS.has(e.key) && t instanceof Element && t.closest(ACTIVATABLE)) return;   // Space / Enter on a focused button or link is that control's own key: it presses it, the shortcut yields (no preventDefault). Every other shortcut still works from there
  const move = e.shiftKey ? stepBar : stepLine;
  if (e.key === 'ArrowLeft') { move(-1); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { move(1); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') { restart(); e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Spacebar') { if (state.listen.active) pauseListen(); else if (state.listen.paused) resumeListen(); else listen(); e.preventDefault(); }   // pauses whatever plays (Listen or play-along), resumes what was paused, else starts Listen. preventDefault: the page must not scroll
  else if (e.key === 'p' || e.key === 'P') { toggleTransport('playalong'); e.preventDefault(); }
  else if ((e.key === 'n' || e.key === 'N') && state.notes.length) { setNotesOpen(!state.notesOpen, { focus: true }); e.preventDefault(); }   // Song notes; nothing playing is touched
  else if (e.key === 'Escape' && state.notesOpen) { setNotesOpen(false, { focus: true }); e.preventDefault(); }   // Song notes first; a second Esc reaches the loop
  else if (e.key === 'Escape' && (state.pendingBar != null || state.loop)) { cancelLoop(); e.preventDefault(); }
});

// ════════════════════════════════════════════════════════════════════
// LISTEN + PLAY-ALONG (one transport on the shared beat clock, beat-clock.js)
// ════════════════════════════════════════════════════════════════════

let hitIndex = new Map();        // `${bar}|${hand}|${midi}|${onset}` → [id] from staff.hits, rebuilt after every render while the transport runs
const playingKeys = new Map();   // midi → number of sounding notes (a pitch doubled in both hands keeps its key lit until the last ends)
const guideCount = new Map();    // midi → guide notes sounding on the sampler (released when the last one ends)
const hitKey = (bar, hand, midi, onset) => `${bar}|${hand}|${midi}|${Math.round(onset * 1000)}`;
const contextNow = () => (window.Tone && window.Tone.context ? window.Tone.context.currentTime : 0);

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
/** A schedule note's look right now: green while its play-along hit flash runs, purple while it sounds, else plain. */
function paintNote(note) {
  const L = state.listen;
  const st = L.flash.has(note) ? 'correct' : L.sounding.has(note) ? 'playing' : null;
  for (const id of noteIdsOf(note)) staff.setNoteState(id, st);
}
function lightNote(note, on) {
  const L = state.listen;
  if (on === L.sounding.has(note)) return;   // an 'off' with no 'on' (a seek), or a doubled 'on'
  if (on) L.sounding.add(note); else L.sounding.delete(note);
  paintNote(note);
  const n = (playingKeys.get(note.midi) || 0) + (on ? 1 : -1);
  if (n > 0) playingKeys.set(note.midi, n); else playingKeys.delete(note.midi);
  setKey(note.midi, 'playing', n > 0);
}
/** Play-along: the expected notes not played this pass, drawn faint (the staff's dim class) until the pass ends. */
function applyMissed() {
  const ids = [];
  for (const note of state.listen.missed) ids.push(...noteIdsOf(note));
  staff.setDimmed(ids);
}
/** Play-along: a note you hit goes green for a moment, on the staff and the key. */
function flashNote(note) {
  const L = state.listen;
  if (!L.active || !note) return;
  clearTimeout(L.flash.get(note));
  L.flash.set(note, setTimeout(() => { L.flash.delete(note); if (L.active) paintNote(note); }, CORRECT_FLASH_MS));
  paintNote(note);
  flashKey(note.midi, 'correct', CORRECT_FLASH_MS);
}
/** After a page turn: sounding and flashing notes, the missed ones and the bar marker go back on the new line. */
function repaintTransport() {
  const L = state.listen;
  indexHits();
  for (const note of new Set([...L.sounding, ...L.flash.keys()])) paintNote(note);
  applyMissed();
  if (L.bar != null && inDrawnRange(L.bar)) staff.setBarMarker(L.bar);
}

// ── Tempo slider (percent of the piece's tempo; remembered; live while the clock runs) ──
function clampPct(v) {
  const n = Math.round(Number(v) / TEMPO_STEP) * TEMPO_STEP;
  return Number.isFinite(n) ? Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, n)) : TEMPO_DEFAULT;
}
/** Set the slider percentage (clamped, TEMPO_MIN–TEMPO_MAX) and its readout "60% · 49 bpm"; a running Listen / play-along follows at once (beat-clock setTempo). */
function setTempoPct(pct, { save = true } = {}) {
  state.tempoPct = clampPct(pct);
  els.tempo.value = String(state.tempoPct);
  els.tempoReadout.textContent = state.norm ? tempoLabel(state.tempoPct, pieceBpm(state.norm).bpm) : `${state.tempoPct}%`;
  if (save) { try { localStorage.setItem(TEMPO_KEY, String(state.tempoPct)); } catch (_) { /* storage unavailable */ } }
  if (state.norm && clock.running) clock.setTempo(pieceBpm(state.norm).bpm * state.tempoPct / 100);
  syncSummary();
  return state.tempoPct;
}
try { setTempoPct(localStorage.getItem(TEMPO_KEY) ?? TEMPO_DEFAULT, { save: false }); } catch (_) { setTempoPct(TEMPO_DEFAULT, { save: false }); }
els.tempo.addEventListener('input', () => setTempoPct(els.tempo.value));
els.tempo.addEventListener('change', () => els.tempo.blur());   // so Space / arrows go back to the page

// ── Guide volume (play-along: how loud the piece plays underneath; 0 = click only; remembered) ──
const clampGuide = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : GUIDE_DEFAULT; };
/** Slider 0–100 → gain on the guide piano (Listen itself plays at 1). Tune here. */
const guideGainOf = v => Math.pow(clampGuide(v) / 100, 1.5);
function applyGuideGain() {
  if (!guideOut) return;
  const L = state.listen;
  const g = L.active && L.mode === 'playalong' ? guideGainOf(state.guide) : 1;
  try { guideOut.gain.rampTo(g, 0.03); } catch (_) { guideOut.gain.value = g; }
}
function setGuideVolume(v, { save = true } = {}) {
  state.guide = clampGuide(v);
  els.guide.value = String(state.guide);
  els.guideReadout.textContent = state.guide === 0 ? 'click only' : String(state.guide);
  if (save) { try { localStorage.setItem(GUIDE_KEY, String(state.guide)); } catch (_) { /* storage unavailable */ } }
  applyGuideGain();
  return state.guide;
}
try { setGuideVolume(localStorage.getItem(GUIDE_KEY) ?? GUIDE_DEFAULT, { save: false }); } catch (_) { setGuideVolume(GUIDE_DEFAULT, { save: false }); }
els.guide.addEventListener('input', () => setGuideVolume(els.guide.value));
els.guide.addEventListener('change', () => els.guide.blur());

/** Buttons + readout follow the loaded piece (load / unload). */
function syncListen() {
  els.listen.disabled = !state.norm;
  els.playAlong.disabled = !state.norm;
  setTempoPct(state.tempoPct, { save: false });
}
/** ▶ Listen / ♪ Play along ↔ ❚❚ Pause while it plays ↔ ▶ Resume while it is paused, each for its own mode. */
function syncTransportButtons() {
  const L = state.listen;
  const listening = L.active && L.mode === 'listen', along = L.active && L.mode === 'playalong';
  const pausedMode = !L.active && L.paused ? L.paused.mode : null;
  els.listen.textContent = listening ? '❚❚ Pause' : pausedMode === 'listen' ? '▶ Resume' : '▶ Listen';
  els.listen.setAttribute('aria-pressed', String(listening));
  els.listen.setAttribute('aria-label', listening ? 'Pause listening' : pausedMode === 'listen' ? `Resume listening from bar ${L.paused.bar}` : 'Listen');
  els.playAlong.textContent = along ? '❚❚ Pause' : pausedMode === 'playalong' ? '▶ Resume' : '♪ Play along';
  els.playAlong.setAttribute('aria-pressed', String(along));
  els.playAlong.setAttribute('aria-label', along ? 'Pause play-along' : pausedMode === 'playalong' ? `Resume play-along from bar ${L.paused.bar}` : 'Play along');
}

/**
 * The range a transport plays. Explicit { from, to } (the controller): that
 * range, looping only when asked. Otherwise the loop while one is set
 * (repeating until stopped), else from the current bar to the end of the
 * piece.
 */
function transportRange({ from, to, loop } = {}) {
  const bars = barNumbers();
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  if (from != null || to != null) {
    const a = from != null ? Number(from) : (state.bar != null ? state.bar : bars[0]);
    const b = to != null ? Number(to) : last;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { from: Math.min(a, b), to: Math.max(a, b), loop: !!loop };
  }
  if (state.loop) return { from: state.loop.from, to: state.loop.to, loop: loop !== false };
  return { from: state.bar != null ? state.bar : bars[0], to: last, loop: !!loop };
}

/** Clock items for a range: every note of both hands as an 'on' and an 'off' by quarter position (listenSchedule at 60 bpm: a second is a quarter). Offs sort before ons at one position. */
function transportItems(schedule) {
  const items = [];
  for (const note of schedule.notes) {
    if (!(note.duration > 0)) continue;
    items.push({ q: note.time, kind: 'on', note }, { q: note.time + note.duration, kind: 'off', note });
  }
  // Positions closer than SNAP are one position (rounding in the schedule must not put a note's end after the next attack of its pitch).
  const SNAP = 1e-5;
  items.sort((a, b) => (Math.abs(a.q - b.q) < SNAP ? (a.kind === b.kind ? 0 : a.kind === 'off' ? -1 : 1) : a.q - b.q));
  for (let i = 1; i < items.length; i++) if (items[i].q - items[i - 1].q < SNAP) items[i].q = items[i - 1].q;
  return items;
}

const isMine = note => state.hands === 'both' || note.hand === state.hands;   // Hands decides which notes are expected from you; the guide plays everything

/**
 * Start Listen ('listen') or play-along ('playalong') on the beat clock:
 * count-in, then the range — repeating when it loops, else to its end,
 * turning pages on the way. Resolves true once the clock runs. Whatever was
 * playing is stopped first. Listen does nothing while the page is muted;
 * play-along still runs (the score moves, nothing sounds). A start that
 * fails (audio blocked, no piano for Listen) restores the page like a stop,
 * with a banner; stopListen() during the loading awaits is honoured.
 * { resume: true } with a transport of this mode paused: the same range,
 * from the start of the bar it was paused in (the count-in first, as on
 * any start), on the page as it stands; the timing log gets a new pass.
 */
async function startTransport(mode, opts = {}) {
  const L = state.listen;
  if (!state.norm) return false;
  const resume = opts.resume && !L.active && L.paused && L.paused.mode === mode ? L.paused : null;
  if (resume && mode === 'listen' && muted()) return false;   // stays paused
  if (!resume) stopListen();   // whatever plays or is paused: stopped, the page restored
  if (mode === 'listen' && muted()) return false;
  const range = resume ? resume.range : transportRange(opts);
  if (!range) return false;
  const schedule = listenSchedule(state.norm, { from: range.from, to: range.to, bpm: 60 });   // seconds at 60 bpm = quarters
  if (!schedule.notes.length) { banner(`Nothing to play in ${barsText(range.from, range.to)}.`); return false; }
  const pattern = patternFor(state.norm.time, state.norm.beatsPerBar);   // the same grid as the schedule's bar length
  cancelPending();
  const token = ++L.token;
  Object.assign(L, { active: true, started: false, paused: null, mode, range, schedule, bar: resume ? resume.bar : null, startBar: resume ? resume.bar : range.from, pass: 1, drawn: resume ? L.drawn : state.line });
  if (!resume) L.run += 1;
  L.sounding = new Set(); L.flash = new Map(); L.missed = new Set(); L.guideOn = new Set();
  playingKeys.clear(); guideCount.clear();
  autoCollapse();   // a transport starting closes an opened rack, as the first MIDI note does
  // The follower's paint goes; held keys stay. paintStates() brings it back in finishListen.
  staff.clearStates(); staff.setDimmed([]); clearKeys(['expected', 'correct', 'wrong']);
  if (!resume) staff.setBarMarker(null);   // a resume keeps the marker on the bar it starts from
  indexHits();
  syncTransportButtons();
  const label = mode === 'playalong' ? 'Play along' : 'Listen';
  els.status.textContent = `${mode === 'playalong' ? 'Playing along' : 'Listening'} · ${barsText(range.from, range.to)}${range.loop ? ' · looping' : ''}${resume ? ` · from bar ${resume.bar}` : ''}`;

  const running = await startAudio();
  let piano = null;
  if (running) { try { piano = await loadGuidePiano(); } catch (err) { console.warn('[player] piano unavailable:', err); } }
  if (L.token !== token || !L.active) return false;   // stopped (or restarted) while loading: already restored
  if (!running) { finishListen(); banner(`The browser blocked audio: click the page, then press ${label} again.`); return false; }
  if (!piano && mode === 'listen') { finishListen(); banner('Piano samples did not load; Listen is unavailable.', true); return false; }
  guidePiano = piano;
  applyGuideGain();

  const { bpm: base, assumed } = pieceBpm(state.norm);
  const bpm = base * state.tempoPct / 100;   // read after the awaits: the slider may have moved
  clock.configure({ bars: barNumbers(), meter: pattern });
  clock.setTempo(bpm);
  if (mode === 'playalong') timing.reset();   // BEFORE clock.start: with no count-in the first downbeat is inside the lookahead, so start() dispatches its notes — and registers their expectations — at once; a reset after it would drop them
  const started = clock.start({ fromBar: range.from, toBar: range.to, startBar: L.startBar, loop: range.loop, countInBars: state.metro.countIn, items: transportItems(schedule) });
  if (!started) { finishListen(); return false; }
  L.started = true;
  if (assumed) banner(`No tempo in this piece: playing at ${Math.round(bpm)} bpm (${state.tempoPct}% of an assumed ${DEFAULT_BPM}).`);
  const detail = { from: range.from, to: range.to, loop: range.loop, startBar: started.start, resumed: !!resume, hands: state.hands, tempoPct: state.tempoPct, bpm, countInBars: state.metro.countIn, audioTime: started.barOneTime };
  if (mode === 'playalong') {
    bus.emit('playalong:start', detail);
    openPass(1, started.barOneTime);
  } else bus.emit('listen:start', detail);
  return true;
}
const listen = (opts = {}) => startTransport('listen', opts);
const playAlong = (opts = {}) => startTransport('playalong', opts);

/** Stop Listen or play-along for good — playing or paused (no-op otherwise); the page is restored synchronously. R, every navigation and every state change come through here. */
function stopListen() {
  const L = state.listen;
  if (L.active) finishListen();
  else if (L.paused) { L.paused = null; syncTransportButtons(); restorePage(); }
}
/** Pause whatever plays, in place: silent, the score and the bar marker stay where they are, the button reads "▶ Resume". A transport still loading (no clock yet) just stops. */
function pauseListen() {
  if (state.listen.active) finishListen({ pause: true });
}
/** Resume the paused transport from the start of the bar it was paused in, count-in first. Resolves false when nothing is paused. */
function resumeListen() {
  const p = state.listen.paused;
  return p && !state.listen.active ? startTransport(p.mode, { resume: true }) : Promise.resolve(false);
}
/** A mode's button and key (P; Space is the same for whichever mode is live): playing → pause, paused → resume, else start it. */
function toggleTransport(mode) {
  const L = state.listen;
  if (L.active && L.mode === mode) { pauseListen(); return Promise.resolve(false); }
  if (!L.active && L.paused && L.paused.mode === mode) return resumeListen();
  return startTransport(mode);
}
/** After a transport: put the follower's line back if the page was turned, and its paint. */
function restorePage() {
  const want = state.lines[state.line];
  if (want && staff.range && (staff.range.from !== want.from || staff.range.to !== want.to)) showLine(state.line, { bar: state.bar, keep: true, animate: false });
  else paintStates();
}

/**
 * Over, stopped or paused: silence, close the timing log's passes, clear
 * the transport's paint. Over / stopped: the original line goes back if
 * the page was turned and the follower is repainted. Paused (pause: true,
 * the clock was running): the page and the bar marker stay, and L.paused
 * remembers the mode, the range and the bar to resume from — the bar the
 * clock was in (the run's first bar during a count-in).
 */
function finishListen({ complete = false, endedAt, pause = false } = {}) {
  const L = state.listen;
  if (!L.active) return;
  const { mode, started, range } = L;
  const at = endedAt != null ? endedAt : contextNow();
  const paused = pause && started ? { mode, range, bar: L.bar != null ? L.bar : (L.startBar != null ? L.startBar : range.from) } : null;
  L.active = false; L.token++;   // late callbacks of this run are dropped
  clock.stop();        // nothing more is dispatched; pending due callbacks go with it
  metronome.stop();    // clicks already queued
  releaseGuide();
  if (started) {
    if (mode === 'playalong') closeAllPasses(at, complete);
    bus.emit(mode === 'playalong' ? 'playalong:stop' : 'listen:stop', { from: range.from, to: range.to, loop: range.loop, complete, paused: !!paused, bar: paused ? paused.bar : null, audioTime: at });
  }
  for (const t of L.flash.values()) clearTimeout(t);
  L.flash.clear(); L.sounding.clear(); L.missed.clear(); L.guideOn.clear(); playingKeys.clear();
  staff.clearStates(); staff.setDimmed([]); clearKeys(['playing']);
  applyGuideGain();
  L.paused = paused;
  syncTransportButtons();
  if (!paused) { restorePage(); return; }
  L.bar = paused.bar;
  if (inDrawnRange(paused.bar)) staff.setBarMarker(paused.bar);
  els.status.textContent = `Paused · ${mode === 'playalong' ? 'play-along' : 'Listen'} · bar ${paused.bar} · Space resumes from the start of the bar · R starts over`;
}

/** Guide notes off now: everything still held on the sampler is released (notes whose release is already scheduled, ≤ the lookahead away, end on their own). */
function releaseGuide() {
  if (guidePiano) { try { guidePiano.releaseAll(); } catch (_) { /* nothing sounding */ } }
  guideCount.clear();
}

/** Draw line `index` for the transport only: no slide, the follower and state.line / state.bar untouched; the transport's paint goes back on once drawn. */
async function listenTurnTo(index, token) {
  const L = state.listen;
  const range = state.lines[index];
  if (!range || !L.active) return;
  const result = await staff.render(state.norm, range.from, { to: range.to, animate: false });
  if (!result || !L.active || L.token !== token) return;
  repaintTransport();
}

// ── The clock's listeners. on(): ahead of time, with the exact audio time → sound. onDue(): on time → paint. ──

/** The metronome is driven by the clock: count-in beats always click, the rest while the checkbox is on (read per beat, so it joins / leaves at once). */
clock.on('beat', pos => {
  if (pos.countIn || state.metro.on) metronome.click(pos.audioTime, { accent: pos.accent, countIn: pos.countIn });
});
/** A bar on another line: turn the page as soon as it is scheduled (up to the lookahead, 150 ms, before its downbeat). */
clock.on('bar', pos => {
  const L = state.listen;
  if (!L.active) return;
  const line = lineOf(pos.bar);
  if (line >= 0 && line !== L.drawn) { L.drawn = line; listenTurnTo(line, L.token); }
});
clock.on('item', pos => {
  const L = state.listen;
  if (!L.active) return;
  const { kind, note } = pos.item;
  const name = noteName(note.midi);
  if (kind === 'off') {
    if (!L.guideOn.delete(note)) return;
    const n = (guideCount.get(note.midi) || 1) - 1;
    if (n > 0) { guideCount.set(note.midi, n); return; }   // the same pitch still sounds in the other hand
    guideCount.delete(note.midi);
    if (guidePiano) guidePiano.triggerRelease(name, pos.audioTime);
    return;
  }
  if (guidePiano && !muted() && (L.mode === 'listen' || state.guide > 0)) {
    guidePiano.triggerAttack(name, pos.audioTime, GUIDE_VELOCITY[note.hand] || 0.7);
    L.guideOn.add(note);
    guideCount.set(note.midi, (guideCount.get(note.midi) || 0) + 1);
  }
  if (L.mode !== 'playalong' || !isMine(note)) return;
  const r = timing.expect({ pitch: note.midi, hand: note.hand, bar: note.bar, beat: note.onset, audioTime: pos.audioTime, ref: note }, pos.pass);
  bus.emit('note:expected', { pitch: note.midi, hand: note.hand, bar: note.bar, beat: note.onset, audioTime: pos.audioTime, offsetMs: null, pass: pos.pass, anchor: isAnchor(note.bar, note.onset) });
  if (r.hit) onHit(r.entry, r.hit);   // already played, a little early
  clock.at(pos.audioTime + HIT_WINDOW_S + SETTLE_S, sweepTiming);
});
clock.on('loopWrap', pos => {
  const L = state.listen;
  if (!L.active || L.mode !== 'playalong') return;
  const token = L.token;
  openPass(pos.pass, pos.audioTime);
  clock.at(pos.audioTime + HIT_WINDOW_S + SETTLE_S, () => { if (L.active && L.token === token) closePass(pos.pass - 1, pos.audioTime, true); });   // late notes of the pass that ended have had their window
});
clock.on('ended', pos => {
  const L = state.listen;
  if (!L.active) return;
  const token = L.token;
  const tail = L.mode === 'playalong' ? HIT_WINDOW_S + SETTLE_S : END_TAIL_S;
  clock.at(pos.audioTime + tail, () => { if (L.active && L.token === token) finishListen({ complete: true, endedAt: pos.audioTime }); });
});
clock.onDue('item', pos => { if (state.listen.active) lightNote(pos.item.note, pos.item.kind === 'on'); });
clock.onDue('bar', pos => {
  const L = state.listen;
  if (!L.active) return;
  L.bar = pos.bar;
  if (inDrawnRange(pos.bar)) staff.setBarMarker(pos.bar);
});
clock.onDue('loopWrap', pos => {   // a new pass: last pass's missed notes are no longer grey
  const L = state.listen;
  if (!L.active) return;
  L.pass = pos.pass;
  L.missed.clear();
  applyMissed();
});

// ── Play-along: the quiet timing log (player-playalong.js) and what the page shows of it ──

/**
 * The audio-clock time of a performance.now() instant — when a key went
 * down, on the clock the expected notes are scheduled on. The context's
 * output timestamp pairs the two clocks at the speaker (what is heard now),
 * so a key struck exactly with the click reads 0; without it, currentTime
 * less the output latency.
 */
function audioTimeOf(perfMs) {
  const Tone = window.Tone;
  if (!Tone || !Tone.context) return 0;
  const raw = Tone.context.rawContext || null;
  const native = raw && typeof raw.getOutputTimestamp === 'function' ? raw : (raw && raw._nativeAudioContext) || null;
  try {
    if (native && typeof native.getOutputTimestamp === 'function') {
      const ts = native.getOutputTimestamp();
      if (ts && ts.performanceTime > 0 && Number.isFinite(ts.contextTime)) { timeSource = 'outputTimestamp'; return audioTimeFromStamp(perfMs, ts); }   // the stamp is read here, at every event — never cached
    }
  } catch (_) { /* fall through */ }
  timeSource = 'currentTime';
  const latency = (native && (native.outputLatency || native.baseLatency)) || 0;
  return Tone.context.currentTime - latency + (perfMs - performance.now()) / 1000;
}
let timeSource = 'unknown';   // which of the two audioTimeOf used last; kept on each pass

/**
 * Drift diagnostics: one reading of the three clocks the timing log sits
 * on — performance.now(), the context's currentTime, and its output
 * timestamp pair — plus the latencies the browser reports. Read-only.
 */
function clockSample() {
  const Tone = window.Tone;
  const out = { perfMs: performance.now(), currentTime: null, stampContextTime: null, stampPerformanceTime: null, outputLatency: null, baseLatency: null, sampleRate: null };
  if (!Tone || !Tone.context) return out;
  const raw = Tone.context.rawContext || null;
  const native = raw && typeof raw.getOutputTimestamp === 'function' ? raw : (raw && raw._nativeAudioContext) || null;
  out.currentTime = Tone.context.currentTime;
  try {
    if (native) {
      out.outputLatency = native.outputLatency ?? null; out.baseLatency = native.baseLatency ?? null; out.sampleRate = native.sampleRate ?? null;
      if (typeof native.getOutputTimestamp === 'function') { const ts = native.getOutputTimestamp(); out.stampContextTime = ts.contextTime; out.stampPerformanceTime = ts.performanceTime; }
    }
  } catch (_) { /* leave nulls */ }
  out.perfMs = performance.now();
  return out;
}
/**
 * Two clockSample()s → how fast each audio clock runs against
 * performance.now(), in ms gained per second (0 = locked; the real
 * hardware difference is well under 1): `stamp` is the output-timestamp
 * line the key times are mapped through, `current` is currentTime — the
 * line the clicks and the expected notes are scheduled on. If the two
 * differ, played times slide against expected times at that rate.
 */
function clockDrift(a, b) {
  const rate = (dAudio, dPerfMs) => (dPerfMs > 0 ? Math.round((dAudio - dPerfMs / 1000) / (dPerfMs / 1000) * 1e5) / 100 : null);
  const has = (x, k) => x && typeof x[k] === 'number';
  return {
    seconds: Math.round((b.perfMs - a.perfMs) / 10) / 100,
    currentMsPerS: has(a, 'currentTime') && has(b, 'currentTime') ? rate(b.currentTime - a.currentTime, b.perfMs - a.perfMs) : null,
    stampMsPerS: has(a, 'stampContextTime') && has(b, 'stampContextTime') ? rate(b.stampContextTime - a.stampContextTime, b.stampPerformanceTime - a.stampPerformanceTime) : null,
    stampBehindCurrentMs: has(b, 'stampContextTime') && has(b, 'currentTime') ? [a, b].map(x => Math.round((x.currentTime - (x.perfMs - x.stampPerformanceTime) / 1000 - x.stampContextTime) * 10000) / 10) : null,   // start, end: what the stamp says the output latency is
  };
}
/** Console: `await __player.clockProbe(20)` — watch the clocks for that many seconds (audio must be running) and report clockDrift over them. */
function clockProbe(seconds = 20) {
  const a = clockSample();
  return new Promise(resolve => setTimeout(() => { const b = clockSample(); resolve({ ...clockDrift(a, b), start: a, end: b }); }, Math.max(1, seconds) * 1000));
}

function openPass(pass, startedAt) {
  const L = state.listen, { range } = L;
  const startBar = pass === 1 ? L.startBar : range.from;   // a resumed run's first pass begins inside the range
  timing.open(pass, { mode: 'playalong', piece: state.piece, run: L.run, from: range.from, to: range.to, startBar, loop: range.loop, hands: state.hands, tempoPct: state.tempoPct, bpm: clock.tempo, startedAt, windowMs: HIT_WINDOW_MS, timeSource, timebase: { start: clockSample(), end: null, drift: null } });
  bus.emit('pass:start', { pass, from: range.from, to: range.to, startBar, loop: range.loop, hands: state.hands, audioTime: startedAt });
}
function closePass(pass, endedAt, complete) {
  const r = timing.close(pass, { endedAt, complete });
  if (!r) return;
  r.pass.timeSource = timeSource;
  if (r.pass.timebase) { r.pass.timebase.end = clockSample(); r.pass.timebase.drift = clockDrift(r.pass.timebase.start, r.pass.timebase.end); }   // drift diagnostics: see clockDrift
  reportSettled(r.missed, r.extras);
  bus.emit('pass:end', { pass, from: r.pass.from, to: r.pass.to, loop: r.pass.loop, hands: r.pass.hands, complete, audioTime: endedAt, log: r.pass });
}
/** Stop or the end: a pass opened ahead of a downbeat that never came is dropped; earlier ones ended where the next began; the last one ends here. */
function closeAllPasses(at, complete) {
  const open = timing.openPasses().filter(p => { if (p.pass > 1 && p.startedAt > at) { timing.discard(p.pass); return false; } return true; });
  open.forEach((p, i) => {
    const next = open[i + 1];
    if (next) closePass(p.pass, next.startedAt, true); else closePass(p.pass, at, complete);
  });
}
/** A note of yours that was played: green flash; the event carries the actual time and the offset. */
function onHit(expected, played) {
  bus.emit('note:played', { pitch: played.pitch, hand: expected.hand, bar: expected.bar, beat: expected.beat, audioTime: played.audioTime, expectedAt: expected.audioTime, offsetMs: expected.offsetMs, matched: true, extra: false, pass: expected.pass, anchor: isAnchor(expected.bar, expected.beat) });
  flashNote(expected.ref);
}
/** Notes whose window has passed: expected ones are missed (grey for the rest of their pass), played ones that paired with nothing are extras (logged, never shown). */
function reportSettled(missed, extras) {
  const L = state.listen;
  let grey = false;
  for (const e of missed) {
    bus.emit('note:missed', { pitch: e.pitch, hand: e.hand, bar: e.bar, beat: e.beat, audioTime: e.audioTime, offsetMs: null, pass: e.pass, anchor: isAnchor(e.bar, e.beat) });
    if (L.active && e.pass === L.pass && e.ref) { L.missed.add(e.ref); grey = true; }
  }
  if (grey) applyMissed();
  for (const e of extras) bus.emit('note:played', { pitch: e.pitch, hand: null, bar: e.bar, beat: e.beat, audioTime: e.audioTime, expectedAt: null, offsetMs: null, matched: false, extra: true, pass: e.pass, anchor: false });   // an extra is nobody's anchor
}
function sweepTiming() {
  const r = timing.sweep(audioTimeOf(performance.now()));
  reportSettled(r.missed, r.extras);
}
/** A key went down during play-along (MIDI or on-screen): logged against the clock, never judged by the follower. */
function playAlongNote(midi, perfMs) {
  const L = state.listen;
  if (!L.started) return;   // still loading: no clock yet
  practiceClock.note();
  const at = audioTimeOf(Number.isFinite(perfMs) ? perfMs : performance.now());
  const r = timing.played(midi, at, clock.positionAt(at));
  if (r.hit) onHit(r.hit, r.entry);
  clock.at(contextNow() + HIT_WINDOW_S + LOOKAHEAD + SETTLE_S, sweepTiming);   // nothing claimed it by then: an extra
}

els.listen.addEventListener('click', () => { els.listen.blur(); toggleTransport('listen'); });
els.playAlong.addEventListener('click', () => { els.playAlong.blur(); toggleTransport('playalong'); });

// ── Metronome row: checkbox, click volume, count-in (remembered; changes apply at once, mid-Listen too) ──
const saveMetro = (key, value) => { try { localStorage.setItem(key, String(value)); } catch (_) { /* storage unavailable */ } };
const readMetro = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
/** The click on / off; while the clock runs it joins at the next beat (the 'beat' listener reads state.metro.on), or stops now (a count-in under way keeps clicking). */
function setMetronome(on, { save = true } = {}) {
  state.metro.on = !!on;
  els.metro.checked = state.metro.on;
  if (save) saveMetro(METRO_KEY, state.metro.on ? '1' : '0');
  syncSummary();
  if (!state.metro.on) metronome.stop({ countIn: false });
}
function setMetroVolume(v, { save = true } = {}) {
  const n = Number(v);
  state.metro.volume = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : METRO_VOLUME_DEFAULT;
  els.metroVolume.value = String(state.metro.volume);
  metronome.setVolume(state.metro.volume);
  if (save) saveMetro(METRO_VOLUME_KEY, state.metro.volume);
}
/** 0 / 1 / 2 bars before the first note of Listen / play-along (aria-pressed on the segment buttons); applies to the next start. */
function setCountIn(bars, { save = true } = {}) {
  const n = Number(bars);
  state.metro.countIn = Number.isInteger(n) && n >= 0 && n <= COUNT_IN_MAX ? n : COUNT_IN_DEFAULT;
  for (const b of els.countIn.querySelectorAll('[data-count-in]')) b.setAttribute('aria-pressed', String(Number(b.dataset.countIn) === state.metro.countIn));
  if (save) saveMetro(COUNT_IN_KEY, state.metro.countIn);
  syncSummary();
}
setMetronome(readMetro(METRO_KEY) === '1', { save: false });
setMetroVolume(readMetro(METRO_VOLUME_KEY) ?? METRO_VOLUME_DEFAULT, { save: false });
setCountIn(readMetro(COUNT_IN_KEY) ?? COUNT_IN_DEFAULT, { save: false });
els.metro.addEventListener('change', () => { setMetronome(els.metro.checked); els.metro.blur(); });
els.metroVolume.addEventListener('input', () => setMetroVolume(els.metroVolume.value));
els.metroVolume.addEventListener('change', () => els.metroVolume.blur());   // so Space goes back to the page, as the tempo slider
els.countIn.addEventListener('click', e => {
  const b = e.target instanceof Element ? e.target.closest('[data-count-in]') : null;
  if (!b) return;
  setCountIn(b.dataset.countIn); b.blur();
});

// ════════════════════════════════════════════════════════════════════
// CONTROL RACK (collapsible) + SUMMARY STRIP
// ════════════════════════════════════════════════════════════════════
//
// The five-card rack (#pl-rack, player.html .pl-rack-shell) opens from the
// strip's ⚙ Controls or by clicking the settings summary, and closes from
// ⚙ Controls or by itself: with "Hide controls while playing" on (default),
// the first MIDI note or Listen start after it was opened closes it — once
// per opening (state.rack.armed), and never while focus or a pointer drag is
// inside it. Open / closed and the checkbox are remembered; on load the rack
// is closed when auto-collapse is on, else as remembered.

const readRack = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const saveRack = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* storage unavailable */ } };
let rackSettle = 0;   // timer: .pl-rack-shell--settled after the open animation (focus rings past the clip)

/** Open or close the rack; animate: false applies the state with no transition (page load). Opening arms the auto-collapse. */
function setRackOpen(open, { save = true, animate = true } = {}) {
  const want = !!open;
  const shell = els.rackShell;
  state.rack.open = want;
  if (want) state.rack.armed = true;
  else if (shell.contains(document.activeElement)) els.rackToggle.focus();   // never leave focus in an inert rack
  clearTimeout(rackSettle);
  shell.classList.remove('pl-rack-shell--settled');
  if (!animate) shell.classList.add('pl-rack-shell--instant');
  shell.dataset.open = String(want);
  if (want) shell.removeAttribute('inert'); else shell.setAttribute('inert', '');
  if (!animate) { void shell.offsetHeight; shell.classList.remove('pl-rack-shell--instant'); }   // flush the new state before transitions come back
  if (want) rackSettle = setTimeout(() => shell.classList.add('pl-rack-shell--settled'), animate ? RACK_MS + 20 : 0);
  els.rackToggle.setAttribute('aria-expanded', String(want));
  els.summary.title = want ? 'Controls are open' : 'Show the controls';
  if (save) saveRack(RACK_OPEN_KEY, want ? '1' : '0');
  return want;
}
/** Focus or a pointer drag inside the rack: a slider mid-drag, an open select. */
function rackBusy() {
  return state.rack.pointer || (document.activeElement instanceof Node && els.rackShell.contains(document.activeElement));
}
/** First MIDI note / Listen or play-along start after the rack was opened: close it, once, unless busy (then the next one tries again). */
function autoCollapse() {
  const R = state.rack;
  if (!R.auto || !R.open || !R.armed || rackBusy()) return;
  R.armed = false;
  setRackOpen(false);
}
function setRackAuto(on, { save = true } = {}) {
  state.rack.auto = !!on;
  els.rackAuto.checked = state.rack.auto;
  if (save) saveRack(RACK_AUTO_KEY, state.rack.auto ? '1' : '0');
  return state.rack.auto;
}
els.rackToggle.addEventListener('click', () => { setRackOpen(!state.rack.open); els.rackToggle.blur(); });
els.summary.addEventListener('click', () => { setRackOpen(true); els.summary.blur(); });
els.rackAuto.addEventListener('change', () => { setRackAuto(els.rackAuto.checked); els.rackAuto.blur(); });
els.rackShell.addEventListener('pointerdown', () => { state.rack.pointer = true; });
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => { state.rack.pointer = false; });

/** The strip's settings summary: "100% · metronome off · count-in 1 · both hands [· No stress] [· loop bars 2–3]" + MIDI dot and device. */
function syncSummary() {
  const parts = [
    `${state.tempoPct}%`,
    `metronome ${state.metro.on ? 'on' : 'off'}`,
    `count-in ${state.metro.countIn}`,
    state.hands === 'both' ? 'both hands' : state.hands.toUpperCase(),
  ];
  if (state.noStress) parts.push('No stress');
  const L = state.loop;
  if (L) parts.push(`loop ${barsText(L.from, L.to)}`);
  const box = els.summaryText;
  box.textContent = '';
  for (const t of parts) { const sp = document.createElement('span'); sp.textContent = t; box.appendChild(sp); }
  const name = input ? input.deviceName : '';
  els.summaryDot.classList.toggle('pl-dot--on', !!name);
  els.summaryDevice.textContent = name || 'no MIDI';
}

setRackAuto(readRack(RACK_AUTO_KEY) !== '0', { save: false });
setRackOpen(state.rack.auto ? false : readRack(RACK_OPEN_KEY) !== '0', { save: false, animate: false });   // auto on: closed; off: as remembered (open at first)
syncSummary();

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

/**
 * Italian tempo markings by quarter-note bpm, for the Piece card when the
 * norm has no `tempoMarking` of its own: [upper bound (exclusive), name].
 * Tune here.
 */
const TEMPO_MARKINGS = [
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [91, 'Andantino'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [130, 'Allegretto'],
  [168, 'Allegro'],
  [Infinity, 'Presto'],
];
function tempoMarking(bpm) {
  if (!Number.isFinite(bpm)) return '';
  const hit = TEMPO_MARKINGS.find(([max]) => bpm < max);
  return hit ? hit[1] : '';
}

/** Page heading (h1) + the Piece card: key, time, base tempo (norm.tempo, not the slider) with its marking. */
function showHeader(name, norm) {
  els.title.textContent = (typeof norm.title === 'string' && norm.title.trim()) ? norm.title : name;
  els.infoKey.textContent = norm.key || '–';
  els.infoTime.textContent = norm.time || '–';
  els.infoTempo.textContent = '';
  if (norm.tempo) {
    const marking = (typeof norm.tempoMarking === 'string' && norm.tempoMarking.trim()) ? norm.tempoMarking.trim() : tempoMarking(Number(norm.tempo));
    els.infoTempo.append(`${norm.tempo} bpm`);
    if (marking) { const m = document.createElement('span'); m.className = 'pl-info__marking'; m.textContent = ` · ${marking}`; els.infoTempo.appendChild(m); }
  } else els.infoTempo.textContent = '–';
}

// ── Feel + Song notes: the Piece card's FEEL row, the anchors, the Song notes panel (information only; see the header) ──

/** norm.anchors → null | 'downbeats' | Set of the listed bar numbers that are in the piece. */
function anchorsOf(norm) {
  const a = norm && norm.anchors;
  if (a === 'downbeats') return 'downbeats';
  if (!Array.isArray(a)) return null;
  const bars = new Set((Array.isArray(norm.bars) ? norm.bars : []).map(b => b.bar));
  const set = new Set(a.filter(b => typeof b === 'number' && bars.has(b)));
  return set.size ? set : null;
}
/** Whether a note at `beat` (quarters into the bar) of `bar` is on an anchor downbeat. */
function isAnchor(bar, beat) {
  const a = state.anchors;
  if (!a || bar == null || !(Math.abs(beat) < 1e-6)) return false;
  return a === 'downbeats' || a.has(bar);
}
/** Markdown-ish text into `host` as DOM nodes (never innerHTML): blank-line paragraphs, **bold**, *italic*. */
function renderRich(host, text) {
  for (const para of String(text || '').split(/\n\s*\n/)) {
    const line = para.replace(/\s*\n\s*/g, ' ').trim();
    if (!line) continue;
    const p = document.createElement('p');
    for (const part of line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
      if (!part) continue;
      const bold = /^\*\*[^*]+\*\*$/.test(part), italic = !bold && /^\*[^*]+\*$/.test(part);
      if (!bold && !italic) { p.append(part); continue; }
      const el = document.createElement(bold ? 'strong' : 'em');
      el.textContent = part.slice(bold ? 2 : 1, bold ? -2 : -1);
      p.appendChild(el);
    }
    host.appendChild(p);
  }
}
/**
 * The piece's Song notes as [{ id, title, body }], in order: norm.songNotes
 * (sections with no body are skipped; an id is slugged, made unique, and
 * invented when missing), else a legacy norm.feelNote { title, body } as
 * the one section "feel". [] when the piece has none.
 */
function songNotesOf(norm) {
  const text = v => (typeof v === 'string' ? v.trim() : '');
  let list = norm && Array.isArray(norm.songNotes) ? norm.songNotes : null;
  if (!list) { const legacy = norm && norm.feelNote; list = legacy && typeof legacy === 'object' ? [{ id: 'feel', ...legacy }] : []; }
  const seen = new Set(), out = [];
  for (const s of list) {
    if (!s || typeof s !== 'object' || !text(s.body)) continue;
    let id = text(s.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `note-${out.length + 1}`;
    while (seen.has(id)) id += '-2';
    seen.add(id);
    out.push({ id, title: text(s.title) || (id === 'feel' ? 'Feel' : 'Notes'), body: s.body });
  }
  return out;
}
const noteHeadingId = id => `pl-note-${id}`;
/**
 * Open / close the Song notes panel (only a piece with notes opens);
 * remembered per piece. The panel lies over the page: nothing playing is
 * touched. focus: on open, into the panel — the heading of `section` when
 * given (also scrolled to), else Close; on close, back to the button.
 */
function setNotesOpen(open, { save = true, focus = false, section = null } = {}) {
  const on = !!open && state.notes.length > 0;
  state.notesOpen = on;
  els.notesPanel.dataset.open = String(on);
  els.notesPanel.inert = !on;
  els.notesBtn.setAttribute('aria-expanded', String(on));
  if (save && state.piece) { try { localStorage.setItem(`${NOTES_OPEN_KEY}:${state.piece}`, on ? '1' : '0'); } catch (_) { /* storage unavailable */ } }
  if (on && section) {
    const h = state.noteHeadings.get(section);
    if (h) { h.scrollIntoView({ block: 'start' }); if (focus) { h.focus(); return on; } }
  }
  if (focus) (on ? els.notesClose : els.notesBtn).focus();
  return on;
}
/** A piece loaded (or none): the FEEL row, the staff's anchors, the Song notes button, the panel's sections, and the panel as this piece left it. */
function showNotes(name, norm) {
  const label = norm && typeof norm.feel === 'string' ? FEEL_LABELS[norm.feel.trim().toLowerCase()] : null;
  state.notes = songNotesOf(norm);
  state.anchors = anchorsOf(norm);
  staff.setAnchors(state.anchors === 'downbeats' ? 'downbeats' : state.anchors ? [...state.anchors] : null);

  els.notesBtn.hidden = els.notesHint.hidden = !state.notes.length;
  els.notesBody.textContent = '';
  state.noteHeadings = new Map();
  for (const note of state.notes) {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.id = noteHeadingId(note.id); h.tabIndex = -1; h.textContent = note.title;
    sec.setAttribute('aria-labelledby', h.id);
    sec.appendChild(h);
    renderRich(sec, note.body);
    els.notesBody.appendChild(sec);
    state.noteHeadings.set(note.id, h);
  }

  // FEEL row: plain text, or — when Song notes has a "feel" section — the same text as a link to it.
  els.infoFeelLabel.hidden = els.infoFeelRow.hidden = !label;
  els.infoFeel.textContent = '';
  if (label && state.noteHeadings.has('feel')) {
    const link = document.createElement('button');
    link.type = 'button'; link.className = 'pl-info__feel-link'; link.textContent = label;
    link.title = 'Open the Feel section of Song notes';
    link.addEventListener('click', () => setNotesOpen(true, { focus: true, section: 'feel' }));
    els.infoFeel.appendChild(link);
  } else if (label) els.infoFeel.textContent = label;

  let was = null;
  try { was = name ? localStorage.getItem(`${NOTES_OPEN_KEY}:${name}`) : null; } catch (_) { /* storage unavailable */ }
  setNotesOpen(was === '1', { save: false });
}
els.notesBtn.addEventListener('click', () => setNotesOpen(!state.notesOpen, { focus: true }));
els.notesClose.addEventListener('click', () => setNotesOpen(false, { focus: true }));

function unload() {
  stopListen();
  showNotes(null, null);
  state.norm = null; state.bar = null; state.steps = []; state.follower = null; state.wrong = 0;
  state.lines = []; state.lineWarnings = []; state.line = -1;
  cancelPending(); clearTrouble(); recorder.cancel();
  updateBarNav(); staff.clear(); clearKeys(); syncLoop(); syncListen();
}

async function load(name) {
  stopListen();
  banner('');
  els.title.textContent = '…';
  els.infoKey.textContent = els.infoTime.textContent = els.infoTempo.textContent = '–';
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
    showNotes(name, norm);
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

/**
 * The controller: everything the transports do, callable from code — the
 * hook for the future scoring and the coach ("I'll play bars 1–4, now you
 * play them, bar 3 needs work, loop it"). Also exported from this module.
 *   listen({ from, to, loop })     → Promise<boolean>  play a range (defaults: the loop, else the current bar to the end)
 *   playAlong({ from, to, loop })  → Promise<boolean>  the same, with the guide, the feedback and the timing log
 *   stop()                         → whether something was playing or paused; the page goes back to practice
 *   pause() / resume()             pause in place → whether something was playing; resume from the start of the paused bar (count-in first) → Promise<boolean>
 *   setTempo(pct)                  percent of the piece's tempo; live
 *   setLoop(from, to) / clearLoop()
 *   on(event, fn) → off()          the bus above; '*' for everything
 *   getLastPass()                  the timing log of the most recent ended play-along pass with at least one played note (complete: false when it was paused or stopped), or null
 *   getPasses()                    the last 10 ended passes, oldest first (empty ones included)
 *   getCurrentPass()               the pass under way, or null
 */
const songlabPlayer = {
  listen: (opts = {}) => listen(opts),
  playAlong: (opts = {}) => playAlong(opts),
  stop() { const was = state.listen.active || !!state.listen.paused; stopListen(); return was; },
  pause() { const was = state.listen.active; pauseListen(); return was; },
  resume: () => resumeListen(),
  setTempo: pct => setTempoPct(pct),
  setLoop: (from, to = from) => setLoop(from, to),
  clearLoop: () => cancelLoop(),
  on: (event, fn) => bus.on(event, fn),
  getLastPass: () => timing.last(),
  getPasses: () => timing.passes(),
  getCurrentPass: () => timing.current(),
  get playing() { return state.listen.active ? state.listen.mode : null; },
  get paused() { return !state.listen.active && state.listen.paused ? { ...state.listen.paused } : null; },
  get position() { return clock.position(); },
  clock,
};
window.songlabPlayer = songlabPlayer;
export { songlabPlayer };

// Debug handle for the browser console (no behaviour depends on it).
window.__player = {
  state, load, pieces: () => state.pieces, staff, showLine, stepLine, stepBar, restart,
  setLoop, clearLoop, setNoStress,
  setNotesOpen, songNotesOf, isAnchor, get notes() { return state.notes; }, get anchors() { return state.anchors; },
  listen, playAlong, stopListen, pauseListen, resumeListen, clockSample, clockDrift, clockProbe, get tempo() { return state.tempoPct; }, set tempo(v) { setTempoPct(v); }, clock, timing, bus, setGuideVolume, controller: songlabPlayer,
  metronome, setMetronome, setMetroVolume, setCountIn, get metro() { return state.metro; },
  setRackOpen, setRackAuto, get rack() { return state.rack; },
  get trouble() { return state.trouble; }, get practice() { return state.practice; }, loopCounts, passHistory, get recorder() { return recorder; }, thresholds: THRESHOLDS,
  get keyboard() { return keyboard; }, get input() { return input; }, get follower() { return state.follower; }, get steps() { return state.steps; },
  noteOn: onMidiNoteOn, noteOff: onMidiNoteOff, pedal: onPedal,
};
