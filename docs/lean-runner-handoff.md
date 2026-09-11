# Handoff: New Lean Page-Generation Runner

This handoff is for:

1. The fresh Claude Code chat that will investigate and implement the runner.
2. Replit Agent, which will supervise scope, review the findings, and independently verify the result.

The objective is to build a new, lean, provider-agnostic page-generation runner using the proven mechanics of the existing STS Bake-Off, while keeping STS-specific prompt content separate from the reusable runner.

The first goal is not to build a generalized factory. The first goal is to prove one complete generation path from structured input to a valid, inspectable final page and schema.

## 1. Core decision

Do not begin by immediately writing the runner.

The fresh Claude Code chat should begin with a bounded, read-only investigation. It should return a source-backed architecture report. Only after that report is reviewed should implementation begin.

The sequence is:

    assignment
        -> source-of-truth and prompt investigation
        -> existing-runner mechanics investigation
        -> Mission Control and factory-failure investigation
        -> phase-contract and architecture proposal
        -> implementation authorization
        -> one-provider proof
        -> independent verification

A fresh context should not mean an uninformed implementation.

## 2. Objective

Build a new lean runner that can execute a complete page-generation workflow using:

- A structured job input.
- A pinned and versioned prompt bundle.
- A research or grounding input.
- An optional Hub and Spoke handoff.
- Page Builder instructions.
- Design instructions.
- A deterministic design gate.
- A bounded rebuild loop.
- SEO Audit.
- Explicit SEO verification.
- A bounded corrective loop.
- Schema Generator.
- Final deterministic validation.
- A saved, inspectable output package.

The first proof should use:

- One brand.
- One city.
- One page.
- One page type.
- One GMB or No-GMB scenario.
- One provider.
- One model.
- One complete run.

The runner should produce a real page artifact, not merely a score or report.

## 3. What this runner is and is not

The runner is a focused execution engine:

    structured input
        -> input normalization
        -> research or grounding
        -> optional Hub and Spoke handoff
        -> prompt assembly
        -> model generation
        -> deterministic validation
        -> bounded repair
        -> final page, schema, and evidence

The runner is not initially:

- A replacement for the Bake-Off.
- A replacement for Mission Control.
- A new Page Terminal tool.
- A leaderboard.
- A multi-model competition harness.
- A screenshot-comparison system.
- A visual judge.
- A background job platform.
- A database-backed dashboard.
- A CMS publisher.
- A multi-brand factory.
- A live prompt-sync service.
- A model-routing system.
- A cost-ranking system.

Those may become later layers, but they must not be part of the first proof.

## 4. Current system findings

### 4.1 The Bake-Off is already a working generation runner

The Bake-Off is not merely a scoring tool.

Its actual generation lifecycle is represented in:

    scripts/src/bakeoff/conversation.ts

The current sequence is:

    intro and context handoff
        -> build
        -> deterministic design gate
        -> bounded rebuild loop
        -> SEO audit
        -> SEO verification with explicit verdict
        -> schema generation
        -> final link verification with explicit verdict

Reusable Bake-Off mechanics include:

- Direct provider adapters.
- A provider-independent completion interface.
- Provider timeouts.
- Bounded retries.
- Stateful message history.
- Prompt assembly.
- Output extraction.
- Design gates.
- Rebuild loops.
- Verification loops.
- Explicit pass/fail verdict handling.
- Transcript capture.
- Timing capture.
- Provider provenance.
- Cost metadata.
- Atomic result persistence.
- Fail-loud behavior.

Bake-Off-only features that must remain outside the first lean runner include:

- Multi-model fan-out.
- Model routing.
- Leaderboard scoring.
- Screenshot rendering.
- Visual similarity scoring.
- Blind judging.
- Historical model comparison.
- Cost ranking.
- Comparison dashboards.
- Model winner selection.

### 4.2 Mission Control is a separate production system

Mission Control has this phase ladder:

    Research
        -> review gate
    Build
        -> review gate
    Audit
        -> review gate
    Schema
        -> review gate
    Publish

Mission Control contributes useful concepts:

- Explicit phase state.
- Clear phase inputs and outputs.
- Deterministic checker gates.
- A research-provider seam.
- Fail-loud schema validation.
- Persistence after each phase.
- Review gates.
- Separation between orchestration and provider implementation.

