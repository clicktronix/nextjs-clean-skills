# RSC Reads Default, TanStack Opt-In

Default read path:
- Server Component awaits DAL/read use-case
- result is passed as serializable props to Client children

Use TanStack Query only for client-owned behavior:
- realtime subscriptions
- polling or progress updates
- optimistic updates
- infinite scroll
- client-side filters that should not navigate
- shared client cache across islands

Do not create `ui/server-state` just because data came from a server.
