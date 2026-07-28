# Streaming Responses

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

A long-lived HTTP response is its own channel. Use a Route Handler and a capability `stream.ts`
surface, never a Server Action.

The stream channel owns:

1. headers and commit state;
2. cancellation propagated to the upstream producer;
3. sliding idle timeout;
4. resume cursor or event ID when supported;
5. pre-commit HTTP failure mapping;
6. post-commit in-band error or termination;
7. one unexpected-error report.

Create one channel-owned `AbortController`. Link the incoming `request.signal` to it, call
`abort(reason)` from the response stream's `cancel(reason)` callback, and pass only the derived
signal to the upstream fetch or SDK. Setting a boolean or stopping local iteration is not
cancellation: the producer must observe the abort. Remove listeners and clear idle timers during
cleanup.

If startup failures need an HTTP status, acquire the upstream stream before constructing or
returning the `Response`. Creating a `ReadableStream` and immediately marking it committed does not
make an asynchronous `start()` failure pre-commit; after the `Response` is returned, failure belongs
to the body channel.

Resume from the last delivered event when the protocol supports it. Do not replay a committed stream
as an ordinary retry.

Declare and validate event shapes:

```ts
type StreamEvent =
  | { type: 'chunk'; id: string; data: string }
  | { type: 'error'; code: ErrorCode }
  | { type: 'done' }
```

An application operation may own provider-neutral generation and capability policy. Provider SDK
types remain in a private server adapter.

Do not make a job inherit stream idle timeout merely because both call one operation. Jobs own
deadline, retry, and dead-letter behavior. Share a named provider-liveness policy only when both
channels intentionally use the same semantics.

Tests cover clean completion, failure before commit, failure after commit, disconnect/cancellation,
idle timeout, and resume. Cancellation passes only when upstream observes the abort.

Reference: streaming lifecycle and committed-response semantics.
