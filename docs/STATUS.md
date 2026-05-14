# SongLab Project Status

**Last updated:** 2026-05-14
**Branch:** `dev` (active — Cantor v1 shipped through 6B; Phase 2 pivoted to presentational approach, see `docs/cantor-presentational-design.md` and `docs/active-plans/cantor-presentational-build-plan.md`) · `cantor-presentational-spike` (validated spike, source for production work) · `chord-melody-research` (classifier arc, paused) · `main` (prod)
**Deploy:** Railway from `main`
**Active roadmap:** `docs/songlab-build-plan.md` (v4) + `docs/cantor-design.md` + `docs/audio-architecture.md`
**Platform name:** SongLab · SkratchLab (rebrand complete)


## Current state (2026-05-14)

### Cantor — current state

**Landed and verified on dev:**
- Prompts 1–5 (route, on-screen keyboard, MIDI input, MusicalEventStream singleton, split-point input model)
- 6A: 3D torus migration (12×4 toroidal lattice, 48 nodes, 4 PC instances each)
- 6A.1: constellation wash-vertex snap fix
- 6A.2: chord-detection Hardware-state gating
- 6B: per-frame rotY drift (1 rev / 45s) + torusMajorR breathing (±5%, 8s sine)
- Test track infrastructure: `tests/generate_cantor_test_track.py` +
  `tests/cantor-test-track.md`. WAV regenerable from script (gitignored).

**Landed on branch `chord-melody-research` (paused, not on dev):**
- Onset-driven analysis foundation plus chord/melody classifier
  work (Sessions 1–2 of the classifier arc, plus 2026-05-13's
  parser extension). Arc paused 2026-05-13 in favor of a
  presentational approach to Cantor Phase 2. General-purpose
  pieces (TempoState, chord-resolver power-chord template,
  parser extension) remain valid infrastructure. See
  `docs/active-plans/chord-melody-build-plan.md` (on
  `chord-melody-research`) for the pause block and arc record.

**Landed on branch `cantor-presentational-spike` (not on dev):**
- Spike implementation of Cantor Phase 2 as a presentational
  view: lit Tonnetz triangles for sounding triads, dynamic
  per-note glyphs (radial octave offset, velocity-scaled size),
  harmonograph-style particle sparkle, color by triad quality.
  Validated live on Launchkey 49 (Stressed Out, Jupiter's
  Faerie, 12-bar blues, voice-leading test). ~1,123 lines in
  one commit. Source for hybrid promotion to a new production
  feature branch (see build plan).

**In progress:**
- Cantor presentational arc — see
  `docs/active-plans/cantor-presentational-build-plan.md`
  (5 sessions: cleanup/promotion, polish, audio verification,
  full audio interface input, merge to dev).

**Open / deferred:**
- Constellation z-fade vs hard occlusion on torus back side.
- 3D math helper deduplication (`_uvToXYZ`, `_rotate3D`,
  `_projectOrtho` are duplicated between cantor-view.js and
  harmonograph-view.js; shared-utility extraction flagged TODO).
- Tempo/beat-driven breathing (replace wall-clock `_elapsed`
  accumulator with a musical-time signal — one-line swap).
- Melody trails: connecting lines between consecutive constellation
  glyphs to expose phrase contour. Needs its own design doc; even
  more interesting on the 3D torus.
- `activeTriads`-clears-mid-phrase anchor snap-back: cosmetic, low
  priority. Fix is to keep last anchor for ~1–2× decay τ after
  `activeTriads` empties.
- Scales on the Tonnetz: separate design thread
  (`docs/scale-regions.md` to be drafted). Not blocking Cantor v1.
- Chladni backdrop dynamics (separate brainstorming thread).
- Build plan review and consolidation across SongLab surfaces —
  flagged as a candidate for a dedicated planning session.

**After Cantor v1 ships:**
- v1 user testing.
- Audio chord-detection silence-watcher tuning if needed.
- `chordChange` dispatch on MusicalEventStream (currently skipped
  as redundant; revisit if a use case emerges).


### Cantor v1 working state

Capability inventory of what's currently shipping on dev:

- /cantor route, on-screen keyboard, MIDI input, Tone.js playback
- MusicalEventStream singleton; on-screen keyboard publishes too
- Tonnetz substrate, canonical orientation (12×4 toroidal lattice
  in 3D mode; 7×5 lattice in 2D mode, regression-free)
- Chord wash with cross-fade, quality-colored fills, hue shifts for
  7ths, (rootPC, baseQuality) diff key for flash-on-quality-change
- Melody constellation, anchored to active wash centroid, with
  exponential decay, velocity → brightness, chord-quality color
- Constellation snap to wash vertices: melody glyphs snap to the
  wash triangle vertex matching their PC. Verified via deterministic
  `cantorView._testSnap` and live Launchkey play.
- User-controllable split-point line (drag, snap, persist) with
  default at MIDI 72 (C5, mid-keyboard)
- Audio chord auto-detection — wash + flash + extension hue all
  driven from live audio when Hardware is active
- Chord-detection respects Hardware state: won't run when Hardware
  is "No audio input", so manual `setTriad` is authoritative on the
  MIDI-only path
- 3D torus rendering (mode3D=true) with per-frame rotY drift
  (1 rev / 45s) and torusMajorR breathing (±5%, 8s sine). Pause
  freezes both; resume produces no jump.
- `window.cantorView` exposed on localhost for dev convenience

---

## Current Focus

