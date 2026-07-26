# Error Taxonomy

**Impact: HIGH** · **Scope: portable**

One closed set of failure kinds, defined once, mapped to public shapes in one module. Entry points read the kind; they do not invent their own.

| Kind | Raised by | Public status |
| --- | --- | --- |
| `validation` | declared **input** schema | 400 |
| `contract` | declared **output** schema — a defect on our side | 500, reported |
| `unauthorized` | session check, or a delegated-identity upstream refusal | 401 |
| `forbidden` | role check, policy refusal | 403 |
| `not_found` | a single row was required and absent | 404 |
| `conflict` | uniqueness violation, version race | 409 |
| `upstream` | a service failure with no known meaning | 502 |
| `rate_limited` | quota refusal, ours or an upstream's | 429 |
| `network` | transport failure or timeout | 504 |
| `unknown` | anything else caught | 500 |

Upstream failures with a meaning we recognise — not found, conflict, rate limited — keep that meaning instead of flattening to `upstream`. Auth refusals are the exception: preserve 401/403 only under delegated identity. Under service identity a 401 is our own credential defect, reported as `upstream`, never shown as "sign in again". Collapsing them loses the only information the caller could act on.

Provider codes are translated by the module that knows them: a database code, an HTTP body, a driver message travels no further than the data module or adapter that produced it, which raises a typed application error instead.

Never surface a raw provider message. It leaks schema names, constraint names, and query fragments, and it couples the client to a vendor's wording.

Users see text chosen by kind, from the translation layer, plus a request id when the kind is `unknown` — that id makes an opaque failure traceable without exposing internals.

Delivery is a separate axis. Any kind raised after a response has begun travels as an in-stream event rather than a status — that changes how it reaches the caller, not what it is.

Expected failures are not defects. A rejected schema or a uniqueness conflict is application behaviour: report it as a result, keep it out of the exception channel, page no one. Only unexpected failures earn exception telemetry.

Keep the set closed. A new kind is a deliberate change to this table and the mapping module, never a string invented at a call site. One kind, one meaning: do not reuse `unknown` for something you can classify, nor label a defect `validation` to tidy a status.

Reference: a closed failure taxonomy owned by the application, not by its providers.
