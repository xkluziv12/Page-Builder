#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Schema reconciliation is required before workflows restart after a merge.
# Keep the safe non-forced command so future destructive diffs cannot be
# accepted silently. This provenance change is additive and non-interactive.
pnpm --filter @workspace/db run push
