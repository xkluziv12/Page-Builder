import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { backupPriorResults, isForcedId, loadPrior, readPrior, writeJsonAtomic } from "./resume";
import { compareTarget, targetKey, type BakeoffTarget } from "./target";
import type { BakeoffResults, ModelResult } from "./types";

/**
 * Resume/persistence regressions for the live results.json.
 *
 * The bug class these cover: the resume identity used to be `scenarioId +
 * modelId` with NO target check, so pointing the harness at a new city silently
 * reused the previous city's shared grounding and skipped every model whose id
 * already appeared in the old dataset. Deterministic fixtures only — no network,
 * no provider credentials.
 */

const BILLINGS: BakeoffTarget = {
  url: "https://www.stselectronicrecyclinginc.com/billings-mt",
  city: "Billings",
  state: "MT",
  niche: "electronics recycling",
  pageType: "SPOKE",
  classification: "NEW_BUILD",
  competition: "MEDIUM",
};

const BAKERSFIELD: BakeoffTarget = {
  ...BILLINGS,
  url: "https://www.stselectronicrecyclinginc.com/bakersfield-ca",
  city: "Bakersfield",
  state: "CA",
};

function modelResult(over: Partial<ModelResult> & Pick<ModelResult, "id">): ModelResult {
  return {
    label: over.id,
    provider: "Google",
    model: "gemini-3.7-flash",
    status: "ok",
    error: null,
    research: null,
    html: "<html></html>",
    schema: null,
    schemaValid: true,
    checkerReport: null,
    linkAudit: null,
    timings: [],
    totalMs: 1000,
    scores: null,
    effort: "provider-default",
    screenshot: null,
    costEstimate: null,
    usage: null,
    transcriptPath: null,
    ...over,
  } as ModelResult;
}

function dataset(target: BakeoffTarget, models: ModelResult[]): BakeoffResults {
  return {
    ranAt: "2026-09-01T00:00:00.000Z",
    target,
    grounding: { source: "model-knowledge (shared)", content: `research for ${target.city}` },
    scenarios: [
      { id: "no-gmb", label: "No-GMB", description: "", notes: [], models },
    ],
    referenceScreenshot: null,
  };
}

const NO_FORCE = new Set<string>();

describe("readPrior — scenario metadata is preserved for carry-through", () => {
  it("records each scenario's own label/description/notes", () => {
    const file = dataset(BILLINGS, [modelResult({ id: "gemini-flash" })]);
    file.scenarios.push({
      id: "gmb",
      label: "GMB-enriched context",
      description: "explicit page_url + GMB block",
      notes: ["note one"],
      models: [modelResult({ id: "claude", provider: "Anthropic", model: "claude-sonnet-5" })],
    });
    const prior = readPrior(file, BILLINGS, NO_FORCE);
    expect(prior.scenarioMeta.get("gmb")).toEqual({
      label: "GMB-enriched context",
      description: "explicit page_url + GMB block",
      notes: ["note one"],
    });
    // A scenario not run this pass still has its results available to persist.
    expect(prior.done.get("gmb")!.size).toBe(1);
  });
});

describe("target identity", () => {
  it("keys two different cities differently", () => {
    expect(targetKey(BILLINGS)).not.toBe(targetKey(BAKERSFIELD));
  });

  it("ignores cosmetic url/case differences on the SAME target", () => {
    expect(
      compareTarget({ ...BILLINGS, url: `${BILLINGS.url}/`, city: "billings" }, BILLINGS).match,
    ).toBe(true);
  });

  it("treats an unrecorded target as unknown, never as a match", () => {
    expect(compareTarget(undefined, BILLINGS).match).toBe(false);
    expect(compareTarget({ city: "Billings" }, BILLINGS).match).toBe(false);
  });
});

