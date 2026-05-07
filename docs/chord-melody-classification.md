# Chord/Melody Classification — Design and Progress

> Companion docs:
> - [`chord-melody-test-corpus.md`](./chord-melody-test-corpus.md) — MIDI test corpus (primary)
> - [`chord-melody-audio-corpus.md`](./chord-melody-audio-corpus.md) — Audio (WAV) test corpus, downstream of MIDI corpus
>
> The corpora are the empirical complement to this design. Tests
> there reflect the rule defined here; parameter values defined here
> are tuned against the corpus.

---

## Status

**2026-05-06** — Design v1 complete. Implementation not started.
Test corpus structure exists; tests not yet formalized in MIDI form.

---

## Working agreement

This doc is **the durable home for chord/melody classification design
on cantor**. Treat it accordingly:

1. **Read this doc at the start of every session that touches
   chord/melody classification.** Not skimmed — read. The Rule,
   current parameter values, and any open questions need to be in
   working memory before code is written.
2. **All design changes are reflected here before code lands.**
   "I had to change X while implementing Y" gets written down here
   first; the code change comes after.
3. **Changes are considered across the full build scope, not just
   the change site.** A change that looks local may invalidate test
   answer keys, parameter values, or assumptions in the deferred-work
   list. Before committing a change, check whether it affects:
   - The Rule statement
   - Existing parameter values
   - Test corpus expected outcomes
   - Items in "Deferred to future work"
   - Items in "Open questions"
4. **Build progress updates at end of each session.** Even sessions
   that produced no code update the Status line and any relevant
   build-progress items.
5. **The change log is non-negotiable.** Every meaningful change to
   the rule, parameters, or scope gets a dated entry with reasoning.
   Future sessions need to be able to look at any decision and see
   why it was made.

---

## The Rule (v1)

Cantor classifies the current musical state into one of these
categories, emitted as a continuous stream:

- **Nothing** (no sounding notes, no recent attacks)
- **Melody** (one or more sounding notes, no chord identity in
  effect)
- **Chord, declared** (full chord template matches; high confidence)
- **Chord, implied** (root of previously-declared chord still held,
  but full template no longer matches; reduced confidence)

Notes:
- Classification is **continuous**, not pinned to attack events. A
  given note's role can change over its lifetime as the sounding
  set evolves.
- The classifier emits **(state, identity, confidence)** tuples.
  The renderer (`cantor-view`) consumes this stream and decides how
  to visualize each state — including how to render reduced
  confidence (e.g., translucent or desaturated coloring).

### State tracking

The classifier maintains:
1. **The sounding set** — notes currently held, updated by
   `noteAttack` / `noteRelease` events on `MusicalEventStream`.
2. **The recent-attack buffer** — a rolling window of recent attacks
   regardless of release state. Window length scales with tempo
   (see Parameters: `CHORD_CLUSTER_WINDOW`). Captures attacks that
   have already released — needed for fast rolled chords where
   notes don't sustain to overlap.
3. **The current chord identity** — the (root, quality) of the
   chord most recently declared, or null if no chord is in effect.
   This is the history-dependent state that enables implied-chord
   behavior.

The **effective sounding set** is the union of (1) currently-held
notes and (2) pitches from attacks within the temporal window.

### Classification logic

When the sounding set or recent-attack buffer changes, run this
logic in order:

1. **Empty effective set** → emit `nothing`. If a chord identity
   was in effect, clear it.

2. **A chord identity is currently in effect** (set as result of a
   previous declared chord):

   a. **Root of the current chord is no longer held** → chord
      identity ends. Clear the chord identity. Re-run classification
      from step 3 with the current effective sounding set.

   b. **A new chord template matches the effective sounding set,
      and is meaningfully different from the current chord
      identity** → chord identity *updates*. Emit `chord(declared,
      new identity)`. "Meaningfully different" means: different
      root, OR same root but different quality, ignoring
      octave-doublings of existing chord tones. (Adding a doubled
      root or doubled fifth to an existing chord does not constitute
      a meaningful difference.)

   c. **Effective sounding set still matches the current chord's
      template (full match)** → emit `chord(declared, current
      identity)`. Confidence remains high.

   d. **Root of the current chord is still held but the full template
      no longer matches** → emit `chord(implied, current identity)`.
      Confidence is reduced.

   e. **Root is held, set has notes beyond the current chord's
      template, but no new template matches** → the new notes are
      melody-on-top. Emit `chord(declared, current identity)`. The
      added notes do not change the chord state; they're consumed
      as melody by the renderer.

