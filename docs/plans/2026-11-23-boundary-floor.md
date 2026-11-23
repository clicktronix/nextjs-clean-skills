# Close the boundary floor gaps

Goal: make a green lint mean what the contract says, settle four contract decisions the review
raised, and stop shipping the rules as copied files. Source: the architecture review of release
4.7.3 (`c5a70a2`), findings A1–A7, B1–B6 and C1; the owner chose `contracts.ts` for the HTTP
contract, a normative branded identity, server views published through `rsc.ts`, and delivery of
the rules by the plugin itself, with a pointer to the contract in the consumer's `AGENTS.md`.

1. Tighten the boundary rule (A1–A6, B4), one failing mutation per invariant before the rule
   changes. This comes first because every later milestone edits the same contract text and
   fixtures, and the rule decides what those may say.
   - A type-only edge skips only the bundle rules; in `domain/**`, `application/**`, `shared/kernel`
     and neutral surfaces it is admitted from a public root surface and nowhere else.
   - Pure zones import only `purePackages`; an unclassified package is reported at the import.
   - A capability's server code does not import a neighbour's channel surface
     (`channelSurfaces`).
   - Provider packages (`providerPackages`) are imported only by `server/**`, `client/**`,
     `shared/server` and `shared/client`.
   - Nothing outside `appRoot` imports from it; a source file outside `sourceRoot` is not
     importable.
   - `ui/**` imports no server code under either directive; a Server Component that reads lives in
     `server/**`, renders a `ui/**` view and is published by `rsc.ts`. `serverUiReach` is deleted.
2. Make the database canary say when it measured nothing (A7).
3. Align the contract, references and fixtures with the decisions that are not lintable (B1, B2,
   B3, B5, B6): HTTP path and response schema in `contracts.ts`, a branded `RequestIdentity`, the
   preference order and isolation test for cached tenant reads, authenticate-before-decode, and
   reactions to a neighbour's write. After milestone 1 so the fixtures are edited once.
4. Let the plugin install and update the rules (C1). Both platforms keep a plugin in a cache keyed
   by its version, so a project cannot import it; their documented way to put files in a project
   is a skill running a bundled script over bundled templates. `migration.mjs install-rules`
   writes the rule files, the contract documents with their links re-pointed, the contract
   template when there is none, and a pointer block in `AGENTS.md` for agents without the plugin.
   The rule entry points take the consumer's config URL instead of their own location. Last,
   because it moves the files the earlier milestones edit. An npm package was built first and
   removed: it needed a second release channel and nothing consumes the rules yet.
5. Regenerate the plugin mirror, run `npm run validate` once, read the full diff.

No merge and no paid model evaluation.

## Verification record

Each rule change was preceded by its mutation in `scripts/validate-rules.mjs`, run red first:
16 boundary mutations and three missing-key canaries failed with the old rule for the reason they
name, and pass now (61 clean fixtures, 73 mutations). The two database-canary cases and the
provider-classification case failed in `validate-contract-tools.mjs` before the checkers changed.
The opaque identity was red as a compile probe that accepted an object literal; the shared HTTP
contract was red on the missing `contracts.ts`, and its refusal of a foreign envelope was
confirmed afterwards by restoring the cast in `client.ts`: the test failed with a missing
`WorkItemsResponseError`, and passed again once the parser was back. The installer test was red
on the missing command; with link rewriting disabled it fails on the first dangling link.

`npm run validate` passed at the end, 24 checks including the new `validate-rules-install.mjs`,
which runs the installer on an empty project, follows every relative link it wrote, checks the
`AGENTS.md` block against the files it names, repeats the install as an update over an edited
contract and a stale rule file, and then lints and runs a checker through the installed copies.
The review's original probes, pointed at this branch, report every case they found clean on
`c5a70a2`.

Not checked here: a Next.js production build, hosted CI, the installer driven by a skill in a
real Claude Code or Codex session, and an agent without the plugin actually following the
`AGENTS.md` block. Nothing tells a project that its installed rules are older than the plugin
except the release named in that block and in `contractVersion`. `validate-capability-pilots.mjs` keeps its own analyzer of the same contract; the three
fixtures also pass the real boundary rule, but that analyzer was not rewritten on top of it.

`rules/eslint-boundaries.mjs` and `eslint-boundaries-resolved.mjs` show a large diff because their
bodies moved inside a factory; ignoring whitespace the rule changes 182 lines.

## Review round 1: own review

A probe found the outside-source-root fix one case short. A `paths` mapping in `tsconfig.json`
that the contract did not declare, and a bare specifier resolved through `baseUrl`, were read as
packages, so a deep import through either linted clean. Both mutations failed first; the resolver
now honours whatever `tsconfig.json` resolves into the source root and leaves mappings that lead
outside it as packages (75 mutations). The installer now records what it wrote in
`rules/.installed.json` and removes only that when a release drops a file; its test failed on the
missing manifest first. It takes its version from the rules it installs and its address from
whichever host manifest is present. The dependency diagram gained the server-to-view edge, the
rules README lists `index.mjs`, and the tenant cache scenario expects the isolation test.
`npm run validate` passed again after these changes.

Left as stated limits: no exception list for source outside the source root; only the
`work-items` fixture shows the opaque identity; a type from any public root surface is admitted
into `domain/**`.

## Review round 2: Codex, REQUEST_CHANGES

Twelve findings, each checked against the code and each confirmed; every fix was preceded by a
failing case (85 mutations, 66 clean fixtures).

- Import resolution was a reimplementation that took the first `paths` candidate without checking
  that it exists, ignored pattern precedence, dropped mappings that lead outside the source root,
  and guessed directory entries. The rules now ask TypeScript's own resolver with the project's
  compiler options; only what it finds in `node_modules` is a package. The harness stubs became
  real packages, because a mapping to a project file is a project import.
