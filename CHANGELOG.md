# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [2.0.0] - 2026-07-28

> **Breaking.** Product behavior moves from global layer roots to
> `src/modules/<capability>`. The withdrawn layer-first 2.0 implementation remains reproducible at
> commit `626140b5d68e5b3afcfc80e209df5d881f35d59c`; it was never released.

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

## Layer-First 2.0 Research Checkpoint (Withdrawn)

The following notes document the intermediate layer-first design retained for audit and eval
reproduction. They are not the released 2.0 contract.

### Changed

- **Said how the boundary combinator reports.** It promised one log and one telemetry event per
  failure while its layer may import `domain` only, and neither the shown signature nor the request
  context carried a reporter — so the first file an adopter writes could satisfy the guarantee only
  by importing an SDK into `boundary/**`. The reporter now arrives on `ctx` from the composition
  root: the combinator imports no telemetry, `boundary/**` keeps its domain-only row, and the SDK
  stays in `infrastructure/**`.
- **Placed the Server Action.** The docs called it an inbound adapter and then drew `actions.ts`
  inside the component folder, where `ui/**` can reach neither an entry nor the boundary. The action
  lives in the slice's inbound adapter; a file beside the component is at most a re-export.
- **Gave `boundary/**` its own reason for refusing sibling imports.** It shared a sentence with
  `ports/**`, whose rationale — contracts with nothing to factor out — does not describe a layer
  that owns validation, classification, redaction and reporting. Each row now carries its own
  argument, and the condition for revisiting the boundary row is stated.

### Fixed

- Replaced version-coupled review footers in human architecture docs with content validation.
  Architecture docs now stay concise and normative; release history remains in this changelog.
- Expanded the human architecture into separate placement, runtime, frontend-composition, decision,
  and adoption contracts. The model now names scope alongside slice and layer, documents all 13
  layer responsibilities, and distinguishes normative, enforced, review-only, and known-gap rules.

### Fixed

- **Closed an exemption that was wider than its reason.** `src/infrastructure/env/**` disabled
  `no-restricted-imports` along with the environment selectors, so the one subtree allowed to read
  the environment could import every layer — invisible to the matrix, whose infrastructure specimen
  is `logging`. Only the environment rule is lifted now.
- **Required a `specimen` per layer.** A layer without one generated no case importing *into* it,
  so a new layer could arrive with its whole inbound column untested while the assertion count rose.
  A specimen naming no layer is an error too.
- **Pinned the relative import spellings.** Every generated case spelled its import as an alias, so
  deleting half of each layer's patterns — the ones that catch `../../../data/work-items` — left
  1376 assertions green. Named cases now fail without them.
- **Made an unreadable fence tag a failure.** `expect=clean`, a `tsx` example, or a dropped `path=`
  tag used to remove an example from the matrix with no error and no counter moving; `docs/` was
  never scanned. All three now fail, the parser reads `tsx`, and a floor keeps coverage from
  shrinking in silence.
- **Tested the measurements that were only published.** Four of the nine numbers behind
  `docs/evidence.md` had no assertion: zeroing the UUID and `parse()` counters, dropping statement
  counts, removing the `await` unwrap that finds `await deps.x()` forwards, breaking relative-path
  imports, or deleting either test filter, the `ports.ts`/`types.ts` names, or the `.d.ts`
  exclusion all passed. The fixture now moves a number for each.
- **Stopped inheriting the contributor's git configuration.** The evidence fixture overrode
  identity but not `commit.gpgsign`, so `npm run validate` died on a signing key in a stack trace
  that named neither the script nor the reason.
- **Checked the Decision Gate against the table.** Its `layer:` enum listed twelve values for
  thirteen layers and omitted `app`, leaving an agent no answer for a route file. A layer with no
  gate name now fails, as does a gate value naming no layer.
- **Derived the repository root from the script, not the shell.** A validator run from a
  subdirectory found nothing and reported success.