The first lean runner should not copy Mission Control wholesale.

Do not initially copy:

- The API server.
- The database schema.
- The admin system.
- The dashboard.
- The Joomla publisher.
- The UI polling behavior.
- Work-log integrations.
- Google Sheets integration.
- Google Search Console integration.
- Production publishing.

### 4.3 There is not currently a standalone spoke/research writer in this workspace

This must be checked against the external framework repository, but the current workspace indicates:

- Research is implemented as a provider-backed phase.
- The SEO Audit master includes Phase 0 research and spoke-related instructions.
- Hub and Spoke is an optional handoff in the Bake-Off when existing URLs are supplied.
- When no Hub and Spoke handoff exists, the current Bake-Off proceeds without a standalone Hub and Spoke generation turn.

Claude Code must explicitly answer:

    Is Hub and Spoke a genuine upstream generation phase,
    or is it an optional structured handoff consumed by Page Builder
    and SEO Audit?

The recommended initial interpretation is:

    research or grounding
        -> optional Hub and Spoke handoff
        -> Page Builder
        -> design gate and rebuild
        -> SEO Audit
        -> SEO verification
        -> Schema Generator
        -> final validation

Hub and Spoke should become a required phase only if the authoritative framework prompt proves that Page Builder depends on a generated Hub and Spoke artifact.

## 5. Prompt source-of-truth rule

