# Cantor Presentational — Design

> Companion docs (forthcoming):
> - `docs/active-plans/cantor-presentational-build-plan.md` — the
>   project-management layer (sequencing, sessions, risk tracking).
>   This doc owns the *content*; that doc owns the *sequencing*.
>
> Related but distinct:
> - `docs/chord-melody-classification.md` — the *paused* classifier
>   arc that this design replaces as cantor's strategy. The
>   classifier may still be useful for other SongLab features
>   (chord/key detection downstream, voicing explorer); the
>   pause is specifically about cantor's visualization, not about
>   the classifier as a general piece of infrastructure.

---

## Status

**2026-05-13** — Created. Pivoted from the chord/melody classifier
arc after a spike validated the visual approach in roughly one hour
of focused build + Launchkey playback. Spike artifacts on
`cantor-presentational-spike` branch (commit `eb0d33a`):
`templates/cantor-spike.html`, `static/shared/cantor-presentational-view.js`,
route in `app.py`. This doc captures the design that the spike
embodied, makes the philosophical framing explicit, and bounds
what the production version is and isn't.

---

## The vision

A visual interpretation of music. Chords of different flavors
displayed distinctly as substrate. Melody living above as glyphs
that respond to register, velocity, and decay.

The substrate shows *harmonic structure* — what chord shapes are
present in the sounding set. The glyphs show *voice* — which
specific notes are being played, at what register, with what
energy. The two layers coexist on the same Tonnetz lattice,
which itself provides the geometric framework that ties pitch
to position.

The viewer plays music; the visualization shows what's happening
in the music; the viewer's ear and eye together complete the
interpretation. No labels. No classification announcements. The
visualization gets out of the way.

---

## Design philosophy: presentational, not interpretive

The central organizing principle, and the one piece of this design
worth repeating before every implementation decision:

**The visualization presents the data; it does not interpret it.**

A presentational system answers "what notes are sounding right
now, and what intrinsic harmonic structure does the sounding set
have given the geometry of the Tonnetz?" An interpretive system
answers "what *chord* is being played, what is its *root*, what
*role* does it play in the music?" Cantor is the first; the
chord/melody classifier was the second.

The distinction matters because interpretation is hard *and the
hard parts don't help the visualization.* The chord/melody
classifier had real subtlety — chord-state machinery, dyad
escalation, declared-vs-implied, melody-on-top, voice-leading
forcing functions — and three out of every four of those rules
existed to handle edge cases that, on inspection, the
presentational approach handles by *not making the claim that
forced the edge case in the first place*.

A fast melodic run that happens to outline C-E-G isn't
mis-classified as a chord under the presentational approach; it
*lights the C-major triangle briefly* as the three pitch classes
pass through the sounding set. That isn't an error to be fixed —
it's an honest representation of what's happening musically.
The viewer sees a triangle flash and reads it correctly because
the surrounding context (the run continuing past those three
notes, the lack of sustain, the absence of velocity stress) tells
the ear that this is melody, not chord.

This is *correct by construction*. There is no T3.1 problem
(fast melodic figure outlining a chord shape) under the
presentational approach because the visualization doesn't claim
to know what is and isn't a chord. There is no T3.2 problem
(two-voice counterpoint harmonizing into triads) because lit
triangles don't claim to be chords. There is no T3.3 problem
(drone with implied harmony) because the visualization is honest
about what's sustaining and what isn't.

The corollary: when the viewer's brain *can't* do the
interpretation alone, the visualization can't help them. The
presentational approach is an admission of where the work
belongs. It belongs in the listener.

---

## Why the Tonnetz makes this work

The Tonnetz already encodes chord shapes geometrically. This is
the property the presentational approach leverages and the
classifier approach was redundantly re-deriving.

A Tonnetz triangle's three vertices represent three pitch
classes related by P5 / M3 / m3. Every upward-pointing triangle
is a major triad (root, M3, P5). Every downward-pointing
triangle is a minor triad (root, m3, P5). This is *intrinsic to
the lattice*, not derived from analyzing the sounding set.
Coloring upward triangles warm and downward triangles cool is
just rendering a property the lattice already has.

When all three vertex pitch classes of a triangle are in the
sounding set, that triangle is "lit." This is a set-membership
check — no interpretation, no chord identity, no root selection.

