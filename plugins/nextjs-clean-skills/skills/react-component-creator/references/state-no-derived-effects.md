# Do Not Derive State With Effects

Avoid `useEffect` for values that can be calculated from props or state.

Prefer:

- direct calculation for cheap values
- `useMemo` for expensive derived values
- Server Component calculation when the value is server-only

Bad:

- `useEffect(() => setFullName(first + last), [first, last])`

Derived state stored separately creates sync bugs.
