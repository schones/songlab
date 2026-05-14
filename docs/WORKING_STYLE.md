# Working style conventions

This document captures conventions for how Claude (and I) work
together on SongLab. Read at the start of every session.

## How I work

- **Experienced coder, primarily Python and R.** Comfortable on Unix.
  Familiar with the web stack but not deep on it; out of practice on
  some things.
- **Git is mine.** I manage all git operations. Don't include git
  commands in Claude Code prompts. Offer them in chat only when I
  ask, or as part of an end-of-session handoff (see below).

## Conversation style

### Ask one question at a time
Don't bundle three questions into a single message. Wait for the
answer before asking the next. This is non-negotiable.

### Don't propose multi-step verification scripts up front
Walk through one step, see the result, propose the next. Especially
for debugging — multi-step scripts assume the right model of the
problem, which is exactly what we're trying to figure out.

### Don't assume API surfaces
If you need to know what a function or object exposes, ask me to run
an inspector (Object.keys, typeof, sed for the function body, etc.)
and wait for the answer before drafting code that depends on the
assumed shape. Cheap to check, expensive to guess wrong.

### Read code before reasoning about it
When uncertain about how something works, ask for a grep or a sed
of the relevant section before forming a hypothesis. The
grep-before-guess pattern should be the default, not the exception.
"I think X" without having seen the code is usually less useful than
two minutes of reading.

### Acknowledge wrong hypotheses explicitly before pivoting
If a previous hypothesis got disproven, briefly acknowledge it and
recalibrate before forming the next one. Don't double down or layer
on more assumptions. "That was wrong because [X]; let me back up" is
more useful than silently pivoting.

### Before forming a hypothesis about a bug, characterize the symptom
What's actually being observed? "Snap doesn't work" could be many
things. One question to nail down the *shape* of the symptom before
guessing at causes — e.g., "same glyphs at new screen positions, or
different glyphs entirely?" — saves a lot of wasted hypothesis-
forming.

## Workflow conventions

### One Claude Code prompt per session focus area
Verify acceptance before moving on. Don't try to bundle multiple
focus areas into a single prompt.

### Workflow split
Plan and architect with Claude.ai (Opus for big-picture, Sonnet for
targeted). Build with Claude Code. Adversarial review with Gemini.
I manage all git.

### Read-and-report before non-trivial Claude Code builds
For Claude Code prompts that touch existing code, the default shape
is: prompt asks Claude Code to read the relevant files, report
findings, propose a plan, and stop before writing code. Human
reviews the findings against expectation, sends a go-ahead (possibly
with corrections), then code lands.

The read phase is doing real work — it grounds Claude Code in the
actual codebase rather than its training-data priors about how code
"usually" looks. The pause is doing real work too — it surfaces
wrong-shape interpretations before they become wrong code.

Skip the pattern when:
- The prompt is fully greenfield (no existing code to fit into).
- The edit is trivial (changing a constant, fixing a typo).
- The prompt itself fully specifies the structure.

For especially load-bearing changes, split into two separate prompts
— one read-only, one build — with explicit human intervention
between them. The combined-prompt-with-pause form is the default;
the two-prompt form is for higher-stakes work.

### Use Claude Code as a reading tool during planning
Planning conversations in claude.ai benefit from being grounded in
real code, not Claude.ai's recollection or inference of what the
code looks like. When a planning conversation touches existing
code — a module's API surface, a function's behavior, the shape of
a data structure, the call sites of a thing, or just the general
territory the plan is about to operate on — proactively use Claude
Code to read the relevant files and report findings *into the
planning conversation*. The build, if any, comes later.

This is parallel to read-and-report-before-builds but distinct: the
goal isn't to prepare a build prompt, it's to keep the planning
conversation honest. Claude.ai working from a stale or hallucinated
model of the code produces plans that don't survive contact with
the actual codebase. Reading can also surface things the
conversation didn't yet know to ask about — module structures that
make the original framing wrong, dependencies that change the
priority order, dead code that should be cleaned up first. Five
minutes of read-during-planning saves more than five minutes of
plan-rework later.

Lean toward reading whenever existing code is in the territory of
the conversation, not just when a specific claim needs verification.
The cost of an unnecessary read is low; the cost of planning
against a hallucinated model is high.

### Standing rules on file scope
Don't touch the following without explicit lift:
- harmonograph-view.js
- harmonograph.html
- harmony-state.js
- musical-event-stream.js
- chord-detection.js (currently lifted on the audio-onset branch)
- audio-input.js
- keyboard-view.js

Cantor 3D math is a duplicate of harmonograph's; future refactor
flagged TODO.

## End-of-session protocol

1. Follow End-of-session git workflow below.
2. Draft updates for `docs/STATUS.md` and `docs/SESSION_LOG.md`
   following `docs/templates/`.
3. If anything is unclear or ambiguous, ask before proceeding.



## End-of-session git workflow

1. Always run `git status` first; flag any unrelated working-tree
   changes for my decision before suggesting any commits.
2. Always offer git commands as a sequence I can paste, not as
   tool calls Claude executes.
3. Default commit message format:
   - First line: short imperative summary (≤72 chars)
   - Blank line
   - Body: bulleted list of what changed and why
4. When drafting Claude Code prompts in chat, never include git
   commands in them. Git operations are mine; Claude Code prompts
   should focus on the build/edit task only.
5. For binary artifacts: ask before committing. Default to
   gitignore + regenerate-from-source.



## When something feels off

If I push back on a direction, take it seriously and ask before
proceeding. If I correct a factual claim, acknowledge it and update
the model — don't restate the same wrong claim with different words.

Calibration matters. Better to ask "did I read that right?" than to
charge ahead on a wrong reading.