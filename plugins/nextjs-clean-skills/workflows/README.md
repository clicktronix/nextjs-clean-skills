# Migration workflows

Multi-agent workflows that adopt the capability-first architecture in an **existing** Next.js
repository. They execute the procedure already written in
[`docs/adoption-and-enforcement.md`](../docs/adoption-and-enforcement.md) — they do not invent a
second one. Where the two disagree, the document wins and the script is the defect.

Shipped with the plugin, so nothing has to be fetched or checked out to run them. Every script is
parameterised by `args.repo` and runs against any repository from anywhere.

The **target** still needs three packages, because the rules installed into it import them:
`typescript`, `eslint-plugin-import` and `eslint-import-resolver-typescript` (see
[`rules/README.md`](../rules/README.md)). Phase 1 checks for them and installs the missing ones with
whatever package manager the target's lockfile names, before it writes anything — a rules copy that
cannot run leaves the target half-converted and the census unmeasurable.

The workflows have been exercised against a live migration; measurements and observed failures live
in [`docs/evidence.md`](../docs/evidence.md). The rest below documents how to run and interpret the
current program. Its tests prove decision logic, not a target repository's outcome; read every gate.

## Setup

1. Claude Code with dynamic workflows enabled (`/config` → **Dynamic workflows**).
2. The plugin installed, or a checkout of this repository. Nothing else: the normative documents and
   `rules/` ship inside the plugin next to `skills/`, and phase 1 locates them itself.
3. The target repository is clean, its own tests pass, and it is on a branch you can throw away.
   Phase 1 is not read-only: it installs `rules/`, writes a drafted contract, amends the target's
   ESLint config, and adds `rules/` to the target's linter and formatter ignore lists. That last one
   is not tidiness — the vendored files are written to *this* repository's style, so without it they
   fail the target's own gates and the burndown starts by counting debt that was never the target's.
4. Scripts are single-file plain JavaScript: no imports, no TypeScript. Shared constants are copied
   between them on purpose — the runtime does not allow a `lib/`.

**Expect the target's lint to go red after phase 1** and stay red until the last capability is
migrated. That is the burndown, not a breakage: the boundary rules are enabled before the code
satisfies them, which is what makes progress measurable. Phase 1 separates pre-existing lint debt
from boundary violations so the two are never confused.

## The program

Run in order. Each is a separate `Workflow` call so a human reads the result before the next one.

| # | Workflow | Writes | Gate after it |
| --- | --- | --- | --- |
| 1 | `prepare-architecture-migration` | `rules/`, a draft contract, `migration-manifest.json` | blockers must be empty |
| 2 | `migrate-capability` | one capability, once per capability | **accept / revise / reject** — human |
| 3 | _not written yet_ | the remaining capabilities as a wave | — |

```
Workflow({ name: 'prepare-architecture-migration', args: {
  repo: '/abs/path/to/target',
  ordinaryChange: 'add an optional field to a work item and show it in the list',
}})

Workflow({ name: 'migrate-capability', args: {
  repo: '/abs/path/to/target',
  capability: 'work-items',
  manifestPath: '/abs/path/to/target/migration-manifest.json',
}})
```

Both phase-1 arguments are required. `ordinaryChange` is a blocker rather than a nicety: without it
there is no before-set, so the change-radius comparison — the only oracle that measures whether the
architecture actually helped — cannot run, and steps 4 and 9 of the procedure are skipped.

Three arguments are optional. `contractSource`, omitted, costs a single probe agent that locates the
plugin root — `$CLAUDE_PLUGIN_ROOT`, then the plugin cache, then the surrounding checkout — accepting
a candidate only when all four normative sources exist under it. It resolves once rather than in each
of the fifteen agents that need it, because independent resolutions can disagree and a subset reading
a stale cached version is a split brain nobody notices until the census is wrong.

`dependencyDecisions` and `fileOwners` answer the two questions a run can raise and cannot settle
itself: which side an unclassified package belongs on, and which capability owns a file nothing could
place. Both are checked against *this* run's open list, so a stale answer to an older question is
refused rather than written into a new repository's contract. Without them the correct refusal to
guess was a dead end whose only exit was a second full pass.

