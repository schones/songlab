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

- **[2026-05-12] sus2/sus4 cross-template inversion equivalence in
  chord-resolver.** {root, M2, P5} = {root+5, P4, P5} — every sus4
  PC set is also a sus2 PC set from a different root, and vice
  versa. With both at priority 2 and sus2 listed first, unbiased
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
  polyrhythm/, relative-key-trainer. Unification deferred to Session
  8 of chord/melody arc.
  See: `docs/active-plans/chord-melody-build-plan.md` backburner section.

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