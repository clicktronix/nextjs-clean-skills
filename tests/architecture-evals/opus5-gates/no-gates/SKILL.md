---
name: nextjs-architecture
description: >-
  Use when placing or reviewing Next.js 16 App Router behavior: module ownership, Server Components,
  Server Actions, Route Handlers, streams, persistence, providers, caching, auth, or workflows.
---

# Next.js Capability Architecture

Design around product capabilities. Keep framework routes in `app/**`, colocate behavior under one
capability root, and add internal segments only when the behavior needs them.

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

Classify only behavior the task or existing product requires. Do not invent future policy,
persistence, alternate providers, reuse, or coordination to justify an abstraction.

A table, page, endpoint, provider, CRUD surface, or separate role check does not create a capability.
Group concepts that serve one product goal and change under one policy/lifecycle. Split a capability
only when actor goals, business policy, lifecycle, change authority, or a stable public contract
diverge. File count is not a boundary criterion. This gate is review-only: path rules can protect a
chosen boundary, but they cannot infer the product boundary.

Preserve an existing project's stack unless migration is requested. Fetch current framework docs
for API details. Match the length of a written proposal or review to what the decision needs; do not
pad it with filler sections or restated summaries.

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
query-cache.ts  serializable query-key identity shared by RSC prefetch and browser cache
stream.ts   streaming contract
job.ts      worker contract
```

Only create surfaces that have real consumers. A surface must publish an explicit stable API,
strengthen or translate a contract, or establish a runtime boundary. Named re-exports may publish
that API when its contracts are safe for the surface's runtime, free of provider shapes, and
explicit about their identity requirements. Private provider shapes, values bound to a runtime other
than the surface's own, implicit identity requirements, or unstable internals require a translated
public contract. Never use `export *`.

Public API admission is review-only: name the consumers and explain why each exported concept or
contract group is public. A re-export does not justify a forwarding operation or wrapper.

`actions.ts` is different: with top-level `'use server'`, value exports must be locally declared
async functions. It may import private implementations, but must not value-re-export them.

`query-cache.ts` is the only runtime-neutral root surface. Create it only when the same
serializable TanStack Query key identity is consumed by both a server prefetch/hydration path and a
browser query path. It imports only its own `domain/**` or `shared/kernel`. Next.js cache tags,
invalidation, fetchers, providers, and one-runtime-only keys remain private in `server/**` or
`client/**`.

## Dependency Rules

- `app/**` composes module public surfaces.
- `app/**` never imports module-private schemas, auth helpers, stores, or composition files; keep
  channel decoding local or expose a deliberate root contract.
- A module never imports another module's internal path.
- `domain/**` is pure and framework/provider independent. Product dependencies must be classified
  as pure or runtime-bound; an unclassified direct dependency fails the architecture check.
- `application/**` imports its domain, classified pure helpers, and capability-owned ports only.
  Its ports use the owning capability's types; a private adapter maps another capability's public
  contract.
- `server/**` implements driving or driven adapters for its own capability.
- Private `server/**` imports domain/application/shared code, never its own root channel surfaces;
  `server.ts`, `rsc.ts`, and `actions.ts` depend inward.
- `client/**` imports browser-safe contracts and the exact `actions.ts` mutations it needs.
- `ui/**` imports its own domain/client surfaces and exact action surface, not server internals.
- Server and browser paths may both import `query-cache.ts`; no other runtime-neutral root surface
  is admitted.
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
- A stream uses one channel-owned `AbortController`: request abort and downstream stream cancel both
  abort it, and its signal reaches the upstream producer.
- Jobs own retry, deadline, idempotency, and dead-letter decisions.

Do not force every channel into one result wrapper. Share safe failure codes, reporter context,
redaction, and provider-error mapping; keep channel-native behavior outside. Do not let a reused
application operation make a job inherit stream idle-timeout semantics unless both intentionally
use a named provider-liveness policy.

Expected application outcomes are typed values. Unexpected defects or outages are exceptions.
Framework control flow such as redirect/not-found stays outside generic catches.

## Identity, Effects, And Validation

Request identity contains actor, roles, tenant/ownership scope, request ID, and trace ID. Database
clients, provider clients, reporter, clock, and other effects are explicit dependencies.

- Authenticate at the channel/server boundary.
- Enforce business authorization in domain/application policy.
- Enforce ownership and tenant predicates in the store/RLS boundary.
- Validate untrusted input at the channel boundary.
- Validate provider/database data when it enters trusted code.
- Validate serialized output at an external contract.
- Do not re-parse a typed internal value because it crossed a directory.

For Supabase, do not mix user-scoped cookie clients and privileged clients behind one ambiguous
factory. A user-scoped context derives the verified actor and client from the same session. A
privileged context uses a separate server-only factory and carries explicit actor, scope, and
reason; every query still applies the intended ownership predicates.

## Data Ownership And Backend Authority

Keep provider rows distinct from domain/public values when names or semantics differ. Map them in
the private adapter.

Treat database object names as an ownership boundary when the provider API encodes them as strings.
Declare table/function ownership in the product contract and reject undeclared, dynamic, or
cross-capability `.from()`/`.rpc()` calls. This is a static canary, not a substitute for RLS,
grants, migrations, or integration tests.

When Next.js is a BFF for an authoritative external backend, do not duplicate that backend's domain
and application policy locally. Keep presentation models, browser lifecycle, aggregation, cache,
and genuinely frontend-owned policy; optional segments may remain absent.

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
- Mixing cookie-scoped and privileged database clients behind one context.
- Reading another capability's tables or functions through string literals.
- Duplicating an external backend's authoritative policy in a forwarding application layer.
- Reporting one unexpected failure at both an inner adapter and the outer channel.
- Treating test mocks, future reuse, or an alternate provider as current production requirements.
- Promoting similar names into `shared/**` without identical meaning, lifecycle, and ownership.
- Asserting incidental calls in tests instead of outcomes and report-once behavior.

## Reference Map

Read only the references needed for the decision, and read them directly: a handful of file reads is
not work to delegate to subagents.

- Placement: [modules and imports](references/placement/modules-and-imports.md),
  [ownership and public surfaces](references/placement/capabilities-and-ownership.md),
  [capability granularity](references/placement/capability-granularity.md),
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
  [database resource ownership](references/outbound/database-resource-ownership.md),
  [service transport](references/outbound/service-transport.md),
  [auth boundaries](references/security/dal-and-auth.md),
  [environment validation](references/security/env-validation.md),
  [RLS](references/outbound/supabase-rls.md).
- Reads and quality: [cache tiers](references/caching/cache-tiers.md),
  [client lifecycle](references/caching/client-cache.md),
  [testing](references/quality/testing-by-capability.md),
  [observability](references/quality/observability-and-sentry.md).
- Terms: [glossary](references/glossary.md).
