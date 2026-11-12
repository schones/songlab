/**
 * cycle-of-shells-input.js
 * ========================
 * MIDI input for the Cycle of Shells game: a thin wrapper over the shared
 * MIDIInput singleton that remembers the player's device, drops the
 * Launchkey pad channel, de-duplicates layered zones, and forwards the
 * damper pedal. No DOM, no audio.
 *
 * Depends on:
 *   - midi-input.js → MIDIInput (init, getDevices, selectDevice, onNoteOn, onNoteOff, onCC)
 *
 * Usage:
 *   const input = createShellInput();           // { midi, now, storage } are injectable (selfTest)
 *   input.on('noteOn',  (midi, t) => …);         // t = ms, performance.now() domain
 *   input.on('noteOff', (midi, t) => …);
 *   input.on('pedal',   (value, t) => …);        // CC64 only
 *   input.on('devices', list => …);              // [{ id, name, manufacturer, active }]
 *   input.on('status',  text => …);              // connection / fallback messages
 *   await input.init();                          // requests MIDI access, restores the remembered device
 *   input.listDevices(); input.selectDevice('RD-2000'); input.deviceName;
 *
 * Rules:
 *   Channels   any channel except 10 (Launchkey pads). 0x80 note-offs and
 *              velocity-0 note-ons both release (MIDIInput already maps both
 *              to onNoteOff).
 *   Layers     per-midi channel sets: noteOn fires on the first channel to
 *              sound a midi, noteOff when the last channel releases it
 *              (RD-2000 layered zones send one key on two channels).
 *   Pedal      CC64 → pedal(value, t); CC66 / CC67 ignored; sustain's
 *              meaning is ignored (the game reads the pedal as a button).
 *   Time       MIDIInput does not forward event.timeStamp, so t is read
 *              from `now()` (performance.now) when the callback fires:
 *              same clock domain, a few ms late at most, later under a
 *              main-thread stall.
 *   Device     the choice is remembered under STORAGE_KEY by name; when
 *              the remembered device is absent the first available one is
 *              used and a status event says so.
 *   Hot-plug   MIDIInput.onDevicesChanged (MIDIAccess statechange), from
 *              init on whenever MIDI access was granted — also when the
 *              page loaded with no input at all. One resolution (sync) runs
 *              at init, on every hot-plug event and after a manual choice:
 *              the remembered device by name when present (MIDIInput itself
 *              keeps the current port, else falls back to the first one,
 *              else none), then status + devices for the page. Unplugging
 *              the active device releases every sounding midi (noteOff
 *              each); with no port left deviceName is null and status says
 *              "Disconnected". Handlers are subscribed once (init), so
 *              unplug/replug never doubles them.
 *
 * Self-test (from the repo root, with a fake MIDIAccess):
 *   node --input-type=module -e "import('./static/games/cycle-of-shells-input.js').then(m => m.selfTest())"
 */

import { MIDIInput } from '../shared/midi-input.js';

const STORAGE_KEY = 'cycleOfShells.midiDevice';
const PAD_CHANNEL = 10;
const CC_DAMPER = 64;
const EVENTS = ['noteOn', 'noteOff', 'pedal', 'devices', 'status'];

/**
 * @param {{ midi?: object, now?: () => number, storage?: Storage|null }} [deps]
 *   midi: a MIDIInput-shaped object (default the shared singleton); now: clock in ms
 *   (default performance.now); storage: localStorage-shaped (default the global, if any).
 */
