/**
 * info-pill.js
 * ============
 * Small "ⓘ" trigger anchored to a panel header that opens a popover with a
 * topic's title, status disclaimer, fact / heuristic badge, SUMMARY, see-also
 * chips and a "Read more →" link to its Learn page. The popover never shows
 * a topic's body: that is what /learn/<slug> is for.
 *
 * Content comes from voicing-explainer-content.js by slug, or from a
 * caller-supplied object (see setContent). Self-contained: injects its own
 * CSS and links the shared learn.css, so it works on pages that do not
 * extend base.html (the Explorer).
 *
 * Usage:
 *   import { InfoPill } from '/static/shared/info-pill.js';
 *   const pill = InfoPill.mount(headerEl, { slug: 'tension-scoring' });
 *   pill.setContent({ slug: 'explore-panel' });        // or a content object
 *   pill.open(); pill.close(); pill.destroy();
 *
 * Options:
 *   slug          topic slug in the registry
 *   content       { title, status?, disclaimer?, kind?, summaryHtml, seeAlso?: [{ title, url, kind?, status? }], url? }
 *   render        () => content | slug, called on every open (dynamic content)
 *   label         text next to the icon ("Learn"); icon only when omitted
 *   position      'append' (default: last child of anchorEl) | 'after' (next sibling)
 *   onOpen/onClose callbacks
 *
 * Behaviour:
 *   - click toggles; aria-expanded / aria-haspopup on the trigger
 *   - focus moves into the popover on open and returns to the trigger on close
 *   - outside mousedown closes; Escape closes — captured on document ONLY while
 *     a pill is open, so page-level Escape handlers keep working otherwise
 *   - one pill open at a time; the popover repositions on scroll / resize
 *   - under 700px the popover is a full-width sheet at the bottom
 */

import { renderTopic } from './voicing-explainer-content.js';

const SHEET_MAX_WIDTH = 700;   // px: at or below this the popover is a bottom sheet
const LEARN_CSS_HREF = '/static/shared/learn.css';

// ── CSS (injected once) ─────────────────────────────────────────────────────

const PILL_CSS = /* css */ `
.ip-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  color: var(--accent-gold, #D4A03C);
  background: rgba(212, 160, 60, 0.10);
  border: 1px solid rgba(212, 160, 60, 0.25);
  font: inherit; font-size: 13px; line-height: 1;
  cursor: pointer; flex-shrink: 0; margin-left: 6px; padding: 0;
  vertical-align: middle;
  transition: color var(--transition-fast, 120ms ease), background var(--transition-fast, 120ms ease), border-color var(--transition-fast, 120ms ease);
}
.ip-trigger:hover, .ip-trigger[aria-expanded="true"] {
  background: rgba(212, 160, 60, 0.20);
  border-color: rgba(212, 160, 60, 0.50);
}
.ip-trigger:focus-visible { outline: 2px solid var(--accent-gold, #D4A03C); outline-offset: 2px; }
.ip-trigger--label {
  width: auto; border-radius: 999px; padding: 3px 8px 3px 6px; gap: 4px;
  font-size: 10px; font-weight: var(--font-weight-medium, 500); letter-spacing: 0.02em;
}
.ip-trigger__icon { line-height: 1; }
.ip-trigger--label .ip-trigger__icon { font-size: 12px; }

.ip-pop {
  position: fixed; z-index: 9000;
  width: 360px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px); overflow-y: auto;
  box-sizing: border-box;
  background: var(--bg-surface, var(--bg-card, #fff));
  color: var(--text-primary, #1F1B16);
  border: 1px solid var(--border-color, #D9D2C0);
  border-radius: var(--radius-xl, 12px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  font-family: var(--font-family-base, system-ui, sans-serif);
  font-size: var(--font-size-xs, 0.9rem); line-height: 1.5;
  animation: ip-fade-in 0.15s ease-out;
}
.ip-pop:focus { outline: none; }
@keyframes ip-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ip-pop { animation: none; } }

.ip-pop__head { display: flex; align-items: flex-start; gap: 8px; padding: 12px 12px 6px 14px; }
.ip-pop__title { margin: 0; flex: 1; font-size: var(--font-size-sm, 1rem); font-weight: var(--font-weight-medium, 500); line-height: 1.3; }
.ip-pop__close {
  flex: none; width: 28px; height: 28px; margin: -4px -4px 0 0; padding: 0;
  border: none; border-radius: var(--radius-md, 6px); background: transparent;
  color: var(--text-secondary, #4A4339); font: inherit; font-size: 1.1rem; line-height: 1; cursor: pointer;
}
.ip-pop__close:hover, .ip-pop__close:focus-visible { background: var(--bg-raised, rgba(0,0,0,0.05)); color: var(--text-primary, #1F1B16); outline: none; }
.ip-pop__body { padding: 0 14px 12px; display: flex; flex-direction: column; gap: 10px; }
.ip-pop__badges { display: flex; flex-wrap: wrap; gap: 6px; }
.ip-pop__summary { margin: 0; color: var(--text-primary, #1F1B16); }
.ip-pop__section { font-size: var(--font-size-2xs, 0.8rem); color: var(--text-muted, #8C8576); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 4px; }
.ip-pop__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ip-chip {
  display: inline-block; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--border-color, #D9D2C0); background: var(--bg-raised, transparent);
  color: var(--text-secondary, #4A4339); font-size: var(--font-size-2xs, 0.8rem); text-decoration: none;
  transition: border-color var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease);
}
.ip-chip:hover { border-color: var(--accent-gold, #D4A03C); color: var(--text-primary, #1F1B16); }
.ip-chip--stub { border-style: dotted; color: var(--text-muted, #8C8576); opacity: 0.8; }
.ip-chip--page::after { content: ' ↗'; opacity: 0.7; }
.ip-pop__foot { display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 8px 14px 12px; border-top: 1px solid var(--border-subtle, #E8E2D2); }
.ip-pop__more { color: var(--accent-gold, #D4A03C); font-weight: var(--font-weight-medium, 500); text-decoration: none; font-size: var(--font-size-xs, 0.9rem); }
.ip-pop__more:hover { text-decoration: underline; }

@media (max-width: ${SHEET_MAX_WIDTH}px) {
  .ip-pop {
    left: 0 !important; right: 0 !important; top: auto !important; bottom: 0 !important;
    width: 100%; max-width: none; max-height: 70vh;
    border-radius: var(--radius-xl, 12px) var(--radius-xl, 12px) 0 0;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.25);
  }
  .ip-pop__body, .ip-pop__head, .ip-pop__foot { padding-left: 16px; padding-right: 16px; }
}
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  if (!document.querySelector(`link[href="${LEARN_CSS_HREF}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = LEARN_CSS_HREF;
    document.head.appendChild(link);
  }
  const style = document.createElement('style');
  style.id = 'ip-styles';
  style.textContent = PILL_CSS;
  document.head.appendChild(style);
}

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Normalise a slug or a content object into what the popover renders. */
function resolveContent(source) {
  if (typeof source === 'string') {
    const r = renderTopic(source);
    if (!r) return { title: source, summaryHtml: '<em>No such topic.</em>', seeAlso: [] };
    return { title: r.title, status: r.status, disclaimer: r.disclaimer, kind: r.kind, category: r.category, summaryHtml: r.summaryHtml, seeAlso: r.seeAlso, url: `/learn/${r.slug}` };
  }
  if (source && typeof source === 'object') return { seeAlso: [], ...source };
  return { title: '', summaryHtml: '', seeAlso: [] };
}

