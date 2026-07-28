# Candidate V3 Targeted Re-smoke

- Date: 2026-07-27
- Candidate: `6c35c86246fbd65fecfddef5c0d193f50c739f7d`
- Result set: `results/targeted-v3-luna-adversarial`
- Generation model: `gpt-5.6-luna`
- Framing: adversarial
- New candidate runs: 2
- Reused immutable control runs: 6
- Blind judge runs: 2

The candidate changed only the cross-capability ownership rule identified by the failed release
gate:

1. outer composition roots may wire behavior but do not own meaningful product policy;
2. cross-capability policy that survives deletion creates an orchestrating capability even with one
   current consumer;
3. the operation owns dependencies in its own language and private adapters call public capability
   surfaces;
4. derived-input calls are sequential and unexpected failures are reported once by the
   orchestrating channel.

Both candidate responses scored 10 with no negative or fatal result. Both created
`src/modules/board`, kept work-items and labels acyclic, loaded work-items before labels, rejected an
inaccessible referenced label, and named one reporting boundary.

| Arm | Mean | Total | Fatal |
| --- | ---: | ---: | ---: |
| capability-first candidate v3 | 10.0 | 20/20 | 0 |
| released v1.3.2 | 10.0 | 20/20 | 0 |
| layer-first checkpoint | 9.0 | 18/20 | 0 |
| no skill | 3.5 | 7/20 | 0 |

Control generation responses were copied byte-for-byte from
`results/release-luna-adversarial`; only blind scores were regenerated alongside candidate v3.
This isolates the effect of the instruction change.

The targeted result removes the observed failure but does not clear the release gate. Candidate v3
must still run all 24 model/framing/scenario/repeat cells so the cross-capability fix cannot hide a
regression in CRUD or streaming behavior.
