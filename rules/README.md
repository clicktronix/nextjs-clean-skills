# Architecture Rules

These files enforce the machine-observable floor of the capability-first contract. They do not
try to infer business meaning from path names.

| File | Purpose |
| --- | --- |
| `architecture-contract.json` | reserved surfaces, dependency classes, and database ownership |
| `contract-paths.mjs` | validated source roots, aliases, and import resolution shared by every check |
| `eslint-boundaries.mjs` | capability ownership, purity, and server/client direction |
| `eslint-boundaries-resolved.mjs` | unresolved-import, file-cycle and `server-only`/`client-only` marker canaries |
| `check-module-cycles.mjs` | capability-level cycle detection across all source files |
| `check-dependency-classification.mjs` | exhaustive direct dependency classification |
| `check-database-resources.mjs` | literal Supabase table/function ownership |
| `check-module-cohesion.mjs` | advisory directory observations under capabilities and shared roots; not an enforcement gate |

`generatedRoot` is optional. Declare it and generated files may import one another, while external
consumers may import them only from a capability's private `server/**` segment. Mapping provider
values at the adapter boundary remains a review concern; the path rule does not infer which server
file performs that mapping. Leave the root out and the rule is inert. Like every configured root, it
must be project-relative, remain inside `sourceRoot`, and stay disjoint from `moduleRoot`, `appRoot`,
and `sharedRoot`. A broad generated root would classify ordinary consumers as generated and
silence the boundary it is meant to enforce.

## Install

Copy the rule files into the consuming repository, then spread both configs after the base flat
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
ESLint from the project root so the contract aliases, TypeScript paths, and relative imports share
one root.

Configure `sourceRoot`, `moduleRoot`, `appRoot`, `sharedRoot`, and `importAliases` in
`architecture-contract.json`. Alias targets are project-relative and must match `tsconfig.json`.
Alias prefixes must end with `/` (`"@/"`, not `"@"`): a separatorless prefix claims every package
whose name starts with the same characters, so the tools refuse it rather than resolve `@supabase/…`
to a project path.
All ESLint globs, ownership checks, cycle checks, and database subjects derive from these fields.
`contractVersion` records the originating rules release and is maintained by `sync-version.mjs`.

Add the capability graph check to the same CI command:

```bash
node rules/check-module-cycles.mjs
node rules/check-dependency-classification.mjs
node rules/check-database-resources.mjs
```

For optional layout advice, run separately:

```bash
node rules/check-module-cohesion.mjs
```

The advisor walks capabilities under `moduleRoot` and admitted roots under `sharedRoot`.
It reports empty directories, apparently test-support-only directories, and adjacent `lib.ts`
/ `lib/`. These are naming heuristics: tests may belong to a neighbouring production file,
and source files in `fixtures/` may run in production. Only the deepest observation is reported.
Recommendations exit 0; configuration or execution errors (including a missing contract or
`moduleRoot`) are nonzero. A successful run does not prove semantic cohesion. Do not use these
observations as a migration acceptance gate; review consumers and responsibilities before changing
anything. See `designing-architecture/references/placement/module-cohesion.md`.

Before enabling the rules, classify every direct runtime dependency in
`architecture-contract.json` as `purePackages` or `runtimePackages`. Run
`check-dependency-classification.mjs`; a newly installed package fails closed until the product
decides which side it belongs to. Static analysis cannot infer package semantics from an npm name.

For Supabase projects, list the identifiers used for Supabase clients in
`databaseClientIdentifiers`, declare literal `.from()` and `.rpc()` resources in
`databaseResources`, and run `check-database-resources.mjs`. `consumers` is read-and-RPC
permission. A resource may also declare `writers`: with it present, an `insert`, `update`, `upsert`
or `delete` chained onto `.from(name)` is allowed only from a listed subject, and the owner is
always a writer. Absent, `consumers` keeps its previous meaning and nothing changes, because
narrowing it silently would turn every declared consumer of an existing contract into a violation.
A writer must already be a consumer. Read and write are told apart by the method chained onto the
same expression — syntax, not semantics: a write routed through a helper the checker cannot follow
is not seen. The checker ignores same-named methods
on other receivers. It catches undeclared and cross-capability string-level coupling that TypeScript
import rules cannot see. Standard dependency, build-output, coverage, test, and generated directories
are excluded when `sourceRoot` is the project root. The checker does not trace aliases, parse SQL, or
replace RLS/grant tests.

## Contract Surfaces

`contracts` is listed in `contractSurfaces`, `publicSurfaces` and `neutralSurfaces` by default, so a
capability may publish `contracts.ts`: its types, and the schemas that witness them. A project that
does not want the surface removes it from all three lists. A neighbour's `domain/**` and
`application/**` may import from a foreign contract surface — the one hole in their otherwise closed
direction rules — because depending on a published vocabulary is not depending on an implementation.

The value half is checked structurally, not by name. The rule opens the target contract file and
reads the declaration behind each imported binding:

- a type alias, an interface or a type-only binding is admitted;
- `export const X = <call>` is admitted when the callee's root binding was imported from a package
  listed in `purePackages`, or is another schema declared in the same file;
- an alias of a schema (`export { X as Y }`, `export const Y = X`), in the file or re-exported
  from a sibling it can read, is that schema;
