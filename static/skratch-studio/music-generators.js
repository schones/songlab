// music-generators.js — JS code generators for music blocks (clean Tone.js output)

import { TRANSFORMS } from '../shared/transforms.js';

// Chord definitions — matches chords/index.html
// Major = root + major 3rd (4 semitones) + perfect 5th (7 semitones)
// Minor = root + minor 3rd (3 semitones) + perfect 5th (7 semitones)
// Diminished = root + minor 3rd (3 semitones) + tritone (6 semitones)
const CHORD_INTERVALS = {
  major:      [0, 4, 7],
  minor:      [0, 3, 7],
  diminished: [0, 3, 6],
};

const NOTE_SEMITONES = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

const SEMITONE_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function buildChordNotes(root, quality, octave) {
  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS.major;
  const rootSemitone = NOTE_SEMITONES[root] || 0;

  return intervals.map(interval => {
    const semitone = (rootSemitone + interval) % 12;
    const oct = octave + Math.floor((rootSemitone + interval) / 12);
    return `${SEMITONE_NOTES[semitone]}${oct}`;
  });
}

// Drum pattern presets — each returns array of {instrument, time} events
const DRUM_PATTERNS = {
  rock: [
    { inst: 'kick',  time: '0:0:0' },
    { inst: 'hihat', time: '0:0:0' },
    { inst: 'hihat', time: '0:0:2' },
    { inst: 'snare', time: '0:1:0' },
    { inst: 'hihat', time: '0:1:0' },
    { inst: 'hihat', time: '0:1:2' },
    { inst: 'kick',  time: '0:2:0' },
    { inst: 'hihat', time: '0:2:0' },
    { inst: 'hihat', time: '0:2:2' },
    { inst: 'snare', time: '0:3:0' },
    { inst: 'hihat', time: '0:3:0' },
    { inst: 'hihat', time: '0:3:2' },
  ],
  disco: [
    { inst: 'kick',  time: '0:0:0' },
    { inst: 'hihat', time: '0:0:0' },
    { inst: 'hihat', time: '0:0:2' },
    { inst: 'kick',  time: '0:1:0' },
    { inst: 'snare', time: '0:1:0' },
    { inst: 'hihat', time: '0:1:0' },
    { inst: 'hihat', time: '0:1:2' },
    { inst: 'kick',  time: '0:2:0' },
    { inst: 'hihat', time: '0:2:0' },
    { inst: 'hihat', time: '0:2:2' },
    { inst: 'kick',  time: '0:3:0' },
    { inst: 'snare', time: '0:3:0' },
    { inst: 'hihat', time: '0:3:0' },
    { inst: 'hihat', time: '0:3:2' },
  ],
  hiphop: [
    { inst: 'kick',  time: '0:0:0' },
    { inst: 'hihat', time: '0:0:2' },
    { inst: 'snare', time: '0:1:0' },
    { inst: 'hihat', time: '0:1:2' },
    { inst: 'kick',  time: '0:2:0' },
    { inst: 'kick',  time: '0:2:2' },
    { inst: 'snare', time: '0:3:0' },
    { inst: 'hihat', time: '0:3:2' },
  ],
  four: [
    { inst: 'kick',  time: '0:0:0' },
    { inst: 'hihat', time: '0:0:0' },
    { inst: 'hihat', time: '0:0:2' },
    { inst: 'kick',  time: '0:1:0' },
    { inst: 'hihat', time: '0:1:0' },
    { inst: 'hihat', time: '0:1:2' },
    { inst: 'kick',  time: '0:2:0' },
    { inst: 'hihat', time: '0:2:0' },
    { inst: 'hihat', time: '0:2:2' },
    { inst: 'kick',  time: '0:3:0' },
    { inst: 'hihat', time: '0:3:0' },
    { inst: 'hihat', time: '0:3:2' },
  ],
};

