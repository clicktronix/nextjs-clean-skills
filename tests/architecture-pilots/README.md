# Architecture Pilots

These fixtures test ADR 0001 before it becomes skill guidance.

`baseline.json` pins the layer-first reference template by SHA and preregisters its comparison
paths. `candidate-plan.json` records the candidate fixture inventory and expected change paths
before implementation. Pilot implementation must not edit either plan after candidate results are
known. Correct an objective plan error in a separate commit with an explanation.

A `revisions` entry on a fixture records a later change to its base inventory that is not a
measured scenario. The 2026-09-11 revision of `work-items` reconciled the example with the contract
(the action resolves request scope itself, identity lives in `shared/kernel`, refusal is a typed
value); the 2026-09-27 revision moved roles out of `RequestIdentity` into the capability's own
access dependency, and the action now hands its invalidation primitive to the owner's invalidator.
The measurements in `results.json` stay bound to the commits they were taken at.

[`RESULTS.md`](./RESULTS.md) summarizes the observed candidate and baseline results and their current
limits. `results.json` binds candidate observations to exact local commits and records the exact
remote baseline replay commits and paths.

These are framework-free Node fixtures, not copy-ready Next.js modules: runtime poison markers
are omitted to exercise server and browser surfaces in one process. The old Next.js pilot is
revision-bound and predates explicit identity at the outer channel. Production build and current
contract conformance require a product-owned integration check.

## Measurements

- `sourceFiles`: changed production `.ts`/`.tsx` files.
- `testFiles`: changed test or fixture files.
- `architectureRoots`: distinct ownership/technical roots touched by the change.
- `compositionRoots`: channel files that construct auth, data, provider, or reporter dependencies.
- `forwardingCallables`: exported functions whose only effect is delegating to one dependency.
- `boundaryParses`: runtime schema parses at channel, provider, or public output boundaries.
- `duplicatedPolicySites`: equivalent auth, cache, reporting, or error-mapping logic repeated across
  channels.
- `publicSurfaces`: runtime-specific files intentionally imported from outside a capability.

Candidate `sourceFiles` and baseline `observedPaths` use different units and feature scope.
Keep the numbers as observations; do not compare them as implementation cost.

An architecture root is one declared root in the baseline or one candidate module/app/shared root.
Nested folders inside one capability do not increase root scatter.

## Preregistered Changes

1. `add-due-at`: add an optional `dueAt` field to a work item from storage through create/edit UI.
2. `add-http-read-channel`: add authenticated HTTP GET to labels, whose baseline read is exposed
   through a Server Action to RSC and browser-query callers but has no HTTP surface.
3. `replace-work-item-source`: replace the work-item store implementation without changing
   application callers.
4. `change-unexpected-reporting`: add request-aware unexpected-error reporting to RSC, action,
   HTTP, stream, and job channels.

`baseline.json` lists the exact expected baseline paths before implementation. For each candidate
change, add its expected paths before modifying the fixture. If implementation proves either list
wrong, record the reason in the result; do not silently redefine the metric.

The layer-first replay is published on
`fullstack-ai-template@research/layer-first-baseline-replays`. Its head and per-change SHAs are
recorded in `results.json`; the replay branch is a research control, not a product PR.

## Pilot Fixtures

- `work-items`: simple/store-backed and multi-channel behavior.
- `assistant-stream`: remote provider and streaming behavior.
- `board-workflow`: cross-capability composition.

Each fixture must compile and must test the runtime contract it claims. Directory diagrams alone are
not pilot evidence.

The stream fixture aborts upstream when its public iterator closes, including during a pending
read. Its injected `clock` owns both `now()` and `schedule(callback, delayMs)`; scheduling returns a
cancellation function. The same clock bounds generation and cleanup, so tests can advance time
without sleeping. This is a generation deadline, not a stream-specific sliding idle policy.