3. **No chord identity is in effect.** Check the effective sounding
   set against chord templates:

   a. **3+ notes matching a chord template** (per `chord-resolver.js`)
      → declare chord. Set chord identity to (root, quality). Emit
      `chord(declared, identity)`.

   b. **2 notes (dyad), escalation triggered** (sustained ≥
      `DYAD_SUSTAIN_THRESHOLD`, OR repeated ≥ `DYAD_REPETITION_
      THRESHOLD` within `DYAD_REPETITION_WINDOW`) → matches the
      power-chord template (interval `[0, 7]`) → declare chord.
      Emit `chord(declared, root + "5")`.

   c. **Otherwise** → emit `melody` with all sounding notes as
      simultaneous melody.

### Why this structure

The two-stage check (step 2 before step 3) is what produces the
chord-state machinery. Once a chord is declared, *the chord persists
until its root releases*, even if other chord-tones release in the
interim. This handles common musical gestures (lifting and re-pressing
inner voices of a held chord) without flickering the visualization
off and on, and produces "implied chord with reduced certainty"
for the partial-release case.

When the root releases (2a), chord identity ends, and remaining
held notes are re-classified from scratch via step 3. They might
form a new chord (if multiple notes remain and match a template),
or they might be a dyad subject to dyad-escalation, or they might
be melody.

### Dyad escalation in detail

A 2-note effective set (dyad) is harmonically underspecified by
default. When no chord identity is in effect, a dyad classifies
as melody (both notes simultaneously) until *escalation* occurs.

Escalation fires when *either*:
- The same dyad has been continuously sounding for ≥
  `DYAD_SUSTAIN_THRESHOLD`, or
- The same dyad pitch-pair has been attacked ≥
  `DYAD_REPETITION_THRESHOLD` times within `DYAD_REPETITION_WINDOW`.

On escalation, the dyad is matched against `chord-resolver`'s
power-chord template (`{ quality: '5', intervals: [0, 7] }`).
- If the dyad is a perfect fifth (interval 7 between the two
  pitches), it matches → declared as power chord.
- If the dyad is anything else (third, sixth, seventh, etc.), it
  does not match the power-chord template, and escalation produces
  no chord. The dyad remains classified as melody.

This is intentional: only perfect fifths have the unambiguous
"this is the root" character that justifies chord-ifying a dyad.
Other intervals stay as multi-voice melody.

### Dyad clock restart on chord-state transition

When chord identity ends (root release, per step 2a) and a residual
2-note set remains, the residual dyad is **treated as a freshly-formed
dyad for purposes of escalation**. Its sustain-duration clock and
repetition counter both restart at the moment chord identity ends —
even if the two notes have been physically sounding since before
the chord was declared.

The rationale: the residual dyad is a *new harmonic situation*,
not a continuation of an existing one. The musician's intent when
they were playing the chord was "I'm playing C major"; their intent
after releasing the C is something different (or undetermined),
and the classifier should treat the dyad's identity as starting
fresh from that moment.

Without this rule, residual dyads would inherit accumulated
duration from their pre-chord history, leading to surprising
behavior: releasing the root of a long-held C-E-G could cause an
immediate E5/G5-equivalent power-chord declaration if the dyad
happened to be a perfect fifth. The clock restart prevents this.

The same applies to repetition counts: attacks of the dyad pair
that occurred while the chord was declared do not count toward
the post-chord repetition threshold.

---

## Rationale

This section captures why the rule landed here, including
alternatives that were considered and rejected. Important so that
re-litigation can start from "we already considered X" rather than
from scratch.

### §1. Why not register-based (the prior implementation)

