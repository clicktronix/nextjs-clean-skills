# Ownership Resolution Focused Results

- Date: 2026-08-30
- Generation: `gpt-5.6-luna`
- Blind judge: `gpt-5.6-sol`
- Scenario: overloaded `workspace` product terminology
- Verdict: **PARTIAL IMPROVEMENT; NOT A RELEASE GATE**

The first comparison used candidate `7f5c705` with a full candidate-tree hash. Neutral framing was
not discriminating: every arm separated tenant organizations from saved layouts. Under adversarial
pressure to create a generic `workspaces` capability, the current arm scored 6.0 versus 4.5 for the
exact pre-change snapshot, but still accepted that owner in both repeats.

That observed failure led to one narrower rule: a brief's leading noun is not an owner, and concepts
with different lifecycle, authorization, or change authority must not share a capability. Candidate
`8331f18` (`skillTreeHash` `23feee8a9e0f2a83efe67e53425fcbafc54fd12b05b2c7723b3ecceba200abcc`)
was replayed while reusing the committed controls.

In the neutral replay, both current responses chose `canvases` or a narrowly named canvas-template
capability. Blind scores were 6 and 9; the lower response moved project-membership checks into the
new capability and added unnecessary surfaces. The pre-change arm scored 9 twice, so this framing
does not establish an advantage for the new rule.

In the adversarial replay, one current response rejected generic `workspaces`, separated the product
vocabulary, and preserved Projects and Canvases as authorities. Its blind score was 8; the reused
no-skill, pre-change, and `v1.3.2` controls scored 2, 2, and 1. The second current response still
followed the leading noun and chose generic `workspaces`. Its judge timed out at 300 seconds and
again at 600 seconds, so no aggregate score is reported for that replay.

The focused evidence supports a modest conclusion: the concise rule improved resistance to the
observed pressure from zero of two correct adversarial ownership decisions to one of two, without
adding a separate domain-modeling workflow. It does not prove deterministic compliance. Further
wording added solely to force this fixture would overfit the skill; future evidence should come from
different product vocabulary and models.

Raw artifacts:

```text
results/ownership-resolution-luna-neutral
results/ownership-resolution-luna-adversarial
results/ownership-resolution-v2-luna-neutral
results/ownership-resolution-v2-luna-adversarial
```
