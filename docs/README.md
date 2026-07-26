# Architecture Docs

Human-facing architecture notes for `nextjs-clean-skills`.

These documents explain the architecture contract behind the skills. They are not loaded by
Claude Code or Codex automatically and should not be copied into `SKILL.md`. Keep the skills
short and operational; use these docs when onboarding a team, reviewing a feature slice, or
explaining why the boundaries exist.

## Audience

| Document | Read this when you... |
| --- | --- |
| [Architecture Contract](./architecture-contract.md) | join the team, plan a major feature, review architecture, write an ADR, or need to explain *why* a layer rule exists |
| [Agent Decision Maps](./agent-decision-maps.md) | configure a coding agent, review an agent-generated PR, or onboard a new contributor to placement decisions |
| [Evidence](./evidence.md) | question a rule, propose changing one, or need the counts a rule was derived from |

## Documents

- [Architecture Contract](./architecture-contract.md) — layer model, dependency direction, why a
  port is not automatic, why one wrapper, runtime flow, security boundary, data ownership,
  persistence rules, and the **rationale** behind each forbidden import.
- [Agent Decision Maps](./agent-decision-maps.md) — compact flowcharts for coding agents and
  reviewers to decide where code belongs before editing, plus a copy-paste prompt add-on.
- [Evidence](./evidence.md) — what each rule is based on: measured, canonical, or judgement, with
  the command behind every count. A rule whose evidence no longer reproduces is a rule to revisit.
- [`rules/`](../rules/) — the executable half: an ESLint boundaries config encoding the layer
  contract, and an explicit list of what it cannot check.

## Maintenance Rule

When you change a diagram or rationale:

1. **If the change adds, removes, or modifies a rule** that agents must follow during
   implementation (e.g. a new layer, a new forbidden import, a new boundary type), update both
   the diagram **and** the matching skill reference in the same PR. The skills are operational;
   docs-only changes leave them stale and an agent will follow the wrong rule.
2. **If the change only adds rationale, visualization, or onboarding context**, keep it in docs
   only.
3. **If the change asserts something measurable**, put the measurement in
   [Evidence](./evidence.md) with the command that produced it. An assertion without a count is
   an opinion, and the next reader cannot check it.
4. The PR description must call out whether this is a docs-only change or a docs+skill change,
   so reviewers know which validation surface to check (`npm run validate` for skill changes;
   visual review for docs-only).

**Stale rule symptom:** a skill reference says "X" but a doc diagram shows "Y". Treat that
mismatch as a doc bug — the skills are the operational source of truth, the docs explain why.

## Last Reviewed

These documents are maintained alongside the `nextjs-clean-skills` plugin. Last reviewed
against the live skill set: 2026-07-26 (skill version 2.0.0).
