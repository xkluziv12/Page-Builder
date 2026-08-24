import { pageBuilderPrompt as rawPageBuilderPrompt } from "./pageBuilder";
import { schemaGeneratorPrompt as rawSchemaGeneratorPrompt } from "./schemaGenerator";
import { seoAuditPrompt as rawSeoAuditPrompt } from "./seoAudit";

function replaceAll(source: string, replacements: ReadonlyArray<readonly [string, string]>): string {
  const reviewed = replacements.reduce(
    (reviewed, [from, to]) => reviewed.replaceAll(from, to),
    source,
  );

  return reviewed
    .replaceAll("certified processing, certified processing", "certified processing")
    .replaceAll("certified processing, certified processing", "certified processing")
    .replaceAll(
      "secure data destruction and secure data destruction",
      "secure data destruction",
    );
}

export const pageBuilderPrompt = replaceAll(rawPageBuilderPrompt, [
  [
    "regulatory entities (NIST 800-88, certified processing standard, secure data destruction standard, niche-specific CFRs)",
    "regulatory and compliance references (NIST 800-88, certified processing and secure data destruction certifications, niche-specific CFRs)",
  ],
  ["R2/secure data destruction location-clarity compliance patch", "Certification location-clarity compliance patch"],
  ["an certification certification claim", "a certification claim"],
  ["an certification COMPLIANCE", "a certification-compliance"],
  ["an certification claim", "a certification claim"],
  [
    "R2 STATE VERIFIED THIS PASS",
    "certified processing STATE VERIFIED THIS PASS",
  ],
  [
    "secure data destruction AAA: data destruction only. Correct usage: \"secure data destruction certified data destruction\", \"secure data destruction certified hard drive shredding\". Forbidden: \"secure data destruction certified recycling\", \"secure data destruction certified electronics recycling\".\nR2v3: electronics recycling",
    "secure data destruction: data destruction only. Correct usage: \"secure data destruction services\", \"secure data destruction for hard drive shredding\". Forbidden: \"secure data destruction recycling\", \"secure data destruction electronics recycling\".\ncertified processing: electronics recycling",
  ],
  [
    "R2/secure data destruction LOCATION CLARITY",
    "certification LOCATION CLARITY",
  ],
  ["DoD 5220.22-M, SOC 2", "DoD, SOC 2"],
  [
    "In-scope strings: certified processing, certified processing, certified processing, secure recycling, secure data destruction, secure data destruction.",
    "In-scope terms: certified processing and secure data destruction.",
  ],
  [
    "certified processing, certified processing, certified processing, secure recycling, secure data destruction, and secure data destruction all count together.",
    "Certified processing and secure data destruction count together.",
  ],
  [
    "Every secure data destruction/secure data destruction mention in visible text gets an approved replacement.",
    "Every visible-text mention gets an approved replacement.",
  ],
  ["an certified processing", "a certified processing"],
  [
    "Body inline: \"certified processing electronics recycling\" to \"secure electronics recycling\"; \"our certified processing facility\" to \"our secure processing facility\"; \"secure data destruction certified data destruction\" to \"secure data destruction\".\nParagraph/long-form (triad works): \"certified processing\" to \"secure, transparent, sustainable processing\"; \"certified processing certification ensures downstream tracking\" to \"chain of custody documentation tracks every asset through final processing\".\nCard titles (2-4 words, match sibling specificity): \"certified processing\" to \"Chain of Custody\"; \"secure data destruction Certified\" to \"Secure Data Destruction\".",
    "Body inline: \"certified processing electronics recycling\" to \"secure electronics recycling\"; \"our certified processing facility\" to \"our secure processing facility\"; \"secure data destruction certified data destruction\" to \"documented data destruction\".\nParagraph/long-form (triad works): \"certified processing\" to \"secure, transparent, sustainable processing\"; \"certification claims about downstream tracking\" to \"chain of custody documentation tracks every asset through final processing\".\nCard titles (2-4 words, match sibling specificity): \"certified processing\" to \"Chain of Custody\"; \"Secure Data Destruction Certification\" to \"Secure Data Destruction\".",
  ],
  ["certified processing certification ensures downstream tracking", "certification claims about downstream tracking"],
  ["secure data destruction Certified", "Secure Data Destruction Certification"],
  ["it is NOT an certification survivor", "it is NOT a certification survivor"],
  [
    "certified processing, certified processing, certified processing, secure recycling, secure data destruction, secure data destruction",
    "certified processing and secure data destruction",
  ],
  [
    "certified processing standard, secure data destruction standard",
    "certified processing and secure data destruction certifications",
  ],
  ["2. Regulatory entities:", "2. Regulatory and compliance references:"],
  [
    "certified processing certification, secure data destruction certification",
    "Certified Processing, Secure Data Destruction",
  ],
  [
    "A dedicated certified processing certification page",
    "a dedicated Certified Processing information page",
  ],
]);

