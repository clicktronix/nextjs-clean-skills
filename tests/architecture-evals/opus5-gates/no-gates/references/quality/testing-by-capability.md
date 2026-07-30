# Testing By Capability Surface

**Impact: HIGH** · **Scope: stack (Next.js App Router)**

Tests cross the same surface as production callers:

| Surface | Assert | Run against |
| --- | --- | --- |
| domain | pure invariants and calculations | no runtime |
| application operation | policy and projection outcomes | narrow dependency fakes |
| local private store | queries, policies, transactions, row mapping | real local engine |
| remote adapter | timeout, retry, auth, mapping, cancellation | fake server/provider contract |
| trusted `server.ts` surface | explicit identity, policy, mapping, silent propagation | private collaborators |
| RSC, Route Handler, or action | channel decoding, native result, report once | capability surface |
| stream | commit, cancellation, idle timeout, resume | event generator |
| job | retry, deadline, idempotency, dead-letter | worker harness |
| client | keys, subscription, invalidation, browser contract | network boundary |
| UI | rendered behavior and accessibility | public data/action contract |
| e2e | route, auth, store, browser, build | real stack |

Assert outcomes, not incidental call mechanics. A call assertion is valid only when the call is the
rule: a dependent read must happen after IDs are derived, a non-idempotent request is not retried, or
one cache owner is invalidated.

Do not fake a local engine when its query, policy, or transaction is the behavior under test.

An operation with no observable policy to assert fails the deletion test. Test the private store or
public surface instead.

Reference: capability interfaces are test surfaces; runtime lifecycle gets channel-native tests.
