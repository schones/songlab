# SongLab Project Status


## Current state (April 28, 2026)


### Cantor — current state (updated 2026-04-29)

**Landed and verified on dev:**
- [keep existing entries]

**Landed on audio-onset-analysis branch (not yet on dev):**
- AudioInterpreter v0 phase 1 migration. templates/cantor.html
  no longer imports chord-detection.js; the in-template chord
  block (start/stop functions, dedupe, silence watcher) is
  removed and replaced by a MusicalEventStream chordChange
  subscriber and a _reconcileAudioInterpreter helper modeled on
  harmonograph's pattern. Acceptance criteria 1, 2, 4, 5, 6, 7
  from audit §3.4 verified. Criterion 3 (saved-device auto-
  restore) does NOT pass — see Known Issues for the
  characterization.
  - `AudioInput.rewireForTone()` lifted into static/shared/audio-input.js
  (2026-04-30). Single canonical implementation of the post-gesture
  rewire that handles selectDevice's standalone-context fallback.
  Self-gating (no-op if no active device or already on Tone's
  rawContext). Cantor and harmonograph both consume the lifted
  method; harmonograph's local _audioInputNeedsToneRewire flag and
  _attachAudioInputToTone() function deleted in the same commit.
  Acceptance criteria 1, 2, 3, 4, 5, 6 (audit §3.4 + harmonograph
  regression checks) all verified manually.

**In progress:**
- Phase 2 (single-publisher consolidation) — gated on OQ1
  decision. Audit §6.1 recommends sibling MIDIInterpreter; user
  decides.
- Chord/melody classifier rebuild (branch: audio-onset-analysis).
  Design and test corpus complete; see
  docs/chord-melody-classification.md and
  docs/chord-melody-test-corpus.md on that branch. Replaces the
  current register-based melody/accompaniment split (_splitPoint
  in cantor-view.js) with a chord-state classifier that tracks
  declared/implied chord identity, dyad escalation for power
  chords, and tempo-relative attack clustering. Audio corpus
  companion doc (docs/chord-melody-audio-corpus.md) sketched but
  audio testing deferred until MIDI corpus passes. Estimated
  remaining work: test harness + classifier implementation +
  parameter tuning, ~3-5 sessions.

**Open / deferred:**
- OQ1 decision (MIDI publishing path during migration). Audit
  recommendation: sibling MIDIInterpreter. Required before
  phase 2 prompt can be drafted.
- OQ9 cleanup (window.AudioInput coupling). Deferred until the
  second AudioInterpreter consumer lands; trigger is concrete.
- Notable E (input-provider drops bass and pitchClasses, audit
  §3 + §7.4) — must not be reintroduced when wiring cantor's
  chordChange subscriber. Tracked in the input-provider section
  as a separate in-place fix. Phase 1 subscriber reads
  event.bass and event.pitchClasses directly off the event
  (not yet exercised, but the pattern is preserved).
  - Explorer migration onto AudioInput.rewireForTone() — explorer.html
  has its own local copy of the rewire machinery (call site at line
  1980, function and flag at lines 3935-4057) that should migrate to
  the lifted shared implementation. Discovered during the 2026-04-30
  lift session via cross-codebase grep. Drafttable as its own session;
  recommended approach is read-only pass first to map explorer's
  gesture path and check whether explorer's local function differs
  from the harmonograph version. Acceptance criteria need to cover
  Spectrum panel and Harmonic Resonance "still works" checks in
  addition to saved-device auto-restore. Smaller cognitive load than
  tonight's lift because rewireForTone() is now established. Details
  in SESSION_LOG.md 2026-04-30 entry.

**Standing rules — optional:**
- [keep existing entries]
- File-scope-restricted files for the audio-onset-analysis branch
  (per WORKING_STYLE.md): harmony-state.js, keyboard-view.js,
  chord-detection.js, musical-event-stream.js. audio-input.js was
  explicitly lifted on 2026-04-30 for the rewireForTone() lift; no
  other audio-input.js work was permitted to ride along (OQ9 still
  open; device-restore refactor still deferred).

- Calibration on the migration audit: §3 missed the
  AudioInput.disconnect() call inside _initAudioInput at
  pre-migration cantor.html:778, AND missed that cantor lacks
  the rewire machinery harmonograph uses to compensate for that
  disconnect. The audit was useful and got most of phase 1
  right, but its model of _initAudioInput had a blind spot.
  Subsequent fix prompts that build on this audit (especially
  the harmonograph migration in §7.1, which involves the rewire
  machinery directly) should be drafted with a hair more
  scrutiny than "the audit said X."

### Harmonograph — current state (updated 2026-04-29)

**Landed and verified on dev:**
- [keep existing entries]

**Open / deferred:**
- [keep existing entries]
- Migration onto AudioInterpreter v0 — shape sketched in
  cantor-migration-audit.md §7.1. Compressed depth; full
  migration prompt drafttable after Cantor phase 1 lands.
  Deferred indefinitely (no current pressure beyond the
  duplicated silence watcher and the cross-detector flatness
  coupling Notable C).
- Flatness-gate risk on the harmonograph migration: the audit's
  §7.1 recommendation is "discard and verify" — drop the
  flatness gate and rely on AudioInterpreter's onset gate to
  cover the same case. No current test corpus catches the
  noise-driven phantom chord case the flatness gate was
  defending against. The migration prompt needs to call for a
  recorded fixture (mic noise + sustained string ringing)
  before claiming verification.

### Cantor — current state (updated 2026-04-29)

**Landed and verified on dev:**
- (Whatever Cantor work has already shipped to dev — preserve
  existing entries here. The new content below is additive on
  the audio-onset-analysis branch, not yet on dev.)

**In progress:**
- **Audio analysis rebuild (branch: audio-onset-analysis).**
  Phase 0 closed: supplement-not-replace decision. AudioInterpreter
  v0 designed and built; commit pending the design-doc edit pass.
  Next: design-doc edit pass (1 short Claude Code session), then
  Cantor migration audit (1 read-only session), then Cantor
  migration phase 1 build (1 session). Total estimated remaining:
  ~3 sessions to land phase 1 of the migration. Phase 2
  (single-publisher consolidation) is tentative and depends on
  Open Question 1 resolution.

**Open / deferred:**
- **Chord ambiguity rendering** — stranded until chord-detection.js
  emits top-N candidates. cantor-design.md's "render all candidates
  with confidence-proportional saturation" can't be expressed from
  current chord-detection output. Deferred to v3+ unless
  prioritized.
- **Beat Field implementation** — deferred until Cantor migration
  phase 1 is complete. Prerequisite (percussiveStrike schema) is
  now satisfied at the design level; waiting on the schema to
  stabilize in code.
