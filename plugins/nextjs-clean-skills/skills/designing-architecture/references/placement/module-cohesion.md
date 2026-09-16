# Module Cohesion

**Impact: HIGH** · **Scope: stack (capability modules)**

## Two names, two jobs

A folder names a product scenario (verb + object: `search-blogs`, `update-blog`); a file inside it
names its architectural role. A complete scenario name may repeat the capability name; a private
filename otherwise does not.

Stay flat while a scenario has one production file (`server/update-blog.ts`). Promote to a folder
only when a second file shares that reason to change — a colocated test never counts. Roles after
promotion: `application/` → `query.ts`/`command.ts`/`orchestrator.ts` (several capabilities or
owned effects only); `server/` → `data.ts`, `http.ts` (behind `route.ts`), `repository.ts`
(justified shared collection, never a synonym for DB access); `client/` → `query.ts`/`mutation.ts`/
`store.ts`.

Never `use-case.ts` — the folder is the use case. Never bare `adapter.ts`/`service.ts`/`manager.ts`
— name the role or protocol. Never a generic bucket (`catalog/`, `listing/`, `filters/`) unless
that word is an established product concept.

A read scenario takes one verb: `list-<object>` (many) or `read-<object>` (one) — never `get-` or
`load-`, which has also meant "already authorized." Authorization is a role inside the folder
(`rsc.ts`: an auth wrapper over `data.ts`), never a verb.

## What else is cohesion

A directory holding only `__tests__/`, `__mocks__/`, fixtures, or a lone type is not a product
boundary; colocate with the production owner. Tests live as `*.test.*` beside it or under
`__tests__/`; test-only probes and mocks never leave that boundary through a production surface.

Never let `lib.ts` and `lib/` coexist under one owner — promote fully or not at all. `lib.ts` holds
a few cohesive helpers; `lib/` holds helpers with distinct change reasons, named by behavior
(`build-query.ts`, `map-row.ts`), never `helpers.ts`/`utils.ts`. Presentation in `ui/lib/`,
transport in `client/lib/`, mapping in `server/lib/`, pure rules in `domain/`.

## Schemas and types

A runtime schema witnesses a value only within its own kind — input, record, or row; see
[Schema Kinds](../outbound/schema-kinds.md). Never infer one kind's type from another's schema.

## Mechanically enforced

`check-module-cohesion.mjs` catches two properties above: a test/mock/fixture-only directory, and
`lib.ts` coexisting with `lib/`. Role naming and read verbs stay review-only — a static walk
cannot tell a legitimate full scenario name from a lazy one.

Reference: folder shape follows change ownership; helpers and tests do not create product layers.