export const schemaGeneratorPrompt = replaceAll(rawSchemaGeneratorPrompt, [
  ["certified processing Certification — secure recycling", "Certified Processing — secure recycling"],
  ["secure data destruction Certification — Data Destruction", "Secure Data Destruction — data destruction"],
  ["certified processing Certification", "Certified Processing"],
  [
    "STS Electronic Recycling provides certified processing electronics recycling and ITAD services for {CITY} businesses, healthcare facilities, government agencies, and educational institutions. Our secure data destruction certified data destruction ensures compliance with {COMPLIANCE_FRAMEWORK} through NIST 800-88 protocols and complete chain-of-custody documentation.",
    "STS Electronic Recycling provides electronics recycling and ITAD services for {CITY} businesses, healthcare facilities, government agencies, and educational institutions. Our documented data-destruction process supports compliance with {COMPLIANCE_FRAMEWORK} through NIST 800-88 protocols and complete chain-of-custody documentation.",
  ],
  [
    "STS Electronic Recycling provides nationwide {SERVICE} for healthcare organizations, financial institutions, and government agencies requiring strict compliance with {COMPLIANCE_FRAMEWORK}. Our secure data destruction certified facility processes electronics with certified processing certification, delivering complete chain-of-custody documentation and certificates of destruction for audit requirements.",
    "STS Electronic Recycling provides nationwide {SERVICE} for healthcare organizations, financial institutions, and government agencies with strict compliance requirements under {COMPLIANCE_FRAMEWORK}. Our documented processing provides complete chain-of-custody documentation and certificates of destruction for audit requirements.",
  ],
  ["{CITY}'s Trusted certified processing Electronics Recycling & ITAD Services", "{CITY}'s Trusted Electronics Recycling & ITAD Services"],
  ["secure data destruction Certified {SERVICE} Nationwide", "Secure {SERVICE} Nationwide"],
  [
    '"name": "certified processing Certification", "credentialCategory": "secure recycling"',
    '"name": "Certified Processing", "credentialCategory": "secure recycling"',
  ],
  [
    '"name": "secure data destruction Certification", "credentialCategory": "Data Destruction"',
    '"name": "Secure Data Destruction", "credentialCategory": "data destruction"',
  ],
  ['"name": "certified processing Certification"', '"name": "Certified Processing"'],
  ['"name": "secure data destruction Certification"', '"name": "Secure Data Destruction"'],
  ["certified processing Healthcare Electronics Recycling", "Certified Electronics Recycling for Healthcare"],
  [
    "Step-by-step process for scheduling certified processing {SERVICE} with secure data destruction for {CITY} businesses and organizations.",
    "Step-by-step process for scheduling {SERVICE} with secure transport and documented data destruction for {CITY} businesses and organizations.",
  ],
  [
    "GPS-tracked vehicles from {CITY} to certified processing facility with chain-of-custody documentation.",
    "GPS-tracked vehicles move equipment from {CITY} to an STS processing operation with chain-of-custody documentation.",
  ],
  [
    "Serial-level tracking, secure data destruction certified, NIST 800-88 protocols.",
    "Serial-level tracking, documented data destruction, and NIST 800-88 protocols.",
  ],
  [
    "certified processing material separation, zero landfill. Functional equipment remarketed.",
    "Documented material separation with zero-landfill processing. Functional equipment is remarketed.",
  ],
  [
    "secure data destruction Certified Processing",
    "Secure Data Destruction and Documented Processing",
  ],
]);

export const seoAuditPrompt = replaceAll(rawSeoAuditPrompt, [
  ['Banned "Responsible\n               Recycling"', 'Banned "secure recycling"'],
  ["R2 AND secure data destruction COMPLIANCE", "CERTIFICATION COMPLIANCE"],
  ["R2/secure data destruction COMPLIANCE SWEEP", "CERTIFICATION COMPLIANCE SWEEP"],
  [
    "SCOPE: certified processing, certified processing, certified processing, secure recycling, secure data destruction, secure data destruction.",
    "SCOPE: certified processing and secure data destruction.",
  ],
  [
    "certified processing certification ensures downstream tracking",
    "certification claims about downstream tracking",
  ],
  [
    '"certification claims about downstream tracking" becomes',
    '"certification claims about downstream tracking" become',
  ],
  ["secure data destruction certified data destruction", "documented data destruction"],
  ["an certified processing", "a certified processing"],
  [
    '"our certified processing facility" becomes "our certified processing facility"',
    '"our certified processing facility" becomes "our secure processing facility"',
  ],
  [
    "certified processing standard, secure data destruction standard",
    "certified processing and secure data destruction certifications",
  ],
  [
    "certified processing certification, secure data destruction certification",
    "Certified Processing, Secure Data Destruction",
  ],
  [
    "a dedicated certified processing certification page",
    "a dedicated Certified Processing information page",
  ],
  ["prioritize certified processing certification", "prioritize certified processing credentials"],
  [
    "Pending confirmation of which STS facilities hold secure data destruction, secure data destruction gets none of the three slots. Every secure data destruction and secure data destruction mention in visible page text gets an approved replacement.",
    "Pending confirmation of which STS facilities hold secure data destruction certification, it gets none of the three slots. Every visible-text mention gets an approved replacement.",
  ],
  [
    "Record R2_secure data destruction_BEFORE = [N]",
    "Record secure-data-destruction mentions before editing = [N]",
  ],
  [
    'Do NOT use "documented data destruction" as anchor text',
    "Do NOT use a certification claim as anchor text",
  ],
  [
    "Count secure data destruction and secure data destruction in visible page text.",
    "Count every visible-text mention of secure data destruction.",
  ],
  [
    "The figure itself is under review by the COO (200,000 vs 200,000), so this is a report, not a correction.",
    "The figure is under review by the COO, so this is a report, not a correction.",
  ],
  [
    "certified processing, certified processing, certified processing, secure recycling, secure data destruction, secure data destruction",
    "certified processing and secure data destruction",
  ],
]);