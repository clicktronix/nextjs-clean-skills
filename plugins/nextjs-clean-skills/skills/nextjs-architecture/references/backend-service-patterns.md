# Backend Service Patterns

**Impact: HIGH**

Use Route Handlers for service APIs, not Server Actions.

Next.js backend capabilities are a BFF/API layer, not a full backend replacement. Use them when the product benefits from colocating frontend-facing service endpoints with the app; move heavy, long-running, or independently-scaled backend work to a dedicated service or durable job provider.

Choose a Route Handler when the caller is:

- external HTTP client
- webhook provider
- queue/cron callback
- mobile/native app
- internal service needing status codes, headers, signatures, or idempotency

Route Handler responsibilities:

- create request context: request id, auth/service identity, locale if needed.
- parse request and return a stable JSON envelope.
- verify webhook signatures before trusting parsed data.
- enforce idempotency for retried commands.
- compose ports/adapters and call use-cases.

Webhook guardrail: verify signatures against the raw body before JSON parsing; use provider SDKs or timing-safe HMAC comparison. Idempotency guardrail: persist `key + request fingerprint + scoped actor` in durable storage, not an in-memory map.

Do not put business rules in the handler. Do not expose raw exceptions. Do not make UI forms call API routes only because they are "more backend"; UI commands should usually be Server Actions.

Keep detailed provider-specific choices in repo docs such as `docs/ARCHITECTURE/BACKEND_SERVICE_PATTERNS.md`.

Reference: Next.js Route Handlers as service API boundaries.
