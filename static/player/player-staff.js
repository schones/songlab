/**
 * player-staff.js
 * ===============
 * Grand staff for the follow-along player: one or two lines (bar ranges) of
 * a norm document, each engraved with Verovio as its own SVG, in the page's
 * light frame. The MEI comes from player-staff-model.js; the toolkit is the
 * shared lazy singleton from voicing-staff.js (its options are re-applied
 * here before every engraving, so the two pages can share one WASM instance).
 *
 * Usage:
 *   const staff = new PlayerStaff('pl-staff');
 *   staff.prepare(norm, ranges);                 // a piece: engrave every line once (cached) and size the slots; show() waits for it
 *   await staff.show({ from: 1, to: 4 }, { from: 5, to: 8 });                // top slot = the current line, bottom = a passive preview
 *   await staff.show({ from: 9, to: 12 }, { from: 13, to: 16 }, { active: 1 });   // the bottom slot is the active one (the last line of a piece)
 *   await staff.show({ from: 5, to: 8 });        // one slot
 *   await staff.show(top, bottom, { animate: false });   // never the upward shift (a hard cut)
 *   staff.setNoteState('pl-b1-1-0', 'expected'); // 'expected' | 'correct' | 'wrong' | 'playing' | null — the active slot only
 *   staff.clearStates();
 *   staff.setDimmed(ids);                        // the other hand, drawn faint (pl-note--dim); [] clears — the active slot only
 *   staff.setBarMarker(6);                       // faint tint behind bar 6's measure, when it is in the active slot; null clears
 *   staff.setBarTint('loop', [6, 7]);            // 'loop' | 'pending' | 'trouble' tint behind those bars ([] clears), in both slots; kept across shows
 *   staff.setAnchors([1, 5, 9]);                 // anchor downbeats (norm.anchors): a small gold tick above beat 1 of those bars; 'downbeats': every
 *                                                //   barline tinted gold instead (no per-bar marks); null clears. Both slots; kept across shows. Display only.
 *   staff.onBarTap = bar => …;                   // a click / tap on a drawn measure of either slot (null to ignore); cursor: pointer while set
 *   staff.barAt(clientX, clientY)                // the bar under a point (g.measure#pl-m<bar>, else bounding rects) in either slot, or null
 *   staff.hits                                   // the ACTIVE slot's { id → { midi, bar, staff, hand, onset, at, tieStop } }
 *   staff.noteIds({ bar, hand })                 // the active slot's ids in drawing order, optionally filtered
 *   staff.range                                  // { from, to } of the ACTIVE slot's bars, or null
 *   staff.ranges                                 // every slot's { from, to }, top first
 *   staff.active                                 // 0 (top) | 1 (bottom)
 *
 * Slots. The staff holds up to two slots, top and bottom, one line each.
 * One of them is ACTIVE — the line being played; hits, range, note states,
 * dimming and the bar marker all belong to it and to it alone. The other is
 * a passive preview: drawn slightly dimmed, it carries the loop / pending /
 * trouble tints and the anchors and answers bar taps, but never a note
 * state or the marker. Usually the top slot is active and the bottom shows
 * the line played next; at the end of a piece the page keeps the last two
 * lines up and the bottom slot is the active one.
 *
 * States are classes on g.note (pl-note--expected / --correct / --wrong /
 * --playing); the CSS colours them blue / green / red / purple (playing: a note
 * sounding under Listen), as the keyboard does. pl-note--dim
 * is independent of the state (an unselected hand stays dim whatever happens).
 *
 * Uniform lines, as in printed music. Every line is engraved as ONE system
 * justified to the same fixed page width (Verovio `breaks: 'encoded'` over
 * the <sb/> toMEI puts at the head of the section, a fixed `pageWidth`,
 * `minLastJustification: 0`), so the staff is the same size on every line
 * and a denser line gets tighter horizontal spacing instead of a smaller
 * staff. Each SVG is then given the same viewBox — the union of every
 * line's extent above and below the top staff line (prepare() engraves the
 * whole piece to find it) — so every slot is the same height, the top staff
 * line sits at the same place in each, and nothing moves when lines change.
 * A line so dense that its spacing would drop under MIN_SPACING of its
 * natural width is the one exception: it is engraved on a wider page (so at
 * a smaller staff size, that line only) at exactly MIN_SPACING, with a
 * warning naming the bars — the fix is an earlier line break in norm.lines.
 *
 * Line change. show() re-uses a slot already holding a wanted line. When
 * the new top line is the one in the bottom slot (the usual forward move,
 * and a loop wrapping to a first line already previewed there), nothing is
 * engraved or parsed: the track shifts up by one slot (SHIFT_MS) and the
 * new bottom line is put in afterwards (FILL_DELAY_MS after the shift
 * ends), off the moment of the turn. With one slot a forward move shifts
 * the same way, the new line coming up from below. Everything else — a
 * move back, a jump, `animate: false`, prefers-reduced-motion — is a hard
 * cut of both slots. The new slots are live at once: states, the marker and
 * hit lookups go to them while the shift is still running.
 *
 * No MIDI, no sound, no clicks here: the page wires those.
 */

import { loadToolkit } from '../shared/voicing-staff.js';
import { toMEI } from './player-staff-model.js';

