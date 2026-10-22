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

You own the migration end to end. Agents give opinions and do slices; you list files, write
manifests, run checks, read diffs, and decide. The procedure is the ten steps of
`$PLUGIN/docs/adoption-and-enforcement.md` § Adopt In An Existing Project; this skill is how a session
executes them without handing the run to a controller it cannot see.

Resolve the plugin root once: `$CLAUDE_PLUGIN_ROOT`, else the directory holding this file's
`../..`. Call it `PLUGIN`. Every command below is
`node $PLUGIN/bin/migration.mjs <command> --repo <target>`; run it, do not paraphrase it.

Normative source: `$PLUGIN/docs/architecture-contract.md` and `$PLUGIN/docs/runtime-boundaries.md`.
Where a slice or a reference disagrees, the normative source wins.

## Before anything runs

Confirm the target is on a throwaway branch with a clean tree and green checks. Record the
target's own check command (applicable type, lint, test and build checks) — that command, run by
you, is the only behaviour evidence this procedure accepts. Tell the user the cost shape: at most
six lens agents for inventory, one assignment agent, one planner and one mover per slice, one
reviewer per verification (plus one radius estimator when an ordinary change is recorded), and one
heavy check per tree state.

## Step 1 — Inventory (mechanical, then six lenses)

1. `inventory --source-root <root>` — lists every source file once. No agent lists a tree.
2. `Workflow({ name: 'nextjs-clean-skills:inventory', args: { repo, inventoryPath, contractSource: PLUGIN } })`
   — six read-only lenses over that list. A silent lens is re-run alone or replaced by your own
   reading; it is not a failed inventory.

## Step 2 — Assign (one decision, expanded by the script)

Read [inventory and assignment](references/inventory-and-assignment.md) first: it holds the rule
shape and the meaning of each expansion field.

1. Dispatch one subagent with the lens findings and the inventory path. It answers with coverage
   rules and an `unassigned` list.
2. `expand --rules <file>`. Exit 2 lists uncovered files: decide them yourself or ask the same
   agent about exactly those. Dead rules are a warning you read. A `shared` row outside the shared
   root is never part of a capability plan; the reference says how it moves.
3. Pick the pilot: score capabilities by completeness, real consumers and few inbound
   dependencies, and take one that an ordinary follow-up change lives in; otherwise the radius
   comparison is about a different capability.
4. Record that follow-up change and the files it touches (the `baselineRadius` of Step 6). A
   change outside the pilot measures nothing.

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
   `eslint <sourceRoot> --format json --output-file "$NCS_ARTIFACTS/lint.json"`, so lint runs once
   per tree state into a directory that exists only for this run:
   `record --label baseline --artifact lint.json -- '<check command>'` — the command in single
   quotes, so `$NCS_ARTIFACTS` reaches the check unexpanded.
7. `census --record <path> --lint-json lint.json --contract rules/architecture-contract.json`.
   `census` refuses a file the command did not write, or that changed since. Keep this census:
   later ones pass it as `--baseline` so a counter fixed to zero reads as zero.

## Step 4 — Plan one capability (agent decides roles, script computes paths)

Read [plan shape](references/plan-shape.md) first and give it to the planner. Ask one subagent for
per-file roles and the surfaces real consumers need. Run
`plan-check --contract rules/architecture-contract.json --capability <name> --plan <file>
--assignments .nextjs-clean-migration/assignments.json --consumers <file>`; fix or re-ask on any
problem it names. Destinations come from `destination`, never from an agent.

## Step 5 — Move (per-slice subagents, you accept by diff)

Read [move and verify](references/move-and-verify.md) first: it holds the mover's brief and the
cleanup rules.

One mover per slice: internals first, then consumers onto the new surfaces. A mover that finds
a wrong role or a missing surface returns `{replan: …}`: revise through `plan-check` and
re-dispatch. A slice that fails again is yours to look at — change the brief, shrink the slice,
or move it yourself; independent slices continue. Before accepting any slice read the full
`git status` and diff, including untracked files.

## Step 6 — Verify (one record, two readers)

`record --label check --artifact lint.json -- '<the same check command>'`; `record-fresh` before
anyone reads it; `census --record <path> --lint-json lint.json --contract … --capability <name>
--baseline <baseline census>`. The record's exit code is evidence about
those checks, not a proof that product behaviour is preserved; the reviewer and the real user
path cover the rest.
`Workflow({ name: 'nextjs-clean-skills:verify', args: { repo, capability, recordPath, diffBase,
contractSource: PLUGIN, ordinaryChange, baselineRadius } })`. Behaviour is the record's exit
code; architecture is `census` over a JSON lint record; the workflow returns the review and an
advisory radius. Nobody re-runs the check to form an opinion, and nobody waits for a file to
appear. A change that affects the check invalidates the record: take a new one.

## Step 7 — Fix or hand back

Read [acceptance](references/acceptance.md) first: it holds the input shape of `recommend` and
what to tell the user.

Feed must-fix findings and red counters to a fix subagent, surgical edits only, then verify
again. A round that changes nothing any reader can see ends the attempt and returns the slice
to you; it does not end the migration. Verify should-fix findings yourself and fix the ones
that hold. `recommend --input <oracles.json>` names the gate and distinguishes an exhausted
budget from a red result.

## Decision Gate

Ask the user once after the first pilot: accept the ownership model, revise this migration, or
reject the model. Offer the gate `recommend` named as the recommended option; resolve an `inconclusive` gate before asking.
After that, ask only when a finding requires changing the agreed policy or someone's authority;
fixing a violation of an agreed policy needs no new permission. Before accept, the real user path
is exercised in the running app — say so if it was not.
