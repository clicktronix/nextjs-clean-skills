# Observability And Sentry

**Impact: HIGH**

Snippets are safe-shape examples, not an API tutorial: copy the shape, fetch current Sentry docs for exact flags. The rule (telemetry in infrastructure, no PII, capture once at the boundary) is stable; the SDK is not.

Error reporting belongs in infrastructure, not in domain or use-case code. Split helpers by runtime:

- server runtime: server-only lazy loader for inbound adapters, route handlers, and Server Actions.
- client runtime: client-safe wrapper for Error Boundaries and UI events.

Do not import a server-only helper into a Client Component or client error boundary.

## Lazy Loader

Do not import `@sentry/nextjs` at module top in shared modules. Wrap it in a lazy loader so tests without a DSN and code paths that never report do not pay the import cost.

```ts
let p: Promise<typeof import('@sentry/nextjs') | null> | null = null
export function getSentry() {
  p ??= import('@sentry/nextjs').catch(() => null)
  return p
}
```

Callers handle the `null` case (no DSN, dynamic import failure) without throwing.

## PII Redaction

`sendDefaultPii: false` only stops auto-attached request fields. Payloads can still leak through messages, exceptions, breadcrumbs, contexts, and user fields. Add a scrubber for email, phone, UUID, JWT, and provider key shapes.

Apply the same redaction to client-side `Replay` events if Replay is enabled; otherwise set `replaysSessionSampleRate: 0` explicitly so a future flag flip cannot accidentally enable it.

## User Context Without Email

Identify users by id only. Do not put email in telemetry user context; if domain-level triage matters, add an `email_domain` tag. On logout, clear user and scope tags.

## Inbound Boundary Capture

Capture unexpected errors once at the inbound boundary. Route handlers return generic public-safe responses; Server Actions use a shared wrapper. Do not wrap every nested function or duplicate-capture the same exception.

```ts
try { return await handler(req) }
catch (error) {
  const sentry = await getSentry()
  sentry?.captureException(error, { tags: { route, method } })
  await sentry?.flush?.(1500)
  return new Response('Internal Server Error', { status: 500 })
}
```

Use-cases throw typed `ApiError`s; inbound adapters decide which become user-visible status codes and which become 500 + telemetry events. Keep telemetry behind infrastructure so replacing Sentry does not touch domain or use-cases. Do not echo `error.message`, stack frames, or DB hints to the client.

Reference: project observability boundary; Sentry SDK lazy + privacy posture.
