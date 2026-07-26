---
name: nextjs-architecture
description: Use when adding or refactoring features in a Next.js 16 Hybrid Clean Architecture app; deciding layer placement, slice ownership, whether a dependency needs a port, whether a use-case is warranted, dependency direction, data ownership, auth boundaries, persistence adapters, RPC and RLS, external service transport, streaming, cache invalidation, route handlers, server actions, error handling, observability, or tests by layer.
---

# Next.js Architecture

Use this skill for full-stack Next.js feature slices and architecture decisions. It is an architecture contract, not a replacement for Next.js, React, Supabase, or TanStack docs.

Match the level of detail to the risk (degrees of freedom): architecture decisions lean high-freedom — prose plus small illustrative examples you adapt freely; fetch current official docs for API syntax. Fragile security, privacy, or data-integrity operations get one canonical low-freedom example to copy exactly, because consistency there is critical; the example shows the safe shape, not an API tutorial.

## Default Profile

Use this profile literally for greenfield or explicitly adopted projects; otherwise preserve the repository's existing equivalents unless migration is requested.

- Next.js 16 App Router, React 19, TypeScript.
- Domain schemas and types in Valibot.
- Business authority may sit in the store (stored functions plus row-level policies) or in a separate owned service. Model where it sits before deciding what the application layer holds.
- Application entries go through one boundary declaration that validates, normalises failures, and reports them once. It knows nothing about the framework: navigation is called outside it.
- The repository is the default product boundary. Within it, choose the narrowest actual consumer set; add broader product or business-line scopes only when independently shipped consumers require them.
- A port exists when the core must state a capability independently of the technology behind it, in the application's language. Adapter count is evidence, not the gate; a locally-runnable store defaults to a data module.
- Read-heavy UI fetches in Server Components through server-only read entrypoints.
- TanStack Query is auxiliary, opt-in only for realtime, polling, infinite scroll, optimistic updates, or shared async cache lifecycle across client islands. Otherwise reads are RSC props and writes go through the correct command boundary: Server Actions for UI commands, Route Handlers for service, streaming, and integration commands.
- Cache and framework APIs follow current Next.js docs; this skill only decides which layer owns the read/write.

## Start Here

1. Run the Decision Gate classification (below) before editing.
2. Answer the three placement questions — reuse scope, capability owner, and technical responsibility.
3. Classify the dependency before reaching for a contract at a seam.
4. Read only the references needed for that decision.
5. Implement in dependency order: domain -> data or ports+outbound -> use-case (only if one is warranted) -> inbound/read entrypoints -> UI -> tests.
6. Run the Verification Gate (below) before claiming completion.

## Core Boundaries

```text
Runtime entry per need:
  command       form -> Server Action
  read (render) RSC -> read entrypoint
  read (client) island -> client-cache -> action
  service/stream caller -> Route Handler

```

<!-- contract:imports -->
```text
Compile-time imports (self | across layers; generated from rules/import-table.json):
  domain/**                  yes | none
  use-cases/*/operations/**  yes | domain, ports, data
  use-cases/*/entries/**     no  | domain, boundary, use-case-operations
  data/**                    yes | domain
  adapters/outbound/**       yes | domain, ports
  adapters/inbound/**        yes | domain, ports, data, outbound, infrastructure, boundary, use-case-entries
  adapters/inbound/read/**   yes | domain, ports, data, outbound, infrastructure, inbound, boundary, use-case-entries
  client-cache/**            yes | domain, inbound
  ui/**                      yes | domain, client-cache
  app/**                     yes | domain, read, inbound, ui, client-cache (prefetch only)
  infrastructure/**          yes | domain
  ports/**                   no  | domain
  boundary/**                no  | domain
```
<!-- /contract:imports -->

Inbound adapters calling use-case entries is correct. The forbidden direction is use-cases importing inbound adapters, outbound adapters, database clients, React, TanStack Query, or Next.js request/cache APIs.

## Reference Map

Each reference declares how far its rule travels. `Scope: portable` survives a change of
framework, store, or vendor and applies to any project adopting this architecture.
`Scope: stack (...)` is one instance of a portable rule for the named tooling — read it only if
the project uses that tooling, and read the portable rule it instantiates either way.

Placement — where code belongs:

- [Layers And Imports](references/placement/layers-and-imports.md)
- [Slices And Ownership](references/placement/slices-and-ownership.md)
- [Runtime And Compile-Time Boundaries](references/placement/runtime-vs-compile-time.md)

