# Validate Once Per Trust Boundary

**Impact: HIGH** · **Scope: portable**

Validate each trust transition once:

| Transition | Owner |
| --- | --- |
| unknown transport input to typed command/query | channel boundary |
| provider or database output to trusted value | private adapter |
| internal value to external serialized contract | public channel surface |

Authentication and transport decoding are not duplicate schema validation. They establish different
facts.

Do not parse the same typed value again because it crossed a module or directory. If an action
framework owns input parsing, that parser is the channel declaration; the operation receives the
typed value.

Client validation provides feedback only. The server repeats the authoritative check because the
client is untrusted.

Keep provider rows and public/domain values separate when naming or semantics differ. Parse and map
at the adapter that understands the provider.

Authorization-sensitive joins must distinguish visible, missing, and forbidden references without
enumerating protected data. Validate completeness before creating the public projection.

Reference: trust transitions, not folder count, determine validation ownership.
