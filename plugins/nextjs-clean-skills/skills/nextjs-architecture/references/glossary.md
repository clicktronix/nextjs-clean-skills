# Glossary

**Impact: HIGH**

Use these terms consistently. Do not redefine them in feature code.

| Term | Meaning |
| --- | --- |
| Domain | Pure business schemas, types, invariants, and helpers. No framework or I/O. |
| Use-case | Application scenario that orchestrates domain rules through ports. |
| Port | Type owned by a use-case that describes what external capability it needs. |
| Outbound adapter | Implementation of a port: Supabase, HTTP API, queue, file store, transport. |
| Inbound adapter | Framework/request boundary: Server Action, Route Handler, webhook handler. |
| DAL | Server-only read boundary that verifies auth/authz and maps rows to DTOs. |
| Composition root | Place that wires concrete adapters into use-cases. Usually inbound/DAL. |
| Server-state | Client-side async cache owned by TanStack Query, only when opt-in. |

The most common confusion: inbound adapters **may call** use-cases. Use-cases must not import inbound or outbound adapters.

Reference: Clean Architecture terminology adapted to a Next.js App Router app.
