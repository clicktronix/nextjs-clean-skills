# Enable Cache Components Explicitly

**Impact: HIGH**

For Next.js 16 Cache Components, set:

```ts
const nextConfig = {
  cacheComponents: true,
}
```

Use Cache Components for stable server reads with explicit inputs.

Do not combine `cacheComponents` with old experimental cache/PPR flags. Treat `cacheComponents: true` as the single switch for the current model.

Do not cache:
- request-specific values read implicitly inside the cached function
- authorization checks that depend on mutable session state
- personalized data without user/tenant-scoped cache tags

Reference: Next.js Cache Components configuration.
