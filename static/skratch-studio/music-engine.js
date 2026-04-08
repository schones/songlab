// music-engine.js — MusicEngine wrapping Tone.Transport with instrument pooling

import { SALAMANDER_BASE_URL, SALAMANDER_URLS } from './audio-bridge.js';

export class MusicEngine {
  constructor() {
    this._started = false;
    this._instruments = {};
    this._volume = null;
    this._scheduledIds = [];
    this._onBeatCallback = null;
    this._beatLoopId = null;
    this._loopEndBar = 1; // tracks the end of the last scheduled measure
    this._loopCallback = null;
    this._rescheduleCallback = null;

    // Sustain intercept for transport-scheduled notes
    this._sustain = false;
    this._sustainedTransportNotes = [];

    this._boundLoopHandler = (time) => {
      // Synchronous reschedule fires first — clears & re-schedules events
      // before the transport plays the next loop iteration
      if (this._rescheduleCallback) {
        this._rescheduleCallback();
      }
      if (this._loopCallback) {
        Tone.Draw.schedule(() => this._loopCallback(), time);
      }
    };
  }

  async ensureTone() {
    if (this._started) return;
    await Tone.start();
    this._volume = new Tone.Volume(0).toDestination();
    this._createInstruments();
    this._started = true;
  }

  _createInstruments() {
    // Drums — short percussive synths
    this._instruments.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      volume: -4,
    }).connect(this._volume);

    this._instruments.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -8,
    }).connect(this._volume);

    this._instruments.hihat = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.06, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -16,
    }).connect(this._volume);

    // Bass — monophonic deep synth
    this._instruments.bass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
      filterEnvelope: {
        attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3,
        baseFrequency: 80, octaves: 2.5,
      },
      volume: -6,
    }).connect(this._volume);

    // Melody — bright synth
    this._instruments.melody = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5 },
      volume: -8,
    }).connect(this._volume);

    // Chords — Salamander Grand Piano sampler for rich chord playback.
    // Samples are cached by the browser from AudioBridge's earlier load.
    this._instruments.chords = new Tone.Sampler({
      urls:    SALAMANDER_URLS,
      baseUrl: SALAMANDER_BASE_URL,
      release: 1,
      volume: -10,
    }).connect(this._volume);

    // Loop playback — dedicated PolySynth for saved loop blocks
    this._instruments.loop = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.6 },
      volume: -8,
    }).connect(this._volume);
  }

  // --- Transport controls ---

  setBpm(bpm) {
    Tone.Transport.bpm.value = bpm;
  }

  getBpm() {
    return Tone.Transport.bpm.value;
  }

  setVolume(db) {
    if (this._volume) this._volume.volume.value = db;
  }

  setLoop(enabled) {
    // Compute loop end in seconds from BPM to avoid Tone.js time-string parsing issues.
    // 4 beats per measure (4/4 time).
    const bpm = Tone.Transport.bpm.value;
    const secondsPerBeat = 60 / bpm;
    const loopEndSec = secondsPerBeat * 4 * this._loopEndBar;

    // Set boundaries BEFORE enabling loop — Tone's internal TimelineValue
    // can lose the boolean if loopEnd is still 0 when loop flips to true.
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = loopEndSec;
    Tone.Transport.loop = enabled;

  }

  onLoopRestart(callback) {
    this._loopCallback = callback;
    this._updateLoopListener();
  }

  onLoopReschedule(callback) {
    this._rescheduleCallback = callback;
    this._updateLoopListener();
  }

  _updateLoopListener() {
    Tone.Transport.off('loop', this._boundLoopHandler);
    if (this._loopCallback || this._rescheduleCallback) {
      Tone.Transport.on('loop', this._boundLoopHandler);
    }
  }

  // Clear all scheduled music events (but keep beat loop and transport running)
  clearScheduledEvents() {
    for (const id of this._scheduledIds) {
      Tone.Transport.clear(id);
    }
    this._scheduledIds = [];
    this._loopEndBar = 1;
  }

  start() {
    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.loop = false;
    Tone.Transport.off('loop', this._boundLoopHandler);
    this._loopCallback = null;
    this._rescheduleCallback = null;
    this._scheduledIds = [];
    this._loopEndBar = 1;
    this._stopBeatLoop();
    this.releaseSustainedNotes();
    this.releaseAllInstruments(); // cut any notes whose release was cancelled with the Transport
  }

  /** Immediately silence all instrument voices (called after Transport.cancel()). */
  releaseAllInstruments() {
    for (const inst of Object.values(this._instruments)) {
      try {
        if (typeof inst.releaseAll === 'function') {
          inst.releaseAll();          // PolySynth (chords, loop)
        } else {
          inst.triggerRelease(Tone.now()); // Synth, MonoSynth, MembraneSynth, etc.
        }
      } catch (_) {}
    }
  }

  // --- Sustain Control ---
  setSustain(isSustained) {
    this._sustain = isSustained;
    if (!isSustained) {
      this.releaseSustainedNotes();
    }
  }

  releaseSustainedNotes() {
    for (const record of this._sustainedTransportNotes) {
      try {
        if (record.notes) {
          record.instrument.triggerRelease(record.notes, Tone.now());
        } else {
          record.instrument.triggerRelease(Tone.now());
        }
      } catch (e) { /* ignore */ }
    }
    this._sustainedTransportNotes = [];
  }

  // --- Scheduling API (called by compiled music code) ---

  _trackTime(time) {
    const bar = (parseInt(time.split(':')[0], 10) || 0) + 1;
    if (bar > this._loopEndBar) this._loopEndBar = bar;
  }

  scheduleKick(time, note) {
    this._trackTime(time);
    note = note || 'C1';
    const id = Tone.Transport.schedule((t) => {
      this._instruments.kick.triggerAttackRelease(note, '8n', t);
    }, time);
    this._scheduledIds.push(id);
  }

  scheduleSnare(time) {
    this._trackTime(time);
    const id = Tone.Transport.schedule((t) => {
      this._instruments.snare.triggerAttackRelease('8n', t);
    }, time);
    this._scheduledIds.push(id);
  }

  scheduleHihat(time) {
    this._trackTime(time);
    const id = Tone.Transport.schedule((t) => {
      this._instruments.hihat.triggerAttackRelease('C4', '32n', t);
    }, time);
    this._scheduledIds.push(id);
  }

  scheduleBass(note, duration, time) {
    this._trackTime(time);

    const attackId = Tone.Transport.schedule((t) => {
      this._instruments.bass.triggerAttack(note, t);
    }, time);
    this._scheduledIds.push(attackId);

    const durSec = Tone.Time(duration).toSeconds();
    const releaseTime = Tone.Time(time).toSeconds() + durSec;
    const releaseId = Tone.Transport.schedule((t) => {
      if (this._sustain) {
        this._sustainedTransportNotes.push({ instrument: this._instruments.bass, notes: note });
      } else {
        this._instruments.bass.triggerRelease(t);
      }
    }, releaseTime);
    this._scheduledIds.push(releaseId);
  }

  scheduleMelody(note, duration, time) {
    this._trackTime(time);

    const attackId = Tone.Transport.schedule((t) => {
      this._instruments.melody.triggerAttack(note, t);
    }, time);
    this._scheduledIds.push(attackId);

    const durSec = Tone.Time(duration).toSeconds();
    const releaseTime = Tone.Time(time).toSeconds() + durSec;
    const releaseId = Tone.Transport.schedule((t) => {
      if (this._sustain) {
        this._sustainedTransportNotes.push({ instrument: this._instruments.melody, notes: note });
      } else {
        this._instruments.melody.triggerRelease(t);
      }
    }, releaseTime);
    this._scheduledIds.push(releaseId);
  }

  scheduleChord(notes, duration, time) {
    this._trackTime(time);

    const attackId = Tone.Transport.schedule((t) => {
      this._instruments.chords.triggerAttack(notes, t);
    }, time);
    this._scheduledIds.push(attackId);

    const durSec = Tone.Time(duration).toSeconds();
    const releaseTime = Tone.Time(time).toSeconds() + durSec;
    const releaseId = Tone.Transport.schedule((t) => {
      if (this._sustain) {
        this._sustainedTransportNotes.push({ instrument: this._instruments.chords, notes: notes });
      } else {
        this._instruments.chords.triggerRelease(notes, t);
      }
    }, releaseTime);
    this._scheduledIds.push(releaseId);
  }

  scheduleLoopNote(note, durationSec, startTimeSec) {
    const attackId = Tone.Transport.schedule((t) => {
      this._instruments.loop.triggerAttack(note, t);
    }, startTimeSec);
    this._scheduledIds.push(attackId);

    const releaseId = Tone.Transport.schedule((t) => {
      if (this._sustain) {
        this._sustainedTransportNotes.push({ instrument: this._instruments.loop, notes: note });
      } else {
        this._instruments.loop.triggerRelease(note, t);
      }
    }, startTimeSec + durationSec);
    this._scheduledIds.push(releaseId);
  }

  updateLoopEnd(loopLengthSec) {
    const bpm = Tone.Transport.bpm.value;
    const secPerBar = (60 / bpm) * 4;
    const bars = Math.ceil(loopLengthSec / secPerBar);
    if (bars > this._loopEndBar) this._loopEndBar = bars;
  }

  // --- Loop scheduling (repeating patterns) ---

  scheduleLoop(callback, interval) {
    const id = Tone.Transport.scheduleRepeat((t) => {
      callback(t);
    }, interval);
    this._scheduledIds.push(id);
    return id;
  }

  // --- Beat indicator callback ---

  onBeat(callback) {
    this._onBeatCallback = callback;
  }

  startBeatLoop() {
    this._stopBeatLoop();
    this._beatLoopId = Tone.Transport.scheduleRepeat((time) => {
      Tone.Draw.schedule(() => {
        if (this._onBeatCallback) this._onBeatCallback();
      }, time);
    }, '4n');
  }

  _stopBeatLoop() {
    if (this._beatLoopId !== null) {
      Tone.Transport.clear(this._beatLoopId);
      this._beatLoopId = null;
    }
  }

  // --- Cleanup ---

  destroy() {
    this.stop();
    for (const key in this._instruments) {
      try { this._instruments[key].dispose(); } catch (e) { /* ignore */ }
    }
    this._instruments = {};
    try { this._volume.dispose(); } catch (e) { /* ignore */ }
    this._started = false;
  }
}
