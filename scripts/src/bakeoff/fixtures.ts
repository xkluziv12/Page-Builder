import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The REAL design files a VA uploads into the Claude.ai Project before running
 * the No-GMB checklist, committed verbatim as repo fixtures so every model in
 * the bake-off receives the IDENTICAL source material:
 *
 *  - `master-page-builder.txt`   — the "Master Page Builder" doc (uploaded .docx)
 *  - `master-design-tier2.html`  — the "Master Design (Tier 2)" Bible CODE
 *                                  reference page (uploaded .docx)
 *  - `sts-seo-data-2026.tsv`     — the "STS SEO Data 2026" GSC pages report
 *                                  (uploaded .xlsx)
 *  - `master-seo-audit.txt`      — the "Master SEO Audit" doc (uploaded .txt)
 *  - `master-schema-generator.txt` — the "Schema Generator" doc (MASTER SCHEMA
 *                                  GENERATOR v1.4.1 PRODUCTION), uploaded for the
 *                                  Phase-4 schema turn
 *
 * These are loaded ONCE and inlined into the conversation as the equivalent of
 * the VA's file uploads (the API has no file-attachment surface). Missing or
 * empty fixtures FAIL LOUDLY — a faithful run cannot proceed without the exact
 * material the human workflow depends on.
 */
export interface DesignFixtures {
  pageBuilder: string;
  designTier2: string;
  seoData: string;
  seoAudit: string;
  schemaGenerator: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "fixtures");

function loadFixture(file: string, label: string): string {
  const path = join(FIXTURE_DIR, file);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `Required design fixture "${label}" is missing at ${path} ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `The bake-off cannot run faithfully without the real uploaded design files.`,
    );
  }
  if (!raw.trim()) {
    throw new Error(
      `Required design fixture "${label}" at ${path} is empty. ` +
        `Re-extract it from the uploaded source file before running the bake-off.`,
    );
  }
  return raw;
}

/** Load all design fixtures, failing loudly if any is missing or empty. */
export function loadDesignFixtures(): DesignFixtures {
  return {
    pageBuilder: loadFixture("master-page-builder.txt", "Master Page Builder"),
    designTier2: loadFixture("master-design-tier2.html", "Master Design (Tier 2)"),
    seoData: loadFixture("sts-seo-data-2026.tsv", "STS SEO Data 2026"),
    seoAudit: loadFixture("master-seo-audit.txt", "Master SEO Audit"),
    schemaGenerator: loadFixture("master-schema-generator.txt", "Schema Generator"),
  };
}
