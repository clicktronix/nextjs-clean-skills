# Repair plugin quality

Goal: make migration acceptance trustworthy, preserve capability cohesion, support clients without Workflow, and align runtime examples and evidence with their claims. Source: [quality audit](2026-11-07-plugin-quality-audit-source.txt), pinned to main `1ae3e45`; the fixes were first developed at that revision. The delivery branch is stacked on #50 — docs: add rules from a large application migration (`5aaa529`) so its blanket mutation requirement can be replaced without contradictory instructions or duplicate PR changes.

1. Repair inventory, destinations and lint coverage together (Q1–Q3). Add negative and positive CLI tests so missing files or disabled rules cannot become an accepted migration.
2. Make owner-led execution the portable default (Q4). Reuse existing briefs, select only needed lenses, and scope extra tests to migration risks rather than requiring a mutation for every test. Align the UI dependency summary with the normative contract.
3. Repair streaming cancellation and deadline handling (Q5), exercising consumer close and idle providers through public stream/job surfaces before updating claims.
4. Correct all active evidence summaries (Q6–Q7). Preserve historical measurements with explicit limitations; distinguish framework-free fixtures from current integration proof.
5. Regenerate distributed mirrors, run targeted regressions and one full validation, inspect the full diff and integration with the two open PRs, then create a separate PR. No merge or paid model eval.

Existing PRs: #49 — fix: correct Next.js 16.3 APIs and contract contradictions (`b116899`); #50 — docs: add rules from a large application migration (`5aaa529`). Their changes remain separately owned. The framework corrections merge before the migration rules; this PR targets the migration-rules branch.

## Verification record

Implemented Q1–Q7 and the follow-up simplifications. Migration lint now records diagnostics and effective coverage from the same ESLint instance, using the target's default flat config and existing dependencies; census reads that bound artifact and checks freshness. Bare ESLint JSON is intentionally no longer sufficient evidence. Non-code assets and safe relative subpaths stay in the plan. Workflow is optional, lens delegation explicit, and moved tests require extra mutations only when a concrete risk needs one.

Observed regressions on the original main in a disposable copy: the omitted-capability reproduction returned success (expected failure), and the consumer-break test left the provider open. Both reproduced the audit's failures. The disposable copy was removed.

Targeted checks passed:
- `node scripts/validate-migration-coverage.mjs`: recorded CLI pipeline with real ESLint; full/partial ignore, five disabled mandatory rules, suppressed diagnostics, parse failure, violation and clean controls, foreign cwd alias resolution, CSS/JSON/SVG/MDX and nested destination/collision cases.
- `node scripts/validate-migration-lib.mjs`: inventory/assignment/path safety, records, freshness, census and gate regressions.
- `node tests/architecture-pilots/run-runtime-tests.mjs`: public stream/job controls including consumer break, cancellation while idle, deadlines before/after commit, and an adapter ignoring abort.
- Workflow, docs/link, prose duplication, provenance and both architecture-pilot validators passed. Generated plugin mirrors were rebuilt.

The full gate will run in hosted PR CI. A foreign long-running stand occupies the local shared heavy slot; no additional slot or service is started. No paid model evaluation or new Next.js integration/build claim is made. The frozen experiment and touch-count limitations are corrected in all active summaries; historical measurements are retained.

Trial integration with the framework-corrections branch was clean. The competing test-policy paragraph in the migration-rules branch was resolved by stacking this change on it, keeping one risk-based test policy. Hosted CI results will be recorded in the PR.

The first hosted attempt stopped at the reference-length check. Both affected references were shortened without changing the limit; the failed lint and their executable JSON/plan examples passed locally afterward. The final hosted result is recorded on the PR.
