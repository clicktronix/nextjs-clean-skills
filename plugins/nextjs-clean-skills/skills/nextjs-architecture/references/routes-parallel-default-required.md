# Parallel Routes Need Defaults

Every parallel route slot should have a `default.tsx` unless every navigation state is explicitly handled.

For modal slots:
```text
app/dashboard/@modal/default.tsx
app/dashboard/@modal/(.)items/[id]/page.tsx
```

`default.tsx` should usually return `null`.

Missing defaults cause unmatched slot states and brittle navigation behavior.
