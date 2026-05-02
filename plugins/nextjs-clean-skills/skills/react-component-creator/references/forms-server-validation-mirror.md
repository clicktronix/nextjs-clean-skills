# Mirror Validation On Server

Client validation is UX. Server validation is authority.

Rules:

- reuse the same Valibot/Standard Schema when possible
- parse input in the Server Action boundary
- return field-level errors in action state or mutation error mapping
- never trust hidden fields for user, tenant, role, or permissions

Mantine validation does not replace Server Action validation.
