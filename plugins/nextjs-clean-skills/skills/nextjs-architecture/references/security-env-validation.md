# Validate Environment Variables

Centralize environment access.

Pattern:
- `src/infrastructure/env/server.ts` validates server-only variables at module load
- `src/infrastructure/env/client.ts` exposes only safe `NEXT_PUBLIC_*` variables
- use Valibot or another schema validator
- forbid direct `process.env` outside env modules with lint rules

Never prefix secrets with `NEXT_PUBLIC_`. Service role keys must be imported only from server-only modules.
