# Capability Ownership And Public Surfaces

**Impact: CRITICAL** · **Scope: portable**

Name the capability before creating files. A capability owns product vocabulary and policy, not a
page, table, transport, or provider.

```text
src/modules/work-items/
src/modules/labels/
src/modules/board/
```

Rules:

- one capability is discoverable under one root;
- route-private framework and UI glue stays under `app/**`;
- cross-capability consumers use narrow root public surfaces;
- a public surface narrows internals, strengthens a contract, or establishes a runtime boundary;
- a one-to-one rename or re-export is not a facade;
- broad `lib`, `utils`, and `services` directories are migration buckets, not destinations.

When behavior uses several capabilities, apply the deletion test. If removing the coordinating code
moves filtering, grouping, authorization consequences, projection, transaction intent, or
sequencing into the route, create an orchestrating capability.

The orchestrator owns dependencies in its own language. Private adapters call source capabilities'
public `server.ts` surfaces. Those trusted surfaces accept explicit identity, enforce source
capability policy, and remain silent so the orchestrating channel owns unexpected-error reporting.
Source capabilities do not import the orchestrator or one another.

Sequence calls when a later input depends on an earlier result. Authorization-sensitive joins use a
complete non-enumerating result for visible, missing, and forbidden references; do not silently omit
a reference when policy requires rejection.

Reference: product capability is the physical ownership boundary; runtime-specific root files are
its published contract.