// Bass pattern presets — returns code string for a given key
const BASS_PATTERN_GENERATORS = {
  root(key) {
    return [
      `bass.triggerAttackRelease('${key}2', '4n', '0:0:0');`,
      `bass.triggerAttackRelease('${key}2', '4n', '0:2:0');`,
    ].join('\n');
  },
  walking(key) {
    const scale = buildScaleNotes(key, 2);
    return [
      `bass.triggerAttackRelease('${scale[0]}', '4n', '0:0:0');`,
      `bass.triggerAttackRelease('${scale[2]}', '4n', '0:1:0');`,
      `bass.triggerAttackRelease('${scale[4]}', '4n', '0:2:0');`,
      `bass.triggerAttackRelease('${scale[2]}', '4n', '0:3:0');`,
    ].join('\n');
  },
  octave(key) {
    return [
      `bass.triggerAttackRelease('${key}2', '8n', '0:0:0');`,
      `bass.triggerAttackRelease('${key}3', '8n', '0:0:2');`,
      `bass.triggerAttackRelease('${key}2', '8n', '0:2:0');`,
      `bass.triggerAttackRelease('${key}3', '8n', '0:2:2');`,
    ].join('\n');
  },
  funky(key) {
    const scale = buildScaleNotes(key, 2);
    return [
      `bass.triggerAttackRelease('${scale[0]}', '8n', '0:0:0');`,
      `bass.triggerAttackRelease('${scale[0]}', '16n', '0:0:2');`,
      `bass.triggerAttackRelease('${scale[3]}', '8n', '0:1:0');`,
      `bass.triggerAttackRelease('${scale[4]}', '8n', '0:2:0');`,
      `bass.triggerAttackRelease('${scale[3]}', '16n', '0:2:2');`,
      `bass.triggerAttackRelease('${scale[0]}', '4n', '0:3:0');`,
    ].join('\n');
  },
};

function buildScaleNotes(key, octave) {
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
  const rootSemitone = NOTE_SEMITONES[key] || 0;
  return majorIntervals.map(interval => {
    const semitone = (rootSemitone + interval) % 12;
    const oct = octave + Math.floor((rootSemitone + interval) / 12);
    return `${SEMITONE_NOTES[semitone]}${oct}`;
  });
}

// Track measure offset for sections — the generator uses this to offset times
let _measureOffset = 0;

function offsetTime(time, measures) {
  // time is like '0:1:2', measures is the offset in measures
  if (measures === 0) return time;
  const parts = time.split(':').map(Number);
  parts[0] += measures;
  return parts.join(':');
}

