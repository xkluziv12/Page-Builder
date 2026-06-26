/**
 * Bake-off DOSSIER review runner.
 *
 * Sends the single assembled dossier (`exports/bakeoff-dossier.md`, built by
 * `dossier.ts`) to several frontier models and asks each for a critical review of
 * the harness — architecture, fairness of the comparison, prompt engineering,
 * scoring rubric, correctness/risks, and concrete improvements ranked by impact.
 *
 * Each model gets the IDENTICAL dossier + identical review instruction (the same
 * apples-to-apples discipline the harness itself uses). Models are resolved
 * through the existing registry (`buildModelsForIds`) so the masked provider
 * model tags are never hand-typed.
 *
 * Resumable: a model whose review file already exists is skipped unless
 * REVIEW_FORCE=1. Each model is built + run independently so a missing key or a
 * single failure never blocks the others.
 *
 *   REVIEW_MODELS=claude,gemini,grok,openai-std \
 *     pnpm --filter @workspace/scripts run bakeoff:review
 *
 * Default lineup: claude (Opus 4.8), gemini (3.1 Pro), grok (newest), openai-std
 * (GPT-5.5). NOTE: long reasoning calls exceed the inline bash limit — run this
 * via a console workflow, not inline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelsForIds } from "./routing.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts/src/bakeoff
const ROOT = path.resolve(HERE, "../../..");
const DOSSIER = path.join(ROOT, "exports", "bakeoff-dossier.md");
const OUTDIR = path.join(HERE, "output", "reviews");
const rel = (p: string): string => path.relative(ROOT, p);

const IDS = (process.env.REVIEW_MODELS ?? "claude,gemini,grok,openai-std")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FORCE = process.env.REVIEW_FORCE === "1";
/** Modest output reservation so even the smallest-window reviewer fits the big prompt. */
const REVIEW_MAX_TOKENS = Number(process.env.REVIEW_MAX_TOKENS ?? 16000);

const REVIEW_INSTRUCTION = `You are a principal-level engineer and technical SEO expert performing a rigorous,
candid design review of the multi-LLM "bake-off" harness fully described in the
dossier below. Read the WHOLE dossier (architecture, prompts, source, reference
page, results) before answering.

Write a thorough but well-structured review covering:

1. **Overall assessment** — what this system is, whether it achieves its stated goal
   (a faithful, apples-to-apples reproduction of the manual page-build workflow), and
   your headline verdict.
2. **Strengths** — what is genuinely well done.
3. **Fairness / methodology** — is the comparison actually apples-to-apples? Scrutinize
   the "one shared grounding", the per-turn web-search knob, the streaming/background
   transport differences between providers, the refusal handling, and anything that
   could bias one model over another.
4. **Prompt engineering** — quality of the mini prompts + master fixtures; injection /
   untrusted-input exposure; ambiguity; anything that would degrade output quality.
5. **Scoring rubric** — are the weighted scores (audit, structure, schema, links, word
   count, speed, html-match, visual-match) measuring the right things? Where could the
   composite mislead? Visual scoring soundness.
6. **Correctness, bugs & risks** — concrete defects, race conditions, fail-loud gaps,
   edge cases, schema/validation holes, cost/timeout traps.
7. **What's missing / what to do better** — a prioritized, concrete list of
   improvements, highest-impact first, each with a one-line rationale.

Be specific and reference actual files / functions / prompts from the dossier. Prefer
sharp, actionable critique over praise. If something is a genuine problem, say so
plainly.`;

async function reviewOne(id: string): Promise<void> {
  const outFile = path.join(OUTDIR, `${id}.md`);
  if (!FORCE && fs.existsSync(outFile)) {
    console.log(`skip ${id} (exists: ${rel(outFile)})`);
    return;
  }
  const t0 = Date.now();
  let model;
  try {
    const reg = await buildModelsForIds([id]);
    model = reg.get(id);
    if (!model) throw new Error(`model id "${id}" not in registry`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   FAIL ${id} (build): ${msg}`);
    fs.writeFileSync(path.join(OUTDIR, `${id}.ERROR.txt`), `build failed: ${msg}\n`);
    return;
  }

  const dossier = fs.readFileSync(DOSSIER, "utf8");
  const prompt = `${REVIEW_INSTRUCTION}\n\n=== BEGIN DOSSIER ===\n\n${dossier}\n\n=== END DOSSIER ===\n`;
  console.log(`-> ${model.label} (${model.model}) reviewing ${dossier.length.toLocaleString()} chars...`);
  try {
    const res = await model.complete([{ role: "user", content: prompt }], undefined, {
      maxOutputTokens: REVIEW_MAX_TOKENS,
    });
    const header =
      `# Bake-Off harness review — ${model.label}\n\n` +
      `- **Provider:** ${model.provider}\n- **Model:** \`${model.model}\`\n` +
      `- **Generated:** ${new Date().toISOString()} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n\n---\n\n`;
    fs.writeFileSync(outFile, header + res.content.trim() + "\n");
    console.log(`   done ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${rel(outFile)} (${res.content.length.toLocaleString()} chars)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   FAIL ${id} (review): ${msg}`);
    fs.writeFileSync(path.join(OUTDIR, `${id}.ERROR.txt`), `review failed: ${msg}\n`);
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(DOSSIER)) {
    throw new Error(`Dossier not found at ${rel(DOSSIER)}. Run bakeoff:dossier first.`);
  }
  fs.mkdirSync(OUTDIR, { recursive: true });
  console.log(`Reviewing dossier across: ${IDS.join(", ")}\n`);
  await Promise.allSettled(IDS.map((id) => reviewOne(id)));
  console.log(`\nReview run complete. Outputs in ${rel(OUTDIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
