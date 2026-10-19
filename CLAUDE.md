# SongLab — Claude Code Context

## Working style
For Claude.ai planning/chat sessions: see `docs/WORKING_STYLE.md`
for collaboration conventions, end-of-session protocol, and
session log / status update templates in `docs/templates/`.


## Before every task
1. Read `docs/STATUS.md` — single source of truth for project state
2. Read the relevant spec doc for your task (see STATUS.md for links)

## Reference docs
- `docs/songlab-build-plan.md` — phased build plan (v4) with task prompts
- `docs/audio-architecture.md` — audio & input architecture: detection modalities, client-side DSP, device selection, input provider
- `docs/content-architecture.md` — content model and topic schema
- `docs/keyboard-component-spec.md` — shared keyboard component spec
- `docs/explorer-spec.md` — Explorer panel design and canonical orientation
- `docs/game-engine-spec.md` — game audit, adaptive engine, ResultDetail schemas
- `docs/design-system-reference.md` — CSS tokens, color palette, typography
- `docs/spectrum-panel-spec.md` — Harmonic Resonance FFT visualizer + MIDI input
- `docs/auth-architecture.md` — authentication and user data schema (tbd)
- `docs/beat-field-design.md` — Beat Field design spec
- `docs/cantor-design.md` - Cantor design spec
- `docs/extended-chords-spec.md` - Extended chords spec
- `docs/game-flow-pattern.md` - Game flow pattern specs
- `docs/polyrhythm-trainer-spec.md` - Polyrhythm trainer spec
- `docs/puzzle-paths-spec.md` - Puzzle paths spec
- `docs/visual-engine-spec.md` - Visual engine spec
- `docs/voicing-explorer-spec.md` - Voicing explorer spec




## Rules
- Never run git add, commit, or push — Dustin manages git himself
- Shared JS modules: `static/shared/`
- SkratchLab code: `static/skratch-studio/`
- Games: `static/games/` + `templates/games/`
- Test locally: `python3 app.py` (project venv active) → http://127.0.0.1:5001
  The server reads `PORT` from `.env` (5001 on the Mac mini; macOS AirPlay
  Receiver holds 5000). Don't hardcode 5000 in prompts or test scripts.
- Dev branch: `dev` · Production: `main` (Railway)
