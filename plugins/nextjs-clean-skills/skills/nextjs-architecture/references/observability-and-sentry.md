# Observability And Sentry

**Impact: HIGH**

Fetch current Sentry docs for exact setup. Keep telemetry in infrastructure, redact PII, and assign one capture owner per failure. Separate server and client config; domain and use-cases do not import Sentry.

## Instrumentation First

Initialize each runtime in its documented config file, load it from `instrumentation.ts`, and export the supported request-error hook. Never swallow a failed SDK import; broken production telemetry must fail validation or startup.

```ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

export const onRequestError = Sentry.captureRequestError
```

Unhandled server/request errors use automatic capture. Call `captureException` only for caught or swallowed failures and client Error Boundaries. Do not capture the same exception again at a route boundary.

## PII Redaction

`sendDefaultPii: false` does not scrub messages, exceptions, breadcrumbs, contexts, or user fields. Scrub email, phone, UUID, JWT, and provider-key shapes.

Apply the scrubber to Replay events. If Replay is off, set `replaysSessionSampleRate: 0`.

## User Context Without Email

Identify users by id, not email; use an `email_domain` tag if needed. Clear user and scope tags on logout.

## Handled Error Capture

If an inbound adapter catches an unexpected error to return a safe response, capture before conversion. Do not `flush()` every request; drain only in custom short-lived runtimes where current SDK guidance requires it.

```ts
try { return await handler(request) }
catch (error) {
  Sentry.captureException(error, { tags: { route, method } })
  return new Response('Internal Server Error', { status: 500 })
}
```

Use-cases throw transport-neutral application errors. Inbound adapters map expected failures to public results and unexpected failures to 500 + telemetry. Never expose raw messages, stacks, or DB hints.

Reference: project observability boundary; Sentry Next.js instrumentation + privacy posture.
