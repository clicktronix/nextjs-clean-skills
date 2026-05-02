# Match The Store To Update Frequency

**Impact: HIGH**

Pick a client store by **how often state changes**, not by aesthetic preference.

| State pattern | Default | Why |
| --- | --- | --- |
| Static config (theme, locale, auth status, feature flags) | React Context | Rarely re-renders; zero dependency; native Suspense/RSC initial value |
| Dynamic app state with frequent updates (cart, multi-select 50+ items, drawer coordination, notifications, real-time UI) | Local state, then split Context; Zustand only after measurement | Per-slice subscriptions can help, but the extra dependency needs evidence |
| State already in URL or server | URL search params / RSC props / TanStack Query | Not a client store concern |

Context re-renders **every consumer** when the provider value changes. With static data this is fine; with frequent updates it can become a measurable bottleneck. Zustand's `useStore(selector)` subscribes only to the selected slice, but it is an opt-in optimization, not the starting point.

Start with local state and explicit props. If several client islands need the same UI state, use Context for stable data and split volatile state into a smaller provider. Reach for Zustand when profiling shows Context churn or when middleware such as persistence/devtools is a real requirement.

**Incorrect (Context for hot dynamic state):**

```tsx
const CartContext = createContext<Cart | null>(null);
// every cart update re-renders every CartContext consumer
```

**Correct (Zustand only after measured hot state):**

```tsx
export const useCartStore = create<CartState>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
}));
const itemCount = useCartStore((s) => s.items.length);
```

**Correct (Context for static config):**

```tsx
export const ThemeContext = createContext<Theme>("dark");
```

Notes:

- Server Components can compute the initial value and pass it to a Provider/store as a prop; the Provider stays the only `'use client'` boundary.
- Server data still belongs in TanStack Query / RSC props, not Context or Zustand.
- Avoid mixing both for the same slice (e.g. cart in Context AND Zustand) — pick one owner.

Reference: React Context patterns; Zustand selectors and subscriptions.
