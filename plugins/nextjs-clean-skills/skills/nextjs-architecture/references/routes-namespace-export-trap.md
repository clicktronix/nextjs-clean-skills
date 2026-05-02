# Avoid Namespace Export Traps

Do not use object-literal namespace exports for component modules consumed by Server Components.

Avoid:

```ts
export const WorkItem = { Card, Modal, List }
```

Prefer direct named exports from the component file:

```ts
export function WorkItemCard() {}
```

Also avoid barrel `index.ts` re-export files. Import from concrete modules to keep boundaries and bundling clear.
