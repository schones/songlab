# Session Log

Reverse chronological. Quick capture after each session: what happened, what was decided, what's next.


## ## 2026-05-18 — Documentation cleanup + Session 1 of cantor presentational arc

Two halves: documentation backlog from last week's pivot (five
tasks, four commits across two branches), then Session 1 of the
cantor presentational arc (three commits to a new `cantor` branch).
Ended at a clean stopping point with the validated spike landed
as production-named code under `/cantor`.

### Documentation cleanup

The 2026-05-14 stopping point left a backlog of mechanical writing
that had to land before Session 1 could start. STATUS.md needed to
reflect the pivot, RADAR.md needed updates and one new entry per
deferred thread, the chord/melody build plan needed a pause block,
the new presentational build plan needed to exist at all, and
WORKING_STYLE.md needed the read-and-report convention captured.

Drafted the cantor presentational build plan first as a 5-session
arc: cleanup pass, polish, audio path verification, full audio
interface input, merge to dev. Session 4 was originally collapsed
with Session 3 in an earlier draft; expanded after re-reading the
kickoff prompt that explicitly named full audio interface input as
the immediate next item. Build plan + STATUS landed as the first
commit (`9f41aee`).

The pause addendum to the chord/melody build plan turned out to be
the most consequential piece of writing. Dustin raised mid-drafting
that he wants to keep tinkering with the classification problem in
the background — the production decision (pivot away) and the
personal-interest decision (still interesting) are different. Added
a "research-active disposition" paragraph naming the distinction
explicitly, with production work on Cantor Phase 2 having
scheduling priority when conflicts arise. The chord/melody build
plan now states both clearly. (Commit `67d09be`, on the
audio-onset-analysis branch — which became chord-melody-research
later in the session.)

RADAR.md only existed on audio-onset-analysis, which surfaced an
architectural issue: cross-cutting threads by definition outlive
any single branch and should be visible from dev. Promoted RADAR
to dev as its own commit (`a5919ee`) before any updates landed —
the promotion is a structural move worth marking separately from
the content updates.

RADAR updates and WORKING_STYLE additions then landed together
(commit `faecf6e`). Three new RADAR entries: chord/melody
classification as research-active, polyphonic audio detection as
future infrastructure, and corpus rethink (Dustin corrected my
initial framing here — the corpus belongs to the classifier
framing that paused, so resumption needs a fresh design pass, not
just formalization of prose tests). Plus the sus2/sus4 entry
deprioritized and tempo subsystems entry updated for the arc
pause. WORKING_STYLE got two new sections under Workflow
conventions: the read-and-report-before-builds pattern, and a
parallel section on using Claude Code as a reading tool during
planning. The second one was added after Dustin pointed out that
reading-during-planning earned its own codification separate from
reading-before-builds.

One correction worth marking: my first draft of the polyphonic
audio RADAR entry referenced an `audio-architecture.md` Pro tier
and a CREPE strategy stub that Dustin didn't recognize. I'd pulled
them from past chat memory without verifying the repo carries
them. Rewrote with only verifiable claims. Don't assert specifics
from memory without verification.

