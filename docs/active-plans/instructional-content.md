# Instructional content — plan

Written 2026-10-19 after the Voicing Explorer merge to dev (`df0e2fc`).
Scope: the theory topics behind /voicings, delivered through the /learn
registry (`static/shared/voicing-explainer-content.js`). Status of the
topics is tracked by the registry itself (`/learn#status=claude-draft`
is the worklist).

## Phase 0 — example block

An EXAMPLE BLOCK for /learn topic bodies: one line in the Markdown body
(a fenced block or an `[[example ...]]` syntax, to decide) that renders

- a mini keyboard plus a small staff, with ▶ play (reuse the Salamander
  player and the playback model: `voicing-player.js`,
  `voicing-playback-model.js`);
- an optional label and degree annotations;
- an optional "see it in a piece" link opening /voicings at a bar and
  event. Check whether /voicings supports bar/event deep links today
  (it takes `?piece=` and `&melody=1`); add them if not.

Pages only: pills keep showing summaries. Example voicings are
validated in a `selfTest` so notes, degrees and labels can never
disagree.

## Phase 1 — theory stubs, in dependency order

About 2–3 topics per session:

1. Chord tones, degrees and roles (T1)
2. The tritone
3. Guide tones and shells (T2) — revise the existing draft
4. Extensions (T3)
5. Omitting tones (T4)
6. Rootless voicings and A/B forms (incl. dominant 3–13–♭7–9 and
   ♭7–9–3–13)
7. Voicings as shapes
8. ♯11 on dominants (T5)
9. Register and low-interval limits (T6)
10. Voice leading (T7)
11. Melody against harmony (T9)

## Phase 2 — later

- Register the /intro and /theory pages in the /learn index.
- Decide whether `theory-content.js` is absorbed into the registry.

## Per-topic workflow

1. Drafted in the planning chat as a page plus a numbered claims list
   (Levine chapter noted where confident).
2. Dustin verifies the claims against Levine (*The Jazz Theory Book*;
   *The Jazz Piano Book* on order).
3. Claude Code implements: text into the registry, examples computed in
   code, the claims checklist in the topic's `notes` field.
4. Status flips to `verified` (all claims checked) or `own-words`
   (rewritten). `/learn#status=claude-draft` is the worklist.

## Page template

what it is → hear it (examples) → in a real piece (rag or fixture
link) → common confusions → try it (Explore or a game) → sources.

## Content rules

- Own words, book cited; never copy Levine's text or musical examples.
- Constructed or public-domain examples only.
- The private piece never appears in published text.
- Heuristics are labelled as heuristics (the registry's `kind`).

## Proposed defaults — NOT YET CONFIRMED

- A. Stubs first (Phase 1); broader fundamentals later.
- B. New content goes only in the /learn registry.
- C. Theory drafted in the planning chat; Claude Code formats and wires.
- D. Per-claim verification, checklist kept in each topic's `notes`.

## Open / RADAR highlights (as of 2026-10-19)

- Unverified, on the Levine list: the shape catalogue (especially the
  dominant A/B rows), the T2 claims, the dominant-rule wording.
- Private piece data under `static/` is directly fetchable — move
  before any shared deploy.
- Rag bars 16–17: the late-bar bass dyad never becomes a comp event.
- Register-by-degree, 0.5 ranking cliffs, piece ceiling — open.
- Tonnetz and staff do not scale on wide screens; tablet layout.
