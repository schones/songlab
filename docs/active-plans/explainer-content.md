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

## Session 6.5 — decisions and build state

Recorded 2026-10-19 after P2 landed (commit db3d6b5). The two blocks
below are the P1 prompt, verbatim.

### Decisions (from the P1 prompt)

```
DECISIONS
1. Storage: Option B. JS registry static/shared/voicing-explainer-content.js,
   Markdown-subset bodies in template strings, constants imported (never
   copied), rendered by static/shared/mini-markdown.js. Pages and pills
   consume the same registry.
2. Namespace: /learn/<slug> (new route + templates/learn/topic.html).
   Existing /intro/N and /theory/* pages are registered as external
   targets ({ kind: 'page', url, title }) so see_also can point at them.
3. Theory pill = a DOCKED, collapsible "Theory" card in the Selected-bar
   column, always visible, re-rendered from renderPanels. Panel pills
   stay small anchored popovers ("how to read this panel").
4. Focus = selected event, or the previewed candidate (click or [ ]).
   No hover state.
5. Shape: small degree-set catalogue (shell R–3–7 / R–7–3, rootless
   A-form 3–5–7–9, B-form 7–9–3–5), fallback to the plain degree list.
   Never surface the private piece's SHAPE_NAMES in published text.
   Catalogue is claude-draft.
6. Motion: voiced-neighbour definition (eventContext), and the section
   names what it compares against ("from bar 4, event 2"). Add bass to
   the neighbour ref.
7. Constant exports + TARGET_STEP extraction: approved, additive only.
8. Nav: flat "Voicings" link in base.html and explorer.html's own nav.
```

### Content rules (from the P1 prompt)

```
CONTENT RULES
- status enum: stub | claude-draft | verified | own-words.
  Disclaimer for claude-draft: "Info from Claude — verify before
  relying on it." Rendered from status, in pills, the card and pages.
- Facts vs heuristics are a field (kind), styled distinctly.
- Err toward more detail. Public examples only (rag, fixture,
  constructed). I'll rewrite blurbs later.
```

### Build order

One prompt each; stop after each for review.

- **P1 content foundation — done.** Additive exports in
  voicing-analysis.js (INTERVAL_KEYS, COMPOUND_LABELS, SUFFIX_TO_TYPE,
  STEP_DEGREE), voicing-explore.js (TARGET_STEP extracted and used at
  every former 0.5 site, EXPLORE_ROWS, MIN/MAX/DEFAULT_COUNT,
  FALLBACK_CEILING, DEGREE_CLASS, EXTENSION_SEMIS, targetDistance),
  voicing-player.js, voicing-playback-model.js, voicing-staff.js;
  new `static/shared/mini-markdown.js` (28/28) and
  `static/shared/voicing-explainer-content.js` (33/33; 25 topics:
  15 claude-draft, 10 stub; 10 external targets; 56 glossary terms;
  T2 moved in). Engine suites unchanged: 64 / 76 / 70 / 95.
- **P2 info-pill.js + /learn — done.** New `static/shared/info-pill.js`,
  `static/shared/learn.css`, `templates/learn/index.html`,
  `templates/learn/topic.html`; routes `/learn` and `/learn/<slug>` in
  app.py; pill demo section on `templates/test-shared.html`. Follow-ups:
  `melody-rule` split into its own topic, constructed C7 shell example
  added to guide-tones-and-shells. Nothing on /voicings changed. All six
  suites pass: 64 / 76 / 70 / 95 / 28 / 33.
- **P3 panel pills on /voicings** — mount one pill per panel header via
  `topicsForPanel(panelId)`; Escape precedence verified against the
  page keydown handler (Stop / clear preview).
- **P4 voicing-describe.js** — `describeVoicing` pure function;
  `shapeKey` refactor; bass added to `voicedNeighbours` refs; degree-set
  shape catalogue (decision 5).
- **P5 docked Theory card** — Selected-bar column, collapsible, re-rendered
  from `renderPanels`; "why ranked" section needs a `rankKey` export from
  voicing-explore.js.
- **P6 nav + Salamander attribution + docs** — flat "Voicings" link in
  base.html and explorer.html; Salamander Grand Piano attribution where
  the player is documented; STATUS / SESSION_LOG / RADAR.
- **Then:** abbreviated tuning step, dominant rule only (♯11 requires
  3rd + ♭7; 13 requires ♭7), and merge `voicing-explorer` to `dev`.

### Registry shape (as built)

Topic entry in `TOPICS`:

