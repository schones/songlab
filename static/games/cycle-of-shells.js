/**
 * cycle-of-shells.js
 * ==================
 * Page layer for the Cycle of Shells game (/games/cycle-of-shells). Wires
 * the pure core (targets, checker, submit detector) and the MIDI wrapper to
 * the DOM, the VoicingKeyboard, a guided-hint overlay, the cycle indicator
 * and the voicing-player piano. All game logic lives in
 * cycle-of-shells-core.js; this file only wires and renders.
 *
 * Depends on:
 *   - cycle-of-shells-core.js   → buildLap, describeMove, checkAnswer, createSubmitDetector, noteLabel, phraseRecipe, moveRule,
 *                                 followUp, checkFollowUp, chordEntry, followUpEntry, summarizeLap, CYCLE
 *   - cycle-of-shells-log.js    → createResultLog (ResultDetail entries in localStorage)
 *   - cycle-of-shells-input.js  → createShellInput (MIDI)
 *   - voicing-keyboard.js       → VoicingKeyboard (display + on-screen input via onKeyClick, minKeyWidth)
 *   - voicing-player.js         → VoicingPlayer (Hear it), loadSampler (live echo); one piano on the page
 *   - voicing-analysis.js       → parseNote, parseSymbol, namedVsPlayed (target-relative spelling of held notes)
 *   - voicing-explore.js        → spellMidi
 *
 * Lifecycle (hand-rolled, as Scale Builder):
 *   init(params) → DOM wiring, settings restored → start overlay click →
 *   Tone.start(), MIDI init, lap built (resume or URL params) → targets
 *   advance on each correct answer, no timers.
 *
 * Hints (setting 'hints'): 'guided' draws the move from the previous
 * target to the current one over the keyboard (ghosted origins, lit
 * destinations, arrows, labels in the target's spelling) and shows the
 * recipe line (a phrase's first chord) or the rule line (every other
 * chord) from the core; 'names' shows the text path line only; 'none'
 * shows neither. Awkward spellings are shown as "C♭ (B)" everywhere a
 * note name appears (core noteLabel, dual option on the core formatters).
 * The overlay is an SVG positioned over the keyboard, reading key
 * rectangles through data-midi; held notes are drawn as rings on top.
 *
 * Settings (localStorage, prefix 'cycleOfShells.'): mode, startKey, hints,
 * pedalSubmit, echo (per device name), resume ({ index, mode, startKey });
 * the MIDI device name is kept by the input wrapper under
 * 'cycleOfShells.midiDevice'. A legacy hidePath value migrates to hints.
 *
 * Follow-up question (setting 'followUp', default on): after each correct
 * I chord the page asks which note moved from V to I (core followUp); the
 * guide is hidden while the question is open, one played note answers it
 * (a second submit detector with minNotes 1), two tries, Skip always
 * available; the lap never blocks and chord misses are untouched.
 *
 * Result log: every chord submission and follow-up answer becomes a
 * ResultDetail entry (core chordEntry / followUpEntry) appended through
 * cycle-of-shells-log.js; the entries of the current lap also feed the
 * lap summary (core summarizeLap) shown when the lap finishes.
 *
 * Hooks: `hooks.onAccepted(target, result, submission)` and
 * `hooks.onLapComplete(lap, summary)` are called when set; `getState()`
 * exposes the current target, counters and open question.
 */

