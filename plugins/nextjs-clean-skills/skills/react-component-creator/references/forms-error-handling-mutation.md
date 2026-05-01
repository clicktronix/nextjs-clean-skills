# Form Mutation Error Handling

Map mutation/action states into explicit view props.

View props should include:
- `isSubmitting`
- field errors
- form-level error
- success state when needed
- disabled state for conflicting controls

Do not render raw server error messages to users. Log technical details server-side and show localized, user-safe messages.
