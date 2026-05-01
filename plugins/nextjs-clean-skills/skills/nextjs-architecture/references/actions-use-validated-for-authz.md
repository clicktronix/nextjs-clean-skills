# Use `.useValidated()` For Input-Dependent Authz

When authorization depends on parsed input, run it after input validation.

Examples:
- resource ownership by `resourceId`
- tenant membership by `tenantId`
- workflow permission by `status`

With `next-safe-action`, use `.useValidated()` after `.inputSchema()` or `.bindArgsSchemas()`.

Do not check ownership against raw client input.
