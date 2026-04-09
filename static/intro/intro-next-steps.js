/**
 * intro-next-steps.js
 * ===================
 * "What's Next" card shown at the bottom of each intro chapter after the
 * user reaches the final section.
 *
 * Public API:
 *   mountNextSteps(chapterNum)  — insert hidden card before the chapter footer
 *   revealNextSteps()           — animate the card into view
 */

// ── Config ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  Continue: 'var(--tone-accent)',
  Try:      '#4ade80',
  Open:     '#a78bfa',
  Explore:  '#38bdf8',
};

const NEXT_STEPS = {
  1: {
    links: [
      { category: 'Continue', label: 'Chapter 2: Scales & Keys',       desc: 'Build your first scale and discover how keys organize music.', url: '/intro/2' },
      { category: 'Try',      label: 'Rhythm Lab — feel the beat',      desc: '',                                                            url: '/rhythm'  },
    ],
  },
  2: {
    links: [
      { category: 'Continue', label: 'Chapter 3: Chords & Harmony',     desc: 'Stack notes into chords and learn how they move together.',    url: '/intro/3'                  },
      { category: 'Try',      label: 'Scale Builder',                    desc: 'Build major and minor scales on the keyboard.',               url: '/games/scale-builder'      },
      { category: 'Explore',  label: 'Circle of Fifths',                desc: 'See how all 12 keys connect.',                               url: '/theory/circle-of-fifths'  },
    ],
  },
  3: {
    links: [
      { category: 'Continue', label: 'Chapter 4: Meet the Tonnetz',     desc: 'A visual map that reveals hidden connections between chords.', url: '/intro/4'                       },
      { category: 'Try',      label: 'Harmony Trainer',                 desc: 'Sing intervals with pitch feedback.',                         url: '/harmony'                       },
      { category: 'Explore',  label: 'Tonal Centers',                   desc: 'How keys organize music.',                                    url: '/theory/tonal-centers'          },
      { category: 'Explore',  label: 'Chord Progressions',              desc: 'Why I–IV–V–I sounds right.',                                  url: '/theory/chord-progressions'     },
    ],
  },
  4: {
    links: [
      { category: 'Continue', label: 'Chapter 5: Transforms',           desc: 'PLR operations: the elegant moves that connect every chord.', url: '/intro/5'                      },
      { category: 'Open',     label: 'Tonnetz Explorer',                desc: 'The full three-panel playground.',                           url: '/explorer'                     },
      { category: 'Try',      label: 'Chord Walks',                     desc: 'Navigate transforms on the grid.',                           url: '/games/chord-walks'   },
      { category: 'Explore',  label: 'Modes',                           desc: 'Seven flavors of the major scale.',                          url: '/theory/modes'                 },
    ],
  },
  5: {
    graduation: true,
    links: [
      { category: 'Open',    label: 'Tonnetz Explorer',      desc: 'The full three-panel playground.',    url: '/explorer'                   },
      { category: 'Try',     label: 'Chord Walks',           desc: 'Navigate transforms on the grid.',    url: '/games/chord-walks' },
      { category: 'Try',     label: 'Harmony Trainer',       desc: 'Sing intervals with pitch feedback.', url: '/harmony'                    },
      { category: 'Try',     label: 'Skratch Studio',        desc: 'Make music with blocks.',             url: '/skratch-studio'                    },
      { category: 'Explore', label: 'Circle of Fifths',      desc: 'See how all 12 keys connect.',        url: '/theory/circle-of-fifths'    },
      { category: 'Explore', label: 'Tonal Centers',         desc: 'How keys organize music.',            url: '/theory/tonal-centers'       },
      { category: 'Explore', label: 'Modes',                 desc: 'Seven flavors of the major scale.',   url: '/theory/modes'               },
      { category: 'Explore', label: 'Chord Progressions',    desc: 'Why I–IV–V–I sounds right.',          url: '/theory/chord-progressions'  },
    ],
  },
};

// ── CSS ───────────────────────────────────────────────────────────────────

