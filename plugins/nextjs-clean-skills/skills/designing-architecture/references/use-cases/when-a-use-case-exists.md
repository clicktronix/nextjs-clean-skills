# When An Application Operation Exists

**Impact: CRITICAL** · **Scope: portable**

`application/` is optional. Keep an operation only when deleting it moves meaningful complexity
into callers.

Qualifying behavior:

- policy or branching not owned by a store;
- orchestration across effects or capabilities;
- a projection combining sources;
- transaction intent;
- behavior shared by several runtime channels.

These do not qualify by themselves:

- parsing transport input;
- authentication;
- row or provider mapping;
- cache invalidation;
- telemetry;
- one store call under a new name.

```ts
// Incorrect: forwarding operation
export const listCampaigns = (deps: Deps) => deps.campaigns.list()

// Correct: owns policy between effects
export async function moveCampaign(input: MoveCampaign, deps: Deps) {
  const current = await deps.campaigns.loadBoard(input.boardId)
  const moved = moveWithinBoard(current, input.id, input.position)
  await deps.campaigns.saveOrder(moved)
  return moved
}
```

The effect/pure/effect shape is a useful signal, not a definition. Line count is never the gate.

Do not invent persistence, alternate providers, or future reuse to justify an operation.

## Orchestrating Capability

When behavior spans capabilities, apply the same deletion test to the coordinating code: if removing
it moves filtering, grouping, authorization consequences, projection, transaction intent, or
sequencing into the route, create an orchestrating capability. Its operation may take a sibling's
public `server.ts` contract as a type; a port in its own vocabulary plus a private mapping adapter
is required only when the mapping carries policy. Source capabilities never import the orchestrator
or one another. Sequence calls when a later input depends on an earlier result. An
authorization-sensitive join returns a complete result for visible, missing, and forbidden
references; do not silently omit a reference when policy requires rejection.

Reference: project deletion test, motivated by measured forwarding modules.