import { buildLap, describeMove, checkAnswer, createSubmitDetector, noteLabel, phraseRecipe, moveRule, followUp, checkFollowUp, chordEntry, followUpEntry, summarizeLap, CYCLE } from './cycle-of-shells-core.js';
import { createResultLog } from './cycle-of-shells-log.js';
import { createShellInput } from './cycle-of-shells-input.js';
import { VoicingKeyboard } from '../shared/voicing-keyboard.js';
import { VoicingPlayer, loadSampler } from '../shared/voicing-player.js';
import { parseNote, parseSymbol, namedVsPlayed } from '../shared/voicing-analysis.js';
import { spellMidi } from '../shared/voicing-explore.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'cycleOfShells.';
const KEYBOARD_RANGE = { low: 'C1', high: 'C6' };
const KEYBOARD_HEIGHT = 128;      // white-key height in px (black keys keep the shared ratio); 128 (was 150) pays for the C4 marker band below the keys
const KEYBOARD_MIN_KEY = 24;      // narrowest white key before the keyboard scrolls sideways (C1–C6 = 36 white keys)
const SETTLE_MS = 150;
const MIN_NOTES = 3;
const MISSES_BEFORE_SHOW_ME = 2;
const HEAR_SECONDS = 1.4;
const ECHO_VELOCITY = 0.7;
const ECHO_DEFAULT_OFF = new Set(['RD-2000']);   // devices that make their own sound
const FORM_TEXT = { '3-below': '3rd below 7th', '7-below': '7th below 3rd' };
const FORM_SHORT = { '3-below': '3rd below', '7-below': '7th below' };
const PHRASES_PER_KEY = { both: 2, single: 1 };
const HINT_LEVELS = ['guided', 'names', 'none'];
/** Overlay colours: AA text contrast on the page background (#FCFBF8). */
const GUIDE = { bass: '#7A5607', voicing: '#2D5F8A', ring: '#141210', halo: '#FCFBF8' };
const GUIDE_FONT = 26;            // label font size in px, bold; colliding labels stagger up a row (GUIDE_ROW) rather than shrink
const GUIDE_ROW = GUIDE_FONT + 8; // vertical step between staggered label rows
const GUIDE_BAND = 96;            // space above the keys for arrows and labels: two rows of labels
/** Middle C marker under the keys: always drawn, lit or not. #B02A14 on the page's #FCFBF8 = 6.4:1 (AA). */
const C4_MARK = { midi: 60, color: '#B02A14', font: 22, band: 36 };   // band: the stage's padding-bottom in the template
/** Circle of fifths clockwise from the top: pitch classes C G D A E B G♭ D♭ A♭ E♭ B♭ F. */
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const CYCLE_SIZE = 500;           // px; the SVG scales with the viewBox below this on narrow screens
const DUAL = { dual: true };      // core formatters: show awkward spellings as "C♭ (B)"

// ════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

const settings = { mode: 'both', startKey: 'C', hints: 'guided', pedalSubmit: false, followUp: true };
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
let playing = null;               // Map midi → role while Hear it sounds (keyboard follow)
const echoing = new Set();        // midis currently echoed on the sampler
let guideObserver = null;
let question = null;              // open follow-up: { prev, target, q, attempt, openedAt }
let fuDetector = null;            // single-note submit detector while a question is open
let lapEntries = [];              // this lap's log entries, for the summary
let targetShownAt = 0;            // performance.now() when the current target appeared
const log = createResultLog();

/** Hooks for anything built on top (the page itself uses the same paths). */
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
  remove(key) { try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (_) { /* storage unavailable */ } },
};

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

const target = () => lap[index] || null;
const noteName = midi => { const p = parseNote(midi); return p.name + p.octave; };
const pcName = name => name.replace(/-?\d+$/, '');
const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pcOf = m => ((m % 12) + 12) % 12;

/** Spell a midi against the current target's chord (B♭, not A♯); octave by the letter. */
function spellForTarget(midi, t = target()) {
  if (!t) return noteName(midi);
  const parsed = parseSymbol(t.symbol);
  const nvp = namedVsPlayed(parsed, [midi]);
  const e = [...nvp.present, ...nvp.added].find(x => x.pc === pcOf(midi));
  return spellMidi(midi, e ? e.name : parseNote(midi).name);
}

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
  lapEntries = [];
  $('cos-summary').hidden = true;
  goTo(Math.min(Math.max(0, resumeIndex), lap.length - 1));
  setFeedback('', null);
  $('cos-coaching').textContent = '';
}

/** Move to a target index with a clean slate (restart, resume, cycle jump). */
function goTo(i) {
  index = i;
  misses = 0; showMe = false; prevAccepted = null; lapComplete = false;
  staged.clear();
  question = null; fuDetector = null;
  if (detector) detector.reset();
  targetShownAt = now();
  saveResume();
  render();
}

function saveResume() { store.set('resume', { index, mode: settings.mode, startKey: settings.startKey }); }

