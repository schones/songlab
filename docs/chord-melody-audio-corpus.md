# Chord/Melody Classification — Audio Test Corpus

> Companion docs:
> - [`chord-melody-classification.md`](./chord-melody-classification.md) (the design)
> - [`chord-melody-test-corpus.md`](./chord-melody-test-corpus.md) (the MIDI corpus)
>
> This doc is the **audio-input** counterpart to the MIDI corpus.
> Same musical scenarios, but rendered as WAV files and tested via
> the AudioInterpreter → classifier pipeline rather than by
> publishing events directly.

---

## Status

**2026-05-06** — Audio corpus structure defined. WAV files not yet
generated. Audio test harness not yet built.

**Implementation is deferred until the MIDI corpus is passing.**
This is a deliberate sequencing decision — see "Why audio testing
comes after MIDI testing" below.

---

## Working agreement

Same as the MIDI corpus working agreement, plus:

1. **Audio tests are downstream of MIDI tests.** Until the
   classifier passes its MIDI corpus, audio failures cannot be
   reliably attributed to AudioInterpreter vs the classifier.
   Audio tests are not implemented before MIDI tests pass.
2. **Audio tests inherit musical scenarios from MIDI tests.** Each
   audio test corresponds to a MIDI test by ID (T1.1-A is the audio
   version of T1.1). Diverging the corpora invites drift; same
   musical content, different input modality.
3. **Tolerances are documented per test.** AudioInterpreter has
   timing jitter and pitch detection confidence thresholds that
   MIDI doesn't. Each test specifies acceptable variance from MIDI's
   expected outcome.
4. **WAV generation is reproducible.** Track render settings
   (instrument patch, mix, sample rate, bit depth) so rendering can
   be repeated identically as Logic Pro projects evolve.

---

## Why audio testing comes after MIDI testing

The audio path adds a layer:

```
MIDI corpus:    test spec → MusicalEventStream.publish → classifier → output
Audio corpus:   WAV → AudioInterpreter → MusicalEventStream → classifier → output
                      ^^^^^^^^^^^^^^^^^^
                      this is the new layer
```

Both paths share the classifier and the comparison-to-expected
machinery. They differ only in how `MusicalEventStream` events are
generated.

Until the classifier itself is verified (via MIDI corpus passing),
an audio test failure could mean:
- The classifier has a bug (would also fail in MIDI tests)
- AudioInterpreter has a bug (publishes wrong events to the stream)
- The WAV file is bad (mis-rendered from source, wrong tempo, etc.)
- AudioInterpreter has correct behavior but at tolerances the test
  doesn't account for

That's three potential failure sites instead of one. Diagnosing
takes longer; fixing takes longer. By sequencing MIDI first, we
eliminate the classifier as a variable, leaving only AudioInterpreter
+ WAV generation when audio tests are introduced.

There's also a practical signal: if Friday's "single notes worked,
then chords filled in" observation reflects a real AudioInterpreter
bug, the audio corpus is what would systematize finding and
characterizing it. But that work is independent of (and downstream
of) the classifier rebuild.

---

## WAV generation conventions

### Source: Logic Pro

WAV files are rendered from MIDI source files via Logic Pro. Each
audio test has:

1. **A MIDI source file** — the same MIDI sequence as the
   corresponding MIDI test, exported as a `.mid` file.
2. **A Logic Pro project** — a `.logicx` bundle with the MIDI
   loaded onto a software instrument track and the rendering
   settings (instrument patch, mixing, etc.) configured.
3. **A rendered WAV** — bounced from the Logic project at
   standardized settings.

Storing all three lets us re-render any test if rendering settings
change, without losing the source-of-truth MIDI.

### Default render settings

Unless a test specifies otherwise:

- **Instrument**: Logic Pro's default Steinway Grand Piano
- **Sample rate**: 44.1 kHz
- **Bit depth**: 16-bit
- **Channels**: Stereo (rendered to mono for input where appropriate)
- **Bounce mode**: Offline (deterministic; no real-time processing
  artifacts)
- **Effects**: None (dry signal)
- **Master fader**: 0 dB (no normalization, no compression)

These settings prioritize reproducibility and clean signal over
realism. The audio path is being tested for *algorithmic
correctness*, not robustness to messy input. Realistic-input testing
(noisy mic, room ambience, different instruments) is its own
concern — see "Future work" §1.

### Specialty instruments

Some tests intentionally use non-piano instruments to exercise
AudioInterpreter on different timbres:
- **Guitar tests** — Logic's Classical Guitar or similar; tests
  that sympathetic vibration / harmonics don't mis-trigger.
- **Voice tests** — vocal sample or synthesized voice; tests that
  sustained pitched audio without strong onsets is correctly
  handled.

Any specialty instrument is documented in the test entry.

---

## Tolerance conventions

AudioInterpreter is not a perfect MIDI emulator. Audio tests
specify acceptable tolerances:

