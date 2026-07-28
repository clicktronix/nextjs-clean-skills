---
name: nextjs-architecture
description: Use when placing or reviewing full-stack product behavior in a Next.js 16 App Router application, including module ownership, Server Components, Server Actions, Route Handlers, streaming, persistence, providers, caching, auth, and cross-capability workflows.
---

# Next.js Capability Architecture

Design around product capabilities. Keep framework routes in `app/**`, colocate behavior under one
capability root, and add internal segments only when the behavior needs them.

## Decision Gate

For the requested change, identify:

1. the capability that owns the behavior;
2. each runtime channel: RSC, Server Action, HTTP, stream, job, or browser;
3. whether application policy survives the deletion test;
4. which dependencies need capability-shaped ports;
5. the public surface each external consumer needs;
6. where authentication, business authorization, and store authorization run.

Classify only behavior the task or existing product actually requires. Do not invent future policy,
persistence, alternate providers, reuse, or coordination to justify an abstraction.

Preserve an existing project's stack unless migration is requested. Fetch current framework docs
for API details.

## Physical Model

Product behavior lives under:

```text
src/modules/<capability>/
```

A module may contain these reserved, optional segments:

```text
domain/       pure invariants and calculations
application/  policy, orchestration, projections, and owned ports
server/       private server adapters, persistence modules, providers, and cache wiring
client/       browser async lifecycle, realtime, and optimistic state
ui/           reusable capability UI
```

Do not create an empty segment. Route-private presentation and composition stay under `app/**`.
Promote UI into a module only when it is reused or is part of the capability's public contract.

Cross-module consumers import runtime-specific root surfaces, never internal directories:

```text
server.ts   silent trusted composition API with explicit identity
rsc.ts      current-request RSC API
actions.ts  top-level 'use server'; async mutations only
client.ts   browser-safe API
ui.ts       reusable capability UI
stream.ts   streaming contract
job.ts      worker contract
```

Only create surfaces that have real consumers. A surface must narrow internals, strengthen a
contract, or establish a runtime boundary. A one-to-one rename or re-export is not an abstraction.

## Dependency Rules

- `app/**` composes module public surfaces.
- A module never imports another module's internal path.
- `domain/**` is pure and framework/provider independent.
- `application/**` imports its domain, pure helpers, and capability-owned ports only.
- `server/**` implements driving or driven adapters for its own capability.
- `client/**` imports browser-safe contracts and the exact `actions.ts` mutations it needs.
- `ui/**` imports its own domain/client surfaces and exact action surface, not server internals.
- Browser code never imports `server.ts`, `rsc.ts`, or `server/**`.
- Module dependencies are acyclic.

Use `server-only` and `client-only` markers in addition to path rules. A production build must fail
when a Client Component imports a server surface.

## Application Behavior And Ports

Create an application operation only when deleting it moves meaningful policy, branching,
projection, transaction intent, or coordination into callers. Simple store-backed CRUD can be:

```text
channel boundary -> capability server service -> private store adapter
```

Do not add a forwarding operation or mirrored repository port to satisfy a folder template.
Input validation, authentication, row mapping, provider-error mapping, cache invalidation, and an
ordinary store uniqueness conflict do not by themselves justify an application operation.

When application behavior is real:

```text
channel boundary -> application operation -> explicit dependency
```

An operation is framework-neutral, reports nothing, and receives the smallest dependency object it
uses.

A port belongs to the application behavior that needs it. Add one only when the core must name a
capability independently of technology, in application language, for a production consumer.
Adapter count, locality, and test mocks are evidence, not gates.

An outer composition root may wire public surfaces, but it does not own meaningful product policy.
When deleting cross-capability code would move filtering, grouping, authorization consequences,
projection, transaction intent, or coordination into a route, create an orchestrating capability
even when it has one current consumer. Its operation owns dependencies in its own language; private
adapters call other capabilities' narrow public surfaces and do not import internals.

Sequence calls when a later call needs IDs or other data from an earlier result. For
authorization-sensitive joins, require a complete non-enumerating resolution of visible, missing,
and forbidden references. Do not silently omit a forbidden reference when policy requires
rejection.

The orchestrating channel reports an unexpected failure once. Source `server.ts` surfaces, inner
operations, and capability adapters propagate it without reporting it again.

## Runtime Channels

- RSC reads call a server-only RSC/server surface directly.
- Server Actions are top-level `'use server'` mutation boundaries with serializable inputs.
- Browser-owned reads use `GET` Route Handlers or streams, not Server Actions.
- Route Handlers own HTTP status, headers, and public response shapes.
- Streams own commit state, cancellation, sliding idle timeout, and in-band failures after commit.
- Jobs own retry, deadline, idempotency, and dead-letter decisions.

