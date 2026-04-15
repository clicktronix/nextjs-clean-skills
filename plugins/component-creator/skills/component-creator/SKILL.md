---
name: component-creator
description: Use when working with React components or hooks. Creates, edits, or refactors UI components, forms, tables, and custom hooks. Enforces composeHooks Smart/Dumb separation, TanStack Query for server state, translations, and a standard file layout. UI-library agnostic — works with Mantine, Chakra, shadcn/ui, Radix, or plain elements.
---

# Component Creator Skill

Creates React components following Smart/Dumb separation via `composeHooks`. UI library is project-defined; examples below use Mantine, but the pattern is identical for any component library or plain HTML/CSS.

## Workflow

1. Create the file structure
2. Build a pure `View`
3. Put view-model logic into `lib.ts`
4. Use `ui/server-state` for TanStack Query concerns
5. Use feature-local `actions.ts` only for thin one-off Server Action calls
6. Export with `composeHooks`
7. Add i18n and `data-testid` where the interaction is critical

## Standard Structure

```text
ComponentName/
├── index.tsx
├── lib.ts
├── messages.json
└── styles.module.css
```

Add `interfaces.ts` when the component accumulates many types.

## Boundaries

### `lib.ts` may import

- `@/ui/server-state/**`
- `@/ui/hooks/**`
- `@/domain/**`
- `@/lib/**`
- `./actions`

### `lib.ts` must NOT import

- `@/adapters/inbound/**`
- `@/adapters/outbound/**`
- `@/app/**`

If the code needs:

- `useQuery`, `useMutation`, query keys, cache invalidation -> `src/ui/server-state/<feature>/`
- a one-off direct Server Action call -> local `actions.ts`
- business orchestration -> `src/use-cases/<feature>/`

## Core Pattern

The pattern is library-agnostic. Swap `@mantine/core` below for `@chakra-ui/react`, `@/ui/components/*` (shadcn/ui), Radix primitives, or plain `<div>` / `<button>` — the Smart/Dumb split and `composeHooks` call are unchanged.

```tsx
// index.tsx — Mantine example (pick your UI library)
import { Button, Card, Stack, Text } from '@mantine/core'
import { composeHooks } from '@/ui/hooks/compose-hooks'
import { TranslationText } from '@/ui/components/TranslationText'
import { useWorkItemCardProps, type WorkItemCardProps, type WorkItemCardViewProps } from './lib'
import messages from './messages.json'

export function WorkItemCardView({
  title,
  description,
  isPriority,
  onEdit,
}: WorkItemCardViewProps) {
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
        {isPriority ? <TranslationText {...messages.priority} size="xs" /> : null}
        <Button onClick={onEdit} data-testid="work-item-card-edit-btn">
          <TranslationText {...messages.edit} />
        </Button>
      </Stack>
    </Card>
  )
}

export const WorkItemCard = composeHooks<WorkItemCardViewProps, WorkItemCardProps>(
  WorkItemCardView
)(useWorkItemCardProps)
```

```ts
// lib.ts
import { useCallback } from 'react'
import { useWorkItem } from '@/ui/server-state/work-items/queries'

export type WorkItemCardProps = {
  workItemId: string
  onEdit?: (id: string) => void
}

export type WorkItemCardViewProps = {
  title: string
  description: string
  isPriority: boolean
  onEdit: () => void
}

export function useWorkItemCardProps({
  workItemId,
  onEdit,
}: WorkItemCardProps): WorkItemCardViewProps {
  const { data } = useWorkItem(workItemId)

  const handleEdit = useCallback(() => {
    onEdit?.(workItemId)
  }, [onEdit, workItemId])

  return {
    title: data?.title ?? '',
    description: data?.description ?? '',
    isPriority: data?.is_priority ?? false,
    onEdit: handleEdit,
  }
}
```

## Rules

- `index.tsx` is presentation only
- `lib.ts` assembles view props only
- all user-facing text goes through translations (e.g. `react-intl`, `next-intl`, or project's own i18n layer)
- prefer your UI library's component props or CSS Modules over inline styles
- mock `ui/server-state` in component tests, not adapters
- add `data-testid` to destructive or workflow-critical controls

## Adapting to your stack

| Project convention     | What to change                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ |
| UI library             | Swap import in `index.tsx`; Smart/Dumb split is unchanged                      |
| i18n library           | Replace `<TranslationText />` + `messages.json` with your i18n primitive        |
| State layer (non-TanStack) | Replace `ui/server-state` hooks with your equivalent; pattern still applies |
| Styling                | CSS Modules, vanilla-extract, Tailwind, Emotion — whatever the project uses    |

The `composeHooks(View)(useProps)` call and the view/lib separation are the invariants.
