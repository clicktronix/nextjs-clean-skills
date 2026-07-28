# Failure At Runtime Boundaries

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

Share semantics, not one universal carrier:

```text
expected application outcome -> typed value
unexpected defect or outage  -> exception
framework control flow        -> framework boundary
```

Each outer channel owns one translation and one unexpected-error report:

| Channel | Translation |
| --- | --- |
| RSC | renderable state or framework error/navigation |
| Server Action | serializable action state |
| HTTP | status, headers, public body |
| stream before commit | HTTP outcome |
| stream after commit | in-band event or termination |
| job | complete, retry, drop, or dead-letter |

Trusted `server.ts` composition surfaces and application operations report nothing. Private adapters
map provider errors to semantic failures but do not report an error the outer channel will report.

Do not catch `redirect`, `permanentRedirect`, or `notFound` in a generic application catch. Invoke
framework navigation after a typed result is known.

For every rethrown channel failure, choose one capture owner. If framework instrumentation can
observe an exception already reported by the channel, preserve an already-reported marker or let
the instrumentation own the capture instead.

A returned union and a typed throw can both represent expected outcomes. Choose the carrier from the
channel's serialization and control-flow needs; do not force it into domain functions or every
adapter.

Reference: one report per runtime operation with channel-native outcomes.
