/**
 * cycle-of-shells-log.js
 * ======================
 * Result log for the Cycle of Shells game: appends ResultDetail envelopes
 * (built by the core's chordEntry / followUpEntry) to localStorage under
 * one key, capped to the most recent entries. Storage access is wrapped;
 * nothing here throws into the game.
 *
 * Usage:
 *   const log = createResultLog();              // { storage, key, cap } injectable
 *   log.append(entry) → true | false            // false when storage is unavailable
 *   log.read()        → entries (oldest first), [] on any problem
 *   log.clear()
 *
 * Self-test (from the repo root):
 *   node --input-type=module -e "import('./static/games/cycle-of-shells-log.js').then(m => m.selfTest())"
 */

const STORAGE_KEY = 'songlab_results_cycle_of_shells';   // same family as Polyrhythm's songlab_results_polyrhythm
const CAP = 3000;

function defaultStorage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } }

function createResultLog({ storage = defaultStorage(), key = STORAGE_KEY, cap = CAP } = {}) {
  const read = () => {
    try {
      const raw = storage ? storage.getItem(key) : null;
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) { return []; }
  };
  return {
    key, cap,
    read,
    append(entry) {
      if (!storage || !entry) return false;
      try {
        const list = read();
        list.push(entry);
        const kept = list.length > cap ? list.slice(list.length - cap) : list;
        storage.setItem(key, JSON.stringify(kept));
        return true;
      } catch (err) { console.warn('[cycle-of-shells] result not saved:', err); return false; }
    },
    clear() { try { storage && storage.removeItem(key); } catch (_) { /* ignore */ } },
  };
}

export { createResultLog, STORAGE_KEY, CAP, selfTest };

async function selfTest() {
  const results = [];
  const assert = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(pass);
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  console.log('\n─── cycle-of-shells-log.js self-test ───\n');
  const mem = new Map();
  const fake = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const log = createResultLog({ storage: fake, key: 'test', cap: 3 });
  assert('empty read', log.read(), []);
  for (let i = 1; i <= 5; i++) log.append({ i });
  assert('cap keeps the most recent entries', log.read(), [{ i: 3 }, { i: 4 }, { i: 5 }]);
  mem.set('test', '{not json');
  assert('corrupt storage reads as empty', log.read(), []);
  assert('…and append starts over', [log.append({ i: 9 }), log.read()], [true, [{ i: 9 }]]);
  log.clear();
  assert('clear', log.read(), []);
  const broken = createResultLog({ storage: { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); }, removeItem() { throw new Error('nope'); } }, key: 't' });
  assert('throwing storage: append false, read [], clear quiet', [broken.append({ a: 1 }), broken.read(), (broken.clear(), true)], [false, [], true]);
  assert('no storage: append false', createResultLog({ storage: null }).append({ a: 1 }), false);
  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
