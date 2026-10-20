/**
 * voicing-explainer-content.js
 * ============================
 * Single source of explainer content for /voicings (Session 6.5): the
 * topics behind every panel pill, the docked Theory card's see-also links,
 * and the Learn pages at /learn/<slug>. Pills and pages render the SAME
 * registry, so a topic is written once.
 *
 * Numbers are never typed into the text: they are interpolated from the
 * engine's exported constants (TENSION_WEIGHTS, OCTAVE_DISCOUNTS,
 * DEFAULT_MAX_SPAN, ARP_STEP_MS, …) so the content stays true when a
 * constant is tuned. Bodies are a Markdown subset (mini-markdown.js) in
 * template strings; a line that is only `[[example <id>]]` becomes an example
 * block from the learn-example.js registry (pages only — pills and the index
 * show the summary, which never carries one). Public examples only: the Maple Leaf Rag fixture
 * (`?piece=maple-leaf-rag`), the synthetic fixture (`?piece=fixture`), or
 * constructed chords. Private material never appears here.
 *
 * Registry shape:
 *   TOPICS[slug] = {
 *     title,            page / pill heading
 *     status,           'stub' | 'claude-draft' | 'verified' | 'own-words'   (drives the disclaimer)
 *     category,         'tool' (how the page works) | 'theory' (music)
 *     kind,             'fact' | 'heuristic'   (heuristics are design choices, styled distinctly)
 *     panel?,           the /voicings panel this topic explains (see PANELS)
 *     see_also,         slugs of TOPICS or EXTERNAL
 *     summary,          one or two plain sentences (pill preview, page lede)
 *     body,             Markdown subset; may reference constants
 *     notes?,           author notes — never rendered (claims to verify, sources to cite)
 *   }
 *   EXTERNAL[key] = { kind: 'page', url, title }   existing pages see_also / glossary may point at
 *   GLOSSARY[term] = slug | EXTERNAL key            terms the Theory card links out
 *
 * Exports:
 *   TOPICS, EXTERNAL, GLOSSARY, STATUSES, DISCLAIMER, PANELS
 *   getTopic(slug)            → topic | null
 *   resolveSlug(slug)         → { kind:'topic', slug, title, url, status } | { kind:'page', key, title, url } | null
 *   resolveLink(target)       → mini-markdown link resolver (slug → /learn/<slug>, page key → its url)
 *   renderTopic(slug)         → { slug, title, status, disclaimer, category, kind, html, summaryHtml, seeAlso[] } | null
 *   glossaryLookup(term)      → resolveSlug() result for a glossary term (case-insensitive) | null
 *   topicsForPanel(panel)     → [slug]
 *   selfTest()
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/shared/voicing-explainer-content.js').then(m => m.selfTest())"
 */

import {
  TENSION_WEIGHTS, OCTAVE_DISCOUNTS, INTERVAL_LABELS, COMPOUND_LABELS, INTERVAL_KEYS, LOCAL_CHORD_TYPES,
  SUFFIX_TO_TYPE, STEP_DEGREE, tensionWeight,
} from './voicing-analysis.js';
import { CHORD_TYPES } from './transforms.js';
import {
  MIN_ABOVE_BASS, DEFAULT_MAX_SPAN, TARGET_STEP, EXPLORE_ROWS, MIN_COUNT, MAX_COUNT, DEFAULT_COUNT, EXTENSION_SEMIS,
  DOMINANT_RULE, dominantRuleText,
} from './voicing-explore.js';
import { ARP_STEP_MS, ROLL_SPREAD_FRACTION, LEAD_IN_MAX_BEATS, DEFAULT_TEMPO } from './voicing-playback-model.js';
import { VELOCITY, LEAD_IN_GAIN, START_TIMEOUT_MS, SALAMANDER_VERSION } from './voicing-player.js';
import { SPLIT_MIDI } from './voicing-staff-model.js';
import { VEROVIO_VERSION } from './voicing-staff.js';
import { INTERVAL_SERIES } from './voicing-chart.js';
import { parseNote } from './voicing-analysis.js';
import { renderMarkdown, renderInline } from './mini-markdown.js';
import { exampleBlockHook, exampleRefs, getExample, exampleBlockHtml } from './learn-example.js';

// ════════════════════════════════════════════════════════════════════
// STATUS
// ════════════════════════════════════════════════════════════════════

const STATUSES = ['stub', 'claude-draft', 'verified', 'own-words'];

/** Disclaimer line rendered from status (null = nothing shown). */
const DISCLAIMER = {
  'stub':         'Not written yet — this page is a placeholder so links resolve.',
  'claude-draft': 'Info from Claude — verify before relying on it.',
  'verified':     null,
  'own-words':    null,
};

/** Panels on /voicings a tool topic can explain (the P3 pills mount by these ids). */
const PANELS = ['chart', 'melody', 'play', 'selected', 'staff', 'tonnetz', 'rubs', 'nvp', 'explore', 'keyboard'];

// ════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS (numbers come from constants; these only spell them)
// ════════════════════════════════════════════════════════════════════

/** Numbers as the page shows them: at most 3 decimals (1.3333 → "1.333", 2 → "2"). */
function fmt(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x);
  return String(Math.round(x * 1000) / 1000);
}
/** Constants defined as fractions, shown as fractions (2/3 → "2/3"); anything else falls back to fmt. */
function frac(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x);
  for (const d of [2, 3, 4, 6, 8]) { const n = x * d; if (Math.abs(n - Math.round(n)) < 1e-9 && Math.round(n) % d !== 0) return `${Math.round(n)}/${d}`; }
  return fmt(x);
}
/** midi → "E4" (sharps). */
const noteName = midi => { const p = parseNote(midi); return p ? `${p.name}${p.octave}` : String(midi); };
/** Long name for an interval class, from the chart's series labels ("minor 2nd"), else the short label. */
const seriesLabel = Object.fromEntries(INTERVAL_SERIES.map(s => [s.key, s.label]));
const longName = cls => seriesLabel[INTERVAL_LABELS[cls]] || INTERVAL_LABELS[cls];

/** Tension-weight table rows, one per weighted interval class, with the compound examples the engine itself names. */
const weightRows = Object.keys(TENSION_WEIGHTS).map(Number).sort((a, b) => a - b).map(cls => {
  const names = COMPOUND_LABELS[cls];
  const ex = [0, 1, 2].map(o => `${names[o]} (${cls + 12 * o}) ${fmt(tensionWeight(cls + 12 * o))}`).join(' · ');
  return `| ${cls} — ${longName(cls)} | ${TENSION_WEIGHTS[cls]} | ${frac(OCTAVE_DISCOUNTS[cls])} | ${ex} |`;
}).join('\n');

/** The chart's stacked buckets in stack order, bottom to top. */
const bucketList = INTERVAL_SERIES.map(s => `**${s.key}** (${s.label})`).join(', ');

