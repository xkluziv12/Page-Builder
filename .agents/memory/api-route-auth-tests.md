---
name: API router authorization tests
description: How to execute isolated API-router regression tests in this workspace.
---

Use the built-in Node test runner with a temporary CommonJS esbuild bundle when an API route test needs the real router but no live database or external services.

**Why:** The workspace uses extensionless TypeScript imports that Node's direct TypeScript loader cannot resolve, and the development Pino transport expects to resolve `pino-pretty` relative to the executable bundle.

**How to apply:** Bundle the real router in the test, import it under production logging, mount it on an ephemeral Express server, and clean up all temporary resources and environment overrides afterward.
