# Page Factory handoff: the Precision E-Cycle output contract

For whoever builds the Replit/React target adapter. Everything here is copied
from the live repo `xkluziv12/precision-ecycle-platform`, branch
`claude/st-louis-planning-page`, not from memory. A worked reference record is
at the end.

## 0. The short version

The final pipeline stage must NOT emit HTML or JSX. It emits **one JSON object
conforming to the `CityData` type below**. A deterministic code step then writes
that record plus five small registry entries into the app. The existing shared
React template renders it.

This is not a style preference. Every risk in "a model writes markup" (duplicated
nav, disconnected forms, missed canonical, bypassed schema graph, lost test IDs,
broken responsive behaviour) disappears when the model's output is data that can
be schema-checked before it touches the app. The template already owns design
system, navigation, responsive layout, and the JSON-LD graph.

Proven: a St. Louis page was built this way and passed every gate. 2,472 visible
words against a 1,500 floor.

## 1. The type the model must produce

Verbatim from `artifacts/precision-ecycle/src/pages/_cityData.ts`:

```ts
export interface Industry {
  title: string;
  compliance: string;
  desc: string;
  accent: boolean;
  href: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

/**
 * A named deep-content section rendered between the process grid and the
 * data-destruction band on a city hub.
 *
 * This is the same contract already in production on service spokes
 * (`CityServiceExpandedSection` in _cityServiceData.ts, rendered by
 * CityServicePage.tsx). It is reused here rather than reinvented so that hub
 * and spoke share one depth mechanism.
 *
 * The three-part contract each city should follow:
 *   1. Compliance framework portable across cities, low uniqueness
 *   2. Local market named institutions, HIGH uniqueness
 *   3. Logistics/operations semi-portable
 */
export interface CityExpandedSection {
  heading: string;
  paragraphs: string[];
}

/** R06 ProcessSteps. One numbered step in the "how it works" grid. */
export interface CityProcessStep {
  number: string;
  title: string;
  desc: string;
}

/**
 * R08 ComplianceBlock. One certification card. The accent colour is owned by
 * the template and applied by index, so the data layer carries no styling.
 */
export interface CityCertification {
  cert: string;
  desc: string;
}

export interface CityData {
  city: string;
  state: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  heroImage: string;
  heroBadge: string;
  heroLine1: string;
  heroLine2: string;
  heroLine3: string;
  heroSubheadline: string;
  servicesHeading: string;
  cityIntroP1: string;
  cityIntroP2: string;
  industries: Industry[];
  equipmentHeading?: string;
  industriesHeading?: string;
  aboutCityHeading: string;
  aboutCityP1: string;
  aboutCityP2: string;
  aboutCityP3: string;
  serviceAreas: string[];
  serviceAreaLabel?: string;
  serviceAreaTitle?: string;
  faqs: FAQ[];
  faqHeading?: string;
  phone: string;
  /**
   * A city research page may be discoverable before its operational service
   * model is approved. These pages must not borrow facility, pickup, or
   * service-area claims from active markets.
   */
  availabilityConfirmationRequired?: boolean;
  heroAlt?: string;
  bandImage?: string;
  bandAlt?: string;
  techImage?: string;
  techAlt?: string;

  // ─── Named section content slots ────────────────────────────────────────
  // Every field below is OPTIONAL by design. When a city has not supplied
  // its own copy the template falls back to the shared default, so adding a
  // slot never breaks a city that has not been migrated yet. The goal is
  // that a fully migrated city supplies all of them and shares no visible
  // prose with any other city.
  //
  // Migration status is tracked per city; Lincoln is the reference build.

  /** R06 ProcessSteps. Falls back to DEFAULT_PROCESS_STEPS. */
  processSteps?: CityProcessStep[];

  /** R07 DataDestructionBand caption. Falls back to the shared default. */
  bandEyebrow?: string;
  bandHeading?: string;
  bandBody?: string;

  /** R08 ComplianceBlock. Falls back to the shared defaults.
   *  complianceParagraphs is the single biggest source of duplicate content
   *  across city pages: the shared default runs roughly 130 words and is
   *  byte-identical on every city that has not been migrated. */
  complianceHeading?: string;
  complianceParagraphs?: string[];
  certifications?: CityCertification[];

  /** Deep content sections rendered after the process grid. See
   *  CityExpandedSection for the three-part contract. Omitted entirely on
   *  cities that have not been migrated, in which case the row does not
   *  render at all. */
  expandedSections?: CityExpandedSection[];
  // ────────────────────────────────────────────────────────────────────────

  // Physical address. Only set when the city has a confirmed drop-off location.
  // For spoke cities, leave undefined until a Regus/co-working lease is signed.
  address?: string;
  hasDropoff: boolean;
  mapQuery?: string;
  // Hub+spoke placeholder. Populate when a local Regus or co-working lease is confirmed.
  // futureAddress is the planned local address for this market.
  // futureMapQuery is the Google Maps embed query string for that address.
  futureAddress?: string;
  futureMapQuery?: string;
  // Verified Google Business listing for a hub market (Regus-lease model).
  // Distinct from hasDropoff (public walk-in). When set, the page emits a full
  // PostalAddress + geo + hasMap/sameAs in schema, shows the confirmed address
  // on the map, and links to the verified listing by decimal CID.
  listing?: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    /** Decimal Google CID, when a verified listing's CID is known. Optional:
     *  when absent, the map embed falls back to an address query and schema
     *  emits hasMap from the address-query mapsUrl without sameAs. */
    cid?: string;
    mapsUrl: string;
  };
}
```