/**
 * The page width every line is justified to (Verovio units; the SVG is this
 * × 10 wide in its own units). It sets the staff size: the SVG fills the
 * column, so a staff space is column width × 180 / (PAGE_WIDTH × 10) px.
 * Smaller → a bigger staff, tighter spacing, taller slots. Tune here.
 */
const PAGE_WIDTH = 2100;
/** Applied before every engraving (the toolkit is shared with /voicings, which sets its own). */
const PLAYER_OPTIONS = {
  breaks: 'encoded', minLastJustification: 0,   // one system (the <sb/> from toMEI), always justified to the page width
  scale: 40, adjustPageHeight: true, pageWidth: PAGE_WIDTH,
  header: 'none', footer: 'none',
  pageMarginTop: 30, pageMarginBottom: 30, pageMarginLeft: 40, pageMarginRight: 40,
  svgViewBox: true, svgHtml5: false, spacingStaff: 10, justifyVertically: false,
};
const MIN_SPACING = 0.65;             // a line is never squeezed under this fraction of its natural (unjustified) width; past it the line gets a wider page instead (Verovio itself warns under 0.8; under ~0.6 notes start to touch)

const SHIFT_MS = 150;                 // the one-line upward shift on a forward line change
const SHIFT_FALLBACK_MS = 280;        // the shift is ended by hand when transitionend never fires
const FILL_DELAY_MS = 60;             // after the shift ends, before the new preview line is put in
const YIELD_MS = 40;                  // prepare(): engrave for this long, then let the page breathe
const MARKER_PAD = 0.12;              // marker / tint rects extend above / below the line's extent by this fraction of its height
const ANCHOR_TITLE = 'Anchor: land this downbeat';
const ANCHOR_TICK = 0.06;             // anchor tick length, as a fraction of the line's (padded) extent: it sits in the padding above the highest content
const SVG_NS = 'http://www.w3.org/2000/svg';

const CSS = /* css */ `
.pl-staff-wrap { position: relative; width: 100%; min-height: 200px; --pl-bar-marker: rgba(45, 95, 138, 0.10); --pl-bar-loop: rgba(214, 150, 20, 0.16); --pl-bar-pending: rgba(214, 150, 20, 0.08); --pl-bar-pending-stroke: rgba(176, 120, 10, 0.7); --pl-bar-trouble: rgba(185, 52, 31, 0.11); --pl-anchor: #B07A0A; }
[data-theme="dark"] .pl-staff-wrap { --pl-bar-marker: rgba(58, 139, 201, 0.22); --pl-bar-loop: rgba(240, 180, 50, 0.22); --pl-bar-pending: rgba(240, 180, 50, 0.10); --pl-bar-pending-stroke: rgba(240, 180, 50, 0.8); --pl-bar-trouble: rgba(230, 90, 60, 0.20); }
.pl-staff-wrap[data-tappable="1"] g.measure { cursor: pointer; }
/* The host is a fixed window of one or two slots (its aspect-ratio is set by script from the piece); it clips the track, which is one slot taller while a shift runs. */
.pl-staff-svg { position: relative; width: 100%; overflow: hidden; }
.pl-staff-track { width: 100%; }
/* A slot: one line. Every slot of a piece has the same aspect-ratio (set by script), so an empty one keeps its place. */
.pl-staff-slot { position: relative; width: 100%; opacity: 1; transition: opacity ${SHIFT_MS}ms linear; }
.pl-staff-slot--passive { opacity: 0.55; }
/* The slot's own SVG only (not Verovio's nested definition-scale svg, whose size is set by attribute): it fills the slot's width; height follows the shared viewBox. */
.pl-staff-slot > svg { display: block; width: 100%; height: auto; color: var(--text-primary, #141210); fill: currentColor; }
.pl-staff-svg g.note { transition: color 80ms linear; }
.pl-staff-svg g.note.pl-note--expected { color: var(--accent-blue, #2D5F8A); fill: var(--accent-blue, #2D5F8A); }
.pl-staff-svg g.note.pl-note--correct  { color: var(--accent-green, #1E7B34); fill: var(--accent-green, #1E7B34); }
.pl-staff-svg g.note.pl-note--wrong    { color: var(--accent-coral, #B9341F); fill: var(--accent-coral, #B9341F); }
.pl-staff-svg g.note.pl-note--playing  { color: var(--pl-playing, #6B4FBB); fill: var(--pl-playing, #6B4FBB); }
.pl-staff-svg g.note.pl-note--dim      { opacity: 0.35; }
.pl-staff-svg rect.pl-bar-marker       { fill: var(--pl-bar-marker); stroke: none; }
.pl-staff-svg rect.pl-bar-loop         { fill: var(--pl-bar-loop); stroke: none; }
.pl-staff-svg rect.pl-bar-pending      { fill: var(--pl-bar-pending); stroke: var(--pl-bar-pending-stroke); stroke-width: 6; stroke-dasharray: 24 14; }
.pl-staff-svg rect.pl-bar-trouble      { fill: var(--pl-bar-trouble); stroke: none; }
/* Anchors (norm.anchors). A bar list: a small gold tick above each anchor bar's downbeat. 'downbeats': the barlines carry a very subtle gold tint instead. */
.pl-staff-svg line.pl-anchor-tick { stroke: var(--pl-anchor); stroke-width: 16; stroke-linecap: round; pointer-events: stroke; }
.pl-staff-wrap[data-anchors="downbeats"] .pl-staff-svg g.barLine path { stroke: color-mix(in srgb, var(--pl-anchor) 45%, currentColor); }
.pl-staff-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; color: var(--text-muted, #4E4A43); pointer-events: none; }
.pl-staff-wrap[data-state="ready"] .pl-staff-status { display: none; }
.pl-staff-wrap[data-state="loading"] .pl-staff-svg, .pl-staff-wrap[data-state="error"] .pl-staff-svg { opacity: 0.3; }
.pl-staff-wrap[data-state="error"] .pl-staff-status { color: var(--accent-coral, #B9341F); }
@media (prefers-reduced-motion: reduce) { .pl-staff-slot { transition: none; } }
`;

