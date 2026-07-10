---
name: nextjs-architecture
description: Use when adding or refactoring features in a Next.js 16 Hybrid Clean Architecture app; deciding layer placement, dependency direction, data ownership, auth boundaries, service API boundaries, persistence adapters, cache invalidation, route handlers, server actions, observability and error reporting, or tests by layer.
---

# Next.js Architecture

Use this skill for full-stack Next.js feature slices and architecture decisions. It is an architecture contract, not a replacement for Next.js, React, Supabase, or TanStack docs.

Match the level of detail to the risk (degrees of freedom): architecture decisions lean high-freedom — prose plus small illustrative examples you adapt freely; fetch current official docs for API syntax. Fragile security, privacy, or data-integrity operations get one canonical low-freedom example to copy exactly, because consistency there is critical; the example shows the safe shape, not an API tutorial.

## Profile Gate

Before applying the defaults below, inspect the target repository's package manifest, local agent instructions, architecture docs, and neighboring feature slices.

- Existing repository conventions win unless the task explicitly asks to migrate them.
- Do not introduce or replace Valibot, Supabase, TanStack Query, Mantine, next-safe-action, or `composeHooks` merely because this skill mentions them.
- Map architectural roles to the repository's existing equivalents: schema validator, persistence adapter, query client, component library, action wrapper, and component-composition pattern.
- Use the Default Profile literally only for a greenfield project or a repository that has explicitly adopted it.

## Default Profile

- Next.js 16 App Router, React 19, TypeScript.
- Domain schemas and types in Valibot.
- Use-cases are pure application orchestration and depend on ports, not adapters.
- Inbound adapters are Server Actions or route handlers that compose dependencies and framework concerns.
- Outbound adapters implement use-case ports for Supabase, APIs, queues, and transport.
- Read-heavy UI fetches in Server Components through server-only DAL/read entrypoints.
- TanStack Query is auxiliary, opt-in only for realtime, polling, infinite scroll, optimistic updates, or shared async/server-state cache lifecycle across client islands. Otherwise reads are RSC props and writes go through the correct command boundary: Server Actions for UI commands, Route Handlers for service/API commands.
- Cache and framework APIs follow current Next.js docs; this skill only decides which layer owns the read/write.

## Start Here

1. Run the Profile Gate, then the Decision Gate classification (below), before editing.
2. Identify whether the change is a command, a read, a route pattern, or a cross-cutting concern.
3. Read only the references needed for that decision.
4. Implement in dependency order: domain -> use-cases -> outbound -> inbound/DAL -> UI -> tests.
5. Run the Verification Gate (below) before claiming completion.

## Core Boundaries

```text
Commands:
  UI/form -> Server Action -> use-case -> port -> outbound implementation

Read-heavy queries:
  RSC/page/layout -> server-only DAL/read entrypoint -> use-case/port -> outbound implementation

Client-interactive queries:
  Client component -> ui/server-state -> Server Action/API -> use-case -> port -> outbound

Compile-time imports:
  domain          imports pure domain helpers and schema libraries only
  use-cases       import domain and local ports/types only
  outbound        imports use-case ports + domain
  inbound         imports use-cases + outbound factories + infrastructure
  server UI/RSC   imports server-only DAL/read entrypoints
  client UI       imports server-state hooks, local actions, domain types
```

Inbound adapters calling use-cases is correct. The forbidden direction is use-cases importing inbound adapters, outbound adapters, Supabase clients, React, TanStack Query, or Next.js request/cache APIs.

## Reference Map

Core:

- [Glossary](references/glossary.md)
- [Clean Architecture Boundaries](references/clean-architecture-boundaries.md)
- [Runtime And Compile-Time Boundaries](references/runtime-and-compile-time-boundaries.md)

Security:

- [Security, DAL, And Auth](references/security-dal-and-auth.md)
- [Validate Environment Variables](references/security-env-validation.md)

Data and persistence:

- [Data Ownership And Cache](references/data-ownership-and-cache.md)
- [Backend Service Patterns](references/backend-service-patterns.md)
- [Supabase Persistence Boundaries](references/supabase-persistence-boundaries.md)

Quality:

- [Testing By Layer](references/testing-by-layer.md)
- [Observability And Sentry](references/observability-and-sentry.md)

## Decision Gate

Before code changes, write or hold this classification:

```text
layer: domain | use-case | outbound | inbound | DAL | server-state | UI | infrastructure
boundary: RSC read | Server Action | Route Handler | webhook | durable job | none
server data owner: RSC/DAL | TanStack Query | none
auth boundary: proxy only? DAL? inbound adapter? use-case policy?
cache owner: RSC cache | query cache | none
tests: domain | use-case | adapter | action/route | component | e2e
```

If any field is unclear, resolve that decision before adding files.

## Common Failure Modes

- Use-case imports `next/*`, React, Supabase clients, outbound repositories, or TanStack Query.
- Server data is copied into Context, Zustand, or `useState` instead of RSC props or TanStack Query.
- Server Action trusts client validation and skips server-side auth/authz checks.
- Route Handler is used for same-app form commands that belong in Server Actions.
- Cache tags are broad, tenant-unsafe, or invalidated without matching ownership.

## Verification Gate

Before reporting success:

1. Check changed imports against the compile-time boundary list: domain stays pure; use-cases depend on ports, not adapters/framework/React/TanStack; outbound implements ports; `app/` entrypoints stay thin.
2. Confirm every data access path re-checks auth/authz server-side and cache tags are scoped by entity, user, or tenant.
3. Run the smallest relevant test or static check available in the target repo.
4. State any unverified layer explicitly instead of implying it is covered.