- **Deleted four restatements of the layer table.** A CRITICAL reference summarised the
  `Same layer` column beside the generated copy of it; a second document said entries import the
  combinator and their operations, omitting the `domain` import its own linted example makes; the
  client-cache reference published a partial allow/deny list; the glossary restated an edge. Each
  could drift while CI stayed green.
- **Named the confound in the boundary-enforcement finding.** The heading claimed enforcement
  changed product shape, while the products also differ store-backed versus service-backed, and the
  use-case column is n=2.
- **Made the comparison in the use-case reference fair.** Its Incorrect example was an operation and
  its Correct example a declaration, so the pair compared two layers rather than two designs.
- **Corrected stale numbers and vocabulary.** The changelog claimed 363 matrix cases and a flowchart
  heading that does not exist; the README omitted `data/`, `ports/` and `boundary/`; two scenarios
  still asked for an outbound adapter over an unported store and mapped errors per inbound boundary
  instead of once at the declaration; the scenario README counted two 1.3.1 scenarios as authored
  for 2.0.0.
- Generated the complete layer table from `rules/import-table.json` into both human and agent
  documentation. `validate-docs.mjs` now checks internal links and anchors, requires vertical
  accessible Mermaid diagrams, and parses every diagram in CI.
- Kept `validate-contract-sync.mjs --fix` atomic. Missing generation markers fail without partially
  updating another document; layer roots, responsibilities, and permissions now come from one table.
- Rejected path traversal, glob paths, and paths outside known layers in linted reference examples.
  A `path=src/...` fence can no longer write outside the rule sandbox or pass without layer rules.
- Made same-layer permissions explicit and matrix-tested. Operations may compose operations;
  declarations, ports, and boundary contracts may not import siblings from their own layer.
- Removed the inbound-to-read compile-time edge. Server-only reads may reuse inbound primitives,
  while browser cache code reaches an inbound action or transport instead of importing the RSC read
  layer.
- Corrected the human runtime diagrams and review questions to distinguish read-path ownership from
  cache ownership, and restored responsibilities in the generated agent layer table.
- Recorded why the `inbound`/`read` edge is one-way, which the removal itself did not state: the
  read layer is composed for the render path and may reuse inbound primitives, while an HTTP caller
  uses its normal inbound surface. Both paths may reuse the same entry, operation, or data module;
  only channel-specific request handling and result translation stay separate.
- Named two decisions as judgement in `docs/evidence.md` that had been presented as consequences.
  Validating the declared output on **every** call is motivated by measured shape drift, but its
  runtime cost has never been measured, and the entry is marked accordingly. The entries/operations
  split prevents a double-report failure mode; the *directory* form was chosen because path rules
  are enforceable and naming conventions are not — a tooling argument, not an architectural one.
- Gave the first migrated slice operational exit criteria in `docs/adoption-and-enforcement.md`:
  one normal follow-up change for topology cost, a workload and product budget for output
  validation, and one-event fault injection for every used inbound channel.
- Turned `measure-evidence.mjs` into a checked single-repository tool. Readers may configure the
  application and UI roots; an empty application inventory fails instead of reporting false zeroes;
  direct, default, and named-list exports are counted by an integration test. The UI population now
  excludes tests like the application population already did, correcting the pinned production
  counts from 5/68 to 2/42.
- Confined internal documentation links to the repository, including their resolved symlink target.
  Malformed URI encoding now reports a validation error instead of terminating the validator.

## Layer-First 2.0 Design Notes (Withdrawn, 2026-07-25)

> **Breaking.** Every `nextjs-architecture` reference moved into a subdirectory grouped by the
> decision it serves, and five references were replaced. Update any external links, and re-run
> `npm run validate` in forks. Rules in this release come from three sources — counts taken
> across two production applications and the template, canonical Ports-and-Adapters guidance, and
> recorded judgement. `docs/evidence.md` says which, per rule, with reproduction commands.

### Added

