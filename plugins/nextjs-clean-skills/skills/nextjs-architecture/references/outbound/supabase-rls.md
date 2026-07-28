# Supabase And Row-Level Security

**Impact: CRITICAL** · **Scope: stack (Supabase / Postgres)**

Keep Supabase clients inside capability-private `server/` stores or admitted server infrastructure.
Browser UI and application operations do not import the server client.

RLS guardrails:

- enable RLS for user and tenant data;
- pair update `using` with `with check`;
- scope every batch write by actor, tenant, or authoritative parent;
- prefer `security invoker` for caller-scoped functions;
- use `security definer` only when necessary, pin `search_path`, and reproduce scope predicates
  explicitly.

Policies are the last enforcement line, not the only one. Protected capability surfaces verify
identity and business permission, while the store query keeps ownership/tenant predicates.

An authorization-sensitive lookup distinguishes forbidden from missing without exposing protected
existence. Do not turn every refusal into an empty result set.

Escape filter and pattern input once in one tested helper that covers both wildcard and grammar
characters. Escape backslash before characters introduced by later replacements.

Fetch current Supabase documentation for SQL and SSR API syntax.

Reference: Supabase as a private store adapter with defense-in-depth RLS.
