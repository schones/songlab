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
 *   node tests/player/smoke.mjs pause      one scenario: form | form-none | band | band-none | pause | first-downbeat | shortcuts | notes | notes-legacy | feel-none | feel-bars | two-lines | drums-fallback | drums | steady | steady-stop
 *
 * Add a scenario: a function in SCENARIOS that boots the harness, checks,
 * and ends with h.done().
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
    await C.listen();
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

    // ── play-along: missed greying is dropped on re-entry; pause in the second time through bar 3, resume there ──
    bars.length = 0;
    const stale = () => [...L.missed].filter(n => (n.bar === 3 || n.bar === 4) && n.seq < 8).length;
    const off = P.clock.onDue('bar', p => { if (p.seq === 5) snaps.before = stale(); if (p.seq === 8) { snaps.after = stale(); snaps.others = L.missed.size; } });
    await C.playAlong();
    check('play-along: the same run', el('pl-status').textContent, 'Playing along · whole song · 18 bars');
    await until(() => L.seq === 8);
    const at = [L.bar, L.seq];
    C.pause(); off();
    check('nothing was played, so bars 3–4 were grey after the first time through; entering bar 3 again clears that line, and only that line', [snaps.before > 0, snaps.after, snaps.others > 0], [true, 0, true]);
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
    C.stop(); await sleep(40);

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

  /** "Band slows down for me", the drops: one missed note and one bad bar do nothing; two bad bars drop a notch, eased; the slider and the saved tempo move and stay; four bars between drops; a loop; the floor. */
  async steady() {
    const h = await boot({ norm: fixtureNorm({ tempo: 200 }), pieces: { 'smoke-fast': fixtureNorm({ piece: 'smoke-fast', title: 'Smoke fast', tempo: 360 }) } });
    const { P, C, L, el, check, sleep, storage } = h;
    const until = async (f, ms = 15000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(5); return f(); };
    const of = type => h.events.filter(e => e[0] === type).map(e => e[1]);
    const slowed = () => of('band:slowed');
    const brief = d => [d.fromPct, d.toPct, Math.round(d.from), Math.round(d.to), d.seq, d.bar, d.pass];
    P.setCountIn(0); P.STEADY.MESSAGE_MS = 500;   // 200 bpm, 3/4: a bar is 0.9 s
    check('"Band slows down for me" is on by default, with every threshold in one place', [P.steadyOn, el('pl-steady').checked, [P.STEADY.JUDGE_BARS, P.STEADY.STRUGGLE_MISSED, P.STEADY.STOP_BARS, P.STEADY.GRACE_BARS, P.STEADY.DROP_PCT, P.STEADY.FLOOR_PCT, P.STEADY.MIN_BARS_BETWEEN_DROPS, P.STEADY.EASE_BARS]], [true, true, [2, 0.5, 2, 1, 10, 50, 4, 1]]);

    // ── a whole run: bar 2 one missed note, bar 4 a bad bar on its own, bars 6–11 bad, then clean ──
    const kinds = { 2: ONE_MISS, 4: BAD, 6: BAD, 7: BAD, 8: BAD, 9: BAD, 10: BAD, 11: BAD };
    robot(h, d => (kinds[d.bar] || CLEAN)(d));
    const beats = [];
    P.clock.onDue('beat', p => { if (L.active) beats.push([p.bar, P.clock.tempo, P.tempo]); });
    await C.playAlong();
    await until(() => L.seq === 5);
    const p1 = C.getCurrentPass();
    check('one missed note (bar 2) and one bad bar (bar 4, with clean bars either side) do nothing: 100 %, still playing', [P.tempo, P.clock.tempo, slowed().length, L.active, p1.expected.filter(e => e.status === 'missed').map(e => e.bar).filter((b, i, a) => a.indexOf(b) === i), p1.steady], [100, 200, 0, true, [2, 4], []]);
    await until(() => slowed().length === 1);
    check('two bad bars (6 and 7): one notch down at the barline into bar 8, said calmly on the status line', [brief(slowed()[0]), el('pl-status').textContent, L.active], [[100, 90, 200, 180, 7, 8, 1], 'slowed to 90% to keep it steady', true]);
    await until(() => L.seq === 8);
    const eased = beats.filter(b => b[0] === 8).map(b => b[1]);
    check('eased in over bar 8 on the clock\'s live tempo: part-way during the bar, 180 bpm by the next barline', [eased.some(t => t < 200 && t > 180), eased.every((t, i) => i === 0 || t <= eased[i - 1]), P.clock.tempo], [true, true, 180]);
    check('the tempo slider, its readout and the saved value moved with it', [P.tempo, el('pl-tempo').value, el('pl-tempo-readout').textContent, storage.songlab_player_tempo_pct], [90, '90', '90% · 180 bpm', '90']);
    check('…and the status line is the usual one again, with the new percentage', el('pl-status').textContent, 'Playing along · bars 1–16 · 90%');
    await until(() => L.seq === 10);
    check('bars 8–10 are bad too: no second drop within four bars', [slowed().length, P.tempo], [1, 90]);
    await until(() => slowed().length === 2);
    check('the next drop comes four bars after the first (the barline into bar 12)', slowed().map(brief), [[100, 90, 200, 180, 7, 8, 1], [90, 80, 180, 160, 11, 12, 1]]);
    await until(() => L.seq === 13);
    check('clean bars after it: nothing raises the tempo — it never went up at any beat of the run', [P.tempo, P.clock.tempo, beats.every((b, i) => i === 0 || b[1] <= beats[i - 1][1]), slowed().length], [80, 160, true, 2]);
    C.stop(); await sleep(40);
    const lp = C.getLastPass();
    check('each drop is in the pass\'s timing log', lp.steady.map(e => [e.type, e.fromPct, e.toPct, e.seq, e.bar, typeof e.audioTime]), [['slowed', 100, 90, 7, 8, 'number'], ['slowed', 90, 80, 11, 12, 'number']]);
    check('after the run the slower tempo stays: slider, saved value', [P.tempo, el('pl-tempo').value, storage.songlab_player_tempo_pct], [80, '80', '80']);
    h.events.length = 0;
    await C.playAlong(); await sleep(60);
    check('…and the next run starts there (a fresh run\'s status line is the plain one)', [of('playalong:start')[0].tempoPct, of('playalong:start')[0].bpm, el('pl-status').textContent], [80, 160, 'Playing along · bars 1–16']);
    C.stop(); await sleep(40);
    P.tempo = 100;
    check('the learner raises it: the slider is theirs', [P.tempo, storage.songlab_player_tempo_pct], [100, '100']);

    // ── a loop, near the floor: 55 % → 50 %, then never lower ──
    await P.load('smoke-fast'); await sleep(100);   // 360 bpm: at 55 % a bar is 0.91 s
    P.tempo = 55; P.setLoop(2, 3); await sleep(40);
    h.events.length = 0; beats.length = 0;
    for (const b of [2, 3]) kinds[b] = BAD;   // the same robot plays this piece: every bar of the loop is bad
    await C.playAlong();
    await until(() => slowed().length === 1);
    check('in a loop: bar 3 of pass 1 and bar 2 of pass 2 are bad — the drop is at the next barline, to the floor (55 → 50)', [brief(slowed()[0]), el('pl-status').textContent], [[55, 50, 198, 180, 2, 3, 2], 'slowed to 50% to keep it steady']);
    const at = beats.length;
    await until(() => beats.length - at >= 6 * 3 + 3);   // six more bars, all bad
    check('at the floor nothing lower: six more bad bars, no second drop, no event, and the loop plays on at 50 %', [slowed().length, P.tempo, P.clock.tempo, el('pl-tempo').value, storage.songlab_player_tempo_pct, L.active, el('pl-status').textContent], [1, 50, 180, '50', '50', true, 'Playing along · bars 2–3 · looping · 50%']);
    C.stop(); await sleep(40);
    check('the drop is on the loop pass it happened in', C.getPasses().filter(p => p.loop && p.steady && p.steady.length).map(p => [p.pass, p.loop, p.steady.map(e => [e.type, e.toPct])]), [[2, true, [['slowed', 50]]]]);
    h.done();
  },

  /** "Band slows down for me", the stop: two silent bars pause the band at the barline, inside a repeat, and P carries on from there; rest bars count for neither; the box unticked is play-along as it was. */
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
    check('one silent bar (seq 5) does nothing: still playing, no drop, no stop', [L.active, of('band:stopped').length, of('band:slowed').length], [true, 0, 0]);
    await until(() => !L.active);
    await sleep(60);
    const stop = of('band:stopped')[0];
    check('two silent bars in a row: band:stopped at the barline into bar 6, the second time through (seq 11)', [of('band:stopped').length, stop.bar, stop.seq, stop.pass], [1, 6, 11, 1]);
    check('paused there as Space would, keeping the seq; the status says how to carry on', [C.paused && [C.paused.mode, C.paused.bar, C.paused.seq], P.clock.running, el('pl-playalong').textContent, P.staff.marker, el('pl-status').textContent], [['playalong', 6, 11], false, '▶ Resume', 6, 'paused: play along stopped. P to carry on']);
    check('the clock never reached that barline\'s bar; the tempo was not dropped for the silent bars', [bars[bars.length - 1], P.tempo, of('band:slowed').length, storage.songlab_player_tempo_pct ?? null], [[5, 10], 100, 0, null]);
    const last = h.sounds.filter(s => s[0] === 'on').map(s => s[2]), clicks = h.sounds.filter(s => s[0] === 'click').map(s => s[1]);
    check('nothing of the bar after the barline was sounded or clicked, and the band played right up to it', [last.filter(t => t >= stop.audioTime - 0.001).length, clicks.filter(t => t >= stop.audioTime - 0.001).length, last.some(t => t > stop.audioTime - 0.75), clicks.some(t => t > stop.audioTime - 0.3)], [0, 0, true, true]);
    const lp = C.getPasses().slice(-1)[0];
    check('the auto-pause is in the pass\'s timing log; the pass ends at the barline, with nothing expected beyond it', [lp.steady.map(e => [e.type, e.seq, e.bar]), lp.complete, lp.endedAt === stop.audioTime, lp.expected.some(e => e.seq >= 11), lp.expected.filter(e => e.seq >= 9).every(e => e.status === 'missed')], [[['stopped', 11, 6]], false, true, false, true]);
    check('playalong:stop says paused at that bar and seq', (d => [d.paused, d.bar, d.seq, d.complete])(of('playalong:stop').slice(-1)[0]), [true, 6, 11, false]);

    // ── P carries on from that barline; the first bar after a resume is not judged ──
    h.events.length = 0; bars.length = 0;
    R.plays = SILENT;
    key('p');
    await until(() => bars.length >= 2);
    check('P resumes at bar 6 the second time through (seq 11), then bar 7', [bars.slice(0, 2), (d => [d.resumed, d.startBar, d.startSeq])(of('playalong:start')[0])], [[[6, 11], [7, 12]], [true, 6, 11]]);
    await until(() => !L.active);
    await sleep(60);
    check('still silent: the resumed bar is not judged, so the band plays three bars before it stops again (the barline into seq 14)', [bars, of('band:stopped').map(d => [d.bar, d.seq]), C.paused && C.paused.seq], [[[6, 11], [7, 12], [8, 13]], [[3, 14]], 14]);
    C.stop(); await sleep(40);

    // ── rest bars count for neither: bad, rest, bad is a drop; silent, rest, silent is a stop; rests alone are nothing ──
    await P.load('smoke-rests'); await sleep(100);
    h.events.length = 0; bars.length = 0;
    const kinds = { 2: BAD, 4: BAD, 8: SILENT, 10: SILENT };
    R.plays = d => (kinds[d.bar] || CLEAN)(d);
    await C.playAlong();
    await until(() => of('band:slowed').length === 1);
    check('bad bar 2, rest bar 3, bad bar 4: the rest is skipped — a drop at the barline into bar 5', of('band:slowed').map(d => [d.fromPct, d.toPct, d.seq, d.bar]), [[100, 90, 4, 5]]);
    await until(() => L.seq === 7);
    check('three bars of rests (5–7) with nothing played: no stop, no second drop', [L.active, of('band:stopped').length, of('band:slowed').length], [true, 0, 1]);
    await until(() => !L.active);
    await sleep(60);
    check('silent bar 8, rest bar 9, silent bar 10: two silent bars in a row — stopped at the barline into bar 11, the tempo as it was', [of('band:stopped').map(d => [d.bar, d.seq]), C.paused && C.paused.bar, of('band:slowed').length, P.tempo], [[[11, 10]], 11, 1, 90]);
    check('the drop and the stop are both on that pass', C.getPasses().slice(-1)[0].steady.map(e => e.type), ['slowed', 'stopped']);
    C.stop(); await sleep(40);

    // ── the box unticked: play-along as it was ──
    el('pl-steady').checked = false; el('pl-steady').fire('change');
    check('unticking is remembered', [P.steadyOn, storage.songlab_player_band_follow], [false, '0']);
    P.tempo = 100;
    h.events.length = 0; bars.length = 0;
    const off = { 1: BAD, 2: BAD, 4: BAD };
    R.plays = d => (off[d.bar] || SILENT)(d);   // bad bars, then silence (bar 3 is a rest): a drop and a stop if it were on
    await C.playAlong();
    await until(() => bars.length >= 13);
    check('off: bad bars, then nine bars of silence — it plays on at 100 %, no event, no message, nothing on the pass', [L.active, P.tempo, P.clock.tempo, h.events.filter(e => e[0].startsWith('band:')).length, el('pl-status').textContent, 'steady' in C.getCurrentPass(), bars[bars.length - 1]], [true, 100, 240, 0, 'Playing along · bars 1–16', false, [13, 12]]);
    key(' ');
    check('…and Space pauses with its own status line, as ever', [C.paused && C.paused.bar, /^Paused · play-along · bar 13/.test(el('pl-status').textContent)], [13, true]);
    C.stop(); await sleep(40);
    el('pl-steady').checked = true; el('pl-steady').fire('change');
    check('ticked again: on, remembered', [P.steadyOn, storage.songlab_player_band_follow], [true, '1']);
    h.done();
  },
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
