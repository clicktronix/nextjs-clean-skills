# Architecture Docs

Human-facing architecture notes for `nextjs-clean-skills`.

These documents explain the architecture contract behind the skills. They are not loaded by
Claude Code or Codex automatically and should not be copied into `SKILL.md`. Keep the skills
short and operational; use these docs when onboarding a team, reviewing a feature slice, or
explaining why the boundaries exist.

## Documents

- [Architecture Contract](./architecture-contract.md) — layer model, dependency direction,
  runtime flow, security boundary, data ownership, and persistence rules.
- [Agent Decision Maps](./agent-decision-maps.md) — compact flowcharts for coding agents and
  reviewers to decide where code belongs before editing.

## Maintenance Rule

If a diagram changes a rule that an agent must follow during implementation, update the
matching skill reference too. If a diagram only explains the rationale, keep it in docs only.
