# Architecture Contract

This is the human-readable architecture behind `designing-architecture` and
`creating-react-components`. It defines ownership, placement, dependency direction, and public
surfaces. Runtime behavior is specified in [Runtime Boundaries](./runtime-boundaries.md).

The default profile is Next.js App Router with TypeScript. Existing projects keep equivalent
libraries and names unless a migration is explicitly requested.

## Quality Goals

| Goal | Architectural response |
| --- | --- |
| local reasoning | keep one product capability under one discoverable root |
| change isolation | forbid imports of another capability's internals |
| semantic depth | add application operations and ports only when they own real behavior |
| runtime safety | separate server, browser, and framework entry surfaces |
| security | enforce identity, policy, and store predicates at their own boundaries |
| evolvability | keep framework and provider details outside domain and application policy |

Folders do not produce these properties automatically. A rule is useful only when its failure mode
and verification are named.

Two rules are verified by review rather than by machine: the capability boundary and public API
admission. Machine checks enforce a boundary once chosen; they cannot discover the right capability
or public contract.

## Physical Model

Product behavior lives under one capability root:

```text
src/modules/<capability>/
```

Framework routes, metadata, layouts, and route-private presentation remain under `src/app/**`.
Capability-neutral code must pass the shared-admission gate before entering `src/shared/**`.
These are default paths, not hidden assumptions in the tooling. A product records `sourceRoot`,
`moduleRoot`, `appRoot`, `sharedRoot`, and `importAliases` in
`rules/architecture-contract.json`; aliases also remain configured in `tsconfig.json`. Alias
prefixes must end with `/` — `"@"` would claim every package name starting with `@`, and the tools
refuse that shape instead of resolving it.

```mermaid
flowchart TB
  accTitle: Primary placement decision
  accDescr: Product behavior goes to an owning capability, route-only composition stays under app, and proven capability-neutral code may enter an admitted shared root.
  Change["New behavior"]
  Owner{"One capability<br/>owns it?"}
  Module["modules/capability"]
  Route{"Only route-specific<br/>framework or UI glue?"}
  App["app/route"]
  Shared{"Proven capability-neutral<br/>contract?"}
  SharedRoot["shared/runtime-scope"]
  Stop["Resolve ownership"]

  Change --> Owner
  Owner -->|Yes| Module
  Owner -->|No| Route
  Route -->|Yes| App
  Route -->|No| Shared
  Shared -->|Yes| SharedRoot
  Shared -->|No| Stop
```

Do not create a module for a page, table, transport, or provider. Name the product capability whose
policy and vocabulary the code serves.

### Capability Granularity

A capability is a coherent product goal with its own vocabulary, policy, and lifecycle. The module
boundary follows a present product distinction, not a storage or screen boundary.

| Keep together when | Split when |
| --- | --- |
| concepts serve the same actor goal and business outcome | actor goals or business outcomes differ |
| authorization consequences and lifecycle are shared | policy, authorization consequences, or lifecycle diverge |
| the same owner changes the concepts together | change authority is independent |
| consumers need one capability contract | a narrower stable contract can hide the other capability's internals |

A table, CRUD screen, route, provider, dedicated role check, file count, or size threshold is not a
boundary by itself. Related lookup entities should remain in their owning taxonomy or workflow
capability until the product supplies an independent goal, policy, lifecycle, or contract.

This is a review-only decision. Reviewers name the actor goal, outcome, policy, lifecycle, change
authority, and public contract that justify keeping or splitting the concepts. Path rules enforce
the resulting ownership boundary; they cannot discover that boundary.

## Optional Internal Segments

A capability may use these reserved segments:

| Segment | Owns | Create when |
| --- | --- | --- |
| `domain/` | pure invariants, calculations, and domain values | a rule exists independently of framework and I/O |
| `application/` | policy, orchestration, projection, and owned ports | behavior passes the deletion test |
| `server/` | private server adapters, persistence modules, providers, and cache wiring | the capability performs server I/O |
| `client/` | browser async lifecycle, realtime, polling, and optimistic state | the browser owns that lifecycle |
| `ui/` | reusable capability presentation and interaction | more than route-private rendering is required |