Do not force every channel into one result wrapper. Share safe failure codes, reporter context,
redaction, and provider-error mapping; keep channel-native behavior outside. Do not let a reused
application operation make a job inherit stream idle-timeout semantics unless both intentionally
use a named provider-liveness policy.

Expected application outcomes are typed values. Unexpected defects or outages are exceptions.
Framework control flow such as redirect/not-found stays outside generic catches.

## Identity, Effects, Validation, And Cache

Request identity contains actor, roles, tenant/ownership scope, request ID, and trace ID. Database
clients, provider clients, reporter, clock, and other effects are explicit dependencies.

- Authenticate at the channel/server boundary.
- Enforce business authorization in domain/application policy.
- Enforce ownership and tenant predicates in the store/RLS boundary.
- Validate untrusted input at the channel boundary.
- Validate provider/database data when it enters trusted code.
- Validate serialized output at an external contract.
- Do not re-parse a typed internal value because it crossed a directory.

Keep provider rows distinct from domain/public values when names or semantics differ. Map them in
the private adapter.

Portable operations return cache ownership metadata at most. Runtime channels map it to current
Next.js invalidation APIs.

## Shared Admission

Allowed shared roots are runtime-specific: `shared/kernel`, `shared/server`, `shared/client`, and
`shared/ui`.

Promote code only when at least two real capabilities share identical meaning and lifecycle, no
capability is the natural owner, a named owner exists, and copying is now more expensive than
coordinating the contract. Similar names are insufficient for `shared/kernel`; invariants and
change cadence must also match.

Demote shared code when consumers diverge or one capability becomes its owner. Do not create broad
`utils`, `services`, or migration buckets.

## Common Failure Modes

- Creating a page-, table-, transport-, or provider-named module instead of a product capability.
- Adding empty segments, forwarding operations, mirrored repository ports, or one-to-one facades.
- Putting cross-capability policy in `app/**` or importing another capability's internals.
- Using Server Actions for browser reads or one generic wrapper for every runtime channel.
- Letting browser code import server surfaces or provider credentials.
- Reporting one unexpected failure at both an inner adapter and the outer channel.
- Treating test mocks, future reuse, or an alternate provider as current production requirements.
- Promoting similar names into `shared/**` without identical meaning, lifecycle, and ownership.

## Reference Map

Read only the references needed for the decision:

- Placement: [modules and imports](references/placement/modules-and-imports.md),
  [ownership and public surfaces](references/placement/capabilities-and-ownership.md),
  [runtime separation](references/placement/runtime-vs-compile-time.md).
- Operations and ports: [operation gate](references/use-cases/when-a-use-case-exists.md),
  [channel boundaries](references/use-cases/channel-boundaries.md),
  [validation ownership](references/use-cases/validation-once.md),
  [dependency categories](references/seams/dependency-categories.md),
  [port shape](references/seams/port-shape.md),
  [composition](references/seams/composition-without-di.md).
- Channels and failures: [Route Handlers](references/inbound/route-handlers.md),
  [streaming](references/inbound/streaming.md),
  [failure ownership](references/errors/failure-at-the-boundary.md),
  [error taxonomy](references/errors/error-taxonomy.md).
- Data and security: [authority and transactions](references/outbound/authority-and-transactions.md),
  [row mapping](references/outbound/row-vs-domain-types.md),
  [service transport](references/outbound/service-transport.md),
  [auth boundaries](references/security/dal-and-auth.md),
  [environment validation](references/security/env-validation.md),
  [RLS](references/outbound/supabase-rls.md).
- Reads and quality: [cache tiers](references/caching/cache-tiers.md),
  [client lifecycle](references/caching/client-cache.md),
  [testing](references/quality/testing-by-capability.md),
  [observability](references/quality/observability-and-sentry.md).
- Terms: [glossary](references/glossary.md).

## Verification Gate

Before finishing:

1. Every product behavior is discoverable under one capability root.
2. Optional segments correspond to real behavior; simple CRUD has no forwarding operation.
3. Cross-module imports use narrow public surfaces and the module graph is acyclic.
4. RSC, action, HTTP, stream, job, and browser paths preserve their native semantics.
5. Auth is enforced at channel, policy, and store boundaries.
6. No provider row leaks unintentionally into domain or public contracts.
7. Server/client poisoning and a production build protect runtime separation.
8. Tests assert outcomes and failure/report-once behavior, not incidental calls.
