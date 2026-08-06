# Channel Boundaries And Composition

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

Application operations are typed, framework-neutral, and silent. Runtime channels own their native
input, output, failure translation, and report-once behavior.

Shared semantic primitives may define:

- stable expected-failure codes;
- reporter and request context;
- redaction;
- provider-error mapping.

Do not force RSC, Server Action, HTTP, stream, and job through one result wrapper. Their contracts
differ:

| Channel | Native outcome |
| --- | --- |
| RSC | renderable value/state; framework navigation outside generic catches |
| Server Action | serializable form/action state |
| HTTP | status, headers, and public body |
| stream | pre-commit HTTP outcome or post-commit in-band event |
| job | retry, drop, dead-letter, or completion |

An unexpected defect is reported once by the outer channel that can name the request and outcome.
Trusted `server.ts` composition surfaces, inner operations, and adapters do not report it again.

Cross-capability composition uses one outer orchestrating operation. It calls dependencies through
its own port language; it does not call another channel wrapper or import another capability's
internals. The application port does not import types from another capability's `server.ts`,
`rsc.ts`, or other runtime surface. A private server adapter imports that public surface and maps its
values into the orchestrator's own input and output types.

Each source surface owns its request contract. Use an admitted shared identity type only when the
meaning is genuinely common; otherwise the orchestrating adapter maps its identity separately for
each source. One source capability never lends its identity type to another.

Framework control flow such as redirect and not-found remains outside generic catches.

Reference: shared failure semantics with channel-native outer contracts.
