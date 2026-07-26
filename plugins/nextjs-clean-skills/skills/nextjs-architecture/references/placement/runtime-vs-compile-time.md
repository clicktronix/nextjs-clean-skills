# Runtime And Compile-Time Boundaries

**Impact: HIGH** · **Scope: stack (Next.js)**

Separate "who calls whom at runtime" from "who may import whom at compile time".

Runtime command flow:

```text
UI/form -> Server Action or Route Handler -> use-case -> data module or port -> external system
```

Runtime read flow:

```text
RSC/page/layout -> server-only read entrypoint -> use-case or data module -> external system
```

Compile-time import rule:

- operations import domain, ports and `data/**`; entries import the combinator and their slice's operations.
- outbound adapters import the port type they implement; data modules import domain only.
- inbound adapters are composition roots and may import outbound factories.
- UI does not import outbound adapters.
- Client Components do not import server-only modules.

Runtime flow descends through more steps than the import graph has edges. That is expected: an inbound adapter constructs an outbound implementation and hands it down, so the call reaches code the callee never imported.

The reverse is the violation — a use-case importing an inbound adapter, an outbound implementation, a database client, React, TanStack Query, or a framework request/cache API.

Server Actions are for UI-originated commands. Route Handlers are for HTTP clients, webhooks, queues, streaming, and integrations that own status codes, headers, signatures, or idempotency.

`app/` is a framework entry layer. Keep it thin: routing, metadata, layout, streaming boundaries, and calling already-composed read or action entrypoints. Logic that appears there is either a use-case that was never created or a read entrypoint that was skipped.

Reference: App Router entrypoints mapped to Clean Architecture boundaries.
