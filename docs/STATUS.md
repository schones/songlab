# SongLab Project Status

**Last updated:** 2026-10-15
**Branch:** `voicing-explorer` (active — Voicing Explorer analysis
arc, Sessions 1–3 landed 2026-10-14, Session 4 built 2026-10-15 and
in the working tree, uncommitted at time of writing) · `dev` (Cantor v1 through 6B; MIDI
multi-port fix `57afaa9`) · `cantor` (presentational arc, Session 2
polish not resumed since 2026-05-19) · `cantor-presentational-spike`
(validated spike, retained as known-good reference) ·
`chord-melody-research` (classifier arc, paused) · `main` (prod —
84 commits behind dev, last deployed pre-pivot)
**Deploy:** Railway from `main`
**Local run:** `python3 app.py` with the venv active, port from `.env`
(`PORT=5001` on the Mac mini — AirPlay Receiver holds 5000)
**Active roadmap:** `docs/songlab-build-plan.md` (v4) + `docs/active-plans/voicing-explorer-build-plan.md` + `docs/cantor-design.md` + `docs/audio-architecture.md`
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

**Landed on branch `cantor-presentational-spike` (retained as reference):**
- Spike implementation of Cantor Phase 2 as a presentational
  view: lit Tonnetz triangles for sounding triads, dynamic
  per-note glyphs (radial octave offset, velocity-scaled size),
  harmonograph-style particle sparkle, color by triad quality.
  Validated live on Launchkey 49 (Stressed Out, Jupiter's
  Faerie, 12-bar blues, voice-leading test). ~1,123 lines in
  one commit. Production-promoted to `cantor` branch via
  Session 1 cleanup pass (2026-05-18); kept as known-good
  reference.

**Landed on branch `cantor` (not on dev):**
- Session 1 of the cantor presentational arc: spike code
  promoted with cleanup pass. Three commits (`c34305c`,
  `8c95949`, `155b435`):
  - B1 — branch setup: spike files copied in via
    `git checkout cantor-presentational-spike -- <files>`;
    v1 cantor files removed; v1 `/cantor` route stripped from
    app.py.
  - B2 — renames + route registration: module
    `cantor-presentational-view.js` → `cantor-view.js`,
    class `CantorPresentationalView` → `CantorView`,
    template `cantor-spike.html` → `cantor.html`, `/cantor`
    route registered.
  - B3 — content cleanup: spike-isms stripped (console
    prefixes, localStorage key, gameId, dev hook, page title,
    aria-label); duplicate `_noteNameToMidi`/`_audioNoteToMidi`
    deduped; vestigial `_parseRGBA` indirection replaced with
    direct array constants matching `GLYPH_RGB`; stale
    comments removed.
    - 2026-05-19 (`66bb368`): polyphonic chord detection wired in
  templates/cantor.html alongside YIN pitch detection — direct
  chord-detection.js instantiation mirroring harmonograph's
  dual-detector pattern; both publish to MusicalEventStream with
  source: 'audio'. Fabricated octave 4 for chord PCs, flatness
  gate (> 0.4) against broadband transients, 500ms silence
  watcher. Marked experimental in the UI ("pitch + chord
  detection (experimental)"). NOTE: this is outside the build
  plan's declared scope (polyphonic detection was deferred to a
  separate arc per RADAR); the framing decision (mirror / x-ray /
  microscope policy; prefer-mono vs always-both) is explicitly
  deferred and blocks calling Session 2 done.


**In progress:**
- Cantor presentational arc — see
  `docs/active-plans/cantor-presentational-build-plan.md`
  (5 sessions: cleanup/promotion ✓ landed 2026-05-18,
  polish ⚠ in flight, audio verification, full audio interface
  input, merge to dev).