Notes that are not in the type:

- `availabilityConfirmationRequired: true` is the PLANNING-MARKET switch. It
  changes hero copy, badges, CTA behaviour, and map framing across the template.
  Set it for any city that is not an operator-confirmed service metro.
- `heroLine1/2/3` are three separate lines of the H1 block, not a sentence.
- `industries[].compliance` is a SHORT BADGE (2 to 5 words, e.g.
  "HIPAA / PHI Records"), not a paragraph.
- `expandedSections[].paragraphs` is `string[]`. There is no block model here.
  Any list content must be written as prose sentences, one idea per sentence.
- `phone` should reference `siteConfig.contact.phonePrimary`, never a literal.

## 2. Hard count contracts

The model's output is rejected unless:

| Field | Exact requirement |
| --- | --- |
| `faqs` | exactly 8 |
| `industries` | exactly 4 |
| `processSteps` | exactly 4 |
| `expandedSections` | exactly 3 |
| `complianceParagraphs` | exactly 3 |
| visible words | at least 1500 (T1 hub floor, enforced by validate-seo) |
| `seoTitle` | at most 70 chars |
| `seoDescription` | 140 to 160 chars |

Enforce these in CODE before the record is accepted. Do not ask a model to
self-check counts.

## 3. Editorial rules that are enforced

- No em dashes or en dashes anywhere. Rewrite the sentence.
- No emoji.
- No sentence over 35 words. This one bites: the reference record needed five
  sentences split, and two of them were introduced while flattening list
  content into prose.
- No prices, dollar amounts, or rate comparisons on any visible surface.
- No operational thresholds or timeframes: device minimums, volume cutoffs,
  turnaround windows, response times.
- Named organizations may appear as MARKET CONTEXT only. The only four
  nameable clients are Bryan Health, University of Nebraska-Lincoln, Lincoln
  Public Schools, Nelnet. Anything else needs an explicit disclaimer sentence
  attached.
- Any statute or regulation claim needs a primary government source. No source,
  omit the claim.

### Credential phrasing, by tier

This is the rule a generic quality rubric will not catch:

| Credential | Tier | Allowed | Never |
| --- | --- | --- | --- |
| ISO/IEC 27001:2022, ISO 14001, ISO 9001:2015, ISO 45001:2018 | HELD | "ISO 27001 certified" | -- |
| NIST SP 800-88 | conformed to | "informed by", "aligned with", "compliant with" | "NIST certified" |
| R2 | downstream only | "routed through R2-certified processors" | "R2 certified", "our R2-certified facility" |
| HIPAA | aligned | "HIPAA-aligned" | "HIPAA compliant", "HIPAA certified" |
| NAID AAA, e-Stewards, SERI, RIOS | NOT HELD | nothing | must never appear at all |

### Planning-market language

