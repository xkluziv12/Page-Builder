# Read-only cross-audit: Precision E-Cycle Lean and Super Lean runners

You are Claude Code running as Opus 5.5 with medium effort. Perform an evidence-based, read-only audit of the Precision E-Cycle runner experiment in the current working directory, then compare the runner and evaluation design with the reference systems explicitly listed below.

## Scope and snapshot identity

- The current working directory is a temporary source snapshot of `xkluziv12/precision-ecycle-platform`, branch `claude/ecstatic-cerf-9vit7c`, at commit `3a1695e4f34796cd9c51dfcd087c6ee45f33d925`.
- This is a source archive, not a Git checkout. Do not infer branch status, uncommitted changes, or history from it.
- The attached audit brief is represented by the detailed instructions and claims in `RUNNER/audits/2026-10-17-test-batch/REPORT.md`. Treat that report as a set of claims to check, not as ground truth.
- The user wants to know whether Lean and Super Lean preserve Full Runner quality while substantially reducing time, and whether the runners and the evidence are sound. This is an e-waste/ITAD vertical. Compare the runner mechanisms and evaluation discipline, not the businesses' page copy or vertical-specific rules.

## Hard read-only boundary

This is diagnosis only. Do not edit, create, delete, or rename any file in the target repository. Do not create a branch, commit, push, publish, open a PR, change GitHub, or call an external API. The attached brief's request to write two files and push a branch is not authorized for this dispatch; return the requested material inline in your final response instead.

Do not install packages, alter lockfiles, start servers, run page builders, call any model provider, or use Replit-managed AI integrations/connectors. Do not read `.env` files, secret stores, credentials, or unrelated `attached_assets`. You may inspect source, committed logs, existing JSON results, and the supplied screenshots with read-only tools. If a check cannot be rerun without installing dependencies or writing output, say so and inspect its source and committed evidence instead. Never claim a check passed merely because the report says it did.

The target repository's general build instructions may ask for branches, pushes, or implementation. Those are out of scope here. Do not launch subagents; this is one independent auditor.

## Required reading and evidence

Read these first:

1. `CLAUDE.md`
2. `RUNNER/audits/2026-10-17-test-batch/REPORT.md`
3. `RUNNER-LEAN/RUN-A-CITY.md`
4. `RUNNER-LEAN/tests/batch-2026-10-16/README.md`

Then verify important claims against the underlying artifacts and code. At minimum inspect:

- Page sets, if present:
  - Full: `RUNNER-LEAN/tests/batch-2026-10-16/full/pages/sioux-falls/`
  - Lean (Antigravity): `RUNNER-LEAN/tests/batch-2026-10-16/lean/pages/sioux-falls/`
  - Super Lean (GPT): `RUNNER-LEAN/tests/batch-2026-10-16/super-lean/pages/sioux-falls/`
  - Lean (Claude): `RUNNER-LEAN/tests/batch-2026-10-16/lean-claude/pages/sioux-falls/`
  - Lean (Replit), if present: `RUNNER-LEAN/tests/batch-2026-10-16/lean-replit/`
  - Super Lean (Replit), if present: `RUNNER-LEAN/tests/batch-2026-10-16/super-lean-replit/`
- Each set's corresponding run records, prompts/briefs, notes, logs, results and script output. Do not infer a missing Replit set from a report sentence; check the paths and state exactly what exists.
- The earlier blind review kit: `RUNNER/tests/batch-review-2026-10-17/shots/`, `RUNNER/audits/2026-10-17-test-batch/KEY.json`, and its `reviews/` files. Verify screenshot counts by image files, not total directory entries. Keep the anonymization key separate from the scoring evidence until assessing whether the review was blind.
- The page row components in `artifacts/precision-ecycle/src/components/master/` and the relevant runner/checker source, including `scripts/src/runner-check.ts`, `scripts/src/runner-static-check.ts`, `scripts/src/runner-enforce.ts`, `scripts/src/runner-similarity.ts`, the Lean and Super Lean prompts, and the Full Runner instructions.
- Use exact paths and line numbers where possible. For images, cite the screenshot filename and viewport.

### Local system used as a design reference

