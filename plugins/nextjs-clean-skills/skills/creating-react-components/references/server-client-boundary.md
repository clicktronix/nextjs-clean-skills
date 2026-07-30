# Server/Client Boundary

**Impact: HIGH** · **Scope: stack (Next.js + React)**

Start with a Server Component. Add `'use client'` only when the boundary owns event handlers,
client-only Hooks, refs, browser APIs, or browser async lifecycle.

Server Components own:

- read-heavy data fetching through the owning capability's `rsc.ts` or trusted server surface.
- static/request-time rendering.
- passing React-serializable props to smaller Client children.

Client Components own:

- interaction state.
- form state and submit UX.
- browser-only APIs.
- capability-local client async lifecycle when a browser query cache is explicitly justified.

Do not move a whole page to the client because one child is interactive. Create a small Client
island. Pass only public-safe values: no class instances, unsupported functions, secrets, or raw
provider rows. Client-visible identity or permission hints are never authority.

Client code never imports capability `server.ts`, `rsc.ts`, or `server/**`. Mark trusted code with
`server-only` and verify the boundary with a production build.

Reference: [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).
