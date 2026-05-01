# composeHooks Only For Client Logic

Use `composeHooks(View)(useProps)` for Client Components with logic.

Good cases:
- component uses hooks
- view-model transforms external props
- actions need stable callbacks
- multiple state/data sources feed one View

Skip it for:
- pure Server Components
- pure presentation components
- framework boundary components where hook split breaks lifecycle behavior

Keep the View declarative and side-effect free.