- A source file outside the project root, reached by a relative path, is reported as well.
- Under `verbatimModuleSyntax` an inline `type` specifier is a runtime edge.
- The `'use client'` directive is read from the parsed prologue on both sides of an import.
- A view may not import a `node:` builtin or a `serverPackages` entry, and a view without the
  directive may not import browser-only code (`clientBoundaryMissing`).
- The provider rule applies to type edges; generated provider contracts are a named exception.
- The rule files keep the default exports of 4.7.3. The factories were a leftover of the removed
  npm package and broke every config that already imported the copied files.
- The installer checks the contract with the loader's own test before it writes anything.
- The database canary reads every manifest section.
- `RequestIdentity` is nominal: a spread of a real identity with another tenant no longer
  compiles.
- The HTTP pilot dispatches a pathname only to a mounted route file, and the wire schema is
  derived from the product type. Both were confirmed by breaking them: a contract path with no
  route failed with 404, and a field added to `WorkItem` failed to compile.
- The Route Handler example authenticates before it decodes.

`npm run validate` passed after these changes; the three pilot fixtures lint clean with the real
rule.

## Review round 3: Codex, REQUEST_CHANGES

The twelve earlier findings were not repeated. Ten new ones, each confirmed by a failing case
before its fix (90 mutations):

- A declaration beside a JavaScript file hid the implementation the runtime loads; the resolver
  now returns the implementation. A `require()` edge follows the `require` condition of a package
  mapping, in the rule and in the cycle checker.
- A parenthesised string counted as a directive on the importer side; the parser's directive mark
  is read instead. A view that imports the `client-only` marker itself is reported.
- A `serverPackages` entry is not pure whatever else lists it, and the dependency check refuses
  the contradiction.
- The installer's refusal is the loader's whole validation, moved into the dependency-free
  module: a contract that is not an object or whose roots overlap is refused before any write.
- The installed `rules/` directory is not unowned product source when the project root is the
  source root.
- An identity is frozen and the request scope remembers the ones it issued; the trusted service
  refuses any other object. The static type alone could be carried through `Object.assign`.
- The HTTP body is written through the schema that reads it, so a field the contract does not
  name stays on the server; authentication runs inside the handler's failure boundary.

Not changed: the pilot action resolves its request scope before its failure boundary. The reporter
is part of that scope, so there is nothing to report with until it resolves; the framework's own
instrumentation owns that capture.

## Review round 4: Codex, REQUEST_CHANGES

Seven findings (twelve, then ten, before). The declined action item was accepted. Each was
reproduced before its fix:

- A value edge is resolved without declaration files, by TypeScript's own switch for that, so a
  `types` condition or a declaration in another directory cannot stand in for the file the
  runtime loads; a type edge keeps the declaration. This replaced the sibling-file lookup of the
  previous round. `import()` resolves as an import inside a CommonJS file.
- The `rules/` exemption of the previous round removed the deep-import check with it. Tooling —
  the installed rules, and config files beside `package.json` when the project root is the source
  root — is not reported as unowned and is still read like a route. The root-level layout is now
  linted as `eslint .` lints it.
- An erased import of `client-only` is not a boundary; a pure package under a server-only scope
  is a contradiction the dependency check refuses.
- The shared contract validation covers the segment and surface lists, so the installer refuses
  a contract that would stop the rule from loading.
- The Route Handler example maps a returned failure before it answers `201` and serializes only
  the public body.

## Review round 5: Codex, REQUEST_CHANGES

Six findings. Rounds 3 to 5 kept finding one more way for TypeScript's resolution to differ from
the single answer the rule assumed, and one more place where the lint rule and the dependency
check matched packages differently, so the mechanism changed instead of the cases:

- An edge is judged against every target it can load. Under Node resolution it is resolved under
  both conditions and each result is checked; the flags that said how an edge was written are
  gone. This covers an explicit resolution mode on a type import and the cycle checker, which now
  also reads `verbatimModuleSyntax` (confirmed by removing the option: the cycle was missed).
- A target in `node_modules` is a package under its own name, so an alias such as `#driver`
  cannot carry a provider past the rule.
- Package identity matching lives in one function used by the rule and by the dependency check.
- A declaration beside a JavaScript surface names the same surface.
- Product code does not import tooling (`toolingImport`), which closes the bridge the tooling
  exemption left for rules that only name their target.

## Review round 6: Codex, REQUEST_CHANGES

Five findings. Three were plain defects, each failing first: a `#` alias lost the subpath of the
package it names and a type import took the name of its `@types` package; `server.d.js` was read
as a declaration companion; `actions.d.ts` was held to the export rules of a `'use server'` module.

The other two were the third turn of one argument. Picking the condition an edge loads was wrong
for some edges (round 4), judging both conditions was wrong when the forbidden one cannot load
(this round), and inferring the strategy from `tsconfig.json` was incomplete either way. The owner
chose to stop modelling it: every edge is resolved under both conditions with whatever strategy is
configured, and a specifier that reaches different project files is reported as
`ambiguousResolution`. Nothing is guessed, nothing passes unseen, and the cost is stated: a
project may not point one alias at two of its own files.

## Review round 7: Codex, REQUEST_CHANGES

Three findings; the ambiguity decision was accepted. All three were about the name a package is
classified under and about declaration files, and each failed first:

- A package target carries every name it is reached by: the bare specifier, the leaves of the
  matching `imports` entry in the importing file's own package scope with a pattern filled in,
  and the package that owns the resolved file. A pattern alias, an alias in a nested package and a
  relative path into `node_modules` no longer change what a package is classified as.
- Every edge of a declaration file is a type edge, in the rule and in the edge collector.

