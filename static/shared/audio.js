/**
 * Music Theory Games — Audio Utilities
 * shared/audio.js
 *
 * Wraps Tone.js (loaded via CDN) for synthesis and the raw Web Audio API
 * for pitch detection via autocorrelation.
 */

/* ---------------------------------------------------------- */
/*  Constants                                                 */
/* ---------------------------------------------------------- */

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

// Enharmonic display names for nicer UI
const NOTE_DISPLAY = {
  "C": "C", "C#": "C#/Db", "D": "D", "D#": "D#/Eb",
  "E": "E", "F": "F", "F#": "F#/Gb", "G": "G",
  "G#": "G#/Ab", "A": "A", "A#": "A#/Bb", "B": "B",
};

const INTERVAL_NAMES = [
  "Unison",        // 0
  "Minor 2nd",     // 1
  "Major 2nd",     // 2
  "Minor 3rd",     // 3
  "Major 3rd",     // 4
  "Perfect 4th",   // 5
  "Tritone",       // 6
  "Perfect 5th",   // 7
  "Minor 6th",     // 8
  "Major 6th",     // 9
  "Minor 7th",     // 10
  "Major 7th",     // 11
  "Octave",        // 12
];

const A4_FREQ = 440;
const A4_MIDI = 69;

/* ---------------------------------------------------------- */
/*  Module state                                              */
/* ---------------------------------------------------------- */

let audioContext = null;
let synth = null;
let micStream = null;
let analyserNode = null;
let detectionRunning = false;
let detectionFrameId = null;

/* ---------------------------------------------------------- */
/*  Initialization                                            */
/* ---------------------------------------------------------- */

/**
 * Initialize the audio system. Must be called from a user gesture
 * (click / tap) due to browser autoplay policies.
 *
 * @returns {AudioContext} The underlying AudioContext
 */
export async function initAudio() {
  if (audioContext && audioContext.state === "running") {
    return audioContext;
  }

  // Ensure Tone.js is loaded (it should be via CDN in the HTML)
  if (typeof Tone === "undefined") {
    throw new Error("Tone.js is not loaded. Include it via <script> before using audio.js.");
  }

  await Tone.start();
  audioContext = Tone.getContext().rawContext;

  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: {
      attack: 0.02,
      decay: 0.3,
      sustain: 0.4,
      release: 0.8,
    },
    volume: -8,
  }).toDestination();

  return audioContext;
}

/* ---------------------------------------------------------- */
/*  Note / Frequency conversions                              */
/* ---------------------------------------------------------- */

/**
 * Convert a frequency in Hz to note info.
 *
 * @param {number} freq - Frequency in Hz
 * @returns {{ noteName: string, octave: number, cents: number, fullName: string }}
 */
export function frequencyToNote(freq) {
  if (freq <= 0) return null;

  const midiFloat = 12 * Math.log2(freq / A4_FREQ) + A4_MIDI;
  const midi = Math.round(midiFloat);
  let cents = Math.round((midiFloat - midi) * 100);
  
  // Pedagogical Grace Window: For kids singing/playing, +/- 15 cents is "close enough" and perfectly in tune
  if (Math.abs(cents) <= 15) {
    cents = 0;
  }
  
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[noteIndex];

  return {
    noteName,
    octave,
    cents,
    fullName: `${noteName}${octave}`,
    displayName: NOTE_DISPLAY[noteName],
  };
}

/**
 * Convert a scientific pitch name (e.g. "C4", "F#3") to Hz.
 *
 * @param {string} name - Scientific pitch notation
 * @returns {number} Frequency in Hz
 */
