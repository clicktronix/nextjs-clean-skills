# Verify Webhook Signatures Before Parsing

**Impact: CRITICAL**

Webhooks are not browser-session traffic. Treat them as a separate trust boundary.

**Incorrect (parses and processes before verification):**

```ts
export async function POST(request: Request) {
  const event = await request.json();
  await processWebhookEvent(event);
  return Response.json({ ok: true });
}
```

**Correct (verify the raw body first):**

```ts
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const payload = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  if (!verifyWebhookSignature(payload, signature, secret)) {
    return apiErrorWithCode(AUTHENTICATION_ERROR, requestId, 401);
  }
  await processWebhookEvent(parse(WebhookEventSchema, JSON.parse(payload)));
  return apiJson({ accepted: true }, requestId, { status: 202 });
}
```

Webhook routes should:

- read the raw body used by the provider signature
- use constant-time comparison where possible
- avoid user-session auth
- make side effects idempotent
- log request ids without logging secrets or full raw payloads by default

Reference: Webhook provider signature verification docs and Next.js Route Handlers.
