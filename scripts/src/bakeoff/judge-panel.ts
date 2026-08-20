/**
 * Bake-off BLIND JUDGE PANEL.
 *
 * Packages EVERY completed page (HTML + JSON-LD schema) from both the current
 * run (`results.json`) and the archived run (`old-bakeoff.json`), ANONYMIZES
 * each as "Candidate A/B/C…", and sends the identical package to the three
 * newest frontier models — Claude (Opus 4.8), Gemini (3.1 Pro), Grok (newest) —
 * asking each to judge which page is best on code, CSS, design, schema, and SEO.
 *
 * Apples-to-apples discipline (same as the harness):
 *  - Every judge gets the BYTE-IDENTICAL package + rubric + output contract.
 *  - Candidates are BLIND (Candidate A…G); the model→letter mapping is written
 *    to `mapping.json` and revealed only after the fact, so a judge cannot favor
 *    its own brand.
 *  - Judges are resolved through the shared registry (`buildModelsForIds`) so the
 *    masked provider model tags are never hand-typed, and each adapter calls its
 *    provider DIRECTLY with STS's own API key (no Replit AI-Integrations proxy).
 *
 * Resumable + isolated: a judge whose verdict file already exists is skipped
 * unless JUDGE_FORCE=1. Each judge is built + run independently (Promise.allSettled)
 * so a missing key or a single failure never blocks the others — fail loud per
 * judge, never a silent partial.
 *
 * NOTE: long reasoning calls over a ~100K-token package exceed the inline bash
 * limit — run this via the "Bake-Off Judge Panel" console workflow, not inline.
 *
 *   JUDGE_MODELS=claude,gemini,grok pnpm --filter @workspace/scripts run bakeoff:judge
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelsForIds } from "./routing.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts/src/bakeoff
const ROOT = path.resolve(HERE, "../../..");
const DATA = path.join(ROOT, "artifacts", "bake-off", "src", "data");
const OUTDIR = path.join(HERE, "output", "judge-panel");
const rel = (p: string): string => path.relative(ROOT, p);

/** The three newest frontier judges (GPT intentionally excluded per request). */
const IDS = (process.env.JUDGE_MODELS ?? "claude,gemini,grok")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FORCE = process.env.JUDGE_FORCE === "1";
/** Generous output room for a per-candidate scored breakdown + rationale. */
const JUDGE_MAX_TOKENS = Number(process.env.JUDGE_MAX_TOKENS ?? 16000);

interface DatasetModel {
  model: string;
  status: string;
  html?: string;
  schema?: string;
}
interface Dataset {
  target?: Record<string, unknown>;
  scenarios: { id: string; models: DatasetModel[] }[];
}

interface Candidate {
  /** Blind label shown to judges. */
  letter: string;
  /** Real provenance — NEVER sent to a judge. */
  source: string;
  run: "current" | "archived";
  html: string;
  schema: string;
}

function loadDataset(file: string): Dataset {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) throw new Error(`dataset not found: ${rel(p)}`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as Dataset;
}

/** Pull every COMPLETED page (has HTML) from a dataset's no-gmb scenario. */
function collect(ds: Dataset, run: "current" | "archived"): Omit<Candidate, "letter">[] {
  const sc = ds.scenarios.find((s) => s.id === "no-gmb") ?? ds.scenarios[0];
  if (!sc) throw new Error("no scenario in dataset");
  const out: Omit<Candidate, "letter">[] = [];
  for (const m of sc.models) {
    if (m.status !== "ok" || !m.html || !m.html.trim()) continue;
    out.push({
      source: `${run === "archived" ? "OLD" : "CUR"}:${m.model}`,
      run,
      html: m.html,
      schema: (m.schema ?? "").trim(),
    });
  }
  return out;
}

