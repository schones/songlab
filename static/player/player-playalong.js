/**
 * player-playalong.js
 * ===================
 * Quiet timing log for the player's play-along mode (3): pairs the notes the
 * clock expected with the notes that were played, by pitch and time, and
 * keeps the result per loop pass. Pure logic — no DOM, no audio, no clock;
 * Node-runnable. Nothing here is shown on the page: it is the record the
 * future scoring and coach will read (player.js getLastPass()).
 *
 *   createTimingLog({ windowMs = HIT_WINDOW_MS }) → log
 *     open(pass, meta)        a pass begins: meta is kept on it as given, and should carry
 *                             startedAt (the audio time of its first downbeat)
 *     expect(note, pass)      → { entry, hit }
 *         note: { pitch, hand, bar, beat, audioTime, ref? } — a note the player should
 *         play at audioTime. `hit` is the played entry it was paired with when that
 *         note was already played early, else null. `ref` (anything; the page's own
 *         note object) is kept on the entry but left out of JSON.
 *     played(pitch, audioTime, pos?) → { entry, hit }
 *         a key went down. `hit` is the expected entry it was paired with, or null —
 *         then it waits: an expectation registered later may still claim it (a note
 *         played early), until sweep() gives up on it. pos: { bar, beat } where the
 *         clock was, recorded for a note that pairs with nothing.
 *     sweep(now)              → { missed: [expected], extras: [played] }
 *         everything more than the window old that is still unpaired is settled:
 *         expected notes become 'missed', played notes become extras of the pass
 *         they fell in. Each entry is reported once.
 *     close(pass, { endedAt, complete = true }) → { pass, missed, extras }, or null
 *         settles the pass: unpaired expected notes at or before endedAt are missed
 *         (later ones — scheduled ahead, never reached — are dropped), and it
 *         joins passes(). Unpaired played notes up to endedAt are settled too.
 *     openPasses()            the open passes, lowest number first
 *     discard(pass)           drop an open pass that never began (opened ahead, then stopped)
 *     last()                  the closed pass with at least one played note that ended most
 *                             recently (a pass nobody played in — paused in the count-in,
 *                             a loop pass sat out — is skipped), or null
 *     passes()                the last KEEP_PASSES (10) closed passes, oldest first, played in or not
 *     current()               the open pass with the highest number, or null
 *     reset()                 forget the open passes (a new run); the closed ones stay
 *
 *   audioTimeFromStamp(perfMs, { contextTime, performanceTime }) → seconds
 *       the audio-clock time of a performance.now() instant, from an AudioContext
 *       output timestamp (the two clocks paired at the speaker). Take the stamp at
 *       the event, every event: the clocks are not locked to each other.
 *
 *   Pairing: same pitch, |played − expected| ≤ window, the closest one first; each
 *   note pairs once. offsetMs = played − expected, in ms: early negative, late positive.
 *
 *   A pass: { pass, ...meta, endedAt, complete,
 *             expected: [{ pitch, hand, bar, beat, audioTime, playedAt, offsetMs, status: 'hit' | 'missed' | 'pending', pass }],
 *             played:   [{ pitch, hand, bar, beat, audioTime, expectedAt, offsetMs, matched, extra, pass }] }
 *   For a paired played note bar / beat / hand are the expected note's; an extra — a
 *   played note that paired with nothing — has extra: true, matched: false, offsetMs
 *   null (never 0: 0 is a note exactly on time), hand null, and bar / beat where the
 *   clock was.
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/player/player-playalong.js').then(m => m.selfTest())"
 */

const HIT_WINDOW_MS = 250;   // a played note counts for an expected one of the same pitch within this much, either side
const KEEP_PASSES = 10;      // closed passes kept (passes())

/** The audio-clock time (s) of a performance.now() instant (ms), from an output timestamp { contextTime (s), performanceTime (ms) }. */
const audioTimeFromStamp = (perfMs, stamp) => stamp.contextTime + (perfMs - stamp.performanceTime) / 1000;

