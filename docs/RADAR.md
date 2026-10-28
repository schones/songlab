# RADAR — cross-cutting threads

Threads to keep peripheral attention on. Not active work; not bugs.
Things that don't fit in any single design doc but shouldn't drift
out of awareness.

**Behavior:**
- Scan at session start. Notice if anything is relevant to today's work.
- Items enter when something cross-cutting is noticed.
- Items leave when resolved, or when they transition into active work
  (a design doc, a build plan, a session task).
- Most updates happen at session end via SESSION_LOG processing.
- Each item: date entered, one-sentence description, pointer to
  authoritative doc.

---

## Active threads

- **[2026-10-28] Unnamed tones: letter-based labels vs Levine T5/T6.**
  The engine now gives a tone the chord type names the type's degree
  name (A over Cdim7 is ♭♭7, F over C7sus4 is 4, A over C6 is 6).
  *Adopted 2026-10-28 (Prompt 2.5):* an unnamed semitone 9 over a
  maj7-family type (major 3rd and major 7th named, no ♭7) reads 6, not
  13, by letter or midi — Levine T6 and fig 7-2 (R2: CΔ voiced E G A D
  is 3–5–6–9, the 6/9 chord). Minor and dominant chords keep 13.
  *Still open:* every other unnamed tone takes its label from the
  written letter: F over Cmaj7 reads 11, B♭ over Gmaj7 reads ♭3, E♭
  over plain C7 reads ♭3 while a midi E♭ reads ♯9. Levine T5
  (`docs/reference/levine-claims.md`) would say 4 on major chords, 11
  on dominant and minor chords, regardless of what the symbol names.
  Decide whether the rest should follow T5 (and whether an unnamed
  semis-3 on a major-third chord is ♯9 or ♭3 irrespective of spelling).
  Changing it moves fixture bar 8 (`B♭·♭3` over Gmaj7), the private
  bar-17 melody label and the `named-vs-played` topic text.
  See: `static/shared/voicing-analysis.js` `_degreeOf`, `_spellDegree`.

- **[2026-10-22] Held non-chord tones can show double accidentals on the
  staff.** Cycle of Shells spells held notes against the current target
  (`spellForTarget` → `namedVsPlayed`), so a non-chord tone takes the
  chord-relative spelling: A against D♭7 is B𝄫2, D against D♭7 is E𝄫4.
  The key labels already did this; the staff makes it visible. Decide
  whether non-chord tones should fall back to the key's plain spelling.
  See: `static/games/cycle-of-shells.js` `spellForTarget`; `static/games/cycle-of-shells-staff.js` `heldChord`.

- **[2026-10-22] VoicingKeyboard clickable mode is mouse/touch only.**
  `onKeyClick` adds a delegated click listener; the keys stay
  `role="img"` and are not focusable, so Cycle of Shells' on-screen
  input has no keyboard access. Fix when the shared keyboard gets a
  focus model.
  See: `static/shared/voicing-keyboard.js`; `static/games/cycle-of-shells.js` `onKeyClick`.

- **[2026-10-22] No MIDI hot-plug event.** `MIDIInput` handles
  statechange internally but exposes no hook, so the game's device
  picker re-reads `listDevices()` when the settings panel opens; a port
  plugged in after load is only auto-attached when nothing is attached.
  Adding an event is a shared edit to midi-input.js.
  See: `static/shared/midi-input.js` `_handleStateChange`; `static/games/cycle-of-shells-input.js`.

- **[2026-10-22] Choosing a MIDI device in the game changes the
  site-wide default.** `MIDIInput.selectDevice` persists the id under
  `songlab_midi_device`, so a choice in Cycle of Shells is the next
  default for Cantor, Explorer and Harmonograph. Decide whether games
  should scope their choice.
  See: `static/shared/midi-input.js` `_attach`.

- **[2026-10-22] Shared keyboard labels held notes with sharps.**
  `VoicingKeyboard.render` labels a midi number with `parseNote`'s
  sharp spelling. Cycle of Shells spells held notes against the current
  target before rendering, and its own overlay labels use the target's
  spelling; other pages passing midi numbers still get sharps.
  See: `static/shared/voicing-keyboard.js` `_apply`; `static/games/cycle-of-shells.js` `spellForTarget`.

- **[2026-10-22] game-flow.js extraction.** Cycle of Shells is the
  third hand-rolled game (after Scale Builder and Chord Walks) with its
  own stage/lifecycle code; its logic sits in a pure core, so the page
  layer is the only part an extracted shell would absorb. Extract
  during the platform audit, not before.
  See: `docs/game-flow-pattern.md` §6; `docs/game-engine-spec.md` "Unification Work"; `static/games/cycle-of-shells.js`.

