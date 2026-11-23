# ADR 0001: Capability-First Modules

- Status: Accepted (maintainer architecture decision; comparative skill gate withdrawn)
- Date: 2026-07-27
- Accepted: 2026-07-28
- Decision owner: nextjs-clean-skills maintainers
- Baseline: `tests/architecture-pilots/baseline.json`
- Candidate plan: `tests/architecture-pilots/candidate-plan.json`
- Pilot results: `tests/architecture-pilots/RESULTS.md`
- Skill gate: `tests/architecture-evals/RELEASE_V3_RESULTS.md`
- Layer-first control: `626140b5d68e5b3afcfc80e209df5d881f35d59c`

This record holds the decision, why it was taken, and how it was validated. The rules it produced
live once, in [Architecture Contract](./architecture-contract.md) and
[Runtime Boundaries](./runtime-boundaries.md). Where an
older copy of this record and the contract differ, the contract is normative.

## Context

The layer-first 2.0 checkpoint corrected real defects but made thirteen global path categories the
primary architecture. Those categories mix domain, application policy, contracts, driving and
driven adapters, framework surfaces, browser cache, and technical helpers. Capability ownership is
documented but not physically protected.

The reference template shows the cost. `work-items` is spread across thirteen architecture files
before route-private UI is counted. Its six exported use-case functions all have at most two
statements; four directly forward to `deps.workItems`. Server Actions and Route Handlers repeat
composition and cache work, while client reads call Server Actions.

The redesign must improve capability locality without losing core purity, runtime separation, or
enforceable dependency direction.

## Decision

The product capability is the unit of ownership. The framework route composes capabilities and owns
nothing that survives a redesign of the route. Segments inside a capability are optional roles that
carry dependency direction only when they exist. Fourteen decisions follow, each with the place
that now states it normatively:

