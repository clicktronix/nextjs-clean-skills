# TranslationText In Client UI

For client-rendered JSX, use the target repo's `TranslationText` or equivalent message component.

Rules:

- no hardcoded user-facing strings
- keep component-local messages near the component when the repo uses that convention
- compute labels in `lib.ts` only when the label must feed an aria label, placeholder, or callback
- expose only real supported locales in UI controls

Do not mix multiple i18n systems in one component.

Do not add a locale selector or secondary locale file just to demonstrate i18n. If a template ships only English copy, keep the locale surface English-only. Add another locale only when translated messages, locale detection, tests, and selector options all exist together.