- Session 2 status (as of 2026-05-19, unresumed since): opened
  with a STATUS update, then diverted into the polyphonic
  chord-detection wiring above. The build plan's actual Session 2
  content (parameter tuning, triangle-lighting edge cases,
  extreme registers) has not started. No SESSION_LOG entry exists
  for 2026-05-19 — the closeout protocol was skipped; commit
  message `66bb368` is the only record of that session.
- MIDI ≤ C4 regression (discovered evening 2026-05-18, SESSION_LOG
  addendum `f397287`): **resolved 2026-10-14** during Mac mini
  setup — chromatic check below C4 passes on the Launchkey.
  [Dustin: one line on the mechanism — persisted
  `localStorage['songlab.cantor.splitPoint']` was the suspected
  cause; confirm or replace.] Related: multi-port MIDI devices now
  auto-attach on init, preferring the non-DAW port (`57afaa9`).

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

**Voicing Explorer analysis arc (2026-10-14, branch `voicing-explorer`)**
is the active workstream. Motivated by a voiced practice score of
Brad Mehldau's "Don't Be Sad" (private, gitignored), the arc adds an
Analyze view that loads a voiced progression and shows per-bar
interval tension, intervals that rub, named-vs-played chord tones,
and upper-voice motion, with the shared Tonnetz and a page-owned
keyboard following the selected bar. Sessions 1–3 of the 7-session
plan landed in one day: read-and-report (placement decided as a
standalone `/voicings` page, not an Explorer stage view), the pure
analysis engine + JSON schema + exporter + fixture (41/41
self-tests, acceptance numbers match the Python prototype), and the
page itself (verified in headless Chrome). Session 4 (2026-10-15)
chose Verovio over VexFlow in a side-by-side spike and landed the
staff panel: engraved grand staff for the selected bar, colored by
role, melody always drawn, notes clickable through to the keyboard.
Tracing bars 25–27 through source → JSON → staff exposed an exporter
gap (events only at chord-voice onsets, so held basses are displaced
and bass walks dropped) and a tension gap (weights match exact spans
up to 13 semitones only). The tension step landed the same evening
(option B: compound intervals reduced mod 12, per-class octave
discounts — m2 and tritone 2/3, M2 and M7 0). Session 4.5 began
the same day: steps 1–2 landed (optional per-bar `bassLine` in the
schema and exporter, `comp.bass` by three-way lookback, the staff's
bass voice drawn from `bassLine`, `check_export.py`), then step 3
(Maple Leaf Rag A strain as a public, committed fixture: Mutopia's
public-domain LilyPond → `ly_to_src.py` → score_src grammar →
exporter, verified against Mutopia's MIDI by `check_midi.py`), and
step 4a (engine: analysis over every comp event — max aggregate,
melody by time overlap, motion last-to-first by performance
predecessor plus within-bar, optimal assignment on mismatched voice
counts). Next: step 4b (page, detail, keyboard, Tonnetz switch to a
selected-event notion), then Session 5 (melody
toggle and audio), Session 6 (Explore: generate and rank alternative voicings),
Session 7 (merge to dev). Plan:
`docs/active-plans/voicing-explorer-build-plan.md`. Schema:
`tools/voicings/schema.md`.

Also on 2026-10-14: development moved to a Mac mini (venv Python
3.12, Node 25, port 5001 via `.env`), the MIDI multi-port
auto-attach fix landed on dev (`57afaa9`), and the Cantor ≤ C4
MIDI regression was resolved (see the Cantor block).

The previous active workstream on `dev` is **Cantor v1**. Through April 27–28, prompts 1–6B landed and are verified end-to-end on dev: 3D torus surface, per-frame rotY drift + torusMajorR breathing, chord-detection Hardware-state gating, and constellation snap to wash vertices. A deterministic test-track generator (`tests/generate_cantor_test_track.py`) and section-by-section diagnostic doc were also landed for ongoing audio-pipeline validation.

Cantor surfaced a foundational limitation in `chord-detection.js`: chroma-template matching cannot distinguish a single sustained note's overtone series from a real chord, producing false-positive chord washes on solo melody. The initial response was to fork off a new branch `audio-onset-analysis` that was subsequently renamed as `chord-melody-research` and rebuild on onset-driven chord/melody classification. That arc ran through 2026-05-13, when the framing was reconsidered: the deeper question was whether Cantor needs to *classify* at all, or whether a *presentational* view (lit triangles + glyphs, no classification step) better serves the philosophy. A one-hour spike on `cantor-presentational-spike` answered that question affirmatively — the presentational approach reads cleanly with real music and removes the classification problem at the root rather than solving it. The classifier arc is paused; presentational is the new Phase 2 path forward. See `docs/cantor-presentational-design.md` for the design and `docs/active-plans/cantor-presentational-build-plan.md` for the 5-session build plan.

Harmonograph (`/harmonograph`, formerly `/art`) is parked on dev at Stage 2: audio-reactive Y-spin and centripetal morph are wired and validated end-to-end against a deterministic test track (`tests/harmonograph-test-track.wav`), with seven audio-pipeline bugs fixed in the same April 24 session. Real-music tuning ("Montreal") and Stage 1.5 multi-torus stacking are deferred while Cantor takes focus.

Approaching Cantor v1 user-testing readiness once the presentational arc lands on dev.


**Next priorities (active):**
1. ~~**Voicing Explorer — tension option B**~~ — landed 2026-10-15 (uncommitted): spans reduced mod 12, `OCTAVE_DISCOUNTS = {m2: 2/3, M2: 0, TT: 2/3, M7: 0}`; comp-only numbers inside one octave unchanged; compound minor 2nds and tritones now score (bar 26 0 → 1.333, bar 28 3 → 4.333), major 9ths/14ths do not (see SESSION_LOG).
2. **Voicing Explorer Session 4.5** — steps 1–3 and 4a ~~(`bassLine`; `comp.bass` by lookback; staff bass from `bassLine`; Maple Leaf Rag fixture + converter + MIDI check; engine per comp event)~~ landed 2026-10-15. Remaining: step 4b — the page gains a selected-event notion: detail rubs / named-vs-played / keyboard / Tonnetz follow the selected event (default: the max-tension event, which the chart stack already shows), with a way to step through a bar's events; the chart's motion row may add the within-bar total. Then Session 5 (melody toggle and audio), 6, 7. Plan: `docs/active-plans/voicing-explorer-build-plan.md`.
3. **Cantor presentational arc** — 5-session build plan promoting the validated spike to production. Spec: `docs/cantor-presentational-design.md`. Plan: `docs/active-plans/cantor-presentational-build-plan.md`. Gates Cantor v1 user testing.
4. **SkratchLab "Clear All"** — should also reset canvas (not just blocks).

- Item "Polyrhythm Trainer not yet in nav dropdown or landing
  page" (currently ~line 317): **remove — completed.** Route at
  `app.py:220`, nav link at `templates/base.html:297`, landing
  card at `templates/index.html:551` (landed 2026-04-10,
  `115d990`).
- `_suppressAutoPlay` site count (currently "17 sites", ~line
  308): **update to 19** occurrences in `templates/explorer.html`
  (1 declaration, 6 set-true, 6 set-false, a 3-line save/restore
  pair, 2 reads). Replacement design (source-tagged
  `HarmonyState.update(state, { source })`) remains sketched in
  `docs/code-review-opus47.md` (~line 386) and unimplemented.
- SkratchLab "Clear All" (~lines 117, 316): **still open** —
  `loopPedal.clearAll()` wired at `studio.js:988` clears
  blocks/layers but never calls `drawCanvasGrid()` (the separate
  Clear Canvas button at `studio.js:1064` does).
- Swing Trainer production 500 (~line 304): **unchanged /
  unverifiable** — code is correct (diagnostic comment at
  `app.py:208–218`); suspected Railway deploy-state issue. Note
  that `main` has not been redeployed since (still at `0d9efe4`),
  so the "fresh deploy + production stack trace" step has not
  happened.

- **Registry consolidation candidate:** chord-type data is
  duplicated across 7+ files with naming and coverage
  discrepancies (`diminished`/`dim`, `half-dim7`/`hdim7`/`m7b5`,
  `mΔ7`/`mM7`; power chord and sus2≡sus4 analysis stranded on
  `chord-melody-research`). Full inventory + canonical JSON spec
  drafted in `docs/registry-inventory.md` (2026-06-11 audit).
- **Branch hygiene:** tag `pre-rebase-backup` (`c87329b`)
  duplicates `84e6587` after the 5/19 rebase — delete when
  comfortable. Old branches `feature/skratch-integration` and
  `redesign/landing-page` still exist; confirm merged/abandoned.
- **Doc-branch skew:** STATUS.md and SESSION_LOG.md on the
  `cantor` checkout are stale (the branch forked before the
  5/18–5/19 doc commits on dev). Reading project docs from a
  `cantor` checkout shows pre-Session-1 state. Consider merging
  dev's doc commits into `cantor`, or always reading docs from
  dev.


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

### Voicing Explorer — Analyze view — current state (updated 2026-10-15)

**Landed on `voicing-explorer` (Sessions 1–3, 2026-10-14):**
- `static/shared/voicing-analysis.js` — pure engine: `parseSymbol`,
  `intervalTension` (interval class = span mod 12; m2 3, M2 1, TT 2,
  M7 1, × per-class `OCTAVE_DISCOUNTS` per extra octave — m2 and TT
  2/3 so m9 = 2, M2 and M7 0 so M9 = M14 = 0; all bass+voicing
  pairs; option B landed 2026-10-15), `melodyTension` (per-pitch
  duration × weight / beatsPerBar), `namedVsPlayed` (present /
  omitted / added with degree labels; written spellings drive
  labels, omitted tones spelled chord-relatively; slash bass counts
  as named), `voiceMotion` (sorted upper voices, null when counts
  differ), `analyzeProgression`, `toHarmonyNotes`. Takes intervals
  from `transforms.js` `CHORD_TYPES`; seven local types
  (`registry-inventory.md` §9). `selfTest()` — 41/41, incl. the
  private Don't Be Sad acceptance block when present.
- Data model `tools/voicings/schema.md` (v1): spelled note names are
  the source of truth; per bar `symbols[]`, `comp[]` events
  (bass + voicing, analysis uses the first), `melody[]` events.
- `tools/voicings/export_json.py` — score source → JSON, no music21;
  `tests/fixtures/voicing-fixture.json` — 12 bars, one scoring case
  each; `build.py` import path fixed.
- `/voicings` page (`templates/voicings.html`, routes in `app.py`
  incl. `/voicings/data/<name>` — private folder first, then
  fixture, JSON 404). Modules: `voicing-chart.js` (stacked SVG,
  section labels, arranged bars faded, motion row, focusable bars
  with arrow-key stepping), `voicing-keyboard.js` (page-owned
  C2–B5, bass gold / voicing blue / melody green reserved),
  `voicing-detail.js`. Shared `TonnetzNeighborhood` +
  `ChordBubbleRenderer` mounted; selection published as
  `source:'user'` notes — no `progressionState`, no auto-play.
- Verified in headless Chrome: bar 2 / 17 / 1 acceptance values on
  screen, keyboard roles, glow worm updates, `?piece=fixture`,
  `?piece=nope` not-found state, phone-width scroll.

**Built on `voicing-explorer` (Session 4, 2026-10-15, uncommitted):**
- Staff panel on `/voicings`, under "Selected bar":
  `static/shared/voicing-staff-model.js` (pure bar model + MEI
  converter — `buildBarModel`, `toMEI`, `SPLIT_MIDI` = 64 (E4):
  voicing notes at or above it go to the treble; triplets as MEI
  tuplets; all comp events in a bar; key-aware accidentals per
  letter+octave per staff; outgoing ties drawn only when the next
  bar's beat 0 has the same pitch, unmatched flags warn, last bar
  draws unmatched; incoming ties matched the same way; `selfTest()`
  46/46 incl. the private acceptance block, 0 tie warnings across
  44 bars) and `static/shared/voicing-staff.js` (`VoicingStaff`:
  Verovio 6.3.0 as lazy ESM from jsDelivr on first render, loading /
  unavailable states, latest selection wins, note click → highlight
  + `VoicingKeyboard.setHighlight(midi)` ring). Melody always drawn;
  the Session 5 toggle will not touch the staff.
- Renderer chosen by a throwaway spike (`/voicings/spike-staff`,
  dev-only): Verovio over VexFlow — see SESSION_LOG 2026-10-15.
- Verified in headless Chrome at 1400 / 390 px: bars 1, 2, 10, 17,
  19, 26, 44; click → keyboard ring; ← → stepping; rapid stepping.

**Built on `voicing-explorer` (Session 4.5 steps 1–2, 2026-10-15, uncommitted):**
- Schema v1 gains an optional per-bar `bassLine[]` (bass voice as
  written: `beat`, `dur`, `note`, optional `tie`/`arp`; one note per
  event, the lower note of a dyad) and optional document fields
  `chordSymbols: "derived"` and `attribution` for public fixtures.
  `comp[].bass` is now defined by lookback: the most recent
  bass-voice onset at or before the chord onset in the bar, sounding
  or not; else a bass tied or still sounding (reaching the bar line)
  from the previous bar; else the lowest chord note.
- `tools/voicings/export_json.py` emits `bassLine` for every bar and
  applies the lookback (`bass_for_onset`); comp events otherwise
  unchanged (re-export diff: comp/melody/symbols identical in all 44
  bars). Known reductions: grace notes in bass walks are dropped
  (bars 4, 20); bar 20's opening bass dyad keeps only its lower note
  in `bassLine` (the upper note survives in the comp voicing).
- `tools/voicings/check_export.py` — exporter self-test, 19/19:
  all three lookback branches, dyads, ties, arps, silent voices, and
  the private shapes for bars 4, 20, 25–27 plus a comp-unchanged
  diff against the exported JSON.
- `voicing-staff-model.js` draws the bass voice from `bassLine` when
  present (held basses on the downbeat, walks under a held chord),
  matches bass ties through the neighbours' `bassLine`, and includes
  the sounding bass in arpeggios; falls back to comp events when a
  bar has no `bassLine` (the public fixture). `selfTest()` 58/58.
  Verified in headless Chrome on bars 4, 20, 25, 26, 27.

**Built on `voicing-explorer` (Session 4.5 step 3, 2026-10-15, uncommitted):**
- Public ground-truth fixture: Maple Leaf Rag, A strain (Scott
  Joplin, c. 1899; Mutopia-2011/11/13-23, Public Domain, LilyPond
  2.14.2 typeset by Chris Sawer from a reproduction of the 1899
  edition). Files: `tests/fixtures/maple-leaf-rag.ly` (the source),
  `tools/voicings/ly_to_src.py` (limited-subset LilyPond reader →
  score_src grammar; the reduction rules live in its docstring and
  in the fixture's `attribution.notes`), the generated
  `tests/fixtures/maple-leaf-rag.src.py` (17 bars: 1–15 + the two
  endings as 16 and 17; pickup dropped; chord symbols ours, marked
  `chordSymbols: "derived"`), and `tests/fixtures/voicing-maple-leaf-rag.json`
  via the exporter (`META` in a source module now carries title, key,
  time, tempo, `chordSymbols`, `attribution`). Served as
  `/voicings?piece=maple-leaf-rag`.
- `tools/voicings/check_midi.py` — verifies the fixture against
  Mutopia's MIDI of the same source (downloaded on demand, not
  committed): every melody / bassLine note starts at its onset and
  pitch (ties across bar lines excepted), comp voicing notes sound
  at the chord onset, comp.bass started at or before the chord in
  the bar, and the MIDI's top / bottom note at each onset is the
  melody / bass. 260 notes, 107 onsets, 0 mismatches.
- Two rules fixed after the first MIDI run (2026-10-15): "previous
  bar" is the **performance predecessor** (the bar before the bar's
  first occurrence in `form.playOrder`), so a second ending follows
  the bar before the first ending — applied in the exporter's bass
  lookback (`predecessors()`, `build_doc()`) and in the staff's tie
  matching (`performanceNeighbours()`); and an **exact octave
  doubling of the bass** from the bass voice never joins the comp
  voicing (non-octave dyads still do). Effects: rag bar 17's bass is
  the lowest chord note, rag bars 5–6 lose the octave's upper note
  from the voicing, and private bar 17 loses its D4 doubling (tension
  unchanged at 4; the arpeggio now spans four notes; motion 17→18 is
  now computable at three voices). `check_export.py` 25/25 with an
  endings case and four octave cases.