- `seams/dependency-categories.md` — four ordered questions decide whether a dependency gets a
  port: must the scenario run independently of this technology, does the contract read as a
  purposeful conversation in the application's language, is there a real consumer and a production
  implementation. Adapter count is evidence, not a gate — a third-party provider with one
  implementation still needs a port. Repository-per-table is blocked by the shape question. A
  locally-runnable engine defaults to a `data/` module because the substitute would stand in for
  the team's own queries, and a green suite would sit on a broken filter or a wrong policy — a
  default, not a ban.
- `seams/port-shape.md` — a port describes a capability, not the surface of the thing behind it.
  Method names matching table operations one-for-one are the signal that the grain is wrong.
- `seams/composition-without-di.md` — closures and an explicit request context cover what a
  container would provide, with written thresholds for revisiting that decision.
- `use-cases/when-a-use-case-exists.md` — the deletion test decides whether a scenario exists;
  the impure sandwich is a heuristic for applying it. With nothing to hold, the inbound adapter
  calls the data module directly. A slice exposes `entries/**` (declarations) and `operations/**`
  (typed functions that throw and report nothing).
- `use-cases/use-case-wrapper.md` (*The Boundary Declaration*) — one application boundary owns
  input and output validation, failure normalisation, single-report telemetry, and redaction. A
  thin body is legitimate once the declaration is real. The declaration knows nothing about the
  framework: navigation stays outside it, and composition goes through `operations/**` rather than
  through another declaration.
- `use-cases/validation-once.md` — three trust boundaries, three different checks. One schema run
  twice on the same path is duplication, not defence in depth.
- `outbound/row-vs-domain-types.md` — derive the column list from a row schema, never from the domain
  schema, so storage naming cannot reach view models and form fields.
- `outbound/service-transport.md` — one transport home per owned service, with timeout,
  retry, backoff, credentials, identity-keyed single-flight refresh, cancellation, error mapping,
  and correlation stated in its contract.
- `inbound/streaming.md` — streaming as its own boundary: Route Handler only, resume rather than
  retry, idle timeout, cancellation reaching upstream, post-headers failures delivered in-band.
- `errors/failure-at-the-boundary.md` and `errors/error-taxonomy.md` — layers throw, the
  application boundary converts, entry points translate; one closed set of failure kinds.
- `placement/slices-and-ownership.md` — capability ownership as a required placement answer
  alongside layer, and an explicit statement that this architecture has one reuse level.
- `caching/cache-tiers.md` — a cache is a tier, not a data source: it sits above the entry point it
  calls, so a client cache is not an adapter. One owner per read, invalidation follows ownership,
  and adding a third tier requires naming what a stale entry costs.
- `outbound/authority-and-transactions.md` — where authority lives (store, owned service, or the
  application) decides who owns the transaction. Portable: the rule holds whether the committing
  side is a stored function, a service the team ships, or a third-party API. Call it, never mirror
  it; carry the caller's scope into the write; escape filter input once.
- **`Scope:` marker on every reference.** `portable` means the rule survives a change of
  framework, store, or vendor; `stack (...)` marks one instance of a portable rule for named
  tooling. 17 references are portable and 13 are stack-bound; five of the seven CRITICAL rules
  are portable, the two stack-bound ones being the Supabase and auth references.
- `docs/evidence.md` — for each rule, whether it is a primary source, a measurement, or judgement,
  with a reproduction command or a script invocation for every count.
- Five eval scenarios for the load-bearing new rules, marked as hypotheses until RED runs are
  recorded, with a stated run order.

### Changed

- **Reference paths.** Flat `references/*.md` became `references/<group>/*.md`, where each group is
  either a layer of the architecture (`inbound`, `outbound`, `use-cases`) or the concern it
  serves (`caching`) or an
  explicitly cross-cutting concern (`placement`, `seams`, `errors`, `security`, `quality`).
  `glossary.md` stays at the root. An earlier draft grouped by `data` and `backend`; both mixed
  opposite sides of the hexagon — `backend` held an inbound shape next to an outbound transport,
  and `data` held the store next to the client cache — so the names were corrected to the layers
  they actually describe.
