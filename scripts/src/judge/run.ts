import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPages, type JudgePage } from "./pages.js";
import { buildJudgePrompt } from "./prompt.js";
import { runJudge, type JudgeProvider } from "./providers.js";
import { buildReport } from "./report.js";

/** The 6 judge models. All confirmed to fetch live via probe. */
const JUDGES: { id: string; provider: JudgeProvider; nice: string }[] = [
  { id: "claude-sonnet-4-6", provider: "anthropic", nice: "Sonnet 4.6" },
  { id: "claude-opus-4-8", provider: "anthropic", nice: "Opus 4.8" },
  { id: "gpt-5.5", provider: "openai", nice: "GPT-5.5" },
  { id: "gpt-5.5-pro", provider: "openai", nice: "GPT-5.5 Pro" },
  { id: "gemini-3.1-pro-preview", provider: "gemini", nice: "Gemini 3.1 Pro" },
  { id: "grok-4.3", provider: "grok", nice: "Grok 4.3" },
];

export interface RankEntry {
  page: string;
  rank: number;
  overall?: number;
  verdict?: string;
}

export interface JudgeRecord {
  id: string;
  provider: JudgeProvider;
  nice: string;
  searchUsed: boolean;
  ms: number;
  text: string;
  ranking: RankEntry[] | null;
  winner?: string | null;
  summary?: string | null;
  error?: string;
}

export interface JudgeResults {
  generatedAt: string;
  mapping: Record<string, string>;
  pages: { label: string; model: string; nice: string }[];
  judges: Record<string, JudgeRecord>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "output");
const RESULTS_PATH = resolve(OUT_DIR, "judge-results.json");
const REPORT_PATH = resolve(OUT_DIR, "seo-judge-report.md");
const PAGES_DIR = resolve(OUT_DIR, "pages");

/** Pull the LAST JSON object containing "ranking" out of the model's prose. */
function parseRanking(text: string): Pick<JudgeRecord, "ranking" | "winner" | "summary"> {
  const candidates: string[] = [];
  const fenceRe = /```json\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text))) if (m[1]) candidates.push(m[1]);
  // Fall back to any brace block that mentions "ranking".
  if (candidates.length === 0) {
    const braceRe = /\{[\s\S]*?"ranking"[\s\S]*?\}\s*\}/gi;
    while ((m = braceRe.exec(text))) candidates.push(m[0]);
  }
  for (const c of candidates.reverse()) {
    try {
      const obj = JSON.parse(c.trim());
      if (Array.isArray(obj?.ranking)) {
        return {
          ranking: obj.ranking as RankEntry[],
          winner: obj.winner ?? null,
          summary: obj.summary ?? null,
        };
      }
    } catch {
      /* try next candidate */
    }
  }
  return { ranking: null, winner: null, summary: null };
}

async function loadExisting(): Promise<JudgeResults | null> {
  try {
    return JSON.parse(await readFile(RESULTS_PATH, "utf8")) as JudgeResults;
  } catch {
    return null;
  }
}

// Serialize disk writes so parallel judges never clobber the results file.
let writeChain: Promise<void> = Promise.resolve();
function persist(results: JudgeResults): Promise<void> {
  writeChain = writeChain.then(async () => {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2));
    await writeFile(REPORT_PATH, buildReport(results));
  });
  return writeChain;
}

async function writePageFiles(pages: JudgePage[]): Promise<void> {
  await mkdir(PAGES_DIR, { recursive: true });
  for (const p of pages) {
    const slug = p.nice.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await writeFile(resolve(PAGES_DIR, `page-${p.label}-${slug}.html`), p.html);
  }
}

async function main() {
  const pages = await loadPages();
  await writePageFiles(pages);
  const prompt = buildJudgePrompt(pages);
  console.log(
    `Judge prompt assembled: ${prompt.length} chars across ${pages.length} pages ` +
      `(${pages.map((p) => `${p.label}=${p.nice}`).join(", ")}).`,
  );

  const existing = await loadExisting();
  const results: JudgeResults = existing ?? {
    generatedAt: new Date().toISOString(),
    mapping: Object.fromEntries(pages.map((p) => [p.label, p.nice])),
    pages: pages.map((p) => ({ label: p.label, model: p.model, nice: p.nice })),
    judges: {},
  };
  results.mapping = Object.fromEntries(pages.map((p) => [p.label, p.nice]));
  results.pages = pages.map((p) => ({ label: p.label, model: p.model, nice: p.nice }));

  const todo = JUDGES.filter((j) => {
    const prev = results.judges[j.id];
    return !prev || prev.error || !prev.text;
  });
  const done = JUDGES.length - todo.length;
  console.log(
    `${done}/${JUDGES.length} judges already complete. Running ${todo.length}: ${
      todo.map((j) => j.nice).join(", ") || "(none)"
    }`,
  );

  await Promise.allSettled(
    todo.map(async (j) => {
      const started = Date.now();
      console.log(`→ ${j.nice} (${j.id}) starting…`);
      try {
        const out = await runJudge(j.provider, j.id, prompt);
        const parsed = parseRanking(out.text);
        results.judges[j.id] = {
          id: j.id,
          provider: j.provider,
          nice: j.nice,
          searchUsed: out.searchUsed,
          ms: Date.now() - started,
          text: out.text,
          ...parsed,
        };
        const order = parsed.ranking
          ? [...parsed.ranking].sort((a, b) => a.rank - b.rank).map((r) => r.page).join(" > ")
          : "UNPARSED";
        console.log(
          `✓ ${j.nice} done in ${Math.round((Date.now() - started) / 1000)}s ` +
            `(search=${out.searchUsed}) ranking: ${order}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.judges[j.id] = {
          id: j.id,
          provider: j.provider,
          nice: j.nice,
          searchUsed: false,
          ms: Date.now() - started,
          text: "",
          ranking: null,
          error: msg,
        };
        console.log(`✗ ${j.nice} failed: ${msg}`);
      }
      await persist(results);
    }),
  );

  await persist(results);
  const ok = JUDGES.filter((j) => results.judges[j.id]?.ranking).length;
  console.log(`\nALL DONE — ${ok}/${JUDGES.length} judges produced a parseable ranking.`);
  console.log(`Results: ${RESULTS_PATH}`);
  console.log(`Report:  ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error("Judge run crashed:", err);
  process.exit(1);
});