- **[2026-10-22] Before Body and Soul: a timeboxed transcription-pipeline
  pass.** Position-first reads, tight upscaled crops, Audiveris as one
  vote among several. Parked behind it: OMR as a project (synthetic
  degraded scans via Verovio, a review UI from igr-review).
  See: `tools/pieces/`; `sources/SOURCES.md`.

- **[2026-10-19] Private piece data under `static/` is directly fetchable.**
  `static/private/dont-be-sad.json` answers HTTP 200 at
  `/static/private/dont-be-sad.json` through Flask's static route, not
  only via `/voicings/data/<name>`. It is gitignored, so Railway never has
  it today, but any shared deploy with the file present would expose it.
  Move private pieces to a non-static folder (and point `voicings_data` and
  `voicings_pieces` there) before any shared deploy.
  See: `app.py` `voicings_data`, `voicings_pieces`; `.gitignore`.

- **[2026-10-19] Late-bar bass notes never become comp events.** Rag bars 16
  and 17: the real left-hand octave on beat 1.5 (E♭2, A2) lands in
  `bassLine` only, because comp events are keyed to chord-voice onsets and
  the chord voice rests there. So the analysis, the Theory card and Explore
  never voice against it, and the three chord events carry an inferred bass
  (`bassSource: "inferred"`, now tagged on the page). Revisit how bass-voice
  onsets after the last chord onset should become comp events (or extend
  the previous event) in `tools/voicings/export_json.py`.
  See: `bass_for_onset`, the "keyed to chord-voice onsets" rule in the exporter docstring.

- **[2026-10-19] /voicings layout on wide screens and tablets.** The Tonnetz
  (fixed 380px height) and the staff (Verovio at its own scale) do not grow
  with their panels, so at 1800px+ the middle of the page is mostly empty
  surface; the keyboard now scales to its panel and the Theory card sits
  beside Explore. Tablet widths (700–1200px) get the two-column detail grid
  and the stacked Explore, both untuned. Future layout session.
  See: `templates/voicings.html` `.vp-detail`, `.vp-tonnetz`; `static/shared/voicing-staff.js`.

- **[2026-10-19] Dominant rule: "needs the ♭7" decided by ear on one bar.**
  Rag bar 12, event 2 (E♭7 over E♭4) after the first version of the rule:
  #3 F4 G4 (9, 3, no ♭7) does not sound dominant; #5 F4 D♭5 (9, ♭7, no 3)
  does; #2 D♭5 G5 (♭7, 3) does. So the rule now requires the ♭7 of every
  candidate (which subsumes "13 needs ♭7"), and ♯11 still needs the 3rd.
  "Needs the ♭7" versus "needs both guide tones" was settled on this one
  bar; revisit with more dominant bars (fixture 4, 6, 11; private 21)
  before treating it as more than a hint.
  See: `static/shared/voicing-explore.js` `DOMINANT_RULE`; explore-ranking topic.

- **[2026-10-19] /voicings scrolls horizontally at 390px.** Pre-existing:
  chart or keyboard SVG lines and rects reach ~411px on a 390px viewport
  (document scrollWidth ~700). Not the Theory card (342px, no overflow).
  See: `static/shared/voicing-chart.js`, `voicing-keyboard.js`.

- **[2026-10-19] favicon 404** on every page load (`/favicon.ico`). The only
  console error on /voicings. Add an icon or a route.

- **[2026-10-16] Explore tuning hypotheses (from bar 21, F7 in G).**
  Test on other dominant bars before encoding: on dominants, ♯11 needs
  both the 3rd and ♭7 (A-B-D and D-A-B drift to F Lydian / the home
  key; E♭-B-D lacks the 3rd); 13 needs the ♭7; the 3rd is optional
  otherwise. Register: a low tritone is not bad per se — the 3–♭7
  shell (A2-E♭3-F3) is good, root–♯11 low (B2-G-A) is muddy — so the
  deferred register factor should consider degrees, not just the
  interval. Liked: G-D-E♭ (9 13 ♭7), the shell, the piece's own
  C-A-B♭ (5-3-11).
  See: SESSION_LOG 2026-10-16 Session 6 "Listening"; `static/shared/voicing-explore.js` `chordTones`.
  **Update 2026-10-19:** the dominant clauses are built as `DOMINANT_RULE`
  (every candidate keeps the ♭7; ♯11 also needs the 3rd), so every
  dominant candidate now keeps at least one guide tone — resolved by the
  ♭7 rule. The register-by-degree factor is still open.