- **`ui/server-state/` became a top-level `client-cache/` layer.** Two defects, one fix. The name
  described the contents ("state that came from the server") rather than the role, which is why a
  server-executed `prefetch.ts` living there read as a contradiction — under the tier name it is
  plainly the server-side preparation of a client cache. The placement was wrong for a measurable
  reason: in both products the folder had to be carved out of its parent's lint rules, and one of
  them then re-applied a subset to an allowlist of eleven files. A sublayer that must be excluded
  from every rule of its parent, then partially re-subjected, is not a sublayer. As its own layer
  the allowlist becomes the definition — a client cache legitimately owns browser transports for
  auth, realtime, and streams — and the exclusions disappear.
- **Replaced the canonical "Correct" example.** The previous `clean-architecture-boundaries.md`
  showed a bare forwarding function as the model to copy. It is now two files — an operation with a
  pure decision in it, and the declaration that wraps it — and both are linted against the layer
  table in CI. A thin *declaration* is legitimate, because the combinator supplies validation,
  failure normalisation and single-report telemetry. A thin *operation* is not: nothing stands
  behind it, so it is the empty layer this release exists to remove.
- **Error model.** Use-cases previously threw and each inbound adapter classified independently.
  The rule is now one classification, produced once at the application boundary and translated per
  channel; the returned-value carrier is a recommendation argued from the serialization constraint,
  not part of the rule. A project already classifying consistently by throwing satisfies it.
- `supabase-persistence-boundaries.md` split by scope. The portable half — authority placement and
  the transaction rules that follow from it — became `outbound/authority-and-transactions.md`. The
  vendor half stayed as `outbound/supabase-rls.md`, now explicitly one instance of that rule, so a
  project whose authority sits in its own backend service reads the portable document and skips
  the Supabase one.
- `backend-service-patterns.md` → `inbound/route-handlers.md`, with the external-service half
  extracted into its own reference.
- `testing-by-layer.md` → `quality/testing-by-layer.md`: assert outcomes, not call mechanics;
  test data adapters against the local engine rather than a substitute; do not test the schema
  library; delete tests a deepened module absorbed.
- `observability-and-sentry.md` → `quality/`: one capture owner, expected failures kept out of the
  exception channel, field paths rather than field values in reported payloads.
- `glossary.md` — added seam, dependency category, wrapper, row type, slice, result; added the
  two confusions worth naming (direction is not depth; a seam is not a folder).
- `SKILL.md` — Decision Gate gains `slice`, `dependency category`, `adapters today`,
  `behavior owned`, `authority`, and a `shared-server-cache` cache owner; Verification Gate gains the
  deletion test and the no-module-without-a-call-site check.
- `docs/architecture-contract.md` and `docs/agent-decision-maps.md` rewritten for the two-axis
  model, the conditional port and use-case steps, and the streaming boundary.

- `rules/` — an executable ESLint boundaries config plus a note on what it deliberately does not
  check. Depth failures are review questions, not lint rules, and the file says so.
- `docs/evidence.md` now separates measured claims from canonical ones and from judgement, credits
  Cockburn and Bespoyasov by name, and carries a reproduction command for every count.

### Fixed

- **Corrected two attributions to canonical sources**, both found by an external review and
  confirmed against the originals. Cockburn presents an in-memory mock as a legitimate adapter —
  "most importantly, an adapter to a 'mock' database" — so the warning this release cited against
  mock-backed ports is not his; and he calls the port count "a matter of intuition" with "no
  particular damage in choosing the 'wrong' number", so "expect two to four" was never canonical.
  Bespoyasov presents the impure sandwich as a way to structure code and gives no criterion for
  when a use-case should exist. `seams/dependency-categories.md`, `docs/evidence.md` and
  `docs/architecture-contract.md` now separate his definitions from our criteria, and say plainly
  that the measurements establish the old guidance failed — not that the replacement is right.
