---
name: migrating-architecture
description: >-
  Use when an existing Next.js repository is adopting the capability-first architecture from
  this plugin: inventory, assignment, enabling the rules, moving one capability at a time,
  verifying against the target's own checks, and deciding accept, revise or reject. Runs in the
  session as the owner of the whole procedure, with subagents only for judgement and per-slice
  work. Not for ordinary feature or component tasks.
---

# Migrating Architecture

You own the migration end to end. Agents give opinions and do slices; you list files, write
manifests, run checks, read diffs, and decide. The procedure is the ten steps of
`docs/adoption-and-enforcement.md` § Adopt In An Existing Project; this skill is how a session
executes them without handing the run to a controller it cannot see.

Resolve the plugin root once: `$CLAUDE_PLUGIN_ROOT`, else the directory holding this file's
`../..`. Call it `PLUGIN`. Every command below is
`node $PLUGIN/bin/migration.mjs <command> --repo <target>`; run it, do not paraphrase it.

Normative source: `$PLUGIN/docs/architecture-contract.md` and `$PLUGIN/docs/runtime-boundaries.md`.
Where a slice or a reference disagrees, the normative source wins.

## Before anything runs

Confirm the target is on a throwaway branch with a clean tree and green checks. Record the
target's own check command (applicable type, lint, test and build checks) — that command, run by
you, is the only behaviour evidence this procedure accepts. Record one ordinary follow-up
change **inside the pilot capability**; a change elsewhere measures nothing. Tell the user the
cost shape: at most six lens agents for inventory, one assignment agent, one mover per slice,
one reviewer per verification, and one heavy check per tree state.

## Step 1 — Inventory (mechanical, then six lenses)

1. `inventory --source-root <root>` — lists every source file once. No agent lists a tree.
2. `Workflow({ name: 'nextjs-clean-skills:inventory', args: { repo, inventoryPath, contractSource: PLUGIN } })`
   — six read-only lenses over that list. A silent lens is re-run alone or replaced by your own
   reading; it is not a failed inventory.

## Step 2 — Assign (one decision, expanded by the script)

Dispatch one subagent with the lens findings and the inventory path. It answers with coverage
rules — `prefix` or `file`, each carrying placement, capability, runtime — plus an `unassigned`
list with `likelyCapability`. Then `expand --rules <file>`. Exit 2 lists uncovered files: decide
them yourself or ask the same agent about exactly those. Dead rules are a warning you read.
`shared` rows outside the shared root are recorded as undeliverable, not refused. Read
[inventory and assignment](references/inventory-and-assignment.md) for the rule shape.

## Step 3 — Enable (you write, the census measures)

Copy `$PLUGIN/rules/` into the target, draft `rules/architecture-contract.json` from the roots
lens, and spread the two ESLint configs after the target's own. Choose the repository's deciding
check command once and reuse it in baseline and fix rounds. The optional
`node rules/check-module-cohesion.mjs` reports advice separately; directory shape does not decide
acceptance or trigger mandatory cleanup. Install the census configuration
repo-wide so violations can be counted, but keep the **blocking** entry scoped to roots that are
already migrated — widen it per accepted capability. The target's lint must stay judgeable as
its own gate. Take the baseline with one record whose lint step also writes
`eslint <sourceRoot> --format json --output-file "$NCS_ARTIFACTS/lint.json"`, so lint runs once
per tree state into a directory that exists only for this run:
`record --label baseline --artifact lint.json -- '<check command>'` — the command in single
quotes, so `$NCS_ARTIFACTS` reaches the check unexpanded — then
`census --record <path> --lint-json lint.json --contract rules/architecture-contract.json`.
Keep that census: later ones pass it as `--baseline` so a counter fixed to zero reads as zero.
`census` refuses a file the command did not write, or that changed since.

## Step 4 — Plan one capability (agent decides roles, script computes paths)

Ask one subagent for per-file roles and the surfaces real consumers need. Run
`plan-check --contract rules/architecture-contract.json --capability <name> --plan <file>
--assignments .nextjs-clean-migration/assignments.json --consumers <file>`; fix or re-ask on any
problem it names. Destinations come from `destination`, never from an agent.

## Step 5 — Move (per-slice subagents, you accept by diff)

One mover per slice: internals first, then consumers onto the new surfaces. A mover that finds
a wrong role or a missing surface returns `{replan: …}`: revise through `plan-check` and
re-dispatch. A slice that fails again is yours to look at — change the brief, shrink the slice,
or move it yourself; independent slices continue. Before accepting any slice read the full
`git status` and diff, including untracked files. A probe cleans up only what it created. Read
[move and verify](references/move-and-verify.md).

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

Feed must-fix findings and red counters to a fix subagent, surgical edits only, then verify
again. A round that changes nothing any reader can see ends the attempt and returns the slice
to you; it does not end the migration. Verify should-fix findings yourself and fix the ones
that hold. `recommend --input <oracles.json>` names the gate and distinguishes an exhausted
budget from a red result.

## Decision Gate

Ask the user once after the first pilot: accept the ownership model, revise this migration, or
reject the model. After that, ask only when a finding requires changing the agreed policy or
someone's authority; fixing a violation of an agreed policy needs no new permission. Before
accept, the real user path is exercised in the running app — say so if it was not. Read
[acceptance](references/acceptance.md).

## What this skill never does

It never lets an agent list a tree, transcribe a manifest, run the heavy check to form a
verdict, `pkill` by name, or delete a directory it did not create. It never stops the run on a
count. It never adds `Co-Authored-By` where the repository forbids it.
