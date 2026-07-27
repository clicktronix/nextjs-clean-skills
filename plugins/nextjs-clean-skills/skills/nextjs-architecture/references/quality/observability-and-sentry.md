# Observability And Sentry

**Impact: HIGH** · **Scope: stack (Sentry)**

Fetch current Sentry docs for setup. Keep telemetry in infrastructure; domain and use-cases do not import the SDK. Separate server and client config.

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

Exporting the SDK helper directly would recapture what the boundary already reported: the render
channel re-raises by design. Wrap it so marked errors are skipped.

## One Capture Owner

Single-report is a guarantee of the boundary declaration, not something a caller arranges. The declaration reports through a reporter handed to it on `ctx`, so the combinator never imports the SDK. Reporting the same failure higher up produces duplicate events and unusable counts.

Capture at a framework entrypoint only for what never reaches the boundary: a defect in the adapter itself, or a client Error Boundary. Do not `flush()` every request — drain only where SDK guidance requires it.

```ts
try { return await handler(request) }
catch (error) {
  Sentry.captureException(error, { tags: { route, method } })
  return new Response('Internal Server Error', { status: 500 })
}
```

Expected failures — a rejected schema, a conflict — are application behaviour. Send them as structured logs, never as exceptions to page on.

## PII Redaction

`sendDefaultPii: false` scrubs neither messages, exceptions, breadcrumbs, contexts, nor user fields. Scrub email, phone, UUID, JWT and provider-key shapes, Replay included; if Replay is off, set `replaysSessionSampleRate: 0`.

Reported payloads carry field paths, never values: declared sensitive fields are stripped before anything leaves the boundary; headers and cookies attach by allowlist. Identify users by id; clear user and scope tags on logout.

Reference: project observability boundary; Sentry Next.js instrumentation + privacy posture.