- **Demoted the impure sandwich from gate to heuristic.** The gate is the deletion test. A missing
  pure middle is a signal to look closer, and "a shared contract" no longer licenses an empty
  forward: what two callers share is the declaration, not a hop.
- **Removed the public `.run` accessor.** A declaration that exposed its unwrapped body was an
  escape hatch around its own guarantees — the outer output schema rejected the inner result
  object, so callers normalised twice or not at all. Composition now goes through a slice's
  published `operations/**` surface, which the declaration wraps and other slices compose with, and
  `use-cases/use-case-wrapper.md` is retitled *The Boundary Declaration* to keep the two apart.
- **Framework control flow stays outside the boundary.** Navigation and not-found signals are
  implemented by throwing, so a universal catch turned a redirect into an application failure and
  the navigation never happened. The declaration returns a value and the entry point navigates; it
  cannot classify framework exceptions anyway, since its layer may import domain only. The
  framework's own re-throw helper is recorded as a migration aid, marked not recommended for
  production by its documentation.
- **Moved HTTP statuses out of the failure taxonomy.** The kinds table no longer carries a status
  column; mapping a kind onto a status, an action state, a stream event, or a rendered surface
  belongs to the translation layer, so the taxonomy is not shaped by one transport.
- **A Server Component must not call its own Route Handler over HTTP** — stated explicitly, with
  the cost (an extra hop, the dropped in-process request context, repeated auth work).
- **Marked slice isolation as unenforced.** `placement/slices-and-ownership.md` presented it as an
  architectural rule while the shipped lint only guards layers. It now says it is convention, and
  `rules/README.md` carries the one-zone-per-slice recipe for projects that want it enforced.
- **Corrected the headline measurement twice, and then stopped measuring with grep.** An early
  draft claimed 81% of one product's application functions were forwards, from a line-grep that
  counted any body containing a `return deps.…` line. A hand-corrected pass gave 62 of 201. Both
  were replaced by `scripts/measure-evidence.mjs`, which parses TypeScript with the compiler API at
  a pinned commit, so the population no longer depends on formatting: **201** exported callables in
  Marqa, **75** whose whole body forwards to `deps.*`, **153** holding at most two statements; **5**
  of 11 in the template. The hand-written cross-cutting count stands at 110 (66 UUID assertions plus
  44 `parse()` calls) once `safeParse`/`JSON.parse` are excluded. Numbers in `docs/evidence.md` are
  the script's output, reproducible from three immutable SHAs.
- Repointed a prose cross-reference in `notifications-and-feedback.md` that named a reference deleted
  in this release; validators only check `SKILL.md` links, so prose pointers rot silently.
- Resolved a contradiction between `security/dal-and-auth.md` and `use-cases/validation-once.md`,
  which gave opposite instructions on which boundary runs the application schema.
- Removed the same rule restated in different words across `authority-and-transactions`,
  `port-shape`, and `observability-and-sentry`; the lexical duplication linter cannot see paraphrase.
- `shared-store` renamed to `shared-server-cache` in the Decision Gate — it names a server-side
  tier and read as a client store. Added `Authority` to the glossary, which the gate used undefined.
- Restored `version.json` formatting; the release bump had minified it.
- **Separated `data/**` from `adapters/outbound/**`.** The three canonical use-case examples called
  a data module as a free identifier while `layers-and-imports.md`, `SKILL.md`, and the shipped
  ESLint config all forbade use-cases from importing `adapters/outbound/**` — the config would have
  rejected the release's own examples. The resolution is a naming correction of the same kind as
  `client-cache`: an adapter satisfies a port, so a module with no port is not one. `data/**` holds
  no-port data access and use-cases may import it; `adapters/outbound/**` holds port
  implementations and arrives from the composition root.
