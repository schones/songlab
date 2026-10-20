/**
 * learn-example-view.js
 * =====================
 * DOM side of the /learn example blocks. learn-example.js (pure) resolves an
 * id into notes, degrees and a one-bar progression; this module turns each
 * `<div class="learn-example" data-example="<id>">` placeholder on a topic
 * page into a card: label, a small VoicingKeyboard, a degree line, a
 * VoicingStaff, a ▶ button and, when the example links to a piece, a link
 * line. Loaded by templates/learn/topic.html only.
 *
 *   mountExamples(root) → number of blocks mounted
 *
 * Loading. Nothing heavy loads with the page: the staff renders (and Verovio
 * loads, once) when a block first comes near the viewport; Tone.js and the
 * Salamander piano load on the first ▶ click anywhere on the page.
 *
 * Playback. One VoicingPlayer per page — Tone.Transport is global, so two
 * players would cancel each other. `owner` is the block whose ▶ is active;
 * ▶ on another block stops the current one (its button returns to idle
 * through onEnd) and takes over. While playing, the keyboard lights the
 * sounding keys (setPlaying) and the staff lights the sounding noteheads
 * (setPlaying with the playback notes' staff piece ids: the staff and the
 * playback list are built from the same bar model, so the ids agree).
 *
 * Narrow screens. The keyboard keeps its minimum 28 px white keys (labels
 * stay legible, keys stay tappable) and scrolls inside the card, scrolled on
 * mount so the voicing is centred; the page itself never scrolls sideways.
 */

import { resolveExample } from './learn-example.js';
import { VoicingKeyboard } from './voicing-keyboard.js';
import { VoicingStaff } from './voicing-staff.js';
import { VoicingPlayer } from './voicing-player.js';
import { buildPlaybackList, toSchedule } from './voicing-playback-model.js';

const KEYBOARD_HEIGHT = 84;       // px: smaller than the /voicings panel's 112
const MIN_OCTAVES = 2;
const STAFF_ROOT_MARGIN = '200px';   // render the staff this far before the block scrolls into view

const TEXT = {
  play: '▶ Play', stop: '■ Stop', loading: '… Loading piano',
  muted: 'Sound is off — turn it on with the sound button in the navigation bar.',
  blocked: 'The browser did not allow sound yet — click ▶ again.',
  error: 'Playback is unavailable (the piano could not load).',
  empty: 'Nothing to play.',
};

// ── Shared player ───────────────────────────────────────────────────────────

let player = null;   // created on the first ▶ click
let owner = null;    // the block whose playback is loading or playing

function getPlayer() {
  if (!player) player = new VoicingPlayer({ onState: state => { if (owner) owner.setState(state); } });
  return player;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** [low, high] midi: the C at or below the bass to the B at or above the top note, at least MIN_OCTAVES octaves. */
function keyboardRange(ex) {
  const top = Math.max(...ex.midis, ex.bassMidi);
  const low = Math.floor(ex.bassMidi / 12) * 12;
  let high = Math.floor(top / 12) * 12 + 11;
  if (high - low + 1 < MIN_OCTAVES * 12) high = low + MIN_OCTAVES * 12 - 1;
  return [low, high];
}

/** Scroll a keyboard wrap so the midpoint of the lit keys is centred (no-op when nothing overflows). */
function centreKeyboard(container, ex) {
  const wrap = container.querySelector('.vk-wrap');
  if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 1) return;
  const keys = [ex.bassMidi, ...ex.midis].map(m => wrap.querySelector(`[data-midi="${m}"]`)).filter(Boolean);
  if (!keys.length) return;
  const left = Math.min(...keys.map(k => k.offsetLeft)), right = Math.max(...keys.map(k => k.offsetLeft + k.offsetWidth));
  wrap.scrollLeft = Math.max(0, (left + right) / 2 - wrap.clientWidth / 2);
}

function linkLine(link) {
  const p = h('p', 'learn-example__link');
  const a = h('a', 'learn-link');
  a.href = link.url;
  a.textContent = `${link.kind === 'strict' ? 'This exact voicing' : 'Related'}: ${link.title}, bar ${link.bar}`;
  p.appendChild(a);
  if (link.bassSource === 'inferred') p.appendChild(document.createTextNode(' (bass inferred)'));
  return p;
}

// ── One block ───────────────────────────────────────────────────────────────

class ExampleBlock {
  constructor(el, ex) {
    this.el = el;
    this.ex = ex;
    this.state = 'idle';
    this.sounding = new Map();     // midi → { midi, role, count }
    this.pieces = new Set();       // staff notehead ids sounding now
    this.staffRendered = false;

    el.textContent = '';
    el.classList.add('learn-example--mounted');

    const head = h('div', 'learn-example__head');
    head.appendChild(h('span', 'learn-example__label', ex.label));
    this.button = h('button', 'learn-example__play', TEXT.play);
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.toggle());
    head.appendChild(this.button);
    el.appendChild(head);

    const kbHost = h('div', 'learn-example__keyboard');
    el.appendChild(kbHost);
    const [low, high] = keyboardRange(ex);
    this.keyboard = new VoicingKeyboard(kbHost, {
      low, high, height: KEYBOARD_HEIGHT,   // parseNote takes midi numbers as well as spelled names
      ariaLabel: `${ex.display}: ${ex.notes.map(n => n.name).join(', ')}`,
    });
    this.keyboard.render({ bass: ex.bass, voicing: ex.voicing, melody: [] });
    centreKeyboard(kbHost, ex);

