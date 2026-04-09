/**
 * walkthroughs.js
 * ===============
 * Guided walkthrough sequences for the Tonnetz Explorer.
 *
 * Each walkthrough is a named entry with:
 *   title   — display name for the walkthrough
 *   song    — song/source attribution (shown small on the card)
 *   seeAlso — optional { label, href } shown on the final step as a nudge
 *             to a related game/tool, e.g. { label: "Chord Walks", href: "/games/chord-walks" }
 *   steps[] — ordered steps, each with:
 *     chord              — chord name string, e.g. "F", "Em", "A7", "Dm"
 *     title              — short bold heading for this step
 *     body               — 1-2 sentence explanation (conversational, no jargon)
 *     autoPlay           — if true, play the chord on entering this step (default false)
 *     highlightTransform — optional "P", "R", or "L" to show a PLR transform arrow
 *     focus              — optional panel(s) to emphasize: "tonnetz", "keyboard",
 *                          "wheel", "fretboard". String or array of strings.
 *                          Other panels are dimmed. Omit to show all panels normally.
 *
 * Chord names are parsed the same way the Explorer URL deep-links work:
 *   "F" → F major, "Em" → E minor, "A7" → A major (triad), "Dm" → D minor, etc.
 */

const WALKTHROUGHS = {
  yesterday_voice_leading: {
    title: "Yesterday's Aching Bass Line",
    song: "Yesterday — The Beatles",
    seeAlso: { label: "Harmony Trainer", href: "/games/chord-walks" },
    steps: [
      { chord: "F", title: "Start here", body: "F major. Bright, stable. Listen to where the bass note sits.", autoPlay: true },
      { chord: "Em", title: "One note drops", body: "The bass slides down just a half step — F to E. The whole mood shifts from major to minor.", autoPlay: true, focus: "keyboard" },
      { chord: "A", title: "And again", body: "Another half step down in an inner voice. The harmony is pulling you somewhere.", autoPlay: true, focus: "keyboard" },
      { chord: "Dm", title: "The arrival", body: "D minor. That descending chromatic line just carried you from bright to melancholy in four chords. That's voice leading.", autoPlay: true, focus: "keyboard", concept_specifics: ["voice_leading", "chromatic_bass"] },
    ]
  },

  am_c_relationship: {
    title: "Two Chords, Two Shared Notes",
    song: "Eleanor Rigby — The Beatles",
    seeAlso: { label: "Chord Walks", href: "/games/chord-walks" },
    steps: [
      { chord: "Am", title: "A minor", body: "Three notes: A, C, E. Watch where they sit on the Tonnetz.", autoPlay: true, focus: "tonnetz" },
      { chord: "C", title: "Now C major", body: "C, E, G. See it? Two of the three notes — C and E — didn't move at all. Only A moved to G.", autoPlay: true, highlightTransform: "R", focus: "tonnetz" },
      { chord: "Am", title: "That's the R transform", body: "One note changes, two stay put. That's why Am and C feel like family — Eleanor Rigby floats between them like they're the same key. Because in a way, they are.", autoPlay: true, focus: "tonnetz", concept_specifics: ["R_transform", "relative_major_minor"] },
    ]
  },

  creep_progression: {
    title: "The Shock of the Chromatic Mediant",
    song: "Creep — Radiohead",
    seeAlso: { label: "Chord Walks", href: "/games/chord-walks" },
    steps: [
      { chord: "G", title: "Home base", body: "G major. Comfortable, stable. This is where the verse starts.", autoPlay: true },
      { chord: "B", title: "The surprise", body: "B major. This is NOT in the key of G — it's a chromatic mediant. Look how far it jumped on the Tonnetz, but it's actually just one flip away. That's why it sounds dramatic but not wrong.", autoPlay: true, highlightTransform: "L", focus: "tonnetz", concept_specifics: ["L_transform", "chromatic_mediant"] },
      { chord: "C", title: "Relief", body: "C major. Back to familiar territory — a simple move from B on the grid.", autoPlay: true },
      { chord: "Cm", title: "The gut punch", body: "C minor. One note drops and everything darkens. That's the P transform — parallel minor. This is the moment in Creep where the lyrics hit hardest.", autoPlay: true, highlightTransform: "P", concept_specifics: ["P_transform", "parallel_major_minor"] },
    ]
  },

  ii_V_I: {
    title: "The Backbone of Jazz",
    song: "Autumn Leaves / Fly Me to the Moon",
    steps: [
      { chord: "Dm", title: "The ii chord", body: "D minor in the key of C. It creates gentle tension — a sense of leaning forward.", autoPlay: true },
      { chord: "G", title: "The V chord", body: "G major. The tension builds. Your ear is now really wanting to resolve somewhere. Watch the path on the Tonnetz from Dm to G — it's a clean, short move.", autoPlay: true, focus: "tonnetz" },
      { chord: "C", title: "Home", body: "C major. That's the resolution — the I chord. The most satisfying arrival in all of harmony. ii→V→I is everywhere in jazz because this path just feels inevitable.", autoPlay: true, concept_specifics: ["ii_V_I", "jazz_harmony"] },
    ]
  },

  mixolydian: {
    title: "One Note Changes Everything",
    song: "Norwegian Wood — The Beatles",
    steps: [
      { chord: "G", title: "G major", body: "A normal G major chord. The key of G major has an F♯ in it.", autoPlay: true },
      { chord: "F", title: "Now add an F natural chord", body: "F major instead of F♯ diminished. That one note — F natural instead of F♯ — is what makes Mixolydian sound different from regular major. Bluesier, earthier.", autoPlay: true },
      { chord: "G", title: "Back to G", body: "That G→F→G movement IS Norwegian Wood. The ♭7 gives Mixolydian its character — major but with a laid-back, slightly bluesy edge. Get Lucky by Daft Punk lives here too.", autoPlay: true, concept_specifics: ["mixolydian"] },
    ]
  },

  stairway_P_transform: {
    title: "Light and Shadow",
    song: "Stairway to Heaven — Led Zeppelin",
    steps: [
      { chord: "Am", title: "The opening", body: "A minor. Dark, contemplative. This is where Stairway begins.", autoPlay: true },
      { chord: "A", title: "Flip to major", body: "A major. Same root, completely different feeling — like the sun coming through clouds. On the Tonnetz, this is the P transform: one note moves, the whole mood inverts.", autoPlay: true, highlightTransform: "P", focus: "tonnetz", concept_specifics: ["P_transform", "parallel_major_minor"] },
      { chord: "Am", title: "And back", body: "A minor again. Zeppelin rides this toggle between light and dark throughout the song. The P transform is the simplest move on the Tonnetz — and one of the most powerful.", autoPlay: true, highlightTransform: "P", focus: "tonnetz" },
      { chord: "C", title: "Opening up", body: "C major. A minor and C major share two notes — the R transform. This is where Stairway lifts, moving from shadow into a wider, brighter space. Watch how close they sit on the Tonnetz.", autoPlay: true, highlightTransform: "R", focus: "tonnetz", concept_specifics: ["R_transform", "relative_major_minor"] },
    ]
  },

  deceptive_cadence: {
    title: "The Chord Your Ear Didn't Expect",
    song: "In My Life — The Beatles",
    steps: [
      { chord: "C", title: "Start in C", body: "We're home in C major.", autoPlay: true },
      { chord: "G", title: "The V chord", body: "G major — the dominant. Your ear has heard this a million times and it KNOWS what comes next. It expects to resolve back to C.", autoPlay: true },
      { chord: "Am", title: "Surprise — vi instead of I", body: "A minor instead of C major. That's a deceptive cadence — V→vi instead of V→I. It works because Am shares two notes with C (they're R-transform neighbors), so it feels almost right but emotionally different. Bittersweet instead of resolved.", autoPlay: true, focus: "tonnetz", concept_specifics: ["deceptive_cadence", "V_vi"] },
    ]
  },

  twelve_bar_blues: {
    title: "Three Chords, One Triangle",
    song: "Johnny B. Goode — Chuck Berry",
    seeAlso: { label: "Strum Patterns", href: "/games/strum-patterns" },
    steps: [
      { chord: "C", title: "The I chord", body: "C major. Home base for the blues.", autoPlay: true },
      { chord: "F", title: "The IV chord", body: "F major. Look at the Tonnetz — F is right next to C. One step away.", autoPlay: true, focus: "tonnetz" },
      { chord: "G", title: "The V chord", body: "G major. Also right next to C, on the other side. I, IV, and V form a tight triangle on the grid — the three closest major chords to each other.", autoPlay: true, focus: "tonnetz" },
      { chord: "C", title: "That's the whole blues", body: "From Johnny B. Goode to Hound Dog to a thousand songs you know — it's these three neighbors taking turns. The simplest path through harmonic space, and it never gets old.", autoPlay: true, concept_specifics: ["twelve_bar_blues", "I_IV_V"] },
    ]
  },
};

export { WALKTHROUGHS };
