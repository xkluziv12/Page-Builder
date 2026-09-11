import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { cityDataSchema, CITY_DATA_FIELD_ORDER, type CityData } from "./cityDataSchema.js";
import { factLayerSchema, type FactLayer } from "./prompt-pack/factLayer.schema.js";
import { gateConfig, validate, visibleWordCount, type ValidationResult } from "./validate.js";

/**
 * Build ONE `CityData` record by asking ONE model for JSON and gating the reply
 * with `validate.ts`. No HTML, no JSX, no template rendering: the whole point of
 * this proof is that a model can hit a typed data contract instead of emitting
 * markup a human then has to unpick.
 *
 * Provider access follows `scripts/src/bakeoff/providers.ts` exactly: the
 * Anthropic SDK called DIRECTLY with the operator's own credential from the
 * environment, `maxRetries: 0`, and a streamed request (the SDK refuses large
 * non-streaming budgets). No Replit-managed connector, no proxy, no fallback to
 * another provider if the credential is missing.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FACT_LAYER_PATH = join(HERE, "prompt-pack", "fact-layer.json");

/** Overridable so a run can pin a different Claude tag without a code change. */
export const MODEL = process.env.PRECISION_ADAPTER_MODEL?.trim() || "claude-sonnet-5";

/** Matches the bake-off's generous budget: a full record runs long. */
const MAX_OUTPUT_TOKENS = 32000;
const REQUEST_TIMEOUT_MS = Number(process.env.PRECISION_ADAPTER_TIMEOUT_MS ?? 600_000);

/** Repair turns allowed AFTER the first attempt, per the task contract. */
export const MAX_REPAIR_TURNS = 3;

/** The city this proof builds. Deliberately NOT St. Louis and NOT one of the
 * seven confirmed metros, so the planning-market rules are actually exercised. */
export interface TargetCity {
  city: string;
  state: string;
  slug: string;
}

export const TARGET: TargetCity = { city: "Milwaukee", state: "WI", slug: "milwaukee" };

// ── Credential resolution ─────────────────────────────────────────────────

export interface Auth {
  kind: "api-key" | "oauth";
  /** Env var the credential came from, for reporting. Never the value. */
  source: string;
  value: string;
}

/**
 * Pick whichever Anthropic credential is ACTUALLY set, preferring the plain API
 * key. Throws when neither is present: a missing credential is an operator
 * problem to fix, not something to paper over by reaching for another provider's
 * key that happens to be in the environment.
 */
export function resolveAuth(env: NodeJS.ProcessEnv = process.env): Auth {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) return { kind: "api-key", source: "ANTHROPIC_API_KEY", value: apiKey };
  const oauth = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (oauth) return { kind: "oauth", source: "CLAUDE_CODE_OAUTH_TOKEN", value: oauth };
  throw new Error(
    "No Anthropic credential is set. Export ANTHROPIC_API_KEY (preferred) or " +
      "CLAUDE_CODE_OAUTH_TOKEN and re-run. This adapter will not fall back to another " +
      "provider's key and will not use a Replit-managed LLM connector.",
  );
}