- Staff fix found by the rag crops: with a `bassLine` present, a
  `comp.bass` that did not come from the bass voice (the exporter's
  lowest-chord-note fallback, as in the rag's chord-only bars 9–15
  and 17) is now drawn with its chord instead of vanishing
  (`bassFromLine()` in the model). Bar 9's dim7 chords show four
  notes again; D4 lands on the bass staff because it sits below the
  E4 split — the "keep each chord on one staff" polish item.
- Staff-model `selfTest()` gains a rag block (70/70): every voice of
  every bar sums to 2 beats; oom-pah bass from `bassLine`; octave
  reduced to its lower note; chords-only bars have an empty
  `bassLine`; endings linked by performance order (16 → 1, 15 → 17);
  no tie warnings. Verified in headless Chrome on bars 1, 5, 9, 16,
  17.

**Built on `voicing-explorer` (Session 4.5 step 4a, 2026-10-15, uncommitted):**
- `voicing-analysis.js` scores every comp event. Each `BarResult`
  gains `events[]` (per event: `index`, `beat`, `dur`, `symbol` —
  the chord symbol in effect at the event's onset, which its
  `namedVsPlayed` is scored against — `bass`, `voicing`, `comp`,
  `melody`, `total`, `byInterval`, `namedVsPlayed`, `motion` = step
  from the previous event in the bar), `maxEvent`,
  `predecessor`, and `motionWithin` (`{ total, steps }`). The
  existing per-bar fields stay for current consumers: `comp`,
  `melody`, `total`, `byInterval` are the max-tension event's (ties →
  the earlier), `namedVsPlayed` is the first event's (what the page
  shows until 4b), `motion` is the last event of the **performance
  predecessor** → this bar's first event.
