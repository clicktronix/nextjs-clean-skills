# Default To Server Components

Start every new component as a Server Component.

Keep it server-side when it:

- fetches read-heavy data
- renders request-time or static content
- does not need event handlers, browser APIs, stateful hooks, or refs
- can pass serializable props to a smaller Client child

Do not add `'use client'` just to preserve an old Smart/Dumb habit.
