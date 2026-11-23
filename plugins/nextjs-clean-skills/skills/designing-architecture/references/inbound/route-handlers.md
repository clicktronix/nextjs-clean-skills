# Route Handlers As HTTP Boundaries

**Scope: stack (Next.js)**

Route Handlers live in `app/**` and own HTTP, not product policy.

Use one for:

- browser-owned `GET` reads;
- external APIs or mobile clients;
- webhooks and callbacks;
- service/queue/cron callbacks;
- streaming responses.

The handler:

1. authenticates the caller, or verifies a webhook signature over the raw body;
2. decodes and validates the request;
3. establishes entry-level permission for what the request addresses;
4. applies durable idempotency where retries enter;
5. calls a capability root public surface, never private application code;
6. maps the outcome to status, headers, and a safe public body;
7. reports an unexpected failure once.

Meaningful filtering, projection, authorization consequences, and cross-capability orchestration
remain inside an owning capability.

The handler may import a capability root such as `server.ts` or `stream.ts`. It must not import that
capability's `server/**`, `application/**`, or `domain/**` internals. Keep HTTP input schemas
route-local when they belong only to that endpoint; otherwise publish a deliberately narrowed root
contract instead of reaching into a private schema file. Public failure classifiers needed by HTTP
are exported from that root contract; importing a private application error is still a bypass.

Server Components call capability server code directly; fetching the app's own Route Handler adds
a round trip and can fail during prerendering.

A browser-owned `GET` takes its path and response schema from `contracts.ts`, as `client.ts` does.

Catch and translate the capability call into the HTTP contract owned by the handler:

```ts
export async function POST(request: Request) {
  try {
    const identity = await requireCaller(request)
    const outcome = await createWorkItem(identity, await decode(request))
    return isFailure(outcome) ? toHttpResponse(outcome) : Response.json({ id: outcome.id }, { status: 201 })
  } catch (error) {
    unstable_rethrow(error)
    return toHttpResponse(error, reportUnexpected)
  }
}
```

`unstable_rethrow` from `next/navigation` lets a framework exception through; without it a
`redirect()` becomes a 5xx ([RSC Reads](../../../../docs/runtime-boundaries.md#rsc-reads)).

`toHttpResponse` is the handler's own mapper: an expected failure becomes its public status and
body, whether returned or thrown (`requireCaller` throws one); an unexpected one is passed to
`reportUnexpected` once and becomes a generic 5xx. A Server Action follows the
forms-and-actions reference, not an HTTP mapper.