## Review round 8: Codex, REQUEST_CHANGES, at the cap

The seventh dispatch used the last round of the thread. Its three findings were reproduced and
fixed; these fixes have not been reviewed:

- Names found under the two conditions were merged into one package target, so a classified
  package answered for an unclassified one behind the same alias. Each package is its own target
  and carries only its own names.
- Between alias patterns with the same prefix the longer key wins.
- A relative or absolute path into `node_modules` is refused (`packageByPath`) instead of being
  classified by the owning package alone, which lost the entry point.

The review ended without APPROVE. Verdicts by dispatch: REQUEST_CHANGES seven times, with twelve,
ten, seven, six, five, three and three findings; every finding was confirmed against the code
except half of one, which was declined with a reason the reviewer accepted.

## Review round 9: Codex, REQUEST_CHANGES, one round past the cap by the owner's word

Codex confirmed the three round-8 fixes closed and the earlier safeguards intact, then reported two
blocking defects and one hardening idea. All three had one cause: a package target was named by
what the specifier could mean, not by what the resolver loaded. Alias leaves were kept when they
belonged to the owning package, so two entry points of one package shared a name set, and the
package name was read from the install directory, so `"db": "npm:pg@8"` stayed `db`.

Reproduced first (six failures in `scripts/validate-rules.mjs`): a domain file importing `#entry`
(`import` → `entry-sdk/schema`, classified pure; `require` → `entry-sdk/io`, unclassified) passed;
a route importing `db` whose manifest says `pg` passed; `#entry` resolved to one target; `db` and
`db/sub` carried no manifest name; a path to `node_modules/entry-sdk/build/addon.node`, which
TypeScript cannot resolve, was placed as a project file.

Fix, in `rules/contract-paths.mjs`: an alias keeps only the leaves that resolve, under the same
mode and from the scope that declares the alias, to the file the alias resolved to; every kept
spelling is also respelled with the manifest name TypeScript reports (`packageId.name`) when it
differs from the install directory; the package is added under both names; an unresolvable path
into `node_modules` is a `byPath` package like a resolvable one. `validate-rules.mjs` now reports
71 clean fixtures and 96 boundary mutations.

## Review round 10: Codex, REQUEST_CHANGES; one finding fixed, one declined

Codex confirmed the three round-9 fixes closed and reported two blocking defects.

Fixed: a linked install. TypeScript reports the real path of a linked package and keeps the path
it was found at in `originalPath`. The installed name was read from the real path, so a store
link `next-runtime -> .store/next@x/node_modules/next` gave an installed name equal to the manifest
name and the entry point was never respelled, and a workspace package behind a `#` alias had no
`node_modules` in its real path and was judged a project file outside `sourceRoot`. Reproduced
with four failures (a view importing `store-alias/server` passed; `store-alias/server`,
`#linked` and `linked` resolved to the wrong targets, the last with an empty name); the clean
fixture `src/app/linked-workspace/page.ts` was confirmed to fail when the link detection is
broken. `installedPath` now takes whichever of `originalPath` and `resolvedFileName` lies below
`node_modules`. `validate-rules.mjs`: 72 clean fixtures, 97 boundary mutations.

Declined: "matching files still let an unclassified branch inherit purity". The setup maps
`#shared` to `sdk/schema` for `import` and `sdk/io` for `require`, where both subpaths export
`schema.mjs` under `import` and `io.cjs` under `require`, and only `sdk/schema` is pure. The file
the alias loads under `require` is `io.cjs`, which is exactly the file `require('sdk/schema')`
loads. The contract classifies specifiers, and a classified specifier names whatever it loads
under each condition, so a direct `sdk/schema` edge is admitted in both modes and the alias loads
nothing that edge would not. The probe is kept as a function-level case (`#same`).

## Review round 11: Codex, REQUEST_CHANGES; the name mechanism replaced

Codex closed the symlink item, accepted the decline, and reported one blocking defect: a tsconfig
`paths` mapping `"@vendor/*": ["./node_modules/*"]` reaches `next/headers.js` under a spelling that
matches no `serverPackages` entry. It also noted that a linked package without a manifest
version has no `packageId`, so its manifest name was lost.

The reported case was one instance of a wider one, found while reproducing it: an entry point
was named by spelling. `import 'plain-sdk/server.js'` from a view passed although
`plain-sdk/server` was in `serverPackages`, with no alias or mapping involved. Rounds 7 to 10
had each patched another spelling (alias leaves, npm aliases, links).

The mechanism is replaced in `rules/contract-paths.mjs`: a loaded file answers to its package
(installed name and manifest name, the latter read from the manifest when TypeScript reports
none) and to every contract entry that resolves, under the same mode, to that same file. The
specifier's spelling is no longer a name for an installed package, so `aliasedPackages` and the
leaf filter are deleted. `packageByPath` stays for relative and absolute paths. Reproduced first:
`BadVendorPathView` and `BadDeepServerView` passed, and eleven function-level expectations
differed.

Found alongside and fixed: `import fs from 'fs'` in a view passed, because the browser check
read the `node:` prefix of the specifier. An unresolved builtin now answers to its prefixed name
and the check reads names. `validate-rules.mjs`: 72 clean fixtures, 100 boundary mutations.

## Review round 12: Codex, REQUEST_CHANGES on the new mechanism

Codex closed the round-11 item and the residual one, confirmed `@types`, scopes, markers,
uninstalled packages and conditional exports, and reported three defects in the new mechanism.
All three reproduced (five failures) before the change.

- A second copy of a package. A contract entry was resolved from the importer, which finds the
  top-level copy; a file loaded from `wrapper/node_modules/dual-sdk` through a `paths` mapping
  therefore never matched `dual-sdk/server`. The entry is now resolved from beside the
  `node_modules` that holds the copy the file came from (`host` in `installedPackage`).
