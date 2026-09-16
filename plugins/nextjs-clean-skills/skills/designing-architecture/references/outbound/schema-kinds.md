# Schema Kinds

**Impact: HIGH** · **Scope: portable**

A schema witnesses a TypeScript value only within its own kind. Inferring a value's type from a
schema of a different kind is not an interchangeable shortcut — it silently narrows or widens what
the value is allowed to hold.

- **Input schema** — normalizes and rejects untrusted input at a channel boundary (transform, URL
  validation, length limits). It describes what a client may send, not what the store holds.
- **Record schema** — the shape the product reasons about. Derive it from the store contract:
  nullability from generated types, the admitted set from the stored constraint — never from an
  input schema, which is narrower and rejects values storage already allows.
- **Row** — one provider row. Validate a list read per row and drop or neutralize a failing row;
  do not validate a whole page as one array, or one bad row fails the entire list.

Confusing these kinds is not hypothetical: a read projection once parsed with the input schema,
rewrote stored data on read, and crashed on a legitimately empty stored string.

Reference: an input schema, a record schema, and a row schema answer different questions and must
not stand in for each other.
