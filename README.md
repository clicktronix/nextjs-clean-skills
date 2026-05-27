# nextjs-clean-skills

Portable Claude Code and Codex plugin marketplace for applying a Next.js 16 Hybrid Clean Architecture profile and React Server/Client Component rules.

## Plugin

| Plugin | Skills | Purpose |
| --- | --- | --- |
| `nextjs-clean-skills` | `nextjs-architecture`, `react-component-creator` | Design full-stack Next.js feature slices and React components with explicit architecture and rendering boundaries. |

Both skills are model-invoked: Claude Code and Codex can select them automatically when a task matches the skill frontmatter `description`.

## Claude Code Install

Add to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "nextjs-clean-skills": {
      "source": { "source": "github", "repo": "clicktronix/nextjs-clean-skills" }
    }
  },
  "enabledPlugins": {
    "nextjs-clean-skills@nextjs-clean-skills": true
  }
}
```

Interactive install:

```shell
/plugin marketplace add clicktronix/nextjs-clean-skills
/plugin install nextjs-clean-skills@nextjs-clean-skills
```

After install, run `/reload-plugins`. Invoke directly with:

```shell
/nextjs-clean-skills:nextjs-architecture
/nextjs-clean-skills:react-component-creator
```

## Codex Install

This repository contains a Codex marketplace at `.agents/plugins/marketplace.json` and a Codex plugin manifest at `plugins/nextjs-clean-skills/.codex-plugin/plugin.json`.

Interactive install:

```shell
codex plugin marketplace add clicktronix/nextjs-clean-skills --ref main
```

Then open `/plugins`, select the `nextjs-clean-skills` marketplace, and install `nextjs-clean-skills`.

For a consuming repository, prefer a repo marketplace entry instead of copying the skill files:

```json
{
  "name": "project-plugins",
  "plugins": [
    {
      "name": "nextjs-clean-skills",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/clicktronix/nextjs-clean-skills.git",
        "path": "./plugins/nextjs-clean-skills",
        "ref": "main"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Put that file at `$REPO_ROOT/.agents/plugins/marketplace.json`. Codex installs plugins into its plugin cache; do not vendor-copy `plugins/nextjs-clean-skills/skills/*` into a consuming repository's `.agents/skills/`.

Installed skills:

```text
$nextjs-architecture
$react-component-creator
```

## Default Profile

- **Framework**: Next.js 16 App Router, React 19, TypeScript.
- **Architecture**: Hybrid Clean Architecture with domain, use-cases, inbound/outbound adapters, server-only DAL/read entrypoints, client server-state, and thin `app/` entrypoints.
- **Validation**: Valibot and Standard Schema-compatible action/form validation.
- **Reads**: Server Components through server-only DAL/read use-cases by default.
- **Client server-state**: TanStack Query only for client interactivity, realtime, polling, optimistic updates, infinite scroll, or shared async/server-state cache lifecycle across client islands.
- **Cache**: Cache Components with `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, and `revalidateTag(tag, 'max')`.
- **Actions**: Thin validated Server Actions, preferably `next-safe-action` v8 when available.
- **Components**: Server Components by default; `composeHooks(View)(useProps)` for Client Components with logic.

## Human Architecture Docs

The skills are intentionally concise and operational. For team onboarding, rationale, and visual
maps, use the human-facing docs:

- [Architecture Contract](docs/architecture-contract.md) — layer graph, runtime flow,
  command/query boundaries, auth boundary, persistence, and state ownership.
- [Agent Decision Maps](docs/agent-decision-maps.md) — compact flowcharts for prompting and
  reviewing coding agents.

These docs are not loaded by Claude Code or Codex automatically; they exist to explain the
contract behind the skills without bloating skill context.

## Compatibility

These skills assume the target app uses the current Next.js 16 App Router model:

| Target stack | Support level | Notes |
| --- | --- | --- |
| Next.js 16 + React 19 | Primary | Assumes `cacheComponents: true`, `proxy.ts`, async request APIs, Server Components by default, and RSC-first reads. |
| Next.js 15 | Migration only | Use the architecture guidance selectively; Cache Components and proxy naming may need migration work first. |
| Next.js 14 or older | Not a default target | Treat these skills as conceptual guidance, not copy-ready implementation rules. |
| Non-Next React | Component-only | `react-component-creator` state/styling guidance can apply, but RSC, Server Actions, proxy, and cache rules do not. |

Minimum package versions for copy-ready rules:

| Package | Minimum |
| --- | --- |
| Next.js | 16.1 |
| React | 19.2 |
| Valibot | 1.0 |
| Mantine | 8.0 |
| TanStack Query | 5.90 |
| next-safe-action | 8.0 |
| Supabase SSR | 0.8 |

If the target repo has stricter local architecture docs, follow the target repo first.

## Repository Checks

Run the local checks:

```bash
npm run validate
```

## Versioning

`version.json` is the single source of truth for the release version. The plugin name and folder are intentionally fixed as `nextjs-clean-skills`. Run `npm run sync-version` after changing the release version.

Semver:
- major for breaking skill names, plugin names, or behavior expectations
- minor for new references or substantial guidance changes
- patch for wording fixes

## License

MIT — see [LICENSE](./LICENSE).