| # | Decision | Stated in |
| --- | --- | --- |
| 1 | The module is the primary unit; route-private glue stays under `app/**` | [Physical Model](./architecture-contract.md#physical-model), [Capability Granularity](./architecture-contract.md#capability-granularity) |
| 2 | Segments are reserved but optional; introduce them for actual responsibilities | [Optional Internal Segments](./architecture-contract.md#optional-internal-segments) |
| 3 | Public surfaces are runtime-specific root files; `export *` and forwarding wrappers are rejected; `actions.ts` is compiler-constrained | [Public Surfaces](./architecture-contract.md#public-surfaces) |
| 4 | Dependency direction is small and module-aware; a type-only edge keeps ownership and vocabulary, not bundle direction | [Dependency Direction](./architecture-contract.md#dependency-direction) |
| 5 | Application behavior keeps the deletion test | [Application Operations](./architecture-contract.md#application-operations) |
| 6 | Ports are capability-owned and appear only for real volatility; an orchestrator may take a sibling's public contract as a type | [Ports](./architecture-contract.md#ports), [Cross-Capability Workflows](./architecture-contract.md#cross-capability-workflows) |
| 7 | Boundary policy is shared, channel behavior is not: typed expected outcomes, exceptions for defects, one report per channel, no universal result wrapper | [Failures And Reporting](./runtime-boundaries.md#failures-and-reporting) |
| 8 | Identity and effects stay explicit: `RequestIdentity` in `shared/kernel`, effects as dependencies, the channel that wrote invalidates | [Request Context And Effects](./runtime-boundaries.md#request-context-and-effects), [Cache Components](./architecture-contract.md#cache-components) |
| 9 | Validation follows trust boundaries | [Validation](./runtime-boundaries.md#validation) |
| 10 | Shared code has admission and reversal rules; admitted infrastructure is the named exception | [Shared Admission](./architecture-contract.md#shared-admission) |
| 11 | Runtime poisoning needs two controls: path rules, and `server-only`/`client-only` proven by a production build | [Dependency Direction](./architecture-contract.md#dependency-direction) rules 10–11 |
| 12 | The enforcement floor is invariant-based: seven properties, one failing mutation each | [Enforcement Floor](./adoption-and-enforcement.md#enforcement-floor), [`rules/README.md`](../rules/README.md) |
| 13 | Architecture acceptance and skill acceptance are separate gates | Validation, below |
| 14 | Migration is semver-major and explicit; two topologies never mix inside one capability | [Incremental Migration](./adoption-and-enforcement.md#incremental-migration) |

The architecture deliberately does not prescribe exact internal filenames, one output schema per
public server call, one global application error class, one transaction abstraction, or a
universal channel boundary combinator.

## Validation

The historical release-v3 scores below do not establish skill superiority: the control arms
inherited installed skills. See the authoritative
[integrity note](../tests/architecture-evals/README.md#evidence-integrity-note--2026-09-10).
No isolated replacement matrix is recorded here. The pilot touch sets also differ in scope and
counting units; they illustrate locality, not comparative cost. Framework-free fixtures and the
old Next.js pilot do not qualify the current runtime/identity contract.

Three isolated fixtures test the decision before it becomes skill guidance:

1. `work-items`: store-backed CRUD with RSC, browser query, Server Action, and HTTP channels;
2. `assistant-stream`: remote provider, streaming lifecycle, cancellation, and safe failure mapping;
3. `board-workflow`: cross-capability orchestration over work-items and labels.

Four preregistered changes were replayed on the candidate and on the layer-first control: add one
entity field; add a second channel to an existing capability; replace one data/provider source;
change unexpected-error reporting policy. Touched files were recorded before implementation; source
files, test files, architecture roots, duplicated auth/wiring/cache blocks, boundary parses, and
public surfaces were counted after.

The layer-first replay is published at `fullstack-ai-template@research/layer-first-baseline-replays`.
In the provider-swap replay, swapping the source changes the public server composition and private
adapter, but not RSC, action, or HTTP callers.

A real App Router pilot at `fullstack-ai-template@research/capability-next-pilot` (`0a3eeca`)
complements the fixtures. Its Server Action accepts `FormData`, identity and provider effects are
resolved inside capability composition, its `route.ts` exports `GET`, and a Next.js 16.2.10
production build passes. A deliberate Client Component import of the server surface fails that
build through `server-only`.

The original architecture gate required (evidence is limited as described above): every capability
discoverable under one root; simple CRUD adding no forwarding operation; application behavior independent of framework and
provider; a data source replaceable without touching application callers; channel-specific failures
keeping native Next.js semantics; auth enforced at channel, policy, and store; RSC and browser reads
with one owner and no Server Action as read transport; cross-capability composition through public
surfaces and acyclic; no provider row in domain or public contracts; poisoning mutations and the
production build failing and passing as expected; and no pilot increasing source-file touches or
root scatter without a documented runtime or ownership benefit.

The skill gate is a separate question — whether the skill helps a model apply the architecture
without scaffolding — and was run against no skill, released `v1.3.2` (the control that contains
the topology-independent correctness fixes), and the layer-first checkpoint:

```text
4 arms x 3 scenarios x 2 model tiers x 2 framings x 2 repeats = 96 runs
```

The contaminated historical run recorded candidate v3 at 239/240 after one registered blind
adjudication, with no fatal or negative cells. Its ranking is not a valid comparison between
isolated arms
([`RELEASE_V3_RESULTS.md`](../tests/architecture-evals/RELEASE_V3_RESULTS.md)). Disputed judge
cells received one additional blind pass over the same frozen outputs; generation was not repeated
to resolve scoring. Manual review added three release regressions: no speculative persistence or
port when the requested behavior does not store state; stream idle timeout must not leak into job
deadline semantics; authorization-sensitive joins must not silently omit forbidden references.

## Consequences

Expected benefits:

- product changes are locally discoverable;
- capability isolation becomes the primary structural rule;
- application and port abstractions appear only for real behavior;
- runtime-specific boundaries remain explicit;
- tooling guards a smaller set of high-value invariants.

Costs and risks:

- optional segments require agent judgement;
- public surfaces can drift without executable export checks;
- server/client colocation needs additional poisoning checks;
- `shared/**` requires active demotion, not only promotion;
- migration from layer-first placement is a breaking topology change; the layer-first 2.0
  implementation is withdrawn as a release candidate and retained as a research control.

## Amendment 2026-11-23

A review of release 4.7.3 ran the shipped rules against a disposable project and found the
executable floor narrower than the contract in seven places; two reviews of the fix added the
last two rows. Each is an observed pass, now a failing mutation:

| Observed | Decision |
| --- | --- |
| policy typed with a framework request or a provider row linted clean, because every type-only edge skipped the purity rules | a type edge skips only the bundle rules; pure zones admit a type from a public root surface and judge every other as a value (rule 14) |
| `domain/**` imported a devDependency and a hoisted transitive package unreported | pure zones import only `purePackages`; the manifest check is no longer the only gate (rule 12) |
| a neighbour's private server code imported `rsc.ts` and `actions.ts` | channel surfaces are for composition and the browser; server code calls `server.ts` (rule 16) |
| a route and a Client Component imported a database driver | provider packages are named only by adapters (rule 17) |
| capabilities and `shared/ui` imported route-private components | nothing outside `app/**` imports from it (rule 18) |
| a file outside the source root re-exported a private store to a route; an alias in `tsconfig.json` that the contract did not declare carried a deep import past every rule | imports are resolved by the project's TypeScript, and a source file outside the source root is not importable |
| a view imported `next/headers`, and a view without `'use client'` imported `client.ts` | `ui/**` imports nothing only a server can load, and a view that needs browser-only code declares the directive (rule 8) |
| the database canary printed `ok` with no client identifier configured | an unconfigured canary says it measured nothing, and fails beside a Supabase dependency |

Four decisions change the contract rather than its enforcement:

- `ui/**` imports no server code. A Server Component that reads lives in `server/**` and is
  published by `rsc.ts`, so the runtime of `ui.ts` follows from its name again. The previous
  rule let `ui.ts` publish a file reading `rsc.ts`, which only a production build caught.
- The HTTP path and response schema are published in `contracts.ts`. They had two owners, the
  handler and `client.ts`, joined by a string and a cast.
- `RequestIdentity` is nominal, frozen and constructed only in `shared/server`, and a trusted
  `server.ts` checks that it was issued there. The model rested on a type any caller could write
  as a literal or copy with another tenant.
- A shared server cache over tenant-private data is the last choice, with a named owner and an
  isolation test, because it is the one read path without row-level security.

Channel entry order is corrected to authenticate before decoding, and a reaction to a
neighbour's write is named as orchestrator policy. No comparative agent evaluation was run for
this amendment.
