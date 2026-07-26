# Dependency Categories

**Impact: CRITICAL** · **Scope: portable**

Classify every external dependency before deciding whether it gets a port. The category decides, not the layer you happen to be editing.

| Category | Example | Local stand-in | Port |
| --- | --- | --- | --- |
| in-process | pure calculation, formatting | not needed | no |
| local-substitutable | a database engine started from checked-in migrations | the real engine, locally | no |
| remote but owned | a service your team ships, reached over the network | fake server or in-memory adapter | yes |
| true external | third-party API you do not control | mock | yes |

A database is external infrastructure even when it runs on your laptop. What does not follow — and this is our judgement, not canon — is that being external earns a port. A port is earned when the core has to state a capability independently of the technology behind it.

Second condition: a seam only counts if something varies across it. **One adapter is hypothetical, two is real.** Count what exists today, production plus test. "We might swap the database later" is not an adapter.

Ports-and-Adapters treats an in-memory mock as a legitimate adapter, and calls the number of ports a matter of intuition with no particular damage in getting it wrong. The narrower rule here is ours and rests on what we measured: when the real engine already runs locally, a port per table hides our own SQL, and a green suite sits on a broken query, a wrong policy, or a drifted column list.

**Incorrect (port over an engine that already runs locally):**

```ts
export type WorkItemsRepository = {
  list; getById; create; update; archive; restore
}
```

Six methods, six one-line forwards, and the tests now exercise a fake instead of the database.

**Correct (module boundary, no port) — lives in `data/<slice>`, not `adapters/outbound`:**

```ts
export async function listWorkItems(ctx: DataContext, params: ListParams): Promise<WorkItemPage>
export async function saveWorkItem(ctx: DataContext, edit: WorkItemEdit): Promise<WorkItem>
```

`ctx` carries the request-scoped client and caller identity. Tests run against the local engine. Naming matters: an adapter satisfies a port, so a module with no port is not one.

Exception: a scenario that orchestrates several sources and must run without the database defines narrow ports named for the role it needs, not for a table.

Reference: a port is a purposeful conversation with something outside the process — Cockburn's definition. When one is *required* is our own criterion.