Segments are optional. Empty segments and placeholder files are invalid. The smallest valid module
may be one private server file plus one public server surface.

Roles are architectural even when a tiny module keeps several roles in one file. Split a segment
when the split makes a dependency rule or responsibility clearer, not to complete a template.

## Internal Cohesion

Organize a segment around the product operation or lifecycle it implements. A folder is justified
when its production files change together around one coherent behavior. A directory that exists
only to hold tests, mocks, fixtures, or a single type is not a product boundary; colocate those
artifacts with the production owner instead.

Use the capability name at the module boundary, then omit it from private filenames when the parent
path already supplies the context. Prefer a file that names its role or behavior (`query.ts`,
`mutation.ts`, `row-mapper.ts`) over repeated `<capability>-*` prefixes or generic buckets such as
`services/`, `utils/`, and `helpers/`. These names describe responsibilities rather than prescribe a
fixed template; create only the files the implementation needs.

Supporting code stays with the behavior it supports. Keep one or a few local helpers in `lib.ts`;
use `lib/` when several helpers have independent tests or change reasons. Presentation-only labels,
formatters, and copy belong under `ui/lib/`; browser cache and transport helpers belong under
`client/lib/`; adapter mapping and provider configuration belong under `server/lib/`. Move a helper
to `domain/` only when it expresses a pure product rule rather than implementation support.

Tests live beside their owner as `*.test.*` or under its `__tests__/`. Test-only probes, fixtures,
and mocks stay in that test boundary and are never exported from production surfaces. When a runtime
schema witnesses a TypeScript value, derive the type from that schema instead of maintaining a
second handwritten shape; keep a manual type only when it deliberately expresses a broader or
different contract.

`rules/check-module-cohesion.mjs` mechanically enforces two of the properties above — a directory
whose production content is nothing but tests, mocks, or fixtures, and `lib.ts` coexisting with
`lib/` under one owner. Private-filename prefix repetition, role naming, and the rest of this
section remain review-only; a static walk over the tree cannot tell a legitimate complete scenario
name from a lazy one.

## Public Surfaces

Other capabilities and `app/**` import runtime-specific root files, never internal directories:

```text
src/modules/work-items/
├── domain/            # optional, private
├── application/       # optional, private
├── server/            # optional, private
├── client/            # optional, private
├── ui/                # optional, private
├── server.ts          # silent trusted composition API with explicit identity
├── rsc.ts             # current-request RSC read surface
├── actions.ts         # top-level 'use server'; UI commands
├── client.ts          # browser-safe read or subscription surface
├── ui.ts              # reusable capability UI
├── contracts.ts       # runtime-neutral vocabulary: types and the schemas that witness them
├── query-cache.ts     # shared serializable query-key identity for prefetch and hydration
├── stream.ts          # stream-channel contract
└── job.ts             # worker contract
```

This is a vocabulary, not a required tree. Create only surfaces with real consumers.

Keep a root surface as a small explicit export manifest when implementation grows: split private
implementation under its segment and publish named contracts from the root. Do not split a
capability merely to reduce file size. If one runtime surface develops independently meaningful
contract groups, record an architecture change before introducing public subpaths; deep imports are
not an accidental scaling mechanism.

A public surface is valid only when it does at least one of these:

1. publishes an explicit stable API for named consumers;
2. strengthens or translates a contract;
3. establishes a runtime boundary.

Keep product policy, provider IO and substantial channel implementations in private segments.
A root surface normally publishes named re-exports. It may own the small translation or composition
needed to establish its public contract or runtime boundary; keep that behavior at one owner.
Runtime-neutral surfaces may define their admitted contract behavior, such as serializable key
factories in `query-cache.ts`; they must not import browser or server implementations to do so.
`actions.ts` retains its compiler-constrained local async wrappers described below.

