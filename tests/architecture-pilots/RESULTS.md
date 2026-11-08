# Capability-First Pilot Results

Status: **historical pilot checks recorded; comparative skill gate withdrawn**. The recorded
fixtures and historical Next.js pilot do not qualify the current integration contract. The
release-v3 controls inherited installed skills; see the authoritative
[integrity note](../architecture-evals/README.md#evidence-integrity-note--2026-09-10).
ADR acceptance is a maintainer decision, not a replacement isolated experiment.

## Evidence

- Strict TypeScript fixtures across `work-items`, `assistant-stream`, and `board-workflow`;
  `results.json` records the file count checked against the tree by the pilot validator.
- Runtime checks cover tenant scoping, provider-row mapping, cache invalidation, expected action
  outcomes, HTTP mapping, stream commit state, cancellation, deadlines, job retries, reporting
  once, and cross-capability orchestration.
- The original acceptance suite encodes six architecture properties in ten historical mutations.
  Current rule-code and portability counts are reported separately in `docs/evidence.md`.
- Every candidate change is anchored to its own commit and checked against
  `candidate-plan.json`.
- The provider replay has a separate composition control at `37b9f97`; the corrected swap is
  `759276b`. The original `69060dd` result is retained only as superseded evidence.
- The layer-first replay is published at
  `fullstack-ai-template@research/layer-first-baseline-replays`, head `46b5bc5`. `bun run check`
  and the full `991`-test suite pass.
- The real App Router pilot is published at
  `fullstack-ai-template@research/capability-next-pilot`, head `0a3eeca`. It passes `bun run check`,
  `990` tests, and a Next.js 16.2.10 production build.

## Illustrative Change Touch Sets

| Change | Candidate production | Candidate test | Baseline observed paths | Result |
| --- | ---: | ---: | ---: | --- |
| add `dueAt` | 3 | 1 | 9 | illustrative only; baseline includes UI/locales/SQL absent from the fixture |
| add labels HTTP GET | 1 | 1 | 3 | candidate route is local; baseline adds handler, route export, and test |
| replace work-item source | 2 | 1 | 10 | capability composition and adapter changed; channel callers did not |
| request-aware reporting | 12 | 1 | 11 | not directly comparable; candidate also covers stream and job |

The units and feature scope differ: candidate production TS excludes tests and assets; baseline
observed paths include them. The candidate form is a value-mapping helper, not a rendered React
form with localization and a database migration. These counts do not establish comparative cost.

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
8. The first plain TypeScript fixture was not valid Next.js evidence. The follow-up App Router pilot
   demonstrated the older integration contract: its action accepts `FormData`, identity and effects
   are resolved inside the
   capability, and `route.ts` exports `GET`. Its internal identity lookup predates the current
   explicit-identity contract; the framework-free fixtures omit poison markers. Neither qualifies
   a current Next.js integration.
9. Server/client poisoning is build-enforced. A Client Component import of `server.ts` makes
   Turbopack reject both the public server surface and private store through `server-only`.
10. Cache ownership and cache runtime are separate. The command returns a server-only cache scope;
    the Server Action applies `updateTag`, leaving HTTP and job boundaries free to use their native
    invalidation semantics.

## Decision And Evidence Status

- Corrected provider composition reviewed and retained as an observation of unchanged callers.
- Candidate smoke showed signal.
- The first release matrix failed cross-capability ownership.
- Release-v3 scores are historical; the comparative gate is withdrawn by the integrity note.
- ADR 0001 remains Accepted as a maintainer architecture decision.
