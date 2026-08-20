---
name: Large GitHub workspace publishing
description: Reliable pattern for publishing a large tracked workspace through the Replit GitHub connector when native Git push has no credential.
---

For a large tracked workspace, do not burst GitHub connector blob writes: its Replit-side limit is 10 requests per second. Upload blobs with a global throttle and retry 429 responses. When the target repository has unrelated history, create an orphan branch rather than force-pushing its default branch.

**Why:** Native Git remotes may only have read access even while the connected GitHub account has repository-write OAuth scope. A flat Git tree request can fail server-side for a large tree, despite every blob being present.

**How to apply:** Build the Git tree bottom-up by directory, verify its root hash matches the local committed tree, create an isolated root commit, then create a new branch ref. Fetch it back and compare tree hashes and tracked-file counts before reporting success.