Cantor previously used a hard pitch threshold (`_splitPoint =
MELODY_SPLIT_PITCH_DEFAULT`, MIDI 60) to separate melody (pitch >
splitPoint) from chord/accompaniment (pitch ≤ splitPoint). This was
a working hypothesis that "melodies live in a register above some
threshold," operationalized as the simplest possible rule.

Rejected because:
- It fails on common musical patterns the visualization cares about.
  A walking bass line is melody; a high-register triad attack is a
  chord. Register correlates with role in some music but doesn't
  define it.
- It's not stepping-stone-shaped toward voice-leading. The
  classification is fixed at attack time based purely on pitch; no
  primitive in the rule generalizes toward "tracking voices over
  time."
- The threshold biased the platform's own developer during testing
  by causing notes at exactly C4 to silently disappear from the
  constellation. If the design surprises the developer, it
  surprises users harder.

### §2. Why not sounding-set-only (rejected during design)

A simpler rule was considered: classify based purely on the current
sounding set, with no temporal window. A chord is recognized when
≥3 notes are simultaneously sounding *and* match a chord template.
Otherwise, melody.

Rejected because of **rolled chords**. A rolled chord — common in
piano music since Chopin, and in popular music (e.g., Super Mario
Bros. Ground Theme, measure 10, where the F-G-C arpeggiations are
played as fast rolls intended as chords) — has notes that attack
sequentially and may not sustain to overlap. The musician's intent
is "this is a chord," but the literal sounding set never contains
all three notes at once. Sounding-set-only would misclassify these
as sequential melody notes, which is musically wrong.

The temporal-window addition catches rolled chords by clustering
recent attacks even when the notes have already released.

### §3. Why combined (sounding-set OR temporal-window)

The two signals answer different questions:

- **Sounding-set** answers "what is the current harmonic situation?"
  — given notes that are currently sounding, do they form a chord?
- **Temporal-window** answers "how do we group recent attacks?" —
  when notes attack near each other, should we treat them as a
  single chord event?

Both signals carry information neither captures alone. The combined
rule fires chord recognition when *either* signal identifies a chord
shape. Melody is the residual.

The combined rule has a known failure mode: a fast melodic figure
(e.g., a quick C-E-G run) that happens to outline a chord shape will
classify as chord. This is accepted for the interim — see "Deferred
to future work" §1.

### §4. Why dyad escalation (and why scoped narrowly)

A 2-note shape (dyad, including power chords) is harmonically
underspecified. C+G alone could be the upper portion of many
chords, an open fifth interval, or two melody notes overlapping.
The default classification — both notes are simultaneous melody —
respects this ambiguity.

But repetition or sustain *resolves* the ambiguity. A G+D dyad
struck four times in succession in a rock context is unambiguously
a "G5 power chord, repeated." The repetition asserts the harmonic
identity. Same for sustained dyads — duration is its own form of
assertion.

The dyad-escalation rule encodes this. It's scoped narrowly in two
ways:

1. **Only 2-note shapes** (not 1-note or 3+-note):
   - 1-note: a single sustained or repeated pitch is just a
     sustained or repeated pitch, not a chord. Chord-ness requires
     harmony, and harmony requires intervals. Single notes
     contribute no harmony.
   - 3+-note shapes: if they match a chord template, they're
     already classified as chord by the main rule. If they don't,
     escalation doesn't help — the shape isn't a chord regardless
     of how long it's sustained.
   - Only the 2-note layer has ambiguity that escalation can resolve.

2. **Only perfect fifths** (the power-chord interval):
   - Other intervals (thirds, sixths, sevenths) don't have an
     unambiguous "this is the root" interpretation. A held major
     third could be the lower portion of any major chord whose
     root is the lower note OR the upper portion of any minor
     chord whose root is below the lower note. Escalating it
     would force a guess.
   - Perfect fifths are special: the strong consonance and the
     clear root-fifth relationship make "this is the root" the
     default interpretation. Power chords in rock music
     institutionalize this.

