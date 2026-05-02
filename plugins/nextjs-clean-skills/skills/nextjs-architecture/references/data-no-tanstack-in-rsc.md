# No TanStack Query In RSC

**Impact: HIGH**

Server Components do not use `useQuery`, `useMutation`, or QueryClient hooks.

Instead:

- await server-only DAL/read functions directly
- use Suspense boundaries around async children
- pass serializable data to Client Components

If a Server Component imports `@tanstack/react-query`, move that logic into a Client Component or remove the client cache entirely.

**Incorrect (query hook in Server Component):**

```tsx
export default function Page() {
  const { data } = useQuery(workItemQuery())
  return <WorkItems items={data} />
}
```

**Correct (await server read):**

```tsx
export default async function Page() {
  const items = await listWorkItemsForCurrentUser()
  return <WorkItems items={items} />
}
```

Reference: Next.js Server Components and TanStack Query hooks.
