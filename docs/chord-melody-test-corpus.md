# Chord/Melody Classification — Test Corpus

> Companion doc: [`chord-melody-classification.md`](./chord-melody-classification.md)
> The design doc defines the classification rule. This doc defines
> the empirical tests that the rule must pass.

---

## Status

**2026-05-06** — Corpus structure defined. Tests sketched at the
"intent and shape" level. MIDI specs and machine-readable answer
keys not yet written.

---

## Working agreement

This doc is a **living test corpus**. Treat it accordingly:

1. Tests are added as new failure modes are discovered. When the
   classifier mis-handles a real case, that case becomes a test
   here before the fix is implemented.
2. Tests are *not* removed without recording the reason in the
   change log. A test that's redundant with another should be
   removed; a test that's "annoying because it fails" should not.
3. Each test has three required pieces: **MIDI sequence**, **expected
   classification**, **purpose**. Without all three, the test is
   incomplete.
4. Tests are organized into **tiers** by criticality. Tier promotion
   /demotion gets logged in the change log.
5. When a test is added, removed, or has its expected outcome
   changed, the relevant section in `chord-melody-classification.md`
   is also updated (rationale, deferred items, or open questions as
   appropriate). Changes to expected outcomes especially require
   considering whether the rule itself needs to change.
6. **JSON specs are regenerated after any test entry change.**
   This Markdown doc is the source of truth; JSON specs in
   `tests/chord-melody/specs/` are machine-readable derivatives
   used by the test harness. Run
   `python tools/regenerate-test-json.py` after editing test
   entries here, and commit the regenerated JSON alongside the
   Markdown change. The script is strict — it refuses to emit if
   any test fails to parse, so failures are visible immediately.

---

## How JSON specs work

The Markdown structure of test entries below — heading pattern
(`### T1.1 — ...`), fenced code blocks for MIDI sequences, bulleted
expected outcomes — is parsed by `tools/regenerate-test-json.py`
into one JSON file per test in `tests/chord-melody/specs/`.

This means:
- **The Markdown is canonical.** Edit tests here, then regenerate.
- **JSON files are derivatives.** They're in the repo (committed
  alongside Markdown changes for diff visibility), but they're
  always reconstructible from the Markdown.
- **The parser is strict.** Tests that don't conform to the
  expected structure are flagged as errors, not silently skipped.
  Run the script after edits and confirm clean output before
  running the test harness.
- **One file per test.** Each test ID gets its own JSON file
  (`T1.1.json`, `C.3.json`, etc.) for git-friendly diffs and
  clearer failure attribution.

If a test needs a field the parser doesn't currently recognize,
add the field to the Markdown convention first, then update the
parser. The parser is designed to warn rather than fail on
unrecognized fields, so this can be done incrementally.

---

## Conventions

### Test ID scheme
- **T1.x** — Tier 1, foundational correctness
- **T2.x** — Tier 2, design-probe tests
- **T3.x** — Tier 3, known-hard cases (deferred to voice-leading)
- **D.x** — Dyad-escalation tests
- **C.x** — Chord-state tests (declared, implied, transitions)
- **M.x** — Real-world musical excerpts

### MIDI sequence notation
For each test, list events as:

```
t=<time_ms> <event> pitch=<midi> [velocity=<v>] [channel=<c>]
```

Where `<event>` is `noteAttack` or `noteRelease`, and `pitch` is a
MIDI number. Default velocity is 80, default channel is 1.

### Expected classification notation
For each test, specify expected classifier output at each meaningful
moment:

```
At t=<time_ms>: state=<state>, identity=<identity-or-none>,
                confidence=<declared|implied|n/a>,
                effective_set=[<pitches>]
```

Where `state` is `nothing`, `melody`, or `chord`. For chord states,
`identity` is the (root, quality) of the chord and `confidence` is
either `declared` or `implied`. For melody states, `identity` and
`confidence` are `n/a`.

When a chord state has additional sounding notes beyond the chord
template, the renderer treats those as melody-on-top. Test
expectations note this where relevant.

### Tempo
Each test specifies its tempo in BPM. Temporal-window-dependent
expectations are stated relative to the parameter values in
`chord-melody-classification.md`.

---

## Tier 1 — Foundational correctness

If these don't pass, the classifier is broken. No design subtlety
involved; these are the absolute baseline.

