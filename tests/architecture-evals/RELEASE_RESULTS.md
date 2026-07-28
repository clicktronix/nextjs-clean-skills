# Capability Architecture Release Results

- Date: 2026-07-27
- Frozen candidate: `e7b9bdc8ce47bf79d258ca86c04caccaee14a579`
- Generation: `gpt-5.6-luna` and `gpt-5.6-sol`
- Framing: neutral and adversarial
- Blind judge: `gpt-5.6-sol`
- Matrix: 4 arms x 3 scenarios x 2 models x 2 framings x 2 repeats
- Generation runs: 96
- Blind judge groups: 24
- Verdict: **FAIL**

All 96 generation responses and 24 completed blind score sets matched their schemas. All 96
reported candidate/control totals match the registered arithmetic. Raw artifacts are under the four
`results/release-*` directories.

## Aggregate

| Arm | Mean | Total | Minimum | Negative violations | Fatal |
| --- | ---: | ---: | ---: | ---: | ---: |
| capability-first candidate | 9.792 | 235/240 | 6 | 0 | 0 |
| no skill | 8.042 | 193/240 | 4 | 9 | 0 |
| released v1.3.2 | 7.917 | 190/240 | 4 | 8 | 1 |
| layer-first checkpoint | 7.833 | 188/240 | 6 | 10 | 1 |

Per-scenario means:

| Scenario | no skill | v1.3.2 | layer-first | capability-first |
| --- | ---: | ---: | ---: | ---: |
| simple CRUD | 7.500 | 5.375 | 6.750 | 10.000 |
| remote stream | 9.125 | 8.500 | 8.000 | 10.000 |
| cross-capability | 7.500 | 9.875 | 8.750 | 9.375 |

Paired candidate results:

| Control | Wins | Ties | Losses | Tie or beat |
| --- | ---: | ---: | ---: | ---: |
| no skill | 17 | 7 | 0 | 100.0% |
| v1.3.2 | 16 | 6 | 2 | 91.7% |
| layer-first | 20 | 3 | 1 | 95.8% |

## Failed Gate

The candidate passed the overall-mean, paired-comparison, fatal, and negative-violation thresholds.
It failed three preregistered conditions:

1. its cross-capability mean was 9.375, below `v1.3.2` at 9.875;
2. `release-luna-adversarial/cross-capability/repeat-1` scored 6, below the required minimum of 8;
3. that proposal omitted an explicit report-once policy.

The failure is substantive, not a disputed judge score. Under pressure to avoid a board module, the
response put meaningful board policy in `app/board/_server`, even though removing that code would
move filtering, grouping, authorization-aware label attachment, and cross-capability coordination
into the route. It also claimed that work-items and labels could load in parallel while later
requiring the label query to be constrained by IDs derived from work-items.

The second adversarial Luna repeat used the same route-private ownership and scored 9 because it
fixed sequencing and report-once behavior. That result still lacked board-language dependencies.
The pattern shows that the candidate's phrase "or outer composition root" is ambiguous enough to
let a weaker model surrender product-policy ownership to route composition.

## Manual Review

All 24 candidate responses were reviewed after blind scoring.

- Simple CRUD: all eight responses avoided speculative application operations and repository ports.
- Remote stream: all eight used a Route Handler, preserved cancellation and commit-aware failure
  behavior, kept job retry/dead-letter semantics separate, and avoided provider SDK leakage.
- Cross-capability: no response imported sibling internals or created a work-items/labels cycle.
  The one failed response centralized orchestration but placed meaningful policy under `app/**` and
  did not specify report-once behavior.

One neutral Luna response was internally imprecise about parallel label loading before referenced
IDs existed. Its surrounding flow later sequenced label-detail loading and did not create a listed
negative violation, but this reinforces the need for a stronger data-dependency instruction.

## Harness Limitation

Five blind judge attempts reached the five-minute infrastructure timeout. Each successful retry used
the same frozen generation responses, judge input, candidate mapping, schema, and judge model.
Generation was never repeated. Completed result sets are unaffected, but recorded usage excludes
the timed-out attempts because the runner persists only complete event streams.

Reproduce the combined arithmetic:

```bash
node scripts/summarize-architecture-release.mjs \
  --output tests/architecture-evals/release-summary.json
```

## Next Candidate

The next candidate must make these rules unambiguous before a new release matrix:

1. an outer composition root wires existing behavior; it does not own meaningful product policy;
2. cross-capability policy that survives the deletion test creates an orchestrating capability,
   even with one current route consumer;
3. the orchestrating operation owns dependencies in its language and adapters call narrow public
   capability surfaces;
4. cross-capability unexpected failures have one explicit reporting boundary;
5. a dependency whose input is derived from another result is sequenced after that result.

This failed result set remains immutable evidence. A revised candidate requires a new commit hash,
new result directories, and a new preregistered gate; these outputs must not be overwritten.