- **Audio-derived noteRelease, pitchBend, emergent attacks** —
  reserved in AudioInterpreter's schema, deferred to v3+.
- **MIDI publishing path consolidation** — Open Question 1 in
  audio-interpreter-design.md. Decision pending Cantor migration
  audit.

**Public surfaces (test harness / debugging):**
- `window.__audioInterpreter` (when AudioInterpreter is started)
  — instance handle for console inspection.
- `interpreter.setDebug(true)` — toggles runtime logging of
  subsystem starts/stops, locked-pitch changes, chord publishes.
  Default off.
- `interpreter.getState()` — returns current state snapshot
  (locked pitch, recent onsets, last published chord, etc.).

**Standing rules:**
- AudioInterpreter v0 is built but should not be wired into
  Cantor until the migration audit + migration build sessions
  run. Don't add ad-hoc imports or test-call wiring in
  cantor.html before the migration audit produces its plan.
- The locked files in WORKING_STYLE.md (harmony-state.js,
  audio-input.js, keyboard-view.js, chord-detection.js,
  musical-event-stream.js) are not expected to need lift during
  the migration. If any session turns up such a need, stop and
  surface rather than asking for lift mid-session.


### Cantor v1 — current state (added 2026-04-28 evening)


### Working
- /cantor route, on-screen keyboard, MIDI input, Tone.js playback
- MusicalEventStream singleton; on-screen keyboard publishes too
- Tonnetz substrate (7×5 lattice, canonical orientation)
- Chord wash with cross-fade, quality-colored fills, hue shifts for
  7ths, (rootPC, baseQuality) diff key for flash-on-quality-change
- Melody constellation, anchored to active wash centroid, with
  exponential decay, velocity → brightness, chord-quality color
- User-controllable split-point line (drag, snap, persist) with
  default at MIDI 72 (C5, mid-keyboard)
- Audio chord auto-detection from MIDI input — wash + flash +
  extension hue all driven from live audio
- 3D torus rendering (mode3D=true): static torus, rotX=30°, rotY=45°
  baked in, 12×4 toroidal lattice, 48 nodes, 4 PC instances each.
  No drift, no breathing yet (deferred to 6B).
- Constellation snap to wash vertices: melody glyphs snap to the
  wash triangle vertex matching their PC. Verified via deterministic
  `cantorView._testSnap` and live Launchkey play.
- 2D mode (mode3D=false) regression-free
- Chord-detection respects Hardware state — won't run when Hardware
  is "No audio input", so manual `setTriad` is authoritative on the
  MIDI-only path.
- window.cantorView exposed on localhost for dev convenience

### Next session

Resolved during 6A:
- Refactor question: duplicated `_uvToXYZ`, `_rotate3D`, `_projectOrtho`
  from harmonograph-view.js into cantor-view.js for v1. Future shared
  utility flagged TODO in cantor-view.js.
- Lattice instance handling on torus: 4× PC instances on 12×4 lattice,
  edges wrap toroidally — every node has all six Tonnetz neighbors.
- Chord wash triangle handling: rendered with z-sort, no geodesic
  surface paths.
- Constellation snap: `_activeWashVertices` Map populates per-frame from
  wash render before visibility check; constellation reads it.

Open for 6B:
- Constellation z-fade vs hard occlusion on back side (still open).

### Deferred / parked
- Melody trails: connecting lines between consecutive constellation
  glyphs to expose phrase contour. Needs its own design doc; even
  more interesting on the 3D torus, so probably design after prompt 6.
- activeTriads-clears-mid-phrase anchor snap-back: cosmetic, low
  priority, fix is to keep last anchor for ~1-2× decay τ after
  activeTriads empties.
- Scales on the Tonnetz: separate design thread (`docs/scale-regions.md`
  to be drafted). 7-node connected region for diatonic, relative keys
  share region, parallel keys pivot, harmonic minor has tendril,
  octatonic tiles. Not blocking Cantor v1.

### After v1
- v1 user testing
- Audio chord detection silence-watcher tuning if needed
- chordChange dispatch on MusicalEventStream (currently skipped as
  redundant; revisit if a use case emerges)

**Last updated:** 2026-04-28 (Cantor 6A/6A.1/6A.2 landed: 3D torus, constellation snap, chord-detection Hardware-state gating)
**Branch:** `dev` (active — SongLab redesign in progress) · `main` (prod)
**Deploy:** Railway from `main`
**Active roadmap:** `docs/songlab-build-plan.md` (v4) + `docs/game-engine-spec.md` + `docs/audio-architecture.md` + `docs/polyrhythm-trainer-spec.md`
**Platform name:** SongLab · SkratchLab (rebrand complete)

---

## Current Focus

SongLab `dev` branch is feature-rich. Phase A, A++, and initial B8 complete. April 22 closed with `/art` Stage 1 fully validated end-to-end: ghost-torus scaffold (grayscale) + warm/cool chord-triangle overlays + role-colored sparkle blobs at sounding nodes, driven by MIDI (Launchkey MK4 via multi-port fix) and by mic audio through Scarlett 2i2 and built-in mic. "Fireworks" aesthetic saved as a localStorage preset; export-to-file pending. One known issue surfaced: selecting a real audio input in the Hardware dropdown creates a feedback loop through laptop speakers — workaround is "No audio input" for MIDI-only testing or headphones for live audio. Audio-input routing refactor deferred. Approaching user testing readiness.


**Next priorities:**
1. **Real-audio Harmonograph tuning ("Montreal"):** Stage 2 validated end-to-end via deterministic test track (`tests/harmonograph-test-track.wav`). Seven audio-pipeline bugs found and fixed in the same session: top-16 RMS, spectral flatness gates in pitch + chord detection, initial-load device sync, hotplug listener, pitch-detection stream rebuild, heartbeat diagnostics. Next: real-music tuning against Allison Russell "Montreal" — opening-minute-to-gospel-chorus arc as the calibration target. Tune `rmsDbFloor`/`rmsDbCeiling`/`spinSignalExponent` by ear.

2. **Harmonograph Stage 1.5 (multi-torus stacking):** multiple concentric/offset toruses to give the visualization depth and let different harmonic layers (e.g., extension notes, register groups) live on their own surface. Open design questions: stack spacing, one-master-morph vs per-torus-morph sliders, dynamic spacing as morph rises. After Stage 1.5: `audio-input.js` refactor (fix feedback loop by routing source to analyser only), particle reactivity in 3D (currently spawn at 3D-projected screen positions — visually works but not designed), painter's-algorithm depth sort if self-occlusion artifacts surface.

