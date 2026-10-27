# SongLab

**Harmony has a shape. Explore it.**

SongLab is a music education platform for understanding harmony through
interactive visualization and real songs. See how chords move on the
Tonnetz and the Circle of Fifths, analyse and reshape real piano voicings,
practise with ear-training and keyboard games, and build your own
progressions in SkratchLab.

🎹 **Explorer** (`/explorer`) — Tonnetz, Chord Wheel, Fretboard, Spectrum and
Resonance panels synchronized through a shared harmony engine, with MIDI
and audio-interface input. 18 guided walkthroughs using real songs (Beatles,
Radiohead, Billy Joel, jazz standards, blues) and 84 song examples.

🎼 **Voicings** (`/voicings`) — load a voiced progression and see per-bar
interval tension, rubbing intervals, named-vs-played chord tones and
upper-voice motion on an engraved grand staff, keyboard and Tonnetz; play
it back on a sampled piano; explore and keep alternative voicings. Public
pieces are built from public-domain sheet music (`sources/`, `tools/`).

📖 **Learn** (`/learn`) — short theory explainers behind the Voicings tool
(chord tones and roles, guide tones and shells, the tritone, …) with
playable examples. Early; many topics are stubs.

🎮 **Games** — Harmony Trainer, Chord Spotter, Melody Match, Swing Trainer,
Rhythm Lab, Strum Patterns, Scale Builder, Cycle of Shells (ii–V–I shell
voicings round the cycle from a MIDI keyboard), Chord Walks, Polyrhythm
Trainer. Games accept deep-link params from walkthroughs.

📚 **Fundamentals** (`/intro`) — six-chapter interactive introduction: sound
and notes, intervals and scales, chords, beyond triads, the Tonnetz,
transforms (chapter 6 is a stub). Plus theory pages on the circle of
fifths, tonal centers, modes and chord progressions.

🧱 **SkratchLab** (`/skratchlab`) — block-based music creation with Blockly,
Neo-Riemannian transform blocks (P/L/R), Rhythm Builder and MIDI export.

🔬 **Experimental, unlinked** — `/cantor` (live-performance Tonnetz view)
and `/harmonograph` (audio-reactive generative art).

---

## Quick start

```bash
git clone https://github.com/schones/songlab.git
cd songlab
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # set PORT=5001 if port 5000 is taken (macOS AirPlay Receiver holds it)
python3 app.py
# → http://127.0.0.1:5001
```

`app.py` reads `PORT` from `.env`. There is no hosted deployment at the
moment; development is local.

## Tech stack

- **Backend:** Flask / Jinja2
- **Frontend:** vanilla JS (ES modules), SVG visualizations, Verovio for
  notation
- **Audio:** Tone.js + vendored Salamander piano; Web MIDI; client-side
  pitch/onset/chord detection
- **State:** HarmonyState pub/sub model
- **Music theory:** Neo-Riemannian transforms (P/L/R), interval-content
  chord resolution, voicing analysis engine
- **Block coding:** Blockly (SkratchLab)
- **Tools:** Python (music21, Verovio) for the public-pieces pipeline

## Project structure

```
app.py               # Flask routes
static/
  shared/            # Core modules (harmony-state, transforms, voicing-analysis, explainer registry, …)
  games/             # Game-specific JS
  skratch-studio/    # SkratchLab engine
  intro/             # Fundamentals chapter JS
  css/               # Design tokens + stylesheets
templates/           # Jinja2 templates (explorer, voicings, learn, games, theory, intro)
tools/voicings/      # Build and check voiced-progression JSON for /voicings
tools/pieces/        # Sheet-music → reviewed read pipeline for public pieces
sources/             # Public-domain scans (gitignored) + SOURCES.md
tests/               # Fixtures and test-track generators
docs/                # STATUS, audit, RADAR, specs, session log
```

## Docs

Start with `docs/STATUS.md` (current state) and `docs/AUDIT-2026-10-27.md`
(audit + roadmap). `CLAUDE.md` lists the reference docs.

## License

All rights reserved. © 2025–2026. Piano samples: Salamander Grand Piano by
Alexander Holm, CC BY 3.0.