- a binding imported bare from a schema package (`string`, `object`) is a constructor, so
  re-exporting it is behaviour: only a call rooted in it yields a schema;
- everything else is behaviour, including every declaration the reader cannot follow — an
  unreadable file, an unresolvable re-export, a value built by an unclassified call. The
  classification fails closed. The reader caches by file content, so a rewrite is seen even
  within one ESLint process.

This is deliberately not a `/Schema$/` name test: such a test admits
`export function chargeCardSchema() { return fetch(…) }`, reproduced under a real project's config.
What the structural check still cannot prove is that a schema value is *pure* — `purePackages` is a
product decision, and a call to something listed there is trusted to be a schema constructor. It
proves the declaration's shape, not the callee's behaviour.

## Runtime Markers

`server-only` and `client-only` are the part of the floor that the bundler enforces rather than a
reviewer. The resolved tier requires the marker to be present in the surface it guards. Its
position does not matter: under the wrong runtime condition the package resolves to a module that
throws, so any bundle graph containing the surface fails. Putting it first is a readable
convention, not a check:

| Surface | Marker |
| --- | --- |
| every `serverSurfaces` entry (`server`, `rsc`, `stream`, `job`) | `import 'server-only'` |
| `client.ts` | `import 'client-only'` |

`actions.ts` is excluded by design: it is the one surface browser code is meant to import. Test
files are exempt. Install `server-only` and `client-only` (they ship with Next.js) or the resolver
tier will also report them unresolved.

## Type-Only Edges

`import type`, `import { type X }`, `export type … from` and an import type node
(`import('…').X`, `typeof import('…')`) are erased by the compiler, so they carry no runtime
direction. The runtime and purity rules — `browserServer`, `serverClient`,
`domainDirection`, `applicationDirection`, `neutralDirection`, `sharedKernelDirection` — do not
apply to them. The ownership rules do: `appInternal`, `crossCapabilityInternal`,
`sharedImportsModule`, `generatedProviderLeak` and `privateServerBackedge` report a type-only edge
exactly as they report a value edge, because the coupling to a neighbour's private file survives the
compiler dropping the binding. A partly type-only import (`import { type A, b }`) is a value edge.

## Enforced Invariants

The portable floor has seven named properties:

1. **Ownership.** `app/**` and other capabilities use root public surfaces; private server code
   points inward, and a private segment cannot shadow a same-named root surface.
2. **Acyclic resolution.** Literal imports resolve, computed targets fail closed, and both file and
   capability graphs remain acyclic.
3. **Purity.** `domain/**` and `application/**` reject runtime packages and wrong-direction imports;
   domain admits only its own domain, `shared/kernel`, and classified pure packages.
4. **Runtime separation.** Browser-safe code cannot import server surfaces, server code cannot
   import browser surfaces, `actions.ts` is the explicit browser-to-server mutation boundary, and
   the runtime-bound surfaces carry their `server-only`/`client-only` marker. A `ui/**` file is
   classified by its `'use client'` directive, not by its directory: without one it is a Server
   Component and may read its own capability's `rsc.ts`.
5. **Surface contracts.** Module-root files use the admitted runtime vocabulary; named re-exports
   are allowed, `export *` is not, `actions.ts` opens with `'use server'`, re-exports no values, and
   exports nothing syntax proves is not an async function (`actionDirective`, `actionReexport`,
   `actionValueExport`; a wrapper call is left to Next.js's load-time check), `query-cache.ts` remains
   runtime-neutral, and a contract surface publishes types and schema declarations, never
   behaviour.
6. **Shared neutrality.** Shared code uses an admitted runtime-specific root and cannot depend on a
   product capability.
7. **Declared effects.** Every direct dependency is classified, and configured Supabase client
   calls use resources with declared owners and consumers.

Tests and test fixtures may cross these boundaries deliberately. The capability rule ignores test
files; the strict tier disables only cycle checking for them.

## Deliberately Not Enforced

Static imports cannot prove:

- whether an application operation passes the deletion test;
- whether a public surface narrows enough to justify itself;
- whether shared code has two real capability consumers with identical meaning and lifecycle;
- whether a runtime-neutral surface has real consumers on both runtimes;
- authorization and defense-in-depth predicates;
- validation exactly once per trust transition;
- cache ownership, report-once behavior, or stream/job lifecycle semantics;
- whether a package should be classified as pure or runtime-bound, and therefore whether a value
  built by a call into it is really a schema rather than behaviour with a schema's shape;
- which of a table's writes preserve its invariants — `writers` says who may write, not whether a
  given write is correct;
- resource ownership hidden in raw SQL, ORM expressions, migrations, or provider wrappers;
- whether code admitted to `shared/**` should later be demoted as its consumers diverge.

Review those against the human contract and test them at runtime. Adding a path rule that claims to
prove one of these would create a false guarantee.

## Verification

`node scripts/validate-rules.mjs` builds temporary TypeScript projects and checks the default
profile plus a nonstandard source root and alias. Every behaviour above carries both halves: a clean
fixture that must pass and a mutation that must fail. `node scripts/validate-contract-tools.mjs`
does the same for the enforced standalone tools, including the read/write distinction.
`validate-module-cohesion.mjs` checks advisory output and configuration errors separately.
The seven properties expand into multiple rule codes and mutations; exact current counts belong in validator output and `docs/evidence.md`, not in
the architecture taxonomy.
