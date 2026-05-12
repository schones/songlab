# Voicing Explorer — Specification

**Version:** 0.3  
**Date:** 2026-03-30  
**Phase:** A5 (Post-MVP Build Plan v3)  
**Status:** MVP core shipped (Note Mode, glow worm, ChordResolver, 3-panel sync). Polish + remaining MVP features in progress.

---

## Core Idea

The Voicing Explorer is a **mode/layer within the existing Explorer**, not a separate page. It turns the three-panel Explorer into a chord construction and voicing exploration tool.

The fundamental operation is **projection**: take a set of notes and offset them along a Tonnetz axis (major thirds, minor thirds, perfect fifths) by a chosen distance and direction. This single primitive powers everything from simple transposition to parallel harmonization to exotic voicing construction.

Every interaction synchronizes across all three panels. Select a C on the keyboard → it lights up on the Tonnetz → the wheel reflects what you're building. Add an E and a G → a glow worm path traces the voicing on the Tonnetz, the ChordResolver identifies "C major," the wheel highlights C major in its diatonic context. The user gravitates to whichever panel feels natural. They all arrive at the same place.

### Composable Panel Architecture

The three panels are not just "three views" — they are **three cognitive entry points** into the same musical concept. Each panel should be loadable **individually or in any combination**:

- Just the keyboard for a simple ear training exercise
- Just the Tonnetz for a deep theory lesson on transforms
- Keyboard + wheel for a beginner who isn't ready for the grid
- All three for the full Explorer experience
- A standalone Tonnetz embedded in a blog post or shared as a link

**Implementation principle:** No panel should assume the others exist. Each panel communicates only through HarmonyState pub/sub, never directly to another panel. If a panel is absent, the others continue to function. This composability enables flexible layouts for future features — lessons, games, embedded widgets — without rebuilding.

The panel a user gravitates toward is also a strong signal for their learning persona (pianist → keyboard, theory-oriented → Tonnetz, beginner → chord wheel). The platform can adapt which panel it emphasizes based on how the user naturally interacts.

---

## MVP Scope

### 1. Note Mode ✅

Toggle between Chord Mode (existing — click a triangle/chord) and Note Mode (click individual notes across any panel). In Note Mode:

- Click a key on the keyboard → note activates, highlights on Tonnetz and wheel
- Click a node on the Tonnetz → note activates, highlights on keyboard and wheel
- Click a chord on the wheel → all notes populate on keyboard and Tonnetz
- Octave-specific selection on the keyboard (voicing matters — C3-E4-G4 is a different voicing than C4-E4-G4)
- All communication goes through HarmonyState

### 2. Chord Shape Visualization ✅

When 2+ notes are active, the Tonnetz renders a visual overlay showing the chord's geometric shape.

**Implementation: Glow Worm Path** (replaced original convex hull bubble concept after prototyping)

- A luminous SVG path traces between active chord tones on the Tonnetz, connecting them from lowest pitch to highest pitch
- The path follows the voicing order, so different inversions of the same chord trace different routes across the same nodes
- Bright nodes at each chord tone, with a soft glowing trail between them (SVG blur filter)
- Uses compact cluster positioning (one node per pitch class, tightest grouping on the grid)
- Smooth transitions (~200ms) when notes are added/removed
- Renders as an SVG group overlaid on the Tonnetz, behind node labels but above the base grid

**Why glow worm over convex hull:** The path visualization encodes voicing order — you can see *how* the chord is stacked, not just *which* notes it contains. C-E-G traces a different path than E-G-C across the same three nodes. The voicing becomes visible.

### 3. ChordResolver ✅

Given a set of pitch classes, identifies the chord name and quality.

- Matches against known chord types: major, minor, dim, aug, maj7, min7, dom7, etc.
- **Interval-content fallback:** When no standard chord name matches (e.g., a jazz voicing that drops the root and adds a 9th), returns the interval content (e.g., "C E G# — {M3, M3}")
- Handles enharmonic spellings reasonably
- Displays resolved name in the Explorer UI

