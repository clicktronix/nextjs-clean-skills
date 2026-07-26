# Glossary

**Impact: HIGH** · **Scope: portable**

Use these terms consistently. Do not redefine them in feature code.

| Term | Meaning |
| --- | --- |
| Domain | Pure business schemas, types, invariants, and helpers. No framework or I/O. |
| Slice | A business capability that owns behaviour across several layers. |
| Use-case | A scenario holding logic of its own: `entries/**` declares, `operations/**` is what others compose. |
| Declaration | The single application boundary: validates, normalises failures, reports once. |
| Seam | A place where behaviour can be substituted without editing the code that uses it. |
| Port | A contract at a seam describing a capability needed from outside the process. |
| Adapter | A concrete thing satisfying a port; a test adapter counts. Their number is evidence, not the gate. |
| Dependency category | in-process, local-substitutable, remote-owned, true-external. A default, not the port decision. |
| Data module | Data access with no port in front of it, imported directly by its callers. |
| Outbound adapter | An implementation of a port: an owned service, an external API, a queue. |
| Inbound adapter | The framework request boundary: form submissions, HTTP endpoints, webhook receivers. |
| Read entrypoint (DAL) | Server-only read boundary that verifies auth and returns domain-shaped data. |
| Composition root | The place that supplies concrete implementations. Usually an inbound adapter or read entrypoint. |
| Row type | The stored shape of a record, owned by the data module or adapter that reads it. |
| Client cache | The keyed, lifecycle-managed copy of read results held for the browser. |
| Authority | Whoever commits the transaction and enforces access: the store, an owned service, or the application. |
| Result | The success-or-failure value the wrapper returns to entry points. |

Two confusions worth naming.

**Direction is not depth.** Imports pointing the right way say nothing about whether a module holds behaviour. A correctly placed function that forwards its arguments with no wrapper behind it is still an empty layer — a thin body is only legitimate when a wrapper supplies guarantees the caller would otherwise repeat.

**A seam is not a folder.** Creating a directory named after a layer does not create a substitution point, and a contract with one implementation is indirection wearing the vocabulary of a seam.

Inbound adapters **may call** use-cases. Use-cases must not import inbound or outbound adapters.

Reference: Clean Architecture terminology adapted to a server-rendered application.
