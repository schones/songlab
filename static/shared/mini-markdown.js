/**
 * mini-markdown.js
 * ================
 * A deliberately small Markdown subset for SongLab's explainer content
 * (voicing-explainer-content.js): enough for topic bodies written in
 * template strings, no more.
 *
 * Blocks (separated by blank lines):
 *   # / ## / ### heading      → <h2> / <h3> / <h4>   (h1 is the page's)
 *   - item / * item           → <ul>
 *   1. item                   → <ol>
 *   | a | b |  (pipe table, second row ---) → <table>
 *   > quote                   → <blockquote>
 *   anything else             → <p>  (single newlines inside a paragraph are spaces)
 *
 * Inline:
 *   **bold**  *italic*  `code`  [text](target)
 *   target = slug             → resolveLink(slug) (default /learn/<slug>)
 *          = /path or http(s)://… → used as is (external links open in a new tab)
 *
 * All text is HTML-escaped first; the only HTML that reaches the output is
 * what this module writes. Pure: no DOM, Node-runnable.
 *
 *   renderMarkdown(src, { resolveLink })  → HTML string
 *   renderInline(src, { resolveLink })    → HTML string (no block wrapper)
 *   escapeHtml(text)                      → escaped text
 *   selfTest()
 *
 * Self-test:
 *   node --input-type=module -e "import('./static/shared/mini-markdown.js').then(m => m.selfTest())"
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(text) { return String(text ?? '').replace(/[&<>"']/g, c => ESC[c]); }

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_URL_RE = /^(\/[^\s]*|https?:\/\/[^\s]+)$/;

/** Default link resolution: a slug becomes a Learn page; paths and http(s) URLs pass through; anything else is dropped. */
function defaultResolveLink(target) {
  if (SLUG_RE.test(target)) return { href: `/learn/${target}` };
  if (SAFE_URL_RE.test(target)) return { href: target, external: /^https?:/.test(target) };
  return null;
}

/**
 * Inline markup on already-plain text. The text is escaped here; markers are
 * then replaced in one pass each (code first so its contents stay literal).
 */
