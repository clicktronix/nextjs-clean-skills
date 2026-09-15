# Module Cohesion

**Impact: HIGH** · **Scope: stack (capability modules)**

Group production files by the product operation or lifecycle that makes them change together. A
directory containing only `__tests__/`, `__mocks__/`, fixtures, or a lone type does not establish a
product boundary; keep those artifacts with the production owner.

The module path already names the capability. Private filenames normally name the local
responsibility without repeating that capability prefix. Use names such as `query.ts`,
`mutation.ts`, `row-mapper.ts`, and `filter-config.ts` only when those roles describe what the file
actually owns. Do not introduce generic `services/`, `utils/`, or `helpers/` buckets.

Keep supporting code nearest to its owner:

- one or a few cohesive helpers in `lib.ts`;
- independently tested helpers with distinct change reasons in `lib/`;
- presentation-only labels, copy, and formatting in `ui/lib/`;
- browser cache and transport support in `client/lib/`;
- adapter mapping and provider configuration in `server/lib/`;
- pure product rules in `domain/`, even when callers treat them as helpers.

Tests live beside their owner as `*.test.*` or under its `__tests__/`. Test-only probes, fixtures,
and mocks stay inside that test boundary and are never exported from production surfaces.

When a runtime schema witnesses a TypeScript value, infer the type from the schema. Keep a manual
type only when it deliberately expresses a broader or different contract; name and test that
distinction.

Reference: folder shape follows change ownership; helpers and tests do not create product layers.
