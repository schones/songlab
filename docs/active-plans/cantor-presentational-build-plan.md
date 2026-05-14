# Cantor Presentational — Build Plan

**Status:** Active
**Started:** 2026-05-14
**Companion to:** `docs/cantor-presentational-design.md`
**Branch strategy:** Spike work lives on `cantor-presentational-spike`
(off dev). Production work proceeds on a new feature branch off dev
once the spike-to-production promotion happens (Session 1).

## Context

The chord/melody classifier arc (`chord-melody-research`) was paused
on 2026-05-13 in favor of a presentational approach to cantor:
lit Tonnetz triangles for sounding triads, dynamic per-note glyphs
with radial octave offset and velocity-scaled size, harmonograph-style
particle sparkle, color by triad quality. Validated live on the
Launchkey 49 with real music. See `docs/cantor-presentational-design.md`
for philosophy and mechanisms.

Spike artifacts on `cantor-presentational-spike`:
- `static/shared/cantor-presentational-view.js` (~new module)
- `templates/cantor-spike.html` (~new template, route-less for now)
- ~1,123 lines total, single commit.

## Spike-to-production approach

**Hybrid promotion (decided 2026-05-14):** the spike code is the
basis for production, but goes through a single up-front cleanup
pass before any polish or feature work. The spike is too valuable
to throw away (working, played-through code) but likely has rough
edges that are easier to fix in one focused pass than to keep
working around.

## Sessions

### Session 1 — Cleanup pass and promotion

Goal: spike code lands on a clean feature branch off dev, with
spike-isms removed and module/template names production-appropriate.

Start with a read-and-report Claude Code prompt against
`static/shared/cantor-presentational-view.js` and
`templates/cantor-spike.html`. Findings to surface:
- File and module naming (drop `-spike` suffixes, decide final names)
- Any hardcoded values that should be configurable
- Module boundaries (does view.js do too many things?)
- Comments or TODOs that mark spike-only decisions
- Dependencies on anything that isn't on dev
- Route registration in `app.py` (the spike has no route yet)

Then a build prompt that performs the cleanup and lands the result
on a new branch off dev (suggested: `cantor-presentational`). Do
not merge to dev yet — Sessions 2+ happen on the feature branch.

### Session 2 — Polish pass

Goal: address rough edges noticed during live play that didn't
make the spike. Specifics deferred until Session 1 lands and the
view can be re-exercised in its cleaned-up form. Likely candidates:
- Parameter tuning (sparkle density, octave-offset radius, velocity-
  to-size curve, color saturation by quality)
- Triangle lighting edge cases (extended chords lighting multiple
  triangles — confirm reads cleanly across the full chord vocabulary)
- Glyph behavior at extreme registers (very high, very low MIDI)
- Anything jarring that surfaced during the spike's Launchkey play

### Session 3 — Audio path verification with Scarlett

Goal: confirm the audio path works as cleanly as the MIDI path.
The spike was validated on MIDI. Audio (Scarlett 2i2 → AudioInput
→ YIN → MusicalEventStream → presentational view) is wired but
needs deliberate exercise. Test material: same set used for the
spike (Stressed Out, Jupiter's Faerie, 12-bar blues, voice-leading
test) but via mic/instrument input rather than keyboard.

Polyphonic detection is **out of scope** for this build plan. It's
a separate downstream arc (see RADAR.md). Monophonic YIN is the
expected limitation here.

### Session 4 — Full audio interface input integration

Goal: build the audio interface input experience for the
presentational cantor view. Scope deferred until earlier sessions
land — likely includes device selection UI, input level monitoring,
clear affordances for "you are now driving the view with your
voice/instrument" state. Session 3's verification feeds this:
known-working wiring is the floor, this session is the feature
work on top of it.

Specifics intentionally left thin here; the planning conversation
for this session happens at its start, not now.

### Session 5 — Merge to dev

Goal: feature branch merges to dev. Route registered (decide
final URL — `/cantor` replaces the existing implementation, or
a new path like `/cantor-presentational`?). SESSION_LOG and
STATUS updated accordingly. The existing cantor v1 implementation
needs an explicit fate (archived? removed? kept as a separate
route?) — decide before merge.

## Open questions for later sessions

- Final route path (`/cantor` vs. something else)
- Fate of existing cantor v1 implementation at merge time
- Whether the cleanup pass should also extract any of the spike's
  general-purpose pieces (e.g. glyph rendering) into the shared
  layer for reuse by other views

## Out of scope

- Polyphonic audio detection (separate arc; tracked in RADAR.md)
- Gamification of cantor (separate strategic question; see
  upcoming code-review/gamification brainstorm)
