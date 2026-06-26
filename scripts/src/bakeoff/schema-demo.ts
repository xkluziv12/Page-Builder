import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverNewestGrok,
  makeClaudeComplete,
  makeGeminiComplete,
  makeOpenAIComplete,
  makeGrokComplete,
  type ChatMessage,
  type CompleteFn,
} from "./providers.js";
import { schemaPrompt, SCHEMA_TO_INLINE, type PromptVars } from "./miniPrompts.js";
import { extractSchemaJson } from "./extract.js";
import { loadDesignFixtures } from "./fixtures.js";

/**
 * Cheap, single-turn DEMO of the Schema Generator step across every model. It is
 * the schema analogue of `seo-verify-demo`: instead of running the whole bake-off
 * pipeline (build → design gate → seo → seo-verify → schema), it loads ONE
 * already-built, SEO-verified HTML page and sends each model exactly ONE turn —
 *
 *     [the SEO-verified HTML] + [schema execution prompt] + [Schema Generator file]
 *
 * — i.e. the same payload the pipeline's schema turn sends, so you can compare how
 * each model generates JSON-LD for the SAME page without paying for a full sweep.
 * Each model gets ONE API call. The HTML is seeded as the prior "build" turn (so
 * the SCHEMA_TO_INLINE shim's "use the current HTML in this conversation" is true),
 * then the verbatim schemaPrompt + the inlined Schema Generator + the shim is sent.
 *
 * The schema is extracted and validated (must be ONE valid
 * <script type="application/ld+json">…</script> block — fail loud otherwise) and
 * each model's block is written to output/schema-demo/<id>.txt for side-by-side
 * comparison.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run bakeoff:schema-demo
 *   SCHEMA_DEMO_HTML=/path/to/page.html pnpm ... run bakeoff:schema-demo
 *   SCHEMA_DEMO_MODELS=claude,gemini pnpm ... run bakeoff:schema-demo
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HTML = resolve(HERE, "reference/billings-mt.html");
const OUT_DIR = resolve(HERE, "output/schema-demo");

const TARGET = { city: "Billings", state: "MT", niche: "electronics recycling" };

function promptVars(): PromptVars {
  return {
    city: TARGET.city,
    state: TARGET.state,
    url: `https://www.stselectronicrecyclinginc.com/${TARGET.city.toLowerCase()}-${TARGET.state.toLowerCase()}`,
    niche: TARGET.niche,
    pageName: `${TARGET.city} ${TARGET.niche}`,
    hubSpoke: "",
  };
}

interface ModelSpec {
  id: string;
  label: string;
  complete: CompleteFn;
}

/** The four-model line-up the comparison runs: gpt-5.4, Sonnet 4.6, newest Grok,
 *  Gemini 3.1 Pro. Each is the most-capable general tier the user asked for. */
async function buildModels(): Promise<ModelSpec[]> {
  const grokTag = await discoverNewestGrok();
  const all: ModelSpec[] = [
    { id: "openai-54", label: "OpenAI GPT-5.4", complete: makeOpenAIComplete("gpt-5.4") },
    { id: "claude", label: "Claude Sonnet 4.6", complete: makeClaudeComplete("claude-sonnet-4-6") },
    { id: "grok", label: `Grok (${grokTag})`, complete: makeGrokComplete(grokTag) },
    { id: "gemini", label: "Gemini 3.1 Pro", complete: makeGeminiComplete("gemini-3.1-pro-preview") },
  ];
  const filter = (process.env.SCHEMA_DEMO_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (filter.length === 0) return all;
  const picked = all.filter((m) => filter.includes(m.id));
  if (picked.length === 0) {
    throw new Error(`SCHEMA_DEMO_MODELS=${filter.join(",")} matched no known model (use: ${all.map((m) => m.id).join(" | ")}).`);
  }
  return picked;
}

const RULE = "═══════════════════════════════════";
function fileBlock(name: string, body: string): string {
  return `${RULE}\n📄 UPLOADED FILE: ${name}\n${RULE}\n${body.trim()}\n`;
}

interface DemoResult {
  id: string;
  label: string;
  ok: boolean;
  secs: string;
  rawChars: number;
  schemaScript?: string;
  error?: string;
}

async function runOne(spec: ModelSpec, html: string, schemaGenerator: string): Promise<DemoResult> {
  const vars = promptVars();
  // Seed the conversation exactly as the pipeline reaches Phase 4: the built,
  // SEO-verified page is the prior assistant turn, then the verbatim schema
  // execution prompt + the inlined Schema Generator file + the medium shim.
  const messages: ChatMessage[] = [
    { role: "user", content: "Build the landing page now. Output the complete HTML artifact." },
    { role: "assistant", content: html },
    {
      role: "user",
      content: `${schemaPrompt(vars)}\n\n${fileBlock("Schema Generator", schemaGenerator)}${SCHEMA_TO_INLINE}`,
    },
  ];

  const t0 = Date.now();
  try {
    const res = await spec.complete(messages);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const inner = extractSchemaJson(res.raw, spec.label);
    const pretty = JSON.stringify(JSON.parse(inner), null, 2);
    const schemaScript = `<script type="application/ld+json">\n${pretty}\n</script>`;
    return { id: spec.id, label: spec.label, ok: true, secs, rawChars: res.raw.length, schemaScript };
  } catch (err) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    return {
      id: spec.id,
      label: spec.label,
      ok: false,
      secs,
      rawChars: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const htmlPath = process.env.SCHEMA_DEMO_HTML?.trim() || DEFAULT_HTML;
  const html = await readFile(htmlPath, "utf8");
  const { schemaGenerator } = loadDesignFixtures();
  const models = await buildModels();

  console.log("Schema Generator demo — single turn per model");
  console.log(`Page under review: ${htmlPath} (${html.length} chars, SEO-verified, schema stripped)`);
  console.log(`Schema Generator file: ${schemaGenerator.length} chars`);
  console.log(`Models: ${models.map((m) => m.label).join(", ")}\n`);

  await mkdir(OUT_DIR, { recursive: true });

  // Run all models in parallel — each is a single independent API call.
  const results = await Promise.all(models.map((m) => runOne(m, html, schemaGenerator)));

  for (const r of results) {
    if (r.ok && r.schemaScript) {
      const file = resolve(OUT_DIR, `${r.id}.txt`);
      await writeFile(file, r.schemaScript, "utf8");
    }
  }

  console.log("\n══════════════════ RESULTS ══════════════════\n");
  for (const r of results) {
    console.log(`### ${r.label} (${r.secs}s)`);
    if (r.ok && r.schemaScript) {
      console.log(`✅ valid JSON-LD — ${r.schemaScript.length} chars → output/schema-demo/${r.id}.txt`);
      console.log(r.schemaScript);
    } else {
      console.log(`❌ ${r.error}`);
    }
    console.log("");
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`Summary: ${passed}/${results.length} models returned a valid <script> JSON-LD block.`);
  console.log(`Schema blocks saved under: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("schema demo failed:", err);
  process.exitCode = 1;
});