/** Chord-symbol suffix table: one row per chord type the parser knows. */
const chordTypeRows = (() => {
  const byType = new Map();
  for (const [suffix, type] of Object.entries(SUFFIX_TO_TYPE)) {
    if (!byType.has(type)) byType.set(type, []);
    const list = byType.get(type);
    const shown = suffix === '' ? '(none)' : suffix.replace(/#/g, '♯').replace(/b/g, '♭');
    if (!list.includes(shown)) list.push(shown);
  }
  const defOf = type => CHORD_TYPES[type] || LOCAL_CHORD_TYPES[type] || {};
  // Triads first, then sevenths, then five-note types; stable within a size.
  return [...byType.entries()].sort((a, b) => (defOf(a[0]).intervals || []).length - (defOf(b[0]).intervals || []).length).map(([type, suffixes]) => {
    const def = defOf(type);
    return `| ${def.name || type} | ${(def.intervals || []).join(' ')} | ${suffixes.join(', ')} |`;
  }).join('\n');
})();

/** Extension offsets Explore uses, as "9 = 2 semitones above the root". */
const extensionList = Object.entries(EXTENSION_SEMIS).map(([d, s]) => `${d} = ${s}`).join(', ');

const velocityList = Object.entries(VELOCITY).map(([role, v]) => `${role} ${v}`).join(', ');

// ════════════════════════════════════════════════════════════════════
// EXTERNAL TARGETS — existing pages see_also and the glossary may point at
// ════════════════════════════════════════════════════════════════════

const EXTERNAL = {
  'intro-sound':              { kind: 'page', url: '/intro/1', title: 'Fundamentals 1 — Sound & Notes' },
  'intro-intervals-scales':   { kind: 'page', url: '/intro/2', title: 'Fundamentals 2 — Intervals & Scales' },
  'intro-chords':             { kind: 'page', url: '/intro/3', title: 'Fundamentals 3 — Chords & Progressions' },
  'intro-beyond-triads':      { kind: 'page', url: '/intro/4', title: 'Fundamentals 4 — Beyond Triads' },
  'intro-tonnetz':            { kind: 'page', url: '/intro/5', title: 'Fundamentals 5 — Meet the Tonnetz' },
  'intro-transforms':         { kind: 'page', url: '/intro/6', title: 'Fundamentals 6 — Transforms' },
  'theory-circle-of-fifths':  { kind: 'page', url: '/theory/circle-of-fifths', title: 'Circle of Fifths' },
  'theory-tonal-centers':     { kind: 'page', url: '/theory/tonal-centers', title: 'Tonal Centers & Keys' },
  'theory-chord-progressions': { kind: 'page', url: '/theory/chord-progressions', title: 'Chord Progressions' },
  'theory-modes':             { kind: 'page', url: '/theory/modes', title: 'Modes' },
};

// ════════════════════════════════════════════════════════════════════
// TOPICS
// ════════════════════════════════════════════════════════════════════

const stub = (title, category, see_also = [], summary = '') => ({
  title, status: 'stub', category, kind: 'fact', see_also, summary, body: '',
});

const TOPICS = {

  // ── Tool topics: how the page works ───────────────────────────────

  'tension-scoring': {
    title: 'How tension is scored',
    status: 'claude-draft', category: 'tool', kind: 'heuristic', panel: 'chart',
    see_also: ['intervals-that-rub', 'melody-toggle', 'register-and-low-interval-limits', 'explore-ranking', 'intro-intervals-scales'],
    summary: 'Each bar’s column is the tension of its most tense chord event: every pair of notes among bass and voicing, scored by interval class and stacked by colour. The weights are a design choice, not a law of music.',
    body: `
      ## What the chart shows

      One column per bar. Its height is the **total tension** of the bar's most
      tense comp event (when two events tie, the earlier one). The column is
      stacked by interval type, bottom to top: ${bucketList}. Faded columns are
      bars marked *arranged* in the data rather than transcribed; a green
      outline marks a bar where you have kept an Explore candidate. The row of
      numbers under the bars is the upper-voice motion into each bar, in
      semitones ("–" when either side has no voicing). Section names run along
      the top.

      Click a bar or use ← → to select it; Shift+← → steps through the comp
      events inside a bar and across bar lines.

      ## How a pair of notes is scored

      Every pair among the bass and the voicing notes is measured in
      semitones, reduced to its **interval class** (the span mod 12), and
      given a weight. Only four classes score; everything else — unisons,
      3rds, 4ths, 5ths, 6ths, minor 7ths, octaves — scores 0 in any register.

      | Class (span mod 12) | Weight | Octave discount | Compound examples (span) weight |
      |---|---|---|---|
      ${weightRows}
      | anything else | 0 | — | 0 in any register |

      The **octave discount** is applied once per extra octave. Minor 2nds and
      tritones keep rubbing when spread out (a minor 9th scores
      ${fmt(tensionWeight(13))}, a minor 16th ${fmt(tensionWeight(25))}); a major 2nd
      or major 7th stretched past an octave becomes a 9th or 14th — a colour,
      not a rub — and scores ${fmt(tensionWeight(14))}.

      ## Examples you can load

      - Maple Leaf Rag bar 9 (Bdim7, bass D4, voicing F4 A♭4 B4): two tritones,
        D4–A♭4 and F4–B4, ${TENSION_WEIGHTS[6]} each — total ${2 * TENSION_WEIGHTS[6]}.
      - Fixture bar 3 (Cmaj7/B, bass B2, voicing C4): one minor 9th, 13
        semitones — ${TENSION_WEIGHTS[1]} × ${frac(OCTAVE_DISCOUNTS[1])} = ${fmt(tensionWeight(13))}.
      - Maple Leaf Rag bar 1 (A♭ triad): no weighted pairs — 0.

      ## The melody, when it is switched on

      With the [melody toggle](melody-toggle) on, each melody pitch is also
      checked against every comp note (bass included). Its contribution is
      the pair's weight × the time the melody note overlaps the comp event ÷
      beats per bar. Fixture bar 7 (C, voicing E4): the melody's F4 sounds for
      2 of 4 beats against E4, a minor 2nd — ${TENSION_WEIGHTS[1]} × 2/4 =
      ${fmt(TENSION_WEIGHTS[1] * 2 / 4)}. Melody that sounds while no comp
      event sounds is not scored, and melody notes are never scored against
      each other.

      ## This is a heuristic

      The weights and discounts are tuning knobs chosen by ear on a few
      pieces, not a theory of dissonance. They are deliberately coarse:
      a chord's tension is one number so bars can be compared at a glance.
      Register (a low minor 9th is muddier than a high one) and metric
      position (a downbeat clash counts more) are not modelled yet.
    `,
    notes: 'Weights/discounts are read from TENSION_WEIGHTS / OCTAVE_DISCOUNTS. Register and beat-position weighting are open questions in the build plan.',
  },

  'melody-toggle': {
    title: 'The melody toggle',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'melody',
    see_also: ['tension-scoring', 'playback', 'melody-rule', 'melody-against-harmony'],
    summary: 'Off by default. Off removes the melody from the analysis and mutes it in playback; on scores it against each chord event and lets you hear it. The staff always draws it; the Tonnetz never shows it.',
    body: `
      The toggle couples two things on purpose, so that what you hear is what
      is being scored:

      - **Off** (the default): the melody is left out of every tension number
        and of named-vs-played, and it is muted in playback.
      - **On**: each melody pitch is scored by how long it overlaps each comp
        event (see [how tension is scored](tension-scoring)), melody notes
        light up green on the keyboard, and the melody is heard in playback.

      The staff always draws the melody, either way, and the Tonnetz never
      shows it — the Tonnetz is the chord's shape only. The state lives in the
      URL as \`&melody=1\`, so a link keeps it.

      Switching the toggle re-analyses the piece and keeps your selected bar
      and event. Expect the chart to change where the tune rubs against the
      comp: in the fixture, bar 7 goes from 0 to
      ${fmt(TENSION_WEIGHTS[1] * 2 / 4)} (the melody's F4 a minor 2nd above the
      voicing's E4 for half the bar) and bar 8 from ${TENSION_WEIGHTS[11]} to
      ${fmt(TENSION_WEIGHTS[11] + TENSION_WEIGHTS[11] * 4 / 4)} (the melody's B♭4 a
      major 7th above the voicing's B3 for the whole bar).

      Explore's [melody rule](melody-rule) — voicings are generated below the
      tune — is **not** affected by the toggle; it only decides whether the
      melody is scored and heard.
    `,
    notes: 'Fixture bar 7: melody F4 (2 of 4 beats) vs voicing E4 = m2. Fixture bar 8: comp G3–F♯4 = M7 (1); melody B♭4 (4 beats) vs B3 = 11 semitones = M7 (1 × 4/4); vs G3 = 15, D4 = 8, F♯4 = 4 — all weight 0. Both checked in node 2026-10-17.',
  },

  'playback': {
    title: 'Playback: bar, event, lead-in, rolls',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'play',
    see_also: ['melody-toggle', 'selected-bar', 'roles-in-the-data', 'staff-panel'],
    summary: 'Play plays the selected bar with a short lead-in; Shift+Play plays just the selected chord event. Rolled chords roll, held basses hold, and nothing plays unless you ask.',
    body: `
      ## Two scopes

      - **Play bar** (button, or \`P\`): the whole selected bar, as the staff
        draws it — the bass voice from the bass line when the bar has one,
        the chords, and the melody when the toggle is on.
      - **Play event** (Shift+click, or \`Shift+P\`): just the selected comp
        event — its bass and voicing for the event's duration, plus any
        melody notes overlapping that window, clipped to it. This is exactly
        the set of notes the analysis scores for that event.
      - \`Esc\` stops. Selecting another bar or event, or flipping the melody
        toggle, also stops. Nothing ever plays on its own.

      ## The lead-in

      A note tied into the bar from the previous bar is not struck again at
      the bar line; instead playback starts early, in the **performance
      predecessor** (the bar before this one in the play order — for a
      second ending, the bar before the first ending), at the earliest onset
      of those tied notes, but never more than ${LEAD_IN_MAX_BEATS} beat before
      the bar. Everything in the predecessor from that point plays, a touch
      softer (${LEAD_IN_GAIN} of normal), and nothing lights up on the staff or
      keyboard until beat 0. Bar 1 has no lead-in. With the melody off, melody
      ties neither trigger nor extend the lead-in.

      A bass carried into the bar by the exporter's lookback (see
      [roles in the data](roles-in-the-data)) is held in the same way. In
      event scope, a bass that was struck **earlier in the same bar** than the
      selected event sounds from its real onset, and the chord enters at the
      event's beat.

      ## Rolls

      A comp event flagged as arpeggiated rolls bottom to top, ${ARP_STEP_MS} ms
      between notes, with the whole spread capped at ${frac(ROLL_SPREAD_FRACTION)}
      of the event's duration; every note then holds to the event's end. The
      bass leads the roll only when the bass-line note under the chord is
      also flagged and attacks with the chord.

      ## Sound

      The first Play downloads a sampled piano (about 2 MB, 29 samples):
      Salamander Grand Piano by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), pinned to version
      \`${SALAMANDER_VERSION.slice(0, 12)}\`. Tempo comes from the piece
      (${DEFAULT_TEMPO} when it has none). Velocities by role: ${velocityList}.
      The nav's speaker button mutes everything; if the browser blocks audio
      (no live click for ${START_TIMEOUT_MS / 1000} s) the button asks you to click again.

      While playing, the staff and keyboard light the notes sounding right
      now and restore the selected event's normal view at the end.
    `,
  },

  'selected-bar': {
    title: 'Reading the Selected bar panel',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'selected',
    see_also: ['roles-in-the-data', 'chord-symbols', 'voice-leading', 'intervals-that-rub', 'named-vs-played'],
    summary: 'The chord symbol in effect, the bar’s tags, one chip per chord event, and the selected event’s bass, voicing, tension and voice-leading distance from the previous voicing.',
    body: `
      ## Symbol and tags

      The big symbol is the chord in effect **at the selected event's onset**,
      in the engine's spelling (so \`Bb7\` in the data reads B♭7). Tags:
      **hold** means the bar has no symbol of its own and carries the previous
      one; the section name; and the bar's **source** — *transcribed* (as
      played), *arranged* (our arrangement; faded in the chart), *user* (you
      kept an Explore candidate here) or *preview* (an Explore row is being
      previewed, not kept).

      ## Event chips

      One chip per run of identical consecutive comp events: the beat it
      starts on (counting from 1), its symbol, ×count when the same chord
      repeats, and its tension (coral when above 0). Click a chip to select
      that event; everything else on the page — staff, keyboard, Tonnetz,
      rubs, named-vs-played, Explore — follows. A bar opens on its most tense
      event, so the panels agree with the chart's column on arrival.

      ## Bass, voicing, tension

      **Bass** is the bass note sounding under this event, found by the
      exporter's lookback rule (see [roles in the data](roles-in-the-data)).
      **Voicing** is the comp notes as written. **Tension** is this event's
      total (see [how tension is scored](tension-scoring)).

      ## Motion

      Motion is how far the upper voices move, in semitones, summed across
      voices (see [voice leading](voice-leading)):

      - **into**, on a bar's first event: from the last event of the
        **performance predecessor** — the bar before this bar's first
        occurrence in the play order, so a second ending follows the bar
        before the first ending.
      - **step**, on later events: from the previous event in this bar.

      With equal voice counts the voices pair low-to-high. With unequal
      counts the pairing with the least total movement is used, and the
      leftover voices of the larger voicing are listed as **free** (they cost
      nothing). "n/a" means one side has no voicing: in the Maple Leaf Rag,
      bars 5–8 are bass only, so bar 9 shows no "into" here. Explore's
      *motion in* looks further back, to the nearest event that has a voicing
      (bar 4), so the two numbers can differ.
    `,
  },

  'roles-in-the-data': {
    title: 'Roles in the data: comp, bass, melody',
    status: 'claude-draft', category: 'tool', kind: 'fact',
    see_also: ['selected-bar', 'staff-panel', 'chord-symbols', 'explore-panel', 'chord-tones-and-roles'],
    summary: 'A piece is stored as bars of chord symbols, comp events (bass + voicing), an optional written bass line and a melody. The roles are the interface: Explore re-voices the comp and never touches bass or melody.',
    body: `
      Every piece on this page is a JSON document (schema v1,
      \`tools/voicings/schema.md\`) with spelled note names as the source of
      truth — the written spelling decides degree labels, so a D♯ and an E♭
      are different things even though they are the same key.

      ## The roles

      - **comp** — the chord events. Each has a beat, a duration, a **bass**
        note and a **voicing** (the notes above it), plus optional tie and
        arpeggio flags. This is what the analysis scores and what Explore
        re-voices.
      - **bassLine** (optional) — the bass voice as written: held basses
        under later chord attacks, walking lines under a held chord. The
        staff and bar playback draw the bass from here when it exists.
      - **melody** — the tune, one note per event.
      - **symbols** — chord symbols with the beat they start on. A bar with
        none carries the previous bar's symbol (the *hold* tag).

      ## Which bass belongs to a chord

      A comp event's bass is found by **lookback**: the most recent bass-voice
      onset at or before the chord's onset in the bar; otherwise a bass tied
      or still sounding from the previous bar; otherwise the lowest chord
      note. An exact-octave doubling of the bass in the bass voice never
      joins the voicing (other dyads do). Two deliberate reductions in the
      exporter: grace notes in bass walks are dropped, and a bass dyad keeps
      only its lower note in the bass line.

      ## Source tags

      *transcribed* bars are as played; *arranged* bars are our arrangement
      and draw faded in the chart; *user* marks a bar where an Explore
      candidate has been kept. The Maple Leaf Rag fixture carries
      \`chordSymbols: "derived"\`: Joplin wrote no symbols, so the ones you see
      are our harmonic reading of the notes.

      ## What Explore may change

      Only \`comp[].voicing\`. Bass, bass line, melody and symbols are pinned.
      Choosing which notes are *comp* and which are *melody* is a
      transcription decision made before the data reaches this page.
    `,
  },

  'staff-panel': {
    title: 'Reading the staff',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'staff',
    see_also: ['roles-in-the-data', 'keyboard-panel', 'playback', 'intro-sound'],
    summary: 'An engraved grand staff of the selected bar, coloured by role: bass gold, voicing blue, melody green. Click a notehead to find it on the keyboard; clicking another event’s chord selects that event.',
    body: `
      The bar is engraved by Verovio ${VEROVIO_VERSION}, loaded on the first
      render (the panel says *loading*, or *unavailable* if the download
      fails). Colours follow the roles everywhere on the page: **bass gold,
      voicing blue, melody green**.

      ## Layout

      - Treble staff: the melody (stems up) and the upper part of the voicing
        (stems down).
      - Bass staff: the lower part of the voicing (stems up) and the bass
        (stems down).
      - Voicing notes at or above **${noteName(SPLIT_MIDI)}** go to the treble
        staff, below it to the bass staff — so a chord that straddles
        ${noteName(SPLIT_MIDI)} is drawn across both staves. Keeping each chord
        on one staff is a known polish item.

      The melody is **always drawn**, whatever the melody toggle says. The
      bass voice is drawn from the written bass line when the bar has one
      (held basses, walks), otherwise from each chord event's bass.

      ## Ties, accidentals, dimming

      A tie is drawn only when the same pitch really sounds at beat 0 of the
      next bar (or at the next event in this bar), with "next" meaning the
      next bar in the play order. Accidentals are key-aware and carry through
      the bar on each staff. The comp notes of the events you have **not**
      selected are dimmed; the bass line and melody stay bright.

      ## Clicking

      Click a notehead: it is highlighted and its key is ringed on the
      keyboard. Click a comp note that belongs to another event: that event
      becomes the selected one. During playback the noteheads sounding right
      now light up, piece by piece for tied and dotted values.

      The rag's sixteenths are drawn unbeamed for now, so its melody reads
      busier than the printed edition.
    `,
  },

  'tonnetz-panel': {
    title: 'The Tonnetz on this page',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'tonnetz',
    see_also: ['intro-tonnetz', 'intro-transforms', 'selected-bar', 'voicings-as-shapes'],
    summary: 'The Tonnetz shows exactly the selected event’s bass and voicing as lit notes, centred on the piece’s key. It never shows the melody, so what you see is the chord’s shape.',
    body: `
      The Tonnetz is SongLab's shared pitch lattice (see
      [Meet the Tonnetz](intro-tonnetz)): every note is a node, and neighbours
      are a fifth, a major third or a minor third apart, so chords are compact
      clusters and close harmonies sit close together.

      On this page it is **comp-only**: it lights the selected event's bass
      and voicing notes — the actual pitches, octave-faithful — and nothing
      else. The melody is deliberately left off, so the shape you see is the
      chord, not the tune passing over it. A previewed Explore candidate shows
      here immediately.

      The lattice is centred on the piece's key at depth 3, so all twelve
      pitch classes are on the grid. The faint trail is the **previous**
      chord, so you can see how far the harmony moved. The grid is not
      interactive here; select bars and events in the chart or the Selected
      bar panel.
    `,
  },

  'intervals-that-rub': {
    title: 'Intervals that rub',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'rubs',
    see_also: ['tension-scoring', 'register-and-low-interval-limits', 'melody-toggle'],
    summary: 'Every scoring pair of notes in the selected event, the interval between them and its weight. These rows add up to the event’s tension.',
    body: `
      One row per pair of notes that scores (see
      [how tension is scored](tension-scoring)): the two notes, lowest first,
      the interval's name with its span in semitones, and the weight it
      contributes. The swatch matches the chart's colours. Pairs that score 0
      — 3rds, 4ths, 5ths, 6ths, minor 7ths, octaves — are not listed, so
      "No rubs in this voicing" simply means the total is 0.

      Compound intervals are named as such: *minor 9th*, *minor 16th*,
      *tritone + octave*. A major 9th or major 14th never appears here because
      its weight is ${fmt(tensionWeight(14))}.

      With the melody toggle on, a second kind of row appears: *melody note /
      comp note*, the interval, how many beats the melody note sounds against
      that chord, and its share of the total (weight × beats ÷ beats per
      bar).

      Examples: Maple Leaf Rag bar 9 lists two tritones, D4–A♭4 and F4–B4,
      +${TENSION_WEIGHTS[6]} each. Fixture bar 5 (Gm7/F, voicing A3 B♭3 D4)
      lists one minor 2nd, A3–B♭3, +${TENSION_WEIGHTS[1]}: the 9th sitting a
      semitone under the ♭3.
    `,
  },

  'named-vs-played': {
    title: 'Named vs played',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'nvp',
    see_also: ['chord-symbols', 'chord-tones-and-roles', 'omitting-tones', 'extensions', 'guide-tones-and-shells'],
    summary: 'The chord symbol’s tones against the pitches actually played: which named tones are present, which are left out, and what was added. Degree labels come from the written spelling.',
    body: `
      The chord symbol names a set of tones; the player played some set of
      pitches. This panel compares them for the selected event:

      - **Played** — named tones that are present, with their degree
        (R, 3, ♭3, 5, ♭7, 7, …).
      - **Left out** — named tones that are absent, spelled relative to the
        chord. Leaving out the 5th is routine; leaving out the 3rd or 7th
        changes what the chord says (see [omitting tones](omitting-tones)).
      - **Added** — played pitches the symbol does not name, labelled as
        extensions: 9, ♯11, 13 and so on (see [extensions](extensions)).

      The pitches compared are the bass and the voicing — plus the melody
      notes overlapping the event when the melody toggle is on. A **slash
      bass** counts as named: in \`E♭7/B♭\` the B♭ is part of the symbol.

      ## How degrees are labelled

      The label follows the **letter distance** from the root, so the
      written spelling matters: a 6th above the root reads as 13, a 2nd as 9,
      a 4th as 11, each with its accidental. In fixture bar 6 (\`A7♯11/C♯\`,
      bass C♯3, voicing G3 D♯4) the D♯ is labelled ♯11 because it is written
      D♯; written as E♭ it would read ♭5. Left out: A (R) and E (5).

      Maple Leaf Rag bar 12, second event (\`E♭7/D♭\`, bass E♭4, voicing
      G4 D♭5): played E♭ (R), G (3), D♭ (♭7); left out B♭ (5) — a shell with
      the 5th dropped, which is the usual economy.

      "Chord symbol not understood" means the symbol's suffix is not in the
      parser's table (see [chord symbols](chord-symbols)); Explore then has
      nothing to generate from.
    `,
  },

  'chord-symbols': {
    title: 'Chord symbols the page understands',
    status: 'claude-draft', category: 'tool', kind: 'fact',
    see_also: ['named-vs-played', 'explore-panel', 'intro-chords', 'intro-beyond-triads'],
    summary: 'Root, an optional suffix from a fixed table, and an optional slash bass. Unknown suffixes are not guessed: the event shows no named-vs-played and Explore stays empty.',
    body: `
      A symbol is parsed as **root** (A–G with ♯, ♭, #, b or -), a **suffix**
      from the table below, and an optional **/bass**. Δ, ° and ø are
      accepted for maj, dim and half-diminished. Anything else is reported as
      "not understood" rather than guessed, so a mislabelled bar is visible.

      | Chord type | Semitones above the root | Suffixes accepted |
      |---|---|---|
      ${chordTypeRows}

      Intervals above 12 are extensions the symbol names (14 = 9th, 18 =
      ♯11). Named-vs-played, Explore's tone pool and the degree labels all
      read from this table, so a symbol's spelling (\`Bb7\` or \`B♭7\`) does not
      change the analysis.
    `,
  },

  'explore-panel': {
    title: 'Explore: candidate voicings',
    status: 'claude-draft', category: 'tool', kind: 'heuristic', panel: 'explore',
    see_also: ['explore-ranking', 'melody-rule', 'chord-symbols', 'named-vs-played', 'voicings-as-shapes', 'melody-against-harmony', 'extensions'],
    summary: 'For the selected chord event, Explore enumerates other voicings of the same chord from two sources, scores them exactly as the piece is scored, and ranks them against a tension target. Preview any row in every panel; Keep swaps it in without touching the piece.',
    body: `
      ## Two sources of candidates

      1. **The chord symbol.** The tone pool is the symbol's named tones
         (slash bass included) plus the 9th; a dominant type (major 3rd and
         minor 7th) also gets the 13th and the ♯11. The 9th is skipped when
         the symbol already names a ♭9 or ♯9. Extensions sit at fixed
         offsets above the root: ${extensionList} semitones. Every
         combination of pool tones in the window below is a candidate — no
         pitch class twice, and the bass's pitch class is not doubled.
      2. **Harvested shapes — your vocabulary.** Every voicing in the loaded
         piece is recorded as a *shape*: its degree labels (R, 3, 7, 9, …)
         and its layout above the bass. Each shape is re-instantiated on the
         selected chord — R, 3, 5 and 7 take the target chord's version
         (a ♭3 on a minor chord, a ♭7 on a dominant), extensions keep their
         accidental. A shape the chord cannot supply (a 7th on a triad) is
         skipped with a reason. Shapes are exempt from the tone pool — they
         may bring the 6th of a major triad, say — but not from the window,
         span or voice count. A voicing reachable from both sources is one
         row with both tags.

      ## The window (a heuristic)

      Every candidate note lies between **${MIN_ABOVE_BASS} semitones above
      the bass** and **one semitone below the lowest melody note sounding in
      the event**; with no melody in the event, the ceiling is the highest
      comp note anywhere in the piece. No candidate note doubles a melody
      pitch at the unison; seconds against the melody are allowed and
      scored. The span from lowest to highest voicing note is at most
      **${DEFAULT_MAX_SPAN} semitones**. The voice count matches the original
      (bounded ${MIN_COUNT}–${MAX_COUNT}; ${DEFAULT_COUNT} when the original has
      none); *voices ±1* widens it.

      "Below the melody" is a solo-piano assumption with a known blind spot
      and a fallback when the tune dips; see [the melody rule](melody-rule).

      ## Reading a row

      ${EXPLORE_ROWS} rows at most, ranked (see [ranking](explore-ranking)).
      Each shows the bass and the candidate's notes, its tension with the
      change from the **original** voicing (coral up, blue down), motion
      **in · out** — voice-leading distance from the nearest earlier event
      *with* a voicing and to the nearest later one, skipping bass-only bars —
      what the candidate leaves out of the symbol and what it adds, and its
      source: *symbol*, or *shape* with the shape's degrees (or its name,
      when it has one).
      ● marks the original voicing, ◆ a kept one.

      ## Preview, Keep, Revert

      Click a row (or step with \`[\` \`]\`) to **preview** it: detail, staff,
      keyboard and Tonnetz all redraw from a trial copy of the piece; ▶ on
      the row plays the event (Shift: the bar). **Keep** (\`K\`) stores the swap
      as an override: the bar turns green in the chart and its source reads
      *user*. A kept voicing on a chord tied into the next bar carries into
      that bar's held chord too. **Revert bar** and **Reset all** drop
      overrides; **Copy JSON** copies them. The loaded piece is never
      modified, and overrides are not saved between visits yet.

      ## An example

      Maple Leaf Rag bar 9 (Bdim7, bass D4): the pool is B (R), F (♭5),
      A♭ (♭♭7) and C♯ (9) — D is the bass and is excluded. At three voices
      the window admits 21 candidates; the original F4 A♭4 B4 is also the
      only shape candidate, because the same layout appears in bars 9 and 13.
    `,
  },

  'explore-ranking': {
    title: 'How Explore ranks candidates',
    status: 'claude-draft', category: 'tool', kind: 'heuristic',
    see_also: ['explore-panel', 'tension-scoring', 'voice-leading', 'omitting-tones'],
    summary: 'Closest to the tension target first, in steps of a half; ties broken by less voice movement in and out, then by fewer named tones left out. A ranking rule, not a rule of music.',
    body: `
      Candidates are sorted by three keys in order:

      1. **Distance from the target**: |candidate tension − target|, rounded
         to the nearest ${TARGET_STEP}. The target defaults to the original
         voicing's tension; − and + (or \`-\` and \`=\`) nudge it by
         ${TARGET_STEP}.
      2. **Motion**: voice-leading distance in from the previous voiced event
         plus out to the next, in semitones (see [voice leading](voice-leading)).
         Less movement ranks higher.
      3. **Fewer named tones left out** of the chord symbol.

      Remaining ties fall back to note names, so the order is stable.

      Because distance is bucketed in steps of ${TARGET_STEP}, every candidate
      within a step of the target ties on key 1 and motion decides the order
      inside the bucket. That creates cliffs: nudging the target by one step
      can move a row many places, and the motion-first tiebreak can favour
      blander voicings. Both are known and open to tuning; the ranking is a
      design choice to make the list browsable, not a claim about which
      voicing is better.

      ## The dominant rule

      Before ranking, on dominant chord types (a major 3rd with a ♭7), some
      candidates are dropped outright: ${DOMINANT_RULE.map(dominantRuleText).join('; ')}.
      The bass note counts as sounding, so a slash ♭7 or slash 3rd satisfies
      the clause it supplies. The bar's own voicing is never dropped, and
      the Explore hint says how many candidates the rule removed and why.
      This is a rule of thumb from listening, not a rule of music: on a
      dominant, a voicing of 9 and 3rd with no ♭7 did not sound dominant
      while 9 and ♭7 with no 3rd did, and a [♯11](sharp-eleven-on-dominants)
      without its 3rd drifted towards the Lydian sound of the home key.
      Whether the 3rd should be required too was decided by ear on one bar
      and is open to revision.
    `,
  },

  'melody-rule': {
    title: 'The melody rule: voicings stay below the tune',
    status: 'claude-draft', category: 'tool', kind: 'heuristic',
    see_also: ['explore-panel', 'melody-toggle', 'melody-against-harmony', 'tension-scoring'],
    summary: 'Explore only proposes voicings whose top note sits below the lowest melody note sounding in the event. A solo-piano assumption, with a fallback when the tune dips and a known blind spot for a separate melody instrument.',
    body: `
      When Explore generates candidates for a chord event, every note must
      lie **at least ${MIN_ABOVE_BASS} semitones above the bass** and **at
      least one semitone below the lowest melody note that sounds during
      the event**. No candidate note may land on a melody pitch at the
      unison. Seconds against the melody are allowed and are scored as
      tension like any other pair. When no melody sounds in the event, the
      ceiling is instead the highest comp note anywhere in the piece, so
      Explore stays inside the register the player actually used.

      ## Why

      This is how solo piano usually works: the right hand carries the tune
      on top and the left hand voices the chord underneath it, so a voicing
      that crosses above the melody would bury it. Keeping candidates below
      the tune also keeps the comparison fair — every candidate is heard in
      the same relationship to the melody as the original.

      ## The fallback

      Sometimes the melody dips inside the event — it starts high and drops
      below where any voicing of the wanted size could fit. Then the window
      is too narrow and nothing is generated. Explore falls back to the
      melody note **at the event's onset** as the ceiling, flags the panel
      ("fallback: the melody dips inside this event"), and lets the later
      clashes show up as tension in the scores rather than hiding them.

      ## What it gets wrong

      The rule is **not** switched off by the melody toggle: candidates are
      always generated under the tune, whether or not the melody is being
      scored. And it is a solo-piano rule. With a separate melody instrument
      — a singer, a horn — piano voicings routinely sit at or above the
      tune, and inner-voice melodies break it too. The planned fix is for
      the melody to carry its instrument so a separate melody allows
      crossing; until then, treat the candidate list as "voicings under
      this tune" and nothing more.
    `,
  },

  'keyboard-panel': {
    title: 'Reading the keyboard',
    status: 'claude-draft', category: 'tool', kind: 'fact', panel: 'keyboard',
    see_also: ['staff-panel', 'melody-toggle', 'playback', 'roles-in-the-data'],
    summary: 'The selected event on a keyboard sized to the piece: bass gold, voicing blue, melody green when the toggle is on. Keys are labelled with their written spelling.',
    body: `
      The keyboard shows the selected event's notes by role, in the same
      colours as the staff and the Explore rows: **bass gold, voicing blue**,
      and **melody green** when the melody toggle is on. Lit keys are
      labelled with the note as written in the data, so the same key may
      read D♯ in one bar and E♭ in another.

      Its range is set per piece: the lowest and highest written notes,
      rounded out to whole octaves (the Maple Leaf Rag runs C1–B6). Each C is
      labelled for orientation.

      Clicking a notehead on the staff rings its key here. During playback
      only the keys sounding right now are lit, by role; when one pitch has
      two roles at once, bass wins over melody, melody over voicing.
    `,
  },

  // ── Theory topics ─────────────────────────────────────────────────

  'guide-tones-and-shells': {
    title: 'Guide tones and shells: the two notes that say what a chord is',
    status: 'claude-draft', category: 'theory', kind: 'fact',
    see_also: ['chord-tones-and-roles', 'extensions', 'omitting-tones', 'rootless-voicings', 'tritone', 'named-vs-played', 'intro-beyond-triads'],
    summary: 'A seventh chord’s 3rd and 7th carry its identity; the root and 5th are shared by most chord types. Bass plus 3rd and 7th is a shell voicing: the smallest voicing that still says the chord.',
    body: `
      ## Guide tones

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
      form a [tritone](tritone) (E to B♭ in C7), the tension that makes the
      chord want to resolve.

      ## Shells: the smallest voicing that still says the chord

      Because the guide tones carry the chord's identity, you can play just
      them over the bass and the chord comes through. This is a **shell
      voicing**: root in the bass, then 3rd and 7th above, in either order:

      - C2 bass, E3 and B♭3 above (3rd below the 7th)
      - C2 bass, B♭3 and E4 above (7th below the 3rd)

      Here is the first one to hear: the bass, then the 3rd and the 7th above it.

      [[example c7-shell-3-below-7]]

      And the same two notes the other way up.

      [[example c7-shell-7-below-3]]

      The 5th is left out, and it's rarely missed. That economy is the point:
      a shell leaves room for a melody on top and for
      [extensions](extensions) (9ths, 13ths) to be added as colour.

      ## What happens when a guide tone goes missing

      Dropping the 5th is almost always safe. Dropping a guide tone is
      different: without its 7th, C7 can stop sounding like a dominant at
      all. Leaving out the 3rd is often fine when the 7th is there; the chord
      turns more open and ambiguous, but it keeps its character. See
      [omitting tones](omitting-tones).

      ## Hear it

      The textbook case: play C2 in the bass, then E3 and B♭3 above it. That
      is a C7 shell — root, 3rd, 7th, no 5th — and it already sounds like a
      dominant waiting to resolve. Swap the two upper notes for B♭3 and E4
      and it is the same shell the other way up. Now take the B♭ away: what
      is left (C and E) could be any C chord. Take the E away instead: C and
      B♭ still lean towards F.

      The same thing in a real piece: load the Maple Leaf Rag and select bar
      12's second event (E♭7, bass E♭4, voicing G4 D♭5). That is a shell, 3rd
      below the 7th, with the 5th left out — the panel shows B♭ (5) as the
      only tone left out. In the Explore panel, compare it with a candidate
      that drops the D♭ instead and listen for the dominant quality going.
    `,
    notes: `Moved from docs/active-plans/explainer-content.md (T2 draft). Claims to verify against Levine
      (The Jazz Theory Book for qualities and extensions; The Jazz Piano Book for shells and register):
      1. [ ] The 3rd and 7th define a seventh chord's quality; the root and 5th are shared across chord types.
      2. [ ] The 3rd and 7th are called "guide tones".
      3. [ ] In a dominant 7th, the 3rd and 7th form a tritone, and that tritone is the source of its pull to resolve.
      4. [ ] A shell voicing is the root plus 3rd and 7th, in either order, with the 5th omitted. (Likely in The Jazz Piano Book.)
      5. [ ] The 5th is the most expendable chord tone.
      6. [ ] Omitting the 7th can change a dominant's identity, while omitting the 3rd (7th present) keeps more of the chord's character. Least certain.
      7. [ ] Shells leave room for melody and extensions. Framing; check it matches Levine's reasoning.
      Possible additions if Levine covers them: shells' association with Bud Powell; guide tones moving by step through a
      ii–V–I (Dm7–G7–Cmaj7: F→F→E and C→B→B). Cite the book as further reading after verification; never copy its text.
      The rag bar 12 example was checked in code (namedVsPlayed: played R 3 ♭7, left out 5).`,
  },

  'chord-tones-and-roles': {
    title: 'Chord tones, degrees and slash chords',
    status: 'verified', category: 'theory', kind: 'fact',
    see_also: ['guide-tones-and-shells', 'extensions', 'named-vs-played', 'roles-in-the-data', 'intro-chords'],
    summary: 'Every note in a chord has a number — its distance from the chord’s root — and that number tells you what job the note is doing.',
    body: `
      ## What it is

      A chord is built up from a root by stacking notes a third apart. Each
      note is named by how far it sits above the root: the root is 1, then
      3, 5 and 7. Go past the octave and the stack continues as 9, 11 and
      13 — the same letters as 2, 4 and 6, an octave higher.

      The number alone isn't the whole name. A flat sign marks a degree
      that is a half step lower than in the major scale built on the root:

      | Chord | Degrees | Spelled on C |
      |---|---|---|
      | Cmaj7 | 1 3 5 7 | C E G B |
      | C7 | 1 3 5 ♭7 | C E G B♭ |
      | Cm7 | 1 ♭3 5 ♭7 | C E♭ G B♭ |
      | Cm7♭5 | 1 ♭3 ♭5 ♭7 | C E♭ G♭ B♭ |
      | Cdim7 | 1 ♭3 ♭5 ♭♭7 | C E♭ G♭ B♭♭ |

      Each degree also has a role:

      - The **root** names the chord. It's often, but not always, in the bass.
      - The **3rd and 7th** decide the chord's quality — major, minor or
        dominant. Change either one and you have a different chord.
      - The **5th**, when it's a perfect 5th, usually adds the least. In
        practice it's the tone players most often leave out. An altered 5th
        (♭5 or ♯5) is a different matter: it changes the chord's sound and is
        usually kept. That's a rule of thumb, not a law.
      - **9, 11 and 13** are colour. They're added on top of the basic chord
        rather than defining it.

      ## Hear it

      These three chords share a root and a perfect 5th. Only the 3rd and
      7th change.

      [[example cmaj7-close]]

      [[example c7-close]]

      [[example cm7-close]]

      ## In a real piece

      In bar 2 of Maple Leaf Rag the bass plays B♭, but the chord is E♭7.
      Counted from E♭, the bass note is the 5th, not the root. Degrees are
      always counted from the chord's root, not from the lowest note.

      [[example eb7-over-bb-rag]]

      ## Common confusions

      - **Degrees count from the chord, not the key.** In the key of C, a
        D7 chord's 3rd is F♯. It's the 3rd of D, not the 3rd of the key.
      - **"7" and "maj7" are different 7ths.** In a chord symbol, a plain 7
        means ♭7 (C7 has B♭). Only "maj7" means the 7th a half step below the
        root (Cmaj7 has B).
      - **9 vs 2, 11 vs 4, 13 vs 6.** They're the same letter. With a 7th in
        the chord, the higher numbers are the usual names. Over a plain triad
        you'll see "add2" or "6" instead.
      - **The degree fixes the letter name.** In A♭7 the ♭7 is G♭, not F♯,
        because a 7th above A must be some kind of G. That's also why Cdim7
        has B♭♭, not A.

      ## Try it

      - Play C7, then lower only the E to E♭. You've made Cm7.
      - On /voicings, pick any bar and read the degree line in the Theory
        card. Find a bar where the bass isn't the root.

      ## Sources

      Levine, *The Jazz Theory Book*.
    `,
    notes: `T1. Verified by Dustin from own knowledge, 2026-10-20. Claim 7 is a heuristic.
      1. [x] Chords are built by stacking thirds above a root.
      2. [x] Degrees past the octave are 9, 11, 13, the same letters as 2, 4, 6.
      3. [x] ♭ on a degree means a half step below the major-scale degree on the root.
      4. [x] Degree formulas and spellings for maj7, 7, m7, m7♭5, dim7 as tabled.
      5. [x] Cdim7's 7th is spelled B♭♭. (𝄫 replaced by ♭♭ to match the engine's spelling and render in Nunito, 2026-10-20.)
      6. [x] The 3rd and 7th determine chord quality.
      7. [x] (heuristic) The perfect 5th is the chord tone most often omitted; an altered 5th is usually kept.
      8. [x] 9, 11, 13 are extensions (colour tones).
      9. [x] A plain "7" in a chord symbol means ♭7; "maj7" means the major 7th.
      10. [x] With a 7th present, 9/11/13 are the usual names; over a triad, "add2" or "6" is common.
      11. [x] Degrees are counted from the chord root, not the key or the bass.
      Examples (learn-example.js): cmaj7-close, c7-close, cm7-close (close position over C3; degrees from namedVsPlayed),
      eb7-over-bb-rag (E♭7/B♭ — strict link to rag bar 2 event 1, bassSource voice).
      Adaptation from the draft: the table gained the |---| separator row mini-markdown needs; the text is otherwise verbatim.`,
  },
  'extensions': stub('Extensions: 9, 11, 13 and their alterations', 'theory',
    ['guide-tones-and-shells', 'sharp-eleven-on-dominants', 'named-vs-played', 'explore-panel', 'intro-beyond-triads'],
    'Which chords take a 9th, an 11th or a 13th, which alterations (♭9, ♯9, ♯11, ♭13) belong where, and why they are colour rather than clash.'),
  'omitting-tones': stub('Omitting tones: what is safe to drop', 'theory',
    ['guide-tones-and-shells', 'named-vs-played', 'explore-ranking'],
    'The 5th goes first; the root can go when the bass has it; dropping a 3rd or 7th changes the chord.'),
  'sharp-eleven-on-dominants': stub('♯11 on dominant chords', 'theory',
    ['extensions', 'guide-tones-and-shells', 'tritone', 'explore-ranking'],
    'The ♯11 as a dominant colour (the Lydian dominant sound), and why it wants the ♭7 under it.'),
  'register-and-low-interval-limits': stub('Why some intervals rub: register and low interval limits', 'theory',
    ['tension-scoring', 'intervals-that-rub', 'intro-intervals-scales'],
    'Minor 2nds, minor 9ths and tritones; why the same interval is muddier low down; the old low-interval-limit tables.'),
  'voice-leading': stub('Voice leading, and why less motion is not always better', 'theory',
    ['selected-bar', 'explore-ranking', 'intro-transforms'],
    'Common tones, stepwise motion and contrary motion; what the motion number measures and what it misses.'),
  'voicings-as-shapes': stub('Voicings as shapes', 'theory',
    ['rootless-voicings', 'guide-tones-and-shells', 'explore-panel', 'tonnetz-panel'],
    'Clusters, shells, pairs over a slash bass: thinking of a voicing as a reusable layout of degrees.'),
  'rootless-voicings': stub('Rootless voicings: A-form and B-form', 'theory',
    ['guide-tones-and-shells', 'voicings-as-shapes', 'extensions'],
    'Four-note left-hand voicings without the root: 3–5–7–9 (A-form) and 7–9–3–5 (B-form), and how they alternate through a ii–V–I.'),
  'melody-against-harmony': stub('Melody against harmony', 'theory',
    ['melody-toggle', 'explore-panel', 'tension-scoring'],
    'The top voice is what the ear follows; solo piano versus a separate melody instrument; when a rub against the tune is the point.'),
  'tritone': stub('The tritone', 'theory',
    ['guide-tones-and-shells', 'intervals-that-rub', 'intro-intervals-scales'],
    'Six semitones: the interval inside every dominant seventh, and why it pulls.'),
};

// ════════════════════════════════════════════════════════════════════
// GLOSSARY — terms the Theory card and pills link out; value = TOPICS slug or EXTERNAL key
// ════════════════════════════════════════════════════════════════════

const GLOSSARY = {
  'guide tones':        'guide-tones-and-shells',
  'guide tone':         'guide-tones-and-shells',
  'shell':              'guide-tones-and-shells',
  'shell voicing':      'guide-tones-and-shells',
  'dominant seventh':   'guide-tones-and-shells',
  'rootless':           'rootless-voicings',
  'rootless voicing':   'rootless-voicings',
  'A-form':             'rootless-voicings',
  'B-form':             'rootless-voicings',
  'tritone':            'tritone',
  'minor 2nd':          'register-and-low-interval-limits',
  'minor 9th':          'register-and-low-interval-limits',
  'low interval limit': 'register-and-low-interval-limits',
  'register':           'register-and-low-interval-limits',
  'voice leading':      'voice-leading',
  'common tone':        'voice-leading',
  'motion':             'voice-leading',
  'oblique motion':     'voice-leading',
  'similar motion':     'voice-leading',
  'contrary motion':    'voice-leading',
  'extensions':         'extensions',
  'extension':          'extensions',
  'colour tones':       'extensions',
  'color tones':        'extensions',
  'alterations':        'extensions',
  '♯11':                'sharp-eleven-on-dominants',
  'Lydian dominant':    'sharp-eleven-on-dominants',
  'omitted':            'omitting-tones',
  'left out':           'omitting-tones',
  'chord tones':        'chord-tones-and-roles',
  'degree':             'chord-tones-and-roles',
  'slash chord':        'chord-tones-and-roles',
  'slash bass':         'chord-tones-and-roles',
  'shape':              'voicings-as-shapes',
  'cluster':            'voicings-as-shapes',
  'harvested shape':    'explore-panel',
  'tone pool':          'explore-panel',
  'melody rule':        'melody-rule',
  'below the melody':   'melody-rule',
  'piece ceiling':      'explore-panel',
  'tension target':     'explore-ranking',
  'dominant rule':      'explore-ranking',
  'ranking':            'explore-ranking',
  'tension':            'tension-scoring',
  'interval class':     'tension-scoring',
  'compound interval':  'tension-scoring',
  'octave discount':    'tension-scoring',
  'rub':                'intervals-that-rub',
  'named vs played':    'named-vs-played',
  'chord symbol':       'chord-symbols',
  'comp':               'roles-in-the-data',
  'bass line':          'roles-in-the-data',
  'transcribed':        'roles-in-the-data',
  'arranged':           'roles-in-the-data',
  'performance predecessor': 'selected-bar',
  'lead-in':            'playback',
  'roll':               'playback',
  'melody toggle':      'melody-toggle',
  'Tonnetz':            'intro-tonnetz',
  'Note Mode':          'tonnetz-panel',
};

// ════════════════════════════════════════════════════════════════════
// LOOKUP AND RENDERING
// ════════════════════════════════════════════════════════════════════

function getTopic(slug) { return TOPICS[slug] || null; }

/** Resolve a slug to a topic or an external page. */
function resolveSlug(slug) {
  const t = TOPICS[slug];
  if (t) return { kind: 'topic', slug, title: t.title, url: `/learn/${slug}`, status: t.status };
  const e = EXTERNAL[slug];
  if (e) return { kind: 'page', key: slug, title: e.title, url: e.url };
  return null;
}

/** mini-markdown link resolver: topic slug → /learn/<slug>; EXTERNAL key → its url; paths and http(s) pass through. */
function resolveLink(target) {
  const r = resolveSlug(target);
  const stub = r && r.kind === 'topic' && r.status === 'stub';
  if (r) return { href: r.url, title: stub ? `${r.title} — not written yet` : r.title, className: stub ? 'learn-link learn-link--stub' : 'learn-link' };
  if (/^\/[^\s]*$/.test(target)) return { href: target };
  if (/^https?:\/\/[^\s]+$/.test(target)) return { href: target, external: true };
  return null;
}

/** Glossary term → resolveSlug() result (case-insensitive, trims, tolerates "colour"/"color"). */
function glossaryLookup(term) {
  if (!term) return null;
  const want = String(term).trim().toLowerCase();
  for (const [k, slug] of Object.entries(GLOSSARY)) if (k.toLowerCase() === want) return resolveSlug(slug);
  return null;
}

/** Everything a pill or page needs to render one topic. */
function renderTopic(slug) {
  const t = TOPICS[slug];
  if (!t) return null;
  return {
    slug,
    title: t.title,
    status: t.status,
    disclaimer: DISCLAIMER[t.status] ?? null,
    category: t.category,
    kind: t.kind || 'fact',
    panel: t.panel || null,
    summaryHtml: renderInline(t.summary || '', { resolveLink }),
    html: renderMarkdown(t.body || '', { resolveLink, renderBlock: exampleBlockHook }),
    seeAlso: (t.see_also || []).map(resolveSlug).filter(Boolean),
  };
}

function topicsForPanel(panel) {
  return Object.entries(TOPICS).filter(([, t]) => t.panel === panel).map(([slug]) => slug);
}

export {
  TOPICS, EXTERNAL, GLOSSARY, STATUSES, DISCLAIMER, PANELS,
  getTopic, resolveSlug, resolveLink, glossaryLookup, renderTopic, topicsForPanel, fmt, frac, selfTest,
};

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  let passed = 0, total = 0;
  const check = (name, ok, detail = '') => { total++; if (ok) passed++; console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); };

  const slugs = Object.keys(TOPICS);
  check('registry has topics', slugs.length > 0);
  check('every slug is a slug', slugs.every(s => /^[a-z0-9][a-z0-9-]*$/.test(s)), slugs.filter(s => !/^[a-z0-9][a-z0-9-]*$/.test(s)).join(', '));
  const badStatus = slugs.filter(s => !STATUSES.includes(TOPICS[s].status));
  check('every status valid', !badStatus.length, badStatus.join(', '));
  const badCat = slugs.filter(s => !['tool', 'theory'].includes(TOPICS[s].category));
  check('every category tool|theory', !badCat.length, badCat.join(', '));
  const badKind = slugs.filter(s => !['fact', 'heuristic'].includes(TOPICS[s].kind || 'fact'));
  check('every kind fact|heuristic', !badKind.length, badKind.join(', '));
  const badPanel = slugs.filter(s => TOPICS[s].panel && !PANELS.includes(TOPICS[s].panel));
  check('every panel known', !badPanel.length, badPanel.join(', '));
  const noTitle = slugs.filter(s => !TOPICS[s].title || !TOPICS[s].summary);
  check('every topic has title + summary', !noTitle.length, noTitle.join(', '));
  const unresolved = [];
  for (const s of slugs) for (const ref of TOPICS[s].see_also || []) if (!resolveSlug(ref)) unresolved.push(`${s} → ${ref}`);
  check('every see_also resolves', !unresolved.length, unresolved.join('; '));
  const selfRef = slugs.filter(s => (TOPICS[s].see_also || []).includes(s));
  check('no topic lists itself', !selfRef.length, selfRef.join(', '));
  const badGloss = Object.entries(GLOSSARY).filter(([, v]) => !resolveSlug(v)).map(([k, v]) => `${k} → ${v}`);
  check('every glossary slug resolves', !badGloss.length, badGloss.join('; '));
  const empties = slugs.filter(s => TOPICS[s].status !== 'stub' && !(TOPICS[s].body || '').trim());
  check('non-stub topics have a body', !empties.length, empties.join(', '));
  const stubsWithBody = slugs.filter(s => TOPICS[s].status === 'stub' && (TOPICS[s].body || '').trim());
  check('stubs have no body', !stubsWithBody.length, stubsWithBody.join(', '));

  // Rendering: no undefined / NaN / stray template markers / raw html, and every in-body link resolves.
  const bad = [];
  for (const s of slugs) {
    const r = renderTopic(s);
    const out = `${r.summaryHtml}\n${r.html}`;
    for (const needle of ['undefined', 'NaN', '${', '[object Object]']) if (out.includes(needle)) bad.push(`${s}: "${needle}"`);
    const linkTexts = [...(TOPICS[s].body || '').matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]);
    for (const l of linkTexts) if (!resolveLink(l)) bad.push(`${s}: link ${l} unresolved`);
    if (r.status === 'claude-draft' && r.disclaimer !== DISCLAIMER['claude-draft']) bad.push(`${s}: disclaimer`);
  }
  check('every body renders clean', !bad.length, bad.join('; '));

  // Example blocks: every [[example id]] in a body is in the registry; summaries carry none.
  const badExamples = [];
  for (const s of slugs) for (const id of exampleRefs(TOPICS[s].body)) if (!getExample(id)) badExamples.push(`${s} → ${id}`);
  check('every [[example id]] in a body resolves', !badExamples.length, badExamples.join('; '));
  const exampleInSummary = slugs.filter(s => exampleRefs(TOPICS[s].summary).length);
  check('no summary contains [[example', !exampleInSummary.length, exampleInSummary.join(', '));
  // A synthetic topic exercises the block through renderTopic (real topics carry no example yet).
  const SYN = '__example-test';
  TOPICS[SYN] = { title: 'Synthetic', status: 'claude-draft', category: 'theory', kind: 'fact', see_also: [], summary: 'Synthetic topic for the self-test.',
    body: '\n      Before.\n\n      [[example c7-shell-3-below-7]]\n\n      Inline [[example c7-shell-3-below-7]] stays text.\n\n      [[example no-such-example]]\n    ' };
  try {
    const r = renderTopic(SYN);
    const lines = r.html.split('\n');
    check('synthetic topic: block line becomes the example placeholder', lines[1] === exampleBlockHtml('c7-shell-3-below-7') && lines[0] === '<p>Before.</p>');
    check('synthetic topic: inline reference stays literal text', r.html.includes('<p>Inline [[example c7-shell-3-below-7]] stays text.</p>'));
    check('synthetic topic: unknown id renders the visible notice, not a throw', r.html.includes('learn-example--missing') && r.html.includes('no-such-example'));
    check('synthetic topic: summary untouched by the hook', r.summaryHtml === 'Synthetic topic for the self-test.');
    check('synthetic topic: the registry check catches its unknown id', exampleRefs(TOPICS[SYN].body).some(id => !getExample(id)));
  } finally { delete TOPICS[SYN]; }

  // Interpolation spot checks: the numbers in the text are the constants.
  const ts = renderTopic('tension-scoring').html;
  check('tension topic quotes TENSION_WEIGHTS', Object.values(TENSION_WEIGHTS).every(w => ts.includes(`<td>${w}</td>`)));
  check('tension topic quotes OCTAVE_DISCOUNTS', Object.values(OCTAVE_DISCOUNTS).every(d => ts.includes(`<td>${frac(d)}</td>`)));
  check('tension topic quotes the m9 weight', ts.includes(fmt(tensionWeight(13))));
  const ex = renderTopic('explore-panel').html;
  check('explore topic quotes DEFAULT_MAX_SPAN', ex.includes(`${DEFAULT_MAX_SPAN} semitones`));
  check('explore topic quotes EXPLORE_ROWS', ex.includes(`${EXPLORE_ROWS} rows`));
  check('ranking topic quotes TARGET_STEP', renderTopic('explore-ranking').html.includes(`nearest ${TARGET_STEP}`));
  check('ranking topic quotes the dominant rule', DOMINANT_RULE.every(c => renderTopic('explore-ranking').html.includes(dominantRuleText(c))));
  check('playback topic quotes ARP_STEP_MS', renderTopic('playback').html.includes(`${ARP_STEP_MS} ms`));
  check('staff topic quotes SPLIT_MIDI as a note', renderTopic('staff-panel').html.includes(noteName(SPLIT_MIDI)));
  check('chord-symbols table lists every parser type', [...new Set(Object.values(SUFFIX_TO_TYPE))].every(t => renderTopic('chord-symbols').html.includes((CHORD_TYPES[t] || LOCAL_CHORD_TYPES[t] || {}).name || t)));
  check('fmt decimals', [fmt(2 / 3), fmt(0.5), fmt(2), fmt(4 / 3)].join(' ') === '0.667 0.5 2 1.333');
  check('frac fractions', [frac(2 / 3), frac(1 / 3), frac(0.5), frac(2), frac(0.1)].join(' ') === '2/3 1/3 1/2 2 0.1');

  // Lookups.
  check('resolveSlug topic', resolveSlug('tension-scoring')?.url === '/learn/tension-scoring');
  check('resolveSlug external', resolveSlug('intro-tonnetz')?.url === '/intro/5');
  check('resolveSlug unknown', resolveSlug('nope') === null);
  check('glossary lookup case-insensitive', glossaryLookup('Guide Tones')?.slug === 'guide-tones-and-shells');
  check('glossary lookup external', glossaryLookup('tonnetz')?.url === '/intro/5');
  check('glossary unknown', glossaryLookup('zzz') === null);
  check('stub links carry the stub class', renderInline('[x](tritone)', { resolveLink }).includes('learn-link--stub'));
  check('topicsForPanel', topicsForPanel('chart').includes('tension-scoring') && PANELS.every(p => topicsForPanel(p).length >= 1));
  check('rendered stub has disclaimer', renderTopic('tritone').disclaimer === DISCLAIMER.stub);

  const counts = {}; for (const s of slugs) counts[TOPICS[s].status] = (counts[TOPICS[s].status] || 0) + 1;
  console.log(`\n${slugs.length} topics: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}; ${Object.keys(EXTERNAL).length} external targets; ${Object.keys(GLOSSARY).length} glossary terms`);
  console.log(`\n─── ${passed}/${total} passed ───\n`);
  return { passed, total };
}
