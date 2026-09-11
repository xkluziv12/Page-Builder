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

## Attached audit brief to incorporate

Also read:

`attached_assets/Pasted-Let-me-verify-a-few-specifics-so-the-instructions-are-a_1789148727556.txt`

Treat claims about the other repos and systems in that document as reported
facts, not verified facts. Do not present them as evidence from this
workspace. Audit and answer the document's specific questions against the
current repository:

1. Explain exactly why `structure` could be exactly 50 across models and runs.
   Identify which of its four signals fire and which do not. Decide whether its
   0.15 weight is valid, dead weight, or currently inconclusive.
2. Explain what `htmlMatch` and `visualMatch` actually reward. Decide whether
   they are quality metrics or reference-similarity metrics, and whether a
   better-but-different page can be penalized.
3. Assess whether the reported score/cost spread can discriminate between
   models, without overstating what the local evidence proves.
4. Query the available development database if possible and report the actual
   `mc_runs` completion/stall distribution by phase. If the database cannot be
   queried, say exactly that.
5. Determine whether Mission Control can accept an external research/page brief
   and start at build, or whether URL-derived research is mandatory and coupled
   to the run.
6. Determine whether a failed schema or later phase can be rerun independently
   while reusing earlier paid outputs.
7. Compare the actual Mission Control orchestrator to the reported lean runner
   shape and production-factory shape using code evidence, not impressions.
8. Locate the prompt versions carried by this workspace and identify any drift
   that can be proven locally. Do not infer contents from repositories that are
   not present.

For every answer, distinguish:

- verified from this workspace
- reported in the attached brief
- cannot verify from this workspace

Do not modify project files. This remains an audit only.