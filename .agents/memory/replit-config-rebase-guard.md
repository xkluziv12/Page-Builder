---
name: Replit config guard during git rebase
description: How to get a multi-commit rebase past Replit's protection on .replit / replit.nix
---

# Replit config guard during git rebase

Replit hard-blocks ALL direct writes to `.replit` and `replit.nix` in the git
worktree (fatal exit 254). This breaks `git rebase --continue` AND
`git rebase --abort` whenever a replayed commit (or the abort target) touches
those files — the guard is not relaxed for git's own writes.

**Workaround that works:** install a keep-ours merge driver so git never tries
to apply incoming changes to those paths during replay:

```
# .gitattributes
.replit merge=ours
replit.nix merge=ours
pnpm-lock.yaml merge=ours
lib/api-zod/src/generated/** merge=ours
lib/api-client-react/src/generated/** merge=ours
```
```
git config merge.ours.driver true
git config rebase.empty drop   # commits that only touched .replit become empty -> auto-drop
```

The driver fires only on a real 3-way merge (ours != base); since commit-1's
resolution already diverges the config from each commit's parent, every
subsequent config-touching pick uses the driver and writes identical content =
no guard error.

**At the end** materialize the true union of the config via
`verifyAndReplaceDotReplit({tempFilePath})` (the only sanctioned writer) — main's
port/nix base PLUS the branch's later additions, because keep-ours discarded
them during replay. Then regenerate codegen + lockfile from the merged
`openapi.yaml` and commit (they were also frozen as ours).

**Why:** the guard makes the normal `git rebase --continue` loop impossible for
any branch whose commits edit `.replit`. Aborting is equally blocked, so a
partial abort can spuriously delete worktree files — recover with
`git checkout HEAD -- . ':(exclude).replit' ':(exclude)replit.nix'`, not abort.

**How to apply:** any task-agent rebase onto main in a repo where the branch
modified `.replit`/`replit.nix`.
