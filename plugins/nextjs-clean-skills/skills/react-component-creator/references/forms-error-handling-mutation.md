# Form Mutation Error Handling

Map mutation/action states into explicit view props.

View props should include:

- `isSubmitting`
- field errors
- form-level error
- success state when needed
- disabled state for conflicting controls

Do not render raw server error messages to users. Log technical details server-side and show localized, user-safe messages.

When the form calls a Server Action, expected failures must keep their category:

- validation -> field or form validation message
- authentication -> login/session message
- authorization -> permission message
- conflict -> duplicate/stale update message
- unexpected infrastructure failure -> generic server message

Avoid wrappers that convert every thrown action error into the same generic "server error"; that hides real form states and breaks recovery UX.
