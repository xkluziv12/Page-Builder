# Page Terminal Skills Trial: independent review and handoff

## Status and scope

- Reviewed on October 20, 2026 using the installed Claude Code CLI, Sonnet alias, medium effort.
- Claude had only Read, Glob and Grep tools. It was not authorized to edit, run commands, access services, or push.
- Verdict: **ready for a human trial, not production-certified**. No high-severity findings.
- Mark or a VA must perform the actual skill run in claude.ai with `sts-page-builder` uploaded/enabled. This CLI review did not execute that skill.
- Source reviewed: the trial implementation and corrections preserved in workspace commit `401af7c`; Page Terminal source is identical in checkpoint `4166aed`.
- GitHub destination: `xkluziv12/Page-Builder`, branch `skills-trial-page-terminal`.
- Branch base: the preserved `audit-snapshot-80bdd35` snapshot. Only the five trial-related files and this review are added or changed relative to that base. GitHub `main` is not changed.

## What was built

Three separate STS-only tool copies appear in the existing Page Terminal menu:

1. `public/tools/index-skills.html`: Skills Trial: Rebuild.
2. `public/tools/no-gmb-skills.html`: Skills Trial: No GMB.
3. `public/tools/page-terminal-skills.html`: Skills Trial: Service Pages.

The React shell remains the existing shell, not a new duplicate app. It hides trial entries for TechnoCycle and resets selection when changing brand. Each trial has its own localStorage namespace. Live tool HTML files remain byte-identical to the branch's audit-snapshot base.

The trial copies:

- Put the `sts-page-builder` instruction first in Build, Repair and link-verification prompts.
- Offer and enforce only `TIER_1` and `TIER_2` for these city-page flows.
- Reject a stale saved `TIER_3_4` value. National page generation is not added.
- Remove `Stop and alert if errors occur.` from the shared force-prefix.
- Include the pasted Hub+Spoke handoff unchanged in the Build prompt when present.
- Emit a GMB hours block only when the parser found hours in pasted GMB text.
- Preserve the conspicuous red `TOP LOGO 2026 (TESTING TIME)` Joomla checklist label.
- Leave Phase 4/schema boxes unchanged pending a separate schema-skill handoff.

No Mission Control, API, engine, live tool, TechnoCycle tool, CMS, or deployment changes are part of this branch delta.

## Replit's reconciliation of Claude's findings

The complete independent review follows below. These qualifications matter:

1. **Repair context:** the code does omit URL/niche/GMB fields from Repair. It is a targeted repair of an existing artifact, so use the same claude.ai conversation and ensure the artifact is present. We have not independently established that the external skill requires the full Build field set for a contextual repair. Claude's review prompt supplied that as a review criterion; it is not a verified external contract.
2. **GMB placeholders:** the incomplete-input behavior is real, but the `GMB CID (VERIFIED)` label and placeholder fallbacks also exist in the live original. The label was not introduced by the trial, contrary to one sentence in Claude's review. Do not treat a placeholder as verified data. Supply and inspect real approved inputs before the human trial.
3. **Parsed versus raw GMB:** Build carries structured parsed GMB fields. The raw passthrough requirement applies to the Hub+Spoke handoff. The Skills Code lead previously confirmed that the generated GMB fields matched the skill's expected inputs; this review did not inspect the external skill repository.
4. **Hours:** the loose day/time matching is a real trial-parser limitation worth testing. Missing-hours omission does not itself prove that the skill invents hours; Claude's concern about model defaults is a risk hypothesis, not an observed failure.
5. **NO_GMB token:** the Skills Code lead explicitly listed `NO GMB BUILD` as a recognized field/marker. The absence of a literal underscore token is not an established defect.
6. **Phase 4:** schema/HQ-CID reconciliation and the contradictory NO_GMB introductory wording remain deferred. They are not resolved by these prompt corrections.
7. **Protection:** comparisons against the preserved audit snapshot show no changes to the live originals. The shared menu has the intentional trial entries and brand-selection changes; claiming the entire shell is untouched would be inaccurate.

No additional fixes were made in response to this read-only review. Its cautions remain visible rather than silently expanding the trial's scope.

## Verification evidence

Replit previously completed these checks against the unchanged trial source:

- Page Terminal TypeScript check: passed.
- Vite production build with the artifact's configured port/base path: passed.
- Provenance inventory tests: 13 passed, 0 failed.
- Node-VM prompt checks across all three copies: first skill line, valid city-tier acceptance, stale national-tier rejection, no absent-hours block, raw Hub+Spoke inclusion, and removed stop phrase passed.
- Trial HTML routes returned HTTP 200.

The provenance tests do not cover prompt semantics. The Node-VM checks were direct verification, not a committed full behavioral regression suite. No passing real claude.ai skill run or published CMS-page validation is claimed.

## First human trial

