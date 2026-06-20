import { describe, expect, it } from "vitest";
import { buildRegistry, BASE_DOMAIN, DEFAULT_IMAGE_LIBRARY } from "../registry";
import {
  checkAssertAfterReplace,
  checkAuditTargets,
  checkCertScope,
  checkEmDash,
  checkEntityConsistency,
  checkFacilityLanguage,
  checkIcons,
  checkImagePaths,
  checkKnownRedirects,
  checkPlaceholderLinks,
  checkSacredLinks,
  checkUrlRegistry,
  checkWordCount,
  runCheckers,
  deriveLinkAudit,
  blockingErrorCount,
  LINK_CHECK_IDS,
  AUDIT_TARGET_MARKER,
} from "./index";
import { computeStructuralHash } from "./structural-hash";

const registry = buildRegistry();
const LIBRARY_IMG = DEFAULT_IMAGE_LIBRARY[0]!.url;

describe("checkEmDash", () => {
  it("passes clean text", () => {
    expect(checkEmDash("<p>Clean copy, no dashes.</p>").passed).toBe(true);
  });
  it("fails on em-dash", () => {
    const r = checkEmDash("<p>This — is bad.</p>");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
});

describe("checkImagePaths", () => {
  it("passes images that are in the verified library", () => {
    expect(checkImagePaths(`<img src="${LIBRARY_IMG}">`, registry).passed).toBe(true);
  });
  it("fails relative images", () => {
    const r = checkImagePaths(`<img src="/images/a.jpg">`, registry);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("fails http images", () => {
    expect(checkImagePaths(`<img src="http://x.com/a.jpg">`, registry).passed).toBe(false);
  });
  it("hard-fails absolute https images NOT in the verified library", () => {
    const r = checkImagePaths(`<img src="${BASE_DOMAIN}/images/invented.jpg">`, registry);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
});

describe("checkUrlRegistry", () => {
  it("passes when internal links are all in the registry", () => {
    const url = registry.sacredLinks[0]!.url;
    expect(checkUrlRegistry(`<a href="${url}">x</a>`, registry).passed).toBe(true);
  });
  it("hard-fails an invented/unapproved internal URL", () => {
    const r = checkUrlRegistry(`<a href="${BASE_DOMAIN}/totally-invented-page">x</a>`, registry);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
});

describe("checkEntityConsistency", () => {
  it("passes when the business name is in both page and schema", () => {
    const r = checkEntityConsistency(
      "<p>STS Electronic Recycling serves Austin.</p>",
      '{"name":"STS Electronic Recycling"}',
      "STS Electronic Recycling",
    );
    expect(r.passed).toBe(true);
  });
  it("hard-fails when page and schema entity names disagree", () => {
    const r = checkEntityConsistency(
      "<p>Some other company.</p>",
      '{"name":"STS Electronic Recycling"}',
      "STS Electronic Recycling",
    );
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("passes when researched entities are coherent across page and schema", () => {
    const r = checkEntityConsistency(
      "<p>STS Electronic Recycling partners with Acme Corp in Austin.</p>",
      '{"name":"STS Electronic Recycling","partner":"Acme Corp"}',
      "STS Electronic Recycling",
      [{ name: "Acme Corp" }],
    );
    expect(r.passed).toBe(true);
  });
  it("hard-fails when a researched entity is on the page but missing from schema", () => {
    const r = checkEntityConsistency(
      "<p>STS Electronic Recycling partners with Acme Corp.</p>",
      '{"name":"STS Electronic Recycling"}',
      "STS Electronic Recycling",
      [{ name: "Acme Corp" }],
    );
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
    expect(r.details?.some((d) => d.includes("Acme Corp"))).toBe(true);
  });
  it("hard-fails when the page contradicts a verified entity count", () => {
    const r = checkEntityConsistency(
      "<p>STS Electronic Recycling has 250 employees in Austin.</p>",
      '{"name":"STS Electronic Recycling"}',
      "STS Electronic Recycling",
      [{ name: "STS Electronic Recycling", employees: 120 }],
    );
    expect(r.passed).toBe(false);
    expect(r.details?.some((d) => d.includes("250") && d.includes("120"))).toBe(true);
  });
  it("passes when the page count matches the verified entity count", () => {
    const r = checkEntityConsistency(
      "<p>STS Electronic Recycling has 120 employees.</p>",
      '{"name":"STS Electronic Recycling"}',
      "STS Electronic Recycling",
      [{ name: "STS Electronic Recycling", employees: 120 }],
    );
    expect(r.passed).toBe(true);
  });
});

describe("checkKnownRedirects", () => {
  it("fails on the known broken law-firm URL", () => {
    const html = `<a href="${BASE_DOMAIN}/industries-4/law-firm-electronics-recycling-and-itad">x</a>`;
    const r = checkKnownRedirects(html);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("passes the corrected long-form destination", () => {
    const html = `<a href="${BASE_DOMAIN}/industries-we-serve/industries-3/courts-and-legal-industry-electronics-recycling-and-itad">x</a>`;
    expect(checkKnownRedirects(html).passed).toBe(true);
  });
});

describe("checkFacilityLanguage", () => {
  it("fails forbidden phrase", () => {
    expect(checkFacilityLanguage("<p>Visit our facility today.</p>").passed).toBe(false);
  });
});

describe("checkCertScope", () => {
  it("fails NIST 800-88 certified", () => {
    expect(checkCertScope("<p>We are NIST 800-88 certified.</p>").passed).toBe(false);
  });
  it("passes NIST 800-88 compliant", () => {
    expect(checkCertScope("<p>Compliant with NIST 800-88.</p>").passed).toBe(true);
  });
});

describe("checkSacredLinks", () => {
  it("fails when sacred links missing on page track", () => {
    expect(checkSacredLinks("<p>nothing</p>", registry, "page").passed).toBe(false);
  });
  it("skips for blog track", () => {
    expect(checkSacredLinks("<p>nothing</p>", registry, "blog").passed).toBe(true);
  });
});

describe("checkUrlRegistry approved-allowlist baseline", () => {
  it("passes real STS internal links from the default allowlist", () => {
    const html = [
      `<a href="${BASE_DOMAIN}/CONTACT-STS-PAGE">Contact</a>`,
      `<a href="${BASE_DOMAIN}/services">Services</a>`,
      `<a href="${BASE_DOMAIN}/hard-drive-destruction-service">Shredding</a>`,
      `<a href="${BASE_DOMAIN}/industries-we-serve/industries-1/healthcare-electronic-recycling">Healthcare</a>`,
      `<a href="${BASE_DOMAIN}/97-recyclable-electronics/317-computer-recycling">Computers</a>`,
    ].join("");
    expect(checkUrlRegistry(html, buildRegistry()).passed).toBe(true);
  });
  it("still hard-fails an invented STS internal URL", () => {
    const html = `<a href="${BASE_DOMAIN}/totally-made-up-page">Nope</a>`;
    expect(checkUrlRegistry(html, buildRegistry()).passed).toBe(false);
  });
  it("validates root-relative internal links against the allowlist (passes a real one)", () => {
    const html = `<a href="/services">Services</a><a href="/CONTACT-STS-PAGE">Contact</a>`;
    expect(checkUrlRegistry(html, buildRegistry()).passed).toBe(true);
  });
  it("hard-fails an invented root-relative internal link (no allowlist bypass)", () => {
    const html = `<a href="/totally-made-up-page">Nope</a>`;
    const result = checkUrlRegistry(html, buildRegistry());
    expect(result.passed).toBe(false);
    expect(result.details).toContain(`${BASE_DOMAIN.toLowerCase()}/totally-made-up-page`);
  });
});

describe("checkUrlRegistry existing-links (revamp/light-touch)", () => {
  const existingUrl = `${BASE_DOMAIN}/dallas-data-destruction-services`;
  it("hard-fails an unverified internal link not in the registry", () => {
    const html = `<a href="${existingUrl}">Dallas services</a>`;
    expect(checkUrlRegistry(html, buildRegistry()).passed).toBe(false);
  });
  it("passes when the link is supplied as a per-run existing URL", () => {
    const html = `<a href="${existingUrl}">Dallas services</a>`;
    const reg = buildRegistry({ existingUrls: [existingUrl] });
    expect(checkUrlRegistry(html, reg).passed).toBe(true);
  });
  it("runCheckers carries existing internal links without a false hard-fail", () => {
    const html = `<a href="${existingUrl}">Dallas services</a>`;
    const report = runCheckers({
      html,
      registry: buildRegistry({ existingUrls: [existingUrl] }),
      classification: "REVAMP",
    });
    const urlCheck = report.checks.find((c) => c.id === "url-registry");
    expect(urlCheck?.passed).toBe(true);
  });
});

describe("checkFacilityLanguage city-specific", () => {
  it("flags a city-templated facility claim", () => {
    const r = checkFacilityLanguage("<p>Visit our Dallas facility today.</p>", "Dallas");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("flags 'located in {CITY}'", () => {
    expect(checkFacilityLanguage("<p>We are located in Austin.</p>", "Austin").passed).toBe(false);
  });
  it("suggests the city-aware rewrite", () => {
    const r = checkFacilityLanguage("<p>our Dallas facility</p>", "Dallas");
    expect(r.message).toContain("We serve Dallas");
  });
  it("passes compliant copy", () => {
    expect(
      checkFacilityLanguage("<p>We serve Dallas from our 600,000 sq ft R2v3 certified facility.</p>", "Dallas").passed,
    ).toBe(true);
  });
});

describe("checkIcons", () => {
  it("flags emoji used as icons", () => {
    const r = checkIcons("<ul><li>♻️ Recycling</li><li>✅ Certified</li></ul>");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("passes clean copy with no emoji", () => {
    expect(checkIcons("<ul><li>Recycling</li><li>Certified</li></ul>").passed).toBe(true);
  });
  it("flags icon classes outside an approved set when configured", () => {
    const r = checkIcons('<i class="fa fa-trash"></i>', ["icon-recycle"]);
    expect(r.passed).toBe(false);
  });
  it("passes icon classes within the approved set", () => {
    expect(checkIcons('<i class="icon-recycle"></i>', ["icon-recycle"]).passed).toBe(true);
  });
});

describe("checkCertScope (expanded)", () => {
  it("flags R2v3 attached to data destruction", () => {
    expect(checkCertScope("<p>R2v3 certified data destruction</p>").passed).toBe(false);
  });
  it("flags NAID attached to recycling", () => {
    expect(checkCertScope("<p>NAID AAA certified recycling</p>").passed).toBe(false);
  });
  it("flags guarantee-compliance phrasing", () => {
    expect(checkCertScope("<p>We guarantee compliance with all regulations.</p>").passed).toBe(false);
  });
  it("passes in-scope claims", () => {
    expect(
      checkCertScope("<p>NAID AAA certified data destruction and R2v3 certified recycling.</p>").passed,
    ).toBe(true);
  });
});

describe("computeStructuralHash", () => {
  it("is deterministic for identical structure", () => {
    const html = '<style>:root{--primary:#1e3a8a}</style><section class="hero">x</section>';
    expect(computeStructuralHash(html)).toBe(computeStructuralHash(html));
  });
  it("changes when the structure drifts", () => {
    const a = '<style>:root{--primary:#1e3a8a}</style><section class="hero">x</section>';
    const b = '<style>:root{--primary:#ff0000}</style><section class="hero">x</section>';
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });
});

describe("runCheckers design-bible drift gate", () => {
  it("flags drift when stored hash differs from the current page", () => {
    const report = runCheckers({
      html: "<p>changed</p>",
      registry,
      designBibleHash: "deadbeefdeadbeefdeadbeefdeadbeef",
    });
    const bible = report.checks.find((c) => c.id === "bible-hash");
    expect(bible?.passed).toBe(false);
  });
  it("passes when the stored hash matches the computed current hash", () => {
    const html = "<p>locked</p>";
    const report = runCheckers({ html, registry, designBibleHash: computeStructuralHash(html) });
    const bible = report.checks.find((c) => c.id === "bible-hash");
    expect(bible?.passed).toBe(true);
  });
});

describe("checkAuditTargets", () => {
  const five = AUDIT_TARGET_MARKER.repeat(5);
  it("passes with 5+ markers for a normal build before audit", () => {
    expect(checkAuditTargets(five, "NEW_BUILD", false).passed).toBe(true);
  });
  it("hard-fails with too few markers before audit", () => {
    const r = checkAuditTargets(AUDIT_TARGET_MARKER.repeat(2), "NEW_BUILD", false);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("allows the lower 3-marker floor for LIGHT_TOUCH", () => {
    expect(checkAuditTargets(AUDIT_TARGET_MARKER.repeat(3), "LIGHT_TOUCH", false).passed).toBe(true);
  });
  it("is informational after the audit phase has consumed markers", () => {
    expect(checkAuditTargets("", "NEW_BUILD", true).passed).toBe(true);
  });
});

describe("checkAssertAfterReplace", () => {
  it("passes with no substitutions to verify", () => {
    expect(checkAssertAfterReplace("<p>x</p>").passed).toBe(true);
  });
  it("passes when the new string is present and the old absent", () => {
    const r = checkAssertAfterReplace("<p>New Town</p>", [
      { oldString: "Old Town", newString: "New Town" },
    ]);
    expect(r.passed).toBe(true);
  });
  it("hard-fails when the old string still lingers", () => {
    const r = checkAssertAfterReplace("<p>Old Town and New Town</p>", [
      { oldString: "Old Town", newString: "New Town" },
    ]);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
  it("hard-fails when the new string never landed", () => {
    const r = checkAssertAfterReplace("<p>nothing changed</p>", [
      { oldString: "Old Town", newString: "New Town" },
    ]);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
  });
});

describe("checkWordCount", () => {
  it("flags floor only after audit", () => {
    const before = checkWordCount("<p>too short</p>", registry, "SPOKE", false);
    expect(before.find((c) => c.id === "word-floor")?.passed).toBe(true);
    const after = checkWordCount("<p>too short</p>", registry, "SPOKE", true);
    expect(after.find((c) => c.id === "word-floor")?.passed).toBe(false);
  });
});

describe("runCheckers", () => {
  it("aggregates and fails loudly on errors", () => {
    const report = runCheckers({
      html: "<p>This — has our facility and a bad <img src='/x.jpg'></p>",
      registry,
      pageType: "SPOKE",
      track: "page",
      afterAudit: false,
    });
    expect(report.passed).toBe(false);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it("carries a dedicated linkAudit view", () => {
    const report = runCheckers({
      html: '<a href="">empty</a>',
      registry,
      pageType: "SPOKE",
      track: "page",
      afterAudit: false,
    });
    expect(report.linkAudit).toBeDefined();
    expect(report.linkAudit.passed).toBe(false);
    expect(report.linkAudit.offendingLinks.length).toBeGreaterThan(0);
  });
});

describe("checkPlaceholderLinks", () => {
  it("passes when no placeholder hrefs are present", () => {
    expect(
      checkPlaceholderLinks('<a href="https://example.com/page">ok</a>').passed,
    ).toBe(true);
  });
  it("flags empty, fragment, and javascript hrefs", () => {
    const r = checkPlaceholderLinks(
      '<a href="">a</a><a href="#">b</a><a href="javascript:void(0)">c</a>',
    );
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("error");
    expect(r.details.length).toBe(3);
  });
});

describe("deriveLinkAudit", () => {
  it("passes and includes only link checks when links are clean", () => {
    const audit = deriveLinkAudit([
      { id: "placeholder-links", label: "L", severity: "error", passed: true, message: "", details: [] },
      { id: "em-dash", label: "D", severity: "error", passed: false, message: "x", details: [] },
    ]);
    expect(audit.passed).toBe(true);
    expect(audit.errorCount).toBe(0);
    expect(audit.checks.every((c) => (LINK_CHECK_IDS as readonly string[]).includes(c.id))).toBe(true);
  });
  it("collects offending links from failing link checks only", () => {
    const audit = deriveLinkAudit([
      { id: "insecure-links", label: "Insecure", severity: "error", passed: false, message: "m", details: ["http://x"] },
      { id: "em-dash", label: "D", severity: "error", passed: false, message: "x", details: ["—"] },
    ]);
    expect(audit.passed).toBe(false);
    expect(audit.errorCount).toBe(1);
    expect(audit.offendingLinks).toHaveLength(1);
    expect(audit.offendingLinks[0]!.detail).toBe("http://x");
  });
});

describe("blockingErrorCount", () => {
  const baseReport = {
    passed: false,
    errorCount: 2,
    warningCount: 0,
    wordCount: 0,
    ranAt: null,
    linkAudit: { passed: false, errorCount: 1, offendingLinks: [], checks: [] },
    checks: [
      { id: "url-registry", label: "Registry", severity: "error" as const, passed: false, message: "m", details: [] },
      { id: "em-dash", label: "Dash", severity: "error" as const, passed: false, message: "m", details: [] },
    ],
  };
  it("counts all errors when not overridden", () => {
    expect(blockingErrorCount(baseReport, false)).toBe(2);
  });
  it("excuses only link errors when overridden", () => {
    expect(blockingErrorCount(baseReport, true)).toBe(1);
  });
});