This rule is a deliberately limited form of **implied-chord
detection**. Broader implied-chord cases (drone+melody, monophonic
outlining of harmony) are out of scope for v1 — see "Deferred to
future work" §3. The dyad rule is implemented as a special case
*now* because it's tractable and high-value (rock power chords
alone justify it). When implied-chord detection is generalized in
future work, the dyad rule should be subsumed by that
generalization, not replaced by an unrelated mechanism.

### §5. Why classification is continuous, not attack-pinned

Initial drafts of the rule classified each `noteAttack` event at
the moment of attack: "is this note melody or chord?" That framing
fails on a common case: a note played alone (melody) that becomes
part of a chord as more notes accumulate underneath it. C-E-G played
sequentially with sustain is heard as melody → melody → chord, with
the C and E retroactively becoming chord-tones once the G arrives.

The continuous-classification framing handles this naturally: the
classifier emits "current state of the effective sounding set" as
the set evolves. Cantor's rendering layer consumes the state stream
and decides how to visualize transitions (e.g., a melody note that
becomes a chord-tone might fade from the constellation as the
tonnetz lights up).

This framing also aligns with the eventual voice-leading endpoint
— voice-tracking systems naturally maintain continuous state about
each voice's trajectory.

### §6. Why tempo-relative windows

A 200ms gap between notes is short at slow tempos (less than a
sixteenth note at ♩=60) and long at fast tempos (longer than an
eighth at ♩=200). The same physical timing carries different
musical meaning at different tempos. Fixed millisecond windows
would over-cluster at fast tempos (treating melodic figures as
chords) and under-cluster at slow tempos (failing to catch rolled
chords).

Windows scale with tempo so the *musical* duration of the window
stays constant regardless of how fast the music is moving.

For v1, tempo is user-set on cantor's main page (see Parameters,
`TEMPO_BPM`). Tempo inference from the input stream is deferred —
see "Deferred to future work" §2.

### §7. Why chord state persists until root release

Once a chord is declared, the natural question is: when does it
stop being declared? Several answers were considered:

1. **As soon as the sounding set stops matching the template.**
   Releasing any chord-tone immediately ends the chord state.
   - Rejected: too brittle. A pianist holding a chord and lifting
     a finger briefly (say, to re-articulate) would lose the chord
     identity, causing the visualization to flicker.

2. **When all chord-tones release.**
   - Rejected: too forgiving. A chord that's reduced to a single
     held note (e.g., released to just the third) shouldn't still
     be "C major" — there's no harmonic basis for that claim
     anymore.

