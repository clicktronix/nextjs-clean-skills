# Route Handlers As Service APIs

**Impact: HIGH** · **Scope: stack (Next.js)**

Use Route Handlers for service APIs, not Server Actions.

Next.js backend capabilities are a BFF/API layer, not a full backend replacement. Use them when the product benefits from colocating frontend-facing service endpoints with the app; move heavy, long-running, or independently-scaled work to a dedicated service or durable job provider.

Choose a Route Handler when the caller is:

- an external HTTP client
- a webhook provider
- a queue or cron callback
- a mobile or native app
- an internal service needing status codes, headers, signatures, or idempotency
- a consumer of a streaming response

Route Handler responsibilities:

- build request context: request id, auth or service identity, locale when needed
- decode the request and return a stable JSON envelope
- verify webhook signatures against the raw body before parsing it
- enforce idempotency for retried commands
- declare the boundary, then call the use-case — or, with no scenario, the data module or supplied port directly — and translate the result

Webhook guardrail: verify signatures before trusting parsed data, using provider SDKs or timing-safe comparison. Idempotency guardrail: persist `key + request fingerprint + scoped actor` in durable storage, never an in-memory map — a second instance or a restart would replay the command.

Do not put business rules in the handler. Do not expose raw exceptions. Do not route same-app form commands here only because they feel "more backend"; UI commands belong in Server Actions.

A Server Component must not reach its own Route Handler over HTTP. It already runs on the server: call the read entrypoint directly. The extra hop costs a request, drops the in-process request context, and repeats auth work that has to be done again anyway.

`redirect()`, `permanentRedirect()` and `notFound()` are implemented by throwing, and so are the request-time APIs under a static route. Keep them **outside** the boundary: it returns a value, the handler navigates. `unstable_rethrow` exists for a catch that already mixes both, but the docs mark it unstable and not recommended for production — it is a migration aid, not the design.

Keep provider-specific choices in repository documentation rather than in the handler.

Reference: Route Handlers as the service API boundary.