A root public surface may use named re-exports when its exported contracts are already stable, safe
for that surface's own runtime, free of provider shapes, and explicit about their identity
requirements. `export *` is not a public contract. When private exports carry provider shapes,
values bound to a runtime other than the surface's own, implicit identity requirements, or unstable
implementation details, the surface defines and translates to a public contract rather than
re-exporting them.

Public API admission is review-only. Reviewers name the consumers and explain why each exported
concept or contract group belongs to the public contract.

A one-to-one rename or re-export does not justify a new facade, operation, or wrapper. A one-to-one
channel wrapper is valid only when it establishes real runtime behavior such as authentication,
validation, failure translation, or telemetry ownership.

`actions.ts` is a compiler-constrained exception. With top-level `'use server'`, every value export
must be an async function declared in that file. Import the private implementation and call it from
the local action; do not value-re-export it. Type-only re-exports remain allowed. The base rule tier
checks all three: the directive, the async shape of every value export, and the absence of value
re-exports.

`contracts.ts` publishes the capability's vocabulary and nothing that runs: types, and the schemas
that witness those types. It exists so a neighbour's `domain/**` and `application/**` can speak
about this capability without depending on how it works — depending on a published vocabulary is not
depending on an implementation. It imports only its own `domain/**`, admitted `shared/kernel`, and
packages the contract classifies as pure. Consumers take types from it freely; a value taken from it
must be a schema *by declaration* (`export const X = <schema-package call>`, or a schema built from
another schema in the file). An exported function or class on a contract surface is behaviour, and
the checker rejects it whatever it is named — a name test admits
`export function chargeCardSchema() { return fetch(…) }`, which is behaviour wearing a schema's
name. Behaviour is taken from the owner's `server.ts` or restated as a port.

`query-cache.ts` is the one runtime-neutral exception to the channel-specific vocabulary. It exists
only when the same serializable TanStack Query key identity has both a server prefetch/hydration
consumer and a browser query consumer. It imports only its own `domain/**` or `shared/kernel`.
Next.js cache tags, invalidation, fetchers, providers, and one-runtime-only keys stay private in
`server/**` or `client/**`.

## Dependency Direction

The module is the unit of ownership. Segments express dependency direction inside that unit.

```mermaid
flowchart TB
  accTitle: Capability dependency direction
  accDescr: Framework entrypoints consume public capability surfaces; private server and client adapters depend inward on application and domain policy.
  App["app route"]
  Public["module root surfaces"]
  Server["server adapters"]
  Client["client lifecycle"]
  UI["capability UI"]
  Application["application policy"]
  Domain["domain rules"]
  External["store or provider"]

  App --> Public
  Public --> Server
  Public --> Client
  Public --> UI
  Server --> Application
  Server --> Domain
  Server --> External
  Client --> Domain
  UI --> Client
  UI --> Domain
  Application --> Domain
```

Normative rules:

1. `app/**` imports module root surfaces, not module internals.
2. A capability imports another capability only through its root public surface.
3. Module dependencies are acyclic.
4. `domain/**` is pure and imports only its own domain, admitted `shared/kernel`, or dependencies
   explicitly classified by the product as pure.
5. `application/**` imports its domain, pure helpers, and capability-owned port types. It imports
   no Next.js, React, database SDK, provider SDK, or concrete adapter.
6. `server/**` implements server-side driving and driven adapters for its capability.
   It does not import its own root public surfaces; `server.ts`, `rsc.ts`, and `actions.ts` depend
   inward on private server implementation.
