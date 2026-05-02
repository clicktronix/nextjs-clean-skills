# Proxy Is Not The Auth Boundary

In Next.js 16, use `proxy.ts` for request interception concerns such as session refresh, redirects, and coarse routing.

Do not rely on proxy/middleware as the only protection for data.

Reason:

- data can be accessed through Server Actions, Route Handlers, RSC payloads, and direct server calls
- bypass bugs or misconfigured matchers should not expose data

Protected data access must re-check auth/authz in DAL, inbound adapters, or use-cases.
