import { SINGLETON_SCHEMA_TYPES, type JsonLdBlock, type JsonLdScan } from "./types";

const SINGLETON_SET = new Set<string>(
  SINGLETON_SCHEMA_TYPES.map((t) => t.toLowerCase()),
);

const SCRIPT_RE =
  /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Pull the raw text of every JSON-LD script block from an HTML document. */
function extractBlocks(html: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  SCRIPT_RE.lastIndex = 0;
  while ((match = SCRIPT_RE.exec(html)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

/** Normalise a node's `@type` into a flat list of strings. */
function typesOf(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  return [];
}

/**
 * Walk a parsed JSON-LD value and collect every TYPED node. A `@graph` wrapper,
 * a top-level array, and a bare object are all handled. Reference-only nodes
 * (an `@id` pointer with no `@type`) are intentionally skipped — they are
 * pointers, not definitions, so they must not trip the duplicate-id check.
 */
function collectTypedNodes(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTypedNodes(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (Array.isArray(node["@graph"])) {
    collectTypedNodes(node["@graph"], out);
  }
  if (typesOf(node).length > 0) out.push(node);
}

/**
 * Scan a live page's HTML for JSON-LD integrity problems that the public
 * schema.org / Google Rich Results validators do NOT surface:
 *   - duplicate page-level singleton `@type` blocks (e.g. two LocalBusiness),
 *   - the same `@id` defined on more than one typed node,
 *   - malformed JSON.
 * Pure and synchronous — the caller fetches the HTML.
 */
export function scanJsonLd(html: string): JsonLdScan {
  const rawBlocks = extractBlocks(html);
  const blocks: JsonLdBlock[] = [];
  const invalidBlockIndexes: number[] = [];

  // Count singleton-type occurrences and id definitions across ALL blocks.
  const typeCounts = new Map<string, number>();
  const idCounts = new Map<string, number>();

  rawBlocks.forEach((raw, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch (err) {
      invalidBlockIndexes.push(index);
      blocks.push({
        index,
        valid: false,
        types: [],
        ids: [],
        error: err instanceof Error ? err.message : "Invalid JSON",
      });
      return;
    }

    const typedNodes: Record<string, unknown>[] = [];
    collectTypedNodes(parsed, typedNodes);

    const blockTypes: string[] = [];
    const blockIds: string[] = [];
    for (const node of typedNodes) {
      for (const t of typesOf(node)) {
        blockTypes.push(t);
        const key = t.toLowerCase();
        if (SINGLETON_SET.has(key)) {
          typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
        }
      }
      const id = node["@id"];
      if (typeof id === "string" && id.trim()) {
        blockIds.push(id);
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }
    }

    blocks.push({ index, valid: true, types: blockTypes, ids: blockIds, error: null });
  });

  const duplicateTypes = [...typeCounts.entries()]
    .filter(([, count]) => count > 1)
    // Restore canonical casing from the singleton list.
    .map(([key]) => SINGLETON_SCHEMA_TYPES.find((t) => t.toLowerCase() === key) ?? key);

  const conflictingIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  const issues: string[] = [];
  for (const t of duplicateTypes) {
    issues.push(`Duplicate "${t}" schema block — only one is allowed per page; the rest may be silently ignored.`);
  }
  for (const id of conflictingIds) {
    issues.push(`Conflicting @id "${id}" — defined on more than one node.`);
  }
  for (const idx of invalidBlockIndexes) {
    issues.push(`JSON-LD block #${idx + 1} is malformed JSON and cannot be read by search engines.`);
  }
  if (rawBlocks.length === 0) {
    issues.push("No JSON-LD blocks found on the live page.");
  }

  const passed =
    duplicateTypes.length === 0 &&
    conflictingIds.length === 0 &&
    invalidBlockIndexes.length === 0;

  return {
    ran: true,
    passed,
    blockCount: rawBlocks.length,
    blocks,
    duplicateTypes,
    conflictingIds,
    invalidBlockIndexes,
    issues,
    error: null,
  };
}
