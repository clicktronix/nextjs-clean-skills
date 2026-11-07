---
name: migrating-architecture
description: >-
  Use when the user asks to migrate, adopt or convert an existing Next.js repository to the
  capability-first architecture, to continue such a migration, or to enable its boundary lint rules
  in a partly migrated repository. Moves it one capability at a time and accepts, revises or
  rejects each step against the target's own checks. Not for deciding where new behaviour belongs
  (use designing-architecture), nor for component work (use creating-react-components).
---

# Migrating Architecture

You own the migration end to end: list files, write manifests, run checks, read diffs, and decide.
Use native subagents for independent judgement or slices only when useful; otherwise do the same
work sequentially yourself. The procedure is the ten steps of
`$PLUGIN/docs/adoption-and-enforcement.md` § Adopt In An Existing Project; this skill is how a session
executes them without handing the run to a controller it cannot see.

Resolve the plugin root once: `$CLAUDE_PLUGIN_ROOT`, else the directory holding this file's
`../..`. Export this absolute path as `PLUGIN` in each shell running `record`, so the recorded
child command inherits it. Every command below is
`node $PLUGIN/bin/migration.mjs <command> --repo <target>`.

Normative source: `$PLUGIN/docs/architecture-contract.md` and `$PLUGIN/docs/runtime-boundaries.md`.
Where a slice or a reference disagrees, the normative source wins.

## Before anything runs

Confirm the target is on a throwaway branch with a clean tree and green checks. Record the
target's own check command (applicable type, lint, test and build checks) — that command, run by
you, is the only behaviour evidence this procedure accepts. Inspect the client's available tools
before changing the target. The default is owner-led execution; no Workflow runtime is required.
If delegating, state the selected roles, model/effort and estimated cost (or that price is unknown).
Do not spawn six readers just because six inventory topics exist.

## Step 1 — Inventory

1. `inventory --source-root <root>` lists source and colocated assets once. Generated directories
   may be explicitly excluded with `--exclude <comma-separated directory names>`; record why.
2. Read the six topic briefs in `$PLUGIN/workflows/inventory.js` (`ALL_LENSES`) as a checklist,
   using the inventory it names. Answer clear topics yourself; delegate only unresolved independent
   topics. Keep findings with cited paths and explicit unknowns. Nobody re-lists the tree.
3. Only if the client actually exposes `Workflow`, it may dispatch the selected topics:
   `Workflow({ name: 'nextjs-clean-skills:inventory', args: { repo, inventoryPath,
   contractSource: PLUGIN, lenses: selectedTopics } })`. Otherwise read the same briefs with native
   tools or native subagents. These JS files are host adapters, not executable Node scripts.

## Step 2 — Assign (one decision, expanded by the script)

Read [inventory and assignment](references/inventory-and-assignment.md) first: it holds the rule
shape and the meaning of each expansion field.

1. Use the findings and inventory path to decide coverage rules and an `unassigned` list; delegate
   this decision only if a second reader adds value.
2. `expand --rules <file>`. Exit 2 lists uncovered files: decide them yourself or ask the same
   agent about exactly those. Dead rules are a warning you read. A `shared` row outside the shared
   root is never part of a capability plan; the reference says how it moves.
3. Pick the pilot: score capabilities by completeness, real consumers and few inbound
   dependencies, and take one that an ordinary follow-up change lives in.
4. Record that follow-up change and the files it touches (the `baselineRadius` of Step 6).

## Step 3 — Enable (you write, the census measures)

Prerequisites: the target uses ESLint flat config and has `eslint-plugin-import` and
`eslint-import-resolver-typescript` installed — the resolved tier needs both.

1. Copy `$PLUGIN/rules/` into the target.
2. Draft `rules/architecture-contract.json`: roots and aliases from the roots lens, every direct
   dependency classified as `purePackages` or `runtimePackages` from the deps lens (ask the user
   about the ones the lens could not decide), and for Supabase repositories `databaseClientIdentifiers`
   and `databaseResources` from the data lens.
3. Spread both ESLint configs after the target's own through `censusScope`
   (`$PLUGIN/rules/README.md` § Census Scope). The blocking list holds only roots already migrated and is
   empty before the pilot; widen it per accepted capability. The target's lint stays judgeable as
   its own gate while the rest is counted as warnings.
