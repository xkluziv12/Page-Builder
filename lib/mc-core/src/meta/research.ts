import type Anthropic from "@anthropic-ai/sdk";
import {
  cityNamesEquivalent,
  extractLocations,
  fetchSeoIntel,
  isPrivateHostname,
  normalizeStateToAbbr,
  normalizeTargetUrl,
  parseCityState,
  stateNameForAbbr,
  type ExtractedLocation,
  type SeoCompetitor,
} from "../seo";
import { extractPageContent, type ExtractedPageContent } from "./extract";
import { metaSynthesisSystem, nicheDetectionSystem } from "./prompts";
import type {
  MetaResearchDeps,
  MetaResearchInput,
  MetaResearchResult,
  NicheConfidence,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_REDIRECTS = 5;
const TITLE_MAX = 60;
const DESC_MAX = 155;

/**
 * Produce research-backed meta for a single No-GMB page. The flow is deliberately
 * grounded in live signals at every step — never a static template:
 *   1. Fetch the live page (SSRF-guarded, follows redirects, fails loud).
 *   2. Extract its real content and detect the ACTUAL niche from the body.
 *   3. Resolve city/state from the URL slug, corroborated/corrected by the page.
 *   4. Pull the live SERP for the detected niche + city (SerpAPI, fails loud).
 *   5. Synthesize the winning title/description/keywords against that SERP.
 * Any missing input or malformed model output halts with a clear error rather
 * than emitting a partial or placeholder result.
 */
export async function researchMeta(
  input: MetaResearchInput,
  deps: MetaResearchDeps,
): Promise<MetaResearchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = deps.model ?? DEFAULT_MODEL;
  const county = input.county?.trim() ? input.county.trim().replace(/\s+county$/i, "") : null;

  const normalized = normalizeTargetUrl(input.url);
  if (!normalized) {
    throw new Error(
      `"${input.url}" is not a valid http(s) URL. Paste the full page URL, e.g. https://www.stselectronicrecyclinginc.com/anaheim-ca.`,
    );
  }
  if (isPrivateHostname(new URL(normalized).hostname)) {
    throw new Error(`Refusing to fetch "${input.url}" — it points at a private or internal address.`);
  }
  if (!deps.creds.serpApiKey) {
    throw new Error(
      "SERPAPI_API_KEY is not configured; cannot gather the live SERP data the meta engine researches against.",
    );
  }

  const html = await fetchHtml(normalized, fetchImpl);
  const content = extractPageContent(html);
  const pageLocs = extractLocations(html);

  const niche = await detectNiche(deps.anthropic, model, content, normalized);

  const { city, state, locationSource, locationVerified } = resolveLocation(
    normalized,
    pageLocs,
    niche.city,
    niche.state,
  );
  const stateName = stateNameForAbbr(state);

  const seoIntel = await fetchSeoIntel(
    { city, state, niche: niche.niche, fetchImpl },
    deps.creds,
  );

  const meta = await synthesizeMeta(deps.anthropic, model, {
    city,
    state,
    stateName,
    county,
    niche: niche.niche,
    services: niche.services,
    content,
    competitors: seoIntel.topCompetitors,
    peopleAlsoAsk: seoIntel.peopleAlsoAsk,
    relatedKeywords: seoIntel.relatedKeywords.map((k) => k.keyword),
  });

  return {
    url: normalized,
    city,
    state,
    stateName,
    county,
    detectedNiche: niche.niche,
    services: niche.services,
    nicheConfidence: niche.confidence,
    nicheReasoning: niche.reasoning,
    browserPageTitle: meta.browserPageTitle,
    metaDescription: meta.metaDescription,
    keywords: meta.keywordList.join(", "),
    keywordList: meta.keywordList,
    rationale: meta.rationale,
    competitors: seoIntel.topCompetitors,
    peopleAlsoAsk: seoIntel.peopleAlsoAsk,
    relatedKeywords: seoIntel.relatedKeywords.map((k) => k.keyword),
    competition: seoIntel.competition,
    locationVerified,
    locationSource,
    sources: seoIntel.sources,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Resolve the target city/state. The URL slug is the primary signal when it
 * carries both a city and a state. The live page corroborates it and, for the
 * "same city name, wrong state" case, corrects the state. When the slug has no
 * parseable state (common for service-page URLs), we trust the city/state the
 * model READ from the page content — far more reliable than scraping a "City, ST"
 * regex, which on No-GMB pages tends to catch the STS headquarters address in the
 * footer rather than the target locality.
 */
function resolveLocation(
  normalizedUrl: string,
  pageLocs: ExtractedLocation[],
  llmCity: string,
  llmState: string,
): { city: string; state: string; locationSource: "url" | "page"; locationVerified: boolean } {
  // The page content the model READ is the authoritative source for where this
  // page actually targets. URL slugs are sneaky: e.g. "data-destruction-in-
  // sacramento" makes parseCityState read the word "in" as Indiana, and the STS
  // headquarters address in the footer then "corroborates" the wrong state. So
  // when the model extracted a city + state from the body, trust it first.
  if (llmCity && llmState) {
    return { city: llmCity, state: llmState, locationSource: "page", locationVerified: true };
  }

  const urlLoc = parseCityState(normalizedUrl);
  if (urlLoc) {
    const state = urlLoc.state;
    const city = urlLoc.city;
    const corroborated = pageLocs.find(
      (c) => c.state?.toUpperCase() === state.toUpperCase() && c.city && cityNamesEquivalent(c.city, city),
    );
    if (corroborated) {
      return { city, state, locationSource: "url", locationVerified: true };
    }
    const sameCityDiffState = pageLocs.find(
      (c) =>
        c.city &&
        cityNamesEquivalent(c.city, city) &&
        c.state &&
        c.state.toUpperCase() !== state.toUpperCase(),
    );
    if (sameCityDiffState?.state) {
      return { city, state: sameCityDiffState.state.toUpperCase(), locationSource: "page", locationVerified: true };
    }
    return { city, state, locationSource: "url", locationVerified: false };
  }

  const fromPage = pageLocs.find((c) => c.city && c.state);
  if (!fromPage?.city || !fromPage.state) {
    throw new Error(
      "Could not determine a city and state from the URL or the page content. Use a local page URL (e.g. ending in a city + state) or one whose page names its city/state.",
    );
  }
  return {
    city: fromPage.city,
    state: fromPage.state.toUpperCase(),
    locationSource: "page",
    locationVerified: true,
  };
}

interface DetectedNiche {
  niche: string;
  services: string[];
  confidence: NicheConfidence;
  reasoning: string;
  city: string;
  state: string;
}

async function detectNiche(
  anthropic: Anthropic,
  model: string,
  content: ExtractedPageContent,
  url: string,
): Promise<DetectedNiche> {
  const user = [
    `PAGE URL: ${url}`,
    "",
    `TITLE: ${content.title ?? "(none)"}`,
    `META DESCRIPTION: ${content.metaDescription ?? "(none)"}`,
    `META KEYWORDS: ${content.metaKeywords ?? "(none)"}`,
    `H1: ${content.h1.join(" | ") || "(none)"}`,
    `H2: ${content.h2.slice(0, 12).join(" | ") || "(none)"}`,
    "",
    "BODY EXCERPT:",
    content.bodyText || "(empty)",
  ].join("\n");

  const raw = await complete(anthropic, model, nicheDetectionSystem, user, 800);
  const parsed = parseJsonLoose(raw) as Record<string, unknown>;
  const niche = asString(parsed.niche).trim();
  if (!niche) {
    throw new Error("Niche detection returned no niche. Cannot research meta without a niche.");
  }
  return {
    niche,
    services: asStringArray(parsed.services),
    confidence: asConfidence(parsed.confidence),
    reasoning: asString(parsed.reasoning).trim() || "(no reasoning provided)",
    city: asString(parsed.city).trim(),
    state: normalizeStateToAbbr(asString(parsed.state)) ?? "",
  };
}

interface SynthInput {
  city: string;
  state: string;
  stateName: string;
  county: string | null;
  niche: string;
  services: string[];
  content: ExtractedPageContent;
  competitors: SeoCompetitor[];
  peopleAlsoAsk: string[];
  relatedKeywords: string[];
}

async function synthesizeMeta(
  anthropic: Anthropic,
  model: string,
  s: SynthInput,
): Promise<{ browserPageTitle: string; metaDescription: string; keywordList: string[]; rationale: string }> {
  const user = [
    `TARGET CITY: ${s.city}`,
    `TARGET STATE: ${s.stateName} (${s.state})`,
    `COUNTY: ${s.county ?? "(not provided — omit any county/pickup line)"}`,
    `DETECTED NICHE: ${s.niche}`,
    `SERVICES ON PAGE: ${s.services.join(", ") || "(unspecified)"}`,
    "",
    `PAGE'S CURRENT TITLE: ${s.content.title ?? "(none)"}`,
    `PAGE H1: ${s.content.h1.join(" | ") || "(none)"}`,
    "",
    `LIVE SERP — COMPETITOR TITLES CURRENTLY RANKING FOR "${s.niche} ${s.city} ${s.state}":`,
    s.competitors.length
      ? s.competitors.map((c, i) => `${i + 1}. ${c.title}`).join("\n")
      : "(none returned)",
    "",
    "PEOPLE ALSO ASK:",
    s.peopleAlsoAsk.length ? s.peopleAlsoAsk.map((q) => `- ${q}`).join("\n") : "(none)",
    "",
    "RELATED SEARCHES:",
    s.relatedKeywords.length ? s.relatedKeywords.join(", ") : "(none)",
    "",
    `Write the winning meta now. Hard caps: title ${TITLE_MAX} chars, description ${DESC_MAX} chars.`,
  ].join("\n");

  const raw = await complete(anthropic, model, metaSynthesisSystem, user, 1500);
  const parsed = parseJsonLoose(raw) as Record<string, unknown>;
  const browserPageTitle = asString(parsed.browserPageTitle).trim();
  const metaDescription = asString(parsed.metaDescription).trim();
  const keywordList = asStringArray(parsed.keywords);
  const rationale = asString(parsed.rationale).trim();
  if (!browserPageTitle) throw new Error("Meta synthesis returned an empty browserPageTitle.");
  if (!metaDescription) throw new Error("Meta synthesis returned an empty metaDescription.");
  if (keywordList.length === 0) throw new Error("Meta synthesis returned no keywords.");
  return { browserPageTitle, metaDescription, keywordList, rationale };
}

/** GET the page HTML, following redirects with a per-hop SSRF check. Fails loud. */
async function fetchHtml(url: string, fetchImpl: typeof fetch): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let host: string;
    try {
      host = new URL(current).hostname;
    } catch {
      throw new Error(`Invalid URL while fetching the target page: ${current}`);
    }
    if (isPrivateHostname(host)) {
      throw new Error(`Refusing to fetch a private/internal address: ${host}`);
    }
    const res = await fetchImpl(current, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MissionControl/1.0)" },
      redirect: "manual",
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `Target page returned HTTP ${res.status} — cannot research meta for a page that does not load.`,
      );
    }
    return await res.text();
  }
  throw new Error("Too many redirects while fetching the target page.");
}

/** One Anthropic completion; returns the concatenated text blocks. */
async function complete(
  anthropic: Anthropic,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Parse JSON that may be fenced or surrounded by stray prose. */
function parseJsonLoose(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }
  throw new Error(`Model did not return valid JSON: ${raw.slice(0, 200)}`);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function asConfidence(v: unknown): NicheConfidence {
  return v === "high" || v === "medium" || v === "low" ? v : "medium";
}