7. `client/**` imports only browser-safe values and the exact `actions.ts` mutations it needs.
8. `ui/**` is a directory, not a runtime, and the `'use client'` directive classifies its files. A
   file there **with** the directive imports its own domain/client values and, when required, its
   exact action surface, and never `server.ts`, `rsc.ts`, or `server/**`. A file there **without**
   the directive is a Server Component: it may read its own capability's `rsc.ts`, and `ui.ts` may
   publish it. It may not reach its own `server/**` or another server surface — `rsc.ts` is the
   narrowing — nor another capability's internals; the checker reports `serverUiReach`.
9. Both server and browser paths may import `query-cache.ts`; it cannot import runtime code and is
   invalid with consumers on only one side.
10. `server-only` and `client-only` protect runtime modules in addition to path rules, and the
    resolved rule tier checks it: a `server.ts`, `rsc.ts`, `stream.ts`, or `job.ts` imports
    `'server-only'`, and `client.ts` imports `'client-only'`, before its other imports. `actions.ts`
    is excluded — it is the one surface browser code is meant to import.
11. A production build must fail when a Client Component imports a server surface.
12. Every direct runtime dependency is classified as pure or runtime-bound; unclassified packages
    fail closed until the product updates its contract.
13. Literal database resources are declared with an owner. Undeclared, dynamic, or unauthorized
    `.from()`/`.rpc()` calls fail the portable Supabase ownership canary.
14. A type-only edge — `import type`, `import { type X }`, `export type … from` — is erased by the
    compiler, so it does not carry a runtime direction: the browser/server, purity and neutrality
    rules do not apply to it. Ownership does. Importing a neighbour's private file as a type is the
    same coupling as importing it as a value, and fails the same way.
15. A table's *writes* belong to the owner of its invariants. `consumers` admits reads and the
    owner's public RPCs; an optional `writers` list narrows `insert`/`update`/`upsert`/`delete` to
    the subjects that may decide what the table contains. A writer must already be a consumer.

Within one capability, channel roots such as `rsc.ts` and `actions.ts` may call its trusted
`server.ts` surface or the same private composition. This is inward reuse, not a license for
`app/**` or another capability to import `server/**`. An orchestrating operation may take a
sibling's public `server.ts` contract as a type; a port in its own vocabulary with a private mapping
adapter is required only when the mapping carries policy (see Cross-Capability Workflows).

The `actions.ts` import from browser code is a deliberate framework boundary, not permission to
import arbitrary server modules.

The dependency classifier is exhaustive for direct `package.json` dependencies. The runtime list is
still project-owned because static analysis cannot infer whether a package is pure. This turns a new
provider package into a required decision instead of silently allowing it into domain/application.

The database resource check sees literal Supabase `.from()` and `.rpc()` calls only when the
receiver contains an identifier listed in `databaseClientIdentifiers`. This avoids treating every
same-named method as Supabase while keeping the canary explicit and reviewable. It does not trace
renamed clients, parse raw SQL, ORM queries, views reached indirectly, migrations, or dynamic
provider abstractions. It tells a read from a write by the method chained onto `.from(name)`, which
is syntax, not semantics: a write routed through a helper the checker cannot follow is not seen. RLS, explicit grants, migration review, and integration tests remain
separate guarantees.

## Cache Components

With `cacheComponents: true`, caching is a property of a function. A `'use cache'` function runs
outside the request: it cannot read `cookies()`, `headers()` or a request-scoped client, and every
argument becomes part of the cache key, so every argument must be serializable. The contract already
keeps identity and effects out of policy; this section fixes where the cache directive may sit
relative to them.

```mermaid
flowchart TB
  accTitle: Cache boundary below the identity boundary
  accDescr: A channel root resolves identity and effects, then passes only serializable scope into a cached server function, which tags itself and reads the store.
  Channel["rsc.ts, route, action: request scope"]
  Resolved["identity and client resolved"]
  Cached["server/** function with use cache"]
  Store["store or provider"]

  Channel --> Resolved
  Resolved -->|"ids, tenant, filters"| Cached
  Cached -->|"cacheTag, cacheLife inside"| Store
```

