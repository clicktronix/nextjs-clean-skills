# Capability-First Pilot Results

Status: candidate fixtures and the baseline replay pass their checks. The architecture gate remains
open because the provider-swap candidate did not model production composition and agent evaluation
has not run.

## Evidence

- 33 strict TypeScript fixture files across `work-items`, `assistant-stream`, and
  `board-workflow`.
- Runtime checks cover tenant scoping, provider-row mapping, cache invalidation, expected action
  outcomes, HTTP mapping, stream commit state, cancellation, deadlines, job retries, reporting
  once, and cross-capability orchestration.
- Six architecture invariants are executable. Ten mutations prove their critical branches fail.
- Every candidate change is anchored to its own commit and checked against
  `candidate-plan.json`.
- The layer-first replay is published at
  `fullstack-ai-template@research/layer-first-baseline-replays`, head `46b5bc5`. `bun run check`
  and the full `991`-test suite pass.

## Change Cost

| Change | Candidate production | Candidate test | Baseline observed paths | Result |
| --- | ---: | ---: | ---: | --- |
| add `dueAt` | 3 | 1 | 9 | candidate is more local; baseline needed one unplanned locale update |
| add labels HTTP GET | 1 | 1 | 3 | candidate route is local; baseline adds handler, route export, and test |
| replace work-item source | 1 | 1 | 10 | invalid comparison: candidate hid config and composition in its harness |
| request-aware reporting | 12 | 1 | 11 | not directly comparable; candidate also covers stream and job |

The replay found two preregistration errors. `add-due-at` also changed the English locale.
`replace-work-item-source` also changed `.env.example`, the server env contract, an unlisted
assistant composition root, and an existing route test. The provider replay needed a follow-up
test-isolation fix because a Bun module mock polluted the full suite.

## Architecture Findings

1. Capability locality held for the field and channel changes.
2. Simple CRUD did not earn an `application/` operation; the remote stream and board workflow did.
3. A public surface must narrow a private model or establish a real runtime contract. A forwarding
   store facade failed this test during pilot review.
4. RSC, action, HTTP, stream, and job boundaries need native failure mapping. Shared reporting
   policy did not justify a universal boundary wrapper.
5. Explicit reporting context touched one framework composition file that the plan omitted. This
   is a real cost of explicit context, not noise to hide.
6. `stream.ts` and `job.ts` belong in the admitted public-surface vocabulary.
7. A provider-swap claim requires a production composition surface. Dependency injection performed
   only by a test harness is not evidence that configuration and framework callers remain local.

## Open Gates

- Correct the provider fixture and replay its source swap against a production-like composition
  surface.
- Run the 24-cell agent smoke matrix.
- Run the 96-cell release matrix only if smoke shows a useful signal.
- Keep the ADR Proposed until both architecture and skill gates pass.