3. **When the root releases.** *(Selected.)*
   - The root is the harmonic anchor. With the root held, the
     chord identity has a basis even if other tones come and go.
     Without the root, the chord-as-named no longer has a defensible
     identity.
   - Releases of non-root tones produce *implied chord* state with
     reduced confidence — this captures the harmonic reality
     ("we're still hearing some C major energy because C is held,
     but we're missing voices") and provides the visualization a
     way to render the diminished certainty.
   - Handles the lift-and-re-press gesture cleanly.

The "implied chord" state is a real third classification beyond
"declared chord" and "melody." It exists only as the residue of a
previously-declared chord — it cannot be entered from scratch (e.g.,
a dyad that was never part of a declared chord doesn't enter
implied state; it's just melody, possibly subject to
dyad-escalation). This keeps the implied-chord logic well-defined:
implied chords have unambiguous identity (whatever was previously
declared), unlike a hypothetical "imply a chord from a partial
sounding set with no prior context," which would require probability
weighting and tonal-context tracking.

### §8. Why chord identity *updates* on new chord-shape additions

When notes are added to an already-declared chord, the rule asks:
does the new sounding set match a *meaningfully different* chord
template? If yes, the chord identity updates. If no, the new notes
are melody-on-top.

The rationale: musicians do modify chord harmony in real time.
Holding C major and then adding B♭ to make a C7 is a deliberate
harmonic action — the player is asserting a new chord identity,
not playing a melody note. The classifier should follow the player's
intent.

Octave doublings of existing chord tones don't count as
"meaningfully different" — adding a C5 to a held C-E-G chord is
just doubling the root. The chord stays C major; the C5 is melody.
This preserves the melody-over-chord case where the melody happens
to land on a chord tone.

The "meaningfully different" comparison is: different root, OR same
root but different quality, after collapsing the sounding set to
pitch-classes (so octave doublings are absorbed).

---

## Parameters

The rule has tunable parameters. Initial values are starting points;
final values are determined by running the test corpus.

| Parameter | Current value | Tuned by | Notes |
|---|---|---|---|
| `TEMPO_BPM` | User-set, default 120 | N/A (user config) | Stored as cantor-level state. Visible, editable input on main page. |
| `CHORD_CLUSTER_WINDOW` | Untuned. Initial guess: 1/8 of a beat | Corpus tests T2.1, T2.2, T2.7, M.1 | Length of the temporal window for clustering recent attacks. Expressed as a fraction of beat duration so it scales with `TEMPO_BPM`. At 120 BPM, 1/8 beat ≈ 62.5 ms. |
| `DYAD_SUSTAIN_THRESHOLD` | Untuned. Initial guess: 1 beat | Corpus tests D.1, D.2 | Duration a 2-note dyad must continuously sound before escalating to chord. |
| `DYAD_REPETITION_THRESHOLD` | Untuned. Initial guess: 3 attacks | Corpus tests D.3, D.4 | Number of dyad-attacks within `DYAD_REPETITION_WINDOW` to trigger escalation. |
| `DYAD_REPETITION_WINDOW` | Untuned. Initial guess: 2 beats | Corpus tests D.3, D.4 | Window over which dyad attacks are counted for repetition-based escalation. |

Notes:
- Parameter names use `SCREAMING_SNAKE_CASE` to match the existing
  `MELODY_SPLIT_PITCH_DEFAULT` convention in `cantor-view.js`.
- Initial guesses are placeholders to make the corpus tests
  *runnable*, not authoritative defaults. Expect them to change.
- All tempo-relative parameters are stored as fractions of beat
  duration, computed at runtime from `TEMPO_BPM`.

### `chord-resolver.js` extension

The rule depends on `chord-resolver` recognizing power chords. This
is a small extension to the existing template list — adding one
entry:

```javascript
{ quality: '5', symbol: '5', intervals: [0, 7], priority: 4 }
```

Priority 4 (or any value greater than the existing maximum of 3)
ensures power chords are matched only when no richer chord matches.
In practice this is automatic — power chords are 2-note, and no
3+-note template matches a 2-note set — but the priority is
future-proofing.

This is the only dyad template added in v1. Other dyads (thirds,
sixths, sevenths) are not added because they don't have unambiguous
"this is the chord" interpretations. See Rationale §4.

---

## Test corpus

Two test corpora exist, in sequence:

- **MIDI corpus** ([`chord-melody-test-corpus.md`](./chord-melody-test-corpus.md))
  — primary. Tests the classifier in isolation by synthesizing
  publish events directly into `MusicalEventStream`. This is the
  corpus that drives parameter tuning and verifies classifier
  correctness.
- **Audio corpus** ([`chord-melody-audio-corpus.md`](./chord-melody-audio-corpus.md))
  — downstream. Tests the AudioInterpreter + classifier pipeline by
  rendering musical scenarios as WAV files (via Logic Pro) and
  feeding them through the production audio path. Implementation
  deferred until MIDI corpus passes.

Each test in the corpora specifies a musical scenario, the expected
classification at each moment, and the design question the test
answers. Parameter tuning is the process of finding values where
the entire MIDI corpus passes; audio corpus verifies the full
pipeline once the classifier is verified.

---

## Build progress

Updated at end of each session.

### Foundation
- [ ] Tempo input on cantor main page (visible, editable)
- [ ] Tempo state — where it lives, how it's accessed (see OQ1)
- [ ] Test harness — synthesize publish events into `MusicalEventStream` from a structured test spec

### `chord-resolver` extension
- [ ] Add power-chord template (`quality: '5'`, `intervals: [0, 7]`, `priority: 4`)
- [ ] Verify root identification for inversions of all chord qualities (see OQ5)
- [ ] Verify existing chord-resolver tests still pass
- [ ] Add test for power-chord matching

### Test corpus
- [ ] Corpus formalized in `chord-melody-test-corpus.md`
- [ ] MIDI files generated for each test
- [ ] Answer keys encoded in machine-readable form

### Classifier
- [ ] Sounding-set tracking from `MusicalEventStream`
- [ ] Recent-attack buffer with tempo-relative window
- [ ] Effective sounding set computation
- [ ] Chord-template matching via `chord-resolver`
- [ ] Chord-identity state (current chord + root tracking)
- [ ] Chord-state transitions (declared → implied → ended)
- [ ] Chord-identity update logic ("meaningfully different" check)
- [ ] Dyad-escalation logic (sustain + repetition)
- [ ] Continuous state emission with confidence levels

### Integration with cantor-view
- [ ] cantor-view subscribes to classifier output instead of raw `MusicalEventStream`
- [ ] Removal of `_splitPoint` register-based filtering
- [ ] Rendering treatment for declared vs implied chord (see OQ2)
- [ ] Verification: existing cantor visualization behavior preserved or improved

### Parameter tuning
- [ ] Run corpus, observe failures, adjust parameters
- [ ] Document final parameter values in this doc
- [ ] Document any tests that fail at acceptable parameter values (known limitations)

### Verification (MIDI)
- [ ] All Tier 1 corpus tests pass (MIDI)
- [ ] All Tier 2 corpus tests pass (MIDI)
- [ ] All chord-state tests pass (MIDI)
- [ ] All dyad-escalation tests pass (MIDI)
- [ ] Mario M.1 test passes (MIDI)
- [ ] Tier 3 tests documented as known-failures with rationale

### Audio corpus (deferred until MIDI corpus passes)
- [ ] Logic Pro project template configured (default piano, render settings)
- [ ] WAV files generated for Tier 1 audio tests (T1.1-A through T1.4-A)
- [ ] WAV files generated for Tier 2 audio tests (T2.1-A through T2.5-A)
- [ ] WAV files generated for chord-state, dyad, and Mario tests
- [ ] Audio test harness — loads WAV, plays through Web Audio analyser, captures AudioInterpreter + classifier output
- [ ] Per-test tolerance application logic
- [ ] Audio corpus runs and reports pass/fail with diagnostic detail when AudioInterpreter events differ from MIDI expected

---

## Open questions

Things known to be unresolved. Each has a date raised and a note
about what would resolve it.

### OQ1 — Where does tempo state live?
*Raised 2026-05-06.*

Tempo needs to be accessible from cantor's classifier and
potentially from other surfaces (Harmonograph, games). Candidates:
- A new module (`tempo-state.js`?) with a pub/sub interface like
  `HarmonyState`.
- A field on `HarmonyState` itself.
- Module-scoped state in `cantor-view.js` for v1, refactored later
  if other surfaces need it.

Resolution path: lowest-friction option that doesn't paint into
a corner. Probably option 3 for v1, with a note to revisit when
the second consumer appears.

### OQ2 — How does cantor-view render the chord-state transitions?
*Raised 2026-05-06.*

The classifier emits four states: nothing, melody, declared chord,
implied chord. The renderer needs visual treatments for each — and
for transitions between them. Specific questions:
- How is "implied chord" rendered differently from "declared
  chord"? (Translucent? Desaturated? Coloring change?)
- How does a melody note become part of a chord visually? (The
  constellation note fading as the tonnetz lights up? Both
  simultaneously?)
- How does a chord transition to implied state visually? (A fade
  in saturation? A note disappearing from the lit pattern?)
- What happens when chord identity ends (root released) and the
  remaining notes are reclassified as a sustained dyad eligible
  for escalation? Visual continuity matters here.

Resolution path: prototype after the classifier is working. Visual
design judgment + iteration. Some answers may force changes to the
classifier's output schema (e.g., we may discover the renderer
needs additional information not currently emitted).

