# Capability Granularity

**Impact: HIGH** · **Scope: portable**

### Capability Boundary Gate

A capability serves a coherent product goal and owns its vocabulary, policy, and lifecycle. Do not
use tables or CRUD screens as the default module inventory. Related reference entities remain inside
the capability they support when they share the same actor goal, authorization policy, lifecycle,
and change authority.

Split a module only when at least one boundary is real now:

1. a distinct actor goal or business outcome;
2. independent business policy or authorization consequences;
3. an independent lifecycle or change owner;
4. a public contract narrower and more stable than shared internals.

CRUD operations, a dedicated table, route, provider, or repeated role check do not satisfy the gate
by themselves. Size and file count are warning signals, not boundary tests. For example, price types
and price categories normally belong to one pricing-taxonomy capability unless the product gives
them independent workflows or policy.

**Verification: review-only.** Name the actor goal, business outcome, policy, lifecycle, change
authority, and public contract used to keep or split the concepts. Reject a boundary justified only
by tables, CRUD, routes, providers, or file count. Path rules can protect the selected ownership
boundary; they cannot infer it from code.
