/**
 * learn-example.js
 * ================
 * Example blocks for the /learn pages: a registry of small voicings that a
 * topic body references with one line, `[[example <id>]]`, and that the page
 * renders as a mini keyboard + staff with a ▶ button (the DOM mounter is a
 * separate module; this one is pure, Node-runnable, no DOM).
 *
 * Nothing musical is typed twice. An example is authored as a chord symbol,
 * a bass and EITHER a spelled voicing OR a shape (degrees + layout above the
 * bass, as voicing-explore.js applyShape takes); the degree of every note,
 * the display symbol and the synthetic one-bar progression that the staff
 * model and the playback model consume are derived here through the engine's
 * own helpers (parseSymbol, namedVsPlayed, shapeKey, applyShape). selfTest()
 * holds the invariants, so notes, degrees and labels can never disagree.
 *
 * Registry:
 *   EXAMPLES[id] = {
 *     symbol,            chord symbol parseSymbol() understands ("C7", "E♭7", "Gm7/F")
 *     bass,              spelled note with octave ("C2")
 *     voicing | shape,   voicing: spelled notes with octaves, ascending;
 *                        shape: { degrees: ['3','7'], aboveBass: [16, 22] } (applyShape)
 *     label,             shown above the block; must contain the chord's display name
 *     roll?,             true: the ▶ rolls the chord (comp event arp: true)
 *     tempo?,            BPM for playback (DEFAULT_EXAMPLE_TEMPO)
 *     key?,              key signature of the engraved bar (default EXAMPLE_KEY, "C": every accidental shown)
 *     piece?, bar?, event?, matches?, bassSource?
 *                        "see it in a piece": a PUBLIC_PIECES name, a written bar
 *                        number and a 1-BASED comp event (default 1). matches: true
 *                        makes the link strict — the fixture event's bass + voicing
 *                        must equal the example's notes and its bass must be a real
 *                        one (bassSource 'voice' or 'carried'); otherwise the link is
 *                        "related" and only has to exist. bassSource is the fixture
 *                        event's value (default 'voice', the schema's meaning of an
 *                        absent field); selfTest checks it against the fixture, and
 *                        the page says "(bass inferred)" when it is 'inferred'.
 *     wide?, doubled?    relax the span / repeated-pitch-class invariants (selfTest)
 *   }
 *
 * Exports:
 *   EXAMPLES, PUBLIC_PIECES, EXAMPLE_KEY, DEFAULT_EXAMPLE_TEMPO, EXAMPLE_BEATS
 *   getExample(id)        → authored entry | null
 *   resolveExample(id)    → { id, symbol, display, parsed, bass, bassMidi, bassDegree, voicing, midis, degrees,
 *                             notes, shape, label, roll, tempo, link, progression } | null for an unknown id
 *                           link = { piece, bar, event, kind: 'related' | 'strict', bassSource, title, url } | null
 *                           (throws for a malformed entry — the self-test turns that into a failure)
 *   exampleBlockHtml(id)  → '<div class="learn-example" data-example="<id>"></div>', or a visible
 *                           error placeholder for an unknown id (never throws)
 *   exampleBlockHook      → mini-markdown renderBlock hook: the one-line block `[[example <id>]]`
 *                           becomes exampleBlockHtml(id); anything else returns null
 *   exampleRefs(markdown) → ids referenced by [[example …]] anywhere in a Markdown string (block or inline)
 *   pieceUrl(link)        → '/voicings?piece=<piece>&bar=<bar>&event=<event>'
 *   selfTest()
 *
 * Self-test (from the repo root, public fixtures only):
 *   node --input-type=module -e "import('./static/shared/learn-example.js').then(m => m.selfTest())"
 */

