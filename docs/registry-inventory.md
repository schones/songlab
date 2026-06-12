# Chord-Type Registry Inventory

**Status:** Draft (re-entry audit, 2026-06-11 — not yet reviewed)
**Branch surveyed:** `cantor` (registries are identical on `dev`
except where noted; one registry variant lives only on
`chord-melody-research`)
**Purpose:** Catalog every duplicated chord/theory data registry,
document discrepancies, and specify the single canonical JSON that
could replace them all.

---

## The registries

### 1. `static/shared/transforms.js` — `CHORD_TYPES` (lines ~162–187)

The de facto primary registry. Object keyed by type id.

```javascript
const CHORD_TYPES = {
  major:       { intervals: [0, 4, 7],     symbol: "",     name: "Major",      base: "major" },
  minor:       { intervals: [0, 3, 7],     symbol: "m",    name: "Minor",      base: "minor" },
  "half-dim7": { intervals: [0, 3, 6, 10], symbol: "ø7",   name: "Half-diminished 7th", base: "diminished" },
  sus4:        { intervals: [0, 5, 7],     symbol: "sus4", name: "Suspended 4th", base: null },
  // ... 18 entries total
};
```

- **Fields:** `intervals` (semitones from root, including
  extensions >12, e.g. add9 uses 14), `symbol` (display suffix),
  `name` (human-readable), `base` (triad quality for Tonnetz
  rendering; `null` for sus chords).
- **Covers (18):** major, minor, diminished, augmented, dom7, maj7,
  min7, dim7, half-dim7, minmaj7, sus2, sus4, 7sus4, add9, dom9,
  maj9, min9 (+ internal `_triadIntervals` helper duplicating the
  four basic triads).
- **Consumers:** `harmony-state.js`, `keyboard-view.js`,
  `walkthrough-sidebar.js`, `static/intro/ch4-beyond-triads.js`,
  `static/games/scale-builder.js`,
  `static/games/relative-key-trainer.js`.

### 2. `static/shared/chord-resolver.js` — `CHORD_TYPES` (lines ~31–48)

Priority-ordered array for resolving a PC set to a chord name.

```javascript
const CHORD_TYPES = [
  { quality: 'major', symbol: '',    intervals: [0, 4, 7],     priority: 1 },
  { quality: 'hdim7', symbol: 'ø7',  intervals: [0, 3, 6, 10], priority: 3 },
  // ... 14 entries total
];
```

- **Fields:** `quality`, `symbol`, `intervals` (sorted), `priority`
  (1 = triads, 2 = sus, 3 = sevenths; lower checked first).
- **Covers (14):** major, minor, dim, aug, sus2, sus4, dom7, maj7,
  min7, dim7, hdim7, minmaj7, **augmaj7, aug7** (last two exist
  nowhere else except the bubble-renderer color map).
- **Consumers:** `chord-bubble-renderer.js`, `chord-detection.js`,
  explorer display path.
- **Branch note:** on `chord-melody-research` only, this registry
  also carries a **power-chord template** (priority 4, with the
  documented constraint that it must not displace higher-priority
  matches — `[0,4,7]` still resolves major). That branch also
  documents the **sus2/sus4 inversion equivalence** (commit
  `6214f67`). Neither has been promoted to dev. Consolidation must
  pull both in or they'll be lost to the paused branch.

### 3. `static/shared/chord-detection.js` — `CHORD_TEMPLATES` + `QUALITY_SYMBOLS` (lines ~52–77)

Audio detection: 12-element binary chroma vectors, matched by
rotation against live chroma (12 roots × 10 qualities per frame).

```javascript
const CHORD_TEMPLATES = {
  major: [1,0,0,0,1,0,0,1,0,0,0,0],
  m7b5:  [1,0,0,1,0,0,1,0,0,0,1,0],
  // ... 10 entries
};
const QUALITY_SYMBOLS = { major: '', m7b5: 'm7b5', /* ... */ };
```

- **Covers (10):** major, minor, dim, aug, sus2, sus4, dom7, maj7,
  min7, m7b5.
- **Consumers:** `input-provider.js`; as of `cantor` commit
  `66bb368` (2026-05-19), also instantiated directly by
  `templates/cantor.html` as a second detector alongside YIN pitch.
- **Note:** `m7b5` here is the same PC set as `half-dim7` /
  `hdim7` elsewhere — three names for one chord across three files.

### 4. `static/shared/chord-bubble-renderer.js` — `QUALITY_COLORS` (lines ~51–66)

