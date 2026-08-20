# 🔨 Mark's Builder Protocol
**Prompt Engineering · Automation Architecture · App & Agent Design**  
Version 1.0 · Personal Edition · March 2026

---

Build-session protocol for constructing prompt systems, n8n automation workflows, application logic, and AI agent architectures. Extends the Lite Protocol with engineering-grade controls for schema enforcement, loop management, and error propagation. Activate only what the build requires. The Use If Needed section at the end surfaces Master Protocol techniques for edge cases where standard build controls are insufficient. This is a personal working document — not intended for general distribution.

---

## Good For

- Writing new prompt systems, system prompts, and chained prompt architectures
- Designing n8n workflows from scratch including node logic, routing, and error handling
- Building automation pipelines with structured schema inputs and validated outputs
- Creating AI agents with defined tool use, loop control, and stop conditions
- Developing application logic for AI-powered tools (e.g. WIW, valuation systems)
- Constructing VA instruction sets for repeatable build and production workflows
- Testing and iterating prompt performance through structured critique-revision cycles
- Debugging logic failures in existing automations or prompt chains

---

## 🧩 Foundation — Lite Core Principles

*These carry over from the Lite Protocol. Active by default in every build session.*

- [ ] **Context Awareness** — Retain full situational context. Connect current build to prior project logic, existing schemas, and downstream dependencies.

- [ ] **Clarifying Logic** — Resolve ambiguity before building. One unclear requirement at the architecture stage creates multiple failures at execution.

- [ ] **Output Destination Awareness** — Identify every target system the output will touch before writing a single node, field, or prompt line.  
  > ⚑ JSON, HTML, CMS fields, n8n nodes, CRM imports, and API endpoints each have distinct structural requirements.

- [ ] **Structural Integrity Check** — Verify schema, field order, and format at each stage. Do not assume compatibility — confirm it.

- [ ] **Confidence Flagging** — Flag uncertainty before delivering any build output. A confident-sounding guess in an automation spec causes silent downstream failures.

- [ ] **Fallback Behavior** — Define what happens when the build cannot proceed cleanly. State what is missing and halt rather than producing a partial spec.

- [ ] **Change vs. New Distinction** — When modifying an existing prompt, workflow, or schema, explicitly flag what changed vs. what is new.

- [ ] **Implementation Validation** — Confirm every deliverable is deployable in its target environment before handoff. Test assumptions, not just logic.

---

## 🔧 Core Build Controls

*Primary engineering controls for prompt, automation, and application builds. Apply based on what the build requires.*

### Prompt Engineering

- [ ] **Meta Prompting** — Before writing any prompt, ask the model to analyze the task and propose the optimal prompt structure. Build from that foundation, not from scratch.  
  > ⚑ Use at the start of every new prompt system. Saves iteration cycles.

- [ ] **Few-Shot Example Injection** — Provide 2–5 worked input/output examples directly in the prompt. The single most powerful alignment technique when a target format exists.  
  > ⚑ If you have a Design Bible, page template, or known-good output — show it. Don't describe it.

- [ ] **Negative Example Injection** — Include an explicit 'bad output' example alongside positive examples. Constraint-based guidance produces more measurable style control than role prompts alone.  
  > ⚑ Use whenever output drift is a recurring problem on a known template.

- [ ] **Role Assignment** — Assign a specific, named persona with defined constraints. Specific roles outperform generic 'you are an expert' prompts measurably.

- [ ] **Structured Output Enforcement** — Mandate exact output schema before generation: JSON, XML, CSV, markdown, or custom template. Validate against schema before the output touches any downstream system.  
  > ⚑ Non-negotiable for any output entering an automation pipeline, CMS, or database.

- [ ] **Critique–Revision Loop** — Draft → self-evaluation → optimized revision. Minimum one structured revision pass before any prompt goes to production.  
  > ⚑ Use the model to critique its own output using specific criteria before finalizing.

- [ ] **Prompt Chaining** — Scope each prompt to a single task. Pass outputs forward as structured inputs. Validate at each handoff point.

- [ ] **Clarification Preconditioning** — For complex prompt systems, require the model to ask 2–3 targeted clarifying questions before generating. Forces explicit scope confirmation.

### Automation & Workflow Architecture

- [ ] **Agentic Loop Control** — Every automated workflow must have defined stop conditions, retry limits, error recovery paths, and human escalation triggers before deployment.  
  > ⚑ Define upfront: what success looks like, what failure triggers a halt, what gets escalated vs. retried.

- [ ] **Error Propagation Analysis** — Before deploying any multi-step workflow, trace how a small error in step 1 compounds through steps 2, 3, and beyond. Fix the chain, not just the node.  
  > ⚑ The most common automation failure is a silent partial output that looks correct until it hits the final system.

- [ ] **Schema Validation Layer** — Build an explicit validation step between output generation and downstream system injection. Do not trust format compliance — verify it.

- [ ] **Prompt Injection Awareness** — Any input entering a prompt from an external source (form submissions, scraped content, VA inputs, API responses) is a potential injection vector. Sanitize before use.