The consequence is beautiful: **a single sounding set can light
multiple triangles.** A Cmaj7 (C, E, G, B sounding) lights *both*
the C-major triangle (vertices C, E, G) *and* the E-minor triangle
(vertices E, G, B), because {E, G, B} ⊂ sounding-PCs. The
visualization expresses extended harmony as overlapping triangle
illumination, which is *more harmonically truthful* than picking
one chord identity and labeling it "Cmaj7."

This generalizes. A C9 (C, E, G, Bb, D) lights the C-major
triangle, the G-minor triangle (G, Bb, D), and depending on
voicing potentially others. Dominant 7ths, half-diminished 7ths,
sus4 chords with added tones, ambiguous-by-voicing chords — all
express through the *spatial pattern of lit triangles*, not
through a single identity assignment.

This also gracefully handles the kind of ambiguity that the
*probabilistic chord interpretation* thread (see
`voicing-explorer-spec.md` Future Directions) was reaching for.
A sus4 voicing that's ambiguously interpretable as a sus2 of a
different root doesn't need a likelihood distribution under the
presentational approach — both interpretations express
spatially through the lit triangles they activate. The
visualization shows both; the listener picks.

---

## Core mechanisms

The visualization has four layers, each with a single
responsibility. Each layer is computable from the sounding set
without interpretation.

### Layer 1: Substrate (the lattice itself)

The Tonnetz lattice rendered as nodes and edges. Canonical
orientation per existing cantor conventions (P5 horizontal,
M3 up-right, m3 down-right) projected onto a 3D toroidal layout
with slow rotational drift. The 3D projection serves a single
visual purpose: depth and motion to keep the lattice from
feeling static. Back-face attenuation dims lattice elements on
the far side of the torus.

The substrate is invariant to what's being played. It's the
spatial framework everything else lives on.

### Layer 2: Lit triangles

For each triangle in the lattice, check whether all three vertex
pitch classes are in the current sounding-PC set. If yes, fill
the triangle with a color and alpha.

Color is determined by the triangle's intrinsic *geometric type*
(major or minor), not by anything derived from the sounding set.
Major triangles render in a warm tone (gold-leaning); minor
triangles render in a cool tone (blue-leaning). This is a static
property of each triangle, fixed at lattice construction.

Per-triangle back-face attenuation is applied to the fill alpha
so that triangles on the far side of the torus dim correspondingly
with the substrate.

No state, no transitions, no chord-state machinery. Set membership
on the sounding-PC set, computed each frame.

### Layer 3: Glyphs per sounding note

For each MIDI note currently sounding (i.e., attacked and not yet
released, *or* released within the last ~300ms of decay), render
a glyph.

**Position.** The glyph sits at the lattice instance of the
note's pitch class closest to the canvas center, offset radially
outward from the visual center by an amount proportional to
octave above C4. C4 sits at the lattice point. C5 sits a small
offset radially outward. C6 sits twice that. C3 sits an
equivalent amount radially *inward* of the lattice point.

The radial direction is determined by the geometry: the vector
from the canvas center to the lattice point, normalized,
multiplied by `(octave - 4) * step`.

This means register reads as visual eccentricity. Bass notes
cluster near the canvas center, mid-register notes sit at the
lattice points, treble notes radiate outward. Glissandi visibly
travel.

**Size.** Scales with MIDI velocity. Linear scaling around a
base size at moderate velocity; soft notes are visibly smaller,
hard notes visibly larger. The dynamic range is part of what
makes the visualization respond to *playing*, not just to *notes
being on or off.*

**Sparkle.** A particle effect spawned from the glyph anchor.
Same family as the harmonograph sparkle but reimplemented for
the stationary-per-glyph case. Particles spawn at a conservative
rate while the note is sounding, inherit the glyph's color
(warm gold), follow a perpendicular-wiggle path with deceleration
and decay. On release, particle spawning stops; in-flight
particles age out naturally.

**Decay on release.** The glyph anchor's opacity fades
exponentially over ~200ms after release. The entry is pruned
from the sounding-notes map at ~300ms post-release.

### Layer 4: Particles

Owned by the glyph layer above. Implementation-level rather than
conceptual; called out separately because the particle pool is
a real shared resource (500-particle ring buffer) and any future
visual layer that wants to spawn particles (e.g. a bass Tonnetz
layer with its own glyphs) shares the pool.

