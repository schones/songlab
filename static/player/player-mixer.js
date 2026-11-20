/**
 * player-mixer.js
 * ===============
 * The player's small mixer: named output levels (guide, band, click — and
 * whatever comes next, e.g. drums), each a 0–100 slider value remembered in
 * localStorage and turned into a gain by ONE curve. No DOM, no Tone: a
 * channel's output is whatever the page attaches — a node with a `gain`
 * param (Tone.Gain) or a function that takes the gain. Node-runnable.
 *
 *   sliderGain(level)       → (level / 100) ^ 1.5, level clamped to 0–100: the one curve
 *   createMixer(channels, { storage }) → mixer
 *       channels: { name: { key, level, ceiling = 1 } }
 *           key      the localStorage key the level is remembered under
 *           level    the default level, 0–100
 *           ceiling  the gain at 100 (a channel that should sit under the others)
 *       storage: { getItem, setItem } (default: window.localStorage, guarded)
 *     level(name)            the channel's level, 0–100
 *     gain(name)             sliderGain(level) × ceiling
 *     set(name, level, { save = true }) → the level as kept (clamped, rounded;
 *                            a bad value is the default); applied at once
 *     restore(name)          → set() from storage (the default when nothing is stored); not saved back
 *     attach(name, output)   the channel's output: a node with .gain (rampTo, else
 *                            .value) or a function gain => …; applied at once. null detaches.
 *     apply(name, { gain })  push the channel's gain to its output again; `gain`
 *                            overrides it for now (the guide plays at 1 under Listen)
 *     names                  the channel names
 *   selfTest()               → console report, { passed, total }
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-mixer.js').then(m => m.selfTest())"
 */

const RAMP_S = 0.03;

const clampLevel = (v, fallback = 0) => { const n = Math.round(Number(v)); return v !== null && v !== '' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback; };
/** Slider 0–100 → gain 0–1: the one curve every channel uses (a usable low end, full at 100). */
const sliderGain = level => Math.pow(clampLevel(level) / 100, 1.5);

function browserStorage() {
  let ls = null;
  try { ls = typeof window !== 'undefined' ? window.localStorage : null; } catch (_) { ls = null; }
  return {
    getItem: k => { try { return ls ? ls.getItem(k) : null; } catch (_) { return null; } },
    setItem: (k, v) => { try { if (ls) ls.setItem(k, v); } catch (_) { /* storage unavailable */ } },
  };
}

function createMixer(channels = {}, { storage = browserStorage() } = {}) {
  const ch = {};
  for (const [name, c] of Object.entries(channels)) {
    const def = clampLevel(c && c.level, 0);
    ch[name] = { key: (c && c.key) || null, def, level: def, ceiling: c && Number.isFinite(c.ceiling) ? c.ceiling : 1, output: null };
  }
  const of = name => { if (!ch[name]) throw new Error(`mixer: unknown channel ${name}`); return ch[name]; };
  const gain = name => sliderGain(of(name).level) * of(name).ceiling;
  function push(c, g) {
    const out = c.output;
    if (!out) return;
    if (typeof out === 'function') { out(g); return; }
    if (out.gain) { try { out.gain.rampTo(g, RAMP_S); } catch (_) { out.gain.value = g; } }
  }
  const mixer = {
    get names() { return Object.keys(ch); },
    level: name => of(name).level,
    gain,
    set(name, level, { save = true } = {}) {
      const c = of(name);
      c.level = clampLevel(level, c.def);
      if (save && c.key) storage.setItem(c.key, String(c.level));
      push(c, gain(name));
      return c.level;
    },
    restore(name) {
      const c = of(name);
      return mixer.set(name, c.key ? storage.getItem(c.key) : null, { save: false });
    },
    attach(name, output) { const c = of(name); c.output = output || null; push(c, gain(name)); return mixer; },
    apply(name, { gain: override } = {}) { const c = of(name); push(c, Number.isFinite(override) ? override : gain(name)); return mixer; },
  };
  return mixer;
}

export { createMixer, sliderGain, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const r3 = x => Math.round(x * 1000) / 1000;

  console.log('\n─── player-mixer.js self-test ───\n');

  assert('sliderGain: 0 → 0, 100 → 1, 35 → 0.207 (the guide\'s default, as before), clamped', [sliderGain(0), sliderGain(100), r3(sliderGain(35)), sliderGain(250), sliderGain(-3), sliderGain('x')], [0, 1, 0.207, 1, 0, 0]);

  const store = { songlab_band: '80', songlab_bad: 'loud' };
  const storage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  const m = createMixer({ guide: { key: 'songlab_guide', level: 35 }, band: { key: 'songlab_band', level: 60 }, click: { key: 'songlab_click', level: 70, ceiling: 0.75 }, odd: { key: 'songlab_bad', level: 40 } }, { storage });
  assert('channels start at their defaults', [m.names, m.level('guide'), m.level('band'), m.level('click')], [['guide', 'band', 'click', 'odd'], 35, 60, 70]);
  assert('restore: the stored level, the default when nothing (or nonsense) is stored; nothing is written back', [m.restore('band'), m.restore('guide'), m.restore('odd'), 'songlab_guide' in store], [80, 35, 40, false]);
  assert('one curve, a ceiling per channel: click at 70 is 0.586 × 0.75 = 0.439', [r3(m.gain('band')), r3(m.gain('click')), r3(m.gain('guide'))], [r3(Math.pow(0.8, 1.5)), 0.439, 0.207]);

  const ramps = [];
  const node = { gain: { value: 1, rampTo(g, s) { ramps.push([r3(g), s]); } } };
  m.attach('band', node);
  assert('attach applies the channel\'s gain to a node at once, ramped', ramps, [[0.716, RAMP_S]]);
  assert('set: clamped and rounded, saved, pushed to the output', [m.set('band', 49.6), m.set('band', 140), store.songlab_band, ramps.slice(1)], [50, 100, '100', [[0.354, RAMP_S], [1, RAMP_S]]]);
  assert('set with save: false leaves storage alone; a bad value is the default', [m.set('band', 10, { save: false }), store.songlab_band, m.set('band', 'x', { save: false })], [10, '100', 60]);
  const got = [];
  m.attach('click', g => got.push(r3(g)));
  m.set('click', 100);
  m.apply('click', { gain: 0.5 });
  m.apply('click');
  assert('a function output gets the gain; apply can override it for now, then put it back', got, [0.439, 0.75, 0.5, 0.75]);
  const plain = { gain: { value: 1 } };
  m.attach('guide', plain);
  assert('a node without rampTo gets .value', r3(plain.gain.value), 0.207);
  m.attach('guide', null);
  m.set('guide', 90);
  assert('detached: nothing is pushed, the level still changes', [r3(plain.gain.value), m.level('guide')], [0.207, 90]);
  let threw = false;
  try { m.level('nope'); } catch (_) { threw = true; }
  assert('an unknown channel throws', threw, true);

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
