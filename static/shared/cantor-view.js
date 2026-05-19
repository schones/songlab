/**
 * cantor-view.js
 * ==============
 * Presentational visualization of musical input for the /cantor route.
 *
 * Renders directly onto a 3D Tonnetz torus without any classifier:
 *   - Lit triangles fill when all three vertex pitch classes are
 *     currently sounding, colored by intrinsic major/minor geometry.
 *   - Per-note glyphs anchor at the note's lattice point, offset
 *     radially outward by octave above C4, sized by velocity.
 *   - Particle sparkle streams off each glyph while sounding;
 *     anchors fade exponentially on release.
 *
 * Reads from:
 *   - MusicalEventStream (noteAttack / noteRelease)
 *
 * Exposes: class CantorView { init, destroy }
 */

import { MusicalEventStream } from './musical-event-stream.js';

// ── Lattice (3D torus) ────────────────────────────────────────
const GRID_COLS_3D = 12;
const GRID_ROWS_3D = 4;
const NEIGHBOR_OFFSETS_3D = [
  [1, 0], [-1, 0],
  [1, -1], [-1, 1],
  [0, 1], [0, -1],
];
const ROT_X_DEFAULT = 30 * Math.PI / 180;
const ROT_Y_DEFAULT = 45 * Math.PI / 180;
const ROT_Z_DEFAULT = 0;
const TORUS_MAJOR_R = 1.0;
const TORUS_MINOR_R = 0.4;

// ── Glyph / triangle look ────────────────────────────────────────
const GLYPH_RGB = [212, 160, 60];           // #D4A03C — warm gold

// Lit-triangle colors by intrinsic geometric type. NOT chord-quality
// interpretation — every triangle in this.triangles already carries
// `type: 'major' | 'minor'` from lattice construction. Minor runs a
// touch lower alpha so it doesn't dominate when both qualities are lit.
// Both are tuning hooks; expect to revisit values.
const LIT_TRIANGLE_MAJOR = [255, 200, 120, 0.55];  // warm — major triads
const LIT_TRIANGLE_MINOR = [90, 140, 210, 0.50];   // cool — minor triads

// Anchor size base — radius at velocity 0.7. Velocity scales linearly.
const ANCHOR_BASE_R = 14;
const ANCHOR_HALO_F = 2.2;                  // halo radius as multiple of core radius

// Release fade: anchor opacity = exp(-(now - releaseMs) / RELEASE_TAU_MS).
// Drop the entry entirely once it has decayed past RELEASE_LIFE_MS.
const RELEASE_TAU_MS = 200;
const RELEASE_LIFE_MS = 300;

// Octave offset: radial outward from canvas center, in pixels per
// octave above C4. Notes below C4 push toward center (negative).
const OCTAVE_OFFSET_PX = 18;

// ── Particle pool (harmonograph-style) ───────────────────────────
const PARTICLE_POOL = 500;
const PARTICLES_PER_GLYPH_PER_FRAME = 2;    // 1–3 reads cleanly; 2 is the middle
const PARTICLE_LIFE_MIN_S = 0.30;
const PARTICLE_LIFE_MAX_S = 0.60;
const PARTICLE_SPEED_MIN = 0.4;
const PARTICLE_SPEED_MAX = 1.0;
const PARTICLE_SIZE_MIN = 1.8;
const PARTICLE_SIZE_MAX = 3.6;
const PARTICLE_DECEL = 0.95;
const PARTICLE_WIGGLE = 0.35;
const PARTICLE_GLOW_MUL = 6;
const PARTICLE_GLOW_ALPHA_INNER = 0.70;

export class CantorView {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;

    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    // Lattice
    this.nodes = [];
    this.edges = [];
    this.triangles = [];
    this._nodesByPC = Array.from({ length: 12 }, () => []);
    this._nodeBaseR = 8;
    this._nodeScreen = [];

    // Rotation state — pristine baselines and per-frame currents.
    this._rotX = ROT_X_DEFAULT;
    this._rotY = ROT_Y_DEFAULT;
    this._rotZ = ROT_Z_DEFAULT;
    this._currentRotY = ROT_Y_DEFAULT;
    this._currentMajorR = TORUS_MAJOR_R;
    this._projScale = 1;

    // Time accumulator for drift + breathing.
    this._elapsed = 0;
    this._lastFrameMs = null;

    // Sounding-note table: midi → {pitch, velocity, attackMs, releaseMs}.
    // releaseMs is null while held. Released entries linger until
    // (now - releaseMs) > RELEASE_LIFE_MS, then are pruned.
    this._notes = new Map();

