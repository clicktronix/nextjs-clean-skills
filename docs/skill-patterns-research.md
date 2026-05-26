# Skill Patterns Research

This note compares `nextjs-clean-skills` with the public skill systems in
[`obra/superpowers`](https://github.com/obra/superpowers) and
[`garrytan/gstack`](https://github.com/garrytan/gstack), plus the Codex skill model described by
OpenAI's skill catalog.

## Source Patterns

### superpowers

`superpowers` treats skills as executable process discipline, not passive documentation. The most
useful pattern is pressure-testing a skill like code: define a realistic scenario, observe where an
agent fails without the skill, write the minimum guidance that blocks that failure, then re-test.
Its `writing-skills` guidance is especially relevant:

- frontmatter `description` should describe trigger conditions, not summarize the workflow;
- keywords should match the words an agent or user would use while looking for the skill;
- heavy details should move out of `SKILL.md` into references;
- common mistakes and rationalizations should be named directly;
- verification must happen before success claims.

### gstack

`gstack` is less minimal, but it has strong operational patterns:

- explicit routing rules that map user intent to skills;
- preflight context collection before a workflow starts;
- review and QA gates with required output sections;
- specialist subflows for review, investigation, design, and shipping;
- "completion status" discipline: claims must be backed by fresh evidence.

Most `gstack` preambles and telemetry hooks are too product-specific for this repository. The
portable part is the gate structure: classify first, execute, verify, then report.

### OpenAI/Codex Skill Model

The OpenAI skill catalog describes skills as folders of instructions, scripts, and resources that
Codex can discover and reuse for repeatable tasks. That aligns with this repository's current
shape: short `SKILL.md` files, optional `references/`, and validation scripts. The best fit is to
keep `SKILL.md` lean and make references loadable only when the architecture decision needs them.

## Fit Against nextjs-clean-skills

What already matches:

- `SKILL.md` files are concise and route to `references/` instead of embedding long docs.
- Human-facing rationale lives in `docs/`, not in agent-loaded skill bodies.
- Validation scripts check frontmatter, reference links, stale phrasing, and content duplication.
- The two skills have clear domain separation: architecture vs UI component creation.

Gaps found:

- Trigger descriptions were accurate but could include more search keywords without describing the
  workflow.
- The skills lacked an explicit "classification before editing" gate, even though
  `docs/agent-decision-maps.md` already recommends it.
- Verification existed as checklist items, but not as a named evidence gate.
- Common failure modes were spread across references instead of visible in the main skill body.

## Applied Patterns

The repository now adopts these patterns:

- `description` must start with `Use when` and stay under 500 characters.
- Every skill must include `Decision Gate`, `Common Failure Modes`, and `Verification Gate`.
- `Decision Gate` forces architecture or component classification before code changes.
- `Verification Gate` requires fresh evidence before reporting success.
- Failure modes are short, concrete, and close to the top-level workflow.

## Deferred Patterns

Do not import these patterns yet:

- gstack-style generated preambles, telemetry, and update checks: too heavy for portable plugin
  skills and not supported by the current Codex/Claude marketplace contract.
- hooks such as destructive-command guards: useful, but they belong in a separate safety plugin.
- subagent pressure-test automation: valuable later, but the current repo has lightweight npm
  validation only. Add scenario/eval tests once expected agent outputs are defined.
