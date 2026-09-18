# ADR 0001: Capability-First Modules

- Status: Accepted
- Date: 2026-07-27
- Accepted: 2026-07-28
- Compressed: 2026-09-11
- Decision owner: nextjs-clean-skills maintainers
- Baseline: `tests/architecture-pilots/baseline.json`
- Candidate plan: `tests/architecture-pilots/candidate-plan.json`
- Pilot results: `tests/architecture-pilots/RESULTS.md`
- Skill gate: `tests/architecture-evals/RELEASE_V3_RESULTS.md`
- Layer-first control: `626140b5d68e5b3afcfc80e209df5d881f35d59c`

This record holds the decision, why it was taken, and how it was validated. The rules it produced
live once, in [Architecture Contract](./architecture-contract.md) and
[Runtime Boundaries](./runtime-boundaries.md). Until 2026-09-11 this document restated the
contract in fourteen sections; the restatement had drifted in four places (who invalidates, the
re-export conditions, the identity type, the carrier for `forbidden`), so it was removed. Where an
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
| 2 | Segments are reserved but optional; an empty segment is invalid | [Optional Internal Segments](./architecture-contract.md#optional-internal-segments) |
| 3 | Public surfaces are runtime-specific root files; `export *` and forwarding wrappers are rejected; `actions.ts` is compiler-constrained | [Public Surfaces](./architecture-contract.md#public-surfaces) |
| 4 | Dependency direction is small and module-aware; a type-only edge keeps ownership, not direction | [Dependency Direction](./architecture-contract.md#dependency-direction) |
| 5 | Application behavior keeps the deletion test | [Application Operations](./architecture-contract.md#application-operations) |
| 6 | Ports are capability-owned and appear only for real volatility; an orchestrator may take a sibling's public contract as a type | [Ports](./architecture-contract.md#ports), [Cross-Capability Workflows](./architecture-contract.md#cross-capability-workflows) |
| 7 | Boundary policy is shared, channel behavior is not: typed expected outcomes, exceptions for defects, one report per channel, no universal result wrapper | [Failures And Reporting](./runtime-boundaries.md#failures-and-reporting) |
| 8 | Identity and effects stay explicit: `RequestIdentity` in `shared/kernel`, effects as dependencies, the channel that wrote invalidates | [Request Context And Effects](./runtime-boundaries.md#request-context-and-effects), [Cache Components](./architecture-contract.md#cache-components) |
| 9 | Validation follows trust boundaries | [Validation](./runtime-boundaries.md#validation) |
| 10 | Shared code has admission and reversal rules; admitted infrastructure is the named exception | [Shared Admission](./architecture-contract.md#shared-admission) |
| 11 | Runtime poisoning needs two controls: path rules, and `server-only`/`client-only` proven by a production build | [Dependency Direction](./architecture-contract.md#dependency-direction) rules 10–11 |
| 12 | The enforcement floor is invariant-based: eight properties, one failing mutation each | [Enforcement Floor](./adoption-and-enforcement.md#enforcement-floor), [`rules/README.md`](../rules/README.md) |
| 13 | Architecture acceptance and skill acceptance are separate gates | Validation, below |
| 14 | Migration is semver-major and explicit; two topologies never mix inside one capability | [Incremental Migration](./adoption-and-enforcement.md#incremental-migration) |

The architecture deliberately does not prescribe exact internal filenames, one output schema per
public server call, one global application error class, one transaction abstraction, or a
universal channel boundary combinator.

## Validation

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
It invalidated the first provider-swap comparison because the candidate selected its concrete
provider in the runtime harness; the corrected replay adds a capability-owned composition control:
swapping the source changes the public server composition and private adapter, but not RSC,
action, or HTTP callers.

A real App Router pilot at `fullstack-ai-template@research/capability-next-pilot` (`0a3eeca`)
complements the fixtures. Its Server Action accepts `FormData`, identity and provider effects are
resolved inside capability composition, its `route.ts` exports `GET`, and a Next.js 16.2.10
production build passes. A deliberate Client Component import of the server surface fails that
build through `server-only`.

The architecture gate required, and the pilots showed: every capability discoverable under one
root; simple CRUD adding no forwarding operation; application behavior independent of framework and
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

Candidate v3 scored 239/240 after one registered blind adjudication, had no fatal or negative
cells, and led every control in every scenario
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
- migration from 1.x is a breaking topology change. Released 1.x remains installable; the
  layer-first 2.0 implementation is withdrawn as a release candidate and retained as a research
  control.
