# Styling, Text, And Accessibility

**Impact: MEDIUM** · **Scope: stack (React + web)**

Styling and text follow project conventions so components stay consistent and replaceable.

Styling order:

1. Design-system props and theme tokens.
2. Scoped stylesheets (CSS Modules or the project equivalent) for custom layout and visual rules.
3. Inline styles for runtime values that cannot use tokens, classes, or CSS variables.

Use tokens instead of color literals, scoped styles instead of static inline layout, and an existing
design-system primitive instead of a redundant wrapper.

i18n boundary:

- user-facing copy goes through the project i18n layer.
- resolve translations in the runtime that owns the rendered text.
- request-header locale negotiation belongs to the server entry, not component code.
- when the i18n API uses message descriptors, format the descriptor instead of rendering its
  fallback field.
- localize accessible names, titles, placeholders, tooltips, and informative image alternatives.
- decorative images use `alt=""`; do not invent or translate a description for them.

Accessibility is a component contract, not a review afterthought:

- use native semantics before ARIA; a custom `role="button"` also needs keyboard and focus behavior.
- give every control an accessible name.
- associate each input with its label, description, and error; do not convey invalid state by color.
- move focus inside a dialog on open. On close, restore the trigger or choose the next logical
  control. When navigation replaces the active context, move focus to the new context.
- loading completion alone does not move focus. If completion or failure is a status message, expose
  the concise status through live-region semantics; do not announce every content replacement.
- never remove a focus indicator without replacing it with a visible one.
- pair color with text or another programmatically determinable cue.
- honor reduced-motion preferences.

Fetch current component-library and i18n docs for syntax. Preserve the project's styling and
translation systems.

Reference: [status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html),
[dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[non-text content](https://www.w3.org/WAI/WCAG21/Understanding/non-text-content).