- Melody is scored per event by time overlap (`melodyTension` takes
  an optional window); melody sounding while no comp event sounds
  is not scored.
- `voiceMotion` uses the optimal assignment when voice counts differ
  (all pairings tried, ≤ 5 voices): unmatched voices of the larger
  voicing are free (cost 0) and listed in `unmatched` with their
  side; `matched` counts the paired voices. Equal counts = the
  low-to-high pairing as before.
- `selfTest()` 64/64: bar 26 per event (1.333, 2 → max 2; with
  melody 2.0 / 2.0; event 2 named-vs-played against B♭7/F), motion 8 in / 1 within / 1 into bar 27 with the
  free voices named, bar 37's predecessor 28, fixture bar 5's two
  events, rag bar 9 (four dim7 events, 4 each, within 0) and bar 12,
  and a regression that every single-event bar across the three
  pieces keeps its comp total. Re-baselined: with-melody bars 17
  (5.0 → 4.333), 18 (4.0 → 3.667), 26 (3.333 → 2.0) — melody before
  the comp's first onset is no longer charged against it — and the
  fixture's count-mismatch motion (null → 3). 

**In progress:**
- Session 4.5 step 4b — see Next priorities.

**Open / deferred:**
- Session 5 (melody toggle + audio) follows 4.5; Explore mode
  (Session 6); merge to dev with clean-clone check (Session 7).
