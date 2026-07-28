# Server/Client Boundary

**Impact: HIGH** · **Scope: stack (Next.js + React)**

Start UI as a Server Component. Add `'use client'` only for event handlers, stateful hooks, refs, browser APIs, Mantine form hooks, client i18n hooks, or opt-in TanStack Query.

Server Components own:

- read-heavy data fetching through the owning capability's `rsc.ts` or trusted server surface.
- static/request-time rendering.
- passing serializable props to smaller Client children.

Client Components own:

- interaction state.
- form state and submit UX.
- browser-only APIs.
- capability-local client async lifecycle when TanStack is explicitly justified.

Do not move a whole page to the client because one child needs a Hook. Create a small Client island.
Do not pass class instances, functions other than supported Server Actions, secrets, raw rows, or
authority fields from Server to Client.

Client code never imports capability `server.ts`, `rsc.ts`, or `server/**`. Mark trusted code with
`server-only` and verify the boundary with a production build.

For exact RSC serialization or hook restrictions, fetch current React/Next docs. The project rule is: keep the client tree as small as the interactive surface.

Reference: Next.js App Router Server/Client Component boundary.