import { parseNote, parseSymbol, namedVsPlayed } from './voicing-analysis.js';
import { shapeKey, applyShape, MIN_ABOVE_BASS, DEFAULT_MAX_SPAN } from './voicing-explore.js';
import { escapeHtml } from './mini-markdown.js';
import { voicingsUrl } from './voicing-url.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const DEFAULT_EXAMPLE_TEMPO = 90;   // BPM: a whole-bar chord in 4/4 sounds for 2.67 s
const EXAMPLE_KEY = 'C';            // no key signature: every accidental is engraved where it sounds
const EXAMPLE_BEATS = 4;            // the synthetic bar is one 4/4 bar; the chord holds it all
const PIANO_LOW = 21, PIANO_HIGH = 108;   // A0 … C8
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const BLOCK_RE = /^\[\[example\s+([a-z0-9][a-z0-9-]*)\]\]$/;
const REF_RE = /\[\[example\s+([^\]\s]+)\s*\]\]/g;
const BASS_SOURCES = ['voice', 'carried', 'inferred'];
const REAL_BASS = ['voice', 'carried'];   // a strict link needs one of these

/**
 * Pieces an example may link to: committed public fixtures only
 * (tests/fixtures/voicing-<name>.json, served by /voicings/data/<name>).
 * The private piece is never listed. selfTest checks each fixture exists and
 * that `title` matches the file's own title.
 */
const PUBLIC_PIECES = {
  'maple-leaf-rag': { title: 'Maple Leaf Rag (A strain)', fixture: 'voicing-maple-leaf-rag.json' },
  'fixture':        { title: 'Voicing analysis fixture',  fixture: 'voicing-fixture.json' },
};

// ════════════════════════════════════════════════════════════════════
// REGISTRY
// ════════════════════════════════════════════════════════════════════

const EXAMPLES = {
  // The textbook shell: root in the bass, 3rd and ♭7 above, no 5th. The rag
  // plays the same shape on E♭7 (bar 12, second event) — related, not identical.
  'c7-shell-3-below-7': {
    symbol: 'C7', bass: 'C2', voicing: ['E3', 'B♭3'],
    label: 'C7 shell — 3rd below the 7th',
    piece: 'maple-leaf-rag', bar: 12, event: 2, bassSource: 'inferred',
  },
  // The same two guide tones the other way up.
  'c7-shell-7-below-3': {
    symbol: 'C7', bass: 'C2', voicing: ['B♭3', 'E4'],
    label: 'C7 shell — 7th below the 3rd',
  },
  // Built from a shape, not from notes: the degrees and layout are the
  // definition, the spelled voicing is derived (applyShape).
  'c7-rootless-a-form': {
    symbol: 'C7', bass: 'C2',
    shape: { degrees: ['3', '13', '7', '9'], aboveBass: [16, 21, 22, 26] },
    label: 'C7 rootless A-form — 3, 13, ♭7, 9 over the bass',
  },
  // T1 (chord-tones-and-roles): three close-position seventh chords over
  // C3 that share root and 5th — only the 3rd and 7th change.
  'cmaj7-close': { symbol: 'Cmaj7', bass: 'C3', voicing: ['E3', 'G3', 'B3'],   label: 'Cmaj7 — 1 3 5 7' },
  'c7-close':    { symbol: 'C7',    bass: 'C3', voicing: ['E3', 'G3', 'B♭3'],  label: 'C7 — 1 3 5 ♭7' },
  'cm7-close':   { symbol: 'Cm7',   bass: 'C3', voicing: ['E♭3', 'G3', 'B♭3'], label: 'Cm7 — 1 ♭3 5 ♭7' },
  // T1: the rag's bar 2 as written — the 5th in the bass under a complete
  // E♭7. The fixture event's bass is a real bass-voice note, so the link is
  // strict: these are exactly the notes the rag plays.
  'eb7-over-bb-rag': {
    symbol: 'E♭7/B♭', bass: 'B♭2', voicing: ['E♭3', 'G3', 'D♭4'],
    label: 'E♭7/B♭ — the 5th in the bass (Maple Leaf Rag, bar 2)',
    piece: 'maple-leaf-rag', bar: 2, event: 1, matches: true, bassSource: 'voice',
  },
  // The notes the rag plays at bar 16, second event — but the fixture's bass
  // there is inferred (the lowest chord note, no bass line under it), so the
  // link is related, not strict. No E♭7 event with a real bass is a shell:
  // bars 2 and 4 put the 5th in the bass with the root above.
  'eb7-shell-in-the-rag': {
    symbol: 'E♭7', bass: 'E♭3', voicing: ['G3', 'D♭4'],
    label: 'E♭7 shell as the rag plays it',
    piece: 'maple-leaf-rag', bar: 16, event: 2, bassSource: 'inferred',
  },
};

