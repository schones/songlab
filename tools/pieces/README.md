# Pieces pipeline and the norm format

`tools/pieces/` turns a source for a piece — a public-domain scan, an
Audiveris export, a MIDI recording — into **norm**, SongLab's shared note
model, reviews competing reads of the same source against each other, and
(next step, `norm_to_voicing.py`, not yet written) reduces a reviewed norm
file to the Voicing Explorer piece format (`tools/voicings/schema.md`).

Everything here is standard-library Python 3.

## The norm format

One JSON document per read of a piece. A *read* is one reader's
transcription of the same source: a Claude session working from page
images, Audiveris (`mxl_to_norm.py`), a per-bar third read
(`collect_third.py`), or a MIDI recording (converter not yet written; see
"Sources" below). All reads of a piece share bar numbers so they can be
compared bar by bar and staff by staff.

### Document

| Field | Type | Notes |
|---|---|---|
| `piece` | string | slug, e.g. `"i-got-rhythm"` |
| `reader` | string | names the read: `"claude"`, `"audiveris"`, `"third"`, `"midi"`, … Each read of a piece needs a distinct name; `review_page.py` uses it for column headers, vote labels and radio values. |
| `source` | string | free text: file, pages, how it was read |
| `date` | string, optional | ISO date |
| `key` | string, optional | key with optional mode: `"B♭"`, `"Bb"`, `"B♭m"`, `"B♭ minor"`, `"E major"`. Major when no mode is given. |
| `time` | string, optional | time signature `"N/D"`, any N/D (`"2/2"`, `"4/4"`, `"3/4"`, `"6/8"`). One per piece. |
| `beatsPerBar` | number, optional | quarter notes per bar (4 for 2/2 and 4/4, 3 for 3/4 and 6/8). When absent, tools derive N × 4 / D. |
| `form` | object, optional | `firstPass: [a, b]`, `secondEnding: n`, `playOrder: [bar, …]` (repeats expanded). Used for the review page subtitle; the next-step converter will translate it to the Voicing Explorer `form` block. |
| `bars` | array | one entry per written bar, ascending |
| `notes` | object, optional | `{ "<bar>": "prose" }` — reader remarks per bar (third reads) |

The review page takes `key`, `time`, `beatsPerBar`, `piece` and `form`
from the **primary** read; flags override them. Only `key` is required
(from the file or `--key`).

### Bar

| Field | Type | Notes |
|---|---|---|
| `bar` | int | written bar number; 1-based, pickup bars not yet handled (see limits) |
| `voice` | event[] | the vocal staff; `[]` when the source has none (instrumental, MIDI) |
| `rh` | event[] | right-hand piano staff |
| `lh` | event[] | left-hand piano staff |
| `uncertain` | string[], optional | the reader's doubts, one per line, starting with the staff name (`"rh beat 3: …"`), or `"as bar …"` / `"same …"`; shown on the review page for the primary read |
| `mapping` | string, optional | how Audiveris parts were mapped (`mxl_to_norm.py`) |

A staff that is absent from a bar is treated as empty.

### Event

```json
{ "onset": 2.5, "dur": 1.5, "pitches": ["B♭3", "D4", "G4"], "rest": false, "tie": null }
{ "grace": ["F2", "G2", "A2"] }
```

| Field | Notes |
|---|---|
| `onset` | quarters from the start of the bar, number (0.125 resolution in practice; triplets are not yet supported by the review page) |
| `dur` | quarters |
| `pitches` | spelled notes, sorted low → high; `[]` for a rest |
| `rest` | `true` for a rest (write filler rests so every staff sums to the bar length) |
| `tie` | `null`, `"start"` (tied into the next event or bar), `"stop"` (continuation), `"both"` |
| `grace` | a grace-note event: the ornament pitches in order, placed **before** the event it ornaments; no onset or duration |

**Pitch spelling.** Letter, accidentals, octave: `"B♭2"`, `"F♯4"`,
`"E♮3"`, `"C4"` (scientific pitch, C4 = 60). Unicode `♯ ♭ ♮` preferred;
ASCII `#` and `b` are accepted by the comparison tools. Doubled
accidentals (`"B♭♭3"`) are allowed. A `♮` means "the scan shows a natural
sign"; it does not change the pitch and must be stripped before the
Voicing Explorer (whose note parser rejects it). Ottava marks are applied
to the pitch by the reader.

**Flattened voices.** Within a staff all voices are merged into one
onset-sorted list. Notes with the same onset *and* duration become one
event (a chord); notes with the same onset but different durations stay
separate events (bar 2 of I Got Rhythm, rh: a half-note `C5` and a quarter
`E♭4 A4` both at onset 2). The reader does not record which note belonged
to which voice, so "the right hand doubles the melody" is inferred by
comparison with `voice`, not stored. A rest that overlaps a sounding
event in another voice is dropped.

**Ties.** A tie across the bar line is `"start"` on the last event of one
bar and `"stop"` on the first event of the next. Within a bar,
`diff_reads.py` merges a `"stop"` continuation of the same pitch into the
span that started it before comparing.

### Minimal example

