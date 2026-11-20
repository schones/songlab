/**
 * Player smoke: the real static/player/player.js under Node, with a stubbed
 * DOM and a fake audio clock on real time (harness.mjs). It covers what the
 * pure modules' self-tests cannot: the page's own wiring — keys and buttons,
 * the transport's call order, the timing log and the bus as player.js
 * drives them. No browser, no server, no MIDI, no private piece (the
 * fixture is built in harness.mjs). It is not a substitute for the Chrome /
 * RD-2000 check: nothing is drawn and nothing sounds.
 *
 *   node tests/player/smoke.mjs            every scenario, each in its own process (≈ 2 min: the clock is real time)
 *   node tests/player/smoke.mjs pause      one scenario: form | form-none | band | band-none | pause | first-downbeat | shortcuts | notes | notes-legacy | feel-none | feel-bars | two-lines | drums-fallback | drums | steady | steady-stop | dev | dev-off | mode-card
 *
 * Add a scenario: a function in SCENARIOS that boots the harness, checks,
 * and ends with h.done().
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { boot, fixtureNorm } from './harness.mjs';

const FEEL_NOTE = {
  title: 'Feel: a test note',
  body: 'First paragraph, with *rubato* in it.\n\n**A heading.** Then plain text\nwrapped over two lines.\n\n**Try it:** land every 1.',
};
const NOTES = { feel: 'rubato', anchors: 'downbeats', songNotes: [{ id: 'history', title: 'Where it comes from', body: 'A *folk* chant.' }, { id: 'feel', ...FEEL_NOTE }, { id: 'empty', title: 'Skipped', body: '  ' }] };
/** A rendered node of the stub DOM as text, with <b> / <i> for strong / em. */
const flat = n => (typeof n === 'string' ? n : (n.tag === 'strong' ? `<b>${n.textContent}</b>` : n.tag === 'em' ? `<i>${n.textContent}</i>` : n.tag === 'h3' ? `# ${n.textContent}` : n.children.map(flat).join(n.tag === 'section' ? ' | ' : '')));

/** A piece with a play order, the shape of Run Rudolph Run in small: 16 bars in lines of two; 1–8, 3–8 (the repeat), 3–4, then the coda 15–16. 18 played bars; bar 3 is seq 2, 8 and 14. Fast, so the whole form takes about 7 s at 200 %. */
const FORM_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 3, 4, 5, 6, 7, 8, 3, 4, 15, 16];
const FORM_PIECE = { piece: 'smoke-form', title: 'Smoke form', tempo: 240, lines: [1, 3, 5, 7, 9, 11, 13, 15], repeats: { start: [3], end: [8] }, marks: { segno: [3], toCoda: [4], dsAlCoda: [8], coda: [15] }, form: { playOrder: FORM_ORDER } };

/**
 * A learner for play-along: plays the expected notes `plays(detail)` says yes to, each at the instant it is heard
 * (its audio time + the fake context's 20 ms output latency), so a played note reads ≈ 0 ms. robot.plays can be
 * swapped while it runs. The fixture's bar is D6 and G4 on beat 1, B♭4, D5, and a second D6 an eighth before the
 * barline — that last one is still inside its hit window when the barline is judged.
 */
function robot(h, plays = () => true) {
  const r = { plays };
  h.C.on('note:expected', d => {
    if (!r.plays(d)) return;
    setTimeout(() => { h.P.noteOn(d.pitch, performance.now()); h.P.noteOff(d.pitch); }, Math.max(0, (d.audioTime + 0.02 - h.now()) * 1000));
  });
  return r;
}
const CLEAN = () => true, SILENT = () => false;
const ONE_MISS = d => d.pitch !== 70;                 // the B♭4 is left out: one missed note
const BAD = d => d.pitch === 86 && d.beat === 0;      // only the downbeat D6: G4, B♭4 and D5 are missed (and the last D6, once its window closes)

/** What an earlier dev visit left in storage: a band that may not slow at all, a quieter kick, and things the panel must not take (not a number, not a known key). */
const DEV_STORED = JSON.stringify({ steady: { MAX_SLOWER_PER_BAR: 0, HALF_LIFE_NOTES: 'three', NOT_A_KEY: 7 }, drums: { kick: 0.5 } });