### OQ3 — Multi-pitch dyad-repetition matching
*Raised 2026-05-06.*

The dyad-repetition rule says "the same pitch-pair has been attacked
≥ N times in a window." What does "same pitch-pair" mean — exact
MIDI numbers, or pitch-classes (so G3+D4 and G4+D5 are "the same"
because both are G+D)?

Resolution path: probably exact MIDI for v1 (simpler, predictable);
revisit if a real case shows pitch-class matching is needed.

### OQ4 — Confidence representation: discrete vs continuous
*Raised 2026-05-06.*

For v1, chord confidence has two levels: declared (full template
match) and implied (root held, partial template match). This is a
discrete two-state model.

A continuous confidence (0.0 to 1.0) would be more flexible — for
example, "implied with the third missing" vs "implied with both
third and fifth missing" could be different confidence levels. But
designing a continuous scale risks bikeshedding and doesn't have
a clear corpus-test driving it.

Resolution path: v1 is discrete. Revisit if rendering work (OQ2)
or future implied-chord generalization (Deferred §3) shows the
discrete model is too coarse.

### OQ5 — Inversions and root identification
*Raised 2026-05-06.*

The rule depends on knowing which note in a chord is "the root."
For root-position chords this is unambiguous. For inversions (e.g.,
E-G-C as C major first inversion), the root is C even though it's
not the bass note.

