# Validate Once Per Trust Boundary

**Scope: portable**

Validate each trust transition once; the transition-to-owner table is in
[Runtime Boundaries § Validation](../../../../docs/runtime-boundaries.md#validation).

Authentication and transport decoding are not duplicate schema validation. They establish different
facts.

Do not parse the same typed value again because it crossed a module or directory. If an action
framework owns input parsing, that parser is the channel declaration; the operation receives the
typed value.

Client validation provides feedback only. The server repeats the authoritative check because the
client is untrusted.

Parse and map provider rows at the adapter that understands the provider. For authorization-sensitive
joins, validate completeness before creating the public projection.
