export const meta = {
  name: '10-migration-baseline',
  description:
    'Phase 1 of capability-first adoption: inventory a target repo, assign every source file an owner and role, classify direct dependencies, then INSTALL rules/ and a drafted architecture-contract.json into the target and amend its ESLint config, capture the behavioural baseline and the violation census, and write migration-manifest.json. Moves no product code.',
  whenToUse:
    'Run once against a Next.js repo that is adopting the capability-first architecture, before any file moves. It writes rules/, a contract and an ESLint config change into the target, so run it on a throwaway branch. args: { repo: "/abs/path", contractSource: "/abs/path/to/nextjs-clean-skills", ordinaryChange: "a one-line description of a typical follow-up change" }.',
  phases: [
    { title: 'Inventory', detail: 'six read-only lenses over routes, capabilities, runtime boundaries, data access, deps, roots' },
    { title: 'Assign', detail: 'single owner + role + runtime class for every source file (barrier: assignment needs the whole set)' },
    { title: 'Enable', detail: 'install rules/ and draft architecture-contract.json in the target' },
    { title: 'Baseline', detail: 'behavioural baseline and per-messageId violation census' },
    { title: 'Manifest', detail: 'write migration-manifest.json' },
  ],
}

// Phase 1 of the program in ./README.md. Mirrors docs/adoption-and-enforcement.md
// "Adopt In An Existing Project" steps 1-2 and 4, and nothing else: this workflow
// moves no product code. The expensive global analysis lives here so that every
// later per-capability agent reads its own rows instead of re-deriving ownership
// (the analysis a single-capability agent cannot do correctly on its own).

const REPO = (args && args.repo) || ''
// No home-directory fallback: hardcoding the author's checkout meant that on any
// other machine every agent silently received paths to normative documents that do
// not exist, and proceeded from memory instead of from the contract.
const SRC = (args && args.contractSource) || ''
const ORDINARY = (args && args.ordinaryChange) || ''
const MANIFEST = REPO + '/migration-manifest.json'

if (!REPO) return { error: 'args.repo is required (absolute path to the target repository)' }
if (!SRC) return { error: 'args.contractSource is required (absolute path to a nextjs-clean-skills checkout — the agents read the normative docs and rules/ from it)' }
// Required UP FRONT, not reported as a blocker afterwards. Steps 4 and 9 of the
// adoption procedure are the change-radius measurement, so without it the whole
// paid program runs and only then says it was incomplete.
if (!ORDINARY) {
  return {
    error: 'args.ordinaryChange is required',
    detail: 'Steps 4 and 9 of docs/adoption-and-enforcement.md compare the touch set for one ordinary ' +
      'follow-up change before and after migrating. Without it the only oracle that measures whether the ' +
      'architecture helped cannot run. Pass one sentence describing a typical change, e.g. ' +
      '"add an optional field to a work item and show it in the list".',
  }
}

// Every mutating agent in this program carries these. From
// docs/adoption-and-enforcement.md: adoption is not a library migration, and a
// compatibility bucket is not an allowed destination.
const SCOPE_GUARDS = `
## Scope guards (do not violate, even if it looks like an improvement)
- Do NOT migrate or replace any framework or library. Preserve the existing schema, form, UI,
  cache, notification and provider libraries exactly as they are.
- Do NOT create a compatibility \`lib\`, \`services\`, \`utils\` or \`common\` bucket.
- Do NOT rename product concepts, reformat untouched code, or fix unrelated defects.
- Report what you could not place instead of inventing a placement.
`.trim()

const CONTRACT_DOCS = `
## Normative sources (read before deciding anything)
- ${SRC}/docs/architecture-contract.md — human normative architecture
- ${SRC}/docs/adoption-and-enforcement.md — the adoption procedure and the seven enforced properties
- ${SRC}/plugins/nextjs-clean-skills/skills/designing-nextjs-capabilities/SKILL.md — placement decisions
- ${SRC}/rules/architecture-contract.json — the reserved segment and surface vocabulary
Where a judgement is not settled by these, say so; do not invent a rule.
`.trim()

const LENS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'findings'],
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' }, description: 'one fact per entry, each with a file path or command as evidence' },
    files: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths this lens is authoritative about' },
    notes: { type: 'string' },
  },
}

const ASSIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['capabilities', 'assignments', 'unassigned'],
  properties: {
    capabilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale', 'consumers', 'dependsOn', 'fileCount', 'pilotScore'],
        properties: {
          name: { type: 'string', description: 'kebab-case product capability, named from domain vocabulary and not from a folder name' },
          rationale: { type: 'string' },
          consumers: { type: 'array', items: { type: 'string' }, description: 'app routes and other capabilities that use it today' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'other capability names it uses today' },
          fileCount: { type: 'integer' },
          pilotScore: { type: 'integer', description: '1-10; higher = better pilot (complete, real consumers, few inbound deps)' },
        },
      },
    },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'placement', 'runtime'],
        properties: {
          file: { type: 'string', description: 'repo-relative current path' },
          placement: { enum: ['capability', 'shared', 'app', 'infrastructure', 'unclear'] },
          capability: { type: 'string' },
          segment: { enum: ['domain', 'application', 'server', 'client', 'ui'] },
          surface: { type: 'string', description: 'set only when this file becomes a module-root public surface' },
          sharedRoot: { enum: ['kernel', 'server', 'client', 'ui'] },
          runtime: { enum: ['server-only', 'browser-safe', 'neutral', 'unclear'] },
          evidence: { type: 'string' },
        },
      },
    },
    unassigned: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'why'],
        properties: {
          file: { type: 'string' },
          why: { type: 'string' },
          // Which capability it would MOST LIKELY belong to, if you had to choose.
          // Without this the pilot gate substring-matched the capability name against
          // free prose and a camelCase path, which both under- and over-fired.
          likelyCapability: { type: 'string', description: 'best guess, or omitted when there is genuinely none' },
        },
      },
    },
    deps: {
      type: 'object',
      additionalProperties: false,
      required: ['pure', 'runtime', 'undecided'],
      properties: {
        pure: { type: 'array', items: { type: 'string' } },
        runtime: { type: 'array', items: { type: 'string' } },
        undecided: { type: 'array', items: { type: 'string' }, description: 'packages whose side static analysis cannot infer — the product must decide' },
      },
    },
    // moduleRoot and sharedRoot belong here: phase 2 computes every destination
    // from moduleRoot, and with the schema closed against it the manifest could
    // never carry it, leaving phase 2 to guess `<source>/modules`.
    roots: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceRoot', 'appRoot', 'moduleRoot', 'sharedRoot'],
      properties: {
        sourceRoot: { type: 'string' },
        appRoot: { type: 'string' },
        moduleRoot: { type: 'string', description: 'where capability modules will live, e.g. src/modules — the value phase 2 computes every destination from' },
        sharedRoot: { type: 'string' },
        importAliases: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
  },
}

const BASELINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'ok', 'detail'],
  properties: {
    label: { type: 'string' },
    ok: { type: 'boolean' },
    command: { type: 'string' },
    counts: { type: 'object', additionalProperties: { type: 'integer' }, description: 'for the census: violations keyed by ESLint messageId or tool name' },
    detail: { type: 'string' },
  },
}

// ─── Inventory: six read-only lenses, each blind to the others ───
phase('Inventory')

const LENSES = [
  { key: 'routes', text: 'Map every entry point: files under the app router (pages, layouts, route handlers, middleware), plus any server entry (instrumentation, workers, cron). For each, name what product behaviour it exposes.' },
  { key: 'capabilities', text: 'Name the PRODUCT capabilities this codebase actually implements, from the domain vocabulary used in code and UI copy — not from folder names. A capability is a thing the product does that a user or another system asks for. List the files that implement each one, wherever they currently live.' },
  { key: 'runtime', text: "Map the server/client boundary as it exists today: every 'use client' and 'use server' directive, every server-only import (node builtins, secrets, DB clients, server-only), and every place browser code reaches server code. Name each crossing and whether it is currently safe." },
  { key: 'data', text: 'Map data access and outbound effects: database clients and the identifiers they are bound to, every literal table/rpc/collection name and the file that touches it, plus cache wiring, queues, and third-party providers. Note where the same table is touched from more than one area.' },
  { key: 'deps', text: 'Read package.json. For every DIRECT dependency decide whether it is pure (no runtime, no I/O, safe in domain code) or runtime-bound (framework, I/O, provider, telemetry). Say which ones you cannot decide from the package alone — do not guess.' },
  { key: 'roots', text: 'Read tsconfig.json, next.config.*, and any eslint config. Report the current source root, app root, path aliases (exact prefixes), and any existing boundary tooling already in place.' },
]