function advance() {
  misses = 0; showMe = false; staged.clear();
  index++;
  targetShownAt = now();
  if (index >= lap.length) {
    index = lap.length - 1;
    lapComplete = true;
    store.set('resume', { index: 0, mode: settings.mode, startKey: settings.startKey });
    const summary = summarizeLap(lapEntries);
    renderSummary(summary);
    if (hooks.onLapComplete) hooks.onLapComplete(lap.slice(), summary);
  } else {
    saveResume();
  }
  render();
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Append an entry to the result log and to this lap's list. */
function record(entry) {
  lapEntries.push(entry);
  log.append(entry);
  return entry;
}

/** First target of a key in the current lap (cycle indicator click). */
function jumpToKey(key) {
  const i = lap.findIndex(t => t.key === key);
  if (i < 0) return;
  goTo(i);
  setFeedback('', null);
  $('cos-coaching').textContent = '';
}

// ════════════════════════════════════════════════════════════════════
// SUBMISSION
// ════════════════════════════════════════════════════════════════════

/** Check a set of midis against the current target. `source` is 'midi' or 'screen'. */
/** Check a set of midis against the current target. `source` is 'lift', 'pedal' or 'check'. */
function submit(midis, source) {
  const t = target();
  if (!t || lapComplete || question) return;
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const result = checkAnswer(t, sorted, prevAccepted, DUAL);
  if (!result.correct && result.errors[0].code === 'TOO_FEW_NOTES' && source !== 'check') {
    // A lone tap or two notes from the keyboard is not an attempt at the shell: say what is needed, no miss counted, not logged.
    setFeedback(result.message, 'info');
    return;
  }
  const attempt = misses + 1;
  record(chordEntry({ target: t, result, played: sorted, attempt, source, device: input ? input.deviceName : null, showMeUsed: showMe, settings, duration: now() - targetShownAt }));
  if (result.correct) {
    // The core's message already is the coaching line when there is one; the second line carries any further coaching.
    setFeedback(result.message, 'success');
    $('cos-coaching').textContent = result.coaching.slice(1).map(c => c.message).join(' ');
    prevAccepted = sorted.slice(1);
    if (hooks.onAccepted) hooks.onAccepted(t, result, { midis: sorted, source, attempt });
    if (t.role === 'I' && settings.followUp && index > 0) openQuestion(lap[index - 1], t);
    else advance();
    return;
  }
  misses++;
  setFeedback(result.message, 'miss');
  $('cos-coaching').textContent = '';
  renderControls();
  renderKeyboard();
}

// ════════════════════════════════════════════════════════════════════
// FOLLOW-UP QUESTION
// ════════════════════════════════════════════════════════════════════

function openQuestion(prev, t) {
  question = { prev, target: t, q: followUp(prev, t, DUAL), attempt: 0, openedAt: now() };
  staged.clear();
  fuDetector = createSubmitDetector({ minNotes: 1, settleMs: SETTLE_MS, pedalSubmit: settings.pedalSubmit });
  detector.reset();
  $('cos-coaching').textContent = `${question.q.prompt} Play that note.`;
  renderControls();
  renderKeyboard();
}

/** One played note (or a staged click) answers the open question. `source` is 'lift', 'pedal' or 'check'. */
function answerQuestion(midis, source) {
  if (!question) return;
  const list = [...new Set(midis)];
  if (list.length !== 1) { $('cos-coaching').textContent = `${question.q.prompt} Play just one note.`; return; }
  const midi = list[0];
  question.attempt++;
  const r = checkFollowUp(question.q, midi, DUAL);
  record(followUpEntry({ prevTarget: question.prev, target: question.target, question: question.q, played: midi, attempt: question.attempt, correct: r.correct, settings, duration: now() - question.openedAt }));
  if (r.correct) { closeQuestion(`✓ ${question.q.explanation}`); return; }
  if (question.attempt >= 2) { closeQuestion(`${r.message} ${question.q.explanation}`); return; }
  $('cos-coaching').textContent = `${r.message} One more try.`;
  staged.clear();
  renderKeyboard();
}

function skipQuestion() {
  if (!question) return;
  record(followUpEntry({ prevTarget: question.prev, target: question.target, question: question.q, attempt: question.attempt + 1, skipped: true, settings, duration: now() - question.openedAt }));
  closeQuestion(question.q.explanation);
}

/** Close the question, leave its explanation on the second line, and move on. */
function closeQuestion(text) {
  question = null; fuDetector = null;
  staged.clear();
  advance();
  $('cos-coaching').textContent = text;
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

/** Keys of the lap in order (each once). */
const keyOrder = () => lap.filter(x => x.role === 'ii' && x.formSlot === 1).map(x => x.key);

function positionText(t) {
  const order = keyOrder();
  const keyNo = order.indexOf(t.key) + 1;
  const phrases = PHRASES_PER_KEY[settings.mode];
  return { keyNo, total: order.length, phrases, phraseText: phrases > 1 ? `phrase ${t.formSlot} of ${phrases}` : '' };
}

function render() {
  const t = target();
  if (!t) return;
  const pos = positionText(t);
  const chordNo = ['ii', 'V', 'I'].indexOf(t.role) + 1;
  $('cos-home').textContent = `Home: ${t.keyDisplay}`;
  $('cos-progress').textContent = lapComplete
    ? 'Lap complete'
    : [`Key ${pos.keyNo} of ${pos.total}`, pos.phraseText, `chord ${chordNo} of 3`].filter(Boolean).join(' · ');
  $('cos-symbol').textContent = t.display;
  $('cos-role').textContent = t.role;
  $('cos-form').textContent = FORM_TEXT[t.form];
  renderPath();
  renderKeyboard();
  renderCycle();
  renderControls();
  if (lapComplete) setFeedback('Lap complete — every key, every shell. Restart to go round again.', 'success');
}

function renderControls() {
  $('btn-show').hidden = !(misses >= MISSES_BEFORE_SHOW_ME && !lapComplete && !question);
  $('btn-skip').hidden = !question;
  $('btn-check').disabled = lapComplete;
  $('cos-pedal-hint').hidden = !settings.pedalSubmit;
}

function renderSummary(sum) {
  const keyName = k => parseNote(k).name;
  $('sum-chords').textContent = sum.chords ? `${sum.chords} (${sum.attempts} attempts)` : '0';
  $('sum-first').textContent = sum.firstTryPct == null ? '—' : `${sum.firstTryPct}%`;
  $('sum-followup').textContent = sum.followUpPct == null ? (sum.followUps ? '0%' : 'none asked') : `${sum.followUpPct}% of ${sum.followUps}`;
  $('sum-keys').textContent = sum.worstKeys.length ? sum.worstKeys.map(k => `${keyName(k.key)} (${k.misses})`).join(' · ') : 'none — clean lap';
  $('sum-errors').textContent = sum.topErrors.length ? sum.topErrors.map(e => `${e.label}: ${e.count}`).join(' · ') : 'none';
  $('cos-summary').hidden = false;
}

/** The move from the previous target to the current one, or null on a lap's first chord. */
function currentMove() {
  const t = target();
  if (!t || index === 0) return null;
  const prev = lap[index - 1];
  return { prev, move: describeMove(prev.upper, t.upper, { form: FORM_SHORT[t.form] }) };
}

function renderPath() {
  const el = $('cos-path');
  el.classList.toggle('cos-path--hidden', settings.hints === 'none');
  el.innerHTML = '';
  const t = target();
  if (!t) return;
  if (settings.hints === 'guided') {
    // Recipe on a phrase's first chord, the voice-leading rule on the others (core text, dual labels).
    // A new key's first chord gets both: the recipe, then the seam rule beneath it.
    const prev = index > 0 ? lap[index - 1] : null;
    if (t.role === 'ii' || !prev) {
      const recipe = phraseRecipe(t, DUAL);
      el.textContent = recipe ? recipe.text : '';
      if (prev && prev.key !== t.key) {
        const rule = document.createElement('span');
        rule.className = 'cos-path__rule';
        rule.textContent = moveRule(prev, t, DUAL).text;
        el.appendChild(rule);
      }
    } else {
      el.textContent = moveRule(prev, t, DUAL).text;
    }
    return;
  }
  const cm = currentMove();
  if (!cm) return;
  const { prev, move } = cm;
  if (move.kind === 'replace') { el.textContent = capitalize(describeMove(prev.upper, t.upper, { form: FORM_SHORT[t.form], dual: true }).summary); return; }
  const degreeOf = midi => { const u = prev.upper.find(x => x.midi === midi); return u ? (u.degree.includes('3') ? '3rd' : '7th') : ''; };
  for (const v of move.voices) {
    const span = document.createElement('span');
    span.className = 'cos-path__voice';
    const label = document.createElement('span');
    label.className = 'cos-path__label';
    label.textContent = `${degreeOf(v.from)}: `;
    span.appendChild(label);
    const from = noteLabel(pcName((prev.upper.find(x => x.midi === v.from) || {}).name || noteName(v.from)));
    const to = noteLabel(pcName((t.upper.find(x => x.midi === v.to) || {}).name || noteName(v.to)));
    span.appendChild(document.createTextNode(v.delta === 0 ? `${from} stays` : `${from} → ${to}, ${v.label}`));
    el.appendChild(span);
  }
}

/** Key fills: guided target (or Show me) with held notes as rings; otherwise held/staged notes by role. */
function renderKeyboard() {
  if (!keyboard) return;
  const t = target();
  if (playing) return;   // setPlaying() owns the keys during Hear it
  const live = [...new Set([...held, ...staged])].sort((a, b) => a - b);
  const guideOn = settings.hints === 'guided' && !lapComplete && !question;
  if ((guideOn || (showMe && !question)) && t) {
    keyboard.render({ bass: t.bass.name, voicing: t.upper.map(u => u.name) });
  } else {
    keyboard.render(live.length ? { bass: spellForTarget(live[0]), voicing: live.slice(1).map(m => spellForTarget(m)) } : {});
  }
  drawGuide();
}

// ════════════════════════════════════════════════════════════════════
// GUIDE OVERLAY
// ════════════════════════════════════════════════════════════════════

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}, text = null) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

