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
contract instead of reaching into a private schema file.

Server Components call capability server code directly. Fetching the app's own Route Handler adds an
HTTP round trip and can fail during prerendering when no server is listening.

Server Actions are UI command boundaries. They are not the transport for browser reads or external
service APIs.

Keep framework navigation outside generic catches. Catch and translate only the capability call,
then invoke `redirect()`, `permanentRedirect()`, or `notFound()` after that catch:

```ts
let item: WorkItem
try {
  item = await createWorkItem(command)
} catch (error) {
  return toActionFailure(error)
}
redirect(`/work-items/${item.id}`)
```

Never place the navigation call in the `try` whose `catch` maps application failures. Never expose
raw exception or provider text.

Reference: Next.js Route Handlers as public HTTP boundaries over capability behavior.
