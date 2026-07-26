# Validate Once Per Trust Boundary

**Impact: HIGH** · **Scope: portable**

Three checks belong in a write path, and they are three different checks. Running one schema twice is not defence in depth; it is duplication that hides which line is authoritative.

| Boundary | What it establishes |
| --- | --- |
| inbound adapter | who is calling, and that the transport payload is well-formed |
| boundary declaration | the application's input and output contract |
| data module or outbound adapter | that external data matches the shape it promised |

Inbound owns authorization and transport decoding: search params, form data, multipart, request body. It does not re-run the application schema — the boundary does that with the schema declared next to the use-case.

Whichever module reads the store or the service parses what comes back, because that shape is owned elsewhere and can change without notice.

**Incorrect (same schema twice, twenty lines apart):**

```ts
const createItemAction = withAuthorization(
  parseWith(CreateItemSchema, (ctx, input) => createItem(ctx, input)),
)
// and again, inside the use-case
const validated = parse(CreateItemSchema, input)
```

**Correct (each boundary checks its own concern):**

```ts
const createItemAction = withAuthorization((ctx, payload: unknown) =>
  createItem(ctx, payload),
)
```

`withAuthorization` establishes who is calling; `createItem`'s wrapper parses its declared schema once and returns a typed failure the entry point hands back.

If the stack's action helper insists on owning input parsing, that helper *is* the declared schema — then the use-case does not re-declare it. Declare once; which boundary holds the declaration is a stack detail.

When a slice has no use-case — the path is a single effect with no rule to hold — the inbound adapter declares the boundary with the same wrapper, around the data call. Input and output schemas, failure normalisation, redaction, and single-report telemetry all still apply; what is absent is the scenario, not the contract.

Client-side validation is for feedback only and is never authority. The server re-checks with the same declared schema regardless of what the form did.

Ad-hoc assertions scattered through application code — an id format checked at the top of every function — are a symptom of a missing declared input schema. Move the rule into the schema so it is enforced in one place and reported uniformly.

Reference: trust boundaries, not layers, decide where validation belongs.
