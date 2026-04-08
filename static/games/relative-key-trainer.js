/**
 * relative-key-trainer.js
 * =======================
 * Chord Walks — explore chord connections on the Tonnetz.
 * Three phases: Learn → Practice → Test.
 *
 * Tier 1: "Major or Minor?"
 *   Learn   — 5-step guided walkthrough (watch & listen)
 *   Practice — guided ear-training with scaffolded visuals
 *   Test     — 10-round ear-training quiz
 *
 * Tier 2: "Find the Relative"
 *   Learn   — 5-step R-transform walkthrough
 *   Practice — given a key, find its relative major/minor (4 options)
 *   Test     — 10-round relative key quiz (no scaffolding)
 *
 * Depends on:
 *   - transforms.js   → TRANSFORMS, triadNotes, spellingForKey, noteToPC
 *   - harmony-state.js → HarmonyState
 *   - tonnetz-neighborhood.js → TonnetzNeighborhood
 *   - keyboard-view.js → KeyboardView
 *   - Tone.js (CDN)
 */

import { HarmonyState } from '../shared/harmony-state.js';
import { TonnetzNeighborhood } from '../shared/tonnetz-neighborhood.js';
import { KeyboardView } from '../shared/keyboard-view.js';
import {
  TRANSFORMS,
  triadNotes,
  spellingForKey,
  noteToPC,
  pcToNote,
} from '../shared/transforms.js';
import { TipsPill } from '../shared/tips-pill.js';
import { initTheoryTooltips } from '../shared/theory-engine.js';
import { VisualLayer } from '../shared/visual-layer.js';
import { VisualToggle } from '../shared/visual-toggle.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const ROUNDS_PER_SESSION = 10;
const BPM = 100;
const FEEDBACK_DELAY = 2000;

// Tier 1 key pools
const T1_MAJOR_KEYS = ['C', 'G', 'D', 'F', 'Bb'];
const T1_MINOR_KEYS = ['A', 'E', 'B', 'D', 'G'];

// Tier 2 key pools (broader)
const T2_MAJOR_KEYS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'];
const T2_MINOR_KEYS = ['A', 'E', 'B', 'F#', 'D', 'G', 'C'];

// Tier 3/4 key pool
const T3_KEYS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'];

const ENCOURAGEMENTS = ['Nice!', 'Correct!', 'You got it!', 'Well done!', 'Great ear!'];

/** Annotation preset: everything off */
const ANN_OFF = {
  showChordLabel: false,
  showNoteNames: false,
  showTransformLabels: false,
  showCommonTones: false,
  showMovingTone: false,
  showIntervalEdge: false,
  showIntervalLabel: false,
  showIntervalDistance: false,
};

/** Annotation preset: show triad info */
const ANN_TRIAD = {
  ...ANN_OFF,
  showChordLabel: true,
  showNoteNames: true,
  showCommonTones: true,
};

/** Annotation preset: show transform info */
const ANN_TRANSFORM = {
  ...ANN_TRIAD,
  showTransformLabels: true,
  showMovingTone: true,
};

// ════════════════════════════════════════════════════════════════════
// INSIGHT BUBBLES
// ════════════════════════════════════════════════════════════════════

const INSIGHTS = [
  {
    id: 'tri-orientation',
    tier: 1,
    phase: 'practice',
    triggerRound: 3,
    message: 'Notice the triangles? Upward-pointing triangles are always major chords. Downward-pointing are always minor. The shape tells you the answer.',
    anchor: 'tonnetz',
  },
  {
    id: 'r-common-tones',
    tier: 2,
    phase: 'practice',
    triggerRound: 2,
    message: 'See how the R arrow connects these chords? Two notes stay the same \u2014 only one moves. That\u2019s why they sound so closely related.',
    anchor: 'tonnetz',
  },
  {
    id: 'r-bidirectional',
    tier: 2,
    phase: 'practice',
    triggerRound: 7,
    message: 'It works both ways \u2014 R takes you from minor back to major too. The Tonnetz doesn\u2019t care which direction you go.',
    anchor: 'tonnetz',
  },
  {
    id: 'transform-edges',
    tier: 3,
    phase: 'practice',
    triggerRound: 2,
    message: 'Each transform flips the triangle across a different edge. The edge that flips shares the two notes that stay the same.',
    anchor: 'tonnetz',
  },
  {
    id: 'tonnetz-axes',
    tier: 'explore',
    phase: 'explore',
    triggerRound: 3,
    message: 'The horizontal lines are all major thirds. The diagonals going up-right are perfect fifths \u2014 the circle of fifths as a straight line.',
    anchor: 'tonnetz',
  },
];

let insightTimer = null; // auto-dismiss timeout handle

/** Get insight engagement state from localStorage. */
function getInsightEngagement() {
  return localStorage.getItem('rkt-insight-engagement'); // null | 'pending' | 'opted-in' | 'opted-out'
}

/** Get dismiss count (number of dismissals without thumbs-up). */
function getInsightDismissCount() {
  return parseInt(localStorage.getItem('rkt-insight-dismiss-count') || '0', 10);
}

/** Check if an insight has already been seen. */
function insightSeen(id) {
  return localStorage.getItem(`rkt-insight-seen:${id}`) === '1';
}

/** Mark an insight as seen. */
function markInsightSeen(id) {
  localStorage.setItem(`rkt-insight-seen:${id}`, '1');
}

/** Remove the current insight bubble with a fade-out. */
function removeInsightBubble() {
  if (insightTimer) { clearTimeout(insightTimer); insightTimer = null; }
  const el = document.getElementById('insight-bubble');
  if (!el) return;
  el.classList.add('rkt-insight-bubble--fadeout');
  setTimeout(() => el.remove(), 300);
}

/** Show an insight bubble anchored below the Tonnetz container. */
function showInsightBubble(insight) {
  // Remove any existing bubble first (no stacking)
  const existing = document.getElementById('insight-bubble');
  if (existing) existing.remove();
  if (insightTimer) { clearTimeout(insightTimer); insightTimer = null; }

  const engagement = getInsightEngagement();

  // Build DOM
  const bubble = document.createElement('div');
  bubble.className = 'rkt-insight-bubble';
  bubble.id = 'insight-bubble';

  // First-time intro heading
  const isFirstTime = !engagement || engagement === 'pending';
  let html = '';
  if (isFirstTime) {
    html += '<div class="rkt-insight-heading">\ud83d\udca1 Did you notice?</div>';
  }
  html += `<p class="rkt-insight-text">${insight.message}</p>`;
  html += '<div class="rkt-insight-actions">';
  html += '<button class="rkt-insight-thumbsup" title="Show me more tips">\ud83d\udc4d</button>';
  html += '<button class="rkt-insight-dismiss" title="Dismiss">\u2715</button>';
  html += '</div>';
  bubble.innerHTML = html;

  // Wire up event handlers
  bubble.querySelector('.rkt-insight-thumbsup').addEventListener('click', () => {
    localStorage.setItem('rkt-insight-engagement', 'opted-in');
    markInsightSeen(insight.id);
    removeInsightBubble();
  });

  bubble.querySelector('.rkt-insight-dismiss').addEventListener('click', () => {
    handleInsightDismiss(insight.id);
  });

  // Append to viz-area, positioned relative to tonnetz container
  const vizArea = document.getElementById('viz-area');
  if (!vizArea) return;
  vizArea.appendChild(bubble);

  // Position dynamically below tonnetz container
  const tc = document.getElementById('tonnetz-container');
  if (tc) {
    bubble.style.top = (tc.offsetTop + tc.offsetHeight) + 'px';
  }

  // Mark as seen
  markInsightSeen(insight.id);

  // Set engagement to 'pending' on first insight
  if (!engagement) {
    localStorage.setItem('rkt-insight-engagement', 'pending');
  }

  // Auto-dismiss after 15 seconds (counts as dismissal)
  insightTimer = setTimeout(() => {
    handleInsightDismiss(insight.id);
  }, 15000);
}

/** Handle a dismissal (✕ or auto-timeout). */
function handleInsightDismiss(id) {
  markInsightSeen(id);
  const count = getInsightDismissCount() + 1;
  localStorage.setItem('rkt-insight-dismiss-count', String(count));
  if (count >= 2 && getInsightEngagement() !== 'opted-in') {
    localStorage.setItem('rkt-insight-engagement', 'opted-out');
  }
  removeInsightBubble();
}

/** Check conditions and maybe show an insight bubble. */
function maybeShowInsight() {
  const engagement = getInsightEngagement();
  if (engagement === 'opted-out') return;

  // Don't stack on top of an existing bubble
  if (document.getElementById('insight-bubble')) return;

  for (const insight of INSIGHTS) {
    if (insightSeen(insight.id)) continue;

    // First insight always shows; others require not-opted-out
    if (insight.id !== 'tri-orientation' && engagement !== 'opted-in' && engagement !== 'pending') continue;
    // After pending: only show more if opted-in (except first)
    if (insight.id !== 'tri-orientation' && engagement === 'pending') continue;

    if (insight.phase === 'practice') {
      if (currentPhase !== 'practice') continue;
      if (currentTier !== insight.tier) continue;
      if (practiceStats[currentTier].roundTotal < insight.triggerRound) continue;
    } else if (insight.phase === 'explore') {
      if (currentMode !== 'explore') continue;
      const transformCount = exploreTrail.filter(e => e.transform).length;
      if (transformCount < insight.triggerRound) continue;
    }

    showInsightBubble(insight);
    return; // show only one at a time
  }
}

// ════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════

let currentTier = 1;          // 1, 2, 3, or 4
let currentPhase = 'learn';   // 'learn' | 'practice' | 'test'

// Learn state (per-tier step positions preserved when switching tiers)
let learnSteps = { 1: 1, 2: 1, 3: 1, 4: 1 };
let learnAudioPlayed = false;
let learnPlaybackId = 0;      // incremented on step change to cancel stale audio
let learnSubStep = 0;         // sub-step within multi-part Learn steps

// Test state
let round = 0;
let score = 0;
let currentKey = null;         // { root, quality }
let testCorrectAnswer = null;  // for Tier 2: { root, quality } of correct answer
let awaitingAnswer = false;

// Practice state
let practiceKey = null;        // { root, quality } — the given key
let practiceCorrectAnswer = null; // for Tier 2: { root, quality }
let practiceAwaitingAnswer = false;
let practiceLastKey = null;    // avoid repeating same key

// Tier 3/4 state
let t3StartChord = null;       // { root, quality }
let t3TargetChord = null;      // { root, quality }
let t3CorrectTransform = null; // 'P' | 'R' | 'L'
let t4Chain = null;            // ['P','R','L',...] — the chain steps
let t4Intermediates = null;    // [{root, quality},...] — intermediate chords in chain