const lensRaw = await parallel(LENSES.map(l => () =>
  agent(
    `You are a read-only inventory lens over the repository at ${REPO}.\n\n` +
    `## Your lens — ${l.key}\n${l.text}\n\n` +
    CONTRACT_DOCS + '\n\n' +
    '## Rules\n' +
    'Read and Grep only. Do NOT write, edit, move, or delete anything. Do NOT run builds, installs, or git commands.\n' +
    'Cite a repo-relative path or a command output for every finding. Report absence explicitly rather than assuming.\n\n' +
    'Structured output only.',
    { label: 'lens:' + l.key, phase: 'Inventory', schema: LENS_SCHEMA }
  )
))
// Keyed POSITIONALLY, like the baseline probes below. `lensByKey[o.lens]` trusted a
// free-string the schema never constrained and the prompt never demanded verbatim, so
// a data lens answering "data access and outbound effects" made dataLens undefined —
// and the Enable step then shipped empty databaseResources with floor property 7
// unenforced. `.filter(Boolean)` before this would destroy the index alignment.
const lensOuts = lensRaw
  .map((r, i) => (r ? { ...r, key: LENSES[i].key } : null))
  .filter(Boolean)

log('Inventory: ' + lensOuts.length + '/' + LENSES.length + ' lenses returned')
if (lensOuts.length === 0) return { error: 'every inventory lens failed — nothing to assign' }

const lensByKey = Object.create(null)
for (const o of lensOuts) lensByKey[o.key] = o
const dataLens = lensByKey.data

const LENS_BLOCK = lensOuts
  .map(o =>
    '### ' + o.key + '\n' +
    (o.findings || []).map(f => '- ' + f).join('\n') +
    (o.notes ? '\n' + o.notes : '') +
    // Each lens is asked which files it is authoritative about; the Assign agent is
    // the one consumer that benefits from knowing which lens claims which file.
    // Previously six agents compiled this list and nothing ever read it.
    ((o.files || []).length > 0 ? '\nfiles this lens is authoritative about: ' + o.files.join(', ') : '')
  )
  .join('\n\n')

// ─── Assign: the barrier is load-bearing ───
// One agent decides ownership for the WHOLE file set, because two files can only
// be given one owner each if a single decision sees both. Fanning this out
// produces contested files and duplicate capabilities.
phase('Assign')

const assignment = await agent(
  `Assign a single owner and role to every source file in ${REPO}.\n\n` +
  '## Inventory from six independent lenses\n' + LENS_BLOCK + '\n\n' +
  CONTRACT_DOCS + '\n\n' +
  '## What to produce\n' +
  '1. The capability list. Merge the lenses\' candidates into capabilities named from domain vocabulary. Give each a pilotScore: a good pilot is one COMPLETE capability with real consumers and few things depending on it.\n' +
  '2. For EVERY source file, one assignment: placement (capability | shared | app | infrastructure | unclear), and when placement is `capability`, the target segment (domain | application | server | client | ui) or the public surface it becomes. Route-private UI stays under the app root — that is placement `app`, not a capability file.\n' +
  '3. runtime class per file: server-only, browser-safe, neutral, or unclear. This is the fact a per-capability agent cannot derive on its own, so be exact and cite evidence.\n' +
  '4. Direct dependency classification: pure / runtime / undecided. `undecided` is a real answer; the product decides those, not you.\n' +
  '5. Anything you cannot place, in `unassigned`, with why — and `likelyCapability`, your best guess at which capability it would belong to. The pilot gate reads that field, so omitting it hides the file from the gate.\n' +
  '6. roots: the repo\'s real sourceRoot and appRoot, plus the moduleRoot and sharedRoot the capabilities WILL live under. Phase 2 computes every destination path from moduleRoot, so pick it deliberately and consistently with this repo\'s existing layout (do not default to src/modules if that is not where this repo would put them).\n\n' +
  '## Rules\n' +
  'Verify against the code before assigning — Read or Grep the file, do not infer ownership from its current directory.\n' +
  'A file gets exactly ONE placement. Prefer `unclear` over a guess; an unclear file is a review item, a wrong assignment is a silent architecture defect.\n' +
  'Do NOT propose a segment that would be empty, and do NOT invent a surface no consumer needs.\n' +
  'Read and Grep only — write nothing.\n\n' +
  'Structured output only.',
  { label: 'assign', phase: 'Assign', schema: ASSIGN_SCHEMA }
)