- An entry written against an alias spelling (`@vendor/plain-sdk/edge.js` in `serverPackages`)
  matched nothing once spelling stopped being a name. Restricting lists now also match the
  specifier as spelled (`restricted` in `rules/eslint-boundaries.mjs`); `purePackages` still
  admits only names the resolution gave, so no spelling can earn a permission.
- A package installed under a builtin's name. TypeScript resolved bare `fs` to it, so the
  builtin identity added in round 11 never applied. Builtins are recognised before resolution.

While pinning the cases, `dual-sdk/server.js` produced two targets under NodeNext: the
extensionless entry does not resolve as ESM, so the ESM-mode target lost the name. An entry now
names every file it can load under either mode; the edge is still resolved per mode.
`validate-rules.mjs`: 72 clean fixtures, 101 boundary mutations.

## Review round 13: Codex, REQUEST_CHANGES; entries asked of the package itself

Codex closed the three round-12 items and accepted both widening decisions. One blocking defect:
a contract entry was resolved by specifier from a file beside the holding `node_modules`, and a
specifier can be diverted. When the holding package is itself named like the entry's package,
TypeScript resolves the name to the holder's own exports; an exact `paths` mapping of the
entry's spelling sends it to another copy. A residual note: a `paths` mapping of a pure entry's
spelling gave the mapped file the entry's identity.

Reproduced with four failures. An entry is now resolved from the package's own manifest
(`manifest` in `installedPackage`) with package resolution only
(`paths.packageResolution`: the compiler options without `paths` and `baseUrl`). From there a
package reaches its own name through its own exports and its installed name before any other
copy, and no mapping applies.

Found while reviewing the same code: an installed name could grant purity. A package installed
as `pure-alias` whose manifest says `impure-real` passed in `domain/` when `pure-alias` was in
`purePackages`. The target now carries `names` (the manifest name and the entries it exports the
file under) apart from `aliases` (the installed name and entries spelled with it); the rule
permits by `names` only and restricts by names, aliases and the specifier.
`validate-rules.mjs`: 72 clean fixtures, 102 boundary mutations.

## Review round 14: Codex, REQUEST_CHANGES; entries asked without a lookup

Codex closed the round-13 item and the residual note, and confirmed that no `purePackages`
permission is reachable through an installed name, a spelling, a `paths` mapping or an alias.
One blocking defect: a package installed as `driver-alias` that holds another version of itself
under the same alias. The entry was asked by the installed name from the package's manifest,
and that lookup finds the copy inside before the package itself.

Reproduced with three failures. An entry is no longer looked up by installed name. A package
with an export map is asked by its manifest name, which from inside is a self reference through
its own exports; a package without one loads an entry as a path inside itself and is asked for
`./<entry>`. A probe showed that TypeScript reads export maps under `node10` too once a
resolution mode is passed, as it is for every edge here, so the choice depends on the manifest
alone. Asked from a link, the answer is spelled through the link, so it is compared with both
paths of the loaded file.

Introduced and caught in the same round: comparing against `[resolvedFileName, originalPath]`
made an entry that resolves to nothing match a file with no `originalPath`. A listed entry that
does not exist (`entry-sdk/missing`) reproduced it with five failures; an unresolved entry now
matches nothing. `validate-rules.mjs`: 72 clean fixtures, 102 boundary mutations.

## Review round 15: Codex, REQUEST_CHANGES; TypeScript asked in isolation

Codex closed the round-14 item and reported two blocking defects and a residual note, all in
the way an entry was asked of a package: the relative question skipped `typesVersions`,
`exports: null` was taken for an export map, and a project with
`resolvePackageJsonExports: false` lost the entry name. Each reproduced (four failures).

The cause was shared: the two questions of round 14 (self reference, or a path inside the
package) approximated TypeScript's package resolution instead of running it. `onlyPackage` now
builds a resolution host in which the directory of the one copy is mounted, under its installed
name, in the `node_modules` of an importer that exists nowhere else, and the entry is resolved
there by the same function, options and modes as every edge. TypeScript applies whatever it
knows about the package and the project, and no other copy, held package or holder exists in
that host to answer instead. The manifest is read only for the package's name. All earlier
cases pass unchanged: nested copies, a self-named holder, store and workspace links, scoped
names, `@types` companions, `node10`. `validate-rules.mjs`: 72 clean fixtures, 102 boundary
mutations.

## Review round 16: Codex, REQUEST_CHANGES; the real filesystem, the holder's scope hidden

Codex closed both round-15 items and the residual note, and reported two blocking defects in
the isolated host. It hid what an entry legitimately reaches outside its own directory: a
`types` target in a sibling package was missing there, so TypeScript fell back to a declaration
the real installation never loads and that file got the entry's name. And paths were compared
as strings: two links inside a package that lead to one file, or a case-only difference on a
filesystem that ignores case, counted as different files. Each reproduced (three failures).

The host no longer mounts anything. `besideHolder` places the importer in the directory whose
`node_modules` holds the copy and uses the real filesystem, hiding only the manifests at and
above that directory, so the importer has no package scope and the holder cannot answer by
self reference. Package lookup from there finds this copy first and never looks inside it.
The answer and the loaded file are compared by `fs.realpathSync.native`. The mount, its path
translation and the `originalPath` comparison are gone. `validate-rules.mjs`: 72 clean
fixtures, 102 boundary mutations.

## Review round 17: Codex, REQUEST_CHANGES; manifests stay files, identity follows the project

