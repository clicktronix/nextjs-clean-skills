---
name: designing-architecture
description: >-
  Use when a Next.js 16 App Router task requires deciding product capability ownership, module
  placement, runtime channels or trust boundaries, public surfaces, or cross-capability dependency
  direction. Keeps product behavior capability-owned without imposing a new architecture on routine
  component work.
---

# Designing Architecture

Use this skill for architecture decisions, not ordinary component implementation. For component
structure, local state, forms, loading, styling, or accessibility, use `creating-react-components`.

Preserve the project's stack, paths, and established architecture unless adoption or migration was
requested. Fetch current Next.js documentation before relying on framework-specific behavior.

## Decision Gate

Always answer two questions:

1. Which product capability owns the behavior?
2. Which named consumers and runtime channels need it?

Only answer the following when the change actually touches them:

- **Policy:** would deleting an operation move meaningful branching, projection, transaction intent,
  or coordination into callers?
- **Dependency:** must application behavior name a dependency independently of its technology?
- **Coordination:** does cross-capability policy need an owning orchestrator?
- **Trust:** is input untrusted or the channel protected, and where do authentication,
  authorization, validation, and store predicates apply?
- **Authority:** is Next.js authoritative, or a BFF for an external backend?
- **Sharing:** do at least two real capabilities share identical meaning and lifecycle with no
  natural owner; who maintains the narrow contract; when should it be demoted; and is coordination
  now cheaper than duplication?

Do not publish a full questionnaire when most answers are not applicable. Report the decisions that
change the implementation and any unresolved trade-off.

## Place The Behavior

Keep framework composition that belongs only to a route under `app/**`. Put reusable product
behavior under the owning capability, using the project's configured module root. A typical private
shape is:

```text
domain/       pure invariants and calculations
application/  policy, orchestration, and owned ports
server/       persistence, providers, and server adapters
client/       browser-owned async lifecycle
ui/           reusable capability UI
```

Create only segments required by current behavior. Do not add forwarding operations, mirrored
repository ports, empty folders, or broad barrels to make the tree look complete.

For ownership, placement, granularity, and runtime separation details, read only the relevant one:
[modules and imports](references/placement/modules-and-imports.md),
[capability ownership](references/placement/capabilities-and-ownership.md),
[granularity](references/placement/capability-granularity.md), or
[runtime separation](references/placement/runtime-vs-compile-time.md).

Publish a root surface only for a named external consumer. Use the project's admitted vocabulary;
the bundled contract uses `server.ts`, `rsc.ts`, `actions.ts`, `client.ts`, `ui.ts`,
`query-cache.ts`, `stream.ts`, and `job.ts`. Keep implementations private and exports explicit.

Create `query-cache.ts` only when the same serializable key identity has both a server
prefetch/hydration consumer and a browser query consumer. Otherwise keep the key private to its
runtime owner.

Use an application operation, port, or orchestrator only when its deletion test identifies policy
that otherwise leaks into callers. Adapter count, test mocks, and possible future providers are
evidence, not gates.

For CRUD against one local store, start with the channel entry calling a private server data module.
Authentication, input validation, row mapping, cache invalidation, failure translation, and the names
`list`, `create`, or `rename` do not by themselves justify `application/` or one wrapper per action.
Add an operation only when it owns product policy or coordination beyond that direct flow.

For a non-obvious operation or dependency seam, read only the relevant reference:
[operation gate](references/use-cases/when-a-use-case-exists.md),
[channel boundary](references/use-cases/channel-boundaries.md),
[validation](references/use-cases/validation-once.md),
[dependency category](references/seams/dependency-categories.md),
[port shape](references/seams/port-shape.md), or
[composition](references/seams/composition-without-di.md).

## Choose The Channel

- Server Component reads call server-owned capability code directly; do not fetch the app's own
  Route Handler.
- Server Actions are for UI mutations, not browser-owned reads.
- Route Handlers own HTTP contracts, external callers, browser `GET` reads, callbacks, and streams.
- Streams own commit state, cancellation, timeout, resume, and post-commit failures.
- Jobs own retry, deadline, idempotency, and dead-letter behavior.

For an HTTP, stream, or failure boundary, read only the relevant reference:
[Route Handlers](references/inbound/route-handlers.md),
[streaming](references/inbound/streaming.md),
[capture ownership](references/errors/failure-at-the-boundary.md), or
[error taxonomy](references/errors/error-taxonomy.md).

For protected channels, authenticate at entry, authorize product behavior in policy, and enforce
applicable ownership or tenant predicates at the store boundary. Validate untrusted input at trust
entry and provider output when it becomes trusted. Public channels may mark these concerns `N/A`.

Return expected product outcomes as typed values. Let unexpected failures reach one outer capture
owner. Keep redirect and not-found control flow outside generic catches.

When Next.js is a BFF for an authoritative backend, keep remote policy authoritative instead of
rebuilding its domain and application layers locally.

For data, provider, or security boundaries, read only the relevant reference:
[authority and transactions](references/outbound/authority-and-transactions.md),
[row mapping](references/outbound/row-vs-domain-types.md),
[database resources](references/outbound/database-resource-ownership.md),
[service transport](references/outbound/service-transport.md), [auth](references/security/dal-and-auth.md),
[environment validation](references/security/env-validation.md), or
[RLS](references/outbound/supabase-rls.md).

## Adoption Boundary

Apply the full capability-first enforcement floor only when the repository already adopted it or the
task explicitly requests migration. That floor includes contract roots, dependency classification,
cycle and boundary checks, optional database-resource ownership, and production build proof.

For an ordinary change in another architecture, preserve local conventions. Improve the specific
ownership or runtime boundary at issue without installing this plugin's topology, registries, or
migration tooling.

## Verification

For a proposal or review, explain the relevant owner, consumers, channels, and trade-offs; do not
claim runtime proof without a candidate. For an implementation, run the project's focused tests and
static checks. Run a production build when server/client separation or another build-time boundary
changed.

For cache or verification details, read only the relevant reference:
[cache tiers](references/caching/cache-tiers.md),
[client cache](references/caching/client-cache.md),
[testing](references/quality/testing-by-capability.md),
[observability](references/quality/observability-and-sentry.md), or the
[glossary](references/glossary.md).
