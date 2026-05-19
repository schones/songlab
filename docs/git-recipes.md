# Git recipes

Canonical command sequences for recurring multi-branch
operations in SongLab work. Look up before reconstructing
syntax from memory.

Format follows the Claude drafting convention in WORKING_STYLE.

## Conventions

- All recipes assume you start from a clean working tree
  unless explicitly noted otherwise. Run `git wha` first
  to confirm.
- `git wha` is the alias defined in shell config; see
  WORKING_STYLE for installation. The name is pronounced
  "wha" — invoked at the cognitive moment of "wait, where
  am I right now?"
- Recipes show commands as Dustin runs them. Claude never
  runs git commands; Claude drafts sequences for Dustin
  to execute.

---

## Recipe: Switch branches with clean handoff

For when you need to move from one feature branch to another
(or back to dev) and want explicit confirmation of state.

**Starting state:** on any branch, working tree should be clean
or have a clear plan for any pending changes.

**Commands:**
1. `git wha`
   Expected: confirms current branch + clean tree (or
   pending changes you're aware of).
2. `git checkout <target-branch>`
   Expected: "Switched to branch '<target-branch>'"
3. `git wha`
   Expected: confirms you're on the target branch with
   expected upstream sync state.

**Ending state:** on the target branch, oriented.

**If something looks wrong:** if the working tree wasn't
clean and checkout was blocked, either commit, stash
(`git stash push -m "wip: <description>"`), or discard
(`git checkout -- <files>`) — decide deliberately.

---

## Recipe: End-of-session push (single branch)

**Starting state:** on the branch you've been working on,
all intended commits made.

**Commands:**
1. `git wha`
   Expected: shows N commits ahead of upstream, clean tree.
2. `git push`
   Expected: pushes N commits successfully.
3. `git wha`
   Expected: ahead 0, behind 0 (in sync).

**Ending state:** branch is in sync with origin.

**If something looks wrong:** if push is rejected, the
remote has diverged — `git fetch` and inspect before
deciding whether to merge, rebase, or investigate.

---

## (More recipes get added here as patterns recur.)
