# Stack Substitutions Preserve Roles

Libraries can change; layer roles cannot.

Examples:

- Supabase repository may become Prisma, Drizzle, REST, GraphQL, or a queue adapter.
- Valibot may become another Standard Schema validator.
- TanStack Query may be absent when RSC reads are enough.
- Mantine may be replaced by another component system.

Do not remove:

- pure domain
- use-case ports
- inbound composition boundaries
- outbound implementation boundaries
- server-only auth/data access for protected reads

When adapting to a target repo, map equivalents before inventing new folders.