// ════════════════════════════════════════════════════════════════════
// RESOLUTION
// ════════════════════════════════════════════════════════════════════

function getExample(id) { return Object.prototype.hasOwnProperty.call(EXAMPLES, id) ? EXAMPLES[id] : null; }

/** '/voicings?piece=maple-leaf-rag&bar=12&event=2' (event 1-based, as the page shows it; voicing-url.js builds and parses it). */
function pieceUrl(link) {
  return voicingsUrl({ piece: link.piece, bar: link.bar, event: link.event });
}

const fail = (id, what) => { throw new Error(`learn-example ${id}: ${what}`); };

/**
 * Everything a block needs, derived from the authored entry. null for an
 * unknown id; throws for an entry the engine cannot resolve.
 */
function resolveExample(id) {
  const ex = getExample(id);
  if (!ex) return null;
  const parsed = parseSymbol(ex.symbol);
  if (!parsed) fail(id, `symbol "${ex.symbol}" is not understood`);
  const bass = parseNote(ex.bass);
  if (!bass || bass.midi == null) fail(id, `bass "${ex.bass}" needs a spelled note with an octave`);
  if (!!ex.voicing === !!ex.shape) fail(id, 'needs exactly one of voicing / shape');

  let voicing;
  if (ex.shape) {
    const r = applyShape(ex.shape, parsed, ex.bass);
    if (!r.ok) fail(id, `shape does not fit ${parsed.display}: ${r.reason}`);
    voicing = r.voicing;
  } else {
    if (!Array.isArray(ex.voicing) || !ex.voicing.length) fail(id, 'voicing must be a non-empty array');
    voicing = ex.voicing.slice();
  }
  const parsedVoicing = voicing.map(n => parseNote(n));
  parsedVoicing.forEach((p, i) => { if (!p || p.midi == null) fail(id, `voicing note "${voicing[i]}" needs a spelled note with an octave`); });
  const midis = parsedVoicing.map(p => p.midi);

  // Degrees: the engine's named-vs-played labels, by written spelling.
  const nvp = namedVsPlayed(parsed, [ex.bass, ...voicing]);
  const degreeByPC = new Map([...nvp.present, ...nvp.added].map(e => [e.pc, e.degree]));
  const degreeOf = p => degreeByPC.get(p.pc) ?? '?';
  const degrees = parsedVoicing.map(degreeOf);
  const bassDegree = degreeOf(bass);
  const notes = [
    { name: bass.name + bass.octave, midi: bass.midi, degree: bassDegree, role: 'bass' },
    ...parsedVoicing.map((p, i) => ({ name: voicing[i], midi: p.midi, degree: degrees[i], role: 'voicing' })),
  ];

  const tempo = Number(ex.tempo) || DEFAULT_EXAMPLE_TEMPO;
  const roll = !!ex.roll;
  const key = ex.key || EXAMPLE_KEY;

  let link = null;
  if (ex.piece != null || ex.bar != null || ex.event != null || ex.matches || ex.bassSource) {
    if (!ex.piece || !Number.isInteger(ex.bar)) fail(id, 'a piece link needs piece and bar (event defaults to 1)');
    const event = ex.event ?? 1;
    if (!Number.isInteger(event) || event < 1) fail(id, 'event is 1-based');
    const bassSource = ex.bassSource || 'voice';
    if (!BASS_SOURCES.includes(bassSource)) fail(id, `bassSource "${bassSource}" is not voice | carried | inferred`);
    if (ex.matches && !REAL_BASS.includes(bassSource)) fail(id, `a strict link needs a real bass, not "${bassSource}"`);
    const known = PUBLIC_PIECES[ex.piece];
    link = { piece: ex.piece, bar: ex.bar, event, kind: ex.matches ? 'strict' : 'related', bassSource, title: known ? known.title : ex.piece };
    link.url = pieceUrl(link);
  }

  // One synthetic bar in the shape tools/voicings/schema.md describes, so
  // buildBarModel() (staff) and buildPlaybackList() (▶) take it unchanged.
  const progression = {
    schemaVersion: 1, title: ex.label, key, timeSignature: `${EXAMPLE_BEATS}/4`, beatsPerBar: EXAMPLE_BEATS, tempo,
    bars: [{
      bar: 1, section: 'Example', source: 'user',
      symbols: [{ beat: 0, symbol: ex.symbol }], annotation: null,
      comp: [{ beat: 0, dur: EXAMPLE_BEATS, bass: ex.bass, bassSource: 'voice', voicing: voicing.slice(), ...(roll ? { arp: true } : {}) }],
      // The bass as a bassLine note: the staff's bass voice, and (flagged arp
      // with the chord) the note that leads a roll — the playback model's rule.
      bassLine: [{ beat: 0, dur: EXAMPLE_BEATS, note: ex.bass, ...(roll ? { arp: true } : {}) }],
      melody: [],
    }],
  };

  return {
    id, symbol: ex.symbol, display: parsed.display, parsed,
    bass: ex.bass, bassMidi: bass.midi, bassDegree,
    voicing, midis, degrees, notes,
    shape: shapeKey(voicing, ex.bass, parsed),   // { key, degrees (class form), aboveBass, count }; selfTest checks a shape-built example round-trips
    label: ex.label, roll, tempo, link, progression,
  };
}

