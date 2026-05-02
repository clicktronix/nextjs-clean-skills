---
name: nextjs-architecture
description: Use when adding or refactoring features in Next.js 16 with Hybrid Clean Architecture, deciding code placement across domain/use-cases/adapters/server-state/UI layers, or wiring data flow, cache, Server Actions, routes, and security boundaries.
---

# Next.js Architecture

Use this skill for full-stack Next.js feature slices and architecture decisions. Prefer the target repository's `AGENTS.md`, architecture docs, and nearby vertical slices when they are stricter than this profile.

## Default Profile

- Next.js 16 App Router, React 19, TypeScript.
- Domain schemas and types in Valibot.
- Use-cases are pure application orchestration and depend on ports, not adapters.
- Inbound adapters are Server Actions or route handlers that compose dependencies and framework concerns.
- Outbound adapters implement use-case ports for Supabase, APIs, queues, and transport.
- Read-heavy UI fetches in Server Components through server-only DAL/read entrypoints.
- TanStack Query is auxiliary, opt-in only for realtime, polling, infinite scroll, optimistic updates, or shared async/server-state cache lifecycle across client islands. Otherwise reads are RSC props and writes are Server Actions that call `revalidateTag` / `updateTag`.
- Cache Components use `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, and `revalidateTag(tag, 'max')`.

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

Layering:

- [Domain Is Pure](references/layer-domain-pure.md)
- [Use-Cases Do Not Import Outbound](references/layer-use-case-no-outbound.md)
- [Inbound Is Composition Root](references/layer-inbound-is-composition-root.md)
- [Runtime Flow vs Compile-Time Imports](references/layer-runtime-vs-compile-time.md)
- [Enforce Boundaries With ESLint](references/layer-eslint-boundaries.md)
- [Feature Build Order](references/layer-feature-build-order.md)
- [Route `_internal` Is Private](references/layer-private-internal-folder.md)
- [Stack Substitutions Preserve Roles](references/layer-stack-substitutions.md)

Security:

- [DAL Is Server-Only](references/security-dal-server-only.md)
- [Reverify In Server Actions](references/security-reverify-in-action.md)
- [Proxy Is Not The Auth Boundary](references/security-proxy-not-auth-boundary.md)
- [Return DTOs, Not Raw Rows](references/security-dto-not-raw-rows.md)
- [Validate Environment Variables](references/security-env-validation.md)

Data and persistence:

- [Route Handlers For Service APIs](references/api-route-handlers-for-service-apis.md)
- [Use Idempotency Keys For Service Commands](references/api-idempotency-key-for-commands.md)
- [Verify Webhook Signatures Before Parsing](references/api-webhook-signature-verification.md)
- [RSC Reads Default, TanStack Opt-In](references/data-rsc-default-tanstack-optin.md)
- [CQRS: Commands vs Reads](references/data-cqrs-actions-vs-rsc.md)
- [Server Prefetch And Hydration](references/data-server-prefetch-hydration.md)
- [No TanStack Query In RSC](references/data-no-tanstack-in-rsc.md)
- [Avoid TanStack Mutations When Reads Are RSC-Owned](references/data-tanstack-mutation-vs-revalidate-tag.md)
- [Supabase RLS Uses `(select auth.uid())`](references/data-supabase-rls-select-auth-uid.md)
- [RLS `with check` Locks Identity Columns](references/data-supabase-rls-with-check-locks-self-promotion.md)
- [Decide The DELETE RLS Policy Explicitly](references/data-supabase-rls-delete-policy-parity.md)

Cache Components:

- [Enable Cache Components Explicitly](references/cache-components-top-level.md)
- [Cached Functions Need Stable Inputs](references/cache-stable-imports.md)
- [Use `revalidateTag(tag, 'max')`](references/cache-revalidate-tag-with-profile.md)
- [Use `updateTag` For Read-Your-Writes](references/cache-update-tag-read-your-writes.md)
- [No Blind User-Specific Cache](references/cache-no-blind-user-specific.md)
- [Suspense Around Dynamic Reads](references/cache-suspense-around-dynamic.md)

Server Actions:

- [Server Actions Are Thin Wrappers](references/actions-thin-wrapper.md)
- [Use `.inputSchema`, Not Legacy Schema APIs](references/actions-input-schema-not-schema.md)
- [Use State Actions For Progressive Forms](references/actions-state-action-for-forms.md)
- [Use `.useValidated()` For Input-Dependent Authz](references/actions-use-validated-for-authz.md)
- [Do Not Bind Secrets To Actions](references/actions-bind-no-secrets.md)

Routes:

- [Parallel Routes Need Defaults](references/routes-parallel-default-required.md)
- [Intercepting Routes For URL-Addressable Modals](references/routes-intercepting-modal-pattern.md)
- [Avoid Namespace Export Traps](references/routes-namespace-export-trap.md)

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
