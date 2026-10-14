/**
 * midi-input.js
 * =============
 * Singleton Web MIDI input manager for SongLab.
 *
 * Wraps navigator.requestMIDIAccess to enumerate input devices,
 * persist a device preference, and dispatch note/CC/pitch-bend
 * events to subscribers. Any SongLab component can import this
 * module to receive live MIDI without touching the Web MIDI API.
 *
 * Consumed by:
 *   - spectrum-view.js        → Harmonic Resonance FFT panel
 *   - (future) keyboard-view  → live note highlighting
 *   - (future) explorer.js    → MIDI-driven chord detection
 *
 * Depends on:
 *   - Web MIDI API (navigator.requestMIDIAccess)
 *   - localStorage (device preference persistence)
 *
 * Exposes: window.MIDIInput  (also ES-module default + named export)
 *
 * ─── Launchkey 49 CC map ────────────────────────────────────────────
 *   Keys          → note on/off, channel 1
 *   Pads          → note on/off, channel 10 (drum map)
 *   Knobs 1–8     → CC 21, 22, 23, 24, 25, 26, 27, 28
 *   Transport     → CC 115 (play), 116 (stop), 117 (record), 118 (loop)
 *   Mod wheel     → CC 1
 *   Sustain pedal → CC 64
 * ────────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY = 'songlab_midi_device';

// ════════════════════════════════════════════════════════════════════
// INTERNAL STATE
// ════════════════════════════════════════════════════════════════════

let _midiAccess = null;
let _currentInput = null;

const _listeners = {
  noteOn: new Set(),
  noteOff: new Set(),
  cc: new Set(),
  pitchBend: new Set(),
};

// ════════════════════════════════════════════════════════════════════
// MESSAGE PARSING
// ════════════════════════════════════════════════════════════════════

function _handleMessage(event) {
  const [status, data1, data2] = event.data;
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1; // 1-indexed channels (1..16)

  switch (command) {
    case 0x90: {
      // Note on (velocity 0 = note off)
      if (data2 > 0) {
        MIDIInput.activeNotes.add(data1);
        _listeners.noteOn.forEach((cb) => {
          try { cb(data1, data2, channel); } catch (e) { console.error(e); }
        });
      } else {
        MIDIInput.activeNotes.delete(data1);
        _listeners.noteOff.forEach((cb) => {
          try { cb(data1, channel); } catch (e) { console.error(e); }
        });
      }
      break;
    }
    case 0x80: {
      // Note off
      MIDIInput.activeNotes.delete(data1);
      _listeners.noteOff.forEach((cb) => {
        try { cb(data1, channel); } catch (e) { console.error(e); }
      });
      break;
    }
    case 0xb0: {
      // Control change
      _listeners.cc.forEach((cb) => {
        try { cb(data1, data2, channel); } catch (e) { console.error(e); }
      });
      break;
    }
    case 0xe0: {
      // Pitch bend — 14-bit value centered at 8192, normalized to [-1, 1]
      const raw = (data2 << 7) | data1;
      const value = (raw - 8192) / 8192;
      _listeners.pitchBend.forEach((cb) => {
        try { cb(value, channel); } catch (e) { console.error(e); }
      });
      break;
    }
    default:
      break;
  }
}

// ════════════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT
// ════════════════════════════════════════════════════════════════════

function _detachCurrent() {
  if (_currentInput) {
    _currentInput.onmidimessage = null;
    _currentInput = null;
  }
  MIDIInput.activeNotes.clear();
  MIDIInput.isConnected = false;
  MIDIInput.activeDevice = null;
}

function _attach(input) {
  _detachCurrent();
  if (!input) return;
  _currentInput = input;
  input.onmidimessage = _handleMessage;
  MIDIInput.isConnected = true;
  MIDIInput.activeDevice = { id: input.id, name: input.name };
  try {
    localStorage.setItem(STORAGE_KEY, input.id);
  } catch (e) {
    // localStorage may be unavailable (private mode, etc.)
  }
}

function _listInputs() {
  if (!_midiAccess) return [];
  return Array.from(_midiAccess.inputs.values());
}

function _handleStateChange(event) {
  const port = event.port;
  if (port.type !== 'input') return;

  if (port.state === 'disconnected') {
    if (_currentInput && port.id === _currentInput.id) {
      _detachCurrent();
    }
    return;
  }

  if (port.state === 'connected') {
    // If nothing connected yet, try to restore the preferred device
    // or auto-connect to the first available input.
    if (!_currentInput) {
      const preferred = _readPreferredId();
      const inputs = _listInputs();
      const match = preferred ? inputs.find((i) => i.id === preferred) : null;
      if (match) {
        _attach(match);
      } else if (inputs.length >= 1) {
        // Multi-port devices (Launchkey MK4 etc.) enumerate as separate
        // "MIDI Out" and "DAW Out" ports. Prefer the keys/pads port; the
        // DAW port sends transport/mixer messages we don't want here.
        const keysPort = inputs.find((i) => !/\bDAW\b/i.test(i.name)) || inputs[0];
        _attach(keysPort);
      }
    }
  }
}

function _readPreferredId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════

const MIDIInput = {
  activeNotes: new Set(),
  isConnected: false,
  activeDevice: null,

  async init() {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      console.warn('[MIDIInput] Web MIDI API not available in this browser.');
      this.isConnected = false;
      return false;
    }

    try {
      _midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      console.warn('[MIDIInput] requestMIDIAccess failed:', err);
      this.isConnected = false;
      return false;
    }

    _midiAccess.onstatechange = _handleStateChange;

    const inputs = _listInputs();
    const preferred = _readPreferredId();
    const match = preferred ? inputs.find((i) => i.id === preferred) : null;

    if (match) {
      _attach(match);
    } else if (inputs.length >= 1) {
      // Multi-port devices (Launchkey MK4 etc.) enumerate as separate
      // "MIDI Out" and "DAW Out" ports. Prefer the keys/pads port.
      const keysPort = inputs.find((i) => !/\bDAW\b/i.test(i.name)) || inputs[0];
      _attach(keysPort);
    }
    return this.isConnected;
  },

  getDevices() {
    return _listInputs().map((i) => ({
      id: i.id,
      name: i.name,
      manufacturer: i.manufacturer,
    }));
  },

  selectDevice(deviceId) {
    if (!_midiAccess) return false;
    const input = _listInputs().find((i) => i.id === deviceId);
    if (!input) {
      console.warn(`[MIDIInput] Device not found: ${deviceId}`);
      return false;
    }
    _attach(input);
    return true;
  },

  onNoteOn(cb) {
    _listeners.noteOn.add(cb);
    return () => _listeners.noteOn.delete(cb);
  },

  onNoteOff(cb) {
    _listeners.noteOff.add(cb);
    return () => _listeners.noteOff.delete(cb);
  },

  onCC(cb) {
    _listeners.cc.add(cb);
    return () => _listeners.cc.delete(cb);
  },

  onPitchBend(cb) {
    _listeners.pitchBend.add(cb);
    return () => _listeners.pitchBend.delete(cb);
  },
};

if (typeof window !== 'undefined') {
  window.MIDIInput = MIDIInput;
}

export { MIDIInput };
export default MIDIInput;
