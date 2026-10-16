# Voicing Explorer — explainer content (Session 6.5)

Status: planning + first draft. Nothing here is verified yet.

## Approach

- **Info pills per panel** with the relevant reasoning, linking out to
  fuller pages. Err on the side of more detail.
- **Two kinds of content, checked differently:**
  - *Tool topics* — how the page works. Drafted by Claude Code from the
    code; checked against the page's behavior. Numbers pulled from code
    constants (`TENSION_WEIGHTS`, `OCTAVE_DISCOUNTS`, `ARP_STEP_MS`,
    `LEAD_IN_MAX_BEATS`, `DEFAULT_MAX_SPAN`, …) so the text stays true
    when they're tuned.
  - *Theory topics* — music theory. Drafted in planning chat, written as
    checkable claims, verified against Levine (*The Jazz Theory Book*
    for chord qualities, extensions, chord–scale questions; *The Jazz
    Piano Book* for shells, voicing shapes, register). Paraphrase in our
    own words; cite the book as further reading; never copy its text.
- **Mark heuristics as heuristics.** The melody rule, tension weights
  and ranking are design choices, not rules of music.
- **Public examples only in published text.** The private piece is
  gitignored, so public users can't load it. Private bars are where the
  topic was heard and can be used for verification; the published
  version uses the rag, the synthetic fixture, Habanera (later), or a
  small constructed example.
- **Only explain what the tool actually shows.**

## Tool topics

| Panel | Topic |
|---|---|
| Chart | How tension is scored: interval classes and weights, compound-interval discounts, 9ths as color rather than rubs, melody scored by time overlap |
| Selected bar | Roles in the data: comp, bass (lowest note, with lookback), melody; transcribed vs arranged; derived chord symbols |
| Named vs played | "Left out" and "added" against the chord symbol |
| Play / melody toggle | Bar vs event playback, one-beat lead-in, rolled chords, event bass from its real onset, why melody off also mutes |
| Explore | Tone pool, harvested shapes as "your vocabulary", melody rule (heuristic), piece ceiling, ranking (target, buckets, motion), Keep as non-destructive |
| Keyboard / Tonnetz | Role colors, range per piece, why the Tonnetz stays comp-only |

## Theory topics

| # | Topic | Heard in (private piece) | Public example |
|---|---|---|---|
| T1 | Chord tones and roles; slash chords | bar 2 (Gm7/F) | rag, constructed |
| T2 | Guide tones and shells: the 3rd and 7th define the chord | bar 21 (A–E♭ shell over F) | constructed C7, F7 |
| T3 | Extensions: which chords take 9, 11, 13 | bar 21 (G–D–E♭) | constructed |
| T4 | Omitting tones: what's safe to drop, what changes the chord | bar 21 (no 3rd fine, no 7th not) | constructed |
| T5 | ♯11 on dominants (Lydian dominant) — *hypothesis, verify* | bar 21 (A–B–D vs shell) | constructed |
| T6 | Why some intervals rub; register and low interval limits | bar 21 (low ♯11 vs root) | constructed |
| T7 | Voice leading, and why less motion isn't always better | bar 21 ranking | rag |
| T8 | Voicings as shapes: cluster, shell, pair over slash bass | bars 1, 2, 14, 15, 16 | constructed |
| T9 | Melody against harmony: top-voice salience; solo piano vs vocal | bar 16 (melody rubs) | rag, Habanera later |

T2 is the foundation: T3–T5 build on it.

---

## T2 — draft (unverified)

### Guide tones: the two notes that tell you what a chord is

A seventh chord has four notes: root, 3rd, 5th and 7th. They don't all
carry the same information.

The **root** and **5th** are shared by most common seventh chords.
C major 7, C7 and C minor 7 all have C and G. Hear just those two and
you can't tell which chord it is.

The **3rd** and **7th** are what change. Together they spell out the
chord's quality:

| Chord | 3rd | 7th | Sound |
|---|---|---|---|
| Major 7 (Cmaj7) | major (E) | major (B) | settled, bright |
| Dominant 7 (C7) | major (E) | minor (B♭) | restless, wants to move |
| Minor 7 (Cm7) | minor (E♭) | minor (B♭) | mellow, darker |

These two notes are called **guide tones**. In a dominant chord they
form a tritone (E to B♭ in C7), the tension that makes the chord want
to resolve.

### Shells: the smallest voicing that still says the chord

Because the guide tones carry the chord's identity, you can play just
them over the bass and the chord comes through. This is a **shell
voicing**: root in the bass, then 3rd and 7th above, in either order:

- C2 bass, E3 and B♭3 above (3rd below the 7th)
- C2 bass, B♭3 and E4 above (7th below the 3rd)

The 5th is left out, and it's rarely missed. That economy is the point:
a shell leaves room for a melody on top and for extensions (9ths,
13ths) to be added as color — the next topic.

### What happens when a guide tone goes missing

Dropping the 5th is almost always safe. Dropping a guide tone is
different: without its 7th, C7 can stop sounding like a dominant at
all. Leaving out the 3rd is often fine when the 7th is there; the chord
turns more open and ambiguous, but it keeps its character.

**Hear it in Explore:** pick a dominant chord and look for the candidate
that's just the bass plus the 3rd and 7th. Then compare it with a
candidate missing the 7th.

*Further reading: Mark Levine — cite whichever book supports this
section after verification.*

### Claims to verify

1. [ ] The 3rd and 7th define a seventh chord's quality; the root and
   5th are shared across chord types.
2. [ ] The 3rd and 7th are called "guide tones".
3. [ ] In a dominant 7th, the 3rd and 7th form a tritone, and that
   tritone is the source of its pull to resolve.
4. [ ] A shell voicing is the root plus 3rd and 7th, in either order,
   with the 5th omitted. (Likely in *The Jazz Piano Book*.)
5. [ ] The 5th is the most expendable chord tone.
6. [ ] Omitting the 7th can change a dominant's identity, while
   omitting the 3rd (7th present) keeps more of the chord's character.
   *Least certain — came from bar 21 listening.*
7. [ ] Shells leave room for melody and extensions. *Framing; check it
   matches Levine's reasoning.*

### Possible additions, if Levine covers them

- Shell voicings' association with Bud Powell.
- Guide tones moving by step through a ii–V–I (e.g. Dm7–G7–Cmaj7:
  F→F→E and C→B→B). One of the most useful ideas in the topic.