Codex closed both round-16 items and reported two blocking defects and a residual note.
Hiding the manifests at and above the importer also hid them as files, so an entry whose `main`
is the holder's `package.json` fell back to a local `index.js`, which got the entry's name.
And comparing real paths ignored `preserveSymlinks`: in a project that keeps links apart, two
links to one file are two modules, yet one inherited the other's entry name. Both reproduced.

`besideHolder` now leaves every file in place and reads those manifests as `{}`: the
importer's scope has no name and no export map, so the holder still cannot answer by self
reference, and a manifest remains a file an entry can point at. `fileIdentity` compares by
real path unless the project preserves symlinks, and then by TypeScript's own path with the
filesystem's case policy; a file that vanished after it was resolved is its own path instead
of an exception. `validate-rules.mjs`: 72 clean fixtures, 102 boundary mutations.

## Review round 18: Codex, REQUEST_CHANGES; three cases from ordinary projects

Codex closed both round-17 items and the residual note. Asked to say how each finding arises,
it marked all three of this round as arising in ordinary projects.

- `typesVersions` on a value edge. A package that ships `server.js` and maps `server` to
  `types/server.d.ts` resolved to the declaration even without declaration lookup, because
  TypeScript accepts the mapped file by exact path. A deep import of `legacy-sdk/server.js`
  then missed the `legacy-sdk/server` entry. Value edges are resolved through `runtimeHost`,
  which reads manifests without `typesVersions`; type edges and the declaration fallback keep it.
- A builtin behind an alias. `"#fs": "fs/promises"` has no file, so TypeScript finds nothing and
  the rule kept only `#fs`. `aliasedBuiltins` reads the builtin leaves of the alias in the
  importer's package scope; under each mode the alias is the builtin when a builtin leaf fares
  as the alias does — neither is found, or both lead to a package installed under the builtin's
  name.
- A manifest with a byte-order mark threw in `JSON.parse`. Manifests are read with
  `ts.readConfigFile`, as TypeScript reads them.

The manifest failure was observed directly; the other two were confirmed by disabling each new
mechanism and watching `legacy-sdk/server.js`, `#fs`, `#rawfs` and `BadAliasedBuiltinView` fail.
`validate-rules.mjs`: 72 clean fixtures, 103 boundary mutations.

## Review round 19: Codex, REQUEST_CHANGES; TypeScript selects the alias branch

Codex closed the three round-18 items and reported two blocking defects in the way a builtin
behind an alias was recognised, both in ordinary projects, and a residual note. The rule
compared the alias with its builtin leaves instead of knowing which branch a mode selects: a
`types` condition beside `default: "fs/promises"` gave a value edge the declaration and hid the
builtin, and a builtin under a condition that is not active counted where `require: null`
blocked the other mode, which produced a false `ambiguousResolution`. Both reproduced.

`aliasedBuiltins` and the comparison are replaced by `aliasHost`: a `#` specifier is resolved
through a host that rewrites every builtin target of an `imports` map to a file of its own in
a directory that exists nowhere else (`.node-builtin`). TypeScript then evaluates conditions,
patterns and `null` itself, and a resolution that lands in that directory is the builtin named
by the path. The residual note (a manifest key spelled through a JSON escape slipped past the
text precheck) is closed in `manifestHost`, which both manifest rewrites share: a manifest that
contains an escape is parsed and the parsed key decides; confirmed by removing the check.
`validate-rules.mjs`: 72 clean fixtures, 103 boundary mutations.

## Review round 20: Codex, REQUEST_CHANGES; markers known by their whole path

Codex closed both round-19 items and the residual note and reported two blocking defects and
a residual note, all in `aliasHost`. A dependency whose manifest has `imports: null` crashed
the rewrite (observed: `Object.entries(null)`). With `moduleSuffixes: [".server", ""]` the
builtin's name was decoded from the file name TypeScript probed, so `fs` became
`node:fs.server`. And any real file in a directory of the marker's name counted as a builtin.

The marker is no longer decoded from a name. `aliasHost` keeps a map from each marker's whole
path to the builtin it stands for, reports exactly those paths as existing, and recognises a
resolution only by that map; a suffixed name TypeScript tries first does not exist and a real
file is not in the map. The marker is a `.ts` file, which both passes load. A manifest whose
`imports` is not a map is left as it is. The `moduleSuffixes` case is pinned but was not seen
failing here: the validator stopped at the `null` crash first, and the decoding it would have
exercised is deleted. `validate-rules.mjs`: 72 clean fixtures, 103 boundary mutations.

## Review round 21: Codex, REQUEST_CHANGES; markers under every suffix, beside real files

Codex closed both round-20 items for the reported cases and reported one blocking defect and a
residual note. With `moduleSuffixes: [".server"]`, which has no empty entry, TypeScript probes
only `0.server.ts`; the host knew `0.ts`, so the builtin branch was never found and a value
import of `#typedfs` fell back to its declaration. And a real file at a marker's exact path
was still taken for the builtin another alias registered there. Both reproduced: the first
directly (two failures), the second by removing the collision skip.

A marker now exists under every name the configured suffixes make TypeScript try and is
recognised under those and under the plain name: a probe showed TypeScript reports the plain
target name for a file it found through a suffix. It is allocated at the first index where
none of those names is a real file. `validate-rules.mjs`: 72 clean fixtures, 103 boundary
mutations.

## Review round 22: Codex, REQUEST_CHANGES; an empty suffix list

Codex closed the round-21 item and the residual note and reported one blocking defect:
`moduleSuffixes: []`, which a project writes to clear inherited suffixes, made the alias host
register no existing marker, so the builtin branch was never found. Reproduced (two failures
under a `suffixes cleared` configuration). An empty list is treated like no list: TypeScript
tries the plain name alone. `validate-rules.mjs`: 72 clean fixtures, 103 boundary mutations.

## Review round 23: Codex, COMMENT, no blocking defect

