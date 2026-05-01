# Use `updateTag` For Read-Your-Writes

**Impact: HIGH**

Use `updateTag(tag)` inside Server Actions after a successful mutation when the mutating user must see fresh data immediately.

Rules:
- call only from Server Actions
- update entity-specific and list-specific tags affected by the mutation
- scope list tags by user or tenant when data is personalized
- do not call from use-cases or outbound adapters

`updateTag` is part of the inbound/framework boundary.

**Incorrect (Route Handler uses `updateTag`):**
```ts
export async function POST() {
  updateTag('posts')
  return Response.json({ ok: true })
}
```

**Correct (Server Action uses `updateTag`; Route Handler uses `revalidateTag`):**
```ts
'use server'

export async function publishPostAction(id: string) {
  await publishPost(id)
  updateTag(`post:${id}`)
  updateTag('posts')
}
```

Reference: Next.js `updateTag` Server Action constraint.
