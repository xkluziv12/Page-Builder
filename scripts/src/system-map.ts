/**
 * System Map generator.
 *
 * Regenerates the auto-maintained sections of `SYSTEM-MAP.md` at the repo root
 * (DB tables, API routes, artifacts) directly from source so they never drift:
 *   - DB tables   ← the Drizzle schema (`lib/db/src/schema/*.ts`)
 *   - API routes  ← the OpenAPI spec (`lib/api-spec/openapi.yaml`)
 *   - Artifacts   ← each artifact's `.replit-artifact/artifact.toml`
 *
 * Hand-kept prose (overview, external dependencies, key decisions, pointers)
 * lives OUTSIDE the generated markers and is preserved verbatim on every run.
 * Only the content between each `BEGIN GENERATED:<name>` / `END GENERATED:<name>`
 * marker pair is replaced, so the command is idempotent: running it on a clean
 * repo produces no spurious diffs.
 *
 * Usage (from the repo root):
 *   pnpm run system-map
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const OUTPUT = join(ROOT, "SYSTEM-MAP.md");
const SCHEMA_DIR = join(ROOT, "lib", "db", "src", "schema");
const OPENAPI = join(ROOT, "lib", "api-spec", "openapi.yaml");
const ARTIFACTS_DIR = join(ROOT, "artifacts");

const REGEN_NOTE = "do not edit by hand — run `pnpm run system-map`";

/** Short, hand-curated purpose blurbs keyed by artifact slug (dir name). */
const ARTIFACT_PURPOSE: Record<string, string> = {
  "api-server":
    "Shared Express + Drizzle backend. Serves the health check and every Mission Control route (`/api/mc/*`).",
  "mission-control":
    "Page-builder pipeline app. A VA enters a URL and the server runs Research → Build → Audit → Schema → Publish with per-phase review/approve gates.",
  "page-terminal":
    "M.A.R.K. navy/gold navigation shell that hosts the standalone SEO/page-building HTML tools via iframe.",
  "mockup-sandbox":
    "Design canvas / component preview sandbox used to mock up UI in isolation.",
};

