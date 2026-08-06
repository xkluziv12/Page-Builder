# R2 COMPLIANCE PATCH BRIEF: UNIVERSAL v3.1

Run this against any prompt that generates or edits customer-facing content.
Blog prompts, page builders, guide builders, authority page builders, PR
prompts, schema generators, audits.

It is a briefing, not a replacement prompt. You know your file better than this
brief does.

v3.1 CHANGES: no new rules. This is a consistency sweep. v3.0 cut the budget to
one but left "budget of 3" in the category definitions, the NAID flip, and the
injection-point method, so a prompt patched off Step 1 alone would target the
wrong number. Educational mentions said "exempt and must be preserved" in the
rules and "guide pages only" in the allocation. Category B said the callout was
recommended while rule 2 said mandatory. Companion references pointed at Clean
Prompt v4.8, four versions stale, whose checker still uses the retired
location-clarity test. All corrected.

v3.0 CHANGES: the budget is now ONE, not three. The callout is a fixed universal
block, not a converted card. Square footage is resolved to 200,000. Em dash
enforcement is hardened. If your prompt was already patched against v1.x or v2.x,
go to WHAT CHANGED IN v3.0 and apply those deltas only. Do not re-patch from
scratch. Companion file: R2 Clean Prompt v5.4, read only.

START WITH STEP 1. Some prompts need no changes at all, and finding that out in
two minutes is a valid outcome. Do not patch a prompt that does not need it.

---

## WHY THIS EXISTS

A registrar review flagged STS pages in July 2026. The finding: certification
claims sit beside a city name and a local address, and a reader could take that to
mean the local site is certified. Only two sites are: Jacksonville and Houston,
Texas. Every other STS location is a collection and service point.

Josh Clasen, the outside compliance consultant, stated the rule as: any time you
advertise that you are certified, especially on a page with an address to a
location that targets a city or region, the sentence advertising the certification
must make clear the certified location is Jacksonville or Houston.

Josh Crow, COO: still say R2v3 certified, just make clear the logistics model.
And: we do not need it to appear 40 times on the page, and there are other
keywords that could take up 35 of those 40 spots.

THIS IS A LOCATION-CLARITY RULE, NOT A REMOVAL RULE. STS IS R2v3 certified. The
claim is true. What is not true, and what got flagged, is the implication that it
is certified at the local address on the page.

TWO JOBS, AND DOING ONLY THE FIRST IS A FAILURE.
One: stop implying local certification.
Two: keep the content reading like what STS actually is, a credentialed operator
running since 2011 across all 50 states.

Output that reads as though STS holds no certifications has failed, even with
zero instances of R2. Two failures on this project came from rules-without-
reasoning: a certifications FAQ answered with no certification in it, and a
fabricated 40 CFR 261 citation. Both were technically rule-compliant. Put the
reasoning in your prompt, not just in your head.

---

## WHAT CHANGED IN v3.0

Five deltas. If your prompt is already patched, these are the only changes to
apply.

DELTA 1. THE BUDGET IS ONE, NOT THREE.
  Operator ruling, August 2026: "anytime it says r2 or r2v3 it must have the
  location, we cannot have these random texts, that's what the About STS is for."
  After this pass, R2, R2v3, R2:2020, Responsible Recycling, NAID, and NAID AAA
  appear in exactly ONE place in visible text: inside the sts-hq-callout block.
  Nowhere else, in any form, location-clear or not.
  RETIRED: the front-loaded answer block slot, the certifications FAQ slot, and
  the attribution slot. All three now get approved replacements like everything
  else.
  THIS IS STRICTER THAN THE REGISTRAR REQUIRES, DELIBERATELY. A sentence naming
  Jacksonville and Houston would satisfy compliance. It is still replaced,
  because one mention in one place with one appearance is auditable at a glance
  across 2,000 pages and scattered mentions are not.
  TRADEOFF ON RECORD: SEO Audit Phase 1L specifies R2v3 or NAID AAA as a required
  element in the front-loaded answer block, which is the most-cited passage for
  AI retrieval. That citation value is the accepted cost of enforceability. If
  your prompt has a spec requiring a certification in a minimum-length element,
  that spec now conflicts and needs resolving. Say so rather than silently
  breaking the word count.
  THE CERTIFICATIONS FAQ STILL ANSWERS ITS QUESTION. It names the real standards
  that are not in scope here: NIST 800-88, HIPAA, ISO 27001, SOC 2, DoD
  5220.22-M. It must not name R2v3 or NAID and must not come back empty. An
  answer naming nothing reads as uncertified and is worse than the problem this
  exists to fix. That failure already happened once.