3. SkratchLab polish — "Clear All" button should also reset canvas (not just blocks)
4. Add Polyrhythm Trainer to nav dropdown and landing page
5. Linus and Lucy walkthrough (connects from Polyrhythm Trainer)
6. Tab-audio capture experiment: feed YouTube into `/art`
7. Decide `/art` front-door (linked from nav, footer, hidden, or remain unlinked sandbox)
8. **Onboarding & tutorial UX** — Build a "guided tour" / tooltip-card system for the platform: friendly intro modals on first visit (Studio, Explorer, Games, `/art`), short walkthroughs explaining what each tool is for, and dedicated tutorials for the generative-art side (e.g., why the torus is the natural representation for a Tonnetz, how chord-triangles work, what the FFT is showing). Reference inspirations: BandLab's onboarding modals (sequential cards with X to dismiss, "There's more" / "Explore more" CTAs, large preview imagery, friendly first-name greeting). Could leverage existing walkthrough infrastructure from Explorer.
9. Consider preserving original "starburst" Resonance aesthetic as a named baked-in preset
10. Onset detection wired into Resonance for staccato burst behavior
11. Business model / monetization spec
12. game-flow.js + adaptive engine extraction (spec: `docs/game-engine-spec.md`)
13. SkratchLab lightweight DAW — song presets, chord loops + rhythm, melody play-over
14. Consolidate triplicated chord-type registries (code review finding)
15. Replace `_suppressAutoPlay` with source-tagged HarmonyState.update() (code review finding)
16. User testing prep (15-20 participants)
- **Harmonograph Phase 2 design pass:** unified design conversation for three deferred ideas — multi-axis torus spin (Tonnetz-aware mapping of P5/M3/m3 chord-root motion to X/Y/Z), shimmer overlay (non-tonal audio → gold Chladni-pattern particles), and "music has color, noise is gray" saturation principle (flatness-driven desaturation across all visualizations). Worth `docs/multi-axis-spin.md`, `docs/shimmer-design.md`, `docs/color-confidence.md` design docs before building.
- **AudioWorklet migration for `pitch-detection.js`:** ScriptProcessorNode is deprecated in Chrome. Tracked in `docs/audio-architecture.md` Open Question 1. Not urgent — generous deprecation timeline.
- **Test track v2:** replace pink-noise staircase with chord-velocity staircase. Top-16 RMS is biased toward tonal content (correct for music), so noise isn't the right calibration signal.
- **Hardware dropdown dedup:** Chrome exposes both "Default - X" alias and canonical "X". Cosmetic.
- **Educational content idea:** Chladni patterns (Ernst Chladni 1787, founder of modern acoustics). History piece or standing-wave physics piece. Ties into shimmer design and platform-wide "music has shape" positioning.


**Completed this cycle (April 22):**

- **Art Lab 3D rendering — Stage 1 validated end-to-end (late-day session):**
  - Grayscale scaffold + warm/cool chord overlay split (`scaffoldMajorColor` / `scaffoldMinorColor` in scaffold pass; `majorTriadColor` / `minorTriadColor` in overlay pass). Held chords pop against a neutral surface.
  - `midi-input.js` multi-port fix: Launchkey MK4 enumerates as "MIDI Out" + "DAW Out"; auto-attach now picks non-DAW port. Applied in both `init()` and `_handleStateChange()`.
  - Debug panel reordered: "3D Geometry" section now first so `mode3D` toggle is visible without scrolling.
  - Fireworks tuning via sliders only (no code): faint scaffold, strong colored overlay bloom, larger/brighter/longer particles. Saved as localStorage preset "super fun" — **pending export to file** for persistence across browser data clears.
  - Validated live with piano through Scarlett 2i2 (clean chord triangles), voice through built-in mic (FFT blobs per sounding PC), and Launchkey MK4 MIDI (held triads render warm/cool overlays at all 4 lattice copies).
  - **Known issue (deferred):** selecting a real audio input in the Hardware dropdown routes input to `Tone.Destination`, producing speaker feedback when MIDI sampler plays. `audio-input.js` refactor needed — route source to analyser only. Workaround: "No audio input" for MIDI-only testing, or use headphones.

- **Art Lab 3D rendering — Stage 1 Prompt 2 (triangles on torus/sphere):**
  - 96 triads built on the toroidal 12×4 lattice (every cell gets one major upward + one minor downward — no boundary gaps because the lattice wraps on both axes). Each triangle entry carries `{ a, b, c, type }` with `type ∈ {'major', 'minor'}`.
  - Winding chosen so `(p1 − p0) × (p2 − p0)` points outward at morph=0; verified at (col=0, row=0) on both major and minor (dot product ≈ 0.93–0.94 with the surface normal at the centroid).
  - `_drawTriangles3D` recomputes rotated 3D vertex positions, derives per-triangle outward normal, and uses `n.z` (after normalize) as the facing value. Continuous back-face alpha: `alphaFactor = 0.6 + 0.4 · facing` ∈ [0.2, 1.0]. Smooth falloff through the silhouette — no hard ring artifact.
  - Major triads tinted warm `[220, 165, 90]`; minor cool `[90, 140, 210]`. Held chords no longer the only path to a visible triangle in 3D — the scaffold is always rendered.
  - Draw-order: 2D mode keeps grid-then-triangles (bit-for-bit identical); 3D mode reorders to triangles-then-grid so the faint lattice edges + dots remain visible on top of the filled triads.
  - Single-pass, no painter's-algorithm sort. Self-occlusion artifacts deferred (notes in SESSION_LOG).
  - Three new debug-panel sliders in the existing "3D Geometry" group: `triangle3DBaseAlpha`, `triangle3DStrokeAlpha`, `triangle3DStrokeWidth`. RGB tint params kept code-only.

- **Art Lab 3D rendering — Stage 1 Prompt 1 (nodes + edges on torus/sphere):**
  - `mode3D` feature flag in `DEFAULT_PARAMS` (default `false`); 2D path is bit-for-bit unchanged when off.
  - 3D lattice: 12 cols × 4 rows, nodes carry `(col, row, u, v, pc)` with `u = col·2π/12`, `v = row·2π/4`, PC formula unchanged. Each PC appears 4× on the surface. Edges wrap toroidally — every node has all six Tonnetz neighbors.
  - Parametric surfaces share `(u, v)`: torus `((R + r cos v) cos u, (R + r cos v) sin u, r sin v)` and sphere `(R cos v cos u, R cos v sin u, R sin v)`. Linear `morph ∈ [0, 1]` interpolates vertex positions.
  - World-axis rotation around X/Y/Z (Euler XYZ), three independent angular velocities. Default `rotSpeedY = 8 deg/s` so the shape is obviously 3D on first toggle.
  - Orthographic projection, scale fit `(R + r) → 70 %` of smaller canvas dim, computed in `_resize`.
  - `_buildGrid` and `_transformedNode` branch on `mode3D`; `_drawGrid` is unchanged. `setParam`/`setParams` rebuild the lattice when `mode3D` toggles.
  - Debug panel: new "3D Geometry" group with `mode3D` toggle, `morph`, torus radii, rotation speeds. Row builder extended to support `kind: 'toggle'` (checkbox + on/off readout).
  - Triangles deliberately empty in 3D mode — Prompt 2 adds them with back-face alpha. Particles in 3D look wrong (still spawn in 3D-projected screen space) — addressed in a later stage.

