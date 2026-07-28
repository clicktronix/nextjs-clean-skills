# Capability Architecture Candidate V3 Results

- Date: 2026-07-28
- Frozen candidate: `6c35c86246fbd65fecfddef5c0d193f50c739f7d`
- Replay runner: `0be41e1`
- Immutable controls: `4e51ba9`
- Generation: `gpt-5.6-luna` and `gpt-5.6-sol`
- Framing: neutral and adversarial
- Blind judge: `gpt-5.6-sol`
- New candidate runs: 24
- Reused control runs: 72
- Primary blind judge groups: 24
- Additional registered blind pass: 1
- Registered gate verdict: **PASS**
- Architecture adoption verdict: **ACCEPT AS THE CANONICAL REWRITE BASELINE**

The replay preserved every control response and event stream byte-for-byte from the failed gate.
Only candidate v3 was regenerated. All four arms were then scored by 24 new blind judge groups.
One disputed judge cell received the single additional blind pass allowed by the preregistered
protocol. The original score and replacement are both retained.

The pass establishes a behavioral signal under this matrix. It does not make the candidate text
publish-ready or prove the architecture universally correct. Manual review found three points that
the canonical rewrite must make explicit and recheck with targeted regressions.

## Aggregate

| Arm | Mean | Total | Minimum | Negative violations | Fatal |
| --- | ---: | ---: | ---: | ---: | ---: |
| capability-first candidate v3 | 9.958 | 239/240 | 9 | 0 | 0 |
| no skill | 7.833 | 188/240 | 4 | 8 | 0 |
| released v1.3.2 | 7.917 | 190/240 | 4 | 8 | 0 |
| layer-first checkpoint | 7.625 | 183/240 | 4 | 10 | 0 |

Per-scenario means:

| Scenario | no skill | v1.3.2 | layer-first | candidate v3 |
| --- | ---: | ---: | ---: | ---: |
| simple CRUD | 7.375 | 5.500 | 6.250 | 10.000 |
| remote stream | 8.750 | 8.500 | 7.875 | 9.875 |
| cross-capability | 7.375 | 9.750 | 8.750 | 10.000 |

Paired candidate results:

| Control | Wins | Ties | Losses | Tie or beat |
| --- | ---: | ---: | ---: | ---: |
| no skill | 20 | 3 | 1 | 95.8% |
| v1.3.2 | 17 | 7 | 0 | 100.0% |
| layer-first | 22 | 2 | 0 | 100.0% |

Every automatic acceptance condition passed: no fatal or negative candidate cell, no score below
8, candidate lead overall and in every scenario, more than a 0.5-point lead over no skill, at least
75% tie-or-beat against every control, and exact judge arithmetic.

## Manual Architecture Review

All 24 new candidate responses were reviewed, including perfect-scoring cells.

### Simple CRUD

All eight responses:

- kept a small CRUD capability free of speculative application operations and repository ports;
- used direct server reads for RSC and a cacheable GET for browser-owned reads;
- used top-level Server Actions only for commands;
- derived identity on the server, retained store/RLS predicates, and kept provider rows private.

The disputed response used existing runtime-scoped `shared/server/auth.ts` and
`shared/server/supabase.ts` utilities. That is not the generic `shared` or `lib` migration bucket
forbidden by the rubric.

### Remote Stream

All eight responses kept SSE in a Route Handler, propagated cancellation, distinguished failure
before and after response commit, kept job retry/dead-letter behavior native to the job channel,
and avoided provider SDK types in application code.

Three residual observations do not violate the registered negative rubric:

1. one neutral Luna response invented a generation-store port and private store although the task
   required no persistence;
2. one neutral Sol response placed idle timeout inside a reused application operation, which could
   make the job inherit stream lifecycle policy; the canonical rule must keep stream idle timeout
   in the stream channel and job deadline in the job channel unless a separately named shared
   provider-liveness policy is justified;
3. the sole score-9 response was otherwise coherent; its partial score reflects less explicit
   shared semantic failure/reporting primitives, not a registered channel violation.

### Cross-Capability

All eight responses created a board capability, kept work-items and labels independent, imported
only narrow public server surfaces through board-owned adapters, sequenced label loading after
deriving IDs from work-items, and named one unexpected-failure reporting boundary.

One neutral Luna response is internally inconsistent: its summary and operation say inaccessible
labels are rejected, while a later authorization sentence and flow say labels absent from the
authorized result are silently omitted. The judge awarded 10. This is not one of the registered
structural negatives, but it is a task-semantic defect. The canonical contract must require a
complete resolution result that distinguishes visible, missing, and forbidden references without
disclosing their existence, and the regression scenario must assert no silent omission.

## Adjudication

The primary judge gave candidate v3 a 9 in
`release-v3-sol-adversarial/simple-crud/repeat-2`, assigning a generic-shared-bucket violation.
Manual inspection showed that the response reused existing request-auth and Supabase utilities in
the candidate's explicitly scoped `shared/server` room; it did not move capability behavior into a
generic bucket.

The additional blind pass used the exact same frozen input and mapping:

```text
input.json   2088085cac25973487fe3b415be49a5be1a655ff051a0864329e314d01590480
mapping.json 5b635b3342d6e2a25a09303dff0943be929aab7f28e0f2ba50742756a090d711
```

It scored the candidate 10 and explicitly distinguished the runtime-scoped utilities from a
generic shared bucket. The aggregate uses the replacement as prescribed, while
`release-v3-summary.json` retains both explanations and scores.

## Harness Limits

Several blind judge attempts reached the five-minute infrastructure timeout. Exact `--resume`
retries reused the frozen responses, judge input, mapping, schema, and model. Candidate generation
was never repeated. Completed artifacts are unaffected; usage excludes incomplete attempts.

Blind scoring is not a substitute for architecture review. The silent-label contradiction above
was missed by a perfect-scoring judge cell. The release process therefore keeps automatic
acceptance and manual architecture acceptance as separate gates.

The controls were reused, but their scores were not: each replay judge rescored all four frozen
arms. Control aggregates can therefore differ from the first gate without response drift.

## Reproduction

Raw artifacts:

```text
results/release-v3-luna-neutral
results/release-v3-luna-adversarial
results/release-v3-sol-neutral
results/release-v3-sol-adversarial
results/dispute-v3-sol-adversarial-simple-crud-repeat-2
```

Reproduce the combined arithmetic:

```bash
node scripts/summarize-architecture-release.mjs \
  --result-set release-v3 \
  --output tests/architecture-evals/release-v3-summary.json
```

The next step is to rewrite the canonical skill and human documentation from candidate v3, adding
the three manual clarifications above. Those clarifications require focused regression scenarios
before release; the full 96-run matrix does not need to be regenerated unless the architecture
model changes materially.
