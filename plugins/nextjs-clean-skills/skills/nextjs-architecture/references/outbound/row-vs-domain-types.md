# Row Types Are Not Domain Types

**Impact: HIGH** · **Scope: portable**

A provider row and a product value change for different reasons. Keep the external schema and
mapping in the private adapter that reads it.

Derive selected columns from the row schema, not the domain schema:

```ts
const WorkItemRowSchema = object({
  id: string(), is_priority: boolean(), updated_at: string(),
})
type WorkItemRow = InferOutput<typeof WorkItemRowSchema>

const WORK_ITEM_SELECT = Object.keys(WorkItemRowSchema.entries).join(', ')
const toWorkItem = (row: WorkItemRow): WorkItem => ({
  id: row.id, isPriority: row.is_priority, updatedAt: row.updated_at,
})
```

Explicit selection prevents a migration from silently widening the payload. Mapping prevents
storage names from becoming form, view, or public-contract names.

When a stored function already returns the intentional product shape, parse and use it directly.
Do not add a ceremonial mapping over identical semantics.

The same rule applies to remote request/response bodies and SDK objects. Raw external values never
leave the capability's private server adapter.

Reference: external contracts and product models have independent reasons to change.