describe("readPrior — a Bakersfield run must not reuse Billings", () => {
  const billingsFile = dataset(BILLINGS, [
    modelResult({ id: "gemini-flash" }),
    modelResult({ id: "grok", provider: "xAI", model: "grok-4.6" }),
  ]);

  it("reuses grounding and completed models for the SAME target", () => {
    const prior = readPrior(billingsFile, BILLINGS, NO_FORCE);
    expect(prior.rejectedReason).toBeNull();
    expect(prior.grounding?.content).toBe("research for Billings");
    expect([...prior.done.get("no-gmb")!.keys()].sort()).toEqual(["gemini-flash", "grok"]);
  });

  it("reuses NOTHING for a different target, and says why", () => {
    const prior = readPrior(billingsFile, BAKERSFIELD, NO_FORCE);
    expect(prior.grounding).toBeNull();
    expect(prior.done.size).toBe(0);
    expect(prior.hadPriorFile).toBe(true);
    expect(prior.rejectedReason).toMatch(/DIFFERENT target/i);
    // The reason must name what actually changed, so the operator can see it.
    expect(prior.rejectedReason).toMatch(/billings-mt/i);
    expect(prior.rejectedReason).toMatch(/bakersfield-ca/i);
  });

  it("does not reuse a dataset that records no target at all", () => {
    const untargeted = { ...billingsFile, target: undefined } as unknown;
    const prior = readPrior(untargeted, BILLINGS, NO_FORCE);
    expect(prior.grounding).toBeNull();
    expect(prior.done.size).toBe(0);
    expect(prior.rejectedReason).toMatch(/no target block|DIFFERENT target/i);
  });
});

describe("readPrior — variant coexistence and targeted reruns", () => {
  const matrix = dataset(BILLINGS, [
    modelResult({ id: "gemini-flash.low", baseId: "gemini-flash", effort: "low" }),
    modelResult({ id: "gemini-flash.medium", baseId: "gemini-flash", effort: "medium" }),
    modelResult({ id: "grok", baseId: "grok", provider: "xAI", model: "grok-4.6", effort: "not-supported" }),
  ]);

  it("keeps low and medium as two separate recorded results", () => {
    const done = readPrior(matrix, BILLINGS, NO_FORCE).done.get("no-gmb")!;
    expect(done.size).toBe(3);
    expect(done.get("gemini-flash.low")!.effort).toBe("low");
    expect(done.get("gemini-flash.medium")!.effort).toBe("medium");
  });

  it("forcing ONE variant drops only that variant, preserving every other", () => {
    const done = readPrior(matrix, BILLINGS, new Set(["gemini-flash.low"])).done.get("no-gmb")!;
    expect([...done.keys()].sort()).toEqual(["gemini-flash.medium", "grok"]);
  });

  it("forcing a base id drops every variant of that slot only", () => {
    const done = readPrior(matrix, BILLINGS, new Set(["gemini-flash"])).done.get("no-gmb")!;
    expect([...done.keys()]).toEqual(["grok"]);
  });

  it("forcing 'all' drops everything", () => {
    expect(readPrior(matrix, BILLINGS, new Set(["all"])).done.get("no-gmb")!.size).toBe(0);
  });

  it("derives the base id from a legacy variant id that has no baseId field", () => {
    expect(isForcedId(new Set(["gemini-flash"]), { id: "gemini-flash.low" })).toBe(true);
    expect(isForcedId(new Set(["gemini"]), { id: "gemini-flash.low" })).toBe(false);
    expect(isForcedId(new Set(["grok"]), { id: "grok" })).toBe(true);
  });
});

describe("readPrior — one failed model leaves its successful siblings visible", () => {
  it("preserves ok and error results side by side with their own errors", () => {
    const mixed = dataset(BILLINGS, [
      modelResult({ id: "gemini-flash", status: "ok" }),
      modelResult({
        id: "deepseek",
        status: "error",
        error: "deepseek-v4-pro returned an empty response.",
        html: null,
      }),
    ]);
    const done = readPrior(mixed, BILLINGS, NO_FORCE).done.get("no-gmb")!;
    expect(done.size).toBe(2);
    expect(done.get("gemini-flash")!.status).toBe("ok");
    expect(done.get("gemini-flash")!.html).toBe("<html></html>");
    // The failure is recorded as THAT model's error, not as a run-level failure.
    expect(done.get("deepseek")!.status).toBe("error");
    expect(done.get("deepseek")!.error).toMatch(/empty response/);
  });
});