const STATES = ['expected', 'correct', 'wrong', 'playing'];   // 'playing': sounding under Listen (purple)
const TINTS = ['loop', 'pending', 'trouble'];   // rect.pl-bar-<tint>, painted under the bar marker ('trouble': suggested bars after a pass)
const CSS_escape = s => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));
const keyOf = r => `${r.from}-${r.to}`;
const barsLabel = r => (r.from === r.to ? `bar ${r.from}` : `bars ${r.from}–${r.to}`);
/** Bar number from a g.measure: its id pl-m<bar> (toMEI), else its data-n / n attribute when Verovio keeps one. */
function barOfMeasure(m) {
  const id = m.getAttribute('id') || '';
  const mm = /^pl-m(\d+)$/.exec(id);
  if (mm) return Number(mm[1]);
  const n = m.getAttribute('data-n') || m.getAttribute('n');
  return n && /^\d+$/.test(n) ? Number(n) : null;
}
const reducedMotion = () => !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ════════════════════════════════════════════════════════════════════
// UNIFORM LINES (pure: strings and numbers, no DOM)
// ════════════════════════════════════════════════════════════════════

/**
 * What the slot sizing needs from one of Verovio's SVGs, in the units of
 * its nested svg.definition-scale: { width, height } of that viewBox and
 * `top`, the y of the first staff line of the first staff (the page margin
 * included) — the line every slot is aligned on. null when the SVG is not
 * the shape Verovio writes.
 */
function svgMetrics(svg) {
  const inner = /class="definition-scale"[^>]*\sviewBox="\s*0[ ,]+0[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"/.exec(svg);
  if (!inner) return null;
  const margin = /class="page-margin"[^>]*\stransform="translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)"/.exec(svg);
  const line = /class="staff"[^>]*>\s*<path[^>]*\sd="M\s*[-\d.]+[ ,]+([-\d.]+)/.exec(svg);
  const my = margin ? Number(margin[2]) : 0;
  return { width: Number(inner[1]), height: Number(inner[2]), top: my + (line ? Number(line[1]) : 0) };
}

/**
 * The page width for a line whose natural (unjustified) width is
 * `natural`, both in pageWidth units: PAGE_WIDTH unless justifying to it
 * would squeeze the spacing under MIN_SPACING — then the width at which the
 * spacing is exactly MIN_SPACING (so that line is drawn at a smaller staff).
 */
function pageWidthFor(natural, { page = PAGE_WIDTH, min = MIN_SPACING } = {}) {
  return natural * min > page ? Math.ceil(natural * min) : page;
}

/**
 * The shared box of a set of engraved lines, in standard units (those of a
 * line on the standard page; a line on a wider page is `s` × larger in its
 * own units): `above` / `below` the top staff line — the largest of each —
 * and the standard `width`. null for no lines.
 */
function uniformBox(entries) {
  let box = null;
  for (const e of entries) {
    if (!e || e.error) continue;
    const above = e.top / e.s, below = (e.height - e.top) / e.s;
    box = box ? { width: box.width, above: Math.max(box.above, above), below: Math.max(box.below, below) } : { width: e.width / e.s, above, below };
  }
  return box;
}

/** The viewBox that shows line `e` in the shared `box`, in e's own units: the box scaled by e.s, its top staff line at `above`. */
function slotViewBox(e, box) {
  const r = n => Math.round(n * 100) / 100;
  return `0 ${r(e.top - box.above * e.s)} ${r(e.width)} ${r((box.above + box.below) * e.s)}`;
}

// ════════════════════════════════════════════════════════════════════
// THE STAFF
// ════════════════════════════════════════════════════════════════════