4. Add `node rules/check-module-cycles.mjs` and `node rules/check-dependency-classification.mjs`
   (and `check-database-resources.mjs` for Supabase) to the check command. The optional
   `check-module-cohesion.mjs` reports advice only; directory shape does not decide acceptance or
   trigger mandatory cleanup.
5. Choose the repository's deciding check command once and reuse it in baseline and fix rounds.
6. Take the baseline with one record whose lint step also writes
   `node "$PLUGIN/bin/migration.mjs" lint --repo <target> --contract rules/architecture-contract.json
   --output-file "$NCS_ARTIFACTS/lint.json"`, so lint runs once
   per tree state into a directory that exists only for this run:
   `record --label baseline --artifact lint.json -- '<check command>'` — the command in single
   quotes, so `$NCS_ARTIFACTS` reaches the check unexpanded.
7. `census --record <path> --lint-json lint.json --contract rules/architecture-contract.json`.
   `census` refuses changed/unbound artifacts, stale records, missing source coverage and inactive
   mandatory rules. The artifact binds coverage and diagnostics from the same ESLint instance;
   bare ESLint JSON has no coverage proof and is refused. A missing capability is
   unmeasured, never zero. Keep this census:
   later ones pass it as `--baseline` so a counter fixed to zero reads as zero.

## Step 4 — Plan one capability

Read [plan shape](references/plan-shape.md). Decide per-file roles, cohesive relative subpaths and
the surfaces real consumers need, yourself or with a planner. Run
`plan-check --contract rules/architecture-contract.json --capability <name> --plan <file>
--assignments .nextjs-clean-migration/assignments.json --consumers <file>`; fix or re-ask on any
problem it names. `destination` validates and joins the chosen role and `relativePath`; preserve
useful local folders and colocated tests instead of flattening them.

## Step 5 — Move (you accept by diff)

Read [move and verify](references/move-and-verify.md) first: it holds the mover's brief and the
cleanup rules. Establish source-tree behaviour checks using
[Testing By Capability Surface](../designing-architecture/references/quality/testing-by-capability.md)
before moving logic.

Move one slice yourself or assign one mover: internals first, then consumers onto new surfaces.
A mover that finds a wrong role or a missing surface returns `{replan: …}`: revise through `plan-check` and
re-dispatch. A slice that fails again is yours to look at — change the brief, shrink the slice,
or move it yourself; independent slices continue. Before accepting any slice read the full
`git status` and diff, including untracked files.

## Step 6 — Verify (one record, review and optional radius)

`record --label check --artifact lint.json -- '<the same check command>'`; `record-fresh` before
anyone reads it; `census --record <path> --lint-json lint.json --contract … --capability <name>
--baseline <baseline census>`.
Read `$PLUGIN/workflows/verify.js`: use its `RECORD_BLOCK`, review brief and output schema with a
native reviewer, or review sequentially yourself. Estimate radius only when `ordinaryChange` and a
comparable baseline exist. Label an owner review as self-review; missing or unfinished review is
unmeasured. Every verdict cites the record read. If `Workflow` is available, the optional adapter is:
`Workflow({ name: 'nextjs-clean-skills:verify', args: { repo, capability, recordPath, diffBase,
contractSource: PLUGIN, ordinaryChange, baselineRadius } })`.

Behaviour evidence is the record's exit code; it covers the checks, not product behaviour, which the
reviewer and the real user path cover. The tests recorded before the move run again here.
Architecture evidence is `census` over a JSON lint record.
Nobody re-runs the check to form an opinion. A change that affects the check invalidates the record:
take a new one.

## Step 7 — Fix or hand back

Read [acceptance](references/acceptance.md) first: it holds the input shape of `recommend` and
what to tell the user.

Fix confirmed findings and red counters yourself or with a scoped subagent, then verify again.
A round that changes nothing any reader can see ends the attempt and returns the slice
to you; it does not end the migration. Verify should-fix findings yourself and fix the ones
that hold. `recommend --input <oracles.json>` names the gate and distinguishes an exhausted
budget from a red result.

## Decision Gate

Ask the user once after the first pilot: accept the ownership model, revise this migration, or
reject the model. Offer the gate `recommend` named as the recommended option; resolve an `inconclusive` gate before asking.
After that, ask only when a finding requires changing the agreed policy or someone's authority;
fixing a violation of an agreed policy needs no new permission. Before accept, the real user path
is exercised in the running app — say so if it was not.
