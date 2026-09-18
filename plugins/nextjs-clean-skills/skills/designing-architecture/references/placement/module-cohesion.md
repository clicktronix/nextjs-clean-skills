# Module Cohesion

**Impact: HIGH** · **Scope: stack (capability modules)**

## Two names, two jobs

A folder names a product scenario (verb + object: `search-blogs`, `update-blog`); a file inside it
names its architectural role. A complete scenario name may repeat the capability name; a private
filename otherwise does not.

Stay flat while a scenario has one production file (`server/update-blog.ts`). Promote to a folder
only when a second file shares that reason to change — a colocated test never counts. After
promotion a file names its role (`data.ts`, `map-row.ts`, `query.ts`, `mutation.ts`). The contract
says a name describes a responsibility, not a template, so prefer a role or protocol name over
`use-case.ts` (the folder already is the use case), bare `adapter.ts`/`service.ts`/`manager.ts`, or
a generic bucket (`catalog/`, `filters/`) that is not an established product concept.

A read scenario takes one verb about the data: `list-<object>` (many) or `read-<object>` (one).
`load-` has been used to mean "already authorized", a policy fact in a filename. Authorization is
neither a verb nor a private file: the trusted `server.ts` enforces the capability's policy and the
root `rsc.ts` reads through it. Those are reserved root surfaces, never names inside a folder.

## What else is cohesion

A directory that is empty, or holds only `__tests__/`, `__mocks__/`, test-support source, or a
lone type, is not a product boundary; colocate with the production owner. Data, assets and styles
are production wherever they sit — `fixtures/seed.json` keeps its folder. Tests live as `*.test.*`
beside their owner or under `__tests__/`; probes and mocks never leave that boundary through a
production surface.

Never let `lib.ts` and `lib/` coexist under one owner — promote fully or not at all. `lib.ts` holds
a few cohesive helpers; `lib/` holds helpers with distinct change reasons, named by behavior
(`build-query.ts`, `map-row.ts`), never `helpers.ts`/`utils.ts`; the contract says which
segment's `lib/` owns which kind of helper.

Types are inferred from the schema that witnesses the contract; see
[Schema Kinds](../outbound/schema-kinds.md).

## Mechanically enforced

`check-module-cohesion.mjs` catches two properties above under every capability and shared root:
an empty or test-support-only directory, and `lib.ts` beside `lib/`. Role naming and read verbs
stay review-only — a static walk cannot tell a complete scenario name from a lazy one.

Reference: folder shape follows change ownership; helpers and tests do not create product layers.