// ════════════════════════════════════════════════════════════════════
// MARKDOWN
// ════════════════════════════════════════════════════════════════════

/** Placeholder the page mounts a widget into. An unknown id renders a visible notice instead of throwing. */
function exampleBlockHtml(id) {
  const safe = escapeHtml(id);
  if (!getExample(id)) return `<div class="learn-example learn-example--missing" data-example="${safe}">Example “${safe}” is not in the registry.</div>`;
  return `<div class="learn-example" data-example="${safe}"></div>`;
}

/** mini-markdown renderBlock hook: a block that is exactly `[[example <id>]]` on one line; null otherwise. */
function exampleBlockHook(block) {
  const m = typeof block === 'string' ? block.match(BLOCK_RE) : null;
  return m ? exampleBlockHtml(m[1]) : null;
}

/** Every id written as [[example …]] in a Markdown string, block-level or not (for registry checks). */
function exampleRefs(markdown) {
  return [...String(markdown ?? '').matchAll(REF_RE)].map(m => m[1]);
}

export {
  EXAMPLES, PUBLIC_PIECES, EXAMPLE_KEY, DEFAULT_EXAMPLE_TEMPO, EXAMPLE_BEATS,
  getExample, resolveExample, exampleBlockHtml, exampleBlockHook, exampleRefs, pieceUrl, selfTest,
};

// ════════════════════════════════════════════════════════════════════
// SELF-TEST (node only — never auto-runs; public fixtures only)
// ════════════════════════════════════════════════════════════════════

