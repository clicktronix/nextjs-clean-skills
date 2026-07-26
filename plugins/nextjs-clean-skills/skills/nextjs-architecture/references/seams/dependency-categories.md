# Dependency Categories

**Impact: CRITICAL** · **Scope: portable**

Decide whether a dependency gets a port before deciding where its code lives. A database is external infrastructure even when it runs on your laptop — that much is canonical. What does not follow is that being external earns a port.

Four questions, in order:

1. Must the scenario run independently of this particular technology or device?
2. Does the contract read as a purposeful conversation in the application's language — not a table's CRUD, not an SDK's method list?
3. Is there a real consumer and a production implementation today?
4. If all three hold, declare the port. A test adapter counts as an adapter; production variation is not required.

**Adapter count is evidence, not a gate.** A third-party payment provider usually has exactly one production implementation and still needs a port: the isolation is the point, not the swapping. **Repository-per-table is blocked by question 2** — six methods mirroring six table operations is not a conversation in the application's language, whatever it is named.

| Dependency | Default |
| --- | --- |
| pure calculation, formatting | no port |
| an engine that runs locally from checked-in migrations | no port — a module in `data/` |
| a service your team ships, reached over the network | port |
| third-party API you do not control | port |

The local-engine row is a **default, not a ban**: a scenario that must run without the store answers question 1 with yes. What the default buys is measured — when a substitute stands in for your own queries, a green suite sits on a broken filter, a wrong policy, or a drifted column list. A port over a local engine still needs integration tests against the real one.

**Incorrect (a table's methods, renamed):**

```ts
export type WorkItemsRepository = {
  list; getById; create; update; archive; restore
}
```

**Correct (module boundary, no port) — lives in `data/<slice>`, not `adapters/outbound`:**

```ts
export async function listWorkItems(ctx: DataContext, params: ListParams): Promise<WorkItemPage>
export async function saveWorkItem(ctx: DataContext, edit: WorkItemEdit): Promise<WorkItem>
```

`ctx` carries the request-scoped client and caller identity. Naming matters: an adapter satisfies a port, so a module with no port is not one.

Reference: a port is a purposeful conversation with something outside the process — Cockburn's definition. When one is *required* is our own criterion.