- **[2026-10-16] Explore ranking: 0.5 buckets create cliffs.** Bar 21's
  original fell from #3 at its own target to #12 at target 3. Consider
  finer buckets or a blended cost (distance + λ · motion). The
  motion-first tiebreak may favour blander voicings. Still open
  2026-10-19 (the Theory card now explains each rank by `rankKey`).
  See: `static/shared/voicing-explore.js` `rankCandidates`, `rankKey`, `targetDistance`.

- **[2026-10-16] Piece ceiling is self-limiting.** In melody-less
  events Explore never goes above the piece's existing comp top
  (`pieceCeiling`: private G4, rag D♭5). Fine for re-voicing within a
  piece's register; wrong for a piece whose comp is uniformly low.
  Still open 2026-10-19.
  See: `static/shared/voicing-explore.js` `pieceCeiling`.

- **[2026-10-16] Explainer layer planned as Session 6.5.** Info pills
  per panel with the relevant reasoning and links out to fuller pages;
  content written once, numbers pulled from code constants
  (`TENSION_WEIGHTS`, `OCTAVE_DISCOUNTS`, `ARP_STEP_MS`,
  `LEAD_IN_MAX_BEATS`, `DEFAULT_MAX_SPAN`, …).
  See: `docs/STATUS.md` Next priorities.

- **[2026-10-16] Explore melody rule is a heuristic.** "Voicing below
  the melody" is a piano-solo rule (chord-melody, comping under your own
  right hand). With a separate melody instrument — Summertime's vocal —
  piano voicings routinely sit at or above the tune, and inner-voice
  melodies break it too. Eventual fix: the melody carries its
  instrument (piano vs voice/other); piano melody keeps the
  below-melody constraint, a separate melody allows crossing and scores
  closeness as tension. Small schema addition.
  See: `static/shared/voicing-explore.js` header (candidate rules);
  `tools/voicings/schema.md`.

- **[2026-10-16] Role inference is a transcription task, separate from
  Explore.** Pieces like Summertime, Linus and Lucy and Habanera put
  the interesting voicings in the melody / right hand. Decision: keep
  the current role-labeled schema (`comp` / `bassLine` / `melody`) as
  the interface. A future transcription aid proposes role labels from
  raw notes using (1) the chord symbol (chord tones sounding together
  = voicing, lowest chord tone = bass, non-chord / moving tones =
  line) and (2) repetition (what repeats with the progression =
  accompaniment; what varies over a repeating progression = melody; a
  broken texture template signals a role change, e.g. chord-melody).
  Human confirms; labels are stored. Explore never re-classifies: it
  re-voices comp with melody and bass pinned. Chord-melody and
  two-handed voicings already fit the schema (roles, not hands). Test
  pieces: Habanera (public domain, public fixture), Summertime
  (private, gitignored).
  See: `tools/voicings/schema.md`; `docs/voicing-explorer-spec.md`.

- **[2026-10-16] Melody-over-bass scoring promoted from deferred.**
  Melody sounding against bass with no comp is unscored. It moved no
  numbers in the rag or the private piece, but Habanera (melody over
  ostinato, mostly no comp) depends on it. Schedule before or with the
  Habanera fixture.
  See: `docs/STATUS.md` Voicing Explorer "Open / deferred";
  `static/shared/voicing-analysis.js`.

- **[2026-10-16] Multi-bar playback (range).** Two modes: study (one
  bar, display holds still, as now) and follow (a range plays; Tonnetz
  and keyboard track the song). Staff needs a scrolling or page-turn
  window. Playback model is close: a range is a sequence of bars with
  the lead-in only at the start. Natural fit with or after Session 6
  (auditioning a re-voiced passage in context).
  See: `static/shared/voicing-playback-model.js`;
  `docs/active-plans/voicing-explorer-build-plan.md` Session 6.

- **[2026-10-16] Three unpinned Salamander URL maps.**
  `audio-bridge.js`, `keyboard-view.js`, `intro-audio.js` each carry
  the same sample map against the unversioned GitHub Pages URL;
  `/voicings` uses the vendored, commit-pinned copy in
  `static/vendor/salamander/`. Consolidate the three onto it when
  `keyboard-view.js` opens up (do-not-touch).
  See: `static/vendor/salamander/README.md`; `static/shared/voicing-player.js`.

- **[2026-10-16] Tonnetz: melody as separate dots, not lit triangles.**
  The Tonnetz on `/voicings` is comp-only by decision; when Explore
  (Session 6) lands, consider melody pitches as distinct markers on
  the lattice rather than feeding `activeNotes`.
  See: `docs/active-plans/voicing-explorer-build-plan.md` Session 6.

