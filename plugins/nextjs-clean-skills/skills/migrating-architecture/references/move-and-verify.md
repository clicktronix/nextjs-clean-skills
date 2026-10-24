# Move And Verify

**Scope: stack (Next.js App Router)**

## The mover's brief

A mover gets its slice only: moves with computed destinations, surfaces to author with exports
and consumers, the profile decisions. It reports `filesTouched`, or
`{ replan: { file, reason, suggestedRole } }` when a file holds policy its role does not admit.
It never chooses a destination, tunnels through a barrel, adds `eslint-disable`, or runs git.

Use [Module Cohesion](../../designing-architecture/references/placement/module-cohesion.md)
when reviewing responsibilities. Its directory observations alone are not must-fix findings.

## Probes and cleanup

A subagent's throwaway file goes under a directory it created and removes exactly that, never a
directory that existed before. A process a probe started is stopped by the pid it recorded, not
by name. After every slice run `git status --porcelain --untracked-files=all`
and read it unfiltered, including unstaged deletions.

## The check record

Take and read the record with the commands of Step 6, running the Step 3 check command (chain
required checks with `&&`). Cite the record's `id` for its command, exit code, tree state and
output; inspect the diff for behaviour the checks do not cover. `census` verifies the recorded
artifact hash.

The check is your child process; the record says when it ended. Silence means look at the
process, not "stalled". `reviewerBudget` is a turn count, not a runtime limit; on exhaustion the
reviewer returns no verdict for that axis, and you re-run it or read it yourself.

## Fix rounds

A fix subagent gets the behaviour output, census counts, and must-fix findings: surgical edits,
same destinations, then a new record and verify. A round that changes nothing ends that attempt;
take the slice back with a different brief, a smaller slice, or your own edit. Other work
does not wait.
