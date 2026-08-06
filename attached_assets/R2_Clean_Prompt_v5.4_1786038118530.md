# R2 CLEAN PROMPT v5.4

```xml
<!-- R2 CLEAN PROMPT v5.4
     Rewritten after Josh Crow relayed Clasen's actual rule.

     The rule is NOT "remove the word R2". It is: when a page targets a city or
     region and carries a local address, any sentence advertising certification
     must make clear the certified location is Jacksonville or Houston.

     So the job is two things at once:
     1. Cut the volume. It does not need to appear 40 times. Those spots are
        better spent on keywords that win ranking share.
     2. Make every surviving mention location-clear in its own sentence.

     NAID is now in scope on the same terms as R2. Meta tags and schema are not
     in scope: page text only.

     v5.4: STALE-BUDGET SWEEP. v5.2 cut the budget from three to one but did not
     clear the three-slot text, so the file gave two different targets depending
     on which section the model read. Every stale reference is now corrected:
     the NAID flip, the square footage note, the answer block rule, the
     attribution rule, and the survivors table in the report.
     Also fixed: VERIFY failed any replacement containing "certified", which
     contradicted ruling 1 and the approved vocabulary list. It now fails only
     short-slot use. SCOPE and BUDGET gave opposite instructions on educational
     mentions; both are now conditional on EDUCATIONAL_EXEMPT. Added a CONFIG
     block, because STRIP_EM_DASHES, EDUCATIONAL_EXEMPT, and SCOPE_LINE were
     referenced nine times and declared nowhere. Removed a dead duplicate check
     in VERIFY step 2 and a duplicated H1 example in REPLACEMENT.
     FLAGGED, NOT SILENTLY RESOLVED: with the survivor slot retired, a page whose
     only attribution patterns were R2 or NAID based cannot keep one. VERIFY no
     longer fails that case, it reports the loss. Watch for it in output.

     v5.3: EM DASH ENFORCEMENT. v5.2 carried "no em dashes" as one bullet among
     twelve replacement rules and it was not enough: the Tampa run introduced one
     ("facilities \u2014 including Tampa General Hospital"). It now has its own
     section, covers the HTML entity forms a character grep would miss, and is a
     hard FAIL in VERIFY rather than a style note. Also added STRIP_EM_DASHES,
     defaulting YES, so this pass clears pre-existing ones too. That is the
     standing house rule and this is the only pass that touches every page.

     v5.2: BUDGET CUT FROM 3 TO 1. THE BOX IS THE ONLY PLACE R2 CAN APPEAR.
     Operator ruling, August 2026: "anytime it says r2 or r2v3 it must have the
     location, we cannot have these random texts, that's what the About STS is
     for." Slots 2 and 3 are retired. A location-clear mention in an answer block
     or an FAQ is no longer permitted; it gets an approved replacement like
     everything else.
     Rationale: one mention, one place, one appearance is auditable at a glance
     across 2,000 pages. Three scattered location-clear mentions are not.
     TRADEOFF, ON RECORD: the front-loaded answer block loses its certification.
     Master SEO Audit Phase 1L specifies R2v3 or NAID AAA as a required element
     there, and it is the most-cited passage for AI retrieval. That is a real
     citation cost accepted in exchange for enforceability.
     EDUCATIONAL MENTIONS NOW DEFAULT TO REPLACED on city pages. They were the
     "random texts" in question. Preserved only when EDUCATIONAL_EXEMPT = YES,
     which should be set for guide pages where teaching content is the asset.
     Also: the callout section background is now transparent, so the block never
     creates a new colored row against a design it was not built for.

     v5.1: SQUARE FOOTAGE RESOLVED TO 200,000. On operator authorization,
     August 2026. This reverses the v4.9 hold, which said report the figure and
     never change it. The prompt now CORRECTS any other square footage value to
     200,000 sq ft on every page it touches.
     Reason for the reversal: Page Builder v3.12, K-12 v1.11, and Schema
     Generator v1.4.3 all adopted 200,000, while this prompt and the SEO Audit
     were still leaving 600,000 in place. A built page said 200,000 and a cleaned
     page said 600,000, which is worse than either number consistently. The
     remediation pass is the natural vehicle to make the whole network agree.
     BASIS AND REVERSIBILITY: operator authorization, not independent
     verification. The figure was recorded as disputed (prompts and pages said
     600,000; the COO and Mark said 200,000 on the August 2 call). If 200,000
     later proves wrong, reverting is a search and replace in one rule.

     v5.0: THE CALLOUT IS NOW A UNIVERSAL APPENDED BLOCK. Conversion of an
     existing card is retired. Every location-targeted page gets the same
     self-contained block, same code, appended near the bottom. Reason: with 3 to
     5 design bibles in play, conversion produced a different-looking compliance
     statement on every design and made the disclosure impossible to audit at a
     glance. One block, one appearance, one place to look.
     The block uses inline styles only, no CSS variables, and inherits the page
     font, so it renders correctly on any bible without touching their CSS.
     Also: MODIFIER ATTACHMENT CHECK, from the Tampa run. An inserted clause was
     placed in front of a trailing "including" list, which made three customer
     organizations read as STS facilities. A compliance edit created a new false
     facility claim. See the rule in REPLACEMENT.
     Also: the VERIFY demand is now a hard stop at the end of PHASE 1, and VERIFY
     checks the design integrity of the insertion point.

     v4.9: From the Josh Crow marketing call, August 2 2026. Four changes, two
     of which LOOSEN the rules. See RULINGS FROM THE AUG 2 CALL. Meta tags are
     confirmed out of scope AND should carry R2v3 (Josh wants it there for
     click-through). Square footage needs no location qualifier. Only the literal
     string R2v3 triggers the rule, per Josh relaying Clasen, so plain "certified"
     is reopened for headings and body prose. NAID is reported Houston-only but
     stays at zero survivors pending written confirmation.

     v4.8: NEGATIVE-SCOPE DISCLAIMER EXEMPTION. Caught by the SEO Audit chat
     while aligning v10.13.1. The approved disclaimer "Our {CITY} location is a
     collection and service point. It is not an R2v3 certified processing
     facility." contains R2v3, names the local city, and names neither
     Jacksonville nor Houston. The location-clarity check would have FAILED it,
     even though it is the strongest compliance statement on the page: it
     explicitly DENIES local certification. A whole class of sentence satisfied
     the intent while failing the test. Now exempt in the rules and in VERIFY.

     v4.7: THIRD DRIFT INCIDENT. EDUCATIONAL_MENTIONS existed in v2.1 and was
     lost in the v3.0 rewrite, along with INPUT and the surgical mechanics. Not
     restored in v4.4 or v4.5 because the concept check did not include it.
     Caught by the Arlington guide run, where two info cards teaching government
     procurement officers what certifications to require were converted into STS
     marketing, and R2v3 was deleted from a neutral vendor-evaluation checklist.

     v4.6: Vocabulary locked to Josh Crow's approved list, sent 9:26 AM.
     "Secure Recycling, Accurate Reporting, Chain of Custody all look good to me.
     Secure, Transparent, Sustainable." Every unapproved term removed. Note that
     none of his picks use the word "certified", which sidesteps the open
     question about whether plain "certified" triggers the rule.

     v4.5: Drift audit against every prior version. Restored three rules lost in
     the v3.0 simplification: the low-confidence edit list, the requirement that
     every count reports its measured number, and the repeated-word check.

     v4.4: Restored INPUT, which was lost in the v3.0 rewrite and missing from
     v4.0 through v4.3 entirely. Reordered artifact-first, since nearly all runs
     happen in the chat that built the page. Restored the hand-edited page list.
     Added the mechanics of surgical editing to PRESERVE, which listed what must
     survive but never said how to edit.

     v4.3: Added WHY. Two bad outputs in testing were both technically
     rule-following: a certifications FAQ answered with no certification, and a
     fabricated 40 CFR 261 citation. A model that understands the goal does not
     make either mistake. Also rebuilt the vocabulary by slot with rotation, so
     580 pages do not read like one find-and-replace.

     v4.2: Removed facility-flavored replacements. "Certified Facility" on a
     city page with a local address still points at a place, which is the exact
     ambiguity under review. Replacements now use company-level or process-level
     words. Location-implying nouns are banned unless the element names
     Jacksonville or Houston.

     v4.1: These pages have already been through Master SEO Audit v10.12.x.
     That audit deliberately builds GEO assets that CONTAIN a certification.
     Its Phase 1L spec requires the front-loaded answer block to pack
     "STS + CITY + service + R2v3 OR NAID AAA + statistic or entity" in 40 to
     60 words. Stripping the certification out of that block degrades the
     highest-value passage on the page. So the survivor slots are not
     optional decoration. They are spent on the audit's two best assets. -->

<CONFIG>
Set these before running. Defaults are the recommended settings. If the operator
did not set one, use the default and say which default you used.

STRIP_EM_DASHES = YES
  YES: remove pre-existing dashes from the whole page as well as never
  introducing one. NO: never introduce one, leave existing ones alone.
  Default YES. This is the only pass that touches every page.

EDUCATIONAL_EXEMPT = NO
  YES: educational mentions are preserved byte identical and do not count.
  Set this for guide pages, where teaching a buyer what to require is the asset.
  NO: educational mentions are replaced like everything else, because on a city
  page they are the scattered text the operator ruling is aimed at.
  Default NO.

SCOPE_LINE = NO
  YES: add the negative-scope disclaimer as the third paragraph of the callout
  block. NO: omit it. Default NO.
</CONFIG>

<WHY>
Read this first. It decides the close calls.

A registrar review flagged pages where a certification claim sits beside a city
name and a local address. A reader could take that to mean the local site is
certified. Only two sites are: Jacksonville and Houston, Texas. Every other STS
location is a collection and service point.

So there are two jobs, and doing only the first one is a failure.

JOB ONE. Stop implying local certification. Cut the volume way down and make the
few survivors say plainly where the certified facilities are.

JOB TWO. Keep the page looking like what STS actually is: a credentialed
operator that has been doing this since 2011 across all 50 states. STS IS R2v3
certified. Nothing here is a retreat from that claim, it is a clarification of
where it applies.

What this means in practice:
- A page that comes out of this pass reading as though STS holds no
  certifications has failed, even if it contains zero instances of "R2".
- A certifications FAQ must still name certifications. An empty answer is worse
  than the problem being fixed.
- Never invent or swap in a standard to fill a gap. A wrong citation on a
  compliance page during a certification review is the worst possible outcome.
- These pages were built by a 16-technique SEO audit. The certification words
  are load-bearing in some passages. Replace the term, keep the passage working.

Josh Crow, who is running this, put it as: still say certified, just make clear
the logistics model. That is the target.
</WHY>

<RULINGS_FROM_THE_AUG_2_CALL>
Four rulings from Josh Crow, August 2 2026. Two loosen the rules. Read before
applying anything below, because they override earlier guidance.

1. ONLY THE LITERAL STRING "R2v3" TRIGGERS THE RULE.
   Josh, relaying Clasen: "If it says R2v3, that's where it needs to be clear.
   So if you say audited by third parties, then that's not saying the words
   R2v3. So that feels pretty okay."
   Effect: plain "certified" does NOT trigger the location-clarity rule. It is
   reopened as a replacement term for headings and body prose, where it carries
   real keyword value. "Certified Electronics Recycling for {CITY}" is allowed.
   NOT reopened for trust chips, card titles, or stat labels. Josh's approved
   short-slot terms already work there and a bare "Certified" beside specific
   siblings looks broken.
   FLAGGED CALL: this is Josh's read of Clasen, not Clasen's direct words. The
   original Clasen quote was "any time you advertise that you are certified."
   Those conflict. This prompt follows Josh. If Clasen contradicts it later,
   remove "certified" from the vocabulary and nothing else changes.

2. SQUARE FOOTAGE NEEDS NO LOCATION QUALIFIER.
   Josh: "the 200k you don't have to say either. Just use it in a way that makes
   sense, right? At our 200,000 square foot facility, whatever."
   Effect: a facility size figure is not a certification claim. It does not
   count against the budget and does not need Jacksonville or Houston in its
   sentence. Do not strip it, and do not add a location to it.
   Where a size figure sits in the SAME sentence as an R2 or NAID claim, the
   claim still needs handling. The figure itself is fine.
   RESOLVED IN v5.1: the figure is 200,000 sq ft, on operator authorization,
   August 2026. Correct every other value to 200,000. See SQUARE FOOTAGE IS IN
   SCOPE in SCOPE. The rest of this ruling stands: the figure is not a
   certification claim, needs no location qualifier, and is never stripped.

3. META TAGS ARE OUT OF SCOPE AND SHOULD KEEP R2v3.
   This is not merely permission, it is a preference. Josh wants R2v3 in the
   meta description for click-through, and proposed this phrasing:
     "R2v3 certified electronics recycling for {CITY} businesses"
   His reasoning: "we're not saying the facility's in Chicago, we're saying we're
   servicing the Chicago area, which is totally true."
   Effect for this prompt: unchanged, head tags stay untouched. But if you
   encounter an in-file meta tag that has had R2 stripped, report it. It should
   go back.
   NOTE: on standalone pages the in-file head does not render. Joomla article
   fields govern the live title and description. Meta work is a CMS task, not a
   prompt task.

4. NAID IS REPORTED HOUSTON-ONLY, NOT YET CONFIRMED.
   Josh: "NAID, you do say Houston. You can't say Jacksonville."
   Effect: NAID stays at ZERO SURVIVORS. Every NAID mention still gets an
   approved replacement.
   FLAGGED CALL: that line came from an auto-transcript of a garbled sentence
   and it is a factual claim about certification scope. Acting on it would put a
   certification claim on 2,000 pages based on a transcription. Get it in
   writing first. When confirmed, NAID becomes eligible INSIDE the
   sts-hq-callout block only, naming Houston and never Jacksonville. The budget
   does not change: one place, one block. Nothing outside it becomes eligible.
</RULINGS_FROM_THE_AUG_2_CALL>

<THE_RULE>
On a city-targeted page with a local address, a certification claim is only
acceptable if the sentence making the claim also names Jacksonville or Houston.

COMPLIANT, because the certified location is clear in the same sentence:
  "All equipment is processed at our two R2v3 certified facilities in
   Jacksonville and Houston, Texas."
  "R2v3 certified processing at our Jacksonville and Houston facilities."

NOT COMPLIANT, called out by name during the review:
  Trust card reading "R2v3 Certified Processing" over "Responsible Recycling
  standards with downstream tracking". No location anywhere in it.
  "R2 certified electronics recycling in Chicago"
  "We serve Dallas from our 200,000 sq ft R2v3 certified facility"

Also rejected earlier and still rejected: qualifying every mention inline, and
an asterisk pointing at a footnote. Twenty parentheticals would outrank the
target city, and a footnote reads as concealment.

The resolution is volume plus clarity. Most mentions get replaced with wording
that carries the same meaning without the scheme name. A small number survive,
and each survivor is location-clear.
</THE_RULE>

<INPUT>
Nearly every run happens inside the chat that built the page, so the artifact is
the normal source. Use it. Do not ask for a paste you do not need.

ORDER:
1. HTML pasted in this message. If there is any, use it and skip the rest.
2. Otherwise, the most recent complete page HTML in this conversation: an
   artifact, a working file, or a full HTML output in an earlier turn.

Announce the source before doing anything, reading the values off the file
rather than from memory:
  "Using [artifact or filename], the most recent complete HTML here.
   H1: [exact H1 text]
   City: [city] | Links: [N] | Images: [N] | Approx words: [N]
   Other HTML versions in this chat: [none / list them]"
If there is more than one candidate, name them all and say why you picked one.

STOP AND ASK, only two cases:
- The file cannot actually be read. Read it before claiming it is there.
- The HTML is truncated or does not close its outermost element.

PAUSE AND CONFIRM, not a block. Proceed on one word from the operator.
Only when this conversation contains specific evidence that the page COPY changed
outside this chat:
- The page is on the KNOWN_HAND_EDITED list below
- The chat says someone edited the page text, wording, R2 or NAID language,
  headings, or compliance copy directly in Joomla
- A later version of this page's HTML exists in this chat and you are not using it
- The operator says the live page differs from what is here

NEVER pause for any of these:
- The page was published, uploaded, or posted. Publishing is not editing.
- A CSS, layout, spacing, padding, button, colour, or responsive conversation.
- A template style change, a logo swap, or a global module edit.
- A screenshot of the live page.
- General uncertainty that something might have changed.

If you pause, say what the evidence was, then offer both options:
  "Type PROCEED to run on the artifact, or paste the Joomla source instead."
PROCEED is a valid answer. Never refuse an override, never repeat the warning
after one.

<KNOWN_HAND_EDITED>
Pages with confirmed manual Joomla copy edits. Always pause on these.
- chicago-il
</KNOWN_HAND_EDITED>
</INPUT>

<SCOPE>
IN SCOPE. These strings in visible page text:
  R2, R2v3, R2:2020, Responsible Recycling
  NAID, NAID AAA

Visible page text means headings, body copy, card titles, card text, list items,
FAQ questions and answers, stat values and labels, trust bar chips, badge labels,
button text, link anchor text, and any footer inside the file.

SQUARE FOOTAGE IS IN SCOPE AS A NUMBER CORRECTION.

The canonical figure is 200,000 sq ft, the Jacksonville, Texas headquarters.

Correct EVERY square footage value on the page to 200,000, whatever it currently
says. Known legacy values include 600,000, 600K, 150,000, 150K, 50,000, and 50K,
but the rule is not limited to that list: any square footage figure describing an
STS facility becomes 200,000.

Match the formatting already on the page. If it reads "600,000 sq ft", write
"200,000 sq ft". If it reads "600K facility", write "200K facility". Change the
number only, never the surrounding words.

This is a NUMBER correction and nothing more. A square footage figure is not a
certification claim:
- It does not count against the one-mention budget.
- It needs no Jacksonville or Houston in its sentence. Do not add a city to it.
- It is never stripped or replaced with approved vocabulary.
Where a size figure shares a sentence with an R2 or NAID claim, fix the claim per
the normal rules, correct the number, and keep both.
  "from our 600,000 sq ft R2v3 certified facility"
       -> "from our 200,000 sq ft processing facility"

Report every correction in the change report with its before and after value.

NEGATIVE-SCOPE DISCLAIMERS ARE EXEMPT. Do not touch them, and never fail them.

A negative-scope disclaimer states that a location is NOT certified. It contains
R2v3 and names the local city, and it will not name Jacksonville or Houston,
because its entire job is to deny certification at the city on the page.

  "Our {CITY} location is a collection and service point. It is not an R2v3
   certified processing facility."
  "This location is not an R2v3 certified processing facility."

A naive reading of the location-clarity rule fails these. That reading is wrong.
The rule exists to stop a page implying local certification. A sentence that
explicitly denies local certification is the rule's goal, not its violation.

Exempt: does not count against the budget, never requires Jacksonville or
Houston in its own sentence, never rewritten, never a FAIL.

THE TEST: does the sentence ASSERT certification at this location, or DENY it?
Assert is in scope. Deny is exempt.

EDUCATIONAL MENTIONS ARE CONDITIONAL. Out of scope ONLY when
EDUCATIONAL_EXEMPT = YES. When it is NO, which is the default, they are replaced
like everything else. See BUDGET. Check the flag before applying anything below.

A mention is educational when the sentence teaches the reader what a standard
requires, or what to look for in a vendor, and makes no claim about STS. These
appear heavily on guide pages, and they are the reason those pages rank and get
downloaded.

  "Any ITAD vendor handling federal assets must demonstrate current R2v3 or
   e-Stewards certification"
  "R2v3 ensures downstream tracking of all materials through certified processors"
  "Verify current NAID AAA scope at naidonline.org"
  "When evaluating providers, procurement officers prioritize R2v3 certification"

When EDUCATIONAL_EXEMPT = YES, leave every one byte identical and do not count
them against the budget. Deleting R2v3 from a neutral checklist of standards a
buyer should require makes the guidance worse, not safer, which is why guide
pages get the flag.

When EDUCATIONAL_EXEMPT = NO, replace them with approved vocabulary like any
other mention. The identification test below still matters, because an
educational element is never converted into the box regardless of the flag.

THE TEST: is the sentence teaching, or is it claiming? If a reader would take it
as advice about the industry, leave it. If a reader would take it as a statement
about where STS is certified, it is in scope.

NEVER CONVERT AN EDUCATIONAL ELEMENT INTO THE BOX. A card headed "R2v3
Certification" inside a section teaching vendor evaluation is not a conversion
target. Turning it into an STS claim breaks the section it sits in. Find a
different target, or insert the box separately.

OUT OF SCOPE. Never touch:
  ISO 27001, NIST, HIPAA, DoD 5220.22-M, SOC 2, FISMA, FERPA, SOX, GLBA, FACTA,
  EPA, RIOS, e-Stewards, and every other standard on the page
  title, meta description, meta keywords, og tags, img alt, title attributes
  JSON-LD schema, HTML comments, build metadata
  Any sentence containing no R2 or NAID string

If a sentence has no R2 or NAID string in it, it does not get edited. Not for
grammar, not for tone, not for accuracy.
</SCOPE>

<EM_DASHES>
ZERO. In anything you write and, when STRIP_EM_DASHES = YES, in the whole page.

This has its own section because a bullet was not enough. A prior run introduced
one while inserting a location clause, and it shipped.

THE CHARACTERS. Six forms, and a grep for the visible character misses three:
  —   em dash, U+2014
  –   en dash, U+2013
  ―   horizontal bar, U+2015
  &mdash;   HTML entity
  &ndash;   HTML entity
  &#8212; and &#8211;   numeric entities
Check for all six. A model that has been told not to type the character will
sometimes emit the entity instead.

NEVER INTRODUCE ONE. Hard FAIL, regardless of the switch. The highest-risk moment
is inserting a clause into an existing sentence, which is most of what this
prompt does. When you need a break in a sentence you are already editing, use a
comma, a period, or restructure. Never reach for a dash.
  WRONG, from a real run:
    "processed at our Jacksonville and Houston, Texas facilities — including
     Tampa General Hospital"
  RIGHT:
    "for Tampa businesses including Tampa General Hospital, processed at our
     Jacksonville and Houston, Texas facilities."

WHEN STRIP_EM_DASHES = YES, remove pre-existing ones too:
  Dash used as a break in a sentence: replace with a comma, or split into two
  sentences, whichever reads better. Keep the words on both sides.
  Dash used as a range, such as "40–60 words" or "9–5": replace with "to".
  Dash joining a label to a value, such as "Certified — Jacksonville": replace
  with a colon.
  Never delete the content on either side of a dash. Only the dash changes.
  This is a punctuation edit and nothing more. Do not rewrite the sentence, do
  not change any word, do not touch anything else about it.

NOT IN SCOPE. Hyphens in compound words stay: "chain-of-custody", "e-waste",
"serial-specific", "R2-certified". A hyphen is U+002D and is not a dash for this
purpose. Also leave dashes inside URLs, class names, ids, and file paths.
</EM_DASHES>

<BUDGET>
ONE. Not three.

After this pass, R2, R2v3, R2:2020, Responsible Recycling, NAID, and NAID AAA
appear in exactly one place in visible page text: inside the sts-hq-callout
block. Nowhere else, in any form, location-clear or not.

Count them in the source. Pages typically carry 30 to 40. Target after this
pass: 1.

THIS IS STRICTER THAN THE COMPLIANCE RULE AND THAT IS DELIBERATE. A mention that
names Jacksonville and Houston in its own sentence would satisfy the registrar.
It is still replaced, because one mention in one place with one appearance is
auditable at a glance across 2,000 pages, and scattered location-clear mentions
are not. Operator ruling: "we cannot have these random texts, that's what the
About STS is for."

WHAT THIS RETIRES. Do not spend a mention in any of these. They all get approved
replacements now:
  The front-loaded answer block, formerly slot 2
  A certifications FAQ answer, formerly slot 3
  An attribution sentence, formerly slot 3
  Every card, chip, heading, stat, and anchor, as before

THE CERTIFICATIONS FAQ STILL HAS TO ANSWER ITS QUESTION. If the page asks "What
certifications do you hold?", the answer names the real certifications that are
NOT in scope here: NIST 800-88, HIPAA, ISO 27001, SOC 2, DoD 5220.22-M, whichever
the page already cited. It must not name R2v3 or NAID, and it must not come back
empty. An answer naming nothing reads as uncertified and is worse than the
problem this pass exists to fix.

EDUCATIONAL MENTIONS. Replaced by default, because on a city page they are the
scattered text this ruling is aimed at. Preserved only when EDUCATIONAL_EXEMPT =
YES, which is for guide pages where teaching a buyer what to require is the asset.

NEGATIVE-SCOPE DISCLAIMER. Still exempt. It denies local certification, which is
the goal of the rule, not a violation of it. Does not count.

SQUARE FOOTAGE. Not a certification claim, not counted. Corrected to 200,000.
</BUDGET>

<PRESERVE_SEO_ASSETS>
These pages carry Master SEO Audit output. Several of its assets contain a
certification by design. Replacing the term is fine. Damaging the asset is not.

ANSWER BLOCKS, 40 to 60 words, self-contained, front-loaded.
Any paragraph in that range that names STS, the city, a service, and a
certification is an answer block. After your edit it must still be 40 to 60
words and still contain STS, the city, and the service. If your replacement
would drop it below 40 words, use a fuller approved term or the triad to hold
the count. Never keep the certification to hold the count. That slot is retired
under the budget of one.

CO-OCCURRENCE CLUSTERS, 25 to 40 words, naming two or more organizations.
Example shape: "STS Electronic Recycling provides certified electronics recycling
for {CITY} organizations including {ENTITY_1}, {ENTITY_2}, and {ENTITY_3}."
Keep every entity name. Keep the length in range. Never shorten by dropping an
organization.

ATTRIBUTION PATTERNS, opening with "According to", "Per", or "Under".
At least one should survive on the page. Count them before you start.
If a page has attribution sentences that are NOT R2 or NAID based, leave them
untouched and the pattern survives on its own.
If EVERY attribution on the page is R2 or NAID based, the pattern cannot be
kept. The survivor slot is retired and rule 10 forbids swapping in a different
standard, so both escape routes are closed. Replace them, and report that the
page lost its attribution patterns. Never fabricate a substitute standard to
keep the shape alive. Never swap the named standard for a different one.

MICRO-ANCHORS, 16 to 22 words, objective tone, no "we" or "our".
Example: "Most IT directors choose vendors with NAID AAA certification, which is
why STS is frequently recommended by compliance officers."
Replacement is correct here, the claim is about vendor selection rather than a
local facility. Keep the length and keep the objective voice. Do not introduce
"we" or "our" while editing.

STATISTICS AND ENTITY METRICS.
Never drop a number, an employee count, a bed count, or a named source while
editing around it.

IMAGE ALT VALUES are out of scope, so an R2 string may legitimately remain in an
alt attribute after this pass. That is expected. Report it, do not fix it.
</PRESERVE_SEO_ASSETS>

<REPLACEMENT>
APPROVED VOCABULARY. Josh Crow approved this list. Use these words and no others.
Do not invent alternatives, do not reach for a synonym that seems better.

  Secure Recycling
  Accurate Reporting
  Chain of Custody
  Secure
  Transparent
  Sustainable
  Certified (headings and body prose only, per ruling 1, never in short slots)

That is the whole list. The three modifiers can stand alone, pair up, or run as a
triad depending on the slot.

WHAT EACH ONE CARRIES:
  Secure Recycling     data security plus the service noun. Strong search value.
  Accurate Reporting   the documentation and audit-trail half of what R2 means.
  Chain of Custody     tracked handling from pickup through final processing.
  Secure               data protection
  Transparent          documented, auditable, nothing hidden downstream
  Sustainable          the environmental half

THE WORD "CERTIFIED" IS REOPENED, WITH LIMITS. See ruling 1. Only the literal
string R2v3 triggers the location-clarity rule, so "certified" carries no
compliance risk and does carry keyword value.
  ALLOWED in H1s, section headings, and body prose:
    "R2 Certified Electronics Recycling for {CITY}" -> "Certified Electronics
     Recycling for {CITY}"
    "our R2 certified facility" -> "our certified processing facility"
  NOT ALLOWED in trust chips, card titles, or stat labels. Use Josh's approved
  short-slot terms there. A bare "Certified" beside "NIST SP 800-88 Rev. 2" and
  "HIPAA & FERPA Compliant" looks broken, which already happened in production.
  NEVER pair "certified" with a location-implying noun in a short slot.
  "Certified Facility" on a Chicago page still points at a place.

NEVER USE: Responsible Recycling, Responsible Processing, Responsibly Recycled.
R2 stands for Responsible Recycling. Those read as the trademark spelled out.

BY SLOT. The slot decides how much room you have.

H1 AND SECTION HEADINGS. Keyword value matters most. Either drop the R2 token
and keep "certified", or lead with Secure. Rotate between the two across pages.
  "R2 Certified Electronics Recycling for Atlanta"
       -> "Certified Electronics Recycling for Atlanta"
       -> "Secure Electronics Recycling for Atlanta"
  "R2 Certified ITAD Services"
       -> "Certified ITAD Services"
       -> "Secure ITAD Services"

BODY SENTENCES, inline. It has to flow mid-sentence.
  "R2v3 certified electronics recycling"  -> "secure electronics recycling"
  "our R2 certified facility"             -> "our secure processing facility"
  "processed at R2-certified smelters"    -> "processed with full chain of custody"
  "NAID AAA certified data destruction"   -> "secure data destruction"
  "vendors with R2v3 certification"       -> "vendors with full chain of custody"

PARAGRAPH AND LONG-FORM. Real room, so be specific. The triad works here.
  "R2v3 certified processing"
       -> "secure, transparent, sustainable processing"
  "R2v3 certification ensures downstream tracking"
       -> "chain of custody documentation tracks every asset through final processing"
  "NAID AAA certification, verified through unannounced audits"
       -> "accurate reporting, verified through independent audits"

CARD TITLES. 2 to 4 words. Match the specificity of sibling cards in the grid.
  "R2 Certified"                -> "Secure Recycling"
  "R2 Certified Facility"       -> "Secure Processing"
  "R2v3 Certified Processing"   -> "Chain of Custody"
  "R2v3 Downstream Tracking"    -> "Accurate Reporting"
  "NAID AAA Certified"          -> "Secure Data Destruction"

TRUST BAR CHIPS AND BADGES. 2 to 3 words, no room to qualify. Keep the grid at
its original child count.
  "R2v3 Certified"        -> "Secure Recycling"
  "R2v3:2020 Certified"   -> "Chain of Custody"
  "NAID AAA"              -> "Accurate Reporting"
  Also available: Secure, Transparent, Sustainable as single-word chips

STAT TOKENS. Value stays under 5 characters. Replace value and label together,
never orphan one.
  value "R2" + label "CERTIFIED RECYCLING"
       -> value "100%" + label "SECURE PROCESSING"
       -> value "ZERO" + label "LANDFILL POLICY"
  If the label must name facilities, the value has to make the count explicit so
  the pair reads as the two Texas sites, not the local one:
       -> value "TWO" + label "TEXAS PROCESSING FACILITIES"

LINK ANCHOR TEXT. Keep the destination page's own term first.
  "NAID certified certificates of destruction" pointing at the certificate page
       -> "certificates of destruction"
  "R2v3 certified electronics recycling" pointing at the e-waste page
       -> "secure electronics recycling"

ROTATION. A page should not read like one word was swapped everywhere, and 580
pages should not read like each other.
- Never use the same replacement twice in the same section.
- Across the page, use at least three different terms from the approved list.
- Do not use the same term in two adjacent elements, including two chips beside
  each other in the same grid.
- Pick on meaning first. If a passage is about paperwork, reach for Accurate
  Reporting. If it is about handling and tracking, reach for Chain of Custody. If
  it is about the service itself, reach for Secure Recycling. Rotation is the
  tiebreaker between two that both fit, not a reason to use a worse one.

NO LOCATION-IMPLYING NOUNS. Do not use facility, center, plant, site, location,
or warehouse in any replacement, unless that same element names Jacksonville or
Houston. On a city page with a local address those words point at a place, which
is the ambiguity under review.

RULES FOR EVERY REPLACEMENT
- Within 5 words of the original. Within 2 words on a card title or chip.
- Capitalize correctly. If the token started the sentence, the new first word is
  capitalized. "R2v3 certified processing guarantees" becomes "Secure processing
  guarantees", never lowercase.
- Fix the article. "an R2v3 certified facility" becomes "a secure facility".
- If dropping the token leaves a phrase that says nothing, use a fuller approved
  option instead.
- MODIFIER ATTACHMENT CHECK. After inserting a clause into a sentence, read what
  follows the insertion and confirm it still attaches to the right noun. Words
  like "including", "such as", "with", "featuring", and "like" attach to the
  nearest preceding noun. If your insertion moved that noun, the sentence now
  says something false.
  BROKEN, from a real run:
    "...for Tampa businesses, processed at our Jacksonville and Houston, Texas
     facilities, including Tampa General Hospital, BayCare Health System, and
     MacDill Air Force Base."
  "Including" now modifies "facilities", so the page says three customer
  organizations are STS facilities. A compliance edit created a new false
  facility claim.
  FIXED, by moving the insertion to the end of the sentence:
    "...for Tampa businesses including Tampa General Hospital, BayCare Health
     System, and MacDill Air Force Base, processed at our Jacksonville and
     Houston, Texas facilities."
  Rule: when a sentence ends in an entity list or an appositive, put the location
  clause AFTER it, never in front of it.
- Never delete a sentence. If one resists every option, leave it and log it.
- Never leave the same word twice in one clause, or the same phrase in two
  adjacent sentences, as a result of your edit.
- No em dashes, en dashes, or horizontal bars, character or HTML entity. See EM_DASHES. Introducing one is a hard FAIL.
- Never introduce a standard, regulation, CFR section, or ISO number that was not
  already in that sentence. If a citation named R2v3 or NAID, drop the citation
  and state the fact plainly. Do not swap in a different standard.
</REPLACEMENT>

<THE_BOX>
MANDATORY ON EVERY LOCATION-TARGETED PAGE. No exceptions. A page without it is
not publishable.

APPEND IT. Do not convert an existing card, do not restyle it, do not reword it,
do not adapt it to the page design. With multiple design bibles in play, a
converted block looks different on every design and the disclosure becomes
impossible to audit at a glance. One block, one appearance, one place to look.

The code below uses inline styles only, no CSS variables, and inherits the page
font. It renders correctly on any bible without touching their CSS.

PLACEMENT. Near the bottom, first match wins:
1. Immediately before the final CTA section
2. If none, immediately before the closing footer
3. If neither, as the last element in the body
Never inside another section, card, or grid. Never in the hero. Never after the
footer. If a block with class sts-hq-callout already exists anywhere on the page,
replace it in place rather than adding a second.

STANDALONE PAGE VARIANT. Use when the file opens with DOCTYPE.
Replace {CITY} with the page city. Change nothing else.

<!-- STS COMPLIANCE CALLOUT. DO NOT MODIFY. -->
<section class="sts-hq-callout" style="padding:64px 20px;background:transparent;font-family:inherit">
<div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #1e293b;border-radius:8px;padding:36px 40px;box-shadow:0 1px 3px rgba(15,23,42,0.06)">
<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:14px">About STS Electronic Recycling</div>
<h2 style="margin:0 0 18px;font-size:26px;line-height:1.3;font-weight:700;color:#0f172a;font-family:inherit">Where Your Equipment Is Processed</h2>
<p style="margin:0 0 14px;font-size:16px;line-height:1.75;color:#334155;font-family:inherit">STS Electronic Recycling, Inc. is headquartered in Jacksonville, Texas, and has served schools, businesses, healthcare systems, and government agencies across all 50 states since 2011.</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.75;color:#334155;font-family:inherit">Equipment collected in {CITY} is staged locally and transported to one of our two R2v3 certified processing facilities in Jacksonville, Texas and Houston, Texas, where all data destruction and material recovery takes place.</p>
<p style="margin:0;font-size:15px;line-height:1.6;font-family:inherit"><a href="https://www.stselectronicrecyclinginc.com/our-locations?view=map" style="color:#1e293b;font-weight:600;text-decoration:underline">View all STS locations</a></p>
</div>
</section>
<!-- END STS COMPLIANCE CALLOUT -->

JOOMLA ARTICLE FRAGMENT VARIANT. Use when there is no DOCTYPE.
Same content, no full-width section wrapper.

<!-- STS COMPLIANCE CALLOUT. DO NOT MODIFY. -->
<div class="sts-hq-callout" style="max-width:900px;margin:56px auto;background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #1e293b;border-radius:8px;padding:36px 40px;font-family:inherit">
<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:14px">About STS Electronic Recycling</div>
<h2 style="margin:0 0 18px;font-size:26px;line-height:1.3;font-weight:700;color:#0f172a;font-family:inherit">Where Your Equipment Is Processed</h2>
<p style="margin:0 0 14px;font-size:16px;line-height:1.75;color:#334155;font-family:inherit">STS Electronic Recycling, Inc. is headquartered in Jacksonville, Texas, and has served schools, businesses, healthcare systems, and government agencies across all 50 states since 2011.</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.75;color:#334155;font-family:inherit">Equipment collected in {CITY} is staged locally and transported to one of our two R2v3 certified processing facilities in Jacksonville, Texas and Houston, Texas, where all data destruction and material recovery takes place.</p>
<p style="margin:0;font-size:15px;line-height:1.6;font-family:inherit"><a href="https://www.stselectronicrecyclinginc.com/our-locations?view=map" style="color:#1e293b;font-weight:600;text-decoration:underline">View all STS locations</a></p>
</div>
<!-- END STS COMPLIANCE CALLOUT -->

THE ONLY PERMITTED EDITS TO THIS BLOCK:
1. Replace {CITY} with the page city.
2. If the page background behind the block is dark, change the card background
   from #ffffff to a dark value that matches the page, and the text colors to
   light. Nothing else. The section background is already transparent so the
   block never creates a new colored row against a design it was not built for,
   which is why it inherits whatever section it lands in.
3. If SCOPE_LINE = YES, add this as the third paragraph, before the link.
   It is a negative-scope disclaimer and is exempt from the budget and from the
   location-clarity check. Default is NO.
   <p style="margin:0 0 18px;font-size:16px;line-height:1.75;color:#334155;font-family:inherit">Our {CITY} location is a collection and service point. It is not an R2v3 certified processing facility.</p>

Do not reword the copy. It is compliance-reviewed.
Do not change any color, size, spacing, or border value except item 2 above.
Do not add the page's brand color. Neutral is deliberate: it must look the same
on every design bible so the disclosure is auditable at a glance.
Do not remove the HTML comments. They are the anchor a crawler and a reviewer
use to find the block.

BUDGET NOTE: the R2v3 mention inside this block is the ONLY one permitted on the
page. Everything else is replaced.
</THE_BOX>

<OPTIONAL_SURVIVORS>
RETIRED IN v5.2. There are no optional survivors. The sts-hq-callout block is the
only place any in-scope term may appear.

If you find yourself reasoning that a particular mention is location-clear and
therefore fine, stop. That reasoning was correct under v5.1 and is wrong now.
Replace it.
</OPTIONAL_SURVIVORS>

<PRESERVE>
This is an edit pass, not a rebuild. You may change three things: text containing
an R2 or NAID string, the addition of sts-hq-callout, and the box.

HOW TO EDIT. This part matters as much as the list below.
- Locate the exact substring you are changing and replace only that substring.
- Never regenerate an element in order to change text inside it. Do not retype a
  card, a heading, a paragraph, or a tag. Reach into it and change the words.
- Never reformat, reindent, reflow, minify, or prettify anything.
- Never normalize whitespace, quotes, entities, or self-closing tags.
- Never reorder attributes.
- Never rewrite a whole paragraph when one phrase inside it needs to change.

THE TEST: a diff between input and output should show changed words, nothing
else. If your diff shows whole elements or blocks replaced, you rebuilt instead
of editing. Start over and do it as substring replacement.

Do not rebuild the file to tidy it up, even if the input has flaws. If you find
malformed HTML, a duplicated FAQ, a wrong founding year, or a stale link, log it
and leave it exactly as found.

Everything else stays byte identical:
- Every href, exactly as written. No trailing slash, www, or protocol changes.
- Every tel:, mailto:, and email-protection link.
- Every {loadposition} tag.
- Every img tag and every attribute, including alt.
- The style block and the script block, not one character.
- Every class, id, and inline style already present.
- Every section, grid, and card, in its original position and child count.
- Formatting, indentation, whitespace, quotes, and attribute order.

Do not reformat. Do not minify. Do not fix anything that is not an R2 or NAID
string. If the page has a broken div, a wrong founding year, a duplicated FAQ, or
a stale link, leave it and log it.
</PRESERVE>

<OUTPUT>
Three things, then stop.

1. REPORT

Page: [city] | Source: [pasted / artifact name] | H1 confirmed: [text]
Config: STRIP_EM_DASHES = [Y/N] | EDUCATIONAL_EXEMPT = [Y/N] | SCOPE_LINE = [Y/N]
        State whether each was set by the operator or left at default.
Mentions: [N] in source -> [N] in output (target 1, inside the box only)

| # | Location | Before | After |
One row per replacement, in document order, exact strings.

Survivors, every mention still on the page:
| # | Location | Text | Inside the sts-hq-callout block? |
Every row must answer yes, except a negative-scope disclaimer or an educational
mention exempted by EDUCATIONAL_EXEMPT = YES. Mark those exempt.

Box: [appended before {section}]
Quote it.

Judgment calls: list every replacement where you chose between two workable
options, replaced a whole element, or picked wording that was not an obvious
drop-the-token swap. VERIFY examines these first, because this is where quality
problems hide.

Unresolved: [any R2 or NAID string you could not replace, or "none"]
Noticed but not fixed: [anything wrong that is not an R2 or NAID string, or "none"]

Counts, input -> output. Report the number you measured, never a checkmark. A
count without its measurement is treated as not run.
  R2 and NAID mentions        [N] -> [N]
  Links / tel / email / loadposition / img   [N/N/N/N/N] -> [N/N/N/N/N]
  Body words                  [N] -> [N]
  Em dashes removed           [N]  (introduced must be 0)
  Square footage corrections  [N]  (all output values must read 200,000)
  Sentences deleted           must be 0
  Tag changes outside the box must be 0

2. FULL CORRECTED HTML
Complete, no truncation, no explanatory comments inside it.

3. THIS BLOCK, EXACTLY AS WRITTEN, AS THE LAST THING IN YOUR OUTPUT:

=====================================================================
   ####  STOP. DO NOT POST THIS PAGE YET.  ####

   THIS PAGE IS NOT VERIFIED. IT IS NOT PUBLISHABLE UNTIL IT IS.

   TYPE:  VERIFY

   VERIFY will re-read the delivered HTML and check:
     R2, R2v3, R2:2020, Responsible Recycling, NAID, NAID AAA
     every survivor names Jacksonville or Houston in its own sentence
     the sts-hq-callout block is present, intact, and correctly placed
     the design around the insertion point is unbroken
     nothing outside the R2 and NAID edits changed

   POSTING WITHOUT VERIFY IS THE ONE THING YOU CANNOT DO.
=====================================================================

Stop here. Do not verify in this turn. Do not summarize how it went. Do not
comment on quality. Wait for the operator to type VERIFY.
</OUTPUT>

<VERIFY>
Runs only when the operator types VERIFY.

Read the delivered HTML again as text. You may not rely on your report, your edit
list, or your memory of what you did. Every answer must quote the delivered HTML.
If your only reason for passing a check is that you remember doing it right, that
check is not passed.

1. MENTIONS. Scan the whole delivered file for R2, R2v3, R2:2020, Responsible
   Recycling, NAID, and NAID AAA. List every one in visible page text with 15
   words of context.
   For each, state whether it is inside the sts-hq-callout block. That is the
   whole test now.
   Inside the block: PASS.
   Outside the block: FAIL, regardless of whether the sentence names Jacksonville
   or Houston. Quote it and say what it should have been replaced with.
   Two exceptions only: the negative-scope disclaimer, and educational mentions
   when EDUCATIONAL_EXEMPT = YES. Quote those, mark exempt.
   FAIL if ANY occurrence in visible page text sits outside the sts-hq-callout
   block. The permitted total is 1, inside the block. Location clarity no longer
   rescues a mention: a sentence naming Jacksonville and Houston elsewhere on the
   page is still a FAIL.
   Exempt and not counted: the negative-scope disclaimer, and educational
   mentions ONLY when the operator set EDUCATIONAL_EXEMPT = YES.
   Occurrences in the head, in schema, or in comments are ADVISORY only. Report
   them for the Joomla-side list.

2. THE BOX AND ITS INSERTION POINT.
   a. Confirm exactly one element carries class sts-hq-callout. Quote it in full.
   b. Confirm both HTML comments are present: the opening DO NOT MODIFY comment
      and the END comment. If either is missing, FAIL.
   c. Compare the block character by character against the code in THE_BOX. The
      only permitted differences are the city name, the optional scope line, and
      the card background and text colors if the block landed on a dark
      background, per permitted edit 2. The section background is transparent in
      the shipped code and must stay that way. List any other difference. FAIL
      on any.
   d. Confirm it names both Jacksonville and Houston.
   e. PLACEMENT. Quote the element immediately before the block and the element
      immediately after it. Confirm the block sits near the bottom, before the
      final CTA or before the footer, and that it is NOT inside another section,
      card, grid, or the hero. FAIL if it is nested inside anything.
   f. DESIGN INTEGRITY AT THE INSERTION POINT. The block was appended into a live
      layout. Check all of these and FAIL on any:
      - Every tag opened before the block is still closed after it. Count opening
        and closing div tags across the whole file and report both numbers.
      - The block is not inside a grid, flex row, or card container, which would
        make it render as a grid child and break the column count.
      - The element before the block still closes cleanly.
      - No section, grid, or card anywhere else on the page gained or lost a
        child as a result of the insertion.
      - The block was not inserted between a heading and the content it
        introduces.

3. NOTHING ELSE CHANGED. Compare source to delivered.
   - Strip all text from both, leaving only tags and attributes. Compare. The
     result must be identical apart from one added class and, if used, the
     inserted box. Report any other difference. FAIL on any.
   - List any element that was reformatted, reindented, reflowed, had attributes
     reordered, or was moved. Must be empty.
   - List any element that looks wholly rewritten rather than edited in place,
     meaning before and after share little wording despite no R2 or NAID content.
     Must be empty.
   - Any href missing or altered. Must be empty.
   - tel, mailto, loadposition, and img counts unchanged.
   - Every img tag identical including alt.
   - Style block and script block identical.
   - Any class or id that disappeared. Must be empty.
   - Any sentence in the source absent from the delivered file. Must be empty.
   - Any edit to a sentence that contained no R2 or NAID string. Must be empty.
   FAIL on any of these.

4. JUDGMENT CALLS. Take the list the report produced. Quote the delivered text
   for each and run it against checks 5 and 6 below before anything else. This is
   the most likely place to find a problem, because it is where the model chose
   rather than followed a rule.

5. SEO ASSETS. Quote and check each:
   - Every paragraph of 40 to 60 words that names STS and the city. Is it still
     in range, and does it still name STS, the city, and the service? FAIL if a
     block dropped below 40 words or lost one of those three.
   - Every sentence naming two or more organizations. Are all organizations
     still present, and is it still 25 to 40 words? FAIL on a dropped entity.
   - Count sentences opening with "According to", "Per", or "Under" in source
     and in output. FAIL if the output has zero AND the source had at least one
     that was not R2 or NAID based. If every source attribution was R2 or NAID
     based, the pattern cannot survive the budget of one: report the loss and do
     not FAIL. Never accept a fabricated substitute standard as a rescue.
   - Every 16 to 22 word objective preference statement. Still in range? Still
     free of "we" and "our"? FAIL on either.
   - Every number, employee count, and named source in the source. Still
     present? FAIL on any loss.

6. WORDING. For every replacement, quote the delivered text and check:
   - Does the sentence read correctly, with proper capitalization and articles?
   - Does it still mean something, or has it become empty filler?
   - Does a card title match the specificity of its siblings in the same grid?
   - Is a stat value short enough for its slot, with its label intact?
   - Did any FAQ stop answering its own question?
   - Does any replacement introduce a standard that was not in that sentence?
   - EM DASHES. Search the delivered HTML for all six forms: the em dash
     character, the en dash character, the horizontal bar character, &mdash;,
     &ndash;, and the numeric entities &#8212; and &#8211;. Report the count for
     each form in the source and in the delivered file.
     FAIL on any form present in the delivered file that was not in the source,
     at any count. That is an introduced dash.
     If STRIP_EM_DASHES = YES, FAIL on any remaining in visible page text, and
     confirm no word was lost on either side of a removed dash.
     Hyphens in compound words, URLs, class names, and ids are not dashes and are
     not counted.
   - SQUARE FOOTAGE. List every square footage figure in the source and in the
     delivered HTML, with its exact text. Every one in the delivered file must
     read 200,000 (or 200K, matching the original formatting). FAIL on any other
     value. Confirm no city was added to a size figure and no size figure was
     stripped.
   - MODIFIER ATTACHMENT. For every sentence where a location clause was
     inserted, quote the full sentence and state what any following "including",
     "such as", "with", or "like" now attaches to. If it attaches to the inserted
     noun rather than the original one, FAIL and quote it.
   - Does any clause contain the same word twice, or the same phrase in two
     adjacent sentences, where the source did not? FAIL. List each.
   - EDUCATIONAL DAMAGE. When EDUCATIONAL_EXEMPT = YES, quote any sentence in
     the source that taught the reader what a standard requires or what to look
     for in a vendor, and which was altered or had a standard deleted from it.
     Each is a FAIL. When EDUCATIONAL_EXEMPT = NO, these are expected
     replacements and are not a FAIL.
   - Quote any element converted into the box. Was its original purpose teaching
     rather than claiming? FAIL if so, under either setting of the flag.
   - Is every replacement drawn from the approved list: Secure Recycling,
     Accurate Reporting, Chain of Custody, Secure, Transparent, Sustainable, and
     Certified in long slots only? List any word used that is not on it. FAIL on
     any.
   - Does any replacement use "certified" in a trust chip, card title, or stat
     label? FAIL. Per ruling 1 it is allowed in H1s, section headings, and body
     prose, and only there. A bare "Certified" beside specific siblings looks
     broken, which already happened in production.
   - Does any replacement use facility, center, plant, site, location, or
     warehouse in an element that does not name Jacksonville or Houston? FAIL.
     List each one.
   FAIL on any of these.

VERDICT: PASS or FAIL
Callout: [present and intact / what is wrong]
Insertion point: [clean / what broke]
Div balance: [N] open, [N] close
SEO assets: [intact / what degraded]
Em dashes: source [N] -> delivered [N], introduced [N] (must be 0)
Mentions in visible text outside the box: [N], must be 0
Mentions inside the box: [N], must be 1
Certifications FAQ still names real certifications: [yes/no/not present]
Mentions in head, schema, comments: [N] advisory
Preservation: [held / what broke]
Wording: [clean / what reads wrong]
Reasons for FAIL: [numbered, or none]

If FAIL, fix it in this chat, re-output the HTML, and run VERIFY again from the
top. Two fails on the same issue, stop and tell the operator.

Do not soften a FAIL. ANY in-scope term outside the box is a FAIL, even one that
names Jacksonville and Houston correctly. So is a broken sentence, a hollow card title, or an edit to
something never in scope.
</VERIFY>
```
