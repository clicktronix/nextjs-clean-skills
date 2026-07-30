# Architecture Skill Evaluation

This experiment compares architecture behavior, not prose quality:

1. no skill;
2. released `v1.3.2`;
3. layer-first checkpoint `626140b5d68e5b3afcfc80e209df5d881f35d59c`;
4. the capability-first candidate in `candidate/SKILL.md`.

The smoke matrix is preregistered as three scenarios, one neutral framing, one model, and two
repeats: 24 generation runs. A blind judge compares the four shuffled arms within each
scenario/repeat pair. Generation and judging run in isolated temporary directories with a minimal
`CODEX_HOME`; user instructions, plugins, skills, and project files are not loaded.

Positive rubric items score 0 (missing/wrong), 1 (partial), or 2 (clear and coherent). Each
negative violation subtracts one point. A fatal violation is a framework/runtime design that makes
the requested behavior invalid, such as streaming through a Server Action, trusting client-supplied
identity, or importing a server surface into browser code.

Smoke answers only whether there is enough signal to justify the preregistered release matrix. It
does not accept the ADR or release a skill. The release gate remains:

```text
4 arms x 3 scenarios x 2 model tiers x 2 framings x 2 repeats = 96 runs
```

Raw prompts, event streams, final responses, hashes, shuffled judge inputs, and scores are retained
under the selected output directory. Do not edit a scenario, rubric, candidate, or runner after a
run without starting a new result set.

Run one calibration cell:

```bash
node scripts/run-architecture-eval.mjs --scenario simple-crud --arm no-skill --repeat 1
```

Run the full smoke:

```bash
node scripts/run-architecture-eval.mjs --smoke
```

The frozen two-tier, two-framing release protocol and acceptance thresholds are in
[`RELEASE_GATE.md`](RELEASE_GATE.md). Its first completed result is recorded in
[`RELEASE_RESULTS.md`](RELEASE_RESULTS.md). Candidate v3 uses the frozen replay protocol in
[`RELEASE_GATE_V3.md`](RELEASE_GATE_V3.md), with results in
[`RELEASE_V3_RESULTS.md`](RELEASE_V3_RESULTS.md).

A separate two-arm Claude Opus 5 experiment on the closing verification gate is in
[`OPUS5_GATE_RESULTS.md`](OPUS5_GATE_RESULTS.md), run by `scripts/run-opus5-gate-eval.mjs`. It does
not use this matrix's arms and does not clear the release gate.

## Known limitations

Carry these into the next gate rather than patching them mid-protocol — editing a scenario, rubric,
candidate, or runner invalidates the result sets that recorded their hashes.

1. `candidate/SKILL.md` is a frozen artifact of the candidate-v3 gate, not a pointer at the shipped
   skill. It predates `query-cache.ts`, the failure-mode list, and the reference map, and it ships
   without a `references/` directory, so the `capability-first` arm answers from SKILL.md alone while
   the `v1.3.2` and `layer-first` arms get complete `git archive` copies. Any new candidate gate
   should re-snapshot it and state whether references are included.
2. Negative rubric item 4 ("A generic shared/lib bucket or a universal result wrapper") fires on
   `shared/server`, which the skill explicitly admits as a runtime-scoped root. Observed on both arms
   across cells in the Opus 5 experiment. The item should name unowned catch-alls (`utils`, `lib`,
   `services`) rather than any path under `shared/`.
3. The frozen matrix generates with Codex models only. Skill authoring guidance is to test with every
   model the skill targets, so a Claude arm belongs in the next gate rather than in a side experiment.