**Why interval-content fallback matters:** This is what makes the tool useful for working musicians, not just students. A non-standard voicing shouldn't produce "unknown chord" — it should show you exactly what intervals you've built. That's information a jazz player or producer can work with.

### 4. Chord Wheel Sync ✅

When a chord is assembled via Note Mode, the chord wheel:

- Highlights the recognized chord in its diatonic context
- Re-centers the diatonic arc on the assembled chord's key as tonic (e.g., Am assembled → arc centers on Am as i)
- Shows where the chord functions across multiple keys

### 5. Shape Dragging (remaining MVP)

- Click and drag a chord shape on the Tonnetz to transpose it
- Same shape, different root = same chord quality transposed
- Hear it update in real time
- Build by interval: start from a root, add notes by choosing intervals (buttons for M3, m3, P5, etc.) → watch the shape grow
- Clear/reset: quick way to wipe and start fresh

### 6. Interval Projection (remaining MVP)

The **ProjectionEngine** — pure function: notes + axis + distance + direction → projected notes.

- User selects active notes, then picks a Tonnetz axis (M3, m3, P5) and a direction (up/down)
- Projected notes appear as "shadow" highlights on the Tonnetz and keyboard
- Both source and projected notes play simultaneously
- Enables instant voicing experiments: "what does this chord sound like with a major third added above each note?"

**Projection axes (mapped to Tonnetz geometry):**
- Horizontal axis = Perfect Fifths (7 semitones)
- Diagonal up-right = Major Thirds (4 semitones)
- Diagonal down-right = Minor Thirds (3 semitones)

### 7. Instrument Choice for Voices

- User can select different instruments for source vs. projected notes
- Leverages existing multi-instrument support (piano/voice with MusyngKite soundfonts)
- Default: same instrument for both
- Easy toggle in the UI

### 8. Grid Boundary Handling

- Projected notes outside the visible grid are simply not displayed
- Feature works best with larger grid sizes
- No auto-scroll or wrapping for now

---

## MVP Components

### Existing (leverage as-is)

| Component | Role |
|-----------|------|
| Tonnetz Explorer (3-panel) | Base layout — all visualization and input |
| HarmonyState pub/sub | State management for note selection, chord state |
| Tone.js / Salamander audio | Sound playback |
| Multi-instrument support | Separate timbres for source vs. projected voices |
| Visual Layer (pitch-to-color) | Color differentiation for source vs. shadow notes |
| Chord wheel | Named chord selection as input, diatonic context display |

### New — built ✅

| Component | Description |
|-----------|-------------|
| **ChordBubbleRenderer** (`chord-bubble-renderer.js`) | Glow worm SVG path overlay connecting active chord tones on the Tonnetz |
| **ChordResolver** (`chord-resolver.js`) | Chord name identification with interval-content fallback for non-standard voicings |

### New — remaining MVP

| Component | Description |
|-----------|-------------|
| **ProjectionEngine** | Pure function: notes + axis + distance + direction → projected notes |
| **ShapeDragger** | Interaction handler for grabbing and dragging chord shapes across the grid |
| **VoicingControls** | UI panel/overlay for projection axis, distance, direction, instrument selection |

### Integration Architecture

The Voicing Explorer is a **mode/layer within the existing Explorer**, not a separate page.

- **Tonnetz panel**: note input (click nodes) + glow worm path rendering + shadow notes for projections
- **Keyboard panel**: note input (click keys, octave-specific) + voice display (source + projected highlighted)
- **Chord wheel panel**: chord input (click chords) + diatonic context display + ChordResolver output
- **Controls**: projection axis, distance, direction, instrument selector, Note Mode toggle

ChordResolver extends the existing chord detection in HarmonyState to handle non-standard voicings (4+ notes, non-tertian stacking) with interval-content fallback. The existing detection in HarmonyState was enhanced rather than building a separate module.

