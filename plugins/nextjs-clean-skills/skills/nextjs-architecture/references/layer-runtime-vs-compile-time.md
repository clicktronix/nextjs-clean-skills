# Runtime Flow vs Compile-Time Imports

Do not confuse a runtime call chain with allowed imports.

Runtime can be:
- UI submits a form to a Server Action
- Server Action calls a use-case
- use-case calls a port
- outbound adapter implements the port

Compile-time imports must still point inward:
- domain imports nothing
- use-cases import domain and local ports/types only
- outbound imports use-case ports and domain
- inbound imports use-cases, outbound factories, and infrastructure
- UI imports DAL, server-state hooks, local actions, and presentation utilities

If a lower layer imports a higher layer, move the dependency behind a port.
