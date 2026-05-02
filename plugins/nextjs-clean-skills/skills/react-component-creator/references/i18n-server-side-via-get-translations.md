# Server-Side i18n Via Async Translations

Server Components should fetch translations server-side using the target repo's async i18n API.

Use server-side translations for:

- page titles
- metadata
- server-rendered headings
- static labels in RSC-only UI

Pass translated strings or message descriptors to Client children as serializable props.

Do not call client i18n hooks in Server Components.

## Locale Detection Boundary

Initial locale detection belongs at the request boundary, not inside arbitrary Client Components, and not in the root layout.

Do not make the root layout dynamic just to parse `Accept-Language` when the repo already resolves the locale at the request boundary. Keep the resolved locale serializable and pass it through providers/layout props.

If the app ships only English messages, keep `SUPPORTED_LOCALES` and `DEFAULT_LOCALE` English-only. Do not add a fake locale, selector, or translation file until translated messages and tests exist.

For the concrete cookie + `Accept-Language` resolution pattern, see [Locale Cookie Seeded By Proxy](./i18n-locale-cookie-via-proxy.md).
