# Architecture Rules

These files enforce the machine-observable floor of the capability-first contract. They do not
try to infer business meaning from path names.

| File | Purpose |
| --- | --- |
| `architecture-contract.json` | reserved surfaces, dependency classes, and database ownership |
| `eslint-boundaries.mjs` | capability ownership, purity, and server/client direction |
| `eslint-boundaries-resolved.mjs` | unresolved-import and file-cycle canaries |
| `check-module-cycles.mjs` | capability-level cycle detection across all source files |
| `check-dependency-classification.mjs` | exhaustive direct dependency classification |
| `check-database-resources.mjs` | literal Supabase table/function ownership |

## Install

Copy all four files into the consuming repository, then spread both configs after the base flat
ESLint configs:

```js
import boundaries from './rules/eslint-boundaries.mjs'
import resolved from './rules/eslint-boundaries-resolved.mjs'

export default [
  // framework and TypeScript configs
  ...boundaries,
  ...resolved,
]
```

The resolved tier requires `eslint-plugin-import` and `eslint-import-resolver-typescript`. Run
ESLint from the project root so `@/* -> src/*` and relative paths share one root.

Add the capability graph check to the same CI command:

```bash
node rules/check-module-cycles.mjs
```

Before enabling the rules, classify every direct runtime dependency in
`architecture-contract.json` as `purePackages` or `runtimePackages`. Run
`check-dependency-classification.mjs`; a newly installed package fails closed until the product
decides which side it belongs to. Static analysis cannot infer package semantics from an npm name.

For Supabase projects, declare literal `.from()` and `.rpc()` resources in `databaseResources` and
run `check-database-resources.mjs`. This catches undeclared and cross-capability string-level
coupling that TypeScript import rules cannot see. It does not parse SQL or replace RLS/grant tests.

## Enforced Invariants

1. `app/**` and other capabilities import a capability only through its root public surfaces.
2. `domain/**` imports only its own domain, admitted `shared/kernel`, and classified pure packages.
3. `domain/**` and `application/**` reject the framework/provider packages declared by the product
   profile.
4. browser-safe code cannot import server surfaces; server capability code cannot import browser
   surfaces. `actions.ts` remains the explicit browser-to-server mutation boundary.
5. module-root files use the admitted runtime vocabulary:
   `server`, `rsc`, `actions`, `client`, `ui`, `query-cache`, `stream`, or `job`.
   Named re-exports are allowed, `export *` is not, and `actions.ts` declares value exports locally.
6. shared code uses `shared/kernel`, `shared/server`, `shared/client`, or `shared/ui` and cannot
   depend on product capabilities.
7. the strict tier rejects unresolved imports and computed dynamic loads; the graph checker rejects
   capability cycles even when the underlying files do not form a direct cycle.
8. a private segment cannot define `index.ts(x)` when a same-named root surface exists; the root
   file wins module resolution and would silently shadow the segment index.
9. `query-cache.ts` imports only its own domain or `shared/kernel`; a whole-fixture check requires
   at least one server prefetch/hydration consumer and one browser query consumer.
10. private `server/**` cannot import its own root public surfaces; channel dependencies point
    inward.
11. every direct runtime dependency is classified, and literal Supabase resources have declared
    consumers.

Tests and test fixtures may cross these boundaries deliberately. The capability rule ignores test
files; the strict tier disables only cycle checking for them.

## Deliberately Not Enforced

Static imports cannot prove:

- whether an application operation passes the deletion test;
- whether a public surface narrows enough to justify itself;
- authorization and defense-in-depth predicates;
- validation exactly once per trust transition;
- cache ownership, report-once behavior, or stream/job lifecycle semantics;
- whether a package should be classified as pure or runtime-bound;
- resource ownership hidden in raw SQL, ORM expressions, migrations, or provider wrappers;
- whether code admitted to `shared/**` still has identical meaning for every consumer.

Review those against the human contract and test them at runtime. Adding a path rule that claims to
prove one of these would create a false guarantee.

## Verification

`node scripts/validate-rules.mjs` builds a temporary TypeScript project and checks at least one
clean edge and one failing mutation for every invariant above. Resolver, file-cycle, and
capability-cycle checks have separate canaries.