```
{ title, status, category: 'tool' | 'theory', kind: 'fact' | 'heuristic',
  panel?, see_also: [slug | externalKey], summary, body, notes? }
```

- `category` says what the topic is about: `tool` = how the /voicings
  page works (one per panel, plus chord-symbols, roles-in-the-data,
  explore-ranking, melody-rule); `theory` = music. `kind` says how to
  trust it: `fact` is derived from code or standard definitions,
  `heuristic` is a scoring rule or rule of thumb. They are independent
  fields; e.g. tension-scoring is tool + heuristic, staff-panel is tool
  + fact.
- `panel` is one of `PANELS` (chart, melody, play, selected, staff,
  tonnetz, rubs, nvp, explore, keyboard) and is what P3 mounts by.
- `notes` is a private field for verification checklists and sources
  (T2's claims-to-verify live there). It is never rendered: not in
  pills, not on /learn, not in the card. selfTest does not check it.
- `status` drives `DISCLAIMER[status]`: stub → "Not written yet — this
  page is a placeholder so links resolve."; claude-draft → "Info from
  Claude — verify before relying on it."; verified and own-words → none.
- `EXTERNAL[key] = { title, url }` for /intro/1–6 and the four
  /theory/* pages. `GLOSSARY[term] = slug`.
- Bodies are Markdown-subset template strings; numbers come from
  imported constants through `fmt` (≤3 decimals) and `frac` (2/3 as a
  fraction) and generated tables (TENSION_WEIGHTS × OCTAVE_DISCOUNTS,
  SUFFIX_TO_TYPE sorted by interval count).

Lookup API:

- `getTopic(slug)` → raw entry or null.
- `resolveSlug(slug)` → `{ kind:'topic', slug, title, url, status }` or
  `{ kind:'page', key, title, url }` or null.
- `resolveLink(target)` → mini-markdown link resolver: topic slug →
  `/learn/<slug>` with class `learn-link` (`learn-link--stub` added for
  stubs), EXTERNAL key → its url, `/path` and `http(s)://` pass through,
  anything else drops to plain text.
- `glossaryLookup(term)` → `resolveSlug` result, case-insensitive.
- `renderTopic(slug)` → everything a pill, page or card needs:
  `{ slug, title, status, disclaimer, category, kind, panel,
  summaryHtml, html, seeAlso[] }` (`seeAlso` entries are `resolveSlug`
  results, so external pages are included).
- `topicsForPanel(panel)` → slugs whose `panel` matches.
- `selfTest()`: every status valid, every see_also / glossary slug
  resolves, every body renders with no "undefined" / "NaN", notes not
  rendered, generated tables contain the live constants.

### InfoPill API (as built)

```
import { InfoPill } from '/static/shared/info-pill.js';
const pill = InfoPill.mount(anchorEl, {
  slug,            // registry slug, or
  content,         // { title, status?, disclaimer?, kind?, summaryHtml, seeAlso?, url? }, or
  render,          // () => slug | content, called on every open
  label,           // optional text next to ⓘ ("Learn"); icon-only when omitted
  position,        // 'append' (default) | 'after'
  onOpen, onClose,
});
pill.setContent(slugOrContent); pill.open(); pill.close(); pill.toggle();
pill.destroy(); pill.isOpen;
```

- Popover shows title, status disclaimer, kind + status badges, the
  summary, see-also chips (stub chips dashed, page chips marked ↗) and
  "Read more →" to `/learn/<slug>` in a new tab. Never the body.
- Trigger is a `<button aria-haspopup="dialog" aria-expanded>`; the
  popover is `role="dialog" aria-modal="false"`, appended to body and
  fixed-positioned below the trigger (shifts or flips to stay in the
  viewport; repositions on scroll / resize). Under 700px it is a
  full-width bottom sheet.
- Focus moves into the popover on open and returns to the trigger on
  close only if it was still inside (so an outside click on a control
  keeps that control's focus). One pill open at a time.
- The module injects its own CSS and a `<link>` to
  `/static/shared/learn.css`, so it works on pages that do not extend
  base.html (explorer.html).

**Escape precedence.** The pill adds a capture-phase `keydown` listener
on `document` only while it is open and removes it on close. While
open, Escape calls `preventDefault()` and `stopImmediatePropagation()`
and closes the pill, so the page's bubbling handler never sees it. When
no pill is open there is no listener at all, so the /voicings keydown
handler (Stop playback, clear preview) keeps its current behaviour
untouched. Outside `mousedown` is handled the same way (capture, only
while open).
