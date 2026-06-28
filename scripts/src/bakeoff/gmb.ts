import { generateLocalBusinessSchema, type RunContext } from "@workspace/mc-core";
import { HQ_PHONE, type PromptGmb } from "./miniPrompts.js";
import {
  formatHoursLine,
  parseGoogleMapsPaste,
  type DayHours,
  type ParsedMapsPlace,
} from "./maps-paste.js";

/** STS is the only website a generated STS page may carry — even for a stand-in
 * test location, the verified business website is forced to the STS domain. */
export const STS_WEBSITE = "https://www.stselectronicrecyclinginc.com";

/**
 * The GMB scenario for the bake-off — the dead-simple primary input: a target
 * page_url + a VERIFIED Google Business Profile (GMB) block.
 *
 * In the faithful No-GMB context the run deliberately omits a page_url and any
 * GMB data — STS spoke pages target a service-area city, not a verified physical
 * storefront. This module supplies the alternate flow: hand EVERY model the same
 * explicit page_url + the page's verified GMB block, so each builds the page with
 * its real local NAP (name/address/phone), hours, CID, and map link.
 *
 * Any real run SUPPLIES its own verified block via `BAKEOFF_GMB_JSON`;
 * {@link PORTLAND_GMB} below is the built-in SAMPLE target only (the Regus –
 * Portland – Liberty Centre listing standing in for STS Portland, OR), parsed
 * from a real Google Maps paste with the website forced to STS. The fail-loud /
 * no-fabrication convention is enforced in {@link resolveGmbProfile}: a real
 * (non-sample) target with a missing GMB field fails loudly rather than
 * inventing location data.
 */
export interface GmbProfile {
  pageUrl: string;
  gmbUrl: string;
  cid: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  phone: string;
  neighborhoods: string[];
  landmark: string;
  lat: number;
  lng: number;
  /** Human-readable hours line for prompt context (e.g. "Mon-Fri 08:30-17:00"). */
  hours: string;
  /** Structured 7-day hours (Mon→Sun) when available — source for the schema's
   * `openingHoursSpecification` (incl. 24-hour days). Optional so a legacy
   * `BAKEOFF_GMB_JSON` block that only supplies the `hours` string still loads. */
  openingHours?: DayHours[];
  /** Open Location ("plus") code, when supplied/parsed. */
  plusCode?: string;
  /** The verified business website — always forced to the STS domain. */
  website: string;
}

/**
 * Built-in SAMPLE GMB paste — the **Regus – Portland – Liberty Centre** Google
 * Maps listing, used as a transparent STAND-IN for an STS Portland, OR location
 * at `/portland-or`. The real listing's phone, address, hours, geo pin, and CID
 * are kept as-is (it is a real, sourced listing — not fabricated NAP); only the
 * business website is forced to the STS domain. The model-facing context shows
 * the real "Regus – Portland – Liberty Centre" name, so it is honestly labeled
 * as the test stand-in rather than pretending to be a verified STS storefront.
 *
 * This is the exact shape a VA copies out of Google Maps: the place URL plus the
 * raw info-panel dump. It is run through {@link parseGoogleMapsPaste} (the same
 * reusable parser a real run uses) so the smoke path exercises the parser too.
 */
export const REGUS_PORTLAND_PLACE_URL =
  "https://www.google.com/maps/place/Regus+-+Portland+-+Liberty+Centre/" +
  "@45.5301,-122.657,17z/data=!3m1!4b1!4m6!3m5" +
  "!1s0x5495a0a3d8f1c2b3:0x9f3e2d1c4b5a6e7f!8m2!3d45.5301!4d-122.657!16s%2Fg%2F11abcd1234";

export const REGUS_PORTLAND_RAW_DUMP = [
  "Regus - Portland - Liberty Centre",
  "4.0 (15)",
  "Office space rental agency",
  "Liberty Centre, 650 NE Holladay St #1600, Portland, OR 97232",
  "G8GW+2C Portland, Oregon",
  "Phone: (972) 764-8880",
  "Monday 8:30 AM–5:00 PM",
  "Tuesday 8:30 AM–5:00 PM",
  "Wednesday 8:30 AM–5:00 PM",
  "Thursday 8:30 AM–5:00 PM",
  "Friday 8:30 AM–5:00 PM",
  "Saturday Closed",
  "Sunday Closed",
].join("\n");

/** The Portland/Regus paste parsed into the structured place record. */
export const PORTLAND_PARSED: ParsedMapsPlace = parseGoogleMapsPaste({
  placeUrl: REGUS_PORTLAND_PLACE_URL,
  rawDump: REGUS_PORTLAND_RAW_DUMP,
});

