# Mantine + Valibot Through Standard Schema

**Impact: HIGH**

Valibot implements Standard Schema, so form validators should avoid stale Valibot-specific generic types.

Use a small adapter that accepts a Standard Schema-compatible validator and returns Mantine field errors.

Keep the adapter synchronous unless the target form explicitly supports async validation.

**Incorrect (validator tied to an old Valibot generic):**
```ts
function createMantineValidator<T>(schema: BaseSchema<T, T, unknown>) {
  return valibotResolver(schema)
}
```

**Correct (accept a Standard Schema-compatible contract):**
```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

export function createMantineValidator<T>(schema: StandardSchemaV1<unknown, T>) {
  return (values: unknown) => {
    const result = schema['~standard'].validate(values)
    if (result instanceof Promise) throw new Error('Use sync schemas for Mantine validate')
    if (!result.issues) return {}
    return Object.fromEntries(result.issues.map((issue) => [pathToName(issue.path), issue.message]))
  }
}
```

```ts
function pathToName(path: StandardSchemaV1.Issue['path']) {
  return (path ?? [])
    .map((part) => (typeof part === 'object' && part !== null ? part.key : part))
    .filter((part) => part !== undefined)
    .map(String)
    .join('.')
}
```

If the target project already has a `createMantineValidator` helper, use it instead of rewriting one. Add this adapter only when the project lacks a shared form validation bridge.

Reference: Standard Schema v1 and Valibot Standard Schema support.