class PlayerStaff {
  /** @param {string|Element} host  the element to fill (its placeholder content is replaced) */
  constructor(host) {
    this._host = typeof host === 'string' ? document.getElementById(host) : host;
    if (!this._host) throw new Error('PlayerStaff: host not found');
    this._slots = [];           // [{ el, range, key, entry, svg, hits, states, markerBar, extent, filled }], top first
    this._active = 0;           // index into _slots of the active one
    this._leaving = null;       // the slot sliding out during a shift
    this._shiftTimer = 0;
    this._onShiftEnd = null;
    this._fillTimer = 0;        // the deferred fill of the preview slot after a shift
    this._token = 0;            // show(): the latest call wins
    this._pieceToken = 0;       // prepare(): the latest piece wins
    this._preparing = null;     // the prepare() under way (show() waits for it)
    this._norm = null;
    this._tk = null;
    this._cache = new Map();    // range key → engraved line { key, from, to, svg, hits, warnings, width, height, top, s } | { error }
    this._box = null;           // uniformBox of everything engraved so far
    this._tints = { loop: [], pending: [], trouble: [] };   // tint → bars; re-applied to every slot as it is filled
    this._anchors = null;       // null | 'downbeats' | [bar]; re-applied to every slot as it is filled
    this._onBarTap = null;

    if (!document.getElementById('pl-staff-styles')) {
      const st = document.createElement('style');
      st.id = 'pl-staff-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this._wrap = document.createElement('div');
    this._wrap.className = 'pl-staff-wrap';
    this._wrap.dataset.state = 'empty';
    this._wrap.innerHTML = '<div class="pl-staff-svg" role="img" aria-label="Staff notation"><div class="pl-staff-track"></div></div><div class="pl-staff-status"></div>';
    this._svgHost = this._wrap.querySelector('.pl-staff-svg');
    this._track = this._wrap.querySelector('.pl-staff-track');
    this._status = this._wrap.querySelector('.pl-staff-status');
    this._host.textContent = '';
    this._host.appendChild(this._wrap);
    this._svgHost.addEventListener('click', e => {
      if (!this._onBarTap) return;
      const bar = this.barAt(e.clientX, e.clientY);
      if (bar != null) { e.preventDefault(); this._onBarTap(bar, e); }
    });
  }

  /** A click / tap on a drawn measure (either slot) calls fn(bar, event); null turns taps off. */
  get onBarTap() { return this._onBarTap; }
  set onBarTap(fn) {
    this._onBarTap = typeof fn === 'function' ? fn : null;
    this._wrap.dataset.tappable = this._onBarTap ? '1' : '0';
  }

  /** The active slot's hits / range; every slot's ranges; which slot is active. */
  get hits() { const s = this._slots[this._active]; return s ? s.hits : {}; }
  get range() { const s = this._slots[this._active]; return s ? { from: s.range.from, to: s.range.to } : null; }
  get ranges() { return this._slots.map(s => ({ from: s.range.from, to: s.range.to })); }
  get active() { return this._active; }
  /** The active slot's SVG (console / debug). */
  get _svg() { const s = this._slots[this._active]; return s ? s.svg : null; }

  // ── Engraving (cached per line) ─────────────────────────────────

  /**
   * A piece: engrave every line of `ranges` once (kept until clear() or the
   * next prepare) and size the slots to hold the tallest. Resolves to
   * { warnings } — or null when superseded by another prepare / clear, or
   * when Verovio did not load (the staff says so). show() waits for it, so
   * the page need not; long pieces are engraved in slices of YIELD_MS.
   */
  prepare(norm, ranges) {
    const token = ++this._pieceToken;
    this._reset();
    this._norm = norm;
    this._setState('loading', 'Loading notation…');
    const run = (async () => {
      let tk;
      try { tk = await loadToolkit(); }
      catch (err) {
        console.error('[player-staff] Verovio failed to load', err);
        if (token === this._pieceToken) this._setState('error', 'Notation unavailable (Verovio did not load)');
        return null;
      }
      if (token !== this._pieceToken) return null;
      this._tk = tk;
      const warnings = [];
      let t0 = performance.now();
      for (const r of ranges || []) {
        const e = this._entry(r);
        if (e.error) warnings.push(e.error); else warnings.push(...e.warnings);
        if (performance.now() - t0 > YIELD_MS) {
          await new Promise(res => setTimeout(res, 0));
          if (token !== this._pieceToken) return null;
          t0 = performance.now();
        }
      }
      return { warnings };
    })();
    this._preparing = run;
    run.then(() => { if (this._preparing === run) this._preparing = null; });
    return run;
  }

  /** The engraved line for `range`, from the cache or engraved now (the shared box grows to hold it). */
  _entry(range) {
    const key = keyOf(range);
    let e = this._cache.get(key);
    if (e) return e;
    e = this._engrave(range);
    this._cache.set(key, e);
    if (!e.error) {
      const box = uniformBox([...this._cache.values()]);
      const grew = !this._box || box.above > this._box.above || box.below > this._box.below;
      this._box = box;
      if (grew && this._slots.length) this._applyBoxAll();
    }
    return e;
  }

  /**
   * Engrave one line. Twice through Verovio: unjustified (breaks: 'none')
   * for the line's natural width, then as one system justified to
   * PAGE_WIDTH — or to a wider page when that would squeeze it under
   * MIN_SPACING (pageWidthFor; a warning names the bars).
   */
  _engrave(range) {
    const tk = this._tk;
    const where = barsLabel(range);
    let built;
    try { built = toMEI(this._norm, { from: range.from, to: range.to, systemBreak: true }); }
    catch (err) { return { key: keyOf(range), error: err.message }; }
    for (const w of built.warnings) console.warn(`[player-staff] ${w}`);
    const warnings = [...built.warnings];

    let pageWidth = PAGE_WIDTH;
    tk.setOptions({ ...PLAYER_OPTIONS, breaks: 'none' });
    const natural = tk.loadData(built.mei) ? svgMetrics(tk.renderToSVG(1)) : null;
    if (natural) pageWidth = pageWidthFor(natural.width / 10);
    if (pageWidth !== PAGE_WIDTH) {
      const w = `${where} ${range.from === range.to ? 'is' : 'are'} too dense for one line at full size: drawn at ${Math.round(PAGE_WIDTH / pageWidth * 100)}% (an earlier line break in "lines" fixes it)`;
      console.warn(`[player-staff] ${w}`);
      warnings.push(w);
    }
    tk.setOptions({ ...PLAYER_OPTIONS, pageWidth });
    if (!tk.loadData(built.mei)) return { key: keyOf(range), error: `${where} could not be engraved` };
    const svg = tk.renderToSVG(1);
    const m = svgMetrics(svg);
    if (!m) return { key: keyOf(range), error: `${where}: unexpected SVG from Verovio` };
    return { key: keyOf(range), from: range.from, to: range.to, svg, hits: built.hits, warnings, width: m.width, height: m.height, top: m.top, s: pageWidth / PAGE_WIDTH };
  }

  // ── Slots ───────────────────────────────────────────────────────

  /**
   * Show line `top` in the top slot and `bottom` (null: none) in the bottom
   * one, with slot `active` (0 top, 1 bottom) as the active line. Resolves
   * to { hits, warnings } of the active line when drawn, or null when
   * superseded or failed. Note states, dimming and the marker start clean;
   * tints and anchors carry over. See "Line change" in the header for when
   * this shifts and when it cuts; `animate: false` always cuts.
   */
  async show(top, bottom = null, { active = 0, animate = true } = {}) {
    const token = ++this._token;
    if (this._preparing) await this._preparing;
    if (token !== this._token) return null;
    if (!this._tk || !this._norm || !top) return null;
    const want = [top];
    if (bottom && keyOf(bottom) !== keyOf(top)) want.push(bottom);
    const act = active && want.length > 1 ? 1 : 0;

    clearTimeout(this._fillTimer); this._fillTimer = 0;
    this._endShift();   // a shift still running ends now: its leaving slot goes first
    const old = this._slots;
    for (const s of old) this._clearPaint(s);

    // The active line must be drawable; the preview is dropped when it is not.
    const failed = this._entry(want[act]).error;
    if (failed) { this._setState('error', failed); return null; }
    if (want.length > 1 && this._entry(want[1 - act]).error) { want.splice(1 - act, 1); }
    const act2 = want.length > 1 ? act : 0;

    const promote = old.length === 2 && keyOf(want[0]) === old[1].key;                                  // the previewed line moves up
    const single = old.length === 1 && want.length === 1 && want[0].from > old[0].range.from;           // one slot, paging forward
    const shift = !!(animate && !reducedMotion() && (promote || single));
    const leaving = shift ? old[0] : null;
    const reusable = old.filter(s => s !== leaving);
    const next = want.map(r => reusable.find(s => s.key === keyOf(r)) || this._makeSlot(r));

    this._slots = next;
    this._active = act2;
    next.forEach((s, i) => s.el.classList.toggle('pl-staff-slot--passive', i !== act2));
    if (leaving) leaving.el.classList.add('pl-staff-slot--passive');   // no longer the active line: it dims as it slides out
    this._layout();

    const order = leaving ? [leaving, ...next] : next;
    for (const s of old) if (!order.includes(s)) s.el.remove();
    order.forEach((s, i) => { if (this._track.children[i] !== s.el) this._track.insertBefore(s.el, this._track.children[i] || null); });

    // The top and the active line go in now; with a shift, a new preview line waits until it is over (_fillLater).
    next.forEach((s, i) => { if (!shift || i === 0 || i === act2) this._fill(s); });
    if (leaving && !this._startShift(leaving)) for (const s of next) this._fill(s);   // nothing to animate after all: everything now

    this._svgHost.setAttribute('aria-label', `Staff notation for ${next.map(s => barsLabel(s.range)).join(', then ')}`);
    this._setState('ready', '');
    const a = next[act2];
    return { hits: a.hits, warnings: a.entry.warnings };
  }

  _makeSlot(range) {
    const el = document.createElement('div');
    el.className = 'pl-staff-slot';
    const slot = { el, range: { from: range.from, to: range.to }, key: keyOf(range), entry: null, svg: null, hits: {}, states: new Map(), markerBar: null, extent: null, filled: false };
    this._sizeSlot(slot);
    return slot;
  }

  /** Put the slot's engraved line in: the SVG in the shared box, its hits, then the tints and anchors that fall on it. Idempotent. */
  _fill(slot) {
    if (slot.filled) return;
    const e = this._entry(slot.range);
    slot.filled = true;
    slot.entry = e;
    if (e.error) return;
    slot.el.innerHTML = e.svg;
    slot.svg = slot.el.querySelector('svg');
    slot.hits = {}; slot.states = new Map(); slot.markerBar = null; slot.extent = null;
    if (!slot.svg) return;
    this._applyBox(slot);
    for (const [id, hit] of Object.entries(e.hits)) if (this._find(id, slot)) slot.hits[id] = hit;
    for (const t of TINTS) this._drawTint(t, [slot]);
    this._drawAnchors([slot]);
  }

  /** Every slot the same shape: the shared box's aspect-ratio (an unfilled slot keeps its place). */
  _sizeSlot(slot) {
    const b = this._box;
    if (b) slot.el.style.aspectRatio = `${b.width} / ${b.above + b.below}`;
  }

  /** The slot's SVG in the shared box: Verovio's nested svg pinned to its own size, the outer viewBox = the box around this line's top staff line. */
  _applyBox(slot) {
    this._sizeSlot(slot);
    const e = slot.entry, b = this._box;
    if (!slot.svg || !e || e.error || !b) return;
    const inner = slot.svg.querySelector('svg');
    if (inner) {
      inner.setAttribute('x', '0'); inner.setAttribute('y', '0');
      inner.setAttribute('width', String(e.width)); inner.setAttribute('height', String(e.height));
      inner.setAttribute('overflow', 'visible');   // marker / tint padding and anchor ticks may reach into the box's spare room
    }
    slot.svg.removeAttribute('width'); slot.svg.removeAttribute('height');
    slot.svg.setAttribute('viewBox', slotViewBox(e, b));
  }

  _applyBoxAll() {
    for (const s of [this._leaving, ...this._slots]) if (s) { this._applyBox(s); s.extent = null; }
    this._layout();
  }

  /** The host is a window of exactly the shown slots, whatever the track holds (one more while a shift runs). */
  _layout() {
    const b = this._box, n = this._slots.length;
    this._svgHost.style.aspectRatio = b && n ? `${b.width} / ${(b.above + b.below) * n}` : '';
  }

  /** Slide the track up by the leaving slot's height; it is removed when the shift ends. False when there is nothing to animate (not laid out). */
  _startShift(leaving) {
    const track = this._track;
    const h = leaving.el.getBoundingClientRect().height;
    if (!(h > 0)) { leaving.el.remove(); return false; }
    this._leaving = leaving;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    void track.offsetHeight;   // the start position is laid out before the transition goes on
    track.style.transition = `transform ${SHIFT_MS}ms ease-out`;
    track.style.transform = `translateY(${-h}px)`;
    const done = () => { if (this._leaving !== leaving) return; this._endShift(); this._fillLater(); };
    this._onShiftEnd = e => { if (e.target === track && e.propertyName === 'transform') done(); };
    track.addEventListener('transitionend', this._onShiftEnd);
    this._shiftTimer = setTimeout(done, SHIFT_FALLBACK_MS);
    return true;
  }

  /** End a shift now: the leaving slot goes, the track is back at rest. */
  _endShift() {
    if (this._shiftTimer) { clearTimeout(this._shiftTimer); this._shiftTimer = 0; }
    if (this._onShiftEnd) { this._track.removeEventListener('transitionend', this._onShiftEnd); this._onShiftEnd = null; }
    if (this._leaving) { this._leaving.el.remove(); this._leaving = null; }
    this._track.style.transition = 'none';
    this._track.style.transform = '';
  }

  /** The preview line left empty by a shift is put in a moment after it ends. */
  _fillLater() {
    clearTimeout(this._fillTimer);
    this._fillTimer = setTimeout(() => { this._fillTimer = 0; for (const s of this._slots) this._fill(s); }, FILL_DELAY_MS);
  }

  /** Note states, dimming and the marker off one slot (a slot leaving the active role, or about to be painted afresh). */
  _clearPaint(slot) {
    if (!slot.svg) return;
    for (const id of slot.states.keys()) { const el = this._find(id, slot); if (el) for (const s of STATES) el.classList.remove(`pl-note--${s}`); }
    slot.states = new Map();
    for (const el of slot.svg.querySelectorAll('g.note.pl-note--dim')) el.classList.remove('pl-note--dim');
    for (const r of slot.svg.querySelectorAll('rect.pl-bar-marker')) r.remove();
    slot.markerBar = null;
  }

  // ── Note states (the active slot) ───────────────────────────────

  /** Mark one note: 'expected' | 'correct' | 'wrong' | 'playing' | null (clear). Returns false when the id is not in the active slot. */
  setNoteState(id, state) {
    const slot = this._slots[this._active];
    const el = slot ? this._find(id, slot) : null;
    if (!el) return false;
    for (const s of STATES) el.classList.toggle(`pl-note--${s}`, s === state);
    if (state) slot.states.set(id, state); else slot.states.delete(id);
    return true;
  }

  getNoteState(id) { const slot = this._slots[this._active]; return (slot && slot.states.get(id)) || null; }

  clearStates() { const slot = this._slots[this._active]; if (slot) for (const id of [...slot.states.keys()]) this.setNoteState(id, null); }

  /** Draw exactly these notes faint (pl-note--dim); orthogonal to setNoteState. */
  setDimmed(ids) {
    const slot = this._slots[this._active];
    const want = new Set(ids || []);
    if (!slot || !slot.svg) return;
    for (const el of slot.svg.querySelectorAll('g.note.pl-note--dim')) if (!want.has(el.id)) el.classList.remove('pl-note--dim');
    for (const id of want) { const el = this._find(id, slot); if (el) el.classList.add('pl-note--dim'); }
  }

  /** The active slot's note ids in document order, optionally for one bar / hand. */
  noteIds({ bar, hand } = {}) {
    return Object.values(this.hits).filter(h => (bar == null || h.bar === bar) && (hand == null || h.hand === hand)).map(h => h.id);
  }

  // ── Marker, tints, anchors ──────────────────────────────────────

  /**
   * Faint tinted rectangle behind the measure that holds `bar`, when that
   * bar is in the ACTIVE slot (found through its id or one of the bar's
   * drawn notes → g.measure; x / width from that measure, y / height shared
   * by the whole line (see _lineExtent); inserted as the measure's first
   * child so it paints under everything). null clears. A bar with no drawn
   * notes gets no marker. Returns true when a marker shows.
   */
  setBarMarker(bar) {
    const slot = this._slots[this._active];
    if (!slot || !slot.svg) return false;
    if (bar != null && bar === slot.markerBar && slot.svg.querySelector('rect.pl-bar-marker')) return true;
    for (const s of this._slots) { if (s.svg) for (const r of s.svg.querySelectorAll('rect.pl-bar-marker')) r.remove(); s.markerBar = null; }
    if (bar == null) return false;
    const measure = this._measureOf(bar, slot);
    const rect = measure && this._measureRect(measure, 'pl-bar-marker', slot);
    if (!rect) return false;
    measure.insertBefore(rect, measure.firstChild);
    slot.markerBar = bar;
    return true;
  }

  /**
   * Tint the measures of `bars` ('loop', 'pending' or 'trouble'; [] or null clears that
   * tint), in whichever slot holds them. Remembered and redrawn as slots are
   * filled, so the page sets it once per change, not per line. Returns the
   * bars that were drawn.
   */
  setBarTint(tint, bars) {
    if (!TINTS.includes(tint)) return [];
    this._tints[tint] = Array.isArray(bars) ? bars.filter(b => typeof b === 'number') : [];
    return this._drawTint(tint);
  }

  getBarTint(tint) { return (this._tints[tint] || []).slice(); }

  _drawTint(tint, slots = this._slots) {
    const cls = `pl-bar-${tint}`;
    const drawn = [];
    for (const slot of slots) {
      if (!slot.svg) continue;   // not filled yet: drawn when it is
      for (const r of slot.svg.querySelectorAll(`rect.${cls}`)) r.remove();
      for (const bar of this._tints[tint]) {
        const measure = this._measureOf(bar, slot);   // null when the bar is not on this line
        const rect = measure ? this._measureRect(measure, cls, slot) : null;
        if (!rect) continue;
        measure.insertBefore(rect, measure.firstChild);   // first child paints at the bottom: the current-bar marker (if any) stays in front
        drawn.push(bar);
      }
    }
    return drawn;
  }

  /**
   * Anchor downbeats (norm.anchors), display only. A list of bars: a small
   * gold tick above beat 1 of each one that is on a drawn line. 'downbeats'
   * (beat 1 of every bar): no per-bar marks — the barlines get a very subtle
   * gold tint. Both carry the title "Anchor: land this downbeat". null (or
   * anything else) clears. Remembered and redrawn as slots are filled.
   */
  setAnchors(anchors) {
    this._anchors = anchors === 'downbeats' ? 'downbeats' : (Array.isArray(anchors) && anchors.length ? [...new Set(anchors.filter(b => typeof b === 'number'))] : null);
    this._drawAnchors();
  }

  _drawAnchors(slots = this._slots) {
    const a = this._anchors;
    this._wrap.dataset.anchors = a === 'downbeats' ? 'downbeats' : (a ? 'bars' : 'none');
    const titled = el => { const t = document.createElementNS(SVG_NS, 'title'); t.setAttribute('class', 'pl-anchor-title'); t.textContent = ANCHOR_TITLE; el.appendChild(t); };
    for (const slot of slots) {
      if (!slot.svg) continue;
      for (const el of slot.svg.querySelectorAll('line.pl-anchor-tick, title.pl-anchor-title')) el.remove();
      if (a === 'downbeats') { for (const g of slot.svg.querySelectorAll('g.barLine')) titled(g); continue; }
      if (!a) continue;
      const extent = slot.extent || (slot.extent = this._lineExtent(slot));
      if (!extent) continue;
      for (const bar of a) {
        const measure = this._measureOf(bar, slot);
        if (!measure || !measure.parentNode) continue;   // not on this line
        const x = this._downbeatX(bar, measure, slot);
        if (x == null) continue;
        const tick = document.createElementNS(SVG_NS, 'line');
        tick.setAttribute('class', 'pl-anchor-tick');
        tick.setAttribute('x1', String(x)); tick.setAttribute('x2', String(x));
        tick.setAttribute('y1', String(extent.y)); tick.setAttribute('y2', String(extent.y + extent.height * ANCHOR_TICK));
        titled(tick);
        measure.parentNode.appendChild(tick);   // beside the measure (same coordinates), not inside it: the measure's bbox, which the tints are sized from, stays its own
      }
    }
  }

  /** The x of `bar`'s downbeat: the centre of its leftmost drawn note at onset 0, else the measure's left edge. */
  _downbeatX(bar, measure, slot) {
    let x = null;
    for (const h of Object.values(slot.hits)) {
      if (h.bar !== bar || h.onset !== 0) continue;
      const el = this._find(h.id, slot);
      const head = el && (el.querySelector('.notehead') || el);   // the notehead, not the accidental in front of it
      let box = null;
      try { box = head && head.getBBox(); } catch (_) { box = null; }
      if (box && box.width > 0) { const c = box.x + box.width / 2; if (x == null || c < x) x = c; }
    }
    if (x != null) return x;
    const box = this._measureBox(measure, slot);
    return box ? box.x : null;
  }

  /** The bar under a client point, in either slot: the measure's id (pl-m<bar>) when the hit lands on one, else the measure whose bounding rect holds the point. */
  barAt(clientX, clientY) {
    const slots = this._slots.filter(s => s.svg);
    if (!slots.length) return null;
    const target = document.elementFromPoint(clientX, clientY);
    const hit = target && target.closest && target.closest('g.measure');
    if (hit && slots.some(s => s.svg.contains(hit))) { const b = barOfMeasure(hit); if (b != null) return b; }
    for (const slot of slots) for (const m of slot.svg.querySelectorAll('g.measure')) {
      const r = m.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) { const b = barOfMeasure(m); if (b != null) return b; }
    }
    return null;
  }

