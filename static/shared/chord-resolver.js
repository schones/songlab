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
  // sus2 and sus4 share PC sets under inversion:
  // {root, M2, P5} = {root+5, P4, P5} relative to the new root.
  // For example {C, D, G} = Csus2 = Gsus4. With both at priority 2
  // and sus2 listed first, unbiased resolveChord calls always
  // return sus2. Callers needing sus4 must pass preferredRootPC.
  // The chord/melody classifier handles this via key context;
  // see docs/chord-melody-classification.md OQ5.
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

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (manual — run: cat static/shared/chord-resolver.js | node --input-type=module)
// Note: the direct-file form (node --input-type=module path/to/file.js)
// is blocked on the current Node version; pipe stdin instead.
// ════════════════════════════════════════════════════════════════════

// TODO: extract to chord-resolver.test.js if this grows past
//       ~50 assertions or if Voicing Explorer adds template variants.

/* --- Self-test: uncomment this block to run ---

(function selfTest() {
  const results = [];
  function assert(label, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ label, pass });
    console.log(pass
      ? `  ✓ ${label}`
      : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  }
  function assertOneOf(label, actual, validSet) {
    const pass = validSet.includes(actual);
    results.push({ label, pass });
    console.log(pass
      ? `  ✓ ${label}`
      : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected one of: ${JSON.stringify(validSet)}`);
  }

  console.log("\n─── chord-resolver.js self-test ───\n");

  // ── Section 1: Power chord, root position ──
  {
    const r = resolveChord([0, 7]);
    assert("[0,7] recognized",     r.recognized, true);
    assert("[0,7] root = C",       r.root,       'C');
    assert("[0,7] quality = '5'",  r.quality,    '5');
    assert("[0,7] symbol = '5'",   r.symbol,     '5');
    assert("[0,7] name = 'C5'",    r.name,       'C5');
  }

  // ── Section 2: Power chord, inverted PC order ──
  {
    const r = resolveChord([7, 0]);
    assert("[7,0] recognized",     r.recognized, true);
    assert("[7,0] root = C",       r.root,       'C');
    assert("[7,0] quality = '5'",  r.quality,    '5');
    assert("[7,0] symbol = '5'",   r.symbol,     '5');
    assert("[7,0] name = 'C5'",    r.name,       'C5');
  }

  // ── Section 3: Inversion verification, asymmetric qualities ──
  // sus2 and sus4 share PC sets under inversion ({C, F, G} =
  // Csus4 = Fsus2). Both tests pass preferredRootPC: 0 to
  // disambiguate to the C-rooted reading. This mirrors how the
  // resolver is called in practice (from a key context).
  // sus2:    [2, 7, 0],  preferredRootPC=0    → root 'C', quality 'sus2'
  // sus4:    [5, 7, 0],  preferredRootPC=0    → root 'C', quality 'sus4'
  const inversionCases = [
    { label: 'major',    pcs: [4, 7, 0],        quality: 'major'   },
    { label: 'minor',    pcs: [3, 7, 0],        quality: 'minor'   },
    { label: 'dim',      pcs: [3, 6, 0],        quality: 'dim'     },
    { label: 'sus2',     pcs: [2, 7, 0],        quality: 'sus2',    bias: 0 },
    { label: 'sus4',     pcs: [5, 7, 0],        quality: 'sus4',    bias: 0 },
    { label: 'dom7',     pcs: [4, 7, 10, 0],    quality: 'dom7'    },
    { label: 'maj7',     pcs: [4, 7, 11, 0],    quality: 'maj7'    },
    { label: 'min7',     pcs: [3, 7, 10, 0],    quality: 'min7'    },
    { label: 'hdim7',    pcs: [3, 6, 10, 0],    quality: 'hdim7'   },
    { label: 'minmaj7',  pcs: [3, 7, 11, 0],    quality: 'minmaj7' },
    { label: 'augmaj7',  pcs: [4, 8, 11, 0],    quality: 'augmaj7' },
    { label: 'aug7',     pcs: [4, 8, 10, 0],    quality: 'aug7'    },
  ];
  for (const { label, pcs, quality, bias } of inversionCases) {
    const r = resolveChord(pcs, bias);
    assert(`${label} ${JSON.stringify(pcs)} → root = C`,       r.root,    'C');
    assert(`${label} ${JSON.stringify(pcs)} → quality = ${quality}`, r.quality, quality);
  }

  // ── Section 4: Symmetric qualities (aug, dim7) ──
  {
    const r = resolveChord([0, 4, 8]);
    assertOneOf("aug [0,4,8] unbiased → root ∈ {C, E, G♯}",
      r.root, ['C', 'E', 'G♯']);
  }
  {
    const r = resolveChord([0, 4, 8], 4);
    assert("aug [0,4,8] preferredRoot=4 → root = E",
      r.root, 'E');
  }
  {
    const r = resolveChord([0, 3, 6, 9]);
    assertOneOf("dim7 [0,3,6,9] unbiased → root ∈ {C, D♯, F♯, A}",
      r.root, ['C', 'D♯', 'F♯', 'A']);
  }
  {
    const r = resolveChord([0, 3, 6, 9], 6);
    assert("dim7 [0,3,6,9] preferredRoot=6 → root = F♯",
      r.root, 'F♯');
  }

  // ── Section 5: Priority preservation ──
  // Power-chord template (priority 4) must not displace higher-priority
  // matches: [0,4,7] still resolves to a major triad, not a power chord.
  {
    const r = resolveChord([0, 4, 7]);
    assert("[0,4,7] quality = major (priority preserved over '5')",
      r.quality, 'major');
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
})();

--- End self-test --- */
