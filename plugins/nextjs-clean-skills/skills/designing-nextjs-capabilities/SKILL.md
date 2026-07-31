---
name: designing-nextjs-capabilities
description: >-
  Use when placing or reviewing Next.js 16 App Router behavior: module ownership, Server Components,
  Server Actions, Route Handlers, streams, persistence, providers, caching, auth, or workflows. Places
  product behavior in capability-owned modules that publish runtime-specific surfaces.
---

# Designing Next.js Capabilities

Design around product capabilities. Keep framework routes in `app/**`, colocate behavior under one
capability root, and add internal segments only when required by current behavior.

## Decision Gate

For the requested change, identify:

1. the product goal, vocabulary, policy, and lifecycle that define the capability boundary;
2. the capability that owns the behavior;
3. each runtime channel: RSC, Server Action, HTTP, stream, job, or browser;
4. whether application policy survives the deletion test;
5. which dependencies need capability-shaped ports;
6. the public surface each external consumer needs;
7. where authentication, business authorization, and store authorization run;
8. whether Next.js or an external backend owns authoritative business behavior.

Do not invent future policy, persistence, alternate providers, reuse, or coordination to justify an
abstraction. Preserve the project's stack and configured roots unless migration is requested. Fetch
current framework documentation for API details.

## Workflow

1. Name the owner using product behavior, not a page, table, transport, provider, or file count.
2. Keep route-only framework composition under `app/**`; place product behavior under the owning
   capability.
3. Add only the internal segments and application operations that current behavior requires.
4. Select native runtime channels and publish only their named root surfaces.
5. Place identity, validation, authorization, effects, cache ownership, and failure capture at the
   boundaries that own them.
6. Verify dependency direction statically and channel behavior through focused tests and a
   production build.

When writing a proposal or review, report the decision-gate answers and unresolved trade-offs. Do
not restate references that do not affect the change.

## Physical And Public Model

The default module root is `src/modules/<capability>/`; a product profile may configure equivalent
source, module, app, shared, and alias paths. Optional private segments are:

```text
domain/       pure invariants and calculations
application/  policy, orchestration, projections, and owned ports
server/       persistence, providers, cache wiring, and server adapters
client/       browser async lifecycle, realtime, and optimistic state
ui/           reusable capability UI
```

Do not create empty segments. Route-private UI stays under `app/**`.

External consumers use only the runtime surfaces they need:

| Surface | Contract |
| --- | --- |
| `server.ts` | silent trusted composition with explicit identity |
| `rsc.ts` | current-request Server Component reads |
| `actions.ts` | top-level `'use server'`; async UI mutations |
| `client.ts` | browser-safe async lifecycle |
| `ui.ts` | reusable capability UI |
| `query-cache.ts` | runtime-neutral serializable query-key identity |
| `stream.ts` | streaming contract |
| `job.ts` | worker contract |

Create a surface only for named consumers. Publish an explicit stable contract, strengthen or
translate a private contract, or establish a runtime boundary. Named re-exports are allowed when
their values are runtime-safe and provider-free; never use `export *`. Keep growing implementation
private and the root surface a small explicit export manifest.

With top-level `'use server'`, declare value exports as local async functions; do not value-re-export
them. Create `query-cache.ts` only when server prefetch/hydration and a browser query share the same
serializable key identity. Keep fetchers, providers, cache tags, and one-runtime-only keys private.

## Dependency Floor

- **Ownership:** `app/**` and other capabilities import root surfaces, never internals.
- **Acyclic resolution:** literal imports resolve, hidden targets fail closed, and capability
  dependencies remain acyclic.
- **Purity:** `domain/**` imports only its own domain, `shared/kernel`, and classified pure packages;
  `application/**` remains framework- and provider-neutral.
- **Runtime separation:** browser code cannot import server surfaces; server code cannot import
  browser surfaces. Add `server-only` and `client-only` markers and prove poisoning with a build.
- **Surface contracts:** root files use the admitted vocabulary and remain narrow.
- **Shared neutrality:** shared roots are runtime-specific and cannot depend on capabilities.
- **Declared effects:** classify direct packages and declare configured database resources with
  owners and consumers.