  /** g.measure for `bar` in `slot`: by id (pl-m<bar>, from toMEI), else through one of the bar's drawn notes. null when the bar is not on that line. */
  _measureOf(bar, slot) {
    if (!slot || !slot.svg) return null;
    const byId = this._find(`pl-m${bar}`, slot);
    if (byId && byId.classList.contains('measure')) return byId;
    for (const h of Object.values(slot.hits)) {
      if (h.bar !== bar) continue;
      const el = this._find(h.id, slot);
      const m = el && el.closest('g.measure');
      if (m) return m;
    }
    return null;
  }

  /**
   * The measure's own bbox without our pl-bar-* rects (they are already
   * padded, so layered tints would grow); null when not rendered or not in
   * the slot's SVG. The rects are lifted out and put back in place: each one's
   * anchor is its first following sibling that is NOT one of the lifted
   * rects (the marker and a tint sit side by side as first children, so a
   * lifted rect's direct nextSibling may itself be gone — the 1b
   * NotFoundError in insertBefore).
   */
  _measureBox(measure, slot) {
    if (!measure || !slot || !slot.svg || !slot.svg.contains(measure)) return null;
    const rects = [...measure.querySelectorAll(':scope > rect[class^="pl-bar-"]')];
    const lifted = new Set(rects);
    const own = rects.map(r => { let next = r.nextSibling; while (next && lifted.has(next)) next = next.nextSibling; return { r, next }; });
    for (const { r } of own) r.remove();
    let box = null;
    try { box = measure.getBBox(); } catch (_) { box = null; }   // not rendered (display: none)
    for (const { r, next } of own) measure.insertBefore(r, next && next.parentNode === measure ? next : null);   // in original order, before the same surviving anchor
    return box && box.width > 0 && box.height > 0 ? box : null;
  }