**Branch rename: audio-onset-analysis → chord-melody-research.**
The branch's content had drifted from "onset analysis" to
encompass the full classifier arc; the new name reflects what the
branch actually is and matches the research-active disposition
codified earlier. Mechanics straightforward (`git branch -m`,
push new name, push -u for tracking, delete old on origin), but
reference updates carried a real tail — `sed` substitution across
STATUS, RADAR, both build plans, and the design doc for
current-state references; SESSION_LOG entries left verbatim as
historical record. Worth flagging as a pattern: branch renames
carry a documentation-cleanup tail that's bigger than the rename
itself. One sentence on STATUS line 108 was a judgment call —
narrative history embedded in a current-state doc. Dustin's
hand-edit ("a new branch `audio-onset-analysis` that was
subsequently renamed as `chord-melody-research`") preserves both
pieces in one sentence (commit `766aa54`).

Net: six commits across two branches before Session 1 began.

### Session 1 of cantor presentational arc

Build plan called for a hybrid promotion — keep the spike's
substance (validated 2026-05-13 with real music on the Launchkey),
fix its rough edges in one focused cleanup pass before any polish
or feature work, then production-promote. Decided to name the new
branch simply `cantor` (drop the "presentational" qualifier — it's
an implementation detail of how cantor works now, not a permanent
label). Verified that v1 cantor files have substantive history on
chord-melody-research (TempoState integration, AudioInterpreter v0
migration, the 6A/6B 3D torus work), so deleting v1 from dev
doesn't lose anything significant — the evolved v1 lives where it
conceptually belongs.

Session 1 ran as four Claude Code prompts (one read-and-report
plus three build prompts B1/B2/B3) with verification checkpoints
between. The structure worked well — each checkpoint caught a
different class of issue.

**B1 — branch setup (commit `c34305c`).** Created `cantor` off
dev, copied spike files in via
`git checkout cantor-presentational-spike -- <files>`, deleted v1
files, removed v1 `/cantor` route from app.py. Read-and-report
had flagged that a cherry-pick approach would conflict (the spike
commit deletes docs that exist on dev now); manual copy avoided
the noise. Caught my own verification gap in this commit: B1's
commit message claimed the v1 route removal, but the app.py edit
was actually unstaged at commit time. I'd asked for
`git diff --staged --stat` as verification, which only shows
staged changes. Resolved in B2 by including the route removal in
B2's diff and naming it explicitly in the commit message. Honest
about the small gap in B1's history rather than amending.

**B2 — renames + route registration (commit `8c95949`).** Module
rename `cantor-presentational-view.js` → `cantor-view.js`, class
rename `CantorPresentationalView` → `CantorView`, template rename
`cantor-spike.html` → `cantor.html`, register `/cantor` route in
app.py. Used `git mv` for rename detection (both renames showed
99% / 98% similarity). Claude Code correctly surfaced two
class-rename dependents the prompt hadn't called out (constructor
call and a comment in the template); both were consequences of
the explicit rename, not new edits. Worth noting the prompt was
under-specified — class renames imply their dependents.

Route name decision: picked `/cantor` now rather than deferring to
Session 5 (merge). The build plan's deferral was about avoiding
premature commitment, but the name is free (v1 deleted), there's
no alternative product in the running, and deferring out of pure
caution wouldn't surface new information. Runtime verified after
B2 — `python app.py`, `/cantor` renders the renamed template
cleanly.

**B3 — content cleanup (commit `155b435`).** Originally planned
as two separate prompts (main pass + a pause-then-resume on the
RGBA decision), ended up as one bundled commit because Claude
Code's working tree doesn't auto-stage between prompts and the
artificial split didn't represent a meaningful content distinction.

Substance: six `[cantor-spike]` console prefixes renamed to
`[cantor]`; localStorage key, gameId, `window.cantorSpike` dev
hook, page title, and aria-label all stripped of the "spike"
suffix; `_noteNameToMidi`/`_audioNoteToMidi` deduplicated (they
were identical); header doc block rewritten in production tone;
three stale comments removed that referenced "cantor-view.js"
from inside what is now cantor-view.js itself.

The RGBA pattern resolution was the most interesting decision.
Claude Code corrected my faulty premise from the read-and-report
— I'd asserted `_parseRGBA` was called per-frame, but it actually
ran twice at module load. The string constants + parse helper
were vestigial, used only to produce arrays that hot-path
consumers wanted anyway. Replaced with direct array constants,
aligning with `GLYPH_RGB`'s existing array-only pattern. The
read-during-execution loop earned its place here — the right
answer was in the code, not in my head.

Net diff for B3: −21 lines across both files. Content cleanup
should shrink files when it removes dead indirection.