`migrate-capability` needs `moduleRoot`. It takes it from the manifest or the target's contract and
**refuses to guess**: every destination path is computed from it, so a default would move a whole
capability into a directory the contract does not name.

There is deliberately no wave workflow yet. The document requires accepting, revising or
rejecting the architecture after the pilot, and a wave workflow written before that decision would
encode assumptions the pilot exists to test.

## Why the pilot is trustworthy: three independent oracles

A migration cannot be verified by reading the migrated code — that is the same judgement that
produced it. All three of these already existed in this repository before the workflows did:

| Oracle | What it is | Must |
| --- | --- | --- |
| Behaviour | the target's own typecheck, lint, tests, **production build** | stay green |
| Architecture | `rules/` — 17 named ESLint messageIds, cycle, ownership, dependency checks | capability at 0, no total above baseline |
| Review | the properties [the document says static rules cannot prove](../docs/adoption-and-enforcement.md) | no must-fix |

Phase 1 records the first two **before** anything moves — behaviour green, violations censused. The
review oracle has no baseline by nature: it is a judgement about the migrated result, so it exists
only in phase 2. The production build is not interchangeable with a dev server: it is what proves
server/client separation.

**An oracle that did not report is not an oracle that reported failure.** When any of the three
returns nothing — including an architecture agent whose tools could not run at all — the pilot's
recommendation is `inconclusive`, not `accept` and not `reject`. `reject` means *reject the
architecture*, so it belongs to the review oracle alone and **dominates the other two**: a rejected
ownership model must reach the human even when behaviour and architecture are also red, which is
exactly when it is most likely to be right. Every verdict carries the `reason` the decision function
computed, rather than one re-derived at the reporting site.

Neither phase runs the capability's **real user workflow**, which step 8 of the procedure requires.
The pilot says so in its `humanGate` output; do it by hand before accepting.

The architectural oracle is a **burndown**, not a pass/fail. Baseline counts per messageId are
censused up front, and the pilot must drive its own capability to zero without raising any total
elsewhere. That distinguishes real progress from moving violations around.

## The three techniques worth knowing

**Destinations are arithmetic, not judgement.** The agent decides a file's *role*
(`domain | application | server | client | ui | surface | stay | delete`); `destination()` in the
script computes the path from the contract. Agents are never asked to propose a layout, so 40 of them
cannot propose 40 layouts. Being computed is not enough on its own — the arithmetic also has to be:

- **admitted** — a role, surface or basename outside the vocabulary rejects the plan;
- **closed** — nothing can resolve outside `moduleRoot/<capability>/`, so an agent-supplied
  basename of `../../evil.ts` is refused rather than followed;
- **injective** — no two sources may resolve to one destination. Without this the mover is handed
  "use these paths exactly" plus "delete the old paths", which overwrites one product file with
  another and deletes the original in the same change.

All three are checked over the whole plan **before the first write** — and over `plan.surfaces` as
well as `plan.moves`, since two entries naming one surface produce two contradictory contracts for a
single path. `moduleRoot` and the admitted vocabulary are validated too: they arrive from the
target's own contract, so an unchecked `"moduleRoot": "../shared-modules"` made "closed" closed only
relative to itself.

`scripts/validate-workflows.mjs` checks this in two layers, because either alone is a blind spot:
the extracted regions are **executed** against tables to prove the logic is correct, and the whole
body is run against **stubbed hooks** to prove it is called. Table tests alone stayed green when a
guard's `if` was replaced with `if (false)`; the source-text greps they replaced stayed green on a
behaviour-preserving rename.

**The global analysis happens once, outside the per-capability agents.** Ownership of every file, the
cross-capability dependency graph, and the server-only/browser-safe classification are facts a
single-capability agent cannot derive correctly — they need the whole tree. Phase 1 concentrates them
in a single Assign agent (not a fan-out: two agents assigning owners produce contested files and
duplicate capabilities) and writes `migration-manifest.json`. Later phases read their own rows.

