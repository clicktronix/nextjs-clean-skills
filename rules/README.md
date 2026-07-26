# Rules

Executable counterparts to the guidance in `plugins/nextjs-clean-skills`. The skills tell an agent
what to do; these make the machine-checkable part of it fail loudly when it does not happen.

| File | Encodes | Adopt by |
| --- | --- | --- |
| [`import-table.json`](./import-table.json) | the contract, machine-readable — the source both configs derive from | editing it whenever a layer or permission changes |
| [`eslint-boundaries.mjs`](./eslint-boundaries.mjs) | tier one: the contract as import-string patterns, no dependencies | copying it into the project and spreading it into the flat ESLint config |
| [`eslint-boundaries-resolved.mjs`](./eslint-boundaries-resolved.mjs) | tier two: the same contract as resolved file paths | copying it in **with `import-table.json` beside it**, after tier one |

`scripts/validate-contract-sync.mjs` closes the gap neither tier can see: the matrix proves the
*config* matches the *table*, and says nothing about the documents an agent actually reads. Both the
layer table in `placement/layers-and-imports.md` and the contract block in the always-loaded
`SKILL.md` are **generated** from `root` and `mayImport`; the check fails CI when either drifts, and
`--fix` rewrites them. An earlier version compared two hand-written labels instead, so it proved
only that they matched each other — renaming a layer in both passed, and so did documenting "same
as inbound" while the permissions diverged.

Reference **examples** are linted too. A fence tagged `path=src/…` is written into the matrix
sandbox and linted as the file it claims to be, in all three tiers, with `expect=error` for a
deliberate counter-example. That class shipped twice — most damagingly a CRITICAL reference whose
"Correct" example showed an edge the lint rejects, in a release whose headline finding was a
template teaching the wrong shape.

`npm run validate` generates a source × target matrix from `import-table.json` and lints every
pair for real — static, `import()` and `require()` spellings — so a permitted edge that errors and
a forbidden edge that passes are both build failures. It runs that matrix against tier one alone,
tier two alone, and the two composed: 442 cases × 3 tiers at the time of writing. Three earlier
versions of this check were weaker (shape-only, then hand-picked fixtures) and each certified gaps
that a later review found by running ESLint itself.

## Two tiers, and why both

Tier one matches the import **string**. That makes it dependency-free, and it is why every layer is
named four ways in it — `@/x`, `@/x/**`, `**/x`, `**/x/**` — with a matching selector for the
`import()` and `require()` spellings the import rule cannot see.

Tier two compares **resolved file paths** via `import/no-restricted-paths`. It needs
`eslint-plugin-import` and a resolver that understands the project's aliases; `eslint-config-next`
already supplies both, so in a Next.js project this is not a new dependency. It buys two things
tier one cannot express at all:

- **Alias-independence.** One rule covers every spelling of a target, including aliases this repo
  never anticipated.
- **Subpath carve-outs.** "`app/**` may reach `client-cache/**` only at its `prefetch` entry" is a
  zone with an `except`. Tier one cannot say it: gitignore-style negation inside a
  `no-restricted-imports` group does not exempt the negated path — measured, in three spellings.

So tier one is a **subset** of tier two, never a contradiction of it. The table marks the cases
tier one provably misses (`resolvedOnly`), and the matrix asserts they lint clean there and error
once tier two is present — which is what keeps "weaker" from drifting into "disagreeing".

**Tier two has two prerequisites, both load-bearing.** A resolver for the alias, and
`import/no-unresolved`. Without a resolver, every `@/…` specifier fails to resolve and
`no-restricted-paths` silently skips it: measured, with the node resolver alone a forbidden aliased
import lints clean while only its relative spelling errors. A half-configured resolver is worse
than no rule, because it reports success. `import/no-unresolved` is what turns that into a loud
failure, and the validator's canary run asserts it — with the resolver stripped, the same import
must still error.

## Why these exist as code

The measurement is in [`docs/evidence.md`](../docs/evidence.md): across two products built on this
architecture, the one with path-scoped import rules had **zero** application files importing a
concrete adapter; the one without had the layer bypassed in **68** places. The documented direction
was identical in both. Only one of them was checked.

The same holds upstream: the handbook this architecture derives from ships a boundary lint rule and
has it **disabled** in the product it governs, and its own documentation lists the resulting debt.

## What is deliberately not here

**Depth.** No lint rule detects a function that forwards its arguments and holds nothing, a port
whose contract mirrors a table instead of a capability, or a module with no production call site. Those are
the failures 2.0.0 targets, and they are review questions — which is exactly why they are written as
rules and put in the Verification Gate rather than assumed to be caught by tooling.

**Anything the framework or the type checker already enforces.** A rule that duplicates a compiler
error costs attention and returns nothing.

**Slice isolation, and the same limit for the operation surface.** `slices-and-ownership.md` says a
slice must not import another slice's internals, and `use-case-wrapper.md` says an entry wraps its
OWN slice's operation. Neither cross-slice half is enforced: relating a source slice to a target
slice needs slice identity, which these path rules do not have. What IS enforced is the surface
split itself — an entry cannot reach data, an operation cannot declare, an inbound adapter cannot
skip the entry. These rules do **not** enforce it, and the reference says so: slice names are
project-specific, so a portable table cannot list them. The mechanism, if a project wants it, is one
zone per slice in the resolved tier — `from` the whole of `src`, `except` that slice's own
directories plus the shared layers (`domain`, `ports`, `boundary`, `infrastructure`, shared `ui`).
That is O(slices) zones rather than O(slices²). It is only half closed, and the half matters: an
unregistered slice is invisible to the slices that *are* registered, but nothing constrains what it
imports. Pair it with an inventory check — every directory under a sliced layer has a zone — or the
rule silently stops applying to new work, which is how it would fail in practice.

**Code that lives outside every layer root.** Both tiers scope their rules to the layer
directories, so a module at `src/lib/**` is bound by neither and can import a use-case and be
imported by a component — laundering the dependency through a file no rule watches. Laundering
through a *layer* file does not work (the intermediate file breaks its own rule), which is why this
is specifically about code parked outside the architecture. The answer is not another rule: it is
that `src/**` should be layers, and a `src/lib` is a migration artifact to empty out.

## Keeping them honest

Two obligations when adopting:

1. **Delete blocks for directories the project does not have.** A guard naming a path that does not
   exist protects nothing and teaches the next reader a layer that is not there. The template this
   architecture seeds shipped seven such guards; that is what the rule is reacting to.
2. **Change the config and the reference in the same PR.** If the two disagree, the reference is the
   one an agent reads and the config is the one CI enforces — and the project ends up with two
   contradictory answers, which is the failure mode this whole release is about.