const SCENARIOS = {
  /** Listen and play-along follow form.playOrder: the played sequence, the two-line view at the jumps, pause / resume by seq, seq in the log, the Form setting. */
  async form() {
    const h = await boot({ norm: fixtureNorm(FORM_PIECE) });
    const { P, C, L, el, check, sleep, storage } = h;
    const S = P.staff;
    const until = async (f, ms = 12000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const shown = from => S.shows.slice(from).map(v => [v.top, v.bottom, v.active, v.label]);
    const started = type => h.events.filter(e => e[0] === type).slice(-1)[0][1];
    P.setCountIn(0); P.tempo = 200;   // 480 bpm, 3/4: a bar is 0.375 s
    P.setSteady(false);               // nobody plays in this scenario: with "Band slows down for me" on, the band would stop after three bars (steady-stop covers that)
    check('a piece with a play order: 18 played bars, Form shown and "with repeats"; practice shows lines 1 and 2 as ever', [P.order.length, P.form, el('pl-form-row').hidden, shown(-1)], [18, 'repeats', false, [[[1, 2], [3, 4], 0, '']]]);

    // ── Listen through the whole form ──
    const bars = [], snaps = {};
    P.clock.onDue('bar', p => { bars.push([p.bar, p.seq]); });
    let from = S.shows.length;
    const guide = () => [el('pl-guide').disabled, el('pl-guide-box').dataset.listen, el('pl-guide-note').hidden];
    const guideWas = [P.state.guide, el('pl-guide').value, Object.keys(storage).filter(k => /guide/i.test(k)).map(k => storage[k])];
    check('before anything plays the guide volume slider is live, with no note under it', guide(), [false, 'false', true]);
    await C.listen();
    check('while Listen runs the guide volume slider is disabled and dimmed, and the note under it is shown (Listen plays at full volume)', guide(), [true, 'true', false]);
    check('Listen names the run plainly, and says so in listen:start', [el('pl-status').textContent, (d => [d.form, d.bars, d.fromSeq, d.toSeq, d.startSeq, d.from, d.to, d.loop])(started('listen:start'))], ['Listening · whole song · 18 bars', [true, 18, 0, 17, 0, 1, 16, false]]);
    await until(() => !L.active);
    await sleep(40);
    check('the clock plays the bars in played order, each with its seq', bars, FORM_ORDER.map((b, i) => [b, i]));
    check('the two-line view: the line really played next below — back to bar 3 (tagged) after bars 7–8, the coda (tagged) the third time through 3–4; at the coda the line just played stays on top and the bottom slot is active; then practice is back', shown(from), [
      [[3, 4], [5, 6], 0, ''], [[5, 6], [7, 8], 0, ''], [[7, 8], [3, 4], 0, '↩ bar 3'],
      [[3, 4], [5, 6], 0, ''], [[5, 6], [7, 8], 0, ''], [[7, 8], [3, 4], 0, '↩ bar 3'],
      [[3, 4], [15, 16], 0, '→ Coda'], [[3, 4], [15, 16], 1, ''],
      [[1, 2], [3, 4], 0, ''],
    ]);
    check('it ended complete, and the follower was never moved', [(d => [d.complete, d.form])(started('listen:stop')), P.state.bar, P.state.line], [[true, true], 1, 0]);

    // ── play-along: missed colouring is dropped on re-entry; pause in the second time through bar 3, resume there ──
    bars.length = 0;
    const stale = () => [...L.missed].filter(n => (n.bar === 3 || n.bar === 4) && n.seq < 8).length;
    const off = P.clock.onDue('bar', p => { if (p.seq === 5) snaps.before = stale(); if (p.seq === 8) { snaps.after = stale(); snaps.others = L.missed.size; } });
    check('Listen over: the slider is live again', guide(), [false, 'false', true]);
    await C.playAlong();
    check('play-along: the same run', el('pl-status').textContent, 'Playing along · whole song · 18 bars');
    check('during play-along the guide volume slider is enabled, with no note', guide(), [false, 'false', true]);
    await until(() => L.seq === 8);
    const at = [L.bar, L.seq];
    C.pause(); off();
    check('nothing was played, so bars 3–4 were marked missed (coral) after the first time through; entering bar 3 again clears that line, and only that line', [snaps.before > 0, snaps.after, snaps.others > 0], [true, 0, true]);
    check('paused in the SECOND time through bar 3: the pause remembers the seq', [at, C.paused && [C.paused.mode, C.paused.bar, C.paused.seq], P.staff.marker], [[3, 8], ['playalong', 3, 8], 3]);
    const lp = C.getPasses().slice(-1)[0];
    check('the pass is one trip through the form, cut short; its entries carry seq, and bar 3 is in it twice (seq 2 and 8)', [lp.pass, lp.form, lp.bars, lp.complete, lp.expected.every(e => typeof e.seq === 'number'), [...new Set(lp.expected.filter(e => e.bar === 3).map(e => e.seq))]], [1, true, 18, false, true, [2, 8]]);
    check('note events carry seq too', [typeof h.events.find(e => e[0] === 'note:expected')[1].seq, h.events.filter(e => e[0] === 'note:missed').some(e => e[1].bar === 3 && e[1].seq === 2)], ['number', true]);
    bars.length = 0; from = S.shows.length;
    await C.resume();
    await until(() => bars.length >= 4);
    check('resume starts at that seq — bar 3 the second time, then 4 5 6 — not at the first bar 3', [bars.slice(0, 4), (d => [d.resumed, d.startBar, d.startSeq, d.form])(started('playalong:start'))], [[[3, 8], [4, 9], [5, 10], [6, 11]], [true, 3, 8, true]]);
    check('…and the page turns on from there (bars 5–6 with 7–8 under them)', shown(from).slice(0, 1), [[[5, 6], [7, 8], 0, '']]);
    C.stop(); await sleep(40);

    // ── from the current bar: the first time that bar is played ──
    P.stepLine(1); P.stepLine(1); await sleep(40);   // line 3: bars 5–6
    await C.listen(); await sleep(40);
    check('from bar 5: its first occurrence (seq 4), 14 bars to the end of the form', [el('pl-status').textContent, (d => [d.fromSeq, d.toSeq, d.bars, d.startBar])(started('listen:start'))], ['Listening · from bar 5 · 14 bars with repeats', [4, 17, 14, 5]]);
    C.pause();
    check('Listen paused: the slider stays disabled, the note stays', [C.paused && C.paused.mode, guide()], ['listen', [true, 'true', false]]);
    C.stop(); await sleep(40);
    check('Listen stopped: enabled again, and none of this touched the guide volume or what is stored for it', [guide(), [P.state.guide, el('pl-guide').value, Object.keys(storage).filter(k => /guide/i.test(k)).map(k => storage[k])]], [[false, 'false', true], guideWas]);

    // ── a loop plays as written; so does Form "as written" ──
    P.setLoop(7, 8); await sleep(40);
    await C.listen(); await sleep(40);
    check('a loop is its bars as written, repeating: no form', [el('pl-status').textContent, started('listen:start').form, L.range.form === undefined], ['Listening · bars 7–8 · looping', false, true]);
    P.clearLoop(); await sleep(40);
    P.restart(); await sleep(40);
    await C.listen(); await sleep(40);
    el('pl-form').checked = false; el('pl-form').fire('change');
    check('"Play repeats" unticked stops a transport under way and is remembered under the old key', [P.form, L.active, storage.songlab_player_form], ['written', false, 'written']);
    bars.length = 0;
    await C.listen();
    await until(() => bars.length >= 9);
    check('…and Listen is today\'s: bars 1–16 straight through (bar 9 after bar 8)', [el('pl-status').textContent, started('listen:start').form, bars.slice(7, 9).map(b => b[0])], ['Listening · straight through · 16 bars', false, [8, 9]]);
    C.stop(); await sleep(40);
    P.stepLine(1); P.stepLine(1); await sleep(40);
    await C.listen(); await sleep(40);
    check('…from a later bar it says where from', el('pl-status').textContent, 'Listening · from bar 5 · straight through · 12 bars');
    C.stop(); await sleep(40);
    check('wait-for-me practice is untouched by all this: 16 written bars of steps', [P.steps.length, P.steps[P.steps.length - 1].bar, P.setForm('repeats'), el('pl-form').checked], [16 * 4, 16, 'repeats', true]);
    h.done();
  },

  /** The accompaniment as the band: loaded after the piece, laid on the played sequence by bar number, its own sampler; the solo an octave up while it plays. */
  async band() {
    const ev = (onset, dur, pitches) => ({ onset, dur, pitches, rest: false, tie: null });
    // The band part: one G2 on every downbeat, bar 5 missing, another tempo.
    const band = fixtureNorm({ ...FORM_PIECE, piece: 'smoke-band', title: 'Smoke band', tempo: 120 });
    band.bars = band.bars.filter(b => b.bar !== 5).map(b => ({ bar: b.bar, voice: [], rh: [], lh: [ev(0, 1, ['G2'])] }));
    const solo = fixtureNorm({ ...FORM_PIECE, accompaniment: { piece: 'smoke-band', soloTranspose: 12 } });
    const h = await boot({ norm: solo, pieces: { 'smoke-band': band } });
    const { P, C, L, el, check, sleep, storage } = h;
    const until = async (f, ms = 12000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const started = type => h.events.filter(e => e[0] === type).slice(-1)[0][1];
    const ons = () => h.sounds.filter(s => s[0] === 'on');
    P.setCountIn(0); P.tempo = 200;
    check('the band part loaded after the piece: the card shows, its controls are live, off by default; what differs is said', [P.band.status, el('pl-band-card').hidden, el('pl-band-on').disabled, el('pl-band-on').checked, P.bandOn(), P.band.warnings], ['ready', false, false, false, false, ['its tempo is 120, the piece\'s 240: playing at the piece\'s', 'it has no bar 5: silent there']]);
    check('the keyboard reaches the shifted octave (D6 → D7 = 98)', [P.pieceRange(solo).high >= 98, P.pieceRange({ ...solo, accompaniment: undefined }).high < 98], [true, true]);

    // ── off: nothing changes ──
    await C.listen(); await until(() => L.seq === 2);
    C.stop(); await sleep(40);
    check('band off: only the guide piano plays, at written pitch; no label', [[...new Set(ons().map(s => s[1]))].sort(), [...new Set(ons().map(s => s[3]))].length, started('listen:start').band, el('pl-band-8va').hidden], [['A#4', 'D5', 'D6', 'G4'], 1, false, true]);

    // ── on: Listen plays the band under the solo, which moves up an octave ──
    el('pl-band-on').checked = true; el('pl-band-on').fire('change');
    check('ticking the box is remembered', [P.bandOn(), storage.songlab_player_band_on, el('pl-summary') && true], [true, '1', true]);
    h.sounds.length = 0;
    const bars = [], lit = [];
    P.clock.onDue('bar', p => { bars.push([p.bar, p.seq, p.audioTime]); });
    await C.listen(); await sleep(60);
    check('Listen with the band: says so, and the label is over the staff', [(d => [d.band, d.transpose, d.form])(started('listen:start')), el('pl-band-8va').textContent, el('pl-band-8va').hidden], [[true, 12, true], '8va with the band', false]);
    await until(() => L.seq === 9);
    C.stop(); await sleep(40);
    const bandId = P.bandPiano.id, guideId = P.guidePiano.id;
    const g2 = ons().filter(s => s[1] === 'G2'), soloOns = ons().filter(s => s[1] !== 'G2');
    check('the band sounds on its own sampler, the solo on the guide\'s an octave up', [bandId !== guideId, g2.every(s => s[3] === bandId), soloOns.every(s => s[3] === guideId), [...new Set(soloOns.map(s => s[1]))].sort()], [true, true, true, ['A#5', 'D6', 'D7', 'G5']]);
    const near = (t, list) => list.some(s => Math.abs(s[2] - t) < 0.01);
    const played = bars.filter(b => b[1] <= 8);
    check('laid on the played sequence by bar number: a G2 on every downbeat but bar 5\'s (silent), and on bar 3 the second time (seq 8)', played.map(b => [b[0], b[1], near(b[2], g2)]), [[1, 0, true], [2, 1, true], [3, 2, true], [4, 3, true], [5, 4, false], [6, 5, true], [7, 6, true], [8, 7, true], [3, 8, true]]);
    check('one stop path: both pianos were released, and the label went', [h.sounds.filter(s => s[0] === 'releaseAll').map(s => s[1]).sort(), el('pl-band-8va').hidden, L.bandNotes.size], [[guideId, bandId].sort(), true, 0]);

    // ── play-along: expected an octave up, the written octave accepted; the band is never expected or lit ──
    h.events.length = 0; h.sounds.length = 0;
    await C.playAlong(); await sleep(130);
    P.noteOn(86, performance.now()); P.noteOff(86);      // D6 as written: the low octave
    await until(() => L.seq === 1); await sleep(130);
    P.noteOn(98, performance.now()); P.noteOff(98);      // D7: where the band has it
    await until(() => L.seq === 2);
    C.pause(); await sleep(40);
    check('paused with the band: the label stays', [el('pl-band-8va').hidden, C.paused && C.paused.mode], [false, 'playalong']);
    C.stop(); await sleep(40);
    const lp = C.getLastPass();
    const d7 = lp.expected.filter(e => e.pitch === 98 && e.beat === 0);
    check('the solo is expected at the shifted pitch, never the band\'s notes', [[...new Set(lp.expected.map(e => e.pitch))].sort((a, b) => a - b), lp.expected.some(e => e.pitch === 43), h.events.filter(e => e[0] === 'note:expected').every(e => e[1].written === e[1].pitch - 12)], [[79, 82, 86, 98], false, true]);
    check('the written octave is a hit, and so is the shifted one; the log keeps what was played', [d7.slice(0, 2).map(e => [e.status, e.accept]), lp.played.map(e => [e.pitch, e.matched])], [[['hit', [86]], ['hit', [86]]], [[86, true], [98, true]]]);
    check('wait-for-me practice stays at written pitch', [P.steps[0].notes.map(n => n.midi).sort((a, b) => a - b), L.shift, el('pl-band-8va').hidden], [[67, 86], 12, true]);

    // ── a loop: the band loops with it, as written ──
    P.setLoop(7, 8); await sleep(40);
    h.sounds.length = 0; bars.length = 0;
    await C.listen();
    await until(() => bars.length >= 5);
    C.stop(); await sleep(40);
    check('a loop of bars 7–8: the band is on every downbeat, round and round', [bars.slice(0, 5).map(b => b[0]), bars.slice(0, 4).every(b => near(b[2], h.sounds.filter(s => s[1] === 'G2')))], [[7, 8, 7, 8, 7], true]);
    P.clearLoop(); await sleep(40);

    // ── the volume is live and remembered; unticking stops a transport ──
    el('pl-band-volume').value = '25'; el('pl-band-volume').fire('input');
    check('band volume: remembered, on the mixer\'s curve', [storage.songlab_player_band_volume, el('pl-band-readout').textContent, Math.round(P.mixer.gain('band') * 1000)], ['25', '25', 125]);
    await C.listen(); await sleep(40);
    el('pl-band-on').checked = false; el('pl-band-on').fire('change');
    check('unticking the box stops the transport and is remembered', [L.active, P.bandOn(), storage.songlab_player_band_on], [false, false, '0']);
    h.done();
  },

  /** No accompaniment named: no Band card. One that will not load, or is in another meter: a banner, the control disabled, and the piece plays alone. */
  async 'band-none'() {
    const solo = fixtureNorm({ accompaniment: { piece: 'smoke-band', soloTranspose: 12 } });
    const h = await boot({ norm: solo, pieces: { 'smoke-band': null } });
    const { P, C, L, el, check, sleep, storage } = h;
    P.setCountIn(0); P.tempo = 200;
    check('the band part is not there: the card shows with its control disabled, and the banner says why', [P.band.status, el('pl-band-card').hidden, el('pl-band-on').disabled, el('pl-band-volume').disabled, el('pl-banner').textContent.includes('No band: the band part “smoke-band” did not load (HTTP 404)'), el('pl-band-note').textContent], ['failed', false, true, true, true, 'No band: the band part “smoke-band” did not load (HTTP 404).']);
    storage.songlab_player_band_on = '1'; P.setBandOn(true);
    await C.listen(); await sleep(200);
    check('ticked or not, the piece plays alone at written pitch', [P.bandOn(), el('pl-band-on').checked, (d => [d.band, d.transpose])(h.events.find(e => e[0] === 'listen:start')[1]), [...new Set(h.sounds.filter(s => s[0] === 'on').map(s => s[3]))].length, L.shift], [false, false, [false, 0], 1, 0]);
    C.stop(); await sleep(40);
    h.pieces['smoke-band'] = fixtureNorm({ piece: 'smoke-band', title: 'Smoke band', time: '4/4', beatsPerBar: 4 });
    await P.loadBand(solo);
    check('another time signature refuses the band, with a banner', [P.band.status, el('pl-band-on').disabled, el('pl-banner').textContent.includes('No band: “Smoke band” cannot play with this piece — it is in 4/4, the piece in 3/4.')], ['refused', true, true]);
    h.pieces['smoke-band'] = fixtureNorm({ piece: 'smoke-band', title: 'Smoke band' });
    await P.loadBand(solo);
    check('a part that fits: ready, and the remembered tick takes effect', [P.band.status, P.band.warnings, el('pl-band-on').disabled, P.bandOn(), el('pl-band-note').textContent], ['ready', [], false, true, 'Smoke band · you play 8va with the band']);
    await P.loadBand({ ...solo, accompaniment: undefined });
    check('a piece that names no accompaniment has no Band card', [P.band, el('pl-band-card').hidden], [null, true]);
    h.done();
  },

  /** A piece with no play order: no Form setting, everything as before. */
  async 'form-none'() {
    const h = await boot();
    const { P, C, L, el, check, sleep } = h;
    P.setCountIn(0); P.tempo = 200;
    check('no play order: the Form row is hidden, order is null', [P.order, el('pl-form-row').hidden], [null, true]);
    await C.listen(); await sleep(40);
    check('Listen plays the written bars, whatever Form says', [el('pl-status').textContent, h.events.find(e => e[0] === 'listen:start')[1].form, L.range.form === undefined, L.drawnSeq], ['Listening · bars 1–16', false, true, null]);
    C.stop(); await sleep(40);
    h.done();
  },

  /** Pause / resume on Space, P, the buttons and the controller; the page while paused; R and navigation. */
  async pause() {
    const h = await boot();
    const { P, C, L, el, key, check, sleep } = h;
    check('piece loaded, 4 lines', [P.state.piece, P.state.lines.length, P.state.line], ['smoke-fixture', 4, 0]);
    P.setCountIn(0); P.tempo = 200;   // 164 bpm, 3/4: a bar is 1.098 s

    // ── play-along: pause in bar 3, resume ──
    key('p'); await sleep(50);
    check('P starts play-along; the button reads Pause', [L.active, L.mode, el('pl-playalong').textContent, C.playing], [true, 'playalong', '❚❚ Pause', 'playalong']);
    await sleep(600); P.noteOn(86, performance.now());   // a D6 nowhere near one: an extra
    await sleep(2100);                                    // ≈ 2.7 s in: bar 3
    const barAtPause = L.bar;
    key(' ');
    check('Space pauses in place: not active, paused in the bar the clock was in, button "▶ Resume"', [L.active, C.playing, C.paused && C.paused.mode, C.paused && C.paused.bar === barAtPause, barAtPause, el('pl-playalong').textContent, el('pl-listen').textContent], [false, null, 'playalong', true, 3, '▶ Resume', '▶ Listen']);
    check('…the clock is stopped, the marker stays on that bar, the status says paused', [P.clock.running, P.staff.marker, /^Paused · play-along · bar 3/.test(el('pl-status').textContent)], [false, 3, true]);
    check('events: playalong:start, pass:start, pass:end, playalong:stop', h.types(), ['playalong:start', 'pass:start', 'pass:end', 'playalong:stop']);
    const lp = C.getLastPass();
    check('the pass ended incomplete, with the played note in it; an extra has offsetMs null + extra true', [lp.complete, lp.pass, lp.run, lp.startBar, lp.played.length, lp.played.every(e => (e.extra ? e.offsetMs === null && !e.matched : typeof e.offsetMs === 'number'))], [false, 1, 1, 1, 1, true]);
    check('the pass carries the clock diagnostics', [typeof lp.timebase.drift.stampMsPerS, typeof lp.timebase.drift.currentMsPerS, Math.abs(lp.timebase.drift.stampMsPerS) < 1], ['number', 'number', true]);
    const wrongBefore = P.state.wrong; P.noteOn(30, performance.now()); P.noteOff(30);
    check('a key while paused is not judged', P.state.wrong, wrongBefore);
    P.setCountIn(1);
    const tResume = h.now(); h.sounds.length = 0;
    key(' '); await sleep(60);
    check('Space resumes the paused mode from bar 3, count-in first', [L.active, L.mode, L.startBar, el('pl-playalong').textContent, P.clock.positionAt(h.now()).countIn], [true, 'playalong', 3, '❚❚ Pause', true]);
    await sleep(1500);
    const firstNote = h.sounds.find(s => s[0] === 'on');
    check('the first guide note comes one bar (1.098 s) after the resume, and the clock is in bar 3 or 4 of pass 1', [Math.abs(firstNote[2] - tResume - 0.08 - 3 * 60 / 164) < 0.03, [3, 4].includes(P.clock.position().bar), P.clock.position().pass], [true, true, 1]);
    const ev = h.events.find(e => e[0] === 'playalong:start')[1];
    check('playalong:start says resumed from bar 3 of 1–16; the new pass is run 1 again, startBar 3', [ev.resumed, ev.startBar, ev.from, ev.to, C.getCurrentPass().run, C.getCurrentPass().startBar], [true, 3, 1, 16, 1, 3]);
    key('p');
    check('P pauses play-along too; the empty resumed pass is in getPasses but getLastPass is still the one played in', [C.paused && C.paused.mode, C.getPasses().length, C.getPasses()[1].played.length, C.getLastPass() === lp], ['playalong', 2, 0, true]);
    key('r'); await sleep(50);
    check('R ends the paused transport and goes back to the start: nothing paused, buttons reset, bar 1', [C.paused, el('pl-playalong').textContent, P.state.bar, P.staff.marker], [null, '♪ Play along', 1, 1]);
    h.types();

    // ── Listen across a page turn (line 1 = bars 1–4), pause on line 2, resume there, stop ──
    P.setCountIn(0);
    key(' '); await sleep(50);
    check('Space starts Listen', [L.active, L.mode, el('pl-listen').textContent], [true, 'listen', '❚❚ Pause']);
    await sleep(4900);   // bar 5 runs 4.39 s → 5.49 s
    el('pl-listen').fire('click');
    check('the button pauses: on bar 5, the page stays on line 2 (bars 5–8), "▶ Resume"', [C.paused && C.paused.bar, P.staff.range, P.state.line, el('pl-listen').textContent], [5, { from: 5, to: 8 }, 0, '▶ Resume']);
    const renders = P.staff.renders.length;
    el('pl-listen').fire('click'); await sleep(300);
    check('the button resumes from bar 5 without re-drawing the page', [L.active, L.startBar, P.staff.renders.length - renders, P.clock.position().bar], [true, 5, 0, 5]);
    check('songlabPlayer.pause() / resume() / stop()', [C.pause(), !!C.paused, await C.resume(), C.playing, C.stop(), C.playing, C.paused], [true, true, true, 'listen', true, null, null]);
    await sleep(50);
    check('a full stop puts the practice line back (bars 1–4)', [P.staff.range, el('pl-listen').textContent], [{ from: 1, to: 4 }, '▶ Listen']);
    check('listen events: start, stop (paused), start (resumed), stop (paused), start, stop', h.types().join(' '), 'listen:start listen:stop listen:start listen:stop listen:start listen:stop');

    // ── paused in a loop: resume keeps the loop range; navigation clears a pause ──
    P.setLoop(2, 3); await sleep(50);
    key('p'); await sleep(1500);   // bar 3 of the loop
    key(' ');
    const pausedBar = C.paused.bar;
    key(' '); await sleep(1400);
    const pos = P.clock.position();
    check('loop 2–3 paused in bar 3 and resumed: starts at bar 3, wraps to bar 2 as pass 2', [pausedBar, L.range, L.startBar, pos.bar, pos.pass], [3, { from: 2, to: 3, loop: true }, 3, 2, 2]);
    key(' '); P.stepLine(1); await sleep(50);
    check('navigation while paused ends it', [C.paused, L.active], [null, false]);
    P.clearLoop();
    const probe = await P.clockProbe(1);
    check('clockProbe reports both rates (≈ 0 on the fake clocks) and the stamp\'s latency (20 ms)', [Math.abs(probe.stampMsPerS) < 1, Math.abs(probe.currentMsPerS) < 1, probe.stampBehindCurrentMs.map(x => Math.round(x))], [true, true, [20, 20]]);
    h.done();
  },

  /** Count-in 0: the first downbeat is inside the clock's lookahead, so its expectations are registered by clock.start itself — the log must be reset before it (startTransport's order). */
  async 'first-downbeat'() {
    const h = await boot();
    const { P, C, key, check, sleep } = h;
    P.setCountIn(0); P.tempo = 200;
    key('p'); await sleep(130);          // the downbeat is ≈ 80 ms after the start
    P.noteOn(86, performance.now());     // D6, bar 1 beat 1, a little late
    await sleep(900); key(' '); await sleep(30);
    const lp = C.getLastPass();
    check('count-in 0: the pass holds the first downbeat\'s notes (G4 + D6 at beat 0), at the pass\'s start time', [lp.expected.filter(e => e.bar === 1 && e.beat === 0).map(e => e.pitch).sort(), lp.expected[0].audioTime === lp.startedAt], [[67, 86], true]);
    const d6 = lp.expected.find(e => e.pitch === 86 && e.beat === 0);
    check('the key on that downbeat is a hit, a little late, not an extra', [d6.status, d6.offsetMs > 0 && d6.offsetMs < 150, lp.played.map(e => [e.pitch, e.matched, e.extra])], ['hit', true, [[86, true, false]]]);
    check('note:expected for the downbeat came through the bus as well', h.events.filter(e => e[0] === 'note:expected' && e[1].bar === 1 && e[1].beat === 0).length, 2);
    h.done();
  },

  /** Global shortcuts yield Space / Enter to a focused button or link (the control's own keys); the other shortcuts, and Space anywhere else, still work. */
  async shortcuts() {
    const h = await boot({ norm: fixtureNorm(NOTES) });
    const { P, C, L, key, check, sleep } = h;
    P.setCountIn(0);
    const button = h.focusOn('button'), link = h.focusOn('a'), input = h.focusOn('input'), div = h.focusOn('div');
    check('Space on a focused button: the shortcut yields — no Listen, and no preventDefault, so the button gets its own click', [key(' ', { target: button }), L.active], [false, false]);
    check('Enter on a button, Space and Enter on a link: likewise', [key('Enter', { target: button }), key(' ', { target: link }), key('Enter', { target: link }), L.active], [false, false, false, false]);
    check('Space in an input is still ignored', [key(' ', { target: input }), L.active], [false, false]);
    check('N with focus on a button still toggles Song notes; Esc there closes it', [key('n', { target: button }), P.state.notesOpen, key('Escape', { target: button }), P.state.notesOpen], [true, true, true, false]);
    check('Space with focus on a plain element starts Listen (and is preventDefault-ed: no page scroll)', [key(' ', { target: div }), L.active, L.mode], [true, true, 'listen']);
    await sleep(60);
    check('Space on a focused button while Listen plays does not pause it; P from there still switches to play-along', [key(' ', { target: button }), C.playing, C.paused, (key('p', { target: button }), L.mode)], [false, 'listen', null, 'playalong']);
    await sleep(60);
    check('Space with no focused control pauses it', [key(' '), C.paused && C.paused.mode], [true, 'playalong']);
    check('R and the arrows work from a focused button too', [key('r', { target: button }), C.paused, key('ArrowRight', { target: button }), P.state.line], [true, null, true, 1]);
    h.done();
  },

  /** Song notes: the header button, the slide-in panel (open / close / N / Esc / focus / remembered per piece), the FEEL link, a transport left alone; downbeat anchors and anchor on the note events. */
  async notes() {
    const h = await boot({ norm: fixtureNorm(NOTES) });
    const { P, C, L, el, key, check, sleep } = h;
    const KEY = 'songlab_player_notes_open:smoke-fixture';
    const panel = () => [el('pl-notes-panel').dataset.open, el('pl-notes-panel').inert, el('pl-notes-btn').getAttribute('aria-expanded')];
    check('the Song notes button and the N hint show; the panel is closed (inert) by default; downbeat anchors go to the staff', [el('pl-notes-btn').hidden, el('pl-shortcut-notes').hidden, panel(), P.staff.anchors], [false, false, ['false', true, 'false'], 'downbeats']);
    check('one section per note, in order, each a heading + body (the one with an empty body is skipped); bold / italic as elements, a single newline a space', el('pl-notes-body').children.map(flat), ['# Where it comes from | A <i>folk</i> chant.', '# Feel: a test note | First paragraph, with <i>rubato</i> in it. | <b>A heading.</b> Then plain text wrapped over two lines. | <b>Try it:</b> land every 1.']);
    check('headings carry the section ids', el('pl-notes-body').children.map(sec => sec.children[0].id), ['pl-note-history', 'pl-note-feel']);
    el('pl-notes-btn').fire('click');
    check('the button opens it: aria-expanded true, not inert, focus on Close, remembered for this piece', [panel(), h.focused(), h.storage[KEY]], [['true', false, 'true'], 'pl-notes-close', '1']);
    P.setLoop(2, 3); await sleep(30);
    key('Escape');
    check('Esc closes the panel first and leaves the loop; focus goes back to the button', [panel(), !!P.state.loop, h.focused(), h.storage[KEY]], [['false', true, 'false'], true, 'pl-notes-btn', '0']);
    key('Escape');
    check('a second Esc clears the loop as before', P.state.loop, null);
    key('n');
    check('N opens it', [panel()[0], h.focused()], ['true', 'pl-notes-close']);
    key('N');
    check('N closes it', [panel()[0], h.focused()], ['false', 'pl-notes-btn']);
    el('pl-notes-btn').fire('click'); el('pl-notes-close').fire('click');
    check('Close closes it', [panel()[0], P.state.notesOpen, h.focused()], ['false', false, 'pl-notes-btn']);

    // The Piece card's FEEL value links to the Feel section.
    const link = el('pl-info-feel').children[0];
    check('FEEL row: "Rubato" as a link-styled button', [el('pl-info-feel-row').hidden, el('pl-info-feel-label').hidden, link.tag, link.textContent, link.className], [false, false, 'button', 'Rubato', 'pl-info__feel-link']);
    link.fire('click');
    check('…which opens Song notes at the Feel section (focus on its heading)', [panel()[0], h.focused()], ['true', 'h3']);
    await P.load('smoke-fixture'); await sleep(30);
    check('left open: loading the piece again opens it again', panel(), ['true', false, 'true']);
    key('n');

    // Opening and closing leave a transport alone.
    P.setCountIn(0); P.tempo = 200;
    h.events.length = 0;
    key('p'); await sleep(130);
    P.noteOn(86, performance.now());   // the downbeat D6
    key('n'); await sleep(400);
    check('N while play-along runs: the panel opens, the transport keeps running', [panel()[0], L.active, C.playing, P.clock.running], ['true', true, 'playalong', true]);
    key('Escape'); el('pl-notes-btn').fire('click'); el('pl-notes-close').fire('click'); await sleep(300);
    check('Esc, the button and Close while it runs: still playing, no stop or pause event', [panel()[0], C.playing, C.paused, h.events.filter(e => /stop|pass:end/.test(e[0])).length], ['false', 'playalong', null, 0]);
    await sleep(800); key(' '); await sleep(30);
    const expected = h.events.filter(e => e[0] === 'note:expected').map(e => e[1]);
    check('note:expected carries anchor: true on beat 1 of a bar, false elsewhere', [expected.length > 4, expected.every(n => n.anchor === (n.beat === 0)), expected.some(n => n.anchor), expected.some(n => !n.anchor)], [true, true, true, true]);
    check('note:played for the downbeat D6 is an anchor; note:missed carries the flag too', [h.events.filter(e => e[0] === 'note:played').map(e => [e[1].pitch, e[1].bar, e[1].beat, e[1].matched, e[1].anchor]), h.events.filter(e => e[0] === 'note:missed').every(e => typeof e[1].anchor === 'boolean')], [[[86, 1, 0, true, true]], true]);
    check('the timing log is untouched: no anchor field on its entries', C.getLastPass().expected.some(e => 'anchor' in e) || C.getLastPass().played.some(e => 'anchor' in e), false);
    h.done();
  },

  /** A legacy feelNote is read as the one section "feel". */
  async 'notes-legacy'() {
    const h = await boot({ norm: fixtureNorm({ feel: 'rubato', feelNote: FEEL_NOTE }) });
    const { P, el, check } = h;
    check('legacy feelNote: one section, id "feel", with its title; the button shows; the FEEL value links to it', [P.notes.map(n => [n.id, n.title]), el('pl-notes-btn').hidden, el('pl-notes-body').children.map(sec => sec.children[0].id), el('pl-info-feel').children[0].tag], [[['feel', 'Feel: a test note']], false, ['pl-note-feel'], 'button']);
    check('songNotesOf: songNotes wins over feelNote; ids are slugged, made unique and invented; no body → skipped', P.songNotesOf({ feelNote: FEEL_NOTE, songNotes: [{ id: 'My Note!', title: 'A', body: 'x' }, { id: 'my-note', body: 'y' }, { title: 'C', body: 'z' }, { id: 'gone', body: '' }, null] }).map(n => [n.id, n.title]), [['my-note', 'A'], ['my-note-2', 'Notes'], ['note-3', 'C']]);
    h.done();
  },

  /** A piece with no feel fields shows none of it. */
  async 'feel-none'() {
    const h = await boot();
    const { P, el, check } = h;
    check('no feel and no notes in the piece: the FEEL row, the Song notes button and the N hint stay hidden; the panel stays shut; no anchors', [el('pl-info-feel-row').hidden, el('pl-info-feel-label').hidden, el('pl-notes-btn').hidden, el('pl-shortcut-notes').hidden, el('pl-notes-panel').dataset.open, P.anchors, P.staff.anchors, P.isAnchor(1, 0)], [true, true, true, true, 'false', null, null, false]);
    h.key('n');
    check('N does nothing without notes', [P.state.notesOpen, P.setNotesOpen(true)], [false, false]);
    h.done();
  },

  /** Anchors as a bar list; "strict"; a feel with no notes is plain text. */
  async 'feel-bars'() {
    const h = await boot({ norm: fixtureNorm({ feel: 'strict', anchors: [1, 5, 9, 99] }) });
    const { P, el, check } = h;
    check('anchors as a bar list: the bars in the piece only, sent to the staff; beat 1 of those bars only', [[...P.anchors], P.staff.anchors, P.isAnchor(5, 0), P.isAnchor(5, 1), P.isAnchor(2, 0)], [[1, 5, 9], [1, 5, 9], true, false, false]);
    check('"Strict" row as plain text (no notes to link to); no Song notes button', [el('pl-info-feel').textContent, el('pl-info-feel').children.length, el('pl-info-feel-row').hidden, el('pl-notes-btn').hidden], ['Strict', 0, false, true]);
    h.done();
  },

  /** The two-line view: which line the page asks the staff to preview (next line, loop wrap, end of the piece), Lines 1 | 2, the transports. */
  async 'two-lines'() {
    const h = await boot();
    const { P, C, L, key, check, sleep, storage } = h;
    const S = P.staff;
    const last = () => { const v = S.shows[S.shows.length - 1]; return [v.top, v.bottom, v.active]; };
    const view = () => [...last(), S.range, P.state.line];
    check('load: every line prepared once; line 1 on top, line 2 previewed, the top slot active', [S.prepared, view(), P.lines], [[[[1, 4], [5, 8], [9, 12], [13, 16]]], [[1, 4], [5, 8], 0, { from: 1, to: 4 }, 0], 2]);

    // ── paging: the next line below; the last two lines stay up at the end ──
    key('ArrowRight'); await sleep(20);
    check('→: line 2 current, line 3 previewed (a forward move may shift)', [view(), S.shows[S.shows.length - 1].animate], [[[5, 8], [9, 12], 0, { from: 5, to: 8 }, 1], true]);
    key('ArrowRight'); await sleep(20); key('ArrowRight'); await sleep(20);
    check('the last line: no shift — line 3 stays on top, line 4 is the active one in the bottom slot', view(), [[9, 12], [13, 16], 1, { from: 13, to: 16 }, 3]);
    key('ArrowLeft'); await sleep(20);
    check('← from the last line: the same two lines, the top one active again', view(), [[9, 12], [13, 16], 0, { from: 9, to: 12 }, 2]);

    // ── wait-for-me across a line: the follower's own page turn asks for the next pair ──
    key('r'); await sleep(20);
    const playBar = () => { for (const chord of [[86, 67], [70], [74], [86]]) { for (const m of chord) P.noteOn(m, performance.now()); for (const m of chord) P.noteOff(m); } };
    for (let b = 0; b < 4; b++) playBar();
    await sleep(20);
    check('playing bars 1–4 turns to line 2 with line 3 under it', [view(), P.state.bar, P.state.wrong], [[[5, 8], [9, 12], 0, { from: 5, to: 8 }, 1], 5, 0]);

    // ── loops: a loop across lines previews its first line from its last; one inside a line changes nothing ──
    P.setLoop(3, 6); await sleep(20);
    check('loop bars 3–6: at its start (line 1) the preview is line 2', view(), [[1, 4], [5, 8], 0, { from: 1, to: 4 }, 0]);
    P.stepLine(1); await sleep(20);
    check('…on its last line (line 2) the preview is the loop\'s first line', [view(), !!P.state.loop], [[[5, 8], [1, 4], 0, { from: 5, to: 8 }, 1], true]);
    P.clearLoop(); await sleep(20);
    check('clearing the loop there puts line 3 back under it, without a shift', [view(), S.shows[S.shows.length - 1].animate], [[[5, 8], [9, 12], 0, { from: 5, to: 8 }, 1], false]);
    const before = S.shows.length;
    P.setLoop(5, 8); await sleep(20);
    check('Repeat line (bars 5–8): the preview stays line 3, nothing re-drawn', [view(), S.shows.length - before], [[[5, 8], [9, 12], 0, { from: 5, to: 8 }, 1], 0]);
    P.setLoop(13, 16); await sleep(20);
    check('a loop inside the last line: the last two lines, the bottom one active', view(), [[9, 12], [13, 16], 1, { from: 13, to: 16 }, 3]);
    P.clearLoop(); await sleep(20);

    // ── Lines: 1 | 2 ──
    key('r'); await sleep(20);
    check('Lines 1: one slot, remembered', [P.setLines(1), storage.songlab_player_lines, (await sleep(20), view())], [1, '1', [[1, 4], null, 0, { from: 1, to: 4 }, 0]]);
    key('ArrowRight'); await sleep(20);
    check('…paging is line by line', view(), [[5, 8], null, 0, { from: 5, to: 8 }, 1]);
    check('Lines 2 again: both slots re-drawn in place', [P.setLines(2), storage.songlab_player_lines, (await sleep(20), view())], [2, '2', [[5, 8], [9, 12], 0, { from: 5, to: 8 }, 1]]);
    check('anything else is the default (2)', P.setLines('x', { save: false }), 2);

    // ── a transport: its own loop decides the preview; a stop restores both slots ──
    key('r'); await sleep(20);
    P.setCountIn(0); P.tempo = 200;   // 164 bpm, 3/4: a bar is 1.098 s
    await C.listen({ from: 3, to: 6, loop: true });
    await sleep(2500);   // bars 3, 4, then bar 5 from 2.2 s
    check('Listen looping bars 3–6: on line 2 the preview is line 1 (the wrap); the follower has not moved', [L.active, view()], [true, [[5, 8], [1, 4], 0, { from: 5, to: 8 }, 0]]);
    P.setLines(1); await sleep(20);
    check('Lines 1 while it plays: the transport\'s line alone, still playing', [L.active, view()], [true, [[5, 8], null, 0, { from: 5, to: 8 }, 0]]);
    P.setLines(2); await sleep(20);
    C.stop(); await sleep(50);
    check('stop: the practice pair is back (lines 1 and 2), cut', [view(), S.shows[S.shows.length - 1].animate], [[[1, 4], [5, 8], 0, { from: 1, to: 4 }, 0], false]);
    h.done();
  },

  /** A drum sample that fails to load: that drum plays its synthesized stand-in, the others their samples; nothing goes silent, and Stop still cancels both kinds. */
  async 'drums-fallback'() {
    const four = fixtureNorm({ piece: 'smoke-44', title: 'Smoke 4/4', time: '4/4', beatsPerBar: 4, tempo: 120 });
    const warn = console.warn; const warned = []; console.warn = (...a) => { warned.push(String(a[0])); };
    const h = await boot({ norm: four, drumFiles: { hat: null } });
    const { P, C, L, check, sleep } = h;
    const until = async (f, ms = 8000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const of = (type, drum) => h.sounds.filter(s => s[0] === type && (!drum || s[1] === drum));
    const how = drum => [...new Set(of('drum', drum).map(s => s[3]))];
    P.tempo = 200; P.setMetronome(true); P.setCountIn(1); P.setBeatSound('drums');
    check('before audio starts nothing is fetched', [h.drumFetches, P.drums.samples.state], [[], 'idle']);
    await C.listen();
    const t0 = h.events.filter(e => e[0] === 'listen:start').slice(-1)[0][1].audioTime;
    await until(() => L.bar === 3);
    const stopAt = h.now();
    C.stop();
    console.warn = warn;
    const cancelled = of('drumCancel').map(s => `${s[1]}@${Math.round(s[2] * 1000)}`);
    const queued = of('drum').filter(s => s[2] > stopAt + 0.005);
    await sleep(300);
    check('the hat\'s file is a 404: the loader says partial, and says so once in the console', [P.drums.samples, warned.filter(w => /\[drums\]/.test(w)).length, /hat\.flac did not load: the synthesized hat plays instead/.test(warned.find(w => /\[drums\]/.test(w)) || '')], [{ state: 'partial', loaded: ['kick', 'snare', 'stick'], failed: ['hat'] }, 1, true]);
    check('the hat plays its synth, kick, snare and stick their samples', [how('hat'), how('kick'), how('snare'), how('stick')], [['synth'], ['sample'], ['sample'], ['sample']]);
    check('nothing went silent: the hat is still on every eighth of bars 1–2', of('drum', 'hat').map(s => Math.round((s[2] - t0) * 1000)).filter(t => t < 2000), Array.from({ length: 16 }, (_, i) => i * 125));
    check('Stop cancels the queued hits of both kinds, and nothing more is made', [queued.length > 0, queued.every(s => cancelled.includes(`${s[1]}@${Math.round(s[2] * 1000)}`)), of('drum').filter(s => s[2] > stopAt + 0.2).length], [true, true, 0]);
    h.done();
  },

  /** The drum groove in place of the click: 4/4 only, as clock items beside the guide; stick-click count-in; the click in 3/4; Stop cancels what is queued. */
  async drums() {
    const four = fixtureNorm({ piece: 'smoke-44', title: 'Smoke 4/4', time: '4/4', beatsPerBar: 4, tempo: 120 });
    const h = await boot({ norm: four, pieces: { 'smoke-34': fixtureNorm() } });
    const { P, C, L, el, check, sleep, storage } = h;
    const until = async (f, ms = 8000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const started = type => h.events.filter(e => e[0] === type).slice(-1)[0][1];
    const of = (type, drum) => h.sounds.filter(s => s[0] === type && (!drum || s[1] === drum));
    const ms = (list, t0) => list.map(s => Math.round((s[2] - t0) * 1000));   // drum entries: ['drum', name, t, how]
    const pressed = () => [el('pl-beat-click').getAttribute('aria-pressed'), el('pl-beat-drums').getAttribute('aria-pressed')];
    P.tempo = 200;   // 240 bpm in 4/4: a quarter is 0.25 s, a bar 1 s

    check('a 4/4 piece: Click is the default, Drums can be chosen, no note', [P.metro.sound, pressed(), el('pl-beat-drums').disabled, el('pl-beat-note').hidden, P.drumsOk(), P.drumsOn()], ['click', ['true', 'false'], false, true, true, false]);

    // ── Click chosen: as it always was ──
    P.setMetronome(true); P.setCountIn(1);
    await C.listen(); await until(() => L.bar === 2);
    C.stop(); await sleep(40);
    check('Click: the count-in and the beats are the metronome\'s; no drum is made', [of('click').length >= 8, of('drum').length], [true, 0]);

    // ── Drums chosen: sticks count in, then the groove under the guide ──
    el('pl-beat-drums').fire('click');
    check('Drums is remembered, shown pressed, and named in the summary', [P.metro.sound, storage.songlab_player_metro_sound, pressed(), P.drumsOn(), el('pl-summary-text').children.map(c => c.textContent).includes('drums on')], ['drums', 'drums', ['false', 'true'], true, true]);
    h.sounds.length = 0; h.events.length = 0;
    await C.listen();
    const t0 = started('listen:start').audioTime;   // bar 1's downbeat
    await until(() => L.bar === 3);
    const stopAt = h.now();
    C.stop();
    const cancelled = of('drumCancel').map(s => `${s[1]}@${Math.round(s[2] * 1000)}`);
    const queued = of('drum').filter(s => s[2] > stopAt + 0.005);
    await sleep(400);
    check('the count-in is one stick click per beat, and no metronome click sounds at all', [ms(of('drum', 'stick'), t0), of('click').length], [[-1000, -750, -500, -250], 0]);
    const bars2 = list => ms(list, t0).filter(t => t < 2000);
    check('the groove, straight: kick on 1 and 3, snare on 2 and 4 (bars 1–2)', [bars2(of('drum', 'kick')), bars2(of('drum', 'snare'))], [[0, 500, 1000, 1500], [250, 750, 1250, 1750]]);
    check('…and a closed hi-hat on every eighth', bars2(of('drum', 'hat')), Array.from({ length: 16 }, (_, i) => i * 125));
    check('the four samples were fetched once each when audio started, and every hit — sticks included — plays its sample, none the synth', [h.drumFetches.slice().sort(), P.drums.samples, [...new Set(of('drum').map(s => s[3]))]], [['hat', 'kick', 'snare', 'stick'], { state: 'ready', loaded: ['kick', 'snare', 'hat', 'stick'], failed: [] }, ['sample']]);
    check('the guide piano plays alongside: the piece\'s notes on the same downbeats', [of('on').length > 0, of('on').filter(s => s[1] === 'G4').slice(0, 2).map(s => Math.round((s[2] - t0) * 1000))], [true, [0, 1000]]);
    check('Stop cancels every hit still queued (there always is one: the next eighth), and nothing more is made', [queued.length > 0, queued.every(s => cancelled.includes(`${s[1]}@${Math.round(s[2] * 1000)}`)), of('drum').filter(s => s[2] > stopAt + 0.2).length], [true, true, 0]);

    // ── the checkbox and the choice are live, and neither stops the transport ──
    P.setCountIn(0);
    h.sounds.length = 0;
    await C.listen(); await until(() => L.bar === 2);
    el('pl-metro').checked = false; el('pl-metro').fire('change');
    const offAt = h.now();
    await sleep(500);
    check('unticking Metronome silences the drums; Listen plays on', [L.active, of('drum').filter(s => s[2] > offAt + 0.2).length, of('on').filter(s => s[2] > offAt + 0.2).length > 0], [true, 0, true]);
    el('pl-metro').checked = true; el('pl-metro').fire('change');
    await sleep(400);
    const drumsBack = of('drum', 'hat').filter(s => s[2] > offAt + 0.5).length;
    el('pl-beat-click').fire('click');
    const clickAt = h.now();
    await sleep(500);
    check('ticking it brings them back; choosing Click mid-play swaps to the click without stopping', [drumsBack > 0, L.active, of('click').filter(s => s[1] > clickAt).length > 0, of('drum').filter(s => s[2] > clickAt + 0.2).length], [true, true, true, 0]);
    C.stop(); await sleep(40);
    el('pl-beat-drums').fire('click');

    // ── play-along: the drums are never expected or logged ──
    h.sounds.length = 0; h.events.length = 0;
    await C.playAlong(); await until(() => L.bar === 3);
    C.stop(); await sleep(40);
    const exp = h.events.filter(e => e[0] === 'note:expected').map(e => e[1]);
    check('play-along with drums: the groove sounds; only the piece\'s five notes a bar are expected, each a pitch', [of('drum', 'kick').length >= 4, exp.filter(e => e.bar === 1).length, exp.filter(e => e.bar === 2).length, exp.every(e => Number.isInteger(e.pitch))], [true, 5, 5, true]);

    // ── a loop: the groove goes round with it ──
    P.setLoop(2, 3);
    h.sounds.length = 0; h.events.length = 0;
    await C.listen();
    const l0 = started('listen:start').audioTime;
    await until(() => L.pass >= 2 && L.bar === 3);
    C.stop(); await sleep(40);
    check('looping bars 2–3: the kick is on 1 and 3 of every bar, across the wrap', ms(of('drum', 'kick'), l0).filter(t => t < 3000), [0, 500, 1000, 1500, 2000, 2500]);
    P.clearLoop();

    // ── 3/4: the click, with Drums disabled and a note saying why ──
    await P.load('smoke-34'); await sleep(60);
    check('a 3/4 piece: Drums is disabled and Click shown as playing; the note says why; the choice stays remembered', [el('pl-beat-drums').disabled, pressed(), el('pl-beat-note').hidden, el('pl-beat-note').textContent, P.metro.sound, storage.songlab_player_metro_sound, P.drumsOn()], [true, ['true', 'false'], false, 'Drums need 4/4: this piece is in 3/4, so the click plays.', 'drums', 'drums', false]);
    el('pl-beat-drums').fire('click');
    check('the disabled button does nothing', [P.drumsOn(), pressed()], [false, ['true', 'false']]);
    P.setCountIn(1);
    h.sounds.length = 0; h.events.length = 0;
    await C.listen();
    const w0 = started('listen:start').audioTime;
    await until(() => L.bar === 3);
    C.stop(); await sleep(40);
    const beat34 = 60 / (82 * 2);   // 82 bpm at 200 %
    check('in 3/4 the count-in and every beat are the metronome\'s click, three to the bar; no drum, no stick', [of('drum').length, of('click').slice(0, 6).map(s => Math.round((s[1] - w0) / beat34)), el('pl-summary-text').children.map(c => c.textContent).includes('metronome on')], [0, [-3, -2, -1, 0, 1, 2], true]);
    await P.load('smoke-44'); await sleep(60);
    check('back in 4/4 the remembered Drums is in effect again', [el('pl-beat-drums').disabled, pressed(), el('pl-beat-note').hidden, P.drumsOn()], [false, ['false', 'true'], true, true]);
    h.done();
  },

  /** "Band slows down for me", the tempo following the score: isolated misses absorbed; a small drop, then larger ones inside the per-bar limit; rest bars hold; clean playing brings it back to the learner's speed and no higher; the slider and the saved tempo are never touched; badge, pill, status line; pause / resume; the box unticked. */
  async steady() {
    // Four notes a bar, all inside its first beat and a bit, so each is hit or missed well before the next barline is judged (the fixture's last eighth would still be open). Bars 12–13 are rests.
    const ev = (onset, dur, pitches) => ({ onset, dur, pitches, rest: !pitches.length, tie: null });
    const piece = fixtureNorm({ tempo: 200, lines: [1, 5, 9, 13, 17, 21] });
    piece.bars = Array.from({ length: 24 }, (_, i) => (i === 11 || i === 12
      ? { bar: i + 1, voice: [], rh: [ev(0, 3, [])], lh: [ev(0, 3, [])] }
      : { bar: i + 1, voice: [], rh: [ev(0, 3, ['D6'])], lh: [ev(0, 0.5, ['G4']), ev(0.5, 0.5, ['B♭4']), ev(1, 2, ['D5'])] }));
    const h = await boot({ norm: piece });
    const { P, C, L, el, check, sleep, storage } = h;
    const until = async (f, ms = 15000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const of = type => h.events.filter(e => e[0] === type).map(e => e[1]);
    const tempo = () => of('band:tempo');
    const brief = d => [d.from, d.to, d.seq, d.bar];
    const badge = () => [el('pl-band-tempo').textContent, el('pl-band-tempo').hidden];
    const slider = () => [P.tempo, el('pl-tempo').value, el('pl-tempo-readout').textContent, storage.songlab_player_tempo_pct ?? null];
    const TWO_MISSES = d => d.beat === 0;   // the two notes on the downbeat are played; B♭4 and D5 are missed
    P.setCountIn(0); P.STEADY.PILL_MS = 400;   // 200 bpm, 3/4: a bar is 0.9 s
    check('"Band slows down for me" is on by default, with every threshold in one place and none of the notch ones left', [P.steadyOn, el('pl-steady').checked, [P.STEADY.HALF_LIFE_NOTES, P.STEADY.COMFORT, P.STEADY.BOTTOM, P.STEADY.FLOOR, P.STEADY.MAX_SLOWER_PER_BAR, P.STEADY.MAX_FASTER_PER_BAR, P.STEADY.STOP_BARS, P.STEADY.GRACE_BARS, P.STEADY.EASE_BARS], ['JUDGE_BARS', 'STRUGGLE_MISSED', 'DROP_PCT', 'FLOOR_PCT', 'MIN_BARS_BETWEEN_DROPS', 'MESSAGE_MS'].filter(k => k in P.STEADY)], [true, true, [12, 0.8, 0.35, 0.5, 5, 3, 2, 1, 1], []]);
    check('before anything: the band is at the learner\'s speed, no badge', [P.bandPct, badge(), P.steady.score()], [100, ['', true], 1]);

    // ── one run: bar 2 one miss; bars 6–7 two misses each; bars 8–9 bad; clean from bar 10, with rests in 12–13 ──
    const kinds = { 2: ONE_MISS, 6: TWO_MISSES, 7: TWO_MISSES, 8: BAD, 9: BAD };
    const R = robot(h, d => (kinds[d.bar] || CLEAN)(d));
    const beats = [];
    P.clock.onDue('beat', p => { if (L.active) beats.push([p.bar, P.clock.tempo]); });
    await C.playAlong();
    await until(() => L.seq === 6);
    const p1 = C.getCurrentPass();
    check('an isolated miss (bar 2) and a couple of misses in one bar (bar 6) are absorbed by the comfort zone: at the target, nothing said', [P.bandPct, P.clock.tempo, tempo().length, badge(), P.staff.pills, el('pl-status').textContent, p1.steady, P.steady.score() < 1 && P.steady.score() >= P.STEADY.COMFORT], [100, 200, 0, ['', true], [], 'Playing along · bars 1–24', [], true]);
    await until(() => tempo().length === 1);
    const first = tempo()[0];
    check('a couple more in bar 7: the score is just under the comfort level — a small drop, one point, at the barline into bar 8', [brief(first), first.pass, first.S < 0.8 && first.S > 0.75, Math.round(first.fromBpm), Math.round(first.toBpm)], [[100, 99, 7, 8], 1, true, 200, 198]);
    check('the badge beside the 8va label, the status line, and the pill for the moment it first drops', [badge(), el('pl-status').textContent, P.staff.pill, P.staff.pillColor], [['99%', false], 'playing at 99% of your speed', 'Easing off', '']);
    await until(() => tempo().length === 3);
    check('continued misses (bars 8 and 9): larger drops, each held to the limit of 5 points a bar', tempo().slice(1).map(brief), [[99, 94, 8, 9], [94, 89, 9, 10]]);
    check('the badge and the status line follow at each barline; the pill said its piece once and has gone — no pill for the steps', [badge(), el('pl-status').textContent, P.staff.pills], [['89%', false], 'playing at 89% of your speed', ['Easing off', '']]);
    await until(() => L.seq === 9);
    const eased = beats.filter(b => b[0] === 9).map(b => b[1]);
    check('eased across the bar on the clock\'s live tempo: during bar 9 it is part-way from 99 % (198 bpm) to 94 % (188), never going back up', [eased.some(t => t < 198 && t > 188), eased.every(t => t <= 198 && t >= 188), eased.every((t, i) => i === 0 || t <= eased[i - 1])], [true, true, true]);
    await until(() => tempo().length === 5);
    check('clean again from bar 10: the tempo lags the score both ways — one more step down (3: all the score still asks for), then up by the limit of 3', tempo().slice(3).map(brief), [[89, 86, 10, 11], [86, 89, 11, 12]]);
    await until(() => L.seq === 13);
    check('two bars of rests (12–13): the tempo stays where it is, though the score asks for more', [tempo().length, P.bandPct, Math.round(P.clock.tempo), badge(), P.steady.score() > 0.72 && P.steady.score() < 0.8], [5, 89, 178, ['89%', false], true]);   // 178 bpm: the ease landed on 89 % exactly
    check('the tempo slider, its readout and the saved value have not moved', slider(), [100, '100', '100% · 200 bpm', null]);
    await until(() => tempo().length === 9);
    check('clean playing brings it back, 3 points a bar, to the target', tempo().slice(5).map(brief), [[89, 92, 14, 15], [92, 95, 15, 16], [95, 98, 16, 17], [98, 100, 17, 18]]);
    check('back at the learner\'s speed: the badge has gone, the status line is the usual one, and the pill says so in green', [badge(), el('pl-status').textContent, P.staff.pill, P.staff.pillColor], [['', true], 'Playing along · bars 1–24', 'Back to your speed', '#4CAF50']);
    await until(() => L.seq === 20);
    check('…and no higher: three more clean bars, no change; the clock was never above 200 bpm at any beat of the run', [tempo().length, P.bandPct, P.clock.tempo, Math.max(...beats.map(b => b[1])) <= 200, P.staff.pills], [9, 100, 200, true, ['Easing off', '', 'Back to your speed', '']]);
    C.stop(); await sleep(40);
    const lp = C.getLastPass();
    check('each tempo change is in the pass\'s timing log, with the score', [lp.steady.map(e => [e.type, e.from, e.to, e.seq, e.bar]), lp.steady.every(e => typeof e.S === 'number' && e.S > 0 && e.S < 1 && typeof e.audioTime === 'number')], [[['tempo', 100, 99, 7, 8], ['tempo', 99, 94, 8, 9], ['tempo', 94, 89, 9, 10], ['tempo', 89, 86, 10, 11], ['tempo', 86, 89, 11, 12], ['tempo', 89, 92, 14, 15], ['tempo', 92, 95, 15, 16], ['tempo', 95, 98, 16, 17], ['tempo', 98, 100, 17, 18]], true]);
    check('after the run the slider and the saved tempo are as the learner left them', slider(), [100, '100', '100% · 200 bpm', null]);

    // ── bad from the start, with nothing played in bar 4; a pause the learner chose keeps the band's tempo and the score; the slider moves the target under the band; a stop puts the band back ──
    h.events.length = 0;
    R.plays = d => d.bar !== 4 && BAD(d);
    let s3 = null, s4 = null;
    const offBar = P.clock.on('bar', p => { if (!L.active) return; if (p.bar === 4 && s3 == null) s3 = P.steady.score(); if (p.bar === 5 && s4 == null) s4 = P.steady.score(); });   // as each barline is scheduled (the judge's own moment): bar 4's notes are all decided by the second, and bar 5's downbeat has not been played yet
    await C.playAlong();
    await until(() => tempo().length === 2);
    if (typeof offBar === 'function') offBar();
    check('bad from the start: bar 1 does not count, bar 2 is absorbed, bar 3 slows the band by 5; bar 4, with no key pressed at all, holds the tempo at its barline; bar 5 slows it again', tempo().map(brief), [[100, 95, 3, 4], [95, 90, 5, 6]]);
    check('…and bar 4\'s misses did not feed the score: S at the end of the bar is S at its start, though all four notes are in the log as missed', [s3 != null && s3 === s4, s3 < 0.8, C.getCurrentPass().expected.filter(e => e.bar === 4).map(e => e.status)], [true, true, ['missed', 'missed', 'missed', 'missed']]);
    C.pause();
    const s0 = P.steady.score();
    check('paused: the band stays where it was, and so does the badge', [C.paused && C.paused.mode, P.bandPct, badge(), s0 < 0.8], ['playalong', 90, ['90%', false], true]);
    await C.resume(); await sleep(40);
    const resumed = of('playalong:start').slice(-1)[0];
    check('resumed after a pause the learner chose: at 90 % of the learner\'s speed, with the score it had (not 1 again, not lifted to the comfort level)', [resumed.resumed, resumed.tempoPct, Math.round(resumed.bpm), Math.round(P.clock.tempo), P.steady.score() === s0, el('pl-status').textContent], [true, 100, 180, 180, true, 'playing at 90% of your speed']);
    P.tempo = 80;
    check('the learner moves the slider: the target moves, the band keeps its share of it (90 % of 160 bpm)', [slider(), P.bandPct, Math.round(P.clock.tempo)], [[80, '80', '80% · 160 bpm', '80'], 90, 144]);
    C.stop(); await sleep(40);
    check('a stop puts the band back at the learner\'s speed: no badge, no pill, and the slider is where the learner put it', [P.bandPct, badge(), P.staff.pill, slider()], [100, ['', true], '', [80, '80', '80% · 160 bpm', '80']]);
    P.tempo = 100;

    // ── a fresh start is at the target with the score at 1; the box unticked while the band is slow ──
    h.events.length = 0;
    await C.playAlong(); await sleep(60);
    check('the next start: the score is 1 again and the band is at the target', [P.steady.score(), P.bandPct, Math.round(of('playalong:start')[0].bpm), el('pl-status').textContent], [1, 100, 200, 'Playing along · bars 1–24']);
    await until(() => tempo().length === 1);
    el('pl-steady').checked = false; el('pl-steady').fire('change');
    check('unticked while the band is slow: back at the learner\'s speed at once', [P.steadyOn, P.bandPct, Math.round(P.clock.tempo), badge(), el('pl-status').textContent], [false, 100, 200, ['', true], 'Playing along · bars 1–24']);
    const at = L.seq;
    await until(() => L.seq >= at + 3);
    check('off: three more bad bars and it plays on at the target, as it did before there was a band to follow — no event, nothing said', [tempo().length, P.bandPct, P.clock.tempo, L.active, el('pl-status').textContent, slider()], [1, 100, 200, true, 'Playing along · bars 1–24', [100, '100', '100% · 200 bpm', '100']]);
    C.stop(); await sleep(40);
    h.done();
  },

  /** "Band slows down for me", the stop: two silent bars pause the band at the barline, inside a repeat, and P carries on from there; rest bars count for neither the stop nor the tempo; the box unticked is play-along as it was. */
  async 'steady-stop'() {
    const ev = (onset, dur, pitches) => ({ onset, dur, pitches, rest: !pitches.length, tie: null });
    const RESTS = new Set([3, 5, 6, 7, 9]);
    const rests = fixtureNorm({ piece: 'smoke-rests', title: 'Smoke rests', tempo: 240 });
    rests.bars = rests.bars.map(b => (RESTS.has(b.bar) ? { bar: b.bar, voice: [], rh: [ev(0, 3, [])], lh: [ev(0, 3, [])] } : b));
    const h = await boot({ norm: fixtureNorm(FORM_PIECE), pieces: { 'smoke-rests': rests } });
    const { P, C, L, el, key, check, sleep, storage } = h;
    const until = async (f, ms = 15000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const of = type => h.events.filter(e => e[0] === type).map(e => e[1]);
    const R = robot(h);
    const bars = [];
    P.clock.onDue('bar', p => { bars.push([p.bar, p.seq]); });
    P.setCountIn(0); P.setMetronome(true);   // 240 bpm, 3/4: a bar is 0.75 s. The click is on: it must stop with the band

    // ── the form, from bar 5 (seq 4): one silent bar is nothing; silent the second time through bars 4 and 5 → paused at the barline into bar 6 (seq 11) ──
    P.stepLine(1); P.stepLine(1); await sleep(40);
    const quiet = new Set([5, 9, 10]);
    R.plays = d => !quiet.has(d.seq);
    await C.playAlong();
    await until(() => L.seq === 7);
    check('one silent bar (seq 5) does nothing: still playing, no stop, no tempo change, and the score is where it was (1)', [L.active, of('band:stopped').length, of('band:tempo').length, P.bandPct, P.steady.score()], [true, 0, 0, 100, 1]);
    await until(() => !L.active);
    await sleep(60);
    const stop = of('band:stopped')[0];
    check('two silent bars in a row: band:stopped at the barline into bar 6, the second time through (seq 11)', [of('band:stopped').length, stop.bar, stop.seq, stop.pass], [1, 6, 11, 1]);
    check('paused there as Space would, keeping the seq; the status says how to carry on', [C.paused && [C.paused.mode, C.paused.bar, C.paused.seq], P.clock.running, el('pl-playalong').textContent, P.staff.marker, el('pl-status').textContent], [['playalong', 6, 11], false, '▶ Resume', 6, 'paused: play along stopped. P to carry on']);
    await sleep(600);
    check('the pill over the staff says so too, and stays (nothing came before it: it is the only thing the pill has said)', [P.staff.pill, P.staff.pills.filter(Boolean)], ['Paused. Press P to carry on', ['Paused. Press P to carry on']]);
    check('the clock never reached that barline\'s bar; the silent bars fed nothing into the score and moved no tempo', [bars[bars.length - 1], of('band:tempo').length, P.bandPct, P.steady.score(), P.tempo, storage.songlab_player_tempo_pct ?? null], [[5, 10], 0, 100, 1, 100, null]);
    const last = h.sounds.filter(s => s[0] === 'on').map(s => s[2]), clicks = h.sounds.filter(s => s[0] === 'click').map(s => s[1]);
    check('nothing of the bar after the barline was sounded or clicked, and the band played right up to it', [last.filter(t => t >= stop.audioTime - 0.001).length, clicks.filter(t => t >= stop.audioTime - 0.001).length, last.some(t => t > stop.audioTime - 0.75), clicks.some(t => t > stop.audioTime - 0.3)], [0, 0, true, true]);
    const lp = C.getPasses().slice(-1)[0];
    check('the auto-pause is in the pass\'s timing log; the pass ends at the barline, with nothing expected beyond it', [lp.steady.map(e => [e.type, e.seq, e.bar]), lp.complete, lp.endedAt === stop.audioTime, lp.expected.some(e => e.seq >= 11), lp.expected.filter(e => e.seq >= 9).every(e => e.status === 'missed')], [[['stopped', 11, 6]], false, true, false, true]);
    check('playalong:stop says paused at that bar and seq', (d => [d.paused, d.bar, d.seq, d.complete])(of('playalong:stop').slice(-1)[0]), [true, 6, 11, false]);

    // ── P carries on from that barline; the first bar after a resume is not judged ──
    h.events.length = 0; bars.length = 0;
    R.plays = SILENT;
    key('p');
    await until(() => L.active);
    check('P: the pill clears as the transport resumes', P.staff.pill, '');
    await until(() => bars.length >= 2);
    check('P resumes at bar 6 the second time through (seq 11), then bar 7', [bars.slice(0, 2), (d => [d.resumed, d.startBar, d.startSeq])(of('playalong:start')[0])], [[[6, 11], [7, 12]], [true, 6, 11]]);
    await until(() => !L.active);
    await sleep(60);
    check('still silent: the resumed bar is not judged, so the band plays three bars before it stops again (the barline into seq 14)', [bars, of('band:stopped').map(d => [d.bar, d.seq]), C.paused && C.paused.seq], [[[6, 11], [7, 12], [8, 13]], [[3, 14]], 14]);
    check('the pill is up again for the second auto-pause', P.staff.pill, 'Paused. Press P to carry on');
    C.stop(); await sleep(40);
    check('…and stopping from the pause clears it', P.staff.pill, '');

    // ── rest bars count for neither: bad, rest, bad eases the band; rests hold the tempo; silent, rest, silent is a stop; rests alone are nothing ──
    await P.load('smoke-rests'); await sleep(100);
    h.events.length = 0; bars.length = 0;
    const kinds = { 2: BAD, 4: BAD, 8: SILENT, 10: SILENT };
    R.plays = d => (kinds[d.bar] || CLEAN)(d);
    await C.playAlong();
    await until(() => of('band:tempo').length === 1);
    check('bad bar 2, rest bar 3, bad bar 4: the rest bar\'s barline moved nothing — the band eases at the barline into bar 5', of('band:tempo').map(d => [d.from, d.to, d.seq, d.bar]), [[100, 95, 4, 5]]);
    check('the pill for the moment it dropped', P.staff.pill, 'Easing off');
    await until(() => L.seq === 7);
    check('three bars of rests (5–7) with nothing played: no stop, and the tempo stays where it is', [L.active, of('band:stopped').length, of('band:tempo').length, P.bandPct], [true, 0, 1, 95]);
    const s7 = P.steady.score();
    await until(() => !L.active);
    await sleep(60);
    check('silent bar 8, rest bar 9, silent bar 10: two silent bars in a row — stopped at the barline into bar 11; the silent bars moved neither the tempo nor the score', [of('band:stopped').map(d => [d.bar, d.seq]), C.paused && C.paused.bar, of('band:tempo').map(d => [d.from, d.to, d.seq, d.bar]), P.bandPct, P.tempo, P.steady.score() === s7], [[[11, 10]], 11, [[100, 95, 4, 5]], 95, 100, true]);
    check('the change and the stop are both on that pass', C.getPasses().slice(-1)[0].steady.map(e => e.type), ['tempo', 'stopped']);
    check('the auto-pause has the pill', P.staff.pill, 'Paused. Press P to carry on');

    // ── P after the band stopped by itself: a score below the comfort level is put at it, and clean playing brings the tempo back at the usual rate ──
    R.plays = CLEAN;
    key('p');
    await until(() => L.active && L.started);
    check('resumed after the auto-pause: the score was below the comfort level and is now at it; the band is still where it was', [s7 < P.STEADY.COMFORT, P.steady.score(), P.bandPct, el('pl-status').textContent], [true, P.STEADY.COMFORT, 95, 'playing at 95% of your speed']);
    await until(() => of('band:tempo').length === 3);
    check('…so it does not slow any further: after the resumed bar (not judged), each clean bar brings it back by up to 3 points, to the learner\'s speed', [of('band:tempo').slice(1).map(d => [d.from, d.to, d.seq, d.bar]), P.bandPct, P.staff.pill], [[[95, 98, 12, 13], [98, 100, 13, 14]], 100, 'Back to your speed']);
    C.stop(); await sleep(40);

    // ── the box unticked: play-along as it was ──
    el('pl-steady').checked = false; el('pl-steady').fire('change');
    check('unticking is remembered', [P.steadyOn, storage.songlab_player_band_follow], [false, '0']);
    h.events.length = 0; bars.length = 0;
    const off = { 1: BAD, 2: BAD, 4: BAD };
    R.plays = d => (off[d.bar] || SILENT)(d);   // bad bars, then silence (bar 3 is a rest): a drop and a stop if it were on
    await C.playAlong();
    await until(() => bars.length >= 13);
    check('off: bad bars, then nine bars of silence — it plays on at 100 %, no event, no message, nothing on the pass', [L.active, P.bandPct, P.clock.tempo, h.events.filter(e => e[0].startsWith('band:')).length, el('pl-status').textContent, 'steady' in C.getCurrentPass(), bars[bars.length - 1]], [true, 100, 240, 0, 'Playing along · bars 1–16', false, [13, 12]]);
    key(' ');
    check('…and Space pauses with its own status line, as ever', [C.paused && C.paused.bar, /^Paused · play-along · bar 13/.test(el('pl-status').textContent)], [13, true]);
    check('a pause by hand puts no pill up', P.staff.pill, '');
    C.stop(); await sleep(40);
    el('pl-steady').checked = true; el('pl-steady').fire('change');
    check('ticked again: on, remembered', [P.steadyOn, storage.songlab_player_band_follow], [true, '1']);
    h.done();
  },

  /** The dev tuning panel with ?dev=1: mounted over the page, a slider per STEADY value and per drum; stored values applied; a slider moved mid-run changes what the next barline does; the Judge readout and its live score meter; copy, reset. */
  async dev() {
    const h = await boot({ norm: fixtureNorm({ tempo: 200 }), search: '?dev=1', stored: { songlab_player_dev: DEV_STORED } });
    const { P, C, L, el, check, sleep, storage } = h;
    const until = async (f, ms = 15000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const tempo = () => h.events.filter(e => e[0] === 'band:tempo').map(e => e[1]);
    const D = P.dev, F = D && D.fields;
    check('with ?dev=1 the panel is mounted on the body, over the page', [!!D, document.body.children.includes(D && D.el), D.el.className], [true, true, 'pl-dev']);
    check('a slider for every value in STEADY, with a range that holds the code\'s value', [Object.keys(P.STEADY).filter(k => !F[`steady.${k}`]), Object.values(F).filter(f => !(f.min <= f.def && f.def <= f.max && f.step > 0)).map(f => f.id)], [[], []]);
    check('…and one per drum level', Object.keys(F).filter(k => k.startsWith('drums.')), ['drums.kick', 'drums.snare', 'drums.hat', 'drums.hatOffbeat', 'drums.stick']);
    check('stored dev values are applied on load: the live value, the slider and its readout; nonsense and unknown keys are left out', [P.STEADY.MAX_SLOWER_PER_BAR, F['steady.MAX_SLOWER_PER_BAR'].input.value, F['steady.MAX_SLOWER_PER_BAR'].out.textContent, P.STEADY.HALF_LIFE_NOTES, 'NOT_A_KEY' in P.STEADY, D.values().drums.kick], [0, '0', '0', 12, false, 0.5]);
    const M = D.judge.meter;
    check('the score meter at the top of the Judge section: 0 to 1, at 1 before anything is played', [M.getAttribute('role'), M.getAttribute('aria-valuemin'), M.getAttribute('aria-valuemax'), M.getAttribute('aria-valuenow'), D.judge.meterValue.textContent, D.judge.score], ['meter', '0', '1', '1.00', 'S 1.00', 1]);

    // ── every bar is bad (3 of its 5 notes missed, the last still open at the barline): the score falls, but with 0 points slower per bar the band may not follow ──
    P.setCountIn(0);   // 200 bpm, 3/4: a bar is 0.9 s
    robot(h, BAD);
    await C.playAlong();
    await until(() => L.seq === 4);
    const rows = D.judge.rows.map(r => ({ ...r }));
    check('with no points slower allowed, four bad bars change nothing', [tempo().length, P.bandPct, P.tempo], [0, 100, 100]);
    check('the Judge readout has a row per barline, newest first: the played bar, what was expected, hit and missed, and what came of it', rows.map(r => [r.seq, r.bar, r.expected, r.hits, r.missed, r.action, r.actual]), [[3, 4, 5, 1, 3, 'none', 100], [2, 3, 5, 1, 3, 'none', 100], [1, 2, 5, 1, 3, 'none', 100], [0, 1, 5, 1, 3, 'none', 100]]);   // keys: not compared — a downbeat struck at the barline may be counted in either bar
    check('…with the score after each bar (the grace bar left it at 1; it falls from there) and the tempo it asks for (none for the grace bar; 100 % while still in the comfort zone; then less)', [rows[3].score, rows[3].desired, rows[3].reason, rows[2].desired, rows.slice(0, 3).every(r => r.score < 1), rows[0].score < rows[1].score && rows[1].score < rows[2].score, rows[0].desired < rows[1].desired && rows[1].desired < 100], [1, null, 'grace bar', 100, true, true, true]);
    const cells = D.judge.el.children[0].children.map(c => c.textContent);
    check('…drawn as rows of the panel: seq, bar, expected, hit, missed, S to two decimals, the desired tempo and the actual one', [D.judge.el.children.length, cells.slice(0, 5), cells[5] === rows[0].score.toFixed(2), cells[6] === `${Math.round(rows[0].desired)}%`, cells[7], D.judge.el.children[3].children.map(c => c.textContent).slice(5)], [4, ['3', '4', '5', '1', '3'], true, true, '100%', ['1.00', '–', '100%']]);
    check('the meter follows the score as notes are judged, between barlines too', [M.getAttribute('aria-valuenow') === P.steady.score().toFixed(2), D.judge.score === P.steady.score(), D.judge.score < 1, D.judge.meterValue.textContent === `S ${P.steady.score().toFixed(2)}`], [true, true, true, true]);

    // ── the slider moved mid-run: the next barline acts on it ──
    const s = F['steady.MAX_SLOWER_PER_BAR'].input;
    s.value = '5'; s.fire('input');
    check('the slider writes the live value the page reads, and saves under the dev key', [P.STEADY.MAX_SLOWER_PER_BAR, JSON.parse(storage.songlab_player_dev).steady.MAX_SLOWER_PER_BAR], [5, 5]);
    await until(() => tempo().length === 1);
    check('…and the very next barline slows by 5', [tempo()[0].seq, tempo()[0].from, tempo()[0].to, D.judge.rows[0].action, D.judge.rows[0].seq, D.judge.rows[0].actual, D.judge.el.children[0].children[7].textContent], [5, 100, 95, 'slower', 4, 95, '95%']);
    D.set('steady', 'MAX_SLOWER_PER_BAR', 2);
    await until(() => tempo().length === 2);
    check('a smaller limit: the barline after it slows by 2', [tempo()[1].seq, tempo()[1].from, tempo()[1].to], [6, 95, 93]);
    C.stop(); await sleep(40);
    for (let i = 0; i < 20; i++) D.judge.add({ pass: 1, seq: i, bar: i + 1, expected: 0, hits: 0, missed: 0, keys: 0, score: 1, desired: null, actual: 100, action: 'none', reason: 'no expected notes' });
    check('the readout keeps the last 16 rows', [D.judge.rows.length, D.judge.rows[0].seq, D.judge.rows[15].seq], [16, 19, 4]);
    D.judge.clear();
    check('Clear empties it', [D.judge.rows.length, D.judge.el.children.length], [0, 0]);

    // ── drums, copy, reset ──
    const k = F['drums.kick'].input;
    k.value = '0.8'; k.fire('input');
    D.set('drums', 'hatOffbeat', 0.33);   // off the slider's grid: put on it
    check('a drum slider writes the gain the kit reads at each hit', [D.values().drums.kick, D.values().drums.hatOffbeat], [0.8, 0.35]);
    D.set('steady', 'COMFORT', 0.9);
    const copied = JSON.parse(await D.copy());
    check('Copy settings: the current values as JSON, grouped by section', [Object.keys(copied), copied.steady.MAX_SLOWER_PER_BAR, copied.steady.COMFORT, copied.steady.HALF_LIFE_NOTES, copied.drums], [['steady', 'drums'], 2, 0.9, 12, { kick: 0.8, snare: 0.6, hat: 0.4, hatOffbeat: 0.35, stick: 0.75 }]);
    D.reset();
    check('Reset to defaults: the values in the code, sliders too, and nothing left in storage', [P.STEADY.MAX_SLOWER_PER_BAR, P.STEADY.COMFORT, P.STEADY.MAX_FASTER_PER_BAR, D.values().drums, s.value, 'songlab_player_dev' in storage], [5, 0.8, 3, { kick: 1.35, snare: 0.6, hat: 0.4, hatOffbeat: 0.7, stick: 0.75 }, '5', false]);
    h.done();
  },

  /** Without ?dev=1: no panel, and dev values left in storage by an earlier dev visit are not applied — the band follows the code's values. */
  async 'dev-off'() {
    const h = await boot({ norm: fixtureNorm({ tempo: 200 }), stored: { songlab_player_dev: DEV_STORED } });
    const { P, C, check, sleep, storage } = h;
    const until = async (f, ms = 15000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const tempo = () => h.events.filter(e => e[0] === 'band:tempo').map(e => e[1]);
    check('no panel: nothing mounted, nothing added to the body or the head', [P.dev, document.body.children.length, document.head.children.length], [null, 0, 0]);
    check('the stored dev values are ignored: STEADY is the code\'s, and the storage is left as it was', [P.STEADY.MAX_SLOWER_PER_BAR, P.STEADY.HALF_LIFE_NOTES, P.STEADY.COMFORT, storage.songlab_player_dev === DEV_STORED], [5, 12, 0.8, true]);
    P.setCountIn(0);
    robot(h, BAD);
    await C.playAlong();
    await until(() => tempo().length === 1);
    check('…so bad bars slow the band by the code\'s 5 points (the stored 0 would not have)', [tempo()[0].seq, tempo()[0].from, tempo()[0].to], [3, 100, 95]);
    C.stop(); await sleep(40);
    h.done();
  },
};

/** The Mode card's and the Listen card's markup (templates/player.html), read as text — the harness has no real DOM: each setting sits under the heading for the way of playing it applies to. No page is booted. */
SCENARIOS['mode-card'] = async () => {
  const results = [];
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(ok);
    console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  };
  const html = readFileSync(new URL('../../templates/player.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const cardOf = name => (html.match(new RegExp(`<section class="pl-card pl-card--${name}"[\\s\\S]*?<\\/section>`)) || [''])[0];
  const CONTROLS = 'tempo|metro|count-in|guide|no-stress|steady|form|lines|rack-auto';
  const ids = text => [...text.matchAll(new RegExp(`<(?:input|div)[^>]*\\bid="(pl-(?:${CONTROLS}))"`, 'g'))].map(m => m[1]);
  const groupsOf = card => card.split('<div class="pl-mode-group"').slice(1).map(g => ({
    heading: (g.match(/<h4[^>]*>([^<]*)<\/h4>/) || [])[1],
    labelled: (g.match(/aria-labelledby="([^"]*)"/) || [])[1] === (g.match(/<h4[^>]*id="([^"]*)"/) || [])[1],
    hint: (g.match(/<p class="pl-hint">([^<]*)<\/p>/) || [])[1] || null,
    controls: ids(g),
    labels: [...g.matchAll(/<label class="pl-check"[^>]*>\s*<input[^>]*>\s*([^<]*)<\/label>/g)].map(m => m[1].trim()),
  }));
  const mode = cardOf('mode'), listen = cardOf('listen');
  const M = groupsOf(mode), Lg = groupsOf(listen);

  // ── the Mode card: Practice and Everywhere ──
  check('the Mode card has two groups, each named by its own sub-heading', M.map(g => [g.heading, g.labelled]), [['Practice', true], ['Everywhere', true]]);
  check('each of its controls sits under the heading for the way of playing it applies to', M.map(g => [g.heading, g.controls]), [['Practice', ['pl-no-stress']], ['Everywhere', ['pl-form', 'pl-lines', 'pl-rack-auto']]]);
  check('…with its label', M.map(g => g.labels), [['No stress'], ['Play repeats', 'Auto-hide controls']]);
  check('a one-line hint under Practice, none under Everywhere', M.map(g => g.hint), ['The page waits for you, note by note.', null]);
  check('"Play repeats" is still the row that hides for a piece with no repeats', /<label class="pl-check" id="pl-form-row" hidden/.test(mode), true);

  // ── the Listen card: what Listen and play-along share, then the "Play along" group ──
  check('the card is titled for both', (listen.match(/<h3[^>]*>([^<]*)<\/h3>/) || [])[1], 'Listen &amp; play along');
  check('the Listen card has one group, "Play along", with its hint', Lg.map(g => [g.heading, g.labelled, g.hint]), [['Play along', true, 'The music keeps going and you play with it.']]);
  check('under it, in order: the guide volume slider, then "Band slows down for me"', [Lg[0] && Lg[0].controls, Lg[0] && Lg[0].labels, (listen.match(/<label for="pl-guide">([^<]*)<\/label>/) || [])[1]], [['pl-guide', 'pl-steady'], ['Band slows down for me'], 'Guide volume']);
  check('Tempo, the Metronome and Count-in are above the heading: they apply to Listen and play-along alike', ids(listen.split('<div class="pl-mode-group"')[0]), ['pl-tempo', 'pl-metro', 'pl-count-in']);
  check('the slider keeps its note for when Listen has it disabled', /<p class="pl-guide__note" id="pl-guide-note" hidden>Listen plays the piece at full volume<\/p>/.test(Lg[0] ? listen.split('<div class="pl-mode-group"')[1] : ''), true);
  check('every control is on the page once', ['pl-tempo', 'pl-metro', 'pl-count-in', 'pl-guide', 'pl-no-stress', 'pl-steady', 'pl-form', 'pl-lines', 'pl-rack-auto', 'pl-form-row', 'pl-guide-box', 'pl-guide-note'].map(id => html.split(`id="${id}"`).length - 1), Array(12).fill(1));
  const passed = results.filter(Boolean).length;
  console.log(`\n─── ${passed}/${results.length} passed ───\n`);
  process.exit(passed === results.length ? 0 : 1);
};

const which = process.argv[2];
if (which) {
  if (!SCENARIOS[which]) { console.error(`Unknown scenario "${which}". One of: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(2); }
  console.log(`\n─── player smoke: ${which} ───\n`);
  await SCENARIOS[which]();
} else {
  const failed = [];
  for (const name of Object.keys(SCENARIOS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: 'inherit' });
    if (r.status !== 0) failed.push(name);
  }
  console.log(failed.length ? `─── player smoke: FAILED in ${failed.join(', ')} ───\n` : `─── player smoke: all ${Object.keys(SCENARIOS).length} scenarios passed ───\n`);
  process.exit(failed.length ? 1 : 0);
}
