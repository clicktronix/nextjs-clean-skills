# Capability Architecture Release Gate

This protocol is frozen before the release runs. It evaluates candidate
`e7b9bdc8ce47bf79d258ca86c04caccaee14a579`.

## Matrix

Generation tiers:

- `gpt-5.6-luna`: fast and affordable agentic coding model;
- `gpt-5.6-sol`: frontier agentic coding model.

Framings:

- `neutral`: the scenario task without stakeholder pressure;
- `adversarial`: pressure to reuse the exact shortcut the architecture is expected to reject.

Each model/framing pair runs the existing 24-cell matrix:

```text
4 arms x 3 scenarios x 2 repeats = 24
4 matrices = 96 generation runs
```

`gpt-5.6-sol` blindly judges each shuffled four-arm group. The corrected penalty vector has four
fixed `0|1` positions in rubric order. Each process group has a five-minute infrastructure timeout;
`--resume` reuses only complete response/event pairs.

```bash
ARCH_EVAL_MODEL=gpt-5.6-luna ARCH_EVAL_FRAMING=neutral \
  node scripts/run-architecture-eval.mjs --smoke \
  --output tests/architecture-evals/results/release-luna-neutral

ARCH_EVAL_MODEL=gpt-5.6-luna ARCH_EVAL_FRAMING=adversarial \
  node scripts/run-architecture-eval.mjs --smoke \
  --output tests/architecture-evals/results/release-luna-adversarial

ARCH_EVAL_MODEL=gpt-5.6-sol ARCH_EVAL_FRAMING=neutral \
  node scripts/run-architecture-eval.mjs --smoke \
  --output tests/architecture-evals/results/release-sol-neutral

ARCH_EVAL_MODEL=gpt-5.6-sol ARCH_EVAL_FRAMING=adversarial \
  node scripts/run-architecture-eval.mjs --smoke \
  --output tests/architecture-evals/results/release-sol-adversarial
```

If a matrix stops on timeout, re-run its exact command with `--resume`. Do not edit the candidate,
scenario, rubric, schema, model, or framing between attempts.

## Acceptance

The skill gate passes only if all conditions hold across the combined 96-run set:

1. the candidate has no fatal cell;
2. the candidate has no negative-rubric violation;
3. the candidate mean is greater than every control overall and in each scenario;
4. the candidate beats no skill by at least 0.5 points overall;
5. the candidate ties or beats every control in at least 75% of paired cells;
6. no candidate cell scores below 8;
7. simple CRUD never adds a speculative application operation or repository port;
8. streaming never uses a Server Action, ordinary retry after commit, a universal channel wrapper,
   or provider SDK types in application code;
9. cross-capability design never imports sibling internals, creates a work-items/labels cycle,
   duplicates orchestration outside board, or omits an explicit report-once policy.

Disputed judge cells receive one additional blind judge pass over the same frozen outputs. Generation
is never repeated to resolve a scoring dispute.

Passing this gate establishes that the candidate skill improves model behavior under this matrix.
It does not replace architecture-pilot, runtime-build, source-evidence, or human-review gates.