function createShellInput({ midi = MIDIInput, now = defaultNow, storage = defaultStorage() } = {}) {
  const listeners = Object.fromEntries(EVENTS.map(e => [e, new Set()]));
  const emit = (event, ...args) => { for (const cb of listeners[event]) { try { cb(...args); } catch (e) { console.error('[cycle-of-shells-input]', e); } } };
  const sounding = new Map();   // midi → Set(channel)
  const unsubs = [];
  let ready = false;
  let hotplug = false;     // subscribed to midi.onDevicesChanged (after init, so init's own status wins)
  let selecting = false;   // inside our own midi.selectDevice: its devices event is ours, not a hot-plug
  let activeId = null;     // the attached port at the last sync: a change (switch, unplug, none) releases what it held

  const remember = name => { try { storage && storage.setItem(STORAGE_KEY, name); } catch (_) { /* storage unavailable */ } };
  const remembered = () => { try { return storage ? storage.getItem(STORAGE_KEY) : null; } catch (_) { return null; } };

  const devices = () => {
    const active = midi.activeDevice ? midi.activeDevice.id : null;
    return midi.getDevices().map(d => ({ ...d, active: d.id === active }));
  };

  const onNoteOn = (note, velocity, channel) => {
    if (channel === PAD_CHANNEL) return;
    let chans = sounding.get(note);
    if (!chans) { chans = new Set(); sounding.set(note, chans); }
    const first = chans.size === 0;
    chans.add(channel);
    if (first) emit('noteOn', note, now());
  };
  const onNoteOff = (note, channel) => {
    if (channel === PAD_CHANNEL) return;
    const chans = sounding.get(note);
    if (!chans || !chans.has(channel)) return;   // release without a matching press (or already released)
    chans.delete(channel);
    if (chans.size === 0) { sounding.delete(note); emit('noteOff', note, now()); }
  };
  const onCC = (controller, value, channel) => {
    if (channel === PAD_CHANNEL) return;
    if (controller === CC_DAMPER) emit('pedal', value, now());
  };
  /** The device went away or changed: anything still down is released (noteOff for each) so no key stays lit. */
  const releaseAll = () => {
    const held = [...sounding.keys()];
    sounding.clear();
    for (const note of held) emit('noteOff', note, now());
  };
  /**
   * The one resolution for load ('init'), hot-plug ('change', from
   * MIDIInput.onDevicesChanged) and a manual choice ('select'): the
   * remembered name wins when present (MIDIInput keeps the current port,
   * else falls back to the first, else none); then status + devices.
   */
  const sync = reason => {
    const list = devices();
    const want = remembered();
    const match = want ? list.find(d => d.name === want) : null;
    if (match && !match.active) {   // MIDIInput attached another port (or none): the remembered name wins
      selecting = true;
      try { midi.selectDevice(match.id); } finally { selecting = false; }
    }
    const active = midi.activeDevice;
    if (!active || active.id !== activeId) releaseAll();   // a different port, or none: nothing the old one held stays down
    activeId = active ? active.id : null;
    const name = active ? active.name : null;
    if (name && want && !match) emit('status', `Remembered device "${want}" not found; using ${name}.`);
    else if (name) emit('status', `Connected: ${name}`);
    else if (want && reason === 'change') emit('status', `Disconnected: ${want}. Plug it in or switch it on to continue.`);
    else emit('status', 'No MIDI device connected.');
    emit('devices', devices());
  };
  const onDevicesChanged = () => { if (!selecting) sync('change'); };

  const api = {
    /** Subscribe; returns an unsubscribe function. */
    on(event, cb) {
      if (!listeners[event]) throw new Error(`cycle-of-shells-input: unknown event ${event}`);
      listeners[event].add(cb);
      return () => listeners[event].delete(cb);
    },
    /** Request MIDI access, attach the note/CC handlers, restore the remembered device. Resolves to connected (bool). */
    async init() {
      if (!ready) {
        unsubs.push(midi.onNoteOn(onNoteOn), midi.onNoteOff(onNoteOff), midi.onCC(onCC));
        ready = true;
      }
      const ok = await midi.init();
      const available = typeof midi.available === 'boolean' ? midi.available : ok;   // access granted; "connected" alone is false with no input yet
      if (!available) { emit('status', 'No MIDI input available.'); emit('devices', []); return false; }
      sync('init');
      if (!hotplug && typeof midi.onDevicesChanged === 'function') { unsubs.push(midi.onDevicesChanged(onDevicesChanged)); hotplug = true; }   // from now on, even with no input yet
      return !!midi.activeDevice;
    },
    /** @returns {Array<{ id, name, manufacturer, active }>} */
    listDevices() { return devices(); },
    /** Select an input by name; remembers it. Returns true when attached. */
    selectDevice(name) {
      const d = devices().find(x => x.name === name);
      if (!d) { emit('status', `Device "${name}" not found.`); return false; }
      selecting = true;
      let ok = false;
      try { ok = midi.selectDevice(d.id); } finally { selecting = false; }
      if (ok) remember(name);
      sync('select');
      return ok;
    },
    get deviceName() { return midi.activeDevice ? midi.activeDevice.name : null; },
    /** Midis currently sounding (after de-duplication). */
    held() { return [...sounding.keys()].sort((a, b) => a - b); },
    destroy() { for (const u of unsubs.splice(0)) u(); sounding.clear(); ready = false; hotplug = false; for (const s of Object.values(listeners)) s.clear(); },
  };
  return api;
}

function defaultNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function defaultStorage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } }

export { createShellInput, STORAGE_KEY, PAD_CHANNEL, CC_DAMPER, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════
//
//   node --input-type=module -e "import('./static/games/cycle-of-shells-input.js').then(m => m.selfTest())"
//
// Installs a fake navigator.requestMIDIAccess and localStorage for the
// shared MIDIInput singleton, then drives raw MIDI bytes through the fake
// input port's onmidimessage.

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  console.log('\n─── cycle-of-shells-input.js self-test ───\n');

  // ── Fakes ────────────────────────────────────────────────────────
  const makePort = (id, name) => ({ id, name, manufacturer: 'fake', type: 'input', state: 'connected', onmidimessage: null });
  const ports = [makePort('p-rd', 'RD-2000'), makePort('p-lk', 'Launchkey MK4 49 MIDI Out'), makePort('p-lkdaw', 'Launchkey MK4 49 DAW Out')];
  const access = { inputs: new Map(ports.map(p => [p.id, p])), onstatechange: null };
  const memory = new Map();
  const fakeStorage = { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  Object.defineProperty(globalThis, 'navigator', { value: { requestMIDIAccess: async () => access }, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });   // MIDIInput's own preference lives here too
  const send = (port, bytes) => { if (port.onmidimessage) port.onmidimessage({ data: Uint8Array.from(bytes), timeStamp: 0 }); };   // a detached port has no handler
  const plug = (port, state) => { port.state = state; if (access.onstatechange) access.onstatechange({ port }); };
  let clock = 0;
  const now = () => clock;

  // ── Page loaded with no input at all; a device plugged in later ──
  memory.set(STORAGE_KEY, 'Nord Stage 3');
  access.inputs.clear();
  const input0 = createShellInput({ now, storage: fakeStorage });
  const st0 = [], dl0 = [], log0 = [];
  input0.on('status', s => st0.push(s));
  input0.on('devices', l => dl0.push(l.map(d => `${d.name}${d.active ? '*' : ''}`)));
  input0.on('noteOn', (m, t) => log0.push(['noteOn', m, t]));
  const c0 = await input0.init();
  assert('no input at load: not connected, said so, empty list', [c0, input0.deviceName, st0, dl0], [false, null, ['No MIDI device connected.'], [[]]]);
  access.inputs.set(ports[0].id, ports[0]); plug(ports[0], 'connected'); plug(ports[0], 'connected');
  assert('plugged in later: attached, status + list updated once', [input0.deviceName, st0.slice(1), dl0.slice(1)],
    ['RD-2000', ['Remembered device "Nord Stage 3" not found; using RD-2000.'], [['RD-2000*']]]);
  clock = 5; send(ports[0], [0x90, 60, 100]);
  assert('…and its notes are heard', log0, [['noteOn', 60, 5]]);
  send(ports[0], [0x80, 60, 0]);
  input0.destroy();
  for (const p of ports) access.inputs.set(p.id, p);

  // ── Connect, remembered device absent → fallback ─────────────────
  const log = [];
  const input = createShellInput({ now, storage: fakeStorage });
  for (const ev of ['noteOn', 'noteOff', 'pedal']) input.on(ev, (a, t) => log.push([ev, a, t]));
  const statuses = [], deviceLists = [];
  input.on('status', s => statuses.push(s));
  input.on('devices', l => deviceLists.push(l.map(d => `${d.name}${d.active ? '*' : ''}`)));
  const connected = await input.init();
  assert('init connects; remembered device absent → first available, said via status', [connected, input.deviceName, statuses[0]],
    [true, 'RD-2000', 'Remembered device "Nord Stage 3" not found; using RD-2000.']);
  assert('devices event lists the three ports with the active one marked', deviceLists[0], ['RD-2000*', 'Launchkey MK4 49 MIDI Out', 'Launchkey MK4 49 DAW Out']);
  assert('listDevices() matches', input.listDevices().map(d => d.name), ['RD-2000', 'Launchkey MK4 49 MIDI Out', 'Launchkey MK4 49 DAW Out']);
  const rd = ports[0];

  // ── Releases: 0x80 with release velocity, and velocity-0 note-on ──
  clock = 10; send(rd, [0x90, 60, 100]);
  clock = 20; send(rd, [0x80, 60, 64]);
  clock = 30; send(rd, [0x90, 62, 100]);
  clock = 40; send(rd, [0x90, 62, 0]);
  assert('0x80 note-off and velocity-0 note-on both release, with t from the clock', log.splice(0),
    [['noteOn', 60, 10], ['noteOff', 60, 20], ['noteOn', 62, 30], ['noteOff', 62, 40]]);

  // ── Channel 10 ignored ───────────────────────────────────────────
  clock = 50; send(rd, [0x99, 36, 100]); send(rd, [0x89, 36, 0]); send(rd, [0xB9, 64, 127]);
  assert('channel 10 notes and CCs are ignored', log.splice(0), []);

  // ── Layered duplicate on ch1 + ch2 ───────────────────────────────
  clock = 60; send(rd, [0x90, 53, 90]); send(rd, [0x91, 53, 90]);
  clock = 70; send(rd, [0x80, 53, 50]);
  assert('layered note on ch1+ch2: one noteOn; first release keeps it sounding', [log.splice(0), input.held()], [[['noteOn', 53, 60]], [53]]);
  clock = 80; send(rd, [0x81, 53, 50]);
  assert('…last channel release → one noteOff', [log.splice(0), input.held()], [[['noteOff', 53, 80]], []]);
  send(rd, [0x81, 53, 50]);
  assert('a release with no matching press is ignored', log.splice(0), []);

  // ── System bytes ignored ─────────────────────────────────────────
  send(rd, [0xFE]); send(rd, [0xF8]); send(rd, [0xF0, 0x7E, 0xF7]); send(rd, [0xFF]);
  assert('active sensing, clock, sysex, reset are ignored', log.splice(0), []);

  // ── CC64 passes through; CC66/67 do not ──────────────────────────
  clock = 90; send(rd, [0xB0, 64, 127]); send(rd, [0xB0, 66, 127]); send(rd, [0xB0, 67, 127]); clock = 100; send(rd, [0xB0, 64, 0]);
  assert('CC64 → pedal(value, t); CC66 and CC67 ignored', log.splice(0), [['pedal', 127, 90], ['pedal', 0, 100]]);

  // ── Device selection by name, remembered ─────────────────────────
  assert('selectDevice by name attaches and remembers it', [input.selectDevice('Launchkey MK4 49 MIDI Out'), input.deviceName, memory.get(STORAGE_KEY)],
    [true, 'Launchkey MK4 49 MIDI Out', 'Launchkey MK4 49 MIDI Out']);
  send(rd, [0x90, 60, 100]);
  clock = 110; send(ports[1], [0x90, 60, 100]); send(ports[1], [0x80, 60, 0]);
  assert('after switching, the old port is silent and the new one is heard', log.splice(0), [['noteOn', 60, 110], ['noteOff', 60, 110]]);
  assert('unknown name → false, status says so', [input.selectDevice('Nope'), statuses[statuses.length - 1]], [false, 'Device "Nope" not found.']);
  // A fresh instance restores the remembered device.
  const input2 = createShellInput({ now, storage: fakeStorage });
  const st2 = []; input2.on('status', s => st2.push(s));
  await input2.init();
  assert('a new instance restores the remembered device', [input2.deviceName, st2[0]], ['Launchkey MK4 49 MIDI Out', 'Connected: Launchkey MK4 49 MIDI Out']);
  input2.destroy();

  // ── Hot-plug: unplug the active device, plug it back, several times ──
  input.selectDevice('RD-2000');
  statuses.length = 0; deviceLists.length = 0; log.splice(0);
  clock = 500; send(rd, [0x90, 64, 80]);
  plug(rd, 'disconnected');
  assert('unplug with other ports present: held note released, first (non-DAW) port used and said, list without it',
    [log.splice(0), input.deviceName, statuses[statuses.length - 1], deviceLists[deviceLists.length - 1]],
    [[['noteOn', 64, 500], ['noteOff', 64, 500]], 'Launchkey MK4 49 MIDI Out', 'Remembered device "RD-2000" not found; using Launchkey MK4 49 MIDI Out.', ['Launchkey MK4 49 MIDI Out*', 'Launchkey MK4 49 DAW Out']]);
  plug(rd, 'disconnected');   // Chrome repeats the event
  assert('a repeated disconnect event changes nothing', [input.deviceName, statuses.length], ['Launchkey MK4 49 MIDI Out', 1]);
  // Unplug the only port: nothing left, status says disconnected
  for (const p of ports.slice(1)) plug(p, 'disconnected');
  assert('unplug the last port: no device, status says disconnected, empty list', [input.deviceName, statuses[statuses.length - 1], deviceLists[deviceLists.length - 1]],
    [null, 'Disconnected: RD-2000. Plug it in or switch it on to continue.', []]);
  for (const p of ports.slice(1)) plug(p, 'connected');
  const before = statuses.length;
  plug(rd, 'connected'); plug(rd, 'connected');
  assert('replug: the remembered device is re-selected by name, one status + one list per change',
    [input.deviceName, statuses.slice(before), deviceLists[deviceLists.length - 1]],
    ['RD-2000', ['Connected: RD-2000'], ['RD-2000*', 'Launchkey MK4 49 MIDI Out', 'Launchkey MK4 49 DAW Out']]);
  const handlers = () => ports.filter(p => p.onmidimessage).map(p => p.name);
  assert('the handler sits on the selected port only', handlers(), ['RD-2000']);
  for (let i = 0; i < 5; i++) { plug(rd, 'disconnected'); plug(rd, 'connected'); }
  clock = 600; send(rd, [0x90, 65, 80]); send(rd, [0x80, 65, 0]);
  assert('after five unplug/replug cycles a key still fires exactly one noteOn and one noteOff', log.splice(0), [['noteOn', 65, 600], ['noteOff', 65, 600]]);
  assert('…and only the RD-2000 carries a handler', handlers(), ['RD-2000']);
  memory.set(STORAGE_KEY, 'Launchkey MK4 49 MIDI Out');   // the remembered device is a different one when the RD-2000 comes back
  plug(rd, 'disconnected');
  assert('unplug with another remembered device: MIDIInput falls back to a port, the remembered name wins', input.deviceName, 'Launchkey MK4 49 MIDI Out');
  plug(rd, 'connected');
  assert('…and the RD-2000 returning does not steal the selection', input.deviceName, 'Launchkey MK4 49 MIDI Out');
  memory.set(STORAGE_KEY, 'RD-2000');
  log.splice(0);

  // ── Into the submit detector ─────────────────────────────────────
  const { createSubmitDetector } = await import('./cycle-of-shells-core.js');
  input.selectDevice('RD-2000');
  const det = createSubmitDetector({ minNotes: 3, pedalSubmit: false });
  const subs = [];
  input.on('noteOn', (m, t) => det.noteOn(m, t));
  input.on('noteOff', (m, t) => { const r = det.noteOff(m, t); if (r) subs.push(r); });
  input.on('pedal', (v, t) => { const r = det.pedal(v, t); if (r) subs.push(r); });
  clock = 1000; send(rd, [0x90, 38, 80]); send(rd, [0x90, 53, 80]); send(rd, [0x91, 53, 80]); send(rd, [0x90, 60, 80]);
  clock = 1300; send(rd, [0x90, 59, 30]);                         // stray brush
  clock = 1340; send(rd, [0x80, 59, 20]);
  clock = 1600; send(rd, [0x80, 38, 40]); send(rd, [0x80, 53, 40]); send(rd, [0x80, 60, 40]);
  assert('…wait: layered ch2 53 still held — no submission yet', subs.length, 0);
  clock = 1610; send(rd, [0x81, 53, 40]);
  assert('MIDI bytes → detector: layered chord with a stray brush submits D2 F3 C4 on the last release', subs.map(s => [s.midis, s.source, s.settled, s.t]), [[[38, 53, 60], 'lift', true, 1610]]);
  log.splice(0);
  input.destroy();
  assert('destroy unsubscribes', (() => { send(rd, [0x90, 40, 80]); send(rd, [0x80, 40, 0]); return log.length; })(), 0);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
