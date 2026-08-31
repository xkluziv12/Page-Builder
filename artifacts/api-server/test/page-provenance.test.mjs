import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

let bundleDirectory;
let shouldUpdatePageProvenance;

before(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), "mc-page-provenance-"));
  const outfile = join(bundleDirectory, "page-provenance.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/page-provenance.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    outfile,
    logLevel: "silent",
  });
  ({ shouldUpdatePageProvenance } = await import(pathToFileURL(outfile).href));
});

after(async () => {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

describe("current page provenance summary", () => {
  it("updates for a build or audit that changes HTML", () => {
    assert.equal(shouldUpdatePageProvenance("build", true), true);
    assert.equal(shouldUpdatePageProvenance("audit", true), true);
  });

  it("does not attribute page HTML to a different schema or publish provider", () => {
    assert.equal(shouldUpdatePageProvenance("schema", true), false);
    assert.equal(shouldUpdatePageProvenance("publish", true), false);
    assert.equal(shouldUpdatePageProvenance("research", true), false);
  });

  it("does not replace attribution when HTML did not change", () => {
    assert.equal(shouldUpdatePageProvenance("build", false), false);
    assert.equal(shouldUpdatePageProvenance("audit", false), false);
  });
});