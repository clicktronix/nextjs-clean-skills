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

```ts
export function useSubmitWorkItem() {
  return async (input: CreateWorkItem) => {
    await createWorkItemAction(input)
    router.refresh()
  }
}
```

Use TanStack mutations when the read path itself is a TanStack query, or when optimistic lifecycle is attached to TanStack-owned data. Otherwise direct action call plus tag invalidation is simpler.

Reference: Next.js `revalidateTag`/`updateTag`; TanStack Query mutation lifecycle.
