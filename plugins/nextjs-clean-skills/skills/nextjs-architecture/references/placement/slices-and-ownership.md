# Slices And Ownership

**Impact: HIGH** · **Scope: portable**

Place non-trivial code with three independent answers:

```text
scope: narrowest actual consumer set
slice: business capability that owns the behaviour
layer: technical responsibility the file performs
```

The repository is the default product boundary, not the default reuse breadth. Inside it, choose
among one route, one capability, or repository-wide consumers. Scope says who may consume the
implementation; slice says who owns it. Broader product or business-line scopes exist only when
independently shipped consumers make that reuse contract real.

A slice is a capability — work items, campaigns, chat — and uses one name across its layers:

```text
domain/work-item · use-cases/work-items · data/work-items
adapters/inbound/…/work-items · client-cache/work-items · app/…/work-items
```

Rules that keep ownership meaningful:

- a slice does not import another slice's internals; it reaches the published `operations/**` surface
- shared meaning moves into `domain/**`
- a generic abstraction is not a substitute for choosing an owner
- a shared technical helper belongs to a layer, not to a business slice
- `lib/**` is a migration bucket, never a destination

When behaviour belongs to two existing capabilities, first ask whether it names a third capability.
Pure shared meaning moves into domain; application composition receives its own operation and entry.

Slice isolation is **convention, not enforced by the portable lint**. Layer rules do not know project
slice names. A strict project adds one resolved zone per slice and an inventory check so a new slice
cannot appear without a zone.

If scope, slice, or layer is unclear, resolve it before creating the file. Search should find an
implementation, not compensate for structure with no owner.

Reference: reuse scope and vertical capability ownership across horizontal responsibilities.
