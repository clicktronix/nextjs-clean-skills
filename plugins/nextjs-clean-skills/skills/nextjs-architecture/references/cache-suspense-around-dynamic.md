# Suspense Around Dynamic Reads

**Impact: HIGH**

When Cache Components are enabled, dynamic request data should be isolated behind Suspense boundaries.

Use Suspense for:

- async children with request-time data
- dynamic sections inside mostly cached shells
- fallback UI that preserves layout

Avoid making the whole page dynamic when only a small section depends on request-time data.

Keep cached shells and dynamic personalized islands separate.

Short-lived caches can create dynamic holes. Reads with no revalidation or very short expiry should live behind a Suspense boundary, otherwise the route may fail prerendering when Cache Components are enabled.

**Incorrect (short-lived request-time read blocks the whole page):**

```tsx
export default async function Page() {
  const activity = await getLiveActivity()
  return <ActivityPanel activity={activity} />
}
```

**Correct (dynamic section isolated):**

```tsx
export default function Page() {
  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <LiveActivityPanel />
    </Suspense>
  )
}
```

Reference: Next.js Cache Components and Suspense guidance.
