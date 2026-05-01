# No Barrel Index Files

Do not create `index.ts` files that only re-export modules.

Allowed:
- `Component/index.tsx` containing the actual component implementation

Not allowed:
- `components/index.ts`
- `feature/index.ts`
- route-local barrels that hide `_internal` imports

Import concrete modules directly to keep boundaries visible.
