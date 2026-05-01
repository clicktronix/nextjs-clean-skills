# Feature Build Order

Build feature slices from stable business concepts toward UI.

Order:
1. Domain schema, inferred types, pure rules.
2. Use-case ports and use-case functions.
3. Outbound adapter implementation.
4. Inbound Server Action or route handler for commands.
5. Server-only DAL/read entrypoint for read-heavy RSC reads, or `ui/server-state` for client-interactive reads.
6. UI components and route entrypoints.
7. Tests at the layer where behavior lives.

Starting in UI is acceptable only for purely presentational changes.