Two deliberate `parallel()` barriers remain — the inventory lenses and the pilot's verify phase — and
each earns it: the next step consumes the *aggregate* of all results, which is the documented
condition for choosing a barrier over `pipeline()`. The baseline probes used to be a third; they are
now a plain sequential loop, because concurrency there was not a barrier decision at all but a
contention bug.

**Surfaces are derived from consumers, never proposed.** A surface with no named consumer is dropped
from the plan by the script — both from the surface list and from the move that would have created
the file — not argued about by an agent. Conversely a surface that *has* consumers but no existing
file to repurpose is authored fresh, because announcing a surface to the consumer agent without
anything creating it is how "the surfaces that now exist" became a lie.

The named consumer has to be a file this run knows exists: one the load probe recorded (it completes
phase 1's page-level list by grepping the code for every importer), one the manifest assigned to this
capability, or a destination the script itself computed. Earlier the check admitted anything under
the capability directory and anything deep enough under a recorded app folder — prefix tests, which
admit strings rather than files, so an invented path kept a surface alive and the mover published a
public surface no code imports.

## Constraints the scripts enforce because the document requires them

- No framework or library migration rides along; existing schema, form, UI, cache and provider
  libraries are preserved.
- No **permanent** compatibility `lib` / `services` / `utils` / `common` bucket. An adapter at the
  migration edge is allowed — the document sanctions one — but only named, owned, and reported with
  the condition under which it goes away.
- One capability never carries both physical topologies; its obsolete old paths are deleted in the
  same change.
- A boundary failure is reported, not tunnelled around with a re-export, barrel, duplicate or deep
  relative import. The mover must name which one of the document's six statements is true and stop,
  rather than improvise; and a violation is fixed by correcting the dependency, never by
  `eslint-disable` or by widening the contract.

## Known deviations and gaps

Recorded here and, in the same five entries, in the manifest's `deviations`, because § Sources Of Truth says a
disagreement between surfaces is a defect — so these are open items, not settled choices:

- **Step 7 says "for the pilot"; phase 1 enables the checks repo-wide** and before the pilot moves,
  because a pilot-scoped check cannot produce the census the burndown is measured against. Needs a
  decision on the document, not a quiet exception.
- **Files assigned `placement: "shared"` are migrated by neither workflow.** Phase 2 is
  capability-scoped and its role vocabulary has no shared role; shared admission remains an explicit
  review gate.
- **Neither phase runs the capability's real user workflow** (step 8) or compares runtime behaviour
  beyond the behaviour oracle's verdict. The pilot states both in its output.
- **Enforcement property 7 cannot be green at baseline.** `check-database-resources.mjs` attributes an
  accessing subject from `moduleRoot`, `sharedRoot` and `appRoot`; before migration every data-access
  file is outside all three, so the subject is null and no ownership map can admit it. Phase 1 records
  the check as red rather than requiring it to pass, and refuses the one thing that would force it
  green — declaring roots that describe a layout the repository does not have. It must go green during
  the pilot; if it does not, the roots or the ownership map are wrong.
- **The Product Profile is partially recorded.** The manifest keeps the six lenses' findings and
  lists what remains: schema/form/cache/notification libraries, store and remote-provider ownership,
  the auth and tenancy model, route-private and shared UI conventions, and accepted migration debt
  with owner and removal condition.

## Notes on the runtime

- No filesystem or shell from the script body. Reading `migration-manifest.json` into JavaScript
  therefore costs one schema'd probe agent; writing it costs one more.
- Phase 1's build probes run **sequentially**, not in a barrier: `tsc`, the production build, the
  test run and ESLint all write into the same working tree, and a contended baseline fails on a
  repository that is fine. The baseline is what every later verdict is measured against.
- `Date.now()`, `Math.random()` and argless `new Date()` throw — they would break resume.
- Concurrency is capped at `min(16, cores − 2)`; phase 1's six lenses run in one batch on any
  machine with eight cores or more.
- To iterate without re-sending a script, edit the persisted copy under the session directory and
  re-invoke with `{ scriptPath }`; add `resumeFromRunId` to replay the unchanged prefix from cache.
- When a run returns something unexpected, read `journal.jsonl` in the run's transcript directory
  before theorising: it records each agent's actual return value.
