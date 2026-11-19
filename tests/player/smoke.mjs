/**
 * Player smoke: the real static/player/player.js under Node, with a stubbed
 * DOM and a fake audio clock on real time (harness.mjs). It covers what the
 * pure modules' self-tests cannot: the page's own wiring — keys and buttons,
 * the transport's call order, the timing log and the bus as player.js
 * drives them. No browser, no server, no MIDI, no private piece (the
 * fixture is built in harness.mjs). It is not a substitute for the Chrome /
 * RD-2000 check: nothing is drawn and nothing sounds.
 *
 *   node tests/player/smoke.mjs            every scenario, each in its own process (≈ 25 s: the clock is real time)
 *   node tests/player/smoke.mjs pause      one scenario: form | form-none | pause | first-downbeat | shortcuts | notes | notes-legacy | feel-none | feel-bars | two-lines
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
    check('Form "as written" stops a transport under way and is remembered', [P.setForm('written'), L.active, storage.songlab_player_form], ['written', false, 'written']);
    bars.length = 0;
    await C.listen();
    await until(() => bars.length >= 9);
    check('…and Listen is today\'s: bars 1–16 straight through (bar 9 after bar 8)', [el('pl-status').textContent, started('listen:start').form, bars.slice(7, 9).map(b => b[0])], ['Listening · bars 1–16', false, [8, 9]]);
    C.stop(); await sleep(40);
    check('wait-for-me practice is untouched by all this: 16 written bars of steps', [P.steps.length, P.steps[P.steps.length - 1].bar, P.setForm('repeats')], [16 * 4, 16, 'repeats']);
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
