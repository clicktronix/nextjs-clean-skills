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

Reference: project deletion test, motivated by measured forwarding modules.