if (!assignment) return { error: 'assignment agent returned no result' }

const caps = (assignment.capabilities || []).slice().sort((a, b) => (b.pilotScore || 0) - (a.pilotScore || 0))
const byCap = Object.create(null)
for (const a of assignment.assignments || []) {
  if (a.placement === 'capability' && a.capability) (byCap[a.capability] ||= []).push(a)
}
log(
  'Assign: ' + caps.length + ' capabilities, ' + (assignment.assignments || []).length + ' files placed, ' +
  (assignment.unassigned || []).length + ' unassigned, ' + ((assignment.deps && assignment.deps.undecided) || []).length + ' undecided deps'
)

// ─── Enable: install the executable floor, then census ───
// Order matters and is not ours to choose: rules/README.md requires every direct
// dependency classified BEFORE the rules are enabled, because a newly installed
// package fails closed.
phase('Enable')

const enabled = await agent(
  `Install the executable architecture floor into ${REPO}. This is the only phase of this workflow allowed to write, and only these files.\n\n` +
  '## Steps\n' +
  `1. Copy the seven non-README files from ${SRC}/rules/ into ${REPO}/rules/.\n` +
  `2. Write ${REPO}/rules/architecture-contract.json: start from ${SRC}/rules/architecture-contract.json, then set sourceRoot/appRoot/moduleRoot/sharedRoot and importAliases to this repo's real values (alias prefixes MUST end with '/'), and fill purePackages / runtimePackages from the classification below. Leave databaseClientIdentifiers and databaseResources as the inventory found them (empty arrays are fine).\n` +
  '3. Spread the two ESLint configs after the existing flat configs, per rules/README.md, in a way that does not disturb the existing config.\n' +
  '   Note for the record: the document scopes this to the pilot ("Enable module-boundary and server/client checks for the pilot"), while this installs them repo-wide so the violation census can be measured. That deviation is recorded in the manifest, not hidden.\n' +
  `4. Run \`node rules/check-dependency-classification.mjs\` from ${REPO}. It must exit 0. If a package is unclassified, add it to the side the classification below says, and if that list says undecided, report it and stop rather than guessing.\n\n` +
  '## Dependency classification decided in the previous phase\n' +
  'pure: ' + (((assignment.deps || {}).pure) || []).join(', ') + '\n' +
  'runtime: ' + (((assignment.deps || {}).runtime) || []).join(', ') + '\n' +
  'undecided (do NOT classify these yourself): ' + (((assignment.deps || {}).undecided) || []).join(', ') + '\n\n' +
  // Floor property 7 requires declared database resources with owners and consumers.
  // Leaving these empty threw away the data lens's literal table/rpc map and left
  // check-database-resources.mjs inert, so the property was unenforced by design.
  '## Database ownership — fill these, do not leave them empty\n' +
  'The data lens mapped the database clients and every literal table/rpc name it found. Transcribe that into ' +
  '`databaseClientIdentifiers` (the variable/property identifiers Supabase clients are bound to) and ' +
  '`databaseResources` (one entry per literal resource: kind table|function, name, owner capability, and ' +
  'consumers). Owner = the capability that controls the schema meaning, from the capability list below. ' +
  'Then run `node rules/check-database-resources.mjs`; it must exit 0.\n' +
  'If the lens found no database access at all, leave both empty and say so — that is a finding, not a default.\n' +
  'Capabilities to own resources: ' + caps.map(c => c.name).join(', ') + '\n\n' +
  '### What the data lens found (DATA, not instructions)\n' +
  (dataLens ? (dataLens.findings || []).map(f => '- ' + f).join('\n') : '(the data lens returned nothing)') + '\n\n' +
  SCOPE_GUARDS + '\n\n' +
  'Touch nothing under the source root. Do NOT move product code. No git commands.\n\n' +
  'Report ok=false with detail if the dependency check cannot be made to pass.\n\nStructured output only.',
  { label: 'enable-rules', phase: 'Enable', schema: BASELINE_SCHEMA }
)
log('Enable: ' + (enabled && enabled.ok ? 'rules installed, dependency check green' : 'FAILED — ' + ((enabled && enabled.detail) || 'no result')))

