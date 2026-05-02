# Server Data Via RSC Props

For read-heavy UI, fetch in the Server Component and pass serializable props down.

Pattern:

- page/layout calls DAL/read entrypoint
- Client child receives `initialItems`, `total`, `profile`, or DTO props
- Client child owns only interactive UI state

Do not create TanStack Query hooks unless the client must refetch, poll, subscribe, optimistically update, or share cache.
