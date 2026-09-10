# Move And Verify

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

## The mover's brief

A mover gets its slice only: moves with computed destinations, surfaces to author with exports
and consumers, the profile decisions. It reports `filesTouched`, or
`{ replan: { file, reason, suggestedRole } }` when a file holds policy its role does not admit.
It never chooses a destination, tunnels through a barrel, adds `eslint-disable`, or runs git.

## Probes and cleanup

A subagent's throwaway file goes under a directory it created and it removes exactly that,
never a directory that existed before. After every slice run
`git status --porcelain --untracked-files=all` and read it unfiltered: a filter hiding unstaged
deletions is how a whole directory once went missing.

## The check record

```
node "$PLUGIN/bin/migration.mjs" record --repo "$TARGET" --label check --artifact lint.json -- 'bun run typecheck && eslint src --format json --output-file "$NCS_ARTIFACTS/lint.json"; bun test && bun run build'
node $PLUGIN/bin/migration.mjs record-fresh --repo <target> --record <path>
node $PLUGIN/bin/migration.mjs census --repo <target> --record <path> --lint-json lint.json --contract rules/architecture-contract.json --capability <name> --baseline <baseline census>
```

The record carries the command, its exit code, the tree state it ran against and the output
path. It is the only evidence a reviewer gets. Readers cite its `id`. The lint step writes ESLint
JSON to `$NCS_ARTIFACTS/lint.json`, a directory created empty for this run, so nothing older
can sit there. Single-quote the command so the variable expands in the check, not your
shell. The record hashes the file; `census --lint-json` reads it only
while the hash matches. A killed wrapper forwards the signal to the check's process group, waits
until the whole group is gone (SIGKILL after a grace period), then writes the record.

The check is your child process; the record says when it ended. Silence in its output means
look at the process, not "stalled". `reviewerBudget` is a turn count in the reviewer's brief,
not a runtime limit; a reviewer reporting exhaustion returns no verdict for that axis, and you
re-run it or read the axis yourself.

## Fix rounds

A fix subagent gets the behaviour output, the census counts and the must-fix findings:
surgical edits, same destinations. Then a new record and verify again. A round that changes
nothing any reader can see ends that attempt; take the slice back with a different brief, a
smaller slice, or your own edit. Independent work does not wait.
