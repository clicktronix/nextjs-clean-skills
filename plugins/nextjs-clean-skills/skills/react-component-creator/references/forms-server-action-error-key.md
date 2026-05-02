# Server Actions Return Error Keys, Not English

**Impact: HIGH**

Progressive-enhancement forms run their server action in two contexts: with hydrated JS or without it. In both, a server using a client-only i18n library (React Intl, FormatJS) cannot localize message text on the server boundary. Returning hardcoded English in either case breaks i18n.

Apply this when the server action returns business-rule errors NOT produced by the validation schema (e.g. "passwords don't match", "email already taken") and the codebase has no true server-side i18n.

**Incorrect (server hardcodes English):**

```ts
"use server";
export async function submitSignupForm(_prev, formData: FormData) {
  if (formData.get("password") !== formData.get("confirmPassword")) {
    return { error: "Passwords do not match" };
  }
}
```

**Correct (server returns typed key, client localizes):**

```ts
"use server";
const PASSWORDS_DO_NOT_MATCH = "PASSWORDS_DO_NOT_MATCH" as const;

export async function submitSignupForm(_prev: FormState, formData: FormData) {
  if (formData.get("password") !== formData.get("confirmPassword")) {
    return { errorKey: PASSWORDS_DO_NOT_MATCH };
  }
  return { errorKey: null };
}
```

```ts
const localizedError =
  state.errorKey === "PASSWORDS_DO_NOT_MATCH"
    ? intl.formatMessage(messages.validationPasswordsDoNotMatch)
    : state.error;
```

Notes:

- Use `errorKey` for known business rules. Reserve `error` (string) for fallthrough errors that already go through `getUserFacingErrorMessage` / `presentError`.
- Keep the union narrow so TypeScript catches typos.
- Lift shared keys to a common module if multiple forms reuse them.
- Skip this rule when the project has true server-side i18n (`getTranslations`); render localized text on the server instead.

Reference: React `useActionState`, progressive-enhancement form patterns.
