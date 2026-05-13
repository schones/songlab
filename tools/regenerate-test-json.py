#!/usr/bin/env python3
"""Regenerate per-test JSON specs from the chord/melody test corpus.

Reads ``docs/chord-melody-test-corpus.md`` (the canonical source) and
emits one JSON spec per test under ``tests/chord-melody/specs/`` plus
a ``_manifest.json`` index. The script is strict: if any test fails
to parse, no files are written and the script exits non-zero.

See the corpus markdown's "How JSON specs work" section for the
contract this script implements.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CORPUS_PATH = REPO_ROOT / "docs" / "chord-melody-test-corpus.md"
SPECS_DIR = REPO_ROOT / "tests" / "chord-melody" / "specs"

TEST_HEADING_RE = re.compile(
    r"^### (T[123]\.\d+|C\.\d+|D\.\d+|M\.\d+) — (.+?)\s*$"
)
SECTION_HEADING_RE = re.compile(r"^## ")

TEMPO_BLOCK_RE = re.compile(
    r"\*Tempo:\s*(\d+)\s*BPM[^*]*?Purpose:\s*([^*]*?)\s*\*",
    re.DOTALL,
)
MIDI_MARKER_RE = re.compile(r"\*\*MIDI:\*\*")
EXPECTED_MARKER_RE = re.compile(r"\*\*Expected[^*]*\*\*")
FENCE_RE = re.compile(r"```[A-Za-z0-9_\-]*\s*\n(.*?)\n```", re.DOTALL)
TRAILING_ITALIC_RE = re.compile(r"\n[ \t]*\n+\*([^*]+)\*\s*$", re.DOTALL)

EVENT_KEYWORDS = {"noteAttack", "noteRelease"}
ALLOWED_OPTIONAL_FIELDS = {"velocity", "channel"}
REQUIRED_FIELD_NAMES = {"t", "pitch"}

# NOTE: This structured expected format assumes hard classification
# (single identity per chord interval). The Voicing Explorer's
# probabilistic interpretation thread (see chord-melody-classification.md
# OQ5 resolution and voicing-explorer-spec.md Future Directions)
# will require a schema rev when it lands. The current shape is
# deliberately not pre-designed for that future; rev when there's a
# concrete consumer.
INTERVAL_TIME_RANGE_RE = re.compile(r"^t=(\d+)\s+to\s+t=(\d+):")
INTERVAL_TIME_OPEN_RE = re.compile(r"^t=(\d+)\+:")
STATE_RE = re.compile(r"\bstate=(melody|chord|nothing)\b")
INVALID_STATE_RE = re.compile(r"\bstate=([A-Za-z_][A-Za-z0-9_]*)\b")
IDENTITY_RE = re.compile(r"\bidentity=\(\s*([A-Ga-g][#b♭]?)\s*,\s*([^)]+?)\s*\)")
CONFIDENCE_RE = re.compile(r"\bconfidence=(declared|implied|n/a)\b")
EFFECTIVE_SET_RE = re.compile(r"\beffective_set=\[([^\]]*)\]")

NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
VALID_CONFIDENCES = {"declared", "implied"}


class ParseError(Exception):
    def __init__(self, test_id: str | None, message: str) -> None:
        self.test_id = test_id
        self.message = message
        super().__init__(self._format())

    def _format(self) -> str:
        prefix = f"[{self.test_id}]" if self.test_id else "[?]"
        return f"{prefix} {self.message}"


def derive_tier(test_id: str) -> str:
    return test_id.split(".", 1)[0]


def normalize_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def split_tests(markdown: str) -> list[tuple[str, str, str]]:
    """Split the corpus into ``(test_id, title, body)`` tuples in source order."""
    tests: list[tuple[str, str, str]] = []
    current: tuple[str, str, list[str]] | None = None
    for line in markdown.split("\n"):
        m = TEST_HEADING_RE.match(line)
        if m:
            if current is not None:
                tests.append((current[0], current[1], "\n".join(current[2])))
            current = (m.group(1), m.group(2).strip(), [])
            continue
        if SECTION_HEADING_RE.match(line):
            if current is not None:
                tests.append((current[0], current[1], "\n".join(current[2])))
                current = None
            continue
        if current is not None:
            current[2].append(line)
    if current is not None:
        tests.append((current[0], current[1], "\n".join(current[2])))
    return tests


def parse_midi_line(line: str, line_num: int) -> dict | None:
    """Parse a single MIDI event line. Returns dict, or ``None`` for blank lines."""
    if "//" in line:
        line = line[: line.index("//")]
    line = re.sub(r"\([^)]*\)", " ", line)
    line = line.strip()
    if not line:
        return None

    tokens = line.split()
    if len(tokens) < 3:
        raise ValueError(
            f"line {line_num}: expected at least 3 fields (t=, event, pitch=), "
            f"got {len(tokens)}: {line!r}"
        )

    t_token = tokens[0]
    if not t_token.startswith("t="):
        raise ValueError(
            f"line {line_num}: first field must start with 't=', got {t_token!r}"
        )
    try:
        t_ms = int(t_token[2:])
    except ValueError as exc:
        raise ValueError(
            f"line {line_num}: t value must be integer, got {t_token[2:]!r}"
        ) from exc

    event = tokens[1]
    if event not in EVENT_KEYWORDS:
        raise ValueError(
            f"line {line_num}: unknown event keyword {event!r} "
            f"(expected one of {sorted(EVENT_KEYWORDS)})"
        )

    pitch_token = tokens[2]
    if not pitch_token.startswith("pitch="):
        raise ValueError(
            f"line {line_num}: third field must start with 'pitch=', "
            f"got {pitch_token!r}"
        )
    try:
        pitch = int(pitch_token[len("pitch=") :])
    except ValueError as exc:
        raise ValueError(
            f"line {line_num}: pitch value must be integer, "
            f"got {pitch_token[len('pitch='):]!r}"
        ) from exc

    result: dict = {"t_ms": t_ms, "event": event, "pitch": pitch}

    for token in tokens[3:]:
        if "=" not in token:
            raise ValueError(
                f"line {line_num}: unrecognized token {token!r} (expected key=value)"
            )
        key, _, val = token.partition("=")
        if key in REQUIRED_FIELD_NAMES:
            raise ValueError(
                f"line {line_num}: required field {key + '='!r} appears out of order "
                f"(must come before optional fields)"
            )
        if key not in ALLOWED_OPTIONAL_FIELDS:
            raise ValueError(
                f"line {line_num}: unknown field {key + '='!r} "
                f"(allowed: {sorted(ALLOWED_OPTIONAL_FIELDS)})"
            )
        try:
            result[key] = int(val)
        except ValueError as exc:
            raise ValueError(
                f"line {line_num}: {key} value must be integer, got {val!r}"
            ) from exc

    return result


def parse_midi_block(text: str) -> list[dict]:
    events: list[dict] = []
    errors: list[str] = []
    for i, raw in enumerate(text.split("\n"), start=1):
        try:
            event = parse_midi_line(raw, i)
        except ValueError as e:
            errors.append(str(e))
            continue
        if event is not None:
            events.append(event)
    if errors:
        raise ValueError("MIDI block has invalid lines:\n  " + "\n  ".join(errors))
    return events


def strip_italic_wrapper(text: str) -> str:
    """If text is a single italic span (``*...*``), return the inner content."""
    text = text.strip()
    if len(text) >= 2 and text.startswith("*") and text.endswith("*"):
        inner = text[1:-1]
        if "*" not in inner:
            return inner
    return text


def split_trailing_italics(text: str) -> tuple[str, list[str]]:
    """Peel off all trailing italic-only paragraphs, in source order."""
    notes: list[str] = []
    while True:
        rstripped = text.rstrip()
        m = TRAILING_ITALIC_RE.search(rstripped)
        if not m:
            text = rstripped
            break
        notes.insert(0, m.group(1))
        text = rstripped[: m.start()]
    return text, notes


def normalize_expected_prose(text: str) -> str:
    """Trim leading/trailing blank lines.

    If the marker was on the same line as the first content (e.g.
    ``**Expected:** All three sustain...``), strip the leading delimiter
    whitespace from that first line. Otherwise preserve all internal
    formatting verbatim.
    """
    if not text:
        return ""
    lines = text.split("\n")
    start = 0
    while start < len(lines) and not lines[start].strip():
        start += 1
    end = len(lines)
    while end > start and not lines[end - 1].strip():
        end -= 1
    if start >= end:
        return ""
    selected = list(lines[start:end])
    if start == 0:
        selected[0] = selected[0].lstrip()
    return "\n".join(selected)


def root_name_to_pc(name: str) -> int:
    name = name.strip()
    if not name:
        raise ValueError("empty root name")
    base = name[0].upper()
    if base not in NOTE_PC:
        raise ValueError(f"unknown note letter in {name!r}")
    pc = NOTE_PC[base]
    accidental = name[1:].strip()
    if accidental == "":
        return pc
    if accidental == "#":
        return (pc + 1) % 12
    if accidental in ("b", "♭"):
        return (pc - 1) % 12
    raise ValueError(f"unknown accidental {accidental!r} in root {name!r}")


def split_expected_bullets(text: str) -> list[str]:
    """Split a bulleted Markdown block into per-bullet strings.

    A bullet starts at a line beginning with ``- ``. Subsequent lines
    that don't start a new bullet are treated as continuations of the
    current bullet. Each returned string is the bullet content with
    whitespace collapsed.
    """
    bullets: list[str] = []
    current: list[str] | None = None
    for line in text.split("\n"):
        if line.startswith("- "):
            if current is not None:
                bullets.append(normalize_whitespace(" ".join(current)))
            current = [line[2:]]
        elif current is not None:
            current.append(line.strip())
    if current is not None:
        bullets.append(normalize_whitespace(" ".join(current)))
    return bullets


def parse_expected_bullet(bullet: str) -> dict | None:
    """Parse a single bullet into a structured interval, or return None.

    Returns ``None`` when the bullet's leading shape doesn't match a
    structured interval (``t=<int> to t=<int>:`` or ``t=<int>+:``).
    Raises ``ValueError`` when the bullet has the structured shape but
    invalid content (unknown state, missing identity for chord, etc.).
    """
    m_range = INTERVAL_TIME_RANGE_RE.match(bullet)
    m_open = INTERVAL_TIME_OPEN_RE.match(bullet)
    if m_range:
        from_ms = int(m_range.group(1))
        to_ms: int | None = int(m_range.group(2))
        rest = bullet[m_range.end():]
    elif m_open:
        from_ms = int(m_open.group(1))
        to_ms = None
        rest = bullet[m_open.end():]
    else:
        return None

    state_match = STATE_RE.search(rest)
    if not state_match:
        invalid = INVALID_STATE_RE.search(rest)
        if invalid:
            raise ValueError(
                f"invalid state={invalid.group(1)!r} "
                f"(must be melody/chord/nothing) in bullet: {bullet!r}"
            )
        # No state= field at all — the bullet has a time prefix but
        # carries free-form prose instead of structured fields. Treat
        # as "shape doesn't fit"; classify_expected will demote the
        # whole test to loose-prose.
        return None
    state = state_match.group(1)

    identity_match = IDENTITY_RE.search(rest)
    confidence_match = CONFIDENCE_RE.search(rest)
    effective_set_match = EFFECTIVE_SET_RE.search(rest)

    identity: dict | None = None
    confidence: str | None = None
    if state == "chord":
        if not identity_match:
            raise ValueError(
                f"chord state requires identity=(root, quality) in bullet: {bullet!r}"
            )
        if not confidence_match:
            raise ValueError(
                f"chord state requires confidence=declared|implied "
                f"in bullet: {bullet!r}"
            )
        root_name = identity_match.group(1)
        quality = identity_match.group(2).strip()
        try:
            root_pc = root_name_to_pc(root_name)
        except ValueError as exc:
            raise ValueError(
                f"invalid root in bullet {bullet!r}: {exc}"
            ) from exc
        identity = {"root": root_pc, "quality": quality}
        conf_value = confidence_match.group(1)
        if conf_value not in VALID_CONFIDENCES:
            raise ValueError(
                f"chord state has confidence={conf_value!r} "
                f"(must be declared/implied) in bullet: {bullet!r}"
            )
        confidence = conf_value

    effective_set: list[int] = []
    if effective_set_match:
        inner = effective_set_match.group(1).strip()
        if inner:
            try:
                effective_set = [
                    int(s.strip()) for s in inner.split(",") if s.strip()
                ]
            except ValueError as exc:
                raise ValueError(
                    f"invalid effective_set in bullet {bullet!r}: {exc}"
                ) from exc

    return {
        "from_ms": from_ms,
        "to_ms": to_ms,
        "state": state,
        "identity": identity,
        "confidence": confidence,
        "effective_set": effective_set,
    }


def classify_expected(text: str) -> tuple[list[dict] | None, str | None]:
    """Classify the expected block and parse intervals when structurable.

    Returns ``(intervals, None)`` on a parseable bulleted block,
    ``(None, "dual_block")`` when a second ``**Expected ...:**`` marker
    is present (Tier 3 case), or ``(None, "loose_prose")`` when the
    block has no structurable bullets.

    Raises ``ValueError`` if a bullet has the structured shape but
    invalid content.
    """
    if EXPECTED_MARKER_RE.search(text):
        return None, "dual_block"

    bullets = split_expected_bullets(text)
    if not bullets:
        return None, "loose_prose"

    intervals: list[dict] = []
    for bullet in bullets:
        result = parse_expected_bullet(bullet)
        if result is None:
            return None, "loose_prose"
        intervals.append(result)

    if not intervals:
        return None, "loose_prose"
    return intervals, None


def parse_test(test_id: str, title: str, body: str) -> dict:
    body = body.strip()
    if body.endswith("---"):
        body = body[:-3].rstrip()

    tier = derive_tier(test_id)

    tempo_match = TEMPO_BLOCK_RE.search(body)
    if not tempo_match:
        raise ParseError(
            test_id,
            "could not find leading italic block matching "
            "'*Tempo: <N> BPM. Purpose: ...*'",
        )
    tempo_bpm = int(tempo_match.group(1))
    purpose = normalize_whitespace(tempo_match.group(2))

    midi_match = MIDI_MARKER_RE.search(body, tempo_match.end())
    if not midi_match:
        raise ParseError(test_id, "could not find '**MIDI:**' marker")

    expected_match = EXPECTED_MARKER_RE.search(body, midi_match.end())
    if not expected_match:
        raise ParseError(
            test_id,
            "could not find '**Expected[...]:**' marker after '**MIDI:**'",
        )

    midi_section = body[midi_match.end() : expected_match.start()]
    expected_section = body[expected_match.end() :]

    fence_match = FENCE_RE.search(midi_section)
    if fence_match is not None:
        try:
            midi_events: list[dict] | None = parse_midi_block(fence_match.group(1))
        except ValueError as e:
            raise ParseError(test_id, str(e)) from e
        status = "ok"
        pending_reason: str | None = None
    else:
        prose = strip_italic_wrapper(midi_section.strip())
        pending_reason = normalize_whitespace(prose)
        if not pending_reason:
            raise ParseError(
                test_id,
                "no fenced MIDI block and no prose under '**MIDI:**' "
                "(cannot tell whether this is concrete or pending)",
            )
        midi_events = None
        status = "pending"

    expected_raw, trailing_inners = split_trailing_italics(expected_section)
    expected_prose = normalize_expected_prose(expected_raw)
    trailing_notes = [normalize_whitespace(inner) for inner in trailing_inners]

    if not expected_prose and not trailing_notes:
        raise ParseError(test_id, "expected section is empty")

    try:
        expected_intervals, expected_null_reason = classify_expected(expected_raw)
    except ValueError as exc:
        raise ParseError(test_id, f"expected block: {exc}") from exc

    spec: dict = {
        "id": test_id,
        "title": title,
        "tier": tier,
        "tempo_bpm": tempo_bpm,
        "purpose": purpose,
        "midi": midi_events,
        "expected_prose": expected_prose,
        "expected": expected_intervals,
        "expected_null_reason": expected_null_reason,
        "trailing_notes": trailing_notes,
        "status": status,
    }
    if status == "pending":
        spec["pending_reason"] = pending_reason
    return spec


def parse_corpus(text: str) -> tuple[list[dict], list[ParseError]]:
    raw_tests = split_tests(text)
    specs: list[dict] = []
    errors: list[ParseError] = []
    seen_ids: set[str] = set()
    for test_id, title, body in raw_tests:
        if test_id in seen_ids:
            errors.append(ParseError(test_id, "duplicate test ID"))
            continue
        seen_ids.add(test_id)
        try:
            spec = parse_test(test_id, title, body)
        except ParseError as e:
            errors.append(e)
            continue
        except Exception as e:  # noqa: BLE001 — surface anything unexpected
            errors.append(ParseError(test_id, f"unexpected error: {e!r}"))
            continue
        specs.append(spec)
    return specs, errors


def write_outputs(specs: list[dict]) -> None:
    SPECS_DIR.mkdir(parents=True, exist_ok=True)

    for spec in specs:
        path = SPECS_DIR / f"{spec['id']}.json"
        with path.open("w", encoding="utf-8") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)
            f.write("\n")

    tier_counts: dict[str, int] = {}
    for spec in specs:
        tier_counts[spec["tier"]] = tier_counts.get(spec["tier"], 0) + 1

    manifest = {
        "generated_from": "docs/chord-melody-test-corpus.md",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "test_count": len(specs),
        "tests": [
            {
                "id": s["id"],
                "tier": s["tier"],
                "status": s["status"],
                "file": f"{s['id']}.json",
            }
            for s in specs
        ],
        "tier_counts": tier_counts,
    }
    with (SPECS_DIR / "_manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")


# TODO: extract to a separate test file if this grows past ~50 assertions
# or if parser scope expands substantially.
def run_self_tests() -> int:
    failures: list[str] = []

    def check(label: str, actual, expected) -> None:
        if actual != expected:
            failures.append(
                f"FAIL {label}\n  expected: {expected!r}\n  actual:   {actual!r}"
            )

    # 1. simple melody interval (T1.1 bullet 1 shape)
    iv = parse_expected_bullet("t=0 to t=2000: state=melody, effective_set=[60]")
    check("melody from_ms", iv["from_ms"], 0)
    check("melody to_ms", iv["to_ms"], 2000)
    check("melody state", iv["state"], "melody")
    check("melody identity", iv["identity"], None)
    check("melody confidence", iv["confidence"], None)
    check("melody effective_set", iv["effective_set"], [60])

    # 2. chord with full identity/confidence (T1.3 bullet 1 shape)
    iv = parse_expected_bullet(
        "t=0 to t=2000: state=chord, identity=(C, major), "
        "confidence=declared, effective_set=[60,64,67]"
    )
    check("chord state", iv["state"], "chord")
    check("chord identity", iv["identity"], {"root": 0, "quality": "major"})
    check("chord confidence", iv["confidence"], "declared")
    check("chord effective_set", iv["effective_set"], [60, 64, 67])

    # 3. open-ended interval (t=N+ form)
    iv = parse_expected_bullet("t=2000+: state=nothing, effective_set=[]")
    check("open from_ms", iv["from_ms"], 2000)
    check("open to_ms", iv["to_ms"], None)
    check("open state", iv["state"], "nothing")
    check("open effective_set", iv["effective_set"], [])

    # 4. accidentals → pitch class
    check("C# pc", root_name_to_pc("C#"), 1)
    check("Db pc", root_name_to_pc("Db"), 1)
    check("D♭ pc", root_name_to_pc("D♭"), 1)
    check("B pc", root_name_to_pc("B"), 11)
    check("C pc", root_name_to_pc("C"), 0)

    # 5. bullet with trailing parenthetical commentary (T2.3 shape)
    iv = parse_expected_bullet(
        "t=400 to t=800: state=melody, effective_set=[60,64] "
        "(dyad of major third, no escalation — major thirds are "
        "not power-chord-eligible regardless of duration)"
    )
    check("commentary state", iv["state"], "melody")
    check("commentary effective_set", iv["effective_set"], [60, 64])

    # 6. loose-prose block (no bulleted lines after marker)
    intervals, reason = classify_expected(
        "All three sustain past t=100, so sounding-set sees the triad. "
        "state=chord, identity=(C, major), confidence=declared by t=100."
    )
    check("loose-prose intervals", intervals, None)
    check("loose-prose reason", reason, "loose_prose")

    # 7. dual-expected block (second **Expected ...** marker present)
    dual = (
        "All three notes are melody.\n\n"
        "**Expected (interim, combined rule):** state=chord, "
        "identity=(C, major), confidence=declared."
    )
    intervals, reason = classify_expected(dual)
    check("dual-block intervals", intervals, None)
    check("dual-block reason", reason, "dual_block")

    # 8. malformed bullet (parseable shape, invalid state) raises ParseError
    try:
        parse_expected_bullet("t=0 to t=100: state=unknown_state, effective_set=[]")
        failures.append("FAIL malformed-state did not raise ValueError")
    except ValueError:
        pass

    # Bonus: chord state missing identity raises.
    try:
        parse_expected_bullet("t=0 to t=100: state=chord, confidence=declared")
        failures.append("FAIL chord-without-identity did not raise")
    except ValueError:
        pass

    if failures:
        for f in failures:
            print(f, file=sys.stderr)
        print(f"\n{len(failures)} self-test failure(s)", file=sys.stderr)
        return 1
    print("all self-tests passed")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if "--self-test" in args:
        return run_self_tests()

    if not CORPUS_PATH.exists():
        print(f"error: corpus not found at {CORPUS_PATH}", file=sys.stderr)
        return 1

    text = CORPUS_PATH.read_text(encoding="utf-8")
    specs, errors = parse_corpus(text)

    if errors:
        print(
            f"refusing to emit: {len(errors)} test(s) failed to parse",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  {err}", file=sys.stderr)
        return 1

    if not specs:
        print("error: no tests found in corpus", file=sys.stderr)
        return 1

    write_outputs(specs)

    by_tier: dict[str, int] = {}
    by_status: dict[str, int] = {}
    structured_count = 0
    null_by_reason: dict[str, list[str]] = {}
    for s in specs:
        by_tier[s["tier"]] = by_tier.get(s["tier"], 0) + 1
        by_status[s["status"]] = by_status.get(s["status"], 0) + 1
        if s["expected"] is not None:
            structured_count += 1
        else:
            reason = s["expected_null_reason"] or "unknown"
            null_by_reason.setdefault(reason, []).append(s["id"])

    rel_dir = SPECS_DIR.relative_to(REPO_ROOT)
    print(f"emitted {len(specs)} test specs to {rel_dir}/")
    print("by tier:   " + ", ".join(f"{k}={v}" for k, v in sorted(by_tier.items())))
    print(
        "by status: " + ", ".join(f"{k}={v}" for k, v in sorted(by_status.items()))
    )

    null_total = sum(len(v) for v in null_by_reason.values())
    print(f"  {structured_count} with structured expected")
    print(f"  {null_total} with expected: null")
    for reason in sorted(null_by_reason):
        ids = ", ".join(sorted(null_by_reason[reason]))
        print(f"      {reason}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
