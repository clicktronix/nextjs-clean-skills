# Inventory And Assignment

**Scope: stack (Next.js App Router)**

`.nextjs-clean-migration/inventory.json` contains `sourceRoot`, `excludedDirectories`, `count`,
`listHash` and sorted `files`. Cite this list; an agent's differing count is not a measurement.

Inventory includes every regular file git sees under the source root (tracked or untracked, not
ignored): code, CSS, translations, images and MDX. Build directories are skipped; `--exclude` adds
declared exclusions. Symlinks are not followed. Assets need ownership and destinations too. Lint
coverage skips no folder by name: it uses the current tree and the versioned contract's
`generatedRoot`, not an old file list, and inline comments cannot disable a mandatory rule.

## Coverage rules

Return decisions, not a retyped tree:

```json
{ "rules": [
    { "kind": "prefix", "path": "src/features/orders", "placement": "capability", "capability": "orders", "runtime": "neutral" },
    { "kind": "file", "path": "src/features/orders/OrderTable.tsx", "placement": "capability", "capability": "orders", "runtime": "browser-safe", "role": "ui" },
    { "kind": "prefix", "path": "src/lib", "placement": "shared", "runtime": "neutral" } ],
  "unassigned": [ { "file": "src/features/orders/ports.ts", "why": "serves orders and billing", "likelyCapability": "orders" } ] }
```

`file` beats any prefix; longest prefix wins; order is irrelevant. `unassigned` overrides every
rule. A surface requires a `file` rule. Placement is `capability`, `shared`, `app` or
`infrastructure`; runtime is `server-only`, `browser-safe` or `neutral`.

## Reading the expansion

- `uncovered` — no rule reached these files; decide them (exit 2).
- `deadRules` — unmatched rules; read the warning for stale paths.
- `strayUnassigned` — decisions naming files absent from inventory.
- `shared` rows outside the shared root require a separate reviewed move: `plan-check` selects
  only rows assigned to its named capability.

Before choosing destinations, audit ownership, helper locality, test boundaries, schema-derived
types and query-cache consumers against
[Module Cohesion](../../designing-architecture/references/placement/module-cohesion.md).