Normative rules:

1. `'use cache'` sits in `server/**`, below the identity boundary. The channel root resolves identity
   and effects first and passes the cached function serializable arguments only: ids, tenant,
   filters. A request-scoped client, a reporter or an identity object never crosses into a cached
   function. It cannot be a key, and a cookie-scoped client cached once would serve one user's rows
   to the next. The cached function obtains its store from the capability's own composition, not
   from an argument.
2. Every input that changes the result is an argument. A read whose result depends on tenant or user
   takes that scope as a parameter, so the scope enters the key by construction.
3. Per-user data uses `'use cache: private'` or stays uncached. Plain `'use cache'` is a shared,
   prerenderable cache; data one identity may see and another may not never enters it.
4. `cacheTag` and `cacheLife` are called inside the cached function. The tag vocabulary is a private
   `server/**` module; nothing outside the capability learns how its cache is keyed.
   `query-cache.ts` carries TanStack Query keys and never a Next.js tag.
5. Invalidation belongs to the channel that wrote. An `actions.ts` action calls `updateTag(tag)` so
   the request that wrote reads its own write; a Route Handler or job calls
   `revalidateTag(tag, 'max')`. `server.ts` operations return the affected scope, `server/**` names
   the tag for it, and `application/**` and `domain/**` import nothing from `next/cache`. This is
   the one answer; ADR 0001 §8 and Runtime Boundaries defer to it.
6. A current-request read reached from `rsc.ts` or a page — `cookies()`, `headers()`,
   `searchParams`, an uncached store read — renders under a Suspense boundary: the segment's
   `loading.tsx` or an inline `<Suspense>` around the region. The build fails otherwise. The route
   owns the boundary; the capability owns which of its reads are current-request.

The `work-items` fixture shows the invalidation half: `server/cache-tags.ts` names the tag, and
`actions.ts` invalidates through the request scope after a successful create
([fixture](../tests/architecture-pilots/fixtures/work-items/src/modules/work-items/actions.ts)).

## Application Operations

Create an application operation only when deleting it moves meaningful complexity into callers.
Qualifying behavior includes:

- policy or branching not owned by a store;
- orchestration across effects or capabilities;
- a projection that combines sources;
- transaction intent;
- behavior shared by multiple runtime channels.

Simple store-backed CRUD may be:

```text
channel boundary -> capability server service -> private store
```

Real application behavior is:

```text
channel boundary -> application operation -> explicit dependencies
```

An operation is framework-neutral, reports nothing, and receives the smallest dependency object it
uses. Input validation, row mapping, cache invalidation, telemetry, or an ordinary uniqueness
conflict do not by themselves justify a forwarding operation.

Do not invent persistence, alternate providers, coordination, or reuse to make an operation look
necessary.

## Ports

A port belongs to the application behavior that needs it:

```text
modules/<owner>/application/ports/<capability>.ts
```

Create one only when all are true:

1. application behavior must name a capability independently of technology;
2. the contract is written in application language, not CRUD or SDK vocabulary;
3. inversion protects real volatility, ownership, or isolation;
4. a production consumer exists now.

Adapter count, locality, and test doubles are evidence, not gates. A local store can remain a
private driven adapter without a mirrored repository interface. A remote provider can warrant a
port with one implementation when the application must speak its capability independently.

## Cross-Capability Workflows

An outer route may wire existing behavior but may not own meaningful product policy.

Create an orchestrating capability when deleting cross-capability code would move filtering,
grouping, authorization consequences, projection, transaction intent, or coordination into a
route or sibling capability. One current route consumer is enough when the policy is real.

