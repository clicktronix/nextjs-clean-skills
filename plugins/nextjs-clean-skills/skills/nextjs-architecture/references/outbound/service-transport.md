# Owned Service Transport

**Impact: HIGH** · **Scope: portable**

An application that talks to its own service over the network has a second data source with its own failure modes. Give it one home: a port for what is asked, an adapter for how it is fetched, one transport beneath.

```text
ports/<service>.ts          # what the application needs — its own layer, so both
                            # the use-case and the adapter can reach it
adapters/outbound/<service>/
├── http.ts      # production adapter
├── fake.ts      # test adapter
└── transport/   # auth, retries, timeouts, error mapping
```

Two adapters make the seam real; one transport home keeps mechanics from diverging.

The transport owns, and its interface states:

| Concern | Rule |
| --- | --- |
| timeout | every request; for a streamed response it bounds the idle gap, not the call |
| retry | idempotent methods by default; never a streamed response, which resumes instead |
| backoff | exponential with a ceiling |
| credentials | one of the two modes below, chosen once per service and written down |
| refresh | single-flight **keyed by the identity the call carries** |
| cancellation | caller's signal propagates to the outgoing request |
| errors | provider envelope translated to the application's taxonomy |
| correlation | request id generated at the boundary and sent with the call |

Two credential modes, chosen per service, not per call. **Service identity** for app-to-app work that derives no authority from the end user. **Delegated identity** when the service authorizes the user itself, so the request carries their verified credential. Always forbidden: forwarding an unverified client credential, or mixing modes within one service.

Keying the refresh is load-bearing under delegated identity: unkeyed, two users share one in-flight refresh and receive each other's rotated tokens. Drop the entry once it settles, or a stale promise serves spent credentials forever. Never evict an in-flight entry to bound the map — every entry is a live refresh, and dropping one sends the next caller with a spent credential. Cap for alerting, not for eviction.

Retrying a non-idempotent request duplicates the effect; that is why the opt-in is per call.

Addresses and credentials come from the validated environment module, and a missing required value fails startup, not the first request that needs it.

A second transport for one service is drift: the two will disagree about timeouts, retries, or error mapping.

Reference: one owned transport per external service, with an explicit contract.
