# Capability Architecture Candidate V3 Release Gate

This protocol is frozen before candidate-v3 release runs.

- Candidate: `6c35c86246fbd65fecfddef5c0d193f50c739f7d`
- Replay runner: `0be41e1`
- Immutable control result commit: `4e51ba9`
- Controls: no skill, released `v1.3.2`, and layer-first checkpoint `626140b`

## Matrix

Candidate v3 runs the same three scenarios, two repeats, two model tiers, and two framings as the
failed gate:

```text
3 scenarios x 2 repeats x 2 models x 2 framings = 24 new candidate runs
72 control runs reused byte-for-byte from the first release gate
24 new blind four-arm judge groups
```

Reusing controls isolates the candidate instruction change and avoids adding control-generation
variance. Each target matrix copies complete control response/event pairs from its corresponding
`results/release-*` source. Judges receive the same scenario, rubric, candidate mapping algorithm,
schema, and `gpt-5.6-sol` model as the first gate.

```bash
ARCH_EVAL_MODEL=gpt-5.6-luna ARCH_EVAL_FRAMING=neutral \
  node scripts/run-architecture-eval.mjs --smoke --candidate-only \
  --control-source tests/architecture-evals/results/release-luna-neutral \
  --output tests/architecture-evals/results/release-v3-luna-neutral

ARCH_EVAL_MODEL=gpt-5.6-luna ARCH_EVAL_FRAMING=adversarial \
  node scripts/run-architecture-eval.mjs --smoke --candidate-only \
  --control-source tests/architecture-evals/results/release-luna-adversarial \
  --output tests/architecture-evals/results/release-v3-luna-adversarial

ARCH_EVAL_MODEL=gpt-5.6-sol ARCH_EVAL_FRAMING=neutral \
  node scripts/run-architecture-eval.mjs --smoke --candidate-only \
  --control-source tests/architecture-evals/results/release-sol-neutral \
  --output tests/architecture-evals/results/release-v3-sol-neutral

ARCH_EVAL_MODEL=gpt-5.6-sol ARCH_EVAL_FRAMING=adversarial \
  node scripts/run-architecture-eval.mjs --smoke --candidate-only \
  --control-source tests/architecture-evals/results/release-sol-adversarial \
  --output tests/architecture-evals/results/release-v3-sol-adversarial
```

If a matrix stops on timeout, rerun its exact command with `--resume`. Complete controls,
candidate responses, and judge results are skipped. Do not edit the candidate, scenario, rubric,
schema, runner, model, framing, or source results between attempts.

## Acceptance

Candidate v3 passes only if all conditions hold across the combined replay:

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

All non-perfect candidate cells receive manual review. Disputed judge cells receive one additional
blind pass over the same frozen four outputs. Generation is never repeated to resolve scoring.

Passing this gate establishes that the corrected candidate improves agent behavior under the
registered matrix. It does not replace the architecture pilots, runtime build, source evidence, or
human architecture review.
