/**
 * player-dev.js
 * =============
 * Developer tuning panel for /player. player.js fetches this module only
 * when the URL has ?dev=1; on a normal visit it is never loaded, nothing is
 * drawn and nothing here is read from storage, so the page runs on the
 * values in the code.
 *
 * The panel is a box fixed to the bottom-right corner, over the page (no
 * layout changes). Drag it by its header, collapse it to a small tab with
 * the header's button, double-click the header to send it back to the
 * corner. Sliders write straight into the live objects the page reads
 * (STEADY, DRUM_SPECS, DRUM_MIX), so a change takes effect at once, mid-run
 * included.
 *
 * Adding a section: one entry in SECTIONS.
 *   { id, title, target, fields: [{ key, label, min, max, step }] }
 *     a slider per field, bound to target[key]. A field may carry its own
 *     `target` (and an `id`, when two fields share a key) and a `hint`.
 *     `auto: true` adds a slider for every numeric key of `target` that no
 *     field names, so a constant added to the code shows up untuned.
 *   { id, title, build(body, panel) }
 *     anything else (the Judge readout): fill `body` yourself.
 *
 *   mountDevPanel({ onJudge, onScore }) → panel      (the page hands each a function to call: per barline, per judged note)
 *     panel.set(section, id, value)   as the slider would
 *     panel.values() / panel.json()   { section: { id: value } } — what Copy settings copies
 *     panel.reset()                   back to the code's values; the stored ones are dropped
 *     panel.judge.rows / .clear()     the Judge readout, newest first
 *     panel.judge.score / .meter      the live score meter: S, and its element (aria-valuenow)
 *     panel.fields                    { 'section.id': { input, out, min, max, step, def, … } }
 *     panel.el                        the panel's root element
 *
 * Storage: DEV_KEY holds the values (the same JSON as Copy settings),
 * DEV_UI_KEY the panel's place and whether it is collapsed.
 */
import { STEADY } from './player-steady.js';
import { DRUM_SPECS, DRUM_MIX } from './drums.js';

const DEV_KEY = 'songlab_player_dev';         // the tuned values; applied on load only by this module, so only with ?dev=1
const DEV_UI_KEY = 'songlab_player_dev_ui';   // { collapsed, x, y }
const JUDGE_ROWS = 16;                        // the Judge readout keeps this many barlines

const SECTIONS = [
  {
    id: 'steady', title: 'Band slows down', target: STEADY, auto: true,
    fields: [
      { key: 'HALF_LIFE_NOTES', label: 'Score half-life (notes)', min: 1, max: 48, step: 1 },
      { key: 'COMFORT', label: 'Comfort level (score)', min: 0.05, max: 1, step: 0.05, hint: 'At or above it: your speed' },
      { key: 'BOTTOM', label: 'Bottom level (score)', min: 0, max: 0.95, step: 0.05, hint: 'At or below it: the floor' },
      { key: 'FLOOR', label: 'Floor (share of your speed)', min: 0.25, max: 1, step: 0.05 },
      { key: 'MAX_SLOWER_PER_BAR', label: 'Max points slower per bar', min: 0, max: 20, step: 1 },
      { key: 'MAX_FASTER_PER_BAR', label: 'Max points faster per bar', min: 0, max: 20, step: 1 },
      { key: 'STOP_BARS', label: 'Silent bars before a stop', min: 1, max: 8, step: 1 },
      { key: 'GRACE_BARS', label: 'Grace bars after a start', min: 0, max: 4, step: 1, hint: 'From the next start or resume' },
      { key: 'EASE_BARS', label: 'Ease length (bars)', min: 0, max: 4, step: 0.25 },
      { key: 'EASE_STEPS', label: 'Ease steps', min: 1, max: 20, step: 1 },
      { key: 'PILL_MS', label: 'Pill hold (ms)', min: 500, max: 10000, step: 250 },
    ],
  },
  { id: 'judge', title: 'Judge', build: buildJudge },
  {
    id: 'drums', title: 'Drums',
    fields: [
      { id: 'kick', target: DRUM_SPECS.kick, key: 'gain', label: 'Kick', min: 0, max: 2, step: 0.05 },
      { id: 'snare', target: DRUM_SPECS.snare, key: 'gain', label: 'Snare', min: 0, max: 2, step: 0.05 },
      { id: 'hat', target: DRUM_SPECS.hat, key: 'gain', label: 'Hat on the beat', min: 0, max: 2, step: 0.05 },
      { id: 'hatOffbeat', target: DRUM_MIX, key: 'hatOffbeat', label: 'Hat off the beat (× on the beat)', min: 0, max: 1, step: 0.05 },
      { id: 'stick', target: DRUM_SPECS.stick, key: 'gain', label: 'Stick', min: 0, max: 2, step: 0.05 },
    ],
  },
];

