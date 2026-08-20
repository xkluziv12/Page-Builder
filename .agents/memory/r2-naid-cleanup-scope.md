---
name: R2/NAID cleanup scope
description: User-approved scope for the cross-artifact prompt audit and cleanup.
---

The user approved literal R2/NAID removal across the local tool system: active runtime prompts, execution prompts, schema/meta, fixtures, historical/reference prompt files, and local archives. Google Drive is reference-only for this work and must not be accessed, edited, or synchronized.

**Why:** The user said the current prompts are authoritative and that exactly what remains in them should be followed, choosing the broadest local cleanup option, then explicitly clarified that Google Drive must not be touched.

**How to apply:** Before editing, preserve local source snapshots and create a classification/mapping report. Do not silently retain historical mentions, certification examples, or metadata/schema occurrences under the old visible-text-only exception. Any unavoidable provenance or migration note must be separately approved rather than encoded as a surviving R2/NAID occurrence. Do not call Google Drive APIs or modify Drive files.