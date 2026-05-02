# Avoid TanStack Mutations When Reads Are RSC-Owned

**Impact: HIGH**

Do not wrap a Server Action in `useMutation` only to call `queryClient.invalidateQueries()` when the affected read is owned by RSC cache tags.

Decision rule:

| Read path | Write path | Client mutation hook |
| --- | --- | --- |
| RSC + DAL props | Server Action with `updateTag`/`revalidateTag` | Not needed |
| TanStack `useQuery` | Server Action/API | Use `useMutation` |
| Mixed ownership | Server Action/API | Invalidate TanStack keys only |

**Incorrect (duplicate invalidation for an RSC-owned read):**

```ts
return useMutation({
  mutationFn: createWorkItemAction,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.lists() }),
})
```

**Correct (Next owns the RSC cache tags):**

In a `'use client'` module with `useRouter` and `useTransition` imports:

```tsx
export function useSubmitWorkItem() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const submit = (input: CreateWorkItem) => startTransition(async () => {
    await createWorkItemAction(input) // calls revalidateTag/updateTag inside
    router.refresh()
  })
  return { isPending, submit }
}
```

Use TanStack mutations when the read path itself is a TanStack query, or when optimistic lifecycle is attached to TanStack-owned data. Otherwise direct action call plus tag invalidation is simpler. If the Server Action itself calls `refresh()` from `next/cache`, do not also call `router.refresh()` unless the target repo intentionally wants both refresh points.

Reference: Next.js `revalidateTag`/`updateTag`; TanStack Query mutation lifecycle.