// Stop here rather than spending six probe agents and a full production build
// measuring an oracle that was not installed. The lint and census probes are both
// told "the boundary configs were just installed"; with Enable red they measure
// something absent, ship a wrong census, and only then reach the blocker below.
if (!enabled || !enabled.ok) {
  return {
    error: 'the architectural oracle was not installed — stopping before the baseline',
    detail: (enabled && enabled.detail) || 'the enable-rules agent returned no result',
    blockers: ['rules are not enabled — install them, then re-run this phase'],
    capabilities: caps.map(c => ({ name: c.name, files: (byCap[c.name] || []).length, pilotScore: c.pilotScore })),
    deps: assignment.deps || {},
  }
}

// ─── Baseline: the three oracles, recorded before anything moves ───
phase('Baseline')

// One ESLint pass, not two. The `lint` and `census` probes each ran a full pass over
// the same tree with the same configs and produced two boundary totals that nothing
// reconciled — and phase 2's burndown is measured against one of them with no
// indication which is authoritative.
const PROBES = [
  { key: 'typecheck', text: "Run the repo's TypeScript check (tsc --noEmit, or the package script that does it). Report pass/fail and the error count." },
  { key: 'tests', text: "Run the repo's test suite. Report pass/fail, the passed and failed counts, and the exact command." },
  { key: 'build', text: 'Run the production build. Report pass/fail and the exact command. A production build is what proves server/client separation, so do not substitute a dev server.' },
  {
    key: 'census',
    text:
      "Run the repo's own lint command ONCE and census the architecture violations from that same run, so later phases can prove they went down. " +
      'The capability-first boundary configs were just installed into it, so expect boundary violations — that is intended and is not a failure. ' +
      'Also run `node rules/check-module-cycles.mjs` and, if the contract declares database resources, `node rules/check-database-resources.mjs`.\n\n' +
      'In `counts`, report one key per ESLint messageId (crossCapabilityInternal, domainDirection, serverClient, invalidSharedRoot, …) with its violation count, ' +
      'one key per non-ESLint tool with its violation count, and `preexisting` for errors from rules this repo already had before the install. ' +
      'Set ok=true when the tools RAN — a high violation count is the expected starting point. Set ok=false only if a tool could not run at all, ' +
      'or if `preexisting` is non-zero: pre-existing lint debt is a red baseline, and step 8 of the adoption procedure names lint alongside type, test and build.',
  },
]
// Scoped to the pilot candidate, which is known by now (the Assign phase ran).
// Step 4 says "Record ITS current files and the touch set" — a before-set for a
// change that never touches the pilot capability makes the after-measurement
// meaningless, because nothing about that change moved.
PROBES.push({
  key: 'change-radius',
  text:
    'Do NOT change any code. For this ordinary follow-up change: "' + ORDINARY + '" — determine the exact touch set ' +
    'it would require TODAY: every file that would have to be edited, and how many distinct areas they span. ' +
    'List the files in `detail`. This is the before-measurement the pilot is judged against.\n\n' +
    'The pilot capability will be "' + (caps.length > 0 ? caps[0].name : '(undecided)') + '", whose files are:\n' +
    (caps.length > 0 ? (byCap[caps[0].name] || []).map(a => '  - ' + a.file).join('\n') : '  (none)') + '\n\n' +
    'First state whether this change touches that capability at all. If it does not, say so plainly and ' +
    'propose a change that does — a radius comparison over work the pilot never touches measures nothing.',
})

