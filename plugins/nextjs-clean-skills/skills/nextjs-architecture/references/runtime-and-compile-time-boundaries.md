# Runtime And Compile-Time Boundaries

**Impact: HIGH**

Separate "who calls whom at runtime" from "who may import whom at compile time".

Runtime command flow:

```text
UI/form -> Server Action or Route Handler -> use-case -> port -> outbound adapter
```

Runtime read flow:

```text
RSC/page/layout -> server-only DAL/read entrypoint -> use-case/port -> outbound adapter
```

Compile-time import rule:

- use-cases import domain and local ports/types only.
- outbound adapters import the port type they implement.
- inbound adapters are composition roots and may import outbound factories.
- UI does not import outbound adapters.
- Client Components do not import server-only modules.

Server Actions are for UI-originated commands. Route Handlers are for HTTP clients, webhooks, queues, and integrations that own status codes, headers, signatures, or idempotency.

`app/` is a framework entry layer. Keep it thin: routing, metadata, layout, streaming boundaries, and calling already-composed read/action entrypoints.

Reference: Next.js App Router entrypoints mapped to Clean Architecture boundaries.
