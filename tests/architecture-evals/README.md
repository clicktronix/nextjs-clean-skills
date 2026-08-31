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

Each generated skill run records `skillHash` for `SKILL.md` and `skillTreeHash` for the relative
paths and bytes of the complete copied skill. The manifest records the candidate tree hash and
whether that snapshot differed from `HEAD`; `candidateCommit` identifies provenance only.

Run one calibration cell:

```bash
node scripts/run-architecture-eval.mjs --scenario simple-crud --arm no-skill --repeat 1
```

Run the full smoke:

```bash
node scripts/run-architecture-eval.mjs --smoke
```

The focused `ownership-resolution` scenario compares the current decision order with the exact
pre-change skill snapshot as `pre-domain-order`. It is outside the frozen release matrix:

```bash
node scripts/run-architecture-eval.mjs --smoke --scenarios ownership-resolution --output <dir>
```

Its first result and one correction replay are recorded in
[`OWNERSHIP_RESOLUTION_RESULTS.md`](OWNERSHIP_RESOLUTION_RESULTS.md).

The frozen two-tier, two-framing release protocol and acceptance thresholds are in
[`RELEASE_GATE.md`](RELEASE_GATE.md). Its first completed result is recorded in
[`RELEASE_RESULTS.md`](RELEASE_RESULTS.md). Candidate v3 uses the frozen replay protocol in
[`RELEASE_GATE_V3.md`](RELEASE_GATE_V3.md), with results in
[`RELEASE_V3_RESULTS.md`](RELEASE_V3_RESULTS.md).

The later simplification smoke and its focused simple-CRUD correction are recorded in
[`SIMPLIFIED_V4_RESULTS.md`](SIMPLIFIED_V4_RESULTS.md). This is targeted evidence, not a replacement
for the release gate.

A separate two-arm Claude Opus 5 experiment on the closing verification gate is in
[`OPUS5_GATE_RESULTS.md`](OPUS5_GATE_RESULTS.md), run by `scripts/run-opus5-gate-eval.mjs`. It does
not use this matrix's arms and does not clear the release gate.

## Known limitations

Carry these into the next gate rather than patching them mid-protocol — editing a scenario, rubric,
candidate, or runner invalidates the result sets that recorded their hashes.

1. `candidate/` is the frozen snapshot for the next comparative run and includes its references.
   Candidate v3 remains reproducible at the commit pinned by `RELEASE_GATE_V3.md`; do not infer its
   prompt from the current directory. Re-snapshot `candidate/` before a later gate and record its
   hash with the result.
2. Negative rubric item 4 ("A generic shared/lib bucket or a universal result wrapper") fires on
   `shared/server`, which the skill explicitly admits as a runtime-scoped root. Observed on both arms
   across cells in the Opus 5 experiment. The item should name unowned catch-alls (`utils`, `lib`,
   `services`) rather than any path under `shared/`.
3. The frozen matrix generates with Codex models only. Skill authoring guidance is to test with every
   model the skill targets, so a Claude arm belongs in the next gate rather than in a side experiment.
