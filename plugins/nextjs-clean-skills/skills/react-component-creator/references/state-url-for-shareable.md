# Use URL For Shareable State

Put state in the URL when it should survive reloads or be shareable.

Good URL state:
- search query
- filters
- sorting
- pagination
- selected tab when it changes content meaningfully

Use router/search params in Server Components or client navigation helpers. Do not hide shareable state in Zustand or local component state.
