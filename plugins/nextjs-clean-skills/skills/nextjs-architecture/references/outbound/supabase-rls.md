# Supabase And Row-Level Security

**Impact: CRITICAL** · **Scope: stack (Supabase / Postgres)**

Keep Supabase clients inside capability-private `server/` stores or admitted server infrastructure.
Browser UI and application operations do not import the server client.

Do not hide two security models behind one client factory.

- User-scoped request: publishable/anon key plus cookies; derive the client and verified actor from
  that same session. RLS and explicit capability/store checks apply.
- Privileged task: secret/service-role key in a separate server-only factory; require explicit
  trusted actor, scope, reason, and query predicates because the key can bypass RLS.

For server authorization:

- `getSession()` reads raw session tokens from storage; do not trust its embedded user for
  authorization;
- `getClaims()` verifies the JWT and is suitable for proxy-level identity decisions;
- `getUser()` verifies with the Auth server and is appropriate when that network-confirmed user is
  required.

Follow the current SSR guide for refresh. In Proxy, copy every cookie and cache header returned by
`setAll`; dropping cache headers can let a CDN cache refreshed auth cookies.

RLS guardrails:

- enable RLS for user and tenant data;
- configure table/function grants explicitly; RLS and grants are separate checks;
- pair update `using` with `with check`;
- scope every batch write by actor, tenant, or authoritative parent;
- prefer `security invoker` for caller-scoped functions;
- use `security definer` only when necessary, outside exposed schemas, with `search_path = ''`,
  schema-qualified objects, revoked default execute, and narrow grants;
- set secure default privileges in migrations so a future table or function is not accidentally
  exposed.

Policies are the last line, not the only one. Capability surfaces verify identity and business
permission; store queries keep ownership/tenant predicates.

Distinguish forbidden from missing without exposing protected existence.

Escape filter input once in one tested helper; escape backslash before later replacements.

Sources: [SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
[RLS and API security](https://supabase.com/docs/guides/api/securing-your-api),
[functions](https://supabase.com/docs/guides/database/functions).

Reference: Supabase as a private store adapter with explicit identity mode, grants, and
defense-in-depth RLS.
