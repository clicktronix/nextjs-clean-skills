# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- **BREAKING**: renamed the architecture skill from `designing-nextjs-capabilities` to
  `designing-architecture`. The previous name repeated `nextjs`, which the plugin name already
  carries, and scoped the skill to capability placement when it also governs runtime boundaries,
  caching, ports, authorization and RLS. Invocations become
  `/nextjs-clean-skills:designing-architecture` and `$designing-architecture`. Frozen eval artifacts
  keep their historical paths, which predate both renames.


- Replaced the prescribed four-provider component recipe with state ownership first: keep
  per-keystroke state in its smallest subtree and split Context only by real consumer sets or update
  frequencies.
- Tightened forms, feedback, styling, accessibility, and Server/Client boundary guidance while
  keeping framework-specific rules out of portable references.
- **Breaking.** Renamed both skills to the gerund form the skill-authoring guidance recommends:
  `nextjs-architecture` to `designing-nextjs-capabilities`, `react-component-creator` to
  `creating-react-components`. Skill directories, frontmatter names, scenario directories, docs
  links, the frontmatter schema, and the validators moved with them. Frozen eval artifacts keep
  the old names on purpose: `run-architecture-eval.mjs` archives control arms from tags and commits
  that predate the rename, and `tests/architecture-evals/candidate/` plus `opus5-gates/` are hashed
  snapshots.
- Scoped the `creating-react-components` decision gate to non-trivial changes so a one-line UI edit
  does not require the full seven-field classification.
- Linked failure ownership and error taxonomy directly from `creating-react-components`, which reached
  them only through `loading-and-errors.md` and `notifications-and-feedback.md`. A reference behind a
  reference gets previewed rather than read whole, so the routing path now stays one level deep.
- Added what each skill does to its `description`, after the existing "Use when" trigger clause that
  this repository requires, so routing metadata carries capability and trigger rather than trigger
  alone.
- Recorded the frozen matrix's known limitations in `tests/architecture-evals/README.md`: the
  candidate arm is a v3 snapshot shipped without references, negative rubric item 4 fires on the
  `shared/server` root the contract admits, and generation runs on Codex models only.
- Told `designing-architecture` to read its references directly rather than delegating a handful of
  file reads to subagents, and to size a written proposal to the decision it serves.
- Invalidated six recorded GREEN scenario cells that the gate removal and rename put out of date:
  `explicit-variants-over-mode`, `next16-error-retry-callback`, `static-hook-calls`,
  `database-resource-ownership`, `external-backend-authority`, and `supabase-identity-modes`. The
  original observations are retained under `green_check_invalidated` with the reason; the coverage
  table now reports them as rerun-pending rather than GREEN. This is the content-hash guard working
  as designed — the cells need a RED/GREEN rerun before release, not a hash refresh.

### Added

- The plan declares **channel changes**, and the gate surfaces them. The architecture decides which
  runtime channel a behaviour belongs on — browser-owned reads use `GET` or streams and never Server
  Actions — so a capability sitting on the wrong channel *must* move, and moving it is still a
  behaviour change. In the first live run the pilot's browser reads went from Server Actions to a GET
  route, which altered the error shape, made 5xx retryable under the shared predicate, and turned one
  store outage into one Sentry report per attempt. Typecheck, lint, 988 tests and the production build
  all stayed green, because nothing tested report-once; only the adversarial reviewer caught it, and it
  cost two fix rounds. The word "channel" did not appear anywhere in phase 2 before this change.
- The pilot's human gate is written as instructions instead of a citation. It named the document and
  asked for "accept, revise or reject"; the operator of the first live run said they did not
  understand the sentence, which means the gate asked for a decision it had not equipped them to
  make. It now states what the run did, what each verdict means, what to do next in each case, and
  the name of the next capability to pass to the workflow.
- The gate names the capabilities still on the old layout, and says that a repository holding both
  layouts between capabilities is the intended state. The same operator saw `src/modules/work-items/`
  beside an untouched `src/use-cases/labels/` and asked whether the migration had failed. It had not
  — a pilot is one capability by design — but nothing in the output said so. `capabilities` is now
  admitted by the manifest schema, which had been closed against a key phase 1 writes: the fourth
  instance of that trap in this file.
