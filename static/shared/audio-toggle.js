/**
 * Global audio mute/unmute toggle for Tonnetz.
 *
 * Default state: sound ON (not muted).
 * Persists user preference in localStorage.
 * Injects a floating mute/unmute button on every page.
 *
 * On first user gesture, proactively calls Tone.start() so the
 * AudioContext is resumed and ready for playback — this satisfies
 * the iOS/Safari autoplay policy without requiring a dedicated
 * "Enable Sound" button.
 *
 * Usage from any page script:
 *   if (AudioToggle.isMuted()) return;   // gate playback
 *   await AudioToggle.ensureTone();      // resume AudioContext
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'tonnetz_audio_muted';

  // Default: sound ON (localStorage value absent → not muted)
  let _muted = localStorage.getItem(STORAGE_KEY) === 'true';
  let _btn = null;
  let _gestureHandled = false;

  // ── Tone.js AudioContext management ──────────────────────────────

  /** Start Tone AudioContext (no-op if already running or Tone not loaded). */
  async function _startTone() {
    if (typeof Tone === 'undefined') return;
    if (Tone.context.state === 'running') return;
    try { await Tone.start(); } catch (_) { /* swallow — retry on next gesture */ }
  }

  /** First user gesture handler — proactively resume AudioContext. */
  function _onFirstGesture() {
    if (_gestureHandled) return;
    _gestureHandled = true;
    document.removeEventListener('click', _onFirstGesture, true);
    document.removeEventListener('touchstart', _onFirstGesture, true);
    document.removeEventListener('keydown', _onFirstGesture, true);
    if (!_muted) _startTone();
  }

  // ── Floating toggle button ──────────────────────────────────────

  const ICON_ON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  const ICON_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

  function _updateBtn() {
    if (!_btn) return;
    _btn.setAttribute('aria-label', _muted ? 'Unmute sound' : 'Mute sound');
    _btn.title = _muted ? 'Sound off \u2014 click to unmute' : 'Sound on \u2014 click to mute';
    _btn.innerHTML = _muted ? ICON_OFF : ICON_ON;
    _btn.classList.toggle('audio-toggle-btn--muted', _muted);
  }

  function _injectStyles() {
    if (document.getElementById('audio-toggle-css')) return;
    const style = document.createElement('style');
    style.id = 'audio-toggle-css';
    style.textContent = [
      '.audio-toggle-btn {',
      '  position: fixed;',
      '  bottom: 20px;',
      '  right: 20px;',
      '  z-index: 9999;',
      '  width: 44px;',
      '  height: 44px;',
      '  border-radius: 50%;',
      '  border: 1.5px solid var(--border, #e8e6f0);',
      '  background: var(--bg-card, #f0eeff);',
      '  color: var(--text-primary, #1a1a2e);',
      '  cursor: pointer;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,0.1);',
      '  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;',
      '  padding: 0;',
      '  line-height: 1;',
      '}',
      '.audio-toggle-btn:hover {',
      '  transform: scale(1.1);',
      '  box-shadow: 0 4px 16px rgba(0,0,0,0.18);',
      '}',
      '.audio-toggle-btn--muted {',
      '  opacity: 0.55;',
      '}',
      '.audio-toggle-btn svg {',
      '  display: block;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function _injectButton() {
    _btn = document.createElement('button');
    _btn.className = 'audio-toggle-btn' + (_muted ? ' audio-toggle-btn--muted' : '');

    _btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      _muted = !_muted;
      localStorage.setItem(STORAGE_KEY, String(_muted));
      _updateBtn();
      // If unmuting, ensure Tone AudioContext is running
      if (!_muted) await _startTone();
      window.dispatchEvent(new CustomEvent('tonnetz:mute-changed', {
        detail: { muted: _muted },
      }));
    });

    _updateBtn();
    document.body.appendChild(_btn);
  }

  // ── Public API ──────────────────────────────────────────────────

  window.AudioToggle = {
    /** @returns {boolean} Whether audio is currently muted. */
    isMuted() { return _muted; },

    /**
     * Ensure Tone.js AudioContext is resumed.
     * Safe to call from any user-gesture handler. No-op if already running.
     */
    async ensureTone() { await _startTone(); },

    /** Initialise the toggle. Called automatically on DOMContentLoaded. */
    init() {
      if (document.getElementById('audio-toggle-css')) return; // already init'd
      _injectStyles();
      _injectButton();
      // Register first-gesture listener to proactively start Tone
      document.addEventListener('click', _onFirstGesture, true);
      document.addEventListener('touchstart', _onFirstGesture, true);
      document.addEventListener('keydown', _onFirstGesture, true);
    },
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.AudioToggle.init());
  } else {
    window.AudioToggle.init();
  }
})();