Quality → hex color for Tonnetz bubble rendering. 14 entries,
keyed with chord-resolver's quality names (`dim`, `hdim7`,
`augmaj7`...). Colors group by triad family: major-family blue
`#2563eb`, minor-family orange `#e64a19`, diminished purple
`#7c3aed`, augmented amber `#d97706`, sus cyan `#0891b2`.

### 5. `static/skratch-studio/music-generators.js` — `CHORD_INTERVALS` (lines ~9–13)

Triads only (major, minor, diminished) for SkratchLab code
generation. Missing augmented.

### 6. `static/intro/ch4-beyond-triads.js` — section-local maps

- `_S1_TYPE_TO_CHORD` (~line 408): UI label → type, 4 entries.
- `_S3_TYPE_TO_CHORD` (~line 745): UI label → type, 4 entries.
- `_S5_SEVENTH_TYPES` (~line 1084): Set of 6 seventh-type ids.
- These map UI labels onto transforms.js ids — they're consumers
  more than registries, but each hardcodes type-id strings that a
  rename would break.

### 7. `static/js/chord-wheel.js` — `minorFamily` (~line 553)

`['minor', 'dim', 'min7', 'dim7', 'hdim7', 'minmaj7']` — a quality
filter set for circle-of-fifths highlighting. Mixes naming schemes
(`dim` from resolver, `minor`/`min7` shared).

### 8. `static/shared/walkthroughs.js`

Stores chord names as strings ("F", "Em", "A7") with occasional
explicit `chordType`; delegates parsing to
`parseChordName()` in `walkthrough-sidebar.js`. Not a registry, but
a consumer whose string vocabulary must stay parseable against the
canonical symbol set.

---

## Discrepancies

| Concept | transforms.js | chord-resolver.js | chord-detection.js | bubble-renderer |
|---|---|---|---|---|
| Diminished triad id | `diminished` | `dim` | `dim` | `dim` |
| Augmented triad id | `augmented` | `aug` | `aug` | `aug` |
| Half-diminished id | `half-dim7` | `hdim7` | `m7b5` | `hdim7` |
| Minor-major 7 symbol | `mΔ7` | `mM7` | — | (color only) |

Coverage gaps (type exists in some registries, not others):

| Type | transforms | resolver | detection | music-gen | bubble |
|---|---|---|---|---|---|
| augmented | ✓ | ✓ | ✓ | ✗ | ✓ |
| 7sus4 | ✓ | ✗ | ✗ | ✗ | ✗ |
| dim7 / hdim7 / minmaj7 | ✓ | ✓ | ✗ (only m7b5≡hdim7) | ✗ | ✓ |
| augmaj7, aug7 | ✗ | ✓ | ✗ | ✗ | ✓ |
| add9, dom9, maj9, min9 | ✓ | ✗ | ✗ | ✗ | ✗ |
| power (5) | ✗ | only on `chord-melody-research` | ✗ | ✗ | ✗ |

---

## Canonical JSON specification

One file — proposed `static/shared/chord-types.json` (or a JS
module exporting the literal, if fetch-at-import is undesirable) —
from which every registry above is derived or replaced.

### Shape

```json
{
  "version": 1,
  "chordTypes": [
    {
      "id": "half-dim7",
      "aliases": ["hdim7", "m7b5"],
      "name": "Half-diminished 7th",
      "symbol": "ø7",
      "symbolAlternates": ["m7b5"],
      "intervals": [0, 3, 6, 10],
      "family": "diminished",
      "baseTriad": "diminished",
      "color": "#7c3aed",
      "resolver": { "priority": 3 },
      "detection": { "detectable": true }
    }
  ]
}
```

### Fields

