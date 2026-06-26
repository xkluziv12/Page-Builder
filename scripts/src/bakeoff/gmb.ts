import { generateLocalBusinessSchema, type RunContext } from "@workspace/mc-core";
import { HQ_PHONE } from "./miniPrompts.js";

/**
 * The "GMB-enriched" scenario for the bake-off.
 *
 * In the production (No-GMB) context, the run context deliberately omits an
 * explicit page_url and any Google Business Profile (GMB) data — STS spoke
 * pages target a service-area city, not a verified physical storefront. Three
 * of the four models build anyway under that context; GPT refused, asking for
 * the page_url + GMB block before it would build.
 *
 * This module supplies a SECOND, symmetric experiment: hand EVERY model the
 * exact same enriched context (explicit page_url + a GMB data block) so we can
 * see whether the refusing model builds well once given the inputs it demands —
 * a fair re-run, not an OpenAI-only prompt hack.
 *
 * The GMB values below are EXPERIMENTAL / illustrative for this comparison, not
 * verified ground truth. They are labelled as such in the context block so the
 * fail-loud / no-fabrication convention is respected: the experiment measures
 * build behaviour given a well-formed GMB block, it does not assert these are
 * STS's real verified location details. The phone uses the reserved-fictional
 * 555-01xx range; the CID and street address are placeholders.
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
  hours: string;
}

export const BILLINGS_GMB: GmbProfile = {
  pageUrl: "https://www.stselectronicrecyclinginc.com/billings-mt",
  gmbUrl: "https://www.google.com/maps?cid=12127465100000000000",
  cid: "cid:12127465100000000000",
  businessName: "STS Electronic Recycling — Billings",
  street: "1234 Industrial Ave",
  city: "Billings",
  state: "MT",
  zip: "59101",
  county: "Yellowstone County",
  phone: "(406) 555-0142",
  neighborhoods: ["Downtown Billings", "Billings Heights", "West End"],
  landmark: "near Billings Logan International Airport",
  lat: 45.7833,
  lng: -108.5007,
  hours: "Mon-Fri 8:00-17:00",
};

/**
 * Resolve the GMB block for a GMB-scenario run against a given target. Defaults
 * to the illustrative {@link BILLINGS_GMB} ONLY for the Billings smoke target;
 * for any OTHER city a verified block MUST be supplied via `BAKEOFF_GMB_JSON`
 * (fail loud — never invent a CID, street address, or phone for a real page).
 */
export function resolveGmbProfile(target: { city: string; state: string }): GmbProfile {
  const raw = process.env.BAKEOFF_GMB_JSON;
  if (!raw) {
    const isBillings =
      target.city.toLowerCase() === "billings" && target.state.toUpperCase() === "MT";
    if (!isBillings) {
      throw new Error(
        `GMB scenario for ${target.city}, ${target.state} requires a verified GMB block. ` +
          `Set BAKEOFF_GMB_JSON to a JSON object with: pageUrl, gmbUrl, cid, businessName, street, ` +
          `city, state, zip, county, phone, landmark, lat, lng, hours (neighborhoods optional). ` +
          `Never invent a CID/address/phone for a real page.`,
      );
    }
    return BILLINGS_GMB;
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
  };
}

/**
 * The enriched-context suffix appended AFTER the production `describeContext`
 * output. It is added only inside the harness — the shipped `describeContext`
 * prod path is never modified — so the No-GMB scenario stays a faithful
 * reproduction of production while this scenario adds the explicit page_url +
 * GMB block on top.
 */
export function gmbContextSuffix(p: GmbProfile): string {
  return [
    "",
    "",
    "[EXPERIMENTAL ENRICHED CONTEXT — explicit page_url + Google Business Profile (GMB) block.",
    "These GMB details are illustrative inputs for a fair, symmetric re-run comparison, NOT verified",
    "ground-truth location data. Every model in this scenario receives this identical block.]",
    "",
    `page_url: ${p.pageUrl}`,
    `gmb_url: ${p.gmbUrl}`,
    `gmb_cid: ${p.cid}`,
    "GMB data:",
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
 * GMB-aware deterministic LocalBusiness JSON-LD for the enriched scenario.
 * Mirrors `generateLocalBusinessSchema` but, because this scenario has a GMB
 * block, it can emit the full PostalAddress (street + ZIP), the verified CID
 * identifier, telephone, geo coordinates and a `hasMap`/`sameAs` ?cid= URL —
 * exactly what a HUB/GMB schema carries that a No-GMB spoke schema cannot.
 * Still deterministic and identical across models, so it is not a model
 * differentiator.
 */
export function generateGmbSchema(ctx: RunContext, p: GmbProfile): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
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
