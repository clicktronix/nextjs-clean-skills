# Glossary

**Impact: HIGH** · **Scope: stack (Next.js App Router)**

| Term | Meaning |
| --- | --- |
| Capability | Product behavior and vocabulary owned under one module root. |
| Module | Physical capability root at `src/modules/<capability>`. |
| Segment | Optional internal role: domain, application, server, client, or UI. |
| Domain | Pure invariants, calculations, and product values. |
| Application operation | Framework-neutral policy or orchestration that passes the deletion test. |
| Deletion test | Remove the candidate operation or abstraction; keep it only when meaningful complexity moves into callers. |
| Public surface | Runtime-specific root file that narrows or translates module internals. |
| Port | Application-owned capability contract independent of its technology. |
| Adapter | Private translation from a runtime, store, or provider to a capability contract. |
| Composition root | Outer channel or helper that establishes identity and supplies effects. |
| Request identity | Actor, roles, tenant/ownership scope, request id, and trace id. |
| Effect | Database, provider, reporter, clock, cache, or other runtime dependency. |
| Channel | RSC, Server Action, HTTP, stream, job, or browser lifecycle. |
| Provider row | External stored or wire shape owned by a private adapter. |
| Client cache | Browser-owned keyed copy with explicit freshness and invalidation. |
| Authority | Store, owned service, or application policy that commits a rule. |
| Shared admission | Evidence required before capability-neutral code enters `shared/**`. |

**Direction is not depth.** Correct imports do not justify a forwarding operation.

**A public surface is not automatically an abstraction.** It may publish an explicit stable API.
Unsafe private shapes require translation; a re-export alone does not justify another abstraction.

**A seam is not a folder.** A port exists because application policy needs a capability, not because
a directory is named `ports`.

Reference: Ports and Adapters terms adapted to capability-first App Router architecture.
