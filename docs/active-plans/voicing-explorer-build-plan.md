# Voicing Explorer — Build Plan

**Status:** Active — Session 1 complete (2026-10-14); to be integrated
with the project-wide review.
**Started:** 2026-10-14
**Companion to:** `docs/voicing-explorer-spec.md` (v0.3)
**Branch strategy:** new feature branch `voicing-explorer` off `dev`.
Independent of the in-flight `cantor` branch; no shared files expected
beyond read-only use of shared modules (see Constraints).

## Context

The Voicing Explorer spec (v0.3) built Note Mode, ChordResolver and
glow worm paths, and parked sequence input, voice-leading
visualization and the shape library in Phase F. This plan pulls a
slice of that work forward, motivated by a concrete piece: Brad
Mehldau's "Don't Be Sad" (Highway Rider, 2010).

Planning session 2026-10-13/14 produced:

- **A voiced practice score** of Don't Be Sad (44 bars): melody and
  changes from a lead sheet plus Dustin's transcription; bars 1–20
  voicings read from a video score; bars 21–44 voicings arranged in
  the same shapes (not Mehldau's). Built from a small text source
  (`score_src.py`) → MusicXML / PDF / MIDI via music21 + Verovio.
- **An analysis mockup** (Design canvas, "Voicing Explorer — Tension
  Curve"): per-bar tension chart, keyboard, engraved staff for the
  selected bar, "intervals that rub", named-vs-played, and an
  "Include melody" switch.
- **Findings the tool should surface automatically**, from bars 1–20:
  1. Chord names change a lot while the hand barely moves: Gmaj7 →
     Gm7/F → E♭maj7 costs 1 then 2 semitones of upper-voice motion;
     the bass walk G–F–E♭ carries the harmony.
  2. Voicings omit named chord tones: Gmaj7 = G | A–B–D (no F♯),
     Amaj7 = A | B–C♯–E (no G♯); the 9th sits where the 7th would.
  3. Tension is a curve, not a constant: the intro goes open (major
     2nd) → bite (minor 2nd, A–B♭) → settle (only a major 7th
     against the bass). Major and minor 2nds must be counted
     separately, by semitone distance, not letter name.
  4. Parallel shapes: bars 13→14 move the whole 2-3-5 cluster up a
     step, the opposite of finding 1.
  5. Same notes, two names: F | A–B♭–D is Gm9/F and B♭maj7/F.
- **A measured weakness in the arranged B section:** no minor 2nds;
  with the melody on, most of its tension comes from the tune, not the
  voicings. This is Explore mode's first job.

## Two modes, one core

**Analyze:** load a voiced progression, see what choices it makes.
**Explore:** pick a bar, generate alternative voicings, rank them,
audition them in place, keep one, watch the curve update.

Both rest on the same three pieces, built once:

1. **Voiced-progression data model** (JSON): per bar — chord
   symbol(s) with beat offsets, bass, voicing, melody notes with
   durations, source tag (`transcribed` | `arranged` | `user`),
   section label. The mockup's per-bar arrays are a working draft of
   this; formalize as a schema.
2. **Analysis engine** — pure JS, no DOM: interval scoring (exact
   semitone distance; current weights m2 3, m9 2, tritone 2, M2 1,
   M7 1), melody-vs-voicing scoring weighted by duration,
   named-vs-played (present / omitted / added, with degree labels and
   key-aware spelling), voice motion between bars (only when voice
   counts match). Analyze uses it to explain; Explore uses it to rank.
3. **Views** — tension chart, keyboard, staff, and Tonnetz via
   HarmonyState (selecting a bar publishes the voicing, so existing
   Tonnetz/glow-worm panels light up without new code).

## Data handling — private material stays out of the repo

The repo is public. Don't Be Sad's melody and the video-score
voicings are other people's work: fine for study, not for a public
repo or public SongLab content.

- **Gitignored local folder** for private progressions:
  `static/private/` (add to `.gitignore` in Session 2). Flask serves
  it locally; it never ships.
- The page loads a progression by name and fails gracefully (clear
  "not found" state) when the private file is absent.
- **Public demo data** comes from material free to use: public-domain
  standards or Dustin's own pieces. Chord progressions alone are not
  copyrightable (Skidmore v. Led Zeppelin, 2020), but transcribed
  melodies and voicings are treated as private by default.
- The build tooling (score source → JSON / MusicXML / staff images) is
  public and lives under `tools/voicings/`; its inputs for Don't Be
  Sad live in the private folder.

## Sessions

### Session 1 — Read-and-report: what exists

Goal: ground the plan in the actual code before anything is built.
Claude Code reads and reports; no code changes. Prompt in Appendix A.

Questions to answer:
- What Note Mode, ChordResolver (`chord-resolver.js`), and
  ChordBubbleRenderer (`chord-bubble-renderer.js`) actually expose,
  and what can be reused for named-vs-played and labels.
- How `keyboard-view.js` highlights notes: can a caller color keys by
  role (bass / voicing / melody) through its public API, or would that
  need a change (it is on the do-not-touch list)?
- How HarmonyState represents an arbitrary voicing (octave-specific
  notes, slash bass) — does `setChord` / `highlightChord` or Note
  Mode's path cover "show exactly these five pitches"?
- Where chord-type data lives today (the 7+ duplicated registries in
  `docs/registry-inventory.md`) and which one the analysis engine
  should depend on.
- Whether Explorer's panel architecture can host a whole-piece
  timeline (tension chart) as a composable panel, or whether this
  needs its own page (see Open questions).

### Session 2 — Data model and analysis engine

Goal: `static/shared/voicing-analysis.js` (pure functions) plus a
JSON schema for voiced progressions, with self-tests run against the
Don't Be Sad data from the private folder.

- Port the scoring, named-vs-played, motion, and melody-weighting
  logic from the Python prototype (`tension_full.json` generation).
- Acceptance: engine output matches the mockup's numbers for bars
  1–20 (comp-only and with melody), e.g. bar 2 = 3, bar 3 = 1,
  bar 17 = 4 (comp) / 5.0 (with melody).
- JSON schema for voiced progressions (per bar: chord symbol(s) with
  beat offsets, bass, voicing as MIDI numbers, melody notes with
  durations, source tag, section label).
- Exporter: `tools/voicings/export_json.py` →
  `static/private/dont-be-sad.json`, built from the private
  `score_src.py`.
- Synthetic test fixture (~8 bars, public, checked in) isolating each
  scoring case: m2, M2, m9, tritone, M7; omitted and added chord
  tones; melody weighting by duration; voice motion with matched and
  unmatched voice counts.
- ~~Add `static/private/` to `.gitignore`.~~ Done (commit `1541bff`).
- ~~Move the score-building scripts into `tools/voicings/`.~~ Done
  (commit `1541bff`).

### Session 3 — Analyze page: chart, keyboard, rubs, named vs played

Goal: port the mockup to a working SongLab view on the dark DAW theme
and design tokens. Selecting a bar updates keyboard, rubs list,
named-vs-played, and publishes to HarmonyState. Melody toggle can
wait for Session 5; the staff for Session 4.

### Session 4 — Staff rendering in the browser

Goal: engraved notation for the selected bar, colored by role.
Decision at session start: **Verovio** (WASM toolkit; MusicXML/MEI in,
per-note color, same engine as the mockup and the practice score) vs
**VexFlow** (lighter, more manual layout). Leaning Verovio for fidelity
and because the rest of the pipeline already speaks MusicXML.

### Session 5 — Melody toggle and audio

Goal: "Include melody" switch wired through engine, chart, keyboard,
staff, and lists. Play the selected bar (and a few bars around it)
through Tone.js / Salamander so analysis can be heard.

### Session 6 — Explore (first slice)

Goal: for a selected bar, generate candidate voicings and rank them.
- **Candidates:** voicings of the chord symbol within a range, plus
  shapes harvested from analyzed pieces (e.g. "2-3-5 cluster over the
  bass", "pair over a slash bass", "bass–5th–10th shell").
- **Ranking:** upper-voice motion from the previous and next bars
  (smoothest first) and distance from a user-set tension target.
- **Audition and keep:** hear in context, swap in, curve updates.
- First real test: re-voice the arranged B section of Don't Be Sad.

### Session 7 — Merge to dev

Route and placement final; STATUS / SESSION_LOG updated; private-data
handling verified on a clean clone (page works, shows "no private
data" state, nothing private in git history).

## Decisions

- **Placement** (decided 2026-10-14, Session 1): standalone `/voicings`
  page (Flask route + template) mounting shared modules
  (`TonnetzNeighborhood`, `ChordBubbleRenderer`). Not an Explorer stage
  view: a seventh stage view would hide the Tonnetz while the chart is
  visible, and Explorer's chord-mode machinery (auto-play subscriber,
  `_suppressAutoPlay`) conflicts with bar-by-bar analysis. This departs
  from `voicing-explorer-spec.md`'s "mode within the existing
  Explorer"; the spec's composable-panel principle is honored at the
  module level.
- **MIDI convention:** the engine uses standard MIDI (C4 = 60); it
  converts to `{note, octave}` only when publishing to HarmonyState as
  `source:'user'` (the only octave-faithful path).
- **Registries:** the engine takes chord intervals from `transforms.js`
  `CHORD_TYPES` and defines locally only what transforms lacks (7♯11,
  maj9♯5, m9, slash bass). Logged in `registry-inventory.md`.
- **Engine owns chord-symbol parsing and named-vs-played:**
  `chord-resolver.js` spells sharps-only and requires exact PC-set
  size, so it can't identify rootless or incomplete voicings.

## Open questions

- **Keyboard for `/voicings`** (decide in Session 3):
  `keyboard-view.js` only places exact octaves for `source:'user'` and
  ignores `an.color`; role coloring would need a DOM overlay keyed on
  `data-note`. Leaning toward a small page-owned keyboard instead
  (covers the melody range to ~F5, no coupling to keyboard-view
  internals, no do-not-touch lift).
- **Tension weights.** Current weights are a first guess. Candidates
  for later: beat-position weighting (downbeat dissonance counts more),
  register weighting (low-register rubs are muddier), and whether
  melody–melody intervals ever count.
- **Spelling.** Named-vs-played needs key/chord-aware enharmonics
  (D♯ vs E♭ in A7♯11). Reuse the registry/transforms layer or build a
  small speller in the engine?
- **Ambiguity as output.** Finding 5 (Gm9/F = B♭maj7/F) argues for
  showing multiple readings ranked by context — the spec's
  probabilistic-interpretation idea and RADAR's sus2/sus4 thread.
- **Input path.** For new pieces: MusicXML import (from MuseScore,
  from audio-to-score tools like MuseScore's Audio2Score), MIDI
  (Launchkey step entry), or a text format. MusicXML import is the
  likely first; audio-to-score output is useful as raw voicing data
  even when its rhythm is messy.

## Constraints

- Do-not-touch list (WORKING_STYLE): `harmony-state.js`,
  `keyboard-view.js`, `musical-event-stream.js`, `chord-detection.js`,
  `audio-input.js`, harmonograph files. Consume their public APIs only;
  any change needs an explicit lift, raised in the read-and-report.
- Dustin manages all git; prompts contain no git commands.

## Out of scope

- Polyphonic audio detection (RADAR).
- Auth / saving user progressions server-side (Phase B.5).
- Public release of any transcribed material.

## Appendix A — Session 1 prompt (read-and-report)

> Read-only task. Do not modify any files.
>
> Context: we are planning a Voicing Explorer analysis view (see
> `docs/voicing-explorer-spec.md`). It will load a voiced chord
> progression (per bar: chord symbol, bass note, voicing notes with
> octaves, optional melody notes with durations), compute interval
> tension and named-vs-played chord tones, and display a per-bar chart,
> a keyboard, and the Tonnetz.
>
> Read `docs/STATUS.md`, `docs/voicing-explorer-spec.md`,
> `docs/registry-inventory.md`, `static/shared/chord-resolver.js`,
> `static/shared/chord-bubble-renderer.js`,
> `static/shared/keyboard-view.js`, `static/shared/harmony-state.js`,
> `static/shared/transforms.js`, and the Explorer template and panel
> wiring in `templates/explorer.html`. Then report:
>
> 1. What ChordResolver and the chord-type registries expose that we
>    could reuse to (a) name a set of pitches and (b) list a chord
>    symbol's tones with degree labels. Note any spelling (enharmonic)
>    handling.
> 2. How keyboard-view.js highlights notes, and whether a caller can
>    color specific keys by role (bass / voicing / melody) through its
>    existing API. Quote the relevant functions.
> 3. How HarmonyState represents a specific octave-placed voicing with
>    a slash bass, and which call would make the Tonnetz and keyboard
>    show exactly a given set of MIDI pitches.
> 4. How Explorer panels are composed and registered, and whether a
>    new panel showing a whole-piece timeline would fit that pattern.
> 5. Anything that would force changes to files on the do-not-touch
>    list in docs/WORKING_STYLE.md.
>
> Finish with a short proposed plan for Sessions 2–3 based on what you
> found, and stop.
