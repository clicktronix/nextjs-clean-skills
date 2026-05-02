# Server Prefetch And Hydration

**Impact: MEDIUM**

Use server prefetch + `HydrationBoundary` only when a Client Component must continue owning the query.

Good cases:

- infinite list that loads more client-side
- realtime or polling view
- optimistic mutations that update the same query cache

Avoid it for static/read-heavy pages. In those cases, fetch in the Server Component and pass props.

Keep `QueryClient` creation request-scoped on the server and singleton-safe on the browser.

**Incorrect (HydrationBoundary for static read-only content):**

```tsx
export default async function Page() {
  await queryClient.prefetchQuery(workItemQuery())
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WorkItems />
    </HydrationBoundary>
  )
}
```

**Correct (RSC props for read-heavy content):**

```tsx
export default async function Page() {
  const items = await listWorkItemsForCurrentUser()
  return <WorkItemsDashboard initialItems={items} />
}
```

Reference: TanStack Query hydration and Next.js Server Components.
