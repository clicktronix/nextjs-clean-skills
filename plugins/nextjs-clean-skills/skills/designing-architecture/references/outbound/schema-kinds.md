# Schema Kinds

**Impact: HIGH** · **Scope: portable**

Infer a TypeScript type from the schema that actually witnesses its values. Input, product and
provider contracts have different authorities; reuse a schema only when those contracts coincide.

- **Input schema** — normalizes and validates untrusted input at a channel boundary. It describes
  accepted commands, including transforms and input limits, not every historical stored value.
- **Record schema** — the product value and its invariants, owned by the capability. Storage
  nullability or legacy values do not automatically widen it. Keep it independent of provider
  representation; the adapter explicitly maps or rejects rows that cannot represent a product value.
- **Row schema** — the selected provider projection, owned by the private adapter. Derive its
  nullability and admitted values from the actual store/API contract, including query joins and
  aggregates. A wider row schema does not require a wider product record or weaker input validation.

Failure policy belongs to the consuming scenario. Reject malformed collections and invalid rows
when completeness matters: moderation queues, authorization, totals and bulk operations must not
silently lose entries. Row-by-row recovery is allowed only when the scenario explicitly accepts
partial results and defines how omissions affect consumers, pagination, totals and observability.
Logging a dropped row does not by itself make a partial result a valid success.

Do not normalize saved values with an input transform on every read. A website field that adds a
protocol on input must not silently rewrite the stored projection or reject allowed historical data.

Reference: schemas witness distinct contracts; adapters own representation changes and scenarios
own the consequences of incomplete data.