DELTA 2. THE CALLOUT IS A FIXED UNIVERSAL BLOCK, APPENDED, NOT CONVERTED.
  Conversion of an existing card is retired. With 3 to 5 design bibles in play,
  conversion produced a different-looking disclosure on every design and made it
  impossible to audit at a glance.
  Every location-targeted page gets the same block, same code, same appearance,
  appended near the bottom. Exact code is in R2 Clean Prompt v5.4 under THE_BOX,
  in two variants: standalone page and Joomla article fragment. Copy it verbatim.
  It uses inline styles only, no CSS variables, font-family inherit, and a
  TRANSPARENT section background so it never creates a new colored row against a
  design it was not built for. It is wrapped in DO NOT MODIFY HTML comments that
  a crawler or reviewer uses to find it. Do not remove them.
  Permitted edits: the city name, the optional scope line, and the card colors if
  it lands on a dark background. Nothing else. Do not add the page brand color.
  Neutral is the point.
  IF YOUR PROMPT GENERATES PAGES, emit this block natively so a new page never
  needs remediation.

DELTA 3. SQUARE FOOTAGE IS RESOLVED TO 200,000.
  On operator authorization, August 2026. This reverses the earlier hold.
  The canonical figure is 200,000 sq ft, the Jacksonville, Texas headquarters.
  Correct every other value to 200,000: 600,000, 600K, 150,000, 50K, anything.
  Match the existing formatting, change the number only.
  A square footage figure is NOT a certification claim. It does not count against
  the budget, needs no city in its sentence, and is never stripped or replaced
  with approved vocabulary.
  BASIS: operator authorization, not independent verification. The figure was
  disputed. Reverting is a search and replace in one rule.

DELTA 4. EM DASH ENFORCEMENT IS HARDENED.
  Zero em dashes. This was already the house rule and it was not holding: a run
  introduced one while inserting a location clause and it shipped to a live page.
  SIX FORMS, and a grep for the visible character misses three:
    — em dash U+2014, – en dash U+2013, horizontal bar U+2015,
    &mdash;, &ndash;, &#8212;, &#8211;
  A model told not to type the character will sometimes emit the entity instead.
  Check all six.
  Introducing one is a hard FAIL. The highest-risk moment is inserting a clause
  into an existing sentence. Use a comma, a period, or restructure.
  Hyphens in compound words, URLs, class names, and ids are not dashes and are
  not in scope.

DELTA 5. MODIFIER ATTACHMENT CHECK.
  After inserting a clause, read what follows it. "Including", "such as", "with",
  "featuring", and "like" attach to the nearest preceding noun. If your insertion
  moved that noun, the sentence now says something false.
  REAL FAILURE: "...for Tampa businesses, processed at our Jacksonville and
  Houston, Texas facilities, including Tampa General Hospital, BayCare Health
  System, and MacDill Air Force Base." "Including" now modifies "facilities", so
  the page claims three customer organizations are STS facilities. A compliance
  edit created a new false facility claim.
  RULE: when a sentence ends in an entity list or an appositive, put the location
  clause AFTER it, never in front.

STILL OPEN, unchanged: NAID facility scope. Reported as Houston-only on the
August 2 call but never confirmed in writing, and that line came off a garbled
auto-transcript. NAID stays at ZERO everywhere. Build so the flip is one line.

STILL PENDING: the dedicated R2v3 page. Proposed and agreed, does not exist yet.
Do NOT invent a URL. Reserve the slot and leave it empty.

---

## STEP 1: DOES THIS APPLY TO YOUR PROMPT?

Answer three questions before touching anything.

Q1. Does your prompt's output ever contain R2, R2v3, R2:2020, Responsible
Recycling, NAID, or NAID AAA in visible text? Grep for all six. If zero hits and
no template could generate one, STOP. Report "no in-scope terms, no changes
needed" and you are done.

