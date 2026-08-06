# nextjs-clean-skills

Portable Claude Code and Codex plugin marketplace for applying a capability-first Next.js 16
architecture and React Server/Client Component rules.

## Plugin

| Plugin | Skills | Purpose |
| --- | --- | --- |
| `nextjs-clean-skills` | `designing-architecture`, `creating-react-components` | Design full-stack Next.js capability modules and React components with explicit architecture and rendering boundaries. |

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
/nextjs-clean-skills:designing-architecture
/nextjs-clean-skills:creating-react-components
```

## Codex Install

This repository contains a Codex marketplace at `.agents/plugins/marketplace.json` and a Codex plugin manifest at `plugins/nextjs-clean-skills/.codex-plugin/plugin.json`.

Interactive install:

```shell
codex plugin marketplace add clicktronix/nextjs-clean-skills --ref main
codex plugin add nextjs-clean-skills@nextjs-clean-skills
```

Alternatively, open `/plugins`, select the `nextjs-clean-skills` marketplace, and install `nextjs-clean-skills`.

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
$designing-architecture
$creating-react-components
```

## Optional Greenfield Profile

This is a fallback for greenfield or explicitly opted-in repositories. Existing projects keep
their local equivalents unless the task requests a migration.

- **Framework**: Next.js 16 App Router, React 19, TypeScript.
- **Rules**: [`rules/`](./rules/) ships an executable ESLint boundaries config for the capability
  contract, plus a note on the depth failures no lint rule can catch.
- **Architecture**: Product capabilities under `src/modules/<capability>`, optional
  domain/application/server/client/UI segments, narrow runtime-specific public surfaces, and
  route-private framework composition under `app/**`.
- **Validation**: The project's existing schema and form libraries; validate at each trust entry.
- **Reads**: Server Components call capability RSC/server surfaces directly. Browser-owned reads use
  `GET` or streams, never Server Actions.
- **Client cache**: TanStack Query when the browser owns realtime, polling, optimistic, infinite, or
  shared async lifecycle; do not migrate an existing cache library implicitly.
- **Cache**: Cache Components with `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, and `revalidateTag(tag, 'max')`.
- **Actions**: Thin validated Server Actions, using the project's existing action wrapper when it
  has one.
- **Components**: Server Components by default; Client Components call named Hooks directly.

## Human Architecture Docs

The skills are intentionally concise and operational. For team onboarding, rationale, and visual
maps, use the human-facing docs:

- [Architecture Contract](docs/architecture-contract.md) — capability ownership, optional
  segments, dependency direction, operations, ports, and public surfaces.
- [Runtime Boundaries](docs/runtime-boundaries.md) — request flow, trust, failures, cache ownership,
  transactions, observability, and tests.
- [Frontend Composition](docs/frontend-composition.md) — RSC, Client Components, forms, state, and
  component ownership.
- [Architecture Decision Maps](docs/agent-decision-maps.md) — compact placement and review
  flowcharts.
- [Adoption And Enforcement](docs/adoption-and-enforcement.md) — rollout, executable coverage, and
  known gaps.

These docs are not loaded by Claude Code or Codex automatically; they exist to explain the
contract behind the skills without bloating skill context.

## Compatibility

These skills assume the target app uses the current Next.js 16 App Router model:

| Target stack | Support level | Notes |
| --- | --- | --- |
| Next.js 16 + React 19 | Primary | Assumes `cacheComponents: true`, `proxy.ts`, async request APIs, Server Components by default, and RSC-first reads. |
| Next.js 15 | Migration only | Use the architecture guidance selectively; Cache Components and proxy naming may need migration work first. |
| Next.js 14 or older | Not a default target | Treat these skills as conceptual guidance, not copy-ready implementation rules. |
| Non-Next React | Component-only | `creating-react-components` state/styling guidance can apply, but RSC, Server Actions, proxy, and cache rules do not. |

Minimum framework versions for copy-ready guidance:

| Package | Minimum |
| --- | --- |
| Next.js | 16.2 |
| React | 19.2 |

The optional TanStack Query and Supabase references assume TanStack Query 5.90 and Supabase SSR
0.8 or newer. Other schema, form, action, and UI libraries remain product-profile decisions.

If the target repo has stricter local architecture docs, follow the target repo first.

## Repository Checks

Run the local checks:

```bash
npm run validate
```

## Migration Workflows

[`plugins/nextjs-clean-skills/workflows/`](plugins/nextjs-clean-skills/workflows/README.md) ships two
multi-agent workflows that adopt this architecture in an existing Next.js repository, executing the
procedure in [`docs/adoption-and-enforcement.md`](docs/adoption-and-enforcement.md) rather than a
second one. They require dynamic workflows to be enabled, and they are part of the plugin — installing
it is all the setup a target repository needs:

```text
Workflow({ name: 'prepare-architecture-migration', args: { repo, ordinaryChange } })
Workflow({ name: 'migrate-capability', args: { repo, capability, manifestPath } })
```

`/workflows` lists what the session resolved, which is the fastest way to confirm the plugin's
workflows loaded.

Phase 1 is not read-only — it writes into the target — so run it on a branch you can throw away.
Neither workflow has yet been executed against a live repository; treat the first run as an
experiment.

## Versioning

`version.json` is the single source of truth for the release version. The plugin name and folder are intentionally fixed as `nextjs-clean-skills`. Run `npm run sync-version` after changing the release version.

Semver:
- major for breaking skill names, plugin names, or behavior expectations
- minor for new references or substantial guidance changes
- patch for wording fixes

## License

MIT — see [LICENSE](./LICENSE).
