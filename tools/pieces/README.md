# Pieces pipeline and the norm format

`tools/pieces/` turns a source for a piece — a public-domain scan, an
Audiveris export, a MIDI recording — into **norm**, SongLab's shared note
model, reviews competing reads of the same source against each other, merges
them with the reviewer's choices into one resolved read (`apply_votes.py`),
and (next step, `norm_to_voicing.py`, not yet written) reduces the resolved
norm file to the Voicing Explorer piece format (`tools/voicings/schema.md`).

Everything here is standard-library Python 3.

## The norm format

One JSON document per read of a piece. A *read* is one reader's
transcription of the same source: a Claude session working from page
images, Audiveris (`mxl_to_norm.py`), a per-bar third read
(`collect_third.py`), a MIDI recording (`midi_to_norm.py`), or a MusicXML
score (`musicxml_to_norm.py`). All reads of a piece share bar numbers so they can be
compared bar by bar and staff by staff.

### Document

| Field | Type | Notes |
|---|---|---|
| `piece` | string | slug, e.g. `"i-got-rhythm"` |
| `title` | string, optional | display title, e.g. `"Carol of the Bells (Winston), lines 1–2"`. Written by `midi_to_norm.py --title`. |
| `reader` | string | names the read: `"claude"`, `"audiveris"`, `"third"`, `"midi"`, … Each read of a piece needs a distinct name; `review_page.py` uses it for column headers, vote labels and radio values. |
| `source` | string | free text: file, pages, how it was read |
| `date` | string, optional | ISO date |
| `key` | string, optional | key with optional mode: `"B♭"`, `"Bb"`, `"B♭m"`, `"B♭ minor"`, `"E major"`. Major when no mode is given. |
| `time` | string, optional | time signature `"N/D"`, any N/D (`"2/2"`, `"4/4"`, `"3/4"`, `"6/8"`). One per piece. |
| `beatsPerBar` | number, optional | quarter notes per bar (4 for 2/2 and 4/4, 3 for 3/4 and 6/8). When absent, tools derive N × 4 / D. |
| `tempo` | number, optional | quarter notes per minute. Written by `midi_to_norm.py` from the file's first `set_tempo` and by `musicxml_to_norm.py` from the metronome mark (else `<sound tempo>`) or `--tempo`; absent from scan reads. Not used by the review tools; for playback (the follow-along player). |
| `tempoMarking` | string, optional | the tempo text printed with the metronome mark, e.g. `"Fast Rock 'n' Roll"`. The follow-along player shows it after the bpm on the Piece card; when absent the player names the tempo itself from `tempo` (Andante, Allegro, …). Written by `musicxml_to_norm.py` from the words beside the metronome mark or `--tempo-marking`; otherwise hand-written. |
| `clefs` | object, optional | clef changes per piano staff: `{ "lh": [{ "bar": 1, "clef": "treble" }, { "bar": 9, "clef": "bass" }], "rh": [{ "bar": 1, "clef": "treble" }] }`. Clefs `treble` / `bass`; bars ascending and within the piece; a change holds until the next. Written by `midi_to_norm.py --clef`. Not used by the review tools; for notation in the player. |
| `lines` | number[], optional | line-start bar numbers for the follow-along player, e.g. `[1, 5, 9, 13]`: line k runs from `lines[k]` to `lines[k+1] - 1`, the last to the final bar. The first is 1, strictly increasing, within the piece. Written by `midi_to_norm.py --lines` or `--bars-per-line`. When absent the player uses 4 bars per line. Not used by the review tools. |
| `syncopation` | string, optional | how the follow-along player writes a note that starts off the beat and lasts across the next beat. Absent or `"beats"`: it is split and tied at that beat (3/4 ♩ ♪ ♩ ♪ is drawn ♩ ♪ ♪⌒♪ ♪, as in the printed Carol); `"displaced"`: the displaced-beat syncopation is kept as one value (♪ ♩ ♪, ♩ 𝅗𝅥 ♩ in 2/2 — not across a 6/8 beat). Notes that start on a beat, 16th-level syncopation inside a beat, and rests are unaffected. Read by `player-staff-model.js` only; no converter flag yet. |
| `feel` | string, optional | `"strict"` or `"rubato"`: how the piece is meant to be played against the pulse. Shown as the FEEL row on the follow-along player's Piece card ("Strict" / "Rubato"); absent (or any other value): no row. Information only — the player's clock, judging and timing log do not change. Hand-written into the norm file; no converter flag yet, so re-running `midi_to_norm.py` drops it (likewise `anchors` and `songNotes`); `musicxml_to_norm.py` keeps these hand-written fields when it re-imports over an existing file (unless `--fresh`). |
| `anchors` | string or number[], optional | the structural downbeats to land with the pulse, whatever is stretched in between. `"downbeats"`: beat 1 of every bar (the player tints the barlines gold, no per-bar marks). A list of bar numbers, e.g. `[1, 5, 9, 13]`: beat 1 of those bars only (the player draws a small gold tick above each one's downbeat); bars not in the piece are ignored. The player also sets `anchor: true` on its `note:expected` / `note:played` / `note:missed` events for notes at onset 0 of an anchor bar, for later timing analysis. Does not change judging. |
| `songNotes` | object[], optional | notes about the piece for the follow-along player's "Song notes" panel (the button after the piece title; shown only when the piece has some): an ordered array of sections `{ "id": "feel", "title": "…", "body": "…" }`, shown top to bottom as a heading + body. `id`: a short slug, unique in the piece (letters, digits, `-`); the section with id `"feel"` is the one the Piece card's FEEL value links to. `body` is markdown-ish plain text: paragraphs separated by a blank line (`\n\n`), `**bold**` and `*italic*`; nothing else is interpreted (no HTML, links or lists). A section with an empty body is skipped. Hand-written into the norm file. |
| `feelNote` | object, optional | **legacy** — `{ "title", "body" }`, the single note that `songNotes` replaced. Still read: when a piece has no `songNotes` it is treated as one section with id `"feel"`. Write `songNotes` in new files. |
| `accompaniment` | object, optional | `{ "piece": "<slug>", "soloTranspose": 12 }` — hand-written on a solo that has a second part (a teacher duet): `piece` is the slug of that part's own norm, `soloTranspose` the semitones the solo is played above where it is written while the two play together (12: "play an octave higher", as a printed duet says; absent = 0). The follow-along player then offers a Band card: with "Play with the band" ticked, Listen and play-along play the accompaniment underneath, laid on the solo's bars by bar number (a bar it lacks is silent), and the solo sounds, is expected and lights the keyboard at the shifted pitch. The two must share a time signature; the solo's tempo and play order are used. Kept on re-import by `musicxml_to_norm.py`. |
| `form` | object, optional | `firstPass: [a, b]`, `secondEnding: n`, `playOrder: [bar, …]` (repeats expanded). Used for the review page subtitle; the next-step converter will translate it to the Voicing Explorer `form` block. `musicxml_to_norm.py` writes `playOrder` only, from `--play-order` or the file's barline repeats and endings. The follow-along player reads `playOrder` only: an un-looped Listen or play-along follows it ("Form: with repeats", the default; `static/player/player-form.js`), while a loop, "Form: as written" and wait-for-me practice play the written bars in order. Every entry must be a bar of the piece, or the order is ignored. |
| `repeats` | object, optional | repeat barlines, by bar, for display: `{ "start": [9], "end": [32] }` — `start`: bars that open with a repeat sign, `end`: bars that close with one. The two lists are independent (an end with no start repeats from the top). The follow-along player draws them (`player-staff-model.js`: a start on the first bar of a line and an end on its last bar both draw; an end directly followed by a start is one double repeat sign) and does not follow them. Written by `musicxml_to_norm.py` from the file's barline repeats or `--repeat-start` / `--repeat-end`. Absent: no repeat signs. Not used by the review tools. |
| `marks` | object, optional | navigation marks, by bar, for display: `{ "segno": [9], "toCoda": [16], "dsAlCoda": [32], "coda": [33] }`. Each key is a mark type with the list of bars that carry it: `segno` and `coda` (the signs, drawn above the top staff at the start of the bar); `toCoda` ("To Coda" with a small coda sign), `dsAlCoda` ("D.S. al Coda"), `dcAlCoda` ("D.C. al Coda"), `dsAlFine` ("D.S. al Fine"), `dcAlFine` ("D.C. al Fine") and `fine` ("Fine") (text above the top staff, right-aligned at the end of the bar). The wording is fixed. The player draws them and plays the written bars straight through; an unknown type or a non-numeric bar is ignored with a warning. Written by `musicxml_to_norm.py` from the file or one flag per type (`--segno 9 --to-coda 16 --ds-al-coda 32 --coda 33`, …). Absent: no marks. Not used by the review tools. |
| `bars` | array | one entry per written bar, ascending |
| `notes` | object, optional | `{ "<bar>": "prose" }` — reader remarks per bar (third reads) |
| `provenance` | object, optional | `{ "<bar>-<staff>": { "source": "<reader>", "how": "agree" \| "pick" \| "vote" } }` — written by `apply_votes.py` (reader `"resolved"`), one entry per staff of every bar: which read the events were copied from and why (`agree`: every read with a reading agreed; `pick`: the reviewer's choice on the review page; `vote`: a two-of-three majority over a dissenter). Not used by the review tools. |

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
| `fingering` | optional: one entry per pitch, in the order of `pitches` (low → high) — an integer 1–5, or `null` for a pitch with no fingering: `{ "pitches": ["C4", "E4", "G4"], "fingering": [1, null, 5] }`. Anything else printed as a fingering (a substitution such as `"1-2"`) is kept as a string. Absent when no pitch of the event has one; never on a rest. Written by `musicxml_to_norm.py` from `<fingering>`. Nothing reads it yet: the player, the staff model and the review tools ignore it (`apply_votes.py` copies it along with the event). |

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
- **MusicXML scores** — `musicxml_to_norm.py`: a two-staff piano part from
  Soundslice or MuseScore (`.musicxml`, `.xml` or compressed `.mxl`),
  whatever the part is named: staff 1 → `rh`, staff 2 → `lh`; `voice` is
  `[]`. Bars are numbered by position and stay as written (repeats are not
  unrolled; the playing order goes to `form.playOrder`). Onsets and
  durations are exact, pitches keep the file's spelling, the file's rests
  are replaced by filler rests, and a note tied to the same pitch later in
  the same bar is written as one note of the summed length (the player
  splits and ties it again by the meter). `time`, `key`, `clefs`, `lines`
  (system breaks), `tempo`, `tempoMarking`, `title`, `repeats` (barline
  repeats) and `marks` (segno, coda, To Coda, D.S. / D.C. al Coda / al
  Fine, Fine — from the signs, the `<sound>` jump attributes and the
  printed words) come from the file, each overridable by flag; `fingering`
  is carried per event. Refused,
  naming the bar: pickup or short bars, tuplets, a time or key change
  inside the imported range, clefs other than treble and bass. Lyrics,
  fermatas, dynamics, double barlines and slurs are left out. Every staff
  must pass `validate_staff` or nothing is written. Rules in the module
  docstring.
- **MIDI recordings** — `midi_to_norm.py`: the tracks named `RH` and `LH`
  (`--rh-track` / `--lh-track`) map to `rh` and `lh`; `voice` is `[]`.
  Onsets and durations snap to the recording's quantisation grid (`--grid`,
  default 0.5 = 8th notes), a gap shorter than `--min-rest` (default =
  `--grid`) extends the note to the next onset in that hand, notes are cut
  at bar lines with ties, filler rests are written, and each staff is
  validated to sum to `beatsPerBar`.
  Pitches are spelled from `--key` (the file's key-signature meta is
  ignored); `time` and `tempo` come from the file unless overridden. Every
  off-grid onset, duration bumped to one grid, clip at a re-struck note, or
  dropped duplicate attack is recorded in the bar's `uncertain` list with
  the raw and written values. Sustain pedal, velocity and channel are
  ignored; grace notes are not detected. Rules in the module docstring.

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
| `musicxml_to_norm.py` | two-staff piano MusicXML (`.musicxml`/`.xml`/`.mxl`) → norm for the follow-along player: exact rhythm, `fingering`, `clefs`, `lines`, `tempo`, `tempoMarking`, `repeats`, `marks`, `form.playOrder`; `--bars` imports a range renumbered from 1; re-import keeps hand-written fields; refuses what the norm cannot hold. Fixture test: `python3 tests/pieces/test_musicxml_to_norm.py` |
| `midi_to_norm.py` | two-track (`RH`/`LH`) piano MIDI recording → norm, quantised to `--grid`, with `tempo` and per-bar `uncertain` flags; refuses to write when a staff does not sum to the bar |
| `collect_third.py` | per-bar JSON files (`DIR/bar-NN.json`, each `{bar, voice?, rh?, lh?, notes?}`) → norm |
| `diff_reads.py` | compare two reads bar by bar and staff by staff: `agree`, `spelling-only`, `disagree` (pitches as midi, ties merged, graces as an ordered list, rests ignored) |
| `review_page.py` | vote across 2–3 reads, render every disputed reading as notation (Verovio) next to the crop, collect choices; self-checks every snippet's sounding and displayed pitch and refuses to write the page on failure |
| `apply_votes.py` | 2–3 reads + the choices JSON from the review page → one resolved norm read (reader `resolved`) with a `provenance` map; per staff: all agree → take it, else the reviewer's pick, else the two-of-three majority; a `none` pick, a "looks wrong" flag, a free-text correction or a three-way split with no pick blocks the write (exit 1) and is listed. Validates every staff's length, the bar run, each staff against its source and that every pick was used (exit 2 / 3, nothing written). Deterministic output. |

## Pipeline commands

From the repo root. Work files live under `sources/work/` (gitignored);
page images and per-bar crops (`crops/bar-NN.png`, `crops/bar-NN-{voice,rh,lh}.png`)
are produced ad hoc (no crop script yet).

```sh
# 1. Audiveris → norm (per page, with the refrain bar offset of each page)
python3 tools/pieces/mxl_to_norm.py --piece i-got-rhythm --key B♭ --time 2/2 --beats-per-bar 4 \
    --out sources/work/igr-read-audiveris.json \
    sources/work/audiveris/igr-p3.mxl:0 sources/work/audiveris/igr-p4.mxl:17

# 1b. MIDI recording → norm (key from the flag; time, tempo from the file; 16th-note grid,
#     gaps under a half-beat extend the note; optional title, per-hand clef changes and line starts)
python3 tools/pieces/midi_to_norm.py --piece prelude-winston-first-16 --key "B♭ minor" \
    --grid 0.25 --min-rest 0.5 \
    --title "Carol of the Bells (Winston), lines 1–2" \
    --clef lh:treble@1,bass@9 --clef rh:treble@1 \
    --lines 1,5,9,13 \
    --out static/private/pieces/prelude-winston-first-16.norm.json \
    static/private/pieces/prelude-winston-first-16.mid
# Flags: --grid 0.5 (default), --min-rest 0.5 (shortest gap written as a rest, in quarters; default = --grid;
#   shorter gaps extend the note to the next onset), --time 3/4, --beats-per-bar 3,
#   --rh-track RH --lh-track LH, --reader midi, --title "..." (optional),
#   --clef HAND:CLEF@BAR[,CLEF@BAR...] (optional; one flag per hand, lh or rh; clefs treble / bass;
#   bars ascending and within the piece), --lines 1,5,9,13 or --bars-per-line 4 (optional, mutually exclusive;
#   line-start bars for the player: the first 1, strictly increasing, within the piece).

# 1c. MusicXML score → norm (default output static/private/pieces/<slug>.norm.json)
python3 tools/pieces/musicxml_to_norm.py ~/songlab-imports/score.musicxml \
    --piece my-piece --title "My Piece" --key C --tempo 148 \
    --bars 1-36 --play-order "1-32,9-32,9-16,33-36"
# Flags: --piece and --title (required when the file has no title; otherwise the slug is made from the title),
#   --out PATH, --bars FROM-TO (by position in the file; renumbered from 1, with clefs, lines, key, time and
#   tempo as they stand at the first bar of the range), --play-order "A-B,C-D,…" (bar numbers after --bars;
#   expanded into form.playOrder; default: derived from barline repeats and endings; D.S. / coda jumps are
#   not derived), --key "B♭ minor" (default: <fifths> + <mode>, major when no mode), --time 3/4,
#   --beats-per-bar 3, --tempo BPM (default: metronome mark, else <sound tempo>), --tempo-marking "Fast",
#   --clef HAND:CLEF@BAR[,…] (replaces that hand's clefs), --lines 1,5,9 or --bars-per-line 4 (default: the
#   file's system breaks), --reader musicxml, --fresh (re-import without keeping feel, anchors, songNotes, accompaniment,
#   syncopation and an edited tempo / tempoMarking from the existing output file; kept fields are printed).
# Repeats and navigation marks (drawn by the player; what it FOLLOWS is form.playOrder, not these; rebuilt on every import, never kept):
#   --repeat-start BARS, --repeat-end BARS, and one flag per mark type: --segno, --coda, --to-coda,
#   --ds-al-coda, --dc-al-coda, --ds-al-fine, --dc-al-fine, --fine. BARS is 9 or 9,41 (bar numbers after
#   --bars) or `none`; a flag replaces what the file gave for that type, the default is the file's own marks.
#   e.g. --segno 9 --to-coda 16 --ds-al-coda 32 --coda 33
# Test: python3 tests/pieces/test_musicxml_to_norm.py (fixtures in tests/fixtures/musicxml/).

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
collect in the textarea at the bottom; copy the JSON and keep it (e.g.
`sources/work/igr-choices-2026-11-02.json`) — the page does not save it. The
`--votes` file records the vote outcome per disputed bar+staff (`readers`,
`counts`, `items`).

```sh
# 5. Resolved read: reads in the same order as step 4, plus the saved choices. Metadata from the primary read.
python3 tools/pieces/apply_votes.py \
    sources/work/igr-read-claude.json sources/work/igr-read-audiveris.json sources/work/igr-read-third.json \
    --choices sources/work/igr-choices-2026-11-02.json --out sources/work/igr-resolved.norm.json
# Prints the agree / pick / vote counts and the bar range. Writes nothing and exits non-zero when a
# staff is unresolved (a "none" pick, a "looks wrong" flag, a correction text, a three-way split without
# a pick — each listed with the correction text), when validation fails, or when a pick went unused
# (typo, stale bar, unknown reader). Fix the choices file and re-run. --bar-len Q overrides beatsPerBar.
```

## Next step

`norm_to_voicing.py` (not yet written): resolved norm (`apply_votes.py` output) → Voicing Explorer
piece JSON with the song-sheet reduction melody = `voice`, comp = `rh`
below the melody + `lh` chords, bassLine = `lh` bass. See
`docs/AUDIT-2026-10-27.md` §2.
