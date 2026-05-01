# Server To Client Props Are Serializable

Props crossing from Server Components to Client Components must be serializable.

Pass:
- strings, numbers, booleans, arrays, plain objects, null
- DTOs with sensitive fields stripped

Do not pass:
- functions
- class instances
- database clients
- Date objects unless normalized
- secrets or service metadata

Assume Client Component props are visible to the browser.