describe("loadPrior + writeJsonAtomic on disk", () => {
  it("round-trips a dataset and never leaves a partial file behind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bakeoff-resume-"));
    const path = join(dir, "results.json");
    await writeJsonAtomic(path, dataset(BILLINGS, [modelResult({ id: "gemini-flash" })]));

    // Nothing but the destination file survives the write (no stray temp files).
    expect(await readdir(dir)).toEqual(["results.json"]);
    // The bytes on disk parse as a complete dataset.
    expect(JSON.parse(await readFile(path, "utf8")).target.city).toBe("Billings");

    expect((await loadPrior(path, BILLINGS, NO_FORCE)).done.get("no-gmb")!.size).toBe(1);
    expect((await loadPrior(path, BAKERSFIELD, NO_FORCE)).done.size).toBe(0);
  });

  it("treats a missing file as a clean first run and a corrupt one as a reported reset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bakeoff-resume-"));
    const missing = await loadPrior(join(dir, "nope.json"), BILLINGS, NO_FORCE);
    expect(missing.hadPriorFile).toBe(false);
    expect(missing.rejectedReason).toBeNull();

    const truncated = join(dir, "truncated.json");
    await writeFile(truncated, '{"scenarios": [', "utf8");
    const corrupt = await loadPrior(truncated, BILLINGS, NO_FORCE);
    expect(corrupt.done.size).toBe(0);
    expect(corrupt.rejectedReason).toMatch(/could not be parsed/i);
  });

  it("backs up a prior dataset before a different target overwrites it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bakeoff-resume-"));
    const path = join(dir, "results.json");
    await writeJsonAtomic(path, dataset(BILLINGS, [modelResult({ id: "gemini-flash" })]));
    const backup = await backupPriorResults(path, "2026-09-01T00-00-00-000Z");
    expect(backup).toBe(join(dir, "results.prior-2026-09-01T00-00-00-000Z.json"));
    expect(JSON.parse(await readFile(backup!, "utf8")).target.city).toBe("Billings");
  });
});

describe("legacy archived datasets still load without invented provenance", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const HISTORY_DIR = resolve(HERE, "../../../artifacts/bake-off/src/data/history");
  // Snapshots recorded before effort/provenance/variant fields existed.
  const LEGACY = [
    "2026-06-23-full-adherence.json",
    "2026-06-23-opus-tier-4model.json",
    "2026-06-23-opus-tier-5model.json",
  ];

  it("parses every legacy snapshot with its unknown fields left ABSENT, not guessed", async () => {
    for (const file of LEGACY) {
      const parsed = JSON.parse(
        await readFile(join(HISTORY_DIR, file), "utf8"),
      ) as BakeoffResults;
      expect(parsed.scenarios.length).toBeGreaterThan(0);
      for (const scenario of parsed.scenarios) {
        for (const model of scenario.models) {
          expect(typeof model.id).toBe("string");
          // Nothing backfilled these: they must read as unknown/not-recorded.
          expect(model.effort ?? null).toBeNull();
          expect(model.effortRequested ?? null).toBeNull();
          expect(model.effortSupported).toBeUndefined();
          expect(model.baseId).toBeUndefined();
          expect(model.provenance).toBeUndefined();
        }
      }
    }
  });

  it("never resumes from a legacy snapshot whose target differs from this run", async () => {
    const parsed = JSON.parse(
      await readFile(join(HISTORY_DIR, LEGACY[0]!), "utf8"),
    ) as unknown;
    const prior = readPrior(parsed, BAKERSFIELD, NO_FORCE);
    expect(prior.grounding).toBeNull();
    expect(prior.done.size).toBe(0);
  });
});