export function noteToFrequency(name) {
  const match = name.match(/^([A-G]#?)(\d+)$/);
  if (!match) throw new Error(`Invalid note name: "${name}"`);

  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const noteIndex = NOTE_NAMES.indexOf(noteName);
  if (noteIndex === -1) throw new Error(`Unknown note: "${noteName}"`);

  const midi = (octave + 1) * 12 + noteIndex;
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * Get the interval name for a given number of semitones.
 *
 * @param {number} semitones - 0–12
 * @returns {string} Interval name
 */
export function getIntervalName(semitones) {
  const clamped = Math.abs(semitones) % 13;
  return INTERVAL_NAMES[clamped] ?? `${semitones} semitones`;
}

/**
 * Get semitone count from an interval name.
 *
 * @param {string} name - e.g. "Perfect 5th"
 * @returns {number} Semitones (0–12), or -1 if not found
 */
export function getSemitones(name) {
  const idx = INTERVAL_NAMES.findIndex(
    (n) => n.toLowerCase() === name.toLowerCase()
  );
  return idx;
}

/**
 * Generate an array of note names from C3 to C5.
 *
 * @returns {string[]} e.g. ["C3", "C#3", "D3", ... "C5"]
 */
export function getNoteRange(startOctave = 3, endNote = "C5") {
  const notes = [];
  for (let octave = startOctave; octave <= 5; octave++) {
    for (const name of NOTE_NAMES) {
      const full = `${name}${octave}`;
      notes.push(full);
      if (full === endNote) return notes;
    }
  }
  return notes;
}

/* ---------------------------------------------------------- */
/*  Playback                                                  */
/* ---------------------------------------------------------- */

/**
 * Play a single note.
 *
 * @param {string} noteName   - Scientific pitch (e.g. "C4")
 * @param {number} [duration] - Duration in seconds (default 0.8)
 */
export function playNote(noteName, duration = 0.8) {
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  if (!synth) {
    console.warn("[audio] Call initAudio() first.");
    return;
  }
  synth.triggerAttackRelease(noteName, duration);
}

/**
 * Play an interval: two notes from a root.
 *
 * @param {string} rootNote          - Root note (e.g. "C4")
 * @param {number} intervalSemitones - Semitones above root
 * @param {"harmonic"|"melodic-up"|"melodic-down"} mode - Playback mode
 * @param {number} [noteDuration]    - Per-note duration in seconds
 */
export function playInterval(rootNote, intervalSemitones, mode = "melodic-up", noteDuration = 0.8) {
  if (window.AudioToggle && AudioToggle.isMuted()) return;
  if (!synth) {
    console.warn("[audio] Call initAudio() first.");
    return;
  }

  // Exact pitch calculation using Note -> Midi -> Traposition -> Frequency
  // instead of relying on rounding note strings
  const rootFreq = noteToFrequency(rootNote);
  // Calculate root exact MIDI float
  const rootMidiFloat = 12 * Math.log2(rootFreq / A4_FREQ) + A4_MIDI;
  // Calculate exact interval MIDI float
  const secondMidiFloat = rootMidiFloat + intervalSemitones;
  // Calculate exact interval frequency
  const secondFreq = A4_FREQ * Math.pow(2, (secondMidiFloat - A4_MIDI) / 12);

  const now = Tone.now();

  switch (mode) {
    case "harmonic":
      synth.triggerAttackRelease(rootFreq, noteDuration, now);
      synth.triggerAttackRelease(secondFreq, noteDuration, now);
      break;

    case "melodic-down":
      synth.triggerAttackRelease(secondFreq, noteDuration, now);
      synth.triggerAttackRelease(rootFreq, noteDuration, now + noteDuration + 0.15);
      break;

    case "melodic-up":
    default:
      synth.triggerAttackRelease(rootFreq, noteDuration, now);
      synth.triggerAttackRelease(secondFreq, noteDuration, now + noteDuration + 0.15);
      break;
  }
}

/* ---------------------------------------------------------- */
/*  Pitch Detection (autocorrelation)                         */
/* ---------------------------------------------------------- */

export async function startPitchDetection(callback) {
  if (detectionRunning) return;
  detectionRunning = true;

  try {
    await fetch('/start_listen', { method: 'POST' });
  } catch (err) {
    console.error(err);
    throw new Error("Could not start background python audio listener.");
  }

  async function detect() {
    if (!detectionRunning) return;

    try {
      const res = await fetch('/poll_audio');
      const data = await res.json();
      
      if (data.active && data.pitch && data.pitch.frequency > 0) {
        const freq = data.pitch.frequency;
        const noteInfo = frequencyToNote(freq);
        callback(freq, noteInfo);
      } else {
        callback(0, null);
      }
    } catch (e) {
      // ignore poll errors
    }

    if (detectionRunning) {
      detectionFrameId = setTimeout(detect, 40); // Poll ~25fps
    }
  }

  detect();
}

/**
 * Stop pitch detection and release the microphone.
 */
export function stopPitchDetection() {
  detectionRunning = false;

  if (detectionFrameId) {
    clearTimeout(detectionFrameId);
    detectionFrameId = null;
  }

  fetch('/stop_listen', { method: 'POST' }).catch(e => console.error(e));
}

/**
 * Autocorrelation pitch detection.
 * Returns the detected fundamental frequency in Hz, or -1 if no clear pitch.
 *
 * @param {Float32Array} buffer     - Time-domain audio samples
 * @param {number}       sampleRate - Audio context sample rate
 * @returns {number} Frequency in Hz, or -1
 */
function autocorrelate(buffer, sampleRate) {
  const n = buffer.length;

  // Check if signal is loud enough (RMS)
  let rms = 0;
  for (let i = 0; i < n; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return -1; // Too quiet

  // Trim silence from edges
  let start = 0;
  let end = n - 1;
  const threshold = 0.2;
  while (start < n && Math.abs(buffer[start]) < threshold) start++;
  while (end > 0 && Math.abs(buffer[end]) < threshold) end--;

  if (end <= start) return -1;

  const trimmed = buffer.slice(start, end + 1);
  const len = trimmed.length;

  // Autocorrelation
  const corr = new Float32Array(len);
  for (let lag = 0; lag < len; lag++) {
    let sum = 0;
    for (let i = 0; i < len - lag; i++) {
      sum += trimmed[i] * trimmed[i + lag];
    }
    corr[lag] = sum;
  }

  // Find first dip then first peak after it
  let d = 0;
  while (d < len && corr[d] > 0) d++;
  if (d >= len) return -1;

  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < len; i++) {
    if (corr[i] > maxVal) {
      maxVal = corr[i];
      maxPos = i;
    }
  }

  if (maxPos === -1) return -1;

  // Educational UI: Simplified pitch reporting without parabolic sub-sample accuracy.
  // The +/- 15 grace window handles the "close enough" logic for kids.
  // This reduces processing overhead slightly and avoids micro-fluctuations in UI.
  return sampleRate / maxPos;
}

/* ---------------------------------------------------------- */
/*  Exports for convenience                                   */
/* ---------------------------------------------------------- */

export { NOTE_NAMES, NOTE_DISPLAY, INTERVAL_NAMES };
