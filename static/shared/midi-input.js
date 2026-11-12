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
 *   - games/cycle-of-shells-input.js → Cycle of Shells and the Player (device list, remembered device by name)
 *   - shared/input-provider.js       → the 'midi' modality
 *   - templates/explorer.html, cantor.html, harmonograph.html → direct subscribers
 *
 * Hot-plug: MIDIAccess "statechange" is handled here. On every event
 * (connect or disconnect) the attachment is resolved again from the
 * live inputs (_resolve): the preferred device (by id, STORAGE_KEY) if
 * present, else the current one if still present, else the first non-DAW
 * port, else none (isConnected / activeDevice clear). init() runs the
 * same resolution, so a page that loaded with no inputs picks up the
 * first device plugged in later; `available` says whether MIDI access was
 * granted at all (init's return value is "connected", which is false then).
 * Ports Chrome keeps in the map as "disconnected" are not listed. Pages
 * that show a device list or a connected light subscribe with
 * onDevicesChanged(cb); it fires once per real change (the set of
 * connected inputs or the active device), not per raw event. The handler
 * goes on the selected port's onmidimessage property only, and the old
 * port's is cleared on every switch, so repeated plug / unplug never
 * doubles it.
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
  devices: new Set(),   // onDevicesChanged: hot-plug (see _handleStateChange)
};
let _devicesSignature = '';   // connected ids + active id at the last devices event

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
  // Chrome keeps an unplugged port in the map with state "disconnected": not a device to list or attach.
  return Array.from(_midiAccess.inputs.values()).filter((i) => i.state !== 'disconnected');
}

/**
 * Pick the input to be attached from the live list, in this order: the
 * preferred device (by id) if present, else the current one if still
 * present, else the first input, else none. Attaches it when it differs
 * from what is attached (by object: Chrome may hand a fresh port for the
 * same id after a replug, and the handler must sit on the live one).
 * Called from init and from every statechange.
 */
function _resolve() {
  const inputs = _listInputs();
  const byId = (id) => (id ? inputs.find((i) => i.id === id) || null : null);
  // Multi-port devices (Launchkey MK4 etc.) enumerate as separate
  // "MIDI Out" and "DAW Out" ports. Prefer the keys/pads port; the
  // DAW port sends transport/mixer messages we don't want here.
  const first = inputs.find((i) => !/\bDAW\b/i.test(i.name)) || inputs[0] || null;
  const pick = byId(_readPreferredId()) || byId(_currentInput && _currentInput.id) || first;
  if (pick === _currentInput) return;   // same live port (or nothing, still nothing)
  _attach(pick);                         // null detaches
}

/** Tell onDevicesChanged subscribers when the connected inputs or the active device changed since the last time. */
function _emitDevicesIfChanged() {
  const signature = `${_listInputs().map((i) => i.id).sort().join('\u0001')}|${_currentInput ? _currentInput.id : ''}`;
  if (signature === _devicesSignature) return;
  _devicesSignature = signature;
  const detail = { devices: MIDIInput.getDevices(), activeDevice: MIDIInput.activeDevice };
  _listeners.devices.forEach((cb) => {
    try { cb(detail); } catch (e) { console.error(e); }
  });
}

/**
 * MIDIAccess statechange: fires per port, for plug/unplug and for
 * connection (open/closed) changes, often several times per plug.
 * Connect or disconnect alike, the attachment is resolved again from
 * the live inputs; _resolve and the emit are idempotent, so the
 * repeats are harmless.
 */
function _handleStateChange(event) {
  const port = event && event.port;
  if (!port || port.type !== 'input') return;
  _resolve();
  _emitDevicesIfChanged();
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
  available: false,   // MIDI access granted (init succeeded); false before init and when the API is missing or refused
  activeDevice: null,

  async init() {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      console.warn('[MIDIInput] Web MIDI API not available in this browser.');
      this.isConnected = false;
      this.available = false;
      return false;
    }

    try {
      _midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      console.warn('[MIDIInput] requestMIDIAccess failed:', err);
      this.isConnected = false;
      this.available = false;
      return false;
    }

    this.available = true;
    _midiAccess.onstatechange = _handleStateChange;

    _resolve();
    _emitDevicesIfChanged();
    return this.isConnected;   // false with access but no input yet: see `available`
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
    _emitDevicesIfChanged();
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

  /**
   * Hot-plug: cb({ devices, activeDevice }) after a device is plugged in,
   * unplugged, or the active device changes (including selectDevice).
   * activeDevice is null when the active input went away. Returns unsubscribe.
   */
  onDevicesChanged(cb) {
    _listeners.devices.add(cb);
    return () => _listeners.devices.delete(cb);
  },
};

if (typeof window !== 'undefined') {
  window.MIDIInput = MIDIInput;
}

export { MIDIInput };
export default MIDIInput;
