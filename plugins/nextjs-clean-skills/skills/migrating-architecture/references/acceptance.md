# Acceptance

**Scope: stack (Next.js App Router)**

`recommend` reads one JSON object:

```json
{
  "behaviour": { "ok": true },
  "architecture": { "ok": true, "counts": { "capability": 0, "domainDirection": 2 } },
  "census": { "domainDirection": 2 },
  "vacuous": [],
  "review": { "verdict": "sound", "findings": [] },
  "radius": { "ok": true, "direction": "same", "detail": "7 files before, 7 after" },
  "fixLoopExit": "converged"
}
```

It answers `accept`, `revise`, `reject` or `inconclusive` with a reason and notes, deciding in this
order:

1. A missing axis is `inconclusive`, even when the review said reject: `behaviour` without a
   boolean `ok`, `architecture` without a numeric `counts.capability` or with `ok: false` (a failed
   measurement is not a zero), `review` without a verdict.
2. Otherwise `review.verdict: "reject"` is `reject`.
3. Otherwise `fixLoopExit: "cap-reached"` is `revise`, reported as a budget, not as a red result.
   Only `cap-reached` is read; omit the field otherwise.
4. Otherwise red behaviour, a capability counter above zero, a counter above `census` (except
   keys listed in `vacuous`), a must-fix finding, or a `revise` verdict is `revise`.
5. Otherwise `accept`.

A grown radius is a note and never flips accept; should-fix findings are listed for you to verify.

## What you tell the user after the pilot

- what moved and what stayed, with the old paths removed in the same change;
- the three verdicts and the record ids they came from;
- every channel change (Server Action → GET, and the like) with its behaviour risk;
- instruction files that now point at deleted paths — you list them, the team rewrites them;
- whether the real user path was exercised in the running app, by whom.

Then the one decision of the skill's Decision Gate: accept the ownership model, revise this
migration, or reject the model. The next capability waits on it.

## Widening the blocking rules

On accept, add the migrated roots to the `censusScope` blocking list and take a fresh baseline
record. The target's lint stays a gate the team can read; the census keeps counting the rest.

## Cost you report

Agents dispatched by role, records taken, wall time of each check, and the model used. If the
platform gives you token totals, include them; if it does not, say so rather than estimating.