function renderInline(src, opts = {}) {
  const resolve = opts.resolveLink || defaultResolveLink;
  let s = escapeHtml(src);
  // `code` — keep the contents literal (no bold / italic / links inside).
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  // [text](target)
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, text, target) => {   // target may hold one level of ( )
    const r = resolve(target);
    if (!r || !r.href) return text;   // unresolvable: plain text, never a broken link
    const attrs = [`href="${escapeHtml(r.href)}"`];
    if (r.title) attrs.push(`title="${escapeHtml(r.title)}"`);
    if (r.external) attrs.push('target="_blank" rel="noopener"');
    if (r.className) attrs.push(`class="${escapeHtml(r.className)}"`);
    return `<a ${attrs.join(' ')}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![\w*])/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  return s;
}

function renderTable(lines, opts) {
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const tr = (cs, tag) => `<tr>${cs.map(c => `<${tag}>${renderInline(c, opts)}</${tag}>`).join('')}</tr>`;
  return `<table><thead>${tr(head, 'th')}</thead><tbody>${body.map(cs => tr(cs, 'td')).join('')}</tbody></table>`;
}

function renderBlock(block, opts) {
  const lines = block.split('\n');
  const first = lines[0];
  const h = first.match(/^(#{1,3})\s+(.*)$/);
  if (h && lines.length === 1) {
    const level = h[1].length + 1;   // # → h2: the page owns h1
    return `<h${level}>${renderInline(h[2], opts)}</h${level}>`;
  }
  if (lines.length >= 2 && /^\s*\|/.test(first) && /^\s*\|?\s*:?-{2,}/.test(lines[1])) return renderTable(lines, opts);
  // Lists: a block whose first line carries a marker. A line without a marker
  // continues the previous item (wrapped items in template strings).
  const UL = /^\s*[-*]\s+/, OL = /^\s*\d+[.)]\s+/;
  const listItems = (marker) => {
    const items = [];
    for (const l of lines) {
      if (marker.test(l)) items.push(l.replace(marker, ''));
      else if (items.length) items[items.length - 1] += ' ' + l.trim();
      else return null;
    }
    return items;
  };
  if (UL.test(first)) { const items = listItems(UL); if (items) return `<ul>${items.map(i => `<li>${renderInline(i, opts)}</li>`).join('')}</ul>`; }
  if (OL.test(first)) { const items = listItems(OL); if (items) return `<ol>${items.map(i => `<li>${renderInline(i, opts)}</li>`).join('')}</ol>`; }
  if (lines.every(l => /^\s*>/.test(l))) {
    return `<blockquote><p>${renderInline(lines.map(l => l.replace(/^\s*>\s?/, '')).join(' '), opts)}</p></blockquote>`;
  }
  return `<p>${renderInline(lines.map(l => l.trim()).join(' '), opts)}</p>`;
}

/** Render a Markdown-subset string to HTML. */
function renderMarkdown(src, opts = {}) {
  const text = String(src ?? '').replace(/\r\n?/g, '\n');
  // Template strings are usually indented: drop the common leading indent.
  const lines = text.split('\n');
  const indents = lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  const dedented = lines.map(l => l.slice(Math.min(common, l.match(/^\s*/)[0].length))).join('\n');
  return dedented.trim().split(/\n\s*\n/).filter(b => b.trim()).map(b => renderBlock(b.trim(), opts)).join('\n');
}

export { renderMarkdown, renderInline, escapeHtml, defaultResolveLink, selfTest };

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs)
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  let passed = 0, total = 0;
  const assert = (name, got, want) => {
    total++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) passed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`}`);
  };
  assert('escapes html', escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert('paragraph joins lines', renderMarkdown('one\ntwo'), '<p>one two</p>');
  assert('two paragraphs', renderMarkdown('a\n\nb'), '<p>a</p>\n<p>b</p>');
  assert('dedents template strings', renderMarkdown('\n    a\n    b\n\n    c\n  '), '<p>a b</p>\n<p>c</p>');
  assert('bold', renderInline('a **b** c'), 'a <strong>b</strong> c');
  assert('italic', renderInline('a *b* c'), 'a <em>b</em> c');
  assert('italic not inside words', renderInline('2*3*4'), '2*3*4');
  assert('bold and italic', renderInline('**x** and *y*'), '<strong>x</strong> and <em>y</em>');
  assert('code is literal', renderInline('`**a** [b](c)`'), '<code>**a** [b](c)</code>');
  assert('slug link', renderInline('[guide tones](guide-tones-and-shells)'), '<a href="/learn/guide-tones-and-shells">guide tones</a>');
  assert('path link', renderInline('[ch 5](/intro/5)'), '<a href="/intro/5">ch 5</a>');
  assert('external link', renderInline('[m](https://x.y/z)'), '<a href="https://x.y/z" target="_blank" rel="noopener">m</a>');
  assert('bad target drops to text', renderInline('[t](javascript:alert(1))'), 't');
  assert('bad scheme drops to text', renderInline('[t](data:text/html,x)'), 't');
  assert('custom resolver', renderInline('[t](foo)', { resolveLink: () => ({ href: '/q', title: 'T', className: 'c' }) }), '<a href="/q" title="T" class="c">t</a>');
  assert('resolver null → text', renderInline('[t](foo)', { resolveLink: () => null }), 't');
  assert('escapes inside link text', renderInline('[<x>](foo)'), '<a href="/learn/foo">&lt;x&gt;</a>');
  assert('headings', renderMarkdown('# A\n\n## B\n\n### C'), '<h2>A</h2>\n<h3>B</h3>\n<h4>C</h4>');
  assert('ul', renderMarkdown('- a\n- **b**'), '<ul><li>a</li><li><strong>b</strong></li></ul>');
  assert('ol', renderMarkdown('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert('wrapped list items', renderMarkdown('- a\n  more a\n- b'), '<ul><li>a more a</li><li>b</li></ul>');
  assert('wrapped ordered items', renderMarkdown('1. a\n   more\n2. b'), '<ol><li>a more</li><li>b</li></ol>');
  assert('blockquote', renderMarkdown('> a\n> b'), '<blockquote><p>a b</p></blockquote>');
  assert('table', renderMarkdown('| a | b |\n|---|---|\n| 1 | **2** |'),
    '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>');
  assert('empty', renderMarkdown(''), '');
  assert('null', renderMarkdown(null), '');
  assert('no raw html passes', renderMarkdown('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert('fraction text untouched', renderInline('2/3 and 0.667'), '2/3 and 0.667');
  console.log(`\n─── ${passed}/${total} passed ───\n`);
  return { passed, total };
}