/** Collapse a JSDoc block comment into a single trimmed sentence. */
function cleanComment(raw: string | undefined): string {
  if (!raw) return "—";
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse the Drizzle schema for `pgTable("name", …)` calls + their doc comment. */
function generateDbTables(): string {
  const files = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .sort();

  const rows: { table: string; purpose: string }[] = [];
  const re = /export\s+const\s+\w+(?:\s*:\s*[^=]+)?\s*=\s*pgTable\(\s*["']([^"']+)["']/g;

  for (const file of files) {
    const src = readFileSync(join(SCHEMA_DIR, file), "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      // Attach a doc comment only when a JSDoc block sits IMMEDIATELY before the
      // export (whitespace only between them) — never swallow intervening code.
      const before = src.slice(0, m.index).replace(/\s+$/, "");
      let comment: string | undefined;
      if (before.endsWith("*/")) {
        const start = before.lastIndexOf("/**");
        if (start !== -1) comment = before.slice(start + 3, before.length - 2);
      }
      rows.push({ table: m[1]!, purpose: cleanComment(comment) });
    }
  }

  if (rows.length === 0) throw new Error(`No pgTable definitions found under ${SCHEMA_DIR}`);

  const lines = ["| Table | Purpose |", "| --- | --- |"];
  for (const r of rows) lines.push(`| \`${r.table}\` | ${r.purpose} |`);
  return lines.join("\n");
}

/**
 * Minimal, indentation-based parser for the OpenAPI `paths:` block. We only need
 * path + method + summary, so a targeted parser keeps the generator dependency
 * free. It fails loudly if the spec yields no routes (formatting drift, etc.).
 */
function generateApiRoutes(): string {
  const src = readFileSync(OPENAPI, "utf8");
  const lines = src.split("\n");

  const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);
  const rows: { method: string; path: string; summary: string }[] = [];

  let inPaths = false;
  let currentPath: string | null = null;
  let pending: { method: string; path: string; summary: string } | null = null;

  const flush = () => {
    if (pending) {
      rows.push(pending);
      pending = null;
    }
  };

  for (const line of lines) {
    if (/^\S/.test(line)) {
      // A top-level key ends the paths block.
      flush();
      inPaths = line.startsWith("paths:");
      currentPath = null;
      continue;
    }
    if (!inPaths) continue;

    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) {
      flush();
      currentPath = pathMatch[1]!;
      continue;
    }

    const methodMatch = line.match(/^ {4}([a-z]+):\s*$/);
    if (methodMatch && currentPath && methods.has(methodMatch[1]!)) {
      flush();
      pending = { method: methodMatch[1]!.toUpperCase(), path: `/api${currentPath}`, summary: "" };
      continue;
    }

    const summaryMatch = line.match(/^ {6}summary:\s*(.+?)\s*$/);
    if (summaryMatch && pending && !pending.summary) {
      pending.summary = summaryMatch[1]!.replace(/^["']|["']$/g, "");
    }
  }
  flush();

  if (rows.length === 0) throw new Error(`No routes parsed from ${OPENAPI}`);

  const out = ["| Method | Path | Summary |", "| --- | --- | --- |"];
  for (const r of rows) out.push(`| ${r.method} | \`${r.path}\` | ${r.summary || "—"} |`);
  return out.join("\n");
}

/** Read one top-level `key = "value"` string from a TOML document. */
function tomlValue(src: string, key: string): string {
  const m = src.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return m ? m[1]! : "";
}

/** Enumerate artifacts from their `.replit-artifact/artifact.toml` files. */
function generateArtifacts(): string {
  const slugs = readdirSync(ARTIFACTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => existsSync(join(ARTIFACTS_DIR, slug, ".replit-artifact", "artifact.toml")))
    .sort();

  if (slugs.length === 0) throw new Error(`No artifact.toml files found under ${ARTIFACTS_DIR}`);

  const out = ["| Artifact | Kind | Slug | Preview path | Purpose |", "| --- | --- | --- | --- | --- |"];
  for (const slug of slugs) {
    const src = readFileSync(join(ARTIFACTS_DIR, slug, ".replit-artifact", "artifact.toml"), "utf8");
    const title = tomlValue(src, "title") || slug;
    const kind = tomlValue(src, "kind") || "—";
    const preview = tomlValue(src, "previewPath") || "—";
    const purpose = ARTIFACT_PURPOSE[slug] ?? "—";
    out.push(`| ${title} | ${kind} | \`${slug}\` | \`${preview}\` | ${purpose} |`);
  }
  return out.join("\n");
}

/** Replace the body between a BEGIN/END GENERATED marker pair. Fails if absent. */
function replaceBlock(content: string, name: string, body: string): string {
  const re = new RegExp(`<!-- BEGIN GENERATED:${name}[\\s\\S]*?<!-- END GENERATED:${name} -->`);
  if (!re.test(content)) {
    throw new Error(
      `Missing marker block "${name}" in SYSTEM-MAP.md. Restore the BEGIN/END GENERATED:${name} markers and re-run.`,
    );
  }
  const block = `<!-- BEGIN GENERATED:${name} (${REGEN_NOTE}) -->\n\n${body}\n\n<!-- END GENERATED:${name} -->`;
  return content.replace(re, block);
}

/** Scaffold used only when SYSTEM-MAP.md does not exist yet. */
const DEFAULT_TEMPLATE = `# System Map

> One-read orientation for this project. The **DB tables**, **API routes**, and
> **Artifacts** sections below are generated from source — do not edit them by
> hand; run \`pnpm run system-map\` to refresh. Everything else is hand-kept.

## Overview

This monorepo (pnpm workspaces, Node 24, TypeScript) ships four artifacts that
together serve STS Electronic Recycling's virtual assistants:

- **API Server** (\`/api\`) — the only backend. Express + Drizzle/Postgres. It
  serves a health check and the whole Mission Control pipeline under \`/api/mc/*\`.
- **Mission Control** (\`/mission-control\`) — the page-builder app. A VA enters a
  target URL; the server derives city/state + SEO intel and runs a five-phase
  pipeline (Research → Build → Audit → Schema → Publish) with review/approve
  gates, DB-backed run state, a live preview, AI chat-edit, and a checker suite.
  Engine logic lives in the reusable lib \`@workspace/mc-core\` behind an
  \`AIEngine\` seam (Claude "Dashboard mode" + operator-driven "Replit mode").
- **Page Terminal** (\`/\`) — the M.A.R.K. navy/gold nav shell that hosts a set of
  self-contained static HTML SEO tools via iframe. It is independent of the API.
- **Canvas** (\`/__mockup\`) — a design/component preview sandbox.

How they relate: Page Terminal and Canvas are front-of-house shells with no
backend coupling. Mission Control is the data-driven app and is the only artifact
that talks to the API Server, which owns the Postgres \`mc_*\` tables and the
external SEO / research / publish seams.

## DB tables

<!-- BEGIN GENERATED:db-tables (${REGEN_NOTE}) -->
<!-- END GENERATED:db-tables -->

## API routes

<!-- BEGIN GENERATED:api-routes (${REGEN_NOTE}) -->
<!-- END GENERATED:api-routes -->

## Artifacts / tools

<!-- BEGIN GENERATED:artifacts (${REGEN_NOTE}) -->
<!-- END GENERATED:artifacts -->

## External dependencies

These live outside the repo. Most fail loudly when unavailable rather than
degrading silently.

- **Postgres** (\`DATABASE_URL\`) — backing store for all \`mc_*\` tables.
- **n8n webhooks** at \`stsrecycling.app.n8n.cloud\`:
  - \`mark-ai-brain\` — the Research phase source; when down, Research fails and
    downstream phases stay locked.
  - dashboard feeds for the Page Terminal tools (\`DCD-grading\`, \`SALES-grading\`,
    \`WIW-data\`, \`blog-terminal\`).
- **Anthropic API** — the Claude engine ("Dashboard mode") that auto-runs phases.
- **SerpAPI + DataForSEO** — live per-URL SEO intel derived on run creation
  (replaces the manual SEO spreadsheet).
- **GTmetrix** — post-publish QC speed checks against the live URL.
- **Joomla publish seam** (\`JOOMLA_PUBLISH_URL\`) — atomic publish target; with no
  URL configured the stub publisher reports "nothing published" and the run stays
  in review (never falsely "published").

## Key decisions

The "why," kept short. (Full project README is \`replit.md\`.)

- **Engine seam over a hard-wired LLM.** The pipeline orchestrator never imports
  a concrete client; both Claude and Replit engines flow through the same
  \`runPhase\` + checker suite, so a Replit-built page must clear the same bar.
- **Preserve the iframe shell.** Page Terminal stays a React shell hosting
  self-contained static HTML tools — the tools were not rewritten into React.
- **Single-row run state.** Most pipeline state is JSONB on the \`mc_runs\` row so a
  single read reconstructs the full run the dashboard renders.
- **Fail loudly; never silently degrade.** Missing inputs, failed tools, or
  malformed schemas halt with a clear message instead of emitting partials.
- **State-only location correction.** The URL-parsed city/state is cross-checked
  against fetched page content; verification only confirms/corrects the *state*,
  never switches city, and never blocks run creation.

## Where to look next

- **Change log / history:** use git history (\`git log\`) — it is not duplicated here.
- **Work items / roadmap:** use the project task list — it is not duplicated here.
`;

function main(): void {
  let content = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : DEFAULT_TEMPLATE;
  content = replaceBlock(content, "db-tables", generateDbTables());
  content = replaceBlock(content, "api-routes", generateApiRoutes());
  content = replaceBlock(content, "artifacts", generateArtifacts());
  if (!content.endsWith("\n")) content += "\n";
  writeFileSync(OUTPUT, content);
  console.log(`✓ Wrote ${basename(OUTPUT)} (${content.split("\n").length} lines)`);
}

main();
