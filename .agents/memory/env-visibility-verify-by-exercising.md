---
name: Verify external integrations by exercising them, not by reading the secret list
description: viewEnvVars/secret listing does not surface every runtime key in this repo; confirm external calls by actually hitting them.
---

# Verify external calls by exercising them, not by reading the secret list

In this repo, the secrets/`viewEnvVars` listing does **not** reliably surface
every key that is actually present in the running server process. During the
Mission Control verification, `SERPAPI_API_KEY`, `PERPLEXITY_API_KEY`,
`DATAFORSEO_LOGIN/PASSWORD`, and `GTMETRIX_API_KEY` were all live at runtime (the
SEO-intel, research, and AI calls genuinely returned real data) even though they
did not appear in the secret listing.

**Why:** concluding "key X is unconfigured" from the secret list led to a wrong
initial assumption that the research/SEO paths would fail loud — they actually
succeeded. The truth source is the running process, not the listing.

**How to apply:** to determine whether an external integration is configured,
exercise it (curl the endpoint / run the call) and read the result, or check
`process.env` inside the server process. Do not infer "missing key → will fail"
purely from the secrets UI. The genuinely-unset paths here are Joomla publish,
Google Sheets mirror (`WORKLOG_SHEET_ID`), and GSC (`GSC_*`), which is why those
are the ones that fall back to fail-loud / stub behavior.
