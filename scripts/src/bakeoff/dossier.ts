/**
 * Bake-off DOSSIER builder.
 *
 * Assembles ONE exhaustive Markdown writeup of the entire multi-LLM bake-off
 * harness — architecture overview, the full run/model/routing config, every
 * prompt (mini prompts + uploaded master fixtures), the complete harness source,
 * the golden reference page (HTML + schema), a representative generated page, and
 * a compact-but-complete results/log summary derived from the latest run.
 *
 * This is a read-only packaging step (no model calls): it just walks the
 * `scripts/src/bakeoff` tree + the latest `results.json` and emits
 * `exports/bakeoff-dossier.md`. The dossier is the single artifact handed to the
 * reviewer models in `review.ts`.
 *
 *   pnpm --filter @workspace/scripts run bakeoff:dossier
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts/src/bakeoff
const ROOT = path.resolve(HERE, "../../.."); // workspace root
const OUT = path.join(ROOT, "exports", "bakeoff-dossier.md");

const read = (p: string): string => fs.readFileSync(p, "utf8");
const rel = (p: string): string => path.relative(ROOT, p);
const exists = (p: string): boolean => fs.existsSync(p);

/** Pick a fence longer than any backtick run inside the content so it never breaks. */
function fence(content: string, lang = ""): string {
  let longest = 0;
  for (const m of content.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  const bar = "`".repeat(Math.max(3, longest + 1));
  return `${bar}${lang}\n${content}\n${bar}`;
}

const langFor = (file: string): string => {
  const ext = path.extname(file).toLowerCase();
  return (
    { ".ts": "ts", ".tsx": "tsx", ".html": "html", ".json": "json", ".md": "md", ".tsv": "text", ".txt": "text", ".css": "css" }[
      ext
    ] ?? "text"
  );
};

const parts: string[] = [];
const push = (s: string) => parts.push(s);

function fileSection(title: string, absPath: string, note?: string): void {
  if (!exists(absPath)) {
    push(`### ${title}\n\n_(missing: ${rel(absPath)})_\n`);
    return;
  }
  const content = read(absPath);
  push(`### ${title}\n\n\`${rel(absPath)}\` — ${content.length.toLocaleString()} chars${note ? ` — ${note}` : ""}\n\n${fence(content, langFor(absPath))}\n`);
}

// ---------------------------------------------------------------------------
// 0. Header + how to read
// ---------------------------------------------------------------------------
push(`# Bake-Off Harness — Complete Technical Dossier

_Generated ${new Date().toISOString()} by \`scripts/src/bakeoff/dossier.ts\`._

This document is an exhaustive snapshot of the **multi-LLM "bake-off" harness** built
for STS Electronic Recycling. The harness is an out-of-tree, faithful port of the
manual "No-GMB" page-building workflow a virtual assistant runs by hand in a
Claude.ai chat, re-implemented so the *identical* checklist, prompts, and uploaded
design files are driven across multiple frontier models (Claude, Gemini, OpenAI,
Grok) and scored apples-to-apples against the real published page.

It contains, in order:

1. Architecture & methodology overview
2. Run / model / routing configuration
3. The prompts — mini (per-turn) prompts + the uploaded master fixtures
4. The complete harness source (every \`.ts\` file)
5. The golden reference page (HTML + schema) + a representative generated page
6. The latest run's results & log summary (scores, costs, per-phase verdicts)

You are being asked to **review this system**: judge the architecture, the fairness
of the comparison, the prompt engineering, the scoring rubric, correctness/risks,
and what could be done better.
`);

// ---------------------------------------------------------------------------
// 1. Architecture overview
// ---------------------------------------------------------------------------
push(`## 1. Architecture & methodology overview

**Goal.** Reproduce, with byte-for-byte fidelity, the human "No-GMB" page-build
workflow (a VA pasting a fixed sequence of prompts into a single stateful Claude.ai
chat, with design/spec files uploaded once) and run it across several models so
their output pages can be compared on equal footing.

**Faithfulness principles (the whole point of the harness):**

- **One stateful conversation per model.** Each model runs the entire checklist in a
  single growing message history (intro → build → design gate / force-rebuild loop →
  SEO audit → SEO verification → schema → link verification), exactly like a chat's
  scrollback. The full history is re-sent every turn.
- **Byte-identical prompts & files for every model.** The per-turn prompts are a
  verbatim port of the tool's \`copyPrompt()\` output; the uploaded design/spec files
  are inlined as the API-faithful stand-in for file uploads. The ONLY model-specific
  surface is the provider completion adapter (\`providers.ts\`).
- **One shared grounding.** A single local-market research brief is authored once and
  handed identically to every model, so the build comparison is not contaminated by
  per-model research differences.
- **No special-casing.** If a model refuses to build (e.g. demanding a page_url / GMB
  block first), that is recorded faithfully as an ERROR — never patched away — because
  special-casing one model would break the comparison.
- **Fail loud.** Missing inputs, malformed schema, empty responses, and exhausted
  retries surface as labelled errors rather than silent placeholders.

**Two scenarios** share one grounding and differ ONLY by the intro context handed to
the models: \`no-gmb\` (the exact production context — city/state targeting, no
page_url, no Google Business Profile block) and \`gmb\` (every model gets an identical
enriched intro: explicit page_url + a GMB data block). Keeping them as sibling
scenarios — rather than patching only the refusing model's prompt — preserves
apples-to-apples.

**Two additive production modes** (separate from the comparison) drive a real
"produced page": SINGLE engine (one named model runs every phase) and ROUTED (a main
model per phase + an automatic backup that takes over on error/refusal/invalid
output). See \`routing.ts\`.

**Scoring.** Each generated page is scored on a weighted composite of: checker audit
(errors/warnings), structural completeness, JSON-LD schema validity, link audit,
word-count floor, speed, HTML closeness to the real page, and visual closeness
(rendered-screenshot perceptual pixel-diff + a vision-LLM rating, with a design-token
proxy fallback). See \`score.ts\` / \`visual.ts\`.

**Web search.** On the SEO-verify turn (whose prompt says "search the web for current
2025-2026 SEO best practices") each adapter attaches the provider's NATIVE web-search
tool for that one call only — off everywhere else — so the turn order stays identical.
`);

// ---------------------------------------------------------------------------
// 2. Run / model / routing config (pulled from source already, but call out the
//    package scripts + replit.md product context)
// ---------------------------------------------------------------------------
push(`## 2. Run configuration & operator commands\n`);
fileSection("Package scripts (how the harness is invoked)", path.join(ROOT, "scripts", "package.json"));
const replitMd = path.join(ROOT, "replit.md");
if (exists(replitMd)) {
  // Only the bake-off-relevant context; include the whole file for completeness.
  fileSection("Project README / product context (replit.md)", replitMd);
}

// ---------------------------------------------------------------------------
// 3. Prompts: mini prompts + grounding + uploaded master fixtures
// ---------------------------------------------------------------------------
push(`## 3. The prompts

These are the heart of the faithful port. The mini (per-turn) prompts below are a
verbatim port of the production tool's \`copyPrompt()\` output. The master fixtures
after them are the files a VA "uploads" into the chat once (design system, page
builder spec, schema generator, SEO audit checklist, and the STS SEO data sheet).
`);
fileSection("Per-turn mini prompts", path.join(HERE, "miniPrompts.ts"));
fileSection("Shared grounding author", path.join(HERE, "grounding.ts"));
const fixturesDir = path.join(HERE, "fixtures");
if (exists(fixturesDir)) {
  push(`### Uploaded master fixtures\n`);
  for (const f of fs.readdirSync(fixturesDir).sort()) {
    fileSection(`Fixture — ${f}`, path.join(fixturesDir, f));
  }
}

// ---------------------------------------------------------------------------
// 4. Full harness source
// ---------------------------------------------------------------------------
push(`## 4. Complete harness source

Every TypeScript module in \`scripts/src/bakeoff\` (excluding the two dossier/review
tooling scripts themselves, and the prompt/fixture files already shown above).
`);
const SKIP = new Set(["dossier.ts", "review.ts", "miniPrompts.ts", "grounding.ts"]);
const srcFiles = fs
  .readdirSync(HERE)
  .filter((f) => f.endsWith(".ts") && !SKIP.has(f))
  .sort();
for (const f of srcFiles) {
  fileSection(`Source — ${f}`, path.join(HERE, f));
}

// ---------------------------------------------------------------------------
// 5. Reference page + representative generated page
// ---------------------------------------------------------------------------
push(`## 5. Golden reference page & a representative generated page

The reference page is the REAL published STS page the models are scored against. A
representative generated page (the highest-composite model from the latest run) is
included so reviewers can judge actual output quality.
`);
fileSection("Golden reference page (HTML)", path.join(HERE, "reference", "billings-mt.html"));
fileSection("Golden reference page (extracted schema)", path.join(HERE, "reference", "billings-mt-schema.txt"));

// ---------------------------------------------------------------------------
// 6. Results & log summary (compact extraction from the latest results.json)
// ---------------------------------------------------------------------------
push(`## 6. Latest run — results & log summary\n`);
const resultsPath = path.join(ROOT, "artifacts", "bake-off", "src", "data", "results.json");
if (!exists(resultsPath)) {
  push(`_(no results.json found at ${rel(resultsPath)})_\n`);
} else {
  interface PhaseTiming {
    phase: string;
    ms: number;
    summary: string;
    errorCount: number;
    warningCount: number;
    wordCount: number;
    verdict?: "passed" | "failed" | null;
  }
  interface ModelResult {
    id: string;
    label: string;
    provider: string;
    model: string;
    status: string;
    error: string | null;
    html: string | null;
    schema: string | null;
    schemaValid: boolean;
    timings: PhaseTiming[];
    totalMs: number;
    scores: Record<string, number | null> | null;
    costEstimate: { totalUsd?: number } | null;
  }
  interface Scenario {
    id: string;
    label: string;
    description: string;
    notes: string[];
    models: ModelResult[];
  }
  interface Results {
    ranAt: string;
    target: Record<string, string>;
    grounding: { source: string; content: string };
    scenarios: Scenario[];
  }
  const r = JSON.parse(read(resultsPath)) as Results;

  push(`**Ran at:** ${r.ranAt}\n`);
  push(`**Target:**\n\n${fence(JSON.stringify(r.target, null, 2), "json")}\n`);
  push(
    `**Grounding source:** ${r.grounding.source}\n\nFull shared grounding brief handed identically to every model:\n\n${fence(
      r.grounding.content,
      "text",
    )}\n`,
  );

  let topModel: ModelResult | null = null;
  for (const sc of r.scenarios) {
    push(`### Scenario: ${sc.label} (\`${sc.id}\`)\n\n${sc.description}\n`);
    if (sc.notes?.length) push(sc.notes.map((n) => `- ${n}`).join("\n") + "\n");
    for (const m of sc.models) {
      const sc2 = m.scores ?? {};
      const composite = typeof sc2.composite === "number" ? sc2.composite : null;
      if (m.status === "ok" && composite !== null && (!topModel || (topModel.scores?.composite ?? -1) < composite)) {
        topModel = m;
      }
      const usd = m.costEstimate?.totalUsd;
      push(
        `#### ${m.label} — ${m.provider} (\`${m.model}\`)\n\n` +
          `- **status:** ${m.status}${m.error ? ` — ERROR: ${m.error}` : ""}\n` +
          `- **composite:** ${composite ?? "n/a"}\n` +
          `- **scores:** ${JSON.stringify(m.scores)}\n` +
          `- **schemaValid:** ${m.schemaValid}\n` +
          `- **total time:** ${(m.totalMs / 1000).toFixed(1)}s${usd != null ? ` — est. cost $${usd.toFixed(4)}` : ""}\n` +
          `- **html length:** ${m.html ? m.html.length.toLocaleString() + " chars" : "none"}\n`,
      );
      if (m.timings?.length) {
        const rows = m.timings
          .map(
            (t) =>
              `  - ${t.phase}: ${(t.ms / 1000).toFixed(1)}s, ${t.wordCount} words, ${t.errorCount} err / ${t.warningCount} warn${
                t.verdict !== undefined ? `, verdict=${t.verdict}` : ""
              } — ${t.summary}`,
          )
          .join("\n");
        push(`- **per-phase log:**\n${rows}\n`);
      }
    }
  }

  if (topModel?.html) {
    push(
      `### Representative generated page — ${topModel.label} (highest composite, \`${topModel.model}\`)\n\n${fence(
        topModel.html,
        "html",
      )}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const doc = parts.join("\n");
fs.writeFileSync(OUT, doc);
console.log(`Dossier written: ${rel(OUT)}`);
console.log(`  ${doc.length.toLocaleString()} chars (~${Math.round(doc.length / 4).toLocaleString()} tokens rough)`);
