"""
Flask Web UI for the Relative Key Trainer.

Audio recording happens in the browser via Web Audio API / MediaRecorder.
The browser uploads audio files to the backend for DSP processing.

Routes:
    GET  /                  — Dashboard (single-page app)
    POST /play              — Receive uploaded audio → detect chord + pitch → score → JSON
    POST /process_audio_chunk — Receive raw Float32 audio chunk → detect pitch → JSON
    GET  /status            — Leaderboard + challenges dict
    POST /api/chat          — Proxy to Anthropic API (key kept server-side)
                              Set ANTHROPIC_API_KEY in Railway environment variables for production.
"""

from datetime import datetime
import io
import os
import struct
import time

from dotenv import load_dotenv
load_dotenv()  # loads .env in local dev; no-op in production

import numpy as np
import librosa
import requests as http_requests
from flask import Flask, jsonify, redirect, render_template, request

from chord_detector import ChordDetector
from game_engine import (
    CHALLENGES,
    SAMPLE_RATE,
    SILENCE_RMS,
    _compute_score,
    _display_root,
    _load_scores,
    _save_score,
)
from pitch_matcher import PitchMatcher

# ---------------------------------------------------------------------------
# App + singletons
# ---------------------------------------------------------------------------
app = Flask(__name__)

# ---------------------------------------------------------------------------
# Rate limiting (in-memory, per-IP, max 30 req/min) — no extra dependencies
# ---------------------------------------------------------------------------
_rate_limit: dict[str, list[float]] = {}
_RATE_LIMIT_MAX = 30
_RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(ip: str) -> bool:
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW

    # Filter to timestamps within the current window
    _rate_limit[ip] = [t for t in _rate_limit.get(ip, []) if t > window_start]

    # Periodically clean up IPs with no recent requests
    if len(_rate_limit) > 1000:
        stale = [k for k, v in _rate_limit.items() if not v]
        for k in stale:
            del _rate_limit[k]

    if len(_rate_limit[ip]) >= _RATE_LIMIT_MAX:
        return False

    _rate_limit[ip].append(now)
    return True


app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit

detector = ChordDetector(sample_rate=SAMPLE_RATE)
matcher = PitchMatcher(sample_rate=SAMPLE_RATE)


# ---------------------------------------------------------------------------
# AI proxy — keeps ANTHROPIC_API_KEY server-side
# ---------------------------------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Proxy Claude API requests so the API key never reaches the client.

    Expects JSON body: { model, messages, max_tokens, system }
    Returns the Anthropic response JSON directly.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "AI features not configured"}), 503

    ip = request.remote_addr or "unknown"
    if not _check_rate_limit(ip):
        return jsonify({"error": "Rate limit exceeded. Try again in a minute."}), 429

    body = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages")
    if not messages:
        return jsonify({"error": "messages is required"}), 400

    payload = {
        "model": body.get("model", "claude-haiku-4-5-20251001"),
        "messages": messages,
        "max_tokens": min(int(body.get("max_tokens", 300)), 1024),
    }
    if body.get("system"):
        payload["system"] = body["system"]

    try:
        resp = http_requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json=payload,
            timeout=30,
        )
        return jsonify(resp.json()), resp.status_code
    except Exception:
        return jsonify({"error": "Upstream request failed"}), 502


# ---------------------------------------------------------------------------
# Audio chunk processing (replaces sounddevice background thread)
# ---------------------------------------------------------------------------
@app.route("/process_audio_chunk", methods=["POST"])
def process_audio_chunk():
    """
    Receive a raw Float32 audio chunk from the browser and return pitch info.

    Expects multipart/form-data with a 'chunk' file containing raw
    little-endian Float32 PCM samples, or a JSON body with a 'samples' array.
    """
    buf = None

    if "chunk" in request.files:
        raw = request.files["chunk"].read()
        n_samples = len(raw) // 4  # 4 bytes per float32
        buf = np.array(struct.unpack(f"<{n_samples}f", raw), dtype=np.float32)
    elif request.is_json:
        data = request.get_json(force=True)
        samples = data.get("samples", [])
        buf = np.array(samples, dtype=np.float32)

    if buf is None or len(buf) == 0:
        return jsonify({"pitch": None, "volume": 0})

    rms = float(np.sqrt(np.mean(buf ** 2)))
    if rms < SILENCE_RMS:
        return jsonify({"pitch": None, "volume": rms})

    pitch = matcher.detect_pitch(buf)
    return jsonify({"pitch": pitch, "volume": rms})

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/relative")
def relative():
    return render_template("relative.html")

@app.route("/tone-check")
def tone_check():
    return render_template("tone-check.html")

@app.route("/chord-identification")
def chord_identification():
    return render_template("chord-identification.html")

@app.route("/harmony")
def harmony():
    return render_template("harmony.html")

@app.route("/melody")
def melody():
    return render_template("melody.html")

@app.route("/rhythm")
def rhythm():
    return render_template("rhythm.html")

@app.route("/strumming")
def strumming():
    return render_template("strumming.html")

@app.route("/games/chord-walks")
def chord_walks():
    return render_template("relative-key-trainer.html")


@app.route("/games/scale-builder")
def scale_builder():
    return render_template("scale-builder.html")


@app.route("/games/swing-trainer")
def swing_trainer():
    return render_template("games/swing-trainer.html")

