# Domain Is Pure

Domain files contain schemas, inferred types, invariants, and pure helpers.

Do:
- import only same-domain files or validation primitives such as Valibot
- parse external shapes into domain types at boundaries
- keep names business-oriented

Do not:
- import Next.js, React, Supabase, TanStack Query, adapters, infrastructure, or UI
- read environment variables, cookies, headers, dates, clocks, or network state directly
- encode request/session details as domain rules
