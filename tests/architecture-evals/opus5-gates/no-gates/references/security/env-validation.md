# Validate Environment Variables

**Impact: HIGH** · **Scope: stack (Next.js)**

Centralize capability-neutral environment access under runtime-specific shared modules:

```text
src/shared/server/env.ts
src/shared/client/env.ts
```

The server module validates secrets and imports `server-only`. The client module exposes only
explicit public variables. Capability-specific configuration may stay in that capability's private
server adapter.

Forbid direct `process.env` outside approved environment modules. Prefer eager validation when every
runtime requires the value; use lazy first access when build, edge, or worker runtimes intentionally
do not.

Never prefix secrets with `NEXT_PUBLIC_`. A Client Component importing server environment code must
fail the production build.

Fetch current Next.js and provider documentation for variable names and runtime behavior.

Reference: runtime-specific environment contracts with build-time server/client poisoning.