- **Qualified the forwarding rule.** "A function that only forwards is an empty layer" appeared
  unqualified in the glossary and in the reviewer flowchart, where it would have blocked the
  release's own canonical example. It is an *unwrapped* forward that holds nothing.
- Said which boundary carries the wrapper's guarantees when a slice has no use-case at all —
  previously the guarantees simply vanished with the layer.
- Renamed `errors/result-at-the-boundary.md` to `failure-at-the-boundary.md`: the file's own text
  demotes the carrier to a recommendation, so naming it after the carrier repeated the mistake the
  release fixed elsewhere.
- Removed 23 lines of 2.0.0 content that a global string replace had also inserted into the
  `[1.3.0]` section, where it claimed features that did not exist for another two months.
- **Propagated the `data/**` layer everywhere it was missing.** The split shipped in some
  references and in the lint config but not in SKILL.md's compile-time list or Decision Gate
  `layer:` enum, not in the layer table's `inbound`/read-entrypoint rows, not in the glossary, and
  in none of the diagrams in `docs/`. An agent following the always-loaded file or the
  prompt-ready decision maps produced code the shipped lint rejects. All six now agree, and the
  `data/` destination is named in the placement table that follows the "Place New Code" map.
- **Restored the `auth boundary` Decision Gate field.** `authority:` replaced it in error: one
  says who commits the transaction, the other where the session is re-verified. Every gate field
  was answerable without deciding on authorization, which is the failure the one eval-proven
  reference in the set exists to prevent.
- **Fixed the `process.env` lint selector, which matched nothing it named.** Its
  `:not(MemberExpression > MemberExpression)` clause excluded exactly `process.env.X` and
  `process.env['X']` — in those forms the matching node is the inner member expression. Verified
  with esquery: 2 of 5 forms matched before, 5 of 5 after.
- **Closed the relative-import bypass.** Every boundary group named only `@/x/**`, so the same
  forbidden edge written `../../x` passed all nine blocks. Each layer is now named twice, alias
  and bare suffix; verified with ESLint 9 that aliased, relative, and `../../../src/` spellings
  all report.
- Forbade `use-cases` and `data` imports from `client-cache`: the config allowed the browser tier
  to import a use-case, which drags the server-only module graph — service-role key included —
  into the public bundle.
- Corrected the `validation-once` example, which destructured a property the stack's action
  helper does not provide and dropped the input schema entirely, so no input reached the handler.
  Restated stack-neutrally, as its `portable` scope requires.
- Gave nested composition a real mechanism: 1.3.1 told agents to call an "unwrapped form" that
  did not exist, and its example passed wrapped ones. Composition now goes through a slice's
  `operations/**` surface, so the failure is reported once at the outermost declaration.
- Marked the re-raised render-channel failure as already reported, so the framework's
  request-error hook does not record a second event for a fault the wrapper already logged.
- Widened the reference link check to links carrying a `#anchor` — the pointer class most likely
  to rot, and already the house style in scenario fixtures, was silently skipped.
- Corrected an evidence command that counted matching lines while the prose counted files, and
  three paths left stale by this release's own `client-cache` → `caching` rename.
- **`ports/**` and `boundary/**` are layers of their own.** A contract nested inside `use-cases/`
  cannot be reached by the adapter that implements it without also opening the implementation —
  carving a subpath out of a forbidden subtree is not expressible in these patterns. Same for the
  declaration combinator, which use-cases need but which is not generic infrastructure.
- **The enforcement matrix is generated, not written.** `rules/import-table.json` is the
  machine-readable contract; `validate-rules.mjs` produces a source × target cross-product from it
  and lints every case — static, `import()` and `require()`; the run prints the count it actually
  executed, so no number here can go stale. Three earlier versions of this
  check were weaker and each certified real gaps: shape-only, then hand-picked fixtures, then a
  matrix missing `ports` as a source and using specimens too generic to distinguish
  `use-cases -> boundary` from `use-cases -> all of infrastructure`.
