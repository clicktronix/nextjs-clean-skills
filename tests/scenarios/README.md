# Skill evaluation scenarios

Eval scenarios for the two skills, following Anthropic's
[evaluation-driven development](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)
and the superpowers `writing-skills` RED-GREEN-REFACTOR loop.

Each scenario records the full TDD cycle for one pattern, not just the happy path:

- **`baseline_failure`** — the RED. What an agent does *without* the reference. If you cannot
  reproduce this baseline (the agent already does the right thing unprompted), the reference is
  redundant and should be cut — it only costs context.
- **`expected_behavior`** — the GREEN. What the agent should do *with* the reference loaded.
- **`anti_expectation`** — the REFACTOR guardrail. Overreach the agent must *not* commit
  (e.g. applying a "rare" pattern everywhere). Catches the loophole where a reference makes the
  agent over-apply a narrow technique.

## Format

```json
{
  "skills": ["nextjs-architecture"],
  "tests_reference": "<skill-relative-file>.md#<anchor>",
  "query": "the task given to the agent",
  "baseline_failure": "RED: what the agent does without the reference",
  "expected_behavior": ["GREEN bullet", "GREEN bullet"],
  "anti_expectation": ["overreach the agent must not do"]
}
```

`tests_reference` may target the skill body (`SKILL.md#<anchor>`) or a file under
`references/`; it is resolved relative to the first skill in `skills`.

Optional once a baseline has actually been run: record results in a `baseline_observed` object
(`date`, `method`, `runs[]` of `{model, framing, red}`, and a `verdict`). This is what turns a
scenario from "authored" into "eval-run" — the validator does not require it, but an unannotated
scenario is still just a hypothesis.

This contract is enforced: `npm run validate` runs `scripts/validate-scenarios.mjs`, which checks
every scenario for the required keys, non-empty `skills`/`expected_behavior`/`anti_expectation`,
known skill names, and a `tests_reference` whose file and `#anchor` actually resolve (anchors are
slugified with GitHub semantics — runs of spaces are not collapsed). A scenario that drifts out of
sync with its reference fails CI rather than rotting silently.

## Running

There is no built-in LLM-judge runner (Anthropic does not ship one). Run manually:

1. **RED:** open a fresh agent session with the skill *disabled*, paste `query`, confirm it
   produces `baseline_failure`. Record verbatim. If it doesn't fail, delete the scenario and the
   reference it guards.
2. **GREEN:** new session with the skill *enabled*, same `query`, confirm `expected_behavior`.
3. **REFACTOR:** vary the `query` toward the `anti_expectation` trap; confirm the agent declines
   to over-apply. Add an explicit counter to the reference if it falls for the trap.

Test against every model the skill targets (Haiku/Sonnet/Opus) — guidance that an Opus session
treats as obvious may still need spelling out for Haiku.

**Harness limitation — isolate the working directory.** Run the RED agent in an empty/throwaway
directory, or explicitly tell it "this is a hypothetical, do not read the filesystem." A baseline
agent that inherits a real project's CWD will explore it: in observed runs some agents got
distracted and asked clarifying questions (invalid), and one read the template's own clean-arch
patterns and produced the *correct* answer — a false pass that hides a real RED. Self-contained
"write this method" scenarios are robust to this; open-ended "build this page/feature" scenarios
are not. Treat any baseline where the agent referenced real project files as confounded.

## Status

Three of the original four patterns are eval-proven (full RED->GREEN), recorded in their
`baseline_observed` and `green_check`:

- **defense-in-depth-ownership** — RED 3/3 (haiku+adversarial), GREEN with reference loaded.
- **explicit-variants-over-mode** — RED 2/2 valid, GREEN with reference loaded.
- **compound-provider-split** — RED 3/3, GREEN with reference loaded.

The same weak model under the same lazy framing flips from the failure to the correct pattern once
the reference is present — so these references earn their place; they are not redundant for their
audience (weak models / lazy prompts). Strong models, or weak models on neutral prompts, already do
the right thing, so the value is narrow but real.

- **rsc-hybrid-read** — re-run isolated with a reshaped narrow query (the original "build a page"
  wording was not cleanly eval-able). Baseline was INCONSISTENT — haiku reaches the correct
  `initialData` hybrid ~half the time unprompted, only borderline-failing otherwise (useState
  instead of `initialData`). This was the weakest-justified of the four, so its standalone section
  was **merged into one prose line** in `data-ownership-and-cache.md` (seed initialData not
  useState + explicit freshness); the scenario's `tests_reference` now points to the file. The
  other three stay as full sections.

GREEN here is n=1 per cell (single confirmation that the reference flips the behavior). Cheap to
re-run if a reference is later edited — per the Iron Law, a reference edit needs its own RED->GREEN.

Three audit-regression scenarios added in 1.3.1 are deliberately marked as hypotheses:
transport-neutral error mapping, Sentry instrumentation ownership, and the public TanStack
MutationCache callback. They enforce reference/anchor drift in CI but are not called load-bearing
until isolated RED and GREEN runs are recorded.

The larger Profile Gate candidate was rejected after an ablation run on 2026-07-10: Haiku with
each full skill minus only that gate preserved the existing stack in architecture 2/2 and component
2/2 runs. The multi-line gates and scenario were cut; one fallback sentence remains to define what
"Default Profile" means without adding a new behavioral procedure.

## Coverage by reference

Honest map of which references are eval-backed and which are still hypotheses (an
unannotated reference is guidance we *believe* helps, not guidance we've *watched* help).
When editing an untested reference, consider authoring its scenario first.

| Reference | Scenario | Status |
| --- | --- | --- |
| nextjs-architecture/security-dal-and-auth | defense-in-depth-ownership | **eval-proven** (RED 3/3 → GREEN) |
| nextjs-architecture/data-ownership-and-cache | rsc-hybrid-read | inconsistent baseline → section merged to one prose line |
| react-component-creator/component-structure-composehooks | compound-provider-split | **eval-proven** (RED 3/3 → GREEN) |
| react-component-creator/state-placement | explicit-variants-over-mode | **eval-proven** (RED 2/2 → GREEN) |
| nextjs-architecture/clean-architecture-boundaries | — | untested |
| nextjs-architecture/runtime-and-compile-time-boundaries | — | untested |
| nextjs-architecture/backend-service-patterns | — | untested |
| nextjs-architecture/supabase-persistence-boundaries | transport-neutral-error-mapping | hypothesis (not run) |
| nextjs-architecture/security-env-validation | — | untested |
| nextjs-architecture/observability-and-sentry | sentry-instrumentation-first | hypothesis (not run) |
| nextjs-architecture/testing-by-layer | — | untested |
| nextjs-architecture/glossary | — | n/a (terminology, no behaviour to eval) |
| react-component-creator/server-client-boundary | — | untested |
| react-component-creator/forms-and-actions | — | untested |
| react-component-creator/notifications-and-feedback | global-mutation-error-notifier | hypothesis (not run) |
| react-component-creator/styling-and-i18n | — | untested |
