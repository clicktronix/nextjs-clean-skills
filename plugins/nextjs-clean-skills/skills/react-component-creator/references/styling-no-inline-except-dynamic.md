# Avoid Inline Styles

Do not commit `style={{ ... }}` for static styling.

Use:
- Mantine props
- CSS Modules
- CSS variables
- theme tokens

Inline style is acceptable only for truly dynamic values that cannot be represented through classes or CSS variables, such as a calculated transform from pointer movement.
