# Authority And Transactions

**Impact: CRITICAL** · **Scope: portable**

Decide who commits and enforces the write:

| Authority | Transaction boundary | Capability responsibility |
| --- | --- | --- |
| local store | stored function or database transaction | call it and map the result |
| owned service | service endpoint | call it and map the result |
| application | operation coordinating several dependencies | own the policy explicitly |

Call an authoritative transaction; do not mirror it as ordered TypeScript calls. Two definitions of
one rule drift.

Keep actor, tenant, parent, or ownership scope inside the write predicate. A bulk or reorder command
is one scoped write, not an unscoped loop.

Idempotency belongs where retries enter. A non-idempotent write is not retried unless its protocol
provides an idempotency key.

When authority is in the application, the operation owns transaction intent but concrete commit
mechanics stay in a private server adapter.

Provider rows and errors are mapped before leaving the private adapter.

Reference: the transaction belongs to the authority that can commit it atomically.
