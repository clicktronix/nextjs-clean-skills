# No Blind User-Specific Cache

Never cache personalized data under broad shared tags.

Bad:

- `cacheTag('work-items')` for per-user rows
- reading cookies inside a cached function

Good:

- `cacheTag(CACHE_TAGS.WORK_ITEMS_FOR_USER(userId))`
- `cacheTag(CACHE_TAGS.TENANT_PROJECTS(tenantId))`
- explicit `userId` or `tenantId` argument

If data visibility depends on auth, include that identity in the cache key and tag strategy.
