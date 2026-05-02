# Route Handlers For Service APIs

**Impact: CRITICAL**

Choose the backend boundary by caller, not by convenience.

| Caller / workload                        | Boundary                               |
| ---------------------------------------- | -------------------------------------- |
| UI form or button command                | Server Action                          |
| Read-heavy UI page                       | RSC + server-only DAL/read entrypoint  |
| Client cache/realtime/polling island     | `ui/server-state` -> Server Action/API |
| External HTTP client, SDK, or mobile app | Route Handler                          |
| Third-party callback                     | Webhook Route Handler                  |
| Long-running work                        | Queue/workflow handler                 |

**Incorrect (external service API hidden behind a Server Action):**

```ts
"use server";

export async function createPartnerWorkItem(input: CreateWorkItem) {
  return createWorkItemAction(input);
}
```

**Correct (HTTP service boundary owns headers, status, request id, and auth):**

```ts
export async function POST(request: Request) {
  const ctx = await createApiHandlerContext(request, {
    allowedRoles: ["admin"],
  });
  const body = parse(CreateWorkItemSchema, await request.json());
  const repo = createSupabaseWorkItemsRepository(ctx.supabase, ctx.userId);
  const result = await createWorkItem({ workItems: repo }, body);
  return apiJson(result, ctx.requestId, { status: 201 });
}
```

Route Handlers should still be thin inbound adapters. They parse HTTP input, verify auth/authz,
compose dependencies, call use-cases, invalidate caches, and return a stable JSON envelope.
Business rules stay in domain/use-cases.

Reference: Next.js Route Handlers.
