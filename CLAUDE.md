# SongLab — Claude Code Context

## Working style
For Claude.ai planning/chat sessions: see `docs/WORKING_STYLE.md`
for collaboration conventions, end-of-session protocol, and
session log / status update templates in `docs/templates/`.


## Before every task
1. Read `docs/STATUS.md` — single source of truth for project state
2. Read the relevant spec doc for your task (see STATUS.md for links)

## Reference docs

**Current (read first for active work)**
- `docs/AUDIT-2026-10-27.md` — platform audit and roadmap (§4 = this week / next)
- `docs/RADAR.md` — cross-cutting threads, scanned at session start
- `docs/active-plans/voicing-explorer-build-plan.md` — Voicing Explorer arc plan + Decisions
- `docs/active-plans/instructional-content.md` — Learn plan: topic order, verification status
- `docs/active-plans/explainer-content.md` — explainer registry drafts (Session 6.5 + Phase 0)
- `tools/voicings/schema.md` — voiced-progression JSON schema (v1) for `/voicings`
- `sources/SOURCES.md` — public-domain scans, PD reasoning, pieces pipeline notes
- `docs/DEV_SETUP.md` — Mac mini + laptop setup (local-only, excluded from git)
- `docs/git-recipes.md` — multi-branch command sequences

**Architecture & specs (still accurate for their area)**
- `docs/audio-architecture.md` — audio & input: detection modalities, client-side DSP, device selection, input provider
- `docs/content-architecture.md` — content model and topic schema
- `docs/keyboard-component-spec.md` — shared keyboard component spec
- `docs/explorer-spec.md` — Explorer panel design and canonical orientation
- `docs/game-engine-spec.md` — game audit, adaptive engine, ResultDetail schemas
- `docs/game-flow-pattern.md` — Learn → Practice → Test pattern (game-flow.js still unextracted)
- `docs/design-system-reference.md` — CSS tokens, color palette, typography
- `docs/spectrum-panel-spec.md` — Harmonic Resonance FFT visualizer + MIDI input
- `docs/extended-chords-spec.md` — extended chord types
- `docs/polyrhythm-trainer-spec.md` — Polyrhythm Trainer spec
- `docs/registry-inventory.md` — chord-type registry audit (draft, June 2026)

**Parked (Cantor)**
- `docs/cantor-design.md`, `docs/cantor-presentational-design.md`,
  `docs/active-plans/cantor-presentational-build-plan.md`
- `docs/beat-field-design.md` — Cantor layer, pre-implementation

**Stale / historical (don't plan from these)**
- `docs/songlab-build-plan.md` — v4 phase plan (April 2026); roadmap moved to the audit
- `docs/voicing-explorer-spec.md` — the March 2026 Explorer "voicing mode" spec (Phase A5), not the `/voicings` page; for `/voicings` use the build plan above
- `docs/auth-architecture.md` — Phase B.5 draft, not started
- `docs/visual-engine-spec.md` — v0.1 (April 9), superseded by Harmonograph as built


## Rules
- Never run git add, commit, or push — Dustin manages git himself
- Shared JS modules: `static/shared/`
- SkratchLab code: `static/skratch-studio/`
- Games: `static/games/` + `templates/games/`
- Test locally: `python3 app.py` (project venv active) → http://127.0.0.1:5001
  The server reads `PORT` from `.env` (5001 on the Mac mini; macOS AirPlay
  Receiver holds 5000). Don't hardcode 5000 in prompts or test scripts.
- Branches: `dev` is the only active branch. `main` is stale (last
  commit 2026-04-12, ~138 behind dev) — don't treat it as production.
- Deploy: none. The Railway project was deleted in Oct 2026; everything
  runs locally on the Mac mini. A fresh deploy comes later (see
  `docs/AUDIT-2026-10-27.md` §3 for the hardening list first).
- Never start the Flask dev server; Dustin runs it in the tmux "flask" session on port 5001.
- Never launch Chrome (headless or otherwise); if a browser check is needed, ask Dustin.