@app.route("/skratch-studio")
def skratch():
    return render_template("skratch-studio.html")

@app.route("/skratch-studio/help")
def skratch_help():
    return render_template("skratch-studio-help.html")

@app.route("/skratch-studio/piano-popout")
def skratch_piano_popout():
    return render_template("piano-popout.html")

@app.route("/test_sustain")
def test_sustain():
    return app.send_static_file("skratch-studio/test-sustain.html")

@app.route("/test-tooltips")
def test_tooltips():
    return render_template("test-tooltips.html")

@app.route("/test/shared")
def test_shared():
    return render_template("test-shared.html")


@app.route("/test/fretboard")
def test_fretboard():
    return render_template("test-fretboard.html")


@app.route("/showcase")
def showcase():
    return render_template("showcase.html")


@app.route("/explorer")
def explorer():
    return render_template("explorer.html")


@app.route("/chord-wheel-test")
def chord_wheel_test():
    return render_template("chord-wheel-test.html")


@app.route("/theory/circle-of-fifths")
def theory_circle_of_fifths():
    return render_template("theory/circle-of-fifths.html")


@app.route("/theory/tonal-centers")
def theory_tonal_centers():
    return render_template("theory/tonal-centers.html")


@app.route("/theory/chord-progressions")
def theory_chord_progressions():
    return render_template("theory/chord-progressions.html")


@app.route("/theory/modes")
def theory_modes():
    return render_template("theory/modes.html")


@app.route("/intro")
def intro_hub():
    return render_template("intro/hub.html")


@app.route("/intro/<int:n>")
def intro_chapter(n):
    if n < 1 or n > 5:
        return redirect("/intro")
    return render_template("intro/chapter.html", chapter=n)


@app.route("/play", methods=["POST"])
def play():
    """
    Receive an uploaded audio recording from the browser, run chord + pitch
    detection, and score it.

    Expects multipart/form-data:
        audio            — The audio file (WAV/WebM/OGG blob from MediaRecorder)
        mode             — "identify", "clarity", "tone-check", etc.
        expected_root    — e.g. "E"
        expected_quality — "Major" or "Minor"
        player           — player name (optional, defaults to "Anonymous")
    """
    mode = request.form.get("mode", "identify")
    expected_root = request.form.get("expected_root")
    expected_quality = request.form.get("expected_quality")
    player = request.form.get("player", "Anonymous") or "Anonymous"

    # --- Load uploaded audio ---
    audio_file = request.files.get("audio")
    if audio_file is None:
        return jsonify({"error": "no_audio",
                        "message": "No audio file uploaded."}), 400

    try:
        buf, _ = librosa.load(io.BytesIO(audio_file.read()),
                              sr=SAMPLE_RATE, mono=True)
    except Exception as e:
        return jsonify({"error": "bad_audio",
                        "message": f"Could not decode audio: {e}"}), 400

    rms = float(np.sqrt(np.mean(buf ** 2)))
    if rms < SILENCE_RMS:
        return jsonify({"error": "no_sound",
                        "message": "No sound detected — check your mic."}), 200

    # --- Detect ---
    chord = detector.identify_chord(buf)
    pitch = matcher.detect_pitch(buf)
    ambiguity = chord.get("ambiguity", {})
    
    # --- Mode Support ---
    hit = False
    
    if mode in ("chords", "tone-check"):
        hit = bool(chord["quality"].lower() == expected_quality.lower())
    elif mode == "harmony":
        # Check if the detected pitch is close to the expected harmony note
        raw_freq = request.form.get("expected_pitch_freq")
        expected_pitch_freq = float(raw_freq) if raw_freq else None
        if pitch and pitch.get("note") and expected_pitch_freq:
            cents_from_expected = 1200 * np.log2(pitch["frequency"] / expected_pitch_freq)
            # Within 50 cents (half a semitone) is considered a hit
            hit = bool(abs(cents_from_expected) < 50)
            # override cents_off to be relative to the EXPECTED pitch for scoring UI
            pitch["cents_off"] = float(cents_from_expected)
            pitch["expected_freq"] = float(expected_pitch_freq)
    else:
        # relative identify/clarity modes
        hit = bool((chord["root"] == expected_root and
               chord["quality"] == expected_quality))

    # --- Score ---
    points, breakdown = _compute_score(hit, pitch, ambiguity)

    # --- Persist ---
    _save_score(mode, {
        "player": player,
        "score": points,
        "rounds": 1,
        "mode": mode,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })

    return jsonify({
        "hit": hit,
        "score": points,
        "breakdown": [ln.strip() for ln in breakdown],
        "chord": chord,
        "pitch": pitch,
        "ambiguity": ambiguity,
    })


@app.route("/status")
def status():
    """Return the leaderboard (top 10 per mode) and the challenges dict."""
    scores = _load_scores()

    # Build a serialisable challenges list with display-friendly names
    challenges = {}
    for key, ch in CHALLENGES.items():
        challenges[key] = {
            "major": {
                "root": ch["major"]["root"],
                "display": _display_root(ch["major"]["root"]),
                "quality": ch["major"]["quality"],
            },
            "minor": {
                "root": ch["minor"]["root"],
                "display": _display_root(ch["minor"]["root"]),
                "quality": ch["minor"]["quality"],
            },
            "label": ch["label"],
        }

    return jsonify({"scores": scores, "challenges": challenges})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    import os
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host=host, port=port, debug=debug)
