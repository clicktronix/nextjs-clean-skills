# Migration workflows

Two small workflows that the `migrating-architecture` skill calls for the parts of a migration
that genuinely need parallel judgement. They execute nothing mechanical: listing files, expanding
coverage rules, computing destinations, screening a plan, running the target's checks and
deciding the gate are done by `../bin/migration.mjs`, a dependency-free Node script the session
runs itself. The procedure they serve is
[`docs/adoption-and-enforcement.md`](../docs/adoption-and-enforcement.md) § Adopt In An Existing
Project; where the two disagree, the document wins and the script is the defect.

| Workflow | Agents | Reads | Returns |
| --- | --- | --- | --- |
| `inventory` | ≤ 6, one per lens, in parallel | the inventory file the script wrote | findings per lens, silent lenses by name |
| `verify` | 1 reviewer + 1 optional radius estimate, in parallel | one check record the session took | review verdict with findings, advisory radius, axes with no verdict |

```
Workflow({ name: 'nextjs-clean-skills:inventory', args: {
  repo: '/abs/path/to/target',
  inventoryPath: '/abs/path/to/target/.nextjs-clean-migration/inventory.json',
  contractSource: '/abs/path/to/the/installed/plugin/root',
  lenses: ['routes', 'capabilities', 'runtime', 'data', 'deps', 'roots'],   // optional subset
}})

Workflow({ name: 'nextjs-clean-skills:verify', args: {
  repo: '/abs/path/to/target',
  capability: 'work-items',
  recordPath: '/abs/path/to/target/.nextjs-clean-migration/records/<id>.json',
  diffBase: '<commit the migration diff is read against>',
  contractSource: '/abs/path/to/the/installed/plugin/root',
  ordinaryChange: 'add an optional field to a work item and show it in the list',   // optional
  baselineRadius: '7 files across 4 roots',                                          // optional
  reviewerBudget: 60,                                                                // turns, optional
}})
```

Both refuse a missing argument before any agent runs — that is what the validator's "missing
record" scenario proves; whether the record file exists and is fresh is checked by the CLI
(`migration.mjs record-fresh`), which the skill runs first. `reviewerBudget` is a turn count the
reviewer is told in its brief, not a limit the runtime enforces; a reviewer that reports
exhaustion yields no verdict.

## The script

```
node <plugin>/bin/migration.mjs inventory    --repo R --source-root src
node <plugin>/bin/migration.mjs expand       --repo R --rules rules.json          # exit 2 = uncovered files to decide
node <plugin>/bin/migration.mjs destination  --repo R --contract rules/architecture-contract.json --capability C --role domain --file src/x.ts
node <plugin>/bin/migration.mjs plan-check   --repo R --contract … --capability C --plan plan.json --assignments a.json --consumers c.json
node <plugin>/bin/migration.mjs record       --repo R --label check --artifact lint.json -- '<check command writing lint JSON to "$NCS_ARTIFACTS/lint.json">'   # single-quoted
node <plugin>/bin/migration.mjs record-fresh --repo R --record <path>              # exit 3 = stale
node <plugin>/bin/migration.mjs census       --repo R --record <path> --lint-json lint.json --contract … --capability C [--baseline <census>]
node <plugin>/bin/migration.mjs recommend    --input oracles.json
```

State lives under `<target>/.nextjs-clean-migration/` (inventory, assignments, records). It is the
tool's own directory and never counts towards a record's tree state.