### T1.1 — Single sustained note
*Tempo: 120 BPM. Purpose: confirms a lone note classifies as
melody, not as a degenerate chord.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=2000  noteRelease pitch=60
```

**Expected:**
- t=0 to t=2000: state=melody, effective_set=[60]
- t=2000+: state=nothing, effective_set=[]

---

### T1.2 — Sequential single notes, well-spaced
*Tempo: 120 BPM. Purpose: confirms sequential notes with no
temporal overlap and gaps larger than CHORD_CLUSTER_WINDOW classify
as melody. This is the test we tried to run on 2026-05-06; the
prior register-based implementation failed it because of the C4
threshold filter.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=500   noteRelease pitch=60
t=1000  noteAttack  pitch=64 (E4)
t=1500  noteRelease pitch=64
t=2000  noteAttack  pitch=67 (G4)
t=2500  noteRelease pitch=67
```

**Expected:** Three discrete melody events. At each attack, the
effective set is one note; state=melody. No chord is ever
detected.

---

### T1.3 — Simultaneous triad, attack-and-hold
*Tempo: 120 BPM. Purpose: the canonical chord case.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)
t=0     noteAttack  pitch=67 (G4)
t=2000  noteRelease pitch=60
t=2000  noteRelease pitch=64
t=2000  noteRelease pitch=67
```

**Expected:**
- t=0 to t=2000: state=chord, identity=(C, major), confidence=declared, effective_set=[60,64,67]
- t=2000+: state=nothing

---

### T1.4 — Two-note dyad, brief
*Tempo: 120 BPM. Purpose: confirms a brief dyad (no escalation)
classifies as simultaneous melody.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=67 (G4)
t=300   noteRelease pitch=60
t=300   noteRelease pitch=67
```

**Expected:** effective_set=[60,67] is a dyad. Duration (300ms <
DYAD_SUSTAIN_THRESHOLD) and repetition count (1 < DYAD_REPETITION_
THRESHOLD) mean no escalation. state=melody for both notes
simultaneously.

---

## Tier 2 — Design-probe tests

These probe the design choices we're actively making. Each test
maps to specific parameters; the corpus + parameter values together
must satisfy these tests.

### T2.1 — Fast arpeggio with overlap
*Tempo: 120 BPM. Purpose: confirms attacks within
CHORD_CLUSTER_WINDOW correctly cluster as chord even if not
strictly simultaneous.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=50    noteAttack  pitch=64 (E4)
t=100   noteAttack  pitch=67 (G4)
t=300   noteRelease pitch=60
t=300   noteRelease pitch=64
t=300   noteRelease pitch=67
```

**Expected:** All three sustain past t=100, so sounding-set sees
the triad. state=chord, identity=(C, major), confidence=declared
by t=100.

*Tuning note: this test passes for any reasonable
CHORD_CLUSTER_WINDOW and sounding-set rule. It's a sanity test,
not a tuning test.*

---

### T2.2 — Slow arpeggio (broken chord played as melody)
*Tempo: 120 BPM. Purpose: confirms an arpeggio played slowly
enough — with each note fully released before the next attacks —
classifies as melody. Together with T2.1, brackets the
CHORD_CLUSTER_WINDOW value.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=200   noteRelease pitch=60
t=500   noteAttack  pitch=64 (E4)
t=700   noteRelease pitch=64
t=1000  noteAttack  pitch=67 (G4)
t=1200  noteRelease pitch=67
```

**Expected:** No two attacks fall within CHORD_CLUSTER_WINDOW
(spacing is 500ms >> any reasonable window). Sounding-set never
contains more than one note. Three discrete melody events.

---

### T2.3 — Slow arpeggio resolving to held chord
*Tempo: 120 BPM. Purpose: the key forcing-function test that proves
the classifier handles state-evolution correctly. Each individual
note attacks alone (melody at the time of attack), but by the end
all three are sustaining together (chord).*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=400   noteAttack  pitch=64 (E4)
t=800   noteAttack  pitch=67 (G4)
t=2000  noteRelease pitch=60
t=2000  noteRelease pitch=64
t=2000  noteRelease pitch=67
```

**Expected:**
- t=0 to t=400: state=melody, effective_set=[60]
- t=400 to t=800: state=melody, effective_set=[60,64]
  (dyad of major third, no escalation — major thirds are not
  power-chord-eligible regardless of duration)
- t=800 to t=2000: state=chord, identity=(C, major),
  confidence=declared, effective_set=[60,64,67]
- t=2000+: state=nothing

---

### T2.4 — Repeated single note
*Tempo: 120 BPM. Purpose: confirms repeated attacks on the same
pitch don't trigger spurious chord classification.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=200   noteRelease pitch=60
t=300   noteAttack  pitch=60 (C4)
t=500   noteRelease pitch=60
t=600   noteAttack  pitch=60 (C4)
t=800   noteRelease pitch=60
```

