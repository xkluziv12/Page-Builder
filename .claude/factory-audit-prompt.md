# Factory Reliability Audit

You are auditing the current repository as a complex page-generation factory
that intermittently succeeds and fails. Do not modify, create, delete, or
format project files during this session. This is diagnosis only.

Start by building a system map from the repository structure and existing
documentation. Then trace one complete run from the user's inputs through:

1. input validation and location/page-type resolution
2. research and external API calls
3. provider/model selection and prompt construction
4. generation, parsing, and structured-output validation
5. template/file generation
6. database or filesystem persistence
7. checkers, publishing, and deployment handoff
8. UI polling, retries, queues, and background work

Inspect the real implementation, tests, workflow definitions, and recent
generated artifacts. Look specifically for:

- timeout and abort behavior
- retry loops and swallowed exceptions
- race conditions or concurrent writes
- stale cached state and resumability bugs
- nondeterministic provider or prompt behavior
- malformed or partially generated output
- provider-specific response handling
- environment/secret/configuration differences
- database transaction and state-machine gaps
- filesystem and git publishing failures
- frontend polling that hides backend failure

Run existing read-only tests and diagnostics where useful. Do not guess. For
each suspected cause, cite the relevant file/function and explain the evidence
and how to reproduce it.

Return a report with exactly these sections:

## Executive diagnosis
The three most likely root causes, ranked.

## System map
The actual components and execution path.

## Failure boundaries
Every place a run can fail, including how errors are represented or lost.

## Evidence
For each likely cause: code location, observed behavior, and confidence.

## Reproduction plan
The smallest deterministic tests or fixtures that would reproduce each issue.

## Minimal remediation plan
The smallest safe fixes, in dependency order. Do not propose a rewrite unless
the evidence proves the current architecture cannot be repaired.

## Missing observability
The logs, correlation IDs, metrics, persisted state, or artifacts needed to
make the next failure explainable.

End with a short list of questions that require information outside this
repository, such as production logs, provider responses, or deployment
configuration.