  /**
   * One vertical extent for a slot's line: the union of every measure's
   * y-range, padded by MARKER_PAD, so marker and tint rects are the same
   * height whatever each bar holds (high notes, ties, low notes). null when
   * nothing is rendered.
   */
  _lineExtent(slot) {
    if (!slot || !slot.svg) return null;
    let top = Infinity, bottom = -Infinity;
    for (const m of slot.svg.querySelectorAll('g.measure')) {
      const box = this._measureBox(m, slot);
      if (!box) continue;
      top = Math.min(top, box.y);
      bottom = Math.max(bottom, box.y + box.height);
    }
    if (!(bottom > top)) return null;
    const pad = (bottom - top) * MARKER_PAD;
    return { y: top - pad, height: bottom - top + 2 * pad };
  }

  /** A rect with class `cls`: x / width from the measure, y / height from its line's shared extent; null when either is missing. */
  _measureRect(measure, cls, slot) {
    const box = this._measureBox(measure, slot);
    if (!box) return null;
    const extent = slot.extent || (slot.extent = this._lineExtent(slot));
    if (!extent) return null;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', cls);
    rect.setAttribute('x', String(box.x));
    rect.setAttribute('y', String(extent.y));
    rect.setAttribute('width', String(box.width));
    rect.setAttribute('height', String(extent.height));
    return rect;
  }

  // ── Housekeeping ────────────────────────────────────────────────

  /** Slots, cache and piece gone (tints and anchors are the page's to clear); pending show() / prepare() calls are dropped. */
  _reset() {
    this._token++;
    clearTimeout(this._fillTimer); this._fillTimer = 0;
    this._endShift();
    this._slots = []; this._active = 0;
    this._track.textContent = '';
    this._cache = new Map(); this._box = null; this._norm = null; this._preparing = null;
    this._layout();
  }

  /** No piece: nothing drawn, nothing cached. */
  clear() {
    this._pieceToken++;
    this._reset();
    this._setState('empty', '');
  }

  destroy() { this.clear(); this._wrap.remove(); }

  _find(id, slot = this._slots[this._active]) { return slot && slot.svg ? slot.svg.querySelector(`#${CSS_escape(id)}`) : null; }

  _setState(state, text) {
    this._wrap.dataset.state = state;
    this._status.textContent = text;
  }
}

export { PlayerStaff, PLAYER_OPTIONS, PAGE_WIDTH, MIN_SPACING, svgMetrics, pageWidthFor, uniformBox, slotViewBox };
