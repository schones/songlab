# Session Log

Reverse chronological. Quick capture after each session: what happened, what was decided, what's next.

## 2026-05-11 — Session 1 of chord/melody arc: tempo state (OQ1 resolution)

### Landed
- `static/shared/tempo-state.js` — new module. Singleton with pub/sub
  mirroring HarmonyState conventions. `get()`/`getBPM()` both return
  current BPM; `setBPM(v)` coerces via Number, no-ops on NaN, clamps
  to [1, 300], notifies unconditionally; `on(fn)` returns
  unsubscribe; `reset()` restores 120 and notifies. Self-tests
  (commented IIFE block at bottom): 16/16 passed.
- `templates/cantor.html` — added tempo input (`<label>` + `<input
  type="number">`) in the `.cn-hardware` row, wired inline via
  `<script type="module">` block: imports TempoState, subscribes for
  external updates (skips when input is focused), `change` listener
  writes to TempoState and reflects clamped value back. Also added
  HTML comment near top of file documenting that cantor's main-page
  JS lives inline rather than in a separate module.
- `docs/chord-melody-classification.md` — OQ1 marked resolved with
  decision documented: option 1 (new shared module), scope explicitly
  user-input tempo only, deferred unification noted.
- `docs/active-plans/chord-melody-build-plan.md` — added backburner
  entry for post-Cantor tempo architecture review (inventory of all
  tempo-bearing subsystems); added Session 8 goal pointing back to
  that backburner entry; added 2026-05-11 change-log entry for
  Session 1 completion; updated Status block to reflect Session 1
  complete and Session 2 next; reconciled Session 1 description
  (removed stale "option 3" reference).

### Diagnosed / decided
- **Tempo state architecture: option 1, not option 3.** Initial
  build-plan favoring was option 3 (module-scoped in cantor-view.js).
  Pivoted to option 1 (new shared module) once we recognized the
  cantor tempo input is itself a near-term second consumer, making
  the "v1 module-scoped, revisit later" framing inappropriate. A
  tiny pub/sub module is barely more friction than module-scoped
  state and leaves a clean handoff point for the Session 8 tempo
  architecture review.
- **Per-tool tempo, not global.** A grep across `static/` for
  `tempo|bpm|BPM` surfaced five distinct runtime tempo subsystems
  (`progressionState.tempo` in harmony-state; SkratchLab's
  Tone.Transport/sandbox._bpm; `rhythm/rhythm.js`;
  `polyrhythm.js`; hardcoded BPM in relative-key-trainer) plus
  data-file metadata (out of scope). Each serves a different
  use case; unifying now would be premature. Each tool legitimately
  has its own tempo. Decision: TempoState owns user-input tempo
  only; unification deferred for Session 8 review with explicit
  framing (use case, writer, reader, observable harm if any from
  independence).
- **No Tone.Transport coupling on TempoState.** Cantor doesn't use
  Transport, so the classifier doesn't need it. If a future feature
  wants playback synced to the user's tempo, it reads from
  TempoState. Transport stays downstream of the source.
- **HarmonyState convention on notify-on-no-change: always notify.**
  Confirmed by reading `update()` and `_notify()`. No equality check.
  TempoState mirrors this for consistency — subscribers are expected
  to be idempotent enough that a redundant notify is fine.
- **Discovery: cantor's main-page JS lives inline in
  `templates/cantor.html`**, not in a separate JS module. Added a
  small HTML comment at the top of cantor.html so the next person
  working on cantor finds this immediately.

### Setup for next session
- Branch: `audio-onset-analysis`, ahead of origin by Session 1 commit.
- Working tree clean after Session 1 commit.
- Session 2: chord-resolver power-chord extension + OQ5 root-id
  verification. Pre-work (reading chord-resolver.js for root
  identification) completed Sunday — no inversion fix needed in the
  resolver itself; the classifier will handle PC-to-MIDI mapping
  separately. Three observations from that read documented in the
  Session 2 context: PC vs MIDI distinction, preferredRootPC
  parameter (not blocking), exact-PC-count match requirement (right
  signal for melody-on-top detection).

### Calibration notes
- **Read-before-reasoning paid off twice this session.** First,
  reading harmony-state.js before drafting tempo-state.js surfaced
  the right conventions (export style, `on()` not `subscribe`, the
  always-notify pattern, the commented-IIFE self-test scaffold).
  Second, the grep for tempo/BPM across `static/` reframed the
  unification question from "should we unify with one other place"
  to "do we want a global tempo abstraction" — a much more honest
  framing of what was being decided. Both moments would have been
  much weaker if I had drafted from priors.
- **The grep that returned nothing surfaced a working-directory
  bug, not a clean codebase.** Initial grep returned zero matches
  for `tempo|bpm|BPM` in `static/`, which I correctly flagged as
  suspicious rather than accepting the result. Was scoped to the
  wrong directory. Good instinct to push back on a too-clean answer.
- **Prompt-splitting was the right call.** The original draft
  bundled three concerns (module + UI + docs) into one Claude Code
  prompt. Splitting into module-first/UI-second meant Prompt 1
  could verify (self-tests pass) before anything depended on it.
  Pattern worth repeating on future sessions.
- **Stale doc references catch up with you.** The build plan
  Session 1 description still said "option 3" after the conversation
  pivoted to option 1. Caught at end-of-session via the discrepancy
  between the resolution language and the planning language. Worth
  watching for in future arcs: when a planning doc references a
  resolution from a design doc, the planning doc needs to be kept
  in sync, not just the design doc.

### Flagged for later
- **Post-Cantor tempo architecture review** (Session 8). Inventory
  captured in build plan backburner section. Framing: for each
  runtime tempo-bearing subsystem, document use case, writer,
  reader, and observable harm (if any) from independence. Decide:
  spawn dedicated arc, write planning doc, or accept independence
  as the correct design.
  - **OQ1 namespace collision across docs.** Two design docs each have
  their own OQ1: `chord-melody-classification.md` OQ1 (tempo state,
  resolved 2026-05-11) and the audio-interpreter-audit OQ1 (MIDI
  publishing path, still open). STATUS.md references both and the
  ambiguity is real — a reader has to know which doc's OQ1 to know
  what's being discussed. Disambiguated in the 2026-05-11 STATUS
  update with a clarifying parenthetical. As more design docs
  accumulate their own OQs, this will get worse. Possible
  conventions: prefix references with doc name (e.g.,
  `chord-melody/OQ1`, `audio-interpreter/OQ1`), or rename OQs
  once-globally. Not urgent; flag for whenever the next design doc
  introduces its own OQ1.
- **harmony-state.js self-test invocation comment is stale.** Uses
  the direct-file form (`node --input-type=module
  static/shared/harmony-state.js`), which is blocked on the current
  Node version. The piped form (`cat ... | node ...`) is the working
  invocation. Not fixing now since harmony-state.js is on the
  do-not-touch list; flag for when it comes off the list.
- **No durable "codebase architecture notes" doc exists.** During
  end-of-session, briefly considered where to record "cantor's JS
  is inline." STATUS.md (turnover), WORKING_STYLE.md (conventions,
  not facts), and cantor-design.md (design intent, not
  implementation) all the wrong fit. Landed on a comment in
  cantor.html itself. If similar facts accumulate, a
  `docs/architecture-notes.md` or equivalent might earn its place.
  Not creating prematurely.

### Out of scope / deferred
- Tone.Transport coupling on TempoState — deliberately not done; no
  consumer needs it.
- Tempo inference from input — future feature; TempoState's pub/sub
  is ready for it.
- Unification of all tempo-bearing subsystems — deferred to Session
  8 review.
- Bounds tightening (e.g., minimum BPM of 40 rather than 1) — left
  permissive on TempoState; UI input enforces its own `min`/`max`
  for the user-facing case.

## 2026-05-07 — Test corpus formalization (regenerate script + corpus edits)

### Landed
- `tools/regenerate-test-json.py` (new). Parses
  `docs/chord-melody-test-corpus.md` and emits one JSON file per
  test in `tests/chord-melody/specs/`, plus `_manifest.json`.
  Strict on MIDI sequence parsing; lenient on expected-outcome
  prose (captured as raw text). Recognizes pending tests (no
  fenced MIDI block) and emits them with `status: "pending"` plus
  a `pending_reason` field. Schema includes `trailing_notes` as a
  list (M.1 has two trailing italic blocks; the schema needs to
  accommodate that). Python stdlib only, 3.10+.
- Test corpus edits: T2.6 reframed as a fast-roll inversion case
  (notes sustain, not a CHORD_CLUSTER_WINDOW probe); T2.7 added
  as the synthetic cluster-window probe (three repeated C-major
  rolls separated by silence); D.4's MIDI expanded from a prose
  transformation of D.3 into an explicit fenced block; T2.6 minor
  third / minor sixth annotation fixed; T2.7 closing paragraph
  italic markers restored. Design doc parameter table updated to
  reference T2.7 instead of T2.6 for CHORD_CLUSTER_WINDOW tuning.
- Generated 26 JSON specs (22 ok, 4 pending: M.1, T3.1, T3.2,
  T3.3) under `tests/chord-melody/specs/`.

### Diagnosed / decided
- **JSON schema for expected outcomes: prose blob (option 3), not
  structured.** Considered three options for how the parser
  handles expected outcomes — fully structured intervals, mixed
  structured-plus-prose, or raw prose blob. Settled on prose blob
  because the harness doesn't exist yet and the comparison
  contract (what counts as pass/fail at the per-test level)
  hasn't been designed. Locking in a structured schema now would
  bake in guesses. Schema can be extended incrementally per-test
  as the harness's needs surface.
- **Test-driven build sequencing.** Rather than building a full
  harness up-front and then the classifier, decided to build the
  harness alongside the classifier: each new classifier feature
  brings the comparison logic for the test cases it enables.
  Avoids designing the comparison contract speculatively. Order:
  OQ1 (tempo state) → chord-resolver power-chord extension →
  classifier features paired with their corresponding harness
  comparison logic.
- **T2.6 vs T2.7 split.** Initial T2.6 draft tried to be both a
  fast-roll inversion test and a CHORD_CLUSTER_WINDOW probe.
  Realized mid-draft that with all notes sustaining to overlap,
  the chord is detectable from the held set alone — so the test
  doesn't actually isolate the cluster window from the
  sounding-set rule (same critique already documented for T2.1).
  Split into two tests: T2.6 covers the inversion case
  realistically, T2.7 covers the cluster-window probe with three
  repeated rolls separated by silence (which probes the
  upper-bound constraint: window wide enough to cluster
  within-roll attacks, narrow enough that adjacent rolls don't
  merge).
- **M.1 Mario stays pending.** Considered swapping in a synthetic
  rolled chord under the M.1 ID, but the M.x tier is reserved
  for real-world musical excerpts. Quietly redirecting the
  content under an existing ID would violate the corpus's
  conventions. T2.7 is the synthetic version; M.1 stays as the
  eventual real-world test (with a note that a different piece
  may end up replacing the Mario reference).
- **Schema field: `trailing_notes` (list), not `trailing_note`
  (single string).** Discovered when M.1 emitted with the wrong
  trailing note captured — M.1 has two trailing italic blocks
  (the substantive note about the cluster-window constraint, and
  a metadata note about transcription status). Schema changed to
  always emit a list, empty if no trailing notes exist (not
  null), in source order. Cleaner harness logic later.

### Setup for next session
- Branch: `audio-onset-analysis`. Working tree clean after this
  session's three commits.
- Commits this session (in order): corpus content edits; new
  regenerate script; generated JSON specs.
- The regen script is the canonical path from corpus Markdown to
  JSON. Per the corpus working agreement (item 6), run it after
  any corpus edit and commit the JSON alongside the Markdown
  change.

### Calibration notes
- Reading code/content before reasoning paid off again. The T2.6
  vs T2.7 issue surfaced only because we walked through the
  classification logic event-by-event for the proposed test —
  initially the mistake (one test trying to do two things) was
  invisible. The "before forming a hypothesis about a bug,
  characterize the symptom" rule from WORKING_STYLE generalizes
  to "before locking in a test, walk through what the classifier
  actually does."
- The autonomous-optimization detour (mid-session question about
  whether Claude Code could optimize the classifier from logs)
  was worth pushing back on. The corpus encodes design decisions,
  not just behavior — autonomous parameter tuning would Goodhart
  the corpus. Diagnostic logging is fine; autonomous tuning loop
  is not. Worth keeping that line clear as the classifier work
  progresses.
