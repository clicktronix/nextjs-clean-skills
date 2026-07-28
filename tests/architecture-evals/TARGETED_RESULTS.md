# Candidate V2 Targeted Re-smoke

- Date: 2026-07-27
- Candidate: `e7b9bdc8ce47bf79d258ca86c04caccaee14a579`
- Judge contract: `feaeb73b9c508130a5514bbda3d7382c81d5aa26`
- Result set: `results/targeted-resmoke-2026-07-27`
- New generation runs: 4
- Reused immutable control runs: 12
- Blind judge runs: 4

The candidate changed only three instructions:

1. classify requested or existing behavior, not speculative future policy;
2. validation, auth, mapping, cache invalidation, and ordinary store conflicts do not independently
   justify an application operation;
3. call dependencies whose inputs come from earlier results sequentially.

The re-smoke repeated the two affected candidate scenarios twice. It reused no-skill, v1.3.2, and
layer-first raw outputs from the registered smoke. The judge received the same shuffled four-arm
groups with the new candidate output.

## Judge Contract Correction

The first targeted judge exposed ambiguity in `negative_violations`: a model could return either
violation indexes or a per-criterion vector. Those scores were discarded. The corrected schema
requires exactly four values in rubric order, each `0` or `1`, and computes:

```text
total = sum(positive) - sum(negative)
```

All four corrected score sets match that arithmetic.

## Results

| Arm | Mean | Total | Fatal |
| --- | ---: | ---: | ---: |
| capability-first candidate v2 | 10.00 | 40/40 | 0 |
| layer-first checkpoint | 8.25 | 33/40 | 0 |
| no skill | 7.50 | 30/40 | 1 |
| released v1.3.2 | 6.00 | 24/40 | 1 |

Candidate v2 scored 10 in both simple-CRUD repeats and both cross-capability repeats.

- Neither CRUD response added `application/**` or a repository port.
- Both used direct capability server/store composition while preserving RSC, GET, and Server
  Action channels.
- Both board responses used board-owned dependencies/adapters over narrow capability server
  surfaces.
- Neither board response claimed that a label lookup using derived IDs could run before those IDs
  existed.

The original candidate regressions are no longer present in the four targeted outputs. This clears
the candidate for a frozen release-gate design; it does not by itself accept the ADR.

## Harness Finding

Three judge attempts stalled in the Codex transport and produced no result. Each was discarded and
retried with identical generation outputs, judge input, and candidate mapping. The runner now gives
each Codex process group a five-minute timeout so the 96-run matrix cannot hang indefinitely.
