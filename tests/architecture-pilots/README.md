# Architecture Pilots

These fixtures test ADR 0001 before it becomes skill guidance.

`baseline.json` pins the layer-first reference template by SHA and preregisters the comparison
method. Pilot implementation must not edit the baseline after candidate results are known. Correct
an objective baseline error in a separate commit with an explanation.

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

## Pilot Fixtures

- `work-items`: simple/store-backed and multi-channel behavior.
- `assistant-stream`: remote provider and streaming behavior.
- `board-workflow`: cross-capability composition.

Each fixture must compile and must test the runtime contract it claims. Directory diagrams alone are
not pilot evidence.