    // Particle pool — preallocated, harmonograph-style.
    this.particles = new Array(PARTICLE_POOL);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      this.particles[i] = {
        active: false,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, lifeMax: 1, size: 0,
        r: GLYPH_RGB[0], g: GLYPH_RGB[1], b: GLYPH_RGB[2],
      };
    }
    this._spawnCursor = 0;

    this._rafId = null;
    this._unsubStream = null;
    this._resizeHandler = () => this._resize();
  }

  init(stageElementId) {
    this.container = (typeof stageElementId === 'string')
      ? document.getElementById(stageElementId)
      : stageElementId;
    if (!this.container) return;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._resize();
    window.addEventListener('resize', this._resizeHandler);

    this._unsubStream = MusicalEventStream.subscribe((ev) => this._onMusicalEvent(ev));

    const loop = () => {
      if (!this.ctx) return;
      const now = performance.now();
      if (this._lastFrameMs != null) {
        const dt = (now - this._lastFrameMs) / 1000;
        this._elapsed += dt;
      }
      this._lastFrameMs = now;
      this._render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this._rafId != null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this._unsubStream) { this._unsubStream(); this._unsubStream = null; }
    window.removeEventListener('resize', this._resizeHandler);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this._notes.clear();
    for (let i = 0; i < PARTICLE_POOL; i++) this.particles[i].active = false;
  }

  _resize() {
    if (!this.canvas || !this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const fit = Math.min(this.width, this.height) * 0.35;
    this._projScale = fit / (TORUS_MAJOR_R + TORUS_MINOR_R);

    this._buildLattice();
  }

  // ── Lattice (12×4 toroidal) ─────────────────────────────────────

  _buildLattice() {
    const COLS = GRID_COLS_3D;
    const ROWS = GRID_ROWS_3D;
    const dU = (Math.PI * 2) / COLS;
    const dV = (Math.PI * 2) / ROWS;

    this.nodes = [];
    this._nodesByPC = Array.from({ length: 12 }, () => []);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const u = col * dU;
        const v = row * dV;
        const pc = ((7 * col + 3 * row) % 12 + 12) % 12;
        const idx = this.nodes.length;
        this.nodes.push({ col, row, u, v, pc });
        this._nodesByPC[pc].push(idx);
      }
    }

    const idxAt = (col, row) => row * COLS + col;

    const seen = new Set();
    this.edges = [];
    for (const n of this.nodes) {
      const a = idxAt(n.col, n.row);
      for (const [dc, dr] of NEIGHBOR_OFFSETS_3D) {
        const c2 = ((n.col + dc) % COLS + COLS) % COLS;
        const r2 = ((n.row + dr) % ROWS + ROWS) % ROWS;
        const b = idxAt(c2, r2);
        const key = a < b ? (a + ',' + b) : (b + ',' + a);
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push([a, b]);
      }
    }

    this.triangles = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cNext = (col + 1) % COLS;
        const rPrev = (row - 1 + ROWS) % ROWS;
        const rNext = (row + 1) % ROWS;
        this.triangles.push({
          a: idxAt(col, row),
          b: idxAt(cNext, rPrev),
          c: idxAt(cNext, row),
          type: 'major'
        });
        this.triangles.push({
          a: idxAt(col, row),
          b: idxAt(cNext, row),
          c: idxAt(col, rNext),
          type: 'minor'
        });
      }
    }

    const k = this._projScale;
    this._nodeBaseR = Math.max(4, k * 0.05);

    this._nodeScreen = new Array(this.nodes.length);
    for (let i = 0; i < this.nodes.length; i++) {
      this._nodeScreen[i] = { x: 0, y: 0, nz: 0, alphaFactor: 1 };
    }
  }

  _uvToXYZ(u, v) {
    const R = this._currentMajorR;
    const r = TORUS_MINOR_R;
    const cu = Math.cos(u), su = Math.sin(u);
    const cv = Math.cos(v), sv = Math.sin(v);
    return {
      x: (R + r * cv) * cu,
      y: (R + r * cv) * su,
      z: r * sv,
    };
  }

  _rotate3D(p) {
    let x = p.x, y = p.y, z = p.z;
    const cx = Math.cos(this._rotX), sx = Math.sin(this._rotX);
    let y1 = y * cx - z * sx;
    let z1 = y * sx + z * cx;
    y = y1; z = z1;
    const cy = Math.cos(this._currentRotY), sy = Math.sin(this._currentRotY);
    let x2 = x * cy + z * sy;
    let z2 = -x * sy + z * cy;
    x = x2; z = z2;
    const cz = Math.cos(this._rotZ), sz = Math.sin(this._rotZ);
    let x3 = x * cz - y * sz;
    let y3 = x * sz + y * cz;
    x = x3; y = y3;
    return { x, y, z };
  }

  _projectOrtho(p) {
    const k = this._projScale;
    return {
      screenX: this.width / 2 + k * p.x,
      screenY: this.height / 2 - k * p.y,
      depth: p.z,
    };
  }

  _projectNodes3D() {
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const p = this._rotate3D(this._uvToXYZ(n.u, n.v));
      const s = this._projectOrtho(p);

      const cu = Math.cos(n.u), su = Math.sin(n.u);
      const cv = Math.cos(n.v), sv = Math.sin(n.v);
      const nrm = this._rotate3D({ x: cu * cv, y: su * cv, z: sv });
      const nz = nrm.z;
      const alphaFactor = Math.max(0.2, Math.min(1.0, 0.6 + 0.4 * nz));

      const cache = this._nodeScreen[i];
      cache.x = s.screenX;
      cache.y = s.screenY;
      cache.nz = nz;
      cache.alphaFactor = alphaFactor;
    }
  }

  // ── Input → sounding-note table ─────────────────────────────────

  _onMusicalEvent(ev) {
    if (!ev || typeof ev.pitch !== 'number') return;
    const now = performance.now();
    if (ev.type === 'noteAttack') {
      const v = (typeof ev.velocity === 'number')
        ? Math.max(0, Math.min(1, ev.velocity)) : 0.7;
      this._notes.set(ev.pitch, {
        pitch: ev.pitch,
        velocity: v,
        attackMs: now,
        releaseMs: null,
      });
    } else if (ev.type === 'noteRelease') {
      const entry = this._notes.get(ev.pitch);
      if (entry && entry.releaseMs == null) {
        entry.releaseMs = now;
      }
    }
  }

  // ── Lattice-node lookup ─────────────────────────────────────────
  //
  // Pick the instance of `pc` whose projected screen position is
  // closest to canvas center. Center IS the lattice's visual centroid
  // (by _projectOrtho construction), so this also gives us the natural
  // "outward" direction for octave offset.
  _nodeForPC(pc) {
    const indices = this._nodesByPC[pc];
    if (!indices || indices.length === 0) return null;
    const cx = this.width / 2, cy = this.height / 2;
    let bestIdx = -1, bestDist = Infinity;
    for (const i of indices) {
      const s = this._nodeScreen[i];
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx < 0) return null;
    return this._nodeScreen[bestIdx];
  }

  // Position the glyph: lattice node + radial outward offset by
  // octave above C4 (negative for below).
  _glyphPosition(pitch) {
    const pc = ((pitch % 12) + 12) % 12;
    const node = this._nodeForPC(pc);
    if (!node) return null;
    const octAboveC4 = Math.floor(pitch / 12) - 5;   // midi 60 = C4 → 0
    const cx = this.width / 2, cy = this.height / 2;
    let dx = node.x - cx;
    let dy = node.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) {
      // Node sits on canvas center — no outward direction. Fall back
      // to no offset.
      return { x: node.x, y: node.y, alphaFactor: node.alphaFactor };
    }
    const ux = dx / dist, uy = dy / dist;
    const off = octAboveC4 * OCTAVE_OFFSET_PX;
    return {
      x: node.x + ux * off,
      y: node.y + uy * off,
      alphaFactor: node.alphaFactor,
    };
  }

  // ── Particles ───────────────────────────────────────────────────

  _spawnParticleFromGlyph(x, y) {
    const pool = this.particles;
    for (let n = 0; n < PARTICLE_POOL; n++) {
      const i = (this._spawnCursor + n) % PARTICLE_POOL;
      const p = pool[i];
      if (!p.active) {
        this._spawnCursor = (i + 1) % PARTICLE_POOL;
        const dir = Math.random() * Math.PI * 2;
        const speed = PARTICLE_SPEED_MIN
          + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN);
        const life = PARTICLE_LIFE_MIN_S
          + Math.random() * (PARTICLE_LIFE_MAX_S - PARTICLE_LIFE_MIN_S);
        const size = PARTICLE_SIZE_MIN
          + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN);
        p.active = true;
        p.x = x; p.y = y;
        p.vx = Math.cos(dir) * speed;
        p.vy = Math.sin(dir) * speed;
        p.life = life;
        p.lifeMax = life;
        p.size = size;
        p.r = GLYPH_RGB[0]; p.g = GLYPH_RGB[1]; p.b = GLYPH_RGB[2];
        return;
      }
    }
  }

  _updateAndDrawParticles() {
    const ctx = this.ctx;
    const dt = 1 / 60;
    for (let i = 0; i < PARTICLE_POOL; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }

      const lifeT = p.lifeMax - p.life;
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const perpX = -p.vy / speed;
      const perpY = p.vx / speed;
      const wig = Math.sin(lifeT * 6) * PARTICLE_WIGGLE;
      p.x += p.vx + perpX * wig;
      p.y += p.vy + perpY * wig;
      p.vx *= PARTICLE_DECEL;
      p.vy *= PARTICLE_DECEL;

      const alpha = p.life / p.lifeMax;
      const curSize = p.size * (0.4 + 0.6 * alpha);

      const glowR = curSize * PARTICLE_GLOW_MUL;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
      grad.addColorStop(0, `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha * PARTICLE_GLOW_ALPHA_INNER})`);
      grad.addColorStop(1, `rgba(${p.r}, ${p.g}, ${p.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      const lr = Math.min(255, p.r + 60);
      const lg = Math.min(255, p.g + 60);
      const lb = Math.min(255, p.b + 60);
      ctx.fillStyle = `rgba(${lr}, ${lg}, ${lb}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, curSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  _render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.width, H = this.height;
    const now = performance.now();

    // Drift + breathing.
    const t = this._elapsed;
    this._currentRotY = this._rotY + (Math.PI * 2 / 45) * t;
    const breathFactor = 1 + 0.05 * Math.sin((Math.PI * 2 / 8) * t);
    this._currentMajorR = TORUS_MAJOR_R * breathFactor;

    this._projectNodes3D();

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // ── Substrate: faint toroidal edges + dim node dots ───────────
    const baseR = this._nodeBaseR;
    ctx.lineWidth = 1;
    for (const [ai, bi] of this.edges) {
      const sa = this._nodeScreen[ai];
      const sb = this._nodeScreen[bi];
      const af = (sa.alphaFactor + sb.alphaFactor) * 0.5;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.05 * af).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
    }
    for (let i = 0; i < this.nodes.length; i++) {
      const s = this._nodeScreen[i];
      const af = s.alphaFactor;
      ctx.fillStyle = `rgba(26, 26, 26, ${af.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.06 * af).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Prune released notes past RELEASE_LIFE_MS ─────────────────
    const expired = [];
    for (const [pitch, entry] of this._notes) {
      if (entry.releaseMs != null && now - entry.releaseMs > RELEASE_LIFE_MS) {
        expired.push(pitch);
      }
    }
    for (const p of expired) this._notes.delete(p);

    // ── Build sounding-PC set (only held notes count for triangles) ──
    const soundingPCs = new Set();
    for (const entry of this._notes.values()) {
      if (entry.releaseMs == null) {
        soundingPCs.add(((entry.pitch % 12) + 12) % 12);
      }
    }

    // ── Lit triangles: all-3-PCs-in-sounding-set ──────────────────
    if (soundingPCs.size >= 3) {
      for (const tri of this.triangles) {
        const pa = this.nodes[tri.a];
        const pb = this.nodes[tri.b];
        const pc = this.nodes[tri.c];
        if (pa.pc === pb.pc || pa.pc === pc.pc || pb.pc === pc.pc) continue;
        if (!soundingPCs.has(pa.pc)) continue;
        if (!soundingPCs.has(pb.pc)) continue;
        if (!soundingPCs.has(pc.pc)) continue;
        const sa = this._nodeScreen[tri.a];
        const sb = this._nodeScreen[tri.b];
        const sc = this._nodeScreen[tri.c];
        const af = (sa.alphaFactor + sb.alphaFactor + sc.alphaFactor) / 3;
        const [tr, tg, tb, ta0] = (tri.type === 'major')
          ? LIT_TRIANGLE_MAJOR
          : LIT_TRIANGLE_MINOR;
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${(ta0 * af).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.lineTo(sc.x, sc.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ── Glyph anchors + particle spawn ────────────────────────────
    for (const entry of this._notes.values()) {
      const pos = this._glyphPosition(entry.pitch);
      if (!pos) continue;

      // Anchor opacity: full while held, exp decay after release.
      let releaseFade = 1.0;
      if (entry.releaseMs != null) {
        releaseFade = Math.exp(-(now - entry.releaseMs) / RELEASE_TAU_MS);
      }
      // Velocity scales the anchor's core radius linearly around v=0.7.
      const velScale = 0.5 + entry.velocity;       // v=0.7 → 1.2; v=1 → 1.5; v=0.3 → 0.8
      const coreR = ANCHOR_BASE_R * velScale * (0.6 + 0.4 * pos.alphaFactor);
      const haloR = coreR * ANCHOR_HALO_F;

      const alpha = releaseFade * pos.alphaFactor;
      if (alpha < 0.005) continue;

      const [r, g, b] = GLYPH_RGB;

      // Soft outer halo
      const halo = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, haloR);
      halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.55).toFixed(3)})`);
      halo.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.30).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Hot inner core
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Spawn particles only while sounding. Released anchors continue
      // to fade; their in-flight particles age out naturally.
      if (entry.releaseMs == null) {
        for (let k = 0; k < PARTICLES_PER_GLYPH_PER_FRAME; k++) {
          this._spawnParticleFromGlyph(pos.x, pos.y);
        }
      }
    }

    // ── Particles (topmost) ───────────────────────────────────────
    this._updateAndDrawParticles();
  }
}

export default CantorView;
