# Architecture Documentation

Human-facing documentation for `nextjs-clean-skills`.

> [ADR 0001: Capability-First Modules](./0001-capability-first-modules.md) is a Proposed research
> hypothesis. It is not part of the current architecture contract.

## Reading Path

1. Start with [Architecture Contract](./architecture-contract.md) for placement, layers, slices,
   quality goals, use-cases, ports, and public surfaces.
2. Read [Runtime Boundaries](./runtime-boundaries.md) for request flow, trust, failures, state,
   transactions, observability, and testing.
3. Read [Frontend Composition](./frontend-composition.md) for RSC, Client Components, forms, state,
   and component ownership.
4. Use [Decision Maps](./agent-decision-maps.md) while designing or reviewing a change.
5. Use [Adoption And Enforcement](./adoption-and-enforcement.md) when applying the contract to an
   existing repository.
6. Open [Evidence](./evidence.md) when reviewing or challenging a rule.

| Document | Purpose |
| --- | --- |
| [ADR 0001: Capability-First Modules](./0001-capability-first-modules.md) | proposed topology and pilot gates |
| [Architecture Contract](./architecture-contract.md) | normative placement and dependency model |
| [Runtime Boundaries](./runtime-boundaries.md) | runtime authority and cross-cutting invariants |
| [Frontend Composition](./frontend-composition.md) | human UI architecture |
| [Decision Maps](./agent-decision-maps.md) | compact design and review flowcharts |
| [Adoption And Enforcement](./adoption-and-enforcement.md) | rollout, enforcement status, and known gaps |
| [Evidence](./evidence.md) | sources, measurements, and explicit judgement |
| [`rules/`](../rules/) | executable portion of the contract |

## Contract Boundaries

- Human docs explain the architecture a team adopts.
- `rules/import-table.json` defines executable layer roots, ownership, and import permissions.
- Skill references tell coding agents how to implement a decision.
- `docs/evidence.md` explains why decisions exist; it does not create rules.
- Product repositories provide concrete profiles, names, and stricter local constraints.

The complete layer table is generated from `rules/import-table.json` into both human and agent
surfaces. A disagreement between surfaces is a defect, not an invitation to choose one.

## Documentation Standard

Human docs are concise and normative:

- one subject per document;
- tables for contracts and decision inputs;
- vertical Mermaid diagrams for flows;
- no release history, evaluation transcripts, or copy-ready tutorials;
- links to agent references for implementation procedure;
- explicit distinction between normative, enforced, review-only, and known-gap rules.

## Maintenance

The complete change procedure is in
[Adoption And Enforcement](./adoption-and-enforcement.md#change-the-architecture).

Run:

```bash
node scripts/validate-contract-sync.mjs --fix
npm run validate
```

Then inspect the rendered Markdown and hosted CI. Local validation and hosted execution are separate
verdicts.
