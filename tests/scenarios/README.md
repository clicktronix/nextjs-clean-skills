# Reference Scenarios

These small scenarios guard one reference at a time. They complement, but do not replace, the
comparative architecture release gate in [`../architecture-evals/`](../architecture-evals/).

## Contract

```json
{
  "skills": ["designing-architecture"],
  "tests_reference": "references/<file>.md#<anchor>",
  "query": "the task given to the agent",
  "baseline_failure": "the predicted failure without the reference",
  "expected_behavior": ["required behavior"],
  "anti_expectation": ["overreach the agent must avoid"]
}
```

`tests_reference` is relative to the first skill in `skills`. It may point to `SKILL.md` or to a
file under `references/`. `npm run validate` checks required fields, known skill names, file paths,
and GitHub-style anchors.

An authored `baseline_failure` is a hypothesis. It becomes evidence only after a
`baseline_observed` record captures the model, framing, isolation method, runs, and verdict.
A successful `green_check` records one SHA-256 over the skill, `tests_reference`, query, failure,
expectations, and anti-expectations. Editing any GREEN input invalidates it until a rerun.

## Running One Scenario

1. Run the query with fresh `HOME` and `CODEX_HOME` directories and no installed skills.
2. Confirm the exact predicted failure. If it does not reproduce, narrow or remove the guidance.
3. Run the same query with only the target `SKILL.md` and `tests_reference` available.
4. Confirm every expected behavior and no anti-expectation.
5. Repeat disputed cells; do not rewrite a response after seeing the result.

Do not run from a product repository. Files in the working directory can leak the intended answer
into the baseline.

## Evidence Levels

The release decision uses the frozen four-arm architecture matrix:

```text
no skill | v1.3.2 | layer-first checkpoint | capability-first candidate
```

The accepted candidate v3 scored `239/240`, had no negative or fatal cells, and led every scenario
across 24 candidate cells. See
[`../architecture-evals/RELEASE_V3_RESULTS.md`](../architecture-evals/RELEASE_V3_RESULTS.md).
That matrix provides comparative evidence for three load-bearing workflows; it does not validate
every reference rule.

Reference scenarios answer a narrower question: whether one paragraph changes one recurring agent
decision. Historical results remain useful only for the behavior they actually tested:

- `defense-in-depth-ownership`: RED 3/3 and GREEN under the v1.3.x wording. The ownership predicate
  is proven; the capability-first placement wording needs a new run.
- `explicit-variants-over-mode`: historical RED 2/2 and Luna RED to GREEN, invalidated 2026-07-30 by the
  skill rename and verification-gate removal; rerun pending.
- `static-hook-calls`: Luna RED to GREEN against the direct-Hook wording, invalidated 2026-07-30 by the
  skill rename and verification-gate removal; rerun pending.
- `next16-error-retry-callback`: Luna RED to GREEN for `unstable_retry`, invalidated 2026-07-30 by the
  skill rename and verification-gate removal; rerun pending.
- `compound-provider-split`: the old four-provider evidence was retired. The corrected
  state-ownership RED did not reproduce and remains a hypothesis.
- `rsc-hybrid-read`: inconsistent baseline. Retained guidance is deliberately narrow:
  `initialData`, explicit freshness, and one cache owner.

Rows marked `hypothesis` below have no accepted observed run.

## Coverage

| Reference | Scenario | Status |
| --- | --- | --- |
| security/dal-and-auth | defense-in-depth-ownership | predicate proven; placement rerun required |
| caching/client-cache | rsc-hybrid-read | inconsistent historical baseline |
| caching/client-cache | browser-owned-query-transport | hypothesis |
| seams/dependency-categories | port-over-local-engine | hypothesis |
| use-cases/when-a-use-case-exists | crud-forwarding-use-cases | hypothesis |
| use-cases/validation-once | validate-once-per-boundary | hypothesis |
| use-cases/channel-boundaries | nested-composition-no-bypass | hypothesis |
| outbound/row-vs-domain-types | select-derived-from-domain-schema | hypothesis |
| inbound/streaming | streaming-through-server-action | hypothesis |
| inbound/route-handlers | framework-control-flow-not-swallowed | hypothesis |
| errors/error-taxonomy | transport-neutral-error-mapping | hypothesis |
| quality/observability-and-sentry | sentry-instrumentation-first | hypothesis |
| placement/modules-and-imports | portable-rules-on-existing-stack | hypothesis |
| placement/capability-granularity | capability-granularity-reference-data | hypothesis |
| outbound/database-resource-ownership | database-resource-ownership | GREEN invalidated 2026-07-30; rerun pending |
| outbound/service-transport | external-backend-authority | GREEN invalidated 2026-07-30; rerun pending |
| outbound/supabase-rls | supabase-identity-modes | GREEN invalidated 2026-07-30; rerun pending |
| react/component-structure | compound-provider-split | corrected ownership RED not reproduced; hypothesis |
| react/component-structure | static-hook-calls | GREEN invalidated 2026-07-30; rerun pending |
| react/forms-and-actions | imported-server-action-module | hypothesis |
| react/state-placement | explicit-variants-over-mode | GREEN invalidated 2026-07-30; rerun pending |
| react/notifications-and-feedback | global-mutation-error-notifier | hypothesis |
| react/loading-and-errors | segment-pending-and-error-surfaces | RED not reproduced; hypothesis |
| react/loading-and-errors | next16-error-retry-callback | GREEN invalidated 2026-07-30; rerun pending |

The release matrix already covers the three load-bearing architecture cases: simple CRUD,
remote streaming plus job reuse, and cross-capability orchestration. The focused scenarios are not
allowed to contradict that accepted contract.