- **One list drives both spellings.** Each block declares the layers it may not reach once; the
  static patterns and the dynamic selectors are derived from it, so a static ban can no longer
  ship without its `import()`/`require()` twin. That class had recurred in three consecutive
  review rounds.
- **Made the layer boundaries actually enforceable, and proved it.** `rules/fixtures.json` now
  holds a 39-case matrix and `validate-rules.mjs` runs ESLint over it for real — every allowed
  edge must lint clean, every forbidden edge must error. Standing it up immediately reproduced
  eleven live gaps the previous shape-only check reported as `rules ok`: layer-root imports
  (`@/adapters/outbound` with no trailing segment), database drivers and `node:` builtins in
  use-cases, data modules importing adapters or the framework, an outbound adapter importing its
  own use-case, the client cache reaching server-only env, UI and routes importing use-cases, and
  `process['env']` / `globalThis.process.env`. All closed; dynamic `import()` and `require()`
  spellings are covered by selector for the layers where a bypass costs most.
- **Corrected the owned-service credential rule.** It mandated the service's own identity and
  "never a user token", while the implementation cited as its evidence forwards the caller's
  verified credential and keys refreshes per user. Replaced with two explicit modes — service
  identity for app-to-app work, delegated identity when the service authorizes the user — and a
  ban that still holds: never forward an unverified client-supplied credential.
- **Separated the wrapper from use-case existence.** A slice with no scenario still needs
  validation, failure normalisation and single-report telemetry; the wrapper now wraps the data
  call directly at the inbound boundary. Previously the guarantees silently vanished with the
  layer.
- Gave three homeless contracts a home: read entrypoints are `adapters/inbound/read/**`,
  `DataContext` belongs to `data/**`, and the failure taxonomy is a domain type — so every layer
  that must raise it can, without breaking the import table.
- Wrapped the request-error hook instead of exporting the SDK helper directly: exported raw, it
  could not see the already-reported marker the render channel sets, and recaptured every
  re-raised failure.
- Split `validation` into input failure (400) and output-contract violation (500, reported), kept
  recognisable upstream meanings instead of flattening them to 502, and added `rate_limited`.
- Scanned code examples for stack vocabulary in `portable` references — fences were being
  stripped before the check, so the snippet an agent copies was the one place the rule could
  leak framework terms.
- Anchored Markdown links now validate the heading slug, not just the file.
- Removed the "measured in prod" label from four scenario rows and the universal
  "derived from counts" claim from the changelog, the architecture contract, and the scenarios
  README — `docs/evidence.md` separates measured from canonical from judgement, and those
  summaries contradicted it.
- Added reproduction commands for four counts that had none, and corrected two that did not
  demonstrate their claim: the dead-module check matched prose as well as imports, and the
  allowlist count double-counted paths appearing in two blocks.
- Genericised three `portable` references that stated their rules in framework vocabulary, and
  widened the Scope lint to catch framework *concepts* ("Route Handler only"), not just vendor
  names — the earlier pattern was case-sensitive and saw neither.
- Renamed the `client-cache` reference group to `caching`. It holds one layer document and one
  cross-cutting policy covering the server render, the URL, and a shared server cache; naming the
  group after one member's layer misdescribed the other. The layer itself is still `client-cache`.
- Converted eight title-only prose cross-references into Markdown links, so the new
  reference-link check actually covers them. Half a fix otherwise: the validator was added in this
  release while the pointers it was meant to catch stayed unlinked.

### Validation / tooling

- `validate-skill-frontmatter.mjs` now walks `references/` recursively, so a reference in a
  subdirectory that no `SKILL.md` links is a CI failure rather than dead weight that still ships.
- `lint-references-no-frontmatter.mjs` requires the `Scope:` marker and fails a reference tagged
  `portable` that names a vendor or a framework concept, case-insensitively. It caught five real
  cases across two passes, including the release's most important reference.
- `validate-skill-frontmatter.mjs` now resolves Markdown links *inside* references, not only in
  `SKILL.md`. A pointer naming a file deleted in the same release used to ship silently.