1. Verify the STS trial entries are visible and disappear under TechnoCycle.
2. Use one real GMB city and one real NO_GMB city, each with `TIER_1` or `TIER_2`.
3. Enter the target URL before selecting the tier. Paste approved verified data and the raw Hub+Spoke handoff.
4. Inspect the copied prompt before sending: correct target, tier, approved phone/CID where appropriate, exact spoke URLs, and no placeholder facts.
5. For GMB, compare every emitted hours line against actual business-hours data; test a paste with no hours as well.
6. Run Build in claude.ai with the skill enabled. Keep any repair in that same conversation with the existing artifact available.
7. Record skill activation, input clarification, NONBLOCKING repairs, R2 failures, and any incorrect or invented facts.
8. Follow the existing Page Terminal Joomla/schema handoff separately. Do not treat this review as approval to publish a page.

---

## Claude's independent review (verbatim)

# Review: Page Terminal Skills Trial (read-only)

I read the diff and the changed trial source in `index-skills.html`, `no-gmb-skills.html`, `page-terminal-skills.html` and `App.tsx`. I ran nothing. I did not open `provenance-inventory.test.mjs` itself; I only saw its diff. The Replit results you listed are taken as prior observations. I didn't check the live originals directly. The diff shows them unchanged apart from the `App.tsx` and test edits.

## Verdict
**Ready for HUMAN TRIAL, not production-certified.** I found no blockers. There are a few medium gaps in the prompts that could make the first skill run ambiguous. A human trial would show quickly whether they matter.

## Findings

**No high-severity findings.**

**Medium**

1. **The Rebuild/Repair prompt omits fields the skill is said to need.**
   - Evidence: `index-skills.html:3647-3660`, `no-gmb-skills.html` rebuild case (~2532-2560), `page-terminal-skills.html:~3623`.
   - The repair text carries only `TASK`, `DESIGN` and `THE ISSUE`. It has no `TARGET URL` or `NICHE`, and the GMB variants have no CID, Maps link or GMB block.
   - Repro: click "Compile Repair Prompt" after picking a tier. The prompt has no `TARGET URL:` line.
   - It only works if the same chat still holds the original build. A fresh chat or a different VA gets a context-free repair. Your required-field list names the data fields for Build and Rebuild alike, so I'd call this a gap against that list.

2. **GMB Build copies even without verified GMB data.**
   - Evidence: `index-skills.html:3527` (`cid = appState.cid || "[CID]"`) and `3603-3622`. The gate at `3571-3575` checks only the tier.
   - Repro: pick TIER_2 with no CID or GMB paste and click Build. The prompt contains `GMB CID (VERIFIED): [CID]` and `maps?cid=[CID]`.
   - The same line also fills in `[STREET]`, `[PHONE]`, `STS Electronic Recycling` and `Recycling Center` when fields are missing. That fallback behaviour is inherited from the live tool, but the "(VERIFIED)" label is now wrong, and the skill may act on placeholders. A missing CID or GMB block is exactly the kind of input-stage problem that should be caught there.
   - Related: the prompt sends parsed fields, not the raw pasted GMB block. The UI says "GMB data as parsed", so check this matches what the skill expects.

3. **When no hours parse, the prompt says nothing about hours.**
   - Evidence: `index-skills.html:3578` and `3621`. The empty `hoursBlock` is silently dropped.
   - No fabricated hours are emitted, which is correct. But nothing tells the skill "no hours supplied, do not invent". Execution step 1 says "include verified GMB data exactly", which an LLM might fill from category defaults.
   - Check the first run for invented hours.

4. **The hours parser is loose.**
   - Evidence: `index-skills.html:3270-3282`, with the same code in `page-terminal-skills.html:~3220`.
   - `dayPattern` is unanchored, so any line that mentions a day and a time is kept. A review line like "Open Saturday 9 AM for drop-off" would go in as an hour.
   - A line with no day, such as "Open 24 hours" or "Closes 5 PM", is dropped.
   - Day and time run together ("Monday9 AM") won't match, because `\b` fails between the letter and the digit.
   - It fails toward "no hours" or "extra hours" rather than invented defaults. Eyeball the HOURS block on the first GMB run.

**Low**

5. **The NO_GMB marker is prose only.**
   - Evidence: `no-gmb-skills.html:2512` says "⚠️ NO GMB BUILD". The literal token `NO_GMB` appears nowhere in the file.
   - The skill may expect a literal key. Confirm what the skill matches on.

6. **The design selection can clear itself while typing a URL.**
   - Evidence: `handleDesignPageUrlChange`, e.g. `index-skills.html:2051-2068`.
   - Repro: pick a tier first, then type or paste a URL. With no prior active key, the handler resets the selector to "" and the tier must be re-picked.
   - It fails closed. The build is blocked and the toast explains why, so this is only a UX annoyance. Pick the tier after entering the URL.

7. **`verify-links` also gets the skill line.**
   - Evidence: `index-skills.html:3893-3895` and the equivalents in the other two files.
   - The line is "Use the sts-page-builder skill for this task." on a prompt you didn't list. It may be harmless. Confirm it's intended.

