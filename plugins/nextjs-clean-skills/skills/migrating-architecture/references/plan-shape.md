# Plan Shape

**Scope: stack (Next.js App Router)**

Step 4 returns one object. `plan-check` joins the chosen role and subpath into
`<moduleRoot>/<capability>/<role>/<relativePath>`; surfaces use `<capability>/<surface>.ts`.

```json
{ "moves": [
    { "file": "src/features/orders/OrderTable.tsx", "role": "ui", "relativePath": "Table/index.tsx" },
    { "file": "src/features/orders/api.ts", "role": "surface", "surface": "server" } ],
  "surfaces": [ { "surface": "server", "exports": ["listOrders"], "consumers": ["src/app/orders/page.tsx"] } ],
  "channelChanges": [ { "what": "order search", "from": "Server Action", "to": "GET handler", "behaviourRisk": "cache headers change" } ] }
```

- `moves` — every assigned file exactly once, including assets and tests. `role` is `domain`,
  `application`, `server`, `client`, `ui`, `surface`, `stay` or `delete`. Only `stay` may name an
  unassigned file. `relativePath` preserves local folders, defaulting to the source basename.
  Absolute paths, empty segments, `.`/`..`, colons and backslashes are refused. Legacy `basename`
  allows one filename; do not combine it with `relativePath`.
- `surfaces` — a `publicSurfaces` name, non-empty `exports` and real `consumers`. Consumers may
  be in `--consumers` (external path array), assigned files, planned destinations or other surfaces.
  Paths may end in ` (note)`. Deleted files and self-citations ground nothing. A surface with no
  consumers is dropped and its file stays.
- `channelChanges` — `what`, `from`, `to` and non-empty `behaviourRisk`.

## Problems

`plan-check` exits 1 with these `kind` values:

- `unsafe-roots` — unsafe `moduleRoot` or capability name.
- `malformed-channel-change` — missing channel-change field.
- `invalid-move` — unknown role or unsafe/ambiguous relative path.
- `unknown-surface`, `duplicate-surface`, `empty-surface` — undeclared surface, duplicate declaration,
  or no exports.
- `destination-collision` — multiple files share a destination.
- `duplicate-source`, `unplanned-file`, `unknown-source` — repeated source, missing assigned file,
  or non-`stay` move of an unassigned file.
- `stray-consumer`, `ungrounded-surface` — unknown/deleted/self consumer, or surfaces citing only
  each other.