**Expected:** Three discrete melody events. Same pitch repeated is
not a chord; escalation only applies to 2-note shapes.

---

### T2.5 — Sustained chord with melody on top
*Tempo: 120 BPM. Purpose: tests the melody-on-top behavior. Once
a chord is declared, additional notes (when they don't form a
meaningfully different chord) are melody-on-top — the chord state
persists.*

**MIDI:**
```
t=0     noteAttack  pitch=48 (C3)
t=0     noteAttack  pitch=52 (E3)
t=0     noteAttack  pitch=55 (G3)
t=1000  noteAttack  pitch=72 (C5)
t=1300  noteRelease pitch=72
t=1500  noteAttack  pitch=74 (D5)
t=1800  noteRelease pitch=74
t=2000  noteAttack  pitch=76 (E5)
t=2300  noteRelease pitch=76
t=5000  noteRelease pitch=48
t=5000  noteRelease pitch=52
t=5000  noteRelease pitch=55
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared, effective_set=[48,52,55]
- t=1000 to t=1300: state=chord, identity=(C, major), confidence=declared. C5 is melody-on-top — it's an octave doubling of the root, not a meaningfully different chord.
- t=1300 to t=1500: state=chord, identity=(C, major), confidence=declared. Back to just the triad.
- t=1500 to t=1800: state=chord, identity=(C, major), confidence=declared. D5 is melody-on-top — adding D to C-E-G gives C-D-E-G, which doesn't match any chord template. Chord state persists.
- t=1800 to t=2000: state=chord, identity=(C, major), confidence=declared.
- t=2000 to t=2300: state=chord, identity=(C, major), confidence=declared. E5 is melody-on-top — octave doubling of the third, not a meaningfully different chord.
- t=2300 to t=5000: state=chord, identity=(C, major), confidence=declared.
- t=5000+: state=nothing.

*This test verifies the melody-on-top rule (step 2e of
classification logic). The bass triad is declared at t=0, and
every melody note added on top either (a) duplicates an existing
chord tone or (b) doesn't form a new chord template. In both
cases, chord state is preserved.*

---

## Chord-state tests

These tests specifically exercise the chord-state machinery —
declaration, implication, transitions, and identity updates.

### C.1 — Partial release: third released, root + fifth held
*Tempo: 120 BPM. Purpose: confirms releasing the third of a
declared chord transitions to implied state.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)
t=0     noteAttack  pitch=67 (G4)
t=1000  noteRelease pitch=64
t=2000  noteRelease pitch=60
t=2000  noteRelease pitch=67
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared, effective_set=[60,64,67]
- t=1000 to t=2000: state=chord, identity=(C, major), confidence=implied, effective_set=[60,67]. Root (C) is still held; full template no longer matches; chord state persists with reduced confidence.
- t=2000+: state=nothing.

---

### C.2 — Partial release: fifth released, root + third held
*Tempo: 120 BPM. Purpose: confirms releasing the fifth of a
declared chord transitions to implied state.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)
t=0     noteAttack  pitch=67 (G4)
t=1000  noteRelease pitch=67
t=2000  noteRelease pitch=60
t=2000  noteRelease pitch=64
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared
- t=1000 to t=2000: state=chord, identity=(C, major), confidence=implied, effective_set=[60,64]. Root held; full template no longer matches.
- t=2000+: state=nothing.

---

### C.3 — Root release ends chord identity
*Tempo: 120 BPM. Purpose: confirms releasing the root ends chord
state. Remaining notes are reclassified from scratch, including a
fresh dyad-escalation clock per the design doc's "Dyad clock
restart on chord-state transition" rule.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)
t=0     noteAttack  pitch=67 (G4)
t=1000  noteRelease pitch=60
t=3000  noteRelease pitch=64
t=3000  noteRelease pitch=67
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared
- t=1000+: chord identity ends. Remaining set is [64,67] (E+G), a minor third. Dyad clock restarts at t=1000 per the dyad-clock-restart rule.
- t=1000 to t=3000: state=melody, effective_set=[64,67]. The dyad has been sounding 2000ms post-chord, well past DYAD_SUSTAIN_THRESHOLD (500ms at 120 BPM), so escalation tries to fire. But E+G is a minor third (interval 3), not a perfect fifth (interval 7) — power-chord template doesn't match — escalation produces no chord. state=melody persists.
- t=3000+: state=nothing.

---

### C.4 — Inverted chord: root identification works
*Tempo: 120 BPM. Purpose: confirms the chord-state machinery works
for inversions (root is not the bass note). The "until the root
releases" behavior depends on correctly identifying the root.*

**MIDI:**
```
t=0     noteAttack  pitch=64 (E4)  // bass
t=0     noteAttack  pitch=67 (G4)
t=0     noteAttack  pitch=72 (C5)  // root
t=1000  noteRelease pitch=64
t=2000  noteRelease pitch=72
t=2000  noteRelease pitch=67
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared. Even though the bass note is E (this is C major first inversion), the root is C.
- t=1000 to t=2000: bass E released. Remaining: [67, 72] (G+C). Root (C, MIDI 72) still held → state=chord, identity=(C, major), confidence=implied.
- t=2000+: state=nothing.