export function registerMusicGenerators() {
  const js = Blockly.JavaScript;
  const Order = js.ORDER_ATOMIC ? js : Blockly.JavaScript;

  // ===================== DRUMS =====================

  js.forBlock['play_kick'] = function(block) {
    const time = block.getFieldValue('TIME');
    return `kick.triggerAttackRelease('C1', '8n', '${time}');\n`;
  };

  js.forBlock['play_snare'] = function(block) {
    const time = block.getFieldValue('TIME');
    return `snare.triggerAttackRelease('8n', '${time}');\n`;
  };

  js.forBlock['play_hihat'] = function(block) {
    const time = block.getFieldValue('TIME');
    return `hihat.triggerAttackRelease('C4', '32n', '${time}');\n`;
  };

  js.forBlock['drum_pattern'] = function(block) {
    const pattern = block.getFieldValue('PATTERN');
    const events = DRUM_PATTERNS[pattern] || DRUM_PATTERNS.rock;
    let code = `// ${pattern} drum pattern\n`;
    for (const evt of events) {
      if (evt.inst === 'kick') {
        code += `kick.triggerAttackRelease('C1', '8n', '${evt.time}');\n`;
      } else if (evt.inst === 'snare') {
        code += `snare.triggerAttackRelease('8n', '${evt.time}');\n`;
      } else if (evt.inst === 'hihat') {
        code += `hihat.triggerAttackRelease('C4', '32n', '${evt.time}');\n`;
      }
    }
    return code;
  };

  // ===================== BASS =====================

  js.forBlock['play_bass_note'] = function(block) {
    const note = block.getFieldValue('NOTE');
    const duration = block.getFieldValue('DURATION');
    const time = block.getFieldValue('TIME');
    return `bass.triggerAttackRelease('${note}', '${duration}', '${time}');\n`;
  };

  js.forBlock['bass_pattern'] = function(block) {
    const pattern = block.getFieldValue('PATTERN');
    const key = block.getFieldValue('KEY');
    const gen = BASS_PATTERN_GENERATORS[pattern];
    if (!gen) return `// unknown bass pattern: ${pattern}\n`;
    return `// ${pattern} bass line in ${key}\n${gen(key)}\n`;
  };

  // ===================== MELODY =====================

  js.forBlock['play_melody_note'] = function(block) {
    const note = block.getFieldValue('NOTE');
    const duration = block.getFieldValue('DURATION');
    const time = block.getFieldValue('TIME');
    return `melody.triggerAttackRelease('${note}', '${duration}', '${time}');\n`;
  };

  js.forBlock['play_chord'] = function(block) {
    const root = block.getFieldValue('ROOT');
    const quality = block.getFieldValue('QUALITY');
    const duration = block.getFieldValue('DURATION');
    const time = block.getFieldValue('TIME');
    
    // Update tracked state
    js._skratchCurrentChord = { root, quality };

    const notes = buildChordNotes(root, quality, 4);
    const notesStr = notes.map(n => `'${n}'`).join(', ');
    return `chords.triggerAttackRelease([${notesStr}], '${duration}', '${time}');\n`;
  };

  // Normalize Unicode accidentals (♯/♭) from transforms.js to ASCII (#/b)
  // so note names stay compatible with buildChordNotes / NOTE_SEMITONES.
  function normalizeRoot(name) {
    return name.replace(/♯/g, '#').replace(/♭/g, 'b');
  }

  // Delegate to canonical PLR transforms from shared/transforms.js.
  // Involution property is preserved because TRANSFORMS.P/L/R already satisfy it.
  function applyTransform(type, duration, time) {
    const state = js._skratchCurrentChord || { root: 'C', quality: 'major' };
    const transformed = TRANSFORMS[type].apply(state.root, state.quality);
    const result = { root: normalizeRoot(transformed.root), quality: transformed.quality };

    js._skratchCurrentChord = result;
    const notes = buildChordNotes(result.root, result.quality, 4);
    const notesStr = notes.map(n => `'${n}'`).join(', ');
    return `chords.triggerAttackRelease([${notesStr}], '${duration}', '${time}');\n`;
  }

  js.forBlock['p_transform'] = function(block) {
    return applyTransform('P', block.getFieldValue('DURATION'), block.getFieldValue('TIME'));
  };

  js.forBlock['l_transform'] = function(block) {
    return applyTransform('L', block.getFieldValue('DURATION'), block.getFieldValue('TIME'));
  };

  js.forBlock['r_transform'] = function(block) {
    return applyTransform('R', block.getFieldValue('DURATION'), block.getFieldValue('TIME'));
  };

  js.forBlock['rest'] = function(block) {
    const duration = block.getFieldValue('DURATION');
    return `// rest (${duration})\n`;
  };

  // ===================== SONG STRUCTURE =====================

  js.forBlock['section'] = function(block) {
    const name = block.getFieldValue('NAME');
    const measures = parseInt(block.getFieldValue('MEASURES'), 10);
    const body = js.statementToCode(block, 'DO');

    let code = `// --- ${name} (${measures} measure${measures > 1 ? 's' : ''}) ---\n`;
    code += `for (let _m = 0; _m < ${measures}; _m++) {\n`;
    code += `  const _mOff = _m;\n`;
    code += body;
    code += `}\n`;
    return code;
  };

  js.forBlock['repeat_section'] = function(block) {
    const times = block.getFieldValue('TIMES');
    const body = js.statementToCode(block, 'DO');
    return `for (let _rep = 0; _rep < ${times}; _rep++) {\n${body}}\n`;
  };

  // ===================== TIMING =====================

  js.forBlock['set_tempo'] = function(block) {
    const bpm = block.getFieldValue('BPM');
    return `Tone.Transport.bpm.value = ${bpm};\n`;
  };

  js.forBlock['music_start'] = function(block) {
    const body = js.statementToCode(block, 'DO');
    // Declare instrument variables from the injected _instruments object
    // so that blocks like kick.triggerAttackRelease(...) resolve correctly.
    
    // reset global generator state tracking for chord
    js._skratchCurrentChord = { root: 'C', quality: 'major' };

    return `// 🎵 Music — set up instruments\n` +
      `const kick = _instruments.kick;\n` +
      `const snare = _instruments.snare;\n` +
      `const hihat = _instruments.hihat;\n` +
      `const bass = _instruments.bass;\n` +
      `const melody = _instruments.melody;\n` +
      `const chords = _instruments.chords;\n\n` +
      body;
  };
}

// Export for use by music-engine scheduling
export { DRUM_PATTERNS, BASS_PATTERN_GENERATORS, buildChordNotes, buildScaleNotes, offsetTime };