Q2. What brand is the output for? If it is DCD or any brand other than STS
Electronic Recycling, STOP and ask before proceeding. STS holds the R2v3
certification. Whether another brand may reference it at all is a separate
question that has not been answered, and brand separation is a standing hard
requirement. Do not assume, do not patch, ask.

Q3. Which output category are you in? This sets the treatment.

CATEGORY A: LOCATION-TARGETED WITH A LOCAL ADDRESS.
City landing pages, GMB profile pages, location pages. The page names a city and
displays a local address or NAP block.
This is the flagged case. Full treatment: budget of ONE, location clarity,
mandatory callout block.

CATEGORY B: LOCATION-TARGETED WITHOUT A LOCAL ADDRESS.
City blog posts, city guides, county or metro content, service-area pages with no
address block.
The trigger is weaker, since there is no address implying a local certified site.
But the content still targets a city and a reader can still infer local
certification. Treatment: same budget of ONE, same location clarity, and the
callout block is mandatory here too, per rule 2. If the format genuinely has no
room for a block, that is an escalation to the operator, not a substitution. Do
not replace the block with a location-clear sentence on your own judgment.

CATEGORY C: NO LOCATION TARGETING.
National blog posts, industry pages, job title pages, general service pages,
K-12 or compliance authority pages that are not city-specific.
The location-clarity rule does not fire, because there is no local address and no
city being implied. A company-level claim like "STS is R2v3 certified" is true and
carries no ambiguity here.
Treatment: no budget cap required on compliance grounds. But apply two things
anyway. First, volume discipline: 40 mentions was never good SEO and those slots
are better spent on ranking keywords. Second, if the content names ANY city or
region alongside a certification claim, that instance moves to Category B
treatment. Watch for this in examples, templates, and localized variants.

CATEGORY D: STRUCTURED DATA.
Schema generators, JSON-LD output.
Josh ruled the scope as "text on page." Schema is out of scope and likely needs no
changes. Report that finding rather than patching.
ONE EXCEPTION WORTH FLAGGING: if your schema attaches a certification claim to a
LocalBusiness or Service entity that also carries a local street address, that is
the same implication in machine-readable form. It is currently out of scope, but
flag it to the operator as a question rather than silently patching or silently
ignoring it.

CATEGORY E: THIRD-PARTY DISTRIBUTION.
PR prompts, press release templates, syndicated content, outreach copy.
Treat as Category A regardless of whether an address appears, and be more
conservative than the budget requires. You do not control where this lands, who
excerpts it, or what context it appears in. A press release quoted out of context
with an unqualified certification claim beside a city name is exactly the exposure
under review. Recommend one location-clear mention and no more.

CATEGORY F: AUDIT AND EDIT PROMPTS.
Prompts that modify existing content rather than generating it.
Same rules, plus one addition: know which prompt owns remediation. If your prompt
finds non-compliant content that IT did not create, do not remediate it. Report it
and name the prompt that should. Two prompts remediating the same content will
drift. See REFERENCE IMPLEMENTATION below.

Report your category before you start work.

---

## THE ALLOCATION

Applies to Categories A, B, E, and F. Category C applies it only where a city
appears beside a claim. Category D is exempt.

BUDGET: ONE. In-scope terms appear in exactly one place in visible text, inside
the sts-hq-callout block. R2, R2v3, R2:2020, Responsible Recycling, NAID, and
NAID AAA all count together. Everywhere else gets an approved replacement.

Four things do not count and are not touched:
  The negative-scope disclaimer. It denies local certification, which is the
  goal of the rule, not a violation of it.
  Square footage figures. Not certification claims. Corrected to 200,000.
  Educational mentions, ONLY on guide pages where teaching a buyer what to
  require is the asset. On city pages they are replaced along with everything
  else, because they are the scattered text the operator ruling is aimed at.
  Anything in head tags, meta, og, alt attributes, schema, or HTML comments.

THE ONE PLACE. The sts-hq-callout block, appended near the bottom.
  Mandatory on every location-targeted page. A page without it is not
  publishable.
  Exact code in R2 Clean Prompt v5.4 under THE_BOX. Copy verbatim.
  Placement, first match wins: immediately before the final CTA section, then
  immediately before the closing footer, then as the last element in the body.
  Never inside another section, card, grid, or the hero. Never after the footer.
  If a block with class sts-hq-callout already exists, replace it in place rather
  than adding a second.