Codex closed the round-22 item and returned `COMMENT` with one residual note, arising only
from a crafted alias: the value pass and the declaration pass each numbered their own
markers, a manifest read more often in one pass shifted the numbering, and a marker from the
declaration pass was decoded with the value pass's map.

`aliasHosts` now builds both hosts over one allocation, so a marker path stands for one
builtin whichever pass produced it, and there is one decoder. I could not reproduce the drift
here: the `#choice` case (a `paths` candidate that is a manifest with builtin targets of its
own, `import: "buffer"`, `types: "os"`) gave the right two targets before the change as well.
It is pinned; the fix is by construction. `validate-rules.mjs`: 72 clean fixtures, 103
boundary mutations.

## Review round 24: Codex, APPROVE

Codex re-ran its `#choice` probe against the shared allocation, confirmed the residual note
closed, checked that the generated mirror matches the source and that `git diff --check main`
passes, and returned `APPROVE` for the working tree. The review ran 23 dispatches on one
thread: seven within the default limit and sixteen more on the owner's word.

## Verification outside the repository

What the review left unverified was checked on a copy of a real adopter (a Next.js 16 project
of about 5,400 TypeScript files, TypeScript 6, bun, its rules copied by hand from release 4.1
and since extended locally), on two throwaway projects, and in a Linux container. The adopter
itself was not modified.

**Installer on a real adopter.** `install-rules` refused the old contract and wrote nothing,
exit code 1; with the three new lists added it installed, kept the contract, stamped the
version and appended the `AGENTS.md` block. Two defects showed and are fixed with failing
cases first: the refusal named one missing list per run (`contractProblems` now names them
all), and hand-copied rule files with local changes were replaced without a word (the result
now lists them under `replaced`; the skill tells the reader to check their `git diff`).

