# Capability Architecture Smoke Results

- Date: 2026-07-27
- Preregistered runner: `a20bec07b3ec8f166f4b71a224ded58a04690994`
- Raw result set: `results/smoke-2026-07-27-r2`
- Codex CLI: `0.145.0`
- Generation model: `gpt-5.6-luna`
- Blind judge: `gpt-5.6-sol`
- Matrix: 4 arms x 3 scenarios x 2 repeats = 24 generation runs
- Judge runs: 6, one shuffled four-arm comparison per scenario/repeat

All 24 responses matched the registered JSON schema. All six blind score sets covered four
candidates, and every reported total matched the rubric arithmetic. No run failed.

## Aggregate

| Arm | Mean | Total | Fatal |
| --- | ---: | ---: | ---: |
| capability-first candidate | 9.500 | 57/60 | 0 |
| no skill | 8.333 | 50/60 | 0 |
| layer-first checkpoint | 7.833 | 47/60 | 1 |
| released v1.3.2 | 6.167 | 37/60 | 0 |

Per-scenario means:

| Scenario | no skill | v1.3.2 | layer-first | capability-first |
| --- | ---: | ---: | ---: | ---: |
| simple CRUD | 7.5 | 4.5 | 6.5 | 9.0 |
| remote stream | 9.0 | 8.0 | 8.0 | 10.0 |
| cross-capability | 8.5 | 6.0 | 9.0 | 9.5 |

The candidate beat every control in every scenario mean. The released skill performed worse than
no skill in all three scenarios. Its largest failure was simple CRUD: both runs added repository
ports and forwarding use cases while scattering one capability across global layer roots.

The layer-first checkpoint retained strong cross-capability policy but remained physically
scattered. One simple-CRUD run proposed a handler outside an App Router `route.ts` and a shared
boundary envelope; the judge marked that cell fatal.

## Candidate Regressions

The candidate is not ready for the 96-run release gate unchanged.

1. One simple-CRUD repeat invented uniqueness and coordination policy that the task did not request.
   It then used that invented behavior to justify `application/operations.ts` and
   `application/ports.ts`. The skill says to apply the deletion test but does not say that the test
   applies to requested behavior rather than speculative policy. Validation, authentication, row
   mapping, and ordinary conflict mapping are not by themselves reasons for an application
   operation.
2. One board repeat said it derived referenced label IDs from work items and also called work-items
   and labels in parallel. Those claims are incompatible unless the label query input is defined
   independently. The candidate needs an explicit data-dependency ordering check.

No-skill was already strong, especially on streaming (8 and 10). The release evaluation therefore
must measure incremental value over no skill, not merely correctness in isolation. Adversarial
framing and a weaker model tier remain necessary; the neutral Luna smoke alone cannot establish
that the skill earns its context cost.

## Verdict

The smoke contains enough signal to continue, but not to run the full release matrix yet.

1. Preserve this result set unchanged.
2. Tighten the candidate against invented policy and impossible parallelism.
3. Re-run the affected candidate cells and blind comparisons.
4. Freeze the revised candidate.
5. Run the preregistered 96-cell release matrix only if the targeted re-smoke removes those
   regressions without reducing streaming or cross-capability correctness.

Token usage recorded by the runner:

| Stage | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| generation | 1,008,815 | 669,184 | 56,200 |
| judge | 343,804 | 217,856 | 9,972 |
