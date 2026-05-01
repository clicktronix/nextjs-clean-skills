# Server-Side i18n Via Async Translations

Server Components should fetch translations server-side using the target repo's async i18n API.

Use server-side translations for:
- page titles
- metadata
- server-rendered headings
- static labels in RSC-only UI

Pass translated strings or message descriptors to Client children as serializable props.

Do not call client i18n hooks in Server Components.