const CSS = /* css */ `
.pl-dev { position: fixed; right: 12px; bottom: 12px; z-index: 300; box-sizing: border-box; width: 340px; max-width: calc(100vw - 16px); max-height: calc(100vh - 24px); display: flex; flex-direction: column; background: #FFFFFF; color: #141210; border: 1px solid #8A857B; border-radius: 10px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22); font: 13px/1.35 system-ui, sans-serif; }
.pl-dev__head { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; background: #2B2824; color: #FFFFFF; border-radius: 9px 9px 0 0; cursor: move; user-select: none; touch-action: none; }
.pl-dev__title { flex: 1; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: 12px; }
.pl-dev button { font: inherit; font-weight: 600; padding: 3px 9px; border-radius: 6px; border: 1px solid #8A857B; background: #FFFFFF; color: #141210; cursor: pointer; }
.pl-dev button:focus-visible, .pl-dev input:focus-visible, .pl-dev summary:focus-visible { outline: 2px solid #2D5F8A; outline-offset: 2px; }
.pl-dev__head button { background: transparent; color: #FFFFFF; border-color: rgba(255, 255, 255, 0.5); }
.pl-dev__body { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px 10px; }
.pl-dev[data-collapsed="true"] { width: auto; }
.pl-dev[data-collapsed="true"] .pl-dev__head { border-radius: 9px; }
.pl-dev[data-collapsed="true"] .pl-dev__body { display: none; }
.pl-dev__bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.pl-dev__note { flex: 1 1 100%; min-height: 1.35em; color: #4E4A43; }
.pl-dev__copy { width: 100%; box-sizing: border-box; height: 7em; font: 12px/1.3 ui-monospace, monospace; }
.pl-dev__copy[hidden] { display: none; }
.pl-dev details { border-top: 1px solid #D8D4CC; padding: 6px 0; }
.pl-dev summary { font-weight: 700; cursor: pointer; }
.pl-dev__row { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; align-items: baseline; margin-top: 7px; }
.pl-dev__row input[type="range"] { grid-column: 1 / -1; width: 100%; margin: 2px 0 0; }
.pl-dev__value { font-variant-numeric: tabular-nums; font-weight: 700; }
.pl-dev__row--changed .pl-dev__value { color: #B9341F; }
.pl-dev__hint { grid-column: 1 / -1; color: #4E4A43; font-size: 12px; }
.pl-dev__judge { width: 100%; border-collapse: collapse; margin-top: 6px; font-variant-numeric: tabular-nums; }
.pl-dev__judge th, .pl-dev__judge td { text-align: right; padding: 2px 4px; border-bottom: 1px solid #ECE9E2; white-space: nowrap; }
.pl-dev__judge tr[data-action="slower"] td:last-child { color: #B9341F; font-weight: 700; }
.pl-dev__judge tr[data-action="faster"] td:last-child { color: #2E7D32; font-weight: 700; }
.pl-dev__judge tr[data-action="stop"] td { color: #B9341F; font-weight: 700; }
.pl-dev__score { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; align-items: center; margin: 7px 0 8px; }
.pl-dev__meter { position: relative; height: 14px; border: 1px solid #8A857B; border-radius: 4px; background: #F4F2EC; overflow: hidden; }
.pl-dev__meter-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; background: #2D5F8A; }
.pl-dev__meter-mark { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #141210; }
.pl-dev__meter-mark--bottom { background: #B9341F; }
.pl-dev__score-key { grid-column: 1 / -1; color: #4E4A43; font-size: 12px; }
`;