// Keyed POSITIONALLY, not by the agent-authored `label`. parallel() guarantees the
// order, so this cannot drift; matching on a label the prompt never specified meant
// a census returned as "ESLint boundary violations" was never found, the manifest
// shipped an empty census, and phase 2 then read every non-zero count as a
// regression and could only ever say `revise`.
// SEQUENTIAL, deliberately — not parallel and not pipeline, both of which would run
// these concurrently. tsc, the production build, the test run and ESLint all write
// into the same working tree (.next/, *.tsbuildinfo, coverage), so running them at
// once makes the baseline a concurrency artifact: a contended build fails, the run
// reports "baseline build is not green", and the operator is sent to fix a
// repository that is fine. The baseline is the thing every later verdict is measured
// against, so it is worth the wall-clock.
const baseline = []
for (const p of PROBES) {
  const r = await agent(
    `Record one baseline fact about the repository at ${REPO}, before any migration.\n\n` +
    '## Your probe — ' + p.key + '\n' + p.text + '\n\n' +
    '## Rules\n' +
    'Do NOT fix anything you find. A failing baseline is a fact to record, not a task. Do NOT edit source files or run git commands.\n' +
    'Report the exact command you ran. If the repo has no such command, say so with ok=false and detail explaining what is missing.\n\n' +
    'Structured output only.',
    { label: 'baseline:' + p.key, phase: 'Baseline', schema: BASELINE_SCHEMA }
  )
  baseline.push(r ? { ...r, key: p.key } : { key: p.key, ok: false, detail: 'probe agent returned no result' })
}

const census = baseline.find(b => b.key === 'census')
const violations = (census && census.counts) || {}
const totalViolations = Object.keys(violations).reduce((n, k) => n + (violations[k] || 0), 0)
log('Baseline: ' + baseline.filter(b => b.ok).length + '/' + baseline.length + ' probes ok, ' + totalViolations + ' violations censused')

// ─── Manifest ───
phase('Manifest')

const manifest = {
  repo: REPO,
  contractSource: SRC,
  roots: assignment.roots || {},
  capabilities: caps,
  // § Product Profile requires a consuming repository to record more than roots and
  // capabilities. The six lenses already gathered most of it; discarding their
  // findings after the Assign prompt threw away the expensive half of this phase and
  // left the profile unrecorded. Kept verbatim, as evidence rather than conclusions.
  profile: {
    lenses: lensOuts.map(o => ({ lens: o.key, findings: o.findings || [], notes: o.notes || null })),
    // Named explicitly so a gap is visible rather than merely absent. What the lenses
    // cannot answer is a product decision, and the document says the profile records it.
    pending: [
      'schema, form, cache and notification libraries',
      'store and remote-provider ownership',
      'auth and tenancy model',
      'route-private and shared UI conventions',
      'accepted migration debt with owner and removal condition',
    ],
  },
  // Deviations from the written procedure, recorded rather than defended silently.
  deviations: [
    {
      step: 'Adopt In An Existing Project, step 7',
      says: 'Enable module-boundary and server/client checks for the pilot',
      does: 'enables them repo-wide, before the pilot moves, so the violation census can be measured',
      why: 'the census is the burndown baseline; a pilot-scoped check cannot produce it',
      needs: 'a decision on docs/adoption-and-enforcement.md — § Sources Of Truth says a disagreement is a defect',
    },
    {
      step: 'Incremental Migration',
      says: 'old and new capabilities may coexist behind an explicit boundary',
      does: 'no workflow migrates files assigned placement="shared"; phase 2 is capability-scoped and its role vocabulary has no shared role',
      why: 'shared admission is a separate gate with its own criteria',
      needs: 'a shared-admission pass before those files move',
    },
  ],
  pilotCandidate: caps.length > 0 ? caps[0].name : null,
  assignments: assignment.assignments || [],
  unassigned: assignment.unassigned || [],
  deps: assignment.deps || {},
  baseline: baseline,
  violationCensus: violations,
  ordinaryChange: ORDINARY || null,
  rulesInstalled: !!(enabled && enabled.ok),
}

