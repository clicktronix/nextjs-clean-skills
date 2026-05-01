# CQRS: Commands vs Reads

Commands mutate state and go through Server Actions or route handlers.

Reads render UI and should go through Server Components plus server-only DAL/read use-cases by default.

Use:
- Server Action for create/update/delete, form submit, workflow transition
- RSC/DAL for dashboards, details, lists, server-rendered pages
- TanStack Query for client-interactive read models

Do not use Server Actions as generic query RPC unless client interactivity requires it.