8. **`selectBrand` now resets the tool index to 0.**
   - Evidence: `App.tsx:92-96`. This is a small behaviour change in the live shell.
   - It is justified. Without it, an index kept across brands would land on the wrong tool, because `visibleTools` differs per brand.
   - The visible effect is that switching brand returns to Page Rebuild. Make sure Mark expects that.

9. **Cosmetic.** `forcePrefix` is mis-indented at `index-skills.html:3533` and in the other two files.

## Confirmed boundaries (from the diff and source)
- **Separate files and storage keys.**
  - Trial files are `index-skills.html`, `no-gmb-skills.html` and `page-terminal-skills.html`. Their storage keys are `stsTrackerPageRebuildSkillsTrialV1`, `stsNoGmbSkillsTrialV1` and `stsTrackerServicePagesSkillsTrialV1`.
  - These are the only `localStorage` calls in the trial files. They are not the live keys, so trial state and prompts can't leak into the originals.
- **STS-only menu.**
  - The trial entries are marked `stsOnly` and filtered out for `tc` (`App.tsx:82`).
  - They carry no `tcFile`, so TechnoCycle can't resolve to them.
  - `activeTool` is looked up in `visibleTools`, and the brand switch resets the index, so selection is consistent with what is shown.
- **Skill line first.** It is prepended last (`copyPrompt`'s final `if`), so it precedes `forcePrefix` for build, rebuild and verify-links.
- **Build prompt data.**
  - The Build prompt has TASK, TARGET URL, NICHE, DESIGN and the GMB CID/Maps link (GMB only).
  - The raw `${hubSpoke}` is interpolated unmodified.
- **Stop phrase.** "Stop and alert if errors occur." no longer appears in any trial file.
- **Tiers.** The select offers only TIER_1 and TIER_2, and Build and Rebuild reject anything else. The tier is read live from the select, so a stale national tier can't be picked up from storage. Design is an input-stage check, not an R2 stop.
- **Template.** `TOP LOGO 2026 (TESTING TIME)` is still red in the trial copies (`index-skills.html:1620`, `no-gmb-skills.html:894`, `page-terminal-skills.html:1562`). I saw no Joomla loadposition or closing body/html edits in the diff.
- **Schema.** The Phase 4/schema boxes are unchanged.

## Deferred or inherited (not new regressions)
- **NO_GMB schema wording.** The UI and prompts still say "no CID" (`no-gmb-skills.html:520, 783, 806, 2512`), against the newer HQ-CID owner policy. Deferred until `sts-schema-generator` exists.
- **Intro wording.** The intro says "schema included" while Phase 4 handles schema separately (`no-gmb-skills.html:520, 2460`).
- **Inherited prompts.** The "DO NOT PROCEED until file is uploaded" text and the Joomla agent-prompt STOPs are old, unchanged steps outside this trial's changes. They concern Joomla and file-upload steps, not R2 claim failures, so I'm not flagging them as contradictions.
- **Fabricated GMB defaults.** The `[STREET]`/`[PHONE]` fallbacks are inherited from the live tool (see finding 2 for the "VERIFIED" label).

## Coverage limits
The provenance tests check the file inventory and provenance script only. They don't exercise prompt text, tier gating or the hours parser. The Node-VM checks you listed are the only prompt-level evidence, and I didn't re-run them. Nothing here shows the real claude.ai skill has passed. The `sts-page-builder` skill's contents and field expectations are unvalidated locally.

## First human trial checklist
1. In the STS brand, confirm the three "Skills Trial" entries show. Switch to TechnoCycle and confirm they disappear and the tool returns to Page Rebuild.
2. **GMB city, TIER_2:**
   - Enter the URL, then pick the tier.
   - Paste the verified CID and the raw GMB block, including the hours dropdown if the live GMB shows it.
   - Paste the raw Hub+Spoke handoff.
   - Click Generate Build Sequence and check the clipboard: the first line is the skill instruction, then the force prefix, TASK, URL, NICHE, DESIGN, CID, Maps link, and an HOURS block that matches the paste exactly. Spoke URLs should appear verbatim.
   - Paste it in claude.ai with the skill enabled. Watch for invented hours and for whether the skill asks gate questions.
3. **NO_GMB city, TIER_1:** repeat with the same URL → tier → Hub+Spoke order. Confirm the prompt says NO GMB and the output has no address, local phone, hours or CID. Check whether the skill needs the literal `NO_GMB` (finding 5).
4. **Negative checks:** with no tier selected, Build must be blocked with the toast. Change the URL and confirm the tier clears.
5. **Repair:** run Compile Repair Prompt in a fresh chat to confirm whether the missing URL and niche matter (finding 1).
6. Confirm the live `index.html`, `no-gmb.html` and `page-terminal.html` still behave as before, with their own saved state.
7. Record: skill triggered or not, any gate questions, any NONBLOCKING auto-fix logs, and any R2 claim failures.