/** Rectangle of a key relative to the keyboard stage, or null when the key is outside the range. */
function keyRect(midi) {
  const stage = $('cos-kb-stage');
  const el = stage.querySelector(`.vk-key[data-midi="${midi}"]`);
  if (!el) return null;
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, black: el.classList.contains('vk-key--black') };
}

/**
 * Draw the guided overlay: ghosted origins, arrows to destinations, labels
 * in the target's spelling, and rings for held notes (every hint level).
 */
function drawGuide() {
  const svg = $('cos-guide');
  const stage = $('cos-kb-stage');
  if (!svg || !stage) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const s = stage.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
  svg.setAttribute('width', s.width);
  svg.setAttribute('height', s.height);
  const t = target();
  const items = [];   // { kind: 'stay'|'move'|'tag', midi|from/to, label, color }
  if (t && settings.hints === 'guided' && !lapComplete && !question) {
    const cm = currentMove();
    if (!cm) {
      items.push({ kind: 'tag', midi: t.bass.midi, label: 'root', color: GUIDE.bass });
      for (const u of t.upper) items.push({ kind: 'tag', midi: u.midi, label: u.degree, color: GUIDE.voicing });
    } else {
      const { prev, move } = cm;
      const nameAt = (list, midi) => noteLabel(pcName((list.find(x => x.midi === midi) || {}).name || noteName(midi)));
      if (prev.bass.midi === t.bass.midi) items.push({ kind: 'stay', midi: t.bass.midi, label: `${noteLabel(pcName(t.bass.name))} stays`, color: GUIDE.bass });
      else items.push({ kind: 'move', from: prev.bass.midi, to: t.bass.midi, label: `${noteLabel(pcName(prev.bass.name))} → ${noteLabel(pcName(t.bass.name))}`, color: GUIDE.bass });
      for (const v of move.voices) {
        if (v.delta === 0) items.push({ kind: 'stay', midi: v.to, label: `${nameAt(t.upper, v.to)} stays`, color: GUIDE.voicing });
        else items.push({ kind: 'move', from: v.from, to: v.to, label: `${nameAt(prev.upper, v.from)} → ${nameAt(t.upper, v.to)}`, color: GUIDE.voicing });
      }
    }
  }
  const labels = [];   // { x, y, text, color } collected, then de-overlapped
  const anchor = r => ({ x: r.x + r.w / 2, y: r.y });
  for (const it of items) {
    if (it.kind === 'move') {
      const a = keyRect(it.from), b = keyRect(it.to);
      if (!b) continue;
      if (a) {
        // Ghost the origin key.
        svg.appendChild(svgEl('rect', { x: a.x + 1, y: a.y + 1, width: a.w - 2, height: a.h - 2, rx: 4, fill: it.color, 'fill-opacity': a.black ? 0.45 : 0.22, stroke: it.color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
        const p = anchor(a), q = anchor(b);
        const dx = q.x - p.x;
        const h = Math.max(30, Math.min(GUIDE_BAND - 26, 24 + Math.abs(dx) * 0.18));
        const cx = (p.x + q.x) / 2, cy = p.y - h;
        const d = `M ${p.x} ${p.y - 2} Q ${cx} ${cy} ${q.x} ${q.y - 2}`;
        svg.appendChild(svgEl('path', { d, fill: 'none', stroke: GUIDE.halo, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        svg.appendChild(svgEl('path', { d, fill: 'none', stroke: it.color, 'stroke-width': 3, 'stroke-linecap': 'round' }));
        // Arrowhead along the end tangent (from the control point to the end).
        const ang = Math.atan2((q.y - 2) - cy, q.x - cx);
        const tip = { x: q.x, y: q.y - 2 }, len = 11, spread = 0.5;
        const l = { x: tip.x - len * Math.cos(ang - spread), y: tip.y - len * Math.sin(ang - spread) };
        const r = { x: tip.x - len * Math.cos(ang + spread), y: tip.y - len * Math.sin(ang + spread) };
        svg.appendChild(svgEl('polygon', { points: `${tip.x},${tip.y} ${l.x},${l.y} ${r.x},${r.y}`, fill: it.color, stroke: GUIDE.halo, 'stroke-width': 1.5 }));
        labels.push({ x: cx, y: p.y - h / 2 - 10, text: it.label, color: it.color });
      } else {
        const q = anchor(b);
        labels.push({ x: q.x, y: q.y - 26, text: it.label, color: it.color, leader: q });
      }
    } else {
      const r = keyRect(it.midi);
      if (!r) continue;
      const q = anchor(r);
      labels.push({ x: q.x, y: q.y - 28, text: it.label, color: it.color, leader: q });
    }
  }
  // Labels: estimate widths; a label that would collide with one already placed moves up a row, never shrinks.
  labels.sort((a, b) => a.x - b.x);
  const placed = [];
  for (const lb of labels) {
    const w = lb.text.length * GUIDE_FONT * 0.6 + 12;
    let y = lb.y;
    const collides = yy => placed.some(p => Math.abs(p.x - lb.x) < (p.w + w) / 2 && Math.abs(p.y - yy) < GUIDE_FONT + 6);
    for (let row = 0; row < 3 && collides(y); row++) y -= GUIDE_ROW;
    y = Math.max(GUIDE_FONT, y);
    if (lb.leader) {
      svg.appendChild(svgEl('line', { x1: lb.x, y1: y + 6, x2: lb.leader.x, y2: lb.leader.y - 2, stroke: lb.color, 'stroke-width': 2, 'stroke-dasharray': lb.text.endsWith('stays') ? '' : '3 3' }));
      svg.appendChild(svgEl('circle', { cx: lb.leader.x, cy: lb.leader.y - 2, r: 3.5, fill: lb.color }));
    }
    svg.appendChild(svgEl('text', { x: lb.x, y, 'text-anchor': 'middle', 'font-size': GUIDE_FONT, 'font-weight': 800, fill: lb.color, stroke: GUIDE.halo, 'stroke-width': 4, 'paint-order': 'stroke', 'font-family': 'inherit' }, lb.text));
    placed.push({ x: lb.x, y, w });
  }
  // Held and staged notes: rings on top, so the guide stays visible underneath.
  for (const m of new Set([...held, ...staged])) {
    const r = keyRect(m);
    if (!r) continue;
    svg.appendChild(svgEl('rect', { x: r.x + 3, y: r.y + 3, width: r.w - 6, height: r.h - 6, rx: 5, fill: 'none', stroke: GUIDE.halo, 'stroke-width': 6, 'class': 'cos-ring' }));
    svg.appendChild(svgEl('rect', { x: r.x + 3, y: r.y + 3, width: r.w - 6, height: r.h - 6, rx: 5, fill: 'none', stroke: GUIDE.ring, 'stroke-width': 3, 'class': 'cos-ring' }));
  }
  drawMiddleC(svg);
}

/** Middle C marker in the band under the keys: a triangle pointing up at C4 and a bold red "C4". Drawn whatever the hint level or key state. */
function drawMiddleC(svg) {
  const r = keyRect(C4_MARK.midi);
  if (!r || !r.w) return;
  const cx = r.x + r.w / 2, top = r.y + r.h + 2;   // triangle 2–8 px under the key, a 4 px gap, then the label (cap height ≈ 0.73 em); its baseline sits 8 px above the band's end
  const g = svgEl('g', { class: 'cos-c4', 'aria-hidden': 'true' });
  g.appendChild(svgEl('polygon', { points: `${cx},${top} ${cx - 5},${top + 6} ${cx + 5},${top + 6}`, fill: C4_MARK.color }));
  g.appendChild(svgEl('text', { x: cx, y: top + 6 + 4 + C4_MARK.font * 0.73, 'text-anchor': 'middle', 'font-size': C4_MARK.font, 'font-weight': 800, fill: C4_MARK.color, 'font-family': 'inherit' }, 'C4'));
  svg.appendChild(g);
}

// ════════════════════════════════════════════════════════════════════
// CYCLE INDICATOR
// ════════════════════════════════════════════════════════════════════

function renderCycle() {
  const svg = $('cos-cycle');
  const t = target();
  if (!svg || !t) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const size = CYCLE_SIZE, c = size / 2, ring = size * 0.39, r = size * 0.088;
  const font = size * 0.074, badgeFont = size * 0.058, stroke = size / 170;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const pos = positionText(t);
  svg.setAttribute('aria-label', `Key ${pos.keyNo} of ${pos.total}, ${t.keyDisplay}${pos.phraseText ? ', ' + pos.phraseText : ''}`);
  const lastIndexOfKey = key => lap.map((x, i) => (x.key === key ? i : -1)).reduce((m, i) => Math.max(m, i), -1);
  svg.appendChild(svgEl('circle', { cx: c, cy: c, r: ring, fill: 'none', stroke: '#C9C3B4', 'stroke-width': 1.5 * stroke }));
  FIFTHS.forEach((pc, i) => {
    const key = CYCLE.find(k => parseNote(k.key).pc === pc);
    const label = parseNote(key.key).name;
    const ang = -Math.PI / 2 + (i * Math.PI * 2) / 12;
    const x = c + ring * Math.cos(ang), y = c + ring * Math.sin(ang);
    const current = key.key === t.key;
    const done = !current && lastIndexOfKey(key.key) < index;
    const g = svgEl('g', { class: `cos-cycle__key${current ? ' cos-cycle__key--current' : ''}${done ? ' cos-cycle__key--done' : ''}`, role: 'button', tabindex: 0, 'aria-label': `Go to ${label}${done ? ' (done)' : current ? ' (current)' : ''}` });
    g.appendChild(svgEl('circle', { cx: x, cy: y, r, fill: current ? '#2D5F8A' : done ? '#E3F2DF' : '#FFFFFF', stroke: current ? '#2D5F8A' : done ? '#1E7B34' : '#8E877A', 'stroke-width': (done || current ? 2 : 1.25) * stroke }));
    g.appendChild(svgEl('text', { x, y: y + font * 0.36, 'text-anchor': 'middle', 'font-size': font, 'font-weight': 800, fill: current ? '#FFFFFF' : done ? '#155F27' : '#2B2824', 'font-family': 'inherit' }, label));
    if (current && pos.phrases > 1) {
      const bx = c + (ring + r + badgeFont * 0.9) * Math.cos(ang), by = c + (ring + r + badgeFont * 0.9) * Math.sin(ang);
      g.appendChild(svgEl('text', { x: bx, y: by + badgeFont * 0.36, 'text-anchor': 'middle', 'font-size': badgeFont, 'font-weight': 800, fill: '#2D5F8A', 'font-family': 'inherit', class: 'cos-cycle__phrase' }, `${t.formSlot}/${pos.phrases}`));
    }
    const go = () => { if (key.key === t.key && index === lap.findIndex(x => x.key === key.key)) return; if (window.confirm(`Jump to ${label}? The current key is left where it is.`)) jumpToKey(key.key); };
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    svg.appendChild(g);
  });
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

const activeDetector = () => (question ? fuDetector : detector);
function onSubmission(sub) {
  if (!sub) return;
  if (question) answerQuestion(sub.midis, sub.source); else submit(sub.midis, sub.source);
}
function onMidiNoteOn(midi, t) {
  held.add(midi);
  echoOn(midi);
  activeDetector().noteOn(midi, t);
  renderKeyboard();
}
function onMidiNoteOff(midi, t) {
  held.delete(midi);
  echoOff(midi);
  const sub = activeDetector().noteOff(midi, t);
  renderKeyboard();
  onSubmission(sub);
}
function onPedal(value, t) {
  onSubmission(activeDetector().pedal(value, t));
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
  settings.pedalSubmit = !!store.get('pedalSubmit', false);
  settings.followUp = store.get('followUp', true) !== false;
  // Hints, with migration from the Stage 3 hidePath flag (true → none, false → guided), then dropped.
  let hints = store.get('hints', null);
  const legacy = store.get('hidePath', null);
  if (!HINT_LEVELS.includes(hints)) {
    hints = legacy === true ? 'none' : 'guided';
    if (legacy !== null) store.set('hints', hints);
  }
  if (legacy !== null) store.remove('hidePath');
  settings.hints = hints;
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
  $('set-hints').value = settings.hints;
  $('set-pedal').checked = settings.pedalSubmit;
  $('set-followup').checked = settings.followUp;

  $('set-followup').addEventListener('change', e => { settings.followUp = e.target.checked; store.set('followUp', settings.followUp); });
  $('cos-settings').addEventListener('toggle', () => { if ($('cos-settings').open) { refreshDeviceList(); refreshEchoControl(); } });
  $('set-device').addEventListener('change', e => { if (input && e.target.value) { input.selectDevice(e.target.value); refreshEchoControl(); } });
  $('set-echo').addEventListener('change', e => { setEcho(e.target.checked); if (!e.target.checked) for (const m of [...echoing]) echoOff(m); });
  $('set-pedal').addEventListener('change', e => {
    settings.pedalSubmit = e.target.checked;
    store.set('pedalSubmit', settings.pedalSubmit);
    makeDetector();
    if (question) fuDetector = createSubmitDetector({ minNotes: 1, settleMs: SETTLE_MS, pedalSubmit: settings.pedalSubmit });
    renderControls();
  });
  $('set-hints').addEventListener('change', e => {
    settings.hints = HINT_LEVELS.includes(e.target.value) ? e.target.value : 'guided';
    store.set('hints', settings.hints);
    renderPath();
    renderKeyboard();
  });

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
  keyboard = new VoicingKeyboard('cos-keyboard', { ...KEYBOARD_RANGE, height: KEYBOARD_HEIGHT, minKeyWidth: KEYBOARD_MIN_KEY, ariaLabel: 'Keyboard for playing the shell', onKeyClick });
  player = new VoicingPlayer();
  makeDetector();
  wireSettings();

  // The guide overlay follows the keys: redraw on resize and on sideways scroll.
  const stage = $('cos-kb-stage');
  if (typeof ResizeObserver === 'function') { guideObserver = new ResizeObserver(() => drawGuide()); guideObserver.observe(stage); }
  const wrap = stage.querySelector('.vk-wrap');
  if (wrap) wrap.addEventListener('scroll', () => drawGuide(), { passive: true });

  $('btn-hear').addEventListener('click', hearIt);
  $('btn-check').addEventListener('click', () => (question ? answerQuestion([...staged], 'check') : submit([...staged], 'check')));
  $('btn-skip').addEventListener('click', skipQuestion);
  $('btn-another').addEventListener('click', () => startLap());
  $('btn-startfrom').addEventListener('click', () => { $('cos-settings').open = true; $('set-key').focus(); $('set-key').scrollIntoView({ block: 'center' }); });
  $('btn-show').addEventListener('click', () => { showMe = true; renderKeyboard(); setFeedback(`${target().display}: ${noteLabel(target().bass.name)} under ${target().upper.map(u => noteLabel(u.name)).join(' ')}. Now you play it.`, 'info'); });
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
  return { index, target: target(), lapLength: lap.length, misses, showMe, lapComplete, settings: { ...settings }, held: [...held], staged: [...staged], deviceName: input ? input.deviceName : null,
    question: question ? { prompt: question.q.prompt, attempt: question.attempt, answer: question.q.answerName } : null, lapEntries: lapEntries.length };
}

export { hooks };
