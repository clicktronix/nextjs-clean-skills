# Return DTOs, Not Raw Rows

Raw database rows often contain fields the UI should not see.

At outbound/DAL boundaries:
- map rows to domain objects or DTOs
- validate external payloads with schemas
- strip internal IDs, service flags, provider metadata, and secrets
- normalize nullable and optional fields

Server Components can still leak values through RSC payloads. Treat any prop passed to UI as client-visible unless proven otherwise.