*This test depends on `chord-resolver.js` correctly identifying
the root for inversions. See OQ5 in the design doc.*

---

### C.5 — Chord identity update (C major → C7)
*Tempo: 120 BPM. Purpose: confirms chord identity updates when an
added note forms a meaningfully different chord template.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)
t=0     noteAttack  pitch=67 (G4)
t=1000  noteAttack  pitch=70 (Bb4)
t=2000  noteRelease pitch=60
t=2000  noteRelease pitch=64
t=2000  noteRelease pitch=67
t=2000  noteRelease pitch=70
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared, effective_set=[60,64,67]
- t=1000 to t=2000: effective_set=[60,64,67,70]. Matches C dom7 template — meaningfully different from C major (different quality). Chord identity updates. state=chord, identity=(C, dom7), confidence=declared.
- t=2000+: state=nothing.

---

### C.6 — Chord identity does NOT update on octave doubling
*Tempo: 120 BPM. Purpose: confirms that octave-doubling additions
don't trigger chord-identity updates. Distinguishes "playing
melody on top of held chord" from "modifying the chord."*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)
t=0     noteAttack  pitch=67 (G4)
t=1000  noteAttack  pitch=72 (C5)
t=2000  noteRelease pitch=72
t=3000  noteRelease pitch=60
t=3000  noteRelease pitch=64
t=3000  noteRelease pitch=67
```

**Expected:**
- t=0 to t=1000: state=chord, identity=(C, major), confidence=declared, effective_set=[60,64,67]
- t=1000 to t=2000: effective_set=[60,64,67,72]. C5 is an octave-doubling of C4 (same pitch class). The pitch-class-collapsed set is still {C, E, G} = C major. Not meaningfully different. C5 is melody-on-top. state=chord, identity=(C, major), confidence=declared.
- t=2000 to t=3000: state=chord, identity=(C, major), confidence=declared.
- t=3000+: state=nothing.

---

## Dyad escalation tests

### D.1 — Sustained perfect-fifth dyad escalates
*Tempo: 120 BPM. Purpose: confirms a perfect-fifth dyad held longer
than DYAD_SUSTAIN_THRESHOLD escalates to power chord.*

**MIDI:**
```
t=0     noteAttack  pitch=55 (G3)
t=0     noteAttack  pitch=62 (D4)
t=2000  noteRelease pitch=55
t=2000  noteRelease pitch=62
```

**Expected:**
- t=0 to ~DYAD_SUSTAIN_THRESHOLD: state=melody, effective_set=[55,62]. (At 120 BPM with threshold of 1 beat = 500ms, this lasts until t≈500.)
- After threshold to t=2000: dyad escalates. G+D is a perfect fifth (interval 7). Matches power-chord template. state=chord, identity=(G, '5'), confidence=declared.
- t=2000+: state=nothing. Chord identity ends because root (G) released.

---

### D.2 — Dyad released before threshold does not escalate
*Tempo: 120 BPM. Purpose: boundary test for D.1.*

**MIDI:**
```
t=0     noteAttack  pitch=55 (G3)
t=0     noteAttack  pitch=62 (D4)
t=300   noteRelease pitch=55
t=300   noteRelease pitch=62
```

**Expected:** With DYAD_SUSTAIN_THRESHOLD=1 beat at 120 BPM
(=500ms), the dyad ends at 300ms (< 500ms). state=melody throughout.

---

### D.3 — Repeated perfect-fifth dyad escalates
*Tempo: 120 BPM. Purpose: confirms a perfect-fifth dyad attacked
DYAD_REPETITION_THRESHOLD times within DYAD_REPETITION_WINDOW
escalates to power chord.*

**MIDI:**
```
t=0     noteAttack  pitch=55 (G3)
t=0     noteAttack  pitch=62 (D4)
t=200   noteRelease pitch=55
t=200   noteRelease pitch=62
t=500   noteAttack  pitch=55
t=500   noteAttack  pitch=62
t=700   noteRelease pitch=55
t=700   noteRelease pitch=62
t=1000  noteAttack  pitch=55
t=1000  noteAttack  pitch=62
t=1200  noteRelease pitch=55
t=1200  noteRelease pitch=62
```

**Expected:**
- First dyad (t=0 to t=200): state=melody (1 attack, no escalation)
- Second dyad (t=500 to t=700): state=melody (2 attacks within window, still below threshold of 3)
- Third dyad (t=1000 to t=1200): state=chord, identity=(G, '5'), confidence=declared. Three attacks within DYAD_REPETITION_WINDOW (2 beats = 1000ms; all three fall within this window from the first attack).

*Subtle: this test is sensitive to whether DYAD_REPETITION_WINDOW
is measured forward from the first attack or rolling. Specify in
implementation.*

---

### D.4 — Dyad repetitions outside window do not escalate
*Tempo: 120 BPM. Purpose: boundary test for D.3.*

**MIDI:** Same as D.3 but with each repetition spaced 1500ms apart
(attacks at t=0, 1500, 3000).

**Expected:** With DYAD_REPETITION_WINDOW=2 beats at 120 BPM
(=1000ms), no two attacks fall within the window simultaneously.
No escalation. All three dyads remain state=melody.

---

### D.5 — Sustained non-fifth dyad does NOT escalate
*Tempo: 120 BPM. Purpose: confirms only perfect-fifth dyads
escalate to power chord. Other intervals stay melody regardless
of duration.*

**MIDI:**
```
t=0     noteAttack  pitch=60 (C4)
t=0     noteAttack  pitch=64 (E4)  // major third interval
t=3000  noteRelease pitch=60
t=3000  noteRelease pitch=64
```

**Expected:** Held for 6 beats at 120 BPM, well past
DYAD_SUSTAIN_THRESHOLD. Escalation tries to fire, but the interval
(major third = 4 semitones) does not match the power-chord template
(interval 7). No chord declared. state=melody throughout.

---

## Real-world musical tests

These test the classifier against actual musical material rather
than synthetic patterns. Useful as integration checks.

### M.1 — Super Mario Bros. Ground Theme, measure 10 (rolled chords)
*Tempo: 100 BPM (per score: half-note = 100). Purpose: rolled-chord
case. The motivating real-world test for the temporal-window rule.
See design doc Rationale §2.*

**MIDI:** *To be transcribed from the score. Three rolled chords in
sequence. Each chord is rolled bottom-to-top over ~80ms. Chord 1
≈ F-major-ish (specific pitches TBD from score). Chord 2 ≈ G.
Chord 3 ≈ C. Spacing between rolled chords ≈ one eighth-note at
the score's tempo.*

**Expected:** Three discrete chord events. Each rolled chord
classifies as a single declared chord (per CHORD_CLUSTER_WINDOW
catching the rolled attacks). The three chords are distinct events
— each new rolled chord triggers chord-identity update because the
new effective set matches a meaningfully different chord template.

*This test is the upper-bound constraint on CHORD_CLUSTER_WINDOW:
the window must be wide enough to cluster within-roll attacks
(~80ms span) but narrow enough that adjacent rolled chords don't
merge (~150-200ms gap).*

*Status: incomplete. Score reference is page 1, measure 10 of
"Super Mario Bros. Ground Theme" (composed by Koji Kondo, arr.
Shinobu Amayake). MIDI transcription pending.*

---

## Tier 3 — Known-hard cases (deferred)

These tests are kept in the corpus as forcing functions for future
work. The interim classifier is **not expected to pass them**.
They're recorded so that:
- We don't pretend the interim handles them
- We have ground truth for evaluating future versions
- We don't accidentally regress on them when they start working

### T3.1 — Fast melodic figure outlining a chord shape
*Tempo: 120 BPM. Purpose: forcing function for voice-leading. The
interim classifier mis-classifies this as chord because the three
attacks fall within CHORD_CLUSTER_WINDOW and the pitches form a
chord template. Voice-leading-aware classification would correctly
identify it as melody by tracking voice continuity.*

**MIDI:** A C-E-G run played as fast sequential single notes —
each pitch attacked 30ms apart, each note 50ms long, intended
musically as a melody fragment.

**Expected (eventual, voice-leading):** All three notes are melody.

**Expected (interim, combined rule):** state=chord, identity=(C, major),
confidence=declared. Known failure of the interim rule; deferred
to voice-leading work — see design doc "Deferred to future work" §1.

---

### T3.2 — Bach two-voice counterpoint (or similar)
*Tempo: 80 BPM (varies). Purpose: forcing function for voice-leading.
Two melodic lines played independently, frequently sounding
simultaneously. Interim rule classifies the simultaneous moments
as chord; voice-leading-aware classification recognizes two voices
in melodic motion.*

**MIDI:** *To be transcribed from a Bach two-part invention or
similar. Pending.*

**Expected (eventual):** Both lines are melody. No chord events
during simultaneous-but-melodic passages.

**Expected (interim):** Many false-positive chord classifications
when the two voices happen to harmonize into recognized triads.
Documented as expected failure.

---

### T3.3 — Drone with implied harmony
*Tempo: 90 BPM. Purpose: forcing function for implied-chord
generalization (beyond v1's partial-release implied state). A pedal
A in the bass with a melody in A minor above it should imply A
minor harmony — even when no triad is ever literally sounding and
no chord was previously declared.*

**MIDI:** Sustained A2 throughout. Above it, a melody using A, C,
E, F notes typical of A minor.

**Expected (eventual):** Implied chord(A minor) shown — perhaps
with translucent visualization to distinguish from declared chords.

**Expected (interim):** state varies. The drone + melody dyad will
escalate (A2+C5 is a minor-tenth = pitch-class minor third, not a
perfect fifth, so it doesn't power-chord-escalate; A2+E5 is a fifth,
it would escalate). The intermittent escalations to A5 power chord
are not "wrong" but they're not the desired implied A minor either.
Deferred to implied-chord work — see design doc "Deferred to future
work" §3.

---

## Test harness requirements

The harness should:

1. **Accept structured test specs.** Read tests from the format used
   in this doc — list of timed events, tempo, expected outcomes.
2. **Synthesize publish events.** Convert event lists into
   `MusicalEventStream.publish()` calls with `source: 'test'` and
   appropriate timestamps.
3. **Record classifier output.** Capture the classifier's emitted
   state stream during the test run, including state, identity,
   and confidence at each transition.
4. **Compare to expected.** Diff observed against expected.
   Report mismatches with timestamp and detail.
5. **Run individually or as a suite.** Single-test mode for
   debugging; suite mode for regression checking.
6. **Operate at the cantor-view subscriber layer**, per the decision
   in the design conversation. We're testing the production code
   path, not a parallel implementation of the rule.

Implementation deferred — see "Build progress" in the design doc.

---

## Change log

### 2026-05-06 (later same session) — JSON regeneration workflow
Added working-agreement rule (item 6) and "How JSON specs work"
section establishing this Markdown doc as the canonical source for
test specs, with one JSON file per test in
`tests/chord-melody/specs/` regenerated by
`tools/regenerate-test-json.py`. Decision rationale: the artifact
humans interact with most often (this doc) should be the
source-of-truth; the machine-readable form is a derivative.

### 2026-05-06 (later same session) — C.3 updated for dyad clock restart
C.3's expected outcome and purpose statement updated to explicitly
reference the dyad-clock-restart rule added to the design doc.
Behavior unchanged; rationale now grounded in a documented rule
rather than an unstated implementation assumption.

### 2026-05-06 — Initial corpus structure
Defined tier system, ID conventions, MIDI/expected-outcome
notation, and working agreement.

Sketched Tier 1 tests (T1.1–T1.4), Tier 2 tests (T2.1–T2.5),
chord-state tests (C.1–C.6) covering declared/implied transitions
and identity updates, dyad-escalation tests (D.1–D.5) including
the perfect-fifth-only escalation rule, the real-world Mario test
(M.1), and Tier 3 forcing-function tests (T3.1–T3.3).

T2.5 (sustained chord with melody on top) updated to reflect the
melody-on-top rule (step 2e of classification logic) — chord state
persists when new notes either octave-double existing chord tones
or fail to form a new chord template.

C.4 (inverted chord) flagged as dependent on `chord-resolver`'s
root-identification (see design doc OQ5).

D.5 added to verify only perfect fifths escalate (sustained major
thirds stay melody).

MIDI specs are sketched at the "intent" level; M.1 needs score
transcription; T3.2 needs source selection.
