# Module Cohesion

**Impact: HIGH** · **Scope: stack (capability modules)**

## Group by responsibility

Choose a file or folder for locality and reasons to change, not a production-file threshold.
A scenario name such as `update-blog` and a role such as `map-row` can help navigation; neither
is a required naming scheme. Read verbs such as `list` and `read` are suggestions, not policy.
Do not add `application/` or ports merely to wrap a short CRUD path.

Authorization belongs to the capability's trusted composition: `server.ts` or the same private
composition used by its channels. Policy may live in `domain/` or `application/`; runtime auth
checks belong on the server. `rsc.ts` need not forward through `server.ts` just to satisfy a
layout. Inspect actual checks and callers rather than inferring safety from a `load-` prefix.

## Keep support local

Keep helpers beside their consumers: UI formatting with UI, browser lifecycle support with
client code, and provider mapping with its server adapter. Introduce `lib.ts` or `lib/` only
when it improves navigation; coexistence alone is not a defect. Pure product rules belong in
`domain/`, while purity alone does not justify moving implementation support there.

Private tests, mocks, and fixtures may use their own directories, including
`server/publish/__tests__/` beside `server/publish.ts`. They do not create a product layer.
Do not export test-only probes through production surfaces. Inspect consumers to distinguish
runtime seed data from test fixtures; extensions and directory names do not prove that distinction.

Infer types from the schema that witnesses their contract unless they deliberately differ; see
[Schema Kinds](../outbound/schema-kinds.md).

## Advisory inspection

`check-module-cohesion.mjs` reports naming-based observations across capabilities and shared
roots: empty or apparently test-support-only directories and adjacent `lib.ts` / `lib/`.
Recommendations exit 0; only configuration or execution errors fail. A reviewer turns an
observation into a finding only after showing a concrete responsibility, navigation, or boundary
problem. Do not make the report a migration gate or rearrange valid code to silence it.