// Per-tier practice stats
let practiceStats = {
  1: { streak: 0, correctTotal: 0, roundTotal: 0 },
  2: { streak: 0, correctTotal: 0, roundTotal: 0 },
  3: { streak: 0, correctTotal: 0, roundTotal: 0 },
  4: { streak: 0, correctTotal: 0, roundTotal: 0 },
};

// Audio state
let isPlaying = false;
let sampler = null;   // shared Tone.Sampler from KeyboardView
let audioStarted = false;
let playbackGeneration = 0; // incremented on phase switch to cancel in-flight progressions

// Education layer
let tipsPill = null;
let tooltipEngine = null;

// Explore state
let currentMode = 'phases';      // 'phases' | 'explore'
let exploreTrail = [];           // [{ root, quality, transform? }]
const MAX_TRAIL = 6;
let exploreDepth = 1;
let exploreCurrent = null;       // { root, quality } — currently selected triad

// ════════════════════════════════════════════════════════════════════
// DOM
// ════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function displayNote(name) {
  return name.replace(/♯/g, '#').replace(/♭/g, 'b');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert voicing strings (e.g. ['C4', 'E4', 'G4']) to HarmonyState activeNotes format.
 * @param {string[]} voicingNotes — array of "NoteName+Octave" strings (e.g. 'Bb4', 'F#3')
 * @param {string} source — 'triad', 'playback', 'scale', etc.
 * @returns {Array<{note: string, octave: number, source: string, color: null}>}
 */