// The agent is NOT asked to retype the manifest. Pasting the whole object into a
// prompt for verbatim reproduction does not survive a real repository: on a
// 2000-file target that is hundreds of KB, the agent truncates mid-array, and phase 2
// then migrates part of a capability and passes every oracle. It writes the payload
// it is given in one shot and reads it back to prove it parses; the payload is built
// here, in code.
const written = await agent(
  `Write the JSON below to ${MANIFEST} exactly as given, then read the file back and confirm it parses ` +
  'and that its `assignments` array has ' + (assignment.assignments || []).length + ' entries.\n\n' +
  'Write ONLY that file. Do not reformat, summarise, reorder or omit any part of it. Change nothing else. No git commands.\n' +
  'If the content is too large to emit in one tool call, write it in successive appends and verify the parse at the end — ' +
  'do NOT paraphrase or truncate to fit.\n\n' +
  '```json\n' + JSON.stringify(manifest, null, 2) + '\n```\n\n' +
  'Structured output only: ok, plus detail naming the path, the byte size, and the assignments count you read back.',
  { label: 'write-manifest', phase: 'Manifest', schema: BASELINE_SCHEMA }
)

const blockers = []
if (!(enabled && enabled.ok)) blockers.push('rules are not enabled — the architectural oracle is unavailable')
if (((assignment.deps || {}).undecided || []).length > 0) blockers.push('undecided dependencies need a product decision before the rules can pass')
if (!(assignment.roots || {}).moduleRoot) blockers.push('moduleRoot was not decided — phase 2 computes every destination from it and will refuse to guess')
// Unassigned files block the PILOT only when they belong to the pilot capability.
// The procedure asks to inventory the repo (step 1) and pick one capability (step 3);
// gating the pilot on having placed every file in the target was our own addition.
const pilotName = caps.length > 0 ? caps[0].name : null
const unassigned = assignment.unassigned || []
const unassignedInPilot = pilotName ? unassigned.filter(u => u.likelyCapability === pilotName) : []
if (unassignedInPilot.length > 0) {
  blockers.push(unassignedInPilot.length + ' file(s) in the pilot capability have no owner')
}
const warnings = []
if (unassigned.length > unassignedInPilot.length) {
  warnings.push((unassigned.length - unassignedInPilot.length) + ' file(s) outside the pilot have no owner — fine for now, they block their own capability later')
}
// No exemption. A red census (many violations) is the expected starting point and is
// reported as ok=true by the probe; ok=false means the tools could not RUN. Skipping
// the census by key meant the one probe whose absence poisons phase 2 was the one
// that could fail silently: an empty census makes every later count read as a
// regression, so the pilot can only ever return `revise`.
for (const b of baseline) if (!b.ok) blockers.push('baseline ' + b.key + ' did not complete: ' + b.detail)
if (Object.keys(violations).length === 0) {
  blockers.push('the violation census is empty — phase 2 measures its burndown against it and would read every count as a regression')
}
const radiusProbe = baseline.find(b => b.key === 'change-radius')
if (radiusProbe && !radiusProbe.ok) blockers.push('the change-radius before-set was not established: ' + radiusProbe.detail)

log(
  (blockers.length === 0 ? 'Baseline complete, no blockers — pilot can start' : 'Baseline complete with ' + blockers.length + ' blocker(s)') +
  (warnings.length > 0 ? ' · ' + warnings.length + ' warning(s)' : '')
)

return {
  manifestPath: written && written.ok ? MANIFEST : null,
  capabilities: caps.map(c => ({ name: c.name, files: (byCap[c.name] || []).length, pilotScore: c.pilotScore, consumers: c.consumers })),
  pilotCandidate: manifest.pilotCandidate,
  violationCensus: violations,
  totalViolations,
  baseline: baseline.map(b => ({ key: b.key, ok: b.ok, detail: b.detail })),
  blockers,
  warnings,
  deviations: manifest.deviations,
  profilePending: manifest.profile.pending,
  nextStep: blockers.length === 0
    ? 'Run 20-migration-pilot with args { repo, capability: "' + manifest.pilotCandidate + '", manifestPath }. ' +
      'Read `deviations` and `profilePending` first — both are things this phase could not settle for you.'
    : 'Clear the blockers above first — a pilot measured against a red baseline proves nothing',
}
