# Capability-First Pilot Results

Status: candidate fixtures passed; the architecture gate remains open until baseline replay and
agent evaluation finish.

## Evidence

- 33 strict TypeScript fixture files across `work-items`, `assistant-stream`, and
  `board-workflow`.
- Runtime checks cover tenant scoping, provider-row mapping, cache invalidation, expected action
  outcomes, HTTP mapping, stream commit state, cancellation, deadlines, job retries, reporting
  once, and cross-capability orchestration.
- Six architecture invariants are executable. Ten mutations prove their critical branches fail.
- Every candidate change is anchored to its own commit and checked against
  `candidate-plan.json`.

## Change Cost

| Change | Candidate production | Candidate test | Baseline planned paths | Result |
| --- | ---: | ---: | ---: | --- |
| add `dueAt` | 3 | 1 | 8 | one capability; no channel or composition changes |
| add labels HTTP GET | 1 | 1 | 3 | route-owned; label internals unchanged |
| replace work-item source | 1 | 1 | 6 | application and channels unchanged |
| request-aware reporting | 12 | 1 | 11 | not directly comparable; candidate also covers stream and job |

Baseline counts are projections from paths verified at the pinned source SHA. They are not observed
change diffs yet. Do not use this table as a final architecture verdict until baseline replay is
complete.

## Architecture Findings

1. Capability locality held for field, channel, and provider changes.
2. Simple CRUD did not earn an `application/` operation; the remote stream and board workflow did.
3. A public surface must narrow a private model or establish a real runtime contract. A forwarding
   store facade failed this test during pilot review.
4. RSC, action, HTTP, stream, and job boundaries need native failure mapping. Shared reporting
   policy did not justify a universal boundary wrapper.
5. Explicit reporting context touched one framework composition file that the plan omitted. This
   is a real cost of explicit context, not noise to hide.
6. `stream.ts` and `job.ts` belong in the admitted public-surface vocabulary.

## Open Gates

- Replay the four changes against the pinned layer-first template and replace projected counts with
  observed diffs.
- Run the 24-cell agent smoke matrix.
- Run the 96-cell release matrix only if smoke shows a useful signal.
- Keep the ADR Proposed until both architecture and skill gates pass.