function voicingToActiveNotes(voicingNotes, source) {
  return voicingNotes.map(n => {
    const match = n.match(/^([A-Ga-g][#b]?)(\d+)$/);
    if (!match) return null;
    return { note: match[1], octave: Number(match[2]), source: source || 'playback', color: null };
  }).filter(Boolean);
}

/** Return the tips-pill topic list for the given tier. */
function tipsForTier(tier) {
  if (tier === 1) return [{ id: 'triads', relevance: 'high' }];
  if (tier === 2) return [
    { id: 'relative_minor_major', relevance: 'high' },
    { id: 'triads', relevance: 'medium' },
  ];
  return [
    { id: 'tonnetz_transforms', relevance: 'high' },
    { id: 'relative_minor_major', relevance: 'medium' },
  ];
}

/** Get the current tier's learn step. */
function getLearnStep() {
  return learnSteps[currentTier];
}

/** Set the current tier's learn step. */
function setLearnStep(step) {
  learnSteps[currentTier] = step;
}

// ════════════════════════════════════════════════════════════════════
// AUDIO
// ════════════════════════════════════════════════════════════════════

/** Obtain (or await) the shared Sampler from KeyboardView. */
async function ensureAudio() {
  if (sampler) return;
  sampler = await KeyboardView.getSampler();
}

/**
 * Get chord voicing notes for a triad, voiced ascending from startOctave.
 * Notes that would wrap below are pushed up an octave.
 */
function chordVoicing(root, quality, startOctave) {
  startOctave = startOctave || 4;
  const notes = triadNotes(root, quality);
  if (!notes) return [];
  let oct = startOctave;
  let prevPC = -1;
  return notes.map(n => {
    const ascii = n.replace(/♯/g, '#').replace(/♭/g, 'b');
    const pc = noteToPC(n);
    if (prevPC >= 0 && pc <= prevPC) oct++;
    prevPC = pc;
    return `${ascii}${oct}`;
  });
}

/**
 * Build a 4-chord progression for a key.
 * Major: I - IV - V - I     Minor: i - iv - V - i
 */
function buildProgression(root, quality) {
  const rootPC = noteToPC(root);
  const spell = spellingForKey(root, quality);

  if (quality === 'major') {
    const IV = spell((rootPC + 5) % 12);
    const V = spell((rootPC + 7) % 12);
    return [
      { notes: chordVoicing(root, 'major') },
      { notes: chordVoicing(IV, 'major') },
      { notes: chordVoicing(V, 'major') },
      { notes: chordVoicing(root, 'major') },
    ];
  } else {
    const iv = spell((rootPC + 5) % 12);
    const V = spell((rootPC + 7) % 12);
    return [
      { notes: chordVoicing(root, 'minor') },
      { notes: chordVoicing(iv, 'minor') },
      { notes: chordVoicing(V, 'major') },
      { notes: chordVoicing(root, 'minor') },
    ];
  }
}

/**
 * Play a chord progression. Returns a promise that resolves on completion.
 * Uses the shared Salamander piano sampler from KeyboardView.
 */
async function playProgression(chords, bpm) {
  console.log('[playProg] called, isPlaying:', isPlaying);

  if (isPlaying) return;
  if (window.AudioToggle && AudioToggle.isMuted()) return;

  await ensureAudio();

  console.log('[playProg]', {
    samplerExists: !!sampler,
    toneState: Tone.context.state,
    samplerLoaded: sampler?.loaded,
  });

  isPlaying = true;
  const myGen = playbackGeneration;

  const beatDur = 60 / bpm;
  const drama = 0.3 + Math.random() * 0.7;  // 0.3 = subtle, 1.0 = full dynamics

  for (let i = 0; i < chords.length; i++) {
    // Check cancellation before each chord
    if (playbackGeneration !== myGen) { isPlaying = false; return; }

    const chord = chords[i];
    const baseVol = [-2, -8, -5, 2][i] || 0;
    const vol = baseVol * drama;
    const jitter = (Math.random() * 3 - 1.5) * drama;
    sampler.volume.value = vol + jitter;

    // Highlight the chord on the keyboard
    HarmonyState.update({ activeNotes: voicingToActiveNotes(chord.notes, 'playback') });

    sampler.triggerAttackRelease(chord.notes, beatDur * 0.9, Tone.now());

    await delay(beatDur * 1000);
  }

  // Reset volume and clear highlights after progression
  if (playbackGeneration === myGen) {
    sampler.volume.value = 0;
    HarmonyState.update({ activeNotes: [] });
  }
  isPlaying = false;
}

/** Stop any sounding notes and reset playing flag. */
function stopAllAudio() {
  isPlaying = false;
  playbackGeneration++;  // Cancel any in-flight progressions
  try {
    if (sampler) sampler.releaseAll();
  } catch (_) { /* ignore */ }
}

// ════════════════════════════════════════════════════════════════════
// DISTRACTOR GENERATION (Tier 2)
// ════════════════════════════════════════════════════════════════════

/**
 * Generate plausible wrong answers for Tier 2 questions.
 * @param {string} originalRoot - root of the given key
 * @param {string} originalQuality - quality of the given key
 * @param {string} correctRoot - root of the correct answer
 * @param {string} targetQuality - quality the answer must be ("major" or "minor")
 * @param {number} count - number of distractors
 * @returns {Array<{root: string, quality: string}>}
 */
function generateDistractors(originalRoot, originalQuality, correctRoot, targetQuality, count) {
  count = count || 3;
  const correctPC = noteToPC(correctRoot);
  const distractorPCs = new Set([correctPC]);
  const distractors = [];

  // 1. P transform from the original key → parallel (common confusion)
  const pResult = TRANSFORMS.P.apply(originalRoot, originalQuality);
  // If target quality matches, check that it's different from correct
  if (pResult.quality === targetQuality && noteToPC(pResult.root) !== correctPC) {
    if (!distractorPCs.has(noteToPC(pResult.root))) {
      distractors.push({ root: displayNote(pResult.root), quality: targetQuality });
      distractorPCs.add(noteToPC(pResult.root));
    }
  }

  // 2. L transform from the original key → leading-tone relative
  const lResult = TRANSFORMS.L.apply(originalRoot, originalQuality);
  if (lResult.quality === targetQuality && noteToPC(lResult.root) !== correctPC) {
    if (!distractorPCs.has(noteToPC(lResult.root))) {
      distractors.push({ root: displayNote(lResult.root), quality: targetQuality });
      distractorPCs.add(noteToPC(lResult.root));
    }
  }

  // If L result is wrong quality, apply R to get another nearby key of target quality
  if (distractors.length < count && lResult.quality !== targetQuality) {
    const lrResult = TRANSFORMS.R.apply(lResult.root, lResult.quality);
    if (lrResult.quality === targetQuality && !distractorPCs.has(noteToPC(lrResult.root))) {
      distractors.push({ root: displayNote(lrResult.root), quality: targetQuality });
      distractorPCs.add(noteToPC(lrResult.root));
    }
  }

  // If P result is wrong quality, try its R neighbor
  if (distractors.length < count && pResult.quality !== targetQuality) {
    const prResult = TRANSFORMS.R.apply(pResult.root, pResult.quality);
    if (prResult.quality === targetQuality && !distractorPCs.has(noteToPC(prResult.root))) {
      distractors.push({ root: displayNote(prResult.root), quality: targetQuality });
      distractorPCs.add(noteToPC(prResult.root));
    }
  }

  // 3. Fill remaining with random keys of target quality
  const pool = targetQuality === 'minor' ? T2_MINOR_KEYS : T2_MAJOR_KEYS;
  let attempts = 0;
  while (distractors.length < count && attempts < 30) {
    attempts++;
    const r = pickRandom(pool);
    const rPC = noteToPC(r);
    if (!distractorPCs.has(rPC)) {
      distractors.push({ root: displayNote(r), quality: targetQuality });
      distractorPCs.add(rPC);
    }
  }

  return shuffleArray(distractors).slice(0, count);
}

// ════════════════════════════════════════════════════════════════════
// LEARN PHASE
// ════════════════════════════════════════════════════════════════════

/** C major scale notes (used in Tier 1 Step 4). */
const C_MAJOR_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// ── Tier 1 Learn scripts ────────────────────────────────────────────

const LEARN_SCRIPTS_T1 = [
  // ── Step 1: "This Is a Major Chord" ─────────────────────────────
  {
    narration:
      'This is C major — three notes that make a bright, stable sound. Listen.',
    setup() {
      HarmonyState.update({ annotations: { ...ANN_TRIAD, showNoteNames: true } });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      await playProgression(buildProgression('C', 'major'), BPM);
    },
  },

  // ── Step 2: "This Is Its Relative Minor" ────────────────────────
  {
    narration:
      'Watch the Tonnetz — two notes stay the same, and only one moves. That tiny shift changes everything.',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await delay(1000);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },

  // ── Step 3: "The Pattern Is Always the Same" ────────────────────
  {
    narration:
      'Every major chord has a relative minor in the same spot on the Tonnetz — one step along the R arrow. Watch.',
    subSteps: 2,
    subStepLabel: 'Show another →',
    afterText:
      'The R arrow always points to the relative minor — no matter what key you start in.',
    setup(sub) {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad(sub === 0 ? 'G' : 'F', 'major');
    },
    async play(sub) {
      const id = learnPlaybackId;
      const [majRoot, minRoot] = sub === 0 ? ['G', 'E'] : ['F', 'D'];
      await playProgression(buildProgression(majRoot, 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', majRoot, 'major');
      await playProgression(buildProgression(minRoot, 'minor'), BPM);
    },
  },

  // ── Step 4: "They Share the Same Notes" ─────────────────────────
  {
    narration:
      'C major and A minor use the exact same notes from the C major scale. They just call a different note "home."',
    subSteps: 2,
    subStepLabel: 'Show A minor →',
    setup(sub) {
      const scaleAN = C_MAJOR_SCALE.map(n => ({
        note: n, octave: 4, source: 'scale', color: null,
      }));
      if (sub === 0) {
        const triadAN = ['C', 'E', 'G'].map(n => ({
          note: n, octave: 4, source: 'triad', color: null,
        }));
        HarmonyState.update({
          annotations: { ...ANN_TRIAD, showNoteNames: true },
          activeTriads: [
            { root: 'C', quality: 'major', notes: ['C', 'E', 'G'], role: 'primary', color: null },
          ],
          activeNotes: [...triadAN, ...scaleAN],
          tonnetzCenter: { root: 'C', quality: 'major' },
          activeTransform: null,
        });
      } else {
        const triadAN = ['A', 'C', 'E'].map(n => ({
          note: n, octave: 4, source: 'triad', color: null,
        }));
        HarmonyState.update({
          annotations: { ...ANN_TRIAD, showNoteNames: true },
          activeTriads: [
            { root: 'C', quality: 'major', notes: ['C', 'E', 'G'], role: 'secondary', color: null },
            { root: 'A', quality: 'minor', notes: ['A', 'C', 'E'], role: 'primary', color: null },
          ],
          activeNotes: [...triadAN, ...scaleAN],
          tonnetzCenter: { root: 'C', quality: 'major' },
          activeTransform: null,
        });
      }
    },
    async play() {
      // Visual-only step — no audio
    },
  },

  // ── Step 5: "Hear the Difference" ───────────────────────────────
  {
    narration:
      'Same family of notes, completely different mood. Major sounds bright and resolved. Minor sounds darker and more wistful.',
    afterText: 'Ready to try it yourself →',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(2000);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },
];

// ── Tier 2 Learn scripts ────────────────────────────────────────────

const LEARN_SCRIPTS_T2 = [
  // ── Step 1: "Every Major Has a Relative Minor" ──────────────────
  {
    narration:
      'You already know <span data-theory="triads">major</span> sounds bright and <span data-theory="triads">minor</span> sounds dark. Now here\u2019s the secret \u2014 every major key has a <span data-theory="relative_minor_major">relative minor</span> that uses the exact same notes.',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },

  // ── Step 2: "The R Transform" ───────────────────────────────────
  {
    narration:
      'On the Tonnetz, the <span data-theory="tonnetz_transforms">R arrow</span> always points from a <span data-theory="triads">major chord</span> to its <span data-theory="relative_minor_major">relative minor</span>. Two notes stay \u2014 one moves up by a whole step.',
    afterText:
      'R stands for Relative \u2014 the closest minor key to any major key.',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await delay(800);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },

  // ── Step 3: "It Works in Every Key" ─────────────────────────────
  {
    narration:
      'The <span data-theory="tonnetz_transforms">R transform</span> works the same way no matter what key you\u2019re in. Watch.',
    subSteps: 3,
    subStepLabel: 'Another key →',
    afterText:
      'Same pattern every time \u2014 the R arrow always finds the relative minor.',
    setup(sub) {
      const pairs = [['G', 'E'], ['F', 'D'], ['D', 'B']];
      const [majRoot] = pairs[sub];
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad(majRoot, 'major');
    },
    async play(sub) {
      const id = learnPlaybackId;
      const pairs = [['G', 'E'], ['F', 'D'], ['D', 'B']];
      const [majRoot, minRoot] = pairs[sub];
      await playProgression(buildProgression(majRoot, 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', majRoot, 'major');
      await playProgression(buildProgression(minRoot, 'minor'), BPM);
    },
  },

  // ── Step 4: "Going the Other Direction" ─────────────────────────
  {
    narration:
      'It works backwards too. Every minor key has a <span data-theory="relative_minor_major">relative major</span>. The <span data-theory="tonnetz_transforms">R arrow</span> goes both ways.',
    subSteps: 2,
    subStepLabel: 'Show the reverse →',
    afterText:
      'Minor to major, major to minor \u2014 the R transform always connects them.',
    setup(sub) {
      const pairs = [['A', 'C'], ['E', 'G']];
      const [minRoot] = pairs[sub];
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad(minRoot, 'minor');
    },
    async play(sub) {
      const id = learnPlaybackId;
      const pairs = [['A', 'C'], ['E', 'G']];
      const [minRoot, majRoot] = pairs[sub];
      await playProgression(buildProgression(minRoot, 'minor'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', minRoot, 'minor');
      await playProgression(buildProgression(majRoot, 'major'), BPM);
    },
  },

  // ── Step 5: "Your Turn" ─────────────────────────────────────────
  {
    narration:
      'Now you know the relationship. In Practice mode, you\u2019ll hear a major key and pick its <span data-theory="relative_minor_major">relative minor</span>. Listen for the shared notes \u2014 that\u2019s your clue.',
    afterText: 'Ready to try it yourself \u2192',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },
];

// ── Tier 3 Learn scripts ────────────────────────────────────────────

const LEARN_SCRIPTS_T3 = [
  // ── Step 1: "You Know R — Now Meet P and L" ─────────────────────
  {
    narration:
      'You already know <span data-theory="tonnetz_transforms">R</span> \u2014 it connects <span data-theory="relative_minor_major">relative major and minor</span>. Now meet <span data-theory="tonnetz_transforms">P</span>: the Parallel transform. Same root, opposite quality.',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('P', 'C', 'major');
      await playProgression(buildProgression('C', 'minor'), BPM);
    },
  },

  // ── Step 2: "P: Same Root, New Mood" ────────────────────────────
  {
    narration:
      '<span data-theory="tonnetz_transforms">P</span> keeps the root the same \u2014 only the third moves. <span data-theory="triads">Major</span> becomes <span data-theory="triads">minor</span>, minor becomes major.',
    subSteps: 2,
    subStepLabel: 'Another key →',
    afterText:
      'The root stays the same — only the third moves. That tiny shift flips the mood.',
    setup(sub) {
      const roots = ['G', 'F'];
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad(roots[sub], 'major');
    },
    async play(sub) {
      const id = learnPlaybackId;
      const roots = ['G', 'F'];
      const root = roots[sub];
      await playProgression(buildProgression(root, 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('P', root, 'major');
      await playProgression(buildProgression(root, 'minor'), BPM);
    },
  },

  // ── Step 3: "L: The Leading-Tone Exchange" ─────────────────────
  {
    narration:
      '<span data-theory="tonnetz_transforms">L</span> connects chords that share two notes, but the root changes. Watch: C major becomes E minor.',
    afterText:
      'L stands for Leading-tone \u2014 the note that moves is always a half step.',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('L', 'C', 'major');
      await playProgression(buildProgression('E', 'minor'), BPM);
    },
  },

  // ── Step 4: "Three Transforms, Three Relationships" ─────────────
  {
    narration:
      'From any chord, <span data-theory="tonnetz_transforms">P, L, and R</span> each go to a different neighbor. Watch all three from C major.',
    subSteps: 3,
    subStepLabel: 'Next transform →',
    afterText:
      'Every triangle on the Tonnetz has P, L, and R on its three edges.',
    setup(sub) {
      const transforms = ['R', 'P', 'L'];
      if (sub === 0) {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('C', 'major');
      } else {
        // Reset to C major before showing next transform
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('C', 'major');
      }
    },
    async play(sub) {
      const id = learnPlaybackId;
      const transforms = ['R', 'P', 'L'];
      const t = transforms[sub];
      const result = TRANSFORMS[t].apply('C', 'major');
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1000);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform(t, 'C', 'major');
      await playProgression(buildProgression(result.root, result.quality), BPM);
    },
  },

  // ── Step 5: "Your Turn" ────────────────────────────────────────
  {
    narration:
      'You\'ll hear two chords. Your job: which transform connects them \u2014 <span data-theory="tonnetz_transforms">P, R, or L</span>?',
    afterText: 'Ready to try it yourself →',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },
];

// ── Tier 4 Learn scripts ────────────────────────────────────────────

const LEARN_SCRIPTS_T4 = [
  // ── Step 1: "Combining Transforms" ──────────────────────────────
  {
    narration:
      'You\'ve learned <span data-theory="tonnetz_transforms">P, L, and R</span> individually. Now let\'s combine them. Watch: C major \u2192 R \u2192 A minor \u2192 P \u2192 A major.',
    subSteps: 2,
    subStepLabel: 'Next step →',
    setup(sub) {
      if (sub === 0) {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('C', 'major');
      } else {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('A', 'minor');
      }
    },
    async play(sub) {
      const id = learnPlaybackId;
      if (sub === 0) {
        await playProgression(buildProgression('C', 'major'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('R', 'C', 'major');
        await playProgression(buildProgression('A', 'minor'), BPM);
      } else {
        await playProgression(buildProgression('A', 'minor'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('P', 'A', 'minor');
        await playProgression(buildProgression('A', 'major'), BPM);
      }
    },
  },

  // ── Step 2: "R then L" ─────────────────────────────────────────
  {
    narration:
      'Each transform is one edge on the Tonnetz \u2014 chains trace a path. Watch: C major \u2192 <span data-theory="tonnetz_transforms">R</span> \u2192 A minor \u2192 <span data-theory="tonnetz_transforms">L</span> \u2192 F major.',
    subSteps: 2,
    subStepLabel: 'Next step →',
    afterText:
      'Two steps, two edges, one path on the Tonnetz.',
    setup(sub) {
      if (sub === 0) {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('C', 'major');
      } else {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('A', 'minor');
      }
    },
    async play(sub) {
      const id = learnPlaybackId;
      if (sub === 0) {
        await playProgression(buildProgression('C', 'major'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('R', 'C', 'major');
        await playProgression(buildProgression('A', 'minor'), BPM);
      } else {
        await playProgression(buildProgression('A', 'minor'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('L', 'A', 'minor');
        const lResult = TRANSFORMS.L.apply('A', 'minor');
        await playProgression(buildProgression(lResult.root, lResult.quality), BPM);
      }
    },
  },

  // ── Step 3: "Any Combination Works" ────────────────────────────
  {
    narration:
      'Any combination works. Watch <span data-theory="tonnetz_transforms">P</span> then <span data-theory="tonnetz_transforms">R</span> from G major.',
    subSteps: 2,
    subStepLabel: 'Next step →',
    afterText:
      'The Tonnetz is a map — every chain traces a route between triads.',
    setup(sub) {
      if (sub === 0) {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('G', 'major');
      } else {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('G', 'minor');
      }
    },
    async play(sub) {
      const id = learnPlaybackId;
      if (sub === 0) {
        await playProgression(buildProgression('G', 'major'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('P', 'G', 'major');
        await playProgression(buildProgression('G', 'minor'), BPM);
      } else {
        await playProgression(buildProgression('G', 'minor'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('R', 'G', 'minor');
        const rResult = TRANSFORMS.R.apply('G', 'minor');
        await playProgression(buildProgression(rResult.root, rResult.quality), BPM);
      }
    },
  },

  // ── Step 4: "Reading the Chain" ────────────────────────────────
  {
    narration:
      'You\'ll see chain notation like "<span data-theory="tonnetz_transforms">P</span> \u2192 <span data-theory="tonnetz_transforms">R</span>". Starting from D major, follow the path.',
    subSteps: 2,
    subStepLabel: 'Next step →',
    afterText:
      'Read the chain left to right — each letter is one move on the Tonnetz.',
    setup(sub) {
      if (sub === 0) {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('D', 'major');
        // Show chain notation
        showChainNotation(['P', 'R']);
      } else {
        HarmonyState.update({ annotations: ANN_TRIAD });
        HarmonyState.setTriad('D', 'minor');
      }
    },
    async play(sub) {
      const id = learnPlaybackId;
      if (sub === 0) {
        await playProgression(buildProgression('D', 'major'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('P', 'D', 'major');
        await playProgression(buildProgression('D', 'minor'), BPM);
      } else {
        await playProgression(buildProgression('D', 'minor'), BPM);
        if (learnPlaybackId !== id) return;
        await delay(1000);
        if (learnPlaybackId !== id) return;
        HarmonyState.update({ annotations: ANN_TRANSFORM });
        HarmonyState.setTransform('R', 'D', 'minor');
        const rResult = TRANSFORMS.R.apply('D', 'minor');
        await playProgression(buildProgression(rResult.root, rResult.quality), BPM);
      }
    },
  },

  // ── Step 5: "Your Turn" ────────────────────────────────────────
  {
    narration:
      'You\'ll see a starting chord and a chain. Pick the chord it lands on.',
    afterText: 'Ready to try it yourself →',
    setup() {
      HarmonyState.update({ annotations: ANN_TRIAD });
      HarmonyState.setTriad('C', 'major');
      hideChainNotation();
    },
    async play() {
      const id = learnPlaybackId;
      await playProgression(buildProgression('C', 'major'), BPM);
      if (learnPlaybackId !== id) return;
      await delay(1500);
      if (learnPlaybackId !== id) return;
      HarmonyState.update({ annotations: ANN_TRANSFORM });
      HarmonyState.setTransform('R', 'C', 'major');
      await playProgression(buildProgression('A', 'minor'), BPM);
    },
  },
];

// ════════════════════════════════════════════════════════════════════
// CHAIN HELPERS (Tier 4)
// ════════════════════════════════════════════════════════════════════

/** Apply a chain of transforms starting from a chord, returning all intermediates. */
function applyChain(root, quality, chain) {
  const steps = [{ root, quality }];
  let cur = { root, quality };
  for (const t of chain) {
    const result = TRANSFORMS[t].apply(cur.root, cur.quality);
    cur = { root: result.root, quality: result.quality };
    steps.push(cur);
  }
  return steps; // length = chain.length + 1
}

/** Generate a random chain of length n. */
function randomChain(n) {
  const transforms = ['P', 'R', 'L'];
  const chain = [];
  for (let i = 0; i < n; i++) {
    chain.push(pickRandom(transforms));
  }
  return chain;
}

/** Show chain notation in the chain-display element. */
function showChainNotation(chain) {
  const el = $('chain-display');
  el.style.display = '';
  const notation = $('chain-notation');
  notation.innerHTML = chain.map(t =>
    `<span class="rkt-chain-letter">${t}</span>`
  ).join('<span class="rkt-chain-arrow"> → </span>');
}

/** Hide chain notation. */
function hideChainNotation() {
  $('chain-display').style.display = 'none';
  $('chain-notation').innerHTML = '';
}

/** Generate distractors for Tier 4 by applying alternative chains. */
function generateChainDistractors(startRoot, startQuality, chain, correctRoot, correctQuality, count) {
  count = count || 3;
  const correctPC = noteToPC(correctRoot);
  const seen = new Set([`${correctPC}-${correctQuality}`]);
  const distractors = [];
  const transforms = ['P', 'R', 'L'];
  const chainLen = chain.length;

  // Generate alternative chains of the same length
  let attempts = 0;
  while (distractors.length < count && attempts < 50) {
    attempts++;
    // Build a plausible alternative chain
    const altChain = [...chain];
    // Modify 1-2 positions
    const pos = Math.floor(Math.random() * chainLen);
    altChain[pos] = pickRandom(transforms);
    const steps = applyChain(startRoot, startQuality, altChain);
    const final = steps[steps.length - 1];
    const key = `${noteToPC(final.root)}-${final.quality}`;
    if (!seen.has(key)) {
      seen.add(key);
      distractors.push({ root: displayNote(final.root), quality: final.quality });
    }
  }

  // Fill with random single-transform results if needed
  while (distractors.length < count) {
    const t = pickRandom(transforms);
    const result = TRANSFORMS[t].apply(startRoot, startQuality);
    const key = `${noteToPC(result.root)}-${result.quality}`;
    if (!seen.has(key)) {
      seen.add(key);
      distractors.push({ root: displayNote(result.root), quality: result.quality });
    }
    // Last resort: random key
    if (distractors.length < count && attempts > 60) {
      const r = pickRandom(T3_KEYS);
      const q = Math.random() < 0.5 ? 'major' : 'minor';
      const k2 = `${noteToPC(r)}-${q}`;
      if (!seen.has(k2)) {
        seen.add(k2);
        distractors.push({ root: displayNote(r), quality: q });
      }
    }
    attempts++;
    if (attempts > 80) break;
  }

  return shuffleArray(distractors).slice(0, count);
}

/** Get the learn scripts for the current tier. */
function getLearnScripts() {
  if (currentTier === 1) return LEARN_SCRIPTS_T1;
  if (currentTier === 2) return LEARN_SCRIPTS_T2;
  if (currentTier === 3) return LEARN_SCRIPTS_T3;
  return LEARN_SCRIPTS_T4;
}

/** Show a sub-step advance button in the extras area. */
function showSubStepButton(label) {
  const extras = $('learn-extras');
  extras.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'rkt-btn rkt-btn--accent';
  btn.textContent = label;
  btn.addEventListener('click', advanceSubStep);
  extras.appendChild(btn);
}

/** Show annotation text in the extras area (appends, does not clear). */
function showAfterText(text) {
  const extras = $('learn-extras');
  const p = document.createElement('p');
  p.className = 'rkt-annotation-text';
  p.textContent = text;
  extras.appendChild(p);

  // On step 5, add "or Explore freely" link
  if (getLearnStep() === 5) {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'rkt-explore-link';
    link.textContent = 'or Explore freely →';
    link.style.display = 'block';
    link.style.textAlign = 'center';
    link.style.marginTop = '0.5rem';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      enterExplore();
    });
    extras.appendChild(link);
  }
}

/** Advance to the next sub-step within the current Learn step. */
async function advanceSubStep() {
  learnSubStep++;
  learnPlaybackId++;
  const myId = learnPlaybackId;
  const scripts = getLearnScripts();
  const script = scripts[getLearnStep() - 1];
  const totalSubSteps = script.subSteps || 1;

  $('learn-extras').innerHTML = '';
  $('btn-learn-next').disabled = true;

  script.setup(learnSubStep);
  await script.play(learnSubStep);

  if (learnPlaybackId !== myId) return;

  if (learnSubStep < totalSubSteps - 1) {
    showSubStepButton(script.subStepLabel || 'Continue →');
  } else {
    learnAudioPlayed = true;
    $('btn-learn-next').disabled = false;
    if (script.afterText) showAfterText(script.afterText);
  }
}

/** Navigate to a Learn step (1–5). Sets up visuals and plays audio. */
async function showLearnStep(step) {
  setLearnStep(step);
  learnSubStep = 0;
  learnAudioPlayed = false;
  learnPlaybackId++;
  const myId = learnPlaybackId;

  stopAllAudio();

  const scripts = getLearnScripts();
  const script = scripts[step - 1];
  const totalSubSteps = script.subSteps || 1;

  // Fade narration
  const narEl = $('narration-text');
  narEl.style.opacity = '0';
  await delay(150);
  if (learnPlaybackId !== myId) return;
  narEl.innerHTML = script.narration;
  narEl.style.opacity = '1';

  // Re-scan for [data-theory] tooltip triggers in new narration
  if (tooltipEngine) tooltipEngine.refreshTriggers();

  // Step indicator
  $('step-indicator').textContent = `Step ${step} of 5`;

  // Clear extras
  $('learn-extras').innerHTML = '';

  // Nav buttons
  $('btn-learn-back').disabled = step === 1;
  $('btn-learn-next').disabled = true;
  $('btn-learn-next').textContent = step === 5 ? 'Start practicing →' : 'Next →';

  // Setup visuals
  script.setup(0);

  // console logging
  console.log('[learn] about to play step', step, 'tier', currentTier);

  // Play audio
  await script.play(0);

  // Post-play: sub-step button or enable Next
  if (learnPlaybackId !== myId) return;

  if (totalSubSteps > 1) {
    showSubStepButton(script.subStepLabel || 'Continue →');
  } else {
    learnAudioPlayed = true;
    $('btn-learn-next').disabled = false;
    if (script.afterText) showAfterText(script.afterText);
  }
}

/** Replay the current Learn step/sub-step's audio. */
async function learnReplay() {
  if (isPlaying) return;

  learnPlaybackId++;
  const myId = learnPlaybackId;
  learnAudioPlayed = false;
  $('btn-learn-next').disabled = true;
  $('learn-extras').innerHTML = '';

  const scripts = getLearnScripts();
  const script = scripts[getLearnStep() - 1];
  const totalSubSteps = script.subSteps || 1;

  script.setup(learnSubStep);
  await script.play(learnSubStep);

  if (learnPlaybackId !== myId) return;

  if (learnSubStep < totalSubSteps - 1) {
    showSubStepButton(script.subStepLabel || 'Continue →');
  } else {
    learnAudioPlayed = true;
    $('btn-learn-next').disabled = false;
    if (script.afterText) showAfterText(script.afterText);
  }
}

// ════════════════════════════════════════════════════════════════════
// TEST PHASE
// ════════════════════════════════════════════════════════════════════

function generateTestRound() {
  if (currentTier === 1) {
    const isMajor = Math.random() < 0.5;
    const root = isMajor ? pickRandom(T1_MAJOR_KEYS) : pickRandom(T1_MINOR_KEYS);
    return { root, quality: isMajor ? 'major' : 'minor' };
  }

  if (currentTier === 2) {
    // Tier 2: ask "find the relative minor" or "find the relative major"
    // After round 5, mix both directions; before that, only major→minor
    const askReverse = round >= 5 && Math.random() < 0.5;
    if (askReverse) {
      const root = pickRandom(T2_MINOR_KEYS);
      const answer = TRANSFORMS.R.apply(root, 'minor');
      return {
        root,
        quality: 'minor',
        direction: 'minor-to-major',
        correctAnswer: { root: displayNote(answer.root), quality: answer.quality },
      };
    } else {
      const root = pickRandom(T2_MAJOR_KEYS);
      const answer = TRANSFORMS.R.apply(root, 'major');
      return {
        root,
        quality: 'major',
        direction: 'major-to-minor',
        correctAnswer: { root: displayNote(answer.root), quality: answer.quality },
      };
    }
  }

  if (currentTier === 3) {
    // Tier 3: hear two chords, name the transform (P, R, or L)
    const root = pickRandom(T3_KEYS);
    // Rounds 1-5: always major start; rounds 6-10: mix
    const quality = (round < 5) ? 'major' : (Math.random() < 0.5 ? 'major' : 'minor');
    const transform = pickRandom(['P', 'R', 'L']);
    const target = TRANSFORMS[transform].apply(root, quality);
    t3StartChord = { root, quality };
    t3TargetChord = { root: target.root, quality: target.quality };
    t3CorrectTransform = transform;
    return { root, quality, transform, target: t3TargetChord };
  }

  // Tier 4: follow the chain
  const root = pickRandom(T3_KEYS);
  const quality = (round < 5) ? 'major' : (Math.random() < 0.5 ? 'major' : 'minor');
  const chainLen = (round < 5) ? 2 : (Math.random() < 0.5 ? 2 : 3);
  const chain = randomChain(chainLen);
  const steps = applyChain(root, quality, chain);
  const final = steps[steps.length - 1];
  t3StartChord = { root, quality };
  t3TargetChord = { root: final.root, quality: final.quality };
  t4Chain = chain;
  t4Intermediates = steps;
  return {
    root,
    quality,
    chain,
    correctAnswer: { root: displayNote(final.root), quality: final.quality },
  };
}

function showTestQuestion() {
  const btnArea = $('answer-buttons');
  btnArea.innerHTML = '';

  if (currentTier === 1) {
    $('question-text').textContent = 'Is this major or minor?';
    ['Major', 'Minor'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => handleTestAnswer(label.toLowerCase()));
      btnArea.appendChild(btn);
    });
  } else if (currentTier === 2) {
    const dir = currentKey.direction;
    if (dir === 'major-to-minor') {
      $('question-text').textContent =
        `What is the relative minor of ${displayNote(currentKey.root)} major?`;
    } else {
      $('question-text').textContent =
        `What is the relative major of ${displayNote(currentKey.root)} minor?`;
    }

    const correct = testCorrectAnswer;
    const targetQuality = correct.quality;
    const distractors = generateDistractors(
      currentKey.root, currentKey.quality, correct.root, targetQuality
    );
    const options = shuffleArray([correct, ...distractors]);

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.textContent = `${opt.root} ${opt.quality}`;
      btn.addEventListener('click', () => handleTestAnswer(opt.root, opt.quality));
      btnArea.appendChild(btn);
    });
  } else if (currentTier === 3) {
    $('question-text').textContent = 'Which transform connects these two chords?';
    ['P', 'R', 'L'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => handleTestAnswer(label));
      btnArea.appendChild(btn);
    });
  } else {
    // Tier 4
    const startLabel = `${displayNote(currentKey.root)} ${currentKey.quality}`;
    $('question-text').textContent = `Starting from ${startLabel}, what chord do you reach?`;
    showChainNotation(currentKey.chain);

    const correct = testCorrectAnswer;
    const distractors = generateChainDistractors(
      currentKey.root, currentKey.quality, currentKey.chain,
      correct.root, correct.quality
    );
    const options = shuffleArray([correct, ...distractors]);

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.textContent = `${opt.root} ${opt.quality}`;
      btn.addEventListener('click', () => handleTestAnswer(opt.root, opt.quality));
      btnArea.appendChild(btn);
    });
  }
}

async function handleTestAnswer(answerRootOrQuality, answerQuality) {
  if (!awaitingAnswer) return;
  awaitingAnswer = false;

  let correct;
  if (currentTier === 1) {
    correct = currentKey.quality === answerRootOrQuality;
  } else if (currentTier === 2) {
    correct =
      noteToPC(answerRootOrQuality) === noteToPC(testCorrectAnswer.root) &&
      answerQuality === testCorrectAnswer.quality;
  } else if (currentTier === 3) {
    correct = answerRootOrQuality === t3CorrectTransform;
  } else {
    // Tier 4
    correct =
      noteToPC(answerRootOrQuality) === noteToPC(testCorrectAnswer.root) &&
      answerQuality === testCorrectAnswer.quality;
  }

  if (correct) score++;

  if (currentTier === 1) {
    HarmonyState.update({ annotations: ANN_TRIAD });
    HarmonyState.setTriad(currentKey.root, currentKey.quality);
    showFeedback(correct, `It was ${displayNote(currentKey.root)} ${currentKey.quality}.`);
  } else if (currentTier === 2) {
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform('R', currentKey.root, currentKey.quality);

    const ca = testCorrectAnswer;
    if (correct) {
      showFeedback(true, `${ca.root} ${ca.quality} is the relative ${ca.quality} of ${displayNote(currentKey.root)} ${currentKey.quality}.`);
    } else {
      showFeedback(false, `The relative ${ca.quality} of ${displayNote(currentKey.root)} ${currentKey.quality} is ${ca.root} ${ca.quality}. Watch the R arrow.`);
    }
    const correctProg = buildProgression(ca.root, ca.quality);
    playProgression(correctProg, BPM);
  } else if (currentTier === 3) {
    // Reveal the correct transform on Tonnetz
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform(t3CorrectTransform, t3StartChord.root, t3StartChord.quality);

    const tName = TRANSFORMS[t3CorrectTransform].name;
    if (correct) {
      showFeedback(true, `That was ${t3CorrectTransform} — ${tName}.`);
    } else {
      showFeedback(false, `It was ${t3CorrectTransform} (${tName}). Watch the arrow on the Tonnetz.`);
    }
  } else {
    // Tier 4: animate chain step by step
    hideChainNotation();
    const ca = testCorrectAnswer;
    if (correct) {
      showFeedback(true, `${ca.root} ${ca.quality}! You traced the chain correctly.`);
    } else {
      showFeedback(false, `The chain leads to ${ca.root} ${ca.quality}. Watch the path.`);
    }
    await animateChainReveal(t3StartChord.root, t3StartChord.quality, t4Chain);
  }

  disableAnswerButtons();

  setTimeout(() => {
    round++;
    if (round >= ROUNDS_PER_SESSION) {
      showResults();
    } else {
      startRound();
    }
  }, FEEDBACK_DELAY);
}

async function startRound() {
  $('round-indicator').textContent = `Round ${round + 1} / ${ROUNDS_PER_SESSION}`;
  $('score-display').textContent = `Score: ${score}`;
  $('feedback-area').className = 'rkt-feedback';
  $('feedback-area').textContent = '';
  hideChainNotation();

  currentKey = generateTestRound();
  testCorrectAnswer = currentKey.correctAnswer || null;

  // Hide visuals during question
  HarmonyState.reset();
  HarmonyState.update({
    tonnetzCenter: { root: currentKey.root, quality: currentKey.quality },
    tonnetzDepth: currentTier === 4 ? 2 : 1,
    annotations: ANN_OFF,
  });

  showTestQuestion();
  $('btn-replay').style.display = 'inline-flex';

  if (currentTier === 3) {
    // Play starting chord, pause, then target chord
    const startProg = buildProgression(t3StartChord.root, t3StartChord.quality);
    await playProgression(startProg, BPM);
    await delay(1000);
    const targetProg = buildProgression(t3TargetChord.root, t3TargetChord.quality);
    await playProgression(targetProg, BPM);
  } else if (currentTier === 4) {
    // Play starting chord only (chain notation is shown for the player to work out)
    const startProg = buildProgression(currentKey.root, currentKey.quality);
    await playProgression(startProg, BPM);
  } else {
    const prog = buildProgression(currentKey.root, currentKey.quality);
    await playProgression(prog, BPM);
  }
  awaitingAnswer = true;
}

function showFeedback(correct, detail) {
  const el = $('feedback-area');
  if (correct) {
    el.className = 'rkt-feedback rkt-feedback--correct';
    el.textContent = pickRandom(ENCOURAGEMENTS) + ' ' + detail;
  } else {
    el.className = 'rkt-feedback rkt-feedback--incorrect';
    el.textContent = 'Not quite. ' + detail;
  }
}

function disableAnswerButtons() {
  $('answer-buttons').querySelectorAll('button').forEach(b => { b.disabled = true; });
}

/** Animate a chain of transforms step by step on the Tonnetz. */
async function animateChainReveal(startRoot, startQuality, chain) {
  let cur = { root: startRoot, quality: startQuality };
  HarmonyState.update({ annotations: ANN_TRIAD, tonnetzDepth: Math.max(2, exploreDepth) });
  HarmonyState.setTriad(cur.root, cur.quality);

  for (const t of chain) {
    await delay(800);
    const from = { ...cur };
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform(t, from.root, from.quality);
    const result = TRANSFORMS[t].apply(from.root, from.quality);
    cur = { root: result.root, quality: result.quality };
    await playTransformChords(from.root, from.quality, cur.root, cur.quality);
  }
}

function showResults() {
  $('test-content').style.display = 'none';
  $('viz-area').style.display = 'none';
  $('results-area').style.display = 'block';

  $('results-score').textContent = `You got ${score} / ${ROUNDS_PER_SESSION}!`;

  const actions = $('results-actions');
  actions.innerHTML = '';

  const btnAgain = document.createElement('button');
  btnAgain.className = 'rkt-btn rkt-btn--primary';
  btnAgain.textContent = 'Play Again';
  btnAgain.addEventListener('click', () => {
    $('results-area').style.display = 'none';
    startSession();
  });
  actions.appendChild(btnAgain);

  const btnLearn = document.createElement('button');
  btnLearn.className = 'rkt-btn rkt-btn--accent';
  btnLearn.textContent = 'Review Learn';
  btnLearn.addEventListener('click', () => {
    $('results-area').style.display = 'none';
    switchPhase('learn');
  });
  actions.appendChild(btnLearn);
}

function startSession() {
  round = 0;
  score = 0;
  $('results-area').style.display = 'none';
  $('test-content').style.display = '';
  $('viz-area').style.display = '';
  startRound();
}

// ════════════════════════════════════════════════════════════════════
// PRACTICE PHASE
// ════════════════════════════════════════════════════════════════════

/** Pick a random key for Practice, avoiding the same key twice in a row. */
function generatePracticeRound() {
  if (currentTier === 1) {
    let key;
    do {
      const isMajor = Math.random() < 0.5;
      const root = isMajor ? pickRandom(T1_MAJOR_KEYS) : pickRandom(T1_MINOR_KEYS);
      key = { root, quality: isMajor ? 'major' : 'minor' };
    } while (
      practiceLastKey &&
      key.root === practiceLastKey.root &&
      key.quality === practiceLastKey.quality
    );
    return key;
  }

  if (currentTier === 2) {
    const stats = practiceStats[2];
    const askReverse = stats.roundTotal >= 5 && Math.random() < 0.5;
    let key;
    do {
      if (askReverse) {
        const root = pickRandom(T2_MINOR_KEYS);
        const answer = TRANSFORMS.R.apply(root, 'minor');
        key = {
          root,
          quality: 'minor',
          direction: 'minor-to-major',
          correctAnswer: { root: displayNote(answer.root), quality: answer.quality },
        };
      } else {
        const root = pickRandom(T2_MAJOR_KEYS);
        const answer = TRANSFORMS.R.apply(root, 'major');
        key = {
          root,
          quality: 'major',
          direction: 'major-to-minor',
          correctAnswer: { root: displayNote(answer.root), quality: answer.quality },
        };
      }
    } while (
      practiceLastKey &&
      key.root === practiceLastKey.root &&
      key.quality === practiceLastKey.quality
    );
    return key;
  }

  if (currentTier === 3) {
    // Generate starting triad + random transform
    let key;
    do {
      const root = pickRandom(T3_KEYS);
      const quality = Math.random() < 0.5 ? 'major' : 'minor';
      const transform = pickRandom(['P', 'R', 'L']);
      const target = TRANSFORMS[transform].apply(root, quality);
      key = { root, quality, transform, target: { root: target.root, quality: target.quality } };
    } while (
      practiceLastKey &&
      key.root === practiceLastKey.root &&
      key.quality === practiceLastKey.quality
    );
    t3StartChord = { root: key.root, quality: key.quality };
    t3TargetChord = key.target;
    t3CorrectTransform = key.transform;
    return key;
  }

  // Tier 4: chain
  let key;
  do {
    const root = pickRandom(T3_KEYS);
    const quality = Math.random() < 0.5 ? 'major' : 'minor';
    const chainLen = Math.random() < 0.5 ? 2 : 3;
    const chain = randomChain(chainLen);
    const steps = applyChain(root, quality, chain);
    const final = steps[steps.length - 1];
    key = {
      root,
      quality,
      chain,
      correctAnswer: { root: displayNote(final.root), quality: final.quality },
    };
  } while (
    practiceLastKey &&
    key.root === practiceLastKey.root &&
    key.quality === practiceLastKey.quality
  );
  t3StartChord = { root: key.root, quality: key.quality };
  t3TargetChord = { root: key.correctAnswer.root, quality: key.correctAnswer.quality };
  t4Chain = key.chain;
  t4Intermediates = applyChain(key.root, key.quality, key.chain);
  return key;
}

/** Render the practice answer buttons for the current round. */
function renderPracticeButtons() {
  const btnArea = $('practice-answer-buttons');
  btnArea.innerHTML = '';

  if (currentTier === 1) {
    $('practice-question-text').textContent = 'Is this major or minor?';
    ['Major', 'Minor'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.dataset.answer = label.toLowerCase();
      btn.textContent = label;
      btnArea.appendChild(btn);
    });
  } else if (currentTier === 2) {
    const dir = practiceKey.direction;
    if (dir === 'major-to-minor') {
      $('practice-question-text').textContent =
        `What is the relative minor of ${displayNote(practiceKey.root)} major?`;
    } else {
      $('practice-question-text').textContent =
        `What is the relative major of ${displayNote(practiceKey.root)} minor?`;
    }

    const correct = practiceCorrectAnswer;
    const targetQuality = correct.quality;
    const distractors = generateDistractors(
      practiceKey.root, practiceKey.quality, correct.root, targetQuality
    );
    const options = shuffleArray([correct, ...distractors]);

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.dataset.answer = `${opt.root}|${opt.quality}`;
      btn.textContent = `${opt.root} ${opt.quality}`;
      btnArea.appendChild(btn);
    });
  } else if (currentTier === 3) {
    $('practice-question-text').textContent = 'Which transform connects these two chords?';
    ['P', 'R', 'L'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.dataset.answer = label;
      btn.textContent = label;
      btnArea.appendChild(btn);
    });
  } else {
    // Tier 4
    const startLabel = `${displayNote(practiceKey.root)} ${practiceKey.quality}`;
    $('practice-question-text').textContent = `Starting from ${startLabel}, what chord do you reach?`;
    showChainNotation(practiceKey.chain);

    const correct = practiceCorrectAnswer;
    const distractors = generateChainDistractors(
      practiceKey.root, practiceKey.quality, practiceKey.chain,
      correct.root, correct.quality
    );
    const options = shuffleArray([correct, ...distractors]);

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'rkt-answer-btn';
      btn.dataset.answer = `${opt.root}|${opt.quality}`;
      btn.textContent = `${opt.root} ${opt.quality}`;
      btnArea.appendChild(btn);
    });
  }
}

/** Start a new Practice round. */
async function startPracticeRound() {
  practiceKey = generatePracticeRound();
  practiceLastKey = practiceKey;
  practiceCorrectAnswer = practiceKey.correctAnswer || null;
  practiceAwaitingAnswer = true;
  hideChainNotation();

  // Reset UI
  $('practice-feedback').className = 'rkt-feedback';
  $('practice-feedback').textContent = '';
  $('practice-next-wrap').style.display = 'none';

  // Render answer buttons
  renderPracticeButtons();
  setPracticeButtons(true);

  // Tonnetz + keyboard setup
  HarmonyState.reset();
  if (currentTier === 1) {
    HarmonyState.update({
      tonnetzCenter: { root: practiceKey.root, quality: practiceKey.quality },
      tonnetzDepth: 1,
      annotations: ANN_OFF,
      keyboardMode: 'both',
    });
  } else if (currentTier === 2) {
    HarmonyState.update({
      annotations: ANN_TRIAD,
      keyboardMode: 'both',
    });
    HarmonyState.setTriad(practiceKey.root, practiceKey.quality);
  } else if (currentTier === 3) {
    // Show starting triad on Tonnetz as scaffolding
    HarmonyState.update({
      annotations: ANN_TRIAD,
      keyboardMode: 'both',
    });
    HarmonyState.setTriad(t3StartChord.root, t3StartChord.quality);
  } else {
    // Tier 4: show starting triad, chain notation already rendered
    HarmonyState.update({
      annotations: ANN_TRIAD,
      tonnetzDepth: 2,
      keyboardMode: 'both',
    });
    HarmonyState.setTriad(practiceKey.root, practiceKey.quality);
  }

  updatePracticeStats();

  if (currentTier === 3) {
    // Play starting chord, pause, then target chord
    const startProg = buildProgression(t3StartChord.root, t3StartChord.quality);
    await playProgression(startProg, BPM);
    await delay(1000);
    const targetProg = buildProgression(t3TargetChord.root, t3TargetChord.quality);
    await playProgression(targetProg, BPM);
  } else if (currentTier === 4) {
    // Play starting chord only
    const startProg = buildProgression(practiceKey.root, practiceKey.quality);
    await playProgression(startProg, BPM);
  } else {
    const prog = buildProgression(practiceKey.root, practiceKey.quality);
    await playProgression(prog, BPM);
  }
}

/** Handle a practice answer (delegates to tier-specific logic). */
function handlePracticeAnswer(answer) {
  if (!practiceAwaitingAnswer) return;
  practiceAwaitingAnswer = false;

  const stats = practiceStats[currentTier];
  stats.roundTotal++;

  if (currentTier === 1) {
    handlePracticeAnswerT1(answer, stats);
  } else if (currentTier === 2) {
    handlePracticeAnswerT2(answer, stats);
  } else if (currentTier === 3) {
    handlePracticeAnswerT3(answer, stats);
  } else {
    handlePracticeAnswerT4(answer, stats);
  }

  setPracticeButtons(false);
  $('practice-next-wrap').style.display = '';
  updatePracticeStats();
  maybeShowInsight();

  // Auto-replay so they hear it with the visual confirmation
  replayPracticeAudio();
}

/** Tier 1 practice answer handler. */
function handlePracticeAnswerT1(answer, stats) {
  const correct = practiceKey.quality === answer;

  // Reveal triad on Tonnetz + keyboard
  HarmonyState.update({ annotations: ANN_TRIAD });
  HarmonyState.setTriad(practiceKey.root, practiceKey.quality);

  if (correct) {
    stats.streak++;
    stats.correctTotal++;
    const msgs = practiceKey.quality === 'major'
      ? ['Yes! Hear that bright, open quality?', "That's right \u2014 major sounds open and resolved.", 'Nice ear!']
      : ['Yes! Hear that darker, more serious quality?', "That's right \u2014 minor sounds heavier and more wistful.", 'Nice ear!'];
    let msg = pickRandom(msgs);
    if (stats.streak === 3) msg += " You're getting the hang of it!";
    showPracticeFeedback('correct', msg);
  } else {
    stats.streak = 0;
    const name = `${displayNote(practiceKey.root)} ${practiceKey.quality}`;
    const tip = practiceKey.quality === 'major'
      ? 'hear how it sounds brighter and more open?'
      : 'hear how it sounds darker and more serious?';
    showPracticeFeedback('incorrect', `This one is actually ${name}. Listen again \u2014 ${tip}`);
  }
}

/** Tier 2 practice answer handler. */
function handlePracticeAnswerT2(answer, stats) {
  // answer is "Root|quality" string
  const [ansRoot, ansQuality] = answer.split('|');
  const ca = practiceCorrectAnswer;
  const correct = noteToPC(ansRoot) === noteToPC(ca.root) && ansQuality === ca.quality;

  if (correct) {
    stats.streak++;
    stats.correctTotal++;

    // Animate R transform
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform('R', practiceKey.root, practiceKey.quality);

    showPracticeFeedback('correct',
      `Yes! ${ca.root} ${ca.quality} is the relative ${ca.quality} of ${displayNote(practiceKey.root)} ${practiceKey.quality}. They share all the same notes.`
    );
  } else {
    stats.streak = 0;

    // Still animate R transform to show correct answer
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform('R', practiceKey.root, practiceKey.quality);

    showPracticeFeedback('incorrect',
      `The relative ${ca.quality} of ${displayNote(practiceKey.root)} ${practiceKey.quality} is ${ca.root} ${ca.quality}. Watch the R arrow on the Tonnetz.`
    );
  }
}

/** Tier 3 practice answer handler. */
function handlePracticeAnswerT3(answer, stats) {
  const correct = answer === t3CorrectTransform;

  // Always animate the correct transform
  HarmonyState.update({ annotations: ANN_TRANSFORM });
  HarmonyState.setTransform(t3CorrectTransform, t3StartChord.root, t3StartChord.quality);

  if (correct) {
    stats.streak++;
    stats.correctTotal++;
    const tName = TRANSFORMS[t3CorrectTransform].name;
    const descriptions = {
      P: 'Same root, the third moved.',
      R: 'Two common tones, the fifth moved.',
      L: 'Two common tones, a half-step shift.',
    };
    showPracticeFeedback('correct',
      `Yes! That was ${t3CorrectTransform} — ${tName}. ${descriptions[t3CorrectTransform]}`
    );
  } else {
    stats.streak = 0;
    const tName = TRANSFORMS[t3CorrectTransform].name;
    showPracticeFeedback('incorrect',
      `It was ${t3CorrectTransform} (${tName}). Watch the arrow on the Tonnetz.`
    );
  }
}

/** Tier 4 practice answer handler. */
async function handlePracticeAnswerT4(answer, stats) {
  const [ansRoot, ansQuality] = answer.split('|');
  const ca = practiceCorrectAnswer;
  const correct = noteToPC(ansRoot) === noteToPC(ca.root) && ansQuality === ca.quality;

  if (correct) {
    stats.streak++;
    stats.correctTotal++;
    showPracticeFeedback('correct',
      `Yes! The chain leads to ${ca.root} ${ca.quality}.`
    );
  } else {
    stats.streak = 0;
    showPracticeFeedback('incorrect',
      `The chain leads to ${ca.root} ${ca.quality}. Watch the path.`
    );
  }

  // Animate chain reveal
  await animateChainReveal(t3StartChord.root, t3StartChord.quality, t4Chain);
}

/** Handle the "Show me" button — reveal without penalty. */
async function handlePracticeShowMe() {
  if (!practiceAwaitingAnswer) return;
  practiceAwaitingAnswer = false;

  const stats = practiceStats[currentTier];
  stats.roundTotal++;

  if (currentTier === 1) {
    HarmonyState.update({ annotations: ANN_TRIAD });
    HarmonyState.setTriad(practiceKey.root, practiceKey.quality);

    const name = `${displayNote(practiceKey.root)} ${practiceKey.quality}`;
    showPracticeFeedback('neutral', `This is ${name}. Listen to how it sounds.`);
  } else if (currentTier === 2) {
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform('R', practiceKey.root, practiceKey.quality);

    const ca = practiceCorrectAnswer;
    showPracticeFeedback('neutral',
      `The relative ${ca.quality} of ${displayNote(practiceKey.root)} ${practiceKey.quality} is ${ca.root} ${ca.quality}. Watch the R arrow.`
    );
  } else if (currentTier === 3) {
    HarmonyState.update({ annotations: ANN_TRANSFORM });
    HarmonyState.setTransform(t3CorrectTransform, t3StartChord.root, t3StartChord.quality);

    const tName = TRANSFORMS[t3CorrectTransform].name;
    showPracticeFeedback('neutral',
      `The transform is ${t3CorrectTransform} (${tName}). Watch the arrow.`
    );
  } else {
    // Tier 4: animate chain
    const ca = practiceCorrectAnswer;
    showPracticeFeedback('neutral',
      `The chain leads to ${ca.root} ${ca.quality}. Watch the path.`
    );
    await animateChainReveal(t3StartChord.root, t3StartChord.quality, t4Chain);
  }

  setPracticeButtons(false);
  $('practice-next-wrap').style.display = '';
  updatePracticeStats();

  replayPracticeAudio();
}

/** Show feedback in the Practice feedback area. */
function showPracticeFeedback(type, message) {
  const el = $('practice-feedback');
  el.className = 'rkt-feedback';
  if (type === 'correct') el.classList.add('rkt-feedback--correct');
  else if (type === 'incorrect') el.classList.add('rkt-feedback--practice-incorrect');
  else el.classList.add('rkt-feedback--neutral');
  el.textContent = message;
}

/** Enable or disable Practice answer buttons and Show me. */
function setPracticeButtons(enabled) {
  $('practice-answer-buttons').querySelectorAll('button').forEach(b => { b.disabled = !enabled; });
  $('btn-practice-showme').disabled = !enabled;
}

/** Replay the current Practice round's audio. */
async function replayPracticeAudio() {
  if (!practiceKey || isPlaying) return;
  if (currentTier === 3) {
    // Play both chords
    await playProgression(buildProgression(t3StartChord.root, t3StartChord.quality), BPM);
    await delay(1000);
    await playProgression(buildProgression(t3TargetChord.root, t3TargetChord.quality), BPM);
  } else {
    await playProgression(buildProgression(practiceKey.root, practiceKey.quality), BPM);
  }
}

/** Update streak, round count, and test-prompt displays. */
function updatePracticeStats() {
  const stats = practiceStats[currentTier];
  $('practice-streak').textContent = `Streak: ${stats.streak}`;
  $('practice-rounds').textContent = `Rounds: ${stats.roundTotal}`;

  // "Try the Test" prompt
  const prompt = $('practice-test-prompt');
  if (stats.roundTotal >= 10) {
    $('practice-test-prompt-text').textContent = "You've done 10 rounds! ";
    $('practice-goto-test').textContent = 'Ready for the real test? \u2192';
    prompt.style.display = '';
  } else if (stats.correctTotal >= 5) {
    $('practice-test-prompt-text').textContent = '';
    $('practice-goto-test').textContent = 'Feeling confident? Try the Test \u2192';
    prompt.style.display = '';
  } else {
    prompt.style.display = 'none';
  }
}

// ════════════════════════════════════════════════════════════════════
// EXPLORE MODE
// ════════════════════════════════════════════════════════════════════

/** Play a single triad chord (3 notes, quarter note duration). */
async function playTriadChord(root, quality) {
  if (isPlaying) return;
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  await ensureAudio();
  const voicing = chordVoicing(root, quality, 4);
  if (!voicing.length) return;
  isPlaying = true;
  const beatDur = 60 / BPM;
  const velocity = 0.55 + Math.random() * 0.3;
  sampler.triggerAttackRelease(voicing, beatDur * 0.9, Tone.now(), velocity); await new Promise(r => setTimeout(r, beatDur * 1000 + 100));

  sampler.volume.setValueAtTime(Math.random() * 5 - 2.5, Tone.now());  // ±2.5 dB
  sampler.triggerAttackRelease(voicing, beatDur * 0.9, Tone.now());

  isPlaying = false;
}

/** Play source chord briefly, then destination chord (for transform). */
async function playTransformChords(fromRoot, fromQuality, toRoot, toQuality) {
  if (isPlaying) return;
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  await ensureAudio();
  isPlaying = true;
  const myGen = playbackGeneration;
  const beatDur = 60 / BPM;
  const fromVoicing = chordVoicing(fromRoot, fromQuality, 4);
  const toVoicing = chordVoicing(toRoot, toQuality, 4);

  // "from" chord — softer
  sampler.volume.value = -3;
  HarmonyState.update({ activeNotes: voicingToActiveNotes(fromVoicing, 'playback') });
  sampler.triggerAttackRelease(fromVoicing, beatDur * 0.5, Tone.now());
  await delay(beatDur * 0.7 * 1000);

  if (playbackGeneration !== myGen) { isPlaying = false; return; }

  // "to" chord — full volume
  sampler.volume.value = 0;
  HarmonyState.update({ activeNotes: voicingToActiveNotes(toVoicing, 'playback') });
  sampler.triggerAttackRelease(toVoicing, beatDur * 0.9, Tone.now());
  await delay(beatDur * 1.1 * 1000);

  // Clear highlights on normal completion
  if (playbackGeneration === myGen) {
    HarmonyState.update({ activeNotes: [] });
  }
  isPlaying = false;
}

/** Render the breadcrumb trail. */
function renderExploreTrail() {
  const container = $('explore-trail');
  container.innerHTML = '';

  exploreTrail.forEach((entry, i) => {
    // Transform arrow (if not the first entry)
    if (entry.transform) {
      const arrow = document.createElement('span');
      arrow.className = 'rkt-trail-arrow';
      arrow.textContent = entry.transform;
      container.appendChild(arrow);
    }

    // Chord pill
    const pill = document.createElement('button');
    pill.className = 'rkt-trail-chord';
    if (i === exploreTrail.length - 1) pill.classList.add('rkt-trail-chord--active');
    pill.textContent = `${displayNote(entry.root)} ${entry.quality === 'major' ? 'maj' : 'min'}`;
    pill.addEventListener('click', () => {
      exploreSelectChord(entry.root, entry.quality, true);
    });
    container.appendChild(pill);
  });

  // Scroll to end
  const wrap = $('explore-trail').parentElement;
  wrap.scrollLeft = wrap.scrollWidth;
}

/** Select a chord in Explore mode (from triad click or breadcrumb). */
function exploreSelectChord(root, quality, fromBreadcrumb) {
  exploreCurrent = { root, quality };

  HarmonyState.update({ annotations: ANN_TRIAD, tonnetzDepth: exploreDepth });
  HarmonyState.setTriad(root, quality);
  TonnetzNeighborhood.recenter(root, quality);

  $('explore-transform-label').textContent = '';

  if (!fromBreadcrumb) {
    // Add to trail
    exploreTrail.push({ root, quality });
    if (exploreTrail.length > MAX_TRAIL) exploreTrail.shift();
    renderExploreTrail();
  } else {
    // Update active pill styling
    $('explore-trail').querySelectorAll('.rkt-trail-chord').forEach((pill, i) => {
      pill.classList.toggle('rkt-trail-chord--active',
        i === exploreTrail.findIndex(e => e.root === root && e.quality === quality));
    });
  }

  playTriadChord(root, quality);
}

/** Apply a PLR transform from the current chord in Explore mode. */
function exploreApplyTransform(type) {
  if (!exploreCurrent) return;

  const from = { ...exploreCurrent };
  const result = TRANSFORMS[type].apply(from.root, from.quality);
  const to = { root: result.root, quality: result.quality };

  // Animate on Tonnetz (ghost → primary)
  HarmonyState.update({ annotations: ANN_TRANSFORM, tonnetzDepth: exploreDepth });
  HarmonyState.setTransform(type, from.root, from.quality);

  // Show label
  const label = `${type}: ${displayNote(from.root)} ${from.quality} → ${displayNote(to.root)} ${to.quality}`;
  $('explore-transform-label').textContent = label;

  // Update current
  exploreCurrent = to;

  // Add to trail
  exploreTrail.push({ root: to.root, quality: to.quality, transform: type });
  if (exploreTrail.length > MAX_TRAIL) exploreTrail.shift();
  renderExploreTrail();

  // Check for teaching insights
  maybeShowInsight();

  // Play transform audio
  playTransformChords(from.root, from.quality, to.root, to.quality);

  // After a short delay, recenter on the new chord
  setTimeout(() => {
    if (exploreCurrent.root === to.root && exploreCurrent.quality === to.quality) {
      TonnetzNeighborhood.recenter(to.root, to.quality);
    }
  }, 800);
}

/** Enter Explore mode. */
function enterExplore() {
  currentMode = 'explore';
  stopAllAudio();
  learnPlaybackId++;
  awaitingAnswer = false;
  practiceAwaitingAnswer = false;

  // Deselect all phase tabs
  document.querySelectorAll('.rkt-phase-tab').forEach(tab => {
    tab.classList.remove('rkt-phase-tab--active');
  });
  $('phase-hint').textContent = 'Explore freely';

  // Highlight explore button
  $('btn-explore').classList.add('rkt-explore-btn--active');

  // Show/hide areas
  $('learn-header').style.display = 'none';
  $('learn-footer').style.display = 'none';
  $('test-content').style.display = 'none';
  $('practice-content').style.display = 'none';
  $('results-area').style.display = 'none';
  $('viz-area').style.display = '';
  $('explore-content').style.display = '';

  // Re-init TonnetzNeighborhood with interactive mode
  TonnetzNeighborhood.destroy();
  TonnetzNeighborhood.init('tonnetz-container', {
    interactive: true,
    onTriadClick({ root, quality }) {
      exploreSelectChord(root, quality, false);
    },
    onTransformClick({ type }) {
      exploreApplyTransform(type);
    },
  });

  // Set keyboard to 'both' (display + playable)
  HarmonyState.update({ keyboardMode: 'both' });

  // Set initial chord
  const startRoot = exploreCurrent ? exploreCurrent.root : 'C';
  const startQuality = exploreCurrent ? exploreCurrent.quality : 'major';
  exploreCurrent = { root: startRoot, quality: startQuality };

  HarmonyState.update({ annotations: { ...ANN_TRIAD, showTransformLabels: true }, tonnetzDepth: exploreDepth });
  HarmonyState.setTriad(startRoot, startQuality);
  TonnetzNeighborhood.setDepth(exploreDepth);

  // Init trail
  if (exploreTrail.length === 0) {
    exploreTrail.push({ root: startRoot, quality: startQuality });
  }
  renderExploreTrail();
  $('explore-transform-label').textContent = '';
  $('explore-depth-select').value = String(exploreDepth);
}

/** Exit Explore mode and return to phases. */
function exitExplore() {
  currentMode = 'phases';
  $('btn-explore').classList.remove('rkt-explore-btn--active');
  $('explore-content').style.display = 'none';

  // Re-init TonnetzNeighborhood in non-interactive mode
  TonnetzNeighborhood.destroy();
  TonnetzNeighborhood.init('tonnetz-container', { interactive: false });

  // Return to last phase
  switchPhase(currentPhase);
}

// ════════════════════════════════════════════════════════════════════
// TIER SWITCHING
// ════════════════════════════════════════════════════════════════════

function switchTier(tier) {
  if (tier === currentTier) return;
  currentTier = tier;

  // Update tier tab UI
  document.querySelectorAll('.rkt-tier-tab').forEach(tab => {
    tab.classList.toggle('rkt-tier-tab--active', Number(tab.dataset.tier) === tier);
  });

  // Update tips pill for new tier
  if (tipsPill) tipsPill.update(tipsForTier(tier));

  // Reset to Learn phase for the new tier
  switchPhase('learn');
}

// ════════════════════════════════════════════════════════════════════
// PHASE SWITCHING
// ════════════════════════════════════════════════════════════════════

const PHASE_HINTS = {
  learn: 'Watch & listen',
  practice: 'Try it yourself',
  test: 'Prove it',
};

function switchPhase(phase) {
  console.log('[switchPhase] called with:', phase);

  currentPhase = phase;
  currentMode = 'phases';
  stopAllAudio();
  HarmonyState.update({ activeNotes: [] });  // Clear stale keyboard highlights
  playbackGeneration++;  // Cancel any in-flight progressions from previous phase
  learnPlaybackId++;   // Cancel any in-flight Learn playback
  awaitingAnswer = false; // Cancel any pending Test answer
  practiceAwaitingAnswer = false;

  // Remove explore active state and hide chain notation
  $('btn-explore').classList.remove('rkt-explore-btn--active');
  $('explore-content').style.display = 'none';
  hideChainNotation();

  // Tab UI
  document.querySelectorAll('.rkt-phase-tab').forEach(tab => {
    tab.classList.toggle('rkt-phase-tab--active', tab.dataset.phase === phase);
  });
  $('phase-hint').textContent = PHASE_HINTS[phase];

  // Show/hide areas
  const isLearn = phase === 'learn';
  const isTest = phase === 'test';
  const isPractice = phase === 'practice';

  $('learn-header').style.display = isLearn ? '' : 'none';
  $('learn-footer').style.display = isLearn ? '' : 'none';
  $('viz-area').style.display = (isLearn || isTest || isPractice) ? '' : 'none';
  $('test-content').style.display = isTest ? '' : 'none';
  $('practice-content').style.display = isPractice ? '' : 'none';
  $('results-area').style.display = 'none';

  // Reset keyboard to display mode (Practice overrides to 'both')
  if (!isPractice) {
    HarmonyState.update({ keyboardMode: 'display' });
  }

  // Hide tips pill during Test (could leak answers)
  if (tipsPill) tipsPill.setVisible(!isTest);

  // Initialize phase
  if (isLearn) {
    showLearnStep(getLearnStep());
  } else if (isPractice) {
    startPracticeRound();
  } else if (isTest) {
    startSession();
  }
}

// ════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════

/** Show the intro screen overlay. */
function showIntroScreen() {
  const el = $('intro-screen');
  if (el) el.style.display = 'flex';
}

/** Hide the intro screen overlay and start the game. */

async function dismissIntro() {
  const el = $('intro-screen');
  if (el) el.style.display = 'none';
  localStorage.setItem('rkt-intro-seen', '1');
  await ensureAudio();
  switchPhase('learn');
}

export function init() {
  // Initialize shared components
  TonnetzNeighborhood.init('tonnetz-container', { interactive: false });
  KeyboardView.init('keyboard-container', {
    range: { low: 'C3', high: 'B5' },
  });

  // Education layer: tooltip engine + tips pill
  tooltipEngine = initTheoryTooltips();
  tipsPill = TipsPill.init(document.body, { tooltipEngine });
  tipsPill.update(tipsForTier(currentTier));

  // Tier tabs
  document.querySelectorAll('.rkt-tier-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (!audioStarted) return;
      if (currentMode === 'explore') {
        // Re-init TonnetzNeighborhood in non-interactive mode
        TonnetzNeighborhood.destroy();
        TonnetzNeighborhood.init('tonnetz-container', { interactive: false });
        currentMode = 'phases';
        $('btn-explore').classList.remove('rkt-explore-btn--active');
        $('explore-content').style.display = 'none';
      }
      switchTier(Number(tab.dataset.tier));
    });
  });

  // Phase tabs
  document.querySelectorAll('.rkt-phase-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (!audioStarted) return;
      const wasExplore = currentMode === 'explore';
      if (tab.dataset.phase === currentPhase && !wasExplore) return;
      if (wasExplore) {
        // Re-init TonnetzNeighborhood in non-interactive mode
        TonnetzNeighborhood.destroy();
        TonnetzNeighborhood.init('tonnetz-container', { interactive: false });
      }
      switchPhase(tab.dataset.phase);
    });
  });

  // Learn nav
  $('btn-learn-back').addEventListener('click', () => {
    if (getLearnStep() > 1) showLearnStep(getLearnStep() - 1);
  });

  $('btn-learn-next').addEventListener('click', () => {
    if (!learnAudioPlayed) return;
    if (getLearnStep() < 5) {
      showLearnStep(getLearnStep() + 1);
    } else {
      // After step 5 → practice
      switchPhase('practice');
    }
  });

  $('btn-learn-replay').addEventListener('click', learnReplay);

  // Practice buttons (event delegation)
  $('practice-answer-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-answer]');
    if (!btn || btn.disabled) return;
    handlePracticeAnswer(btn.dataset.answer);
  });
  $('btn-practice-replay').addEventListener('click', () => replayPracticeAudio());
  $('btn-practice-showme').addEventListener('click', () => handlePracticeShowMe());
  $('btn-practice-next').addEventListener('click', () => startPracticeRound());
  $('practice-goto-test').addEventListener('click', (e) => {
    e.preventDefault();
    switchPhase('test');
  });

  // Test replay button
  $('btn-replay').addEventListener('click', async () => {
    if (isPlaying || !currentKey) return;
    if (currentTier === 3) {
      await playProgression(buildProgression(t3StartChord.root, t3StartChord.quality), BPM);
      await delay(1000);
      await playProgression(buildProgression(t3TargetChord.root, t3TargetChord.quality), BPM);
    } else {
      await playProgression(buildProgression(currentKey.root, currentKey.quality), BPM);
    }
  });

  // ── Explore mode controls ────────────────────────────────────────

  // Explore button (top bar)
  $('btn-explore').addEventListener('click', () => {
    if (!audioStarted) return;
    if (currentMode === 'explore') {
      exitExplore();
    } else {
      enterExplore();
    }
  });

  // P/R/L transform buttons
  document.querySelectorAll('.rkt-transform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentMode !== 'explore') return;
      exploreApplyTransform(btn.dataset.transform);
    });
  });

  // Depth select
  $('explore-depth-select').addEventListener('change', (e) => {
    exploreDepth = Number(e.target.value);
    HarmonyState.update({ tonnetzDepth: exploreDepth });
    TonnetzNeighborhood.setDepth(exploreDepth);
  });

  // Back to Learn button
  $('btn-explore-back').addEventListener('click', () => {
    exitExplore();
  });

  // Intro screen "Start Learning" button
  const introBtn = $('btn-intro-start');
  if (introBtn) introBtn.addEventListener('click', dismissIntro);

  // "Show intro" link (re-trigger)
  const showIntroLink = $('btn-show-intro');
  if (showIntroLink) {
    showIntroLink.addEventListener('click', (e) => {
      e.preventDefault();
      showIntroScreen();
    });
  }

  // Start overlay (audio gate)
  $('start-overlay').addEventListener('click', async () => {
    console.log('[start] overlay clicked');

    await Tone.start();

    console.log('[start] Tone started');

    audioStarted = true;
    await ensureAudio();

    console.log('[start] audio ensured');

    $('start-overlay').style.display = 'none';
    $('main-content').style.display = 'block';

    if (!localStorage.getItem('rkt-intro-seen')) {
      showIntroScreen();
    } else {
      switchPhase('learn');
    }
  });

  // Visual layer and toggle — init after all DOM setup so the controls bar exists
  const controlsBar = document.querySelector('.rkt-top-bar-right');
  if (controlsBar) controlsBar.id = 'rkt-controls-bar';
  VisualLayer.init('tonnetz-container');
  VisualToggle.init('rkt-controls-bar');

}