EVERYWHERE ELSE. Approved replacement, always. No exceptions for slots that
could technically fit a city name. If you find yourself reasoning that a
particular mention is location-clear and therefore acceptable, stop. That
reasoning was correct under the old three-slot rule and is wrong now.

## NAID: ZERO SURVIVORS UNTIL FACILITY SCOPE IS CONFIRMED

NAID AAA is in scope on the same terms as R2. The COO confirmed this directly.

Open question: which STS facilities actually hold NAID AAA. Asked, not yet
answered.

Until answered, NAID gets zero of the slots. Every NAID and NAID AAA mention in
visible text gets an approved replacement. Do not guess a facility scope to keep
one alive.

The reason is mechanical, not cautious. A survivor must name its certified
location in its own sentence. If we do not know whether NAID AAA covers
Jacksonville, Houston, both, or a different scope, no NAID sentence can be written
that is both location-clear and true.

WHEN THE ANSWER ARRIVES: NAID becomes eligible INSIDE the sts-hq-callout block
with the correct facilities named. The budget does not change: one place, one
block. Nothing outside it becomes eligible. Build the patch so switching this on
later is a localized change, not a rewrite.

---

## THE RULES

1. BUDGET. ONE. In-scope terms appear only inside the sts-hq-callout block.
   Everywhere else gets an approved replacement, location-clear or not.

2. THE BLOCK IS MANDATORY for Categories A, B, and E. Fixed universal code,
   appended, never converted from an existing card. See DELTA 2.

3. NO EM DASHES. Six forms, character and HTML entity. Introducing one is a hard
   FAIL. See DELTA 4.

4. APPROVED VOCABULARY. Josh Crow approved exactly these. Do not invent
   alternatives, do not reach for a synonym that seems better:
     Secure Recycling
     Accurate Reporting
     Chain of Custody
     Secure
     Transparent
     Sustainable
     Certified (long slots only, per rule 6)
   These replace every in-scope term outside the block. There are no exceptions.
   R2 Clean Prompt v5.4 has by-slot guidance and rotation rules so 580+ pages do
   not read identically. Port that behavior.

5. NEVER USE "Responsible Recycling", "Responsible Processing", or "Responsibly
   Recycled" as a replacement. R2 stands for Responsible Recycling. Those restate
   the trademark in longhand.

6. THE WORD "CERTIFIED" IS ALLOWED IN LONG SLOTS ONLY. See DELTA 1. Only the
   literal string R2v3 triggers the rule, so "certified" carries no compliance
   risk and does carry keyword value.
   ALLOWED: H1s, section headings, body prose.
   NOT ALLOWED: trust chips, card titles, stat labels. Use the approved
   short-slot terms there.
   NEVER pair it with a location-implying noun in a short slot. "Certified
   Facility" on a Chicago page still points at a place.

7. NO LOCATION-IMPLYING NOUNS in a replacement: facility, center, plant, site,
   location, warehouse. Unless that same element names Jacksonville or Houston.
   "Certified Facility" on a Chicago page still points at a place.

8. EDUCATIONAL MENTIONS ARE EXEMPT ON GUIDE PAGES ONLY. A sentence that teaches
   what a standard requires, or what a buyer should look for in a vendor, makes no
   claim about STS.
   WHERE THE EXEMPTION APPLIES: guide pages, where teaching a buyer what to
   require is the asset. In Clean Prompt v5.4 this is the EDUCATIONAL_EXEMPT
   flag, default NO.
   WHERE IT DOES NOT: city pages and any other location-targeted output. There
   they are replaced along with everything else, because they are the scattered
   text the operator ruling is aimed at. This matches THE ALLOCATION above.
   THE TEST: remove STS from the sentence. If it is still true and still makes
   sense, it is education. If it asserts or implies STS holds the certification,
   it is a claim and the budget applies.
   Deleting a standard from a neutral checklist makes the guidance worse, not
   safer. This already happened: a government guide had R2v3 stripped from a
   vendor-evaluation checklist, leaving e-Stewards as the only named scheme.
   RULING ALREADY MADE: buyer-criteria patterns of this shape are educational and
   exempt, confirmed by the operator:
     "When evaluating {SERVICE} providers, {PERSONA}s at organizations like
      {ENTITY} prioritize R2v3 certification and downstream documentation"
   SEO Audit v10.13.1 treats this shape as exempt on guide pages. Clean Prompt
   v5.4 exempts it only when EDUCATIONAL_EXEMPT = YES. Match that, and never
   convert an educational element into the callout block under either setting.
   NAID versions of the same shape are REPLACED, not exempted, because NAID has
   zero survivors regardless of category.