let _openPill = null;   // one at a time

class InfoPill {
  /**
   * Create a pill in / after `anchorEl`.
   * @param {HTMLElement} anchorEl
   * @param {object} opts  see module header
   */
  static mount(anchorEl, opts = {}) {
    injectCSS();
    return new InfoPill(anchorEl, opts);
  }

  constructor(anchorEl, opts) {
    this._anchor = anchorEl;
    this._opts = opts;
    this._source = opts.render ? null : (opts.slug ?? opts.content ?? null);
    this._open = false;
    this._pop = null;

    const btn = h('button', 'ip-trigger' + (opts.label ? ' ip-trigger--label' : ''));
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.appendChild(h('span', 'ip-trigger__icon', 'ⓘ'));
    if (opts.label) btn.appendChild(document.createTextNode(opts.label));
    this._btn = btn;
    this._updateTriggerLabel();

    if (opts.position === 'after' && anchorEl.parentNode) anchorEl.parentNode.insertBefore(btn, anchorEl.nextSibling);
    else anchorEl.appendChild(btn);

    btn.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });

    this._onDocMousedown = e => { if (this._open && !this._pop.contains(e.target) && !this._btn.contains(e.target)) this.close(); };
    this._onDocKeydown = e => {
      if (e.key !== 'Escape' || !this._open) return;
      e.preventDefault(); e.stopImmediatePropagation();   // claimed only while open (capture phase)
      this.close();
    };
    this._onReposition = () => { if (this._open) this._position(); };
  }

  /** Replace the content source (slug or content object); re-renders if open. */
  setContent(source) {
    this._source = source;
    this._updateTriggerLabel();
    if (this._open) { this._render(); this._position(); }
  }

  get isOpen() { return this._open; }

  toggle() { this._open ? this.close() : this.open(); }

  open() {
    if (this._open) return;
    if (_openPill && _openPill !== this) _openPill.close();
    _openPill = this;
    this._open = true;
    if (!this._pop) {
      this._pop = h('div', 'ip-pop');
      this._pop.setAttribute('role', 'dialog');
      this._pop.setAttribute('aria-modal', 'false');
      this._pop.tabIndex = -1;
    }
    this._render();
    document.body.appendChild(this._pop);
    this._position();
    this._btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', this._onDocMousedown, true);
    document.addEventListener('keydown', this._onDocKeydown, true);
    window.addEventListener('scroll', this._onReposition, true);
    window.addEventListener('resize', this._onReposition);
    this._pop.focus({ preventScroll: true });
    if (this._opts.onOpen) this._opts.onOpen(this);
  }

  close() {
    if (!this._open) return;
    this._open = false;
    if (_openPill === this) _openPill = null;
    document.removeEventListener('mousedown', this._onDocMousedown, true);
    document.removeEventListener('keydown', this._onDocKeydown, true);
    window.removeEventListener('scroll', this._onReposition, true);
    window.removeEventListener('resize', this._onReposition);
    const focusWasInside = this._pop && (this._pop.contains(document.activeElement) || document.activeElement === document.body);
    this._pop.remove();
    this._btn.setAttribute('aria-expanded', 'false');
    if (focusWasInside) this._btn.focus({ preventScroll: true });
    if (this._opts.onClose) this._opts.onClose(this);
  }

  destroy() {
    this.close();
    this._btn.remove();
    this._pop = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _content() {
    const src = this._opts.render ? this._opts.render() : this._source;
    return resolveContent(src);
  }

  _updateTriggerLabel() {
    const c = this._opts.render ? null : resolveContent(this._source);
    const title = c && c.title ? c.title : 'About this panel';
    this._btn.title = title;
    this._btn.setAttribute('aria-label', `About: ${title}`);
  }

  _render() {
    const c = this._content();
    const pop = this._pop;
    pop.textContent = '';
    const titleId = `ip-title-${Math.random().toString(36).slice(2, 8)}`;
    pop.setAttribute('aria-labelledby', titleId);

    const head = h('div', 'ip-pop__head');
    const title = h('h3', 'ip-pop__title', c.title || ''); title.id = titleId;
    head.appendChild(title);
    const close = h('button', 'ip-pop__close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());
    head.appendChild(close);
    pop.appendChild(head);

    const body = h('div', 'ip-pop__body');
    if (c.disclaimer) {
      const d = h('div', 'learn-disclaimer' + (c.status === 'stub' ? ' learn-disclaimer--stub' : ''));
      d.appendChild(h('span', 'learn-disclaimer__icon', c.status === 'stub' ? '○' : '⚠'));
      d.appendChild(h('span', null, c.disclaimer));
      body.appendChild(d);
    }
    const badges = h('div', 'ip-pop__badges');
    if (c.kind) badges.appendChild(h('span', `learn-badge learn-badge--kind-${c.kind}`, c.kind));
    if (c.status) badges.appendChild(h('span', `learn-badge learn-badge--status-${c.status}`, c.status));
    if (badges.children.length) body.appendChild(badges);
    if (c.summaryHtml) { const p = h('p', 'ip-pop__summary'); p.innerHTML = c.summaryHtml; body.appendChild(p); }
    if (c.seeAlso && c.seeAlso.length) {
      const wrap = h('div');
      wrap.appendChild(h('p', 'ip-pop__section', 'See also'));
      const chips = h('div', 'ip-pop__chips');
      for (const s of c.seeAlso) {
        const a = h('a', 'ip-chip' + (s.status === 'stub' ? ' ip-chip--stub' : '') + (s.kind === 'page' ? ' ip-chip--page' : ''), s.title);
        if (s.status === 'stub') a.title = 'Not written yet';
        a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
        chips.appendChild(a);
      }
      wrap.appendChild(chips);
      body.appendChild(wrap);
    }
    pop.appendChild(body);

    if (c.url) {
      const foot = h('div', 'ip-pop__foot');
      const more = h('a', 'ip-pop__more', 'Read more →'); more.href = c.url; more.target = '_blank'; more.rel = 'noopener';
      foot.appendChild(more);
      pop.appendChild(foot);
    }
  }

  _position() {
    const pop = this._pop;
    if (!pop) return;
    if (window.innerWidth <= SHEET_MAX_WIDTH) { pop.style.left = pop.style.top = pop.style.right = pop.style.bottom = ''; return; }
    const r = this._btn.getBoundingClientRect();
    const margin = 8;
    const w = pop.offsetWidth, hgt = pop.offsetHeight;
    // Below the trigger, left-aligned to it; flip up or shift left when out of the viewport.
    let left = r.left;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - w);
    let top = r.bottom + 6;
    if (top + hgt > window.innerHeight - margin) top = Math.max(margin, r.top - 6 - hgt);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.right = pop.style.bottom = 'auto';
  }
}

export { InfoPill, resolveContent };

if (typeof window !== 'undefined') {
  window.InfoPill = InfoPill;
}