/**
 * The GMB scenario's source-of-truth profile: the parsed Regus/Portland place,
 * mapped onto the STS `/portland-or` page (website forced to STS). The non-Maps
 * fields Google's panel does not expose (county, landmark, neighborhoods) are
 * supplied here rather than invented inside the parser.
 */
export const PORTLAND_GMB: GmbProfile = {
  pageUrl: `${STS_WEBSITE}/portland-or`,
  gmbUrl: PORTLAND_PARSED.cidUrl,
  cid: PORTLAND_PARSED.cid,
  businessName: PORTLAND_PARSED.businessName,
  street: PORTLAND_PARSED.street,
  city: PORTLAND_PARSED.city,
  state: PORTLAND_PARSED.state,
  zip: PORTLAND_PARSED.zip,
  county: "Multnomah County",
  phone: PORTLAND_PARSED.phone,
  neighborhoods: ["Lloyd District", "Sullivan's Gulch", "Irvington"],
  landmark: "in the Lloyd District near the Oregon Convention Center",
  lat: PORTLAND_PARSED.lat,
  lng: PORTLAND_PARSED.lng,
  hours: formatHoursLine(PORTLAND_PARSED.hours),
  openingHours: PORTLAND_PARSED.hours,
  plusCode: PORTLAND_PARSED.plusCode,
  website: STS_WEBSITE,
};

/**
 * Resolve the GMB block for a GMB-scenario run against a given target. Defaults
 * to the {@link PORTLAND_GMB} stand-in ONLY for the Portland, OR smoke target;
 * for any OTHER city a verified block MUST be supplied via `BAKEOFF_GMB_JSON`
 * (fail loud — never invent a CID, street address, or phone for a real page).
 */
export function resolveGmbProfile(target: { city: string; state: string }): GmbProfile {
  const raw = process.env.BAKEOFF_GMB_JSON;
  if (!raw) {
    const isPortland =
      target.city.toLowerCase() === "portland" && target.state.toUpperCase() === "OR";
    if (!isPortland) {
      throw new Error(
        `GMB scenario for ${target.city}, ${target.state} requires a verified GMB block. ` +
          `Set BAKEOFF_GMB_JSON to a JSON object with: pageUrl, gmbUrl, cid, businessName, street, ` +
          `city, state, zip, county, phone, landmark, lat, lng, hours (neighborhoods/openingHours/plusCode optional). ` +
          `Never invent a CID/address/phone for a real page.`,
      );
    }
    return PORTLAND_GMB;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `BAKEOFF_GMB_JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const required = [
    "pageUrl",
    "gmbUrl",
    "cid",
    "businessName",
    "street",
    "city",
    "state",
    "zip",
    "county",
    "phone",
    "landmark",
    "lat",
    "lng",
    "hours",
  ];
  for (const key of required) {
    if (parsed[key] == null || parsed[key] === "") {
      throw new Error(
        `BAKEOFF_GMB_JSON is missing required field "${key}". A GMB page must SUPPLY its verified block — no invention.`,
      );
    }
  }
  return {
    pageUrl: String(parsed.pageUrl),
    gmbUrl: String(parsed.gmbUrl),
    cid: String(parsed.cid),
    businessName: String(parsed.businessName),
    street: String(parsed.street),
    city: String(parsed.city),
    state: String(parsed.state),
    zip: String(parsed.zip),
    county: String(parsed.county),
    phone: String(parsed.phone),
    neighborhoods: Array.isArray(parsed.neighborhoods) ? parsed.neighborhoods.map(String) : [],
    landmark: String(parsed.landmark),
    lat: Number(parsed.lat),
    lng: Number(parsed.lng),
    hours: String(parsed.hours),
    // Optional structured signals — present when the operator supplies them
    // (e.g. from the Maps parser). The website is ALWAYS forced to the STS domain.
    openingHours: Array.isArray(parsed.openingHours)
      ? (parsed.openingHours as DayHours[])
      : undefined,
    plusCode: parsed.plusCode != null && parsed.plusCode !== "" ? String(parsed.plusCode) : undefined,
    website: STS_WEBSITE,
  };
}

/**
 * The GMB-context suffix appended AFTER the production `describeContext` output.
 * It is added only inside the harness — the shipped `describeContext` prod path
 * is never modified — so the No-GMB scenario stays a faithful reproduction of
 * production while this scenario adds the explicit page_url + verified GMB block
 * on top. Presented as the page's VERIFIED Google Business Profile that the model
 * MUST use for the page's NAP, hours, CID, and map link. Identical for every
 * model in the scenario.
 */
export function gmbContextSuffix(p: GmbProfile): string {
  return [
    "",
    "",
    "[VERIFIED GOOGLE BUSINESS PROFILE — the explicit page_url + the page's verified GMB block.",
    "This is the real, verified location data for this page. You MUST use it as the page's contact",
    "info: the business name, street address, phone, hours, CID, and map link below are the page's",
    "actual NAP — use them exactly, do not substitute the HQ line or omit the local address. Every",
    "model in this scenario receives this identical block.]",
    "",
    `page_url: ${p.pageUrl}`,
    `gmb_url: ${p.gmbUrl}`,
    `gmb_cid: ${p.cid}`,
    "GMB data (verified — use exactly):",
    `- Business name: ${p.businessName}`,
    `- Address: ${p.street}, ${p.city}, ${p.state} ${p.zip}`,
    `- County: ${p.county}`,
    `- Phone: ${p.phone}`,
    `- Neighborhoods: ${p.neighborhoods.join(", ")}`,
    `- Landmark: ${p.landmark}`,
    `- Coordinates: ${p.lat}, ${p.lng}`,
    `- Hours: ${p.hours}`,
  ].join("\n");
}

/**
 * Project a full {@link GmbProfile} down to the {@link PromptGmb} subset the
 * build/seo/verify prompts consume (NAP + hours + CID + map). Centralised so the
 * run + produce paths map a profile the same way.
 */
export function promptGmbFrom(p: GmbProfile): PromptGmb {
  return {
    businessName: p.businessName,
    street: p.street,
    zip: p.zip,
    phone: p.phone,
    hours: p.hours,
    cid: p.cid,
    gmbUrl: p.gmbUrl,
  };
}

/**
 * Build schema.org `openingHoursSpecification` entries from structured day
 * hours. Closed days are omitted; "Open 24 hours" days are emitted as
 * 00:00–23:59. Returns [] when no structured hours are available.
 */
export function openingHoursSpecification(
  hours: DayHours[] | undefined,
): Array<Record<string, unknown>> {
  if (!hours || hours.length === 0) return [];
  return hours
    .filter((h) => !h.closed)
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${h.day}`,
      opens: h.open24 ? "00:00" : (h.opens ?? "00:00"),
      closes: h.open24 ? "23:59" : (h.closes ?? "23:59"),
    }));
}