function createTimingLog({ windowMs = HIT_WINDOW_MS } = {}) {
  const win = Math.max(0, Number(windowMs) || 0) / 1000;
  let passes = new Map();    // number → pass (open ones)
  let pending = [];          // expected entries not yet paired or missed
  let loose = [];            // played entries not yet paired or settled
  let history = [];          // closed passes, oldest first, at most KEEP_PASSES

  const round = ms => Math.round(ms * 10) / 10;
  const passOf = number => {
    if (!passes.has(number)) passes.set(number, { pass: number, endedAt: null, complete: false, expected: [], played: [] });
    return passes.get(number);
  };
  /** The open pass a stray note at `time` falls in: the latest one that had begun, else the earliest. */
  function passAt(time) {
    const open = [...passes.values()].sort((a, b) => a.pass - b.pass);
    if (!open.length) return null;
    let best = open[0];
    for (const p of open) if (typeof p.startedAt === 'number' && p.startedAt <= time) best = p;
    return best;
  }
  function pair(exp, play) {
    exp.playedAt = play.audioTime;
    exp.offsetMs = round((play.audioTime - exp.audioTime) * 1000);
    exp.status = 'hit';
    Object.assign(play, { hand: exp.hand, bar: exp.bar, beat: exp.beat, expectedAt: exp.audioTime, offsetMs: exp.offsetMs, matched: true, pass: exp.pass });
    pending = pending.filter(e => e !== exp);
    loose = loose.filter(e => e !== play);
    passOf(exp.pass).played.push(play);
  }
  const closest = (list, pitch, time) => {
    let best = null;
    for (const e of list) {
      if (e.pitch !== pitch) continue;
      const d = Math.abs(e.audioTime - time);
      if (d <= win + 1e-9 && (!best || d < Math.abs(best.audioTime - time))) best = e;
    }
    return best;
  };
  function settleExtra(play) {
    const p = passAt(play.audioTime);
    loose = loose.filter(e => e !== play);
    if (!p) return false;
    play.pass = p.pass; play.extra = true; play.offsetMs = null;
    p.played.push(play);
    return true;
  }

  return {
    open(pass, meta = {}) {
      Object.assign(passOf(pass), meta, { pass });
      return passOf(pass);
    },
    expect(note, pass = 1) {
      const entry = { pitch: note.pitch, hand: note.hand ?? null, bar: note.bar ?? null, beat: note.beat ?? null, audioTime: note.audioTime, playedAt: null, offsetMs: null, status: 'pending', pass };
      Object.defineProperty(entry, 'ref', { value: note.ref, enumerable: false });
      passOf(pass).expected.push(entry);
      pending.push(entry);
      const hit = closest(loose, entry.pitch, entry.audioTime);
      if (hit) pair(entry, hit);
      return { entry, hit };
    },
    played(pitch, audioTime, pos = null) {
      const entry = { pitch, hand: null, bar: pos && pos.bar != null ? pos.bar : null, beat: pos && pos.beat != null ? pos.beat : null, audioTime, expectedAt: null, offsetMs: null, matched: false, extra: false, pass: null };
      loose.push(entry);
      const hit = closest(pending, pitch, audioTime);
      if (hit) pair(hit, entry);
      return { entry, hit };
    },
    sweep(now) {
      const missed = [], extras = [];
      for (const e of [...pending]) if (e.audioTime + win < now) { e.status = 'missed'; missed.push(e); }
      pending = pending.filter(e => e.status === 'pending');
      for (const e of [...loose]) if (e.audioTime + win < now) { if (settleExtra(e)) extras.push(e); }
      return { missed, extras };
    },
    close(pass, { endedAt = Infinity, complete = true } = {}) {
      const p = passes.get(pass);
      if (!p) return null;
      const missed = [], extras = [];
      for (const e of pending.filter(x => x.pass === pass)) {
        if (e.audioTime <= endedAt) { e.status = 'missed'; missed.push(e); }
        else p.expected = p.expected.filter(x => x !== e);   // scheduled ahead, never reached
      }
      pending = pending.filter(e => e.pass !== pass);
      const others = [...passes.values()].filter(x => x.pass > pass);
      const upTo = others.length ? Math.min(endedAt, ...others.map(x => (typeof x.startedAt === 'number' ? x.startedAt - win : Infinity))) : endedAt;
      for (const e of [...loose]) if (e.audioTime <= upTo) { e.pass = pass; e.extra = true; e.offsetMs = null; p.played.push(e); extras.push(e); }
      loose = loose.filter(e => e.pass == null);
      p.endedAt = Number.isFinite(endedAt) ? endedAt : null;
      p.complete = !!complete;
      p.expected.sort((a, b) => a.audioTime - b.audioTime);
      p.played.sort((a, b) => a.audioTime - b.audioTime);
      passes.delete(pass);
      history.push(p);
      if (history.length > KEEP_PASSES) history = history.slice(-KEEP_PASSES);
      return { pass: p, missed, extras };
    },
    /** The open passes, lowest number first. */
    openPasses: () => [...passes.values()].sort((a, b) => a.pass - b.pass),
    /** Drop an open pass that never began (opened ahead of its downbeat, then stopped): its entries go with it. */
    discard(pass) {
      if (!passes.delete(pass)) return false;
      pending = pending.filter(e => e.pass !== pass);
      return true;
    },
    last() {
      for (let i = history.length - 1; i >= 0; i--) if (history[i].played.length) return history[i];
      return null;
    },
    passes: () => history.slice(),
    current() {
      let best = null;
      for (const p of passes.values()) if (!best || p.pass > best.pass) best = p;
      return best;
    },
    reset() { passes = new Map(); pending = []; loose = []; },
  };
}

