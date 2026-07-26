# Error Taxonomy

**Impact: HIGH** · **Scope: portable**

One closed set of failure kinds, defined once. Entry points read the kind; they do not invent their own.

| Kind | Raised by |
| --- | --- |
| `validation` | declared **input** schema |
| `contract` | declared **output** schema — a defect on our side |
| `unauthorized` | session check, or a delegated-identity upstream refusal |
| `forbidden` | role check, policy refusal |
| `not_found` | a single row was required and absent |
| `conflict` | uniqueness violation, version race |
| `upstream` | a service failure with no known meaning |
| `rate_limited` | quota refusal, ours or an upstream's |
| `network` | transport failure or timeout |
| `unknown` | anything else caught |

The taxonomy is not shaped by a transport. Status codes belong to the translation layer that maps a kind onto the channel in play — a status, a form action state, an in-stream event, or a rendered surface. One module owns that mapping; the same kind reaches a JSON client and a form differently, and neither meaning belongs in this table.

Upstream failures with a meaning we recognise — not found, conflict, rate limited — keep it instead of flattening to `upstream`. Auth refusals are the exception: preserve the caller's own refusal only under delegated identity. Under service identity a refusal is our credential defect, reported as `upstream`, never shown as "sign in again".

Provider codes are translated by the module that knows them: a database code, a response body, a driver message travels no further than the data module or adapter that produced it, which raises a typed application failure instead.

Never surface a raw provider message. It leaks schema names, constraint names, and query fragments, and couples the client to a vendor's wording.

Users see text chosen by kind, plus a request id when the kind is `unknown` — that id makes an opaque failure traceable without exposing internals.

Any kind raised after a response has begun travels as an in-stream event rather than a status. That changes how it reaches the caller, not what it is.

Expected failures are not defects. A rejected schema or a uniqueness conflict is application behaviour: report it as a result, keep it out of the exception channel, page no one. Only unexpected failures earn exception telemetry.

Keep the set closed. A new kind is a deliberate change to this table and the mapping module, never a string invented at a call site.

Reference: a closed failure taxonomy owned by the application, not by its providers or its transports.
