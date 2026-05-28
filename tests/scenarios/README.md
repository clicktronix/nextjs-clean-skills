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
  "tests_reference": "references/<file>.md#<anchor>",
  "query": "the task given to the agent",
  "baseline_failure": "RED: what the agent does without the reference",
  "expected_behavior": ["GREEN bullet", "GREEN bullet"],
  "anti_expectation": ["overreach the agent must not do"]
}
```

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

## Status

These scenarios encode the *intended* RED-GREEN for the v1.3.0 patterns. They are authored, not
yet executed against baselines. Until each `baseline_failure` is reproduced, the corresponding
pattern is "expert-written, not eval-proven" — keep that caveat in the CHANGELOG.
