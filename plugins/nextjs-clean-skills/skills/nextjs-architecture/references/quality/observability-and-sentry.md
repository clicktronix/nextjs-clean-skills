# Observability And Sentry

**Impact: HIGH** · **Scope: stack (Sentry)**

Fetch current Sentry docs for exact setup. Keep telemetry in infrastructure; domain and use-cases do not import the SDK. Separate server and client config.

## Instrumentation First

Initialize each runtime in its documented config file, load it from `instrumentation.ts`, and export the request-error hook. Never swallow a failed SDK import: broken telemetry must fail startup.

`instrumentation.ts` sits outside `src/`, so the layer and environment rules do not reach it.

```ts
import * as Sentry from '@sentry/nextjs'
import { isAlreadyReported } from '@/infrastructure/errors'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

export const onRequestError = (error, request, context) =>
  isAlreadyReported(error) ? undefined : Sentry.captureRequestError(error, request, context)
```

Exporting the SDK helper directly would recapture failures the application boundary already
reported: the render channel re-raises them by design. Wrap it so marked errors are skipped.

## One Capture Owner

Single-report is a guarantee of the boundary declaration, not something an entry point arranges. Reporting the same failure a second time higher up produces duplicate events and makes failure counts unusable.

Capture at an entry point only for what never reaches the boundary: a defect in the adapter itself, or a client Error Boundary. Do not `flush()` every request — drain only in short-lived runtimes where current SDK guidance requires it.

```ts
try { return await handler(request) }
catch (error) {
  Sentry.captureException(error, { tags: { route, method } })
  return new Response('Internal Server Error', { status: 500 })
}
```

Expected failures — a rejected schema, a conflict — are application behaviour. Send them as structured logs, never as exceptions to page on.

## PII Redaction

`sendDefaultPii: false` scrubs neither messages, exceptions, breadcrumbs, contexts, nor user fields. Scrub email, phone, UUID, JWT and provider-key shapes, Replay events included; if Replay is off, set `replaysSessionSampleRate: 0`.

Reported payloads carry field paths, never values: declared sensitive fields are stripped before anything leaves the boundary, and headers or cookies attach by allowlist. Identify users by id, not email; clear user and scope tags on logout.

Reference: project observability boundary; Sentry Next.js instrumentation + privacy posture.
