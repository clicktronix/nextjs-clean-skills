# Capability-First Pilot Results

Status: candidate fixtures and the baseline replay pass their checks. The corrected provider replay
now includes a production composition surface. The architecture gate remains open for final review,
and agent evaluation has not run.

## Evidence

- 33 strict TypeScript fixture files across `work-items`, `assistant-stream`, and
  `board-workflow`.
- Runtime checks cover tenant scoping, provider-row mapping, cache invalidation, expected action
  outcomes, HTTP mapping, stream commit state, cancellation, deadlines, job retries, reporting
  once, and cross-capability orchestration.
- Six architecture invariants are executable. Ten mutations prove their critical branches fail.
- Every candidate change is anchored to its own commit and checked against
  `candidate-plan.json`.
- The provider replay has a separate composition control at `37b9f97`; the corrected swap is
  `759276b`. The original `69060dd` result is retained only as superseded evidence.
- The layer-first replay is published at
  `fullstack-ai-template@research/layer-first-baseline-replays`, head `46b5bc5`. `bun run check`
  and the full `991`-test suite pass.

## Change Cost

| Change | Candidate production | Candidate test | Baseline observed paths | Result |
| --- | ---: | ---: | ---: | --- |
| add `dueAt` | 3 | 1 | 9 | candidate is more local; baseline needed one unplanned locale update |
| add labels HTTP GET | 1 | 1 | 3 | candidate route is local; baseline adds handler, route export, and test |
| replace work-item source | 2 | 1 | 10 | capability composition and adapter changed; channel callers did not |
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
7. A provider-swap claim requires a production composition surface. With that control present, the
   source change touched `server.ts` and `server/store.ts`, not the RSC, action, or HTTP callers.
8. These fixtures prove framework-independent contracts, not Next.js integration. The current
   action accepts caller-supplied identity and non-serializable server dependencies, and the route
   fixture does not export `GET`. They must not be cited as a valid Server Action or Route Handler.

## Open Gates

- Review the corrected provider composition and the remaining architecture acceptance gates.
- Run one capability through a real Next.js App Router integration: derive identity server-side,
  expose a serializable Server Action, export a named Route Handler method, verify server/client
  poisoning, and pass `next build`.
- Run the 24-cell agent smoke matrix.
- Run the 96-cell release matrix only if smoke shows a useful signal.
- Keep the ADR Proposed until both architecture and skill gates pass.
