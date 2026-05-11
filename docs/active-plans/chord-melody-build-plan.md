# Chord/Melody Classifier — Build Plan

> Companion docs:
> - [`docs/chord-melody-classification.md`](../chord-melody-classification.md) — the design
> - [`docs/chord-melody-test-corpus.md`](../chord-melody-test-corpus.md) — the MIDI test corpus
> - [`docs/chord-melody-audio-corpus.md`](../chord-melody-audio-corpus.md) — the audio test corpus (deferred)
>
> This doc is the project-management layer for the chord/melody
> classifier rebuild. The design doc owns the rule and the
> rationale; this doc owns the sequencing, session structure, and
> risk tracking. Defers to the design doc for content; doesn't
> duplicate.

---

## Status

**2026-05-11** — Session 1 complete (OQ1 resolved; TempoState
landed and wired to cantor's main page). Next session: Session 2
(chord-resolver power-chord extension + OQ5 verification).
Branch: `audio-onset-analysis`. Test corpus formalized (26 tests;
22 ok, 4 pending). Regenerate script in place. No classifier code
yet.

---

## Sequencing decision

**Test-driven build.** Rather than building a full harness up
front and then the classifier, build them together: each
classifier feature comes with the harness comparison logic for
the test cases it enables. Avoids designing the comparison
contract speculatively; lets it accrete with concrete consumers.

Order:

1. OQ1 resolution (tempo state location)
2. chord-resolver power-chord extension + root identification verification (OQ5)
3. Classifier features paired with harness comparison logic
4. Parameter tuning against the corpus
5. cantor-view integration

See "Session-by-session plan" below for breakdown.

---

## Definition of done (for this arc)

The chord/melody arc is *done* when:

- All Tier 1 corpus tests pass (T1.1–T1.4)
- All Tier 2 corpus tests pass (T2.1–T2.7)
- All chord-state tests pass (C.1–C.6)
- All dyad-escalation tests pass (D.1–D.5)
- Parameters tuned and final values documented in the design doc
- cantor-view consumes classifier output instead of `_splitPoint`
- Branch ready to merge to dev (whether it actually merges this
  week or later is a separate question)

Explicitly *not* required for done:
- Tier 3 tests (T3.1–T3.3) — known failures, deferred to
  voice-leading work
- M.1 — pending until transcription
- Audio corpus — deferred until MIDI corpus passes
- Audit doc update on `audio-onset-analysis` — independent thread
- Rendering treatment for declared vs implied chord (OQ2) —
  prototype after classifier works

This boundary matters. The "but this is load-bearing, I want it
to work" framing is true and important; it can also be used to
justify indefinite extension. If the eight items above are true
at the end of next week, the arc is done — even if other things
remain open.

---

## Session-by-session plan

Each session is sized at roughly one focused work-block (2-4
hours). Some sessions might split, some might combine. Use these
as a structural guide, not a rigid schedule.

### Session 1 — OQ1 resolution (tempo state)

**Pre-work:** None.

**Goals:**
- Decide where tempo state lives (design doc OQ1).
- Implement: tempo state accessible to the classifier; visible,
  editable input on cantor's main page.
- Update design doc: mark OQ1 resolved, document decision.

**Risk:** Tempo input might need to coordinate with existing
Tone.js transport state. Surfaceable in planning conversation
before code.

**Definition of done:** Tempo state exists, cantor's main page
has a tempo input, design doc OQ1 marked resolved.

### Session 2 — chord-resolver power-chord extension + OQ5 verification

**Pre-work:** Read `static/shared/chord-resolver.js` (or
wherever it lives) before the session. Specifically: how does it
identify the root for inversions? If unclear, that's the work to
do in this session.

**Goals:**
- Add power-chord template (`quality: '5'`, `intervals: [0, 7]`,
  `priority: 4`).
- Verify root identification works for inversions of all
  supported chord qualities. Extend if not.
- Existing chord-resolver tests still pass; add a test for
  power-chord matching.
- Update design doc: mark OQ5 resolved.

**Risk:** Root identification might not handle inversions
correctly. If so, this session expands. Front-loading the read
during pre-work surfaces this risk before the session starts.

**Definition of done:** Power chords match, root identification
verified for all qualities, OQ5 resolved.

### Session 3 — Foundation harness + T1.1

**Pre-work:** None.

**Goals:**
- Build minimum harness: load JSON spec, replay MIDI sequence
  into `MusicalEventStream`, capture classifier output, compare
  against expected outcomes.
- Implement classifier minimum: sounding-set tracking, basic
  continuous state emission, `nothing` and `melody` cases.
- T1.1 (single sustained note) passes.
- Establish the comparison contract for "single melody interval."

**Risk:** This is the session where the comparison contract
decisions surface. Plan for it to be one session; don't be
surprised if it stretches into a planning conversation that
produces a follow-up implementation session.

**Definition of done:** Harness exists, T1.1 passes, comparison
contract documented (in this build plan or in a new doc — TBD
during the session).

### Session 4 — Tier 1 complete + chord declaration

**Pre-work:** None.

**Goals:**
- Add chord-template-matching path.
- Basic `chord(declared, identity)` emission (no state
  machinery yet).
- T1.2, T1.3, T1.4 pass.

**Risk:** Low — this is mostly translation from the design doc
to code.

**Definition of done:** All four Tier 1 tests pass.

### Session 5 — Chord-state machinery + Tier 2 + chord-state tests

**Pre-work:** Re-read design doc Section 2 ("classification
logic") and Rationale §7 ("why chord state persists until root
release") and §8 ("why chord identity updates"). The chord-state
machinery is the most subtle part of the classifier; entering
the session with a fresh model of the rule pays off.

**Goals:**
- Chord identity tracking (current chord + root tracking).
- Root-release-ends-chord behavior.
- Implied-chord state on partial release.
- "Meaningfully different" chord identity update logic.
- Melody-on-top behavior.
- T2.1–T2.6, C.1–C.6 pass. Note that T2.6 depends on root
  identification for inversions (resolved in session 2).

**Risk:** Highest of any session. The chord-state machinery has
real subtlety — the dyad-clock-restart rule, the "meaningfully
different" comparison, the lift-and-re-press case. Likely to
spawn at least one design conversation mid-session.

**Definition of done:** All Tier 2 + chord-state tests pass.

**This session might split into two.** That's fine. The
splitting point is naturally between the basic chord-state
transitions (declared → implied → ended) and the more nuanced
identity update + melody-on-top logic.

### Session 6 — Recent-attack buffer + dyad escalation + remaining tests

**Pre-work:** None.

**Goals:**
- Tempo-relative window for clustering recent attacks
  (CHORD_CLUSTER_WINDOW).
- Dyad-escalation logic: sustain threshold, repetition threshold,
  perfect-fifth-only escalation, dyad-clock-restart on
  chord-state transition.
- T2.7 (cluster-window probe), D.1–D.5 pass.

**Risk:** Medium. The dyad-escalation logic interacts with the
chord-state machinery in ways that need careful sequencing
(e.g., D.5 depends on the dyad-clock-restart rule from chord
identity ending).

**Definition of done:** Full corpus passes except Tier 3
(documented known-failures) and M.1 (pending).

### Session 7 — Parameter tuning + cantor-view integration

**Pre-work:** None.

**Goals:**
- Run full corpus, observe where parameter values affect
  outcomes.
- Tune CHORD_CLUSTER_WINDOW, DYAD_SUSTAIN_THRESHOLD,
  DYAD_REPETITION_THRESHOLD, DYAD_REPETITION_WINDOW.
- Document final parameter values in design doc.
- Wire cantor-view to subscribe to classifier output.
- Remove `_splitPoint` register-based filtering.
- Verify cantor visualization behavior preserved or improved.

**Risk:** If no parameter set satisfies all tests, back in
design space. Possibly need to modify the rule or accept some
tests as known-failures with rationale.

**Definition of done:** Tuned parameters documented, cantor-view
consuming classifier output, branch ready to merge to dev.

### Session 8 (buffer) — Loose ends, cleanup, merge prep

**Pre-work:** None.

**Goals:**
- Whatever didn't fit in earlier sessions.
- Possibly: rendering treatment for declared vs implied chord
  (OQ2 prototype).
- Possibly: documenting tests that don't pass at acceptable
  parameter values (known-limitations section in design doc).
- Updating STATUS.md to reflect merged state.
- Handoff prep for the next arc (gamification/BeatLab planning
  inherits from `docs/active-plans/`).
- Frame the post-Cantor tempo architecture review. Either start
  the use-case mapping in this session or spawn a
  `docs/active-plans/` doc for the next arc. See backburner
  section for inventory.

**Risk:** None — this is the absorption layer.

**Definition of done:** Arc closed. Branch merged to dev (or
explicitly held with a documented reason).

---

## Risks and what would push the timeline

- **OQ5 (root identification) needs real work.** Mitigation:
  read chord-resolver.js Sunday before week starts.
- **Comparison contract has surprises.** Mitigation: session 3
  is sized to allow for this; if it stretches, OK.
- **Chord-state machinery surfaces design questions.** Mitigation:
  pre-read in session 5; if questions arise, stop and have the
  planning conversation rather than building through them.
- **Parameter tuning doesn't converge.** Mitigation: known risk;
  acceptable response is to mark some tests as known-failures
  rather than force them.
- **Life happens.** No mitigation; absorb via the buffer session
  (8) and accept that "next week" might mean 6 days instead of 5.

---

## What stays backburner during this arc

- Audit doc on `audio-onset-analysis`
  (`docs/audio-analysis-orchestration.md`) — stale, needs update,
  but doesn't block chord/melody work.
- Gamification work — `game-flow.js` extraction, adaptive engine
  standardization. Forward plan in `docs/active-plans/` (separate
  doc).
- BeatLab — never specced. Forward plan in `docs/active-plans/`.
- T3.2 source selection.
- M.1 transcription.
- Post-Cantor tempo architecture review. The chord/melody classifier
  introduces TempoState (`static/shared/tempo-state.js`) as a new
  tempo-bearing module. Pre-existing tempo state lives in:
  `harmony-state.js`'s `progressionState.tempo` (trainer progression
  auto-advance), `skratch-studio` (Tone.Transport playback,
  `sandbox._bpm`, `bpmSlider`/`bpmInput` UI), `rhythm/rhythm.js`
  (beat practice via `createBpmSlider` + localStorage),
  `games/polyrhythm.js` (adaptive polyrhythm practice with
  `BPM_FLOOR`/`CEILING`), and `games/relative-key-trainer.js`
  (hardcoded `const BPM = 100`). Plus data-file fields
  (`walkthroughs.js`, `song-examples.js`) — these are song metadata,
  not runtime state, and out of scope. Review during Session 8
  handoff: for each runtime tempo-bearing subsystem, document use
  case, writer, reader, and observable harm (if any) from
  independence. Decide whether to spawn a dedicated arc, write a
  planning doc, or accept independence as the correct design.

---

## Change log

### 2026-05-07 — Plan created
Initial sequencing decision (test-driven build, OQ1 →
chord-resolver → classifier+harness). Session-by-session plan
drafted. Definition of done established. Risk tracking started.

### 2026-05-11 — Session 1 complete (OQ1 resolution)
- Created static/shared/tempo-state.js (default 120, clamped 1–300,
  pub/sub mirroring HarmonyState).
- Wired tempo input on cantor's main page to TempoState.
- OQ1 resolved in docs/chord-melody-classification.md.
- Backburner entry added for post-Cantor tempo architecture review;
  Session 8 goals updated.
- Self-test invocation comment in tempo-state.js fixed to use the
  pipe-to-node form.