```json
{ "piece": "i-got-rhythm", "reader": "claude", "key": "B♭", "time": "2/2", "beatsPerBar": 4,
  "form": { "firstPass": [1, 34], "secondEnding": 35, "playOrder": [1, 2, 3] },
  "bars": [
    { "bar": 1,
      "voice": [ { "onset": 0, "dur": 1, "pitches": [], "rest": true, "tie": null },
                 { "onset": 1, "dur": 1, "pitches": ["F4"], "rest": false, "tie": "start" },
                 { "onset": 2, "dur": 0.5, "pitches": ["F4"], "rest": false, "tie": "stop" },
                 { "onset": 2.5, "dur": 1.5, "pitches": ["G4"], "rest": false, "tie": null } ],
      "rh":    [ { "onset": 0, "dur": 1, "pitches": [], "rest": true, "tie": null },
                 { "onset": 1, "dur": 3, "pitches": ["B♭3", "D4", "F4"], "rest": false, "tie": null } ],
      "lh":    [ { "grace": ["F2", "G2", "A2"] },
                 { "onset": 0, "dur": 1, "pitches": ["B♭1", "B♭2"], "rest": false, "tie": null },
                 { "onset": 1, "dur": 3, "pitches": [], "rest": true, "tie": null } ],
      "uncertain": [] } ] }
```

### Sources

Norm is the note model every source converges on:

- **Scan reads** — a Claude session reading page images or per-bar crops
  writes norm directly; a third read is collected from per-bar files with
  `collect_third.py`.
- **Audiveris** — `mxl_to_norm.py` converts its MusicXML: the part named
  Piano → `rh` (staff 1) and `lh` (staff 2), the Voice part with notes →
  `voice`.
- **MIDI recordings** — two tracks named `RH` and `LH` map to `rh` and
  `lh`; `voice` is `[]`. Quantised onsets and durations in quarters;
  pitches spelled from the key. (Converter not yet written.)

### Known limits

- No pickup bars: every bar is `beatsPerBar` long; a short bar is flagged
  "wrong length" by `diff_reads.py` and padded at the end by the review page.
- One time signature per piece.
- The review page writes notation at 32nd-note resolution with no tuplets;
  a triplet bar renders with wrong note values (the pitch self-check still
  passes).

## Tools

| Script | Role |
|---|---|
| `mxl_to_norm.py` | Audiveris MusicXML (`.mxl`/`.xml`, per page with a bar offset) → norm |
| `collect_third.py` | per-bar JSON files (`DIR/bar-NN.json`, each `{bar, voice?, rh?, lh?, notes?}`) → norm |
| `diff_reads.py` | compare two reads bar by bar and staff by staff: `agree`, `spelling-only`, `disagree` (pitches as midi, ties merged, graces as an ordered list, rests ignored) |
| `review_page.py` | vote across 2–3 reads, render every disputed reading as notation (Verovio) next to the crop, collect choices; self-checks every snippet's sounding and displayed pitch and refuses to write the page on failure |

## Pipeline commands

From the repo root. Work files live under `sources/work/` (gitignored);
page images and per-bar crops (`crops/bar-NN.png`, `crops/bar-NN-{voice,rh,lh}.png`)
are produced ad hoc (no crop script yet).

```sh
# 1. Audiveris → norm (per page, with the refrain bar offset of each page)
python3 tools/pieces/mxl_to_norm.py --piece i-got-rhythm --key B♭ --time 2/2 --beats-per-bar 4 \
    --out sources/work/igr-read-audiveris.json \
    sources/work/audiveris/igr-p3.mxl:0 sources/work/audiveris/igr-p4.mxl:17

# 2. Per-bar third read → norm
python3 tools/pieces/collect_third.py --dir sources/work/third --piece i-got-rhythm \
    --out sources/work/igr-read-third.json

# 3. Quick comparison of two reads
python3 tools/pieces/diff_reads.py sources/work/igr-read-claude.json sources/work/igr-read-audiveris.json

# 4. Review page: primary, comparison, optional tie-break. Metadata from the primary read.
python3 tools/pieces/review_page.py \
    sources/work/igr-read-claude.json sources/work/igr-read-audiveris.json sources/work/igr-read-third.json \
    --subtitle "refrain (bars 1–34, second ending 35)" \
    --crops crops --out sources/work/review.html --votes sources/work/igr-votes.json
# Flags: --primary NAME (make that read the primary), --title, --subtitle,
# --key "B♭ minor", --time 3/4, --bar-len 3 override the file's metadata.
```

Open `review.html` next to the `crops/` folder (on the dev server, through
the `static/private/igr-review` symlink to `sources/work/`). Choices
collect in the textarea at the bottom; copy the JSON and keep it — the page
does not save it. The `--votes` file records the vote outcome per disputed
bar+staff (`readers`, `counts`, `items`).

## Next step

`norm_to_voicing.py` (not yet written): reviewed norm → Voicing Explorer
piece JSON with the song-sheet reduction melody = `voice`, comp = `rh`
below the melody + `lh` chords, bassLine = `lh` bass. See
`docs/AUDIT-2026-10-27.md` §2.