For any city with `availabilityConfirmationRequired: true`, these must never
appear: "our <city> facility", "<city> location", "located in <city>", "drop-off
in <city>", "pickup in <city>", "we serve <city>", "service area", "service
radius". Approved framing is "project review" and "planning".

## 4. Business facts

All canonical values live in `artifacts/precision-ecycle/src/lib/siteConfig.ts`.
The adapter should reference that module, not copy values.

- Company: Precision E-Cycle, founded 2018, https://precisionecycle.com
- Phone: 402-540-6965 (primary), 402-243-6922 (secondary)
- Email: info@precisionecycle.com
- Address: 4100 Industrial Ave STE D, Lincoln, NE 68504
- Hours: Mon-Fri, 8:00 AM - 5:00 PM. Saturday and Sunday must NOT appear in schema.
- Confirmed service metros (7): Lincoln NE, Omaha NE, Kansas City MO, Overland
  Park KS, Des Moines IA, Chicago IL, Denver CO. Chicago mobile shredding needs
  per-engagement confirmation.
- Everything else is a PLANNING market.
- Services (7 canonical): itad, computer-recycling, server-disposal,
  data-destruction, on-site-destruction, it-asset-liquidation,
  data-center-decommissioning
- Held certifications: ISO/IEC 27001:2022 (cert 59247188219687), ISO 14001:2026
  (48669488322465), ISO 9001:2015 (11323005267121), ISO 45001:2018
  (56838075233879). All issued by SkillFront LLC.
- Reviews: 35 verified.

Fuller operator fact file: `prompts/precision-ecycle/client-config.json`.

## 5. What the deterministic write step does

Six files. The first is the record; the other five are one-line registry entries.

| # | File | What to add |
| --- | --- | --- |
| 1 | `artifacts/precision-ecycle/src/pages/_cityData.ts` | the record, keyed by slug, before the closing `};` |
| 2 | `artifacts/precision-ecycle/src/lib/pageMeta.ts` | `\| "/locations/<slug>"` in the route union, AND a meta entry {title, description, image, background, hasFAQSchema: true} |
| 3 | `artifacts/precision-ecycle/src/pages/Locations.tsx` | a card object in the locations array |
| 4 | `artifacts/precision-ecycle/src/components/shared/FloatingCallButton.tsx` | `"/locations/<slug>"` in `requiresAvailabilityConfirmation` (planning markets only) |
| 5 | `artifacts/precision-ecycle/src/components/ServiceAreaMap.tsx` | a marker {slug, city, state, kind: "planning"\|"hub", x, y, haloR, href, tagline} |
| 6 | `artifacts/precision-ecycle/public/sitemap.xml` | regenerate, do not hand-edit |

No new route is needed. `/locations/:slug` already resolves any slug present in
`cityData`. No new component. No new page file.

Reusable OG assets exist so a new city needs no image generation to pass gates:
`image: "/images/og-locations.png"`, `background: "locations-hero.png"`,
`heroImage: "/images/locations-hero.png"`.

## 6. Verification, in order

```bash
pnpm run typecheck
pnpm --filter @workspace/scripts run generate-sitemap
pnpm --filter @workspace/scripts run scrub-check
pnpm --filter @workspace/scripts run compliance-check
pnpm --filter @workspace/scripts run validate-og
pnpm --filter @workspace/scripts run image-meta-check
pnpm --filter @workspace/scripts run validate-seo --only /locations/<slug>
pnpm --filter @workspace/scripts run schema-graph-check --only /locations/<slug>
```

The last two boot a browser and render the real route. They are the ones that
matter. Note: `attached_assets/` is gitignored and `Navbar.tsx` imports a logo
from it, so on a checkout without that file the app renders blank and every
browser gate fails for an unrelated reason. Stub the file locally if needed.

## 7. Worked reference: the St. Louis record

This exact object is live on branch `claude/st-louis-planning-page` and passes
every gate above. Use it as the shape the model must match. It is a PLANNING
market, so it is the stricter of the two cases.

