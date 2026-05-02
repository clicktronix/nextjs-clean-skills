# Context First, Zustand Last

**Impact: HIGH**

For state shared across client islands, default to React Context. Reach for Zustand only when Context demonstrably cannot meet the need; do not introduce Zustand to satisfy an aesthetic preference.

Context fits when:

- the state is read by a small-to-medium subtree
- the state changes infrequently or you can split it into stable + volatile providers
- you want zero new dependencies and React-native semantics (Suspense, hydration, RSC props as initial value)

Reach for Zustand only when at least one is true:

- a measured Context re-render is the bottleneck and split-providers/`useMemo` cannot fix it
- you need devtools, persistence middleware, or selectors that subscribe to a slice without rerendering the rest
- the same store must be shared across many unrelated subtrees and lifting Provider up is impractical

Do not pick Zustand because "stores feel cleaner". Context with split providers handles most product UI. Most real-world performance fears about Context disappear when you split the volatile state into its own provider and memoize value objects.

**Incorrect (Zustand for state two siblings could share via Context):**

```ts
const useFiltersStore = create(() => ({ status: "all", sort: "recent" }));
```

**Correct (Context with stable + volatile split):**

```tsx
const FiltersCtx = createContext<Filters | null>(null);
const SetFiltersCtx = createContext<((f: Filters) => void) | null>(null);
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>({ status: "all" });
  return (
    <SetFiltersCtx.Provider value={setFilters}>
      <FiltersCtx.Provider value={filters}>{children}</FiltersCtx.Provider>
    </SetFiltersCtx.Provider>
  );
}
```

Notes:

- Server Components can compute the initial value and pass it to the Provider as a prop; the Provider stays the only `'use client'` boundary.
- If many consumers read different slices, split into multiple context providers rather than one fat one.
- Server data still belongs in TanStack Query / RSC props, not Context. Context is for UI/auth/locale/theme — not for query results.

Reference: React Context patterns; React 19 `use(Context)` API.
