import { z } from "zod";

/**
 * Shape of `fact-layer.json`: Precision E-Cycle's canonical business facts,
 * transcribed from section 4 of
 * `docs/precision-ecycle-page-factory-output-contract.md`.
 *
 * This schema exists so a typo in the fact layer fails at load time rather than
 * silently reaching the model as a wrong phone number or a missing metro.
 */

const metroSchema = z.object({
  city: z.string().min(1),
  state: z.string().length(2),
  note: z.string().min(1).nullable(),
});

const certificationSchema = z.object({
  standard: z.string().min(1),
  certificateNumber: z.string().regex(/^\d+$/),
  issuer: z.string().min(1),
  scope: z.string().min(1),
});

export const factLayerSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    founded: z.number().int(),
    website: z.string().url(),
    email: z.string().email(),
    verifiedReviews: z.number().int().nonnegative(),
  }),
  phone: z.object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
  }),
  address: z.object({
    streetAddress: z.string().min(1),
    addressLocality: z.string().min(1),
    addressRegion: z.string().length(2),
    postalCode: z.string().min(5),
    formatted: z.string().min(1),
  }),
  hours: z.object({
    days: z.array(z.string().min(1)).min(1),
    opens: z.string().min(1),
    closes: z.string().min(1),
    display: z.string().min(1),
    weekendNote: z.string().min(1),
  }),
  /** Exactly the seven operator-confirmed metros. Everything else is planning. */
  confirmedServiceMetros: z.array(metroSchema).length(7),
  marketStatusRule: z.string().min(1),
  /** The seven canonical service slugs. */
  services: z.array(z.string().min(1)).length(7),
  heldCertifications: z.array(certificationSchema).length(4),
  nameableClients: z.array(z.string().min(1)).length(4),
  nameableClientsRule: z.string().min(1),
  reusableAssets: z.object({
    heroImage: z.string().min(1),
    ogImage: z.string().min(1),
    background: z.string().min(1),
  }),
  canonicalSource: z.string().min(1),
});

export type FactLayer = z.infer<typeof factLayerSchema>;
