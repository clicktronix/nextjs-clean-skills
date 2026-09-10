# Move And Verify

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

## The mover's brief

Give a mover its slice only: the moves with computed destinations, the surfaces to author
with their exports and consumers, and the profile decisions. It reports `filesTouched`, or
`{ replan: { file, reason, suggestedRole } }` when a file turns out to hold policy its role
does not admit. It never chooses a destination, re-exports through a barrel to satisfy a rule,
adds `eslint-disable`, widens the contract, or runs git commands.

## Probes and cleanup

A subagent that needs a throwaway file writes it under a directory it created itself and
removes exactly that. It never removes a directory that existed before it started, however
empty it looks. After every slice you run `git status --porcelain --untracked-files=all` and
read it unfiltered: a filter that hides unstaged deletions is how a whole directory went
missing once.

## The check record

```
node $PLUGIN/bin/migration.mjs record --repo <target> --label check -- <check command>
node $PLUGIN/bin/migration.mjs record --repo <target> --label lint-json -- eslint src --format json
node $PLUGIN/bin/migration.mjs record-fresh --repo <target> --record <path>
```

The record carries the command, its exit code, the tree state it ran against and the output
path. It is the only evidence a reviewer gets. Readers cite its `id`. The lint record must be
produced with `--format json` so `census` can count message ids and the capability counter.

The check command is your child process: you know when it ended because the record says so. If
it prints nothing for a while, look at the process, do not declare it stalled. A reviewer has
its own budget (`reviewerBudget`, turns); an exhausted reviewer returns no verdict for that
axis and you decide whether to re-run it or read that axis yourself.

## Fix rounds

Input to a fix subagent: the behaviour output, the census counts and the must-fix findings.
Surgical edits, same destinations. After it returns, take a new record and verify again. When a
round changes nothing any reader can see, stop that attempt and take the slice back: a
different brief, a smaller slice, or your own edit. Independent work does not wait.
