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