| Tolerance | Default | Notes |
|---|---|---|
| **Onset timing** | ±30 ms | AudioInterpreter's onset detection has frame-level granularity (~10 ms at typical FFT sizes) and amplitude-rise detection tolerance. |
| **Pitch detection** | exact MIDI note required | Pitch detection should be reliable for piano samples in the standard range. Tests using extended ranges may relax this. |
| **Onset confidence** | n/a (handled by AudioInterpreter) | We don't manually filter low-confidence events; AudioInterpreter is supposed to. |
| **Missed onsets** | 0 allowed | Tests where AudioInterpreter misses an attack are failures. |
| **Spurious onsets** | 0 allowed | Tests where AudioInterpreter detects an attack that doesn't exist are failures. |

Each test can override these defaults.

The tolerances apply to **AudioInterpreter's published events**, not
to the classifier's output. Once events are published, the
classifier's expected output is identical to the MIDI test —
because the classifier doesn't know or care whether events came
from MIDI or audio.

---

## Audio test entries

Each entry references the corresponding MIDI test by ID and adds:
- **WAV source**: instrument and any non-default render settings
- **Tolerances**: any non-default values
- **Audio-specific notes**: anything about how AudioInterpreter is
  expected to handle this scenario

Tests not yet specified at audio-corpus level are listed as
*Pending audio-corpus entry.*

### Tier 1 — Foundational correctness

#### T1.1-A — Single sustained note (audio)
*Corresponds to MIDI test T1.1.*

- **WAV source**: Default piano. C4 played and held for 2 seconds.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Tests that AudioInterpreter correctly
  publishes one `noteAttack` for the C4 onset and one `noteRelease`
  when the note decays to silence. The classifier behavior is
  identical to T1.1.

#### T1.2-A — Sequential single notes (audio)
*Corresponds to MIDI test T1.2.*

- **WAV source**: Default piano. C4, E4, G4 played sequentially
  with 500 ms gaps.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Tests that AudioInterpreter does not
  conflate sequential-but-released notes. Specifically, that the
  release of C4 is detected before the attack of E4. This is the
  scenario most relevant to Friday's "single notes worked, then
  chords filled in" observation — if release detection is delayed,
  AudioInterpreter could see C4 + E4 sounding simultaneously when
  they actually aren't.

#### T1.3-A — Simultaneous triad (audio)
*Corresponds to MIDI test T1.3.*

- **WAV source**: Default piano. C4 + E4 + G4 played simultaneously,
  held for 2 seconds.
- **Tolerances**: Onset timing ±50 ms (humans can't strike three
  notes truly simultaneously even with software; allow for
  small rendering jitter).
- **Audio-specific notes**: Tests that AudioInterpreter publishes
  three near-simultaneous `noteAttack` events. The classifier's
  CHORD_CLUSTER_WINDOW must accommodate the timing tolerance.

#### T1.4-A — Two-note dyad, brief (audio)
*Corresponds to MIDI test T1.4.*

- **WAV source**: Default piano.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Same as T1.4. No special audio
  considerations.

### Tier 2 — Design-probe tests

#### T2.1-A — Fast arpeggio with overlap (audio)
*Corresponds to MIDI test T2.1.*

- **WAV source**: Default piano.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Critical test for
  AudioInterpreter's onset-density handling. 50 ms between attacks
  is at or near the limit of what onset detection can reliably
  distinguish from a single attack.

#### T2.2-A — Slow arpeggio (audio)
*Corresponds to MIDI test T2.2.*

- **WAV source**: Default piano.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Tests that release detection is
  responsive enough to make the no-overlap scenario observable.
  Piano notes naturally decay, so AudioInterpreter must use
  amplitude threshold or some other release-detection mechanism.

#### T2.3-A — Slow arpeggio resolving to held chord (audio)
*Corresponds to MIDI test T2.3.*

- **WAV source**: Default piano. C4 sustained, E4 added, G4 added.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Critical for testing AudioInterpreter's
  ability to detect onsets *while other notes are sustaining*. This
  is fundamentally harder than detecting onsets in silence — the
  E4 attack must register over the still-sounding C4.

#### T2.4-A — Repeated single note (audio)
*Corresponds to MIDI test T2.4.*

- **WAV source**: Default piano.
- **Tolerances**: Defaults.
- **Audio-specific notes**: Tests that re-attacks of the same pitch
  are detected as discrete onsets. Piano re-attacks have a clear
  amplitude spike; pitch-tracking continuity should not suppress
  them.

#### T2.5-A — Sustained chord with melody on top (audio)
*Corresponds to MIDI test T2.5.*

- **WAV source**: Default piano. Bass triad held for 5 seconds with
  melody played on top.
- **Tolerances**: Onset timing ±50 ms for the bass triad's
  near-simultaneous attacks.
