# Styling And i18n

**Impact: MEDIUM**

Styling and text follow project conventions so components stay consistent and replaceable.

Styling order:

1. Mantine props and theme tokens.
2. CSS Modules for custom layout/visual rules.
3. Inline style only for truly dynamic numeric values that cannot be expressed otherwise.

Do not hardcode hex colors in components. Do not use inline styles for static layout. Do not create custom wrappers when a Mantine primitive already fits.

i18n boundary:

- user-facing text goes through the project i18n layer.
- Server Components may resolve server translations.
- Client Components use the project client text component/hook.
- accessibility and hidden user-facing attributes are text too: `aria-label`, `title`, `placeholder`, tooltip labels, and image `alt` must be formatted through i18n. Do not use `descriptor.defaultMessage` as the rendered value.
- proxy may seed locale cookies; UI should not parse `Accept-Language`.

This file is not library API documentation. Fetch current Mantine and i18n docs for syntax. The project rule is consistency: no hardcoded user text, no ad hoc styling system.

Reference: project UI convention for styling and translation boundaries.
