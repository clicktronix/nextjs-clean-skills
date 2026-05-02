# Avoid TanStack Mutations When Reads Are RSC-Owned

**Impact: HIGH**

In Next.js 16, `revalidateTag` marks tagged RSC/cache data stale for SWR; `updateTag` expires it immediately for read-your-writes. Wrapping either action in `useMutation` only to call `queryClient.invalidateQueries` is redundant unless the read path itself is a TanStack query.

Decision rule:

| Read path | Write path | Mutation hook needed? |
| --- | --- | --- |
| RSC + props from DAL | Server Action with `updateTag(...)` or `revalidateTag(...)` | No — call the action directly |
| TanStack `useQuery` (realtime, polling, infinite, optimistic) | Server Action | Yes — `useMutation` to invalidate the matching query keys |
| Mixed RSC + `useQuery` | Server Action | Yes for the `useQuery` keys only |

If `useMutation` is used only for `invalidateQueries`, that is a sign the read should be RSC props (no client cache to invalidate) or that both reads and writes already live on the same TanStack key (then `useMutation` is justified).

**Incorrect (TanStack mutation only for duplicate invalidation):**

```ts
export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkItemAction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.lists() }),
  });
}
// + dashboard reads via RSC props, no useQuery involved
```

**Correct (call the action directly; Next owns RSC cache tags):**

```ts
"use client";
export function useSubmitWorkItem() {
  const router = useRouter();
  return async (input: CreateWorkItem) => {
    await createWorkItemAction(input); // action calls updateTag/revalidateTag
    router.refresh(); // optional: request a fresh RSC payload immediately after the write
  };
}
```

Notes:

- Use `useMutation` when you need its lifecycle AND a TanStack-owned read path. Otherwise direct invocation + `router.refresh()` for immediate UI refresh, or tag-driven SWR with `revalidateTag`, is simpler.
- Keep cache-tag invalidation in the Server Action itself. Do not duplicate it on the client unless TanStack also owns the read.
- `useTransition` + a plain async call covers progressive submit UX without a TanStack dependency.

Reference: Next.js 16 `revalidateTag`/`updateTag`, React 19 `useTransition`, TanStack Query mutation lifecycle.
