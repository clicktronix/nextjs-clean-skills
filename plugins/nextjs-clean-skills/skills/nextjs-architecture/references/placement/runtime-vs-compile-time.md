# Runtime And Compile-Time Boundaries

**Impact: HIGH** · **Scope: stack (Next.js)**

Runtime calls and compile-time imports are different graphs.

```text
RSC route -> capability rsc surface -> private server composition -> store
Client -> capability action surface -> private server composition -> store
Browser read -> GET Route Handler -> capability server surface
Route Handler -> capability stream surface -> application operation -> provider adapter
Worker -> capability job surface -> application operation -> provider adapter
```

At compile time:

- `app/**` imports module root surfaces, not internals;
- application code imports port types but not concrete adapters;
- adapters implement dependencies and are supplied by a public runtime surface;
- browser code imports only browser-safe surfaces and exact Server Actions;
- server/client poisoning must fail a production build.

The fact that runtime reaches a concrete adapter does not permit application code to import it.

Server Components call server code directly, not their own Route Handler over HTTP. Server Actions
are UI mutation boundaries. Browser reads use `GET` or streams because Server Actions are queued and
introduce sequential data fetching.

Reference: App Router runtime channels over capability-owned compile-time boundaries.
