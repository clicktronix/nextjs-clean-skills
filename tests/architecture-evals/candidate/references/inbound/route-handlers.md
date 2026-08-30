# Route Handlers As HTTP Boundaries

**Impact: HIGH** · **Scope: stack (Next.js)**

Route Handlers live in `app/**` and own HTTP, not product policy.

Use one for:

- browser-owned `GET` reads;
- external APIs or mobile clients;
- webhooks and callbacks;
- service/queue/cron callbacks;
- streaming responses.

The handler:

1. decodes and validates the request;
2. authenticates the caller and establishes entry-level permission;
3. verifies webhook signatures before trusting parsed content;
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

Server Components call capability server code directly. Fetching the app's own Route Handler adds an
HTTP round trip and can fail during prerendering when no server is listening.

Server Actions are UI command boundaries. They are not the transport for browser reads or external
service APIs.

Catch and translate the capability call into the HTTP contract owned by the handler:

```ts
export async function POST(request: Request) {
  const command = await decodeCreateWorkItem(request)
  try {
    const item = await createWorkItem(command)
    return Response.json({ id: item.id }, { status: 201 })
  } catch (error) {
    return toHttpResponse(error)
  }
}
```

Never expose raw exception or provider text. For Server Action navigation and framework control
flow, use the forms-and-actions reference instead of copying an HTTP mapper.

Reference: Next.js Route Handlers as public HTTP boundaries over capability behavior.
