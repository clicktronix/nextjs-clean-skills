# Cached Functions Need Stable Inputs

**Impact: HIGH**

Cached functions must be deterministic for their arguments.

Do:
- pass userId, tenantId, locale, filters, and pagination explicitly
- place `'use cache'` inside the cached function
- attach `cacheLife` and `cacheTag`

Do not:
- call `cookies()` or `headers()` inside the cached function
- read mutable module state
- close over request-specific objects

Read request context outside the cached scope, then pass stable values in.

**Incorrect (cached function reads request context):**
```ts
export async function listMyItems() {
  'use cache'
  const cookieStore = await cookies()
  return listItems(cookieStore.get('user_id')?.value)
}
```

**Correct (request context outside cached scope):**
```ts
export async function listMyItems() {
  const user = await verifySession()
  return listItemsCached(user.id)
}

async function listItemsCached(userId: string) {
  'use cache'
  cacheTag(`items:user:${userId}`)
  return listItems(userId)
}
```

Reference: Next.js Cache Components stable inputs.