- New `validate-rules.mjs` imports every module under `rules/` and asserts its flat-config shape,
  so the executable artefact is itself executed by CI.
- New `measure-evidence.mjs` — the structural counts come from the TypeScript compiler API over
  `git ls-tree`/`git show` at a pinned SHA, so they are reproducible and never touch the measured
  repositories' working trees. It replaced a set of shell pipelines whose population shifted with
  formatting.
- **Removed `lint-docs-review-markers.mjs`.** It asserted that a document carried a footer naming
  the current version, which a release can satisfy without anyone rereading the document. What
  currency the human-facing docs have now comes from `validate-contract-sync.mjs` and the linted
  reference examples; the rest is review.
- New `validate-contract-sync.mjs` — the documents an agent reads and the table CI enforces must
  say the same thing. Nothing checked that before: the matrix proves the config matches the table
  and is blind to the prose, which is how a CRITICAL reference came to grant a use-case the union of
  both surfaces' permissions. The layer table and the always-loaded contract block are now
  **generated** from `root` and `mayImport`, with `--fix` to rewrite them, so a documented label can
  no longer drift from the root actually enforced. A first version compared two hand-written labels
  and was refuted by mutation: renaming a layer in both places passed, and so did documenting "same
  as inbound" while the permissions diverged.
- **Reference examples are linted as files.** A fence tagged `path=src/…` is written into the matrix
  sandbox and linted in all three tiers (`expect=error` marks a counter-example). The example in
  `layers-and-imports.md` had shown an operation and its declaration in one file, which no layer
  permits — an entry may not import data, an operation may not import the combinator — and its body
  was the empty forward this release exists to remove. It is now two linted files with a pure
  decision in the operation.
- `validate-scenarios.mjs` checks the coverage inventory against the files on disk: a scenario
  listed twice, listed but absent, or present but unclaimed all fail. It had carried
  `route-handlers` as both a hypothesis and untested.
- New `rules/eslint-boundaries-resolved.mjs` — a second enforcement tier that compares **resolved**
  file paths through `import/no-restricted-paths`, with its zones derived from `import-table.json`
  so there is no second copy of the contract. It covers every spelling of a target at once, and
  expresses the one thing string matching cannot: a layer closed except at a named entry
  (`app/**` may reach the client cache only at its seeding entry). Measured: gitignore-style
  negation inside a `no-restricted-imports` group does not exempt the negated path, in three
  spellings.
- The resolved tier ships `import/no-unresolved` as a **canary**, not as a style rule. Measured:
  with the node resolver alone, a forbidden aliased import lints clean while only its relative
  spelling errors — a resolver that is installed but unconfigured produces a boundary that passes
  everything. `validate-rules.mjs` re-runs the same fixture with the resolver stripped and requires
  an error. It also ships `import/no-dynamic-require`, which closes the computed-specifier class
  that neither tier can resolve.
- `validate-rules.mjs` runs the generated matrix against **three tiers** — strings alone, resolved
  alone, and the two composed — and asserts the tier relationship rather than assuming it: cases
  marked `resolvedOnly` in the table must lint clean under tier one and error under tier two, so
  "weaker" cannot drift into "disagreeing". The validator prints the counts it ran.
- `import-table.json` gains `root` per layer (the layer root lint scopes to, distinct from the
  representative slice fixtures are written into), `mayImportAt` for subpath permissions, and
  `resolvedOnly` on the cases tier one provably misses. Layer nesting — `read` inside `inbound` — is
  derived from the roots, and the validator asserts the parent block excludes the child, since flat
  config would otherwise let one block replace the other silently.
- Fixed in the same pass, both found by adding the second tier: the app row of
  `placement/layers-and-imports.md` granted no access to the client cache while the config and the
  fixtures permitted its seeding entry, and `use-cases/use-case-wrapper.md` still placed the
  combinator in `infrastructure/boundary` after it became its own layer beside `ports/`.

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
