# Server/Client Boundary

**Scope: stack (Next.js + React)**

Pass only public-safe values across the boundary: no class instances, unsupported functions,
secrets, or raw provider rows. Client-visible identity or permission hints are never authority.

Client code and every file under `ui/**` never import a capability's `server.ts`, `rsc.ts` or
`server/**` ([rule 8](../../../docs/architecture-contract.md#dependency-direction)). A Server
Component that reads lives in `server/**`, renders a `ui/**` view that takes props, and is
published by `rsc.ts`; the route renders it and passes the element as `children` or a prop. A view
without `'use client'` imports no browser-only code: one that needs `client.ts` opens with the
directive.
Mark trusted code with `server-only` and verify the boundary with a production build.

Reference: [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).