**Rule on a real adopter.** The new boundary rule ran over the whole tree under TypeScript 6
without an error. It reported 49 edges where the adopter's own rule reports none. Six were
false positives of `outsideSourceRoot`, fixed with failing cases first: a framework root file
loading a config file beside `package.json` (`instrumentation.ts` loading an
error-reporting SDK's server config, the layout that SDK documents), and stories importing a fixture from
outside the source root. The remaining 43 are what the contract now asks of that project:
36 hook modules under `ui/**` that import `client/**` without the `'use client'` directive,
and 7 imports in `src/proxy.ts` (provider packages, a route-private file, capability
internals). The other checkers ran: cycles pass; the dependency and database checks report
what the adopter's local extensions used to allow.

**Speed.** The boundary rule alone over that tree: 2.7 s with the adopter's rule, 9.5 s with
the new one. Edge targets are now remembered per directory, specifier and edge kind for thirty
seconds, so an editor still sees new files: 8.0 s, with identical reports (see round 25 for
why TypeScript's own cache, at 5.7 s, was not kept). The
adopter's whole lint takes 97 s.

**Agents.** A headless Claude Code session without the plugin, asked where a new Route
Handler goes in a project the installer had prepared, read `AGENTS.md`, followed the block to
`rules/docs/runtime-boundaries.md` and `rules/docs/architecture-contract.md`, and answered by
the contract. A second session with the plugin loaded ran the installer through
`migrating-architecture`; `$CLAUDE_PLUGIN_ROOT` is not set in its shell, and the skill's
fallback (the directory two levels above the skill file) is what resolved the plugin.

**Production build.** The `work-items` fixture's `modules/` and `shared/`, unchanged, inside a
minimal App Router project (a Server Component reading through `rsc.ts`, a Client Component
using the Server Action, a Route Handler): `next build` on Next.js 16.4.6 passes with webpack
and with Turbopack, and the started server answers the handler's failure path with the
generic 500 and the request id. A Client Component importing a server surface that carries
`server-only` fails the build under both bundlers. The fixtures name emitted `.js` files in
relative imports, which neither bundler resolves to `.ts` on its own: webpack needed
`resolve.extensionAlias`, and for Turbopack the copy's specifiers were rewritten.

**Workflow.** `npm run validate` passes under Node 22 locally and in a `node:22` Linux
container after a clean `npm ci`, which is what `validate.yml` runs. The hosted runner itself
has not run it: nothing is pushed.

Not checked: Codex with the plugin installed (it is installed on this machine, so Codex here
is not an agent without it), and an upgrade of the adopter itself, which is its own piece of
work. `validate-rules.mjs`: 73 clean fixtures, 104 boundary mutations.

## Review round 25: Codex, REQUEST_CHANGES on the changes made after the approval

Codex reviewed the delta from the outside verification and reported three blocking defects and
a residual note. Each reproduced (five failures across the two validators).

- The framework-hook exception made a bridge: the admitted config file is outside the lint
  glob, so `route → instrumentation → config → private file` linted clean. The hook's import now
  answers for the file it admits: every value edge of the config must load a package, a shared
  root or a capability's public surface (`valueEdgeTargets`, `isPublished`). A first version
  admitted packages only; the real adopter's reporting config imports helpers from a shared root,
  and its lint went from 43 reports to 45, so the predicate is what a route may import.
- The development-artifact exemption rests on `devArtifactInProduction`, which did not see
  `require.context` or `import.meta.webpackContext`. Both are reported as hidden targets.
- TypeScript's resolution cache shares an answer with every directory below the one that
  asked, which is wrong where a package scope begins: a name the outer package resolves to
  itself came back for a nested scope that should have found the installed package. The cache
  is replaced by the rule's own, keyed by the exact directory, the specifier and the edge kind.
  On the adopter: 9.5 s without a cache, 5.7 s with TypeScript's, 8.0 s with this one, same
  reports.
- `replaced` named a link when the installer wrote through it; it now names the file the link
  points to, which is where the diff is.

`validate-rules.mjs`: 73 clean fixtures, 107 boundary mutations.

## Review round 26: Codex, REQUEST_CHANGES; the hook exception withdrawn

Codex closed the round-25 cases and reported three blocking defects and a residual note. Two
were in the audit of an admitted root config: its targets were not held to the artifact and
runtime checks, and the audit dropped computed imports, context loaders and type edges. The
third: `require['context']` and `import.meta['webpackContext']` passed.

The audit was an approximation of the rule applied to a file the rule never reads, and each
round found what the approximation left out. The exception is withdrawn in both layouts: a
config file beside `package.json` is outside the source root for a framework root file as for a
route. Code a hook loads runs in production and belongs under a contract root, where ownership
and runtime are checked by the rule itself; for an error-reporting SDK's server config that is `shared/server`. This reverses
part of "Verification outside the repository": of the six reports first treated as false
positives, the four from stories remain exempt and the two from `instrumentation.ts` are
correct. The adopter's count is 45: those two, 36 hook modules and 7 imports in `src/proxy.ts`.

Added with failing cases first: nothing imports a framework root file (`frameworkRootImport`),
which closes a route or a browser file taking a hook's runtime; context loaders are recognised
by a literal member name in brackets as well as after a dot; the installer reports every
replaced file by its real path, so a link above the file is followed too.

While rewriting the cases a duplicate key came to light: the fixture added for the exception
was named `src/instrumentation.ts` and silently replaced an existing clean fixture of that
name. The existing one is restored and the new one renamed. `validate-rules.mjs`: 73 clean
fixtures, 110 boundary mutations.

## Review round 27: Codex, REQUEST_CHANGES; URL edges, declarations

Codex closed the round-26 cases and reported two blocking defects.

- A worker loaded through `new Worker(new URL(…, import.meta.url))` and an MDX page can load a
  development artifact unseen, so the artifact exemption from `outsideSourceRoot` was said to be
  unsafe. Confirmed for the worker, and wider than stated: a route loading a capability-private
  file through such a URL linted clean, artifact or not. A literal
  `new URL('./file', import.meta.url)` is now read as an edge; a computed path is an asset
  chosen at run time and is left alone. The real project has eight such URLs and its reports
  did not change. MDX is declined as a reason to drop the exemption: the rule parses no MDX
  file, so an MDX page can import the outside-root helper, or a private file, directly; the
  exemption changes nothing there. That limit is now stated in the README.
- `frameworkRootImport` reported a type import from `src/middleware.d.ts`: the stem of a
  declaration is the name of a root file. Declarations are excluded.

`validate-rules.mjs`: 75 clean fixtures, 111 boundary mutations.

## Review round 28: Codex, REQUEST_CHANGES; one reading of URL edges

Codex closed the round-27 cases and accepted the MDX decline. Two blocking defects, both about
the URL edge added in round 27, both reproduced (three failures): the visitor required a
leading dot and the dot form of `import.meta.url`, so `new URL('demo.fixture.js', …)` and
`import.meta['url']` passed; and the cycle checker did not read URL edges at all, so a cycle
closed by a worker was invisible to it.

`urlSpecifier` in `rules/contract-paths.mjs` is now the one reading of such a reference: an
absolute URL or a path from the origin's root is no module; anything else is relative to the
importing module, with or without a leading dot, minus a query or fragment. `moduleEdges`
emits the edge, so the cycle checker has it, and the lint visitor calls the same function and
accepts the bracket form of the base. On the real project lint and the cycle checker report
what they did before. `validate-rules.mjs`: 75 clean fixtures, 113 boundary mutations.

## Review round 29: Codex, REQUEST_CHANGES; what the compiler erases, the project root, new.target

Codex closed both round-28 items and reported three more about the URL edge, each reproduced.
An assertion on either argument (`'./x.js' as const`, `import.meta.url as string`) hid the
edge from both readers although the compiler erases it. A path from the root
(`/src/modules/…/x.js`) is resolved against the project by Next's webpack configuration and
was dropped as a public URL. And `new.target.url`, the same kind of node as `import.meta.url`,
was taken for it, as `new.target.webpackContext()` was for a context loader.

Both readers now look through erased syntax (`ts.skipOuterExpressions` in `moduleEdges`,
`erased` in the lint rule) and match `import.meta` by its keyword. `urlSpecifier` takes the
project root and the importing file: a rooted path is an edge when a file is there under the
project, and a public URL otherwise. On the real project lint and the cycle checker report
what they did before. `validate-rules.mjs`: 75 clean fixtures, 115 boundary mutations.

## Review round 30: Codex, REQUEST_CHANGES; the two readers of a URL edge agree

Codex closed the three round-29 items and reported two more, both reproduced. The extractor
missed forms lint already read (`new (URL)(…)`, `import.meta['url' as const]`), so a cycle
could still hide; and a rooted path naming a directory (`/src/…/worker`, loaded through its
index) was dropped as a public URL.

In `moduleEdges` every name is now read through parentheses and assertions (`bare`, used by
`literal` and for the constructor); in the lint rule the constructor goes through `erased` as
the arguments do. The lookup of a file a path names — itself, with a source extension, or a
directory's index — is one function, `sourceFileAt`, used by `urlSpecifier` and by the lint
rule's `resolveSourceFile`. `validate-rules.mjs`: 76 clean fixtures, 117 boundary mutations.

## Review round 31: Codex, REQUEST_CHANGES; a rooted URL decided by resolution

Codex closed both round-30 items and reported two more about rooted URLs, both reproduced:
the trailing slash was lost when the path was rewritten as a relative specifier, so
`/src/…/client/` reached the public `client.ts` instead of the directory; and a directory that
names its entry in a manifest (`"main": "run.js"`) was not found by the lookup and passed as a
public URL.

`urlSpecifier(reference, importer, paths)` no longer looks for a file itself. A rooted
reference is rewritten as the relative specifier naming the same place, slash included, and is
an edge when TypeScript resolves that specifier as it would an import; otherwise it is a public
URL. `moduleEdges` passes its `paths` through, so the cycle checker decides the same way.
`validate-rules.mjs`: 77 clean fixtures, 120 boundary mutations.

## Review round 32: Codex, REQUEST_CHANGES; a directory a bundler enters

Codex closed both round-31 items and reported one more, reproduced with three failures: a
directory whose manifest names its entry in `module` is entered by Next's bundler and not by
TypeScript, so the rooted URL to it was taken for a public URL and neither reader saw it.

Two changes. A rooted reference is an edge when anything is there under the project — a file,
a file under another source extension, a directory — and a public URL only when nothing is;
what it loads is then decided by resolution, as for any import. And where TypeScript finds
nothing for a relative specifier that names a directory, `bundlerEntry` reads the manifest's
`browser` or `module` field, so lint and the cycle checker both get the file the bundler loads.
That second change applies to ordinary imports as well. `validate-rules.mjs`: 78 clean
fixtures, 121 boundary mutations.

## Review round 33: Codex, REQUEST_CHANGES; a manifest with more than one entry

Codex closed the round-32 item and reported one more, reproduced with three failures: a
directory manifest may name one file in `main` and another in `module` or `browser`, and Next's
client and server builds order those fields differently. TypeScript returned the `main` file and
the fallback never ran, or the fallback picked `browser` for an import a server build loads
through `module`.

`bundlerEntries` returns every file the manifest names in `browser` and `module`; for a value
edge whose relative specifier leads into a directory of the project they are added to the
targets TypeScript found. File targets are keyed by file identity, so the same file under two
fields is one answer, and different files go through the existing ambiguity handling: the
edge is refused with `ambiguousResolution`, whose message now speaks of how a specifier is
loaded rather than of import and require. `validate-rules.mjs`: 80 clean fixtures, 122
boundary mutations.

## Review round 34: Codex, REQUEST_CHANGES; the directory a request enters

Codex closed the round-33 item and reported one more in two forms, both reproduced: the
directory whose manifest was read for bundler entries was guessed from the specifier, so an
alias that leads into a directory was skipped, and so was a manifest whose `main` leads out of
its directory, because TypeScript's answer then lies outside it.

The directory is now read off the resolver. The edge's own resolution runs through hosts that
note every manifest it reads (`watched`); the project manifests among them that have bundler
entries are candidates. For those, the resolver is asked once more for a name no file has,
inside the requested place, and a candidate counts when the resolver looks for that name in
its directory. In a project without such manifests nothing extra runs. On the real project
the reports are unchanged and the boundary rule takes about 9 s. `validate-rules.mjs`: 80
clean fixtures, 122 boundary mutations.

## Review round 35: Codex, REQUEST_CHANGES; no second question

Codex closed the outward-`main` half of round 34 and kept the alias half open, reproduced
with two failures: asking the resolver for a name inside the requested place changes the
request, so an alias with no wildcard and one with the wildcard in the middle no longer
matched, and their directory was not found.

The second question is removed. The edge's own resolution already shows which directory it
entered: the resolver looks for a file of the directory's name before it reads the manifest
inside. `watched` notes both, and a project manifest the resolution read belongs to an entered
directory when that file was looked for, or the directory is the one a relative specifier
names, or the manifest is not one of the importing file's own package scopes. `validate-rules.mjs`:
80 clean fixtures, 122 boundary mutations.

## Review round 36: Codex, REQUEST_CHANGES; entering a directory, decided by TypeScript

Codex closed the alias cases of round 35 and reported two more, both reproduced: an alias
whose target ends in a slash, used from inside the directory it names, was missed, because the
resolver looks for no file of the directory's name then and the manifest is one of the
importer's own scopes; and a manifest with `types` and `module` gave a value edge two
"runtime" files, the declaration TypeScript fell back to and the module entry.

The three signs by which a directory was taken to be entered are replaced by one test that
TypeScript performs itself. `entering(hosts, directory)` gives hosts in which that directory's
manifest says only that its entry is a marker file existing there. The edge is resolved again
through them, and the directory is entered exactly when the answer is the marker; a manifest
read as a package scope never leads there. When an entered directory has bundler entries, a
declaration among TypeScript's targets is dropped before they are added: it stood in for a
runtime file that the bundler's field names. `validate-rules.mjs`: 80 clean fixtures, 122
boundary mutations.

## Review round 37: Codex, REQUEST_CHANGES; one naming rule for markers

Codex closed both round-36 items and reported one more, reproduced: under a suffix-only
`moduleSuffixes` the marker by which a directory is known to be entered existed only under its
plain name, so TypeScript never found it and the bundler's entry was dropped. The marker of a
builtin behind an alias had the same defect in round 21.

`markerNames(stem, moduleSuffixes)` is now the one rule for both: the names a marker exists
under, one per configured suffix, and the names it is recognised by, which add the plain one.
`aliasHosts` and `entering` both use it. `validate-rules.mjs`: 80 clean fixtures, 122 boundary
mutations.

## Review round 38: Codex, APPROVE

Codex confirmed the round-37 fix with its own probe, including an alias that points to an
ancestor directory and the builtin aliases under default, empty, mixed and suffix-only
`moduleSuffixes`, found no remaining blocker, and returned `APPROVE`. That is the second
approval on this thread: the first, in round 24, covered the branch before the verification
on a real project; this one covers the changes that verification and its fourteen review
rounds brought. 37 dispatches in all.