9. NEGATIVE-SCOPE DISCLAIMERS ARE EXEMPT AND MUST NEVER BE FAILED.
   A disclaimer states that a location is NOT certified. It contains R2v3, names
   the local city, and will not name Jacksonville or Houston, because its entire
   job is to deny certification at the city in question:
     "Our {CITY} location is a collection and service point. It is not an R2v3
      certified processing facility."
   A naive reading of the location-clarity rule fails this. That reading is wrong.
   A sentence explicitly denying local certification is the rule's goal, not its
   violation.
   Exempt: does not count against the budget, never needs Jacksonville or Houston
   in its own sentence, never rewritten, never a FAIL.
   Recognize it by its negating construction: "is not", "does not hold", "is a
   collection and service point".
   THE TEST: does the sentence ASSERT certification at this location, or DENY it?
   Assert is in scope. Deny is exempt.

10. NEVER SWAP IN A DIFFERENT STANDARD. If a template cites R2v3 or NAID, either
    drop the citation and state the fact plainly, or make it location-clear. Do
    not substitute another authority. A prior version of the cleanup prompt told
    the model to substitute, and it produced "Per EPA 40 CFR 261, downstream
    tracking must document materials through final processing at certified
    smelters" and "Per ISO 27001, downstream tracking documents all materials at
    audited smelters" on live pages. Neither standard says that. A
    plausible-sounding citation that does not support its claim is worse than the
    problem it replaced, and on a compliance page during a certification review it
    is the worst possible output.

11. OUT OF SCOPE: title tags, meta description, meta keywords, og tags, image alt
    attributes, JSON-LD schema, HTML comments. Josh ruled "text on page." Never
    strip R2 from these.
    AND, per DELTA 3, meta SHOULD carry R2v3. If your prompt generates meta, use
    Josh's shape: "R2v3 certified electronics recycling for {CITY} businesses".
    Square footage figures are also exempt, per DELTA 3. Not a certification
    claim, no location qualifier needed, does not count against the budget.

12. NOT IN SCOPE AT ALL: NIST, HIPAA, ISO 27001, DoD 5220.22-M, SOC 2, FISMA,
    FERPA, SOX, GLBA, FACTA, EPA, RIOS, e-Stewards. Only R2 and NAID. Leave every
    other certification exactly as your prompt handles it today.

---

## HOW TO FIND YOUR INJECTION POINTS

Line numbers are prompt-specific, so here is the method instead.

1. Grep for all six terms: R2, R2v3, R2:2020, Responsible Recycling, NAID,
   NAID AAA. Case insensitive. Exclude URLs.

2. Sort every hit into one of four buckets:
   PROSE ABOUT THE PROMPT ITSELF. Changelogs, rationale, internal notes. These
   never reach a page. Leave them.
   TEMPLATE OR PATTERN. A string with {CITY}, {PERSONA}, {ENTITY} or similar that
   becomes page copy. In scope.
   EXAMPLE OR FEW-SHOT. A BEFORE/AFTER, a "good" example, a sample output. IN
   SCOPE, and higher risk than templates, because a VA-executed model copies
   examples literally. This is where the worst production instances came from.
   VALIDATION OR REPORTING. Checklists, counts, gate criteria. Update to measure
   the new rules.

3. For each in-scope hit, ask two questions in order:
   Does this pattern's OUTPUT pair a certification claim with a city name?
     Yes: this is the high-priority class. It manufactures the violation rather
     than merely mentioning it.
   Is the hit inside the sts-hq-callout block?
     Yes: leave it. That is the one permitted place.
     No: replace it. Slot length is irrelevant now. A long slot that could name
     Jacksonville and Houston still gets an approved replacement.

