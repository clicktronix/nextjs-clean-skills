# Trigger Prompts

`prompts.json` maps each skill name to `should_fire` and `should_not_fire` prompt lists: whether a
model selects that skill from the frontmatter `description` alone. `npm run validate` does not
read them.

Run them with `claude plugin eval` on a copy of the plugin: one case per prompt, `allowed_tools:
[Skill, Read, Glob, Grep]`, `max_turns: 3`, and a `tool_used: Skill` grader whose `input_match` is
the full `nextjs-clean-skills:<skill>` name (`min: 1` to fire, `max: 0` not to).

Last run, 2026-10-22, Claude Code 2.1.306 on Opus 5.5: 18 of 18 after `migrating-architecture`
gained the "enable its boundary lint rules in a partly migrated repository" trigger. Before that
edit, the third `migrating-architecture` should-fire prompt did not fire.
