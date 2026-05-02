# Use Idempotency Keys For Service Commands

**Impact: HIGH**

External clients retry failed requests. Retried POST/PUT/PATCH commands must not double-create
rows, double-charge, double-send emails, or enqueue duplicate AI jobs.

Require `Idempotency-Key` when a service API command has side effects.

**Incorrect (retry can create duplicates):**

```ts
export async function POST(request: Request) {
  const input = await request.json();
  const result = await createWorkItem(deps, input);
  return Response.json(result, { status: 201 });
}
```

**Correct (same key + same body returns the same response):**

```ts
const key = request.headers.get("idempotency-key");
if (!key) return apiErrorWithCode(VALIDATION_ERROR, requestId, 400);
const input = parse(CreateWorkItemSchema, await request.json());
const result = await runIdempotentCommand({
  context, key, method: "POST", path, requestBody: input, statusCode: 201,
  command: () => createWorkItem(deps, input)
});
return apiJson(result.data, context.requestId, { status: 201 });
```

Store idempotency records in durable storage with user/tenant scope and a request-body hash.
If the same key is reused with a different body, return conflict. Do not use an in-memory map
in serverless deployments.

Include enough metadata for your helper to scope replay safely: method, path, status code,
tenant/user id, and the validated request body.

Reference: HTTP idempotency key patterns for service APIs.
