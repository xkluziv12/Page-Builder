import type { EntityFlag, ResearchBrief } from "../types";

const EMPLOYEE_KEYS = [
  "employees",
  "employeecount",
  "employee_count",
  "numemployees",
  "num_employees",
  "headcount",
  "staff",
];

const SOURCE_KEYS = ["source", "sources", "sourceurl", "source_url", "citation", "verifiedsource"];

function findField(
  entity: Record<string, unknown>,
  keys: string[],
): { key: string; value: unknown } | null {
  for (const key of Object.keys(entity)) {
    if (keys.includes(key.toLowerCase())) {
      return { key, value: entity[key] };
    }
  }
  return null;
}

function entityName(entity: Record<string, unknown>): string {
  const candidate = entity.name ?? entity.entity ?? entity.company ?? entity.title;
  return typeof candidate === "string" && candidate.trim() ? candidate : "Unnamed entity";
}

function looksEstimated(value: unknown, entity: Record<string, unknown>): boolean {
  const text = String(value).toLowerCase();
  if (/estimat|approx|around|roughly|~|\bunknown\b|\btbd\b|n\/?a/.test(text)) return true;
  if (entity.estimated === true) return true;
  const confidence = String(entity.confidence ?? "").toLowerCase();
  return confidence === "low" || confidence === "estimated";
}

/**
 * Entity data-quality gate. The handoff/webhook often returns *estimated* or
 * unsourced employee counts; those must be flagged for human correction before
 * the VA approves the research phase, because the brief must carry verified
 * entity data — not pass-through estimates. Pure and deterministic so it can run
 * on whatever shape the webhook returns.
 */
export function runEntityQualityGate(brief: ResearchBrief): EntityFlag[] {
  const flags: EntityFlag[] = [];
  for (const entity of brief.entities) {
    if (!entity || typeof entity !== "object") continue;
    const name = entityName(entity);
    const employee = findField(entity, EMPLOYEE_KEYS);
    if (!employee || employee.value == null || String(employee.value).trim() === "") {
      flags.push({
        name,
        field: "employeeCount",
        issue: "No employee count provided; verify against an authoritative source (e.g. JEDCO) before approving.",
        verified: false,
      });
      continue;
    }
    if (looksEstimated(employee.value, entity)) {
      flags.push({
        name,
        field: "employeeCount",
        issue: `Employee count "${String(employee.value)}" appears estimated; replace with a verified figure before approval.`,
        verified: false,
      });
      continue;
    }
    const hasSource = Boolean(findField(entity, SOURCE_KEYS)?.value);
    const explicitlyVerified = entity.verified === true;
    if (!hasSource && !explicitlyVerified) {
      flags.push({
        name,
        field: "employeeCount",
        issue: `Employee count "${String(employee.value)}" has no cited source; verify against an authoritative source before approval.`,
        verified: false,
      });
    }
  }
  return flags;
}