function makeClient(auth: Auth): Anthropic {
  if (auth.kind === "api-key") {
    return new Anthropic({ apiKey: auth.value, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  }
  // A Claude Code OAuth token authenticates as a Bearer token and needs the
  // oauth beta header; the SDK's `authToken` option is the supported path for it.
  return new Anthropic({
    apiKey: null,
    authToken: auth.value,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
    defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
  });
}

// ── Fact layer ────────────────────────────────────────────────────────────

function loadFactLayer(): FactLayer {
  // A missing/corrupt fact layer is a broken install: let it throw.
  const raw = readFileSync(FACT_LAYER_PATH, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[buildRecord] fact-layer.json at ${FACT_LAYER_PATH} is not valid JSON.`);
    throw err;
  }
  const checked = factLayerSchema.safeParse(parsed);
  if (!checked.success) {
    const detail = checked.error.issues
      .map(
        (i: { path: (string | number)[]; message: string }) =>
          `${i.path.join(".") || "(root)"}: ${i.message}`,
      )
      .join("; ");
    throw new Error(`fact-layer.json does not match factLayer.schema.ts: ${detail}`);
  }
  return checked.data;
}

// ── Field list, derived from the schema so it cannot drift ────────────────

/** Render one Zod node as a TypeScript-ish type string. */
function describeZod(node: z.ZodTypeAny): string {
  const def = node._def as {
    typeName?: string;
    innerType?: z.ZodTypeAny;
    type?: z.ZodTypeAny;
    shape?: () => Record<string, z.ZodTypeAny>;
  };
  switch (def.typeName) {
    case "ZodOptional":
    case "ZodNullable":
      return describeZod(def.innerType as z.ZodTypeAny);
    case "ZodString":
      return "string";
    case "ZodBoolean":
      return "boolean";
    case "ZodNumber":
      return "number";
    case "ZodArray":
      return `${describeZod(def.type as z.ZodTypeAny)}[]`;
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const inner = Object.entries(shape)
        .map(([k, v]) => `${k}${isOptional(v) ? "?" : ""}: ${describeZod(v)}`)
        .join("; ");
      return `{ ${inner} }`;
    }
    default:
      // Fail loud rather than shipping "unknown" into the prompt: an unmapped
      // node means cityDataSchema grew a construct this renderer cannot express.
      throw new Error(
        `describeZod() cannot render Zod node "${def.typeName ?? "(no typeName)"}". ` +
          `Update buildRecord.ts to cover it.`,
      );
  }
}

function isOptional(node: z.ZodTypeAny): boolean {
  return (node._def as { typeName?: string }).typeName === "ZodOptional";
}

/** The exact CityData field list handed to the model, in interface order. */
export function fieldListing(): string {
  const shape = cityDataSchema.shape as Record<string, z.ZodTypeAny>;
  return CITY_DATA_FIELD_ORDER.map((name) => {
    const node = shape[name as string] as z.ZodTypeAny;
    return `  ${String(name)}${isOptional(node) ? "?" : ""}: ${describeZod(node)};`;
  }).join("\n");
}

// ── Prompts ───────────────────────────────────────────────────────────────

export function buildInitialPrompt(facts: FactLayer, target: TargetCity): string {
  const { hardCounts, lengthContracts, maxSentenceWords } = gateConfig;
  return `You are a data author for Precision E-Cycle's page factory. You produce STRUCTURED DATA ONLY.

TASK
Produce ONE JSON object: a complete \`CityData\` record for a new city hub page for ${target.city}, ${target.state}.

OUTPUT FORMAT, ABSOLUTE
- Reply with exactly ONE JSON object and nothing else. No prose before or after, no markdown code fence, no comments.
- Emit NO HTML, NO JSX, NO markup of any kind, in any field. Every field value is plain text data.
- Use ONLY the field names listed below. An extra field is a hard rejection (the schema is strict).
- Field values are plain ASCII text. No emoji. No em dash (U+2014). No en dash (U+2013). Use a comma, a semicolon, or two sentences instead.

THE EXACT FIELD LIST (fields marked ? are optional; everything else is required)
interface CityData {
${fieldListing()}
}

MARKET STATUS FOR THIS CITY
${target.city}, ${target.state} is NOT one of the seven confirmed service metros, so it is a PLANNING market.
Therefore:
- Set "availabilityConfirmationRequired": true
- Set "hasDropoff": false
- OMIT these fields entirely: address, listing, mapQuery, futureAddress, futureMapQuery
- Set "city": "${target.city}", "state": "${target.state}", "slug": "${target.slug}"
- Set "phone": "${facts.phone.primary}"
- Set "heroImage": "${facts.reusableAssets.heroImage}"
- Each industries[].href must be a path built from the canonical service slugs, e.g. "/services/itad".

CANONICAL BUSINESS FACTS (the only facts you may assert about the company)
${JSON.stringify(facts, null, 2)}

MACHINE-CHECKED GATE CONFIG (your output is run through these regexes in code; any match is a rejection)
${JSON.stringify(gateConfig, null, 2)}

THE RULES THAT ACTUALLY FAIL RECORDS, IN PLAIN LANGUAGE
1. HARD COUNTS, exact, not approximate:
   - faqs: exactly ${hardCounts.faqs}
   - industries: exactly ${hardCounts.industries}
   - processSteps: exactly ${hardCounts.processSteps}
   - expandedSections: exactly ${hardCounts.expandedSections}
   - complianceParagraphs: exactly ${hardCounts.complianceParagraphs}
2. LENGTHS:
   - seoTitle: at most ${lengthContracts.seoTitleMaxChars} characters. Count them.
   - seoDescription: between ${lengthContracts.seoDescriptionMinChars} and ${lengthContracts.seoDescriptionMaxChars} characters inclusive. Count them, this window is narrow.
   - Visible prose across the record: at least ${lengthContracts.visibleWordsMin} words. slug, seoTitle, seoDescription, image paths, alt text, mapQuery, listing and industries[].href do NOT count.
3. SENTENCES: no sentence over ${maxSentenceWords} words, anywhere. Aim for under 28 words so you have margin.
4. NO PRICES: no dollar amounts, no rate language, no per-unit pricing, no cost comparisons.
5. NO OPERATIONAL THRESHOLDS OR TIMEFRAMES: no device minimums, no volume cutoffs, no turnaround windows, no response times, no "same-day", no "next-day", no "within N days".
6. CREDENTIAL PHRASING, the rule a generic quality pass will not catch:
   - HELD, may be stated plainly: ISO/IEC 27001:2022, ISO 14001, ISO 9001:2015, ISO 45001:2018.
   - NIST SP 800-88 is CONFORMED TO. Say "aligned with NIST SP 800-88". Never "NIST certified".
   - R2 is DOWNSTREAM ONLY. Say "routed through R2-certified processors". Never "R2 certified", never an R2-certified facility of our own.
   - HIPAA is ALIGNED. Say "HIPAA-aligned". Never "HIPAA compliant", never "HIPAA certified".
   - NAID, NAID AAA, e-Stewards, SERI and RIOS are NOT HELD and must never appear anywhere in the record, in any form.
7. PLANNING-MARKET LANGUAGE, because availabilityConfirmationRequired is true. These must never appear:
   "our ${target.city} facility", "our facility in ${target.city}", "${target.city} location", "located in ${target.city}",
   "drop-off in ${target.city}", "pickup in ${target.city}", "we serve ${target.city}", "service area", "service areas", "service radius".
   That ban includes serviceAreaLabel, serviceAreaTitle and every heading: do not use the words "service area" together anywhere.
   Approved framing is "project review" and "planning". Write about coverage as something confirmed during a project review.
8. NAMED ORGANIZATIONS: the only nameable clients are ${facts.nameableClients.join(", ")}. Any other named organization is market context only and needs an explicit sentence saying it is not a Precision E-Cycle client or partner.
9. STATUTES: any statute or regulation claim needs a real primary government source. If you are not certain, omit the claim.

HITTING THE ${lengthContracts.visibleWordsMin}-WORD FLOOR
Write to roughly this budget so you clear the floor with margin:
- cityIntroP1, cityIntroP2: about 60 words each
- aboutCityP1, aboutCityP2, aboutCityP3: about 75 words each
- industries[].desc: about 30 words each
- processSteps[].desc: about 35 words each
- complianceParagraphs: about 55 words each
- expandedSections: 3 sections, 3 paragraphs each, about 65 words per paragraph
- faqs[].answer: about 75 words each
Follow the three-part expandedSections contract: (1) compliance framework, portable; (2) the local ${target.city} market and its named institutions, high uniqueness, with the market-context disclaimer where needed; (3) logistics and operations.
Also include: certifications (one entry per held ISO standard, 4 total), bandEyebrow, bandHeading, bandBody, complianceHeading, equipmentHeading, industriesHeading, faqHeading, serviceAreaLabel, serviceAreaTitle, serviceAreas (8 to 12 nearby ${target.state} communities), heroAlt, bandAlt, techAlt.

Return the JSON object now.`;
}

export function buildRepairPrompt(errors: string[], target: TargetCity): string {
  return `Your record was rejected by the deterministic validator. These are the exact failures:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Fix ONLY the fields named in those errors. Leave every other field byte-identical to what you just sent.
Keep the record a ${target.city}, ${target.state} PLANNING market record: availabilityConfirmationRequired stays true and hasDropoff stays false.
Reply with the COMPLETE corrected JSON object and nothing else. No prose, no code fence, no HTML.`;
}

// ── Model call ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One streamed completion. Deliberately has NO try/catch: an API error, a
 * timeout, or an empty response propagates to the caller and stops the run.
 */
async function complete(client: Anthropic, messages: ChatMessage[]): Promise<string> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const message = await stream.finalMessage();
  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!raw) throw new Error(`${MODEL} returned an empty response.`);
  return raw;
}

// ── Parsing and gating ────────────────────────────────────────────────────

type Extracted = { ok: true; value: unknown } | { ok: false; error: string };

/** Pull the single JSON object out of a reply, tolerating a stray code fence or
 * a sentence of preamble. A parse failure is returned as a repairable error, not
 * thrown: the model can be asked to resend clean JSON. */
export function extractJson(raw: string): Extracted {
  const fence = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  const body = (fence?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return {
      ok: false,
      error:
        "json: the reply contained no JSON object. Reply with exactly one JSON object and nothing else.",
    };
  }
  const slice = body.slice(start, end + 1);
  try {
    return { ok: true, value: JSON.parse(slice) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[buildRecord] model reply was not parseable JSON: ${msg}`);
    return {
      ok: false,
      error: `json: the reply was not valid JSON (${msg}). Reply with exactly one well-formed JSON object and nothing else.`,
    };
  }
}

/** `validate()` throws when handed something that is not a record at all. That
 * is still a model mistake this loop can repair, so convert it to an error list
 * (logging what was caught) rather than letting it kill the run. */
function gate(candidate: unknown): ValidationResult {
  try {
    return validate(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[buildRecord] validate() rejected the candidate as malformed input: ${msg}`);
    return {
      ok: false,
      errors: [
        `shape: ${msg} The top level of your reply must be the CityData object itself, not an array or a wrapper.`,
      ],
    };
  }
}

// ── The build ─────────────────────────────────────────────────────────────

export interface BuildOutcome {
  ok: boolean;
  model: string;
  /** Which env var supplied the credential. Never the credential itself. */
  authSource: string;
  target: TargetCity;
  /** Repair turns actually used (0 means it passed on the first attempt). */
  repairTurns: number;
  errors: string[];
  record: CityData | null;
  /** Visible word count of the last candidate, when one could be counted. */
  visibleWords: number | null;
}

export async function buildRecord(target: TargetCity = TARGET): Promise<BuildOutcome> {
  const auth = resolveAuth();
  const client = makeClient(auth);
  const facts = loadFactLayer();

  const messages: ChatMessage[] = [
    { role: "user", content: buildInitialPrompt(facts, target) },
  ];

  let repairTurns = 0;
  for (;;) {
    const attemptLabel = repairTurns === 0 ? "initial attempt" : `repair turn ${repairTurns}`;
    console.log(`[buildRecord] ${MODEL}: ${attemptLabel}...`);

    const raw = await complete(client, messages);
    messages.push({ role: "assistant", content: raw });

    const extracted = extractJson(raw);
    const result: ValidationResult = extracted.ok
      ? gate(extracted.value)
      : { ok: false, errors: [extracted.error] };

    const candidate = extracted.ok ? extracted.value : null;
    const words =
      candidate !== null && typeof candidate === "object" ? visibleWordCount(candidate) : null;

    if (result.ok) {
      console.log(`[buildRecord] passed after ${repairTurns} repair turn(s).`);
      return {
        ok: true,
        model: MODEL,
        authSource: auth.source,
        target,
        repairTurns,
        errors: [],
        // Safe: validate() already ran the same schema. A throw here is a bug.
        record: cityDataSchema.parse(candidate),
        visibleWords: words,
      };
    }

    console.log(`[buildRecord] ${result.errors.length} failure(s) on ${attemptLabel}.`);

    if (repairTurns >= MAX_REPAIR_TURNS) {
      return {
        ok: false,
        model: MODEL,
        authSource: auth.source,
        target,
        repairTurns,
        errors: result.errors,
        record: null,
        visibleWords: words,
      };
    }

    repairTurns++;
    messages.push({ role: "user", content: buildRepairPrompt(result.errors, target) });
  }
}