- "Will Claude Code edit a complex set of changes correctly?" —
  yes, with the right prompt structure. The find-and-replace
  pattern with explicit reasons per edit (so Claude Code can
  recover when find-text doesn't match exactly) worked cleanly
  for both the corpus edits and the schema change.

### Flagged for later
- M.1 transcription. The current placeholder references Super
  Mario Bros. Ground Theme measure 10. Two paths: (a) transcribe
  it by hand (Dustin only — Claude can't read copyrighted score
  imagery), or (b) substitute a different real-world piece with
  rolled chords (Chopin nocturne, Joplin rag, etc.) when willing
  to do the transcription work. T2.7 covers the synthetic case
  in the meantime.
- T3.2 source selection. The "Bach two-part invention or similar"
  prose is unselected. Needs a separate decision-making session.
- The audit doc on `audio-onset-analysis`
  (`docs/audio-analysis-orchestration.md`) is still stale.
  Independent thread; not blocking chord/melody work, but should
  be done before the original-goal Phase 2 prompt can be drafted
  cleanly.
- Gamification planning (game-flow.js extraction, adaptive-engine
  standardization) and BeatLab design conversation — both still
  backburner.

### Out of scope / deferred
- Test harness implementation. Decided to build incrementally
  alongside the classifier rather than as a unit up front.
- Structured-expected-outcome schema. Stays as prose blob until
  the harness has a comparison contract that drives the shape.
- M.1 and T3.2 MIDI transcriptions. Stay pending; the parser
  handles them correctly with status=pending.
- Autonomous classifier optimization based on log output.
  Considered briefly, declined: the corpus encodes design
  decisions, not just behavior, and autonomous tuning would
  Goodhart it. Diagnostic logging for human-driven tuning is
  appropriate; autonomous tuning loop is not.

## 2026-05-06 / 2026-05-07 — Chord/melody classification design
Two-day design session (Wednesday morning + Thursday morning, with
an overnight gap). Originally intended as a planning chat to draft
a Claude Code prompt for Phase 2 of the Cantor audio-onset-analysis
migration. Pivoted to a deeper question after testing on cantor
revealed both an architectural finding and a design problem in the
chord/melody classifier.
Landed
Three new design docs on audio-onset-analysis:

docs/chord-melody-classification.md — design doc for the
chord/melody classifier (v1). Defines the classification rule,
rationale, parameters, build progress checklist, open questions,
deferred work, and change log. The "Working agreement" section
at the top establishes the doc as the durable home for this
design — read at start of every session, all changes reflected
here before code lands.
docs/chord-melody-test-corpus.md — MIDI test corpus. 19 tests
across 5 categories (Tier 1 foundational, Tier 2 design-probe,
chord-state, dyad-escalation, real-world Mario test, Tier 3
forcing-functions for voice-leading). Each test has a MIDI
sequence sketch, expected classification, and stated purpose.
Corpus is the canonical Markdown source; JSON specs (per-test
files in tests/chord-melody/specs/) are derivatives produced
by tools/regenerate-test-json.py (not yet written).
docs/chord-melody-audio-corpus.md — audio (WAV) test corpus
companion. Same musical scenarios as MIDI corpus, but rendered
as WAVs through Logic Pro and tested via the AudioInterpreter →
classifier pipeline. Implementation deliberately deferred until
MIDI corpus is passing — sequencing rule documented in the
working agreement so audio failures can be cleanly attributed
to AudioInterpreter rather than the classifier.

No code changes this session. Phase 2 prompt was not drafted —
see "Out of scope / deferred" below.
Diagnosed / decided
Phase 1 of the audio migration did more consolidation than the
audit doc reflects. Started the session intending to draft a
Phase 2 Claude Code prompt against the audit doc's "Notable
findings" section. Verification grep on cantor.html showed:

Notable A's cited line numbers (455-457, 839) don't exist in
the current 828-line file.
Cantor.html now routes all AudioInterpreter lifecycle through a
single _reconcileAudioInterpreter funnel (7 call sites, all
going through the funnel rather than scattered ad-hoc triggers).
A comment block at lines 473-479 documents the design post-Phase-1.
Notable B (silence watcher): v0 owns it (silenceWatcherId at
audio-interpreter.js:278). Cantor's silence-watcher copy is dead
code.

The audit doc was largely written before Phase 1 landed. Decided
to update the audit doc as a living document on audio-onset-analysis
to reflect post-Phase-1 reality, but deferred this work —
mid-session pivot to chord/melody classification took priority.
Audit doc remains stale; flagged for later.
Live testing on cantor revealed a hard C4 cutoff in the melody
constellation. Cantor was filtering notes ≤ MIDI 60 out of the
melody constellation via _splitPoint = MELODY_SPLIT_PITCH_DEFAULT
in cantor-view.js (line 669: if (ev.pitch <= this._splitPoint) return;). This was a known design — register-based melody/
accompaniment split — but seeing it in test bit me because the
specific test (C-E-G triads at C4) landed exactly on the boundary.
Concluded: register-based split is the wrong primitive. Chord vs
melody is a role/temporal question, not a pitch-region question.
Designed a v1 chord/melody classification rule. Multiple
iterations and acknowledged reversals through the design
conversation; settled on:

Maintain a sounding set + a tempo-relative recent-attack buffer.
Combine into an "effective sounding set."
Once a chord template matches → declare chord. Chord identity
persists until the root releases. Partial release of non-root
tones produces "implied chord" state with reduced confidence.
Chord identity updates if a new chord template matches the
sounding set (e.g., adding B♭ to held C-E-G updates to C7).
Octave doublings of existing chord-tones don't count as
meaningfully different.
Melody-on-top: notes added to a held chord that don't form a
new chord template are melody; chord state persists.
Dyads: classify as melody by default. Escalate to power chord
if (sustained ≥ threshold) OR (repeated ≥ threshold within
window) — but only perfect fifths escalate (other intervals
don't have unambiguous "this is the root" interpretation).
Dyad clock restarts when chord identity ends — pre-chord
history doesn't carry forward into post-chord residual dyads.
Tempo is a first-class concept, user-set (visible editable input
on cantor's main page). Window sizes scale with tempo.

Rejected alternatives, all documented in the design doc's
Rationale section: register-based (the prior implementation),
sounding-set-only (fails on rolled chords like Mario Ground Theme
m.10), attack-pinned classification (fails on melody-resolving-to-
chord case), "release any chord-tone ends chord" (too brittle),
"release all chord-tones ends chord" (too forgiving).
Endpoint vision: voice-leading-aware classification. The interim
rule is deliberately stepping-stone-shaped — continuous state
emission, sounding-set-as-primitive, tempo-relative windows all
generalize naturally to voice-tracking.
Decided on Markdown-as-canonical for test corpus. Tests are
hand-written prose in the corpus doc; JSON specs are derivatives
regenerated by a Python script. Initially considered JSON-as-source

render script; inverted because the artifact humans interact with
most often (the doc) should be the source-of-truth. JSON regenerated
post-edit, committed alongside Markdown changes. Per-test files
(many small files in specs/) preferred over single corpus.json
for git-friendly diffs.

Decided on MIDI corpus before audio corpus. Audio testing tests
the full AudioInterpreter + classifier pipeline; MIDI testing tests
the classifier in isolation. Until the classifier is verified via
MIDI tests, audio failures can't be cleanly attributed. Audio corpus
structure laid out now (so it doesn't get forgotten) but
implementation deferred until MIDI corpus passes.
Setup for next session
Branch: audio-onset-analysis. Three new docs in docs/ need to
be committed:

docs/chord-melody-classification.md
docs/chord-melody-test-corpus.md
docs/chord-melody-audio-corpus.md

Working tree before commits: should be clean apart from these three
new files. Verify with git status before committing.
Next session's natural starting point: write tools/regenerate-test-json.py

JSON schema for individual test specs. This is bounded scope
(parser + validator + writer), low risk, and unblocks the test
harness work that follows. The corpus doc's "How JSON specs work"
section establishes what the script needs to do.

After that: test harness (synthesizes events into
MusicalEventStream, captures classifier output, compares against
expected). Then chord-resolver.js extension to add power-chord
template ({quality:'5', intervals:[0,7], priority:4}). Then the
classifier itself.
Calibration notes
Wall-clock time across sessions is invisible to Claude. This
session spanned Wednesday morning + Thursday morning (with sleep
gap), and Claude couldn't tell that a day had passed without me
saying so. Worth establishing a session-start/session-end timestamp
ritual — paste the date and time when opening and closing a chat
session — so future-Claude has a clear picture of session boundaries.
The audit doc's line citations were stale because they predated
Phase 1. Lesson: when a design doc has line-level citations into
implementation files, those citations rot fast. Either treat them
as approximate ("around line N") or commit to updating them every
time the implementation moves. The grep-based verification we did
this session (find-the-actual-call-sites) was much more reliable
than reading line numbers from the doc.
"Test something simple first" can mislead if the simple test
lands on a design boundary. The C-E-G triad at C4 we tried as a
"basic" test happened to fall exactly on cantor's C4 melody/
accompaniment split. The test failed not because the system was
broken but because we picked a test scenario that the design
deliberately filtered. Lesson: when designing tests, deliberately
choose scenarios that land away from known boundaries unless the
boundary is what's being tested.
Reasoning my way through a design with multiple reversals is OK
when each reversal is driven by a real case the previous rule
fails — but worth naming honestly. I argued for combined rule →
sounding-set-only → combined rule again over the course of the
chord/melody conversation. Each pivot was driven by a case Dustin
raised that the previous rule failed (Mario rolled chords for the
combined-vs-sounding-set pivot). The reversals weren't random; they
were converging toward the case-coverage the design needs. But
acknowledging "I was wrong because X" rather than silently pivoting
matters.
Flagged for later
Audit doc on audio-onset-analysis is stale. docs/audio-analysis-orchestration.md
in particular needs updating to reflect post-Phase-1 cantor reality:
Notable A (implicit start triggers in MIDI/device-change handlers)
is resolved by _reconcileAudioInterpreter funnel; Notable B
(silence watcher) classification is (a) absorbed by AudioInterpreter
v0; line citations throughout are stale. Could be done as living
doc edit (matching STATUS.md cleanup pattern) or as additive section
("Post-Phase-1 reconciliation"). Living doc edit consistent with
recent platform conventions.
Phase 2 of the audio migration was not drafted this session.
The original goal. Phase 2 is now closer to a verify-and-tidy pass
than a refactor (Phase 1 did most of the consolidation). Could be
done in a future session once the audit doc is updated. Not
blocking the chord/melody work — they're independent threads.
Tempo placement on cantor's main page. Decided it should be a
visible, editable input. Where exactly it lives in the UI and what
the styling looks like is unanswered. Not a today decision; flagged
in the design doc as a v1 requirement.
OQ5 — root identification for inversions. The chord-state
machinery depends on chord-resolver.js correctly identifying the
root for all inversions of all supported chord qualities. Need to
verify this before the classifier can rely on "release the root"
behavior. Flagged in the design doc.
Cantor C4 split documentation gap. The C4 melody/accompaniment
split is a real design feature with no durable home — I knew about
it from a past discussion but had to rediscover it during testing.
The chord/melody classification design doc replaces this design
when it lands, so the gap will close as a side effect. But the
broader pattern — undocumented design decisions biting later —
motivates the "durable home for design decisions" working agreement
in the new doc.
Out of scope / deferred

Phase 2 Claude Code prompt — original session goal, replaced
by chord/melody design when testing surfaced a more fundamental
question. Phase 2 still needs to happen but is not blocked by
chord/melody work.
Audit doc update — see "Flagged for later." Required before
Phase 2 prompt can be drafted cleanly, but not required for
chord/melody work.
Test harness implementation — deferred to next session.
Bounded scope, low risk, but better fresh than tired.
Audio corpus implementation — deferred until MIDI corpus
passes. Sequencing rule documented in audio corpus working
agreement.
Voice-leading-aware classification — deferred indefinitely.
Eventual endpoint; interim rule is stepping-stone-shaped toward
it. See design doc "Deferred to future work" §1.
Tempo inference from input — deferred indefinitely. May
belong to BeatField/BeatLab work. v1 takes user-set tempo. See
design doc "Deferred to future work" §2.
Implied chords beyond dyad-escalation and partial-release —
drone+melody, monophonic outlining, ostinato implication.
Deferred alongside voice-leading work; shares infrastructure.
See design doc "Deferred to future work" §3.
Backburner threads from Wednesday's handoff (gamification
planning, BeatLab spec) — not surfaced this session because
chord/melody work consumed all available bandwidth. Carry
forward to next handoff.

For full design conversation context, see Claude.ai chat from
2026-05-06/2026-05-07 (chord/melody classification design session).


## 2026-05-05 — OQ1 resolved (MIDI publishing path)

### Decided
- **OQ1 from `audio-interpreter-design.md` §11: option (a).**
  AudioInterpreter is the only interpreter-style module.
  Note-trigger sources (MIDI, on-screen keyboard, future
  SkratchLab loop pedal keyboard layers, Blockly music-engine
  triggers) publish inline at the trigger site, tagged with
  `source: '<surface>'`. Audio sources route through
  AudioInterpreter, regardless of whether the source is a live
  mic or a Tone.Player replaying recorded buffers.
- Phase 2 of the Cantor migration is now drafttable. Its shape:
  consolidate AudioInterpreter as the single audio publisher in
  cantor.html, document and enforce the source-tagging convention.
- Resolution written into `docs/audio-interpreter-design.md` §11
  (OQ1) and §12 (phasing).

### Diagnosed / decided
- The (b) framing in the original OQ1 implicitly assumed MIDI was
  the only other publisher candidate. Greps against
  `static/skratch-studio/` revealed a richer landscape:
  `loop-pedal.js` records and replays both keyboard-note layers
  (via `Tone.Part` — discrete note events) and microphone audio
  layers (via `MediaRecorder` → `Tone.Player` — audio buffers).
  Neither path currently publishes to MusicalEventStream, but both
  are intended cross-tool flows for SkratchLab → Cantor /
  Harmonograph reactivity.
- This collapses to two patterns, not three publishers: (i)
  note-trigger sites publish a six-line glue call (MIDI, keyboard
  click, Tone.Part loop playback, music-engine schedule); (ii)
  audio sources route through AudioInterpreter (live mic, mic-layer
  Tone.Player playback, future tab-audio capture, future file
  playback). The "second consumer of AudioInterpreter" insight —
  that recorded-and-replayed mic audio is *the same audio analysis
  problem as live mic, just with a different source* — is the
  observation that makes (a) clearly the right call rather than
  a close one.
- Wrapping inline publish calls in a "MIDIInterpreter" module to
  match AudioInterpreter's shape would be ceremony. The inline
  publish call is the right size for the responsibility.
- Reversibility: if a future genuinely interpreter-shaped
  responsibility emerges, promoting an inline publisher to a
  module is a localized refactor. Cost of being wrong on (a) is
  low; cost of preemptively wrapping trivial cases in module
  boilerplate is real.

### Setup for next session
- Phase 2 prompt drafttable. Scope: cantor.html only.
  Acceptance: AudioInterpreter is the sole audio-event publisher
  visible in the template, source tags present on all
  MusicalEventStream.publish call sites, no behavioral regressions
  on the audio-onset-analysis test corpus.
- STATUS.md cleanup is a separate session, on `dev`. The
  cross-tool plan (SkratchLab loop pedal → Cantor) and the
  AudioInterpreter "second consumer" pattern (Tone.Player → analyzer
  routing) are future work, not part of Phase 2.

### Out of scope / deferred
- SkratchLab → Cantor cross-tool wiring. Three sub-tasks identified
  (loop pedal keyboard layers, loop pedal mic layers, Blockly
  music-engine triggers), all deferred to post-Phase-2.
- Routing `Tone.Player` output through AudioInterpreter as a second
  consumer pattern. Real session, but unblocks tab-audio capture
  and file playback at the same time, so worth scoping properly
  rather than rushing it.
- STATUS.md cleanup (Cantor block consolidation, Current Focus
  rewrite, Next Priorities triage). Separate session, on `dev`.


## 2026-04-30 — Lifted rewireForTone into audio-input.js

### Landed
- `static/shared/audio-input.js`: added `async rewireForTone()`
  method between `disconnect()` and the EXPORTS divider.
  Self-gating: no-op if no active device, or if `_audioContext`
  is already Tone's `rawContext`. On the rewire path: captures
  `_selectedDeviceId`, calls `_disconnectCurrent()` (the internal
  helper, not the public `disconnect()` — preserves
  `activeDevice`/`isActive`/`_selectedDeviceId` through the
  rewire), then `await this.selectDevice(savedId)` which now
  lands in Tone's running context. JSDoc block documents the
  two-phase init pattern. Updated the standalone-context
  fallback `console.warn` in `selectDevice` to reference
  `rewireForTone()` as the documented recovery.
- `templates/harmonograph.html`: deleted
  `_audioInputNeedsToneRewire` flag declaration (line 520),
  `_attachAudioInputToTone()` function definition (lines
  993-1015), and all three flag set-sites (in `_initAudioInput`
  and `_switchAudioInputDevice`). Replaced the single call site
  at line 824 (now line 819 after deletions) with
  `AudioInput.rewireForTone()`. Trimmed one stale comment that
  referenced the removed flag.
- `templates/cantor.html`: added
  `try { await AudioInput.rewireForTone(); } catch (_) { }` at
  two sites — inside `_ensureToneStarted` between
  `await window.Tone.start()` and `_reconcileAudioInterpreter()`,
  and at the inline gesture path at line 799 (between the
  inline `Tone.start()` and `_reconcileAudioInterpreter()`).
- All six acceptance criteria verified manually:
  Cantor saved-device auto-restore (audit §3.4 criterion 3)
  passes, Cantor device switch and switch-to-none work,
  Harmonograph regression checks (saved-device, device switch,
  switch-to-none) all pass.

### Diagnosed / decided
- **Internal state suffices for rewire-needed detection.** The
  harmonograph original tracked `_audioInputNeedsToneRewire`
  as an explicit flag. Reading `selectDevice` (audio-input.js
  220-228) showed that the standalone-context fallback is the
  *only* path that creates a non-Tone-rooted source. So
  `_audioContext !== toneCtx.rawContext` is computable from
  existing state — the flag is redundant information. Lifted
  version drops the flag entirely. Smaller surface area than
  the followup notes' sketch anticipated.

- **Lifted method uses `_disconnectCurrent()`, not public
  `disconnect()`.** Public `disconnect()` clears
  `activeDevice`/`isActive`/`_selectedDeviceId`. For rewire,
  we want "device X stays active throughout the rewire," not
  "disconnect then reconnect." The internal helper preserves
  state correctly. This is a small departure from harmonograph's
  pattern (which used the public method because it was external
  code calling across the AudioInput boundary); inside AudioInput,
  the internal helper is the right primitive.

- **Module-owned analyser eliminates the analyser-passing
  dance.** Harmonograph's `_attachAudioInputToTone` re-set the
  analyser on every call (defensive, since `KeyboardView`'s
  analyser was caller-owned and could in principle have changed).
  Inside the lifted module, `_analyser` is module state that
  `_disconnectCurrent` doesn't touch, so the rewire path doesn't
  need to re-`setAnalyser`. The lifted method is `rewireForTone()`
  with no args; the caller-owned analyser-passing dance
  disappears.

- **Pattern observation worth keeping:** when state moves from
  caller-owned to module-owned during a lift, the lifted code
  often gets simpler than its source. The harmonograph rewire
  was three things (flag + function + analyser-passing); the
  lifted version is one thing (function with no args). Not a
  coincidence — it's what "the right shape for the shared
  module" looks like.

### Setup for next session
- All work is on the `audio-onset-analysis` branch.
- Working tree at session end: three modified files
  (audio-input.js, harmonograph.html, cantor.html), nothing
  unrelated. Ready to commit.
- No `.bak` files, no in-flight branches, no half-finished
  prompts.

### Calibration notes
- **Greps for "is this pattern duplicated?" are a different
  question than "where does this specific machinery live?"**
  Tonight's initial greps (open question #1 in followup notes)
  scoped to harmonograph.html + harmonograph-view.js to confirm
  the rewire machinery lived only in the template, not the view.
  Those greps did not ask "does any other template have its own
  copy of this pattern?" Explorer.html does — discovered only
  after Claude Code's Part 2/3 spot-check turned it up. The
  duplicate-pattern check should be its own grep, distinct from
  the API-surface check (criterion 9 caught API regressions but
  would not have caught a duplicate pattern in another template
  even if it had been present).
- **The internal-helper-vs-public-disconnect choice was
  non-obvious and worth flagging in the prompt explicitly.**
  An implementing agent reading the prompt could reasonably
  match harmonograph's pattern (use public `disconnect()`) and
  end up with subtly wrong state semantics. Calling out the
  rationale ("we want device X to stay active throughout the
  rewire") prevents that. Future shared-module lifts: when the
  lifted code uses an internal helper that the source code
  didn't have access to, document why explicitly in the prompt.
- **Followup-notes structure from 2026-04-29 worked well.** The
  bug-in-one-paragraph + machinery-with-line-refs +
  shape-options + acceptance-criteria + open-questions structure
  let tonight's prompt drafting move quickly. Worth keeping as
  the template for between-session handoffs when work has to
  stop mid-thread.
- **The audit's blind spot lesson held tonight too, in
  miniature.** My initial framing was "flag stays, function
  lifts." Reading `_attachAudioInputToTone` carefully revealed
  that internal-state detection makes the flag redundant.
  Grep-before-guess applies even when the design feels clear —
  especially when it does.

### Flagged for later
- **Explorer migration onto `AudioInput.rewireForTone()`.**
  Same lift pattern as tonight, applied to
  `templates/explorer.html`. Local rewire machinery is at:
  - `_attachAudioInputToTone()` call site at line 1980
  - `_audioInputNeedsToneRewire` declaration at line 3936
    (preceding comment at 3935)
  - `_attachAudioInputToTone()` function definition at line 3999
  - Flag set-sites at lines 4004, 4008, 4032, 4048, 4057
  Recommended approach: read-only session first to map
  explorer's gesture path (does it have `_ensureToneStarted`?
  How does it route to the rewire machinery?) and to check
  whether explorer's local function differs from the
  harmonograph version we lifted from. *Then* draft the prompt.
  Acceptance criteria need to cover Spectrum panel and
  Harmonic Resonance "still works" checks in addition to
  saved-device auto-restore. Drafttable next session; smaller
  cognitive load than tonight because `rewireForTone()` is now
  established.
- **Cantor.html line 797 inline `Tone.start()` pattern is a
  duplicate of `_ensureToneStarted`.** Tonight added
  `rewireForTone()` to both sites separately rather than
  refactoring 797 to call `_ensureToneStarted`. The
  inline-vs-wrapper inconsistency should be cleaned up when
  next touching cantor's gesture path. Trivial cleanup; not
  worth its own session.
- **Console.warn message in audio-input.js `selectDevice` now
  references `rewireForTone()`.** Other audio-input.js comments
  and JSDoc may have stale references to "Call Tone.start()
  before selectDevice()" framing that doesn't account for the
  recovery path. Review when next touching audio-input.js.
  - **STATUS.md structural cleanup session.** The doc has accumulated
  drift over the past 2-3 weeks: the Cantor block appears in three
  places (lines ~7, ~87, ~145, all within a week of each other,
  partially overlapping); the "Current Focus" section is dated
  April 22 and predates Cantor + audio-onset-analysis work; large
  "Completed this cycle" sections (April 22, April 20, April 19,
  April 9-13) have migrated into STATUS.md from SESSION_LOG.md
  territory; "Next priorities" 1-16 includes items of unclear
  current status. The "What's Working" section is the structurally
  healthiest part. Recommended scope for the cleanup session:
  (a) collapse Cantor blocks to one canonical version, merging
  unique content; (b) refresh Current Focus against actual current
  state; (c) move Completed cycles content to SESSION_LOG.md if not
  already there, then delete from STATUS.md; (d) audit Next
  priorities — kill items that are done, demote items that are
  truly stale; (e) decide on a consistent surface-block schema
  (Landed on dev / Landed on branch / In progress / Open).
  Recommended NOT in scope: a full structural rewrite. The doc's
  bones are fine; the problem is accumulated cruft, not structural
  failure. Estimated 1 short focused session.

### Out of scope / deferred
- **Did not touch explorer.html.** Discovered mid-session that
  explorer has the same local rewire machinery. Tightened scope
  to "intentionally narrow" per followup notes; explorer
  becomes its own session. Captured in Flagged for later above.
- **Did not refactor cantor.html line 797 to call
  `_ensureToneStarted`.** The inline duplicate of the wrapper
  pattern is a cleanup opportunity, but ride-along
  refactoring during a lift is exactly the calibration trap
  that "intentionally narrow scope" is meant to avoid.
- **Did not address OQ9 (`window.AudioInput` coupling) or
  the device-restore refactor path.** Both explicitly out of
  scope per followup notes; both still deferred per
  STATUS.md.
- **Did not update other audio-input.js comments / JSDoc
  beyond the one console.warn change.** The console.warn was
  in scope because the lift directly creates the recovery path
  it now references. Other doc comments are flagged-for-later,
  not tonight's work.


## 2026-04-29 (evening) — Cantor migration phase 1 prompt drafted, run, and partially landed

Cantor migration phase 1 Claude Code prompt drafted from chat
(per WORKING_STYLE: lead with read list, scope to one task,
explicit file paths). One file in scope:
templates/cantor.html. Off-limits files restated in the
prompt itself.
Phase 1 migration ran and reported back. What landed in
templates/cantor.html:

Removed createChordDetector import and the in-template
chord block (start/stop functions, dedupe, local silence
watcher, every call site).
Added module-scoped interpreter, relocated CHORD_TYPE_MAP,
added a chordChange subscriber on MusicalEventStream that
reads event.bass / event.pitchClasses directly off the event
(Notable E pattern preserved).
Added _reconcileAudioInterpreter modeled on
harmonograph.html:797-813. On stop it also resets
HarmonyState (the interpreter doesn't publish a final
silence event when stopped externally).
Reconciler call sites at: end of _initAudioInput,
AudioInput.onDeviceChange handler, dropdown change handler
(None path and success path), after inline await Tone.start()
in the dropdown handler, and inside _ensureToneStarted after
Tone.start() resolves.


Acceptance criteria 1, 2, 4, 5, 6, 7 from audit §3.4 verified.
Followup edit landed: removed AudioInput.disconnect() at
pre-migration cantor.html:778 (was inside _initAudioInput,
before the trailing reconciler). The disconnect at line 789
inside the dropdown change handler — the genuine "tear down
before re-select" path — was kept.
Nothing committed. End-of-session git deferred to next
session (or paste-time tonight, user's call).

Diagnosed / decided

Criterion 3 (saved-device auto-restore) does not pass.
Characterization (this is the durable artifact from tonight,
more important than the code that landed):

Pre-migration, the saved-device case was broken because
AudioInput.init() auto-restored a device but no Cantor-side
code path responded — Notable A in the orchestration audit.
The migration audit's §3 fix path was: the reconciler
called from _updateAudioInputStatus (already at
cantor.html:809 pre-migration) would pick up
AudioInput.isActive and start the interpreter. This was
correct, but the audit missed two things: (i) an
AudioInput.disconnect() call at pre-migration cantor.html:778
that undid AudioInput's restore before the reconciler ran,
and (ii) the broader structural fact that cantor.html
inherited only a fragment of harmonograph's audio-init
pattern — the disconnect call — without inheriting the
rewire machinery harmonograph uses to compensate.
The disconnect at line 778 was added in cantor.html's
initial-add commit (a6f3d64, "Mirror harmonograph's
chord-detection init in cantor.html"). It was always there;
pre-migration the implicit-start triggers it papered over
the missing rewire machinery; post-migration it became the
visible cause of Notable A.
Removing the disconnect (tonight's followup edit) is
necessary but not sufficient. Without harmonograph's rewire
machinery, the auto-restored device's stream is rooted in
a standalone non-Tone AudioContext (because Tone hasn't
started at AudioInput.init() time — no user gesture yet).
When the interpreter eventually starts after the user does
a gesture that starts Tone, it reads from KeyboardView's
analyser, which is in Tone's context and has no source
connected to it. Wash doesn't light up. Same observable
failure as Notable A pre-migration; different mechanism.


Right end-state: lift harmonograph's rewire machinery into
audio-input.js. Both surfaces need it; any future surface
will need it too. Requires explicit lift on audio-input.js
(file-scope-restricted per WORKING_STYLE). Architectural
change, not a one-line patch.
Decision: stop here, defer fix to next session. Rationale
— porting harmonograph's rewire pattern into cantor.html
tonight (option 1) would be throwaway work tomorrow if the
audio-input.js lift (option 3) is the right shape. Better to
hold one design in mind across the gap than two
near-duplicate patterns. Cost of waiting: one night with
saved-device restore not working on the dev branch — same
state as pre-migration, no observable regression.

Setup for next session

audio-onset-analysis branch has uncommitted changes:
templates/cantor.html (the migration), and STATUS.md +
SESSION_LOG.md (this update). Run git status first to
confirm nothing else has drifted.
Tomorrow's task: design and draft a prompt to lift the rewire
machinery from harmonograph.html into audio-input.js. See
docs/followup-notes-2026-04-29.md for the outline.
The lift requires explicit lift on audio-input.js — confirm
intent before drafting. The lift's scope is intentionally
narrow: extract the rewire pattern into the shared module,
then update cantor.html and harmonograph.html to consume the
shared API. No other audio-input.js changes ride along.
Acceptance for the lift: criterion 3 from cantor migration
audit §3.4 passes against cantor.html, AND harmonograph.html's
saved-device behavior is unchanged (functional equivalence).

Calibration notes

The migration audit had a blind spot at _initAudioInput.
Missed both line 778's disconnect call and the absence of
rewire machinery in cantor.html. Worth recalibrating trust
in the audit's coverage claims for the harmonograph migration
prompt (§7.1) — that one involves the rewire machinery
directly. The audit's other sections (event vocabulary,
acceptance criteria, risk register) held up well; this is
specifically a gap in §3's _initAudioInput coverage.
Recommended "remove line 778" without first reading
harmonograph's three disconnect call sites. WORKING_STYLE
flags exactly this: grep-before-guess. The diagnosis (line 778
defeats criterion 3) was right but the prescription was made
in ignorance of why the line existed. After reading
harmonograph.html, the world C model emerged and changed the
recommendation. Lesson: when removing inherited code, read
the original site of inheritance before recommending removal.
The "ask for a grep, then ask for the next grep" pattern
paid off. Each grep narrowed the hypothesis space. The
iterative shape (grep → read → next question) is what kept
the eventual diagnosis precise. If I'd asked for a multi-step
verification script up front, I'd have asked for the wrong
things — the right next questions only became visible after
each previous answer.


## 2026-04-29 (afternoon) — Cantor migration audit drafted; fix-prompt arc scoped

### Landed
- docs/cantor-migration-audit.md committed (separate Claude Code
  session, read-only). Nine sections, file:line citations
  throughout, recommend-not-decide stance on OQ1 and OQ9.
- AudioInterpreter v0 public surface verified fresh in audit §2:
  factory signature, idempotent start/stop, setAnalyser does
  internal stop+restart, getState shape, noteId scheme 'audio-N',
  window.AudioInput.getStream() coupling, window.__audioInterpreter
  global. Matched the design doc spec; no drift.
- Spot-check greps on consumer enumeration of chord-detection.js,
  pitch-detection.js, onset-detection.js, and MusicalEventStream.publish
  showed no drift since the orchestration audit was committed.

### Diagnosed / decided
- OQ1 (MIDI publishing path) — audit recommends option (b),
  shape 1: a sibling MIDIInterpreter module rather than absorbing
  MIDI into AudioInterpreter. Reasoning aligns with design
  principle 7 (single producer per modality). No decision made;
  recommendation only. Decision required before phase 2 prompt
  can be drafted.
- OQ9 (window.AudioInput coupling) — audit recommends (b) for
  phase 1 (accept the precedent), (a) when the second
  AudioInterpreter consumer lands. Trigger condition concrete
  enough to act on later.
- §4.2 keyboard-click path flagged as a third decision under OQ1
  branch (b); recommended treatment is "leave it where it is"
  (no interpretation work to wrap on the click path).
- Melody and SkratchLab audio-bridge classified as "primitive
  consumers" — they consume raw pitch readings, not interpreted
  attack events. Recommended no migration. The "primitive
  consumer" category didn't exist before this audit; flagged for
  AudioInterpreter design doc to absorb on a future pass.
- input-provider Notable E fix recommended in-place (option B);
  architectural unification with AudioInterpreter (option A or C)
  deferred until Beat Field creates real pressure.
- Harmonograph flatness gate (Notable C) — three options laid
  out; recommended path "discard and verify." The verification
  step has a sharper risk than other deferred decisions: no
  existing test corpus catches the noise-driven phantom chord
  case the flatness gate was defending against. Harmonograph
  migration prompt needs to call for a recorded fixture, not
  rely on existing manual testing.

### Setup for next session
- audio-onset-analysis branch unchanged in working tree at
  session end (audit was a separate read-only Claude Code
  session that committed its own work).
- Migration audit is the source of truth for fix-prompt drafting;
  next chat session should treat the four files (WORKING_STYLE,
  audit, design doc, orchestration audit, audio-interpreter.js)
  as inputs and skip this thread's transcript.
- Anticipated fix-prompt arc: (1) Cantor phase 1 — drafttable
  now; (2) Cantor phase 2 — gated on OQ1 decision; (3)
  Harmonograph migration; (4) input-provider Notable E in-place
  fix; (5) OQ9 cleanup — gated on second consumer landing.
- Handoff prompt for the next chat drafted in chat (not
  committed); paste-ready.

### Calibration notes
- The chat-side elicitation pattern (tappable single-question
  rounds for scope, OQ stance, structure, depth, verification
  policy) worked well for shaping a complex prompt. Each
  question was a clean either/or that didn't require re-reading
  earlier context. Worth using again for prompts of comparable
  scope.
- Asked an unnecessary question early ("which files / symbols
  define the old stack") that the orchestration audit already
  enumerated. Lesson: when uploaded files explicitly cover a
  question, read them before asking. Recovered by reading the
  files and pivoting; the user flagged it directly.
- The "fix prompts will modify source files; the audit didn't"
  posture shift is worth highlighting in the next handoff —
  file-scope rules become load-bearing differently for
  modify-mode prompts.

### Flagged for later
- "Primitive consumer" as a category — should be absorbed into
  audio-interpreter-design.md on a future doc pass. Currently
  only named in the migration audit §7.2 / §7.3.
- Harmonograph flatness-gate verification needs a recorded
  fixture (mic noise + sustained string ringing) before the
  harmonograph migration can call its work done. The fixture
  doesn't exist today.
- The keyboard-click path (cantor.html:322-338) is a third
  MusicalEventStream producer outside both MIDIInput and the
  future MIDIInterpreter. Today it's a non-issue; if a fourth
  producer ever appears the "single producer per modality"
  principle (design principle 7) needs a sharper formulation.

### Out of scope / deferred
- Beat Field implementation — unblocked by AudioInterpreter v0
  but not started.
- chord-detection.js top-N candidates lift — referenced in
  design doc OQ8; deferred to v3+ unless prioritized earlier.
- Adaptive tuning windows for the onset-gating ms values —
  deferred per design doc §10.
- Harmonograph migration scheduling — shape exists in audit
  §7.1; actual when-to-do-it deferred.


## 2026-04-29 (morning session) — AudioInterpreter v0 design and build

### Landed
- `docs/audio-interpreter-design.md` — new design doc, 12 sections.
  Three-subsystem AudioInterpreter architecture (pitched-note
  tracker, chord tracker, percussive-strike publisher), event
  vocabulary (noteAttack, noteRelease, chordChange,
  percussiveStrike), pitched-note state machine, onset-gating logic
  for chord publishing, lifecycle interface, deferred features,
  open questions, Cantor migration implications. Committed locally
  on audio-onset-analysis; not pushed.
- `static/shared/audio-interpreter.js` — new module. v0 build,
  three subsystems wired, factory follows existing detector
  conventions, all eight acceptance criteria met. No deviations
  from design doc. Status: built but uncommitted; commit pending
  the design-doc edit pass.

### Diagnosed / decided
- **Phase 1 framing was wrong.** Original "wire onset-detection to
  publish noteAttack events" framing assumed onset-detection
  carried pitch info. It doesn't — `OnsetEvent` is `{timestamp,
  strength}`. The right architecture is AudioInterpreter (named in
  cantor-design.md but not yet built), which correlates onset +
  pitch + chord into musical events. Phase 0's "supplement, not
  replace" decision still holds, but lives inside AudioInterpreter's
  chord tracker rather than as a free-standing wiring decision.
- **Three-subsystem architecture, dual classification.** Pitched
  and percussive are not mutually exclusive — every onset can
  produce both a noteAttack and a (possibly faint) percussiveStrike,
  with strength weighting on the strike. Beat Field's "single
  shared field" handles superposition naturally. Reasoning: a
  strummed guitar has both pitched and percussive content; treating
  them as exclusive would silently drop the percussive component
  for any pitched instrument.
- **Pitched-note state machine: transient pathway only in v0.**
  Two states (Silent, Sustaining), debouncing at transitions,
  semitone threshold for note-change. Emergent pathway (sustained
  singing without a clean attack) is reserved in the architecture
  via `attackType: 'transient' | 'emergent'` field but not
  implemented in v0. Documented as a v0 limitation.
- **Strike events carry pitch/spectral content, not screen
  positions.** Beat Field's design originally had origin pre-
  computed upstream. Moved downstream to keep AudioInterpreter
  rendering-agnostic. Beat Field maps pitch to screen position
  using its own torus geometry.
- **Cantor migration sequence: v0 build first, then audit, then
  migration build.** AudioInterpreter v0 doesn't depend on Cantor
  (it's a new standalone module), so the migration audit is more
  usefully written *after* v0 exists, when we know exactly what
  we're migrating to.

### Setup for next session
- Branch: audio-onset-analysis (committed: design doc only;
  uncommitted: audio-interpreter.js).
- Tag pre-overtone-fix anchors pre-rebuild state on dev.
- Working tree clean except for the uncommitted v0 module.
- Three drafted prompts in chat:
  1. Design-doc edit pass (4 findings to fold back). Run next.
  2. (Future) Cantor migration audit — read-only Claude Code
     session producing `docs/cantor-migration-audit.md`.
  3. (Future) Cantor migration phase 1 build.

### Calibration notes
- **One question at a time held throughout this design conversation
  and worked.** Several rounds where my hypothesis was wrong (the
  "constellation benefit" framing; the option 3 reconciler when I
  hadn't read what triggered Harmonograph's reconciler; the
  assumption that onset-detection carried pitch). Each one caught
  by your push to read code or be concrete before designing
  further. The reset to "design from principles" after the
  cantor-design.md re-read was the right move.
- **Read-the-code-before-reasoning paid off concretely.** I tried
  to design the option-3 reconciler from the audit's text without
  asking for the call sites. Your grep + sed put the actual sites
  on screen and confirmed it was a hybrid pattern (one
  subscription + five defensive calls), not the pure pattern I'd
  imagined.
- **Design-from-principles works when the principles are explicit.**
  Once you named "we want to support the acoustic-only returning
  user," option 3 became obvious. Without that principle named,
  it would have stayed a defensible-but-arbitrary choice.

### Flagged for later
- **Chord ambiguity rendering is stranded.** cantor-design.md
  commits to rendering multiple chord candidates with confidence-
  proportional saturation, but chord-detection.js emits only a
  single best-fit per frame. v0's `alternatives` field is always
  empty. Resolution requires either lift on chord-detection.js to
  emit top-N candidates, or chord-tracker-side derivation from
  chroma data. Defaults to v3+ unless prioritized earlier. Logged
  as design-doc Open Question.
- **window.AudioInput coupling pattern.** AudioInterpreter v0
  uses `window.AudioInput?.getStream?.()` at start time to share
  the existing MediaStream with pitch-detection. Matches
  harmonograph's pattern but is the same window-coupling Notable D
  flagged in the orchestration audit. Cantor migration audit
  should decide: (a) clean up by passing AudioInput as an explicit
  factory option, or (b) accept the precedent.
- **Transient-sharpness `/3` divisor is empirical.** Calibration
  item for real-audio testing during the migration phase.
- **Spectral-flatness duplicated.** Copied from pitch-detection.js
  rather than imported (it's a private helper there). Subsystems
  agree on the metric. Worth promoting to a shared
  `audio-features.js` module later — flag for the audit-style
  refactor pass.
- **Beat Field doc edits.** `docs/beat-field-design.md` should
  reference percussiveStrike schema rather than its own input
  pipeline. Deferred until Cantor migration phase 1 is complete
  so the strike-event interface is fully stable in code, not just
  in design.
- **Notable A's saved-device fix.** Will land as a side effect
  of Cantor migration phase 1 (AudioInterpreter's lifecycle is
  reconciler-style by design). Not a separate fix.

### Out of scope / deferred
- **MIDI publishing path consolidation.** Whether MIDI events
  eventually flow through AudioInterpreter (or a paired
  MIDIInterpreter) is Open Question 1 in the design doc.
  Decision deferred to the Cantor migration audit. v0 explicitly
  leaves MIDI publishing where it is in cantor.html.
- **Audio-derived noteRelease.** Reserved in event vocabulary;
  v0 publishes noteRelease from MIDI only. Audio-derived
  release detection is v3+, paired with note duration and
  phrase detection.
- **pitchBend event emission.** Type reserved; v0 absorbs
  within-semitone fluctuation into the locked pitch (vibrato
  doesn't visualize, blues bends are silently truncated).
  Lands in v3+ as a node-moves-on-the-Tonnetz feature.
- **Harmonograph migration to AudioInterpreter.** Out of scope.
  Harmonograph has its own working pattern and isn't a Cantor
  consumer. A future migration would resolve the silence-watcher
  duplication entirely. Tracked as a follow-up; not blocked by
  AudioInterpreter v0.
- **Unit tests for AudioInterpreter.** Hard to test without
  real audio. v0 ships with debug surface (`setDebug(bool)`,
  `getState()`) for interactive verification. Test fixture
  corpus is build-phase work for whenever testing strategy gets
  prioritized.


- **CLAUDE.md reference docs section is getting long**  will keep growing as new
  surfaces ship. Worth consolidating into something more navigable
  (grouped by surface? a separate `docs/INDEX.md` with categorized
  links that CLAUDE.md just points to?). Not urgent — current list
  still works — but consolidation will pay off as the doc count
  grows.

** build plan review / consolidiation / codebase review should be done soon.


## 2026-04-28 (afternoon/evening) — Cantor diagnostics and onset architecture planning

**Landed:** Cantor test track infrastructure on dev.
- `tests/generate_cantor_test_track.py` — deterministic synthetic
  audio generator, three diagnostic sections (chord-only, melody-only,
  combined). Mirrors harmonograph generator pattern.
- `tests/cantor-test-track.md` — companion doc with section guide and
  diagnostic decision tree.
- WAV is gitignored (`*.wav`); regenerate from script.

**Diagnosed:** chord-detection.js produces false-positive chord wash
on solo melody notes. Root cause: chroma-template matching can't
distinguish a single note's overtone series from a real chord. A
single sustained G5 has strong chroma energy at {G, D, B} from its
1st/3rd/5th harmonics — exactly G major's pitch classes. Filed full
analysis in chat history.

**Decision:** rather than patch chord-detection.js (the standing
"don't touch" rule was lifted with backup branch + tag in place),
rebuild on onset-driven analysis. Onsets are the right primitive:
chord and melody are both interpretations of the onset stream.
Single sustained notes produce one onset → no chord. Distinct melody
note onsets are visible whether or not they're chord tones.

**Setup for tomorrow:**
- Branch `chord-detection-overtone-fix` exists at dev's HEAD; planned
  rename to `audio-onset-analysis` or similar tomorrow.
- Tag `pre-overtone-fix` anchors current state.
- Phase 0–4 plan in this chat's history (Phase 0: read three files
  + decide replace vs. supplement; Phase 1: build onset-detection.js
  module; Phase 2: wire into chord-detection.js; Phase 3: wire into
  MusicalEventStream / cantor-view; Phase 4: validation).
- Estimated 2–3 sessions total.

**Calibration note (morning):** during 6B acceptance verification I
prematurely concluded "snap target is drifting" when glyphs appeared
in different screen positions across paused snapshots. Correct read
is that glyphs anchor to 3D vertices and ride the rotating torus —
the apparent ~15s "shift cadence" is just 120° of rotation at 1 rev
/ 45s. Lesson: when a snap looks "wrong," first ask "same glyphs at
new screen positions, or different glyphs?" before forming a
hypothesis.

**Flagged for separate session:** build plan review and consolidation.
Cantor and Harmonograph integration into the broader SongLab
educational story (scales, keys, theory) deserves a dedicated
planning session. Output would be: updated STATUS.md across all
surfaces, an integration map document, and a re-prioritized roadmap.
Not urgent but easy to lose sight of.

**Chladni dynamics:** brainstorming deferred to a separate chat for
context cleanliness. Starter handoff prompt drafted in this session.


## 2026-04-28 — Cantor 6B: per-frame drift + breathing

**Landed:** Prompt 6B in `static/shared/cantor-view.js`.

**Changes:**
- Added `_elapsed` (seconds) accumulator, advanced per unpaused RAF tick.
  Pause branch refreshes `_lastFrameMs` only — no time advance, no
  accumulated jump on resume.
- `_render()` now derives per-frame values at the top of the body:
    - `_currentRotY = _rotY + (2π/45) * _elapsed` (1 rev / 45s)
    - `_currentMajorR = params.torusMajorR * (1 + 0.05 * sin(2π/8 * _elapsed))`
      (±5%, 8s sine period)
- Baselines (`_rotY`, `params.torusMajorR`) remain pristine; per-frame
  values are local to the render pass.
- `_uvToXYZ` reads `_currentMajorR`; `_rotate3D` reads `_currentRotY`.
  rotX (30°) and rotZ (0°) untouched.
- `_testSnap` wraps body in `try { ... } finally { _elapsed = saved }`
  with `_elapsed = 0` for the duration — deterministic static-bake pose
  preserved.
- `renderOnce()` does not tick `_elapsed`; repeated calls while paused
  produce identical frames.

**Verification:** all 5 acceptance criteria green.
1. Idle drift (~1 rev / 45s) and breathing (8s, ±5%) both visible.
2. `params.paused = true` freezes both; `false` resumes without jump.
3. Live-play snap end-to-end clean — both `HarmonyState.setTriad` and
   Launchkey E-G-B land on correct 3D vertices and ride the rotation.
4. `_testSnap('E','minor',[4,7,11])` returns `pass: true`.
5. `_elapsed` unchanged across repeated `renderOnce()` calls while
   paused (verified at `577.5749000000071` over ~11s wall time).

**Calibration note:** Mid-session I misread "glyphs in different screen
positions across paused snapshots" as a snap-target bug. The correct
read is that glyphs are anchored to 3D vertices and ride the rotating
torus — which is what they're supposed to do. The ~15s apparent
"shift cadence" is just 120° of rotation at 1 rev / 45s. Recording
this so future-me doesn't re-investigate. Lesson: when a snap looks
"wrong," first ask "same glyphs at new screen positions, or different
glyphs?" before forming a hypothesis.

**Standing items unchanged:**
- 3D math helpers (`_uvToXYZ`, `_rotate3D`, `_projectOrtho`) still
  duplicated from harmonograph; shared-utility extraction still TODO.
- Constellation z-fade vs hard occlusion on back side: still open,
  still deferred.
- Future "musical" breathing (tempo/beat-driven `_elapsed`) is a
  one-line swap from the current wall-clock-driven accumulator.


## 2026-04-28 — Cantor 6A.2: chord-detection Hardware-state gating

**Bug:** chord-detection callback in cantor.html ran regardless of
Hardware (audio input) state. When Hardware was "No audio input,"
playing MIDI on the Launchkey routed Tone.js sampler output through
the analyser, chord-detection fired, and HarmonyState.highlightChord
overrode any manual setTriad. This made live-play verification of the
constellation snap impossible — activeTriads cycled clearAll → set →
clear → set under MIDI input.

**Fix:** Three targeted changes in templates/cantor.html.
- Gated `_startChordDetection()` in the MIDI noteOn handler on
  `AudioInput.isActive` (cantor.html:455-457).
- Added `_stopChordDetection()` helper that tears down detector +
  silence watcher and clears stuck HarmonyState highlight
  (cantor.html:566-585).
- Called `_stopChordDetection()` before each `AudioInput.disconnect`
  / `selectDevice` site (cantor.html:807, 818, 835).

No other files modified. Don't-touch list respected.

**Verified:**
- `cantorView._testSnap('E','minor',[4,7,11])` → pass: true (regression).
- Hardware off, no manual triad, play E-G-B on Launchkey →
  `HarmonyState.get().activeTriads` empty after decay.
- Hardware off, `HarmonyState.setTriad('E','minor')` → wash renders;
  play E-G-B → glyphs snap to wash vertices, activeTriads stays
  Eminor through decay.
- Hardware mic → "No audio input" toggle: chord-detection torn down
  cleanly; manual setTriad holds on subsequent live-play.

**Next:** 6B — per-frame drift (rotY, 1 rev / 45s) + breathing
(±5% torusMajorR, 8s sine).


## 2026-04-27 (continued) — Prompt 5: input model complete

### Landed
Split-point UI overlay, audio chord detection wiring, on-screen
keyboard → MusicalEventStream.

### Architectural notes
- Split-point overlay is a Cantor-specific layer over the keyboard
  (not a keyboard-view modification). MutationObserver handles the
  hidden-panel zero-rect issue.
- Audio chord detection init is gated on first MIDI noteOn — the
  user-gesture moment when Tone.js's audioContext can start producing
  real analyser samples.
- chord-detection routes through HarmonyState.highlightChord so both
  activeTriads (base quality, drives wash + flash diff) and activeChord
  (full extension, drives 7th hue shifts) populate from one path.
- Silence watcher (100ms poll, 500ms threshold) clears state on quiet
  rather than waiting for explicit chord change.

### Verification dance
- Initial confusion: thought constellation wasn't rendering. Actually
  was — visible as warm gold glow blobs in screenshots — but split
  was at MIDI 60 (leftmost C of visible keyboard), so all played
  notes registered as melody and there was no visual contrast between
  "above" and "below" to confirm classification was working.
- Real issue surfaced: default split of MIDI 60 puts the line at the
  far left of this keyboard's range, leaving no accompaniment region.
  Drag-tested → splitPoint persisted correctly (localStorage = '60'),
  classification logic worked, just bad default UX.
- Chord detection observed working: F7, Dmaj7, Dsus4, Cmaj7, G7
  detected and washed correctly.
- window.cantorView wasn't exposed — added a debug-only assignment
  on localhost for future debug rounds.

### Tuning pass at end of session
- Default split changed from MIDI 60 → 72 (C5, mid-keyboard)
- Constellation visual prominence bumped: lit-node radius factor
  1.45 → 1.7, glow halo factor 1.5 → 2.0, velocity floor 0.3 → 0.5,
  decay τ 0.7s → 1.0s, two-pass core+halo rendering
- Goal: glyphs read as clear played-note markers rather than ambient
  shimmer
- window.cantorView exposed on localhost only for dev console access

### Open question raised, deferred
The constellation currently shows un-connected fading glyphs — no
directional or sequence information. Worth a future design doc on
melody trails (faint connecting lines between consecutive notes,
fading with τ) to expose phrase contour spatially. Stepwise vs
leaping motion would become visible. Even more interesting on the
3D torus where the melody trail would wrap around the surface.
Defer the design pass until after prompt 6 lands so trails can be
designed against the final torus geometry.

### Deferred to later (still standing)
- chordChange dispatch on MusicalEventStream — cantor reads HarmonyState
  directly, dispatch is redundant for v1
- activeTriads-clears-mid-phrase anchor snap-back grace period

### Bonus discussion
Spent some time on scales on the Tonnetz: diatonic = 7-node connected
region, relative keys share region (Cmaj/Amin indistinguishable as
shapes), parallel keys pivot (Cmaj→Cmin = 4 of 7 nodes shared, the
others pivoting around the tonic-dominant axis), harmonic minor has
a tendril reaching into parallel-major territory (raised 7th outside
the natural-minor footprint), octatonic tiles the lattice. Not
building, but compelling enough that it earns its own design doc
tomorrow — `docs/scale-regions.md` — as a future Explorer panel or
Theory Hub lesson. "Scales have shapes too" as a follow-on to
"Harmony has a shape."

### Next
Prompt 6: 3D torus rendering with drift + breathing. Open design
questions logged in STATUS.


## 2026-04-24 — Harmonograph audio pipeline debugging (test-track-driven)

Continued the same day after Stage 2 landed. Built deterministic test-track infrastructure to systematically validate audio reactivity, then used it to find and fix seven interrelated bugs across the audio pipeline.

**Test track infrastructure**
- `tests/generate_test_track.py` — Python (numpy/scipy) generator, fixed seed for reproducibility
- `tests/harmonograph-test-track.wav` — 2:55 deterministic audio (gitignored; regenerable from script)
- `tests/harmonograph-test-track.md` — section-by-section timestamp guide with expected behaviors
- Six sections: silence baseline (15 s), pink-noise loudness staircase at -50/-30/-15 dBFS (45 s), note-decay panel with three envelopes on C major (18 s), tempo cycle I-IV-V-I at 60/120/180 BPM (29 s), nine-chord vocabulary on C (45 s), realistic vi-IV-I-V progression with voice leading (12 s)
- Each section diagnoses a different aspect of the pipeline. The test track is now reusable infrastructure for any future audio work.

**Seven audio fixes (all in this session, all driven by test-track diagnostics)**

1. **Top-16 RMS detection** (`harmonograph-view.js`). Replaced single peak-bin RMS with average of top-16 FFT bins (linear-energy domain). Fixes saturation where any musical content read 0.57-0.60 regardless of actual loudness. Also bumped defaults: `rmsDbFloor` -75 → -70, `rmsDbCeiling` -30 → -35.

2. **Spectral flatness gate in pitch detection** (`pitch-detection.js`). Added parallel AnalyserNode (FFT 2048) alongside the existing ScriptProcessorNode. Computes spectral flatness per tick (geometric/arithmetic mean of linear FFT magnitudes, skipping DC bin). Rejects pitch detection when flatness > 0.4 (the categorical noise-vs-tone threshold). Also added `_lastFlatness` module-scoped state and `getCurrentFlatness()` export so downstream consumers can use the same noise signal. Heartbeat console log retained for ongoing diagnostics.

3. **Initial-load device sync** (`harmonograph.html`). Page-load audio init was calling `getUserMedia({audio: true})` with no deviceId, while the dropdown independently rendered Loopback as selected — the two disagreed. Refactored init to populate dropdown first, then call `_switchAudioInputDevice(dropdown.value)`, so the visible selection and the actual MediaStream are guaranteed to agree from the start.

4. **Hotplug listener** (`harmonograph.html`). Added `navigator.mediaDevices.ondevicechange` callback. Re-enumerates devices when audio hardware appears/disappears mid-session. Preserves selection if device still present; falls back to "no input" with a console warning if the selected device disappeared. USB interfaces, Loopback activation, etc. now register without page reload.

5. **Pitch-detection rebuild on device change** (`harmonograph.html`). Pitch-detection was running on a dead MediaStream after the first device switch — `_switchAudioInputDevice` was tearing down `AudioInput` but leaving `_pitchDetector` attached to the old stream. Fix: stop the pitch detector right after `AudioInput.disconnect()`, then the existing reconciler at the end of the function rebuilds it idempotently against the fresh stream.

6. **Chord-detection flatness gate** (`harmonograph.html`). Pink noise was producing phantom chord activations that lit up Tonnetz nodes. Pitch detection's gate was working — but when pitch detection rejected, control fell through to `_detectedChord`, which had no noise rejection. Fix: at the chord-detection callback site, read `PitchDetection.getCurrentFlatness()` and skip publishing when flatness > 0.4. Defensive guard preserves the MIDI/keyboard chord path when pitch-detection isn't running.

7. **Heartbeat instrumentation** (`pitch-detection.js`). Added a 1-Hz console heartbeat that logs flatness + gate decision per tick. Was the diagnostic that confirmed the chord-detection gate was the missing piece (rather than the pitch-detection gate being broken). Kept in for future audio debugging.

**Architecture insights surfaced**
- `pitch-detection.js` and the visualizer's analyser now share one MediaStream via `options.stream`. Earlier suspicion about parallel `getUserMedia` calls was wrong — the bug was that pitch-detection was holding a dead stream across device switches, not grabbing its own independent device.
- Web Audio's autoplay policy means audio analysis can't begin until the first user gesture. Page-load wiring is now correct, but a click is still required before the visualizer animates. Worth considering a "click to begin" affordance in production.
- Chrome's `enumerateDevices()` exposes both a "Default - X" alias and the canonical "X" entry, producing apparent dropdown duplicates. Cosmetic, deferred.

**Deferred (logged, not built)**
- AudioWorklet migration for `pitch-detection.js` (Chrome's ScriptProcessorNode deprecation; tracked in `docs/audio-architecture.md` Open Question 1)
- Multi-axis torus spin (currently only Y is RMS-driven; full design is X/Y/Z mapped to chord-root motion by P5/M3/m3 — Tonnetz-aligned, distinctive, but bigger lift)
- Shimmer overlay for non-tonal content (gold particles, Chladni-pattern motion; spectral flatness drives emission)
- "Music has color, noise is gray" platform-wide design principle (saturation driven by flatness across all visualizations; pairs with shimmer)
- Hardware dropdown dedup (cosmetic; `groupId`-based deduplication of "Default - X" / "X" entries)
- Educational content idea: Chladni patterns (1787 history piece OR standing-wave physics piece; ties into shimmer design)
- Test track v2: replace pink-noise staircase with chord-velocity staircase (more useful RMS calibration in the algorithm's domain of interest — top-16 is biased toward tonal content over broadband noise, which is correct for music but means the noise staircase isn't a great calibration signal)

**Stage 2 acceptance**
Stage 2 (audio-reactive spin + centripetal morph) validated end-to-end through the test track. Real-audio test against Allison Russell "Montreal" still pending.

**Next session**
- Real-audio Harmonograph tuning against "Montreal" — test the opening-minute-to-gospel-chorus arc against now-stable RMS/flatness pipeline
- Phase 2 design conversation: multi-axis spin + shimmer + color-confidence as a unified Harmonograph 2.0 design pass
- Possibly start `docs/multi-axis-spin.md`, `docs/shimmer-design.md`, `docs/color-confidence.md`

---


## 2026-04-24 — Harmonograph Stage 2: audio-reactive spin + centripetal morph

First audio-driven behavior in the 3D harmonograph. Y-axis spin and torus-to-sphere morph are no longer manual sliders — they're driven by live audio/MIDI. Off by default; flipping `audioReactive` on couples the visualization to the performance.

**Signal chain**
- Two signals exposed simultaneously, one selected per frame:
  - `rmsEnergy` — mean of the analyser's FFT bins (dB), eased with exponential smoothing, `tau = 4 s`. Clamped to `dbFloor` per bin to keep silence on a stable floor. Mapped [-60, -10] dB → [0, 1].
  - `onsetDensity` — rolling count of MIDI noteOn events over a 4 s window, divided by the window length to get events/sec. Saturates at 8 ev/s.
- `spinDriver: 'auto'` (default) picks `onset` when `window.MIDIInput.isConnected`, else `rms`. User can override with `'rms'` / `'onset'`. Resolution recomputed every frame so hot-plug works.
- `spinDriverGain` multiplies the normalized signal before clamping, so the mapping can be tightened without editing `spinMin`/`spinMax`.

**Centripetal morph coupling**
- `target_spin = spinMin + (spinMax - spinMin) * clamp(signal * gain, 0, 1)` (deg/sec).
- `target_morph = clamp(morphK² * max(0, current_spin - morphSpinThreshold)², 0, 1)`. Squared response keeps slow songs as pure torus; busy/loud songs morph dramatically. Default `morphK = 0.0056 ≈ 1/180` hits `morph = 1` at `spin = 180` deg/sec above threshold; `morphSpinThreshold = 30` deg/sec.
- All values are eased, not snapped:
  - current spin eases toward target with `tau = 2 s`
  - current morph eases toward target with `tau = 3 s`
- The view now has `_effectiveMorph` — `_uvToXYZ` callers (`_transformedNode`, `_drawTriangles3D`) read that instead of `params.morph`. When `audioReactive` is false, `_effectiveMorph` mirrors `params.morph` so the manual slider is live.

**Per-axis reactivity**
- Only `rotSpeedY` is audio-driven (the natural "donut spinning around its hole" axis). `rotSpeedX` and `rotSpeedZ` always read their manual sliders. Makes it easy to overlay a slow tilt on top of an audio-driven spin.

**MIDI onset hook**
- New public method `HarmonographView.pushOnset()` pushes `Date.now()` onto the ring buffer. Template's `MIDIInput.onNoteOn` callback calls it alongside `_syncHarmonyState`. Keeps Web MIDI out of the view class.

**Synthetic test mode**
- New `syntheticDriver` param with values `'off' | 'slow' | 'medium' | 'fast' | 'sweep'`. When non-off, the view bypasses the analyser and MIDI buffer and populates `_smoothedRMS` and `_onsetTimestamps` from a prescribed pattern. Lets you verify the pipeline without live input. `'sweep'` triangle-waves over 60 s from signal=0.2 (1 ev/s) to 0.9 (10 ev/s) and back.
- RMS in synthetic mode is written in dB-space (`signalVal * 50 - 60`) so the downstream mapping produces the intended signal — no special-case in the real-audio path.

**Debug panel**
- New "Audio Reactivity" section between "3D Geometry" and "Smoothing & Decay". Toggle + two dropdowns (`spinDriver`, `syntheticDriver`) + 9 sliders covering gain, min/max spin, morph threshold/K, and all three smoothing taus.
- Row builder extended to support `kind: 'select'` — dropdown `<select>` bound to `view.setParam(key, value)`. Reuses the existing readout column so the grid layout stays consistent.
- Live-readout block at the top of the panel shows resolved driver, normalized signal, current spin (deg/sec), current morph (0..1). Refreshed every frame via rAF. First usable development feedback loop for audio-reactivity — visible without watching the torus to know whether the pipeline is alive.

**Constraints respected**
- `static/shared/resonance-view.js` untouched (Explorer's Resonance tab).
- Manual mode (`audioReactive=false`) behaves pixel-identically to pre-Stage-2: `_updateGridTransform` early-exits to the old `rotSpeedY` integration path, and `_effectiveMorph` mirrors `params.morph`.
- `mode3D=false` (2D legacy path) ignores audio reactivity entirely.

**Not yet tested with real audio**
- Acceptance test with "Montreal" by Allison Russell pending a live-audio session. Synthetic `'sweep'` covers the plumbing.

### Next session

- Run the Allison Russell acceptance test through headphones (workaround for the known audio-input feedback loop). Tune `spinMin`/`spinMax`/`morphK` against a real musical dynamics curve.
- If the dB mapping [-60, -10] doesn't fit typical program audio through the built-in mic, revisit the normalization — or expose the mapping endpoints as params.
- Then: fold audio-reactivity into the 1.5 multi-torus stack design so each stack member can have its own spin/morph (or share a master).

---

## 2026-04-24 — Rename: Art Lab → Harmonograph (cosmetic)

Cosmetic rename of the `/art` sandbox to `/harmonograph`. The visualization draws curves from coupled pendulums tracing harmonic ratios, echoing the Victorian harmonograph machines and connecting cleanly to the Tonnetz mathematical lineage. No functional changes.

**Changes**
- Route: `/art` → `/harmonograph` (new handler in `app.py`). Backward-compat redirect: `/art` now returns `redirect("/harmonograph")`.
- Template: `templates/art.html` → `templates/harmonograph.html`. Page title "Art Lab — Resonance Sandbox" → "Harmonograph". H1 text likewise.
- JS module: `static/shared/resonance-art-view.js` → `static/shared/harmonograph-view.js`. Class `ResonanceArtView` → `HarmonographView`. Canvas class `sl-resonance-art-canvas` → `sl-harmonograph-canvas`.
- Window global: `window.__artView` → `window.__harmonograph`.
- CSS class prefixes scoped to this view: `art-*` → `hg-*` (page, header, title, subtitle, stage, keyboard, hardware, hw-select/status/dot/badge/toggle). Debug panel prefix `sl-adbg-*` → `sl-hg-dbg-*`.
- Debug panel title "Art Lab Tuning" → "Harmonograph Tuning"; `_buildArtDebugPanel` → `_buildHarmonographDebugPanel`.
- Export filename: `art-presets-YYYY-MM-DD.json` → `harmonograph-presets-YYYY-MM-DD.json`.
- Console tags `[Art Lab]` → `[Harmonograph]`, `[art]` → `[harmonograph]`.

**Retained (intentionally)**
- `localStorage['songlab.art.presets']` — keeps the "super fun" preset (and any others the user saved) readable after the rename. Renaming this key would orphan the saved presets. Documented inline in the template.
- `localStorage['songlab.art.keyboardVisible']` — same reason.

**Not touched**
- `static/shared/resonance-view.js` (Explorer's canonical Resonance tab) — unrelated despite the similar name.
- Prior SESSION_LOG entries — history preserved as-is per "don't rewrite history".

**Acceptance**
- `/art` → 302 → `/harmonograph` ✅
- All UI text reads "Harmonograph" ✅
- `window.__harmonograph` replaces `window.__artView` ✅

---

## 2026-04-22 — Art Lab /art: Stage 1 validated end-to-end with live instruments

Wrapped the day by getting Stage 1 fully working with real instruments — piano through Scarlett 2i2 and voice through the built-in mic. Ghost torus + warm/cool chord overlays + role-colored node glows reads as a "fireworks" aesthetic: barely-there armature when idle, bright colored flashes when playing. Saved as a localStorage preset "super fun" — needs Export for persistence across browser data clears.

**MIDI: Launchkey MK4 multi-port fix (`static/shared/midi-input.js`)**
- Symptom: MK4 auto-attach silently failed; `isConnected` stayed false; `[Art Lab] No MIDI device detected.` in console despite the device being visible to the browser.
- Root cause: auto-attach branch was `inputs.length === 1`. MK4 enumerates as **two** ports ("Launchkey MK4 49 MIDI Out" and "Launchkey MK4 49 DAW Out"), so the condition never fires. Prior Launchkey presumably enumerated as a single port, hence no regression flagged until now.
- Fix: change the guard to `inputs.length >= 1` and pick the non-DAW port via `inputs.find((i) => !/\bDAW\b/i.test(i.name)) || inputs[0]`. DAW port carries transport/mixer CC, not the keys — selecting it would send the wrong MIDI into the sampler.
- Applied in both `init()` (line ~202) and `_handleStateChange()` (line ~155) so hot-plug and cold-start behave identically.

**Debug panel: "3D Geometry" section moved to top (`templates/art.html`)**
- Previously buried below "Smoothing & Decay" and "Grid Motion" — required scrolling inside the 280px panel to find the `mode3D` toggle. Multiple fresh-session moments lost to "where's the toggle".
- Fix: reordered `SLIDER_GROUPS` so "3D Geometry" is the first entry. Toggle now visible immediately on panel open.

**Fireworks tuning (pure slider work, no code)**
- `triangle3DBaseAlpha` → 0.04, `triangle3DStrokeAlpha` → 0.02: ghost-faint scaffold
- `triangleFillAlphaPeak` → 0.47, `triangleIntensityScale` → 496, `triangleGlowBlur` → 37, `triangleStrokeWidth` → 1.5: strong colored bloom on held triads
- `spawnRateMultiplier` → 4, `spawnRateCap` → 2, `particleSizeMax` → 6.4, `glowAlphaInner` → 1.0, `lifeMax` → 0.7: larger, brighter, longer-lived sparkle particles at each sounding node
- Saved as preset "super fun" in `localStorage['songlab.art.presets']`. Not yet exported to a file — volatile.

**Known issue discovered: audio-input feedback loop**
- Symptom: selecting any real audio device in the Hardware dropdown (Scarlett, built-in mic) while MIDI sampler output plays through laptop speakers produces immediate feedback.
- Cause: `AudioInput.selectDevice` appears to connect the input source into a path that routes to the destination (speakers), in addition to the analyser. Mic then picks up sampler output → loop.
- Workarounds: (a) use "No audio input" when testing MIDI only, or (b) use headphones / mute speakers before selecting the audio input.
- Fix deferred: `audio-input.js` should route the source only to the analyser, never to `Tone.Destination`. Refactor candidate for a later session.

**End-to-end validation**
- **Piano through Scarlett:** clean chord recognition. Held C major → 4 gold triangles bloom at the four (C, E, G) positions on the torus. Minor chords render cool blue triangles. Progressions read visually as alternating warm/cool constellations around the surface.
- **Voice through built-in mic:** single sung note lights its 4 PC copies with harmonic-FFT blobs per node. Vocal phrases produce streaming color (gold + occasional coral/blue from pitch-detection role classification).
- Warm/cool major-vs-minor distinction is information-bearing and legible against the neutral grayscale scaffold. The two-layer design (grayscale static + warm/cool reactive) delivered what the earlier all-colored version couldn't.

### Decisions

- Stage 1 declared fully complete. The five deferred items (painter's sort, particles reprojection, multi-torus stack, audio-reactive morph, audio-input refactor) are all Stage 1.5+ work.
- Preset persistence: export `super fun` to `docs/art-presets.json` (or similar) before next major `/art` session so it survives localStorage clears. Not done today.
- No Stage 1.5 work started today — session wrap-up after end-to-end validation.

### Next session

- Export the "super fun" preset to a file for persistence.
- Start Stage 1.5 design pass: three-torus stack for register representation. Open questions (from earlier design conversation): stack spacing, one-master-morph vs per-torus-morph sliders, dynamic spacing as morph rises. Design conversation first, then prompt.
- Later stages queued: audio-input feedback refactor, particle reprojection in 3D, painter's algorithm sort if/when self-occlusion artifacts appear.

---

## 2026-04-22 — Art Lab 3D triangles: grayscale scaffold, colored overlay

Separated 3D triangle scaffold color (grayscale) from audio-reactive overlay color (warm/cool) so held chords pop against a neutral surface. New code-only params `scaffoldMajorColor` / `scaffoldMinorColor` drive the always-visible pass; `majorTriadColor` / `minorTriadColor` are now overlay-only. Scaffold pass caches the per-triangle overlay color so the overlay pass still finds warm/cool tints without recomputing. Back-face `alphaFactor` still applies to both passes; no changes to 2D `_drawTriangles` or to `resonance-view.js`.

---

## 2026-04-22 — Art Lab 3D triangles: audio-reactive overlay pass

**Fix:** `_drawTriangles3D` only rendered the warm/cool scaffold — it never consulted `pcState`, so held triads didn't brighten in 3D mode. Added a second pass inside the same `save/restore` that audio-reactively overlays lit triangles on top of the scaffold.

- Scaffold pass is unchanged in behavior (pixel-identical with no audio). It now also writes per-triangle screen coords, `alphaFactor`, and tint color into a lazily-allocated `_triFrameCache` so the overlay pass doesn't need to re-rotate or re-project.
- Overlay iterates the cache, skips any entry the scaffold skipped (degenerate `|normal| < 1e-8`), and for each triangle whose three vertex PCs are all `active` and above `silentEps` draws a lit fill + shadow bloom. Same math as the 2D `_drawTriangles`:
  - `intensity = min(1, avg(energy) · triangleIntensityScale)`
  - `overlayAlpha = triangleFillAlphaPeak · intensity · alphaFactor`
  - `shadowBlur = triangleGlowBlur`, `shadowColor` matches the overlay alpha
- Back-face `alphaFactor = 0.6 + 0.4 · facing` is reused from the scaffold, so lit triangles on the far side dim consistently with the rest.
- Major triads glow warm (`majorTriadColor`), minor cool (`minorTriadColor`) — same palette as the scaffold; only alpha and bloom differ.
- No new params: `triangleFillAlphaPeak`, `triangleIntensityScale`, `triangleGlowBlur`, `silentEps` (which already had 2D-mode sliders) now also drive 3D mode.
- 2D path untouched. `static/shared/resonance-view.js` untouched.

---

## 2026-04-22 — Art Lab 3D rendering, Stage 1 Prompt 2: triangles on the torus/sphere

**Focus:** Add the always-visible triangle scaffold to the 3D path. 96 triads (12·4·2) tinted warm/cool by major/minor direction with continuous back-face alpha so the far side fades smoothly through the silhouette. The 2D path stays bit-for-bit identical when `mode3D` is off.

### Triangle build (resonance-art-view.js)
- `_build3DGrid` now populates `this.triangles` with 96 entries — every cell of the toroidal 12×4 lattice gets both an upward (major) and a downward (minor) triad. No boundary gaps because the lattice wraps on both axes. Each entry carries `{ a, b, c, type }` where `type ∈ {'major', 'minor'}`.
- Winding chosen so `(p1 − p0) × (p2 − p0)` points outward at morph=0:
  - **Major (upward):** v0 = (col, row), v1 = (col+1 mod 12, (row−1+4) mod 4), v2 = (col+1 mod 12, row)
  - **Minor (downward):** v0 = (col, row), v1 = (col+1 mod 12, row), v2 = (col, (row+1) mod 4)
- Sanity-checked offline: at (col=0, row=0) the major triangle's normal is approximately (+0.69, +0.19, −0.69); dot product with the torus surface normal at the triangle centroid is ≈ 0.94 (strongly outward). Same check for the minor triangle gives ≈ 0.93. Winding is correct on both.

### Render path
- `_drawTriangles` branches at the top: `if (mode3D) return _drawTriangles3D()`. The 2D code path is untouched.
- `_drawTriangles3D` iterates all 96 triangles every frame:
  - Recomputes rotated 3D positions (`_uvToXYZ → _rotate3D`) for the three vertices to derive the per-triangle normal — `_transformedNode` does roughly the same work for the lattice draw, but reusing it would mean projecting then unprojecting; 96 × 3 = 288 extra rotate calls/frame is fine. Cache later if needed.
  - Computes `n = (p1−p0) × (p2−p0)`, normalizes, takes `n.z` as the facing value (orthographic camera looks from +z).
  - Continuous back-face alpha: `alphaFactor = 0.6 + 0.4 · facing`, so far-side ≈ 0.2× base, near-side ≈ 1.0× base, smooth through the silhouette. No hard ring.
  - Color: warm `[220, 165, 90]` for major, cool `[90, 140, 210]` for minor.
  - Single-pass, build order — no painter's-algorithm sort.
- Degenerate triangles (normal magnitude < 1e-8 — happens at the sphere poles when morph→1) are skipped to avoid divide-by-zero.

### Draw order
- 2D mode: `_drawGrid()` then `_drawTriangles()` — preserves the original chord-glow look exactly. Bit-for-bit identical to before.
- 3D mode: `_drawTriangles()` then `_drawGrid()` — the 96-triangle scaffold is filled, so reordering keeps the faint lattice edges + dots visible on top of the triads. Done with a small `if (mode3D)` branch in `_render()`.

### New tunables (DEFAULT_PARAMS + debug panel)
- `triangle3DBaseAlpha` (0.45) — base fill alpha before back-face scaling
- `triangle3DStrokeAlpha` (0.6) — edge stroke alpha (same back-face scaling applied)
- `triangle3DStrokeWidth` (1.2) — edge line width
- `majorTriadColor` `[220, 165, 90]` — code-only, not in debug panel (RGB triple, not a single scalar)
- `minorTriadColor` `[90, 140, 210]` — code-only

Three sliders added to the existing "3D Geometry" debug-panel group. Color params intentionally omitted from the panel — RGB sliders bloat the UI; tune in code for now.

### Self-occlusion / known visual notes
- Single-pass, no depth sort. As the torus rotates the back-face alpha falloff handles most of the visual layering — far-side triangles fade to ~20%. Where the surface curves so two front-facing triangles overlap on the projection, the later-drawn one wins (build order). Hasn't looked bad in initial inspection but if it ever looks chunky, a painter's-algorithm pass (sort by centroid `z`, draw far→near) is the next step. Two-pass back-then-front is also an option. Deferred.
- At morph = 1 (pure sphere), the (u, v) parameterization double-covers the surface (same surface point reached by `(u, v)` and `(u+π, π−v)` after the morph collapses the tube radius). Result is an interleaved front/back pattern of triangles. Known and expected — do not "fix" by changing the sphere equation.

### Explicitly deferred
- Painter's-algorithm sort / two-pass back-then-front rendering.
- RGB tint sliders in debug panel.
- Particles / audio-reactive blobs in 3D mode (still spawn at 3D-projected screen positions — wrong; later stage).
- Multi-torus stacking (Stage 1.5), audio-reactive morph (Stage 2).

### Notes
- `static/shared/resonance-view.js` (Explorer's Resonance tab) untouched.
- 2D triangle build / render path untouched. Existing `triangleFillAlphaPeak`, `triangleStrokeAlpha`, etc. continue to drive the 2D audio-reactive triangles.
- No git activity — Dustin commits.

---

## 2026-04-22 — Art Lab 3D rendering, Stage 1 Prompt 1: torus/sphere lattice (nodes + edges)

**Focus:** Add a 3D rendering path to `/art` behind a `mode3D` feature flag. Lattice projects onto a torus-to-sphere morphable surface with manual rotation and morph sliders; rendered as nodes + edges only. The 2D path stays unchanged when the flag is off (default). Triangles, back-face alpha, particles-in-3D, and audio reactivity are explicitly deferred.

### Geometry & math (resonance-art-view.js)
- New module constants `GRID_COLS_3D = 12` (P5 → u, wraps the big circle) and `GRID_ROWS_3D = 4` (m3 → v, wraps the tube). `(u, v)` parameterization shared by torus and sphere; PC formula unchanged: `(7·col + 3·row) mod 12`. Each PC appears 4× on the surface.
- Parametric surfaces: torus `((R + r·cos v)·cos u, (R + r·cos v)·sin u, r·sin v)` and sphere `(R·cos v·cos u, R·cos v·sin u, R·sin v)`. Linear `morph ∈ [0, 1]` interpolates vertex positions.
- Rotation: three independent angular velocities `rotSpeedX/Y/Z` around world axes, accumulated as radians per frame in `_updateGridTransform`. Euler order XYZ.
- Projection: orthographic via `_projectOrtho`. `_projScale` recomputed in `_resize` to fit `(R + r)` into ~70 % of the smaller canvas dimension; deliberately not recomputed when `morph` / radii sliders move (good enough for Stage 1, revisit if it clips).

### Mode-aware path (no behavior change with mode3D=false)
- `_buildGrid` branches: mode3D off keeps the existing 7×5 layout intact; mode3D on calls `_build3DGrid` which builds 48 nodes carrying `(col, row, u, v, pc)` and toroidally-wrapped edges (every node has all six Tonnetz neighbors). Triangles intentionally `[]` until Prompt 2.
- `_transformedNode` branches the same way: 2D mode keeps its rigid-body rotate-and-sway transform; 3D mode runs `_uvToXYZ → _rotate3D → _projectOrtho` per node per frame. `_drawGrid` (edges + dots) reuses these projected coords without modification.
- `setParam`/`setParams` rebuild the lattice when `mode3D` flips (topology change — node count and neighbors differ). Other 3D params take effect immediately without rebuild.

### Debug panel additions (templates/art.html)
- New SLIDER_GROUPS section "3D Geometry" after "Grid Motion": `mode3D` (checkbox), `morph`, `torusMajorR`, `torusMinorR`, `rotSpeedX/Y/Z`.
- Row builder extended to support `kind: 'toggle'` — checkbox in the slider column, "on"/"off" readout in the value column. Layout matches the existing slider rows (no CSS tweaks needed). `_syncSlidersFromView` updated to handle toggle refs.
- Default `rotSpeedY = 8 deg/s` so flipping mode3D on produces an obviously-3D rotating shape on first render — no need to dial in a speed before it looks alive.

### Explicitly deferred to Prompt 2 / later stages
- Triangle rendering in 3D (Prompt 2).
- Back-face alpha + winding-based occlusion (Prompt 2).
- Particles in 3D (currently spawn at 3D-projected screen positions — functional but visually wrong; later stage).
- Multi-torus stacking (Stage 1.5), audio-reactive morph (Stage 2).

### Notes
- `static/shared/resonance-view.js` (Explorer's Resonance tab) intentionally untouched — Art Lab's fork continues to diverge in `resonance-art-view.js` only.
- No git activity — Dustin commits.

---

## 2026-04-22 — Art Lab audio infrastructure: MIDI, mic, chord + pitch detection

**Focus:** Wire real audio input into `/art` end-to-end so the visualization responds to actual performance (MIDI keyboard, microphone, sustain pedal) — not just on-screen keyboard clicks. Long session; five-plus hours deep in audio plumbing that uncovered two latent bugs neither of which were in today's new code.

### MIDI + Launchkey 49 + sustain pedal
- `MIDIInput` module wired in `templates/art.html` via an IIFE in `_initMIDI`. Launchkey 49 auto-detects, drum channel 10 filtered, `noteOn` / `noteOff` routed through the shared `KeyboardView` sampler proxy.
- Unified held-notes tracker added — four source types merged: on-screen keyboard (via `onNotePlay`/`onNoteRelease` callbacks), MIDI held notes, MIDI sustained notes, detected chord/pitch events. Replaces the prior "append everything, let it sort itself out" pattern.
- `KeyboardView._handleKeyUp` now fires a new `onNoteRelease` callback symmetric to `onNotePlay`. Fixes a stale-highlight bug where on-screen keys glowed after being released.
- Sustain pedal (CC 64) handled with standard piano semantics: pedal down defers `triggerRelease`; pedal up flushes all sustained notes. Hardware gotcha: the sustain pedal's switch needed to be physically flipped from "continuous" to "switch" position to send CC 64 at all.

### On-screen keyboard visibility toggle
- Hidden by default. `Keyboard` button in the Hardware row (right-aligned via `margin-left: auto`) toggles `.art-keyboard--hidden`. Preference in `localStorage['songlab.art.keyboardVisible']`.
- Path A over Path B: `KeyboardView.init()` still runs on page load — the view owns the sampler and analyser chain that feeds the rest of `/art`. Hiding is purely a DOM concern; audio plumbing is untouched.
- Deferred: `/art` owning its own audio chain independent of `KeyboardView` (Path B). Revisit when a concrete feature needs it (e.g., instrument palette).

### Chord + pitch detection wired into `/art`
- Both detectors start together in `_updateAudioInputStatus`'s reconciliation when `AudioInput.isActive && toneRunning`. Stop together on disconnect.
- Parallel, not exclusive. Pitch wins on confident monophonic input (`confidence >= 0.85`); chord takes over when pitch returns `frequency=0` (polyphonic / silence / ambiguous). Handoff is automatic — no UI toggle.
- Chord-detection is edge-triggered (emits on chord *change*), so a silence watcher (100ms poll, 500ms quiet threshold) clears the detected chord when audio stops. Pitch-detection emits continuously so it doesn't need one.
- Root-first entry ordering in `_chordEventToEntries` so `_readHarmonyState`'s order-based role assignment colors root=gold, third=coral, fifth=blue correctly.

### Audio-input routing bug (latent, predates `/art`) — FIXED
- Symptom surfaced late in the session: holding C4 on the RD2000 with the Scarlett 2i2 as input showed `Tone.Analyser.getValue()` peak at `-120 dB` (silence) — while pitch-detection's separate `AudioContext` saw real samples (`maxAbs ~ 0.01`). Meaning: mic audio reached Chrome but never reached the analyser that the rest of `/art` reads from.
- Every chord-detection emission earlier in the session was reading residual MIDI sampler audio (from the initial Launchkey note that armed Tone), not mic input. Hours of "it works" conclusions were wrong.
- Root cause: when `_attachAudioInputToTone` ran post-Tone-start, `AudioInput._sourceNode` was still the stale one from the fallback-context auto-restore. `setAnalyser()` tries to disconnect and reconnect that stale source cross-context; Chrome silently refuses the reconnect; the later `selectDevice`'s fresh source-to-analyser wiring is already broken by the prior failure.
- Fix: explicit `AudioInput.disconnect()` before `setAnalyser` in `/art`'s `_attachAudioInputToTone`. Tears down stale stream + `_sourceNode` from the fallback context; `setAnalyser` becomes a safe no-op (no source to reconnect); `selectDevice` then creates a fresh stream + source in Tone's context and wires it to the already-set analyser cleanly.
- Manual-verification diagnostic (useful for future debug): while holding a note, `__artView.analyser.getValue()` should show peaks in `-30` to `-50` dB range (linear `0.01`–`0.05`). Anything near `-120 dB` means the source isn't wired.
- **Resolves the April 19 "Scarlett 2i2 audio routing needs verification" known issue.**
- Contained to `templates/art.html` only; shared `audio-input.js` untouched. A proper refactor (fixing `setAnalyser`'s stale-source side effect) is deferred — would touch Explorer's audio path too.

### `pitch-detection.js` autoplay-policy fix (shared module)
- Chrome starts programmatically-created `AudioContext` instances in `suspended` state. While suspended, `ScriptProcessorNode.onaudioprocess` does not fire at all — YIN "runs" but gets zero samples, returns `frequency: 0` on every callback, and `_detectedPitch` never populates.
- Why Melody Match hasn't hit this: its detector is created inside a button-click handler (user gesture scope), which exempts the new `AudioContext` from suspension. `/art` creates its detector asynchronously through `_updateAudioInputStatus` reconciliation, well outside any gesture.
- Fix: `await audioContext.resume()` after construction in `start()`. `resume()` is a no-op on already-running contexts, so all existing callers are unaffected.

### Role preservation through decay tails (shared module)
- Previously `_readHarmonyState` in `resonance-art-view.js` reset every PC's role to `'root'` on every HarmonyState update. PCs decay over 2–3 seconds; during decay they rendered in the wrong color (gold) regardless of what role they'd had when active.
- Fix: reset role only for PCs about to be re-assigned this frame. PCs in decay tails keep their last-active color. Preserves the prefer-lowest-index-role logic for same-frame multi-octave cases.

### Triangle visibility + blob duration fix
- `silentEps` default lowered from `0.001` to `0.0001` so quieter notes can cross the activity threshold.
- New `triangleIntensityScale` parameter (default `100`); slider added to the Chord Triangles panel. The intensity formula in `_drawTriangles` multiplies by this scale before `Math.min(1, ...)`.
- Root cause: per-PC energy for a held triad is around `0.003`, but the prior formula was calibrated assuming ~`1.0` energy. `alpha × intensity ≈ 0.003` rendered invisible.

### Hardware setup notes (for future reference)
- RD2000 Output L/Mono → Scarlett 2i2 Input 1 via TRS. Inst **off** (line level), 48V **off** (not needed), Air **off**. Direct Monitor **on** (hardware loopback for headphones, zero latency). Scarlett gain at ~2pm on the dial for a clean line-level signal; halo steady green on held notes.
- macOS does **not** expose an input-volume slider for audio interfaces — the Scarlett exposes hardware gain instead. This is correct pro-audio behavior; the slider's absence is not a bug.
- Distinctive confusion point: `QTR-10` or similar Hosa cables are TS (unbalanced, "instrument") cables, not TRS. A TS cable from the RD's balanced line out will come through ~6 dB quieter than a TRS would. Roland's "Professional Audio Cable" is TRS.

### Workflow / process notes
- Container workflow held up despite the rabbit hole. All work drafted as scoped Claude Code prompts in claude.ai, verified with `node --check` between rounds.
- Eight prompts landed during the session: held-notes tracker, MIDI wiring (two parts), triangle visibility fix, keyboard toggle, first audio-input rewire (incomplete), role preservation, chord detection, pitch detection, `pitch-detection.js` resume fix, audio-input clean-state fix.
- Key debugging step that broke the session open: directly reading `__artView.analyser.getValue()` on the live analyser — peaks at `-120 dB` despite `isActive: true` exposed that the whole session's chord-detection output had been phantom. Lesson: don't trust "it works" visual signals alone when there's an external-audio path; always check the analyser's actual peak level against what your ears are hearing through Direct Monitor.

### Decisions made
- Chord + pitch detection run in parallel (not exclusive). Pitch wins when confident; chord takes over polyphonic / silence. No UI toggle.
- Held-notes tracker is additive across all four sources — MIDI and detected chord/pitch can coexist.
- On-screen keyboard toggle uses Path A (keep `KeyboardView` instantiated, hide DOM only). Path B (separate audio chain) deferred.
- Audio-input rewire fix contained to `templates/art.html`. Shared `audio-input.js` `setAnalyser` refactor deferred — touches Explorer's path too.
- Triads remain the geometric core of the Tonnetz; extension notes (7ths etc.) will be an additive visual layer in future work, not modifying triangle geometry.

### What's next
- **Torus/sphere morph 3D rendering in `/art`** — Dustin's stated top priority; not yet started. Design-doc pass needed first (lattice → (u, v) parameterization, projection math, back-face alpha, triangle orientation on curved surface). Stage 1 is manual `morph` slider; Stage 2 audio-reactive morph driven by harmonic complexity is a separate follow-up.
- SkratchLab polish — "Clear All" button should also reset canvas
- Polyrhythm Trainer → nav + landing
- Linus and Lucy walkthrough
- Business model / monetization spec
- Onset detection wired into Resonance (still deferred)
- AudioWorklet migration for `pitch-detection.js` (ScriptProcessorNode is deprecated; tracked in `docs/audio-architecture.md` Open Question 1)

### Known issues from this session
- None new. Deprecation warning from `ScriptProcessorNode` in `pitch-detection.js` is benign and pre-existing.
- Two known issues resolved: Scarlett 2i2 audio routing verification (from April 19); `/art` visual issues from April 20 testing (the unexplained "visual problems" were the invisible-triangles bug, now fixed).

---

## 2026-04-20 — Resonance Debug Panel, Sparkler Tuning, /art Sandbox

**Focus:** Live-tuning debug panel for Resonance, iterative refinement of particle aesthetic from "starburst" to "sparkler", and a forked `/art` sandbox route with experimental grid motion and chord-triangle merging.

### Resonance debug panel (Explorer)
- URL-gated debug panel: `/explorer?debug=resonance` mounts a fixed-position overlay in the Resonance stage. Production users see nothing.
- Refactored `resonance-view.js` constants → `DEFAULT_PARAMS` instance object with `getParams()` / `setParam()` / `setParams()` methods. Per-frame reads enable live tuning without reload.
- 22 tunable parameters across four collapsible sections: Smoothing & Decay, Particle Spawning, Particle Lifetime & Motion, Render & Glow.
- Save / Export / Reset preset system with `localStorage['songlab.resonance.presets']`. Export downloads dated JSON (`resonance-presets-YYYY-MM-DD.json`).
- Initial implementation used native `window.prompt()` for preset names; replaced with inline name-entry input row after Chrome's narrow URL-bar prompt was easy to miss and easy to dismiss accidentally.
- Panel layout fix mid-session: viewport-fit with `flex-direction: column`, sticky header (preset bar + Save/Export/Reset always visible), internal scroll on the slider list with `min-height: 0` to make flex shrink correctly.

### Bug fixes during tuning
- **Inverted blob fill:** the per-node radial gradient was transparent at center → faint color at edge, making blobs look hollow. Fixed to center-bright → transparent at envelope edge with new `blobFillAlpha` tunable.
- **Wiggle direction:** particle wiggle was applied in global screen X/Y axes regardless of flight direction, causing all particles to drift sideways relative to their trajectories. Fixed with proper perpendicular-to-velocity computation: `perp = (-vy, vx) / speed`, single sin term applied along it.
- **Peak threshold hidden:** `PEAK_MAG_THRESHOLD` was a module constant; promoted to log-scale `peakMagThreshold` slider so the gating threshold for "which harmonics qualify as spawn sites" can be tuned live.

### New defaults baked into Resonance (Explorer-affecting)
Tuned to a "sparkler" aesthetic: short particle lifetimes, low velocity, high spawn rate, deceleration, increased glow.
- New `particleDeceleration` parameter (default `0.95`) — multiplies velocity per frame so particles slow over their lifetime instead of moving in straight lines until they die. Range `0.85`–`1.0`, step `0.005`.
- 12 baseline values updated in `DEFAULT_PARAMS`: `releaseDecay 0.95`, `spawnRateMultiplier 4.0`, `spawnRateCap 2.0`, `speedMin 0.3`, `speedMax 0.7`, `lifeMin 0.25`, `lifeMax 0.5`, `wiggleAmplitude 0.35`, `trailFadeAlpha 0.35`, `envelopeShadowBlur 14`, `glowAlphaInner 0.75`, `glowRadiusMultiplier 7`.
- **Behavior change for end users:** Explorer's Resonance tab now renders sparkler-style by default, not starburst. Original April 19 aesthetic not preserved as a baked-in preset.

### `/art` sandbox route — forked Resonance for experimentation
- New Flask route `/art` rendering `templates/art.html`.
- New `static/shared/resonance-art-view.js` — verbatim fork of `resonance-view.js`. Class renamed to `ResonanceArtView`, canvas class prefix `sl-resonance-art-canvas` to avoid CSS collision. Shares `DEFAULT_PARAMS` shape but will diverge.
- Page layout: title block, dominant canvas, 25-key keyboard for audio input, Hardware audio-source line. Debug panel always visible (no URL gate — entire route is sandbox).
- Independent preset namespace: `localStorage['songlab.art.presets']`. Panel CSS prefix `.sl-adbg-` so it can't collide with Explorer's `.sl-rdbg-`.
- Panel title "Art Lab Tuning" (vs Explorer's "Resonance Tuning") to keep them visually distinct.
- The Explorer's Resonance tab is fully untouched by the fork — `resonance-view.js` and `templates/explorer.html` unchanged in this step.

### Grid motion (`/art` only)
- Three new tunables, all defaulting to `0` so baseline is unchanged until dialed in: `gridRotationSpeed` (deg/s, ±30), `gridSwaySpeed` (Hz, 0–0.5), `gridSwayAmplitude` (px, 0–200).
- Lattice rotates and sways as a single rigid body around canvas center. `_transformedNode()` helper applies the transform per-frame; `_updateGridTransform(dt)` advances rotation and circular-sway accumulators.
- Edges, dots, and blobs all walk through the transform; particles spawn at the transformed center.
- Particles live in screen space — they spawn from moving node positions but don't inherit subsequent grid motion. Produces a comet-trail effect on slow rotation.

### Chord triangle highlights (`/art` only)
- Triangle list built at lattice setup: ~48 triangles in the 7×5 lattice, enumerated as upward (major) and downward (minor) Tonnetz triads using the existing `nodeIdxAt` helper.
- Per frame, for each triangle: if all three vertex PCs are simultaneously active and above `silentEps`, render a flat gold fill + stroked outline with `shadowBlur` glow. Avg vertex energy scales fill/stroke alpha.
- Geometric truth emerges naturally without chord-specific code: held Cmaj triad lights one upward triangle; Cmin lights one downward; Cmaj7 (C-E-G-B) lights two adjacent triangles sharing the E-G edge.
- Drawn under per-node blobs so blobs remain focal and triangles act as halo/scaffold behind them.
- Four tunables: `triangleFillAlphaPeak` (default `0.18`), `triangleStrokeAlpha` (default `0.5`), `triangleStrokeWidth` (default `1.5`), `triangleGlowBlur` (default `12`).

### Workflow / process notes
- Strategic-planning workflow held up well: claude.ai for architecture and prompt drafting, scoped Claude Code prompts for implementation, all verified with `node --check` between rounds.
- Six sequential Claude Code prompts ran cleanly: debug panel; layout fix + bug fixes (blob fill, wiggle, peak threshold); inline preset-name input; deceleration param + sparkler defaults; `/art` baseline fork; `/art` grid motion; `/art` chord triangles.
- The audio-input.js change from a previous session (cross-context `_connectToAnalyser` helper) was sitting uncommitted at session start; committed as its own focused commit before starting Resonance work to keep diffs clean.

### Decisions made
- Resonance's debug panel stays gated behind `?debug=resonance`; production users see nothing. `/art`'s panel is always visible (the route itself is a sandbox).
- Forked rather than parameterized: `resonance-art-view.js` is a separate file, will diverge freely. The Explorer version is the stable canonical.
- Triangle coloring uses the root role (gold) for all triangles regardless of which vertex is the chord root; quality is encoded by triangle direction (up = major, down = minor) per Tonnetz convention.
- New defaults on Resonance affect Explorer end users; original starburst not preserved as a named preset (deferred decision).
- `/art` has no nav link — sandbox-only by design; revisit if it grows into a real destination.

### What's next
- Debug visual issues identified during `/art` testing (deferred for next session — not enumerated this session)
- Polyrhythm Trainer → nav dropdown + landing page
- Linus and Lucy walkthrough (connects from Polyrhythm Trainer)
- Tab-audio capture for YouTube playback test against `/art`
- Decide `/art` front-door: linked from nav, footer, hidden, or remain unlinked sandbox
- Consider preserving original "starburst" Resonance aesthetic as a named baked-in preset
- Onset detection wired into Resonance for staccato burst behavior (deferred from earlier in session)
- Business model / monetization spec (still deferred from April 16)

### Known issues from this session
- `/art` has no nav link (intentional for sandbox, but easy to forget the route exists)
- Resonance defaults changed from starburst to sparkler — behavior change for any users who saw the April 19 release
- Visual issues in `/art` experiments noted by Dustin but not enumerated; carry-over for next session

---

## 2026-04-19 — Resonance Tab, Audio Interface Wiring, Polyrhythm Tweaks

**Focus:** Tonnetz generative art visualization ("Resonance" tab), Scarlett 2i2 audio interface wiring into Explorer, Polyrhythm Trainer visual refinements.

### Resonance tab — new Explorer panel (6th tab)
- `static/shared/resonance-view.js` — new module: `ResonanceView` class with init/setAnalyser/start/stop/destroy
- 7×5 Tonnetz lattice (horizontal=P5, up-right=M3, down-right=m3) as invisible spatial scaffold (~5% alpha dots + edges)
- **Radial spectrum visualization:** each active node renders the FFT spectrum wrapped in a circle — frequency maps to angle, magnitude maps to radius. The same FFT data the Spectrum panel reads linearly, bent into a circle around each Tonnetz node.
- Three rendering layers per node: outer ghost fill (0.05 alpha), inner fill (0.12 alpha), envelope stroke (1.2px with glow), hot center dot with white highlight
- Peak markers: top harmonics get bright dots on the envelope edge — flicker with live FFT
- Particles: spawn from FFT peak positions on the envelope, radiate outward in all directions (starburst), colored by chord function, glow halos on strong peaks. Dynamics matched to Spectrum panel (spawn rate, lifetime 1.2-2s, constant velocity with sinusoidal wiggle, trail fade 0.22)
- **HarmonyState gating:** only nodes whose pitch class is in HarmonyState's activeNotes render. Prevents harmonic bleed from lighting up unplayed notes. HarmonyState controls WHAT lights up, FFT controls HOW it looks.
- **Pure FFT-driven decay:** no synthetic fallback. Blobs bloom with real audio, decay with the instrument's natural release envelope. Removed synthetic harmonic simulation entirely.
- Chord-function coloring: gold (root), coral (third), blue (fifth), green (seventh) — same as Spectrum panel
- Fullscreen toggle button on both Spectrum and Resonance tabs (Fullscreen API)
- Lifecycle managed: start/stop on tab switch, same pattern as Spectrum

### Audio interface wiring (Explorer)
- `audio-input.js` wired into Explorer: Hardware section with device dropdown, connection status, source quality badge (Interface/Mic)
- On device selection: MediaStreamSource feeds shared `Tone.Analyser` via `KeyboardView.getAnalyser()` — Spectrum and Resonance both read live external audio
- Auto-restore from localStorage on page load
- USB plug/unplug detection via `onDeviceChange`
- Tone-context handoff: auto-restored device re-selects into Tone's context after `Tone.start()` so the source node feeds the shared FFT analyser
- Fixed Tone.js node connection error ("value with given key not found") — native Web Audio nodes need `Tone.connect()` or access to the analyser's internal native node

### Polyrhythm Trainer tweaks
- HIT_Y moved from 370 → 280 (1/3 from bottom) — more room for post-hit effects
- Particles spray downward into post-hit zone, combo text spawns below hit line and floats up
- Lane breathing waves + interference wave extend past HIT_Y to canvas bottom with fade-out
- Missed notes continue falling below HIT_Y and fade out
- Audio gain chain: oscillator → layerGain → masterGain → destination. Eliminates overlap on tempo/polyrhythm changes and enables instant muting.

### Iterative design process (Resonance)
- Built 5 prototype iterations in claude.ai visualizer before landing on the radial spectrum concept
- v1: horizontal scrolling beats (rejected — not Guitar Hero enough)
- v2: organic Gaussian blobs (rejected — all shapes looked the same)
- v3: per-node FFT sampling (closer — but simulated FFT was lifeless)
- v4: reactive jittery blobs (better dynamics but too firework-like)
- v5 (shipped): literal spectrum display wrapped radially, HarmonyState gating, Spectrum-matched dynamics
- Key insight: the visualization must be grounded in physics (real FFT data), not artistic interpretation

### Decisions made
- Resonance is the 6th Explorer tab, after Spectrum. May become a standalone `/art` route later.
- HarmonyState gates visibility (which nodes), FFT drives appearance (how they look). Neither alone is sufficient.
- No synthetic fallback — Resonance only visualizes real audio. Dark canvas with faint grid when nothing is playing.
- Fullscreen toggle added to both Spectrum and Resonance for immersive display
- Scarlett 2i2 audio flows through the same analyser as internal sampler — both visualize simultaneously
- Particle dynamics aligned with Spectrum: spawn rate, lifetime, velocity, glow, wiggle all matched

### What's next
- Refine Resonance sparkle particle behavior (density, direction, glow tuning)
- Debug Scarlett 2i2 input in Explorer (browser sees device but audio may not be flowing)
- Business model / monetization spec (deferred from April 16)
- Add Polyrhythm Trainer to nav + landing page
- Brainstorm session outcomes (printed brief available)
- User testing prep

---

## 2026-04-17 — Polyrhythm Trainer v2, Code Review Fixes

**Focus:** Polyrhythm game redesign (Practice/Challenge modes, drum pads, phase-based BPM ramp), Opus 4.7 code review fixes.

### Polyrhythm Trainer v2 redesign
- Replaced the old level system (Listen/Feel it/Split it) with two distinct modes:
  - **Practice Mode:** structured 5-phase training ramp (Listen → Layer A → Layer B → Both → Victory). BPM auto-ramps from start to goal within each phase. Player masters one polyrhythm progressively.
  - **Challenge Mode:** arcade-style adaptive difficulty. Three axes: tempo, polyrhythm complexity, timing tolerance. Endless scoring with leaderboard.
- **Drum pads:** two large HTML pad elements below canvas (Layer A = purple [F], Layer B = gold [J]). Primary tap targets with hit/miss flash animations. Dims inactive pad during single-layer phases.
- Phase indicator drawn on canvas: `Listen → A → B → Both → ✓` with BPM progress bar
- Per-phase results screen with accuracy breakdown, "Try again at {stalled BPM}" button
- Challenge Mode: top-5 leaderboard in localStorage, progression path visualization, session-fail at <30% for 4 bars
- "Skip to Both →" link for experienced players
- Song preset buttons: "Linus & Lucy" (3:2 @ 150), "Oye Como Va" (3:4 @ 120), "Mission Impossible" (5:4 @ 100)

### Polyrhythm visual tweaks
- HIT_Y moved from 370 → 280 (1/3 from bottom). Particles spray downward into post-hit zone. Combo text spawns below hit line and floats up.
- Lane breathing waves + interference wave extend past HIT_Y to canvas bottom with fade-out
- Missed notes continue falling below HIT_Y and fade out
- Audio gain chain: oscillator → layerGain → masterGain → destination. Eliminates audio overlap on tempo/polyrhythm changes and enables instant per-layer muting.

### Opus 4.7 code review fixes (5 critical blockers resolved)
1. **audio-bridge.js** — replaced dead `startPitchDetection`/`stopPitchDetection` imports with `createPitchDetector` from pitch-detection.js. SkratchLab loads again.
2. **rhythm.js + detection.js** — disabled dead `/start_listen`/`/poll_audio`/`/stop_listen` route calls. Added TODO pointing to onset-detection.js migration.
3. **audio-input.js** — fixed cross-AudioContext wiring. Now uses `Tone.getContext().rawContext` instead of creating a separate context. Falls back gracefully if Tone unavailable.
4. **chord-detection.js** — replaced hardcoded `sampleRate = 44100` with runtime `analyser.context?.sampleRate ?? 48000`. Fixes chord detection on 48kHz systems.
5. **Dev routes gated** — 7 test routes wrapped in `if app.debug:`. Hidden in production.
6. **Swing Trainer** — couldn't reproduce 500 locally. Added diagnostic comment and KNOWN-ISSUES entry.
7. **Orphan cleanup** — deleted 5 dead files (old-ch1-sound.js, scrollymess-ch1-sound.js, walkthrough-overlay.js, config.js, config.example.js). Removed unused `scipy.signal` import. Added try/catch to user-profile.js `_save()`.

### Decisions made
- Practice Mode phase progression is the core pedagogical tool; Challenge Mode is the arcade show-off
- Mic onset works for single-layer phases (2 & 3); Phase 4 (Both) requires two inputs (pads/keys/MIDI)
- Temporal onset assignment for two-layer mic was considered and deferred — convergence-point ambiguity too frustrating
- Drum pads are HTML (not canvas) for proper multi-touch and accessibility
- Dark theme confirmed for this game; whether other Performance games follow is deferred

### What's next
- Test both Practice and Challenge modes thoroughly
- Business model discussion (deferred from April 16)
- Add Polyrhythm Trainer to nav dropdown and landing page
- Linus and Lucy walkthrough to connect from the Polyrhythm Trainer
- Consider: dark theme for other Performance games?

---

## 2026-04-16 — Audio Architecture (Phase A++), Polyrhythm Trainer v1, Opus 4.7 Code Review

**Focus:** Client-side audio DSP migration (6 modules), audio.js dead code cleanup, Melody Match fix, Polyrhythm Trainer initial build, comprehensive Opus 4.7 code review.

### Audio architecture audit + decision
- Discovered broken state: `startPitchDetection`/`stopPitchDetection` in audio.js call non-existent Flask routes (`/start_listen`, `/poll_audio`). `autocorrelate()` defined but never called. Melody Match was non-functional in production.
- Server-side DSP (`librosa.pyin` via `/process_audio_chunk`) has ~130-300ms latency — unusable for rhythm games.
- Decision: migrate to client-side DSP. Python backend retained for future offline analysis (Phase E).
- Created `docs/audio-architecture.md` — full spec covering five detection modalities, device selection, migration plan.
- Updated `docs/songlab-build-plan.md` — new Phase A++ inserted with six tasks, dependency graph updated, session budget revised.

### Phase A++ — six modules landed
1. **Dead code cleanup** (audio.js) — deleted `startPitchDetection`, `stopPitchDetection`, `autocorrelate`, related state vars. Fixed Melody Match import with TODO.
2. **`audio-input.js`** — audio interface device selection (Scarlett 2i2 auto-detect), `getUserMedia` with device picker, source quality flag, localStorage persistence. Pairs with `midi-input.js` as "pro hardware" setup.
3. **`onset-detection.js`** — spectral flux onset detector reading from shared `Tone.Analyser`. Adjustable threshold + cooldown. Highest-leverage single module — unlocks 4 rhythm games.
4. **`pitch-detection.js`** — client-side YIN algorithm for monophonic pitch. Strategy pattern: `engine: 'yin'` (free) swappable to `engine: 'crepe'` (Pro tier, Phase E). 15-cent grace window, confidence threshold. **Fixed Melody Match** — first working mic input in unknown amount of time.
5. **`chord-detection.js`** — port of `chord_detector.py` to JS. Chroma vector from FFT → template matching (10 chord types) → bass detection. Interface recommended, mic experimental.
6. **`input-provider.js`** — unified input abstraction. Games declare supported modalities → provider emits uniform events → picker UI shows available options. Polyrhythm Trainer is first consumer.

### Polyrhythm Trainer v1 (B8) — initial build
- Guitar Hero-style falling-note game with dark DAW theme
- Two vertical lanes (purple/gold), ghost-to-solid note fade, receptor rings, particle bursts
- Background: lane breathing waves (Gaussian pulse), interference wave in center gap, scrolling grid
- Web Audio API scheduler (20ms lookahead), raw oscillator sounds (880Hz / 260Hz)
- Three-level system (Listen/Feel it/Split it) with 3-axis adaptive engine
- `input-provider.js` + `onset-detection.js` wired for mic/clap input
- Adaptive engine: tempo, polyrhythm complexity, timing tolerance axes
- Results screen with per-layer accuracy, song connection cards
- Route: `/games/polyrhythm`

### Opus 4.7 code review
- Ran comprehensive overnight review using Claude Code CLI with Opus 4.7 (8 hours, 5 sections)
- Report: `docs/code-review-opus47.md`
- Found 5 critical blockers, 8 warnings, many info items
- Key findings: dead imports breaking SkratchLab, cross-AudioContext wiring invalid, hardcoded sample rate, `_suppressAutoPlay` at 17 sites, triplicated chord-type registries
- Architecture positives: HarmonyState subscriber hygiene clean, no secrets client-side, template inheritance consistent

### Decisions made
- "Mic is universal input" reframed: mic_onset is highest-leverage (4 games), not mic_pitch
- Five detection modalities: click, midi, onset, pitch, chord (not three as originally conceived)
- MIDI + audio interface coupled as "pro hardware" (same user, same USB hub)
- YIN now, CREPE later (Pro tier, Phase E). Strategy pattern locks the API contract.
- Spectrum panel reads live external audio when Scarlett connected
- Server-side Python DSP retained as legacy/future path, not deleted
- `audio-architecture.md` created as canonical spec for all audio/input decisions

### Workflow notes
- Opus 4.7 available on release day (April 16). Used for overnight code review.
- Claude Code CLI installed via `curl -fsSL https://claude.ai/install.sh | bash`
- API key auth worked; browser OAuth had bot-verification issues
- `caffeinate -i &` keeps Mac awake for overnight runs
- `/auto-accept` in Claude Code for autonomous file-reading runs
- 30K input token/min rate limit on API key tier — Pro subscription has higher limits

---

## 2026-04-14 — Spectrum FFT Panel, MIDI Input, Chord Lock-In, Key-Aware Resolution

**Focus:** Real-time FFT visualization, MIDI keyboard integration (Launchkey 49), key-aware chord resolution, chord lock-in for transform exploration, walkthrough improvements.

### Spectrum tab (Harmonic Resonance) — new Explorer panel
- ChromaVerb-inspired FFT particle visualizer: 600-particle pool, log-frequency x-axis, dB y-axis
- Shared `Tone.Analyser` (4096-bin FFT) spliced into `keyboard-view.js` audio chain via `_connectVolumeToOutput()` helper
- Particles spawn from FFT bins above -60dB threshold, colored by harmonic function classification (root=gold, third=coral, fifth=blue, seventh=green)
- Classification: for each FFT bin, check harmonics 1–16 of each chord tone, find closest match via log₂ distance
- Orange spectral envelope with glow, peak-hold decay line (0.995/frame)
- DPR-aware canvas, lifecycle managed (start/stop on tab switch)
- `KeyboardView.getAnalyser()` exposed as public API — all instruments feed spectrum automatically
- Spec: `docs/spectrum-panel-spec.md`

### MIDI input module — new shared module
- `static/shared/midi-input.js`: Web MIDI API, device discovery, auto-connect, localStorage persistence
- Launchkey 49 CC mapping documented (knobs CC 21-28, transport CC 115-118, pads channel 10)
- Graceful degradation when Web MIDI unavailable (iOS Safari)
- Explorer wiring: noteOn → `sampler.triggerAttack()` + `_updateMIDIChordState()`, noteOff → release + state update
- Keyboard size selector (25/49/61/88) with auto-detect from MIDI device name
- Sustain pedal (CC 64) mapped to chord lock toggle

### Key-aware chord resolution
- `resolveChord(pitchClasses, preferredRootPC)` — collects all candidates, prefers diatonic roots
- Builds major scale from key, prefers tonic → dominant → other diatonic → first match
- Fixes: C-E-G# in key of A → E augmented (not C augmented); fully symmetrical chords resolved by key context

### Chord lock-in for transform exploration
- Lock button captures current MIDI-detected chord, centers Tonnetz, enables P/R/L
- Transforms chain through lock: lock Em → P → E major (new lock) → R → C#m (new lock) → ...
- While locked: MIDI notes play audio + highlight keyboard, but Tonnetz stays on locked chord
- Sustain pedal (CC 64) toggles lock; visual badge on Tonnetz header
- All-keys-released doesn't clear state while locked

### Walkthrough improvements
- All 18 walkthroughs tagged with `key` field (tonal center)
- KEY dropdown syncs on walkthrough load (COF index mapping)
- Oh! Darling expanded: 5 steps → 11-step full verse (Eaug → A → E → F#m → D → Bm7 → E → Bm7 → E → A → E)
- Fixed: Bmm7 (chord "Bm" + chordType "min7" → changed to chord "B"), F#m label (ii → vi)
- Walkthrough focus override: `_userOverrodeStage` flag preserves manual tab choice, resets on new song
- Suppressed auto-play on Explorer load (`_suppressAutoPlay` around initial `setTriad`)
- Suppressed double-play on walkthrough key sync (`_suppressAutoPlay` around `dispatchEvent`)

### Bug fixes (many, iterative)
- Quality name mismatch: chord-resolver returns `dim`/`aug`, transforms.js expects `diminished`/`augmented` → mapping tables `TRIAD_QUALITY_MAP` / `CHORD_TYPE_MAP`
- TypeError in `_notesFromTriad(null)` → guard on `resolved.root && resolved.quality`
- Tonnetz crash in `buildNeighborhood` on unrecognized chord types → try/catch with fallback to individual notes
- `kv-key--midi` had no CSS → changed MIDI source to `'user'` for existing highlight styles
- MIDI chord detection doubled audio via HarmonyState subscriber → `_suppressAutoPlay` wrapper
- Keyboard octave jump: `setTriad`/`highlightTriad` overwrites MIDI octaves with hardcoded octave 4 → manual `HarmonyState.update()` with real MIDI note numbers from `MIDIInput.activeNotes`
- Recognized chord path built activeNotes from chord names (deduplicating C4+C5 into one C) → switched to raw MIDI notes

### Decisions made
- Spectrum panel reads from shared analyser (not its own synth) — all instruments automatically visualize
- MIDI path owns full HarmonyState.update (doesn't delegate to setTriad/setChord which have octave/audio side effects)
- Lock-in chains transforms (each P/R/L result becomes new lock) for keyboard-free Tonnetz exploration
- Walkthrough `focus` field is a suggestion, not a mandate — user tab choice overrides
- Key hint uses diatonic scale membership (not just tonic match) for chord resolution

### Workflow notes
- Iterative prompt pattern: plan in Claude.ai → discrete Claude Code prompts → test → fix → commit
- Claude Code prompts worked best as single-file, single-concern tasks (MIDI module → analyser wiring → Explorer integration)
- Multi-file prompts needed more specific line-number guidance to avoid missed changes
- The `_suppressAutoPlay` pattern is becoming load-bearing — may need a more principled audio-trigger architecture

### What's next
- Voicing Explorer: fuzzy chord matching, shape dragging, interval projection
- CC knob mapping for Launchkey 49 → Explorer params
- MIDI play-along feedback for walkthroughs
- game-flow.js + adaptive engine extraction

---

## 2026-04-13 — Extended Chord Support, Beyond Triads Chapter, New Walkthroughs, Global Font Scale

**Focus:** Extended chord type system, project rename, three new walkthroughs (diminished + augmented), Fundamentals Chapter 4 "Beyond Triads," global typography overhaul.

### Project rename: Tonnetz → SongLab
- GitHub repo renamed `schones/tonnetz` → `schones/songlab`; Railway service renamed
- CLAUDE.md rewritten with SongLab branding, updated doc references
- README.md completely rewritten — describes current platform
- Doc files renamed: `tonnetz-content-architecture.md` → `content-architecture.md`, `tonnetz-explorer-spec.md` → `explorer-spec.md`, `tonnetz-keyboard-component.md` → `keyboard-component-spec.md`, `tonnetz-redesign-spec.md` → `redesign-spec.md`
- Cross-references updated across all active docs
- Music theory "Tonnetz" references preserved (correct usage)

### Extended chord support (new feature)
- **transforms.js:** `CHORD_TYPES` dictionary (triads, 7ths, sus, extended), `chordPCs()`, `chordNotes()`, `baseTriad()`, `extensionNotes()`, `chordSymbol()`. All exported. 6 self-tests.
- **harmony-state.js:** `activeChord` field, `setChord()`, `highlightChord()`. `setProgressionIndex()` branches on `chordType`. `setTriad()`/`highlightTriad()` clear `activeChord` to prevent stale labels. 28 tests passing.
- **Design principle:** Triads stay the core; extensions are an additive layer. Tonnetz triangles unchanged; extension notes shown as extra glowing nodes with dashed connectors.
- **Spec doc:** `docs/extended-chords-spec.md`

### Walkthrough data updates
- **Folsom Prison Blues:** all 5 steps → `chordType: "dom7"`, labels updated (I7/IV7/V7)
- **Johnny B. Goode:** dom7 treatment on C/F/G
- **ii-V-I Jazz:** Dm→min7, G→dom7, C→maj7
- **Lean On Me:** Cmaj7 on C-chord steps

### Three new walkthroughs
- **Bridge Over Troubled Water** (musician) — 7 steps, diminished passing chords (F♯°, G♯°), borrowed iv (Fm), gospel ballad 82 BPM
- **Oh! Darling** (student) — 5 steps, E→E+→A augmented passing chord, B7 turnaround, 12/8 doo-wop 58 BPM
- **Life on Mars?** (musician) — 8 steps, three augmented connectors (C+, A+, F♯+), art rock 68 BPM
- All added to song-examples.js; Oh! Darling on Students tab, Bridge/Mars on Musicians tab

### Visual rendering — Explorer
- **Keyboard:** Extension notes render with gold ring highlight (`.kv-key--extension`, #D4A03C), interval labels (♭7, 7, etc.)
- **Tonnetz:** Extension nodes as smaller glowing nodes with dashed connector lines
- **Chord labels:** `activeChord.symbol` preferred ("B7", "Cmaj7") across Explorer + Tonnetz
- **Fixes:** Duplicate chord label on Tonnetz resolved; stale `activeChord` when switching walkthroughs fixed
- **Explorer panel polish:** Sidebar width 300→400px, keyboard keys enlarged, panel flex rebalanced

### Fundamentals Chapter 4: "Beyond Triads" (new)
- **5 interactive sections:** Adding the Seventh (root selector + type toggle with gold extension highlights), The Tritone (step-through demo with coral tritone spotlight and resolution animation, root selector), Diminished & Augmented (four triad types with color-coded highlights), Suspended Chords (sus4/sus2 with resolve animations), Hearing Them in Songs (song card jukebox with animated chord sequences)
- Chapters renumbered: Meet the Tonnetz → Ch5, Transforms → Ch6
- Hub page, app.py routing, chapter navigation, intro-hub.js all updated for 6 chapters
- 3-octave keyboards (C3–B5) sized to fill wider containers without scrolling

### Global typography overhaul
- **design-tokens.css:** Entire font scale increased ~40% (base was 0.92–1.02rem, now 1.10–1.25rem). All pages benefit.
- **Explorer:** Removed scoped 2x font override (no longer needed with larger global scale)
- **Fundamentals:** intro.css widened sections (1000px), interactives (900px), narration (800px). Chapter narration bumped to 1.35–1.5rem. Hub fonts increased.
- **Fundamentals keyboards:** Global key size overrides in intro.css (40px white, 24px black, 130px height) for all chapters

### Bug fixes
- Walkthrough opening chord double-play suppressed
- Stale `activeChord` when switching walkthroughs
- Duplicate Tonnetz chord label
- Keyboard scroll removed (broken), replaced with wider layout + 3-octave range

### Decisions
- Diminished/augmented on Tonnetz: rendered as standard triangles (they ARE triads). Extension nodes only for 4+ note chords.
- Real songs in educational content: chord progressions not copyrightable. Safe for analysis. IP attorney consult still planned before commercializing song packs.
- Oh! Darling as student-level augmented intro; Life on Mars as musician-level. Pedagogical arc: simple → complex.
- Enharmonic sharp/flat toggle for Fundamentals: deferred to backlog. Students don't need it yet; Explorer handles spelling via key context.
- Global font scale fix preferred over per-page overrides for consistency.
- Flexible Explorer panel sizing deferred — default proportions adjusted instead.

### Next priorities
1. Audit remaining walkthroughs for chordType opportunities
2. Verify dim/aug rendering in Bridge Over Troubled Water, Oh! Darling, Life on Mars
3. Enharmonic toggle (backlog — Fundamentals + Explorer preference)
4. Flexible Explorer panel sizing (user-draggable splitters)
5. MIDI input module
6. User testing prep


## 2026-04-12 — Game Audit, Build Plan v4, MIDI & SkratchLab Vision

**Game audit (full platform review)**

- Audited all 8 games one by one: code structure, difficulty mechanics, adaptive implementation, styling consistency
- Classified games into two types:
  - **Performance** (training precision, no Learn mode): Harmony Trainer, Strum Patterns, Swing Trainer, Melody Match, Chord Spotter, Rhythm Lab
  - **Learning** (teaching concepts, stage-based with Intro/Practice/Test): Scale Builder, Relative Key Trainer
- Found two different adaptive algorithms in use: Pattern A (punishing — one miss demotes) in Harmony Trainer/Melody Match/Strum Patterns, Pattern B (better — configurable thresholds) in Chord Spotter only
- Standardized on Pattern B with independent axes per game (e.g., Harmony Trainer: interval pool + pitch tolerance as separate axes that promote/demote independently)
- Designed ResultDetail schema for all games — competency-graph-ready from day one
- Identified per-game adaptive axes and song connection opportunities
- Swing Trainer doesn't extend base.html (standalone HTML file) — needs fix
- Created `docs/game-engine-spec.md` with full per-game detail

**New game designs**

- **Voice Leading Detective**: Find minimal voice movement between chords. Three levels (single P/L/R transform → chained transforms → real progressions). The "so what?" moment for neo-Riemannian theory. Depends on multi-chord glow worm paths. Pro extension: explore alternative voicings for musicality.
- **Polyrhythm Trainer**: Two independent rhythm layers (2:3, 3:4, Linus and Lucy dotted quarter pattern). Three levels (tap one layer → both → real songs at tempo). Inspired by playing Vince Guaraldi.

**Build plan updated to v4**

- Phase A marked fully complete
- New Phase A+: game visual unification (game-shell.css extraction) + MIDI input (pulled forward from Phase F)
- MIDI input as shared `midi-input.js` module (Web MIDI API → HarmonyState, Launchkey 49 target)
- SkratchLab lightweight DAW vision captured: song presets with auto chord loops + rhythm, melody play-over, instrument selection — creative play for kids/casual users
- Fast path to Competency Graph identified: A+ → B → B.5 → E5 (skipping C/D), ~10-16 sessions, ~1 week at current pace
- Voice Leading Detective and Polyrhythm Trainer added to Phase B
- Vienna (Billy Joel) added to walkthrough backlog
- Session budget updated to reflect actual pace
- Dependency graph redrawn

**Decisions**

- Don't build interim session-level feedback system — go straight to Competency Graph via fast path
- Design ResultDetail schema now so all game logging is graph-ready from day one
- Store results in localStorage until B.5, then pipe to Supabase
- Game visual unification has zero dependencies — do it first (Phase A+)
- MIDI input is a single-session win that immediately improves Explorer + SkratchLab
- Chord Spotter is the starting point for game-flow.js extraction (already closest to target pattern)
- Rhythm Lab is a beginner gateway to Strum Patterns, not a standalone game
- Scale Builder is the template for learning game structure in game-flow.js
- Song connections ("Hear it in a song") should be added to all games where song-examples DB has relevant entries

**Doc consolidation**

- `tonnetz-next-build-plan.md` → **`songlab-build-plan.md`** (renamed, updated to v4)
- `game-audit-plan.md` → **`game-engine-spec.md`** (renamed — it's a spec, not an audit)
- `songlab-redesign-plan.md` → **`design-system-reference.md`** (renamed — it's a reference, not a plan)
- `tonnetz-next-phase-plan.md` → **archived** to `docs/archive/` (unique content folded into songlab-build-plan.md: walkthrough scaling, song packs architecture, copyright considerations)
- `game-flow-pattern.md` → kept for now, archive after game-flow.js extraction
- All cross-references updated across STATUS.md, SESSION_LOG.md, build plan, game engine spec

**Next session priorities**

1. MIDI input module
2. SkratchLab lightweight DAW
3. Multi-chord glow worm paths
4. game-flow.js extraction

**Evening implementation sprint (Phase A+.1 / A+.2)**

- Extracted `static/shared/game-shell.css` — shared layout for all games (setup/stats/feedback/results/pills/song tips)
- Migrated all 8 games to game-shell.css: Chord Spotter, Melody Match, Scale Builder, Harmony Trainer, Strum Patterns, Relative Key Trainer, Rhythm Lab, Swing Trainer
- Converted `index.html` to extend base.html — unified nav with dropdowns, single source of truth
- Converted Swing Trainer from standalone HTML to Jinja2 template extending base.html
- ~500 lines of duplicate inline CSS removed
- All legacy color vars replaced with SongLab design tokens
- Swing Trainer production 500 error likely fixed (now uses url_for for assets)
- JS class-name aliases used for Scale Builder and Relative Key Trainer where JS hard-codes selectors — clean up during game-flow.js extraction

---

## 2026-04-10 — Explorer Polish, Rhythm Analysis, Audience Tracks, SkratchLab Rhythm Builder, Tutorial

**Layout & visual polish**

- Renamed Skratch Studio → SkratchLab (user-facing brand + URL paths /skratchlab)
- Added --font-size-2xs design token; replaced all hardcoded pixel font sizes with tokens across Explorer and SkratchLab
- Normalized SkratchLab nav to match Explorer (36px logo, consistent padding/sizing)
- Bumped walkthrough sidebar typography: note text to font-size-base, sidebar width 270→300px, enlarged step badges
- Standardized keyboard to real piano proportions (black/white width 0.468, height 0.633)
- Keyboard white keys now cream (#E8E2D6) with dark labels, white labels on chord highlights
- Tonnetz panel body lightened (#1E1C17), grid edges/nodes more visible
- Bumped dark theme contrast: --daw-text-dim, --daw-text-mute, --daw-text-ghost all brighter
- Removed dead Spotify/Apple Music placeholder links
- Fixed fretboard/keyboard proportions in "Both" view: Tonnetz protected with min-height 280px, fretboard constrained with max-height 220px

**Info pills in Explorer**

- "Learn" pills (gold, labeled) on Tonnetz and Chord Wheel panel headers → /intro/4, /theory/circle-of-fifths
- Compact ⓘ circles (gold) on Transform and Key controls → /intro/5, /theory/tonal-centers
- Tonnetz pill wrapped in flex container with label to prevent floating

**Game deep-linking from walkthroughs**

- CONCEPT_GAME_MAP routes concept_specifics to relevant games with pre-configured URL params
- Walkthrough steps show "Try this" game pills (Chord Walks, Chord Spotter, Scale Builder, Harmony Trainer)
- Games read URLSearchParams on load: tier, transform, root, interval, mode, progression, difficulty
- Pills deep-link with context derived from walkthrough step (root note, transform type, etc.)

**Base.html restyle**

- Replaced old purple color scheme with SongLab warm palette (gold/blue/coral) in base.html
- Restored dropdown navigation: Ear Training (4 items), Rhythm & Play (2 items), Games (2 items), Learn (6 items incl. Fundamentals + Tutorial)
- SkratchLab promoted to top-level nav link alongside Explorer
- Added Nunito 400/500 weights; fixed hardcoded purple hex in harmony.html and relative-key-trainer.html
- All 20+ game/theory/intro pages inherit new look via cascade
- Dark theme dropdown support for Explorer/SkratchLab

**Rhythm analysis — new feature**

- Added 7 rhythm-tagged song entries to song-examples.js (Folsom Prison Blues, Ring of Fire, Mama Tried, Cry Cry Cry, Jackson, Get Rhythm, Superstition)
- New rhythm concept_specifics: train_beat, shuffle, syncopation, odd_meter, backbeat
- Folsom Prison Blues walkthrough: first dual harmony+rhythm walkthrough (I-IV-V + train beat)
- New Rhythm tab in Explorer stage (4th tab alongside Tonnetz/Chord wheel/Fretboard)
- Rhythm tab renders beat pattern from walkthrough data: time sig, BPM, feel label, BOOM/chk/SNAP grid
- Rhythm playback engine: three Tone.js synths (bass, snare, strum), looped Tone.Sequence, playhead animation
- BPM slider with live Tone.Transport update (no sequence restart)
- Bass note follows chord root from HarmonyState as walkthrough advances
- Keyboard plays chords over running rhythm without restarting beat (setRoot method)
- Separate Rhythm and Chords volume sliders in controls bar
- Fixed keyboard same-key replay (plays chord on repeated clicks)
- Backfilled rhythm data on ALL walkthroughs, including 6/8 for Norwegian Wood
- Rhythm renderer handles variable-length patterns (6/8, 4/4, etc.)

**Audience tracks — new feature**

- 4 new walkthroughs: Let It Go, You've Got a Friend in Me (kids), Stand By Me, Lean on Me (students)
- All walkthroughs tagged with audience field (kids/student/musician) and category
- Walkthrough categories backfilled: Voice Leading, Transforms, Jazz Harmony, Modes & Scales, Progressions, Rhythm & Feel
- Landing page redesigned: audience tabs (Kids/Students/Musicians) at top, MIDI pad grid filters by audience
- Category badges on song pad cards (Progression, Rhythm, Transforms, Jazz, etc.)
- Added Melody Match and Strum Patterns to landing page games grid

**SkratchLab rhythm builder — new feature**

- Interactive 4×8 drum machine grid in SkratchLab channel strip (kick/snare/hihat/strum)
- Click cells to toggle beats on/off, instrument-colored cells
- Preset patterns: rock, train beat, disco, hip hop, shuffle, backbeat
- Tone.js playback with playhead animation, BPM slider
- Export to Blockly blocks (play_kick/play_snare/play_hihat at mapped bar:beat:sixteenth times)
- Transport conflict handling: rhythm builder stops when main Run plays, and vice versa
- Rhythm data exports from Explorer → SkratchLab via sessionStorage (pre-loads Rhythm Builder grid and BPM)

**Tutorial page — new**

- New /tutorial route: 10-section scrollable page using Norwegian Wood as example song
- Covers: song picker, walkthrough sidebar, Tonnetz, chord wheel, transforms, game pills (Scale Builder link), rhythm tab, keyboard/sustain, SkratchLab export, and "keep exploring" with song suggestions
- Tutorial link added to landing page below tagline
- Feature callout boxes with gold left border highlighting specific UI elements

**Playback fixes**

- Fixed first chord not playing on walkthrough start: reset _lastRoot/_lastQuality, 200ms delay on explicit playChord
- Added Shift/CapsLock sustain: hold Shift for momentary, CapsLock toggles, playChord skips releaseAll when active
- Reset to piano instrument on walkthrough start

**Decisions**

- All walkthroughs should have rhythm data, even standard 4/4 — "boring" rhythm is still a lesson
- Rhythm tab is a reliable feature, not sometimes-feature
- SkratchLab is the right place for interactive rhythm building; Explorer is for analysis
- Option B (text notation: BOOM-chk-SNAP-chk) for Explorer rhythm display
- Info pills: "Learn" variant on panel headers, compact ⓘ on controls bar
- Real piano key proportions as default in keyboard-view.js; pages scale via CSS overrides
- SkratchLab promoted to top-level nav — earned its own spot
- Railway cold start: warn testers about 15s first load, don't optimize yet

**Next session priorities**

1. Multi-chord glow worm paths on Tonnetz (voice leading — top priority feature)
2. More rhythm walkthroughs: Take Five (5/4), Superstition (syncopation)
3. SkratchLab rhythm building improvements (more presets, strum export)
4. User testing prep (15-20 participants)
5. Swing Trainer production 500 error fix
6. Landing page polish: verify all links, test all walkthroughs end-to-end

---

## 2026-04-09 — Skratch Studio Integration + SongLab/Explorer Redesign

**Skratch Studio integration (merged `feature/skratch-integration` → `dev`)**

- Reviewed and fixed code from `feature/skratch-integration` branch (built by Antigravity agent)
- Deduplicated PLR transform math — Skratch was carrying its own copy; now imports from shared `transforms.js`
- Removed dead `drawCanvasGrid` code
- Fixed MIDI export: BPM header now written, drum tracks correctly skipped with warning instead of crashing
- Refactored Explorer→Skratch bridge from real-time click streaming to a record-and-export pattern: Explorer captures the progression, exports via `sessionStorage`, then `window.open` launches Skratch Studio with the session preloaded (no need to pre-open Skratch)
- Walkthroughs auto-capture progression as they play; free exploration has a record/stop toggle
- Swapped PolySynth → Salamander piano sampler for chord playback (consistency with Explorer)
- Renamed routes: `/skratch` → `/skratch-studio`, `/games/relative-key-trainer` → `/games/chord-walks`
- Sound now defaults to ON across all pages
- Added Skratch Studio card to landing page
- Squash-merged to `dev`

**SongLab redesign (on `dev`)**

- Platform rebrand kickoff: "Music Theory Games" → **SongLab**
- Created `static/css/design-tokens.css` — light/dark theme system, color tokens, fluid typography (single source of truth for the redesign)
- Landing page redesign: MIDI pad song grid layout, warm light theme, SongLab branding
- **Explorer full redesign**:
  - DAW-style dark theme with transport controls and song info bar
  - Walkthrough sidebar replaces the floating overlay bubble
  - Tonnetz animations: pulsing nodes, glow worm paths, ghost trails
  - Chord quality color families: blue=major, green=minor, coral=borrowed
  - Panel tabs (Tonnetz / Chord Wheel / Fretboard) wired and working
  - "Begin" button for audio context activation
  - Harmonic function labels on walkthrough steps
  - Fixed chord wheel visibility behind other panels

**Planning docs added** (`docs/`)

- `design-system-reference.md` — full implementation plan with CSS tokens
- `tonnetz-next-phase-plan.md` — walkthroughs, song packs, copyright, aesthetics (archived April 12 — content folded into `songlab-build-plan.md`)
- `visual-engine-spec.md` — generative art engine driven by Tonnetz geometry (post-launch)

**Decisions**

- Skratch bridge is record-and-export (not live streaming) — simpler, more reliable, and lets users re-export edited progressions
- Explorer is the canonical surface for the new dark DAW aesthetic; light theme stays for landing page and pedagogy surfaces
- SongLab is the platform name going forward — rebrand sweep is its own phase

**Still TODO**

- Explorer prompt 2 fixes: test all walkthroughs end-to-end, verify ghost trails
- Skratch Studio DAW redesign (Phase 4)
- Games + remaining pages: light theme + design tokens (Phase 5)
- SongLab branding sweep across all pages (Phase 6)
- Deploy to Railway as SongLab
- User testing with 15–20 participants
- Visual engine implementation (post-launch)

## 2026-04-07 — Landing Page Redesign, Nav Restructure & Guided Walkthrough System

- Full product rethink session: assessed every feature on the site against target audience (musicians brushing up on skills + teachers as distribution channel)
- North star established: "Help people become better musicians" — not a theory textbook
- Decided: remove the word "theory" from all user-facing UI
- Decided: Explorer is the centerpiece — the Tonnetz externalizes the spatial map that experienced musicians navigate by instinct
- Decided: everything stays, but organized into four categories: Visualize, Ear Training, Rhythm & Creation, Patterns
- Created redesign spec (`docs/redesign-spec.md`) covering landing page, nav, song integration, and guided walkthroughs
- Built new landing page: hero ("Harmony has a shape. Explore it."), rotating song example prompts (8 curated from song-examples.js), Explorer preview, 2×2 category grid, Fundamentals footer link
- Nav restructured: Explorer, Ear Training, Rhythm & Play, Patterns, Fundamentals — replaces Theory/Practice Games/Skratch Studio/Start Here/Tour
- Built Explorer deep-linking: URL params (?root=, ?quality=, ?progression=, ?walkthrough=) so landing page examples load the Explorer in the right state
- Built guided walkthrough system (`static/shared/walkthroughs.js`): floating card overlay in Explorer with step-by-step concept walkthroughs grounded in real songs
  - 8 walkthroughs: Yesterday voice leading, Am/C relationship (Eleanor Rigby), Creep chromatic mediant, ii-V-I jazz, Mixolydian (Norwegian Wood/Get Lucky), Stairway P transform, deceptive cadence (In My Life), twelve-bar blues
  - Each step sets chord state, plays audio, shows conversational explanation
  - Panel focus: individual steps can dim non-relevant panels to direct attention (e.g., focus keyboard for voice leading, focus Tonnetz for transforms)
  - "You'll also hear this in..." line pulls related songs from song-examples.js by matching concept_specifics
  - "seeAlso" links on final steps nudge users toward relevant games (Chord Walks, Strum Patterns, etc.)
  - Next/Back/Exit navigation, step indicator, smooth transitions
- Fixed: Explorer no longer flashes C major before loading walkthrough's first chord
- Wife's idea: walkthroughs should actually show the concept, not just link to the tool. She was right.
- All work on `redesign/landing-page` branch
- Decided: tagline "Harmony has a shape. Explore it." — respects the musician, invites curiosity
- Decided: subtitle frames Tonnetz as "the map of the territory musicians already navigate by instinct"
- Decided: category labels avoid "theory" — Visualize, Ear Training, Rhythm & Play, Patterns
- Decided: intro course repositioned as "Fundamentals" — opt-in, not a gate
- Decided: rotating song prompts use curated questions a musician actually has, grounded in real songs
- Decided: walkthroughs are the Phase 2 evolution — turn "cool visualization" into "I learned something in 30 seconds"
- Known issue: Swing Trainer returning 500 on production — needs fix before deploy
- Next: polish walkthrough card UI, surface song examples contextually in games (Chord Walks, Chord Spotter, Scale Builder), fix Swing Trainer 500, update STATUS.md/SESSION_LOG.md in repo, merge to dev when ready

## 2026-04-06 — Landing Page Redesign & Nav Restructure

- Redesign planning conversation: rethought landing page and information architecture from scratch
- Created redesign spec (`docs/redesign-spec.md`) covering new landing page concept and nav restructure
- Built new landing page: Explorer-centered hero with rotating song examples pulled from song-examples.js — visitors immediately see the tool in action
- Nav restructure: replaced previous groupings with Explorer, Ear Training, Rhythm & Play, Patterns, Fundamentals — organizes content by learning domain rather than feature type
- All work on `redesign/landing-page` branch (3 commits: spec, landing page rebuild, nav restructure)
- Decided: landing page should lead with the Explorer as the product's strongest hook
- Decided: song examples rotate on the landing page to show real musical context
- Decided: nav categories reflect how musicians think about practice, not how the app is built
- Next: wire song example hooks into Explorer (click example → loads in Explorer), wire into Chord Walks, continue showcase page build

## 2026-04-01 evening — Showcase Page

- Designed and planned `/showcase` feature tour page — standalone scrolling page to make the product's features immediately obvious to visitors (especially teachers)
- Explored Google Stitch (Google Labs AI design tool, March 2026 update) as a design workflow tool
- Used Stitch in Thinking mode (Gemini 3.1 Pro) to generate a full-page design comp from a detailed prompt + 6 app screenshots
- Stitch output: section layouts, annotation styles for Explorer panels, game cards grid, glassmorphism labels, scroll pacing — exported as HTML/CSS + DESIGN.md + screen.png
- Decided: showcase uses real screenshots with annotation overlays, not AI-generated mockups or stylized illustrations
- Decided: page lives at `/showcase` within the app (not a separate site)
- Decided: Stitch export used as visual reference/design spec — Claude Code builds the actual Jinja2 template to fit Flask/Jinja2 stack
- Stitch design system ("Harmonic Resonance"): deep indigo background (#111125), lavender/purple interactive elements, amber/orange highlights, glassmorphism panels, Plus Jakarta Sans/Manrope/Inter typography, "no-line" sectioning philosophy, glow borders
- Page structure finalized: Hero → Explorer (annotated 4-panel screenshot + C major→A minor before/after) → Games "Mastery through Play" (Intro→Practice→Test pill + 4 game cards) → Skratch Studio (split layout with real screenshot) → Real Songs You Know (3 progression cards from song-examples.js) → Footer CTA
- Created Claude Code build prompt (`claude-code-prompt-showcase.md`) with full technical spec
- Decided: no explicit "for teachers" pitch section — if the showcase is done right, teachers will naturally want to use it
- Decided: "Real Songs" section pulls from the 67-entry song-examples.js database
- Decided: annotations hide on mobile, game cards responsive (4→2→1 col)
- Stitch export saved to `stitch-export/` in repo (code.html, DESIGN.md, screen.png)
- Next: full component walkthrough tomorrow, capture remaining screenshots (Explorer with A minor selected), run Claude Code build prompt, iterate on result

## 2026-04-01 late night

- Built Swing Trainer game (`static/games/swing-trainer.html`) — Tonnetz's first dedicated rhythm ear-training game
- Core engine: Tone.js swing sequencer, Ab major ostinato, swing ratio stored in ref variable (real-time knob → audio with no transport restart)
- Waveform visualization: Gaussian pulse train showing swing ratio geometrically — upbeat pulse migrates right as ratio increases
- Knob control: SVG rotary dial, 270° travel, vertical drag, three unlabeled detent markers at 50%/67%/75%
- Four-phase game loop: Listen (target groove plays 4 measures) → Match (straight 4/4 starts, knob live) → Lock In → Reveal (waveform overlay + score)
- Practice mode: ghost groove continues under match phase, waveform visible, generous scoring
- Test mode: groove stops after listen, no waveform during match, tight scoring
- Progressive scoring: Locked in / Close / In the pocket / Keep listening — thresholds differ by mode
- Session streak counter (consecutive "Locked in" results), resets on anything below Close
- Added to Tonnetz: Flask route, nav entry, card #8 in Practice Games grid with RHYTHM tag
- Updated song-examples.js to v1.1: added RHYTHM — SWING FEEL section with 6 new entries (bossa_nova_straight, lite_swing_scarborough, medium_swing_st_louis, triplet_swing_guaraldi, hard_bop_minnie, shuffle_blues_rising_sun), added swing_ratio field to demo schema
- Decided: Practice/Test mode toggle locked per session, not per round
- Decided: straight 4/4 starts immediately at 50% in match phase (Practice) or random position (Test)
- Decided: BPM fixed at 80 for now, BPM control to be added next session
- Decided: games page section restructure (Harmony/Rhythm/Explorer) deferred — Swing Trainer added as flat card with RHYTHM tag for now
- Decided: Swing Trainer is standalone for now, not wired to HarmonyState
- Known issues: dial slightly finicky past midpoint (deferred), swing_ratio field in song-examples not yet consumed by game
- Reminders set: (1) add BPM control to swing trainer, (2) consume swing_ratio in game from song-examples, (3) security review + backend proxy check before production push

## 2026-03-31 morning

- Chapter 4 rebuild on Explorer components: Claude Code (Opus) built initial version, but Tonnetz container ID mismatch + Tone.js not loaded caused errors. Opus session hit 0% context — killed and restarted with focused fix prompt on Sonnet.
- Designed and queued full MVP polish sprint (4 prompts total):
  - Post-onboarding routing: preset → destination mapping (beginner→/intro, dabbler→/intro/2, producer→/intro/3, curious_player→/intro/4, deep_diver→/explorer, math_explorer→/explorer)
  - End-of-chapter "What's Next" cards: contextual game/theory links for all 5 chapters, shared component
  - First-visit dismissible banners for Explorer and Skratch Studio (tracked in localStorage profile)
  - Nav cleanup: Games dropdown (all 6 games), Skratch Studio link, active state highlighting
  - Returning user index state: "Continue Chapter N" / "Course complete" replaces "Start Here" card
- All 4 prompts executed (Sonnet). Banners confirmed working. Other items need verification next session.
- Decided: Supabase deferred to post-MVP. localStorage sufficient for initial user testing round.
- Decided: Mobile/responsive deferred to post-MVP.
- Decided: Use Sonnet for Claude Code builds, Opus for planning/design/review.
- Phase A confirmed fully complete (A1–A5 all done as of yesterday, STATUS.md was stale).
- Updated STATUS.md and SESSION_LOG.md.
- Next: verify all polish changes, fretboard polish, end-to-end new-user walkthrough, deploy.

## 2026-03-30 afternoon

- Full docs update: applied 15-issue cross-reference audit from Friday to all md files
- Created voicing-explorer-spec.md v0.3 (was missing from repo)
- Archived old doc versions in docs/archive/
- Removed stale AGENT_GUIDE.md
- Fixed glow worm blur bleeding over Tonnetz node labels (SVG render order + blur reduction)
- Started A4 Session 1: multi-path glow worm progression engine (running in Claude Code)
- Decided: A4 lives at /theory/chord-progressions as lesson page embedding Explorer panels
- Decided: animated playthrough with fading trails (not all-at-once)
- Decided: Song Examples DB integration with dual tabs — "By Pattern" + "By Song"
- Decided: common-tone flash during chord transitions (white/gold pulse, ~500ms)
- Workflow: Sonnet as default Claude Code model, Opus for multi-file architectural prompts
- Tested progression engine, Session 2 (page UI), A3 modes, fretboard panel
- Theory pages are wired into dropdown nav

## 2026-03-29 (Saturday)

- Voicing Explorer MVP build session — shipped Note Mode, glow worm path, ChordResolver, 3-panel sync
- 474 insertions across 5 modified files + 2 new modules (chord-bubble-renderer.js, chord-resolver.js)
- Decided: glow worm over convex hull (encodes voicing order)
- Decided: chord wheel arc re-centers on assembled chord's key as tonic
- Decided: ChordResolver enhanced HarmonyState rather than separate detection
- Ideas captured: multiple simultaneous glow worm paths, chord shapes as Skratch Studio blocks

## 2026-03-27 (Friday evening)

- Full spec cross-reference audit: 15 issues identified across all docs
- Created voicing-explorer-spec.md v0.3 (MVP scope, composable panels, resolved open questions)
- Updated all docs with fixes (orientation, 4→3 panels, phase numbering, Song DB status)
- Decided: "tools teachers find useful" positioning (not teacher dashboard)
- Decided: alternative voicings = killer use case for working musicians
- Decided: fretboard panel as pre-MVP composable panel
- Decided: game-flow.js extraction at Phase B start
- Note: doc updates weren't committed until 2026-03-30 — need to close this loop faster

## 2026-03-27 (Thursday)

- Phase A1 complete: Circle of Fifths page at /theory/circle-of-fifths
- Phase A2 complete: Tonal Centers lesson at /theory/tonal-centers (4-step walkthrough + ear training)
- Debugged: playBtn.disabled state not resetting, audioReady toggle issue
- Backend API proxy confirmed complete and secure
- Decided: defer auth/persistence to Phase B.5 as planned

## 2026-03-23

- Visual layer system built (visual-config.js, visual-layer.js, visual-toggle.js)
- Replaced sprint tracker with MVP tracker
- Updated STATUS.md as source of truth
