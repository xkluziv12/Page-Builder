import { z } from "zod";

/**
 * Zod mirror of the verbatim `CityData` TypeScript interface in section 1 of
 * `docs/precision-ecycle-page-factory-output-contract.md` (which is itself
 * copied from `artifacts/precision-ecycle/src/pages/_cityData.ts`).
 *
 * Field for field, same optionality. Counts, editorial rules, and credential
 * phrasing are NOT enforced here — they live in `validate.ts`, driven by
 * `prompt-pack/gate.config.json`, so the shape check and the contract check
 * stay separable.
 *
 * `.strict()` on the root: an invented field is a contract violation, not a
 * harmless extra, because the deterministic write step copies the record into
 * `_cityData.ts` where an unknown key would not typecheck.
 */

const nonEmpty = z.string().min(1);

export const industrySchema = z
  .object({
    title: nonEmpty,
    compliance: nonEmpty,
    desc: nonEmpty,
    accent: z.boolean(),
    href: nonEmpty,
  })
  .strict();

export const faqSchema = z
  .object({
    question: nonEmpty,
    answer: nonEmpty,
  })
  .strict();

export const cityExpandedSectionSchema = z
  .object({
    heading: nonEmpty,
    paragraphs: z.array(nonEmpty),
  })
  .strict();

export const cityProcessStepSchema = z
  .object({
    number: nonEmpty,
    title: nonEmpty,
    desc: nonEmpty,
  })
  .strict();

export const cityCertificationSchema = z
  .object({
    cert: nonEmpty,
    desc: nonEmpty,
  })
  .strict();

export const listingSchema = z
  .object({
    streetAddress: nonEmpty,
    addressLocality: nonEmpty,
    addressRegion: nonEmpty,
    postalCode: nonEmpty,
    cid: nonEmpty.optional(),
    mapsUrl: nonEmpty,
  })
  .strict();

export const cityDataSchema = z
  .object({
    city: nonEmpty,
    state: nonEmpty,
    slug: nonEmpty,
    seoTitle: nonEmpty,
    seoDescription: nonEmpty,
    heroImage: nonEmpty,
    heroBadge: nonEmpty,
    heroLine1: nonEmpty,
    heroLine2: nonEmpty,
    heroLine3: nonEmpty,
    heroSubheadline: nonEmpty,
    servicesHeading: nonEmpty,
    cityIntroP1: nonEmpty,
    cityIntroP2: nonEmpty,
    industries: z.array(industrySchema),
    equipmentHeading: nonEmpty.optional(),
    industriesHeading: nonEmpty.optional(),
    aboutCityHeading: nonEmpty,
    aboutCityP1: nonEmpty,
    aboutCityP2: nonEmpty,
    aboutCityP3: nonEmpty,
    serviceAreas: z.array(nonEmpty),
    serviceAreaLabel: nonEmpty.optional(),
    serviceAreaTitle: nonEmpty.optional(),
    faqs: z.array(faqSchema),
    faqHeading: nonEmpty.optional(),
    phone: nonEmpty,
    availabilityConfirmationRequired: z.boolean().optional(),
    heroAlt: nonEmpty.optional(),
    bandImage: nonEmpty.optional(),
    bandAlt: nonEmpty.optional(),
    techImage: nonEmpty.optional(),
    techAlt: nonEmpty.optional(),

    // Named section content slots. Optional in the interface by design; the
    // gate config is what makes processSteps / expandedSections /
    // complianceParagraphs mandatory for a NEW T1 hub record.
    processSteps: z.array(cityProcessStepSchema).optional(),
    bandEyebrow: nonEmpty.optional(),
    bandHeading: nonEmpty.optional(),
    bandBody: nonEmpty.optional(),
    complianceHeading: nonEmpty.optional(),
    complianceParagraphs: z.array(nonEmpty).optional(),
    certifications: z.array(cityCertificationSchema).optional(),
    expandedSections: z.array(cityExpandedSectionSchema).optional(),

    address: nonEmpty.optional(),
    hasDropoff: z.boolean(),
    mapQuery: nonEmpty.optional(),
    futureAddress: nonEmpty.optional(),
    futureMapQuery: nonEmpty.optional(),
    listing: listingSchema.optional(),
  })
  .strict();

export type CityData = z.infer<typeof cityDataSchema>;

/** The exact field list handed to the model, in interface order. */
export const CITY_DATA_FIELD_ORDER = Object.keys(cityDataSchema.shape) as (keyof CityData)[];
