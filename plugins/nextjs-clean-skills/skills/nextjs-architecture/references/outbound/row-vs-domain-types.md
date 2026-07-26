# Row Types Are Not Domain Types

**Impact: HIGH** · **Scope: portable**

A stored row and a business concept change for different reasons. Keep two shapes and one mapping between them, inside whichever module owns the read — a data module, or an outbound adapter when a port is warranted.

Deriving the column list from a schema is the right instinct — it stops the selected columns from drifting away from what the code expects. Derive it from the **row** schema, not the domain schema.

**Incorrect (business shape dictates the query):**

```ts
const SELECT = Object.keys(WorkItemSchema.entries).join(', ')
```

Storage naming now propagates upward: field names from the table reach view models, form fields, and public payloads, and renaming a column becomes a UI change.

**Correct (row shape owns the query, mapping owns the translation):**

```ts
export const WorkItemRow = object({
  id: string(), title: string(), is_priority: boolean(), updated_at: string(),
})
export const WORK_ITEM_SELECT = Object.keys(WorkItemRow.entries).join(', ')

export const toWorkItem = (row: InferOutput<typeof WorkItemRow>): WorkItem => ({
  id: row.id, title: row.title, isPriority: row.is_priority, updatedAt: row.updated_at,
})
```

Drift protection is intact, and the domain type is free to name things as the business does.

Keep explicit column selection on read paths so a migration cannot silently widen a payload.

Where a stored function already returns the business shape, parse it and return it — no second type is needed. This rule bans deriving storage details from the domain schema; it does not demand a mapping layer over every call.

The same applies at the other seam: an external service's request and response bodies get their own types next to the adapter. Reuse a domain type only for a field that genuinely is that concept.

Raw rows and raw response bodies never leave the module that read them. What crosses is a parsed, mapped value.

Reference: the external contract and the internal model change for different reasons.
