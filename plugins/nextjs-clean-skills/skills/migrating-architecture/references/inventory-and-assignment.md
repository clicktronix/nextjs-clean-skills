# Inventory And Assignment

**Impact: HIGH** · **Scope: stack (Next.js App Router)**

The inventory is a file the script wrote: `.nextjs-clean-migration/inventory.json` with
`sourceRoot`, `count`, `listHash` and a sorted `files` array. Lenses cite paths from it. If a
lens answers with a count that disagrees with `count`, the lens is wrong, not the file.

## Coverage rules

The assignment agent answers with decisions, not with the tree typed back:

```json
{ "rules": [
    { "kind": "prefix", "path": "src/features/orders", "placement": "capability", "capability": "orders", "runtime": "neutral" },
    { "kind": "file", "path": "src/features/orders/OrderTable.tsx", "placement": "capability", "capability": "orders", "runtime": "browser-safe", "role": "ui" },
    { "kind": "prefix", "path": "src/lib", "placement": "shared", "runtime": "neutral" } ],
  "unassigned": [ { "file": "src/features/orders/ports.ts", "why": "serves orders and billing at once", "likelyCapability": "orders" } ] }
```

A `file` rule beats every prefix; the longest prefix wins among prefixes; order is irrelevant.
`unassigned` wins over any rule. A surface is only ever a `file` rule. Placement is one of
`capability`, `shared`, `app`, `infrastructure`; runtime is `server-only`, `browser-safe` or
`neutral`.

## Reading the expansion

- `uncovered` — files no rule reached. Decide them; exit code 2 means the decision set is not
  yet complete, nothing more.
- `deadRules` — rules matching no file. Usually a stale path; a warning.
- `strayUnassigned` — unassigned entries naming no inventory file.
- `shared` outside the configured shared root — kept in the rows with the placement it was
  given; the plan step marks it undeliverable for the capability workflow and you move it in a
  separate reviewed change.

## Pilot choice

Score capabilities by completeness, real consumers and few inbound dependencies. Pick one the
ordinary follow-up change lives in; otherwise the radius comparison is about a different
capability and proves nothing about this one.