Seams — whether a contract is warranted:

- [Dependency Categories](references/seams/dependency-categories.md)
- [Port Shape](references/seams/port-shape.md)
- [Composition Without A DI Container](references/seams/composition-without-di.md)

Application layer:

- [When A Use-Case Exists](references/use-cases/when-a-use-case-exists.md)
- [The Boundary Declaration](references/use-cases/use-case-wrapper.md)
- [Validate Once Per Trust Boundary](references/use-cases/validation-once.md)

Inbound — which entry shape:

- [Route Handlers As Service APIs](references/inbound/route-handlers.md)
- [Streaming Responses](references/inbound/streaming.md)

Outbound — data access and integrations:

- [Authority And Transactions](references/outbound/authority-and-transactions.md)
- [Row Types Are Not Domain Types](references/outbound/row-vs-domain-types.md)
- [Owned Service Transport](references/outbound/service-transport.md)
- [Supabase And Row-Level Security](references/outbound/supabase-rls.md)

Caching — who owns a read:

- [Cache Tiers And Read Ownership](references/caching/cache-tiers.md)
- [Client Cache Layer](references/caching/client-cache-layer.md)

Failure handling:

- [Failure At The Application Boundary](references/errors/failure-at-the-boundary.md)
- [Error Taxonomy](references/errors/error-taxonomy.md)

Security:

- [Security, DAL, And Auth](references/security/dal-and-auth.md)
- [Validate Environment Variables](references/security/env-validation.md)

Quality:

- [Testing By Layer](references/quality/testing-by-layer.md)
- [Observability And Sentry](references/quality/observability-and-sentry.md)

Terminology: [Glossary](references/glossary.md)

This contract adapts Alistair Cockburn's Ports and Adapters and Alex Bespoyasov's
frontend Clean Architecture to an App Router application. Where a rule came from a
measurement rather than from those sources, the count is recorded in the repository's
`docs/evidence.md`.

## Decision Gate

Before code changes, write or hold this classification:

```text
scope:               narrowest actual consumer set; repository is the product boundary
slice:               which capability owns this behaviour
layer:               domain | operation | entry | data | port | outbound | inbound | read-entry | client-cache | UI | infrastructure | boundary
dependency category: in-process | local-substitutable | remote-owned | external
adapters today:      how many implementations exist now, not how many might
behavior owned:      what this module does that callers would otherwise repeat
authority:           store | owned service | application
auth boundary:       where the session and role are re-verified server-side
boundary:            RSC read | Server Action | Route Handler | stream | webhook | job | none
cache owner:         rsc | client-cache | shared-server-cache | none
error surface:       result from the declaration | throw inside a layer | in-stream event
tests:               domain | use-case | data | service | inbound | ui | e2e
```

If any field is unclear, resolve that decision before adding files. An empty `behavior owned` means the module should not exist.

## Common Failure Modes

- A contract at a seam over a dependency that already runs locally, so tests exercise a substitute instead of the real engine.
- An application function whose body forwards its arguments and holds nothing.
- One schema parsed twice on the same path, twenty lines apart.
- Storage naming reaching view models and form fields because the query was derived from the business schema.
- Logic that a stored function already performs, reimplemented in the application.
- Each entry point classifying failures for itself, so one fault has several public shapes.
- A streamed response driven through a Server Action, or retried instead of resumed.
- A second transport module for a service that already has one.
- Server data copied into Context, an external store, or local state instead of RSC props or the client cache.
- Cache tags that are broad, tenant-unsafe, or invalidated by a layer that does not own the write.
- Lint guards naming directories the repository does not contain.

## Verification Gate

Before reporting success:

1. Apply the deletion test to every module added: if removing it makes complexity vanish rather than reappear across callers, remove it.
2. Confirm no module was added without a production call site. A module reached only by its own test is not yet real.
3. Check changed imports against the compile-time list above.
4. Confirm each trust boundary validates its own concern exactly once.
5. Confirm every read and write path re-checks auth server-side, and cache tags are scoped by entity, user, or tenant.
6. Confirm one failure produces one report, and that public output carries a taxonomy code rather than provider text.
7. Confirm tests assert outcomes rather than call mechanics, except where the call is itself the rule.
8. Run the smallest relevant test or static check available in the target repo.
9. State any unverified layer explicitly instead of implying it is covered.