/**
 * GMB-aware deterministic LocalBusiness JSON-LD for the enriched scenario.
 * Mirrors `generateLocalBusinessSchema` but, because this scenario has a GMB
 * block, it can emit the full PostalAddress (street + ZIP), the verified CID
 * identifier, telephone, geo coordinates and a `hasMap`/`sameAs` ?cid= URL —
 * exactly what a HUB/GMB schema carries that a No-GMB spoke schema cannot.
 * Still deterministic and identical across models, so it is not a model
 * differentiator.
 */
export function generateGmbSchema(ctx: RunContext, p: GmbProfile): string {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    // Most-specific-first: a recycling center IS a local business.
    "@type": ["RecyclingCenter", "LocalBusiness"],
    name: p.businessName,
    url: p.pageUrl,
    identifier: p.cid,
    telephone: p.phone,
    areaServed: { "@type": "City", name: p.city },
    address: {
      "@type": "PostalAddress",
      streetAddress: p.street,
      addressLocality: p.city,
      addressRegion: p.state,
      postalCode: p.zip,
      addressCountry: "US",
    },
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    hasMap: p.gmbUrl,
    sameAs: [p.gmbUrl],
    makesOffer: ctx.registry.sacredLinks.map((l) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: l.label, url: l.url },
    })),
  };
  const spec = openingHoursSpecification(p.openingHours);
  if (spec.length > 0) schema.openingHoursSpecification = spec;
  return JSON.stringify(schema, null, 2);
}

/**
 * No-GMB deterministic schema for the bake-off, BAKE-OFF ONLY.
 *
 * Wraps the production city/state `generateLocalBusinessSchema` (the source of
 * truth, left untouched in `lib/mc-core`) and adds ONLY a `telephone` set to the
 * STS HQ backup line. There is still NO `streetAddress`, NO `postalCode`, NO
 * CID/identifier, and NO `hasMap` — those remain GMB-only. This is what the
 * No-GMB scenario's `schemaFn` emits so the schema turn carries the HQ phone.
 */
export function generateNoGmbSchema(ctx: RunContext): string {
  const base = JSON.parse(generateLocalBusinessSchema(ctx)) as Record<string, unknown>;
  const withPhone = {
    "@context": base["@context"],
    "@type": base["@type"],
    name: base.name,
    url: base.url,
    telephone: HQ_PHONE,
    areaServed: base.areaServed,
    address: base.address,
    makesOffer: base.makesOffer,
  };
  return JSON.stringify(withPhone, null, 2);
}
