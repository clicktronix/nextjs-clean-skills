# Composition Without A DI Container

**Impact: HIGH** · **Scope: portable**

Dependencies are supplied by the caller, not resolved from a registry. Closures and an explicit context cover everything a container would provide at this scale.

| Container feature | Plain equivalent |
| --- | --- |
| constructor injection | factory returning an object literal |
| request scope | explicit `ctx` (client + caller identity) |
| singleton | module-level constant, or a per-request memo |
| resolution graph | composition root in the inbound adapter |
| decorators (retry, logging) | a wrapping function |
| test doubles | an object literal |

The composition root is the inbound adapter: it holds the request, so it is the only place that can build request-scoped collaborators.

Repeated wiring is a hint to extract a helper, not to install a container:

```ts
export function agentPort(ctx: RequestContext): AgentPort {
  return createHttpAgentPort(ctx.fetch, ctx.serviceToken)
}
```

Reach for a container only when one of these is true, and say which. These are chosen
triggers, not measured ones — their job is to make the decision reopenable on a stated fact:

- a single composition site wires more than five collaborators
- the same graph is assembled in more than three places after extracting a helper
- something needs a per-request lifetime that cannot be passed explicitly

None of these follows from "we have ports". A registry adds a symbol, a binding file, and a runtime failure mode (an unregistered binding throws when the code runs, not when it compiles) in exchange for indirection the application does not need.

Do not route pure domain functions through injection. There is nothing to swap, so importing them directly is correct.

Do not build a service-locator instead: a module that reaches into a global registry to fetch collaborators restores the coupling the seam removed, while hiding it from the type checker.

Reference: dependency injection on the frontend via closures rather than a container.
