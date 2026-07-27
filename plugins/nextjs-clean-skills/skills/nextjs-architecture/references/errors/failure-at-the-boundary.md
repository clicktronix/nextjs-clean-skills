# Failure At The Application Boundary

**Impact: HIGH** · **Scope: portable**

**The rule: one classification, produced once, translated per channel.** Layers throw. The
application boundary catches everything, classifies it, and reports it. Entry points translate that
classification into their own shape and never re-derive it.

```text
domain, data, adapters:  throw typed errors
boundary declaration:   catches everything, classifies, reports once
inbound adapters:   translate the classification into their channel's shape
```

Three channels, one classification. When each entry point catches and classifies for itself, one
fault becomes three different public shapes, and a fourth channel means writing the rules again.

**The carrier is a recommendation, not the rule.** A returned value and a thrown typed error both
satisfy it. Prefer the returned value where a channel hands something back across the
server/client boundary: a class instance does not survive serialization; a plain discriminated
union does, and needs no runtime implementation.

```ts
export type Result<E, T> = { ok: true; value: T } | { ok: false; error: E }
```

Do not build a class hierarchy for this: the value of the shape is that it is data.

```ts
// call-and-return channel — a serializable object
return res.ok ? { ok: true, data: res.value } : { ok: false, code: res.error.code }

// HTTP channel — status plus envelope
return res.ok ? apiJson(res.value, ctx.requestId) : apiError(res.error, ctx.requestId)

// render channel, from the read entrypoint — the route's error boundary sees it, already reported
if (!res.ok) throw asReported(toRenderError(res.error))
```

Do not return a result from a domain function or a pure helper. A broken invariant is not an
outcome to branch on, and wrapping it adds unwrapping ceremony with nothing behind it.

Do not let a data module or an adapter return one either. They throw; that is ordinary I/O
behaviour, and the boundary is what turns it into a value.

The render channel re-raises rather than returns, so it is the one that can double-report: the request-error hook captures what the boundary already logged. Mark the re-raised error as reported and have the hook skip marked errors — one fault, one event.

Errors raised after a response has begun streaming cannot change its status — they travel as an
event inside the stream instead.

A project that already classifies consistently at one boundary by throwing satisfies this rule.

Reference: one classification owned by one boundary; the carrier chosen from the channel's constraints.