```json
{
  "city": "St. Louis",
  "state": "Missouri",
  "slug": "st-louis",
  "seoTitle": "St. Louis ITAD Planning Resource | Precision E-Cycle",
  "seoDescription": "A St. Louis ITAD planning resource covering electronics documentation, data-security review, and project handoff questions for Missouri organizations.",
  "heroImage": "/images/locations-hero.png",
  "heroAlt": "Retired business computers and servers staged for documented IT asset disposition planning",
  "heroBadge": "St. Louis, MO. ITAD Planning Resource.",
  "heroLine1": "Electronics Recycling",
  "heroLine2": "St. Louis, Missouri.",
  "heroLine3": "Plan With Confidence.",
  "heroSubheadline": "St. Louis planning starts with local sector context, clear asset records, Missouri disposal review, data-security questions, and a documented project handoff for organizations evaluating electronics retirement across clinical, corporate, research, and public environments.",
  "servicesHeading": "Electronics Recycling Planning for St. Louis Organizations",
  "cityIntroP1": "St. Louis organizations planning an electronics disposition project face a distinctive mix of healthcare, academic medicine, aerospace, geospatial intelligence, financial services, and industrial technology. The region’s Central West End, Midtown, Clayton, West County, and North St. Louis corridors connect clinical, corporate, research, and public-sector environments with different records, approval paths, and handoff requirements for retiring equipment.",
  "cityIntroP2": "Missouri planning begins with the organization’s inventory, data classification, custody records, and disposition approvals. MDNR guidance and Missouri law identify restrictions for certain hazardous electronics handled by businesses, schools, nonprofits, churches, and public agencies. Separately, RSMo § 407.1500 addresses notice duties after qualifying breaches involving unencrypted personal information belonging to Missouri residents.",
  "industries": [
    {
      "title": "Healthcare and Academic Medicine",
      "compliance": "HIPAA / PHI Records",
      "desc": "St. Louis healthcare and academic medicine span hospitals, clinics, laboratories, teaching programs, and corporate offices. A useful planning inventory separates endpoint devices, network equipment, storage media, clinical systems, and peripherals by owner and location. It also identifies which records require privacy review, departmental approval, retention checks, or a documented handoff before equipment leaves internal control.",
      "accent": true,
      "href": "/industries/medical"
    },
    {
      "title": "Financial Services",
      "compliance": "GLBA / RSMo 407.1500",
      "desc": "Clayton’s corporate center and the wider St. Louis economy include financial and executive operations. Planning teams can separate employee endpoints, branch or office equipment, servers, removable media, and printed records. The inventory should identify data owners, disposition approvals, evidence expectations, and any hold that could pause retirement until internal review is complete.",
      "accent": true,
      "href": "/industries/finance"
    },
    {
      "title": "Government and Defense",
      "compliance": "Missouri MDNR / RSMo 260",
      "desc": "St. Louis public-sector planning can involve municipal administration, federal presence, defense context, and regional infrastructure. Separate government-owned assets from contractor or tenant equipment, then record ownership, authorization, custody, data category, and destination review. North St. Louis and the Downtown commercial core illustrate why one project may involve several administrative stakeholders.",
      "accent": false,
      "href": "/industries/government"
    },
    {
      "title": "Education and Research",
      "compliance": "FERPA / Research Data",
      "desc": "Washington University in St. Louis, Saint Louis University, and UMSL create varied research and academic environments. Planning should distinguish institution-owned assets, grant-funded equipment, laboratory systems, student devices, and shared infrastructure. A useful handoff packet can pair asset records with data review status, approvals, exceptions, and receiving-party information for each campus group.",
      "accent": false,
      "href": "/industries/education"
    }
  ],
  "aboutCityHeading": "St. Louis Context for IT Asset Retirement",
  "aboutCityP1": "St. Louis combines specialized research and production settings in a compact regional economy. The Cortex Innovation Community links bioscience and technology activity with academic medicine, while the 39 North corridor centers plant science and agricultural technology. Clayton, Chesterfield Valley, and the Spirit of St. Louis Corridor add financial, executive, corporate, distribution, and technology environments to the planning picture.",
  "aboutCityP2": "Healthcare and academic medicine are the dominant local context for ITAD planning. BJC HealthCare, SSM Health, Mercy Health, Washington University in St. Louis, Saint Louis University, and University of Missouri St. Louis represent varied clinical, research, teaching, and administrative environments. Each setting can involve different ownership records, data classifications, approvals, and equipment retirement documentation. These organizations are named as market context only, not as Precision E-Cycle clients or partners.",
  "aboutCityP3": "St. Louis also has aerospace, defense, geospatial, finance, agribusiness, and industrial technology context. Boeing Defense, Space & Security, the National Geospatial-Intelligence Agency West, Edward Jones, Emerson Electric Co., Bayer Crop Science, and Bunge Global SA all operate in the region. That range is why a project brief may need to separate controlled information, business records, research data, and ordinary equipment. They are named as market context only, not as clients or partners.",
  "serviceAreas": [
    "St. Louis",
    "St. Louis County"
  ],
  "serviceAreaLabel": "St. Louis Planning Context",
  "faqs": [
    {
      "question": "What should St. Louis organizations document before an ITAD review?",
      "answer": "St. Louis organizations should document assets, ownership, data categories, approvals, custody, and intended disposition questions before an ITAD review. Start with a list that connects identifiers to departments, facilities, custodians, and known data-bearing components. Then separate confirmed facts from unknowns, exceptions, retention holds, leases, grants, or ownership issues. This gives security, legal, facilities, finance, and department reviewers a shared record without assuming a local operating relationship or a predetermined project outcome."
    },
    {
      "question": "Does Missouri restrict electronics disposal for St. Louis businesses?",
      "answer": "Yes, Missouri MDNR states that businesses, schools, nonprofits, churches, and public or governmental agencies cannot legally discard certain hazardous electronics in Missouri landfills. The cited framework includes RSMo §§ 260.1050 to 260.1101 and 10 CSR 25-19.010. A St. Louis organization should identify which rule applies to its equipment and retain the review record. The brief also cites Missouri hazardous waste provisions at RSMo §§ 260.350 to 260.430, so responsible personnel should verify requirements with the appropriate authority."
    },
    {
      "question": "What does Missouri breach law mean for retired St. Louis devices?",
      "answer": "Missouri breach law can make retired devices part of a security review when they contain unencrypted personal information covered by RSMo § 407.1500. The statute addresses notice to affected consumers without unreasonable delay after discovery of a qualifying breach. For St. Louis projects, review questions should cover names, identifiers, financial credentials, medical information, encryption status, custody, and escalation ownership. If more than 1,000 Missouri residents are affected at one time, the brief says the Missouri Attorney General must also receive notice without unreasonable delay."
    },
    {
      "question": "How should St. Louis healthcare teams organize retired equipment records?",
      "answer": "St. Louis healthcare teams should organize retired equipment records by owner, clinical or administrative setting, data category, custodian, approval, and disposition decision. Separate hospitals, clinics, laboratories, teaching programs, and shared services when their controls or records differ. A useful packet can connect asset identifiers with department review, retention questions, exceptions, and evidence expectations. BJC HealthCare, SSM Health, Mercy Health, and Washington University in St. Louis appear in the brief as market context only, not as Precision E-Cycle clients or partners."
    },
    {
      "question": "Can universities combine laboratory and administrative equipment inventories?",
      "answer": "Universities can combine inventories for oversight, but St. Louis institutions should preserve distinctions between laboratory, clinical, teaching, residence, and administrative equipment. Different owners, grants, retention needs, and data environments can change the review questions for each group. Use shared fields for identifiers, ownership, custodian, approval, and disposition status, then add campus-specific notes. Washington University in St. Louis, Saint Louis University, and UMSL are named in the brief as local market context, not as client or relationship references."
    },
    {
      "question": "What should financial organizations review before retiring data-bearing equipment?",
      "answer": "Financial organizations should review ownership, encryption status, data categories, custody, retention, approval, and breach escalation before retiring data-bearing equipment. For St. Louis operations, include Missouri resident information in the review where applicable. RSMo § 407.1500 addresses notice after discovery of a qualifying breach involving unencrypted personal information. Edward Jones is included in the brief as regional market context only, so this planning resource does not infer any relationship, project, or shared process."
    },
    {
      "question": "Does this page confirm Precision E-Cycle operations in St. Louis?",
      "answer": "No, this page does not confirm Precision E-Cycle operations in St. Louis. The market status is planning, and the permitted logistics status is project review, so the record should be read as preparation guidance rather than confirmation of local availability. For project review questions, Precision E-Cycle lists 402-540-6965, 4100 Industrial Ave STE D, Lincoln, NE 68504, and Monday through Friday hours from 8:00 AM to 5:00 PM. Those company facts do not establish St. Louis operations."
    },
    {
      "question": "How can a St. Louis organization begin a project review conversation?",
      "answer": "A St. Louis organization can begin by contacting Precision E-Cycle with its inventory outline, data review questions, ownership details, and documentation needs. The purpose of the conversation is project review, not an assumption that a local service arrangement already exists. Use 402-540-6965 or the listed Lincoln address, 4100 Industrial Ave STE D, Lincoln, NE 68504, during Monday through Friday hours from 8:00 AM to 5:00 PM. Keep legal interpretations with the organization’s counsel or responsible authority."
    }
  ],
  "faqHeading": "St. Louis Electronics Recycling and ITAD: Common Questions",
  "phone": "402-540-6965",
  "hasDropoff": false,
  "availabilityConfirmationRequired": true,
  "processSteps": [
    {
      "number": "01",
      "title": "Contact and Scope",
      "desc": "Reach us by phone or the contact form to describe the equipment categories, data sensitivity, and documentation requirements. The team can review whether a project is a potential operational fit. This inquiry does not establish local service, a pickup date, or a facility relationship."
    },
    {
      "number": "02",
      "title": "Serial-Level Intake",
      "desc": "If a project is approved, the agreed intake record should identify the assets and custody expectations before equipment changes hands. Confirm the exact fields, locations, and signing process in the written scope rather than assuming a standard local workflow."
    },
    {
      "number": "03",
      "title": "NIST 800-88 Sanitization",
      "desc": "Review the available sanitization approach against your policy and media types. NIST 800-88 describes Clear, Purge, and Destroy methods, but the appropriate method and any service capability must be confirmed in the project scope before equipment is released."
    },
    {
      "number": "04",
      "title": "Certificate and Downstream",
      "desc": "Ask for the proposed documentation set, including asset manifest, destruction evidence, and downstream records where applicable. Confirm the records that will be provided and the party responsible for each step before committing to a disposition project."
    }
  ],
  "bandEyebrow": "Documented Data Destruction Planning",
  "bandHeading": "Hard Drive Destruction Planning for St. Louis Organizations",
  "bandBody": "A planning discussion should match your media types, internal controls, and documentation requirements to a proposed sanitization approach. Availability for any method or logistics arrangement must be confirmed in writing before a St. Louis project proceeds.",
  "complianceHeading": "Compliance Frameworks Relevant to St. Louis Organizations",
  "complianceParagraphs": [
    "St. Louis organizations should begin with their own data classifications, records schedules, contracts, grant conditions, and information-security policies, then confirm any applicable legal requirements with qualified counsel. Missouri MDNR guidance identifies restrictions on landfilling certain hazardous electronics for businesses, schools, nonprofits, churches, and public agencies; data-handling duties are a separate question. Neither should be inferred from a generic city page.",
    "Precision E-Cycle does not hold R2 facility certification. That certification sits with the downstream vendors who receive our recovered material, and their R2 status requires independent third-party auditing, verified downstream tracking, and continuous environmental health and safety review. The distinction matters because downstream tracking is where material has historically entered unregulated markets, and the R2 requirement at the downstream processor level is precisely the control designed to prevent that. Our ISO 27001:2022 certification, certificate number 59247188219687, applies to our information security management system. Our ISO 14001 certification, certificate number 48669488322465, applies to our environmental management practices. Neither substitutes for R2 at the facility level, and we describe them accurately.",
    "NIST Special Publication 800-88 defines three sanitization tiers: Clear, Purge, and Destroy. For a proposed St. Louis project, the organization should match its media types and internal policy to an acceptable method, then ask a prospective provider to confirm capability and evidence in writing. Solid-state media may require a different approach from magnetic drives because wear-leveling can make a standard overwrite unreliable. No method, certificate format, or local processing arrangement is promised by this planning page."
  ],
  "expandedSections": [
    {
      "heading": "What St. Louis Organizations Should Document",
      "paragraphs": [
        "St. Louis project planning starts with a defensible picture of what exists, who controls it, and what information may remain on it. That picture matters across Central West End medical campuses, Downtown offices, Clayton headquarters, research facilities, and public agencies, where equipment ownership and approval paths may differ.",
        "A useful record has four parts. Asset identity: manufacturer, model, serial number, asset tag, device type, and known data-bearing components. Custody: the department, physical custodian, owner, facility, and person responsible for authorization. Data review: data categories, encryption questions, retention holds, and security review status. Disposition evidence: approval records, custody documentation, exceptions, and the evidence expected for the final decision.",
        "Missouri’s cited electronics framework makes the disposal route part of the record for certain organizations. MDNR states that businesses, schools, nonprofits, churches, and public or governmental agencies cannot legally discard certain hazardous electronics in Missouri landfills. A planning file should preserve the applicable rule reference and internal approval.",
        "For data-bearing equipment, St. Louis teams should separate factual documentation from legal conclusions. RSMo § 407.1500 addresses notice duties after qualifying breaches involving unencrypted personal information, including specified identity, financial, and medical data combinations. The project record can show review questions, owners, decisions, and escalation points.",
        "This page is a planning resource. It is not confirmation of operations in St. Louis, and it is not a substitute for counsel."
      ]
    },
    {
      "heading": "The Local Refresh Cycle and Its Sectors",
      "paragraphs": [
        "St. Louis refresh pressure follows the region’s economic mix rather than one uniform equipment cycle. Hospitals and academic medicine generate clinical and administrative inventories, while aerospace, geospatial, finance, plant science, and industrial corridors add controlled workspaces, research environments, offices, and technical systems to the planning landscape.",
        "Four groups tend to appear in a St. Louis inventory. Healthcare and academic medicine contribute clinical, research, teaching, and administrative device groups. Aerospace and geospatial work brings production, engineering, security, and public-sector stakeholders. Finance and corporate offices add endpoints, branch systems, records, and approval owners. Plant science and industrial technology contribute laboratories, offices, instrumentation, and shared infrastructure.",
        "Named employers in the brief illustrate the range without establishing any Precision E-Cycle relationship. BJC HealthCare, Washington University in St. Louis, Boeing Defense, Space & Security, Edward Jones, and Emerson Electric Co. occupy different operational contexts. A St. Louis project brief should therefore avoid treating every asset group as one inventory.",
        "Refresh planning becomes clearer when departments identify the event driving retirement. Examples include a clinical platform change, laboratory renovation, office consolidation, research grant closeout, equipment replacement, or ownership transfer. Each event can produce different approvers, records, exceptions, and sequencing dependencies, which should be documented before a handoff is arranged.",
        "Use local context to shape questions, not to assume a common workflow. A healthcare campus, a defense setting, a university laboratory, and a corporate office may require different reviews even when the hardware looks similar."
      ]
    },
    {
      "heading": "How a Project Is Prepared and Handed Off",
      "paragraphs": [
        "An organized St. Louis project review can begin with a site and asset map, then move through data review, authorization, custody planning, and evidence requirements. The sequence should reflect the organization’s own controls, especially when equipment crosses clinical, research, corporate, public, or contractor boundaries.",
        "Project review checklist. Before discussing a handoff, assemble the records that let reviewers test scope and responsibility. Keep source documents together, mark unknowns clearly, and distinguish confirmed facts from assumptions about ownership, data, condition, destination, or downstream processing.",
        "The checklist itself is short. List the facilities, departments, asset owners, and physical custodians. Record device types, identifiers, quantities, and known data-bearing components. Flag retention holds, investigations, leases, grants, and ownership exceptions. Define approval roles for security, legal, facilities, finance, and department leaders. Specify the evidence expected for each disposition decision and custody transfer.",
        "For St. Louis organizations considering project review with Precision E-Cycle, the useful starting packet is the organization's own inventory and questions. Precision E-Cycle can be reached at 402-540-6965, 4100 Industrial Ave STE D, Lincoln, NE 68504, Monday through Friday, 8:00 AM to 5:00 PM. Those company facts do not establish St. Louis operations.",
        "Contact for project review is the intended next step. Confirm scope, documentation expectations, and any location-specific questions before treating a plan as approved."
      ]
    }
  ]
}
```
