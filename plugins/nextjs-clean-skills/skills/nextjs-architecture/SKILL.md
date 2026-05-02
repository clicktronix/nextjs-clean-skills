---
name: nextjs-architecture
description: Use when adding or refactoring features in a Next.js 16 Hybrid Clean Architecture app, deciding layer placement, dependency direction, data ownership, auth boundaries, service API boundaries, persistence adapters, or tests by layer.
---

# Next.js Architecture

Use this skill for full-stack Next.js feature slices and architecture decisions. It is an architecture contract, not a replacement for Next.js, React, Supabase, or TanStack docs. For API syntax, fetch current official docs.

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

1. Identify whether the change is a command, a read, a route pattern, or a cross-cutting concern.
2. Choose the layer before writing code.
3. Read only the references needed for that decision.
4. Implement in dependency order: domain -> use-cases -> outbound -> inbound/DAL -> UI -> tests.
5. Verify imports obey the compile-time boundaries.

## Core Boundaries

```text
Commands:
  UI/form -> Server Action -> use-case -> port -> outbound implementation

Read-heavy queries:
  RSC/page/layout -> server-only DAL/read entrypoint -> use-case/port -> outbound implementation

Client-interactive queries:
  Client component -> ui/server-state -> Server Action/API -> use-case -> port -> outbound

Compile-time imports:
  domain          imports nothing
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

- [Data Ownership, Cache, And TanStack](references/data-ownership-cache-tanstack.md)
- [Backend Service Patterns](references/backend-service-patterns.md)
- [Supabase Persistence Boundaries](references/supabase-persistence-boundaries.md)

Quality:

- [Testing By Layer](references/testing-by-layer.md)

## Final Checklist

- Domain has schemas, inferred types, and pure rules only.
- Use-cases import no adapters, framework APIs, React hooks, or TanStack Query.
- Ports describe use-case needs; outbound adapters implement ports.
- Inbound adapters or DAL verify auth/authz and map request/cookie/header/framework concerns.
- Read-heavy pages use server-only DAL/read entrypoints.
- Client server-state exists only when client interactivity needs it.
- Cache tags are scoped by entity, user, or tenant.
- Server Actions validate input and re-check authorization server-side.
- `app/` entrypoints remain thin.
