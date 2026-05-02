# No Client Hooks In RSC

Server Components cannot use client hooks.

Do not use:

- `useState`, `useEffect`, `useMemo`, `useCallback`
- TanStack Query hooks
- Zustand hooks
- Mantine `useForm`
- browser refs or event handlers

Use async server data directly in the Server Component, then pass data into Client children.
