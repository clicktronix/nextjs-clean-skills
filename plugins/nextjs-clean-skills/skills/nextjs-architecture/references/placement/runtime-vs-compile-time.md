# Runtime And Compile-Time Boundaries

**Impact: HIGH** · **Scope: stack (Next.js)**

Separate "who calls whom at runtime" from "who may import whom at compile time".

Runtime command flow:

```text
UI/form -> Server Action or Route Handler -> entry -> operation -> data module or port -> external system
```

Runtime read flow:

```text
RSC/page/layout -> read entrypoint -> entry + operation, or declared data/port call -> external system
client island -> client-cache -> Server Action or transport -> entry + operation, or declared data/port call
```

Compile-time import rule: the generated table in
[Layers And Imports](./layers-and-imports.md) states it completely. Do not restate a row here —
a summary that stays *almost* right is how the two documents came to disagree about whether an
entry may import `domain/**`.

What the table cannot express, and this file owns:

- Client Components do not import server-only modules. That is a bundling rule, not a layer edge:
  it constrains what reaches the browser, and the same import may be legal on the server.

Runtime flow descends through more steps than the import graph has edges. That is expected: an inbound adapter constructs an outbound implementation and hands it down, so the call reaches code the callee never imported.

The reverse is the violation — a use-case importing an inbound adapter, an outbound implementation, a database client, React, TanStack Query, or a framework request/cache API.

Server Actions are for UI-originated commands. Route Handlers are for HTTP clients, webhooks, queues, streaming, and integrations that own status codes, headers, signatures, or idempotency.

`app/` is a framework entry layer. Keep it thin: routing, metadata, layout, streaming boundaries, and calling already-composed read or action entrypoints. Logic that appears there is either a use-case that was never created or a read entrypoint that was skipped.

Reference: App Router entrypoints mapped to Clean Architecture boundaries.