`chord-resolver.js` returns a `root` field — does it correctly
identify the root for all inversions of all supported chord
qualities? This needs verification before the chord-state machinery
can rely on "release the root" behavior.

Resolution path: read `chord-resolver.js`'s root-identification
logic; if it doesn't handle inversions, extend it before
implementing the classifier.

---

## Deferred to future work

Things explicitly out of scope for v1, with notes on what conditions
would trigger picking them up.

### §1. Voice-leading-aware classification
The combined rule misclassifies fast melodic figures that happen to
outline chord shapes (e.g., a quick C-E-G run intended as melody).
Voice-leading-aware classification would maintain a model of active
voices and assign each note to a voice based on continuity, allowing
the classifier to recognize "this is voice A's melodic motion" vs
"these three notes form voice A + voice B + voice C sounding
together."

Trigger to pick up: when corpus tests reveal misclassification
patterns the combined rule can't fix at any parameter setting, or
when cantor's product needs (e.g., chorale visualization,
contrapuntal music support) require it.

The interim rule is designed to be stepping-stone-shaped toward
voice-leading: continuous state emission, sounding-set-as-primitive,
and tempo-relative windows all generalize naturally to a
voice-tracking system.

### §2. Tempo inference from input
v1 takes tempo as user-set. Eventually, cantor should infer tempo
from the input stream (attack timings) and update `TEMPO_BPM`
automatically.

Trigger to pick up: when "having to set tempo manually" becomes a
real friction point in user testing, or when cantor is used in
contexts (e.g., live performance, accompaniment to recorded music)
where the user can't or shouldn't have to set tempo manually.

This work is conceptually adjacent to BeatField/BeatLab. May be
more naturally addressed there.

### §3. Implied chords beyond dyad escalation and partial-release
The dyad-escalation rule and the partial-release "implied chord"
state are limited forms of implied-chord detection. Broader cases:
- Monophonic line implying harmony (e.g., a Bach unaccompanied
  cello suite, where the single line outlines chord progressions)
- Drone + melody (e.g., a sustained A pedal with a melody in A
  minor — implies A minor harmony even when no triad is sounding)
- Ostinato patterns implying a chord progression
- Implied chord from partial sounding set with no prior declaration
  (e.g., C+E+B alone — could imply Am7 with the A absent — but
  v1 doesn't recognize this because there's no prior context)

These all share a structure: harmonic context emerges from temporal
patterns or contextual reasoning, not from simultaneous note
shapes. Detection requires pattern recognition over time windows
and tonal-context tracking.

Trigger to pick up: alongside voice-leading work (§1) — they share
infrastructure and are best implemented together. Visual treatment
already addressed in v1 (implied chords use reduced-confidence
rendering); generalization extends the *triggering conditions* for
implied-chord state, not the rendering.