- Keyboard, detail panel and Tonnetz still show the first comp
  event's bass and voicing while the chart shows the max event's
  stack (bar 26: chart says 2 from the B♭7/F chord, detail lists the
  first chord's rub). Step 4b resolves this with a selected event.
- Melody over a comp rest is unscored even when a `bassLine` note is
  still sounding (bar 25's beat-0 melody over the held G2); scoring
  melody against the bass line's own timing is a later refinement.
- `bassLine` reductions (grace notes dropped, dyads reduced to the
  lower note) are documented, not fixed; revisit if a piece needs
  them.
- Rag staff: sixteenths are unbeamed (beaming is a known polish
  item), so the rag's melody reads busier than the PDF.
- Spike files to delete when ready: `templates/spikes/`,
  `static/spikes/staff/`, the `/voicings/spike-staff` route in the
  `if app.debug:` block of `app.py`.
- Verovio self-hosting under `static/vendor/` deferred: Flask /
  gunicorn serve static files uncompressed (7.3 MB vs 2.1 MB gzip
  from the CDN). The URL is one constant in `voicing-staff.js`.
- Staff polish: keep each comp chord on one staff instead of
  splitting by pitch at `SPLIT_MIDI`; beam melody eighths.
- `/voicings` is not in the nav; not-found state shows the default
  C-major Tonnetz (no key to anchor on).
- Chord-symbol suffix table lives in the engine
  (`SUFFIX_TO_TYPE`); fold into the canonical registry when
  `chord-types.json` lands.

**Public surfaces (debugging):**
- `window.__voicings` on `/voicings`: `{ state, select, chart,
  keyboard, detail, bubble, staff }`.
- Self-tests:
  `node --input-type=module -e "import('./static/shared/voicing-analysis.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-staff-model.js').then(m => m.selfTest())"`
  `python3 tools/voicings/check_export.py`
  `python3 tools/voicings/check_midi.py --fixture tests/fixtures/voicing-maple-leaf-rag.json`
- Regenerate the rag: `python3 tools/voicings/ly_to_src.py --ly tests/fixtures/maple-leaf-rag.ly --out tests/fixtures/maple-leaf-rag.src.py && python3 tools/voicings/export_json.py --src tests/fixtures/maple-leaf-rag.src.py --out tests/fixtures/voicing-maple-leaf-rag.json`

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
- `voicing-analysis.js` — voiced-progression analysis engine (pure; see Voicing Explorer — Analyze view). `voicing-chart.js`, `voicing-keyboard.js`, `voicing-detail.js` — page-owned views for `/voicings`; the keyboard is deliberately independent of `keyboard-view.js` (exact-octave role coloring without a do-not-touch lift)
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
- **Port 5000 unavailable on the Mac mini** — macOS AirPlay Receiver (Control Center) listens on 5000 and answers 403. `.env` sets `PORT=5001`; `app.py` reads it. Scripts or prompts that assume 5000 will hit AirPlay, not Flask.
- **Global SVG `max-width` rule** squashes wide inline SVGs on narrow screens; `voicing-chart.js` pins its width inline. Any future scrollable SVG panel needs the same.
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
| `docs/active-plans/voicing-explorer-build-plan.md` | **Voicing Explorer analysis arc** — 7-session plan, Decisions, open questions |
| `tools/voicings/schema.md` | Voiced-progression JSON schema (v1) consumed by `voicing-analysis.js` |
| `docs/registry-inventory.md` | Chord-type registry audit + canonical JSON spec (§9: voicing-analysis local types) |
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
