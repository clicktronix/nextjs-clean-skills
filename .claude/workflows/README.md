# Migration workflows

Multi-agent workflows that adopt the capability-first architecture in an **existing** Next.js
repository. They execute the procedure already written in
[`docs/adoption-and-enforcement.md`](../../docs/adoption-and-enforcement.md) — they do not invent a
second one. Where the two disagree, the document wins and the script is the defect.

Maintainer tooling, not part of the published plugin. Every script is parameterised by
`args.repo`, so it runs against any target repository from a checkout of this one.

## Setup

1. Claude Code with `"enableWorkflows": true` in `.claude/settings.json`.
2. The target repository is clean, its own tests pass, and it is on a branch you can throw away.
3. Scripts are single-file plain JavaScript: no imports, no TypeScript. Shared constants are copied
   between them on purpose — the runtime does not allow a `lib/`.

## The program

Run in order. Each is a separate `Workflow` call so a human reads the result before the next one.

| # | Workflow | Writes | Gate after it |
| --- | --- | --- | --- |
| 10 | `10-migration-inventory` | `rules/`, a draft contract, `migration-manifest.json` | blockers must be empty |
| 20 | `20-migration-pilot` | one capability | **accept / revise / reject** — human |
| 30 | _not written yet_ | remaining capabilities | — |

```
Workflow({ name: '10-migration-inventory', args: {
  repo: '/abs/path/to/target',
  ordinaryChange: 'add an optional field to a work item and show it in the list',
}})

Workflow({ name: '20-migration-pilot', args: {
  repo: '/abs/path/to/target',
  capability: 'work-items',
  manifestPath: '/abs/path/to/target/migration-manifest.json',
}})
```

`ordinaryChange` is optional but worth supplying: without it the change-radius comparison — the only
oracle that measures whether the architecture actually helped — cannot run.

There is deliberately no `30-migration-wave` yet. The document requires accepting, revising or
rejecting the architecture after the pilot, and a wave workflow written before that decision would
encode assumptions the pilot exists to test.

## Why the pilot is trustworthy: three independent oracles

A migration cannot be verified by reading the migrated code — that is the same judgement that
produced it. All three of these already existed in this repository before the workflows did:

| Oracle | What it is | Must |
| --- | --- | --- |
| Behaviour | the target's own typecheck, tests, **production build** | stay green |
| Architecture | `rules/` — 16 named ESLint messageIds, cycle, ownership, dependency checks | capability at 0, no total above baseline |
| Review | the properties [the document says static rules cannot prove](../../docs/adoption-and-enforcement.md) | no must-fix |

Phase 1 records all three **before** anything moves. The production build is not interchangeable with
a dev server: it is what proves server/client separation.

The architectural oracle is a **burndown**, not a pass/fail. Baseline counts per messageId are
censused up front, and the pilot must drive its own capability to zero without raising any total
elsewhere. That distinguishes real progress from moving violations around.

## The three techniques worth knowing

**Destinations are arithmetic, not judgement.** The agent decides a file's *role*
(`domain | application | server | client | ui | surface | stay | delete`); `destination()` in the
script computes the path from the contract. A role outside the admitted vocabulary rejects the whole
plan before anything is written. Agents are never asked to propose a layout, so 40 of them cannot
propose 40 layouts.

**The global analysis happens once, outside the per-capability agents.** Ownership of every file, the
cross-capability dependency graph, and the server-only/browser-safe classification are facts a
single-capability agent cannot derive correctly — they need the whole tree. Phase 1 does that behind
one deliberate barrier (a single agent, because two agents assigning owners produce contested files)
and writes `migration-manifest.json`. Later phases read their own rows.

**Surfaces are derived from consumers, never proposed.** A surface with no named consumer is dropped
from the plan by the script, not argued about by an agent.

## Constraints the scripts enforce because the document requires them

- No framework or library migration rides along; existing schema, form, UI, cache and provider
  libraries are preserved.
- No compatibility `lib` / `services` / `utils` / `common` bucket.
- One capability never carries both physical topologies; its obsolete old paths are deleted in the
  same change.
- A boundary failure is reported, not tunnelled around with a re-export, barrel or deep relative
  import — and a violation is fixed by correcting the dependency, never by `eslint-disable` or by
  widening the contract.

## Notes on the runtime

- No filesystem or shell from the script body. Reading `migration-manifest.json` into JavaScript
  therefore costs one schema'd probe agent; writing it costs one more.
- `Date.now()`, `Math.random()` and argless `new Date()` throw — they would break resume.
- Concurrency is capped at `min(16, cores − 2)`; phase 1's six lenses run in one batch on any
  machine with eight cores or more.
- To iterate without re-sending a script, edit the persisted copy under the session directory and
  re-invoke with `{ scriptPath }`; add `resumeFromRunId` to replay the unchanged prefix from cache.
- When a run returns something unexpected, read `journal.jsonl` in the run's transcript directory
  before theorising: it records each agent's actual return value.
