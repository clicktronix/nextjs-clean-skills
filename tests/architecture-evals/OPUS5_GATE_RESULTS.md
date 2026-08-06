# Verification Gate Removal on Claude Opus 5

- Date: 2026-07-30
- Runner: `scripts/run-opus5-gate-eval.mjs` (two arms, not the frozen four-arm matrix)
- Generation: `claude-opus-5`, effort `high`, isolated workspace, `Read`/`Glob`/`Grep` only
- Judge: `gpt-5.6-sol` via `codex exec`, blind, two shuffled candidates per group
- Arms: `tests/architecture-evals/opus5-gates/{with-gates,no-gates}` — complete skill directories
  differing only by `## Verification Gate` and three added lines
- Matrix: 3 scenarios x 2 framings x 2 repeats x 2 arms = 24 generation runs, 12 blind judge groups
- Result sets: `results/opus5-gates-neutral`, `results/opus5-gates-adversarial`

The frozen `run-architecture-eval.mjs` generates with Codex models, so it cannot answer whether a
closing gate helps or hurts a Claude model. It was not modified and its result sets still replay
byte-for-byte.

## Aggregate

| Framing | Arm | Mean | Total | Fatal | Mean output tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| neutral | with-gates | 9.667 | 58/60 | 0 | 15 581 |
| neutral | no-gates | 9.667 | 58/60 | 0 | 15 836 |
| adversarial | with-gates | 10.0 | 60/60 | 0 | 16 066 |
| adversarial | no-gates | 9.667 | 58/60 | 0 | 13 330 |
| both | with-gates | 9.833 | 118/120 | 0 | 15 824 |
| both | no-gates | 9.667 | 116/120 | 0 | 14 583 |

No fatal violation in any of the 24 runs, in either arm.

## Paired cells

Of 12 paired cells, 8 tie, `with-gates` wins 3, `no-gates` wins 1. A sign test on the 4 discordant
pairs gives p = 0.63: the 2-point spread is not distinguishable from cell variance. The same arm
moved 2 points on `simple-crud` from framing alone (`with-gates` scored 9/9 neutral and 10/10
adversarial), which is as large as the between-arm spread.

The four discordant cells:

| Framing | Cell | Winner | Cause |
| --- | --- | --- | --- |
| neutral | simple-crud r1 | no-gates | `with-gates` took the generic-shared-bucket penalty |
| neutral | remote-stream r2 | with-gates | `no-gates` left report-once ownership unresolved |
| adversarial | simple-crud r1 | with-gates | `no-gates` took the generic-shared-bucket penalty |
| adversarial | remote-stream r2 | with-gates | `no-gates` capped a successful stream with a per-request timeout |

The generic-shared-bucket penalty is a rubric artifact, not an arm effect: negative item 4 penalizes
"a generic shared/lib bucket", the skill explicitly admits `shared/server` as a runtime-scoped root,
and the penalty landed on both arms across cells. It should be reconciled independently of this
experiment.

The two remaining `no-gates` losses are both `remote-stream` completeness slips — the hardest
scenario, same repeat. That is the one place where a closing pass plausibly earned its keep.

## What this does and does not establish

Establishes: removing the gate does not degrade design quality measurably on Opus 5, and does not
introduce a fatal runtime or security design in 12 runs across two framings.

Does not establish the token claim. Every scenario asks for a proposal and forbids file edits, so no
arm implements, type-checks, lints, or tests anything. The over-verification cost that the Claude
Opus 5 prompting guidance describes accrues during agentic implementation, which this harness never
exercises. Output tokens were flat under neutral framing and 17% lower for `no-gates` under
adversarial framing — one framing out of two, so not a stable saving either.

Measuring the token claim properly needs an implementation-shaped scenario with a real repository, a
build, and a test command. That scenario does not exist here.

## Arm snapshots are frozen

`opus5-gates/{with-gates,no-gates}` stay byte-for-byte as generated, so `armDirHash` in each run's
metadata keeps matching. Both arms therefore still carry `name: nextjs-architecture`, the skill name
in use when they were generated; the shipped skill is now `designing-architecture`.

Two changes landed on the shipped skills after this result set and deliberately did not touch the
arms: `creating-react-components` (formerly `react-component-creator`) gained first-level links to
failure ownership and error taxonomy, removing a second-level reference chain, and both skills were
renamed to gerund form. Neither adds or alters a rule, so neither affects these scores.

## Standing recommendation

Keep the removal: the always-on context saving is certain, the quality difference is not
distinguishable from noise, and no arm produced a fatal design. Watch `remote-stream`, and if a
closing check is restored, restore one line about preserving channel-native semantics rather than an
eight-item restatement of the rule sections.
