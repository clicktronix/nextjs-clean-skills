# Server/Client Boundary

**Impact: HIGH**

Start UI as a Server Component. Add `'use client'` only for event handlers, stateful hooks, refs, browser APIs, Mantine form hooks, client i18n hooks, or opt-in TanStack Query.

Server Components own:

- read-heavy data fetching through DAL/read entrypoints.
- static/request-time rendering.
- passing serializable props to smaller Client children.

Client Components own:

- interaction state.
- form state and submit UX.
- browser-only APIs.
- client async cache when TanStack is explicitly justified.

Do not move a whole page to the client because one child needs a hook. Create a small Client island. Do not pass class instances, functions, secrets, raw rows, or authority fields from Server to Client.

For exact RSC serialization or hook restrictions, fetch current React/Next docs. The project rule is: keep the client tree as small as the interactive surface.

Reference: Next.js App Router Server/Client Component boundary.
