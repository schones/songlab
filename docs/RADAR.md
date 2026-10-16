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

- **[2026-10-16] `/voicings` link in the top nav.** Decide placement
  (Explorer menu vs top level) now that it is a main tool.
  See: `templates/base.html` nav; `docs/STATUS.md` Voicing Explorer
  "Open / deferred".

- **[2026-10-16] Three unpinned Salamander URL maps.**
  `audio-bridge.js`, `keyboard-view.js`, `intro-audio.js` each carry
  the same sample map against the unversioned GitHub Pages URL;
  `/voicings` uses the vendored, commit-pinned copy in
  `static/vendor/salamander/`. Consolidate the three onto it when
  `keyboard-view.js` opens up (do-not-touch).
  See: `static/vendor/salamander/README.md`; `static/shared/voicing-player.js`.

- **[2026-10-16] Salamander CC BY attribution owed app-wide.** The
  samples are CC BY 3.0 (Alexander Holm); the vendor README carries
  the notice, the app does not. Footer or About page.
  See: `static/vendor/salamander/README.md`.

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

- **[2026-10-16] Explore: motion from the most recent bar WITH a
  voicing.** The engine's "into" motion uses the performance
  predecessor's last event; where that event has an empty voicing
  (rag bar 8, bare octave basses) motion is n/a. Session 6 ranking
  should look back to the latest bar that has a voicing.
  See: `voicing-analysis.js` `_predecessors()`; SESSION_LOG 2026-10-15 (evening).

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
  discounts; no current bar would move.
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

## Retired
(empty — items move here when resolved, for short-term reference, then
get cleared periodically.)