# SongLab Project Status

**Last updated:** 2026-11-13
**Branch:** `dev` — all active work. Cycle of Shells merged 2026-10-27;
Voicing Explorer Sessions 1–6.5 merged `df0e2fc`; Learn Phase 0 + Phase 1
topics merged via `learn-topics`; Cantor v1; MIDI multi-port fix `57afaa9`.
Other branches: `archive/cantor` (presentational arc, archived
2026-11-03; Session 2 unfinished since 2026-05-19) ·
`archive/chord-melody-research` (origin only; classifier arc paused
2026-05-13, archived 2026-11-03; RADAR's docs live there) ·
`archive/cantor-presentational-spike` (origin only; validated spike,
known-good reference) · `main` (stale — last commit `0d9efe4`
2026-04-12, ~138 behind dev; fast-forward or retire before any deploy) ·
`cycle-of-shells` (merged; delete).
**Deploy:** none. The Railway project was deleted in Oct 2026. Development
is local on the Mac mini; a deploy will be set up fresh later (hardening
list: `docs/AUDIT-2026-10-27.md` §3 "Before any public deploy").
**Local run:** `python3 app.py` with the venv active, port from `.env`
(`PORT=5001` on the Mac mini — AirPlay Receiver holds 5000). Machine setup:
`docs/DEV_SETUP.md` (local-only, not committed).
**Active roadmap:** SongLab Roadmap, Nov 2026–Jan 2027 ([Claude doc](https://claude.ai/artifact/DHHd1R3qux19CPWyX7fPaA),
working copy · [Google Doc](https://docs.google.com/document/d/1hSHjvxwwdnaob214H_i3YD881rywSCIJAUuO6V8uUo0/edit), snapshot) — one active thread at a
time, chunks of 2–3 hours; see "Roadmap" below for the short form ·
`docs/active-plans/voicing-explorer-build-plan.md` ·
`docs/active-plans/instructional-content.md` ·
`docs/active-plans/explainer-content.md` · `sources/SOURCES.md` (pieces).
`docs/songlab-build-plan.md` (v4, April) is the historical phase plan, no
longer the roadmap. `docs/active-plans/cantor-presentational-build-plan.md`
is parked with Cantor.
**Platform name:** SongLab · SkratchLab (rebrand complete)


## Current state (2026-10-30)

Full audit: `docs/AUDIT-2026-10-27.md`. This section is the short form.

### Voicing Explorer — `/voicings` (active)
Analyze + Explore are on dev (Sessions 1–6.5, merged `df0e2fc`
2026-10-19): per-bar and per-event interval tension, rubs, named-vs-played
chord tones, upper-voice motion; an engraved grand staff (Verovio); Tone.js
playback on a vendored Salamander piano with a melody toggle; an Explore
panel that ranks candidate voicings and keeps/reverts them over a
non-destructive override layer; a piece picker (`/voicings/pieces`
auto-discovers `tests/fixtures/voicing-*.json`; Maple Leaf Rag A strain is
the public fixture, Don't Be Sad is private and gitignored). Well tested
(engine self-tests, headless Chrome). The audit's six labelling/text
bugs and the `-`/`+` parsing and missing chord types were fixed
2026-10-28 (`5cb0e03`, `5b030dd`, `8321743`, `94a6bc8`; Levine T1–T6).
Plan: `docs/active-plans/voicing-explorer-build-plan.md`.
Schema: `tools/voicings/schema.md`. Detail below under "What's Working".

### Learn — `/learn` (active, Phase 0–1)
Explainer registry `static/shared/voicing-explainer-content.js`: 25 topics
(14 claude-draft tool topics, 3 verified theory topics — chord tones and
roles, tritone, guide tones and shells — and 8 stubs). Phase 0 example
blocks and Phase 1 topics are merged. `/learn` is not in the site nav yet;
every Theory card links to at least one stub. Next: write `extensions`
(most-linked stub), then `omitting-tones`. Open decision: three content
systems (this registry, `theory-content.js`, the /intro chapter JS) don't
know about each other. Plans: `docs/active-plans/instructional-content.md`,
`docs/active-plans/explainer-content.md`.

### Cycle of Shells — `/games/cycle-of-shells` (merged 2026-10-27)
ii–V–I shell voicings round the cycle of fourths, checked chord by chord
from MIDI or the on-screen keyboard; stages 1–4 with a pure core
(`cycle-of-shells-core.js`), MIDI wrapper, results log, guided hints,
follow-up questions, lap summary, deep links. Listed in the Games menu and
landing grid; linked from the guide-tones topic and the ii_V_I walkthrough
(`concept_specifics` landed `4316f8a`). Stage 4 follow-ups live in RADAR
(keyboard access for clickable keys, MIDI hot-plug, site-wide device
default, sharp labels on held notes, double accidentals on held
non-chord tones). It is the third hand-rolled game loop; `game-flow.js`
extraction is deferred to the consolidation phase.

### Follow-along player — `/player` (new 2026-10-30, guided-practice track)
Wait-for-me practice of a recorded piece on the RD-2000: one bar at a
time on a grand staff (Verovio, hand-based staves), MIDI in, notes blue /
green / red, a chord counts once every note has been attacked since the
step began (any order), LH / RH / Both, paging, on-screen keyboard, optional
sound echo (off by default). Milestone 1 checked in Chrome with the
RD-2000. Pieces come from `tools/pieces/midi_to_norm.py` (new, stdlib SMF
reader) over a Logic recording; the first is Carol of the Bells (Winston,
lines 1–2, 16 bars, G minor, 3/4), private and gitignored under
`static/private/pieces/`. Routes `/player`, `/player/pieces`,
`/player/data/<name>`; code in `static/player/`. Since then (2026-11-02/03):
4-bar line view with meter-aware beaming (`meter-rules.js`), and the loop
chunk — 1a loops (Repeat bar / line, tap-to-select, move on after N clean
passes), 1b trouble spots ("Loop these" from the second pass) with
per-hand loop counts, 1c "No stress" mode (forgiving follower: wrong
notes never block, aren't shown or counted), and 2a Listen (▶ Listen /
Space plays the loop or the drawn line, both hands, at a tempo slider's
percentage of the piece's tempo; notes light purple as they sound, the
staff pages with the playback, the follower is untouched; checked in
Chrome, 2a.1 fixes from that check landed). 2026-11-05: 2a.2 control
rack (`456bb8e`: Practice / Listen / Hands / Mode / MIDI / Piece cards,
piece title as h1 with a SONG picker, shared 1400 px width, nav / status
strip, Start over always visible, Clear loop, mute mirroring AudioToggle,
Piece card with a derived Italian tempo marking) and 2b metronome +
count-in (`metronome.js`: click on the Listen card's bottom row with a
volume slider and a 0 / 1 / 2-bar count-in, on Tone's context clock, not
the Transport, anchored to Listen's start so the downbeat and the first
note share one audio time). 2026-11-12 (`244dd33`): the RD-2000 check
passed (Hands, No stress, MIDI card, Sound for my notes, playing with
the metronome); it turned up and fixed MIDI hot-plug and a device
appearing after a load with zero inputs (root cause in the shared
`midi-input.js` init; Cycle of Shells benefits too) and the audio wake
(any gesture or the first MIDI note); and the rack became collapsible
behind a 58 px summary strip, auto-collapsing on the first note or
Listen ("Hide controls while playing", default on). 2026-11-13 (player 3,
`ea74c81`, tested on the RD-2000): a shared beat clock (`beat-clock.js`)
now drives Listen, play-along, the metronome and the page turns, with
live tempo; Listen repeats a loop or plays to the end of the piece;
play-along mode ("♪ Play along" / P) with a soft guide (default 35),
green / faint feedback and a quiet timing log; pause / resume on Space
and P; sustain pedal (CC64) for "Sound for my notes"; and
`window.songlabPlayer` + an event bus, **the hook for the future scoring
and the coach**. The timing-drift question is closed: the clock mapping
is right; the slide was the player rushing at 60 bpm. Detail below under
"What's Working".

### Public pieces pipeline — `tools/pieces/`, `sources/` (active, timeboxed)
Seven public-domain scans are listed in `sources/SOURCES.md` (PDFs
gitignored). Toolchain: `mxl_to_norm`, `diff_reads`, `collect_third`,
`review_page` (3-way vote, Verovio render, pitch self-check), and since
2026-10-30 `midi_to_norm` (MIDI recording → norm; optional `tempo`,
`title`, `clefs` fields documented in `tools/pieces/README.md`). I Got
Rhythm is mid-review. Missing: a `norm_to_voicing.py` converter to the `/voicings`
piece format (biggest gap); `review_page.py` is hard-wired to I Got
Rhythm; no tracked record of where the IGR review stopped; schema needs a
reduction rule for song-sheet piano parts. Proposed order: I Got Rhythm →
Embraceable You → But Not for Me → Body and Soul. See audit §2.

### Platform (stable)
Explorer (Tonnetz / Chord Wheel / Fretboard / Spectrum / Resonance, MIDI
and audio-interface input) is mature and central. 18 guided walkthroughs,
84 song examples, four theory pages, Fundamentals with six chapters
(chapter 6 is a stub). Games in the nav: Harmony Trainer, Chord Spotter,
Melody Match, Swing Trainer, Rhythm Lab, Strum Patterns, Scale Builder,
Cycle of Shells, Chord Walks, Polyrhythm Trainer. Harmony Trainer still
uses server-side pitch detection; Rhythm Lab and Strum Patterns have mic
input disabled. Duplication to consolidate later: three keyboards, three
to four pill/tooltip systems, chord-type registries in three places,
torus math in two (audit §3).

### Parked
- **Cantor** — v1 is on dev at `/cantor`; the presentational rewrite was
  archived 2026-11-03 as `archive/cantor` (Session 2 unfinished since
  2026-05-19). Optional holiday play with Christmas songs. Specs:
  `docs/cantor-design.md`, `docs/cantor-presentational-design.md`,
  `docs/active-plans/cantor-presentational-build-plan.md`. May 2026 state
  preserved verbatim under "History" at the end of this file.
- **SkratchLab** — MVP, dormant since April. "Clear All" doesn't reset the
  canvas (open).
- **Harmonograph** — `/harmonograph` sandbox at Stage 2, frozen since
  April, unlinked from the nav by design.
- **Cycle of Shells merge** — parked (2026-11-13) behind the kids' track.
- **Pi noodle catcher** — parked until the Pi arrives (expected the week
  of 2026-11-16).
- **Chord-melody classifier** — `archive/chord-melody-research` branch, paused
  2026-05-13 in favour of the presentational Cantor. RADAR items point to
  docs that exist only on that branch.

### Roadmap (Nov 2026 – Jan 2027, short form)
Full version: [Claude doc](https://claude.ai/artifact/DHHd1R3qux19CPWyX7fPaA) · [Google Doc](https://docs.google.com/document/d/1hSHjvxwwdnaob214H_i3YD881rywSCIJAUuO6V8uUo0/edit).
- **Thread A — kids' practice track (active until 2026-12-14 freeze):**
  player loop (1a loops, 1b trouble spots + per-hand counts, 1c No
  stress), 2a Listen + tempo slider (+ 2a.1 fixes) — done 2026-11-03 —
  and 2a.2 control rack + 2b metronome + count-in — done 2026-11-05 —
  and the RD-2000 check of the rack + metronome (+ hot-plug / audio-wake
  fixes, collapsible rack) — done 2026-11-12 — and player 3 (shared
  beat clock, play-along with guide + timing log, Listen / play past the
  current line, pause / resume, pedal, controller + event bus) — done
  2026-11-13, RD-2000 tested (`ea74c81`) → **next:** kids' track content
  (Carol for Edie; Feel Good Inc. / Run Rudolph Run for Weston; the
  RD-2000 recording session also covers Carol lines 3–4 and Linus and
  Lucy) → warm-up screen → practice log (JSON on the mini, written by
  Flask; `practiceEvent` funnel + `state.practice.playedMs` already in
  `player.js`) → learner picker → Linus and Lucy rhythm drill → drill
  reward. A timing coach now has its first real finding to build on
  (rushing at 60 bpm, read off the play-along timing log).
- **Thread B — jazz harmony (from 2026-12-14):** `norm_to_voicing.py` →
  I Got Rhythm public piece → voicing rush (timed Cycle of Shells) →
  `extensions` + `/learn` in the nav → `omitting-tones` → concept-map
  design note.
- **Thread C — ML (Wednesdays):** `ml/` + `ml/LEARNING_LOG.md`, following
  the SongLab ML Syllabus (Karpathy's Zero to Hero + a music exercise).
- Housekeeping done 2026-11-03: stale defects removed, Cantor and
  chord-melody-research archived, `archive/skratch-integration` deleted.

---

## Current Focus

**Guided-practice track — follow-along MIDI player (2026-10-30, `dev`)**
is the newest workstream. The first piece (Carol of the Bells, Winston,
lines 1–2) was recorded in Logic from the RD-2000 and turned into norm
by the new `tools/pieces/midi_to_norm.py`; `/player` plays it back in
wait-for-me mode with the staff, keyboard and follower pieces under
`static/player/`. Milestone 1 is done and checked with the RD-2000. The
loop chunk landed 2026-11-03 (1a loops, 1b trouble spots + per-hand loop
counts, 1c "No stress" mode; 1b and 1c need an RD-2000 check and the
trouble thresholds tuning from the `console.table` rows), then 2a Listen
+ tempo slider the same day, checked in Chrome, with the 2a.1 fixes from
that check (echo on its own sampler at Tone.immediate(), purple playing
colour, pending tap kept across paging, slider 25–200 %, Listen plays the
drawn line). 2026-11-05: 2a.2 control rack (`456bb8e`) and 2b
metronome + count-in (`metronome.js`), both checked in Chrome by ear
and mouse. 2026-11-12 (`244dd33`): the RD-2000 check passed (Hands, No
stress, MIDI card, Sound for my notes, playing with the click), with
fixes for MIDI hot-plug and a device appearing after a load with zero
inputs, audio wake on any gesture / first MIDI note, and the collapsible
rack with its summary strip. 2026-11-13 (`ea74c81`, tested on the
RD-2000): player 3 — the shared beat clock under Listen and play-along
(live tempo, loops repeat, play to the end), play-along with a soft
guide, green / faint feedback and the quiet timing log, the event bus +
`window.songlabPlayer` controller (the hook for scoring and the coach),
sustain pedal, pause / resume on Space / P. Next, in order: kids' track
content (Carol for Edie; Feel Good Inc. / Run Rudolph Run for Weston),
the warm-up screen, and the practice log (`createResultLog` with key
`songlab_results_player`, hanging off `practiceEvent` in `player.js`).
Parked: the Cycle of Shells merge and the Pi noodle catcher (the Pi
arrives the week of 2026-11-16). Current state block below.

**Voicing Explorer analysis arc (2026-10-14, branch `voicing-explorer`)**
was the active workstream before that. Motivated by a voiced practice score of
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
counts), and step 4b (the page: a selected comp event within the
selected bar, defaulting to the max-tension event; event chips;
chip / staff-note / Shift+arrow selection; detail, keyboard, Tonnetz
and the staff's bright notes all read from that event). Session 5
(2026-10-16) added playback and the melody toggle: a pure playback
model (bar or event scope, one-beat lead-in from sounding voices,
rolls), a Tone.js player on a vendored Salamander piano, Play /
Shift+Play / Stop with `P` / `Shift+P` / `Esc`, a melody toggle
(default off, couples analysis and playback, `&melody=1`), and
follow highlighting on the staff and a per-piece-sized keyboard.
Session 6 (2026-10-16) landed the first Explore slice: for the
selected event, candidate voicings from the chord symbol (named
tones + 9th, dominants also 13 / ♯11) and from shapes harvested
from the piece as degree labels, constrained below the melody and
within a span, scored with the engine's own functions and ranked by
distance from a tension target then motion in + out; an Explore
panel with preview in every panel, per-row audition through the
player, Keep / Revert / Reset / Copy JSON over a non-destructive
override layer with tie propagation; kept bars outlined green. First
listening on bar 21 recorded in SESSION_LOG. Session 6.5 (explainer
layer, Theory card, dominant rule, piece picker, rag fixes) landed
2026-10-19 and the branch merged to dev (`df0e2fc`). Next:
Instructional content. Phase 0 (example blocks) landed 2026-10-20 on
`learn-examples` in three build-then-STOP parts: A, the pure layer
(`[[example <id>]]` block syntax through a `renderBlock` hook in
mini-markdown, the `learn-example.js` registry with degrees derived
by the engine, related / strict piece links); B, the page
(`learn-example-view.js`: keyboard + degree line + staff + ▶ per
block, one shared player, staff on viewport entry, piano on first ▶,
`VoicingKeyboard` height / ariaLabel options); C, /voicings deep
links (`voicing-url.js`: `?piece=&bar=&event=` with a 1-based event,
selection mirrored back with `replaceState`). Next: Phase 1 theory
stubs in dependency order (`docs/active-plans/instructional-content.md`).
Plan: `docs/active-plans/voicing-explorer-build-plan.md`. Schema:
`tools/voicings/schema.md`.

Dev environment (since 2026-10-14): development runs on the Mac
mini (venv Python 3.12, Node 26.12, port 5001 via `.env`); the old
clone is set aside. Local-only branches were pushed as
`archive/cantor-presentational-spike` and
`archive/skratch-integration`. Also on 2026-10-14: the MIDI
multi-port auto-attach fix landed on dev (`57afaa9`) and the Cantor
≤ C4 MIDI regression was resolved (see the Cantor block).

The previous active workstream on `dev` is **Cantor v1**. Through April 27–28, prompts 1–6B landed and are verified end-to-end on dev: 3D torus surface, per-frame rotY drift + torusMajorR breathing, chord-detection Hardware-state gating, and constellation snap to wash vertices. A deterministic test-track generator (`tests/generate_cantor_test_track.py`) and section-by-section diagnostic doc were also landed for ongoing audio-pipeline validation.

Cantor surfaced a foundational limitation in `chord-detection.js`: chroma-template matching cannot distinguish a single sustained note's overtone series from a real chord, producing false-positive chord washes on solo melody. The initial response was to fork off a new branch `audio-onset-analysis` that was subsequently renamed as `chord-melody-research` and rebuild on onset-driven chord/melody classification. That arc ran through 2026-05-13, when the framing was reconsidered: the deeper question was whether Cantor needs to *classify* at all, or whether a *presentational* view (lit triangles + glyphs, no classification step) better serves the philosophy. A one-hour spike on `cantor-presentational-spike` answered that question affirmatively — the presentational approach reads cleanly with real music and removes the classification problem at the root rather than solving it. The classifier arc is paused; presentational is the new Phase 2 path forward. See `docs/cantor-presentational-design.md` for the design and `docs/active-plans/cantor-presentational-build-plan.md` for the 5-session build plan.

Harmonograph (`/harmonograph`, formerly `/art`) is parked on dev at Stage 2: audio-reactive Y-spin and centripetal morph are wired and validated end-to-end against a deterministic test track (`tests/harmonograph-test-track.wav`), with seven audio-pipeline bugs fixed in the same April 24 session. Real-music tuning ("Montreal") and Stage 1.5 multi-torus stacking are deferred while Cantor takes focus.

Approaching Cantor v1 user-testing readiness once the presentational arc lands on dev.


**Next priorities:** see "Roadmap" under Current state above.

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
- **Branch hygiene:** done 2026-10-16 — tag `pre-rebase-backup`
  removed; `feature/skratch-integration` archived as
  `archive/skratch-integration`; `redesign/landing-page` gone.
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

### Voicing Explorer — Analyze + Explore — current state (updated 2026-10-19)

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
  sized per piece, bass gold / voicing blue / melody green),
  `voicing-detail.js`. Shared `TonnetzNeighborhood` +
  `ChordBubbleRenderer` mounted; selection published as
  `source:'user'` notes — no `progressionState`, no auto-play.
- Verified in headless Chrome: bar 2 / 17 / 1 acceptance values on
  screen, keyboard roles, glow worm updates, `?piece=fixture`,
  `?piece=nope` not-found state, phone-width scroll.

**Landed on `voicing-explorer` (Session 4, 2026-10-15, `f28943c`):**
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

**Landed on `voicing-explorer` (Session 4.5 steps 1–2, 2026-10-15, `71d1d16`):**
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

**Landed on `voicing-explorer` (Session 4.5 step 3, 2026-10-15, `bea4ad6`):**
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

**Landed on `voicing-explorer` (Session 4.5 step 4a, 2026-10-15, `b0b8e80`):**
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

**Landed on `voicing-explorer` (Session 4.5 step 4b, 2026-10-15, `f354e4b`):**
- `/voicings` has a selected comp event within the selected bar
  (`state.selectedEvent`, default the bar's `maxEvent`, so every
  panel agrees with the chart's stack on arrival). Selection: event
  chips in the Selected bar panel (one per group of consecutive
  identical events, e.g. "Bdim7 ×4", showing beat, symbol, tension),
  a click on a comp note of another event on the staff, or
  Shift+←/→ while the chart has focus (steps events, crossing into
  the neighbouring bar; plain ←/→ still steps bars).
- Detail (`voicing-detail.js`, `render(bar, eventIndex)`), keyboard,
  Tonnetz and the staff's bright notes read from the selected event:
  its symbol, bass, voicing, tension, rubs (comp, plus melody rubs
  when the analysis carries them), named-vs-played, and motion —
  "into" from the performance predecessor for the first event, the
  within-bar "step" for later ones, with free voices listed by their
  written names (the engine now puts `name` on `unmatched`). The
  staff dims the comp notes of the other events
  (`VoicingStaff.setEvent`, `vs-note--dim`); bassLine and melody
  notes stay bright. The per-bar `namedVsPlayed` field is no longer
  read by the page.
- Verified in headless Chrome at 1400 / 390 px: private bars 25–27
  and rag bars 9, 12, 16; chip click, staff-note click, Shift+→
  across the 26→27 and 9→10 bar boundaries and back; console clean.

**Landed on `voicing-explorer` (Session 5, 2026-10-16, `9b548f2` … `26be03c`):**
- Playback: `static/shared/voicing-playback-model.js` (pure —
  `buildPlaybackList` bar / event scope, lead-in from sounding voices
  capped at one beat, tie tails not re-attacked, rolls at
  `ARP_STEP_MS` 35 ms with spread ≤ 1/3 event, per-notehead `pieces`;
  `toSchedule` → seconds; `selfTest()` 89/89) and
  `static/shared/voicing-player.js` (lazy Tone 14.8.49 + lazy
  Salamander from `static/vendor/salamander/`, `Tone.Part` on the
  Transport, `Tone.Draw` callbacks, mute respected, `blocked` state
  when the gesture expired). Page: Play (bar) / Shift+Play (event) /
  Stop, `P` / `Shift+P` / `Esc`; selection or toggle change stops; no
  auto-play.
- Melody toggle (default off, `&melody=1`): off removes melody from the
  analysis and mutes it in playback; on scores it by overlap per event
  and lights it green on the keyboard. The staff always draws it; the
  Tonnetz is comp-only either way. Melody on changes totals in 21/44
  private and 4/17 rag bars, `maxEvent` only in private bar 26.
- Follow: staff `setPlaying(ids)` and keyboard `setPlaying(sounding)`
  show all sounding notes (tied noteheads piece by piece; carried
  notes from beat 0, nothing before it); restored on end / Stop.
  Keyboard range per piece (extreme notes rounded to C..B; private
  C2–B5, rag C1–B6).
- `static/vendor/salamander/`: 29 mp3s, 2.0 MB, Tonejs/audio @
  `869b6f8d9cdd`, CC BY 3.0 Alexander Holm (README quotes the
  license; jsDelivr refuses the 229 MB repo).

**Landed on `voicing-explorer` (Session 6, 2026-10-16, `ad44437`, `7ccd8fb`, `ea7d7ff`):**
- Explore core: `static/shared/voicing-explore.js` (pure — writes
  `comp[i].voicing` only, never bass / bassLine / melody).
  `generateCandidates` from the symbol (named tones + 9th; dominants
  also 13 / ♯11; voice count original ±1 within 2–4; every note in
  [bass + 2, lowest melody note in the event − 1], ceiling =
  `pieceCeiling` when no melody sounds; span ≤ 12; no doubled pc; no
  unison with the melody; onset fallback when the melody dips) and
  from `harvestShapes` (degree labels via `namedVsPlayed`, R/3/5/7
  take the target's version, 9/11/13 keep their accidental, unsupplied
  degrees skip with a reason; exempt from the pool, not from the
  melody rule / window / span; library per piece — private 19, rag 7;
  the three named shapes). `scoreCandidate` reuses the engine;
  `rankCandidates`: target distance (0.5 buckets), motion in + out to
  the nearest voiced events (`voicedNeighbours`), fewer omissions.
  `applyOverrides` non-mutating, source `user`, tie propagation.
  `selfTest()` 76/76. Engine: `barNeighbours` exported (64/64
  unchanged).
- Page: Explore panel (target − / +, voices, source filter, ranked
  table of 12 with ● original / ◆ kept, per-row ▶ event / Shift bar,
  Keep / Revert bar / Reset all / Copy JSON); preview re-renders
  detail, staff, keyboard and Tonnetz from a trial progression without
  changing the selection (tag `preview`; `user` after Keep); every
  consumer reads `state.effective`; keys `[` `]` `K` `-` `=`. Chart:
  `vc-bar--user` green outline + legend. No persistence this session.
- Playback amendment: event scope starts at the bass's real onset when
  it was struck earlier in the same bar (bar 21); a rolled downbeat
  bass no longer leads the roll in event scope. `selfTest()` 95/95.
- Listening, bar 21: see SESSION_LOG 2026-10-16 Session 6; tuning
  hypotheses in RADAR.

**Landed on `voicing-explorer` (Session 6.5 + extras, 2026-10-17 → 19, `db3d6b5` … `47d8b24` and P6):**
- Explainer layer: `voicing-explainer-content.js` (25 topics, claude-draft
  or stub, constants interpolated), `mini-markdown.js`, `info-pill.js`
  (one ⓘ per /voicings panel), `/learn` + `/learn/<slug>`, `learn.css`.
- `voicing-describe.js` — `describeVoicing(event, context)` → sections
  (shape via `SHAPE_CATALOGUE`, guide tones, colour tones with rubs and
  unusual-label heuristics, omissions, motion vs the voiced neighbour,
  why-ranked via `rankKey`); inferred basses worded "the lowest note".
- Theory card on /voicings beside the Explore table (sticky, scrolls
  inside, stacks under 1200px); page max-width 1800; keyboard scales to
  its panel (`voicing-keyboard.js` ResizeObserver).
- Dominant rule in `generateCandidates` (`DOMINANT_RULE`: every
  candidate keeps the ♭7, ♯11 also needs the 3rd; bass counts; original
  exempt; `removed[]` with reasons shown in the hint and card).
- Piece picker: `/voicings/pieces` (private then public, from disk) and
  a header `<select>`; deep links unchanged; text-box fallback.
- Rag: `SYMBOLS` corrected (slash only when the lowest sounding note is
  not the root; Bdim7 unslashed); provenance comment and header note
  ("symbols added by analysis", from `chordSymbols: "derived"`); source
  credit in the header meta from `attribution`.
- Exporter: `comp[].bassSource` (`voice` / `carried` / `inferred`);
  Selected bar tags an inferred bass. check_export 25/25, check_midi 0.
- Nav: "Voicings" after Explorer in `base.html` and `explorer.html`;
  Salamander CC BY 3.0 credit in the base footer, the explorer status
  bar and the playback topic.
- Suites: analysis 64, staff 70, playback 95, explore 89, mini-markdown
  28, content 34, describe 61. Verified in headless Chrome at 2560 /
  1440 / 1100 / 390.

**Landed on `learn-examples` (Instructional content Phase 0, 2026-10-20, parts A–C, merge pending):**
- Example blocks for /learn pages. Syntax: a body block that is only
  `[[example <id>]]` on one line (inline use stays literal text).
  `mini-markdown.js` gained an optional `renderBlock(block, opts)` hook
  tried before the built-in dispatch (null falls through; 28 → 33
  tests, no output change without a hook).
- `static/shared/learn-example.js` (pure, 34/34): `EXAMPLES` registry
  authored as symbol + bass + either a spelled voicing or a shape
  (`applyShape`); `resolveExample(id)` derives display, per-note
  degrees (`namedVsPlayed`), `shapeKey`, and a synthetic one-bar
  progression (key C, 4/4, whole-bar chord, `bassLine` carrying the
  bass so a roll leads from it) that `buildBarModel` and
  `buildPlaybackList` take unchanged. `exampleBlockHook` → placeholder
  `<div class="learn-example" data-example>`; unknown ids render a
  visible notice. Piece links: `related` (bar + 1-based event must
  exist) or `strict` (`matches: true`: fixture event's bass + voicing
  must equal the example's notes AND its `bassSource` must be `voice`
  or `carried`, never `inferred`); `bassSource` authored on the link
  and checked against the fixture; `PUBLIC_PIECES` allowlist
  (maple-leaf-rag, fixture) with fixtures on disk. Four seed examples
  (C7 shells both ways, a shape-built rootless voicing with the 3rd on
  the bottom, an E♭7 shell
  linked related to rag 16.2 — no rag E♭7 with a real bass is a
  shell, bars 2/4 have the 5th in the bass). Two examples placed in
  `guide-tones-and-shells`.
- `static/shared/learn-example-view.js` (DOM): `mountExamples(root)`
  after `body.innerHTML` on `templates/learn/topic.html`; each block =
  label, `VoicingKeyboard` (C at/below the bass to B at/above the top,
  ≥ 2 octaves, 84 px, scrolls inside the card on narrow screens and is
  pre-scrolled to centre the voicing), degree line, `VoicingStaff`,
  ▶, link line ("This exact voicing: …" / "Related: …, bar N",
  "(bass inferred)"). One shared `VoicingPlayer` per page
  (`Tone.Transport` is global): ▶ on another block stops the current
  one and returns its button to idle. Lazy: staff renders when the
  block comes within 200 px of the viewport (Verovio loads then);
  Tone + Salamander load on the first ▶. Keyboard and staff follow
  playback (same bar model ⇒ same notehead ids). Styles in
  `learn.css` (light-theme card, tokens, 360 px: no page overflow).
- `voicing-keyboard.js`: additive `height` and `ariaLabel` constructor
  options; defaults unchanged, /voicings untouched.
- `/voicings` deep links: `static/shared/voicing-url.js` (20/20) —
  `parseVoicingsParams(search)` → `{ piece, melody, bar, event }`
  (positive integers or null), `resolveRequestedSelection(analysis,
  { bar, event })` → `{ bar, eventIndex }` | null (event − 1 clamped;
  null bar / missing bar / no comp events → null), `voicingsUrl()`.
  Page: one-shot request consumed by `load()` (only for the piece it
  named; silent fallback to the first comp bar), `select()` mirrors
  `bar` + 1-based `event` with `replaceState`, `switchPiece` drops
  them, `setIncludeMelody` keeps them, `renderEmpty` clears them.
- Suites: analysis 64, staff 70, playback 95, explore 89,
  mini-markdown 33, content 41, describe 61, learn-example 34,
  voicing-url 20; check_export 25/25, check_midi 0 mismatches.
  Verified in headless Chrome over CDP (desktop + 360 px; playback
  flow, take-over, deep links and fallbacks).

**In progress:**
- Phase 0 browser check by Dustin, then merge `learn-examples` to
  `dev`. ~~Session 7 merge of `voicing-explorer`~~ landed 2026-10-19
  (`df0e2fc`).

**Open / deferred:**
- Public pieces track (RADAR): I Got Rhythm, Body and Soul, Georgia on
  My Mind (1930; US public domain since 2026-01-01). Needs original
  1930 sheet-music scans as sources; melody + chords added by
  analysis; comping constructed, recorded in a new provenance field
  `voicingSource: "constructed"`. US-only status: Carmichael and Green
  are not PD under life + 70. Just Friends (1931) becomes eligible
  2027-01-01.
- `/voicings` passes the raw `?piece=` name to `load()` unvalidated
  (so an unknown name keeps its "No data" banner); the server regex
  guards the route. Pairs with the private-data item below — resolve
  both before any shared deploy (RADAR).
- /learn example blocks: Verovio can load at page load on a tall
  window (the staff's 200 px IntersectionObserver margin reaches the
  first block); render on first ▶ instead if that matters (RADAR).
- Explore tuning still open: register factor by degree; 0.5 ranking
  buckets create cliffs; piece ceiling self-limiting (RADAR). The
  dominant rule's "needs the ♭7" was decided by ear on one bar —
  revisit with more examples (RADAR).
- Private piece data under `static/private/` is directly fetchable
  via Flask's static route; move to a non-static folder before any
  shared deploy (RADAR).
- Rag bars 16–17: the real bass dyad on beat 1.5 goes to `bassLine`
  only; Explore never voices against it (RADAR).
- Tonnetz and staff do not scale to their panels on wide screens;
  tablet layout untuned (RADAR). 390px: the Explore column scrolls
  sideways for the right-hand table columns.
- Explore overrides are not persisted (Revert / Reset / Copy JSON
  only); the melody rule is a piano-solo heuristic (RADAR); the piece
  ceiling is self-limiting in melody-less events (RADAR).
- Melody over a comp rest is unscored even when a `bassLine` note is
  still sounding (bar 25's beat-0 melody over the held G2). Checked
  2026-10-16: scoring it would move no number in either piece (all
  such pairs are non-weighted classes). Engine change with
  re-baselining. Promoted 2026-10-16 (Habanera needs it; see RADAR).
- `bassLine` reductions (grace notes dropped, dyads reduced to the
  lower note) are documented, not fixed; revisit if a piece needs
  them.
- Rag staff: sixteenths are unbeamed (beaming is a known polish
  item), so the rag's melody reads busier than the PDF.
- Verovio self-hosting under `static/vendor/` deferred: the 7.3 MB
  module would be served uncompressed (2.1 MB gzip from the CDN).
  Salamander is vendored because mp3 is already compressed. The
  Verovio URL is one constant in `voicing-staff.js`.
- Staff polish: keep each comp chord on one staff instead of
  splitting by pitch at `SPLIT_MIDI`; beam melody eighths.
- Not-found state shows the default C-major Tonnetz (no key to anchor
  on).
- Chord-symbol suffix table lives in the engine
  (`SUFFIX_TO_TYPE`); fold into the canonical registry when
  `chord-types.json` lands.
- Salamander: three other URL maps (audio-bridge, keyboard-view,
  intro-audio) still point at the unpinned GitHub Pages copy (RADAR).

**Public surfaces (debugging):**
- `window.__voicings` on `/voicings`: `{ state, select, selectEvent,
  stepEvent, chart, keyboard, detail, bubble, staff, player,
  playSelected, setIncludeMelody, explore }`; `select(bar, eventIndex?)`,
  `playSelected('bar' | 'event')`, `state.includeMelody`,
  `state.overrides` / `state.effective` / `state.preview`;
  `explore: { compute, rows, preview, clear, keep, playRow,
  stepPreview, nudgeTarget, revert, reset, copy, json, setTarget,
  setCountRange, setSourceFilter, trialProgression }`, plus
  `switchPiece(name)` and `pieces()`. `/voicings/pieces` lists what
  `/voicings/data/<name>` can serve. Deep link:
  `/voicings?piece=<name>&bar=<written>&event=<1-based>&melody=1`
  (`voicing-url.js`); the address bar mirrors the selection.
- /learn example blocks: `[[example <id>]]` in a topic body; ids in
  `EXAMPLES` (`learn-example.js`); `resolveExample(id)` in Node shows
  the derived notes / degrees / progression.
- Self-tests:
  `node --input-type=module -e "import('./static/shared/voicing-analysis.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-staff-model.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-playback-model.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-explore.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/mini-markdown.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-explainer-content.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-describe.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/learn-example.js').then(m => m.selfTest())"`
  `node --input-type=module -e "import('./static/shared/voicing-url.js').then(m => m.selfTest())"`
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
- `voicing-analysis.js` — voiced-progression analysis engine (pure; see Voicing Explorer — Analyze + Explore). `voicing-explore.js` — Explore core (candidates, harvested shapes, ranking, overrides; pure). `voicing-playback-model.js` / `voicing-player.js` — playback model and Tone.js player. `voicing-chart.js`, `voicing-keyboard.js`, `voicing-detail.js`, `voicing-staff.js` — page-owned views for `/voicings`; the keyboard is deliberately independent of `keyboard-view.js` (exact-octave role coloring without a do-not-touch lift)
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

### Cycle of Shells — current state (updated 2026-10-22)

**Landed on branch `cycle-of-shells` (verified in Node self-tests and
headless Chrome; not yet merged to dev):**
- `/games/cycle-of-shells`: ii–V–I shell voicings (root in the bass,
  3rd + 7th above, no 5th) round the cycle of fourths, checked chord by
  chord from MIDI (RD-2000 over USB, Launchkey) or the on-screen
  keyboard. Untimed; wrong answers explained by degree.
- Pure core `static/games/cycle-of-shells-core.js` (97/97): the 36
  targets with two-band placement (preferred E♭3–F4, outer C3–G4),
  form-strict / octave-flexible checker with an error taxonomy,
  lift-to-submit detector (150 ms settle, optional pedal-only submit),
  describeMove / phraseRecipe / moveRule lines, noteLabel dual
  spellings ("C♭ (B)"), followUp + checkFollowUp, ResultDetail entries,
  lap summary.
- `cycle-of-shells-input.js` (17/17): MIDIInput wrapper — device
  remembered by name, channel 10 dropped, layered-zone de-dup, CC64 as
  a pedal. `cycle-of-shells-log.js` (7/7): results under
  `songlab_results_cycle_of_shells`, capped 3000.
- Page: bench-size type, C1–C6 keyboard, guided / names / none hints
  (SVG overlay: ghosted origins, arrows, labels in the target's
  spelling), cycle-of-fifths indicator with click-to-jump, resume,
  `?key=&mode=` deep links, follow-up "which note moved?" after each
  phrase, lap summary panel, "Why shells?" link; listed in the Games
  menu and landing grid; linked from the guide-tones topic and the
  ii_V_I walkthrough (pill carries the walkthrough's home key).
- Additive shared changes: VoicingKeyboard `onKeyClick` and
  `minKeyWidth` options; walkthrough-sidebar concept entries may be
  arrays with `homeKeyParam`; EXTERNAL `game-cycle-of-shells`.

**Open / deferred:**
- Merge to dev after Dustin's play-through on the RD-2000.
- game-flow.js extraction (third hand-rolled game) deferred to the
  platform audit; see RADAR.
- Stage 4 follow-ups in RADAR: keyboard access for clickable keys,
  MIDI hot-plug, site-wide device default, sharp labels on held notes,
  ii_V_I walkthrough steps without concept_specifics.

### Follow-along player — current state (updated 2026-11-13)

**Landed and verified on dev (Node self-tests; Milestone 1, Hands, No
stress, the MIDI card and the metronome checked in Chrome with the
RD-2000 on 2026-11-12; the loop chunk 1a checked in Chrome, 1b from
console snippets only):**
- `/player` (`app.py` routes `/player`, `/player/pieces`,
  `/player/data/<name>`; `templates/player.html`): piece picker (private
  pieces from `static/private/pieces/*.norm.json`, public from
  `tests/fixtures/norm-*.json`), MIDI device select remembered under
  `songlab_player_midi_device`, LH / RH / Both, Prev / Next and ← / →
  by line, Shift+← / → by bar, R to restart, status line "Bar N · step k
  / total · wrong: n", Done + Restart at the end.
- Line view (2026-11-02, `b34d924`): 4-bar lines from `norm.lines`, only
  the current bar coloured, slide transition between lines; meter-aware
  beaming and beat-aware splitting in `static/player/meter-rules.js`
  (125/125; shared cases in `tests/fixtures/meter-rules-cases.json`, to
  be mirrored by a `tools/pieces/meter_rules.py` for the review page);
  beats shown by default (`norm.syncopation` field), meter hidden after
  line 1.
- `static/player/player-staff-model.js` (77/77): norm → MEI with staff 1
  = RH, staff 2 = LH (hand-based, not pitch-split), a bar or a bar range,
  ties across bars, per-hand clef changes from the norm's `clefs`;
  `hits` map id → { midi, bar, hand, onset, at, tieStop }.
  `player-staff.js`: PlayerStaff on the shared Verovio toolkit
  (`voicing-staff.js` now exports `loadToolkit`), note states
  `pl-note--expected / --correct / --wrong`, `setDimmed` for the
  unselected hand, bar marker and `setBarTint('loop' | 'pending' |
  'trouble', bars)` (kept across renders, equal height from the line's
  extent; a bar not on the drawn line is a no-op until its line shows),
  `barAt(x, y)` + `onBarTap` for tap-to-select.
- `static/player/player-follow.js` (89/89): `buildSteps` (one step per
  distinct attack onset across the selected hands; tie continuations
  and graces make no step), `attachIds` (cumulative per rendered bar),
  `createFollower(steps, { mode, lookahead })` — strict (wait-for-me: a
  step completes when every expected midi has been attacked since the
  step began, any order; wrong never advances; re-strikes ignored) and
  forgiving (1c "No stress": wrong notes are `stray` and never block; a
  note of one of the next `lookahead` steps after a partial chord, or of
  the next step from nothing pressed, skips to it and the passed-over
  notes are `skippedNotes`; a shared pitch goes to the current step
  first); `setMode`, `jumpTo(bar)`, `reset`.
- Loop for practice (1a, `7c96992`): follower `setLoop(from, to,
  { exitAfter, resume })` / `loop()` — wrap at the last step in range,
  `pass` + `cleanStreak`, `exitAfter` N clean passes clears the loop and
  play continues (`loopExited`); forgiving mode never counts clean and
  ignores `exitAfter`. Page: "Repeat bar" / "Repeat line" toggles, "Move
  on after" select (`songlab_player_loop_exit`, default 3), tap a bar then
  the last bar of the range on the staff (Esc cancels), amber loop tint,
  navigation outside the range turns the loop off, R restarts at the loop
  start. Per-hand pass counts (1b): `createLoopCounts` keeps { pass,
  cleanStreak } for lh / rh / both across the follower rebuild a hands
  change causes; a new range, clearing the loop or R reset all three.
- Trouble spots (1b, `396ba72`; `static/player/player-trouble.js`,
  30/30): one pass at a time is recorded (a full run or one loop pass;
  any other jump cancels it), per step misses and time to complete (the
  first step of a pass and the first after a line change are unmeasured;
  a wrong note expected by the next step is an anticipation, not a
  miss). A bar is flagged when problem steps (≥ 1 miss, or ≥ 3× the
  pass's median step time and ≥ 1 s) are ≥ 34 % of its steps; neighbours
  merge; top 3 ranges; suggestions only from the second pass of the same
  piece / hands / range (history cleared on piece load, kept across R).
  Page: "Trouble spots: bars 6–7 (4 misses) [Loop these]" row + coral
  tint, cleared when a loop starts or the piece changes; "Clean pass!"
  when nothing is flagged; every pass logs its rows with `console.table`
  for threshold tuning. Thresholds are named constants
  (`__player.thresholds`).
- "No stress" mode (1c): checkbox in the controls row
  (`songlab_player_no_stress`, off by default); forgiving follower, no
  red keys / notes / count, Done = "Nice — you played it through!",
  skipped notes stay plain, no trouble recording or row, "Move on after"
  disabled with a hint. Toggling keeps the position. Practice-log hook:
  `practiceEvent(type, detail)` funnel (`load`, `pass`, `mode`;
  console.debug for now) and `state.practice.playedMs` from
  `createPracticeClock` (gaps between notes up to `IDLE_GAP_MS` = 30 s
  count; a longer gap adds nothing), the same in both modes.
- Listen (2a; `static/player/player-listen.js`, new, pure, 19/19):
  `listenSchedule(norm, { from, to, bpm })` → `{ notes, duration, bars }`
  in VoicingPlayer's shape (seconds; both hands always, rh → 'melody',
  lh → 'bass'; each note carries bar / hand / onset / midi and `spans`,
  one per attack or tie continuation, so the page finds its staff ids at
  sound time); a tie continuation extends the note it continues, one at
  the range start sounds as a fresh attack (Listen only; the follower
  still makes no step for it), rests and graces skipped, notes cut at
  the range end; bar length from `meterLevels`. `pieceBpm` (norm.tempo,
  else 90 with a banner), `tempoLabel` ("65% · 53 bpm"). Page: "▶
  Listen" / "■ Stop" + Space (not in inputs), a Listen row under the Loop
  row with the tempo slider 25–200 % step 1 (`songlab_player_tempo_pct`,
  default 100, a stored value clamped; a change applies on the next
  Listen); plays the loop range or the drawn line once on the shared
  `VoicingPlayer` (voicing-player.js unchanged). While playing: `judge()`
  returns at once (MIDI / clicks sound per the usual rules, nothing
  judged, counted, recorded or clocked), the follower's paint is cleared
  and notes light `playing` (purple `#6B4FBB`: `pl-note--playing` on the
  staff, `pl-key--playing` on the keyboard) from a per-render index of
  `staff.hits`; a range across
  lines turns the page on `Tone.Transport.scheduleOnce` 150 ms before
  each line's first bar (`PlayerStaff.render(..., { animate: false })`,
  new option; state.line / state.bar and the follower untouched; sounding
  notes re-lit after the render). Muted (AudioToggle): Listen does not
  start and nothing changes. Stop, the end, a `play()` that does not
  start (banner for blocked / error) and every navigation or state change
  (`stopListen()` first in stepLine / stepBar / restart / setLoop /
  clearLoop / onBarTap / hands / No stress / load) restore the original
  line (no slide) and `paintStates()`. A stop during the first, loading
  `play()` is honoured (stopped as soon as it starts, no page turns).
  Debug: `__player.listen()`, `stopListen()`, `tempo`, `listenPlayer`.
  Checked in Chrome 2026-11-03 (page turns, interruptions, judging gate,
  Space, tempo persistence).
- 2a.1 (from the Chrome check): the MIDI echo and on-screen clicks play
  on the page's own second `Tone.Sampler` (`loadEchoSampler` in
  `player.js`, the same `SALAMANDER_URLS` / `SALAMANDER_BASE` exported by
  voicing-player.js, browser-cached) at `Tone.immediate()`, so live notes
  no longer sound `lookAhead` (100 ms) late, a MIDI release no longer cuts
  a Listen note of the same pitch and Listen's `releaseAll()` no longer
  silences a held echo (Listen's own sampler keeps its scheduled lead).
  A pending tap (first bar of a range) survives Prev / Next and the arrow
  keys so a range can span lines (status says "(on line k)" while the bar
  is off the drawn line); Esc and any other click still cancel.
- Control rack (2a.2, 2026-11-05, `456bb8e`; `player.js`, `player.html`):
  five cards above the staff — Practice (Repeat bar(s) / Repeat line(s),
  Clear loop, Move on after, Start over always visible), Listen (button,
  tempo slider, the 2b row), Hands / Mode (stacked), MIDI (device,
  connected light, mute, Sound for my notes), Piece (Key / Time / Tempo
  with a derived Italian marking from the `TEMPO_MARKINGS` table by
  quarter-note bpm; an optional `tempoMarking` field in piece data
  overrides it, none set yet). The piece title is the h1 with a SONG
  picker in the header; header, rack, nav / status strip, shortcut hints
  (body size), staff and keyboard share one 1400 px width. Esc and the
  Clear loop button share `cancelLoop()`, which now also clears an
  active loop; the rack's mute mirrors the site AudioToggle (one state,
  changed through its button). Checked in Chrome 2026-11-05 (layout and
  wrapping, Start over, Clear loop, mute mirror, shortcuts).
- Metronome + count-in (2b, 2026-11-05; `static/player/metronome.js`,
  new, 26/26 with a fake clock): a lookahead scheduler (25 ms tick, 150 ms
  ahead) on Tone's AudioContext — not `Tone.Transport`, which VoicingPlayer
  stops and cancels — clicking short sines (downbeat 1600 Hz accented, beat
  1000 Hz) on its own `Tone.Gain` into Tone's destination, apart from both
  samplers; beats from `patternFor(time, beatsPerBar)` over `meterLevels`
  (beat level; the bar start accented; 6/8 → two dotted-quarter beats);
  AudioToggle mute skips the sound, not the timing. API: `start(at, bpm,
  meter, { bars })` (an `at` in the past joins at the next beat), `stop({
  countIn })`, `setTempo` (re-spaces from the last click sounding),
  `setVolume(0–100)`, `countIn(bars, bpm, meter, { at })` → bar 1's time;
  no Listen logic inside, for the play-along mode later. Listen hook:
  `VoicingPlayer.play(schedule, { startAt })` (voicing-player.js, the one
  change: a number or `(now) => time` evaluated once loaded, right before
  the Transport starts; result carries `startedAt`; `START_DELAY` exported).
  `listen()` counts in from `Tone.now()`, anchors the click to bar 1 and
  starts the Transport `START_DELAY` earlier, so the downbeat click sits on
  the first note and page turns stay on the Transport. Count-in clicks with
  the metronome off, once per Listen; Stop / Space during it cancels the
  Transport's future start (no note sounds); `finishListen` stops every
  click, queued ones included. The click is fixed with the notes (Listen's
  schedule is seconds at start; the slider applies to the next Listen for
  both). UI: the Listen card's bottom row — Metronome checkbox (off by
  default, `songlab_player_metro_on`; toggling mid-Listen joins / stops at
  once), Volume 0–100 (`songlab_player_metro_volume`, default 70, gain =
  (v/100)² × 0.9, immediate), Count-in 0 / 1 / 2 segmented buttons with
  `aria-pressed` (`songlab_player_count_in`, default 1). Debug:
  `__player.metronome`, `setMetronome`, `setMetroVolume`, `setCountIn`,
  `metro`. Checked in Chrome 2026-11-05 by ear and mouse (count-in, click
  sync with the notes, live toggles, remembered settings, cancel during
  the count-in). By design: the tempo slider applies on the next Listen
  (notes and click are fixed at start) and Listen plays the loop range or
  the current line once. Checked on the RD-2000 2026-11-12 (play-along
  feel with the click).
- Shared beat clock + play-along (player 3, 2026-11-13, `ea74c81`; Node
  self-tests, a stubbed-DOM smoke run, and **tested on the RD-2000**):
  - `static/player/beat-clock.js` (new, pure, 53/53): one clock in beats
    on Tone's AudioContext, lookahead scheduler (25 ms tick, 150 ms
    ahead), not `Tone.Transport`. `start({ fromBar, toBar, loop,
    countInBars, items })`, `stop()`, `setTempo()` (live: re-anchors at
    the scheduling horizon, so everything stays in phase and nothing is
    re-timed; heard ≤ 150 ms later), `seek(bar)`, `positionAt()`. Events
    `beat`, `bar`, `countInStart` / `End`, `loopWrap`, `item`, `ended`,
    each `{ bar, beat, audioTime, pass }` (`beat` = quarters into the bar),
    delivered twice: `on()` ahead of time for scheduling sound, `onDue()`
    on time for painting.
  - `metronome.js` (30/30): new `click(audioTime, { accent, countIn })`;
    the clock's `beat` listener calls it (count-in always, the rest while
    the checkbox is on). Its own `start` / `countIn` scheduler is kept but
    the player no longer uses it.
  - Listen moved off `VoicingPlayer` (voicing-player.js is unchanged and
    still serves `/voicings`; the player imports only `loadTone` and the
    sample URLs). Notes are clock items by quarter position
    (`listenSchedule` at 60 bpm), sounded on the page's own guide
    sampler. New behaviour: live tempo; with a loop it repeats until
    stopped (count-in on the first pass only); with none it plays from
    the current bar to the end of the piece, turning pages; the bar
    marker follows the clock.
  - Play-along: "♪ Play along" / `P` in the strip, Space stops. Same range
    and looping; the score moves with the clock and never waits; the whole
    piece plays underneath at "Guide volume" (Listen card, 0–100, default
    35, 0 = click only, `songlab_player_guide_volume`); Hands decides which
    notes are yours. Feedback: a note hit within 250 ms flashes green, one
    not played stays faint for the rest of that pass. No counts. Practice
    mode is untouched.
  - Timing log (`static/player/player-playalong.js`, new, pure, 35/35):
    per pass, every expected note (`hit` / `missed`, `offsetMs` early
    negative) and every played note (extras included), with bar / beat and
    audio times. Key times are mapped onto the audio clock through the
    context's output timestamp.
  - **Hook for future scoring and the coach:** `window.songlabPlayer`
    (also exported from `player.js`): `listen({ from, to, loop })`,
    `playAlong({ from, to, loop })`, `stop()`, `setTempo(pct)`,
    `setLoop(from, to)`, `clearLoop()`, `on(event, fn)`, `getLastPass()`.
    Bus events: `playalong:start` / `stop`, `listen:start` / `stop`,
    `pass:start` / `end` (loop range; `pass:end` carries the log),
    `note:expected` / `played` / `missed` with `{ pitch, hand, bar, beat,
    audioTime, offsetMs }`. Scoring, progress and the coach should plug in
    here without touching the transports. (Not `MusicalEventStream`: that
    is Cantor's stream, with its own event model.)
  - Round 2 (2026-11-13, same commit; Node self-tests + a stubbed-DOM
    smoke of the real `player.js`, 22/22; tested on the RD-2000):
    - Pause: Space, P and the two strip buttons pause in place ("❚❚ Pause"
      → "▶ Resume"; page and bar marker stay; the pass closes
      `complete: false`); resuming starts at the START of the paused bar
      with the count-in first (`beat-clock` `start({ startBar })`); a loop
      keeps its range. Nothing is judged while paused. R / any navigation /
      any state change end a paused transport (`stopListen`). Controller:
      `pause()`, `resume()`, `paused`.
    - Timing log: extras carry `extra: true`, `offsetMs: null`;
      `getLastPass()` = newest ended pass with a played note;
      `getPasses()` = last 10. Passes carry `run`, `startBar` and
      `timebase` (clock readings at open / close + `drift`).
    - **Timing drift (≈ −15 ms/s in play-along) — closed, not a bug.**
      Expected notes and clicks come off one clock line (identical audio
      times, simulated at 60.68 bpm); the key-time mapping reads a fresh
      output timestamp per event (self-test: an on-click player reads
      ≤ 0.1 ms for 32 s, even with the clocks 200 ppm apart); and measured
      in the browser both clock rates are ≈ 0 (`stampMsPerS`,
      `currentMsPerS` from `getLastPass().timebase.drift` /
      `__player.clockProbe`). The slide was the player rushing at 60 bpm —
      the first real finding for a future timing coach. The mapping is
      unchanged; the diagnostics stay.
    - Tempo and metronome-volume sliders: 44 px targets.
  - Player smoke (`tests/player/`, 2026-11-13): the real `player.js`
    under Node with a stubbed DOM and a fake audio clock on real time —
    the page's own wiring, which the pure modules' self-tests cannot
    reach. `node tests/player/smoke.mjs` (≈ 25 s; 6 scenarios, 48 checks:
    pause / resume, the count-in-0 first downbeat, Song notes, feel +
    anchors), or
    one scenario by name. Uses a built-in fixture piece, not the private
    Carol. Not a substitute for the Chrome / RD-2000 check: nothing is
    drawn, nothing sounds.
  - Sustain pedal: CC64 from the selected input holds "Sound for my notes"
    after key release; pedal up releases notes whose keys are up; a
    re-strike retriggers; a device change or disconnect releases
    everything. Judging stays by keys only.
- Collapsible rack + summary strip (2026-11-12, `244dd33`; `player.html`,
  `player.js`): the rack sits in `.pl-rack-shell` (grid rows 0fr ↔ 1fr +
  opacity, 150 ms, `inert` + visibility when closed, no transition under
  prefers-reduced-motion) above the summary strip, 58 px on one row:
  ← Prev | Line n / m · Bar b | Next → | settings summary ("100% ·
  metronome off · count-in 1 · both hands [· No stress] [· loop bars
  2–3] · ● RD-2000" / "no MIDI"; click opens the rack) | ⚙ Controls
  (`aria-expanded`) | ▶ Listen / ■ Stop | ↺ Start over | ✕ Clear loop
  (shown only while a loop or a first tap is set) | status. The three
  live buttons live in the strip (same ids), so the Listen card is tempo
  + the metronome row and Practice is the repeat toggles, Move on after
  and the hints at 13 px; cards padded tighter. Auto-collapse: the first
  MIDI note or Listen start after the rack was opened closes it, once per
  opening, never while focus or a pointer drag is inside it; "Hide
  controls while playing" in the Mode card (default on,
  `songlab_player_rack_auto`); open / closed remembered
  (`songlab_player_rack_open`), on load closed when auto is on, else as
  remembered. Debug: `__player.setRackOpen`, `setRackAuto`, `rack`.
- MIDI hot-plug + a device appearing after a load with zero inputs
  (2026-11-12, `244dd33`; `static/shared/midi-input.js`,
  `static/games/cycle-of-shells-input.js`, `player.js`): `MIDIInput`
  resolves the attachment on `init()` and on every MIDIAccess
  `statechange` — the preferred device (by id) if present, else the
  current one if still present, else the first non-DAW port, else none —
  with the handler on the picked port only, and emits
  `onDevicesChanged(cb)` once per real change; `MIDIInput.available` says
  access was granted (init's return is "connected", false with no input
  yet — the root cause: the wrapper took it for "no Web MIDI" and never
  subscribed). The wrapper's one `sync(reason)` (load / hot-plug / manual
  choice) lets the remembered name win, releases what a vanished or
  switched port held, and emits `status` + `devices`; the player's one
  `syncDevice()` rebuilds the select, light, tooltip and strip summary.
  Unplugging the active device with another port present falls back to
  it ("Remembered device X not found; using Y"). Self-test 29/29. Cycle
  of Shells gets the same hot-plug through the shared wrapper.
- Audio wake (2026-11-12; `player.js` `startAudio`): loads Tone first,
  then `Tone.start()` on every pointerdown / keydown (capture), from the
  Sound checkbox, the on-screen keys, Listen, and from a MIDI note
  arriving while the context is suspended (MIDI is not a user activation
  for Chrome); 400 ms race on a pending start; when refused, the MIDI
  card shows "Click anywhere to turn on sound." until the context runs
  (its `statechange` is watched). Pianos preload on the first run.
- `static/player/player.js`: page glue over `createShellInput` (its
  injectable storage mapped to the player's own key), `VoicingKeyboard`
  (range from the piece ± 3 keys, snapped to white keys; own state
  classes `pl-key--expected / --correct / --wrong / --held`, since
  `vk-key--hit`'s white ring is invisible on white keys), echo as in
  Cycle of Shells but on the page's own sampler (2a.1); on-screen clicks = attack + release and
  always sound; "Sound for MIDI notes" off by default (the RD-2000
  sounds itself); audio wake on any gesture or the first MIDI note (see
  above). Fixed
  2026-11-03: a module-level `history` shadowed `window.history`
  (`load()` threw at `replaceState`); `PlayerStaff._measureBox` threw
  NotFoundError restoring adjacent marker + tint rects.
- `tools/pieces/midi_to_norm.py` (new, stdlib SMF reader, no mido in the
  pipeline): MIDI tracks RH / LH → norm. Flags `--key` (the file's key
  meta is ignored), `--grid`, `--min-rest` (gaps shorter than this
  extend the note instead of becoming rests), `--title`, `--clef
  HAND:CLEF@BAR`. Minor keys spell the raised 6th / 7th with sharps. New
  optional norm fields `tempo`, `title`, `clefs` in `tools/pieces/README.md`.
  Prelude command: `--key "G minor" --grid 0.25 --min-rest 0.5 --clef
  lh:treble@1,bass@9 --clef rh:treble@1`.
- First piece: Carol of the Bells (George Winston, easy piano,
  Musicnotes), lines 1–2 = 16 bars, G minor (two flats; the earlier
  "B♭ minor" notes were wrong), 3/4. Recorded in Logic from the RD-2000;
  `static/private/pieces/prelude-winston-first-16.mid` and `.norm.json`,
  gitignored. The `.mid` is the source of truth; the norm is regenerated
  from it.

**In progress:**
- Loop chunk 1b (trouble spots) awaits an RD-2000 pass with real
  `console.table` rows for the threshold tuning (the `_measureBox` fix
  has only been exercised from console snippets, see SESSION_LOG
  2026-11-03). 1c No stress was checked on the RD-2000 2026-11-12.

**Open / deferred:**
- Player 3 (beat clock, play-along, pedal) needs its Chrome / RD-2000
  check: timing offsets against the click, the guide level at 35, stop
  cutting the guide cleanly, page turns at tempo.
- Next, in order: scoring and the coach on `window.songlabPlayer` and its
  events (see "Shared beat clock + play-along" above); the RD-2000
  recording session, warm-up
  screen in the song's key, practice logging (`createResultLog` with key
  `songlab_results_player`, per the game-engine spec envelope, off the
  `practiceEvent` funnel).
- Parked idea: "explain why a transition works" (brainstorm 2026-11-06).
- Trouble spots: no cap on a merged range's length yet (a whole-piece
  first read could flag bars 1–16; add `MAX_RANGE_BARS` if it shows up);
  anticipation only looks at the next step in score order, not the loop
  start; a hands switch mid-pass forgives that pass's misses (`dirty` is
  not carried).
- Out of scope so far: MIDI control of loops, timed play-along scoring
  (the timing log exists; nothing reads it yet).
- Multi-bar view: the model already takes a bar range; the page shows one
  bar.
- Staff splitting is not beat-aware (fine for 3/4; revisit for 4/4
  pieces).
- `VoicingStaff` should set its Verovio options per render now that it
  shares the toolkit with `PlayerStaff` (PlayerStaff re-applies its own
  before every render; VoicingStaff does not).
- Move the step-2 route smoke script from the Claude Code scratchpad to
  `tools/check_player_routes.py`.
- Cycle of Shells echo may not sound black keys: it passes `♯` note names
  to Tone (`cycle-of-shells.js` `noteName`); `player.js` uses ASCII names.
  Listed in Known Issues.

**Public surfaces (test harness / debugging):**
- `window.__player` — `state`, `load(name)`, `showLine(index, {bar, keep})`,
  `stepLine(±1)`, `stepBar(±1)`, `restart()`, `setLoop(from, to, {exitAfter,
  jump})`, `clearLoop()`, `setNoStress(bool)`, `state.loop`, `trouble`
  (last scored pass), `practice` (`playedMs`), `loopCounts`,
  `passHistory`, `recorder`, `thresholds`, `staff`, `keyboard`, `input`,
  `follower`, `steps`, `noteOn(midi)` / `noteOff(midi)` (drive the
  follower from the console without a piano). The console logs
  `[player] pass recording …` / `… cancelled …` and one
  `[player] pass N of bars …` + `console.table` per pass.
- Self-tests: `node --input-type=module -e "import('./static/player/player-staff-model.js').then(m => m.selfTest())"`
  and the same for `player-follow.js`, `player-trouble.js`, `meter-rules.js`.
- Console snippets for a strict pass with misses in bars 6–7 and a No
  stress pass with a dropped note + a stray key per bar are in
  SESSION_LOG 2026-11-03.

**Standing rules:**
- Private pieces stay under `static/private/pieces/` (gitignored); move
  them to a non-static folder before any shared deploy (RADAR).
- Fix recording errors in Logic's Event List, re-export under the exact
  same file name, regenerate the norm. Don't hand-edit the norm.

### Games & Tools
- Harmony Trainer, Chord Walks (4 tiers), Rhythm Lab, Strum Patterns, Chord Spotter, Scale Builder, Melody Match
- **Follow-along player** `/player` (2026-10-30; loops + trouble spots + No stress + Listen 2026-11-03; control rack + metronome 2026-11-05): wait-for-me practice of a recorded piece from MIDI; see the current-state block above
- **Cycle of Shells** (2026-10-22, branch `cycle-of-shells`): ii–V–I shell voicings round the cycle from MIDI; see the current-state block above
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
- **Phase B:** Extract `game-flow.js` (Pattern B adaptive, independent axes, ResultDetail schema), new games (Voice Leading Detective, Note Name Trainer, Interval Spotter, Chord Progression Builder, Rhythm Tapper, Melody Dictation). **Polyrhythm Trainer ✅ complete (B8)**. Cycle of Shells (2026-10-22) is the third hand-rolled game with a pure core; the extraction is deferred to the platform audit (RADAR).
- **Phase B.5:** Auth & Persistence — Supabase auth, profile migration, ResultDetail → Supabase
- **Phase E5:** Competency Graph — fast path (B → B.5 → E5), cross-game skill tracking. CREPE pitch engine upgrade (Pro tier).
- **Phase C:** Curriculum paths, path runner UI, Tonnetz curriculum map
- **Phase D:** Differentiated experiences by user level
- **Phase E1–E4:** Per-game AI-powered feedback
- **Phase F:** Puzzle Paths, NoteInputProvider full abstraction (extends A++.6), Voicing Explorer advanced, social features
- **Architecture cleanup (from code review):** consolidate triplicated chord-type registries into transforms.js, replace `_suppressAutoPlay` with source-tagged HarmonyState.update(), standardize factory-function naming across detection modules

---

## Known Issues

This is the one list of bugs. Cross-cutting threads that are not bugs live
in `docs/RADAR.md`. Content and labelling defects found 2026-10-27 are
itemised in `docs/AUDIT-2026-10-27.md` §1 and summarised here.

**Voicing Explorer / Learn (audit §1, fix this week):**
- Degrees follow the written letter, not the chord type
  (`voicing-analysis.js` `_degreeOf`): Cdim7 with A → "13"; C7♯9 with E♭ →
  "♭3"; C6 with A → "13".
- Guide tones on ♯9 chords: ♭3 folds into class "3" (`voicing-describe.js`).
- Shape catalogue ignores chord quality: Cm7 gets "dominant version".
- "The root is left to the bass" said on slash chords.
- `-` parses as flat (`C-7` → C♭7). Parser gaps: 13, 7alt, 9sus4, m11, 7♭13,
  7♯5, maj7♯5, 6/9, maj13, -7b5. Duplicate `'mmaj7'` key.
- Tritone topic (verified) says only the dominant 7th has its tritone
  between 3rd and 7th; dim7 does too.

**Games (2026-10-30):**
- Cycle of Shells MIDI echo may be silent on black keys: `noteName` in
  `cycle-of-shells.js` builds `A♯3`-style names from `parseNote`, which
  Tone's note parser does not read. `static/player/player.js` uses ASCII
  names (`A#3`); do the same there. Unverified at the piano.
- `/learn` is not in the site nav; `/learn/<unknown-slug>` returns 200.
- Every Theory card links to at least one stub (extensions,
  omitting-tones, voice-leading, voicings-as-shapes, rootless-voicings).

**Before any public deploy (audit §3):**
- `/api/chat`: client picks model and system prompt; rate limit keyed on
  proxy IP. Needs model allowlist, server-side prompt, X-Forwarded-For,
  spend cap.
- `/play` writes to committed `scores.json` unauthenticated; remove with
  `/relative`, `/status`, `/tone-check`.
- `static/private/` is served by Flask's static route; move it out.
- No LICENSE file; Blockly unpinned from unpkg; MusyngKite soundfont
  licence unchecked.

**Platform (carried forward):**
- Swing Trainer returned 500 on the old Railway deploy; never reproduced
  locally (2026-04-17). Unverifiable until there is a deploy again.
- `pitch-detection.js` uses deprecated `ScriptProcessorNode`; AudioWorklet
  migration tracked in `docs/audio-architecture.md` Open Question 1.
- Harmony Trainer still uses server-side pitch detection
  (`/process_audio_chunk` → librosa).
- Rhythm Lab + Strum Patterns mic paths disabled; keyboard input works.
- `/harmonograph` is unlinked (sandbox by design; `/art` redirects).
- Resonance defaults changed April 20; original starburst not preserved as
  a preset.
- Port 5000 is held by macOS AirPlay Receiver on the Mac mini; `.env` sets
  `PORT=5001`.
- Global SVG `max-width` rule squashes wide inline SVGs; `voicing-chart.js`
  pins its width inline. Any future scrollable SVG panel needs the same.
- `_suppressAutoPlay` is load-bearing in explorer.html (19 sites); source-
  tagged `HarmonyState.update()` recommended. Deferred.
- Triplicated chord-type registries (transforms.js, chord-resolver.js,
  chord-detection.js); inventory in `docs/registry-inventory.md`.
- Tooltip (`.tt-tooltip`): `100vh` jitter on mobile (use `dvh`); no focus
  trap / `aria-modal`; `z-index: 9999` unaudited; `stopPropagation` in
  game canvases would block `[data-theory]` triggers.
- Swing Trainer: dial finicky past midpoint; `swing_ratio` not consumed.
- SkratchLab: Rhythm Builder strum row doesn't export to Blockly; sustain
  bypassed for Organ/Synth; "Clear All" clears blocks but not canvas.
- Mobile/responsive untested.
- Backlog: enharmonic sharp/flat toggle for Fundamentals keyboards.

---

## Key Docs

| Doc | Purpose |
|---|---|
| `docs/AUDIT-2026-10-27.md` | **Audit** — content bugs, pieces pipeline, platform state; §4 superseded by the Nov 2026 roadmap |
| `docs/RADAR.md` | Cross-cutting threads (not bugs), scanned at session start |
| `docs/songlab-build-plan.md` | Historical phase plan (v4, April 2026). Roadmap is now the Nov 2026 roadmap (see top) |
| `docs/audio-architecture.md` | **Audio & Input spec** — detection modalities, client-side DSP, device selection, input provider, CREPE upgrade path |
| `docs/polyrhythm-trainer-spec.md` | **Polyrhythm Trainer spec** (v2) — Practice/Challenge modes, drum pads, phase-based ramp |
| `docs/code-review-opus47.md` | Code review (April 2026; blockers resolved; follow-ups carried into Known Issues) |
| `docs/game-engine-spec.md` | **Game audit** — per-game analysis, adaptive axes, ResultDetail schemas, new game designs |
| `docs/design-system-reference.md` | CSS tokens, color palette, typography — design system reference |
| `docs/visual-engine-spec.md` | Generative art engine spec (Tonnetz-driven, post-launch) |
| `docs/explorer-spec.md` | Explorer design, panel specs, canonical orientation |
| `docs/voicing-explorer-spec.md` | Voicing Explorer — chord shapes, glow worm paths, projections |
| `docs/active-plans/voicing-explorer-build-plan.md` | **Voicing Explorer analysis arc** — 7-session plan, Decisions, open questions |
| `docs/active-plans/instructional-content.md` | **Learn plan** — topic order, verification status |
| `docs/active-plans/explainer-content.md` | Explainer registry drafts (Session 6.5 + Phase 0) |
| `sources/SOURCES.md` | Public-domain scans, PD reasoning, pieces pipeline notes |
| `tools/pieces/README.md` | Norm format (incl. `tempo`, `title`, `clefs` added 2026-10-30) and the pieces toolchain, `midi_to_norm.py` included |
| `tools/voicings/schema.md` | Voiced-progression JSON schema (v1) consumed by `voicing-analysis.js` |
| `docs/registry-inventory.md` | Chord-type registry audit + canonical JSON spec (§9: voicing-analysis local types) |
| `docs/content-architecture.md` | Content model, topic schema, lens system |
| `docs/game-flow-pattern.md` | Learn → Practice → Test pattern (to be updated with audit findings) |
| `docs/auth-architecture.md` | Supabase auth, profile migration, security checklist |
| `docs/extended-chords-spec.md` | Extended chord type system — CHORD_TYPES, data model, visual rendering |
---

## Update Protocol

After every work session:
1. Update "Last updated" date
2. Update "Current Focus" with what's active and what's next
3. Move completed items into "What's Working"
4. Add new bugs to "Known Issues"
5. Commit: `git add docs/ && git commit -m "Update project status"`

---

## History

### Cantor state as of 2026-05-14 (moved verbatim 2026-10-27)

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
  setup — chromatic check below C4 passes on the Launchkey. Not
  reproducible on a fresh Chrome profile; probable cause a stale
  persisted `localStorage['songlab.cantor.splitPoint']`; unconfirmed.
  Related: multi-port MIDI devices now
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
