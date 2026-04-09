/**
 * ch5-transforms.js — Chapter 5: Transforms
 * Placeholder section definitions.
 */

export const chapterMeta = {
  number: 5,
  title: 'Transforms',
  tone: 'formal',
  description: 'PLR operations: the elegant moves that connect every chord.',
};

export const sections = [
  {
    id: 'ch5-plr-intro',
    title: 'P, L, and R',
    narration:
      'Neo-Riemannian theory names the three fundamental triangle-adjacency moves on the Tonnetz. ' +
      'P (Parallel) flips a chord between major and minor while keeping the root and fifth. ' +
      'L (Leading-tone exchange) moves one note by a semitone, creating a chord a major third away. ' +
      'R (Relative) swaps a chord with its relative major or minor — ' +
      'the pair that shares all its notes but one. These three operations generate all triad-to-triad movement.',
    interactive: 'plr-buttons',
    tryIt: 'Start on C major. Apply P, then L, then R and listen to the path you\'ve traveled.',
    onActivate: null,
  },
  {
    id: 'ch5-chains-cycles',
    title: 'Chains and Cycles',
    narration:
      'PLR operations can be chained. Applying R repeatedly cycles through six chords before returning home. ' +
      'Alternating L and R creates the famous hexatonic cycle — six chords that form a closed loop, ' +
      'beloved by film composers for its dreamy, hovering quality. ' +
      'Schubert used these chains intuitively in the 1820s, ' +
      'a full century before theorists had language to describe them.',
    interactive: 'plr-chain',
    tryIt: 'Build a chain of PLR moves and watch the path trace across the Tonnetz grid.',
    onActivate: null,
  },
  {
    id: 'ch5-real-music',
    title: 'Transforms in Real Music',
    narration:
      'You\'ve heard PLR transforms countless times without knowing it. ' +
      'The opening of Beethoven\'s Ninth moves through an R transform. ' +
      'The "Leia\'s Theme" modulation in Star Wars traces an L. ' +
      'Modern film scores lean heavily on hexatonic and octatonic progressions ' +
      'that are easy to see — and hear — on the Tonnetz. ' +
      'Now you have the map. Go explore.',
    interactive: 'music-examples',
    tryIt: 'Listen to the excerpts and identify the PLR move connecting each chord pair.',
    gameLink: {
      game: 'chord-walks',
      label: 'Play Chord Walks →',
      url: '/games/chord-walks',
    },
    onActivate: null,
  },
];