The active workstream on `dev` is **Cantor v1**. Through April 27–28, prompts 1–6B landed and are verified end-to-end on dev: 3D torus surface, per-frame rotY drift + torusMajorR breathing, chord-detection Hardware-state gating, and constellation snap to wash vertices. A deterministic test-track generator (`tests/generate_cantor_test_track.py`) and section-by-section diagnostic doc were also landed for ongoing audio-pipeline validation.

Cantor surfaced a foundational limitation in `chord-detection.js`: chroma-template matching cannot distinguish a single sustained note's overtone series from a real chord, producing false-positive chord washes on solo melody. The initial response was to fork off a research branch (now `chord-melody-research`) and rebuild on onset-driven chord/melody classification. That arc ran through 2026-05-13, when the framing was reconsidered: the deeper question was whether Cantor needs to *classify* at all, or whether a *presentational* view (lit triangles + glyphs, no classification step) better serves the philosophy. A one-hour spike on `cantor-presentational-spike` answered that question affirmatively — the presentational approach reads cleanly with real music and removes the classification problem at the root rather than solving it. The classifier arc is paused; presentational is the new Phase 2 path forward. See `docs/cantor-presentational-design.md` for the design and `docs/active-plans/cantor-presentational-build-plan.md` for the 5-session build plan.

Harmonograph (`/harmonograph`, formerly `/art`) is parked on dev at Stage 2: audio-reactive Y-spin and centripetal morph are wired and validated end-to-end against a deterministic test track (`tests/harmonograph-test-track.wav`), with seven audio-pipeline bugs fixed in the same April 24 session. Real-music tuning ("Montreal") and Stage 1.5 multi-torus stacking are deferred while Cantor takes focus.

Approaching Cantor v1 user-testing readiness once the presentational arc lands on dev.


**Next priorities (active):**
1. **Cantor presentational arc** — 5-session build plan promoting the validated spike to production. Spec: `docs/cantor-presentational-design.md`. Plan: `docs/active-plans/cantor-presentational-build-plan.md`. Gates Cantor v1 user testing.
2. **SkratchLab "Clear All"** — should also reset canvas (not just blocks).
3. **Polyrhythm Trainer → nav dropdown + landing page.**

**Backlog:**
- **Real-audio Harmonograph tuning ("Montreal"):** tune `rmsDbFloor` / `rmsDbCeiling` / `spinSignalExponent` against Allison Russell "Montreal" — opening-minute-to-gospel-chorus arc as the calibration target.
- **Harmonograph Stage 1.5 (multi-torus stacking):** multiple concentric/offset toruses for harmonic-layer depth. Open design questions: stack spacing, master-vs-per-torus morph sliders, dynamic spacing as morph rises. After Stage 1.5: `audio-input.js` refactor (fix feedback loop by routing source to analyser only), particle reactivity in 3D, painter's-algorithm depth sort if self-occlusion artifacts surface.
- **Harmonograph Phase 2 design pass:** unified design conversation for three deferred ideas — multi-axis torus spin (Tonnetz-aware mapping of P5/M3/m3 chord-root motion to X/Y/Z), shimmer overlay (non-tonal audio → gold Chladni-pattern particles), and "music has color, noise is gray" saturation principle (flatness-driven desaturation across all visualizations). Worth `docs/multi-axis-spin.md`, `docs/shimmer-design.md`, `docs/color-confidence.md` design docs before building.
- **Linus and Lucy walkthrough** (connects from Polyrhythm Trainer).
- **Tab-audio capture experiment:** feed YouTube into `/harmonograph`.
- **Decide `/harmonograph` front-door** (linked from nav, footer, hidden, or remain unlinked sandbox).
- **Onboarding & tutorial UX** — guided tour / tooltip-card system: friendly intro modals on first visit (Studio, Explorer, Games, `/harmonograph`), short walkthroughs explaining what each tool is for, dedicated tutorials for the generative-art side (why the torus is the natural representation for a Tonnetz, how chord-triangles work, what the FFT is showing). Reference inspirations: BandLab's onboarding modals. Could leverage existing walkthrough infrastructure from Explorer.
- **Original starburst Resonance preset** — preserve original April 19 aesthetic as a named baked-in preset alongside the sparkler defaults.
- **Onset detection wired into Resonance** for staccato burst behavior (separate from Cantor's onset rebuild).
- **Business model / monetization spec.**
- **game-flow.js + adaptive engine extraction** (spec: `docs/game-engine-spec.md`).
- **SkratchLab lightweight DAW** — song presets, chord loops + rhythm, melody play-over.
- **Code review follow-ups:** consolidate triplicated chord-type registries (transforms.js / chord-resolver.js / chord-detection.js); replace `_suppressAutoPlay` with source-tagged HarmonyState.update().
- **AudioWorklet migration for `pitch-detection.js`:** ScriptProcessorNode is deprecated in Chrome. Tracked in `docs/audio-architecture.md` Open Question 1. Not urgent — generous deprecation timeline.
- **Test track v2:** replace pink-noise staircase with chord-velocity staircase. Top-16 RMS is biased toward tonal content (correct for music), so noise isn't the right calibration signal.
- **Hardware dropdown dedup:** Chrome exposes both "Default - X" alias and canonical "X". Cosmetic.
- **User testing prep (15–20 participants).**
- **Educational content idea:** Chladni patterns (Ernst Chladni 1787, founder of modern acoustics). History piece or standing-wave physics piece. Ties into shimmer design and platform-wide "music has shape" positioning.
- **Build plan review and consolidation** — Cantor + Harmonograph integration into the broader SongLab educational story (scales, keys, theory) deserves a dedicated planning session.

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
