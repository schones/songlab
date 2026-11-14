/**
 * Player smoke harness: boots the REAL static/player/player.js under Node
 * with a stubbed DOM, a fake Tone on real time, and stubs for the
 * browser-only modules (./hooks.mjs → ./stubs). player.js is a page module
 * (top-level DOM wiring, one piece loaded at import), so each scenario
 * runs in its own process — see smoke.mjs.
 *
 *   const h = await boot({ norm });   // norm: the piece the fake /player/data serves
 *   h.P / h.C / h.L      window.__player, window.songlabPlayer, state.listen
 *   h.el(id)             the stub element for an id (textContent, hidden, getAttribute, children, fire('click'))
 *   h.key(' ')           a document keydown; h.key(' ', { target: h.focusOn('button') }) with focus on a control (→ whether it was preventDefault-ed)
 *   h.focusOn(tag)       a stand-in focused element of that tag (answers closest() for selectors naming the tag)
 *   h.events             every bus event as [type, detail]
 *   h.sounds             ['click', t] / ['on', note, t] / ['releaseAll'] from the fake audio
 *   h.now()              the fake AudioContext's currentTime (real seconds since boot)
 *   h.check(label, actual, expected), h.done()   → prints, exits non-zero on a failure
 */
import module from 'node:module';
import { resolve } from './hooks.mjs';

if (typeof module.registerHooks === 'function') module.registerHooks({ resolve });
else module.register('./hooks.mjs', import.meta.url);

const PLAYER = new URL('../../static/player/player.js', import.meta.url).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A stand-in element: remembers what is set on it, records children and listeners, answers anything else with a no-op. */
function stubElement(name) {
  const store = { hidden: false, disabled: false, checked: false, value: '', textContent: '', dataset: {}, options: [], children: [], childNodes: [] };
  const attrs = {}, listeners = {};
  const fns = {
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, removeAttribute: k => { delete attrs[k]; },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, fire: (t, e = {}) => (listeners[t] || []).forEach(f => f(e)),
    append: (...xs) => { store.children.push(...xs); }, appendChild: x => { store.children.push(x); return x; },
    focus: () => { globalThis.__focused = name; },
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  };
  return new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return () => name;
      if (k in store) return store[k];
      if (k in fns) return fns[k];
      if (k === 'classList' || k === 'style') return stubElement(`${name}.${String(k)}`);
      return () => undefined;
    },
    set(_, k, v) { store[k] = v; if (k === 'textContent') store.children = []; return true; },
  });
}

/** The fixture piece: 16 bars of 3/4 at 82 bpm, four lines, the bar shape of player-listen.js's own fixture (D6 over G4 B♭4 D5). */
function fixtureNorm(extra = {}) {
  const ev = (onset, dur, pitches) => ({ onset, dur, pitches, rest: false, tie: null });
  const bars = Array.from({ length: 16 }, (_, i) => ({
    bar: i + 1, voice: [],
    rh: [ev(0, 2.5, ['D6']), ev(2.5, 0.5, ['D6'])],
    lh: [ev(0, 0.5, ['G4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])],
  }));
  return { piece: 'smoke-fixture', title: 'Smoke fixture', reader: 'test', key: 'G minor', time: '3/4', beatsPerBar: 3, tempo: 82, lines: [1, 5, 9, 13], ...extra, bars };
}

async function boot({ norm = fixtureNorm() } = {}) {
  const elsById = {}, docListeners = {}, storage = {};
  globalThis.window = globalThis;
  globalThis.Node = class {}; globalThis.Element = class {};
  globalThis.document = {
    getElementById: id => (elsById[id] ||= stubElement(id)),
    addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); },
    querySelector: () => null, querySelectorAll: () => [],
    createElement: tag => { const e = stubElement(tag); e.tag = tag; return e; },
    body: stubElement('body'), documentElement: stubElement('html'), activeElement: null,
  };
  globalThis.localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } };
  globalThis.location = { search: '', href: 'http://localhost/player' };
  globalThis.history = { replaceState() {} };
  globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
  globalThis.requestAnimationFrame = f => setTimeout(f, 0);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.fetch = async url => ({ ok: true, status: 200, json: async () => (String(url).includes('/pieces') ? [{ name: norm.piece, title: norm.title }] : norm) });

  // A fake Tone whose context runs on real time: the beat clock's own setInterval scheduler drives everything.
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const sounds = [];
  const LATENCY = 0.02;
  const param = () => ({ value: 1, rampTo() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  class FakeNode { constructor() { this.gain = param(); } connect() { return this; } toDestination() { return this; } disconnect() {} }
  globalThis.Tone = {
    context: {
      get currentTime() { return now(); }, state: 'running', on() {},
      rawContext: { outputLatency: LATENCY, baseLatency: 0.005, sampleRate: 48000, getOutputTimestamp: () => ({ contextTime: now() - LATENCY, performanceTime: performance.now() }) },
      createOscillator: () => ({ frequency: {}, connect() {}, start(t) { sounds.push(['click', t]); }, stop() {}, disconnect() {} }),
      createGain: () => new FakeNode(),
    },
    start: async () => {}, immediate: () => now(), now: () => now() + 0.1, connect() {},
    Gain: FakeNode, Volume: FakeNode,
    Sampler: class extends FakeNode {
      constructor(o) { super(); setTimeout(() => o.onload && o.onload(), 0); }
      triggerAttack(note, t) { sounds.push(['on', note, t]); } triggerRelease() {} releaseAll() { sounds.push(['releaseAll']); }
    },
  };

  const quiet = console.debug; console.debug = () => {};   // player.js's practice-log chatter
  await import(PLAYER);
  await sleep(100);   // the piece list, the piece and the first line
  console.debug = quiet;

  const P = window.__player, C = window.songlabPlayer;
  const events = [];
  C.on('*', (detail, type) => events.push([type, detail]));
  const results = [];
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(ok);
    console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const done = () => {
    const passed = results.filter(Boolean).length;
    console.log(`\n─── ${passed}/${results.length} passed ───\n`);
    process.exit(passed === results.length ? 0 : 1);   // exit: the page's timers would keep the process alive
  };
  return {
    P, C, L: P.state.listen, norm, events, sounds, now, sleep, check, done,
    el: id => elsById[id],
    /** Dispatch a keydown to the document listeners; returns whether one of them called preventDefault. */
    key: (k, extra = {}) => { const e = { key: k, target: null, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; (docListeners.keydown || []).forEach(f => f(e)); return e.defaultPrevented; },
    /** An Element of `tag` to use as a key event's target: closest(selectors) matches when one of them names the tag (button, a[href], input, …). */
    focusOn: tag => Object.assign(new globalThis.Element(), { tag, closest(selectors) { return selectors.split(',').map(s => s.trim()).some(s => s === tag || s.startsWith(`${tag}[`)) ? this : null; } }),
    /** Bus event types since the last call, note events left out. */
    types: () => events.splice(0).map(e => e[0]).filter(t => !t.startsWith('note:')),
    focused: () => globalThis.__focused || null,
    storage,
  };
}

export { boot, fixtureNorm, sleep };