There are several prompt representations in the current workspace:

    lib/mc-core/src/prompts/*.ts
    scripts/src/bakeoff/fixtures/master-*.txt
    artifacts/page-terminal/public/tools/*.html
    attached_assets/*

They are not automatically equivalent.

Some are:

- Runtime prompt bodies.
- Bake-Off snapshots.
- Operator-facing tools.
- Historical versions.
- Attached reference documents.
- Handoff notes.
- Compatibility wrappers.
- Generated or copied text.

Do not assume the first prompt file found is authoritative.

The investigation must identify:

- The true generalized framework repository.
- The true STS prompt source.
- Current prompt versions.
- Whether prompts are files, database records, or generated artifacts.
- Whether the framework repository is read-only.
- Whether STS prompts are copied into the framework or merely referenced.
- Whether prompts have GMB and No-GMB variants.
- Whether prompts have page, blog, hub, and spoke variants.
- Which files are runtime copies rather than source files.
- Which files are historical or stale.

The new runner should not dynamically pull changing remote prompt content during a run.

Recommended prompt architecture:

    authoritative prompt source
        -> pinned prompt bundle
        -> prompt version manifest
        -> runner execution

The runner should record:

    promptPack:
      source
      repository
      commit or version
      pageBuilder version
      design version
      seoAudit version
      schemaGenerator version
      hubSpoke version or null
      research version or null

If the runner cannot record exactly which prompt versions it used, later output comparisons will not be trustworthy.

## 6. Required reading order

The following order is intentional. Do not read every unrelated repository file without a plan.

### Stage 0: Project boundaries

Read:

    README.md
    replit.md
    SYSTEM-MAP.md

Then inspect the actual external framework repository containing the generalized prompts.

Determine:

- The authoritative prompt source.
- The current prompt versions.
- Where the STS prompt variants live.
- Where the generalized prompt variants live.
- Whether prompts are files, database records, or generated artifacts.
- Whether the framework repository is read-only.
- Where the new runner is allowed to be created.
- Which existing files must remain untouched.
- Which direct provider SDKs already exist.
- Which environment variables are required, by name only.
- Whether the new runner belongs in this workspace or another repository.

If the external framework repository cannot be accessed, stop and report that limitation. Do not infer its contents from attached files.

### Stage 1: Prompt contract

Read the authoritative prompt sources in dependency order:

1. Hub and Spoke, if it is a real phase.
2. Research prompt or research contract, if one exists.
3. Page Builder.
4. Design instructions.
5. SEO Audit.
6. Schema Generator.
7. Execution prompts.
8. Verification and repair prompts.

For every prompt, document:

- Required inputs.
- Optional inputs.
- Required files or attachments.
- Expected output format.
- Whether output is HTML, JSON, JSON-LD, or a report.
- Whether it replaces an existing artifact.
- Whether it expects continuous chat history.
- Whether it expects a human response.
- Whether it assumes Claude Desktop.
- Whether it assumes artifacts or canvas.
- Whether it requires live web search.
- Which later phase consumes its output.
- Which rules require deterministic code rather than model instructions.

Explicitly answer:

1. Is Hub and Spoke an upstream generation phase or an optional handoff?
2. Is research a separate prompt, a provider-backed phase, or only Phase 0 inside SEO Audit?
3. What is the exact output contract of every phase?
4. Which phase owns design validation?
5. Which phase strips or regenerates schema?
6. Which phase verifies links?
7. Which phases require the full prior conversation history?
8. Which prompts were designed for interactive chat and require headless adaptation?
9. Which prompt files are current and which are historical?
10. Which prompt versions are actually used at runtime?

### Stage 2: Bake-Off mechanics

Read:

    scripts/src/bakeoff/conversation.ts
    scripts/src/bakeoff/miniPrompts.ts
    scripts/src/bakeoff/providers.ts
    scripts/src/bakeoff/extract.ts
    scripts/src/bakeoff/designGate.ts
    scripts/src/bakeoff/fixtures.ts
    scripts/src/bakeoff/gmb.ts
    scripts/src/bakeoff/types.ts
    scripts/src/bakeoff/target.ts
    scripts/src/bakeoff/produce.ts
    scripts/src/bakeoff/run.ts

Then inspect these only where needed:

    scripts/src/bakeoff/routed.ts
    scripts/src/bakeoff/routing.ts
    scripts/src/bakeoff/resume.ts
    scripts/src/bakeoff/history.ts
    scripts/src/bakeoff/cost.ts

Separate the findings into:

A. Reusable runner mechanics.

B. Bake-Off-only evaluation features.

Do not propose importing the leaderboard, visual judge, screenshot scoring, blind judge panel, model fan-out, or cost-ranking system into the first runner.

### Stage 3: Mission Control contracts

Read:

    lib/mc-core/src/types.ts
    lib/mc-core/src/pipeline/orchestrator.ts
    lib/mc-core/src/prompts/builders.ts
    lib/mc-core/src/engine/types.ts
    lib/mc-core/src/engine/base.ts
    lib/mc-core/src/checkers/
    lib/mc-core/src/schema/generator.ts
    lib/mc-core/src/research/provider.ts
    lib/mc-core/src/research/direct.ts
    artifacts/api-server/src/lib/mc-runtime.ts
    artifacts/api-server/src/routes/mc.ts

Explain what should be reused conceptually:

- Phase contracts.
- Explicit state.
- Checker gates.
- Provider seams.
- Fail-loud handling.
- Persistence boundaries.
- Review boundaries.

Also explain what should not be copied into the first lean runner.

### Stage 4: Factory failure analysis

Read:

    .claude/factory-audit-report.md
    .claude/factory-audit-prompt.md
    docs/mission-control-drift-report.md
    docs/CLAUDE-BAKEOFF-HANDOFF.md

Use these as failure-history references, not as substitutes for source inspection.

Identify every failure category that the new runner must prevent, including:

- Unbounded network calls.
- Missing abort signals.
- Swallowed exceptions.
- Empty output.
- Explanation-only output.
- Malformed output.
- Silent placeholder fallbacks.
- Prompt-version drift.
- Prompt replacement no-ops.
- Missing explicit verdicts.
- Loss of earlier phase outputs after a later failure.
- Missing elapsed time on failed turns.
- Missing correlation IDs.
- Non-resumable phase state.
- Phase state stuck in running.
- Long synchronous operations.
- Provider-specific exceptions.
- Artifact or desktop assumptions that do not work through APIs.
- Missing provenance.
- Ambiguous prompt source.
- Stale cached grounding.
- Missing reference provenance.

### Stage 5: Page Terminal

Read:

    artifacts/page-terminal/public/tools/hub-spoke.html
    artifacts/page-terminal/public/tools/no-gmb.html
    artifacts/page-terminal/public/tools/page-terminal.html

Compare Page Terminal behavior against:

- The authoritative prompt source.
- The Bake-Off.
- Mission Control.

Label every difference as:

    identical
    intentional divergence
    accidental drift
    unclear

Page Terminal is an operational reference. It should not automatically override the authoritative framework prompt source.

### Stage 6: Precision adapter

Read:

    scripts/src/precision-adapter/cityDataSchema.ts
    scripts/src/precision-adapter/validate.ts
    scripts/src/precision-adapter/buildRecord.ts
    scripts/src/precision-adapter/prompt-pack/

Use it as a separate example of:

- Explicit output schemas.
- Deterministic policy validation.
- Bounded repair loops.
- Fail-loud provider behavior.
- Separating model generation from deterministic consumption.

Do not merge the Precision adapter into this HTML runner.

## 7. Proposed phase model

The runner should use explicit phase contracts rather than one large unstructured prompt.

### Phase 1: Input normalization

Validate:

- City.
- State.
- Niche.
- Target URL.
- Page type.
- Classification.
- Competition.
- GMB state.
- Research inputs.
- Hub and Spoke inputs.

Reject:

- Missing required values.
- Invalid enum values.
- Private or unsafe URLs.
- Conflicting GMB data.
- Unrecognized page types.
- Ambiguous location data.

### Phase 2: Research or grounding

Research should produce a structured brief.

A possible minimum shape is:

    {
      "target": {
        "city": "...",
        "state": "...",
        "niche": "..."
      },
      "summary": "...",
      "localEntities": [],
      "competitors": [],
      "sources": [],
      "provenance": {},
      "warnings": []
    }

The runner must distinguish between:

- Live research.
- Operator-supplied research.
- Cached research.
- Shared grounding.
- No research.

A missing research result must not silently become an empty string.

### Phase 3: Optional Hub and Spoke handoff

If Hub and Spoke is required for the selected page type, produce a structured handoff.

A possible shape is:

    {
      "hubUrl": "...",
      "spokeUrl": "...",
      "internalLinks": [
        {
          "url": "...",
          "anchorContext": "...",
          "reason": "..."
        }
      ],
      "constraints": []
    }

If it is optional and not supplied, record an explicit state such as:

    {
      "status": "not-required"
    }

Do not confuse “not required” with “failed.”

### Phase 4: Page Builder

Input:

- Normalized job.
- Prompt bundle.
- Research brief.
- Hub and Spoke handoff.
- GMB block if verified.
- Design instructions.

Output:

    build.html
    build-response.txt
    build-metadata.json

The build phase must not include final schema if schema is intentionally generated later.

### Phase 5: Design gate and rebuild

Run deterministic checks such as:

- Exactly one H1.
- City present in H1.
- Niche present where required.
- Form in required location.
- Required responsive behavior.
- Required images or media.
- No obvious truncation.
- Full HTML document exists.
- No explanation-only response.
- No placeholder artifact response.
- No empty output.

If the gate fails:

    build output
        -> specific deterministic issue
        -> bounded rebuild prompt
        -> new complete page

Do not permit unlimited rebuilds.

### Phase 6: SEO Audit

Input:

- Current complete HTML.
- Research brief.
- Prompt bundle.
- Hub and Spoke handoff.
- GMB or No-GMB rules.

Output:

    audited.html
    seo-audit-report.txt
    seo-audit-metadata.json

The audit must return the full corrected page when the prompt contract requires full-page output.

It must not accidentally return only an explanation or partial fragment.

### Phase 7: SEO verification

Use a separate explicit verification gate.

Verify:

- Required title and description.
- H1 and heading hierarchy.
- City targeting.
- Link integrity.
- Email links.
- Contact URLs.
- GMB or No-GMB compliance.
- Facility language.
- Absence of placeholder links.
- Absence of invalid schema if schema is regenerated later.
- Any current SEO requirements that genuinely require live search.

Verification must end with an explicit result, such as:

    PASS

or:

    FAIL

A missing verdict must never count as a pass.

If verification fails, send the actual issues back through a bounded corrective loop.

### Phase 8: Schema Generator

Input:

- Final audited HTML.
- Research brief.
- GMB block if verified.
- Prompt bundle.

Output:

    schema.json
    schema-metadata.json

Schema must be:

- Valid JSON.
- Valid JSON-LD.
- Parsed before the phase passes.
- Consistent with the page.
- Correct for GMB or No-GMB status.
- Associated with the prompt version that generated it.

Do not replace invalid schema with a generic placeholder and call the phase successful.

### Phase 9: Final deterministic validation

Run the complete final gate again.

Do not accept a run merely because every model turn returned text.

## 8. Proposed input contract

The first runner should accept one structured job file.

Example:

    {
      "city": "Billings",
      "state": "MT",
      "niche": "electronics recycling",
      "targetUrl": "https://example.com/billings-mt",
      "pageType": "SPOKE",
      "classification": "NEW_BUILD",
      "competition": "MEDIUM",
      "gmb": null,
      "research": {},
      "hubSpoke": {}
    }

The exact fields must be finalized after the prompt-contract investigation.

The runner must validate the input before making any paid provider call.

## 9. Proposed output package

Every run should create a directory similar to:

    runs/<run-id>/

Containing:

    input.json
    run-manifest.json
    prompt-manifest.json
    research-brief.json
    hub-spoke-handoff.json
    build.html
    build-response.txt
    design-gate.json
    seo-audited.html
    seo-audit-report.txt
    seo-verification.json
    schema.json
    link-verification.json
    final.html
    transcript.json
    provenance.json

The run manifest should record:

    {
      "runId": "...",
      "startedAt": "...",
      "completedAt": "...",
      "status": "passed",
      "provider": "...",
      "model": "...",
      "city": "...",
      "state": "...",
      "pageType": "...",
      "classification": "...",
      "gmb": false,
      "phaseOrder": [],
      "repairCounts": {},
      "promptVersions": {},
      "warnings": [],
      "errors": []
    }

A failed run must preserve all successful earlier outputs.

For example, if schema fails, the runner should still save:

    research-brief.json
    build.html
    seo-audited.html
    seo-verification.json

The runner must not discard the entire paid run because a later phase failed.

## 10. Deterministic rules

The model may be instructed to follow these rules, but code must enforce them independently.

At minimum, enforce:

- Required output type.
- Non-empty output.
- Complete HTML document.
- Valid JSON.
- Valid JSON-LD.
- Required counts.
- Required city and niche.
- Exactly one H1 where required.
- No placeholder content.
- No example.com links.
- Required email and contact URLs.
- GMB versus No-GMB restrictions.
- No invented local address, phone, hours, or CID in No-GMB mode.
- No contradictory GMB values.
- Credential phrasing.
- Required schema fields.
- Word-count floor if applicable.
- Repair cap.
- Timeout cap.
- Explicit verification verdict.
- Prompt version presence.
- Provider provenance.
- Model provenance.
- Elapsed time.
- Failure reason.

The model must never be the only authority that says:

    "I followed all requirements."

The validator must independently determine whether that statement is true.

## 11. Test strategy

Before claiming success, Claude Code should create or run tests for the following.

### Deterministic tests

- Valid input.
- Invalid input.
- Missing prompt file.
- Empty prompt file.
- Missing research.
- Empty provider response.
- Explanation-only response.
- Partial HTML response.
- Truncated HTML.
- Invalid JSON.
- Invalid JSON-LD.
- Incorrect GMB data.
- Forbidden No-GMB data.
- Missing verification verdict.
- Explicit failed verdict.
- Successful verdict.
- Rebuild cap exceeded.
- Verification cap exceeded.
- Missing prompt version.
- Earlier output preserved after later failure.

### Transport tests

- Provider timeout.
- Provider retry.
- Retry cap.
- Abort signal.
- HTTP error.
- Malformed provider response.
- Missing API key.
- Provider provenance capture.

### Repair-loop test

The repair loop must be tested with a deliberately invalid first response.

Example:

    First response:
    - missing one required section
    - contains one banned phrase
    - fails one deterministic gate

    Second response:
    - receives the exact validation errors
    - fixes the content
    - passes validation

A first-attempt success does not prove that the repair loop works.

### Real smoke test

After deterministic tests pass:

- Run one real provider.
- Use one city.
- Use one page type.
- Use one scenario.
- Save the complete package.
- Report the exact phase sequence.
- Report repair counts.
- Report provider and model.
- Report exit code.
- Do not print secret values.

## 12. Known failure modes to design out

The factory audit found several categories that the lean runner must avoid.

Do not copy:

- Unbounded fetches without abort signals.
- Silent exception swallowing.
- Missing external input becoming an empty prompt.
- Missing references becoming empty references.
- Invalid schema being replaced with generic placeholder schema.
- Prompt version drift.
- Literal prompt replacements that silently no-op.
- Loss of all earlier output after a late-phase failure.
- Missing elapsed time on failed runs.
- Missing correlation IDs.
- Long synchronous operations with no recovery.
- A phase stuck in running with no way to retry.
- Verification that accepts no verdict.
- Visual or scoring fallbacks that silently change the meaning of results.
- Provider-specific prompt exceptions.
- Model-specific special pleading.
- Artifact-only instructions being sent unchanged to a headless API.
- Desktop-only instructions requiring a human interaction.
- Stale grounding being reused without an age or provenance record.

## 13. Recommended responsibilities

### Claude Code fresh chat

Claude Code should:

- Read the source repositories.
- Identify the prompt source of truth.
- Produce the architecture report.
- Identify the prompt lineage.
- Define the phase contracts.
- Identify reusable mechanics.
- Identify excluded complexity.
- Implement the isolated runner after authorization.
- Add deterministic tests.
- Run the first real provider smoke test.
- Report exact evidence.
- Avoid modifying existing factories.

### Replit Agent

Replit Agent should:

- Give the bounded assignment.
- Prevent scope expansion.
- Review the source-of-truth report.
- Challenge unsupported assumptions.
- Check that existing Bake-Off files remain untouched.
- Check that Mission Control remains untouched.
- Check that Page Terminal remains untouched.
- Review the runner diff.
- Independently run deterministic verification.
- Independently run a real smoke test if the runner is accessible here.
- Check the saved output package.
- Distinguish verified facts from Claude Code claims.

Replit Agent should not build a competing implementation while Claude Code is working.

### Mark

The only decisions that should be required from Mark are:

- Which repository owns the new runner.
- Whether the framework repository is read-only.
- Which provider/model should be used for the first proof.
- Which first city should be used.
- Which page type should be used.
- Whether the first proof should be GMB or No-GMB.
- Whether live research is allowed for the first test.

## 14. How to run it

The recommended operating sequence is:

    Claude Code investigates
        -> Claude Code returns architecture report
        -> report is reviewed
        -> Claude Code implements isolated runner
        -> Claude Code runs deterministic tests
        -> Claude Code runs first direct-provider proof
        -> Replit independently checks the result
        -> Replit runs a second independent proof if possible
        -> generalization is considered only after the proof passes

Claude Code should be the implementation worker because it has the fresh context and can keep the source investigation and implementation together.

The runner must not use Claude Code's conversational answer as the content-generation response. Claude Code is implementing and operating the runner. The runner itself must call a direct provider SDK.

For this workspace, Gemini through the existing GEMINI_API_KEY is the easiest first direct-provider smoke test. This does not establish that Gemini must be the permanent model or default.

If the runner is built in another repository and this workspace cannot access its source, Claude Code should run the first real proof there. Replit should independently review the source diff and saved run package rather than creating a second implementation.

No new Replit-managed LLM connector should be added.

## 15. Exact first message for the fresh Claude Code chat

Use this as the first message:

You are starting a fresh implementation session for a new lean page-generation runner.

Do not write code yet.

Your first assignment is a read-only investigation of the prompt sources and the existing generation systems. Do not modify files, create files, install packages, change workflows, or push to any repository during this pass.

The goal is to understand the complete generation sequence and produce a source-backed architecture report before implementation.

The proposed sequence is:

1. research or grounding
2. optional Hub and Spoke handoff
3. Page Builder
4. Design validation and bounded rebuild
5. SEO Audit
6. explicit SEO verification and corrective loop
7. Schema Generator
8. final deterministic validation
9. saved output package

Do not assume this sequence is correct. Verify it against the authoritative prompt source and the actual Bake-Off, Mission Control, and Page Terminal implementations.

Important boundaries:

- The existing Bake-Off is already a working generation runner.
- Its reusable portion is the provider abstraction, conversation handling, prompt assembly, extraction, gates, retries, verification loops, transcripts, provenance, and persistence.
- Its scoring, leaderboard, screenshot, visual-judge, and multi-model comparison features are not required for the first lean runner.
- Mission Control is a separate production pipeline with different persistence and review behavior.
- Page Terminal is an operator-facing execution reference.
- The Precision E-Cycle adapter is a separate structured-data target and must not be merged into this HTML runner.
- Do not modify the existing Bake-Off.
- Do not modify Mission Control.
- Do not modify Page Terminal.
- Do not modify the external prompt source-of-truth repository.
- Do not add a Replit-managed LLM integration or connector.
- Use direct provider SDKs and existing project API keys only.
- Never inspect, print, or expose secret values.

First determine the actual source-of-truth repository for the generalized prompts and STS prompts. If that repository cannot be accessed, stop and report the limitation rather than guessing.

Read in this order:

STAGE 0: Project boundaries

- README.md
- replit.md
- SYSTEM-MAP.md
- The actual external framework repository containing the generalized prompts

Determine:

- authoritative prompt source
- current prompt versions
- STS prompt locations
- generalized prompt locations
- whether prompts are files, database records, or generated artifacts
- whether the external repository is read-only
- where the new runner is allowed to live
- what existing files must remain untouched

STAGE 1: Prompt contract

Read the authoritative prompt sources in dependency order:

- Hub and Spoke, if it is a real phase
- research prompt or research contract, if one exists
- Page Builder
- Design instructions
- SEO Audit
- Schema Generator
- execution prompts
- verification and repair prompts

For every prompt, document:

- required inputs
- optional inputs
- required files or attachments
- expected output format
- whether it expects continuous chat history
- whether it expects a human response
- whether it assumes Claude Desktop, artifacts, canvas, or file uploads
- whether it requires live web search
- whether it edits an existing artifact or creates a new one
- which later phase consumes its output
- which rules require deterministic code

Explicitly answer:

1. Is Hub and Spoke an upstream generation phase or an optional handoff?
2. Is research a separate prompt, a provider-backed phase, or only Phase 0 inside SEO Audit?
3. What is the exact output contract of every phase?
4. Which phase owns design validation?
5. Which phase strips or regenerates schema?
6. Which phase verifies links?
7. Which phases require the full prior conversation history?

STAGE 2: Bake-Off mechanics

Read:

- scripts/src/bakeoff/conversation.ts
- scripts/src/bakeoff/miniPrompts.ts
- scripts/src/bakeoff/providers.ts
- scripts/src/bakeoff/extract.ts
- scripts/src/bakeoff/designGate.ts
- scripts/src/bakeoff/fixtures.ts
- scripts/src/bakeoff/gmb.ts
- scripts/src/bakeoff/types.ts
- scripts/src/bakeoff/target.ts
- scripts/src/bakeoff/produce.ts
- scripts/src/bakeoff/run.ts

Then inspect routed, resume, history, and cost modules only where needed.

Separate:

A. reusable runner mechanics

B. Bake-Off-only evaluation features

Do not propose importing the leaderboard, visual judge, screenshot scoring, blind judge panel, model fan-out, or cost-ranking system into the first runner.

STAGE 3: Mission Control contracts

Read:

- lib/mc-core/src/types.ts
- lib/mc-core/src/pipeline/orchestrator.ts
- lib/mc-core/src/prompts/builders.ts
- lib/mc-core/src/engine/types.ts
- lib/mc-core/src/engine/base.ts
- lib/mc-core/src/checkers/
- lib/mc-core/src/schema/generator.ts
- lib/mc-core/src/research/provider.ts
- lib/mc-core/src/research/direct.ts
- artifacts/api-server/src/lib/mc-runtime.ts
- artifacts/api-server/src/routes/mc.ts

Explain what should be reused conceptually:

- phase contracts
- explicit state
- checker gates
- provider seams
- fail-loud handling
- persistence boundaries
- review boundaries

Also explain what should not be copied into the first lean runner.

STAGE 4: Factory failure analysis

Read:

- .claude/factory-audit-report.md
- .claude/factory-audit-prompt.md
- docs/mission-control-drift-report.md
- docs/CLAUDE-BAKEOFF-HANDOFF.md

Identify every failure category the new runner must prevent, including:

- unbounded network calls
- missing abort signals
- swallowed exceptions
- empty output
- explanation-only output
- malformed output
- silent placeholder fallbacks
- prompt version drift
- prompt replacement no-ops
- missing explicit verdicts
- loss of earlier phase outputs
- missing failed-turn timing
- missing correlation IDs
- non-resumable state
- stuck running state
- synchronous long-running operations
- provider-specific exceptions
- artifact or desktop assumptions that do not work through APIs
- missing provenance
- ambiguous prompt source
- stale cached grounding
- missing reference provenance

STAGE 5: Page Terminal

Read:

- artifacts/page-terminal/public/tools/hub-spoke.html
- artifacts/page-terminal/public/tools/no-gmb.html
- artifacts/page-terminal/public/tools/page-terminal.html

Compare its behavior against the prompt source, Bake-Off, and Mission Control. Label every difference as identical, intentional divergence, accidental drift, or unclear.

STAGE 6: Precision adapter

Read:

- scripts/src/precision-adapter/cityDataSchema.ts
- scripts/src/precision-adapter/validate.ts
- scripts/src/precision-adapter/buildRecord.ts
- scripts/src/precision-adapter/prompt-pack/

Explain which ideas apply to the new runner:

- explicit output contracts
- deterministic validation
- bounded repair loops
- fail-loud provider behavior
- separate model output from deterministic consumption

Do not merge that adapter into this runner.

Required report:

1. Confirmed repository and prompt source-of-truth map
2. Prompt lineage table
3. Prompt dependency graph
4. Actual end-to-end phase sequence
5. Hub and Spoke conclusion
6. Research-phase conclusion
7. Bake-Off reusable mechanics
8. Bake-Off features that must remain excluded
9. Mission Control concepts worth reusing
10. Page Terminal behavior and divergences
11. Factory failure modes
12. Proposed input contract
13. Proposed phase-state contract
14. Proposed output package
15. Proposed deterministic gates
16. Proposed provider boundary
17. Proposed test strategy
18. Exact files to create
19. Exact existing files to leave untouched
20. Questions requiring operator decisions

Do not implement anything during this pass.

Do not report success merely because files exist. Return the research report and wait for a separate implementation authorization.

## 16. Implementation authorization message

After the research report is returned and reviewed, use this separate message:

The research report is complete.

Before editing, restate:

1. the confirmed prompt source of truth
2. the final phase order
3. the final input contract
4. the final output package
5. the exact files to create
6. the exact existing files to leave untouched
7. the deterministic gates
8. the provider and model for the first proof
9. the deterministic test commands
10. the real smoke-test command

Now implement only the approved lean runner.

Constraints:

- Use a new isolated directory.
- Do not modify scripts/src/bakeoff/**.
- Do not modify artifacts/page-terminal/**.
- Do not modify artifacts/mission-control/**.
- Do not modify lib/mc-core/** unless separately authorized.
- Do not modify the external framework or prompt-source repository.
- Do not add Replit-managed LLM integrations.
- Use direct provider SDKs and existing API keys.
- Do not print or expose secrets.
- Fail loudly on missing input, missing prompts, missing credentials, empty output, malformed output, invalid JSON, invalid JSON-LD, failed gates, missing verdicts, timeout, and exceeded repair caps.
- Record prompt versions, provider, model, timing, errors, and provenance.
- Preserve successful earlier phase outputs when a later phase fails.
- Use bounded retries and abortable timeouts.
- Do not add model-specific prompt exceptions.
- Do not add routing, fan-out, scoring, screenshots, visual judging, or dashboard integration.

First implementation target:

- one brand
- one city
- one page type
- one GMB or No-GMB scenario
- one provider
- one model
- one complete run package

After implementation:

1. run deterministic tests with no network
2. run the typecheck
3. run the repair-loop test with a deliberately invalid first response
4. run one real provider-backed smoke test
5. save the complete output package
6. report the exact commands and exit codes
7. report the complete phase sequence
8. report repair counts
9. report provider and model
10. report all output paths
11. clearly label verified results, assumptions, and remaining gaps

## 17. Final success criteria

The first proof is successful only when all of the following are true:

- The prompt source of truth is identified.
- Prompt versions are recorded.
- The actual phase order is documented.
- The runner is isolated from the existing factories.
- Input is schema-validated.
- Model output is deterministic-gate validated.
- Invalid output fails loudly.
- Repair behavior is tested with a real induced failure.
- Earlier outputs survive later failures.
- Provider timeouts and errors are observable.
- The final page is saved.
- The schema is saved and parseable.
- The transcript is saved.
- The provider and model are recorded.
- The run has an explicit pass or fail result.
- One real provider-backed run completes.
- Replit independently verifies the result.

Do not call the runner generalized or production-ready after one happy-path run.

The right first milestone is:

    one real input
        -> one complete generation
        -> deterministic gates
        -> repair behavior
        -> valid final page and schema
        -> inspectable evidence

Only after that proof passes should routing, multiple providers, multiple brands, batching, publishing, or dashboard integration be considered.