- **Art Lab audio infrastructure — real MIDI + mic input wired end-to-end:**
  - Unified held-notes tracker in `templates/art.html` merging four sources: on-screen keyboard, MIDI held notes, MIDI sustained notes, and detected chord/pitch events. Replaces prior source-agnostic append path with an additive multi-source model.
  - `KeyboardView.onNoteRelease` callback added symmetric to `onNotePlay`, routing on-screen keyboard releases through the tracker.
  - MIDI input via `midi-input.js` — Launchkey 49 auto-detects, drum channel 10 filtered. noteOn/noteOff routed through the sampler proxy in Tone's context.
  - Sustain pedal (CC 64) — pedal down defers `triggerRelease`, pedal up flushes. Standard piano semantics.
  - On-screen keyboard visibility toggle (hidden by default). `Keyboard` button in Hardware row toggles `.art-keyboard--hidden`. Preference in `localStorage['songlab.art.keyboardVisible']`. KeyboardView stays instantiated so sampler/analyser chain stays wired.

- **Chord + pitch detection wired into `/art`:**
  - `chord-detection.js` and `pitch-detection.js` both created and started together in `_updateAudioInputStatus` reconciliation (when `AudioInput.isActive && toneRunning`).
  - Parallel operation, not mutually exclusive. Pitch wins on confident monophonic input (`confidence >= 0.85`), chord takes over when pitch returns `frequency=0` (polyphonic / silence / ambiguous).
  - Silence watcher (100ms poll, 500ms quiet threshold) for chord-detection's edge-triggered emit model. Pitch-detection emits continuously, no watcher needed.
  - Root-first entry ordering in `_chordEventToEntries` so `_readHarmonyState`'s order-based role assignment colors root=gold, third=coral, fifth=blue correctly.

- **Audio-input routing bug fixed (latent, predates `/art`):**
  - Symptom: chord detection "working" during earlier testing was reading residual MIDI sampler audio, not mic — because the `_sourceNode` from `AudioInput`'s auto-restore (fallback-context path) was never successfully re-wired into Tone's context despite `AudioInput.isActive` reporting true.
  - Root cause: `setAnalyser()` tries to reconnect the stale cross-context source and silently fails, leaving state that breaks the subsequent `selectDevice`'s fresh connection.
  - Fix: explicit `AudioInput.disconnect()` before `setAnalyser` in `/art`'s `_attachAudioInputToTone`, so rewire starts from clean state. Contained to `templates/art.html`; shared `audio-input.js` refactor deferred.
  - **Resolves the April 19 "Scarlett 2i2 audio routing needs verification" known issue.**

- **`pitch-detection.js` autoplay-policy fix (shared module):**
  - Chrome starts programmatically-created `AudioContext` instances in `suspended` state. While suspended, `ScriptProcessorNode.onaudioprocess` does not fire — so YIN runs but sees no samples, and every callback returns `frequency: 0` below confidence.
  - Fix: `await audioContext.resume()` after construction in `pitch-detection.js:start()`. `resume()` is a no-op on already-running contexts, so callers that create the detector inside a user gesture (Melody Match) are unaffected. Callers that create it asynchronously (Art Lab via audio-input reconciliation) now get a running context and actual emissions.

- **Role preservation through decay tails (shared module):**
  - Previously `_readHarmonyState` reset every PC's role to `'root'` on every HarmonyState update; PCs decay over 2–3 seconds, during which they rendered in the wrong color (snapping to gold).
  - Fix: in `resonance-art-view.js`, reset role only for PCs about to be re-assigned this frame. Preserves prefer-lowest-index-role logic for same-frame multi-octave cases.

- **Triangle visibility + blob duration fix:**
  - `silentEps` default lowered from `0.001` to `0.0001` so quieter notes can cross the activity threshold.
  - New `triangleIntensityScale` parameter (default `100`), slider added to Chord Triangles panel. Intensity formula in `_drawTriangles` multiplies by the scale before `Math.min(1, ...)`.
  - Root cause: per-PC energy for a held triad is ~`0.003`, but the prior intensity formula assumed ~`1.0` energy so `alpha × intensity ≈ 0.003` rendered invisible.

**Completed previous cycle (April 20):**

