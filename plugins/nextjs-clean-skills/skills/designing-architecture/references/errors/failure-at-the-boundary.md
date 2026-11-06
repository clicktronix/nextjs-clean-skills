# Failure At Runtime Boundaries

**Scope: stack (Next.js App Router)**

Share semantics, not one universal carrier:

```text
expected application outcome -> typed value at the outer channel
unexpected defect or outage  -> exception
framework control flow        -> framework boundary
```

Shared primitives may define the closed set of failure kinds, reporter and request context,
redaction, and the provider-error mapping mechanism — semantics, never one carrier. Product codes
belong to their capability ([Error Taxonomy](./error-taxonomy.md)). Each outer channel owns one
translation and one unexpected-error report; the per-channel table is in
[Runtime Boundaries](../../../../docs/runtime-boundaries.md#failures-and-reporting).

Trusted `server.ts` composition surfaces and application operations report nothing. Private adapters
map provider errors to semantic failures but do not report an error the outer channel will report.

Do not catch `redirect`, `permanentRedirect`, or `notFound` in a generic application catch. Invoke
framework navigation after a typed result is known.

A rethrown channel failure has one capture owner; see
[Runtime Boundaries](../../../../docs/runtime-boundaries.md#failures-and-reporting).

Inside the capability, a returned union and a typed throw can both represent expected outcomes
([rule](../../../../docs/runtime-boundaries.md#failures-and-reporting)). Choose the carrier from the
channel's serialization and control-flow needs; do not force it into domain functions or every
adapter.