const decimals = step => (String(step).split('.')[1] || '').length;
/** A value on the field's grid: inside min…max, on a step. null when it is not a number. */
function snap(field, value) {
  const v = Number(value);
  if (value === '' || value == null || !Number.isFinite(v)) return null;
  const on = field.min + Math.round((Math.min(field.max, Math.max(field.min, v)) - field.min) / field.step) * field.step;
  return Number(Math.min(field.max, on).toFixed(decimals(field.step)));
}
/** A slider for a number nobody described: 0 to four times the code's value, in whole steps when the value is whole. */
function autoField(key, value) {
  const whole = Number.isInteger(value);
  return { key, label: key, min: 0, max: Math.max(whole ? 10 : 1, Math.abs(value) * 4), step: whole ? 1 : 0.05 };
}
function readJSON(key) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : null; } catch (_) { return null; }
}
function writeJSON(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
}
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Section 2. On top, the live score meter: S from 0 to 1 as each note is judged, with the comfort and bottom
 * levels marked (read from STEADY at every draw, so their sliders move the marks). Under it, a row per barline
 * of a play-along — what the judge saw in the bar that ended, S after it, the tempo S asks for and the tempo
 * the band is at after this barline (both as a percentage of the learner's speed). Newest first.
 */
function buildJudge(body, panel) {
  const scoreBox = make('div', 'pl-dev__score');
  const meter = make('div', 'pl-dev__meter');
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Steadiness score');
  meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '1');
  const fill = make('div', 'pl-dev__meter-fill');
  const comfort = make('div', 'pl-dev__meter-mark'), bottom = make('div', 'pl-dev__meter-mark pl-dev__meter-mark--bottom');
  meter.append(fill, comfort, bottom);
  const value = make('span', 'pl-dev__value');
  const legend = make('span', 'pl-dev__score-key');
  scoreBox.append(meter, value, legend);

  const clear = make('button', '', 'Clear');
  clear.type = 'button';
  const table = make('table', 'pl-dev__judge');
  const head = make('tr');
  for (const h of ['seq', 'bar', 'exp', 'hit', 'miss', 'S', 'want', 'now']) head.append(make('th', '', h));
  const rowsEl = make('tbody');
  const thead = make('thead'); thead.append(head);
  table.append(thead, rowsEl);
  body.append(scoreBox, clear, table);

  const pct = v => (v == null ? '–' : `${Math.round(v)}%`);
  const judge = panel.judge = {
    rows: [],   // { pass, seq, bar, expected, hits, missed, keys, score, desired, actual, action, reason }, newest first
    el: rowsEl,
    score: 1,   // S, as the meter shows it
    meter, meterValue: value,
    add(reading) { judge.rows.unshift({ ...reading }); judge.rows.length = Math.min(judge.rows.length, JUDGE_ROWS); draw(); },
    clear() { judge.rows.length = 0; draw(); },
    setScore(s) { if (Number.isFinite(s)) judge.score = Math.min(1, Math.max(0, s)); drawScore(); },
  };
  function drawScore() {
    const text = judge.score.toFixed(2);
    fill.style.width = `${judge.score * 100}%`;
    comfort.style.left = `${STEADY.COMFORT * 100}%`;
    bottom.style.left = `${STEADY.BOTTOM * 100}%`;
    meter.setAttribute('aria-valuenow', text);
    value.textContent = `S ${text}`;
    legend.textContent = `marks: bottom ${STEADY.BOTTOM} · comfort ${STEADY.COMFORT}`;
  }
  function draw() {
    rowsEl.textContent = '';
    for (const r of judge.rows) {
      const tr = make('tr');
      tr.dataset.action = r.action;
      if (r.reason) tr.title = r.reason;   // why this barline left the tempo alone (grace bar, no expected notes, …)
      const seq = r.seq == null ? '–' : r.pass > 1 ? `${r.pass}:${r.seq}` : String(r.seq);   // a loop's later passes say which
      const cells = [seq, r.bar == null ? '–' : r.bar, r.expected, r.hits, r.missed, Number.isFinite(r.score) ? r.score.toFixed(2) : '–', r.action === 'stop' ? 'stop' : pct(r.desired), pct(r.actual)];
      for (const c of cells) tr.append(make('td', '', String(c)));
      rowsEl.append(tr);
    }
    drawScore();   // the marks follow their sliders at the latest by the next barline
  }
  clear.addEventListener('click', () => { judge.clear(); clear.blur(); });
  drawScore();
  if (panel.onJudge) panel.onJudge(judge.add);
  if (panel.onScore) panel.onScore(judge.setScore);
}