- **[2026-10-16] Lead-in notes possibly softer.** The player plays
  lead-in notes at 0.85 of the role velocity; if the one-beat lead-in
  still reads as part of the bar, drop it further so it reads as
  "from before".
  See: `static/shared/voicing-player.js` `LEAD_IN_GAIN`.

- **[2026-10-15] Block-chord limit.** Neither the schema nor
  `score_src.py` can express a held note over a moving inner voice;
  every comp event attacks all its notes together. Revisit when a
  piece needs it.
  See: `tools/voicings/schema.md`; SESSION_LOG 2026-10-15 "Flagged for later".

- **[2026-10-15] Staff polish.** Keep each comp chord on one staff
  instead of splitting at `SPLIT_MIDI`; beam melody eighths and
  sixteenths (MEI `<beam>`); grace notes are dropped by the exporter
  (bars 4, 20) and cannot be drawn or played.
  See: `docs/STATUS.md` Voicing Explorer "Open / deferred".

- **[2026-10-15] Tension register factor.** A low-register factor
  (both notes below ~C3) is separate from the compound-interval
  discounts; no current bar would move. Bar 21 listening
  (2026-10-16) suggests it should weigh degrees, not just the
  interval: a low 3–♭7 shell reads fine, a low root–♯11 does not.
  See: `docs/active-plans/voicing-explorer-build-plan.md` "Tension weights".

- **[2026-05-14] Chord/melody classification — research-active.**
  *Priority: low (research, not production).* The classification
  problem is intrinsically interesting — musically, mathematically,
  and as a signal-processing challenge — independent of whether it
  ships into SongLab. Arc paused as production work 2026-05-14;
  background experimentation continues as bandwidth allows.
  Production work on Cantor Phase 2 (presentational arc) takes
  scheduling priority when conflicts arise. Specific threads to
  add here as they surface: test cases that nag, parameter
  intuitions worth testing, alternative rule formulations,
  signal-processing alternatives. Resumption to production
  triggered by: a future SongLab use case (games, analytics,
  transcription) that the presentational view doesn't subsume,
  or a substantial enough research result to warrant promotion.
  See: `docs/active-plans/chord-melody-build-plan.md` (on
  `chord-melody-research`) Status block.

- **[2026-05-14] Polyphonic audio detection.** Future
  infrastructure problem. Cantor presentational view (and
  anything else consuming audio input) is currently limited to
  monophonic YIN pitch detection. Real multi-voice audio —
  guitar chords, piano chords through a mic, sung harmony —
  needs polyphonic detection to drive the view. Candidate
  approaches in the broader ecosystem: CREPE, Spotify's Basic
  Pitch, chroma-features-based detection. Not blocking the
  cantor presentational arc — Session 3 verifies the monophonic
  path works; polyphonic is its own downstream arc. Specifics of
  the current pitch-detection architecture and how a polyphonic
  swap would integrate are TBD in a dedicated planning session
  when this arc activates.
  See: `static/shared/pitch-detection.js` (current YIN
  implementation).

- **[2026-05-14] Chord/melody test corpus needs a full rethink.**
  The corpus (26 tests in `tests/chord-melody/specs/`) was built
  against the classifier framing. The pivot to the presentational
  approach made parts of that framing obsolete, and the question
  "which tests are even valid under the new framing?" is part of
  what triggered the pivot itself. If classification research
  resumes, the corpus is the natural starting point — but it needs
  a fresh design pass against whatever framing the new work
  inherits, not just formalization of the existing prose tests.
  This is research-work, not tidying.
  See: `tests/chord-melody/specs/` (on `chord-melody-research`);
  `docs/active-plans/chord-melody-build-plan.md` Status block.

- **[2026-05-12] sus2/sus4 cross-template inversion equivalence in
  chord-resolver.** *Priority: low — no near-term consumer (chord/melody
  classifier paused 2026-05-14; Voicing Explorer probabilistic
  interpretation is research-future).* {root, M2, P5} = {root+5, P4, P5}
  — every sus4 PC set is also a sus2 PC set from a different root, and
  vice versa. With both at priority 2 and sus2 listed first, unbiased
  resolveChord() always returns sus2; sus4 requires a preferredRootPC
  bias. Documented inline near the templates and in the chord/melody
  classifier design doc. Future work: the probabilistic interpretation
  in the Voicing Explorer spec (Future Directions) is the natural
  place to surface this ambiguity as a first-class output. Any new
  template additions should be checked for analogous cross-template
  inversion equivalence.
  See: `static/shared/chord-resolver.js` near sus2/sus4 templates;
  `docs/chord-melody-classification.md` OQ5 resolution.

  