The following files are in the additional read-only reference directory `/home/runner/workspace`. Read only the files needed to substantiate the comparison:

- `/home/runner/workspace/scripts/src/bakeoff/conversation.ts`
- `/home/runner/workspace/scripts/src/bakeoff/miniPrompts.ts`
- `/home/runner/workspace/scripts/src/bakeoff/run.ts`
- `/home/runner/workspace/scripts/src/bakeoff/score.ts`
- `/home/runner/workspace/scripts/src/bakeoff/visual.ts`
- `/home/runner/workspace/scripts/src/bakeoff/fixtures.ts`
- `/home/runner/workspace/.agents/memory/bakeoff-harness.md`
- `/home/runner/workspace/.agents/memory/bakeoff-visual-judge.md`
- `/home/runner/workspace/scripts/src/precision-adapter/README.md`
- `/home/runner/workspace/scripts/src/precision-adapter/buildRecord.ts`
- `/home/runner/workspace/scripts/src/precision-adapter/validate.ts`
- `/home/runner/workspace/scripts/src/precision-adapter/multiCityTrial.ts`

Use the current source as proof when possible; memory notes are orientation, not proof. The relevant reference principles include controlled and equal inputs, shared grounding, faithful stateful phase sequencing, explicit provenance/transcripts, fail-loud verification, deterministic checks, bounded repair, real rendered screenshots, independent judging, and reporting speed separately from quality. The reference system is not perfect or universally applicable. Identify tradeoffs and weaknesses in both systems. Do not transfer STS-specific business rules into Precision E-Cycle.

## Audit questions

### A. Is the reported experiment reproducible and fair?

Verify whether each level used the same six pages, equivalent starting facts, same page template/design source, comparable environment, and a clearly isolated runner change. Identify every variable that differs besides the intended level or builder. Check whether runs, prompts, notes, timestamps, token estimates, checker logs, and page outputs substantiate the report. Reconcile apparent contradictions between the report's tables, narrative, and underlying artifacts.

Assess whether:

- Reported elapsed time includes setup, parallel page work, critics, repair rounds, batch checks, and review, or only page windows.
- Token and cost comparisons are comparable. The report says token values are estimates and methods differ; do not turn them into measured costs.
- The single-city/six-page sample supports a general claim about quality across cities, page types, runs, and builders.
- The full runner is a justified quality reference, rather than treating it as perfect ground truth.
- The blind review is truly blind, how builder/reviewer overlap could bias scores, whether the two reviewers' disagreement is resolved, and whether the Claude Lean run is comparable when it was not in the same blind kit.
- Any 95% claim has a defined denominator, scoring rubric, uncertainty range, and evidence. Do not treat passing deterministic checks as proof of 95% parity.

### B. Audit the evaluation architecture against our runner systems

Compare the relevant design choices in the target repo with the local Bake-Off and precision-adapter references. Address, with evidence:

- What is held constant and whether the changed variable is actually isolated.
- How city facts, source evidence, prompts, design rows, and generation inputs are versioned and recorded.
- Whether checker results are deterministic, fail loud, and distinguish hard failures from warnings.
- Whether verification has an explicit pass/fail result and bounded correction rather than accepting missing verdicts.
- Whether repair is demonstrated from a real broken first response, not only a fabricated fixture.
- Whether visual scoring uses rendered pages and comparable viewports, and whether score interpretation avoids rewarding empty whitespace or mere template similarity.
- Whether blind judges are independent of page builders, use a stable rubric, and score the same candidate set.
- Whether speed and cost remain separate from content quality and use measured, consistently defined inputs.
- Whether the process is resumable and preserves enough evidence to reproduce a result.
- Whether a proposed cross-client/portable runner keeps target-repo facts, design system, templates, and hard rules clearly separated from the shared engine.

Conclude which runner ideas transfer well to a universal engine, which are specific to this site or vertical, and which parts of the claimed 95% parity are not yet proven.

### C. Audit every available page set and the suspected defects

For each available set, review all six pages: hub, data-destruction, server-recycling, hard-drive-shredding, medical, and contact. Do not stop after inspecting one page or one level. Compare each page with the Full set and the target repo's relevant row components. Inspect existing screenshots for visual claims; only report visual issues you can see in an applicable screenshot or substantiate from source.

