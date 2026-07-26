# Testing By Layer

**Impact: HIGH** · **Scope: portable**

Tests cross the same seam callers cross. Reaching past an interface to test something means the module is the wrong shape.

| Layer | Assert | Run against |
| --- | --- | --- |
| `domain/**` | invariants and pure rules | nothing |
| declared boundaries | the returned outcome, success and failure | fakes for remote seams; the local engine for stored data |
| `data/**` modules | filters, pagination, escaping, policies, row mapping | the real engine, locally |
| outbound adapters | status codes, timeout, retry policy, refresh, cancellation | a fake server |
| streaming | clean stream, mid-stream disconnect, error after headers, cancellation | an event generator |
| inbound adapters | decoding, authorization, downstream call, response shape, invalidation | use-cases stubbed |
| `client-cache/**` | keys, enabled rules, invalidation ownership | inbound adapters stubbed |
| `ui/**` | rendering and interaction | the network boundary |
| e2e | real route, auth, data, browser | nothing |

Assert observable outcomes, not mechanics:

```ts
// Incorrect — restates the implementation
expect(deps.items.list).toHaveBeenCalledWith({ search: 'launch' })

// Correct — states the behaviour
const res = await listItems(ctx, { search: '  launch ' })
expect(res.ok && res.value.items).toHaveLength(1)
```

A call assertion is legitimate only when the call *is* the rule: that a command invalidated a specific cache tag, or that a non-idempotent request was not retried.

Two things not worth testing at the application layer: that a schema rejects a missing field — that tests the schema library — and anything the boundary owns, which is covered where the boundary is tested. A custom rule *inside* a schema, such as a cross-field check, is worth testing.

Do not substitute a fake for something that runs locally. A fake stands in for your own query, so a broken filter or a wrong policy stays green.

When a module gets deeper, delete the tests that covered the pieces it absorbed. Kept "just in case", they break on refactors while protecting nothing.

A use-case with nothing to assert has no behaviour. Test the data module or adapter beneath it instead.

Reference: the interface is the test surface.