- **[2026-05-11] Tempo subsystems scattered across SongLab.** TempoState
  is the user-input tempo only. Pre-existing tempo state in
  harmony-state's progressionState, skratch-studio, rhythm/,
  polyrhythm/, relative-key-trainer. Unification was originally
  scheduled for Session 8 of the chord/melody arc, which paused
  2026-05-14. Thread carries forward independently; the review
  inventory is documented in the chord-melody build plan's backburner
  section and remains valid reference material.
  See: `docs/active-plans/chord-melody-build-plan.md` (on
  `chord-melody-research`) backburner section.

- **[2026-05-11] OQ namespace collision across design docs.**
  Multiple design docs each have their own OQ1, OQ2, etc., with no
  global namespace. Disambiguated by hand where needed; convention
  TBD before the next design doc introduces its own OQ1.
  See: `docs/SESSION_LOG.md` 2026-05-11 entry "Flagged for later".

- **[2026-05-11] cantor's main JS lives inline in templates/cantor.html.**
  Not in a separate JS module. New cantor-page logic lands in the
  inline `<script type="module">` block unless extraction is
  justified. Documented at top of cantor.html.
  See: `templates/cantor.html` top comment.

- **[2026-05-11] harmony-state.js self-test invocation comment is stale.**
  Direct-file form (`node --input-type=module static/shared/harmony-state.js`)
  is blocked on the current Node version. Working form is piped:
  `cat ... | node --input-type=module`. Not fixing now — harmony-state.js
  is on the do-not-touch list per WORKING_STYLE.
  See: `static/shared/harmony-state.js` self-test block.

- **[2026-04-30] audio-input.js partially refactored.** Only the
  rewireForTone() lift was permitted on 2026-04-30; broader cleanup
  (OQ9 window.AudioInput coupling, device-restore refactor) deferred.
  Explorer migration onto AudioInput.rewireForTone() also pending.
  See: `docs/STATUS.md` Cantor section, "Open / deferred".

- **[2026-04-29] AudioInterpreter v0 phase 1 — saved-device auto-restore
  does not pass.** Acceptance criterion 3 from audit §3.4. Characterization
  in KNOWN-ISSUES.
  See: `docs/KNOWN-ISSUES.md`.

- **[?] Audio-interpreter migration audit doc is stale.**
  `docs/audio-analysis-orchestration.md`. Independent thread from
  chord/melody arc; will be updated after the chord/melody arc lands.
  See: build plan backburner section.

---

## Content fixes (batch, by hand)

- tritone "Where it lives": second paragraph repeats the first sentence —
  drop "In a dominant 7th … pull." from the second paragraph.

## Retired
(items move here when resolved, for short-term reference, then get
cleared periodically.)

- **[2026-10-22] ii_V_I walkthrough: Dm7 and G7 steps carry no
  concept_specifics** — resolved 2026-10-27: `concept_specifics:
  ["ii_V_I"]` added to both steps in `walkthroughs.js`. All three steps
  now show the Chord Spotter pill (`progression=ii-V-I&root=<step root>`)
  and the Cycle of Shells pill (`key=C`, the walkthrough's home key) via
  `buildGameLinks`. The Cmaj7 step and other walkthroughs are unchanged.

- **[2026-10-19] Rag derived symbols: slash bass is the top note** —
  resolved 2026-10-19. The symbols were a hand-entered table
  (`SYMBOLS` in `tools/voicings/ly_to_src.py`, derived by Claude), not
  computed; 15 of 27 corrected so a slash appears only when the lowest
  sounding note is not the root (A♭/C → A♭/E♭, F♭/C♭ → F♭, E♭7/D♭ → E♭7;
  Bdim7 bars left unslashed by decision). No analysis number or Explore
  ranking moved. The page now notes "symbols added by analysis" from
  `chordSymbols: "derived"`.

- **[2026-10-16] `/voicings` link in the top nav** — resolved
  2026-10-19: flat "Voicings" link after Explorer in `base.html` and
  `explorer.html`.

- **[2026-10-16] Salamander CC BY attribution owed app-wide** — resolved
  2026-10-19: footer line in `base.html`, credit in `explorer.html`'s
  status bar, licence link in the playback topic. The three unpinned URL
  maps remain a separate open item.

- **[2026-10-16] Explore: motion from the most recent bar WITH a
  voicing** — resolved 2026-10-16 by `voicedNeighbours` in
  `voicing-explore.js` on the engine's exported `barNeighbours` (rag
  bar 9 looks back past 5–8 to bar 4). The Analyze view's own `motion`
  still uses the raw predecessor, by design.