### §4. 6th chords and extended harmony
`chord-resolver` currently recognizes triads, sus2/sus4, seven
flavors of seventh chord, and (after v1's extension) power chords.
It does not recognize:
- 6th chords (major 6, minor 6)
- Extended chords (9, 11, 13)
- Slash chords / specific inversions distinct from root position

Trigger to pick up: when corpus or user testing reveals these are
common in target repertoire and their absence is creating
misclassification.

### §5. Velocity / dynamics as classification signal
The current rule uses no velocity information. A soft note vs a
loud note are treated identically. Velocity could in principle
inform classification (a sudden accent might mark a chord attack;
a very soft note might be a passing tone), but the rule is already
complex enough without it.

Trigger to pick up: only if a specific corpus failure or product
need points at velocity as the missing signal.

### §6. Non-fifth dyad escalation
v1 escalates only dyads that are perfect fifths (power chords).
Other dyads (thirds, sixths, sevenths) stay melody regardless of
how long they sustain or how often they repeat.

Trigger to pick up: if real-world musical material reveals cases
where a sustained or repeated non-fifth dyad has clear harmonic
intent that the visualization should reflect. Likely shape:
context-sensitive interpretation (e.g., a sustained third in a
clear tonal context implies a triad with the fifth missing) —
which puts this work close to implied-chord detection §3.

---

## Change log

Every meaningful change to the rule, parameters, or scope. Newest
at the top.

### 2026-05-07 — T2.7 added to CHORD_CLUSTER_WINDOW tuning set
Updated the `CHORD_CLUSTER_WINDOW` parameter row: T2.7 (synthetic
repeated-rolls test) added; T2.6 removed because all-sustaining
rolls don't isolate the cluster window from the sounding-set rule.
T2.7 probes the upper-bound constraint on the cluster window
without depending on M.1's pending real-world transcription.

### 2026-05-06 (later same session) — Audio corpus companion doc
Created `chord-melody-audio-corpus.md` as a parallel artifact to
the MIDI corpus. Audio tests inherit musical scenarios from MIDI
tests (T1.1 ↔ T1.1-A, etc.) and add WAV-rendering and
AudioInterpreter-tolerance specs. WAV generation uses Logic Pro
with default piano. Sequencing rule: audio corpus implementation is
deferred until MIDI corpus passes, so audio failures can be cleanly
attributed to AudioInterpreter rather than the classifier.

Updated design doc to reference both corpora and added
audio-corpus items to build progress.

### 2026-05-06 (later same session) — Dyad clock restart rule
Added explicit rule: when chord identity ends (root release) and a
residual dyad remains, the dyad's sustain-duration clock and
repetition counter restart from the moment chord identity ended.
Pre-chord history does not carry forward to the post-chord dyad.

This was an implementation detail surfaced by writing test C.3
(root-release of C major leaving E+G dyad). Without the rule, the
residual dyad would inherit duration from before the chord was
declared, producing surprising power-chord declarations
immediately on root release if the residual happened to be a
perfect fifth.

### 2026-05-06 — Initial design (v1)
Established the combined classification rule (sounding-set OR
temporal-window with chord-template matching), the dyad-escalation
mechanism, the continuous-state emission framing, and tempo-relative
window scaling.

Added chord-state machinery: chord identity persists from declaration
until root release; partial release of non-root chord-tones produces
"implied chord" state with reduced confidence; chord identity
updates when added notes form a meaningfully different chord
template; added notes that don't form a new chord are melody-on-top.

Defined the four classifier output states: nothing, melody, declared
chord, implied chord.

Documented rejected alternatives (register-based, sounding-set-only,
attack-pinned classification, "release any chord-tone" chord-end
rule, "release all chord-tones" chord-end rule) with rationale.

Defined parameter list with initial-guess values pending corpus-based
tuning. Specified `chord-resolver.js` extension to add power-chord
template (`quality: '5'`, `intervals: [0, 7]`, `priority: 4`).

Established working agreement for this doc.

Companion test corpus stub created at `chord-melody-test-corpus.md`.

Sessions involved: planning conversation 2026-05-06 (Wednesday morning).