4. Check for these specific shapes, all found in production:
   "We serve {CITY} from our 600,000 sq ft R2v3 certified facility"
   "R2 certified processing for {CITY}"
   "{COUNTY} County's {NICHE} sector relies on R2v3 certified recycling"
   A card titled "R2v3 Certified Processing" with body "Responsible Recycling
     standards with downstream tracking", no location anywhere
   A stat band with value "R2" over label "CERTIFIED RECYCLING"
   A final CTA hardcoding "STS provides R2v3 and NAID AAA certified services for
     {CITY} organizations"
   Anchor text reading "NAID certified data destruction"

5. Add a compliance check to whatever validation your prompt already has. If it
   has gates, add a gate. If it has a checklist, add a line. If it has a report,
   add the count. The check should surface: total in-scope mentions in visible
   text, how many are location-clear, NAID count which must be zero, and whether
   the anchor is present.

---

## REFERENCE IMPLEMENTATION

The SEO Audit patch went well. It shipped as v10.13.1 and four of its decisions
are worth copying. Ask for the file if you want to read it.

1. GATE SPLIT BETWEEN SELF-CAUSED AND INPUT-CAUSED FAILURE. Its compliance gate
   checks three things separately: did this prompt add a non-compliant mention,
   are there zero NAID survivors, and is the output over budget. If it is over
   budget because the INPUT was non-compliant, it does not remediate. It reports
   "run R2 Clean Prompt before publish" and stops. Reasoning: two prompts
   remediating the same content will drift.

2. A COMPLIANCE BASELINE REGISTERED UP FRONT. Before anything runs, it counts
   in-scope mentions and records for each whether it is location-clear and whether
   it is a claim or education. That baseline is what makes the self-versus-input
   distinction possible at the end.

3. THE ANCHOR TREATED AS INFRASTRUCTURE, NOT CONTENT. Registered alongside tel
   links and form modules, preserved character-perfect. Never removed, never
   reworded, never moved. For a generator the equivalent is: the anchor is not
   optional output and not subject to variation.

4. WORD COUNT CAUGHT AT SPEC LEVEL. The audit chat noticed an answer block shape
   in the brief was 34 words against a 40-word floor and supplied a 42-word
   replacement. If you have any minimum-length element that must contain a
   certification, count the words before accepting the pattern.

---

## WHAT MUST NOT DEGRADE

- Design integrity. Grid child counts, card title lengths, stat token lengths.
  Compliance is the goal, design is the binding constraint on how you reach it. If
  a compliant replacement does not fit the slot, pick a different replacement.
  Never resize or restructure the slot to fit the words.
- Answer blocks, 40 to 60 words, still naming STS, the city, and the service.
- Co-occurrence clusters and every named organization in them.
- Attribution patterns. At least one should survive if your prompt requires them.
- Statistics, employee counts, bed counts, student counts, named sources.
- Heading counts and hierarchy.
- Word budgets and length targets.
- Uniqueness across many outputs. Rotate replacements. Do not let one word get
  used everywhere.
- Brand separation between STS and DCD. Standing hard requirement, unaffected by
  any of this.

---

## HOW TO DELIVER

Surgical edits. Do not rebuild the file. Increment the version with a changelog
block. Deliver a full diff. Every removed line traceable to an intentional
replacement.

Before delivering, grep the patched file for all six terms and confirm every
remaining hit is either an intentional location-clear survivor, an educational
pattern, a negative-scope disclaimer, prose about the prompt itself, or inside a
URL. Report the count.

Then answer these five.

1. Which category is this prompt, A through F?
2. If a VA runs this patched prompt, does the output come out with ZERO in-scope
   terms outside the sts-hq-callout block, with the block present and intact
   where required? If that is not a confident yes, the patch is not done.
3. Quote the sts-hq-callout block from a sample output and confirm it matches the
   v5.4 code character for character apart from the city name.
4. Are there zero NAID survivors? Confirm by count.
5. Would output from this prompt pass R2 Clean Prompt v5.4's VERIFY phase without
   changes? Use v5.4 and nothing older. v4.8 and earlier still check
   location clarity, which was retired, so they will pass output that v5.4 fails.
   The prompts must agree. Output passing one and failing the other means the
   rules diverged somewhere.

Then, separately, say what you would change about this brief. You have context it
does not. If the allocation is costing something it should not be, surface that
now rather than after the content ships.

SPEAK UP WHERE YOU DISAGREE. An objection with a mechanism attached is more useful
than compliance. The allocation is fixed because it came from the consultant and
the COO, not from SEO reasoning. Everything about how to hit it is yours.