    const degrees = h('p', 'learn-example__degrees');
    ex.notes.forEach((n, i) => {
      if (i) degrees.appendChild(h('span', 'learn-example__sep', ' · '));
      const s = h('span', `learn-example__note learn-example__note--${n.role}`);
      s.appendChild(h('b', null, n.name));
      s.appendChild(document.createTextNode(` ${n.degree}`));
      degrees.appendChild(s);
    });
    el.appendChild(degrees);

    this.staffHost = h('div', 'learn-example__staff');
    el.appendChild(this.staffHost);
    this.staff = new VoicingStaff(this.staffHost);   // cheap: Verovio loads on render()

    this.hint = h('p', 'learn-example__hint');
    this.hint.hidden = true;
    el.appendChild(this.hint);

    if (ex.link) el.appendChild(linkLine(ex.link));

    this.setState('idle');
    this.observeStaff();
  }

  /** Render the staff when the block first comes near the viewport (Verovio loads then, once per page). */
  observeStaff() {
    if (typeof IntersectionObserver !== 'function') { this.renderStaff(); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); this.renderStaff(); }
    }, { rootMargin: STAFF_ROOT_MARGIN });
    io.observe(this.el);
  }

  renderStaff() {
    if (this.staffRendered) return;
    this.staffRendered = true;
    this.staff.render(this.ex.progression, 1);   // async; shows its own loading / unavailable states
  }

  setState(state) {
    this.state = state;
    const playing = state === 'playing', loading = state === 'loading';
    this.button.textContent = playing ? TEXT.stop : loading ? TEXT.loading : TEXT.play;
    this.button.disabled = loading;
    this.button.setAttribute('aria-label', `${playing ? 'Stop' : 'Play'} ${this.ex.label}`);
    this.button.classList.toggle('learn-example__play--playing', playing);
    this.button.classList.toggle('learn-example__play--loading', loading);
    if (playing || loading) this.showHint(null);
  }

  showHint(text) {
    this.hint.textContent = text || '';
    this.hint.hidden = !text;
  }

  async toggle() {
    const p = getPlayer();
    if (owner === this && (p.playing || this.state === 'loading')) { p.stop(); return; }
    if (p.playing) p.stop();   // the previous owner's onEnd puts its button back to idle
    owner = this;
    const list = buildPlaybackList(this.ex.progression, 1, { scope: 'event', eventIndex: 0 });
    for (const w of list.warnings) console.warn(`[learn-example ${this.ex.id}] ${w}`);
    const schedule = toSchedule(list);
    this.renderStaff();   // a click is as good as a scroll: the staff follows playback once drawn
    this.sounding.clear(); this.pieces.clear();
    const result = await p.play(schedule, {
      onNote: (note, phase) => this.onNote(note, phase),
      onPiece: (piece, phase) => this.onPiece(piece, phase),
      onEnd: () => this.onEnd(),
    });
    if (!result.played) {
      if (result.reason !== 'superseded') this.showHint(TEXT[result.reason] || TEXT.error);
      if (owner === this) { owner = null; this.setState('idle'); }
    }
  }

  onNote(note, phase) {
    const cur = this.sounding.get(note.midi) || { midi: note.midi, role: note.role, count: 0 };
    cur.count += phase === 'on' ? 1 : -1;
    if (phase === 'on' && note.role === 'bass') cur.role = 'bass';
    if (cur.count > 0) this.sounding.set(note.midi, cur); else this.sounding.delete(note.midi);
    this.keyboard.setPlaying([...this.sounding.values()].map(n => ({ midi: n.midi, role: n.role })));
  }

  onPiece(piece, phase) {
    if (!piece.staffId) return;
    if (phase === 'on') this.pieces.add(piece.staffId); else this.pieces.delete(piece.staffId);
    this.staff.setPlaying(this.pieces);
  }

  onEnd() {
    this.sounding.clear(); this.pieces.clear();
    this.keyboard.setPlaying(null);
    this.staff.setPlaying(null);
    if (owner === this) owner = null;
    this.setState('idle');
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Mount every example placeholder under root. Placeholders already marked
 * missing (unknown id, from the pure layer) are left as they are; an entry
 * the resolver rejects gets the same visible notice.
 */
function mountExamples(root) {
  let mounted = 0;
  for (const el of root.querySelectorAll('.learn-example[data-example]')) {
    if (el.classList.contains('learn-example--missing') || el.classList.contains('learn-example--mounted')) continue;
    const id = el.dataset.example;
    let ex = null;
    try { ex = resolveExample(id); }
    catch (err) {
      console.error('[learn-example]', err);
      el.classList.add('learn-example--missing');
      el.textContent = `Example “${id}” could not be built: ${err.message}`;
      continue;
    }
    if (!ex) { el.classList.add('learn-example--missing'); el.textContent = `Example “${id}” is not in the registry.`; continue; }
    new ExampleBlock(el, ex);
    mounted++;
  }
  return mounted;
}

export { mountExamples, KEYBOARD_HEIGHT };
