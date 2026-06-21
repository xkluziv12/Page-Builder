/** US state name -> USPS abbreviation (lowercase keys). Includes DC. */
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR));
const ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBR).map(([name, abbr]) => [
    abbr,
    name.replace(/\b\w/g, (c) => c.toUpperCase()),
  ]),
);

/**
 * Slug tokens that describe the STS niche rather than the locality. Stripped out
 * of the city when parsing a target URL so e.g.
 * "electronics-recycling-san-antonio-tx" yields city "San Antonio".
 */
const NICHE_TOKENS = new Set([
  "electronics",
  "electronic",
  "recycling",
  "recycler",
  "recyclers",
  "ewaste",
  "e",
  "waste",
  "itad",
  "it",
  "asset",
  "disposition",
  "disposal",
  "data",
  "destruction",
  "hard",
  "drive",
  "shredding",
  "computer",
  "computers",
  "scrap",
  "scrapping",
  "services",
  "service",
  "near",
  "me",
  "company",
  "companies",
]);

export interface ParsedLocation {
  city: string;
  /** USPS 2-letter abbreviation, uppercase. */
  state: string;
  /** Full state name (title-cased), e.g. "Texas". */
  stateName: string;
  /** Best-effort niche derived from the slug, e.g. "electronics recycling". */
  niche: string;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalize a user-supplied target URL: prepend `https://` when the scheme is
 * missing and reject anything that isn't http(s). Returns the canonical href, or
 * null when the input cannot be a valid web URL. Use the returned value for BOTH
 * parsing and probing so the two never disagree on what URL is being inspected.
 */
export function normalizeTargetUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * SSRF guard: true when a hostname points at loopback, private, link-local, or
 * otherwise internal address space. The server probes user-supplied URLs, so we
 * must refuse to fetch internal targets (directly or via redirect).
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  if (host.includes(":")) {
    // IPv6 literal: loopback, unique-local (fc00::/7), link-local (fe80::/10).
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) return true;
  }
  return false;
}

/** Full state name for a USPS abbreviation, or the abbreviation itself. */
export function stateNameForAbbr(abbr: string): string {
  return ABBR_TO_NAME[abbr.toUpperCase()] ?? abbr;
}

/**
 * Normalize a free-form state string ("Texas", "tx", "TX") to its USPS
 * abbreviation, or null when it isn't a recognizable US state. Used to reconcile
 * a page's address region against the URL-parsed state.
 */
export function normalizeStateToAbbr(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (STATE_ABBRS.has(upper)) return upper;
  const byName = STATE_NAME_TO_ABBR[v.toLowerCase()];
  return byName ?? null;
}

/**
 * Parse a target page URL into { city, state, niche }. STS local pages encode
 * the locality in the final path segment, e.g.
 *   /electronics-recycling-austin-tx
 *   /san-antonio-texas-electronics-recycling
 * We anchor on a USPS abbreviation or full state name, treat the remaining
 * non-niche tokens as the city, and the niche tokens as the niche. Returns null
 * when no state can be found (the caller should fail loudly — a malformed URL
 * cannot drive a city-keyed pipeline).
 */
export function parseCityState(rawUrl: string): ParsedLocation | null {
  let pathname: string;
  try {
    const u = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
    pathname = u.pathname;
  } catch {
    return null;
  }

  const segments = pathname.split("/").map((s) => s.trim()).filter(Boolean);
  // Try the most specific segment first (last), then fall back to earlier ones.
  for (let i = segments.length - 1; i >= 0; i--) {
    const parsed = parseSegment(segments[i]!);
    if (parsed) return parsed;
  }
  return null;
}

function parseSegment(segment: string): ParsedLocation | null {
  const tokens = segment
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/i, "")
    .split(/[-_]/)
    .filter(Boolean);
  if (tokens.length < 2) return null;

  let stateAbbr: string | null = null;
  let stateStart = -1;
  let stateEnd = -1;

  // 1) Prefer an explicit USPS abbreviation (scan from the end).
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STATE_ABBRS.has(tokens[i]!.toUpperCase())) {
      stateAbbr = tokens[i]!.toUpperCase();
      stateStart = i;
      stateEnd = i;
      break;
    }
  }

  // 2) Otherwise match a full state name (two-word names take priority).
  if (!stateAbbr) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = `${tokens[i]} ${tokens[i + 1]}`;
      if (STATE_NAME_TO_ABBR[pair]) {
        stateAbbr = STATE_NAME_TO_ABBR[pair]!;
        stateStart = i;
        stateEnd = i + 1;
        break;
      }
    }
  }
  if (!stateAbbr) {
    for (let i = 0; i < tokens.length; i++) {
      if (STATE_NAME_TO_ABBR[tokens[i]!]) {
        stateAbbr = STATE_NAME_TO_ABBR[tokens[i]!]!;
        stateStart = i;
        stateEnd = i;
        break;
      }
    }
  }

  if (!stateAbbr) return null;

  const rest = tokens.filter((_, idx) => idx < stateStart || idx > stateEnd);
  const cityTokens = rest.filter((t) => !NICHE_TOKENS.has(t));
  const nicheTokens = rest.filter((t) => NICHE_TOKENS.has(t));
  if (cityTokens.length === 0) return null;

  return {
    city: titleCase(cityTokens.join(" ")),
    state: stateAbbr,
    stateName: stateNameForAbbr(stateAbbr),
    niche: nicheTokens.length ? nicheTokens.join(" ") : "electronics recycling",
  };
}
