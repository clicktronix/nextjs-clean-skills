# Composition Without A DI Container

**Impact: HIGH** · **Scope: portable**

Runtime channel surfaces are composition roots. They establish request identity, resolve concrete
effects, and pass only the dependencies an operation needs. A trusted `server.ts` composition API
instead accepts explicit identity and remains silent when nested under another channel.

| Need | Plain mechanism |
| --- | --- |
| construct a service | typed factory |
| request scope | explicit identity and effects |
| singleton | module constant or runtime memo |
| decorate retry/logging | wrapper function |
| substitute remote dependency | port implementation |

Keep identity separate from effects:

```ts
type RequestIdentity = {
  actorId: string; tenantId: string
  requestId: string; traceId: string
}
type Dependencies = {
  generator: TextGenerator; clock: Clock
}
```

Repeated wiring is a signal to extract a capability-local factory, not a global service locator.
The factory may import private concrete adapters; application operations may not.

Use a container only when repeated assembly or lifecycle management is measurably harder than
explicit factories. Name the concrete problem it solves. Ports alone do not justify a container.

Do not inject pure domain functions. Importing them directly keeps the dependency visible and
compile-time checked.

Reference: explicit capability-local composition with closures and typed factories.
