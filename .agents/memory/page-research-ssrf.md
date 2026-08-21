---
name: Page research SSRF guard
description: DNS validation must bind to the actual page-fetch connection, not only validate a hostname beforehand.
---

Page research must reject non-global IP literals and DNS answers, and it must enforce that policy at the HTTP connection lookup used by the request itself. A separate hostname preflight is not enough.

**Why:** An attacker-controlled hostname can return a safe address to a preflight lookup and an internal address to the later HTTP client lookup (DNS rebinding). Redirect checks alone do not remove that check-then-use gap.

**How to apply:** Any new server-side page fetch or redirect-capable research path must reuse the connection-bound public-address guard, fail closed on unresolved or mixed DNS answers, and retain tests for numeric IP variants, private DNS answers, and redirect targets.