/** Deterministic seeded shuffle so labels don't leak run/model order but a
 * re-run reproduces the same blind mapping (stable, auditable). */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = arr.slice();
  const rnd = (i: number): number => {
    const h = crypto.createHash("sha256").update(`${seed}:${i}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(i) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function buildCandidates(): Candidate[] {
  const raw = [
    ...collect(loadDataset("results.json"), "current"),
    ...collect(loadDataset("old-bakeoff.json"), "archived"),
  ];
  if (raw.length < 2) throw new Error(`need >=2 completed pages to judge; found ${raw.length}`);
  const shuffled = seededShuffle(raw, "bakeoff-judge-panel-v1");
  return shuffled.map((c, i) => ({ letter: LETTERS[i]!, ...c }));
}

function targetLine(): string {
  const t = loadDataset("results.json").target ?? {};
  return `City: ${t.city}, ${t.state} · Niche: ${t.niche} · Page type: ${t.pageType} · Competition: ${t.competition}`;
}

function instruction(letters: string[]): string {
  return `You are a PRINCIPAL front-end engineer AND a senior technical-SEO auditor. You are
judging ${letters.length} anonymized web pages (Candidate ${letters.join(", ")}) that were each
generated by a different AI model for the SAME brief. You do not know which model wrote
which page — judge ONLY the artifacts in front of you, on merit.

TARGET BRIEF (identical for every candidate): ${targetLine()}
The real business is STS Electronic Recycling. Each candidate is a single self-contained
HTML page (all CSS is inline in a <style> block) plus its JSON-LD structured-data block.

Judge each candidate on these FIVE axes, 0-100 each (100 = best you have ever seen for a
local service page, 50 = mediocre, <30 = broken/negligent). DIG DEEP — do not skim:

1. CODE QUALITY — semantic HTML5, correct heading hierarchy (exactly one <h1>, logical
   h2/h3 nesting), valid/well-formed markup, accessibility (alt text, aria, landmarks,
   contrast intent, focus order), absolute HTTPS asset URLs, no broken/duplicate ids,
   maintainability. Cite specific tags/lines you saw.
2. CSS — quality and modernity of the styling: layout technique (grid/flex), responsive
   design (media queries / clamp / fluid type), design tokens/variables, spacing rhythm,
   state styles (hover/focus), no dead or conflicting rules, no inline-style sprawl.
3. DESIGN — visual hierarchy, information architecture, section flow, conversion design
   (clear hero, CTAs, trust signals), typography and color discipline, whitespace, how
   professional/polished the page would look RENDERED. Reason from the markup + CSS.
4. SCHEMA — the JSON-LD: valid JSON, correct schema.org types for a LocalBusiness/service
   page, @graph wiring with stable @id references, richness (LocalBusiness, Service,
   BreadcrumbList, FAQPage, WebPage/WebSite where appropriate), NAP accuracy/consistency,
   absence of invented/hallucinated data, and whether it would earn rich results.
5. SEO — on-page optimization: title/meta/description intent, keyword + entity coverage
   without stuffing, internal-link/anchor quality, content depth and answer-blocks,
   headings as query targets, E-E-A-T signals, local relevance. Body word count matters:
   a strong local service page targets ~2,000 words — note under/over-length.

For EACH candidate, give the five scores and a 2-4 sentence justification that cites
CONCRETE evidence from that candidate's markup/schema (quote a tag, class, id, JSON-LD
type, heading, or phrase). Generic praise is worthless — be specific and critical.

Then: name the single BEST candidate per axis, an overall ranking best→worst, the overall
WINNER, and a rationale paragraph explaining WHY it wins and where the runners-up fall
short. If two are close, say what separates them.

Return your answer as STRICT JSON and NOTHING else (no prose before/after, no code fence),
matching EXACTLY this shape:

{
  "candidates": [
    { "id": "A", "code": <0-100>, "css": <0-100>, "design": <0-100>,
      "schema": <0-100>, "seo": <0-100>, "notes": "<specific justification>" }
  ],
  "categoryWinners": { "code": "<letter>", "css": "<letter>", "design": "<letter>",
    "schema": "<letter>", "seo": "<letter>" },
  "overallRanking": ["<letter>", "..."],
  "winner": "<letter>",
  "rationale": "<why the winner wins and where others fall short>"
}

Include EVERY candidate (${letters.join(", ")}) in "candidates" and "overallRanking".`;
}

function packageCandidates(cands: Candidate[]): string {
  return cands
    .map(
      (c) =>
        `\n===== CANDIDATE ${c.letter} =====\n` +
        `----- HTML -----\n${c.html}\n` +
        `----- JSON-LD SCHEMA -----\n${c.schema || "(none provided)"}\n` +
        `===== END CANDIDATE ${c.letter} =====\n`,
    )
    .join("\n");
}

/** Best-effort strict-JSON extraction: strip a code fence, else grab the first
 * balanced {...} block. Returns null when nothing parses (caller fails loud but
 * still keeps the raw text). */
function parseVerdict(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function judgeOne(id: string, cands: Candidate[], prompt: string): Promise<void> {
  const outFile = path.join(OUTDIR, `${id}.json`);
  const rawFile = path.join(OUTDIR, `${id}.raw.txt`);
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

  console.log(
    `-> ${model.label} (${model.model}) judging ${cands.length} candidates, ` +
      `${prompt.length.toLocaleString()} chars...`,
  );
  try {
    const res = await model.complete([{ role: "user", content: prompt }], undefined, {
      maxOutputTokens: JUDGE_MAX_TOKENS,
    });
    fs.writeFileSync(rawFile, res.content);
    const verdict = parseVerdict(res.content);
    const record = {
      judgeId: id,
      judgeLabel: model.label,
      judgeModel: model.model,
      provider: model.provider,
      generatedAt: new Date().toISOString(),
      elapsedSec: Math.round((Date.now() - t0) / 1000),
      usage: res.usage,
      parsed: verdict !== null,
      verdict,
    };
    fs.writeFileSync(outFile, JSON.stringify(record, null, 2) + "\n");
    const w =
      verdict && typeof verdict === "object" && "winner" in verdict
        ? (verdict as { winner?: string }).winner
        : "?";
    console.log(
      `   done ${id} in ${record.elapsedSec}s -> winner Candidate ${w}` +
        `${verdict === null ? " (JSON PARSE FAILED — see raw)" : ""} -> ${rel(outFile)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   FAIL ${id} (judge): ${msg}`);
    fs.writeFileSync(path.join(OUTDIR, `${id}.ERROR.txt`), `judge failed: ${msg}\n`);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const cands = buildCandidates();
  const letters = cands.map((c) => c.letter);

  // Persist the blind mapping FIRST so provenance is auditable even mid-run.
  const mapping = cands.map((c) => ({ letter: c.letter, source: c.source, run: c.run }));
  fs.writeFileSync(path.join(OUTDIR, "mapping.json"), JSON.stringify(mapping, null, 2) + "\n");
  console.log("Blind mapping (revealed only here, never to judges):");
  for (const m of mapping) console.log(`  Candidate ${m.letter} = ${m.source}`);
  console.log();

  const prompt = `${instruction(letters)}\n${packageCandidates(cands)}`;
  console.log(
    `Package: ${cands.length} candidates, ${prompt.length.toLocaleString()} chars ` +
      `(~${Math.round(prompt.length / 4).toLocaleString()} tokens). Judges: ${IDS.join(", ")}\n`,
  );

  await Promise.allSettled(IDS.map((id) => judgeOne(id, cands, prompt)));
  console.log(`\nJudge panel complete. Verdicts + mapping in ${rel(OUTDIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
