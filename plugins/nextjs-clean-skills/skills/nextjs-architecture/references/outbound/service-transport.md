# Owned Service Transport

**Impact: HIGH** · **Scope: portable**

Keep one transport per remote service inside the owning capability's private `server/` adapter.
Application code sees a capability-shaped port, not HTTP or SDK mechanics.

The transport owns:

| Concern | Rule |
| --- | --- |
| timeout | every ordinary request; stream idle timeout belongs to the stream channel |
| retry | idempotent calls only; committed streams resume instead |
| backoff | bounded exponential policy |
| credentials | one documented service or delegated-identity mode |
| refresh | single-flight keyed by the identity carried by the call |
| cancellation | caller signal reaches the outgoing request |
| errors | provider envelope maps to semantic application failures |
| correlation | request/trace id propagates |

Validate successful remote payloads at this trust boundary before mapping them to presentation or
application contracts. Static service types do not validate network data.

Under delegated identity, never share one unkeyed refresh promise between users. Remove a refresh
entry after it settles; do not evict an in-flight entry merely to cap a map.

Environment and credentials come from validated server-only configuration. Missing required values
fail startup or the first intentional runtime access, not an unrelated browser import.

A second transport for the same service is drift unless a separate runtime contract justifies it.

When the remote service is authoritative, keep its business invariants and orchestration there.
The frontend server may own presentation contracts, aggregation, cache, browser lifecycle, and BFF
policy. Do not mirror the service domain or create forwarding operations to complete a local folder
model; optional domain and application segments may be absent.

Reference: one private transport per service with explicit lifecycle and identity semantics.