async function selfTest() {
  const fs = await import('node:fs');
  const { buildBarModel } = await import('./voicing-staff-model.js');
  const { buildPlaybackList, toSchedule } = await import('./voicing-playback-model.js');
  const { renderMarkdown } = await import('./mini-markdown.js');
  let passed = 0, total = 0;
  const check = (name, ok, detail = '') => { total++; if (ok) passed++; console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); };
  const fixturePath = file => new URL(`../../tests/fixtures/${file}`, import.meta.url);
  const loadFixture = file => JSON.parse(fs.readFileSync(fixturePath(file), 'utf8'));
  const midiOf = n => parseNote(n)?.midi ?? null;

  console.log('\n─── learn-example.js self-test ───\n');

  // ── Registry shape ─────────────────────────────────────────────
  const ids = Object.keys(EXAMPLES);
  check('registry has examples', ids.length > 0);
  check('every id is a slug', ids.every(id => ID_RE.test(id)), ids.filter(id => !ID_RE.test(id)).join(', '));
  const malformed = ids.filter(id => { const e = EXAMPLES[id]; return !e.symbol || !e.bass || !e.label || !!e.voicing === !!e.shape; });
  check('every example has symbol, bass, label and exactly one of voicing / shape', !malformed.length, malformed.join(', '));

  // ── Resolution ─────────────────────────────────────────────────
  const resolved = {}, errors = [];
  for (const id of ids) { try { resolved[id] = resolveExample(id); } catch (err) { errors.push(err.message); } }
  check('every example resolves', !errors.length, errors.join('; '));
  const R = Object.values(resolved);
  const bad = (name, pred, detail = r => r.id) => { const hits = R.filter(r => !pred(r)); check(name, !hits.length, hits.map(detail).join('; ')); };

  bad('bass and every voicing note parse with an octave', r => r.bassMidi != null && r.midis.every(m => m != null));
  bad('voicing ascending', r => r.midis.every((m, i) => i === 0 || m > r.midis[i - 1]));
  bad(`lowest voicing note ≥ bass + MIN_ABOVE_BASS (${MIN_ABOVE_BASS})`, r => r.midis[0] >= r.bassMidi + MIN_ABOVE_BASS);
  bad(`span ≤ DEFAULT_MAX_SPAN (${DEFAULT_MAX_SPAN}) unless wide`, r => EXAMPLES[r.id].wide || r.midis[r.midis.length - 1] - r.midis[0] <= DEFAULT_MAX_SPAN);
  bad('every midi on the piano (21–108)', r => [r.bassMidi, ...r.midis].every(m => m >= PIANO_LOW && m <= PIANO_HIGH));
  bad('no repeated pitch class unless doubled', r => EXAMPLES[r.id].doubled || new Set([r.bassMidi, ...r.midis].map(m => m % 12)).size === r.midis.length + 1);
  bad('label contains the display symbol', r => r.label.includes(r.display), r => `${r.id}: "${r.label}" lacks ${r.display}`);
  const DEGREE_RE = /^(R|[♭♯]{0,2}(2|3|4|5|6|7|9|11|13))$/;
  bad('every degree is derived and known', r => r.bassDegree !== '?' && r.degrees.every(d => DEGREE_RE.test(d)), r => `${r.id}: ${[r.bassDegree, ...r.degrees].join(' ')}`);
  bad('one degree per voicing note', r => r.degrees.length === r.voicing.length && r.notes.length === r.voicing.length + 1);
  const shapeBuilt = R.filter(r => EXAMPLES[r.id].shape);
  check('at least one shape-built example', shapeBuilt.length > 0);
  const rt = shapeBuilt.filter(r => { const k = shapeKey(r.voicing, r.bass, r.parsed); return !k || k.key !== `${EXAMPLES[r.id].shape.degrees.join('-')}@${EXAMPLES[r.id].shape.aboveBass.join('.')}`; });
  check('shape-built voicings round-trip to the same shapeKey', !rt.length, rt.map(r => `${r.id}: ${shapeKey(r.voicing, r.bass, r.parsed)?.key}`).join('; '));
  bad('shape reported for every example (with key)', r => r.shape && r.shape.key && r.shape.degrees.length === r.voicing.length);

  // Spot checks: the seed examples say what the topics will say.
  const s1 = resolved['c7-shell-3-below-7'], s2 = resolved['c7-shell-7-below-3'], s3 = resolved['c7-rootless-a-form'], s4 = resolved['eb7-shell-in-the-rag'];
  check('C7 shell: R in the bass, 3 and ♭7 above', s1 && s1.bassDegree === 'R' && s1.degrees.join(' ') === '3 ♭7' && s2 && s2.degrees.join(' ') === '♭7 3');
  check('rootless A-form derives E3 A3 B♭3 D4 = 3 13 ♭7 9', s3 && s3.voicing.join(' ') === 'E3 A3 B♭3 D4' && s3.degrees.join(' ') === '3 13 ♭7 9');
  check('E♭7 shell spells its ♭7 as D♭', s4 && s4.display === 'E♭7' && s4.degrees.join(' ') === '3 ♭7' && s4.voicing[1] === 'D♭4');

  // ── Piece links ────────────────────────────────────────────────
  const pieceProblems = [];
  for (const [name, p] of Object.entries(PUBLIC_PIECES)) {
    if (!/^[a-z0-9-]+$/.test(name)) pieceProblems.push(`${name}: not a piece name`);
    else if (!fs.existsSync(fixturePath(p.fixture))) pieceProblems.push(`${name}: no fixture ${p.fixture}`);
    else if (loadFixture(p.fixture).title !== p.title) pieceProblems.push(`${name}: title "${p.title}" ≠ fixture "${loadFixture(p.fixture).title}"`);
  }
  check('PUBLIC_PIECES: every piece has a committed fixture with the same title', !pieceProblems.length, pieceProblems.join('; '));
  const linked = R.filter(r => r.link);
  check('seed covers both link kinds and every link exposes bassSource', linked.some(r => r.link.kind === 'related') && linked.some(r => r.link.kind === 'strict') && linked.every(r => BASS_SOURCES.includes(r.link.bassSource)));
  const t1 = ['cmaj7-close', 'c7-close', 'cm7-close'].map(id => resolved[id]);
  check('T1 close voicings: C3 = R, degrees 3 5 7 / 3 5 ♭7 / ♭3 5 ♭7', t1.every(r => r && r.bassDegree === 'R') && t1.map(r => r.degrees.join(' ')).join(' | ') === '3 5 7 | 3 5 ♭7 | ♭3 5 ♭7');
  const s5 = resolved['eb7-over-bb-rag'];
  check('E♭7/B♭: bass B♭2 = 5, E♭3 = R, G3 = 3, D♭4 = ♭7, strict link to rag 2.1', s5 && s5.display === 'E♭7/B♭' && s5.bassDegree === '5' && s5.degrees.join(' ') === 'R 3 ♭7' && s5.link.kind === 'strict' && s5.link.bar === 2 && s5.link.event === 1);
  const linkProblems = [];
  for (const r of linked) {
    const { piece, bar, event, kind } = r.link;
    const known = PUBLIC_PIECES[piece];
    if (!known) { linkProblems.push(`${r.id}: piece "${piece}" is not public`); continue; }
    const prog = loadFixture(known.fixture);
    const b = prog.bars.find(x => x.bar === bar);
    if (!b) { linkProblems.push(`${r.id}: ${piece} has no bar ${bar}`); continue; }
    const ev = (b.comp || [])[event - 1];
    if (!ev) { linkProblems.push(`${r.id}: ${piece} bar ${bar} has no event ${event} (1-based; ${(b.comp || []).length} events)`); continue; }
    const fixtureSource = ev.bassSource || 'voice';
    if (r.link.bassSource !== fixtureSource) linkProblems.push(`${r.id}: link says bassSource ${r.link.bassSource}, fixture event has ${fixtureSource}`);
    if (kind === 'strict' && !REAL_BASS.includes(fixtureSource)) linkProblems.push(`${r.id}: strict link on an event whose bass is ${fixtureSource}`);
    if (kind === 'strict') {
      const same = midiOf(ev.bass) === r.bassMidi && parseNote(ev.bass).name === parseNote(r.bass).name
        && (ev.voicing || []).length === r.voicing.length
        && (ev.voicing || []).every((n, i) => midiOf(n) === r.midis[i] && parseNote(n).name === parseNote(r.voicing[i]).name);
      if (!same) linkProblems.push(`${r.id}: strict link but ${piece} bar ${bar} event ${event} plays ${ev.bass} [${(ev.voicing || []).join(' ')}], not ${r.bass} [${r.voicing.join(' ')}]`);
    }
    if (r.link.url !== `/voicings?piece=${piece}&bar=${bar}&event=${event}`) linkProblems.push(`${r.id}: url ${r.link.url}`);
    if (r.link.title !== known.title) linkProblems.push(`${r.id}: title ${r.link.title}`);
  }
  check('every piece link resolves (public piece, bar, 1-based event, bassSource; strict links match the notes on a real bass)', !linkProblems.length, linkProblems.join('; '));
  // Strict links refuse an inferred bass at resolve time too (synthetic entries; the registry keeps none that would fail).
  EXAMPLES['__strict-inferred'] = { ...EXAMPLES['eb7-shell-in-the-rag'], matches: true };
  EXAMPLES['__strict-voice'] = { symbol: 'E♭7/B♭', bass: 'B♭2', voicing: ['E♭3', 'G3', 'D♭4'], label: 'E♭7/B♭ as written', piece: 'maple-leaf-rag', bar: 2, event: 1, matches: true };
  try {
    let threw = false; try { resolveExample('__strict-inferred'); } catch (_) { threw = true; }
    const ok = resolveExample('__strict-voice');
    check('strict link: inferred bass is refused, a voice bass resolves', threw && ok && ok.link.kind === 'strict' && ok.link.bassSource === 'voice');
    const b2 = loadFixture(PUBLIC_PIECES['maple-leaf-rag'].fixture).bars.find(b => b.bar === 2).comp[0];
    check('strict link check: rag bar 2 event 1 really is B♭2 [E♭3 G3 D♭4] with a voice bass', b2.bass === 'B♭2' && b2.voicing.join(' ') === 'E♭3 G3 D♭4' && (b2.bassSource || 'voice') === 'voice');
  } finally { delete EXAMPLES['__strict-inferred']; delete EXAMPLES['__strict-voice']; }
  const mkLink = { piece: 'maple-leaf-rag', bar: 12, event: 2 };
  check('pieceUrl format', pieceUrl(mkLink) === '/voicings?piece=maple-leaf-rag&bar=12&event=2');

  // ── The synthetic progression feeds the staff and the player ───
  const modelProblems = [];
  for (const r of R) {
    const model = buildBarModel(r.progression, 1);
    if (!model) { modelProblems.push(`${r.id}: no bar model`); continue; }
    if (model.warnings.length) modelProblems.push(`${r.id}: ${model.warnings.join('; ')}`);
    const drawn = [model.voices.bass, model.voices.lower, model.voices.upper].flat().filter(e => !e.rest).flatMap(e => e.notes.map(n => n.midi)).sort((a, b) => a - b);
    const want = [r.bassMidi, ...r.midis].sort((a, b) => a - b);
    if (drawn.join() !== want.join()) modelProblems.push(`${r.id}: staff draws ${drawn.join(' ')}, wants ${want.join(' ')}`);
    if (model.symbols.length !== 1 || model.symbols[0].text !== r.display) modelProblems.push(`${r.id}: symbol ${JSON.stringify(model.symbols)}`);
  }
  check('staff model engraves exactly the example notes with its symbol', !modelProblems.length, modelProblems.join('; '));
  const playProblems = [];
  for (const r of R) {
    const list = buildPlaybackList(r.progression, 1, { scope: 'event', eventIndex: 0 });
    if (list.warnings.length) playProblems.push(`${r.id}: ${list.warnings.join('; ')}`);
    const midis = list.notes.map(n => n.midi).sort((a, b) => a - b);
    if (midis.join() !== [r.bassMidi, ...r.midis].sort((a, b) => a - b).join()) playProblems.push(`${r.id}: plays ${midis.join(' ')}`);
    if (!list.notes.every(n => n.start === 0 && n.duration === EXAMPLE_BEATS)) playProblems.push(`${r.id}: not one held attack`);
    const sched = toSchedule(list);
    if (Math.abs(sched.duration - EXAMPLE_BEATS * 60 / r.tempo) > 1e-6) playProblems.push(`${r.id}: schedule ${sched.duration}s`);
  }
  check('playback list is one held attack of exactly the example notes', !playProblems.length, playProblems.join('; '));
  // A rolled example (synthetic, so the registry need not carry one): every note joins the roll.
  const rolled = { ...EXAMPLES['c7-shell-3-below-7'], roll: true, tempo: 120 };
  EXAMPLES['__rolled'] = rolled;
  try {
    const r = resolveExample('__rolled');
    const list = buildPlaybackList(r.progression, 1, { scope: 'event', eventIndex: 0 });
    const sched = toSchedule(list);
    const bassNote = list.notes.find(n => n.role === 'bass');
    check('roll: comp event and bassLine are arp, the bass leads, every note rolls, attacks spread', r.roll && r.progression.bars[0].comp[0].arp === true
      && list.notes.length === 3 && list.notes.every(n => n.roll && n.roll.count === 3) && bassNote && bassNote.roll.index === 0
      && new Set(sched.notes.map(n => n.time)).size === 3 && r.tempo === 120);
  } finally { delete EXAMPLES['__rolled']; }

  // ── Markdown integration ───────────────────────────────────────
  check('resolveExample unknown → null', resolveExample('nope') === null);
  check('exampleBlockHtml known', exampleBlockHtml('c7-shell-3-below-7') === '<div class="learn-example" data-example="c7-shell-3-below-7"></div>');
  check('exampleBlockHtml unknown is a visible, escaped placeholder', exampleBlockHtml('<x>').includes('learn-example--missing') && exampleBlockHtml('<x>').includes('&lt;x&gt;') && !exampleBlockHtml('<x>').includes('<x>'));
  check('hook matches the one-line block only', exampleBlockHook('[[example c7-shell-3-below-7]]') === exampleBlockHtml('c7-shell-3-below-7')
    && exampleBlockHook('see [[example c7-shell-3-below-7]]') === null && exampleBlockHook('[[example c7-shell-3-below-7]]\nmore') === null
    && exampleBlockHook('[[example Bad_Id]]') === null && exampleBlockHook('') === null);
  const md = '\n    Intro.\n\n    [[example c7-shell-3-below-7]]\n\n    Inline [[example c7-shell-3-below-7]] stays text.\n\n    [[example nope]]\n  ';
  const html = renderMarkdown(md, { renderBlock: exampleBlockHook });
  check('renderMarkdown with the hook: block → placeholder, inline literal, unknown → notice',
    html.split('\n')[1] === exampleBlockHtml('c7-shell-3-below-7') && html.includes('<p>Inline [[example c7-shell-3-below-7]] stays text.</p>') && html.includes('learn-example--missing'));
  check('exampleRefs lists block and inline references', exampleRefs(md).join(',') === 'c7-shell-3-below-7,c7-shell-3-below-7,nope' && exampleRefs('').length === 0);

  console.log(`\n${ids.length} examples (${shapeBuilt.length} shape-built, ${linked.length} linked); ${Object.keys(PUBLIC_PIECES).length} public pieces`);
  console.log(`\n─── ${passed}/${total} passed ───\n`);
  return { passed, total };
}
