import { describe, expect, it } from "vitest";
import { runEntityQualityGate } from "./entity-gate";
import type { ResearchBrief } from "../types";

function brief(entities: Record<string, unknown>[]): ResearchBrief {
  return { summary: "x", entities, sources: [], flags: [], raw: null };
}

describe("runEntityQualityGate", () => {
  it("flags an estimated employee count", () => {
    const flags = runEntityQualityGate(brief([{ name: "Acme", employees: "~250 (estimated)" }]));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.verified).toBe(false);
    expect(flags[0]!.field).toBe("employeeCount");
  });

  it("flags a missing employee count", () => {
    const flags = runEntityQualityGate(brief([{ name: "Beta Co" }]));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.issue).toMatch(/no employee count/i);
  });

  it("flags a verified-looking count that has no source", () => {
    const flags = runEntityQualityGate(brief([{ name: "Gamma", employeeCount: 412 }]));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.issue).toMatch(/no cited source/i);
  });

  it("passes a sourced, verified employee count", () => {
    const flags = runEntityQualityGate(
      brief([{ name: "Delta", employeeCount: 412, source: "JEDCO 2025", verified: true }]),
    );
    expect(flags).toHaveLength(0);
  });

  it("flags low-confidence figures even with a number", () => {
    const flags = runEntityQualityGate(
      brief([{ name: "Epsilon", employees: 90, confidence: "low", source: "blog" }]),
    );
    expect(flags).toHaveLength(1);
  });
});
