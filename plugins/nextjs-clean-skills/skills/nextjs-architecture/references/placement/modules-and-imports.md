# Modules And Imports

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

Product behavior lives under `src/modules/<capability>`. Reserved internal segments are optional:

| Segment | Owns | May depend on |
| --- | --- | --- |
| `domain/` | pure invariants and calculations | own domain, admitted `shared/kernel` |
| `application/` | policy, orchestration, projection, owned ports | own domain and pure application code |
| `server/` | private stores, providers, server cache, composition | own domain/application, admitted `shared/server` |
| `client/` | browser async lifecycle | browser-safe own contracts, exact own actions, admitted `shared/client` |
| `ui/` | reusable capability UI | own domain/client/action surfaces, admitted `shared/ui` |

Do not create empty segments. A tiny capability may keep several roles in one private server file
when no dependency rule needs a split.

External consumers import only runtime-specific root surfaces: `server.ts`, `rsc.ts`, `actions.ts`,
`client.ts`, `ui.ts`, `stream.ts`, or `job.ts`. A capability never imports another capability's
internal directory, and the module graph remains acyclic.

`app/**` owns routes and route-private presentation. It composes public surfaces but does not own
product policy.

Browser code never imports `server.ts`, `rsc.ts`, or `server/**`. The deliberate exception is an
exact Server Action imported from top-level `'use server'` `actions.ts`.

Use `server-only` and `client-only` markers, path checks, and a production build. Path legality and
bundle safety are separate guarantees.

Reference: capability-first ownership with optional, direction-bearing internal roles.
