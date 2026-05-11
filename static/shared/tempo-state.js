/**
 * tempo-state.js
 * ==============
 * Shared state object with pub/sub for the user-input tempo —
 * the tempo at which the user is currently playing into the system.
 *
 * Pure state management — zero rendering logic. Subscribers receive
 * the current BPM on every update.
 *
 * Consumed by:
 *   - chord/melody classifier  → future (see chord-melody-build-plan.md)
 *
 * Depends on:
 *   - (none)
 *
 * Exposes: window.TempoState  (also ES-module exports)
 */

// ────────────────────────────────────────────────────────────────────
// Scope note
// ────────────────────────────────────────────────────────────────────
// This module owns the user-input tempo — the tempo at which the user
// is currently playing into the system. Other SongLab subsystems
// maintain their own tempo state (harmony-state's progressionState.tempo
// for trainer progression auto-advance; skratch-studio for playback;
// rhythm/ and polyrhythm/ for their own beat practice;
// games/relative-key-trainer.js for a hardcoded playback constant).
// Unification of these is deferred for review during Session 8 (arc
// handoff prep). See docs/active-plans/chord-melody-build-plan.md
// backburner section.

// ════════════════════════════════════════════════════════════════════
// TEMPO STATE
// ════════════════════════════════════════════════════════════════════

const TempoState = {
  _bpm: 120,
  _listeners: [],

  // ── Read ────────────────────────────────────────────────────────

  /** Return the current BPM. */
  get() {
    return this._bpm;
  },

  /** Return the current BPM. Equivalent to get(); included for symmetry
   *  with HarmonyState consumers that distinguish state vs field reads. */
  getBPM() {
    return this._bpm;
  },

  // ── Write ───────────────────────────────────────────────────────

  /**
   * Set the BPM. Coerces v to a number via Number(v); if NaN, no-op
   * and no notification. Otherwise clamps to [1, 300] and notifies
   * listeners on every successful call (no equality check — matches
   * HarmonyState.update's convention).
   */
  setBPM(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return;
    this._bpm = Math.max(1, Math.min(300, n));
    this._notify();
  },

  // ── Subscribe ───────────────────────────────────────────────────

  /**
   * Subscribe to BPM changes. fn receives the current BPM (a number)
   * on every update. Returns an unsubscribe function.
   */
  on(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  },

  // ── Reset ───────────────────────────────────────────────────────

  /** Restore BPM to the default (120) and notify. */
  reset() {
    this._bpm = 120;
    this._notify();
  },

  // ── Internal ────────────────────────────────────────────────────

  _notify() {
    const bpm = this._bpm;
    for (const fn of this._listeners) {
      fn(bpm);
    }
  },
};

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { TempoState };

if (typeof window !== "undefined") {
  window.TempoState = TempoState;
}

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (manual — run: cat static/shared/tempo-state.js | node --input-type=module)
// Note: the direct-file form (node --input-type=module path/to/file.js)
// is blocked on the current Node version; pipe stdin instead.
// ════════════════════════════════════════════════════════════════════

/* --- Self-test: uncomment this block to run ---

(function selfTest() {
  const results = [];
  function assert(label, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ label, pass });
    console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  }

  console.log("\n─── tempo-state.js self-test ───\n");

  // 1. default BPM is 120
  TempoState.reset();
  assert("default BPM = 120",
    TempoState.get(), 120);
  assert("getBPM() = 120",
    TempoState.getBPM(), 120);

  // 2. setBPM(140) updates and getBPM returns 140
  TempoState.setBPM(140);
  assert("setBPM(140) → get() = 140",
    TempoState.get(), 140);
  assert("setBPM(140) → getBPM() = 140",
    TempoState.getBPM(), 140);

  // 3. setBPM notifies subscribers with the new BPM as a number
  TempoState.reset();
  let received = null;
  const unsub = TempoState.on(bpm => { received = bpm; });
  TempoState.setBPM(150);
  assert("subscriber receives new BPM (the number)",
    received, 150);

  // 4. setBPM(0) clamps to 1
  TempoState.setBPM(0);
  assert("setBPM(0) clamps to 1",
    TempoState.get(), 1);

  // 5. setBPM(500) clamps to 300
  TempoState.setBPM(500);
  assert("setBPM(500) clamps to 300",
    TempoState.get(), 300);

  // 6. setBPM(-50) clamps to 1
  TempoState.setBPM(-50);
  assert("setBPM(-50) clamps to 1",
    TempoState.get(), 1);

  // 7. setBPM("90") coerces to number 90
  TempoState.setBPM("90");
  assert("setBPM(\"90\") coerces to 90",
    TempoState.get(), 90);

  // 8. setBPM("not a number") is a no-op and does not notify
  TempoState.setBPM(100);
  let notifyCount = 0;
  const unsubNaN = TempoState.on(() => { notifyCount++; });
  TempoState.setBPM("not a number");
  assert("setBPM(\"not a number\") leaves BPM unchanged",
    TempoState.get(), 100);
  assert("setBPM(\"not a number\") does not notify",
    notifyCount, 0);
  unsubNaN();

  // 9. setBPM(120) when BPM is already 120 still notifies
  //    (no-equality-check convention, mirroring HarmonyState.update)
  TempoState.reset();
  let sameValueNotifyCount = 0;
  const unsubSame = TempoState.on(() => { sameValueNotifyCount++; });
  TempoState.setBPM(120);
  assert("setBPM with current value still notifies",
    sameValueNotifyCount, 1);
  unsubSame();

  // 10. on() returns a working unsubscribe function
  TempoState.reset();
  let afterUnsubCount = 0;
  const unsub2 = TempoState.on(() => { afterUnsubCount++; });
  TempoState.setBPM(110);
  unsub2();
  TempoState.setBPM(115);
  assert("unsubscribe stops notifications to removed listener",
    afterUnsubCount, 1);

  // 11. reset() restores BPM to 120 and notifies
  TempoState.setBPM(200);
  let resetNotified = false;
  let resetBpm = null;
  const unsub3 = TempoState.on(bpm => { resetNotified = true; resetBpm = bpm; });
  TempoState.reset();
  assert("reset() restores BPM to 120",
    TempoState.get(), 120);
  assert("reset() notifies",
    resetNotified, true);
  assert("reset() subscriber receives 120",
    resetBpm, 120);
  unsub3();

  // also clean up the unsub from test 3
  unsub();

  // Summary
  const passed = results.filter(r => r.pass).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
})();

--- End self-test --- */
