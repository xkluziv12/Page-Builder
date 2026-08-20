import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry, type RunContext } from "@workspace/mc-core";
import {
  PORTLAND_GMB,
  generateGmbSchema,
  generateNoGmbSchema,
  gmbContextSuffix,
} from "./gmb.js";
import { resolveTarget } from "./target.js";

/**
 * Emit the DETERMINISTIC Portland GMB review payload for the bake-off viewer.
 *
 * This is NOT a model sweep — it costs nothing and calls no LLM. It captures the
 * verified Portland GMB source-of-truth profile and the two deterministic JSON-LD
 * schemas the harness would emit (GMB-enriched vs faithful No-GMB), so the schema
 * shape can be reviewed in the viewer without spending money on a live run.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(
  HERE,
  "../../../artifacts/bake-off/src/data/portland-review.json",
);

function portlandContext(): RunContext {
  const target = resolveTarget();
  return {
    city: PORTLAND_GMB.city,
    state: PORTLAND_GMB.state,
    track: "page",
    classification: target.classification,
    competition: target.competition,
    pageType: target.pageType,
    niche: target.niche,
    existingUrls: [],
    handoff: null,
    verifiedCid: PORTLAND_GMB.cid,
    designBibleHash: null,
    blogTopic: null,
    researchBrief: null,
    seoIntel: null,
    registry: buildRegistry(),
  };
}

async function main(): Promise<void> {
  const ctx = portlandContext();
  const payload = {
    generatedAt: new Date().toISOString(),
    profile: PORTLAND_GMB,
    gmbContextSuffix: gmbContextSuffix(PORTLAND_GMB),
    gmbSchema: generateGmbSchema(ctx, PORTLAND_GMB),
    noGmbSchema: generateNoGmbSchema(ctx),
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote Portland GMB review payload → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
