import { generateLocalBusinessSchema, type RunContext } from "@workspace/mc-core";
import { HQ_PHONE, type PromptGmb } from "./miniPrompts.js";

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
 * {@link BILLINGS_GMB} below is the built-in SAMPLE target only (the Billings
 * smoke run), and uses the reserved-fictional 555-01xx phone range plus a
 * placeholder CID/street. The fail-loud / no-fabrication convention is enforced
 * in {@link resolveGmbProfile}: a real (non-sample) target with a missing GMB
 * field fails loudly rather than inventing location data.
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

/**
 * Built-in SAMPLE GMB target — the Billings, MT smoke run only. A real run
 * supplies its own verified block via `BAKEOFF_GMB_JSON`; these values are NOT
 * STS's real location data (reserved-fictional 555-01xx phone, placeholder CID +
 * street), so they are safe defaults for the wiring/smoke path without asserting
 * a fabricated verified profile for any live page.
 */
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