---

## What's out of scope

This design *deliberately* does not include any of the following.
Including them would re-introduce interpretation work that the
presentational philosophy is rejecting.

**No chord classification.** The visualization never decides
"this is a C major chord" or "this is a Cmaj7." Multiple lit
triangles express extended harmony spatially; no single chord
identity is assigned.

**No chord-state machinery.** No declared vs implied state. No
"chord persists until root releases." No partial-release
inference. A triangle is lit if and only if its three vertex PCs
are currently in the sounding set. The moment one of those PCs
leaves the set, the triangle is unlit. No state to update, no
transitions to model.

**No chord-vs-melody distinction.** Glyphs are rendered for
every sounding note regardless of role. A sustained C-E-G with a
melody C5 above produces *four* glyphs (one per sounding MIDI
number) on top of a lit C-major triangle. There is no "the chord
is C-E-G and the melody is C5" claim; there are just notes
sounding and a triangle lit.

**No identity persistence.** A chord briefly broken (one note
released and immediately re-attacked) re-lights the triangle as
soon as the sounding set is restored. No special handling, no
hysteresis, no smoothing.

**No interpretation of velocity dynamics, sustain time, or
pitch-class doubling beyond direct visual encoding.** Velocity
maps to glyph size. Sustain time is implicit in how long the
glyph has been present. Doubling (C4 and C5 sounding together)
produces two glyphs, both at the same lattice point with
different radial offsets. No "stress" calculation, no "this is
emphasized," no semantic layer above the direct rendering.

---

## Known limitations as designed

These are not bugs. They are consequences of the design.

**Monophonic audio input.** The audio path uses monophonic YIN
pitch detection bridged into MusicalEventStream. A strummed chord
on a mic'd guitar produces a single dominant-pitch event stream,
not three simultaneous note events. Triangle illumination from
mic input is therefore rare and accidental — when decay tails of
sequential notes happen to overlap.

Polyphonic audio detection is a real future infrastructure
problem. The architectural swap point is in place (the pitch
detector behind input-provider's `mic_pitch` modality is the
only piece that changes); the implementation is not. CREPE Pro,
Basic Pitch, and chroma-features approaches are candidates.

For MIDI input (Launchkey, RD-2000 via USB, on-screen keyboard),
this limitation does not apply.

**Viewport bounds the visible lattice.** The lattice is finite
and the visible portion is finite. Notes whose pitch class is
in the visible lattice will produce glyphs; notes outside the
visible viewport are rendered at the edge or clipped. This is
the same constraint the existing cantor lives under.

**Visualization is informationally lossy in expected ways.** A
sustained C-E-G triad and a fast C-E-G arpeggio both light the
C-major triangle (one continuously, one as the notes pass
through). The visualization does not distinguish the two. A
listener distinguishes them; the visualization shows what is
factually sounding, which is enough.

**No accumulation of musical structure over time.** The
visualization is purely present-tense. There is no "this chord
progression is V-I"; there is no memory of the previous chord.
The only temporal element is glyph decay on release. Anything
that requires memory (chord progression visualization, harmonic
rhythm display, phrase boundary detection) is a separate
concern, possibly a separate visual layer with its own design.

---

## Relationship to the classifier arc

The chord/melody classifier (paused on `chord-melody-research`
branch, documented in `chord-melody-classification.md`) was an
*interpretive* approach to the same underlying problem cantor
was supposed to solve. It is paused, not closed. Several of its
artifacts remain valid as general SongLab infrastructure:

- **TempoState** (`static/shared/tempo-state.js`) — user-input
  tempo singleton with pub/sub. Useful for any feature that
  needs tempo state and isn't tied to Tone.Transport.
- **Chord-resolver power-chord template + self-tests**
  (`static/shared/chord-resolver.js`) — power-chord recognition
  plus the inversion handling and the inline self-test pattern.
  Used by Voicing Explorer and other consumers that need to
  resolve a sounding set to a chord identity (which the
  presentational cantor explicitly does not do, but other
  features will).
- **Parser extension on `regenerate-test-json.py`** — structured
  test specs for the chord-melody corpus. Remains valid if the
  classifier is ever revived, and the parser pattern (Markdown
  canonical, JSON derivative, strict regeneration) is reusable
  for other test corpora.

