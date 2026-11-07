# Migration workflows

Optional host adapters for `migrating-architecture`. Use them only when the client exposes a
`Workflow` tool. Codex and other clients without that tool execute the same procedure with native
tools: read `ALL_LENSES` in `inventory.js`, and the review brief/schema in `verify.js`; answer them
sequentially or delegate selected work. Reading a brief does not require executing its JS file.
The skill checks host availability before changing the target. File listing, plan screening,
checks and gate arithmetic live in `../bin/migration.mjs`. Its `lint` command uses the target's
existing ESLint installation and records diagnostics with effective rule/file coverage.
The procedure they serve is
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
  lenses: ['routes', 'capabilities', 'runtime', 'data', 'deps', 'roots'],   // explicit selected topics; no default fan-out
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

These adapters require host globals (`agent`, `parallel`, `phase`, `log`) and cannot run as
ordinary Node scripts. `validate-workflows.mjs` uses a stub host; it does not prove a client runtime
or agent behaviour. Both refuse a missing argument before any agent runs — that is what the validator's "missing
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
node <plugin>/bin/migration.mjs lint         --repo R --contract rules/architecture-contract.json --output-file "$NCS_ARTIFACTS/lint.json"
node <plugin>/bin/migration.mjs record       --repo R --label check --artifact lint.json -- '<check command writing lint JSON to "$NCS_ARTIFACTS/lint.json">'   # single-quoted
node <plugin>/bin/migration.mjs record-fresh --repo R --record <path>              # exit 3 = stale
node <plugin>/bin/migration.mjs census       --repo R --record <path> --lint-json lint.json --contract … --capability C [--baseline <census>]
node <plugin>/bin/migration.mjs recommend    --input oracles.json
```

State lives under `<target>/.nextjs-clean-migration/` (inventory, assignments, records). It is the
tool's own directory and never counts towards a record's tree state.