```mermaid
flowchart TB
  accTitle: Cross-capability orchestration
  accDescr: A board capability owns board policy, names what it needs from work-items and labels as types taken from their public server surfaces, and receives the concrete servers from its own composition.
  Route["app/board"]
  BoardSurface["board/rsc.ts"]
  BoardComposition["board/server.ts composition"]
  BoardOperation["board application"]
  WorkPublic["work-items/server.ts"]
  LabelPublic["labels/server.ts"]

  Route --> BoardSurface
  BoardSurface --> BoardComposition
  BoardComposition --> BoardOperation
  BoardOperation -.->|"type only"| WorkPublic
  BoardOperation -.->|"type only"| LabelPublic
  BoardComposition --> WorkPublic
  BoardComposition --> LabelPublic
```

The orchestrator names what it needs from each source capability. It may take that contract as a
**type** from the sibling's public `server.ts` (`import type { WorkItemsServer }`, or a `Pick` of
it): the compiler erases the edge, and the public surface is already the ownership boundary
(rule 14). The concrete servers arrive through the orchestrator's own composition. A port in the
orchestrator's vocabulary plus a private mapping adapter is required only when the deletion test
names policy in the mapping — a rename the callers depend on, a reshaped value, a decision about
the sibling's data. An adapter whose body is `(t) => source.listForBoard(t)` is the forwarding
wrapper ADR 0001 rejects, and the `board-workflow` fixture no longer carries two of them.

Source capabilities do not import the orchestrator or one another. Their trusted `server.ts`
surfaces accept explicit identity, enforce their own policy, and remain silent so the outer runtime
channel owns the one unexpected-error report.

Sequence dependent calls. If label IDs come from work-items, load work-items before labels.
Authorization-sensitive joins require a complete resolution result that distinguishes visible,
missing, and forbidden references without exposing sensitive existence. Silent omission is not a
valid substitute for a required rejection.

## Shared Admission

Allowed shared roots are runtime-specific:

```text
shared/kernel
shared/server
shared/client
shared/ui
```

Admission requires:

1. at least two real capability consumers;
2. identical meaning and lifecycle;
3. no natural capability owner;
4. a named maintainer and narrow contract;
5. copying is now more expensive than coordinating the shared contract.

`shared/kernel` is stricter: terminology, invariants, and change cadence must also be identical.
Similar names such as `Email`, `TenantId`, or `Money` are insufficient.

Admitted infrastructure is the exception to the first requirement, because the contract itself names
it: `RequestIdentity` in `shared/kernel` — actor, tenant, request and trace identifiers, nothing
provider-shaped — and single-consumer server plumbing that binds a provider or the framework to the
runtime, such as `shared/server/<provider>.ts`, a request-scope resolver, or the reporter. Each still
carries a named maintainer and a narrow contract, and is demoted the day a capability becomes its
natural owner. A capability's domain identity — its ids and its role vocabulary — is not
`RequestIdentity` and is never lent to a neighbour.

Demote shared code when consumers diverge or one capability becomes the natural owner. Broad
`utils`, `services`, or migration buckets are invalid.

## Reference Capability

This example shows ownership, not mandatory files:

```text
src/
├── app/work-items/
│   ├── page.tsx
│   └── _components/
├── modules/work-items/
│   ├── domain/
│   ├── application/
│   ├── server/
│   ├── client/
│   ├── ui/
│   ├── server.ts
│   ├── rsc.ts
│   ├── actions.ts
│   ├── client.ts
│   └── ui.ts
└── shared/
    ├── kernel/
    ├── server/
    ├── client/
    └── ui/
```

A simple CRUD capability omits `application/`. An RSC-only capability omits `client/`,
`client.ts`, and `actions.ts`. Route-private UI remains under `app/**`.

## Non-Goals

This architecture does not require:

- a DI container;
- a port per table;
- a use-case per endpoint;
- every optional segment;
- TanStack Query for every read;
- a universal result wrapper;
- a generic shared library.

Continue with [Runtime Boundaries](./runtime-boundaries.md) for channels, trust, failures, cache,
transactions, and testing. Use [Frontend Composition](./frontend-composition.md) for RSC, Client
Components, forms, state, and UI ownership.
