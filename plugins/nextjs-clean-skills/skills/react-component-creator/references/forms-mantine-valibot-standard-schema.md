# Mantine + Valibot Through Standard Schema

**Impact: HIGH**

Valibot implements Standard Schema, so form validators should avoid stale Valibot-specific generic types.

Use a small adapter that accepts a Standard Schema-compatible validator and returns Mantine field errors.

Keep the adapter synchronous unless the target form explicitly supports async validation.

**Incorrect (validator tied to one validator library version):** a shared Mantine helper that accepts an internal schema type from one validator package.

**Correct (accept a Standard Schema-compatible contract):**
```ts
export function createMantineValidator<T>(schema: StandardSchemaV1<unknown, T>) {
  // map schema['~standard'].validate(values) issues to Mantine field errors
}
```

If the target project already has a `createMantineValidator` helper, use it instead of rewriting one. Add this adapter only when the project lacks a shared form validation bridge.

Reference: Standard Schema v1 and Valibot Standard Schema support.
