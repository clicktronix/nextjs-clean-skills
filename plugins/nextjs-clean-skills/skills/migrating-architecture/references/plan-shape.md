# Plan Shape

**Scope: stack (Next.js App Router)**

The Step 4 agent returns one JSON object. Roles come from the agent; `plan-check` computes every
destination: `<moduleRoot>/<capability>/<role>/<basename>`, and `<moduleRoot>/<capability>/<surface>.ts`
for a surface.

```json
{ "moves": [
    { "file": "src/features/orders/OrderTable.tsx", "role": "ui" },
    { "file": "src/features/orders/api.ts", "role": "surface", "surface": "server" } ],
  "surfaces": [ { "surface": "server", "exports": ["listOrders"], "consumers": ["src/app/orders/page.tsx"] } ],
  "channelChanges": [ { "what": "order search", "from": "Server Action", "to": "GET handler", "behaviourRisk": "cache headers change" } ] }
```

- `moves` — one entry for every file assigned to the capability, none twice. `role` is a contract
  segment (`domain`, `application`, `server`, `client`, `ui`), `surface`, `stay` or `delete`;
  `basename` renames on arrival. A `stay` move may name a file outside the assigned set; every
  other role must name an assigned file.
- `surfaces` — each root surface with a real consumer, named from `publicSurfaces`. `exports` is
  non-empty. A consumer is a file from `--consumers` (a JSON array of paths outside the capability),
  an assigned file, a planned destination, or another surface; write a path with an optional
  trailing ` (note)`; a `delete`d file grounds nothing, and a surface cannot name itself. A surface
  without consumers is dropped and its file stays.
- `channelChanges` — each carries `what`, `from`, `to` and a non-empty `behaviourRisk`.

## Problems

`plan-check` exits 1 and prints each problem under its `kind`:

- `unsafe-roots` — `moduleRoot` or the capability name is not a safe path segment.
- `malformed-channel-change` — a channel change lacks a field.
- `invalid-move` — a role the contract lacks, or an unsafe file name.
- `unknown-surface`, `duplicate-surface`, `empty-surface` — a surface outside `publicSurfaces`,
  declared twice, or without exports.
- `destination-collision` — two moves share one destination.
- `duplicate-source`, `unplanned-file`, `unknown-source` — a file moved twice, an assigned file
  missing from `moves`, or a non-`stay` move naming a file the capability does not own.
- `stray-consumer`, `ungrounded-surface` — a consumer that names no known file (including a
  `delete`d one) or the surface itself, or surfaces that only cite each other.