The classifier might also be useful for non-cantor SongLab
features — chord/key detection for educational content, voicing
explorer's harmonic analysis, gamification mechanics that need
"is the player playing the right chord." None of those use cases
are blocking; if and when they become active, the classifier
arc may resume with cantor explicitly out of scope as its
target consumer.

The relationship between the two approaches is **sibling, not
successor.** They solve different problems. Cantor presentational
solves "what is happening musically right now, shown directly to
the viewer." The classifier solves "what musical structure is
the player producing, expressed as labeled events." Both have
legitimate uses; cantor turned out to want the first, not the
second.

---

## Open architectural threads

These are not open questions in the "this design is incomplete"
sense. They are deferred decisions that don't block the current
build but should be revisited when triggered.

### Filtered subsets as independent visual layers

The lit-triangle and glyph layers both consume the *full*
sounding-PC set and the *full* sounding-notes map. A natural
extension is to introduce additional layers consuming *filtered*
subsets:

- A **bass Tonnetz layer** consumes only notes below some
  register threshold. Triangles light from this subset
  independently; glyphs render with their own visual treatment.
- A **recent-attacks layer** consumes only notes attacked within
  the last N milliseconds. Triangles flash briefly for clusters
  of recent onsets, regardless of sustain.
- A **sustained-only layer** consumes only notes held longer
  than some threshold. Triangles light only for the truly
  stable harmonic content, ignoring passing tones.

Each filter produces an independent layer. The general mechanism
is the same: filter the sounding-notes map, compute the lit
triangles or glyph positions from the filtered subset, render.
The shared infrastructure (lattice, particle pool, decay logic)
is reused.

This is conceptually equivalent to running multiple
presentational visualizations in parallel on the same input, each
focused on a different aspect of what's sounding. None of these
filters introduces interpretation; they just choose which slice
of the data to render.

When to build: each filter has its own use case, none currently
blocking. The bass Tonnetz layer is the most commonly imagined
extension (mentioned mid-pivot today as a "future, if useful"
addition). It can be added when it becomes a felt need; until
then, deferred.

### Per-source visual treatment

Every sounding-note publish carries a `source` tag (`'midi'`,
`'keyboard'`, `'audio'`). Currently no layer consumes the tag.
Future possibilities:

- **Source-distinct glyph color or particle behavior.** Audio-
  derived glyphs render in a slightly different tone than
  MIDI-derived ones, or with different sparkle dynamics.
- **Source-specific decay rates.** A guitar's natural decay is
  different from a piano's, different from a sustained synth.
  The presentational approach can honor that by tuning the
  glyph decay envelope per source.

When to build: when there's a felt need to distinguish input
modalities visually. Currently, all sources are visually identical
and that's fine.

### Polyphonic audio detection

The monophonic-only limitation of the audio path is real and
known. Promoting audio input to polyphony is its own arc — a
real research and integration problem, not a small change.

The architectural swap point is preserved. Whatever polyphonic
detector lands (CREPE Pro, Basic Pitch, chroma-features, custom)
will produce the same noteOn/noteOff event shape that
input-provider already emits for monophonic YIN. The bridge into
MusicalEventStream stays the same. The presentational view never
needs to know which detector is upstream.

When to build: real research project. Out of scope for cantor's
initial build. May be picked up when the monophonic limitation
becomes painful in practice.

### Spike-to-production path

The current spike at `/cantor-spike` is throwaway-quality code.
The production version may:

- **Replace the existing `/cantor` route** with the presentational
  view, retiring the `_splitPoint`-based original.
- **Coexist as a separate route** indefinitely, with `/cantor`
  remaining as the historical version.
- **Rebuild cleanly from this design doc**, using the spike as
  reference but writing the production code with full polish
  rather than mutating the spike.

This decision is for the build plan, not the design doc. Flagging
here because the design doc is silent on which file the
production code lives in.

---

## Change log

### 2026-05-13 — Doc created
Captures the design that the same-day spike validated. Vision,
presentational-vs-interpretive philosophy, four core mechanisms
(substrate, lit triangles, glyphs, particles), out-of-scope
explicit list, known limitations, relationship to the paused
classifier arc, open architectural threads. Parameter values
(alphas, octave offset, particle counts) deliberately omitted;
they live in code and will be tuned by ear, not by spec.
