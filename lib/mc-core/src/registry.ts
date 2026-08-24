import type { RegistryLink, UrlRegistry } from "./types";

export const BASE_DOMAIN = "https://www.stselectronicrecyclinginc.com";

/**
 * Default word-count floor. The audit phase enforces this AFTER the page is
 * built; falling below it is a hard failure in the checker suite.
 */
export const DEFAULT_WORD_COUNT_FLOOR = 2000;

/**
 * Soft word-count ceilings by page type. Exceeding these raises a warning, not
 * an error.
 */
export const WORD_COUNT_CEILINGS: Record<string, number> = {
  SPOKE: 2400,
  HUB: 2800,
  NATIONAL: 3200,
};

/**
 * The "sacred 10" equipment service links. These are editable defaults — the
 * real slugs live in the DB-backed registry and can be corrected by an admin.
 * The checker enforces presence of whatever sacred links are configured, so a
 * wrong default fails safe (it is flagged, then fixed in the registry) rather
 * than silently passing.
 */
export const DEFAULT_SACRED_LINKS: RegistryLink[] = [
  { label: "Computer Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/317-computer-recycling` },
  { label: "Laptop Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/318-laptop-recycling` },
  { label: "Cell Phone Recycling", url: `${BASE_DOMAIN}/iphone-smartphone-and-cell-phone-recycling` },
  { label: "Networking Equipment Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/320-networking-equipment-recycling` },
  { label: "Printer Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/321-printer-recycling` },
  { label: "Copy Machine Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/322-copy-machine-recycling` },
  { label: "Server Equipment Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/323-server-equipment-recycling` },
  { label: "Ink and Toner Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/324-ink-and-toner-recycling` },
  { label: "Monitor Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/325-monitor-recycling` },
  { label: "Old Electronics Recycling", url: `${BASE_DOMAIN}/97-recyclable-electronics/326-old-electronics-recycling` },
];

export const DEFAULT_INDUSTRY_LINKS: RegistryLink[] = [
  { label: "Industries We Serve", url: `${BASE_DOMAIN}/industries-we-serve` },
  {
    label: "Courts and Legal Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-3/courts-and-legal-industry-electronics-recycling-and-itad`,
  },
];

const IMG = `${BASE_DOMAIN}/images/2017/compressed`;

/**
 * Verified image library (the only image URLs that may appear in built HTML).
 * Two known path exceptions are baked in so they are not "corrected" away:
 *   - datacenter-286386 uses the _1280 suffix (not _1920)
 *   - desk-4308230 lives at the /images/2017/ root (no /compressed/, no suffix)
 */
export const DEFAULT_IMAGE_LIBRARY: RegistryLink[] = [
  { label: "Laptop", url: `${IMG}/laptop-1742462_1920.jpg` },
  { label: "Data", url: `${IMG}/data-3181149_1920.jpg` },
  { label: "Data center", url: `${IMG}/datacenter-286386_1280.jpg` },
  { label: "Castle", url: `${IMG}/castle-3181153_1920.jpg` },
  { label: "Mac (hero)", url: `${IMG}/mac-2585220_1920.jpg` },
  { label: "Desk workspace", url: `${BASE_DOMAIN}/images/2017/desk-4308230.jpg` },
];

/**
 * APPROVED_URL_ALLOWLIST — the canonical set of real STS corporate, hub,
 * service, industry, and resource URLs (from the master audit prompt). These
 * are the internal links a page may reference without a per-run handoff. City
 * "spoke" URLs are NOT here — they come from the per-run handoff/existing URLs;
 * inventing a city URL is a hard failure. The checker validates internal links
 * against this allowlist (merged with sacred/image/industry/handoff/existing).
 */
export const DEFAULT_URL_ALLOWLIST: RegistryLink[] = [
  { label: "Home", url: `${BASE_DOMAIN}/` },
  { label: "Contact", url: `${BASE_DOMAIN}/CONTACT-STS-PAGE` },
  { label: "Services", url: `${BASE_DOMAIN}/services` },
  { label: "Quote", url: `${BASE_DOMAIN}/quote` },
  { label: "Our Locations", url: `${BASE_DOMAIN}/our-locations` },
  { label: "Cell Phone Recycling (alt)", url: `${BASE_DOMAIN}/97-recyclable-electronics/319-cell-phone-recycling` },
  { label: "Certificate of Destruction", url: `${BASE_DOMAIN}/certificate-of-destruction-services` },
  { label: "Compliance Officer Data Destruction", url: `${BASE_DOMAIN}/compliance-officer-data-destruction` },
  { label: "Computer Liquidation Service", url: `${BASE_DOMAIN}/computer-liquidation-service` },
  { label: "Corporate Data Security Disposal", url: `${BASE_DOMAIN}/corporate-data-security-disposal` },
  { label: "Data Center Decommissioning", url: `${BASE_DOMAIN}/data-center-decommissioning` },
  { label: "Education IT Disposal", url: `${BASE_DOMAIN}/education-it-disposal` },
  {
    label: "Electronics and Computer Recycling Disposal Service",
    url: `${BASE_DOMAIN}/electronics-and-computer-recycling-disposal-service`,
  },
  { label: "Financial Services Data Destruction", url: `${BASE_DOMAIN}/financial-services-data-destruction` },
  { label: "Government Data Destruction", url: `${BASE_DOMAIN}/government-data-destruction` },
  { label: "Hard Drive Destruction Service", url: `${BASE_DOMAIN}/hard-drive-destruction-service` },
  { label: "Healthcare IT Disposal", url: `${BASE_DOMAIN}/healthcare-it-disposal` },
  {
    label: "HIPAA Compliant Hard Drive Destruction",
    url: `${BASE_DOMAIN}/hipaa-compliant-hard-drive-destruction`,
  },
  { label: "IT Asset Disposition (ITAD)", url: `${BASE_DOMAIN}/it-asset-disposition-itad` },
  { label: "Legal Firm Data Destruction", url: `${BASE_DOMAIN}/legal-firm-data-destruction` },
  { label: "On-Site Hard Drive Shredding", url: `${BASE_DOMAIN}/on-site-hard-drive-shredding` },
  { label: "Recycling Pollution Effects", url: `${BASE_DOMAIN}/recycling-pollution-effects` },
  { label: "Server Destruction Services", url: `${BASE_DOMAIN}/server-destruction-services` },
  { label: "Computer Lease Buyout", url: `${BASE_DOMAIN}/services/computer-lease-buyout` },
  { label: "ITAD - IT Asset Disposition", url: `${BASE_DOMAIN}/services/itad-it-asset-disposition` },
  { label: "MAR Program", url: `${BASE_DOMAIN}/services/mar-program` },
  { label: "What's It Worth", url: `${BASE_DOMAIN}/services/whatsitworth` },
  {
    label: "Engineering Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-1/engineering-industry-electronics-recycling-and-itad`,
  },
  {
    label: "Healthcare Electronic Recycling",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-1/healthcare-electronic-recycling`,
  },
  {
    label: "Oil and Gas Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-1/oil-and-gas-industry-electronics-recycling`,
  },
  {
    label: "School, University and Education",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-1/school-university-and-education-electronics-recycling-and-itad`,
  },
  {
    label: "Consulting Firm",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-2/consulting-firm-electronics-recycling-and-itad`,
  },
  {
    label: "Data Center and Colocation",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-2/data-center-and-colocation-electronics-recycling-and-itad`,
  },
  {
    label: "Electronics OEM and Manufacturing",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-2/electronics-oem-and-manufacturing-electronics-recycling-and-itad`,
  },
  {
    label: "Software Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-2/software-industry-electronics-recycling-and-itad`,
  },
  {
    label: "Call Center",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-3/call-center-electronics-recycling-and-itad`,
  },
  {
    label: "Industrial Facility",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-3/industrial-facility-electronics-recycling-and-itad`,
  },
  {
    label: "Media and Entertainment Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-3/media-and-entertainment-industry-electronics-recycling-and-itad`,
  },
  {
    label: "Banking and Financial Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-4/banking-and-financial-industry-electronics-recycling-and-itad`,
  },
  {
    label: "Casino and Gaming Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-4/casino-and-gaming-industry-electronics-recycling-and-itad`,
  },
  {
    label: "Federal, State and Local Government",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-4/federal-state-and-local-government-electronics-recycling-and-itad`,
  },
  {
    label: "Insurance Industry",
    url: `${BASE_DOMAIN}/industries-we-serve/industries-4/insurance-industry-electronics-recycling-and-itad`,
  },
];

/**
 * Known dead/redirected URLs. Any of these appearing in built HTML is a hard
 * failure; the value is the corrected destination.
 */
export const KNOWN_REDIRECTS: Record<string, string> = {
  // The broken legacy form must hard-fail; the corrected long-form destination
  // lives under /industries-we-serve/industries-3/.
  [`${BASE_DOMAIN}/industries-4/law-firm-electronics-recycling-and-itad`]: `${BASE_DOMAIN}/industries-we-serve/industries-3/courts-and-legal-industry-electronics-recycling-and-itad`,
};

/**
 * "Facility language" is forbidden because STS does not own/operate the
 * recycling facility in the target market — pages must not claim a local
 * facility/location. These are the city-independent forbidden phrases; the
 * city-specific patterns are built per-run by {@link buildForbiddenFacilityPhrases}.
 */
export const FORBIDDEN_FACILITY_PHRASES: string[] = [
  "our facility",
  "our recycling facility",
  "our plant",
  "our warehouse",
  "at our facility",
  "visit our facility",
  "our processing facility",
  "our shredding facility",
];

/**
 * Build the full forbidden-facility-phrase list for a run. When a city is known
 * the city-templated patterns from the master prompt are added: "our {CITY}
 * facility", "{CITY} facility", "located in {CITY}", "{CITY} location/
 * warehouse/office", and "200,000 sq ft facility in {CITY}".
 */
export function buildForbiddenFacilityPhrases(city?: string | null): string[] {
  const generic = [...FORBIDDEN_FACILITY_PHRASES];
  if (!city || city.trim() === "") return generic;
  const c = city.trim();
  return [
    ...generic,
    `our ${c} facility`,
    `${c} facility`,
    `located in ${c}`,
    `${c} location`,
    `${c} warehouse`,
    `${c} office`,
    `200,000 sq ft facility in ${c}`,
  ];
}

/** Approved rewrite for facility language. Includes the city when known. */
export function facilityRewrite(city?: string | null): string {
  const c = city && city.trim() !== "" ? city.trim() : "{CITY}";
  return `We serve ${c} from our 200,000 sq ft facility.`;
}

/** Back-compat generic rewrite (no city). */
export const APPROVED_FACILITY_REWRITE = facilityRewrite();

/**
 * Certification scope rules. NIST 800-88 is a standard that must never be
 * described as a certification, and no claim may "guarantee/ensure compliance".
 */
export interface CertRule {
  cert: string;
  scope: string;
  forbiddenPattern: RegExp;
  message: string;
}

export const CERT_RULES: CertRule[] = [
  {
    cert: "NIST 800-88",
    scope: "standard (never a certification)",
    forbiddenPattern: /NIST\s*800-?88[\s-]*(certified|certification)/i,
    message:
      'NIST 800-88 is a standard, not a certification. Use "compliant with NIST 800-88" or "follows NIST 800-88", never "NIST 800-88 certified".',
  },
  {
    cert: "compliance phrasing",
    scope: "no absolute guarantees",
    forbiddenPattern: /\b(guarantee[sd]?|ensure[sd]?)\s+compliance\b/i,
    message:
      'Do not promise to "guarantee/ensure compliance". Use scoped language such as "supports your compliance" or "helps you meet ... requirements".',
  },
];

/**
 * Build the merged, configurable registry. Pass overrides (e.g. rows loaded
 * from the DB and per-run handoff URLs) to extend the defaults.
 */
export function buildRegistry(overrides: Partial<UrlRegistry> = {}): UrlRegistry {
  return {
    baseDomain: overrides.baseDomain ?? BASE_DOMAIN,
    sacredLinks: overrides.sacredLinks ?? DEFAULT_SACRED_LINKS,
    imageLibrary: overrides.imageLibrary ?? DEFAULT_IMAGE_LIBRARY,
    industryLinks: overrides.industryLinks ?? DEFAULT_INDUSTRY_LINKS,
    allowlist: overrides.allowlist ?? DEFAULT_URL_ALLOWLIST,
    handoffUrls: overrides.handoffUrls ?? [],
    existingUrls: overrides.existingUrls ?? [],
    wordCountFloor: overrides.wordCountFloor ?? DEFAULT_WORD_COUNT_FLOOR,
  };
}

/**
 * The full set of URLs considered valid for internal links: allowlist + sacred
 * + industry + image library + per-run handoff URLs + per-run existing URLs
 * (genuine already-published links carried over on REVAMP/LIGHT_TOUCH pages).
 */
export function mergedAllowedUrls(registry: UrlRegistry): Set<string> {
  const all = [
    ...registry.allowlist,
    ...registry.sacredLinks,
    ...registry.industryLinks,
    ...registry.imageLibrary,
  ].map((l) => normalizeUrl(l.url));
  for (const u of registry.handoffUrls) all.push(normalizeUrl(u));
  for (const u of registry.existingUrls) all.push(normalizeUrl(u));
  return new Set(all);
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}
