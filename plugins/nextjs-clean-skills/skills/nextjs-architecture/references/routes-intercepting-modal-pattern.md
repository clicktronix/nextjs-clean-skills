# Intercepting Routes For URL-Addressable Modals

**Impact: MEDIUM**

Use intercepting routes when a modal should:
- open over the current page on soft navigation
- have a shareable/deep-link URL
- render as a full page on hard navigation

Pattern:
```text
app/items/[id]/page.tsx
app/items/@modal/default.tsx
app/items/@modal/(.)[id]/page.tsx
```

Keep modal UI route-local unless reused elsewhere.

**Incorrect (modal state only in local component state):**
```tsx
const [opened, setOpened] = useState(false)
```

**Correct (modal has a URL and hard-navigation fallback):**
```text
app/items/[id]/page.tsx
app/items/@modal/default.tsx
app/items/@modal/(.)[id]/page.tsx
```

Reference: Next.js parallel and intercepting routes.
