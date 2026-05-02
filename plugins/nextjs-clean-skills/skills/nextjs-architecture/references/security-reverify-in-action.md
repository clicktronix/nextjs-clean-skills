# Reverify In Server Actions

Server Actions are public server endpoints referenced by the client.

Every action must:

- authenticate on the server
- authorize the operation after parsing input
- validate input with a schema at the boundary
- ignore client-provided authority values such as `userId`, `role`, or `tenantId`
- derive authority from server context

Client validation, disabled buttons, hidden inputs, and route protection are UX only. They are not security boundaries.