function mountDevPanel({ onJudge = null, onScore = null, sections = SECTIONS } = {}) {
  if (document.head && !document.getElementById('pl-dev-styles')) {
    const st = make('style');
    st.id = 'pl-dev-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Every slider, flat. `def` is the code's value: read here, before anything stored is applied.
  const fields = {};
  const bySection = sections.map(s => {
    const list = [...(s.fields || [])];
    if (s.auto && s.target) for (const k of Object.keys(s.target)) if (typeof s.target[k] === 'number' && !list.some(f => f.key === k && !f.target)) list.push(autoField(k, s.target[k]));
    return list.map(f => {
      const target = f.target || s.target, id = f.id || f.key;
      return (fields[`${s.id}.${id}`] = { ...f, id, section: s.id, target, def: target[f.key] });
    });
  });

  const root = make('aside', 'pl-dev');
  root.setAttribute('aria-label', 'Developer tuning panel');
  const head = make('div', 'pl-dev__head');
  const fold = make('button', '', '–');
  fold.type = 'button';
  head.append(make('span', 'pl-dev__title', 'Dev tuning'), fold);
  const body = make('div', 'pl-dev__body');
  const bar = make('div', 'pl-dev__bar');
  const copyBtn = make('button', '', 'Copy settings'), resetBtn = make('button', '', 'Reset to defaults');
  copyBtn.type = resetBtn.type = 'button';
  const note = make('span', 'pl-dev__note');
  note.setAttribute('role', 'status');
  const copyBox = make('textarea', 'pl-dev__copy');
  copyBox.readOnly = true; copyBox.hidden = true;
  copyBox.setAttribute('aria-label', 'Settings as JSON');
  bar.append(copyBtn, resetBtn, note, copyBox);
  body.append(bar);
  root.append(head, body);

  const values = () => Object.fromEntries(sections.map((s, i) => [s.id, Object.fromEntries(bySection[i].map(f => [f.id, f.target[f.key]]))]).filter(([, v]) => Object.keys(v).length));
  const panel = { el: root, fields, onJudge, onScore, judge: null, set, values, json, reset, copy };
  function json() { return JSON.stringify(values(), null, 2); }
  const save = () => writeJSON(DEV_KEY, values());
  const say = text => { note.textContent = text; };

  /** The live value, the slider and the readout together. */
  function write(field, value) {
    const v = snap(field, value);
    if (v == null) return false;
    field.target[field.key] = v;
    if (panel.judge && field.target === STEADY) panel.judge.setScore();   // the meter's marks follow the comfort and bottom levels
    if (field.input) field.input.value = String(v);
    if (field.out) field.out.textContent = v.toFixed(decimals(field.step));
    if (field.row) field.row.classList.toggle('pl-dev__row--changed', v !== field.def);
    return true;
  }
  function set(section, id, value) {
    const field = fields[`${section}.${id}`];
    if (!field || !write(field, value)) return false;
    save();
    return true;
  }
  function reset() {
    for (const f of Object.values(fields)) { f.target[f.key] = f.def; if (f.input) f.input.value = String(f.def); if (f.out) f.out.textContent = Number(f.def).toFixed(decimals(f.step)); if (f.row) f.row.classList.toggle('pl-dev__row--changed', false); }   // exactly the code's value, on the slider's grid or not
    if (panel.judge) panel.judge.setScore();   // the meter's marks too
    writeJSON(DEV_KEY, null);
    copyBox.hidden = true;
    say('Back to the values in the code.');
  }
  /** The values as JSON on the clipboard; where the clipboard is not to be had (not a secure context), in a box to copy from. */
  function copy() {
    const text = json();
    const shown = () => { copyBox.value = text; copyBox.hidden = false; if (copyBox.select) copyBox.select(); say('Clipboard unavailable: copy from the box.'); };
    const clip = typeof navigator !== 'undefined' && navigator.clipboard;
    if (!clip || typeof clip.writeText !== 'function') { shown(); return Promise.resolve(text); }
    return clip.writeText(text).then(() => { copyBox.hidden = true; say('Copied.'); return text; }, () => { shown(); return text; });
  }

  // The sections, in registry order.
  sections.forEach((s, i) => {
    const box = make('details');
    box.open = true;
    box.append(make('summary', '', s.title));
    for (const f of bySection[i]) {
      const row = make('label', 'pl-dev__row');
      const input = make('input');
      input.type = 'range'; input.min = String(f.min); input.max = String(f.max); input.step = String(f.step);
      const out = make('span', 'pl-dev__value');
      row.append(make('span', '', f.label), out, input);
      if (f.hint) row.append(make('span', 'pl-dev__hint', f.hint));
      Object.assign(f, { row, input, out });
      input.value = String(f.def); out.textContent = Number(f.def).toFixed(decimals(f.step));
      input.addEventListener('input', () => { if (write(f, input.value)) save(); });
      input.addEventListener('change', () => input.blur());   // the page's keys (Space, P, arrows) work again once the slider is let go
      box.append(row);
    }
    if (typeof s.build === 'function') s.build(box, panel);
    body.append(box);
  });

  // Stored values: only numbers, only for sliders that exist, each put on its slider's grid.
  const stored = readJSON(DEV_KEY);
  if (stored) for (const f of Object.values(fields)) { const v = stored[f.section] && stored[f.section][f.id]; if (typeof v === 'number') write(f, v); }

  copyBtn.addEventListener('click', () => { copy(); copyBtn.blur(); });
  resetBtn.addEventListener('click', () => { reset(); resetBtn.blur(); });

  // Collapse to a tab; drag by the header; double-click the header: back to the corner.
  const ui = { collapsed: false, x: null, y: null, ...(readJSON(DEV_UI_KEY) || {}) };
  const saveUi = () => writeJSON(DEV_UI_KEY, ui);
  function setCollapsed(on) {
    ui.collapsed = !!on;
    root.dataset.collapsed = String(ui.collapsed);
    fold.textContent = ui.collapsed ? 'Dev ▸' : '–';
    fold.setAttribute('aria-expanded', String(!ui.collapsed));
    fold.setAttribute('aria-label', ui.collapsed ? 'Open the dev panel' : 'Collapse the dev panel');
  }
  function place(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { ui.x = ui.y = null; Object.assign(root.style, { left: '', top: '', right: '', bottom: '' }); return; }
    const r = root.getBoundingClientRect();
    ui.x = Math.max(0, Math.min(x, (window.innerWidth || 0) - r.width));
    ui.y = Math.max(0, Math.min(y, (window.innerHeight || 0) - r.height));
    Object.assign(root.style, { left: `${ui.x}px`, top: `${ui.y}px`, right: 'auto', bottom: 'auto' });
  }
  const onButton = e => !!(e.target && typeof e.target.closest === 'function' && e.target.closest('button'));
  fold.addEventListener('click', () => { setCollapsed(!ui.collapsed); if (ui.x != null) place(ui.x, ui.y); saveUi(); fold.blur(); });
  head.addEventListener('pointerdown', e => {
    if (onButton(e)) return;
    const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = ev => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); saveUi(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    if (e.preventDefault) e.preventDefault();   // no text selection while it moves
  });
  head.addEventListener('dblclick', e => { if (onButton(e)) return; place(null, null); saveUi(); });

  document.body.appendChild(root);
  setCollapsed(ui.collapsed);
  if (ui.x != null) place(ui.x, ui.y);
  return panel;
}

export { mountDevPanel, SECTIONS, DEV_KEY, DEV_UI_KEY, JUDGE_ROWS };
