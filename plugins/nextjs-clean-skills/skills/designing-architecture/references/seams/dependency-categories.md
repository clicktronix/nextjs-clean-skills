# Dependency Categories

**Impact: CRITICAL** · **Scope: portable**

Decide whether application behavior needs a port before naming an adapter.

Ask:

1. Must application policy name the capability independently of technology?
2. Is the contract written in application language rather than table CRUD or SDK methods?
3. Does inversion protect real volatility, ownership, or isolation?
4. Is there a production consumer now?

If any answer is no, keep the concrete dependency private to `server/`. The gate is the only rule;
the table says where each kind of dependency usually lands once it has been applied.

| Dependency | Usual outcome |
| --- | --- |
| pure in-process calculation | direct import |
| local store from checked-in migrations | private server store; real-engine tests |
| owned remote service, third-party provider | private adapter; a port when all four answers are yes |

A local engine may pass the gate when real application policy must run independently of it, and a
remote provider may pass it with one implementation.

Adapter count and test mocks are evidence, not gates. Repository-per-table is rejected because it
mirrors storage rather than naming a capability.

Reference: Cockburn's purposeful ports; this project's admission gate.
