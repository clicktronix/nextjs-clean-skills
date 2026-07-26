# Dependency Categories

**Impact: CRITICAL** · **Scope: portable**

Classify every external dependency before deciding whether it gets a port. The category decides, not the layer you happen to be editing.

| Category | Example | Local stand-in | Port |
| --- | --- | --- | --- |
| in-process | pure calculation, formatting | not needed | no |
| local-substitutable | a database engine started from checked-in migrations | the real engine, locally | no |
| remote but owned | a service your team ships, reached over the network | fake server or in-memory adapter | yes |
| true external | third-party API you do not control | mock | yes |

Second condition on top of the category: **one adapter is a hypothetical seam, two is a real one.** Count adapters that exist today — production plus test. "We might swap the database later" is not an adapter.

A port whose only second implementation is a test mock is the shortcut Ports-and-Adapters explicitly warns against: the goal is running the application isolated, not substituting a mock. When the real engine already runs locally, the port hides your own SQL instead of an external system, and a green suite can sit on a broken query, a wrong policy, or a drifted column list.

Ports are meant to be few. Expect two to four across an application, not one per table.

**Incorrect (port over a locally substitutable engine):**

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

Reference: Cockburn's Ports and Adapters — a port is a purposeful conversation with something outside the process.
