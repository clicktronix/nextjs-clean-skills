# Modules And Imports

**Scope: stack (Next.js App Router)**

Product behavior lives under `<moduleRoot>/<capability>`. Reserved internal segments are optional:

| Segment | Owns | May depend on |
| --- | --- | --- |
| `domain/` | pure invariants and calculations | own domain, admitted `shared/kernel`, a neighbour's `contracts.ts`, classified pure packages |
| `application/` | policy, orchestration, projection, owned ports | own domain, a neighbour's `contracts.ts`, classified pure code |
| `server/` | private stores, providers, server cache, composition, reading Server Components | own domain/application, own `ui/` views, admitted `shared/server` |
| `client/` | browser async lifecycle | browser-safe own contracts, exact own actions, admitted `shared/client` |
| `ui/` | reusable capability views | own domain/client/action surfaces, admitted `shared/ui`; no server code |

Introduce a segment for an actual responsibility, not to complete a template. A tiny capability
may keep several roles in one private server file when no dependency rule needs a split.

For the tree inside a segment, read [Module Cohesion](module-cohesion.md).

External consumers import only root surfaces: `server.ts`, `rsc.ts`, `actions.ts`, `client.ts`,
`ui.ts`, `contracts.ts`, `query-cache.ts`, `stream.ts`, or `job.ts`. Named re-exports may publish an
explicit API; `export *` is forbidden. `actions.ts` export constraints are in
[Public Surfaces](../../../../docs/architecture-contract.md#public-surfaces). A
capability never imports another capability's internal directory, and the module graph remains
acyclic.

`app/**` owns routes and route-private presentation. It composes public surfaces but does not own
product policy.

Browser code and `ui/**` never import `server.ts`, `rsc.ts`, or `server/**`, except an exact
Server Action from top-level `'use server'` `actions.ts`. Server code calls a neighbour through
`server.ts`, not a channel surface. Provider packages belong to adapters, nothing imports from
`app/**`, and a type import follows the value rules (contract rules 14–18).

Runtime calls and compile-time imports are different graphs:

```text
RSC route  -> rsc.ts     -> server service -> store
UI command -> actions.ts -> server service -> store
Browser    -> GET handler -> server.ts
Worker     -> job.ts     -> application operation -> provider adapter
```

That runtime reaches a concrete adapter does not let application code import it.

Use `server-only` and `client-only` markers, path checks, and a production build. Path legality and
bundle safety are separate guarantees.