Runtime re-verified after B3. Console shows the expected
environmental noise (Chrome's autoplay restriction warnings,
AudioInput's documented Tone.js fallback message, favicon 404)
plus one "ours" line — `[cantor] No MIDI device detected.` —
which incidentally confirms the prefix substitution worked.

### What's next

Session 2 of the cantor arc: polish pass. Per build plan,
parameter tuning (sparkle density, octave-offset radius,
velocity-to-size curve, color saturation), glyph behavior at
extreme registers, edge cases noticed during live play.
Specifics deferred until the cleanup landed and the view can be
re-exercised in its cleaned-up form. Session 2 starts with
playing through `/cantor` with real music and noting what jars
— a Dustin step before conversational planning kicks in.

Further out: Session 4 (full audio interface input integration)
and the Claude Code review feeding gamification brainstorm. The
review is likely to redirect work substantially, so finishing
cantor cleanly first matters.


### Evening addendum — regression discovered during play

Started re-exercising `/cantor` with the Launchkey for the polish
step. Within minutes: no Tonnetz triangles lighting up, no glyphs
for chords, and the bottom half of the keyboard producing nothing
in the console. Console logs showed `0 notes` heartbeat for every
key below a threshold, `1 notes` above it.

Chromatic-scale diagnostic identified the boundary precisely: C4
(MIDI 60) silent, C#4 (MIDI 61) registers. Same threshold as v1
cantor's `_splitPoint`. Verified the regression by switching to
`cantor-presentational-spike` and serving — low keys work cleanly
on the spike, chords visualize. The gate was introduced somewhere
in Session 1's three commits.

Two calibration notes worth marking:

The end-of-Session-1 verification was insufficient. Page-loads,
lattice-renders, no-console-errors was the bar, and the build
passed all three. None of those exercise the actual functional
behavior — playing a chord and seeing a triangle light up is the
real test. Future cleanup-pass verifications should include
playing through *at least one chord* before declaring the session
done. The cost of catching this tonight vs catching it three
sessions from now would have been very different.

The "the spike was validated against real music two weeks ago"
fact was load-bearing in the diagnosis. It ruled out "the cutoff
is original spike behavior" and pointed straight at Session 1's
diff. Worth being honest that I missed this earlier in the
session — when Dustin first described the symptom, I treated it
as three loosely-coupled symptoms (monophonic detection, no
Tonnetz lit, bottom half silent) before recognizing that one
register-based gate explains all three at once. The chromatic-
scale step was the diagnostic that sharpened it.

Tomorrow: regression fix before any polish work. The bounded
diff (3 commits) and clear symptom (MIDI ≤ 60 gated) make the
find-and-fix small. Resume Session 2 polish work after.

### Setup for tomorrow

Update STATUS.md at session start (Dustin's protocol — STATUS at
the start of next session, not at the end of this one) to
reflect Session 1 complete and the cantor branch state. Then
re-exercise `/cantor` with the Launchkey to surface polish
targets before Session 2 planning.

Consider during Session 2 whether the lattice extraction (Claude
Code's deferred item from the read-and-report) is worth doing.
With v1 deleted, the duplication self-resolved — no immediate
driver to extract, but the question is worth a sentence of
thought before final disposition.


## 2026-05-13 — Cantor arc pivot: from classifier to presentational

### Started
Session 3 of the chord/melody classifier arc on `audio-onset-analysis`.
Plan from `docs/active-plans/chord-melody-build-plan.md`: build the
foundation harness + classifier minimum + comparison logic, get T1.1
(single sustained note) passing. Start-of-session ritual (second time
running it): read yesterday's SESSION_LOG entry, propose STATUS.md
updates from Session 2's landed work, scan RADAR.md for items affected
by Session 2.

STATUS.md edits proposed and accepted (consolidated entry under
"Chord/melody classifier arc — Sessions 1–2 complete"; deferred to
end-of-session commit). RADAR scan complete; the sus2/sus4 entry from
Session 2 closeout was well-placed, no other items changed status,
deliberately did not add a "test convention forming" entry yet (decided
to revisit after a third file wants self-tests).

### Landed before the pivot

**`tools/regenerate-test-json.py` — structured `expected` field**
Extended the parser to convert bulleted Expected blocks in the
chord-melody test corpus into structured intervals
(`{from_ms, to_ms, state, identity, confidence, effective_set}`).
Always-present fields with explicit nulls; identity emitted as
`{root: <PC 0-11>, quality: <string>}`. Hard-classifier-shaped;
future probabilistic interpretation will require a schema rev
(flagged in code comment). Loose-prose and dual-expected-block
tests cleanly produce `expected: null` with `expected_null_reason`
(`'loose_prose'` or `'dual_block'`). Summary print at script
completion groups outcome by category. `--self-test` flag with
~25 assertions across 8 categories.

Classification outcome on the current corpus: 10 structured,
13 loose_prose, 3 dual_block. The illustrative summary in the
Claude Code prompt (22/4) didn't match what the rules-as-written
actually produced — tests with narrative-mixed bullets (T2.7, C.3)
or symbolic times (D.1) demoted to loose_prose, and many tests
were already prose-only.

Committed on `audio-onset-analysis` (commit `f15e67a`, pushed).

### The pivot

After the parser landed, the planned next step was Y prompt 2 of
Session 3's four-prompt structure: build the minimum classifier.
Instead, the session turned.

The trigger was a worry surfaced directly:

> "I had this vision of a cool tool that would allow for a visual
> interpretation of music — with chords of different flavors
> displayed distinctly and melodies living above that. But we've
> spent weeks now and I don't think we're getting closer to this."

That reframed the question from "is our test format elegant?"
(layer 3 of the classifier infrastructure) to "is the classifier
the right answer at all?" (layer 1).

Three observations made the doubt sharp:

1. **Cantor has never really worked.** Last week's iteration had
   notes above C4 silently dropped because they were considered
   "melody" — broken in a different way than what `_splitPoint`
   should have produced.
2. **The harmonograph sparkle was visually cool but didn't represent
   the music.** Pretty, not meaningful.
3. **Multiple weeks of work toward the vision; the vision still not
   reified.**

Walked through what a visual approach could look like without a
classifier. Three sketches surfaced:
- (A) Temporal-density clustering — but still doing some interpretation.
- (B) Pitch-class collapse — just rendering the sounding set.
- (C) "Lit Tonnetz triangles for any all-three-vertex-PCs-sounding
  triangle, plus dynamic glyphs per sounding MIDI note, with no
  chord-vs-melody distinction." Viewer's brain does the work.

(C) felt right. The framing that crystallized it:
**presentational, not interpretive.** The visualization shows the
data; the human ear/eye system does the rest. This has a property
the classifier didn't: it's *correct by construction* — no T3.1
false-positives, no "is this a chord or a fast melodic run" judgment
calls, because the visualization makes no such claim.

A second framing landed simultaneously: **the Tonnetz already encodes
chord shapes geometrically.** A Cmaj7 is *literally* the union of a
C-major triangle and an E-minor triangle's pitch classes. Lighting
both triangles is *more honest* than picking one and labeling it
"the chord." This is also a more elegant home for the kind of harmonic
ambiguity that the probabilistic-interpretation thread (Session 2 RADAR
entry) was reaching for — spatial multi-triangle expression instead of
likelihood lists.

Decision: fork. New approach gets a dedicated branch and a dedicated
build effort. The classifier arc is *paused*, not closed — its
artifacts (TempoState from Session 1, chord-resolver power-chord +
self-tests from Session 2, parser extension from this morning) remain
valid as general infrastructure and may be useful for future SongLab
features. But cantor as a *consumer* of the classifier is being shelved.

### Landed after the pivot

**`cantor-presentational-spike` branch off dev.** Throwaway-by-design,
sized to validate the visual idea in an hour before kids' homecoming.

Used the read-and-report Claude Code pattern (prompt asks Claude Code
to read relevant files, report findings + proposed plan, *stop before
code*). Surfaced before any code landed: the existing cantor's 3D
toroidal lattice (12×4, 96 triangles with `type: 'major'|'minor'`
field), Canvas 2D rendering, MusicalEventStream subscription, lattice
visual center at canvas (width/2, height/2), the entire audio
routing path through chord-detection → HarmonyState (the
interpretation we wanted to skip).

Three new artifacts:
- `static/shared/cantor-presentational-view.js` — `CantorPresentationalView`
  class. Reuses substrate rendering, 3D math, drift+breathing from
  `cantor-view.js`. Adds: `_notes` map driven by MusicalEventStream;
  per-frame lit-triangle pass (set membership of vertex PCs in
  sounding-PC set, back-face attenuation preserved); per-glyph anchor
  (halo + hot core) at the lattice instance closest to canvas center,
  offset radially outward by `(floor(midi/12) - 5) * 18px`; particle
  pool (500 particles, harmonograph-pattern-style) spawning from
  active glyphs.
- `templates/cantor-spike.html` — stripped fork of cantor.html. Full
  viewport, keyboard toggleable, hardware row fixed top-left.
- `/cantor-spike` route in `app.py`.

Iteration during the hour:
- Initial spike used a single warm-white fill for lit triangles
  (`rgba(255, 235, 200, 0.35)`). Recognized in the moment that
  coloring triangles by their *intrinsic lattice geometry* (major
  vs minor) is not classifier work — the type is a static property
  of each triangle, not derived from analyzing the sounding set.
  Added `LIT_TRIANGLE_MAJOR_RGBA` (warm gold) and
  `LIT_TRIANGLE_MINOR_RGBA` (cool blue), branching on `tri.type`.
- First color attempt rendered everything as gray — turned out the
  alphas were too low (0.30-0.35 multiplied by back-face attenuation
  ~0.3-0.5 → effective alpha ~0.10-0.17, invisible). Cranked to
  0.55/0.50.
- Then *all* triangles rendered as the minor (blue) color despite
  the bump. Diagnosis: the spike's `_buildLattice3D` had dropped the
  `type` field when the model copied from cantor-view.js. `tri.type`
  was `undefined`, `undefined === 'major'` was false, every triangle
  fell through to minor. Two-line fix to add `type: 'major'` and
  `type: 'minor'` to the two `triangles.push` sites.
- Full-window canvas requested mid-iteration ("I want more real
  estate badly"). Quick Claude Code change to make `#cantor-stage`
  fill 100vw × 100vh, keyboard toggleable.
- Audio path added late afternoon via the existing AudioInput +
  input-provider abstraction. Monophonic YIN via mic_pitch modality,
  bridged into MusicalEventStream with `source: 'audio'`. Status
  pill: "monophonic — single notes only." Swap-point comment block
  in place above `createInputProvider` for the eventual polyphonic
  detector. **Importantly: bypassed chord-detection.js entirely.**
  The presentational view never imports HarmonyState or chord-detection.
- Feedback on MacBook mic from speaker output → mic loop. Solution
  was environmental (use Scarlett + headphones) rather than
  architectural; deferred sampler-suppression-when-mic-active as a
  later thought.

Spike commit on `cantor-presentational-spike` (commit `eb0d33a`,
not pushed yet).

### Validation

Played through the Launchkey 49 once the colors were right.
Glissando + plunked-chord sequence (D-G-B → D-F-A → D-F#-A) lit
up the lattice cleanly: voice-leading visible as triangles shifting
between adjacent harmonies, the F-to-F# move resolving to D-major
with no awkward chord-identity-update jank. Tested through
"Stressed Out," "Jupiter's Faerie" (Johnny Blue Skies, *Passage Du
Desir*), 12-bar blues. Multi-triangle expression of extended
harmony (Cmaj7 lighting both C-major triangle and E-minor triangle)
read as beautiful, not busy. Major→minor swaps on a fixed root
read clearly via the warm→cool color shift.

The reaction was unprompted and direct: "this is fun."

That was the evaluation. The vision the morning's classifier arc
was supposed to enable is, instead, working *without* the classifier.

### Setup for next session

The day's work needs to continue in a documentation block tomorrow:
- **STATUS.md update** — mark the chord/melody arc paused (not closed),
  note the cantor presentational fork, point at the new docs.
- **RADAR.md update** — revisit the sus2/sus4 entry's priority now
  that no near-term classifier or Voicing Explorer work consumes
  it. Add new threads: polyphonic audio detection as future
  infrastructure problem; possibly the corpus restructuring finding
  (now dropped in priority given the arc is paused).
- **New design doc** — `docs/cantor-presentational-design.md`.
  Captures the vision, the philosophy ("presentational, not
  interpretive"), the core mechanisms, what's out of scope (no
  classifier, no chord-state, no claim that the visualization
  *tells* you what chord is being played), and the relationship to
  the classifier arc (sibling, not successor).
- **New build plan** — `docs/active-plans/cantor-presentational-build-plan.md`.
  Session-by-session sized work to polish the spike into a real
  cantor replacement; eventual merge to dev; polyphonic audio
  as a downstream session.
- **Pause note for the classifier arc** — short addendum to
  `docs/active-plans/chord-melody-build-plan.md` marking the arc
  paused, explaining why, pointing at the new approach.
- **WORKING_STYLE.md addition** — the read-and-report convention
  for non-trivial Claude Code prompts touching existing code
  (text drafted in chat today, ready to drop in).

Open architectural questions to think about over the next day or two:
- **Polyphonic audio detection.** Real future-work problem. CREPE
  Pro tier is named in STATUS.md as the upgrade path; Basic Pitch
  and chroma-features approaches are alternatives. The audio path
  is architected for the swap; the detector behind input-provider's
  mic_pitch is the only swappable piece.
- **Bass Tonnetz layer.** Filtered subset of sounding-PC set driving
  an independent visual layer (notes below some register threshold).
  Cheap to add given the current architecture; design doc will
  capture the *general* mechanism ("filtered subsets drive
  independent layers"), of which bass Tonnetz is one application.
- **Spike-to-production path.** The current spike at `/cantor-spike`
  is throwaway-quality code. Decision needed: does the spike grow
  into the real cantor replacement (replacing `/cantor`'s view), or
  does a clean rebuild happen from the design doc? Probably the
  former, but worth being deliberate about it.

### Calibration notes

- **Pivot question came late.** The "is the classifier the right
  answer?" doubt could have surfaced at the start of Session 3, or
  at the start of the arc, or at the start of the week. It surfaced
  instead halfway through Session 3's parser extension follow-up,
  after Claude had already been driving the conversation toward
  Y prompt 2 of a four-prompt session structure. Calibration on
  Claude's side: when a multi-week arc starts feeling friction-y at
  the detail level (the test corpus's mixed-prose-and-bullets shape
  was friction), that's a signal worth treating as load-bearing,
  not as a quirk to engineer around. Today's friction wasn't really
  about the parser — it was about whether the corpus existed for
  the right reasons. Pushed too hard on parser elegance, not hard
  enough on whether-this-was-worth-doing.
- **Read-and-report Claude Code pattern is now a working convention.**
  Used twice today (cantor spike build, audio path addition). Both
  times the read phase caught structural surprises that would have
  produced wrong-shape code if skipped. To be added to WORKING_STYLE.md
  tomorrow. The pattern is: prompt asks Claude Code to read relevant
  files, report findings + proposed plan, *stop before code*; human
  reviews findings against expectations, sends go-ahead (with
  corrections if needed); code lands. Skip the pattern for fully
  greenfield work, trivial edits, or prompts that fully specify
  structure. For especially load-bearing changes, split into two
  separate prompts (read-only + build) with explicit intervention
  between them.
- **Music recommendation discipline failed twice.** "Shida" should
  have triggered a web search instead of memory-based guessing
  (Shida is a Khruangbin track on *Mordechai*, the album recommended
  to start the session — context I already had). "Jupiter's Faerie"
  attribution slip later (Stewart Copeland reference instead of
  recognizing the Johnny Blue Skies track from *Passage Du Desir*,
  which is in userMemories context). Both were Claude reaching for
  confident-sounding answers from memory rather than searching or
  acknowledging uncertainty. Calibration: from here, music
  references go through search or get an honest "I don't know
  which" before recommendations land.
- **"This is fun" is the right evaluation signal.** Not "does it
  look polished" or "is the alpha right" — the underlying question
  is whether the visualization is doing the thing the vision wants.
  Today's answer was clear and unprompted. That's the gold standard
  for whether to keep building.
- **Splitting work across Claude windows is workflow, not paranoia.**
  Discussed mid-session: new Claude Code window per new task; same
  window when a prompt is *continuing* a paused task (e.g.,
  read-and-report → go-ahead). Today's spike used the same window
  for read-and-report + go-ahead correctly, which is why Claude Code
  could act on its own findings without re-reading.

### Flagged for later

- **Sus2/sus4 cross-template inversion equivalence** (RADAR thread
  from 2026-05-12) is now lower priority. No near-term classifier
  or Voicing Explorer work will consume it. Stays in RADAR active
  threads but priority should be downgraded in tomorrow's RADAR
  pass.
- **Polyphonic audio detection** — new RADAR thread tomorrow. The
  monophonic limitation of YIN is real and the architectural swap
  point is in place; the actual implementation is a real problem
  worth dedicated thought before tackling.
- **Corpus restructuring finding** — the chord/melody test corpus
  is much more prose-heavy than initially estimated (10 structured
  vs 13 loose-prose vs 3 dual-block, not 22/4 as originally guessed).
  Was originally going to push the build plan; now pushes nothing
  because the arc is paused. Worth a note in tomorrow's RADAR pass
  but priority is "future" not "now."
- **RD-2000 USB cable** — small future-self todo. Cantor's
  presentational visualization deserves to be played on the
  RD-2000's weighted action. USB-B-to-USB-A cable is cheap and
  ubiquitous; an afternoon's worth of sourcing.
- **Sampler-suppression-when-mic-active** — when the audio path is
  feeding mic input, the MIDI sampler probably shouldn't *also* be
  playing through speakers (creates feedback loops). Architectural
  question, not urgent.
- **Spike branch's eventual fate** — promote to real cantor
  replacement (merge into dev as the new `/cantor`), or rebuild
  cleanly from the design doc with the spike as reference? Decision
  for the next planning session.

### Out of scope / deferred
- All of the chord/melody arc's remaining sessions (3–8) are
  paused. Their corresponding deliverables (classifier build,
  parameter tuning, cantor-view integration) are not being pursued.
  Branch `audio-onset-analysis` stays alive but unmerged.
- T3.1, T3.2, T3.3 in the test corpus — the known-hard cases the
  classifier wasn't expected to handle — are now moot for cantor
  but remain in the corpus as design exercises if the classifier is
  ever revived.
- The 2026-05-12 chord-resolver self-tests pattern ("test convention
  forming") observation has not produced a third file yet. Decision
  about WORKING_STYLE.md promotion deferred indefinitely; presentational
  cantor's first session may produce a third self-tested file but
  there's no rush.




## 2026-04-29 (morning)


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
