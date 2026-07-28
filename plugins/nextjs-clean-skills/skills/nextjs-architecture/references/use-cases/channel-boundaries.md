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
internals.

Framework control flow such as redirect and not-found remains outside generic catches.

Reference: shared failure semantics with channel-native outer contracts.