| Field | Type | Replaces | Notes |
|---|---|---|---|
| `id` | string | all key/quality names | Canonical id. Proposal: adopt transforms.js's longer names (`diminished`, `augmented`, `half-dim7`) as canonical since transforms has the most consumers; everything else becomes an alias. |
| `aliases` | string[] | — | Every legacy quality string (`dim`, `aug`, `hdim7`, `m7b5`) so a lookup helper `getChordType(idOrAlias)` lets consumers migrate incrementally without simultaneous renames. |
| `name` | string | transforms `name` | Human-readable. |
| `symbol` | string | transforms/resolver `symbol`, detection `QUALITY_SYMBOLS` | One canonical display suffix. The `mΔ7` vs `mM7` conflict must be decided here (recommend `mΔ7`, matching transforms and the design-system typography; keep `mM7` in `symbolAlternates` for parsing). |
| `symbolAlternates` | string[] | — | Accepted on parse (walkthrough chord strings), never emitted. |
| `intervals` | number[] | transforms/resolver `intervals`, music-gen `CHORD_INTERVALS` | Semitones from root; may exceed 12 (add9 = 14). Sorted ascending, root 0 always present. |
| `family` | enum | bubble `QUALITY_COLORS` grouping, chord-wheel `minorFamily` | One of `major` \| `minor` \| `diminished` \| `augmented` \| `suspended` \| `power`. `minorFamily` becomes `family === 'minor' \|\| family === 'diminished'` (verify against the current 6-entry list before swapping). |
| `baseTriad` | enum/null | transforms `base` | Triad quality for Tonnetz wash rendering. `null` for sus and power chords (no third). Distinct from `family`: 7sus4's family is `suspended`, baseTriad `null`; aug7's family is `augmented`, baseTriad `augmented`. |
| `color` | string | bubble `QUALITY_COLORS` | Explicit per type rather than derived from family, so individual overrides stay possible; in practice initialized to the family color. |
| `resolver.priority` | number | resolver `priority` | 1 triads, 2 sus, 3 sevenths, 4 power (power must not displace higher-priority matches — `[0,4,7]` resolves major, never power; this is the documented constraint from `chord-melody-research`). |
| `detection.detectable` | boolean | implicit membership in `CHORD_TEMPLATES` | The 12-bin chroma template itself is **derived**: `template[i] = intervals.includes-mod-12(i)`. Extended chords (9ths) must be `detectable: false` — their chroma folds onto smaller sets (add9 mod 12 ⊇ major + 2) and template matching can't separate them reliably. |

### Derivations (not stored)

- **Chroma template** (chord-detection): computed from
  `intervals % 12` for entries with `detection.detectable`.
  Build-time check: no two detectable templates may be identical.
- **`_triadIntervals`** (transforms internal): lookup of the four
  triad entries.
- **`minorFamily`** (chord-wheel): family predicate, above.
- **Music-generators triads:** filter `family`-triads with
  `intervals.length === 3`; note this *adds* augmented to
  SkratchLab, which is a behavior change to confirm or exclude.

### Edge cases the canonical file must settle

1. **Power chord (`5`).** Entry: `{ id: "power", symbol: "5",
   intervals: [0, 7], family: "power", baseTriad: null,
   resolver: { priority: 4 }, detection: { detectable: false } }`.
   Two-note PC set; the resolver self-tests on
   `chord-melody-research` (root position + inverted PC order +
   the must-not-displace constraint) should be carried over as the
   acceptance tests for this entry.
2. **sus2/sus4 inversion equivalence.** `{0,2,7}` rotated is
   `{0,5,7}` — Csus2 ≡ Gsus4 as PC sets. The resolver therefore
   needs a documented tie-break (current behavior: priority order +
   which root candidate is tried first). The canonical file should
   carry this as a top-level `notes` entry or a
   `pcSetEquivalences` annotation so the next person doesn't
   rediscover it; the analysis already exists on
   `chord-melody-research` (commit `6214f67`).
3. **Half-diminished naming.** One id (`half-dim7` proposed),
   `hdim7` and `m7b5` as aliases, `ø7` as symbol, `m7b5` as an
   accepted parse alternate.
4. **Slash chords / inversions.** Out of scope for the registry —
   no registry today encodes bass notes. Resolver output (root +
   type + inversion) stays a resolver concern; the registry only
   defines root-position interval sets.
5. **Extended chords (9ths, and 11/13 later).** Present only in
   transforms today. Canonical entries keep them with
   `detectable: false`; if 11ths/13ths arrive, same rule. The
   `intervals` field already supports >12 values.
6. **augmaj7 / aug7.** Currently resolvable but not in transforms —
   meaning the explorer can *name* them but games/keyboard can't
   *build* them. Promoting them into the canonical file closes the
   gap automatically; confirm there's no consumer that iterates
   transforms.CHORD_TYPES and assumes exactly 18 entries.

### Migration sketch (for a future session — not this audit)

1. Land `chord-types.json` + a `chord-registry.js` accessor module
   (lookup by id/alias, derived chroma templates, family
   predicates) with self-tests in the established chord-resolver
   self-test convention.
2. Convert consumers one registry at a time, each as its own
   commit with runtime verification: transforms → resolver →
   detection → bubble-renderer → music-generators → ch4 maps →
   chord-wheel.
3. Delete each legacy literal as its consumer flips.
4. Cherry-pick or re-derive the power-chord template and sus
   equivalence tests from `chord-melody-research` so the paused
   branch's general-purpose findings aren't stranded.
