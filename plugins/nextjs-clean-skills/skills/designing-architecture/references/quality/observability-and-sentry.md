# Observability And Sentry

**Scope: stack (Sentry)**

Follow the installed Sentry SDK's documentation for setup. Keep SDK configuration in runtime infrastructure; domain and
application operations import no telemetry SDK.

## Instrumentation First

Initialize each runtime through the documented `instrumentation.ts` and server/client configuration.
Do not silently swallow a failed SDK import.

## One Capture Owner

The outer runtime channel reports an unexpected failure once with request/trace context. Inner
trusted `server.ts` surfaces, operations, and private adapters do not report the same error again.

When a channel reports and rethrows, Sentry's automatic instrumentation may observe the same
exception; [Runtime Boundaries](../../../../docs/runtime-boundaries.md#failures-and-reporting)
settles who captures it. Expected validation, conflict, and authorization outcomes are structured
product events, not exception telemetry.

## Privacy

- redact declared sensitive fields before logs or telemetry;
- attach headers and cookies by allowlist;
- keep raw provider messages and payload values out of reports;
- identify users by stable id, not email or token;
- clear user and scope tags on logout;
- configure replay sampling and scrubbing explicitly.
