# Glossary

**Impact: HIGH** · **Scope: portable**

Use these terms consistently. Do not redefine them in feature code.

| Term | Meaning |
| --- | --- |
| Domain | Pure business schemas, types, invariants, and helpers. No framework or I/O. |
| Scope | Actual consumers for which an implementation is valid; the repository by default. |
| Slice | A business capability that owns behaviour across several layers. |
| Use-case | A scenario with logic of its own, published as an entry over an operation. |
| Entry | One module in `entries/**`: the public declaration of one operation. |
| Operation | One module in `operations/**`: typed behaviour that throws and never reports. |
| Framework entrypoint | The route, action, or handler that *calls* an entry. Never just "entry". |
| Declaration | The single application boundary: validates, normalises failures, reports once. |
| Seam | A place where behaviour can be substituted without editing the code that uses it. |
| Port | A contract at a seam describing a capability needed from outside the process. |
| Adapter | A concrete implementation of a port. Adapter count is evidence, not the gate. |
| Dependency category | In-process, local-substitutable, remote-owned, or true-external. |
| Data module | Data access with no port in front of it, imported directly by its callers. |
| Outbound adapter | A port implementation for a service, API, queue, or provider. |
| Inbound adapter | A framework request boundary for forms, HTTP, webhooks, streams, or jobs. |
| Read entrypoint (DAL) | Server-only read boundary that verifies auth and returns domain-shaped data. |
| Composition root | The place that supplies concrete implementations. Usually an inbound adapter or read entrypoint. |
| Row type | The stored shape of a record, owned by whatever reads it. |
| Client cache | The keyed, lifecycle-managed copy of read results held for the browser. |
| Authority | The store, owned service, or application that commits and enforces access. |
| Result | The success-or-failure value a declaration returns to entry points. |

**Direction is not depth.** Imports pointing the right way say nothing about whether a module holds behaviour. A thin *declaration* is legitimate — the combinator behind it supplies the guarantees. A thin *operation* is not: nothing stands behind it.

**A seam is not a folder.** A directory named after a layer creates no substitution point, and a contract with one implementation is indirection wearing a seam's vocabulary.

Reference: Clean Architecture terminology adapted to a server-rendered application.
