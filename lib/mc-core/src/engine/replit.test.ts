import { describe, expect, it } from "vitest";
import type { RunContext } from "../types";
import { ReplitEngine } from "./replit";

describe("ReplitEngine provenance", () => {
  it("defaults to replit-agent/operator-input when no execution source is supplied", async () => {
    const engine = new ReplitEngine({ build: "<!doctype html><html><body>x</body></html>" });
    const out = await engine.buildPage({} as RunContext);
    expect(out.provenance?.sourceKind).toBe("replit-agent");
    expect(out.provenance?.transport).toBe("operator-paste");
    expect(out.provenance?.provider).toBeNull();
    expect(out.provenance?.model).toBeNull();
    expect(out.provenance?.phase).toBe("build");
  });

  it("never reports direct-api even when an operator confirms a specific provider/model", async () => {
    const engine = new ReplitEngine({
      build: "<!doctype html><html><body>x</body></html>",
      source: { sourceKind: "direct-api", provider: "google", model: "gemini-3-flash" },
    });
    const out = await engine.buildPage({} as RunContext);
    expect(out.provenance?.sourceKind).toBe("direct-api");
    expect(out.provenance?.provider).toBe("google");
    expect(out.provenance?.model).toBe("gemini-3-flash");
  });

  it("throws (never fabricates provenance) when the required content is missing", () => {
    const engine = new ReplitEngine({});
    expect(() => engine.buildPage({} as RunContext)).toThrow(/operator-produced/);
  });
});
