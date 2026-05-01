# No Namespace Object Exports

Avoid component namespaces built from object literals.

Bad:
```ts
export const Table = { Root, Header, Row }
```

Prefer direct exports from concrete component files.

This avoids confusing Server Component bundling and keeps imports easy for boundary linting.