---

## Pedagogical Hooks

This feature connects naturally to theory topics in the curriculum:

- **Chord construction** from intervals — build it, see the shape, hear the result
- **Chord quality** — same shape everywhere = same quality. Drag and hear it.
- **Inversions** — same notes, different geometric reference point. The glow worm traces a different path for each inversion.
- **Exotic voicings** — "what does this shape sound like?" as a discovery tool
- **Parallel motion** — projection creates parallel paths, instantly showing why parallel thirds/sixths sound cohesive
- **Quartal/quintal harmony** — exploration along the P5 axis
- **Alternative voicings** — a killer use case for working musicians. Different voicings of Bb7 (inversions, drop-2, drop-3, rootless) each produce distinct geometric shapes on the Tonnetz. The spatial spread on the grid corresponds to the intervallic spread in the sound. The keyboard shows physical layout, the wheel shows functional context. All three perspectives at once for the same chord is something no other tool does.

---

## Future Scope (Post-MVP)

### Melody Harmonization (Sequence Mode — Phase F4)
- Record/input a melody as a sequence of notes
- Apply projection to the whole sequence → parallel harmonized voice
- Playback with scrubbing, real-time projection switching
- Toggle between harmonization styles: parallel thirds (Allman Brothers), parallel sixths, power chords, quartal voicings

### MIDI Integration (Live Mode — Phase F3)
- Web MIDI API for real-time input from hardware controllers (Launchkey 49)
- Notes appear on Tonnetz as played, projection applied live
- MIDI mapping config UI: map knobs/pads/faders to projection parameters
- Launchkey 49 defaults as a preset, user-customizable mappings
- Latency target: < 20ms
- MIDI output: send projected notes to external synths/DAW
- Requires Auth (Phase B.5) for saved mappings

### Voice Leading Visualization (Phase F4)
- When moving between chord shapes, show which notes move and by how much
- Minimal voice-leading paths (common tones, half/whole step motion)
- Toggle between intuitive mode (visual only) and neo-Riemannian mode (P/L/R transform labels)
- Connects to existing neo-Riemannian operations in the Explorer
- **Near-term related feature:** Multiple simultaneous glow worm paths for chord progressions (e.g., I→IV showing notes that stay vs. notes that move). This is the highest-priority next build and can ship before the full voice leading system.

### Shape Library (Phase F4)
- Save and recall interesting shapes/voicings
- Local-only initially, community sharing later
- Requires Auth for persistence

### Advanced Projection UI (Phase F4)
- Multiple simultaneous projections (stack M3 below + P5 below → triadic harmonization)
- Projection stacking controls
- Inversion awareness (m6 below = M3 above)

---

## Future Directions (Research Threads)

Distinct from Future Scope: these are exploratory threads without
phase placement or concrete UX. Captured here so they don't drift
out of awareness as the Voicing Explorer matures.

### Probabilistic Chord Interpretation

The current ChordResolver is a hard classifier: it returns one
chord name, or falls back to interval content when nothing matches.
A probabilistic variant would return a *distribution* over candidate
interpretations — each with a fit score — rather than committing
to a single answer.

**Why this fits the Voicing Explorer specifically:** most exotic
voicings are exactly *not* clean template matches. A rootless A‑7
voicing (C‑E‑G‑B) is genuinely ambiguous — it could be read as
Cmaj7 with the root present, or as Am9 with the root omitted. The
current resolver picks one (by priority); a probabilistic version
would surface the ambiguity as the answer and let context break the
tie. That ambiguity *is* the harmonic content, and exposing it is
what makes the Explorer a tool for understanding voicings rather
than just labeling them.

**Bayesian framing:**

  P(chord | pcs, context) ∝ P(pcs | chord) · P(chord | context)

