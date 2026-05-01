# composeHooks Generic Order

When external props differ from view props, pass generics explicitly.

```ts
export const WorkItemsList = composeHooks<WorkItemsListViewProps, WorkItemsListProps>(
  WorkItemsListView
)(useWorkItemsListProps)
```

The hook receives external props automatically. Do not manually pass every prop from component to hook.

Order hook internals by dependency: server-state, local/page state, actions, derived labels.
