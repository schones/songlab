/**
 * walkthroughs.js
 * ===============
 * Guided walkthrough sequences for the Tonnetz Explorer.
 *
 * Each walkthrough is a named entry with:
 *   title   — display name for the walkthrough
 *   song    — song/source attribution (shown small on the card)
 *   key     — tonal center of the walkthrough (e.g. "C", "G", "Am")
 *             Used to set the Explorer's key context and as a hint for
 *             chord resolution of ambiguous voicings.
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
    key: "F",
    category: "Voice Leading",
    audience: "musician",
    seeAlso: { label: "Harmony Trainer", href: "/games/chord-walks" },
    rhythm: {
      time_sig: "4/4",
      bpm: 96,
      feel: "Gentle fingerpick",
      description: "A soft, steady fingerpicking pattern. The bass walks the descending chromatic line while the upper strings keep a gentle pulse.",
      pattern: [
        { beat: "1", label: "bass", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "2", label: "brush",type: "snare" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "3", label: "bass", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "4", label: "brush",type: "snare" },
        { beat: "&", label: "·",    type: "strum" }
      ]
    },
    steps: [
      { chord: "F", function: "tonic",            title: "Start here", body: "F major. Bright, stable. Listen to where the bass note sits.", autoPlay: true },
      { chord: "Em", function: "chromatic bass",  title: "One note drops", body: "The bass slides down just a half step — F to E. The whole mood shifts from major to minor.", autoPlay: true, focus: "keyboard" },
      { chord: "A",  function: "secondary dominant", title: "And again", body: "Another half step down in an inner voice. The harmony is pulling you somewhere.", autoPlay: true, focus: "keyboard" },
      { chord: "Dm", function: "arrival (vi)",    title: "The arrival", body: "D minor. That descending chromatic line just carried you from bright to melancholy in four chords. That's voice leading.", autoPlay: true, focus: "keyboard", concept_specifics: ["voice_leading", "chromatic_bass"] },
    ]
  },

  am_c_relationship: {
    title: "Two Chords, Two Shared Notes",
    song: "Eleanor Rigby — The Beatles",
    key: "C",
    category: "Transforms",
    audience: "musician",
    seeAlso: { label: "Chord Walks", href: "/games/chord-walks" },
    rhythm: {
      time_sig: "4/4",
      bpm: 134,
      feel: "Driving strings",
      description: "Urgent staccato strings drive Eleanor Rigby forward. No drums — the rhythm comes entirely from the bowing pattern.",
      pattern: [
        { beat: "1", label: "BOW",  type: "bass" },
        { beat: "&", label: "bow",  type: "strum" },
        { beat: "2", label: "BOW",  type: "bass" },
        { beat: "&", label: "bow",  type: "strum" },
        { beat: "3", label: "BOW",  type: "bass" },
        { beat: "&", label: "bow",  type: "strum" },
        { beat: "4", label: "BOW",  type: "bass" },
        { beat: "&", label: "bow",  type: "strum" }
      ]
    },
    steps: [
      { chord: "Am", function: "tonic (i)",       title: "A minor", body: "Three notes: A, C, E. Watch where they sit on the Tonnetz.", autoPlay: true, focus: "tonnetz" },
      { chord: "C",  function: "relative major",  title: "Now C major", body: "C, E, G. See it? Two of the three notes — C and E — didn't move at all. Only A moved to G.", autoPlay: true, highlightTransform: "R", focus: "tonnetz" },
      { chord: "Am", function: "back to i",       title: "That's the R transform", body: "One note changes, two stay put. That's why Am and C feel like family — Eleanor Rigby floats between them like they're the same key. Because in a way, they are.", autoPlay: true, focus: "tonnetz", concept_specifics: ["R_transform", "relative_major_minor"] },
    ]
  },

  creep_progression: {
    title: "The Shock of the Chromatic Mediant",
    song: "Creep — Radiohead",
    key: "G",
    category: "Transforms",
    audience: "musician",
    seeAlso: { label: "Chord Walks", href: "/games/chord-walks" },
    rhythm: {
      time_sig: "4/4",
      bpm: 92,
      feel: "Clean arpeggiation to crunch",
      description: "Quiet clean guitar arpeggiation in the verse, explosive distorted strums in the chorus. The dynamic contrast IS the song.",
      pattern: [
        { beat: "1", label: "bass", type: "bass" },
        { beat: "&", label: "pick", type: "strum" },
        { beat: "2", label: "pick", type: "strum" },
        { beat: "&", label: "pick", type: "strum" },
        { beat: "3", label: "bass", type: "bass" },
        { beat: "&", label: "pick", type: "strum" },
        { beat: "4", label: "SNAP", type: "snare" },
        { beat: "&", label: "pick", type: "strum" }
      ]
    },
    steps: [
      { chord: "G",  function: "tonic",             title: "Home base", body: "G major. Comfortable, stable. This is where the verse starts.", autoPlay: true },
      { chord: "B",  function: "chromatic mediant", title: "The surprise", body: "B major. This is NOT in the key of G — it's a chromatic mediant. Look how far it jumped on the Tonnetz, but it's actually just one flip away. That's why it sounds dramatic but not wrong.", autoPlay: true, highlightTransform: "L", focus: "tonnetz", concept_specifics: ["L_transform", "chromatic_mediant"] },
      { chord: "C",  function: "subdominant (IV)",  title: "Relief", body: "C major. Back to familiar territory — a simple move from B on the grid.", autoPlay: true },
      { chord: "Cm", function: "borrowed chord",    title: "The gut punch", body: "C minor. One note drops and everything darkens. That's the P transform — parallel minor. This is the moment in Creep where the lyrics hit hardest.", autoPlay: true, highlightTransform: "P", concept_specifics: ["P_transform", "parallel_major_minor"] },
    ]
  },

  ii_V_I: {
    title: "The Backbone of Jazz",
    song: "Autumn Leaves / Fly Me to the Moon",
    key: "C",
    category: "Jazz Harmony",
    audience: "musician",
    rhythm: {
      time_sig: "4/4",
      bpm: 120,
      feel: "Medium swing",
      description: "Classic jazz swing — the ride cymbal keeps time with a long-short triplet feel while the bass walks quarter notes.",
      pattern: [
        { beat: "1", label: "WALK", type: "bass" },
        { beat: "a", label: "ting", type: "strum" },
        { beat: "2", label: "RIDE", type: "snare" },
        { beat: "a", label: "ting", type: "strum" },
        { beat: "3", label: "WALK", type: "bass" },
        { beat: "a", label: "ting", type: "strum" },
        { beat: "4", label: "RIDE", type: "snare" },
        { beat: "a", label: "ting", type: "strum" }
      ]
    },
    steps: [
      { chord: "Dm", chordType: "min7", function: "predominant (ii7)", title: "The ii7 chord", body: "D minor 7 in the key of C — D, F, A, C. The added 7th (that high C) gives it a gentle, smoky quality. Every ii→V→I in jazz starts here.", autoPlay: true, concept_specifics: ["ii_V_I"] },
      { chord: "G",  chordType: "dom7", function: "dominant (V7)",     title: "The V7 chord", body: "G dominant 7 — G, B, D, F. The 7th (F) creates a tritone with the 3rd (B) that wants to resolve. That tension is why V7 pulls so hard toward I. Watch the path on the Tonnetz from Dm7 to G7 — it's a clean, short move.", autoPlay: true, focus: "tonnetz", concept_specifics: ["ii_V_I"] },
      { chord: "C",  chordType: "maj7", function: "tonic (Imaj7)",     title: "Home — Cmaj7", body: "C major 7 — C, E, G, B. That dreamy, floating quality is the major 7th. ii7→V7→Imaj7 is everywhere in jazz because the chain of 7ths makes each resolution feel inevitable AND luxurious.", autoPlay: true, concept_specifics: ["ii_V_I", "jazz_harmony"] },
    ]
  },

  mixolydian: {
    title: "One Note Changes Everything",
    song: "Norwegian Wood — The Beatles",
    key: "G",
    category: "Modes & Scales",
    audience: "musician",
    rhythm: {
      time_sig: "6/8",
      bpm: 72,
      feel: "Waltz feel",
      description: "Norwegian Wood is in 6/8 — six eighth notes grouped in two sets of three. It gives the song its gentle rocking quality, like a lullaby.",
      pattern: [
        { beat: "1", label: "BASS", type: "bass" },
        { beat: "2", label: "·",    type: "strum" },
        { beat: "3", label: "·",    type: "strum" },
        { beat: "4", label: "tap",  type: "snare" },
        { beat: "5", label: "·",    type: "strum" },
        { beat: "6", label: "·",    type: "strum" }
      ]
    },
    steps: [
      { chord: "G", function: "tonic",          title: "G major", body: "A normal G major chord. The key of G major has an F♯ in it.", autoPlay: true },
      { chord: "F", function: "♭VII (borrowed)",title: "Now add an F natural chord", body: "F major instead of F♯ diminished. That one note — F natural instead of F♯ — is what makes Mixolydian sound different from regular major. Bluesier, earthier.", autoPlay: true },
      { chord: "G", function: "back to tonic",  title: "Back to G", body: "That G→F→G movement IS Norwegian Wood. The ♭7 gives Mixolydian its character — major but with a laid-back, slightly bluesy edge. Get Lucky by Daft Punk lives here too.", autoPlay: true, concept_specifics: ["mixolydian"] },
    ]
  },

  stairway_P_transform: {
    title: "Light and Shadow",
    song: "Stairway to Heaven — Led Zeppelin",
    key: "Am",
    category: "Transforms",
    audience: "musician",
    rhythm: {
      time_sig: "4/4",
      bpm: 82,
      feel: "Arpeggiated ballad",
      description: "The intro is pure fingerpicked arpeggiation — each chord is spelled out note by note. No drums until much later. The guitar IS the rhythm section.",
      pattern: [
        { beat: "1", label: "bass", type: "bass" },
        { beat: "&", label: "pick", type: "strum" },
        { beat: "2", label: "pick", type: "strum" },
        { beat: "&", label: "pick", type: "strum" },
        { beat: "3", label: "bass", type: "bass" },
        { beat: "&", label: "pick", type: "strum" },
        { beat: "4", label: "pick", type: "strum" },
        { beat: "&", label: "pick", type: "strum" }
      ]
    },
    steps: [
      { chord: "Am", function: "tonic (i)",      title: "The opening", body: "A minor. Dark, contemplative. This is where Stairway begins.", autoPlay: true },
      { chord: "A",  function: "parallel major", title: "Flip to major", body: "A major. Same root, completely different feeling — like the sun coming through clouds. On the Tonnetz, this is the P transform: one note moves, the whole mood inverts.", autoPlay: true, highlightTransform: "P", focus: "tonnetz", concept_specifics: ["P_transform", "parallel_major_minor"] },
      { chord: "Am", function: "back to i",      title: "And back", body: "A minor again. Zeppelin rides this toggle between light and dark throughout the song. The P transform is the simplest move on the Tonnetz — and one of the most powerful.", autoPlay: true, highlightTransform: "P", focus: "tonnetz" },
      { chord: "C",  function: "relative major", title: "Opening up", body: "C major. A minor and C major share two notes — the R transform. This is where Stairway lifts, moving from shadow into a wider, brighter space. Watch how close they sit on the Tonnetz.", autoPlay: true, highlightTransform: "R", focus: "tonnetz", concept_specifics: ["R_transform", "relative_major_minor"] },
    ]
  },

  deceptive_cadence: {
    title: "The Chord Your Ear Didn't Expect",
    song: "In My Life — The Beatles",
    key: "C",
    category: "Progressions",
    audience: "musician",
    rhythm: {
      time_sig: "4/4",
      bpm: 103,
      feel: "Steady pop rock",
      description: "Clean, steady Beatles pop — drums keep a simple backbeat while the rhythm guitar strums eighth notes. Nothing flashy, everything in service of the melody.",
      pattern: [
        { beat: "1", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "2", label: "SNARE",type: "snare" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "3", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "4", label: "SNARE",type: "snare" },
        { beat: "&", label: "·",    type: "strum" }
      ]
    },
    steps: [
      { chord: "C",  function: "tonic (I)",    title: "Start in C", body: "We're home in C major.", autoPlay: true },
      { chord: "G",  function: "dominant (V)", title: "The V chord", body: "G major — the dominant. Your ear has heard this a million times and it KNOWS what comes next. It expects to resolve back to C.", autoPlay: true },
      { chord: "Am", function: "deceptive vi", title: "Surprise — vi instead of I", body: "A minor instead of C major. That's a deceptive cadence — V→vi instead of V→I. It works because Am shares two notes with C (they're R-transform neighbors), so it feels almost right but emotionally different. Bittersweet instead of resolved.", autoPlay: true, focus: "tonnetz", concept_specifics: ["deceptive_cadence", "V_vi"] },
    ]
  },

  why_does_my_heart_moby: {
    title: "Six Chords That Ache",
    song: "Why Does My Heart Feel So Bad? — Moby",
    key: "Am",
    category: "Modes & Scales",
    audience: "musician",
    seeAlso: { label: "Chord Walks", href: "/games/chord-walks" },
    rhythm: {
      time_sig: "4/4",
      bpm: 98,
      feel: "Four on the floor",
      description: "A steady electronic kick on every beat — the pulse that keeps a dance floor breathing. Moby built the whole song over this unwavering heartbeat.",
      pattern: [
        { beat: "1", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "2", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "3", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "4", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" }
      ]
    },
    steps: [
      { chord: "Am", function: "tonic (i)",            title: "Start in the dark", body: "A minor. The whole song begins right here, on the most melancholy chord in the key. Hold this feeling.", autoPlay: true },
      { chord: "Em", function: "modal v",              title: "Minor v, not V", body: "E minor instead of E major. That's the trick — there's no leading tone, no dominant pull. The harmony stops trying to resolve and just floats. This is what makes Moby sound so… resigned.", autoPlay: true, focus: "tonnetz", concept_specifics: ["modal_v", "no_leading_tone"] },
      { chord: "G",  function: "♭VII (subtonic)",      title: "An R-transform glide", body: "G major. Watch the Tonnetz — Em and G share two notes (G and B). It's the R transform: one note moves, two stay put. That's why the slide from Em to G feels effortless, like the music is just leaning sideways.", autoPlay: true, highlightTransform: "R", focus: "tonnetz", concept_specifics: ["R_transform"] },
      { chord: "D",  function: "Dorian IV",            title: "The single bright note", body: "D major. In A minor we'd expect D minor — but Moby uses D major, borrowed from A Dorian. That one F♯ is the entire reason this song sounds wistful instead of just sad. Hope, rationed by a single semitone.", autoPlay: true, concept_specifics: ["dorian", "borrowed_chord", "modal_mixture"] },
      { chord: "F",  function: "VI / IV of relative major", title: "The chorus opens", body: "F major. Same notes as the verse — we haven't changed key — but the music suddenly feels like a window has opened. F is the IV chord of C major, the relative major. The center of gravity is shifting.", autoPlay: true, focus: "tonnetz" },
      { chord: "C",  function: "III / I of relative major", title: "Release", body: "C major. Now we hear it: the song has slid into the relative major without ever changing a key signature. F→C is just IV→I in C major — the simplest, most settled motion in all of Western music. After all that floating in A minor, the chorus lands like an exhale.", autoPlay: true, concept_specifics: ["relative_major_minor", "modal_pivot", "voice_leading"] },
    ]
  },

  twelve_bar_blues: {
    title: "Three Chords, One Triangle",
    song: "Johnny B. Goode — Chuck Berry",
    key: "C",
    category: "Progressions",
    audience: "musician",
    seeAlso: { label: "Strum Patterns", href: "/games/strum-patterns" },
    rhythm: {
      time_sig: "4/4",
      bpm: 168,
      feel: "Shuffle",
      description: "A fast shuffle — long-short, long-short — that drives Chuck Berry's rock and roll forward. Same triplet feel as a slow blues, just cranked up.",
      pattern: [
        { beat: "1", label: "LONG", type: "bass" },
        { beat: "a", label: "short",type: "strum" },
        { beat: "2", label: "LONG", type: "snare" },
        { beat: "a", label: "short",type: "strum" },
        { beat: "3", label: "LONG", type: "bass" },
        { beat: "a", label: "short",type: "strum" },
        { beat: "4", label: "LONG", type: "snare" },
        { beat: "a", label: "short",type: "strum" }
      ]
    },
    steps: [
      { chord: "C", chordType: "dom7", function: "tonic (I7)",        title: "The I7 chord", body: "C dominant 7 — C, E, G, B♭. Home base for the blues, but with that flat 7th baked in. In blues, even the I chord is a dom7 — that's what gives it its grit.", autoPlay: true },
      { chord: "F", chordType: "dom7", function: "subdominant (IV7)", title: "The IV7 chord", body: "F dominant 7 — F, A, C, E♭. Look at the Tonnetz — F is right next to C. One step away, and the 7th (E♭) just adds another layer of blues tension.", autoPlay: true, focus: "tonnetz" },
      { chord: "G", chordType: "dom7", function: "dominant (V7)",     title: "The V7 chord", body: "G dominant 7 — G, B, D, F. Also right next to C, on the other side. I7, IV7, and V7 form a tight triangle on the grid — the three closest major chords, all dripping with flat sevenths.", autoPlay: true, focus: "tonnetz" },
      { chord: "C", chordType: "dom7", function: "back to tonic (I7)",title: "That's the whole blues", body: "From Johnny B. Goode to Hound Dog to a thousand songs you know — it's these three dom7 neighbors taking turns. The simplest path through harmonic space, and it never gets old.", autoPlay: true, concept_specifics: ["twelve_bar_blues", "I_IV_V"] },
    ]
  },

  folsom_train_beat: {
    title: "The Train Beat",
    song: "Folsom Prison Blues — Johnny Cash",
    key: "E",
    category: "Rhythm & Feel",
    audience: "musician",
    seeAlso: { label: "Swing Trainer", href: "/games/swing-trainer" },
    rhythm: {
      time_sig: "4/4",
      bpm: 160,
      feel: "Train beat",
      description: "The train beat alternates bass on downbeats with muted strums on every upbeat. No drums needed — the guitar IS the rhythm section.",
      pattern: [
        { beat: "1", label: "BOOM", type: "bass" },
        { beat: "&", label: "chk",  type: "strum" },
        { beat: "2", label: "SNAP", type: "snare" },
        { beat: "&", label: "chk",  type: "strum" },
        { beat: "3", label: "BOOM", type: "bass" },
        { beat: "&", label: "chk",  type: "strum" },
        { beat: "4", label: "SNAP", type: "snare" },
        { beat: "&", label: "chk",  type: "strum" }
      ]
    },
    steps: [
      {
        chord: "E",
        chordType: "dom7",
        function: "tonic (I7)",
        title: "The one chord",
        body: "E dominant 7 — E, G♯, B, D. Home base, but with that flat 7th (D) already giving it a bluesy edge. Before you focus on the chord, listen to the rhythm. BOOM-chk-SNAP-chk, BOOM-chk-SNAP-chk. That's the train beat. The bass hits on 1 and 3, a snare or brush on 2 and 4, and muted guitar strums fill every upbeat.",
        autoPlay: true,
        concept_specifics: ["train_beat", "I_IV_V"]
      },
      {
        chord: "A",
        chordType: "dom7",
        function: "subdominant (IV7)",
        title: "The IV7 chord arrives",
        body: "A dominant 7 — A, C♯, E, G. The chord changes but the rhythm never breaks. Even the IV chord is a dom7 here — that flat 7th is the whole sound of the blues. BOOM-chk-SNAP-chk keeps rolling.",
        autoPlay: true,
        concept_specifics: ["I_IV_V"]
      },
      {
        chord: "E",
        chordType: "dom7",
        function: "back to I7",
        title: "Back home",
        body: "E7 again. In a 12-bar blues, you spend most of your time on the I chord. The train beat makes even this static harmony feel like it's moving forward.",
        autoPlay: true,
        concept_specifics: ["twelve_bar_blues"]
      },
      {
        chord: "B",
        chordType: "dom7",
        function: "dominant (V7)",
        title: "The turnaround",
        body: "B dominant 7 — B, D♯, F♯, A. The V7 chord. This is the tension point that pulls you back to E. The tritone between D♯ and A inside B7 is what creates that itch to resolve. Three dom7 chords, one relentless rhythm — that's all you need.",
        autoPlay: true,
        concept_specifics: ["I_IV_V", "twelve_bar_blues"]
      },
      {
        chord: "E",
        chordType: "dom7",
        function: "resolution (I7)",
        title: "I7-IV7-V7 and the train beat",
        body: "The whole song is three dom7 chords — E7, A7, B7 — over a train beat that never stops. Johnny Cash didn't need complexity. The BOOM-chk-SNAP-chk pattern IS the song. You'll hear the same engine driving Ring of Fire, Mama Tried, Cry Cry Cry, and hundreds of country songs.",
        autoPlay: true,
        concept_specifics: ["train_beat", "I_IV_V", "twelve_bar_blues"]
      }
    ]
  },

  let_it_go_pop_formula: {
    title: "The Pop Formula",
    song: "Let It Go — Frozen",
    key: "A♭",
    category: "Progressions",
    audience: "kids",
    rhythm: {
      time_sig: "4/4",
      bpm: 120,
      feel: "Power ballad",
      description: "Straight four-on-the-floor feel that builds from gentle verse to huge chorus. The steady beat lets Elsa's melody soar.",
      pattern: [
        { beat: "1", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "2", label: "SNARE",type: "snare" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "3", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "4", label: "SNARE",type: "snare" },
        { beat: "&", label: "·",    type: "strum" }
      ]
    },
    steps: [
      { chord: "Ab", function: "tonic (I)", title: "Home", body: "A♭ major. This is home base — where the chorus starts. Strong, bright, confident. This is where 'Let it go!' lands.", autoPlay: true, concept_specifics: ["I_IV_V"] },
      { chord: "Eb", function: "dominant (V)", title: "The lift", body: "E♭ major — the V chord. It lifts the energy up, like taking a deep breath before the next line.", autoPlay: true },
      { chord: "Fm", function: "relative minor (vi)", title: "The emotion", body: "F minor — the vi chord. This is where the feeling deepens. Major chords sound happy, minor chords sound thoughtful or sad. The song keeps moving between these feelings.", autoPlay: true, concept_specifics: ["vi_chord"] },
      { chord: "Db", function: "subdominant (IV)", title: "The push", body: "D♭ major — the IV chord. It pushes you forward, wanting to go back to the start. I→V→vi→IV. This exact pattern is in hundreds of pop songs — Adele, Ed Sheeran, Taylor Swift. It works every time.", autoPlay: true, concept_specifics: ["I_IV_V"] }
    ]
  },

  friend_in_me_shuffle: {
    title: "The Shuffle Feel",
    song: "You've Got a Friend in Me — Toy Story",
    key: "C",
    category: "Rhythm & Feel",
    audience: "kids",
    rhythm: {
      time_sig: "4/4",
      bpm: 108,
      feel: "Shuffle",
      description: "A shuffle splits each beat into three instead of two — long-short, long-short. It's what makes this song bounce and swing instead of marching straight.",
      pattern: [
        { beat: "1", label: "LONG", type: "bass" },
        { beat: "a", label: "short",type: "strum" },
        { beat: "2", label: "LONG", type: "snare" },
        { beat: "a", label: "short",type: "strum" },
        { beat: "3", label: "LONG", type: "bass" },
        { beat: "a", label: "short",type: "strum" },
        { beat: "4", label: "LONG", type: "snare" },
        { beat: "a", label: "short",type: "strum" }
      ]
    },
    steps: [
      { chord: "C", function: "tonic (I)", title: "That bouncy start", body: "C major with a shuffle feel. Listen to how the rhythm bounces — LONG-short, LONG-short. That's a shuffle. It's what makes this song feel like a lazy afternoon with your best friend.", autoPlay: true, focus: "rhythm", concept_specifics: ["shuffle"] },
      { chord: "F", function: "subdominant (IV)", title: "The warm move", body: "F major — the IV chord. In jazz and blues, I→IV is the most natural first move. The shuffle keeps bouncing, the chord gets warmer.", autoPlay: true, concept_specifics: ["I_IV_V"] },
      { chord: "C", function: "back to I", title: "Back home", body: "C major again. Notice how the shuffle feel stays constant even when the chords change. The rhythm is the glue.", autoPlay: true },
      { chord: "G", function: "dominant (V)", title: "The turnaround", body: "G major — the V chord. This pulls you back to C. Randy Newman uses jazzy chords throughout, but the backbone is still I-IV-V with a shuffle. Simple ingredients, warm result.", autoPlay: true, concept_specifics: ["ii_V_I", "shuffle"] }
    ]
  },

  stand_by_me_doo_wop: {
    title: "The Doo-Wop Loop",
    song: "Stand By Me — Ben E. King",
    key: "A",
    category: "Progressions",
    audience: "student",
    rhythm: {
      time_sig: "4/4",
      bpm: 115,
      feel: "Straight eighth",
      description: "Steady eighth notes on the bass line walking root to fifth. The kick and snare alternate on 1-2-3-4 with the backbeat on 2 and 4.",
      pattern: [
        { beat: "1", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "2", label: "SNARE",type: "snare" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "3", label: "KICK", type: "bass" },
        { beat: "&", label: "·",    type: "strum" },
        { beat: "4", label: "SNARE",type: "snare" },
        { beat: "&", label: "·",    type: "strum" }
      ]
    },
    steps: [
      { chord: "A", function: "tonic (I)", title: "The anchor", body: "A major. The bass line starts here and barely leaves — that walking bass IS the song. Ben E. King built one of the most famous songs ever on four chords that loop forever.", autoPlay: true, concept_specifics: ["I_IV_V"] },
      { chord: "F#m", function: "submediant (vi)", title: "The lean", body: "F♯ minor — the vi chord. This is A major's relative minor. They share two notes, so the move feels natural, just a little more emotional. Every doo-wop group in the 50s knew this trick.", autoPlay: true, concept_specifics: ["vi_chord", "relative_major_minor"] },
      { chord: "D", function: "subdominant (IV)", title: "The lift", body: "D major — the IV chord. The progression opens up here. I→vi→IV→V is called the doo-wop progression because it's in thousands of songs from that era. And it never stopped — you'll hear it in everything from 'No Woman No Cry' to 'Someone Like You.'", autoPlay: true, concept_specifics: ["I_IV_V"] },
      { chord: "E", function: "dominant (V)", title: "The pull back", body: "E major — the V chord. It creates tension that wants to resolve back to A. And it does, and then the whole thing loops again. Four chords. One of the greatest songs ever written.", autoPlay: true, concept_specifics: ["I_IV_V", "backbeat"] }
    ]
  },

  lean_on_me_gospel: {
    title: "The Gospel Piano",
    song: "Lean on Me — Bill Withers",
    key: "C",
    category: "Progressions",
    audience: "student",
    rhythm: {
      time_sig: "4/4",
      bpm: 76,
      feel: "Gospel ballad",
      description: "Slow, steady, piano-driven. The left hand walks a bass line while the right hand plays chords on the offbeats. Every note breathes.",
      pattern: [
        { beat: "1", label: "BASS", type: "bass" },
        { beat: "&", label: "chord",type: "strum" },
        { beat: "2", label: "BASS", type: "bass" },
        { beat: "&", label: "chord",type: "strum" },
        { beat: "3", label: "BASS", type: "bass" },
        { beat: "&", label: "chord",type: "strum" },
        { beat: "4", label: "BASS", type: "bass" },
        { beat: "&", label: "chord",type: "strum" }
      ]
    },
    steps: [
      { chord: "C", chordType: "maj7", function: "tonic (Imaj7)", title: "Simple and strong", body: "Cmaj7 — C, E, G, B. The piano walks up the scale — C, D, E, F — while the right hand lays down chords with that gospel maj7 shimmer on top. Bill Withers was a factory worker who wrote one of the most-covered songs in history. No fancy theory, just truth.", autoPlay: true, concept_specifics: ["I_IV_V"] },
      { chord: "F", function: "subdominant (IV)", title: "The IV chord", body: "F major. I→IV is the most common chord move in all of music. In gospel, the IV chord is where the choir lifts. It feels like the room gets bigger.", autoPlay: true, concept_specifics: ["I_IV_V"] },
      { chord: "C", chordType: "maj7", function: "back to Imaj7", title: "Back to earth", body: "Cmaj7 again. The whole song barely leaves home. That's the power of simplicity — three chords and a walking bass line, and everyone in the room is singing along.", autoPlay: true },
      { chord: "G", function: "dominant (V)", title: "The resolve", body: "G major — the V. It pulls back to C. Lean on Me uses almost the same three chords as Folsom Prison Blues (I-IV-V), but the slow gospel piano makes it feel completely different. Same skeleton, different soul.", autoPlay: true, concept_specifics: ["I_IV_V"] }
    ]
  },

  bridge_over_troubled_water: {
    title: "The Diminished Passing Chord",
    song: "Bridge Over Troubled Water — Simon & Garfunkel",
    key: "C",
    category: "Voice Leading",
    audience: "musician",
    seeAlso: { label: "Chord Spotter", href: "/games/chord-spotter" },
    rhythm: {
      time_sig: "4/4",
      bpm: 82,
      feel: "Gospel ballad",
      description: "Piano arpeggios over a slow gospel pulse. The left hand walks bass notes on 1 and 3 while the right hand rolls chords. The feel builds across verses — sparse at first, full orchestra by the end.",
      pattern: [
        { beat: "1", label: "BASS", type: "bass" },
        { beat: "&", label: "arp",  type: "strum" },
        { beat: "2", label: "arp",  type: "strum" },
        { beat: "&", label: "arp",  type: "strum" },
        { beat: "3", label: "BASS", type: "bass" },
        { beat: "&", label: "arp",  type: "strum" },
        { beat: "4", label: "arp",  type: "strum" },
        { beat: "&", label: "arp",  type: "strum" }
      ]
    },
    steps: [
      { chord: "C",  function: "tonic (I)",          title: "Home base",                   body: "C major. The verse builds gently on plagal cadences — IV to I, like a hymn. Simon wrote it to sound like a spiritual. But it's the chorus where the harmony gets interesting.", autoPlay: true },
      { chord: "F",  function: "subdominant (IV)",   title: "The IV chord lifts",          body: "F major — 'Like a bridge...' The plagal IV chord is the foundation of this whole song. Every resolution comes back through F to C. But watch what happens between F and the next C.", autoPlay: true },
      { chord: "F#", chordType: "diminished", function: "passing (♯iv°)", title: "The chromatic passing chord", body: "F♯ diminished — this lands on the word 'over.' The bass walks chromatically: F → F♯ → G (which is the root of the next chord's inversion). This is what diminished chords do best — they connect two diatonic chords with a half-step movement that feels inevitable. You barely notice it, but you'd miss it if it were gone.", autoPlay: true, concept_specifics: ["diminished", "chromatic_bass", "passing_chord"] },
      { chord: "C",  function: "tonic (I)",          title: "Resolution",                   body: "Back to C — 'troubled water.' The diminished chord resolved upward by half step in the bass. That F→F♯→G bass line is one of the most common uses of diminished chords in all of popular music.", autoPlay: true },
      { chord: "G#", chordType: "diminished", function: "passing (♯v°)", title: "Another diminished — same trick", body: "G♯ diminished — on 'I will.' Same technique: the bass walks G♯→A to connect to A minor. Two diminished passing chords in one chorus, both doing the same job — chromatic half-step connections between diatonic chords.", autoPlay: true, concept_specifics: ["diminished", "chromatic_bass", "passing_chord"] },
      { chord: "Am", function: "submediant (vi)",    title: "The minor arrival",            body: "A minor — 'lay me down.' The vi chord adds weight and emotion after the diminished approach. Notice how different this feels from just jumping straight from C to Am.", autoPlay: true },
      { chord: "Fm", function: "borrowed iv",        title: "The borrowed minor",           body: "F minor — borrowed from C minor. This is the final emotional punch: the major IV chord from earlier now returns as minor. That E♭ darkens everything. The whole chorus is a masterclass in chromatic voice leading.", autoPlay: true, concept_specifics: ["borrowed_chord"] }
    ]
  },

  oh_darling_augmented: {
    title: "The Augmented Passing Chord",
    song: "Oh! Darling — The Beatles",
    key: "A",
    category: "Voice Leading",
    audience: "student",
    seeAlso: { label: "Chord Spotter", href: "/games/chord-spotter" },
    rhythm: {
      time_sig: "12/8",
      bpm: 58,
      feel: "Slow doo-wop triplet",
      description: "A 12/8 doo-wop shuffle — every beat divides into three. The piano pounds triplet chords while the bass locks onto the root on each downbeat. McCartney's vocal rides on top of the heavy shuffle feel.",
      pattern: [
        { beat: "1", label: "BASS",  type: "bass" },
        { beat: "a", label: "·",     type: "strum" },
        { beat: "&", label: "chord", type: "strum" },
        { beat: "2", label: "BASS",  type: "bass" },
        { beat: "a", label: "·",     type: "strum" },
        { beat: "&", label: "chord", type: "strum" },
        { beat: "3", label: "BASS",  type: "bass" },
        { beat: "a", label: "·",     type: "strum" },
        { beat: "&", label: "chord", type: "strum" },
        { beat: "4", label: "BASS",  type: "bass" },
        { beat: "a", label: "·",     type: "strum" },
        { beat: "&", label: "chord", type: "strum" }
      ]
    },
    steps: [
      { chord: "E",   chordType: "augmented", function: "dominant augmented (V+)", title: "Oh!",                 body: "E augmented on the word 'Oh!' — the song opens on pure tension. The fifth (B) has been raised to B♯. McCartney's voice lands on this reaching chord. It's a major chord that can't sit still.", autoPlay: true, concept_specifics: ["augmented", "chromatic_voice_leading"] },
      { chord: "A",   function: "tonic (I)",                                       title: "Darling",             body: "A major on 'Darling.' The B♯ resolved up to C♯ — the third of A. That chromatic walk (B → B♯ → C♯) is the whole engine. One note, moving by half steps, connecting tension to resolution.", autoPlay: true },
      { chord: "E",   function: "dominant (V)",                                    title: "Back to the dominant", body: "E major. The V chord, now without the augmented fifth. Stable. Compare this to step 1 — same root, completely different feel.", autoPlay: true },
      { chord: "F#m", function: "submediant (vi)",                                 title: "The minor turn",      body: "F♯ minor. The relative minor of A. After the brightness of the opening, this is where the ache comes in.", autoPlay: true },
      { chord: "D",   function: "subdominant (IV)",                                title: "Opening up",          body: "D major. The IV chord opens the progression outward — we've moved from I to vi to IV, each step further from home.", autoPlay: true },
      { chord: "B",   chordType: "min7", function: "supertonic (ii7)",             title: "The gentle pull",     body: "B minor 7. The ii chord with a seventh, creating a soft pull toward the dominant.", autoPlay: true },
      { chord: "E",   function: "dominant (V)",                                    title: "The turnaround",      body: "E major again. Pulling back.", autoPlay: true },
      { chord: "B",   chordType: "min7", function: "supertonic (ii7)",             title: "Once more",           body: "B minor 7 again — the ii-V pattern repeating. McCartney is building tension through repetition.", autoPlay: true },
      { chord: "E",   function: "dominant (V)",                                    title: "The final push",      body: "E major. Three times we've hit the dominant now. The pull toward home is undeniable.", autoPlay: true, concept_specifics: ["V_I_resolution"] },
      { chord: "A",   function: "tonic (I)",                                       title: "Home",                body: "A major. Resolution at last. The whole progression started with that one raised note. B♯ reaching up to C♯. That's all it took to make 'Oh! Darling' ache.", autoPlay: true },
      { chord: "E",   function: "dominant (V)",                                    title: "Ready to reach again", body: "E major. The dominant, hanging open. Not resolved — because the next time around, that B is going to rise again. The cycle never really ends.", autoPlay: true, concept_specifics: ["V_I_resolution"] }
    ]
  },

  life_on_mars_augmented: {
    title: "Augmented Chords as Chromatic Connectors",
    song: "Life on Mars? — David Bowie",
    key: "F",
    category: "Voice Leading",
    audience: "musician",
    seeAlso: { label: "Chord Walks", href: "/harmony" },
    rhythm: {
      time_sig: "4/4",
      bpm: 68,
      feel: "Art rock piano ballad",
      description: "Rick Wakeman's piano drives the rhythm with rolling arpeggios that build in intensity. The left hand walks a chromatic bassline while the right hand fills with sustained chords. Drums enter in the chorus with a heavy, almost orchestral feel.",
      pattern: [
        { beat: "1", label: "BASS",  type: "bass" },
        { beat: "&", label: "roll",  type: "strum" },
        { beat: "2", label: "chord", type: "strum" },
        { beat: "&", label: "roll",  type: "strum" },
        { beat: "3", label: "BASS",  type: "bass" },
        { beat: "&", label: "roll",  type: "strum" },
        { beat: "4", label: "chord", type: "snare" },
        { beat: "&", label: "roll",  type: "strum" }
      ]
    },
    steps: [
      { chord: "F",   function: "tonic (I)",                         title: "The verse foundation",  body: "F major. The verse of Life on Mars uses a descending chromatic bassline — F, E, E♭, D — under changing chords. It's sophisticated but controlled. The real harmonic fireworks come in the pre-chorus.", autoPlay: true },
      { chord: "C",   chordType: "augmented", function: "V+",        title: "The augmented dominant", body: "C augmented — 'But the film is a saddening bore.' The augmented chord raises the fifth of C (G) up to G♯. This creates an upward pull — G♯ wants to resolve to A♭, which is the root of the next chord's key area. Where a dominant 7th pulls you home, an augmented chord pushes you somewhere unexpected.", autoPlay: true, concept_specifics: ["augmented", "chromatic_voice_leading"] },
      { chord: "Fm",  function: "i (temporary)",                     title: "The minor resolution",   body: "F minor. The C augmented chord resolved here — the G♯ moved to A♭, which is the minor third of F minor. The augmented chord acted like a dominant pushing into a minor key. Bowie keeps destabilizing your sense of key center.", autoPlay: true },
      { chord: "A",   chordType: "augmented", function: "chromatic connector", title: "Another augmented push", body: "A augmented — 'It's about to be writ again.' Same trick, different chord. The raised fifth (E♯/F) pushes upward into B♭ minor. Bowie uses augmented chords like stepping stones, each one launching you into an unexpected key.", autoPlay: true, concept_specifics: ["augmented", "chromatic_voice_leading"] },
      { chord: "Bbm", function: "temporary tonic",                   title: "Arriving somewhere new", body: "B♭ minor. Each augmented chord has pushed us further from home — F major feels like a distant memory. This is what makes Life on Mars feel like a journey. The harmony literally travels.", autoPlay: true },
      { chord: "Bb",  function: "IV (chorus)",                       title: "The chorus arrives",    body: "B♭ major — 'Sailors, fighting in the dance hall.' The chorus explodes into the subdominant. After all that chromatic wandering, a plain major chord feels like a revelation.", autoPlay: true },
      { chord: "F#",  chordType: "augmented", function: "chromatic passing", title: "Even the chorus has one", body: "F♯ augmented — 'Oh man!' Even in the chorus, Bowie can't resist. This augmented chord connects Gm to F via chromatic voice leading. The raised fifth of F♯ (C♯/D♭) drops to C, landing on F major. Augmented chords work in both directions — Bowie understood this intuitively.", autoPlay: true, concept_specifics: ["augmented", "chromatic_voice_leading"] },
      { chord: "F",   function: "return to I",                       title: "Full circle — almost",  body: "F major. We're 'home' — but after everything Bowie put us through, home doesn't feel the same. That's the power of chromatic harmony. The augmented chords didn't just add color — they changed our relationship to the tonic.", autoPlay: true }
    ]
  },

  vienna_chromatic_mediant: {
    title: "Vienna's Chromatic Heartache",
    song: "Vienna — Billy Joel",
    key: "C",
    category: "Voice Leading",
    audience: "musician",
    seeAlso: { label: "Voice Leading", href: "/games/chord-walks" },
    rhythm: {
      time_sig: "3/4",
      bpm: 96,
      feel: "Gentle piano waltz",
      description: "A gentle piano waltz. The left hand drops a bass note on beat 1, the right hand answers with chords on beats 2 and 3. ONE-two-three, ONE-two-three — the sway that gives Vienna its aching forward motion.",
      pattern: [
        { beat: "1", label: "BASS",  type: "bass" },
        { beat: "2", label: "chord", type: "strum" },
        { beat: "3", label: "chord", type: "strum" }
      ],
      concept_specifics: ["waltz"]
    },
    steps: [
      { chord: "C",  function: "tonic (I)",              title: "Home base",                 body: "Bright C major in 3/4 time — a waltz. ONE-two-three, ONE-two-three. Let the lilt settle in before the harmony starts to move.", autoPlay: true },
      { chord: "E",  function: "chromatic mediant (III)",title: "The chromatic mediant",     body: "C major to E major — no shared notes in the triad, maximum color shift. Listen to the bass walk from C down to B to G♯. Watch how dramatic that jump is on the Tonnetz.", autoPlay: true, focus: "tonnetz", concept_specifics: ["chromatic_mediant"] },
      { chord: "Am", function: "relative minor (vi)",    title: "The resolution",            body: "E major pulls into A minor — the relative minor. Two notes change, one stays. It's an L then P chain — lean, then parallel — and it feels like the harmony finally exhales.", autoPlay: true, highlightTransform: "L", concept_specifics: ["LP_chain", "relative_major_minor"] },
      { chord: "F",  function: "subdominant (IV)",       title: "Familiar ground",           body: "F major. The IV chord softens the mood before the cycle repeats. After the drama of the chromatic mediant, this is the safest chord in the room.", autoPlay: true },
      { chord: "C",  function: "tonic, 1st inversion",   title: "Back to C — with G in the bass", body: "C/G. The bass has been walking down the whole time: C — B — A — G. That chromatic descent is what gives Vienna its aching quality. Watch the bass note on the keyboard.", autoPlay: true, focus: "keyboard", concept_specifics: ["chromatic_bass", "voice_leading"] },
      { chord: "G",  function: "dominant (V)",           title: "Tension before resolution", body: "The V chord. Tension before resolution. The whole progression is a lesson in how chromatic bass movement creates emotional pull — six chords, but your ear feels like it's been pulled through every one of them.", autoPlay: true }
    ]
  },
};

export { WALKTHROUGHS };
