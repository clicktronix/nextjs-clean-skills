# Security, Capability Surfaces, And Auth

**Impact: CRITICAL** · **Scope: stack (Next.js)**

Proxy, middleware, layouts, and hidden UI do not authorize data. Every protected outer channel
authenticates the caller. A trusted `server.ts` composition surface accepts established explicit
identity and rechecks its capability policy.

Enforcement layers:

1. `rsc.ts`, `actions.ts`, Route Handler, stream, or job establishes identity and transport scope;
2. domain/application policy enforces business permission and authorization consequences;
3. private store or RLS enforces tenant and ownership predicates.

Rules:

- derive actor, role, tenant, and price/ownership data on the server;
- treat each Server Action as a public HTTP entrypoint;
- pass established identity and scope into trusted `server.ts` and private store functions; those
  functions do not rediscover the current user through an auth provider;
- keep secrets and service-role clients in server-only modules;
- return stable public values, not provider rows;
- accept post-login redirects only as validated same-origin paths;
- cap user arrays, batch sizes, and free-form strings at the channel schema.

Client validation and bound/hidden form fields are not authority. TypeScript argument types are not a
runtime barrier.

Use `server-only` on trusted server surfaces and verify with a production build.

Reference: Next.js per-entrypoint authorization with capability and store defense in depth.