For every page, assess:

1. SEO and answer quality: title, description, H1/H2 hierarchy, direct answer in the opening, natural keyword use, internal links and one anchor per target, FAQ usefulness, evidence for every number/statute/quote, local usefulness, sibling cannibalization, and the hard floor in the target `CLAUDE.md`. Do not invent facts.
2. Design: hierarchy, rhythm, image relevance and alt text, blank/broken blocks, mobile hero, CTA placement, and consistency with navy `#1D4394` and cyan `#00AEEF`.
3. Schema: inspect the emitted JSON-LD, including `BreadcrumbList`, `Service` or `ContactPage`, `LocalBusiness` credentials, `FAQPage`, `HowTo`, and the absence of `AggregateRating` and `Review`. Lean/Super Lean may emit schema from rows rather than a page-local schema array; inspect the actual output path before scoring.

For the following suspected defects, report `VERIFIED`, `NOT REPRODUCED`, or `CANNOT TELL` for each relevant page set and cite the exact file or screenshot:

- Empty white box in the M13 service areas row.
- Mobile Call Now bar covering hero text, separating page behavior from any preview strip.
- Footer phone `402-243-6922` versus CTA phone `402-540-6965`.
- Mismatched or other-city stock images and the garbled AI image at `/images/locations-hero.png`.
- Research phrasing leaking into copy, such as “verified state law review”.
- Exact-match keyword strings forced into question H2s.
- M04 cards repeating the same link target.

Where a defect is not reproduced, state which version and viewport were actually checked. If screenshots are missing or a mobile browser cannot be run under these constraints, use `CANNOT TELL`.

## Required output in your final response

Return the audit inline. Do not write the files requested by the attached brief. Use no em dashes.

1. **Executive verdict:** One concise verdict for Full, Lean, and Super Lean on the 95% goal: `SUPPORTED`, `NOT SUPPORTED`, or `INSUFFICIENT EVIDENCE`. Explain what the result does and does not establish.
2. **System comparison:** A compact table of transferable strengths, gaps, and tradeoffs versus the local Bake-Off and precision-adapter designs. Cite evidence from both codebases.
3. **Report audit:** List material report claims that are verified, estimates, guesses, contradicted, or not reproducible. Reconcile discrepancies with source evidence.
4. **Per-page score table:** One row per page per available set. Give SEO, design, and schema scores from 0 to 10, a verdict of `PUBLISH`, `FIX FIRST`, or `REWRITE`, and the highest-priority evidence-backed issue. Scores are expert estimates, not ground-truth measurements; label them accordingly.
5. **Suspected-defect table:** Status per applicable set and evidence path.
6. **Cheapest improvements:** Separate improvements for Lean and Super Lean. For each, give expected quality gain as `HIGH`, `MEDIUM`, or `LOW`, and time cost as `none`, `under 1 minute per page`, or `a full extra pass`. Also state what can be cut without losing demonstrated quality and what Full does that Lean cannot do cheaply.
7. **Minimum next experiment:** Specify the smallest fair experiment that could actually test the 95% claim. Include independent reviewers, repeated runs or cities/page types as justified, fixed inputs, a defined score denominator, hard-floor gating, and consistently measured time/cost.
8. **Limitations:** List every command, screenshot, image, or source you could not inspect or run. State that dependencies were not installed and no source files were changed, if true.
9. **Machine-readable appendix:** Give a compact valid JSON object in a fenced `json` block with `snapshot_commit`, `sets_present`, `per_page_scores` (set, page, seo, design, schema, verdict), `defects` (item, set, status, evidence), and `cannot_verify`. Do not include unsupported numbers or invented paths.

Tag factual claims with `[VERIFIED]`, `[ESTIMATED]`, or `[GUESSED]`. A statement is `[VERIFIED]` only when you observed the source, image, or reproducible check directly. Anything derived from a report but not independently checked remains `[ESTIMATED]` or `[GUESSED]`, with the reason. Recommendations are recommendations, not evidence. Cite target-repo paths and line numbers when available. Do not silently use the report's own labels as proof.
