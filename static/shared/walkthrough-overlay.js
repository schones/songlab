/**
 * walkthrough-overlay.js
 * ======================
 * Floating guided-walkthrough card for the Tonnetz Explorer.
 *
 * Renders a bottom-right overlay that steps through a walkthrough sequence,
 * driving HarmonyState to update the Explorer panels on each step.
 *
 * Usage:
 *   import { WalkthroughOverlay } from './walkthrough-overlay.js';
 *   const overlay = new WalkthroughOverlay({ onExit: () => { ... } });
 *   overlay.start(walkthroughData);
 *
 * Depends on:
 *   - harmony-state.js (HarmonyState)
 *   - transforms.js (triadNotes)
 */

import { HarmonyState } from './harmony-state.js';
import { triadNotes } from './transforms.js';
import SONG_EXAMPLES from './song-examples.js';

// ════════════════════════════════════════════════════════════════════
// CHORD NAME PARSER (mirrors Explorer's _parseChordName)
// ════════════════════════════════════════════════════════════════════

function parseChordName(name) {
  if (!name) return null;
  const m = name.match(/^([A-Ga-g][#♯b♭]?)(m|min|minor|maj|major|dim|aug|7|m7|maj7)?$/);
  if (!m) return null;
  const letter = m[1].charAt(0).toUpperCase();
  const acc = m[1].length > 1 ? m[1].charAt(1) : '';
  let root = letter;
  if (acc === '#' || acc === '♯') root += '♯';
  else if (acc === 'b' || acc === '♭') root += '♭';
  const suffix = (m[2] || '').toLowerCase();
  let quality = 'major';
  if (suffix === 'm' || suffix === 'min' || suffix === 'minor') quality = 'minor';
  else if (suffix === 'dim') quality = 'diminished';
  else if (suffix === 'm7') quality = 'minor';
  else if (suffix === '7' || suffix === 'maj7') quality = 'major';
  return { root, quality };
}

// ════════════════════════════════════════════════════════════════════
// RELATED SONG LOOKUP
// ════════════════════════════════════════════════════════════════════

/**
 * Find related songs from SONG_EXAMPLES matching any of the given
 * concept_specifics values, excluding songs whose title contains
 * any of the excludeNames (to avoid showing the walkthrough's own song).
 * Returns up to `limit` results as "Song — Artist" strings.
 */
function findRelatedSongs(conceptSpecifics, excludeNames = [], limit = 3) {
  if (!conceptSpecifics || !conceptSpecifics.length) return [];
  const specificsSet = new Set(conceptSpecifics);
  const excludeLower = excludeNames.map(n => n.toLowerCase());

  const matches = SONG_EXAMPLES.filter(ex => {
    // Must share at least one concept_specific
    if (!ex.concept_specifics.some(cs => specificsSet.has(cs))) return false;
    // Exclude the walkthrough's own song(s)
    const songLower = ex.song.toLowerCase();
    if (excludeLower.some(name => songLower.includes(name) || name.includes(songLower))) return false;
    return true;
  });

  return matches.slice(0, limit).map(ex => `${ex.song} — ${ex.artist}`);
}

/**
 * Extract song names from a walkthrough's song field for exclusion.
 * Handles formats like "Song — Artist" and "Song1 / Song2".
 */
function extractExcludeNames(walkthroughSong) {
  if (!walkthroughSong) return [];
  // Split on " — " to get just the song portion, then split on " / " for multi-song entries
  const songPart = walkthroughSong.split(' — ')[0].split(' \u2014 ')[0];
  return songPart.split(' / ').map(s => s.trim().toLowerCase());
}

// ════════════════════════════════════════════════════════════════════
// PANEL FOCUS (dim non-focused panels)
// ════════════════════════════════════════════════════════════════════

/** Map from focus key → CSS class on the .exp-panel element */
const PANEL_FOCUS_MAP = {
  tonnetz:    'exp-panel--tonnetz',
  keyboard:   'exp-panel--keyboard',
  wheel:      'exp-panel--chord-wheel',
  fretboard:  'exp-panel--fretboard',
};

/**
 * Normalise a focus value (string | string[] | undefined) into an array.
 */
function normaliseFocus(focus) {
  if (!focus) return [];
  return Array.isArray(focus) ? focus : [focus];
}

/**
 * Apply or remove the dim state on Explorer panels.
 * @param {string[]} focusPanels — panel keys to keep bright (empty = show all)
 */
function applyPanelFocus(focusPanels) {
  const allPanels = document.querySelectorAll('.exp-panel');
  if (!focusPanels.length) {
    // No focus — remove all dimming
    allPanels.forEach(el => el.classList.remove('exp-panel--dimmed'));
    return;
  }
  const focusClasses = new Set(focusPanels.map(k => PANEL_FOCUS_MAP[k]).filter(Boolean));
  allPanels.forEach(el => {
    const isFocused = [...focusClasses].some(cls => el.classList.contains(cls));
    el.classList.toggle('exp-panel--dimmed', !isFocused);
  });
}

// ════════════════════════════════════════════════════════════════════
// WALKTHROUGH OVERLAY
// ════════════════════════════════════════════════════════════════════

class WalkthroughOverlay {
  /**
   * @param {Object} options
   * @param {Function} [options.onExit]       — called when walkthrough is dismissed
   * @param {Function} [options.playChord]    — async (root, quality) => void, plays audio
   */
  constructor(options = {}) {
    this._onExit = options.onExit || (() => {});
    this._onStep = options.onStep || null;
    this._onExport = options.onExport || null;
    this._playChord = options.playChord || null;
    this._walkthrough = null;
    this._stepIndex = 0;
    this._el = null;
    this._visible = false;
    this._prevChord = null;   // track previous step's chord for transform highlighting
    this._buildDOM();
    this._bindKeys();
    this._initDrag();
  }

  // ── Public API ───────────────────────────────────────────────────

  /** Start a walkthrough sequence. */
  start(walkthrough) {
    if (!walkthrough || !walkthrough.steps || !walkthrough.steps.length) return;
    this._walkthrough = walkthrough;
    this._stepIndex = 0;
    this._prevChord = null;
    this._show();
    this._goToStep(0);
  }

  /** Stop the walkthrough and remove the overlay. */
  exit() {
    applyPanelFocus([]);  // remove all dimming
    this._hide();
    this._walkthrough = null;
    this._onExit();
  }

  /** Is the walkthrough currently active? */
  get active() {
    return this._visible && this._walkthrough != null;
  }

  // ── DOM construction ─────────────────────────────────────────────

  _buildDOM() {
    // Container
    const el = document.createElement('div');
    el.className = 'wt-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Guided walkthrough');

    el.innerHTML = `
      <button class="wt-close" aria-label="Exit walkthrough" title="Exit walkthrough">&times;</button>
      <div class="wt-song"></div>
      <div class="wt-step-title"></div>
      <div class="wt-body"></div>
      <div class="wt-also"></div>
      <div class="wt-see-also"></div>
      <div class="wt-export-link" style="display:none">
        <a href="#" class="wt-export-anchor">Export this progression to Skratch Studio</a>
      </div>
      <div class="wt-footer">
        <div class="wt-indicator"></div>
        <div class="wt-nav">
          <button class="wt-btn wt-btn--back">&larr; Back</button>
          <button class="wt-btn wt-btn--next">Next &rarr;</button>
        </div>
      </div>
    `;

    // Cache refs
    this._el = el;
    this._songEl = el.querySelector('.wt-song');
    this._titleEl = el.querySelector('.wt-step-title');
    this._bodyEl = el.querySelector('.wt-body');
    this._alsoEl = el.querySelector('.wt-also');
    this._seeAlsoEl = el.querySelector('.wt-see-also');
    this._exportLinkEl = el.querySelector('.wt-export-link');
    this._exportAnchor = el.querySelector('.wt-export-anchor');
    this._indicatorEl = el.querySelector('.wt-indicator');
    this._backBtn = el.querySelector('.wt-btn--back');
    this._nextBtn = el.querySelector('.wt-btn--next');
    this._closeBtn = el.querySelector('.wt-close');

    // Events
    this._backBtn.addEventListener('click', () => this._back());
    this._nextBtn.addEventListener('click', () => this._next());
    this._closeBtn.addEventListener('click', () => this.exit());
    this._exportAnchor.addEventListener('click', (e) => {
      e.preventDefault();
      if (this._onExport) this._onExport();
    });

    document.body.appendChild(el);
  }

  _bindKeys() {
    this._keyHandler = (e) => {
      if (!this.active) return;
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        this._next();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        this._back();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.exit();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  // ── Drag-to-reposition ──────────────────────────────────────────

  _initDrag() {
    let dragging = false;
    let startX, startY, origLeft, origTop;

    const onMouseDown = (e) => {
      // Only drag from the overlay background, not buttons/links/inputs
      const tag = e.target.tagName.toUpperCase();
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
      if (e.target.closest('button') || e.target.closest('a')) return;

      dragging = true;
      const rect = this._el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;

      // Switch from bottom/right positioning to top/left for drag
      this._el.style.top = rect.top + 'px';
      this._el.style.left = rect.left + 'px';
      this._el.style.bottom = 'auto';
      this._el.style.right = 'auto';
      origLeft = rect.left;
      origTop = rect.top;

      this._el.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this._el.style.left = (origLeft + dx) + 'px';
      this._el.style.top = (origTop + dy) + 'px';
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      this._el.style.cursor = '';
    };

    this._el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Touch support
    this._el.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, target: e.target, preventDefault: () => e.preventDefault() });
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const touch = e.touches[0];
      onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });
    document.addEventListener('touchend', onMouseUp);
  }

  // ── Show / Hide ──────────────────────────────────────────────────

  _show() {
    this._visible = true;
    // Reset to default position (bottom-right) in case it was dragged
    this._el.style.top = '';
    this._el.style.left = '';
    this._el.style.bottom = '';
    this._el.style.right = '';
    this._el.classList.add('wt-overlay--visible');
  }

  _hide() {
    this._visible = false;
    this._el.classList.remove('wt-overlay--visible');
  }

  // ── Navigation ───────────────────────────────────────────────────

  _next() {
    if (!this._walkthrough) return;
    const maxIdx = this._walkthrough.steps.length - 1;
    if (this._stepIndex < maxIdx) {
      this._goToStep(this._stepIndex + 1);
    }
    // On last step: do nothing — user must click X to dismiss
  }

  _back() {
    if (!this._walkthrough) return;
    if (this._stepIndex > 0) {
      this._goToStep(this._stepIndex - 1);
    }
  }

  // ── Step rendering ───────────────────────────────────────────────

  _goToStep(index) {
    const wt = this._walkthrough;
    const step = wt.steps[index];
    const total = wt.steps.length;
    const isLast = index === total - 1;
    const isFirst = index === 0;

    // Save previous chord for transform highlighting
    if (this._stepIndex !== index && index > 0) {
      const prevStep = wt.steps[index - 1];
      this._prevChord = parseChordName(prevStep.chord);
    } else if (index === 0) {
      this._prevChord = null;
    }
    this._stepIndex = index;

    // Animate content transition
    const contentEls = [this._titleEl, this._bodyEl, this._alsoEl, this._seeAlsoEl];
    contentEls.forEach(el => el.classList.remove('wt-fade-in'));

    // Force reflow to restart animation
    void this._el.offsetWidth;

    // Update content
    this._songEl.textContent = wt.song || '';
    this._titleEl.textContent = step.title;
    this._bodyEl.textContent = step.body;

    // "You'll also hear this in..." related songs
    const excludeNames = extractExcludeNames(wt.song);
    const related = findRelatedSongs(step.concept_specifics, excludeNames);
    if (related.length) {
      this._alsoEl.textContent = `You\u2019ll also hear this in: ${related.join(', ')}`;
      this._alsoEl.style.display = '';
    } else {
      this._alsoEl.textContent = '';
      this._alsoEl.style.display = 'none';
    }

    // "See also" link — only on the final step, if the walkthrough has one
    if (isLast && wt.seeAlso && wt.seeAlso.label && wt.seeAlso.href) {
      this._seeAlsoEl.innerHTML = '';
      const link = document.createElement('a');
      link.href = wt.seeAlso.href;
      link.className = 'wt-see-also-link';
      link.textContent = `Practice this \u2192 ${wt.seeAlso.label}`;
      this._seeAlsoEl.appendChild(link);
      this._seeAlsoEl.style.display = '';
    } else {
      this._seeAlsoEl.innerHTML = '';
      this._seeAlsoEl.style.display = 'none';
    }

    // Panel focus — dim non-focused panels
    applyPanelFocus(normaliseFocus(step.focus));

    // Step indicator dots
    this._indicatorEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'wt-dot' + (i === index ? ' wt-dot--active' : '');
      dot.addEventListener('click', () => this._goToStep(i));
      this._indicatorEl.appendChild(dot);
    }

    // Navigation buttons
    this._backBtn.style.visibility = isFirst ? 'hidden' : 'visible';
    this._nextBtn.style.display = isLast ? 'none' : '';
    this._nextBtn.textContent = 'Next \u2192';

    // Export link — show on last step
    this._exportLinkEl.style.display = (isLast && this._onExport) ? '' : 'none';

    // Trigger fade-in
    contentEls.forEach(el => el.classList.add('wt-fade-in'));

    // Drive the Explorer
    this._applyStep(step);
  }

  // ── Explorer integration ─────────────────────────────────────────

  _applyStep(step) {
    const parsed = parseChordName(step.chord);
    if (!parsed) return;

    // Fire onStep callback for sequence capture
    if (this._onStep) {
      this._onStep({
        root: parsed.root,
        quality: parsed.quality,
        transform: step.highlightTransform || null,
      });
    }

    // If this step has a highlightTransform and we have a previous chord,
    // use setTransform to show the PLR arrow on the Tonnetz
    if (step.highlightTransform && this._prevChord) {
      HarmonyState.setTransform(
        step.highlightTransform,
        this._prevChord.root,
        this._prevChord.quality
      );
    } else {
      HarmonyState.setTriad(parsed.root, parsed.quality);
    }

    // Audio: the HarmonyState subscriber in explorer.html auto-plays
    // on chord change. For cases where the chord is the same as the
    // previous step (e.g. returning to Am), we need to force a play.
    if (step.autoPlay && this._playChord) {
      // Use a small delay so the HarmonyState subscriber fires first.
      // If the chord didn't change, the subscriber won't play, so we do.
      const prevParsed = this._prevChord;
      const sameChord = prevParsed &&
        prevParsed.root === parsed.root &&
        prevParsed.quality === parsed.quality;
      if (sameChord) {
        setTimeout(() => {
          this._playChord(parsed.root, parsed.quality);
        }, 50);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════

export { WalkthroughOverlay };
