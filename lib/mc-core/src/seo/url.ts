import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

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
    if (isPrivateHostname(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Resolve every address a hostname currently maps to. Injectable for tests. */
export type HostnameResolver = (hostname: string) => Promise<string[]>;

/**
 * Resolve a hostname without reordering its results. A host with no address (or
 * a failed lookup) is unsafe to fetch: accepting it would turn a DNS failure
 * into an unguarded request once the resolver recovers.
 */
export const resolveHostname: HostnameResolver = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

/**
 * Fetch a page while binding the actual HTTP connection to a DNS answer that
 * passed the public-address guard. Normal `fetch(url)` resolves the hostname
 * after a separate preflight lookup, which leaves a DNS-rebinding window.
 */
export async function fetchWithValidatedDns(
  url: string,
  init: RequestInit = {},
  resolver: HostnameResolver = resolveHostname,
): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`Unsupported protocol for page fetch: ${target.protocol}`);
  }
  if (init.body !== undefined && init.body !== null) {
    throw new Error("Page fetches only support bodyless requests.");
  }

  const lookup: LookupFunction = (hostname, options, callback): void => {
    void resolver(hostname)
      .then((addresses) => {
        const requestedFamily = options.family ?? 0;
        const permitted = addresses.filter(
          (address) =>
            !isPrivateHostname(address) &&
            (requestedFamily === 0 || isIP(address) === requestedFamily),
        );
        if (addresses.length === 0 || permitted.length !== addresses.length) {
          callback(new Error(`Refusing to connect to a non-public address for ${hostname}`), "");
          return;
        }
        const address = permitted[0];
        if (!address) {
          callback(new Error(`No usable address for ${hostname}`), "");
          return;
        }
        if (options.all) {
          callback(
            null,
            permitted.map((safeAddress) => ({ address: safeAddress, family: isIP(safeAddress) })),
          );
          return;
        }
        callback(null, address, isIP(address));
      })
      .catch((cause: unknown) => {
        callback(new Error(`Could not safely resolve ${hostname}`, { cause }), "");
      });
  };

  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      target,
      {
        method: init.method ?? "GET",
        headers: init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
        lookup,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | Uint8Array | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.once("error", reject);
        res.once("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers,
            }),
          );
        });
      },
    );
    req.once("error", reject);
    req.end();
  });
}

/**
 * Return true only when a hostname and every address it resolves to are public.
 * Literal IP addresses are checked directly and do not need DNS resolution.
 */
export async function isPublicHostname(
  hostname: string,
  resolver: HostnameResolver = resolveHostname,
): Promise<boolean> {
  const host = normalizeHostname(hostname);
  if (isPrivateHostname(host)) return false;
  if (isIP(host) !== 0) return true;

  try {
    const addresses = await resolver(host);
    return addresses.length > 0 && addresses.every((address) => !isPrivateHostname(address));
  } catch {
    return false;
  }
}

/**
 * SSRF guard: true when a hostname is an internal name or an IP literal outside
 * globally routable address space. Node's URL parser accepts alternate IPv4
 * spellings (decimal, octal, hexadecimal, and shortened forms), so normalize
 * those spellings before deciding whether they are safe.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;

  const family = isIP(host);
  if (family === 4) return isNonPublicIpv4(host);
  if (family === 6) return isNonPublicIpv6(host);

  // A colon in a host that node:net does not recognize as IPv6 cannot be a
  // public DNS name. Refuse it rather than allowing a parser discrepancy.
  if (host.includes(":")) return true;
  return false;
}

function normalizeHostname(hostname: string): string {
  let host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || host.includes(":")) return host;

  // WHATWG URL canonicalizes every IPv4 number form accepted by Node, including
  // 2130706433, 0177.0.0.1, 0x7f000001, and 127.1.
  try {
    const canonical = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
    if (isIP(canonical) === 4) host = canonical;
  } catch {
    // Leave malformed names for the caller to reject or DNS to fail closed.
  }
  return host;
}

function isNonPublicIpv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }
  const [a, b, c] = octets as [number, number, number, number];

  // RFC 1918, loopback, link-local, CGNAT, documentation, benchmarking,
  // multicast, future-reserved, and other non-global-use special-purpose nets.
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

function isNonPublicIpv6(ip: string): boolean {
  const words = parseIpv6Words(ip);
  if (!words) return true;

  const [first] = words;
  // Unspecified, loopback, and IPv4-compatible addresses are not public.
  if (words.slice(0, 6).every((word) => word === 0)) {
    return true;
  }
  // IPv4-mapped IPv6 must inherit the embedded address's restrictions.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isNonPublicIpv4(wordsToIpv4(words[6]!, words[7]!));
  }
  // Unique local, link-local, deprecated site-local, multicast, and unassigned
  // IPv6 ranges are not appropriate destinations for server-side page fetches.
  if ((first! & 0xfe00) === 0xfc00) return true;
  if ((first! & 0xffc0) === 0xfe80) return true;
  if ((first! & 0xffc0) === 0xfec0) return true;
  if ((first! & 0xff00) === 0xff00) return true;
  // Only the globally-routable 2000::/3 allocation is allowed. The remaining
  // prefixes are loopback/link-local/unique-local or reserved for special use.
  if ((first! & 0xe000) !== 0x2000) return true;
  // Documentation, benchmarking, ORCHID, Teredo, and deprecated 6to4 are
  // special-use. ORCHID spans 2001:20::/28, not only 2001:20::/32.
  if (
    first === 0x2001 &&
    (words[1] === 0x0000 ||
      words[1] === 0x0002 ||
      words[1] === 0x0003 ||
      words[1] === 0x0db8 ||
      words[1] === 0x0010 ||
      (words[1]! >= 0x0020 && words[1]! <= 0x002f))
  ) {
    return true;
  }
  if (first === 0x2002) return true;
  return false;
}

function wordsToIpv4(high: number, low: number): string {
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function parseIpv6Words(ip: string): number[] | null {
  if (ip.includes("%")) return null;
  const [left, right, ...extra] = ip.split("::");
  if (extra.length > 0) return null;
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const parts = [...leftParts, ...rightParts];
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  if (left !== undefined && right !== undefined) {
    if (parts.length >= 8) return null;
    return [
      ...leftParts.map((part) => parseInt(part, 16)),
      ...Array(8 - parts.length).fill(0),
      ...rightParts.map((part) => parseInt(part, 16)),
    ];
  }
  return parts.length === 8 ? parts.map((part) => parseInt(part, 16)) : null;
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