Inside one capability, private `server/**` points inward and never imports its own root channel
surfaces. `client/**` and `ui/**` use browser-safe contracts and only the exact actions they need.

## Semantic Depth

Create an application operation only when deleting it moves meaningful policy, branching,
projection, transaction intent, or coordination into callers. Simple store-backed CRUD may be:

```text
channel boundary -> capability server service -> private store
```

Keep a port only when application behavior must name a capability independently of technology, in
application language, for a production consumer. Adapter count and test mocks are evidence, not
gates.

Create an orchestrating capability when deleting cross-capability code would move meaningful
filtering, grouping, authorization consequences, projection, transaction intent, or coordination
into a route. Its private adapters call other capabilities' public surfaces; source capabilities do
not import the orchestrator or one another.

## Channels, Trust, And Authority

- Call capability server code directly for RSC reads; do not fetch the app's own Route Handler.
- Use Server Actions for UI mutations, not browser-owned reads.
- Use Route Handlers for HTTP contracts, external callers, browser `GET` reads, callbacks, and
  streams.
- Let streams own commit state, cancellation, idle timeout, resume, and post-commit failures.
- Let jobs own retry, deadline, idempotency, and dead-letter policy.

Authenticate at the channel boundary, authorize product behavior in policy, and enforce ownership
or tenant predicates in the store/RLS boundary. Validate untrusted input once at trust entry and
provider output when it becomes trusted. Pass identity and effects explicitly.

Return expected product outcomes as typed values. Propagate unexpected contract violations,
outages, and defects as exceptions to one outer capture owner. Keep redirect/not-found control flow
outside generic catches.

Keep provider rows private and map them to domain/public values. When Next.js is a BFF for an
authoritative backend, do not duplicate that backend's domain and application policy locally.

Promote code to `shared/kernel`, `shared/server`, `shared/client`, or `shared/ui` only when at least
two real capabilities share identical meaning and lifecycle, no capability is the natural owner,
and coordination is cheaper than duplication. Name an owner and demotion condition.

## Common Failure Modes

- Naming modules after pages, tables, transports, or providers instead of product behavior.
- Adding forwarding operations, mirrored repository ports, empty segments, or broad barrels.
- Hiding cross-capability policy in routes or bypassing public surfaces with deep imports.
- Using Server Actions for reads or sharing one result wrapper across every runtime channel.
- Reporting one unexpected failure in both an inner adapter and the outer channel.
- Promoting similar names to `shared/**` without identical semantics and lifecycle.

## Reference Map

Read only references relevant to the decision:

- Ownership and placement: [modules and imports](references/placement/modules-and-imports.md),
  [public surfaces](references/placement/capabilities-and-ownership.md),
  [granularity](references/placement/capability-granularity.md), and
  [runtime separation](references/placement/runtime-vs-compile-time.md).
- Operations and dependencies: [operation gate](references/use-cases/when-a-use-case-exists.md),
  [channel boundaries](references/use-cases/channel-boundaries.md),
  [validation](references/use-cases/validation-once.md),
  [dependency categories](references/seams/dependency-categories.md),
  [port shape](references/seams/port-shape.md), and
  [composition](references/seams/composition-without-di.md).
- Channels and failures: [Route Handlers](references/inbound/route-handlers.md),
  [streaming](references/inbound/streaming.md),
  [capture ownership](references/errors/failure-at-the-boundary.md), and
  [error taxonomy](references/errors/error-taxonomy.md).
- Data and security: [authority and transactions](references/outbound/authority-and-transactions.md),
  [row mapping](references/outbound/row-vs-domain-types.md),
  [database resources](references/outbound/database-resource-ownership.md),
  [service transport](references/outbound/service-transport.md),
  [auth](references/security/dal-and-auth.md),
  [environment validation](references/security/env-validation.md), and
  [RLS](references/outbound/supabase-rls.md).
- Cache and quality: [cache tiers](references/caching/cache-tiers.md),
  [client cache](references/caching/client-cache.md),
  [testing](references/quality/testing-by-capability.md), and
  [observability](references/quality/observability-and-sentry.md).
- Vocabulary: [glossary](references/glossary.md).