export { createTimingLog, audioTimeFromStamp, HIT_WINDOW_MS, KEEP_PASSES, selfTest };

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
  console.log('\n─── player-playalong.js self-test ───\n');

  const N = (pitch, audioTime, bar = 1, beat = 0, hand = 'rh') => ({ pitch, hand, bar, beat, audioTime });

  // ── late, early, exact ──────────────────────────────────────────
  {
    const log = createTimingLog();
    log.open(1, { from: 1, to: 2, startedAt: 10 });
    const e1 = log.expect(N(60, 10), 1);
    assert('an expected note waits: pending, no hit', [e1.hit, e1.entry.status, e1.entry.offsetMs], [null, 'pending', null]);
    const p1 = log.played(60, 10.04);
    assert('played 40 ms late: paired, offset +40', [p1.hit === e1.entry, e1.entry.status, e1.entry.offsetMs, e1.entry.playedAt, p1.entry.matched, p1.entry.offsetMs], [true, 'hit', 40, 10.04, true, 40]);
    const p2 = log.played(62, 10.9);   // before its expectation is registered (the clock looks 150 ms ahead; this is 100 ms early… registered later here)
    assert('a note with nothing to pair with yet waits', [p2.hit, p2.entry.matched], [null, false]);
    const e2 = log.expect(N(62, 11, 1, 1), 1);
    assert('…and the expectation registered next claims it: 100 ms early, offset −100', [e2.hit === p2.entry, e2.entry.status, e2.entry.offsetMs, p2.entry.bar, p2.entry.beat, p2.entry.hand], [true, 'hit', -100, 1, 1, 'rh']);
    const e3 = log.expect(N(64, 12, 1, 2), 1);
    log.played(64, 12);
    assert('exactly on time: offset 0', [e3.entry.status, e3.entry.offsetMs], ['hit', 0]);
    assert('the entry keeps the page\'s ref out of JSON', (() => { const r = log.expect({ ...N(65, 13), ref: { big: true } }, 1); return [r.entry.ref, JSON.stringify(r.entry).includes('big')]; })(), [{ big: true }, false]);
  }

  // ── window, wrong pitch, pairing once ───────────────────────────
  {
    const log = createTimingLog();
    log.open(1, { startedAt: 0 });
    const e = log.expect(N(60, 5), 1);
    assert('260 ms late is outside the 250 ms window; a different pitch never pairs', [log.played(60, 5.26).hit, log.played(61, 5).hit], [null, null]);
    assert('250 ms early is inside', [log.played(60, 4.75).hit === e.entry, e.entry.offsetMs], [true, -250]);
    assert('a second strike of a paired note pairs with nothing', log.played(60, 5.01).hit, null);
    const a = log.expect(N(67, 8), 1), b = log.expect(N(67, 8.3, 1, 1), 1);
    const p = log.played(67, 8.2);
    assert('two expected notes of one pitch in reach: the closer one wins (8.3, 100 ms early)', [p.hit === b.entry, b.entry.offsetMs, a.entry.status], [true, -100, 'pending']);
    assert('a custom window', (() => { const l = createTimingLog({ windowMs: 50 }); l.open(1, { startedAt: 0 }); l.expect(N(60, 1), 1); return [l.played(60, 1.06).hit, l.played(60, 1.05).hit !== null]; })(), [null, true]);
  }

  // ── sweep: missed and extras, each once ─────────────────────────
  {
    const log = createTimingLog();
    log.open(1, { startedAt: 0 });
    const e1 = log.expect(N(60, 1), 1), e2 = log.expect(N(62, 2, 1, 1), 1);
    log.played(70, 1.1, { bar: 1, beat: 0.2 });
    assert('nothing settles inside the window', log.sweep(1.2), { missed: [], extras: [] });
    const s = log.sweep(1.5);
    assert('past the window: the unplayed note is missed, the stray note is an extra of pass 1 with the clock\'s position', [s.missed.map(x => [x.pitch, x.status]), s.extras.map(x => [x.pitch, x.matched, x.offsetMs, x.bar, x.beat, x.pass]), e1.entry.status, e2.entry.status], [[[60, 'missed']], [[70, false, null, 1, 0.2, 1]], 'missed', 'pending']);
    assert('the extra says so: extra true, offsetMs null (not 0); a paired note is extra false', [s.extras[0].extra, s.extras[0].offsetMs, (() => { log.expect(N(72, 3), 1); return log.played(72, 3).entry; })().extra], [true, null, false]);
    assert('reported once only', log.sweep(1.6), { missed: [], extras: [] });
    assert('a missed note can no longer be paired', log.played(60, 1.2).hit, null);
  }

  // ── passes ──────────────────────────────────────────────────────
  {
    const log = createTimingLog();
    log.open(1, { from: 3, to: 4, loop: true, hands: 'rh', startedAt: 0 });
    log.expect(N(60, 0, 3, 0), 1); log.played(60, 0.02);
    log.expect(N(62, 1, 3, 1), 1);                       // never played
    log.expect(N(64, 3.9, 4, 3), 1);
    log.open(2, { from: 3, to: 4, loop: true, hands: 'rh', startedAt: 4 });
    log.expect(N(60, 4, 3, 0), 2);                       // pass 2's downbeat, registered ahead
    log.played(60, 3.95);                                // early for pass 2's downbeat
    log.played(64, 3.97);                                // late for pass 1's last note
    log.played(30, 3.5, { bar: 4, beat: 2.5 });          // a stray in pass 1
    assert('current() is the newest open pass; nothing is last yet', [log.current().pass, log.last()], [2, null]);
    const c = log.close(1, { endedAt: 4 });
    assert('close(1): returns the pass with its meta, complete, ended at 4', [c.pass.pass, c.pass.from, c.pass.to, c.pass.hands, c.pass.complete, c.pass.endedAt], [1, 3, 4, 'rh', true, 4]);
    assert('pass 1 expected: hit +20, missed, hit +70 — in time order', c.pass.expected.map(e => [e.pitch, e.status, e.offsetMs]), [[60, 'hit', 20], [62, 'missed', null], [64, 'hit', 70]]);
    assert('close reports what it settled: the missed note and the stray', [c.missed.map(e => e.pitch), c.extras.map(e => e.pitch)], [[62], [30]]);
    assert('pass 1 played: its two hits and the stray (extra, offset null); the early note for pass 2 is not in it', c.pass.played.map(e => [e.pitch, e.matched, e.offsetMs, e.extra]), [[60, true, 20, false], [30, false, null, true], [64, true, 70, false]]);
    assert('last() is pass 1; pass 2 is under way with its early downbeat (−50)', [log.last().pass, log.current().pass, log.current().expected.map(e => [e.pitch, e.status, e.offsetMs])], [1, 2, [[60, 'hit', -50]]]);
    log.expect(N(62, 5, 3, 1), 2);
    log.expect(N(64, 7.9, 4, 3), 2);                     // scheduled ahead, never reached
    const stopped = log.close(2, { endedAt: 5.5, complete: false });
    assert('stopped mid-pass: incomplete; the note at 5 is missed, the one not reached (7.9) is dropped', [stopped.pass.complete, stopped.pass.expected.map(e => [e.pitch, e.status])], [false, [[60, 'hit'], [62, 'missed']]]);
    assert('openPasses lists them in order; discard drops one that never began, with its pending notes', (() => { const l = createTimingLog(); l.open(2, { startedAt: 4 }); l.open(1, { startedAt: 0 }); l.expect(N(60, 4), 2); const before = l.openPasses().map(x => x.pass); return [before, l.discard(2), l.discard(2), l.openPasses().map(x => x.pass), l.played(60, 4).hit]; })(), [[1, 2], true, false, [1], null]);
    assert('close of an unknown pass → null; reset forgets the open passes, last() stays', [log.close(9), (log.open(3, {}), log.reset(), log.current()), log.last().pass], [null, null, 2]);
    assert('passes(): the closed passes, oldest first', log.passes().map(p => [p.pass, p.complete]), [[1, true], [2, false]]);
  }

  // ── history: last() skips passes nobody played in; ten are kept ──
  {
    const log = createTimingLog();
    assert('nothing closed: last() null, passes() empty', [log.last(), log.passes()], [null, []]);
    log.open(1, { run: 1, startedAt: 0 }); log.expect(N(60, 0), 1); log.played(60, 0.01); log.close(1, { endedAt: 2 });
    log.open(2, { run: 1, startedAt: 2 }); log.expect(N(60, 2), 2); log.close(2, { endedAt: 2.4, complete: false });   // paused before a note was played
    log.reset();
    log.open(1, { run: 2, startedAt: 9 }); log.close(1, { endedAt: 9, complete: false });                              // stopped in the count-in
    assert('last() is the newest pass with a played note, not the two empty ones after it', [log.last().run, log.last().pass, log.last().played.length, log.passes().map(p => p.played.length)], [1, 1, 1, [1, 0, 0]]);
    log.open(1, { run: 3, startedAt: 20 }); log.played(61, 20.5, { bar: 1, beat: 0.5 }); log.close(1, { endedAt: 21, complete: false });
    assert('a pass with only an extra counts as played in', [log.last().run, log.last().played.map(e => [e.pitch, e.extra, e.offsetMs])], [3, [[61, true, null]]]);
    for (let i = 4; i <= 14; i++) { log.open(1, { run: i, startedAt: i * 10 }); log.close(1, { endedAt: i * 10 + 1 }); }
    assert(`only the last ${KEEP_PASSES} passes are kept, oldest first`, [log.passes().length, log.passes()[0].run, log.passes()[KEEP_PASSES - 1].run], [KEEP_PASSES, 5, 14]);
    assert('…and with every played-in pass gone from them, last() is null', log.last(), null);
  }

  // ── no drift: a player exactly on the click reads ≈ 0 for a whole 30-second pass ──
  // The real beat clock at 60.68 bpm (74 % of 82) in 3/4 schedules the clicks and the expected notes; the
  // simulated player strikes each note at the instant its click is HEARD (output latency later), stamped
  // in performance.now() ms; the key time goes back onto the audio clock through audioTimeFromStamp with
  // the stamp taken at the event, as player.js does. The audio clock runs 200 ppm fast against the
  // performance clock, as real devices do, and the stamp is up to 10 ms stale (one audio callback).
  {
    const { createBeatClock, INTERVAL_MS } = await import('./beat-clock.js');
    const SKEW = 1.0002, LATENCY = 0.023, CALLBACK = 0.01, PERF0 = 5000;
    const contextAt = r => r * SKEW;                       // AudioContext.currentTime at real time r (s)
    const perfAt = r => PERF0 + r * 1000;                  // performance.now() at real time r
    const heardAt = audioTime => (audioTime + LATENCY) / SKEW;   // the real time a sound scheduled at audioTime leaves the speaker
    const stampAt = r => { const rq = Math.floor(r / CALLBACK) * CALLBACK; return { contextTime: contextAt(rq) - LATENCY, performanceTime: perfAt(rq) }; };
    const BARS = 11, BPM = 82 * 74 / 100;                  // 11 bars of 3/4 at 60.68 bpm: 32.6 s
    const items = []; for (let i = 0; i < BARS * 6; i++) items.push({ q: i / 2, pitch: 60 + (i % 5), bar: Math.floor(i / 6) + 1, beat: (i % 6) / 2 });

    function simulate(mapKey) {
      const audio = { t: 0, ready: () => true, now() { return this.t; } };
      const timer = { fn: null, set(fn) { this.fn = fn; return 1; }, clear() { this.fn = null; } };
      const clock = createBeatClock({ audio, timer });
      clock.configure({ bars: Array.from({ length: BARS }, (_, i) => i + 1), meter: '3/4' });
      clock.setTempo(BPM);
      const log = createTimingLog();
      const clicks = [], keys = [];
      clock.on('beat', p => clicks.push(p.audioTime));
      clock.on('item', p => {   // as player.js: the expectation is registered ahead; the key goes down when the note's click is heard
        log.expect({ pitch: p.item.pitch, hand: 'rh', bar: p.item.bar, beat: p.item.beat, audioTime: p.audioTime }, p.pass);
        keys.push({ r: heardAt(p.audioTime), pitch: p.item.pitch });
      });
      let ended = null;
      clock.on('ended', p => { ended = p.audioTime; });
      const started = clock.start({ fromBar: 1, toBar: BARS, countInBars: 1, at: 0.5, items });
      log.open(1, { startedAt: started.barOneTime });
      for (let r = 0; r < 40; r += INTERVAL_MS / 1000) {
        audio.t = contextAt(r);
        if (timer.fn) timer.fn();
        while (keys.length && keys[0].r <= r) { const k = keys.shift(); log.played(k.pitch, mapKey(perfAt(k.r), k.r)); }
      }
      const pass = log.close(1, { endedAt: ended }).pass;
      return { pass, clicks, started, ended };
    }

    const live = simulate((perfMs, r) => audioTimeFromStamp(perfMs, stampAt(r)));
    const offs = live.pass.expected.map(e => e.offsetMs);
    assert('the pass is 30 s or more of notes on the click\'s own line (every beat has a note at the click\'s audio time)', [live.ended - live.started.barOneTime >= 30, live.pass.expected.length, live.clicks.slice(3).every(t => live.pass.expected.some(e => e.audioTime === t))], [true, BARS * 6, true]);
    assert('on the click throughout: every note hit, every offset within 0.1 ms, none extra', [live.pass.expected.every(e => e.status === 'hit'), Math.max(...offs.map(Math.abs)) <= 0.1, live.pass.played.filter(e => e.extra).length], [true, true, 0]);
    assert('…and the last five notes read what the first five do (no slide)', offs.slice(-5).map(Math.abs).every(o => o <= 0.1) && offs.slice(0, 5).map(Math.abs).every(o => o <= 0.1), true);
    const first = stampAt(0);
    const cached = simulate(perfMs => audioTimeFromStamp(perfMs, first));   // the mapping taken once at the start
    const slide = cached.pass.expected[cached.pass.expected.length - 1].offsetMs - cached.pass.expected[0].offsetMs;
    assert('control — a mapping cached at the start does slide (−0.2 ms a second at 200 ppm: about −6 ms by the end), so this test would see it', slide < -5 && slide > -8, true);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  if (typeof process !== 'undefined' && passed !== results.length) process.exitCode = 1;
  return { passed, total: results.length };
}
