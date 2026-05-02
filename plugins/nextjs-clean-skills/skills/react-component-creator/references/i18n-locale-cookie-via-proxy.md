# Locale Cookie Seeded By Proxy

**Impact: MEDIUM**

When the codebase uses a client-only i18n layer (React Intl, FormatJS) and still needs first-byte locale persistence, seed the locale cookie inside `src/proxy.ts` and have the locale provider read it. Use this as a deliberate alternative to migrating to `next-intl`.

Pattern:

1. Pure parser in `src/infrastructure/i18n/locale-detection.ts` — RFC 7231 q-values, region normalization (`en-US` → `en`), tie-breaker by original order, unsupported-locale fallback.
2. Proxy seeds the cookie idempotently — only writes when the resolved locale differs from the existing cookie.
3. Cookie flags: `path: '/'`, `maxAge: 31_536_000`, `sameSite: 'lax'`, `secure: !isDevelopment`. Do NOT use `httpOnly` — the client provider must read it during hydration.
4. Proxy resolves from cookie + `Accept-Language`; providers read the persisted cookie or receive a serializable locale. Do not make the root layout dynamic just to parse `Accept-Language`.

**Incorrect (no cookie persistence; locale flickers per request):**

```ts
// proxy.ts has no locale logic; LocaleProvider falls back to defaults each request
```

**Correct (idempotent cookie seed):**

```ts
function withLocaleCookie(res: NextResponse, req: NextRequest) {
  const current = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const resolved = resolveInitialLocale({
    cookieLocale: current,
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (current === resolved) return res;
  res.cookies.set(LOCALE_COOKIE_NAME, resolved, COOKIE_OPTS);
  return res;
}
```

Test the parser with quality ties (`en;q=0.8,fr;q=0.8` → first wins), invalid values (`q=2` → 0), region normalization (`EN_us` → `en`), unsupported fallback. Once the project moves to native server-side i18n, retire the proxy cookie path; do not run both layers.

Reference: RFC 7231 Accept-Language negotiation; Next.js proxy patterns.
