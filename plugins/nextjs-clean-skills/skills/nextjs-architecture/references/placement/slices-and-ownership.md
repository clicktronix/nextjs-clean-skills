# Slices And Ownership

**Impact: HIGH** · **Scope: portable**

Layers answer what kind of responsibility code has. Slices answer which capability owns it. Both questions must be answered before a file is created; a correct layer with no owner produces code nobody can find.

A slice is a business capability — work items, campaigns, chat — and it usually spans several layers:

```text
domain/work-item · use-cases/work-items · data/work-items
adapters/inbound/…/work-items · client-cache/work-items · app/…/work-items
```

Rules that keep slices meaningful:

- one name for the capability, spelled identically in every layer
- a slice does not import another slice's internals; shared meaning moves down into `domain`
- do not invent a generic abstraction to avoid choosing an owner
- a shared technical helper is not a slice; it belongs to a layer

When behaviour genuinely belongs to two capabilities, it belongs to neither: extract the concept both depend on into `domain` and let each slice use it. Copying it into both is how two rules that were once identical quietly diverge.

Route-private code lives under the owning route segment rather than in a shared folder. Anything under a route's private folder is invisible to other routes by convention; when a second route needs it, that is the signal to move it into a slice, not to import across.

This project has one reuse level: the product is the repository. Do not introduce cross-product or cross-business-line tiers — the taxonomy only pays for itself when several products ship from one tree, and without them it adds a placement question with no correct answer.

A helper that belongs to no capability belongs to a layer, not to a `lib/**` bucket: `infrastructure` for env, auth, logging, and cache support; `ui` for browser bridges; `domain` for pure rules. A repository that already has `lib` treats it as a migration bucket, never a destination.

Before creating a file, hold both answers:

```text
slice: which capability owns this behaviour
layer: which responsibility this code has
```

If either is unclear, resolve it first. A file placed under an unclear owner is found later by search, not by structure, and the next change adds a second copy somewhere else.

Reference: vertical capability ownership crossing horizontal responsibilities.
