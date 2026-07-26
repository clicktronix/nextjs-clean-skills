# Streaming Responses

**Impact: HIGH** · **Scope: portable**

A long-lived response breaks the assumptions an ordinary request adapter is built on: it does not complete, a retry loses position, a whole-request timeout is meaningless, and the status is already sent before most failures happen.

Rules:

1. **Only the boundary that owns the response.** A boundary whose contract is "return a value" cannot serve a stream — it owns neither headers, nor status, nor a body that stays open. In this stack that means an HTTP endpoint, never an action.
2. **Resume, do not retry.** Reconnect from the last delivered event id. A blind repeat duplicates everything already consumed.
3. **Idle timeout, not total timeout.** Bound the gap between events; a healthy stream may legitimately run for minutes.
4. **Cancellation reaches upstream.** Wire the incoming request signal to the outgoing call, or the producer keeps working — and keeps billing — after the client is gone.
5. **Failures after the first byte travel in-band**, as a terminal event. The status line is spent.
6. **Events are a declared union**, parsed like any other external data.

```ts
export type StreamEvent =
  | { type: 'chunk'; id: string; data: string }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'done' }
```

The port makes the shape explicit, so callers know the response arrives in parts and must be consumed or cancelled:

```ts
export type AgentPort = {
  streamChat(input: ChatInput, signal: AbortSignal): AsyncIterable<StreamEvent>
}
```

A silent disconnect and a terminal `error` event mean different things: the first may be resumed from the last id, the second must not.

Client-side accumulation belongs in the client cache layer for that slice — the component receives assembled state, not a socket. This is the narrow case where that layer legitimately holds a live connection; list it explicitly wherever such exceptions are recorded, with the reason.

Tests cover four paths: a clean stream, a mid-stream disconnect, an error after headers, and cancellation. The cancellation test only counts if it asserts that upstream observed the abort.

Reference: streaming as its own boundary shape, not a slow request.
