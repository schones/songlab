// No MIDI: the smoke feeds notes through window.__player.noteOn / noteOff.
export function createShellInput() { return { on() {}, init: async () => {}, deviceName: null, listDevices: () => [], selectDevice() {} }; }
