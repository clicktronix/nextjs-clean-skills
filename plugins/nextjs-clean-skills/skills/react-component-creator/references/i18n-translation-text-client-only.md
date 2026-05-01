# TranslationText In Client UI

For client-rendered JSX, use the target repo's `TranslationText` or equivalent message component.

Rules:
- no hardcoded user-facing strings
- keep component-local messages near the component when the repo uses that convention
- compute labels in `lib.ts` only when the label must feed an aria label, placeholder, or callback

Do not mix multiple i18n systems in one component.
