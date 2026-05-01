# Keep Client Trees Minimal

Add `'use client'` at the smallest component boundary that needs it.

Client-only reasons:
- event handlers
- `useState`, `useEffect`, `useMemo`, refs, timers
- browser APIs
- TanStack Query or Zustand
- Mantine `useForm`
- client i18n hooks

Wrap only the interactive island, not the whole page.
