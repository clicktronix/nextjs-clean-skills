# Authority And Transactions

**Impact: CRITICAL** · **Scope: portable**

Before writing a write path, decide where authority lives. Three answers, and they lead to
different code.

| Authority | Transaction boundary | The application's job |
| --- | --- | --- |
| store | a stored procedure or function | call it, map the result |
| owned service | an endpoint that commits | call it, map the result |
| application | a use-case coordinating several seams | hold the rule itself |

The first two are the common case in this architecture, and both produce a **thin** call site.
That is correct, not a shortcut: real work happens behind the seam, it is simply not written in
TypeScript. A three-line function that names a transaction is not an empty layer.

```ts
export async function approveClaim(ctx: DataContext, claimId: string): Promise<Claim> {
  const raw = await ctx.store.call('approve_claim', { claimId })
  return toClaim(parse(ClaimRow, raw))
}
```

Whatever holds authority, three rules follow.

**Call it, never mirror it.** Reimplementing a committed transaction in application code creates
two definitions of one rule. They drift, and only one of them is enforced — the other silently
disagrees at the worst moment.

**Preserve the caller's scope inside the write.** A batch or reorder operation carries the actor,
tenant, or parent identity into the statement itself, so a wrong id cannot widen the effect.
Replacing a loop of single updates with one scoped write is the rule; whether the mechanism is a
stored function, a service endpoint, or a transaction block is the instance.

**Escape user input once, in one function.** Any query or filter language with pattern syntax
needs escaping that covers both the pattern characters and the surrounding filter grammar. Two
partial escapers is the recurring failure: each misses what the other handles, and the one with
tests is usually not the one on the live path.

When authority is genuinely in the application — a rule with no home in the store or the service —
that is a use-case, and the pure part belongs in domain.

What the adapter may hand upward is covered by [Row Types Are Not Domain
Types](row-vs-domain-types.md); what it may hand a caller on failure, by [Error
Taxonomy](../errors/error-taxonomy.md).

Reference: the transaction boundary belongs to whoever holds authority.
