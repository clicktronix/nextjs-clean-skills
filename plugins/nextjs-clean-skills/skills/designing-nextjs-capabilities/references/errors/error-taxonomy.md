# Error Taxonomy

**Impact: HIGH** · **Scope: portable**

Use a small closed set of semantic failure codes. Channels translate them; providers do not define
them.

| Kind | Meaning | Internal carrier |
| --- | --- | --- |
| `validation` | untrusted input is invalid | typed expected value |
| `unauthorized` | no valid caller identity | typed expected value |
| `forbidden` | identity lacks required policy permission | typed expected value |
| `not_found` | required public resource is absent | typed expected value |
| `conflict` | uniqueness or version conflict | typed expected value |
| `rate_limited` | quota refusal | typed expected value |
| `contract` | trusted provider/output violated its contract | exception |
| `unavailable` | provider, network, or timeout failure | exception |
| `unknown` | unclassified defect | exception |

HTTP status, form state, render outcome, stream event, and job retry are channel mappings, not
failure kinds.

Provider codes are translated in the private adapter that understands them. Preserve a recognized
meaning; never expose raw provider messages, constraint names, query fragments, or SDK errors.
Do not attach a raw provider error as `cause` to an expected semantic failure that leaves the
adapter. Record only approved diagnostic context inside the adapter, then return or throw a clean
semantic failure. An unrecognized unexpected exception may propagate to the one outer capture owner.

Expected product outcomes are typed values. Unexpected contract violations, defects, and
infrastructure outages use the exception path and are reported once by the outer channel. That
channel maps the exception to a stable public `contract`, `unavailable`, or `unknown` code. Inner
operations do not return infrastructure outages as ordinary expected values merely because the
public response uses a semantic code.

A stream may carry the same semantic code in-band after commit. The transport changes; the meaning
does not.

Keep the set closed. Adding a kind requires updating every relevant channel mapping and tests.

Reference: application-owned semantic failures with channel-native transport mapping.
