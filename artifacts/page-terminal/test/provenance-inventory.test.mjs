import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const toolFiles = [
  "../public/tools/index.html",
  "../public/tools/index-skills.html",
  "../public/tools/page-terminal.html",
  "../public/tools/page-terminal-skills.html",
  "../public/tools/no-gmb.html",
  "../public/tools/no-gmb-skills.html",
  "../public/tools/hub-spoke.html",
  "../public/tools/blog-terminal.html",
  "../public/tools/technocycle/index.html",
  "../public/tools/technocycle/page-terminal.html",
  "../public/tools/technocycle/no-gmb.html",
  "../public/tools/technocycle/hub-spoke.html",
  "../public/tools/technocycle/blog-terminal.html",
];

describe("page-building tool provenance inventory", () => {
  for (const relativePath of toolFiles) {
    it(`${relativePath} loads the shared provenance control`, async () => {
      const source = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
      assert.match(source, /<script\s+src="(?:\.\.\/)?mark-provenance\.js"\s+data-tool="[^"]+"><\/script>/);
    });
  }
});