- **Likelihood** P(pcs | chord) — how well the sounding notes fit
  a candidate chord interpretation. Perfect template matches score
  high; missing the third scores lower; missing the root scores
  lower still; extra non-template notes reduce the score. This is
  where rootless voicings, drop voicings, and shell voicings fall
  out naturally instead of being special-cased.
- **Prior** P(chord | context) — how likely a chord is given
  everything else known about the song. Sources of prior include:
  key/tonal center, previous chord (transition probabilities),
  position in form (resolution chords near phrase endings), and
  genre (jazz priors lift extensions; folk priors lift triads).

**What it unlocks:**

- *Ambiguity as a first-class output.* {C, E, G, A} is genuinely
  55% Am7 / 45% C6. Show that, don't hide it.
- *Partial matches become principled.* Rootless and drop voicings
  emerge from the likelihood model rather than needing separate
  templates.
- *What-if exploration.* Drop the fifth — how does the
  interpretation shift? Raise the seventh — same. Probabilities
  make these deltas answerable.
- *Bayesian updating across time.* Each chord interpretation
  refines the running estimate of the key, which sharpens priors
  for the next chord. Mirrors what trained musicians do
  unconsciously.

**Honest caveats:**

- The likelihood function is the hard part, not the math.
  "How often is the root omitted?" is genre- and voicing-specific
  and needs either hand-engineered costs or a labeled corpus.
- The prior wants real data. Chord transition probabilities differ
  wildly between corpora; "the prior" is really "the prior under
  genre assumption X."
- The Explorer might not want full Bayesian inference — it might
  want the *likelihood function alone*, with the user adjusting
  the prior via UI controls (key, genre, "expect extensions"). A
  tunable lens may be more interpretable than a black box.

**Relationship to current ChordResolver:** This would be a *new*
function (`interpretChord(pcs, context)` or similar), not a
replacement. The hard classifier remains useful for callers that
need a single answer with `recognized: false` as a meaningful
failure signal (e.g., the chord/melody classifier's melody-on-top
detection). The two would share the underlying template set.


---



## Build Phase Placement

**MVP: Phase A5** — builds directly on the Explorer currently in progress. The ChordBubbleRenderer (glow worm) and ChordResolver are natural additions to the existing three-panel architecture. Core shipped; remaining MVP items (ProjectionEngine, ShapeDragger) are 1–2 sessions.

**Future features: Phase F (F3, F4)** — after Auth/Supabase (B.5) and Curriculum foundations (C). MIDI integration (F3) enables Live Mode. Advanced features (F4) include Sequence Mode, voice leading visualization, shape library.

---

## Design Decisions (Resolved)

1. **Instrument for projected notes**: User choice. Default same, easy toggle to split voices.
2. **Out-of-grid projections**: Clip, don't display. Works best with large grids.
3. **Chord visualization**: Glow worm path (luminous trail connecting chord tones low-to-high). Replaced convex hull bubble after prototyping — the path encodes voicing order, which the bubble didn't.
4. **Voice leading depth** (future): User toggle between intuitive and neo-Riemannian modes.
5. **MIDI mapping** (future): Dedicated config UI with Launchkey 49 preset.
6. **Chord wheel arc centering**: Arc re-centers on the assembled chord's key as tonic (Am assembled → arc centers on Am as i).
7. **ChordResolver approach**: Enhanced existing HarmonyState chord detection rather than building a separate module. Interval-content fallback for non-standard voicings.

---

## Remaining Open Questions

- Multiple simultaneous glow worm paths: different colors? How to distinguish chords in a progression visualization? (Highest priority — design needed for A4 chord progressions feature)
- How does the glow worm animate during drag operations? (Smooth redraw vs. snap)
- ProjectionEngine: should projected notes be editable (click to remove one projected note) or always computed from source?

---

*Spec version: 0.3 — Updated with implementation status, composable panel architecture, glow worm visualization, resolved design decisions*  
*Related specs: explorer-spec.md, tonnetz-next-build-plan.md, content-architecture.md, game-flow-pattern.md*
