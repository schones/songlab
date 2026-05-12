/**
 * chord-resolver.js
 * =================
 * Given a set of pitch classes, detect the chord name (or describe
 * the interval content if no standard chord matches).
 *
 * Pure functions — no rendering, no DOM, no HarmonyState dependency.
 *
 * Consumed by:
 *   - chord-bubble-renderer.js  → label the active chord bubble
 *   - explorer.html             → chord badge display
 *
 * Exports:
 *   resolveChord(pitchClasses, preferredRootPC?)  → ChordResult | null
 */

// ════════════════════════════════════════════════════════════════════
// DATA
// ════════════════════════════════════════════════════════════════════

/** Sharp note names by pitch class. */
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/**
 * Chord type definitions. Each entry:
 *   quality   – internal quality key (matches HarmonyState conventions where possible)
 *   symbol    – suffix appended to root note name for display (e.g. "m", "°", "7")
 *   intervals – sorted semitone offsets from root [0, ...]
 *   priority  – lower = checked first; triads before seventh chords
 */
const CHORD_TYPES = [
  // ── Triads ─────────────────────────────────────────────────────
  { quality: 'major',   symbol: '',       intervals: [0, 4, 7],         priority: 1 },
  { quality: 'minor',   symbol: 'm',      intervals: [0, 3, 7],         priority: 1 },
  { quality: 'dim',     symbol: '°',      intervals: [0, 3, 6],         priority: 1 },
  { quality: 'aug',     symbol: '+',      intervals: [0, 4, 8],         priority: 1 },
  { quality: 'sus2',    symbol: 'sus2',   intervals: [0, 2, 7],         priority: 2 },
  { quality: 'sus4',    symbol: 'sus4',   intervals: [0, 5, 7],         priority: 2 },
  // ── Seventh chords ─────────────────────────────────────────────
  { quality: 'dom7',    symbol: '7',      intervals: [0, 4, 7, 10],     priority: 3 },
  { quality: 'maj7',    symbol: 'maj7',   intervals: [0, 4, 7, 11],     priority: 3 },
  { quality: 'min7',    symbol: 'm7',     intervals: [0, 3, 7, 10],     priority: 3 },
  { quality: 'dim7',    symbol: '°7',     intervals: [0, 3, 6, 9],      priority: 3 },
  { quality: 'hdim7',   symbol: 'ø7',     intervals: [0, 3, 6, 10],     priority: 3 },
  { quality: 'minmaj7', symbol: 'mM7',    intervals: [0, 3, 7, 11],     priority: 3 },
  { quality: 'augmaj7', symbol: '+M7',    intervals: [0, 4, 8, 11],     priority: 3 },
  { quality: 'aug7',    symbol: '+7',     intervals: [0, 4, 8, 10],     priority: 3 },
  // ── Power chord ────────────────────────────────────────────────
  { quality: '5',       symbol: '5',      intervals: [0, 7],            priority: 4 },
];

// Semitone count → short interval name
const INTERVAL_NAMES = [
  'P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7',
];

// ════════════════════════════════════════════════════════════════════
// RESOLVE
// ════════════════════════════════════════════════════════════════════

/**
 * Resolve a set of pitch classes to a chord name.
 *
 * @param {number[]} pitchClasses    Array of integers 0–11 (duplicates OK).
 * @param {number}   [preferredRootPC] Optional key-context pitch class 0–11.
 *                                     For symmetrical chords (aug, dim7) where
 *                                     multiple roots are valid, prefer the
 *                                     candidate whose root matches this pc.
 * @returns {ChordResult|null}
 *
 * @typedef {Object} ChordResult
 * @property {string|null}  root       – Root note name (e.g. "C"), or null if unrecognized
 * @property {string|null}  quality    – Quality key (e.g. "major", "min7"), or null
 * @property {string}       symbol     – Quality symbol (e.g. "", "m", "7")
 * @property {string}       name       – Full display name (e.g. "C", "Am", "G7")
 * @property {boolean}      recognized – True if a standard chord was found
 * @property {number[]}     pcs        – Deduplicated, sorted pitch classes used
 */
function resolveChord(pitchClasses, preferredRootPC) {
  // Deduplicate and normalize
  const pcs = [...new Set(pitchClasses.map(pc => ((pc % 12) + 12) % 12))];
  pcs.sort((a, b) => a - b);

  if (pcs.length < 2) return null;

  // ── Collect all valid (root, chordType) matches ──────────────────
  // Group by priority tier so a preferredRoot can't promote a lower-
  // priority match (e.g. dom7) over a higher-priority one (e.g. triad).
  const sorted = [...CHORD_TYPES].sort((a, b) => a.priority - b.priority);
  const byPriority = new Map();

  for (const chord of sorted) {
    if (chord.intervals.length !== pcs.length) continue;

    for (const root of pcs) {
      const intervals = pcs
        .map(pc => (pc - root + 12) % 12)
        .sort((a, b) => a - b);

      if (_arrEqual(intervals, chord.intervals)) {
        if (!byPriority.has(chord.priority)) byPriority.set(chord.priority, []);
        byPriority.get(chord.priority).push({ root, chord });
      }
    }
  }

  if (byPriority.size > 0) {
    const bestPriority = Math.min(...byPriority.keys());
    const candidates = byPriority.get(bestPriority);

    let pick = candidates[0];
    if (preferredRootPC != null) {
      const scaleIntervals = [0, 2, 4, 5, 7, 9, 11];
      const scalePCs = new Set(scaleIntervals.map(i => (preferredRootPC + i) % 12));

      const diatonic = candidates.filter(c => scalePCs.has(c.root));

      if (diatonic.length > 0) {
        const tonic = diatonic.find(c => c.root === preferredRootPC);
        const dominant = diatonic.find(c => c.root === (preferredRootPC + 7) % 12);
        pick = tonic || dominant || diatonic[0];
      }
    }

    const rootName = NOTE_NAMES[pick.root];
    return {
      root:       rootName,
      quality:    pick.chord.quality,
      symbol:     pick.chord.symbol,
      name:       rootName + pick.chord.symbol,
      recognized: true,
      pcs,
    };
  }

  // ── No match — return interval description ───────────────────────
  const noteList = pcs.map(pc => NOTE_NAMES[pc]).join(' ');
  const intervals = [];
  for (let i = 1; i < pcs.length; i++) {
    const semi = pcs[i] - pcs[0];
    intervals.push(INTERVAL_NAMES[semi] || `+${semi}`);
  }

  return {
    root:       null,
    quality:    null,
    symbol:     '',
    name:       `${noteList} {${intervals.join(', ')}}`,
    recognized: false,
    pcs,
  };
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

function _arrEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { resolveChord };

if (typeof window !== 'undefined') {
  window.ChordResolver = { resolveChord };
}
