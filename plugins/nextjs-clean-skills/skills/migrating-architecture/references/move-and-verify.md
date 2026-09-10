# Move And Verify

**Impact: CRITICAL** · **Scope: stack (Next.js App Router)**

## The mover's brief

A mover gets its slice only: moves with computed destinations, surfaces to author with exports
and consumers, the profile decisions. It reports `filesTouched`, or
`{ replan: { file, reason, suggestedRole } }` when a file holds policy its role does not admit.
It never chooses a destination, tunnels through a barrel, adds `eslint-disable`, widens the
contract, or runs git.

## Probes and cleanup

A subagent that needs a throwaway file writes it under a directory it created itself and
removes exactly that. It never removes a directory that existed before it started, however
empty it looks. After every slice you run `git status --porcelain --untracked-files=all` and
read it unfiltered: a filter that hides unstaged deletions is how a whole directory went
missing once.

## The check record

```
node $PLUGIN/bin/migration.mjs record --repo <target> --label check --artifact .nextjs-clean-migration/lint.json -- <check command>
node $PLUGIN/bin/migration.mjs record-fresh --repo <target> --record <path>
node $PLUGIN/bin/migration.mjs census --repo <target> --record <path> --lint-json .nextjs-clean-migration/lint.json --contract rules/architecture-contract.json --capability <name> --baseline <baseline census>
```

The record carries the command, its exit code, the tree state it ran against and the output
path. It is the only evidence a reviewer gets. Readers cite its `id`. The check command's lint
step writes ESLint JSON to a file (`--format json --output-file …`) so lint runs once; the
record hashes that file as its artifact and `census --lint-json` reads it only while the hash
still matches. A killed wrapper forwards the signal to the check's process group, waits for it
to end (SIGKILL after a grace period), then writes a record naming that signal.

The check is your child process; the record says when it ended. Silence in its output is a
reason to look at the process, not to call it stalled. A reviewer has its own budget
(`reviewerBudget`, turns); an exhausted one returns no verdict for that axis and you decide
whether to re-run it or read that axis yourself.

## Fix rounds

Input to a fix subagent: the behaviour output, the census counts and the must-fix findings.
Surgical edits, same destinations. After it returns, take a new record and verify again. When a
round changes nothing any reader can see, stop that attempt and take the slice back: a
different brief, a smaller slice, or your own edit. Independent work does not wait.
