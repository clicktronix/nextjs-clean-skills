# Simplified Architecture Skill Focused Results

- Date: 2026-08-30
- Generation: `gpt-5.6-luna`
- Blind judge: `gpt-5.6-sol`
- Framing: neutral
- Controls: reused from `release-v3-luna-neutral`
- Verdict: **FOCUSED PASS; NOT A FULL RELEASE GATE**

The first comparative smoke used the simplified skill at SHA-256
`3885ad826be347c1fd7c5339e459f1c699a8a412b98bb127dba68e52a6e157d7`. It scored 9.0 overall
with no fatal result: 10/10 in both remote-stream and cross-capability repeats, but 7/10 in both
simple-CRUD repeats. Both CRUD answers invented separate application wrappers for list, create, and
rename despite using one local store.

The skill was then changed at the observed seam: its model-visible body now says that authentication,
validation, row mapping, invalidation, failure translation, and operation names do not by themselves
justify `application/` or one wrapper per action. The final candidate SHA-256 is
`5d14b950305b860733fdbddad2b8016a242b8923447a7c4b68b7a5a44f5afd1a`.

The focused replay regenerated only the candidate for the two simple-CRUD cells and reused the six
frozen control responses. Both candidate answers scored 10/10 with no negative or fatal finding.
They used direct channel-to-private-store flows and explicitly rejected speculative operations and
repository ports.

These runs used a worktree candidate. The per-run `metadata.json` `skillHash` values above bind the
actual prompt content; `manifest.json` `candidateCommit` names the last commit touching the snapshot
and must not be read as the identity of uncommitted candidate text.

| Arm | Mean | Fatal |
| --- | ---: | ---: |
| capability-first final | 10.0 | 0 |
| no skill | 7.0 | 0 |
| layer-first checkpoint | 6.5 | 0 |
| released `v1.3.2` | 5.0 | 0 |

One judge in the full smoke and one judge in the focused replay reached the ten-minute timeout.
Each run resumed the same result set with `--resume`; completed generations, controls, mappings, and
scores were not regenerated.

Raw artifacts:

```text
results/simplified-v4-luna-neutral
results/simplified-v4-crud-fix-luna-neutral
```

This establishes a focused behavioral regression and fix under one model and framing. It does not
replace the frozen 96-run release protocol or claim that the architecture is universally correct.
