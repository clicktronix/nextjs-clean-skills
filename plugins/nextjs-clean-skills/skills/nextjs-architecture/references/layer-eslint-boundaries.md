# Enforce Boundaries With ESLint

Architecture rules should be executable.

Recommended restrictions:

- `src/domain/**` cannot import outside domain or validation libraries
- `src/use-cases/**` cannot import `@/adapters/**`, `@/app/**`, `@/ui/**`, `next/**`, React, TanStack Query, or Supabase clients
- `src/ui/**` cannot import outbound adapters
- `src/ui/server-state/**` is the client-facing place for TanStack Query and action/API calls
- route-local `_internal/**` cannot be imported from another route segment

Client-safe exceptions must be narrow. If `ui/server-state` needs a browser subscription helper such as auth events or realtime, allowlist that exact file; do not allow the whole outbound adapter folder. Repositories, operations, external API clients, service-role clients, and transport helpers stay behind inbound actions or API routes.

When rules differ by repo, follow the repo's stricter local config.