- [ ] **Modular Workflow Sequencing** — Scope each workflow stage independently: Design → Build → Validate → Deploy. Never conflate stages in a single prompt or node.

- [ ] **Context Budget Management** — For long-running automations and multi-turn sessions, monitor context window consumption. Performance degrades non-uniformly as token counts grow.  
  > ⚑ Build context reset points into long workflows. Don't assume the model retains full fidelity across 50+ turns.

### App & Agent Design

- [ ] **Tool Definition Clarity** — Every tool available to an agent must have an explicit name, description, input schema, and expected output format defined before the agent is invoked.

- [ ] **Agent Memory Architecture** — Define before build: what the agent stores, what it retrieves, what it forgets, and when. Agents without explicit memory design hallucinate context.

- [ ] **Multi-Step Task Decomposition** — Break complex agent tasks into the smallest independently verifiable subtasks. Validate each before chaining to the next.

- [ ] **Fallback & Graceful Degradation** — Every agent flow must define what happens when a tool fails, a schema is malformed, or an unexpected input arrives. Silence is not a valid fallback.

- [ ] **Implementation Handoff Spec** — Before any agent or app goes to VA execution or deployment, produce a structured handoff document: inputs, outputs, dependencies, edge cases, and stop conditions.

---

## ✅ Build Execution Sequence

*Standard operating sequence for every build session.*

1. **Define the build** — State what is being built, what it connects to, and what success looks like before writing anything.
2. **Identify all destinations** — Every system the output will touch. Confirm schema requirements for each.
3. **Meta Prompt** — Ask the model to propose the optimal structure for this build before executing.
4. **Build in stages** — One stage at a time. Validate output before moving to the next.
5. **Schema check** — Confirm output matches the required schema before passing downstream.
6. **Critique–revision pass** — Self-evaluate the build against the original spec. At least one revision cycle.
7. **Error propagation check** — Trace failure paths through the full chain before deployment.
8. **Handoff spec** — Produce a structured handoff document before VA execution or deployment.

---

## ⚠️ Use If Needed — Advanced Techniques

*Pull from this section when standard build controls are insufficient. These are Master Protocol techniques that occasionally apply to complex build sessions. Do not activate by default.*

### Advanced Reasoning

- [ ] **Tree of Thoughts (ToT)** — When a build decision has no obvious single path, explore multiple reasoning branches simultaneously with self-evaluation before committing.  
  > ⚑ Use when CoT produces one answer you can't validate. ToT surfaces alternatives you can compare.

- [ ] **Self-Consistency** — Generate the same build output via multiple independent reasoning paths, then select the most consistent result.  
  > ⚑ High value for schema design and workflow architecture where small differences in approach produce meaningfully different outputs.

- [ ] **Graph of Thoughts (GoT)** — For builds requiring synthesis across multiple independent inputs — model reasoning as a graph rather than a chain. Enables non-linear aggregation.  
  > ⚑ Use when merging outputs from multiple data sources, agents, or prompt chains into a single coherent system.

- [ ] **Step-Back Prompting** — Before solving a specific build problem, ask the model to step back to the underlying principle. Prevents tunnel vision on the wrong solution.

- [ ] **Least-to-Most Decomposition** — For large, complex builds: decompose into the simplest solvable subproblems first, validate each, then build up to the full architecture.

### Critical Thinking Checks

- [ ] **Hallucination Detection** — Verify all schema fields, API parameters, tool names, and system references are real and confirmed — not plausible-sounding fabrications.  
  > ⚑ Especially critical for technical specs, database schemas, and integration parameters.

- [ ] **Contradiction Detection** — Before finalizing any multi-component build, check that no two components produce conflicting outputs or make incompatible assumptions.

- [ ] **Error Propagation Analysis (Deep)** — For high-stakes automations: formally trace every failure path before deployment. Map what breaks, what propagates silently, and what escalates.

- [ ] **Assumptions Audit** — List every assumption the build makes that hasn't been explicitly confirmed. Unverified assumptions in automation specs become production bugs.

- [ ] **Regulatory / Platform Compliance** — Does the build comply with applicable platform constraints, API terms, data handling policies, or operational guardrails?

### Context Engineering

- [ ] **Context Window Architecture** — For long or multi-session builds: explicitly design what enters the context at each step. The LLM is the CPU; the context window is RAM — manage it deliberately.

- [ ] **RAG Integration** — When the build requires grounding in external data (product specs, pricing databases, prior outputs), design the retrieval layer before the generation layer.

- [ ] **Multi-Persona Simulation** — For strategic build decisions: emulate multiple expert agents (architect, security reviewer, end user) to stress test the design before committing.  
  > ⚑ Use sparingly. High overhead, but valuable for complex agent architectures.

---

🔨 Builder Protocol Active — Build in stages. Validate at every handoff. Escalate to Master for novel reasoning or high-stakes architecture decisions.

---

*Mark's Builder Protocol v1.0 · Personal Edition · March 2026 · Not for Distribution*
