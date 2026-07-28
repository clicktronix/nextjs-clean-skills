# Error Taxonomy

**Impact: HIGH** · **Scope: portable**

Use a small closed set of semantic failure codes. Channels translate them; providers do not define
them.

| Kind | Meaning |
| --- | --- |
| `validation` | untrusted input is invalid |
| `contract` | trusted provider/output violated its contract |
| `unauthorized` | no valid caller identity |
| `forbidden` | identity lacks required policy permission |
| `not_found` | required public resource is absent |
| `conflict` | uniqueness or version conflict |
| `rate_limited` | quota refusal |
| `unavailable` | provider, network, or timeout failure |
| `unknown` | unclassified defect |

HTTP status, form state, render outcome, stream event, and job retry are channel mappings, not
failure kinds.

Provider codes are translated in the private adapter that understands them. Preserve a recognized
meaning; never expose raw provider messages, constraint names, query fragments, or SDK errors.

Expected product outcomes are typed values. Unexpected defects and infrastructure outages use the
exception path and are reported once by the outer channel. The channel may still expose a stable
`unavailable` or `unknown` code; semantic code and internal carrier are separate decisions.

A stream may carry the same semantic code in-band after commit. The transport changes; the meaning
does not.

Keep the set closed. Adding a kind requires updating every relevant channel mapping and tests.

Reference: application-owned semantic failures with channel-native transport mapping.