- **Resonance debug panel (Explorer):**
  - URL-gated at `/explorer?debug=resonance`; production users see nothing
  - Refactored `resonance-view.js` constants → `DEFAULT_PARAMS` instance object with `getParams()` / `setParam()` / `setParams()` API; per-frame reads enable live tuning without reload
  - 22 tunable parameters across four sections (Smoothing & Decay, Particle Spawning, Particle Lifetime & Motion, Render & Glow)
  - Save / Export / Reset preset system with `localStorage['songlab.resonance.presets']`; export downloads dated JSON
  - Inline name-entry input replacing native `window.prompt()` (Chrome's narrow URL-bar prompt was unusable)
  - Viewport-fit panel layout with sticky header and internal slider scroll

- **Resonance bug fixes:**
  - Inverted blob fill (gradient was hollow at center) → center-bright with new `blobFillAlpha` tunable
  - Wiggle direction was global X/Y axes → now perpendicular to particle velocity
  - `PEAK_MAG_THRESHOLD` promoted from module constant to log-scale `peakMagThreshold` slider

- **Resonance default tuning baked in (sparkler aesthetic):**
  - New `particleDeceleration` parameter (default `0.95`)
  - 12 baseline values updated for short-life, low-velocity, high-spawn-rate, decelerating sparkler look
  - **Behavior change for end users:** Explorer's Resonance now renders sparkler-style by default, not starburst

- **`/art` sandbox route:**
  - New Flask route, new `templates/art.html`, new `static/shared/resonance-art-view.js` (verbatim fork of `resonance-view.js`, class `ResonanceArtView`)
  - Always-visible debug panel (Art Lab Tuning), independent preset namespace `localStorage['songlab.art.presets']`
  - Explorer's Resonance tab and `resonance-view.js` fully untouched by the fork

- **`/art` grid motion:**
  - Lattice rotates and sways as a rigid body around canvas center
  - Three tunables (`gridRotationSpeed`, `gridSwaySpeed`, `gridSwayAmplitude`), all default `0` so baseline unchanged until dialed in
  - Particles live in screen space — comet-trail effect on slow rotation

- **`/art` chord triangle highlights:**
  - Triangle list built at lattice setup (~48 triangles in 7×5 grid)
  - For each triangle, if all three vertex PCs are simultaneously active, render a gold fill + stroked outline with shadowBlur glow
  - Geometric truth emerges naturally: triads light one triangle, 7th chords light two adjacent triangles sharing an edge
  - Four tunables for fill/stroke/glow

- **`audio-input.js` cleanup (committed at session start):**
  - Extracted `_connectToAnalyser()` helper that prefers `Tone.connect()` for native-to-Tone wiring with a manual fallback
  - DRY'd up the analyser-swap path in the Hardware UI

**Completed previous cycle (April 19):**

- **Resonance tab (new Explorer panel):**
  - 6th Explorer stage tab: radial FFT spectrum visualization on Tonnetz grid
  - `static/shared/resonance-view.js` — ResonanceView class, 7×5 Tonnetz lattice
  - Each active node renders the FFT spectrum wrapped in a circle — frequency → angle, magnitude → radius
  - HarmonyState gates which nodes render, FFT drives how they look. No synthetic fallback — pure audio-driven.
  - Chord-function coloring: gold (root), coral (third), blue (fifth), green (seventh)
  - Particles spawn from FFT peaks, radiate outward, dynamics matched to Spectrum panel
  - Fullscreen toggle on both Spectrum and Resonance tabs

- **Audio interface wiring (Explorer):**
  - `audio-input.js` connected to Explorer with Hardware UI (device dropdown, status, quality badge)
  - Scarlett 2i2 auto-detect, MediaStreamSource feeds shared `Tone.Analyser`
  - Both Spectrum and Resonance read live external audio
  - Fixed Tone.js cross-context node connection error

- **Polyrhythm Trainer tweaks:**
  - Hit zone moved up (HIT_Y 370→280), post-hit effects area below
  - Audio gain chain (layerGain → masterGain) eliminates overlap on changes
  - Lane waves + missed notes extend below hit zone with fade-out

- **Bug fixes:**
  - Quality name mismatch between chord-resolver.js and transforms.js (dim→diminished, aug→augmented, etc.)
  - TypeError in _notesFromTriad when triadNotes returned null for unrecognized qualities
  - Tonnetz crash (buildNeighborhood) on unrecognized chord types — try/catch guard added
  - kv-key--midi missing CSS → changed MIDI source to 'user' for existing highlight styles
  - Duplicate audio on MIDI chord detection → _suppressAutoPlay wrapper
  - Keyboard octave jump on chord detection → manual HarmonyState.update with real MIDI octaves

**Completed previous cycle (April 9-13):**

- **Project rename (April 13):** Tonnetz → SongLab across GitHub, Railway, CLAUDE.md, README.md, doc filenames, cross-references. Music theory "Tonnetz" references preserved.

- **Extended chord support (April 13):**
  - `CHORD_TYPES` dictionary in transforms.js: triads, 7ths (dom7/maj7/min7/dim7/half-dim7/minmaj7), sus (sus2/sus4/7sus4), extended (add9/dom9/maj9/min9)
  - `chordPCs`, `chordNotes`, `baseTriad`, `extensionNotes`, `chordSymbol` utility functions
  - HarmonyState: `activeChord` field, `setChord()`, `highlightChord()`, chordType-aware `setProgressionIndex()`
  - Keyboard extension rendering: gold ring highlights, interval labels (♭7, 7, etc.)
  - Tonnetz extension nodes: glowing nodes + dashed connectors for notes beyond the triad
  - Chord labels: `activeChord.symbol` preferred ("B7", "Cmaj7") across Explorer + Tonnetz
  - Folsom Prison, Johnny B. Goode, ii-V-I, Lean On Me walkthroughs updated with chordType

- **Three new walkthroughs (April 13):**
  - Bridge Over Troubled Water (diminished passing chords, musician)
  - Oh! Darling (augmented passing chord, student)
  - Life on Mars? (advanced augmented connectors, musician)
  - All with rhythm data, song-examples.js entries, landing page grid placement

- **Fundamentals Chapter 4: "Beyond Triads" (April 13):**
  - 5 interactive sections: Adding the Seventh, The Tritone, Diminished & Augmented, Suspended Chords, Hearing Them in Songs
  - Root selectors, type toggles, gold extension highlights, coral tritone spotlight, resolution animations, song card jukebox
  - Chapters renumbered: Meet the Tonnetz → Ch5, Transforms → Ch6
  - Hub page, routing, intro-hub.js updated for 6 chapters
  - 3-octave keyboards sized to fill wider containers

- **Global typography overhaul (April 13):**
  - design-tokens.css font scale increased ~40% across all sizes
  - Explorer scoped 2x font override removed (no longer needed)
  - Fundamentals layout widened: sections 1000px, interactives 900px, narration 800px
  - Fundamentals keyboards: global size overrides in intro.css for all chapters


- **Game visual unification (Phase A+.1/A+.2)**: game-shell.css extracted, all 8 games migrated, index.html converted to extend base.html, Swing Trainer converted to Jinja2 template, ~500 lines duplicate CSS removed, all legacy color vars → design tokens


- **Game audit & build plan update (April 11-12)**:
  - Full audit of all 8 games: Harmony Trainer, Strum Patterns, Swing Trainer, Melody Match, Chord Spotter, Rhythm Lab, Scale Builder, Relative Key Trainer
  - Two game types identified: Performance (no Learn mode, difficulty axes) and Learning (stage-based, Intro/Practice/Test)
  - Adaptive engine standardized on Pattern B (promote after N correct, demote after N wrong) with independent axes per game
  - ResultDetail schema designed for competency graph (per-game detail shapes)
  - MIDI input pulled forward from Phase F to Phase A+ (new `midi-input.js` shared module)
  - SkratchLab lightweight DAW vision captured (song presets, chord loops, melody play-over)
  - Two new games designed: Voice Leading Detective (B7), Polyrhythm Trainer (B8)
  - Vienna (Billy Joel) walkthrough planned
  - Build plan updated to v4: new Phase A+, fast path to Competency Graph (B → B.5 → E5), updated session budget
  - Created `docs/game-engine-spec.md`
- **SkratchLab rebrand**: Skratch Studio → SkratchLab (user-facing text + URL paths /skratchlab)
- **Explorer visual polish**:
  - Keyboard: cream white keys (#E8E2D6), real piano proportions, scalable via CSS overrides
  - Tonnetz: lighter canvas (#1E1C17), visible grid edges/nodes
  - Dark theme contrast bump across all text colors
  - Walkthrough sidebar: wider (300px), bigger text, enlarged step badges
  - Removed dead Spotify/Apple Music links
  - Fixed fretboard/keyboard proportions in "Both" view
- **Info pills**: "Learn" pills on panel headers, compact ⓘ on Transform/Key controls, linking to fundamentals
- **Game deep-linking**: CONCEPT_GAME_MAP, "Try this" pills on walkthrough steps, games read URLSearchParams
- **Base.html restyle**: warm SongLab palette, dropdown nav restored (Ear Training, Rhythm & Play, Games, Learn), dark theme support
- **SkratchLab top-level nav**: promoted from dropdown to standalone nav link
- **Rhythm analysis (new feature)**:
  - Rhythm tab in Explorer (4th stage tab), renders beat patterns from walkthrough data
  - Tone.js playback engine with playhead animation
  - BPM slider, volume controls (Rhythm + Chords separate)
  - Bass follows chord root, keyboard plays over running rhythm
  - 7 new rhythm-tagged song entries in song-examples.js
  - All walkthroughs backfilled with rhythm data (including 6/8 for Norwegian Wood)
- **Audience tracks (new feature)**:
  - 4 new walkthroughs: Let It Go, You've Got a Friend in Me (kids), Stand By Me, Lean on Me (students)
  - All walkthroughs tagged with audience + category
  - Landing page: audience tabs filter MIDI pad song grid
- **SkratchLab Rhythm Builder (new feature)**:
  - Interactive 4×8 drum machine grid (kick/snare/hihat/strum)
  - Preset patterns (rock, train, disco, hiphop, shuffle, backbeat)
  - Tone.js playback, BPM slider, export to Blockly blocks
  - Rhythm data exports from Explorer → SkratchLab via sessionStorage
- **Tutorial page**: 10-section walkthrough at /tutorial using Norwegian Wood
- **Playback fixes**: first chord replay, Shift/CapsLock sustain, piano reset on walkthrough start
- **Landing page**: Melody Match + Strum Patterns added to games grid, tutorial link

---

## What's Working



### Tonnetz Explorer ✅ fully restyled + Spectrum + MIDI + Resonance + Audio Interface
- DAW-style dark theme at `/explorer`: transport controls, song info bar, walkthrough sidebar
- Tabbed panel area: Tonnetz / Chord Wheel / Fretboard / **Rhythm** / **Spectrum** / **Resonance** (all wired and synchronized via HarmonyState)
- **Spectrum tab (Harmonic Resonance):** real-time FFT particle visualizer, particles colored by chord function, spectral envelope with peak-hold
- **Resonance tab (new):** radial FFT spectrum visualization on Tonnetz grid. Each active node renders the spectrum wrapped in a circle — frequency → angle, magnitude → radius. HarmonyState gates which nodes render, FFT drives how they look. Particles spawn from peaks, radiate outward. Fullscreen toggle.
- **Audio interface support:** Hardware UI (device dropdown, status, quality badge). Scarlett 2i2 auto-detect. External audio feeds shared `Tone.Analyser` — both Spectrum and Resonance visualize live guitar/mic input.
- **MIDI input:** Web MIDI API via `midi-input.js`, Launchkey 49 auto-detect, keyboard size selector (25/49/61/88)
- **Chord lock-in:** freeze MIDI-detected chord for P/R/L transform exploration, sustain pedal toggle, chained transforms
- **Key-aware chord resolution:** ambiguous chords (aug/dim) resolve using diatonic context from KEY selector
- Shared FFT analyser in audio chain (`KeyboardView.getAnalyser()`) — all instruments + external audio feed spectrum
- Fullscreen toggle on Spectrum and Resonance tabs
- Chord-quality color families: blue=major, green=minor, coral=borrowed
- Tonnetz animations: pulsing nodes, glow worm paths, ghost trails
- Cream keyboard keys with real piano proportions, lightened Tonnetz canvas
- Info pills: "Learn" on panel headers, ⓘ on controls → link to fundamentals content
- Rhythm tab: renders beat pattern from walkthrough data, Tone.js playback with playhead, BPM slider
- Separate volume controls for rhythm and chords
- Shift/CapsLock sustain for keyboard playback
- Keyboard plays over running rhythm without restarting beat
- Audio via music-engine.js / Tone.js / Salamander sampler (piano default for walkthroughs)
- Canonical orientation locked: horizontal=P5, up-right=M3, down-right=m3, major=△, minor=▽
- Deep-linking via URL params: ?root=, ?quality=, ?progression=, ?walkthrough=
- Record-and-export bridge to SkratchLab (sessionStorage + window.open) — includes rhythm data

### Guided Walkthrough System ✅ with rhythm + audience tracks + extended chords + key context
- Walkthrough sidebar in Explorer driven by `static/shared/walkthroughs.js`
- **18 walkthroughs** across 3 audiences:
  - Kids: Let It Go (pop formula), You've Got a Friend in Me (shuffle feel)
  - Students: Stand By Me (doo-wop loop), Lean on Me (gospel piano, Cmaj7), Oh! Darling (augmented passing chord, 11-step full verse)
  - Musicians: Yesterday, Eleanor Rigby, Creep, ii-V-I jazz (min7/dom7/maj7), Norwegian Wood (Mixolydian), Stairway (P transform), In My Life (deceptive cadence), Johnny B. Goode (twelve-bar blues, dom7), Folsom Prison Blues (train beat, dom7), Why Does My Heart (Moby), Bridge Over Troubled Water (diminished passing chords), Life on Mars? (augmented connectors), Vienna (chromatic mediant)
- All walkthroughs tagged with `key` field — KEY dropdown syncs on walkthrough load
- Extended chord types: `chordType` field on steps drives `highlightChord()` path, showing full chord symbols (B7, Cmaj7, F♯°, E+) on Tonnetz and keyboard
- All walkthroughs have rhythm data (time sig, BPM, feel, beat pattern)
- Walkthrough focus override: user's manual tab choice respected, reset on new song
- Categories: Voice Leading, Transforms, Jazz Harmony, Modes & Scales, Progressions, Rhythm & Feel
- Each step: chord state via HarmonyState, auto-play, conversational explanation, harmonic function label
- "Try this" game pills with deep-linking (CONCEPT_GAME_MAP → pre-configured URL params)
- "You'll also hear this in..." related songs from song-examples.js
- Panel focus: steps can dim non-relevant panels or auto-switch to Rhythm tab
- Walkthroughs auto-capture progression for export to SkratchLab

### SkratchLab ✅ renamed + Rhythm Builder
- `/skratchlab` route (renamed from `/skratch-studio`)
- Top-level nav link alongside Explorer
- Interactive Rhythm Builder: 4×8 drum machine grid, preset patterns, Tone.js playback, export to Blockly blocks
- Rhythm data imports from Explorer via sessionStorage (pre-loads grid + BPM)
- Record-and-export pattern: Explorer captures progression → SkratchLab opens with session preloaded
- PLR transform math deduplicated — imports from `transforms.js`
- MIDI export: BPM header + drum skip warning fixes
- Transport conflict handling between Rhythm Builder and main Run engine

### Landing Page & Navigation ✅ audience-segmented
- Warm light-theme landing page with audience tabs (Kids/Students/Musicians)
- MIDI pad song grid filters by selected audience, category badges on cards
- Hero tagline, subtitle, Explorer preview, tool cards, game cards (6 games)
- Tutorial link below tagline
- Dropdown nav in base.html: Explorer, SkratchLab, Ear Training (4), Rhythm & Play (2), Games (2), Learn (6)
- Dark theme dropdown support for Explorer/SkratchLab standalone navs
- Active state highlighting on current page nav link
- No instance of "theory" in user-facing UI

### Tutorial Page ✅ new
- `/tutorial` — 10-section walkthrough using Norwegian Wood as example
- Covers full feature set: song picker, walkthrough sidebar, Tonnetz, chord wheel, transforms, game pills, rhythm tab, keyboard/sustain, SkratchLab export
- Feature callout boxes, "Try it" links with deep-link params

### Design System ✅ complete
- `static/css/design-tokens.css` — light/dark theme tokens, **global font scale increased ~40% (April 13)**
- Explorer and SkratchLab fully on dark DAW token set
- Base.html warm palette cascades to all game/theory/intro pages
- All hardcoded pixel font sizes replaced with design tokens
- Real piano keyboard proportions as default

### Song Examples Database
- **84 entries** in song-examples.js (v1.1 + rhythm + extended chord additions)
- Rhythm concept_specifics: train_beat, shuffle, syncopation, odd_meter, backbeat
- Swing feel entries with swing_ratio field
- Consumed by: walkthroughs, game deep-links, "also hear this in" related songs

### Voicing Explorer (Phase A5 — core complete)
- Note Mode: toggle individual notes across all three panels
- Glow worm path visualization
- ChordResolver with interval-content fallback
- Full three-panel bidirectional sync via HarmonyState

### Chord Progression Engine
- Multi-path glow worm visualization (animated playthrough with fading trails)
- Fixed Tonnetz center during progression playback
- Common-tone highlighting between chord transitions

### Fretboard Panel
- Composable Explorer panel at static/shared/fretboard-view.js
- Multi-position highlighting with practical voicing clusters
- Keyboard/Fretboard/Both toggle on Explorer

### Shared Components
- `transforms.js` — PLR math, pitch utilities, interval utilities, **CHORD_TYPES**, chordPCs/chordNotes/baseTriad/extensionNotes/chordSymbol
- `harmony-state.js` — pub/sub state model, **setChord/highlightChord** for extended chord types
- `tonnetz-neighborhood.js` — SVG renderer with chord-quality coloring, **extension node rendering**
- `keyboard-view.js` — real piano proportions, highlight layer, click interaction, **extension ring highlights**, shared `Tone.Analyser` owner
- `resonance-view.js` — radial FFT Tonnetz visualization, HarmonyState-gated, chord-function coloring, Spectrum-matched particle dynamics. **April 20:** refactored to instance-based `DEFAULT_PARAMS` for live tuning; sparkler defaults; perpendicular wiggle; new tunables (`blobFillAlpha`, `peakMagThreshold`, `particleDeceleration`)
- `harmonograph-view.js` — verbatim fork of `resonance-view.js` for the `/harmonograph` sandbox (formerly `/art`, renamed 2026-04-24). Class `HarmonographView`. Adds grid motion (rotation + circular sway, lattice as rigid body), chord-triangle highlights (gold fill on Tonnetz triangles whose vertex PCs are all active), and a 3D mode (`mode3D` flag) with a 12×4 toroidal lattice on a torus-to-sphere morphable surface, manual world-axis rotation, and 96 always-visible triads tinted warm/cool with continuous back-face alpha. Will diverge freely from the canonical Explorer version.
- `chord-wheel.js` — dual-ring circle of fifths
- `song-examples.js` — 84 curated real-song references
- `walkthroughs.js` — 17 guided Explorer walkthroughs with rhythm data, audience tags, category labels, extended chord types
- `audio-input.js` — audio interface device selection (Scarlett auto-detect), source quality flag, Explorer Hardware UI
- `onset-detection.js` — spectral flux onset detector, reads shared Tone.Analyser
- `pitch-detection.js` — client-side YIN pitch detection, CREPE strategy pattern for Pro tier
- `chord-detection.js` — chroma template matching, 10 chord types, bass detection
- `input-provider.js` — unified input abstraction, modality picker UI
- `midi-input.js` — Web MIDI API, Launchkey 49 auto-detect, device persistence

### Intro Module ✅ 6 chapters
- 6 chapters: Sound & Notes, Intervals & Scales, Chords & Progressions, **Beyond Triads** (new), Meet the Tonnetz, Transforms
- Beyond Triads: 5 interactive sections with root selectors, type toggles, tritone demo, song card jukebox
- 3-octave keyboards sized to fill wider containers, global key size overrides
- End-of-chapter "What's Next" cards

### Games & Tools
- Harmony Trainer, Chord Walks (4 tiers), Rhythm Lab, Strum Patterns, Chord Spotter, Scale Builder, Melody Match
- **Swing Trainer**: ear-training for jazz swing feel (rotary knob, waveform viz, Practice/Test)
- **Polyrhythm Trainer** (new): Guitar Hero-style falling-note game. Practice Mode (phase-based BPM ramp: Listen → Layer A → Layer B → Both → Victory) and Challenge Mode (arcade adaptive with leaderboard). Dark DAW theme, drum pads, lane breathing waves. First game on `input-provider.js` + `onset-detection.js`. Spec: `docs/polyrhythm-trainer-spec.md`
- **SkratchLab**: Blockly + audio + music blocks + Rhythm Builder
- All games accept URL params for deep-linking from walkthroughs
- Visual layer system (visual-config.js, visual-layer.js, visual-toggle.js)

### General
- Backend API proxy ✅ complete
- Phase A complete: A1 ✅ A2 ✅ A3 ✅ A4 ✅ A5 ✅
- Phase A++ complete: client-side audio DSP, 5 detection modalities, device selection, input provider
- Opus 4.7 code review completed: `docs/code-review-opus47.md` — 5 critical blockers resolved

---

## Not Started

See `docs/songlab-build-plan.md` (v4) for the full phased roadmap:

- **Phase A+:** Game visual unification (`game-shell.css` extraction, all games extend base.html) — partially complete (CSS extracted, templates unified, MIDI module landed)
- **Multi-chord glow worm paths** — visualize chord progressions/transitions with simultaneous paths showing voice leading (notes that stay vs. move)
- **SkratchLab lightweight DAW** — song presets, chord loops + rhythm, melody play-over, instrument selection (parallel to Phase B)
- **Phase B:** Extract `game-flow.js` (Pattern B adaptive, independent axes, ResultDetail schema), new games (Voice Leading Detective, Note Name Trainer, Interval Spotter, Chord Progression Builder, Rhythm Tapper, Melody Dictation). **Polyrhythm Trainer ✅ complete (B8)**
- **Phase B.5:** Auth & Persistence — Supabase auth, profile migration, ResultDetail → Supabase
- **Phase E5:** Competency Graph — fast path (B → B.5 → E5), cross-game skill tracking. CREPE pitch engine upgrade (Pro tier).
- **Phase C:** Curriculum paths, path runner UI, Tonnetz curriculum map
- **Phase D:** Differentiated experiences by user level
- **Phase E1–E4:** Per-game AI-powered feedback
- **Phase F:** Puzzle Paths, NoteInputProvider full abstraction (extends A++.6), Voicing Explorer advanced, social features
- **Architecture cleanup (from code review):** consolidate triplicated chord-type registries into transforms.js, replace `_suppressAutoPlay` with source-tagged HarmonyState.update(), standardize factory-function naming across detection modules

---

## Known Issues

- **STATUS.md structural cleanup pending.** This document has
> accumulated drift: the Cantor block appears in three places
> (lines ~7, ~87, ~145, all within a week of each other and
> partially overlapping); the "Current Focus" section is dated
> April 22 and predates the Cantor and audio-onset-analysis
> work; "Completed this cycle" sections have migrated into
> STATUS.md from SESSION_LOG.md; and "Next priorities" includes
> items of unclear current status. A restructure session is
> flagged in SESSION_LOG.md (2026-04-30 entry, Flagged for
> later). Until that session: trust the most recent block when
> in doubt, and SESSION_LOG.md as the source of truth for
> what's happened.

- **Resonance defaults changed (April 20)** — Explorer's Resonance tab now renders sparkler-style by default, not the original starburst from April 19. Original aesthetic not preserved as a baked-in preset; consider adding it back as a named preset alongside "Defaults".
- **`/harmonograph` route is unlinked** — sandbox by design; visit `/harmonograph` directly (legacy `/art` redirects). Easy to forget the route exists. Decide on a front-door (footer link, easter egg, or remain hidden).
- **`pitch-detection.js` uses deprecated `ScriptProcessorNode`** — Chrome logs a deprecation warning. Functional for now. AudioWorklet migration tracked in `docs/audio-architecture.md` Open Question 1.
- **Swing Trainer 500 on production** — could not reproduce locally (April 17). Template extends base.html correctly. Likely Railway deploy state issue. Need fresh deploy + production stack trace capture. See `docs/KNOWN-ISSUES.md`.
- **Railway cold start** — ~15s first load after inactivity (hobby tier), warn testers
- **Rhythm Lab + Strum Patterns mic paths disabled** — dead route calls commented out, TODO points to onset-detection.js migration. Keyboard/spacebar input still works.
- **Harmony Trainer still uses server-side pitch detection** — `/process_audio_chunk` → librosa. Migration guide in `templates/harmony.html` comment block.
- **`_suppressAutoPlay` load-bearing** — 17 sites in explorer.html. Code review recommends source-tagged HarmonyState.update(). Deferred.
- **Triplicated chord-type registries** — transforms.js, chord-resolver.js, chord-detection.js. Consolidation into transforms.js recommended.
- **`/api/chat` proxy hardening** — model allowlist and server-side system prompt recommended. Not a blocker.
- Swing Trainer: dial slightly finicky past midpoint
- Swing Trainer: song-examples.js swing_ratio field not yet consumed by game
- SkratchLab Rhythm Builder: strum row doesn't export to Blockly (no strum block exists)
- Sustain pedal bug: Organ/Synth in SkratchLab — `triggerAttackRelease` bypasses sustain state
- Mobile/responsive not tested — deferred to post-MVP
- SkratchLab: "Clear All" button clears blocks but not canvas — needs canvas reset
- Polyrhythm Trainer not yet in nav dropdown or landing page
- Full list: `docs/KNOWN-ISSUES.md`
- **Backlog:** Enharmonic sharp/flat toggle for Fundamentals keyboards (deferred)

---

## Key Docs

| Doc | Purpose |
|---|---|
| `docs/songlab-build-plan.md` | **Active roadmap** (v4) — Phases A–F + A+ + A++ + B.5, dependency graph, session budget |
| `docs/audio-architecture.md` | **Audio & Input spec** — detection modalities, client-side DSP, device selection, input provider, CREPE upgrade path |
| `docs/polyrhythm-trainer-spec.md` | **Polyrhythm Trainer spec** (v2) — Practice/Challenge modes, drum pads, phase-based ramp |
| `docs/code-review-opus47.md` | **Code review** — Opus 4.7 comprehensive review, 5 sections, severity ratings |
| `docs/game-engine-spec.md` | **Game audit** — per-game analysis, adaptive axes, ResultDetail schemas, new game designs |
| `docs/design-system-reference.md` | CSS tokens, color palette, typography — design system reference |
| `docs/visual-engine-spec.md` | Generative art engine spec (Tonnetz-driven, post-launch) |
| `docs/explorer-spec.md` | Explorer design, panel specs, canonical orientation |
| `docs/voicing-explorer-spec.md` | Voicing Explorer — chord shapes, glow worm paths, projections |
| `docs/content-architecture.md` | Content model, topic schema, lens system |
| `docs/game-flow-pattern.md` | Learn → Practice → Test pattern (to be updated with audit findings) |
| `docs/auth-architecture.md` | Supabase auth, profile migration, security checklist |
| `docs/KNOWN-ISSUES.md` | Tracked bugs and fixes |
| `docs/claude-code-preferences.md` | Claude Code workflow conventions |
| `docs/extended-chords-spec.md` | Extended chord type system — CHORD_TYPES, data model, visual rendering |
---

## Update Protocol

After every work session:
1. Update "Last updated" date
2. Update "Current Focus" with what's active and what's next
3. Move completed items into "What's Working"
4. Add new bugs to "Known Issues"
5. Commit: `git add docs/ && git commit -m "Update project status"`
