# Voiced progression — JSON schema (v1)

Data model consumed by `static/shared/voicing-analysis.js` and produced
by `tools/voicings/export_json.py`. Spelled note names are the source
of truth; midi numbers are derived (C4 = 60). Durations and beats are
in quarter notes.

## Document

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | `1` |
| `title` | string | |
| `key` | string | Key root, e.g. `"G"`. Spelled; `"B♭"` or `"Bb"`. |
| `timeSignature` | string | `"3/4"` |
| `beatsPerBar` | number | Quarter notes per bar (3 for 3/4, 3 for 6/8). The engine falls back to deriving it from `timeSignature`. |
| `tempo` | int | BPM, quarter note. |
| `form` | object, optional | `repeats: [[start, end], …]`, `endings: {"1": [a, b], "2": [a, b]}`, `playOrder: [bar, …]` (repeats and endings expanded). For playback; the analysis ignores it. |
| `bars` | array | One entry per written bar, ascending. |

## Bar

| Field | Type | Notes |
|---|---|---|
| `bar` | int | Written bar number, 1-based. |
| `section` | string | `"Intro"`, `"A"`, `"B"`, … |
| `source` | enum | `"transcribed"` \| `"arranged"` \| `"user"` |
| `symbols` | array | `[{ beat, symbol }]` in beat order. Empty array = hold: the engine carries the previous bar's last symbol forward. |
| `annotation` | string \| null | Free text from parenthesised figures, e.g. `"C7 on repeat"`. Not a symbol. |
| `comp` | array | Comp events, see below. May be empty (no comp in the bar). |
| `melody` | array | Melody events, see below. May be empty. |

Chord symbols: root letter + accidental, suffix, optional `/bass`.
Unicode `♯ ♭` preferred; ASCII `# b` and music21 `-` accepted. Suffixes
understood by `parseSymbol` are listed in `SUFFIX_TO_TYPE` in the
engine; unknown suffixes make the bar's symbol unparsed (analysis
still scores tension, named-vs-played is null).

## Comp event

| Field | Type | Notes |
|---|---|---|
| `beat` | number | Onset within the bar, 0-based. |
| `dur` | number | Sustained length in quarters. |
| `bass` | note | Lowest sounding comp note at the onset. |
| `voicing` | note[] | Every other comp note, ascending. |
| `arp` | true, optional | Arpeggiated. Absent otherwise. |
| `tie` | true, optional | Ties into the next bar. Absent otherwise. |

The analysis uses the **first event** of each bar (v1). Later events
are kept for playback and for Explore mode.

Exporter rule: an event begins at each chord-voice onset and includes
the bass-voice notes sounding at that moment. If the chord voice is
silent all bar, bass-voice onsets are used. Bass-voice motion under a
silent chord voice is not exported as an event in v1.

## Melody event

| Field | Type | Notes |
|---|---|---|
| `beat` | number | Onset within the bar. |
| `dur` | number | Quarters. A tied continuation of the same pitch within the bar is merged into one event. |
| `note` | note | Spelled, with octave. |
| `tie` | true, optional | Ties into the next bar; the tail is a separate event in that bar. |

Grace notes and rests are not exported. Melody-vs-voicing tension sums
`dur` per pitch within the bar and weights by `dur / beatsPerBar`.

## Tension scoring

Every pair among the first comp event's bass + voicing notes is scored
(melody pitches are scored against every comp note when the melody is
included, weighted by `dur / beatsPerBar`). A pair's span in semitones
is reduced mod 12 to its interval class; the class weight is multiplied
by the class's octave discount for each extra octave. Minor 2nds and
tritones keep rubbing across octaves; major 2nds and major 7ths are
extensions beyond the first octave, not rubs. Constants
(`TENSION_WEIGHTS`, `OCTAVE_DISCOUNTS`) live in
`static/shared/voicing-analysis.js`.

| Class (span mod 12) | Weight | Octave discount | Examples |
|---|---|---|---|
| 1 — minor 2nd | 3 | 2/3 | m2 (1) 3 · m9 (13) 2 · m16 (25) 1.333 |
| 2 — major 2nd | 1 | 0 | M2 (2) 1 · M9 (14) 0 |
| 6 — tritone | 2 | 2/3 | TT (6) 2 · TT + octave (18) 1.333 |
| 11 — major 7th | 1 | 0 | M7 (11) 1 · M14 (23) 0 |
| anything else | 0 | — | unisons, 3rds, 4ths, 5ths, 6ths, minor 7ths, octaves, in any register |

The chart's stacked series use five buckets: `m2`, `m9` (class 1 in any
compound register), `TT` (any register), `M2`, `M7`.

## Note

A spelled pitch with octave: `"B♭4"`, `"F♯3"`, `"C4"`. ASCII `"Bb4"`,
`"F#3"` and music21 `"B-4"` are accepted on input; the exporter always
writes Unicode. Octave follows scientific pitch notation (C4 = 60).
The engine also accepts bare midi numbers anywhere a note is expected
and spells them chord-relatively when a name is needed.

## Example

```json
{
  "bar": 2, "section": "Intro", "source": "transcribed",
  "symbols": [{ "beat": 0, "symbol": "Gm7/F" }],
  "annotation": null,
  "comp": [{ "beat": 1, "dur": 2, "bass": "F3", "voicing": ["A3", "B♭3", "D4"] }],
  "melody": [{ "beat": 0, "dur": 1, "note": "C5" }, { "beat": 1, "dur": 1, "note": "B♭4" }]
}
```

Fixture with one bar per scoring case: `tests/fixtures/voicing-fixture.json`.
