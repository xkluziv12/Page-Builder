/**
 * The design gate the VA eyeballs after the build before proceeding: hero has
 * the city in a single H1, a lead form is present (the tool's "form on RIGHT"
 * check), and the page is mobile-responsive (viewport meta + at least one media
 * query, the tool's "images must NOT squeeze text" check).
 *
 * These are OBJECTIVE, structural signals derived from the HTML and applied
 * IDENTICALLY to every model — no per-provider special-casing. When any check
 * fails the driver sends the verbatim `rebuild` prompt describing the issue and
 * loops; after a capped number of attempts it FAILS LOUDLY rather than silently
 * accepting a page that ignored the Master Design.
 */

export interface DesignGateResult {
  passed: boolean;
  /** Human-readable issue list for the verbatim rebuild prompt (THE ISSUE: ...). */
  issue: string;
}

export function evaluateDesignGate(html: string, city: string): DesignGateResult {
  const issues: string[] = [];
  const lower = html.toLowerCase();
  const cityLower = city.toLowerCase();

  // 1. Exactly one H1, and it must contain the city name.
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, " ").toLowerCase(),
  );
  if (h1s.length === 0) {
    issues.push("Hero is missing an <h1>. The hero MUST have one H1 containing the city name.");
  } else if (h1s.length > 1) {
    issues.push(
      `Page has ${h1s.length} <h1> tags. There must be exactly ONE H1 (in the hero), containing the city name.`,
    );
  } else if (!h1s[0]!.includes(cityLower)) {
    issues.push(`The single <h1> does not contain the city "${city}". The hero H1 must include the city.`);
  }

  // 2. A lead form must be present (the tool's "form on RIGHT" hero check).
  // STS production pages inject the hero form via a Joomla `{loadposition ...form}`
  // tag rather than a literal <form> element, so accept that convention too —
  // otherwise a faithful build is falsely failed. (The reference billings-mt.html
  // uses `{loadposition city-hero-form}` and has no literal <form>.)
  const hasForm =
    /<form\b/i.test(html) ||
    /<input\b/i.test(html) ||
    /<textarea\b/i.test(html) ||
    /\{loadposition[^}]*form[^}]*\}/i.test(html);
  if (!hasForm) {
    issues.push(
      "No lead form found. The hero must include a contact/quote form (a <form> or the Joomla {loadposition ...-form} injection tag).",
    );
  }

  // 3. Mobile responsiveness: viewport meta + at least one media query so images
  // don't squeeze the text on small screens.
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    issues.push('Missing <meta name="viewport">. The page must be mobile responsive.');
  }
  if (!/@media\b/i.test(lower)) {
    issues.push(
      "No @media query found. The page must be mobile responsive so images do not squeeze the text.",
    );
  }

  return {
    passed: issues.length === 0,
    issue: issues.join(" "),
  };
}