- **Audio-specific notes**: This is the hardest audio test.
  AudioInterpreter must detect higher-register melody onsets while
  bass triad notes are still sustaining. Polyphonic pitch tracking
  is harder than monophonic; this test exercises that. If
  AudioInterpreter's pitch detection is monophonic-only, it will
  miss the melody and this test will fail in a characterizable
  way.

### Chord-state tests

#### C.1-A through C.6-A
*Pending audio-corpus entry.*

Most of these correspond cleanly to their MIDI counterparts with
default piano rendering. C.4-A (inversion) is interesting because
it tests the same root-identification dependency that C.4 does —
if `chord-resolver` mis-identifies inversions, both tests fail in
parallel.

### Dyad escalation tests

#### D.1-A through D.5-A
*Pending audio-corpus entry.*

D.5-A (sustained major third does not escalate) is interesting in
the audio context because piano major thirds have specific
timbral characteristics — the classifier should not misinterpret
the timbral richness as "this is a chord."

### Real-world musical tests

#### M.1-A — Super Mario Bros. Ground Theme, measure 10 (audio)
*Corresponds to MIDI test M.1.*

- **WAV source**: Default piano. MIDI source transcribed from score
  (pending). Rolled chords as notated.
- **Tolerances**: Defaults.
- **Audio-specific notes**: The rolled-chord rendering depends on
  Logic's MIDI interpretation of the rolls. Verify the rendering
  matches the intended timing (~80 ms within-roll, ~150-200 ms
  between rolls) before treating the test as authoritative.

### Tier 3 — Known-hard cases

#### T3.1-A through T3.3-A
*Pending audio-corpus entry. Same expected-failure status as MIDI
counterparts.*

---

## Audio test harness requirements

The audio harness extends the MIDI harness with:

1. **Audio playback into Web Audio.** WAV files are loaded and
   played through an `AudioBufferSourceNode` connected to the same
   analyser node AudioInterpreter consumes from in production. This
   ensures we're testing the production audio path.
2. **AudioInterpreter activation.** AudioInterpreter is initialized
   with the test's analyser before playback begins.
3. **Event capture.** Same as MIDI harness — capture classifier
   output. Additionally, capture AudioInterpreter's published
   events for diagnostic purposes (so failures can be attributed
   to interpreter vs classifier).
4. **Synchronization.** Test timing is anchored to playback start.
   AudioInterpreter event timestamps must be relative to playback
   start, not wall-clock, for comparison with expected values.
5. **Tolerance application.** Comparison logic applies per-test
   tolerances when checking AudioInterpreter event timing/pitch.
   Classifier output comparison uses MIDI test's exact expected
   values.

Implementation is deferred until MIDI corpus passes. See "Build
progress" in the design doc.

---

## Future work

### §1. Realistic-input testing
The default render settings produce idealized audio (clean piano,
no noise, no room ambience). Real users play through microphones in
real rooms with real instruments. Robustness to that messier input
is a separate concern.

Trigger to pick up: when the idealized corpus is passing and
AudioInterpreter ships to real users, real-world failure modes will
surface. Build a "realistic" audio corpus then, with WAVs recorded
through actual mics in actual rooms.

### §2. Multi-instrument coverage
The default piano covers the common case but not all cases.
Specifically:
- **Guitar tests**: sympathetic vibration, harmonic content, very
  different attack envelopes from piano.
- **Voice tests**: pitched audio with no clear attack; release
  detection becomes critical.
- **Synthesized tones**: pure waveforms; tests AudioInterpreter on
  signals very different from acoustic instruments.

Each of these adds rendering work and reveals AudioInterpreter
behavior on signals it might not have been tuned for.

Trigger to pick up: when piano tests pass and we want to verify
AudioInterpreter's generalization.

### §3. Microphone vs line-in vs file
The audio test harness loads WAV files. Production AudioInterpreter
also handles live microphone input and audio interface (line-in)
input. There may be subtle differences in signal characteristics
(noise floor, latency, gain staging).

Trigger to pick up: when file-based tests are stable and we want
to verify the production live-input path. May not need its own
corpus — could be a smaller verification suite that confirms file
and live-input produce equivalent classifier output for the same
musical content.

---

## Change log

### 2026-05-06 — Initial audio corpus structure
Defined audio corpus's relationship to MIDI corpus (parallel
structure, audio downstream of MIDI). Established WAV generation
conventions (Logic Pro source, default piano, deterministic
render). Defined tolerance conventions for AudioInterpreter
timing/pitch variance.

Sketched audio entries for Tier 1 and Tier 2 tests with notes on
audio-specific concerns (release detection, onset density,
polyphonic pitch tracking). Other tiers marked as *Pending
audio-corpus entry.*

Documented "MIDI corpus passes before audio implementation begins"
as a sequencing rule in the working agreement. Listed three future
work items: realistic-input testing, multi-instrument coverage,
microphone/line-in vs file-input verification.