const NEXT_STEPS_CSS = /* css */ `
/* Tone accent variable for the chapter shell */
.intro-chapter[data-tone="playful"]  { --tone-accent: #f59e0b; }
.intro-chapter[data-tone="moderate"] { --tone-accent: #a78bfa; }
.intro-chapter[data-tone="formal"]   { --tone-accent: #38bdf8; }

.intro-next-steps {
  max-width: 760px;
  margin: 3rem auto 1rem;
  padding: 0 1.5rem;
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.45s ease, transform 0.45s ease;
  pointer-events: none;
}

.intro-next-steps--visible {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.intro-next-steps__header {
  margin-bottom: 1.5rem;
}

.intro-next-steps__eyebrow {
  font-family: var(--font-main, 'Nunito', sans-serif);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--tone-accent, var(--accent));
  margin-bottom: 0.4rem;
}

.intro-next-steps__title {
  font-family: var(--font-main, 'Nunito', sans-serif);
  font-size: clamp(1.4rem, 3.5vw, 1.9rem);
  font-weight: 900;
  color: var(--text-primary);
  line-height: 1.15;
  margin: 0 0 0.5rem;
}

.intro-next-steps__subtitle {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.55;
  max-width: 520px;
  font-weight: 600;
  margin: 0;
}

.intro-next-steps__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.85rem;
}

.intro-ns-link {
  display: block;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.1rem;
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.intro-ns-link::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3.5px;
  background: var(--ns-color);
}

.intro-ns-link:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.09);
  border-color: var(--ns-color);
  text-decoration: none;
  color: inherit;
}

[data-theme="dark"] .intro-ns-link:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.intro-ns-link__badge {
  display: inline-block;
  font-family: var(--font-main, 'Nunito', sans-serif);
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ns-color) 14%, transparent);
  color: var(--ns-color);
  margin-bottom: 0.4rem;
}

.intro-ns-link__label {
  font-family: var(--font-main, 'Nunito', sans-serif);
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.3;
  margin-bottom: 0.2rem;
}

.intro-ns-link__desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .intro-next-steps { transition: none; }
}

@media (max-width: 480px) {
  .intro-next-steps { padding: 0 1rem; }
  .intro-next-steps__grid { grid-template-columns: 1fr; }
}
`;

// ── Internal state ────────────────────────────────────────────────────────

let _card = null;

// ── Helpers ───────────────────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('intro-next-steps-styles')) return;
  const el = document.createElement('style');
  el.id = 'intro-next-steps-styles';
  el.textContent = NEXT_STEPS_CSS;
  document.head.appendChild(el);
}

function _buildCard(chapterNum) {
  const config = NEXT_STEPS[chapterNum];
  if (!config) return null;

  const section = document.createElement('section');
  section.className = 'intro-next-steps';
  section.id = 'intro-next-steps-card';
  section.setAttribute('aria-label', "What's Next");

  // Header
  const header = document.createElement('div');
  header.className = 'intro-next-steps__header';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'intro-next-steps__eyebrow';

  const title = document.createElement('h2');
  title.className = 'intro-next-steps__title';

  if (config.graduation) {
    eyebrow.textContent = "You've made it";
    title.textContent = "You're ready. What's next?";
    const subtitle = document.createElement('p');
    subtitle.className = 'intro-next-steps__subtitle';
    subtitle.textContent = "You now have the vocabulary to explore music theory in every direction. Here's what we built this for:";
    header.append(eyebrow, title, subtitle);
  } else {
    eyebrow.textContent = 'Keep going';
    title.textContent = "What's Next";
    header.append(eyebrow, title);
  }

  // Link grid
  const grid = document.createElement('div');
  grid.className = 'intro-next-steps__grid';

  config.links.forEach(({ category, label, desc, url }) => {
    const color = CATEGORY_COLORS[category] || 'var(--tone-accent)';
    const a = document.createElement('a');
    a.className = 'intro-ns-link';
    a.href = url;
    a.style.setProperty('--ns-color', color);

    const badge = document.createElement('div');
    badge.className = 'intro-ns-link__badge';
    badge.textContent = category;

    const labelEl = document.createElement('div');
    labelEl.className = 'intro-ns-link__label';
    labelEl.textContent = label;

    a.append(badge, labelEl);

    if (desc) {
      const descEl = document.createElement('div');
      descEl.className = 'intro-ns-link__desc';
      descEl.textContent = desc;
      a.appendChild(descEl);
    }

    grid.appendChild(a);
  });

  section.append(header, grid);
  return section;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Build the What's Next card and insert it before the chapter footer.
 * No-ops if the card is already mounted or no config exists for this chapter.
 * @param {number} chapterNum  1–5
 */
export function mountNextSteps(chapterNum) {
  if (_card || document.getElementById('intro-next-steps-card')) return;

  _injectCSS();

  const card = _buildCard(chapterNum);
  if (!card) return;

  _card = card;

  const footer = document.querySelector('.intro-chapter__footer');
  if (footer) {
    footer.parentNode.insertBefore(card, footer);
  } else {
    const main = document.querySelector('.intro-chapter');
    if (main) main.appendChild(card);
  }
}

/**
 * Reveal the What's Next card with a CSS transition.
 * Safe to call multiple times — no-ops if already visible.
 */
export function revealNextSteps() {
  const card = _card || document.getElementById('intro-next-steps-card');
  if (!card || card.classList.contains('intro-next-steps--visible')) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.classList.add('intro-next-steps--visible');
    });
  });
}