- Two checks the architecture stated and nothing enforced, ported from the downstream template and
  made portable on the way:
  - `check-shared-admission.mjs` decides the countable half of shared admission — how many real
    OWNERS (a capability, `app`, another shared root) import a file under `sharedRoot`. Identical
    meaning, lifecycle and coordination cost stay a review judgement, and the check says so rather
    than claiming a semantic property is linted. Verdicts: `unused` (delete), `demote` (one
    capability owns it, that is its home), `speculative` (one importer, written for a second
    consumer that never arrived), `private` (its own root's detail, not governed).
  - `check-neutral-surfaces.mjs` decides whether a runtime-neutral surface is consumed from both
    runtimes. `eslint-boundaries.mjs` already constrained what such a surface may import; nothing
    checked that it is actually shared. A `query-cache.ts` used by one runtime is that runtime's
    module sitting in a public slot.
- The ratchet and the exemptions live in `architecture-contract.json` (`sharedAdmissionBudget`,
  `sharedAdmissionExempt`), not in the script. A vendored check carrying one repository's debt
  numbers is a check the first adopter edits, which forks it from this source and ends re-sync —
  which is exactly what happened to the copy this was ported from. Absent, the budget is zero.
- Both checks resolve paths through `contract-paths.mjs`, so a repository whose alias is not `@/`
  and whose source root is not `src` is judged correctly. The fixtures use `~/` deliberately: with
  the conventional alias they would have proved nothing about portability.
- Both phases run them. Phase 1 counts them in the census and states that, like the database check,
  they are structurally red before anything moves. Phase 2's architecture oracle runs them against
  the migrated capability, where a helper moved into `shared/**` or a surface created by the
  migration is exactly what they exist to catch.


- Migration workflows now ship **inside the plugin**, at
  `plugins/nextjs-clean-skills/workflows/`: `prepare-architecture-migration` inventories a target
  repository, assigns every source file one owner and role, installs `rules/` with a drafted
  contract, and records the behavioural baseline plus a per-messageId violation census;
  `migrate-capability` migrates one capability against three oracles — the target's own
  typecheck/lint/tests/production build, `rules/` as a burndown against that census, and an
  adversarial review of the properties this document says static rules cannot prove — then stops at
  the human accept/revise/reject gate. Previously they lived in the repository's own
  `.claude/workflows/` and reached nobody who installed the plugin. The numeric `10-`/`20-` prefixes
  are gone: a workflow name is also its slash command, and the ordering it encoded is already stated
  in each `whenToUse`.
- `sync-plugin-contract` mirrors `docs/` and `rules/` into the plugin so an installed copy carries
  the normative contract the workflows read, rewriting the relative links that would otherwise break
  one directory deeper. The repository root stays the single source of truth and `npm run validate`
  fails on a stale or hand-edited copy; the mirrored docs are walked by the link checker too, since
  byte-identity proves the transform ran but not that it produced valid links.
- `contractSource` became optional. Omitted, phase 1 spends one probe agent to locate the plugin
  root and accepts a candidate only when all four normative sources exist under it. It resolves once
  rather than in each of the fifteen agents that need the path. Phase 2 reads the resolved path back out
  of the manifest instead of re-probing, so both phases quote the same installed copy.
- `npm run validate` gained `validate-workflows`, which parses each workflow as the runtime does,
  evaluates its `meta` in an empty scope, checks phase parity both ways, rejects the globals the
  runtime throws on, and executes the pilot's destination, plan-screening and recommendation logic
  against tables. The workflows README is now covered by the docs link check.


- `dependencyDecisions` lets the operator answer the packages a run reported as undecided:
  `{ "dayjs": "runtime" }`. Phase 1 correctly refuses to classify a dependency the product has not
  ruled on — but until now that stop was a dead end, because the only way forward was to hand-edit
  the target's contract, which is exactly the unrecorded guess the stop existed to prevent. Decisions
  are checked against *this* run's undecided list, so a stale answer to an older question is refused
  rather than written into a new repository's contract, and they are recorded in the manifest and the
  run result so a later reader can tell an inference from a ruling.


- Added the narrow runtime-neutral `query-cache.ts` surface for serializable TanStack Query keys
  shared by server prefetch/hydration and browser queries. Server cache tags and one-sided keys stay
  private, and static plus whole-fixture checks prevent the surface from becoming a generic bucket.
- Defined capability granularity by product goal, vocabulary, policy, lifecycle, change authority,
  and stable contract rather than by tables or CRUD screens.
- Added exhaustive direct dependency classification and a Supabase resource ownership canary for
  undeclared, dynamic, or cross-capability `.from()`/`.rpc()` calls.
- Distinguished Supabase user-scoped and privileged identity modes, documented grants separately
  from RLS, and added the external-authority profile for Next.js BFF modules.
- Added focused loading/error ownership and component-testing references, including accessible
  pending states, expected failure rendering, component-level test selection, and direct Hook calls.
- Recorded current RED-to-GREEN evidence for explicit mode variants, direct Hook calls, and the
  Next.js 16.2 App Router retry signature; scenarios whose RED did not reproduce remain hypotheses.
- Added a two-arm Claude Opus 5 A/B runner (`scripts/run-opus5-gate-eval.mjs`) that reuses the
  frozen scenarios, rubric, response schema, blind-shuffle algorithm, and Codex judge. The frozen
  four-arm runner and its result sets are untouched and still replay byte-for-byte.

### Fixed

- The baseline census carries whether it could measure anything. On a repository that has not moved
  a file yet, `moduleRoot` does not exist, so every capability, segment and surface rule reports zero
  for want of anything to classify — a structural vacuum, not a clean bill of health. Phase 2
  compared its post-migration counts against those zeros, so the first correct pilot read as a
  repo-wide regression and would have been told to revise. Phase 1 now records
  `capabilityTierBinds`, warns when it is false, and phase 2 waives only the regression arm on such
  a baseline; the pilot capability must still reach zero, which never depended on the baseline.
- Phase 1 adds `migration-manifest.json` to the target's formatter ignore list alongside `rules/`.
  It writes that file itself in a later phase, and it failed the target's `format:check` for exactly
  the reason the vendored files did — the first fix covered the directory and missed the file.
- Phase 1 accepts `args` as a JSON string as well as an object. Some invocation paths serialise it
  before the script sees it, every field then read as `undefined`, and the run died with
  "args.repo is required" while pointing at a call that supplied `repo` — blaming the caller for the
  one thing they had got right. Found by the first live run, not by three review passes.
- Phase 1 may write the target's linter and formatter ignore lists, and is told to keep the target's
  own gates as green as it found them. The vendored `rules/` files are written to this repository's
  style, so installing them broke the target's `format:check` — and the phase could not fix it,
  because the ignore files were outside its writable set. Reformatting them instead was never an
  option: it forks them from the plugin source and breaks re-sync.
- Phase 1 no longer requires `check-database-resources.mjs` to exit 0 at baseline. The checker
  attributes an accessing subject from `moduleRoot`/`sharedRoot`/`appRoot`, and before migration
  every data-access file lies outside all three, so enforcement property 7 is unsatisfiable by
  construction — the instruction demanded that phase 1 prove something only phase 2 can create. It is
  now recorded as a burndown item, with an explicit prohibition on the one workaround that would make
  it pass: declaring roots that describe a layout the repository does not have.
- Phase 1 checks that the three packages `rules/` needs are *declared*, not merely resolvable. One of
  them commonly arrives transitively through `eslint-config-next`, leaving the floor resting on a
  dependency the repository never asked for.
- The architecture oracle's `ok` meant two things at once. The prompt asked for `ok=false` both when
  a tool could not run and when the counts came back red, while `archUnmeasured` read every
  `ok=false` as "no measurement" — so a capability with real violations reached the human as
  `inconclusive` ("the oracles did not report") instead of `revise` ("still N violations"). `ok` now
  means only that the tools ran; red is computed from `counts`. A result missing the `capability`
  counter, or any counter present in the baseline census, is unmeasured rather than clean: absent is
  not zero.
- The pilot's plan is now screened as a partition of the manifest's file set — every assigned file
  exactly once, nothing unassigned, no source twice. Screening judged destinations only, so a plan
  covering half the capability passed every check and the pilot reported success over a subset,
  leaving the other half at old paths importing modules that had moved. Surfaces are also checked
  against the recorded consumers and rejected when their export contract is empty.
- `reject` stops the run before the fix loop, not after it. `recommendation()` already put reject
  first, but it is called after the loop, so with fix rounds enabled the fix agents edited the
  ownership model the reviewer had told us to abandon and the human gate received a mutated version
  of the thing it was asked to judge. Every existing whole-body test used `maxFixRounds: 0`, which
  hid it completely.
- Four required handoffs are gated instead of logged: an inventory lens that did not return now
  stops phase 1 rather than assigning owners from evidence nobody gathered; a failed manifest writer
  is a blocker rather than `manifestPath: null` alongside "no blockers, pilot can start"; and a
  failed consumer move stops phase 2 rather than letting the oracles measure a half-migrated tree.
  A consumer move that legitimately touches nothing is still a success.
- The forbidden-syntax check for the workflow VM walks the parsed AST instead of matching
  line-scoped regexes. A dead-branch `await import('node:fs')` and a `new Date()` split across two
  lines both passed while it reported green — a syntax rule judged by anything but the syntax tree
  only ever covers the spellings someone thought to write down.
- `validate-docs` refuses to pass on an empty link walk. Replacing the link iteration with an empty
  iterable left every assertion in the file — including the plugin-boundary one — inspecting nothing
  while `docs ok (20 files, 0 internal links, …)` still exited 0. It also now walks reference-style
  definitions, images and HTML `href`/`src`, none of which the generator rewrites: a link form
  nobody checks is a link form that ships broken.
- Phase 1 checks the target for `typescript`, `eslint-plugin-import` and
  `eslint-import-resolver-typescript` and installs the missing ones before it writes anything. The
  rules it copies import all three, so without them the checks died with ERR_MODULE_NOT_FOUND after
  the contract and the ESLint amendment were already on disk. The workflows README no longer claims
  installing the plugin is all the setup a target needs.
- Phase 2 revalidates the contract path recorded in the manifest instead of trusting it. The phases
  are separate invocations, and the plugin can be upgraded or pruned between them.
- The workflows README claimed parity with the manifest's `deviations` while listing four open items
  against the manifest's two. The missing two — step 8's real user workflow, and the outstanding
  Product Profile fields — are now recorded in the manifest, so the two surfaces agree as
  § Sources Of Truth requires.
- Recorded in the workflows README, rather than only in a pull-request description that a squash
  merge discards, that these workflows have never been executed against a live repository.
- Stopped a breaking skill rename from shipping under an already-released manifest version, and
  made capability-first descriptions the synchronized marketplace source of truth.
- Derived source, module, app, shared, alias, ESLint-glob, cycle, and database-subject resolution
  from one executable contract. Added a nonstandard-root/alias canary so portability cannot regress
  behind a passing default fixture. Direct files under `sharedRoot` remain classified and standard
  dependency or build trees are excluded when `sourceRoot` is the project root.
- Required import-alias prefixes to end with `/`. A separatorless `"@"` claimed every package name
  starting with the same characters and turned the remainder of `@/modules/x` into an absolute
  `/modules/x`, so cross-capability imports and capability cycles resolved to nothing and both
  tools reported clean instead of failing. Root and target paths were already validated; the
  prefix was not.
- Scoped the Supabase resource checker to configured client identifiers. Unrelated `.from()` and
  `.rpc()` methods no longer create false ownership failures; dynamic or unauthorized Supabase
  resource names still fail closed.
- Corrected the architecture-review and stream lifecycle diagrams, moved a Server Action navigation
  example out of the Route Handler reference without swallowing unexpected exceptions, fixed the
  deletion-test definition and v3 migration record, and clarified cache-tier and error-carrier
  semantics.
- Unified the enforcement documentation around seven named properties while keeping historical
  pilot counts separate from current rule-code and mutation coverage.
- Derived capability-pilot surfaces, runtime classifications, and provider package checks from
  `architecture-contract.json` instead of maintaining a second silent copy.
- Allowed explicit named re-exports as module APIs while forbidding `export *`, and enforced the
  Next.js rule that top-level `'use server'` action modules declare value exports locally.
- Rejected private segment `index.ts(x)` files shadowed by same-named root surfaces, and corrected
  the migration status of the downstream template.
- Named `server/` contents as persistence modules while keeping `store.ts` available as a concise
  private implementation filename.
- Made component-skill frontmatter parse-safe, removed stack-specific UI-library examples from
  portable guidance, and distinguished render retry from Next.js 16.2 RSC/data recovery.
- Invalidated recorded GREEN evidence when its skill, reference, or frozen scenario contract
  changes, replacing stale self-reported status with a content hash checked in CI.
- Opened `schemas/skill-frontmatter.schema.json` to the documented Claude Code frontmatter fields —
  `when_to_use`, `paths`, `allowed-tools`, `disallowed-tools`, `argument-hint`, `arguments`,
  `disable-model-invocation`, `user-invocable`, `model`, `effort`, `context`, `agent`, `background`,
  `hooks`, `shell` — plus the Agent Skills `metadata` block. `additionalProperties: false` stays, so
  typos still fail, but adopting a field is no longer a schema change. The `name` enum is replaced by
  the spec's charset and length rule: the enum made every rename a schema edit, and that edit is how
  the PR #16 rename shipped half-done.
- Finished the PR #16 rename in the human-facing titles: the H1 of both skills and `display_name` in
  both `agents/openai.yaml` still read `React Component Creator` and `Next.js Architecture`, so the
  Codex UI and the skill listing disagreed with the invocation name.
- Added a validator check that a skill's H1 and its `interface.display_name` both slug back to the
  skill name. Nothing in the previous 15 checks compared either against the skill, which is why the
  half-done rename passed CI. Mutation-verified in both directions.
- Accepted the values `disable-model-invocation`, `user-invocable` and `background` document: YAML
  parses an unquoted `1` or `0` as a number, and the first pass shipped a string-only branch that
  rejected exactly the values its own description promised.
- Added the Agent Skills spec fields the schema was missing — `license` and `compatibility` (≤500
  chars) — plus the spec's 1,024-character cap on `description`.
- Counted `when_to_use` toward Claude Code's 1,536-character listing cap. The check measured
  `name` + `description` only, so the first skill to adopt the newly permitted field would have blown
  the limit the check exists to guard, silently.
- Covered `schemas/skill-frontmatter.schema.json` with accept and reject fixtures in
  `validate-json-schemas.mjs`, which previously had no negative cases at all. Nine rejected mutations
  now pin the schema: unknown fields, three illegal `name` shapes, both spec length caps, two enum
  violations, and an out-of-range loose boolean.
- Left the reserved words `anthropic` and `claude` unguarded in `name`, deliberately. Anthropic's
  authoring guidance forbids them, but the open Agent Skills spec does not, the guidance never states
  where the rule is enforced, and Claude Code loads `claude-md-writer` from a marketplace today. A
  guard that cannot fire in this repo, misfires on any repo copying this validator, and rests on an
  unverified enforcement point is the same trade that turned `additionalProperties` into a ban on
  upgrades. If these skills are ever uploaded through the Skills API, the check belongs there.

### Removed

- Removed the withdrawn layer-first design journal from the release changelog. Its exact state
  remains available at the named commit and research tag; the changelog now records release-level
  changes only.
- Removed the closing `## Verification Gate` from both skills. Its items restated the rule sections
  almost one for one — seven of eight in `designing-architecture`, all seven in
  `creating-react-components` — so the third copy of each rule spent always-on context and pushed
  models that already self-verify into re-checking. The two items with content of their own moved to
  the sections that own them. `validate-skill-frontmatter.mjs` no longer recommends the heading.

## [2.0.0] - 2026-07-28

> **Breaking.** Product behavior moves from global layer roots to
> `src/modules/<capability>`. The withdrawn layer-first 2.0 implementation remains reproducible at
> commit `626140b5d68e5b3afcfc80e209df5d881f35d59c` and tag
> `research/layer-first-2.0-checkpoint-20260727`; it was never released.

### Added

- Capability-first architecture with optional `domain/`, `application/`, `server/`, `client/`, and
  `ui/` segments. Modules expose only the runtime surfaces they use: `server.ts`, `rsc.ts`,
  `actions.ts`, `client.ts`, `ui.ts`, `stream.ts`, and `job.ts`.
- Human architecture documentation for ownership, runtime channels, frontend composition,
  decision maps, adoption, evidence, and the accepted ADR. Mermaid diagrams are vertical,
  accessible, parsed in CI, and kept separate from the concise agent instructions.
- Cross-capability orchestration rules, complete visible/missing/forbidden resolution for
  authorization-sensitive joins, a strict shared-admission and demotion gate, and separate stream
  idle-timeout versus job-deadline ownership.
- Capability-aware ESLint rules for public-surface ownership, domain/application purity,
  browser/server separation, public and shared vocabulary, unresolved imports, and cycles. The
  integration validator exercises 20 clean fixtures, 19 boundary mutations, and five resolver or
  cycle canaries.
- Three architecture pilots: store-backed CRUD, remote streaming plus a job, and
  cross-capability board orchestration. Runtime tests and ten mutations protect the accepted
  architecture floor.
- A frozen four-arm architecture evaluation against no skill, released `v1.3.2`, and the
  withdrawn layer-first checkpoint. Candidate v3 scored `239/240`, had no negative or fatal cells,
  and led every scenario.

### Changed

- Replaced global layer placement with capability ownership as the first decision. `app/**` keeps
  routes and route-private composition; product policy belongs to a capability.
- Made application operations and ports conditional. An operation must pass the deletion test; a
  port must describe an application capability with a real production consumer.
- Replaced the universal boundary declaration with native RSC, Server Action, HTTP, stream, and
  job boundaries sharing only semantic failure, redaction, and reporting primitives.
- Made browser reads use direct RSC values, `GET` with explicit HTTP cache policy, or streams.
  Server Actions remain mutation boundaries.
- Assigned unexpected-error capture only to outer runtime channels. Trusted `server.ts`
  composition surfaces accept explicit identity, enforce source capability policy, and remain
  silent when nested under another channel.
- Replaced `composeHooks` with direct named Hook calls. Controller/View separation is optional and
  `memo` requires a measured rerender problem.
- Renamed stale reference paths to match the final model:
  `component-structure-composehooks.md` to `component-structure.md`,
  `layers-and-imports.md` to `modules-and-imports.md`, `testing-by-layer.md` to
  `testing-by-capability.md`, `use-case-wrapper.md` to `channel-boundaries.md`, and
  `client-cache-layer.md` to `client-cache.md`, and `slices-and-ownership.md` to
  `capabilities-and-ownership.md`.

### Removed

- The thirteen-layer import table, generated layer tables, `validate-contract-sync.mjs`, and the
  1,300-plus assertion cross-product. They enforced the withdrawn topology and overstated what
  path lint could prove.
- Mandatory use-case wrappers, repository ports per store, generic `api/` barrels, and empty
  architecture scaffolding.


## [1.3.2] - 2026-07-27

### Added

- Added hypothesis scenarios for static Hook calls, imported Server Action modules, and
  browser-owned query transport.
- Added a CWD-independence regression check that inventories both skills from `docs/`.

### Changed

- Replaced the `composeHooks` default with a Controller that calls a named custom Hook directly
  and passes plain props to a View.
- Clarified that Server Actions imported by Client Components require module-level `'use server'`
  and expose async mutations.
- Routed browser-owned TanStack Query reads through GET or stream transport while keeping Server
  Actions mutation-only and RSC reads on direct server calls.

### Fixed

- Derived the validator repository root from the script location instead of `process.cwd()`, so
  validation from a subdirectory cannot silently inspect the wrong tree.

## [1.3.1] - 2026-07-10

### Added

- Added generated `agents/openai.yaml` UI metadata to both skills.
- Added three regression scenarios for transport-neutral errors, Sentry instrumentation, and
  global mutation feedback. They remain explicitly marked as unrun hypotheses until isolated
  RED-to-GREEN evidence is recorded.

### Changed

- Clarified that package-specific defaults are fallbacks, not migration requests. A larger Profile
  Gate candidate was removed after Haiku ablation runs preserved the existing stack in 4/4 cases.
- Clarified that domain code may import pure schema libraries, while use-cases remain independent
  of transport errors. Persistence adapters now map provider failures to transport-neutral
  application errors, and inbound adapters own HTTP or Server Action result mapping.
- Replaced the fail-open Sentry lazy-loader pattern with the supported Next.js instrumentation
  surface and explicit automatic-versus-manual capture ownership.
- Replaced the TanStack Query cache-subscription event pattern with the public global
  `MutationCache.onError` callback and a metadata opt-out.
- Removed contradictory `lib/` destinations from the agent decision map.

### Fixed

- Aligned Codex marketplace policy enums, optional defaults, and `products` with the runtime
  contract, added schema fixtures for those variants, and documented the complete CLI install
  sequence.

## [1.3.0] - 2026-05-27

> Consolidates the unreleased 1.2.0 platform patterns with skill-authoring and validation
> hardening. **Breaking for external links:** a reference file was renamed (see Changed).

### Added

- New references: `observability-and-sentry.md` (lazy SDK loader, PII redaction, user context without email, boundary capture) and `notifications-and-feedback.md` (semantic `notify*` helpers, global mutation error notifier, unified `useConfirm`).
- Architecture patterns: RSC + DAL hybrid read with `initialData`/explicit freshness in `data-ownership-and-cache.md`; input parsing/length caps and defense-in-depth ownership filter in `security-dal-and-auth.md`; scoped bulk-write RPC (`jsonb_to_recordset`, `created_by`/tenant predicate), Postgres → typed `ApiError` mapping, and explicit-column selection in `supabase-persistence-boundaries.md`.
- Component patterns: compound-provider split (`component-structure-composehooks.md`), explicit variants vs mode-discriminator (`state-placement.md`), localized Standard Schema → Mantine validator bridge (`forms-and-actions.md`).
- `Decision Gate`, `Common Failure Modes`, and `Verification Gate` sections in both skills (recommended structure).
- Eval scenarios in `tests/scenarios/` (RED baseline + GREEN expectation + overreach guardrail per new pattern) with a `README.md` documenting the format and manual run loop. Closes the long-empty scaffold; baselines were reproduced — three references (defense-in-depth, explicit-variants, compound-provider) are eval-proven RED→GREEN, and the marginal RSC hybrid pattern was demoted to prose (see Changed).

### Changed

- **Renamed** `data-ownership-cache-tanstack.md` → `data-ownership-and-cache.md`; TanStack is now one row of the ownership table and the RSC hybrid-read section is trimmed. Update any external references to the old filename.
- Expanded skill `description` triggers (now start with `Use when `, ≤500 chars; added observability/error-reporting and notifications/loading-state keywords).
- Sharpened env guidance to a directive (eager validation by default; lazy only for untouched server-only values) with current Supabase key names + legacy fallbacks.
- Split `app/**` vs `ui/**` in the architecture layer table; clarified `updateTag` vs `revalidateTag(tag, 'max')` cache ownership.
- Telemetry abstracted behind infrastructure; Sentry capture awaits/flushes before serverless responses.
- Removed the redundant `Final Checklist` from both `SKILL.md` files; unique items folded into `Verification Gate` (architecture) and `Common Failure Modes` (component, including the `interface`/`class`/`any`/inline-style/barrel ban). Trims the always-loaded body to three differentiated lists (Decision Gate before, failure modes, Verification Gate after).
- Reframed the architecture skill's doc-purity line as degrees of freedom: high-freedom prose for architecture, one canonical low-freedom example for fragile security/privacy/integrity operations. `observability-and-sentry.md` now states its snippets are safe-shape examples, with Sentry API flags deferred to current docs.
- `notifications-and-feedback.md` marked as a stack convention (not portable architecture) and cross-linked to its `ApiError`/`presentError` prerequisite in `supabase-persistence-boundaries.md`.
- Merged the standalone `RSC + Client Hybrid Read` section in `data-ownership-and-cache.md` into one prose line (seed `initialData` not `useState` + explicit freshness). Eval found this the weakest-justified pattern (inconsistent baseline — strong/neutral runs reach the hybrid unprompted); the residual value is small enough to live as prose, not a section.

### Validation / tooling

- Frontmatter schema tightened to `name` + `description` only.
- `validate` enforces the `Use when ` prefix and ≤500-char descriptions; warns (does not fail) on missing gate sections.
- `sync-version` now keeps `package-lock.json` in sync with `version.json`.
- New `scripts/validate-scenarios.mjs` (wired into `validate`) enforces the `tests/scenarios/` contract: required keys, non-empty arrays, known `skills`, and a `tests_reference` whose file and `#anchor` resolve (GitHub slug semantics, no space-run collapse). Stops the eval scaffold from rotting while `validate` stays green.

### Removed

- Internal skill-authoring research (`docs/skill-patterns-research.md`) moved out of the published package.

## [1.1.0] - 2026-05-03

### Added

- Added architecture-first consolidated references: glossary, Clean Architecture boundaries, runtime/compile-time boundaries, security/DAL/auth, data ownership, backend service boundaries, Supabase persistence boundaries, and testing by layer.
- Added UI convention references for Server/Client boundary, component structure with `composeHooks`, forms/actions, state placement, and styling/i18n.

### Changed

- Reduced the reference corpus from 51 files to 14 focused decision files.
- Reframed both skills as architecture/convention contracts instead of Next.js, React, Supabase, Mantine, or TanStack documentation snapshots.
- Updated `nextjs-architecture/SKILL.md` to route by layer, boundary, data owner, service API, persistence, and test strategy.
- Updated `react-component-creator/SKILL.md` to route by UI boundary, file structure, forms/actions, state placement, styling, and i18n conventions.

### Removed

- Removed granular API-doc rules for Cache Components, parallel/intercepting routes, exact action APIs, webhook/idempotency details, Mantine styling, i18n APIs, and React hook basics. Consumers should fetch current official docs for syntax.

## [1.0.1] - 2026-05-01

### Fixed

- Added explicit minimum package versions to the compatibility matrix.
- Expanded the Mantine + Standard Schema validator rule with a complete synchronous field-error adapter.
- Aligned marketplace keywords with the release keyword profile.

## [1.0.0] - 2026-05-01

### Added

- Added `nextjs-architecture` and `react-component-creator` skills.
- Added 54 atomic reference rules for Next.js architecture and React component creation.
- Added validation scripts, CI workflow, and version sync tooling.
- Added Next.js 16 guidance for DAL, Cache Components, validated Server Actions, RSC-first reads, Supabase RLS, and routing patterns.
- Added React guidance for Server/Client boundaries, forms, state placement, styling, i18n, and `composeHooks`.

### Changed

- Renamed plugin to `nextjs-clean-skills`.
- Renamed GitHub repository to `clicktronix/nextjs-clean-skills`.
- Converted long skill bodies into lean routers with linked `references/` files.

### Removed

- Removed legacy `architector` and `component-creator` skill names.

## [0.3.0] - 2026-04-30

### Changed

- Patched legacy `architector` and `component-creator` guidance for Next.js 16.
- Added RSC-first reads, TanStack Query opt-in guidance, Cache Components, DAL, and safe action notes.

## [0.2.0] - 2026-04-30

### Added

- Initial portable skills for Fullstack AI Template architecture and component creation.
