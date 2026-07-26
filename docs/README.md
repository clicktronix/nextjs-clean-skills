# Architecture Documentation

Human-facing documentation for `nextjs-clean-skills`.

Start with [Architecture Contract](./architecture-contract.md). It defines the structure and the
non-negotiable dependency rules. Use [Decision Maps](./agent-decision-maps.md) while placing a
change. Open [Evidence](./evidence.md) only when reviewing or challenging a rule.

| Document | Purpose |
| --- | --- |
| [Architecture Contract](./architecture-contract.md) | The architecture a team adopts |
| [Decision Maps](./agent-decision-maps.md) | Placement, port, use-case, and boundary decisions |
| [Evidence](./evidence.md) | Sources, measurements, and explicit judgement |
| [`rules/`](../rules/) | The part of the contract enforced by ESLint |

## Sources Of Truth

- `docs/architecture-contract.md` is the human contract.
- `rules/import-table.json` is the executable import contract.
- Skill references are operational instructions for coding agents.
- `docs/evidence.md` explains why a rule exists; it does not create rules.

A disagreement between these surfaces is a defect. Do not resolve it by choosing the convenient
one. Fix all affected surfaces in the same change.

## Maintenance

For an architecture change:

1. Change the human contract.
2. Change `rules/import-table.json` when the rule is enforceable.
3. If a layer root changed, update its row label in the placement reference.
4. Regenerate permissions and the skill contract with
   `node scripts/validate-contract-sync.mjs --fix`.
5. Update the relevant reference and scenario.
6. Run `npm run validate`.

Keep release history in `CHANGELOG.md`, implementation procedures in skill references, and
measurements in `evidence.md`. Do not copy those into the architecture contract.
