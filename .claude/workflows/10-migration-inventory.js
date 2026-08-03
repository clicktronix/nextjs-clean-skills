export const meta = {
  name: '10-migration-inventory',
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
        required: ['name', 'rationale', 'consumers', 'dependsOn', 'fileCount'],
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
    unassigned: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['file', 'why'], properties: { file: { type: 'string' }, why: { type: 'string' } } } },
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

const lensOuts = (await parallel(LENSES.map(l => () =>
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
))).filter(Boolean)

log('Inventory: ' + lensOuts.length + '/' + LENSES.length + ' lenses returned')
if (lensOuts.length === 0) return { error: 'every inventory lens failed — nothing to assign' }

const LENS_BLOCK = lensOuts
  .map(o => '### ' + o.lens + '\n' + (o.findings || []).map(f => '- ' + f).join('\n') + (o.notes ? '\n' + o.notes : ''))
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
  '5. Anything you cannot place, in `unassigned`, with why.\n' +
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
  `4. Run \`node rules/check-dependency-classification.mjs\` from ${REPO}. It must exit 0. If a package is unclassified, add it to the side the classification below says, and if that list says undecided, report it and stop rather than guessing.\n\n` +
  '## Dependency classification decided in the previous phase\n' +
  'pure: ' + (((assignment.deps || {}).pure) || []).join(', ') + '\n' +
  'runtime: ' + (((assignment.deps || {}).runtime) || []).join(', ') + '\n' +
  'undecided (do NOT classify these yourself): ' + (((assignment.deps || {}).undecided) || []).join(', ') + '\n\n' +
  SCOPE_GUARDS + '\n\n' +
  'Touch nothing under the source root. Do NOT move product code. No git commands.\n\n' +
  'Report ok=false with detail if the dependency check cannot be made to pass.\n\nStructured output only.',
  { label: 'enable-rules', phase: 'Enable', schema: BASELINE_SCHEMA }
)
log('Enable: ' + (enabled && enabled.ok ? 'rules installed, dependency check green' : 'FAILED — ' + ((enabled && enabled.detail) || 'no result')))

// ─── Baseline: the three oracles, recorded before anything moves ───
phase('Baseline')

const PROBES = [
  { key: 'typecheck', text: 'Run the repo\'s TypeScript check (tsc --noEmit, or the package script that does it). Report pass/fail and the error count.' },
  // Step 8 of the adoption procedure names lint alongside type, test and build.
  // This probe runs AFTER the Enable phase amended the config, so the boundary rules
  // are already active here and the lint will be red by design. Separate the two
  // populations: pre-existing lint debt is the baseline, boundary violations are the
  // burndown, and confusing them would make every later comparison meaningless.
  {
    key: 'lint',
    text:
      "Run the repo's own lint command. The capability-first boundary configs were just installed into it, so expect boundary violations — that is intended. " +
      'In `counts`, report `preexisting` (errors from the rules this repo already had) and `boundary` (errors from the clean-architecture boundary rules) separately. ' +
      'Set ok=true when `preexisting` is 0, regardless of `boundary`.',
  },
  { key: 'tests', text: 'Run the repo\'s test suite. Report pass/fail, the passed and failed counts, and the exact command.' },
  { key: 'build', text: 'Run the production build. Report pass/fail and the exact command. A production build is what proves server/client separation, so do not substitute a dev server.' },
  {
    key: 'census',
    text:
      'Census the CURRENT architecture violations, so later phases can prove they went down. Run ESLint with the newly installed boundary configs over the source root, plus `node rules/check-module-cycles.mjs` and, if the contract declares database resources, `node rules/check-database-resources.mjs`. ' +
      'Return `counts` keyed by ESLint messageId (for example crossCapabilityInternal, domainDirection, serverClient, invalidSharedRoot) with the number of violations each, plus one key per non-ESLint tool with its violation count. A high count now is expected and is not a failure — report it faithfully.',
  },
]
if (ORDINARY) {
  PROBES.push({
    key: 'change-radius',
    text:
      'Do NOT change any code. For this ordinary follow-up change: "' + ORDINARY + '" — determine the exact touch set it would require TODAY: every file that would have to be edited, and how many distinct areas they span. ' +
      'List the files in `detail`. This is the before-measurement the pilot is judged against.',
  })
}

// Keyed POSITIONALLY, not by the agent-authored `label`. parallel() guarantees the
// order, so this cannot drift; matching on a label the prompt never specified meant
// a census returned as "ESLint boundary violations" was never found, the manifest
// shipped an empty census, and phase 2 then read every non-zero count as a
// regression and could only ever say `revise`.
const baselineRaw = await parallel(PROBES.map(p => () =>
  agent(
    `Record one baseline fact about the repository at ${REPO}, before any migration.\n\n` +
    '## Your probe — ' + p.key + '\n' + p.text + '\n\n' +
    '## Rules\n' +
    'Do NOT fix anything you find. A failing baseline is a fact to record, not a task. Do NOT edit source files or run git commands.\n' +
    'Report the exact command you ran. If the repo has no such command, say so with ok=false and detail explaining what is missing.\n\n' +
    'Structured output only.',
    { label: 'baseline:' + p.key, phase: 'Baseline', schema: BASELINE_SCHEMA }
  )
))
const baseline = baselineRaw.map((r, i) => (r ? { ...r, key: PROBES[i].key } : { key: PROBES[i].key, ok: false, detail: 'probe agent returned no result' }))

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
  pilotCandidate: caps.length > 0 ? caps[0].name : null,
  assignments: assignment.assignments || [],
  unassigned: assignment.unassigned || [],
  deps: assignment.deps || {},
  baseline: baseline,
  violationCensus: violations,
  ordinaryChange: ORDINARY || null,
  rulesInstalled: !!(enabled && enabled.ok),
}

const written = await agent(
  `Write this migration manifest to ${MANIFEST} as formatted JSON, then read it back and confirm it parses.\n\n` +
  'Write ONLY that file. Change nothing else. No git commands.\n\n' +
  '```json\n' + JSON.stringify(manifest, null, 2) + '\n```\n\n' +
  'Structured output only: ok, plus detail naming the path and the byte size.',
  { label: 'write-manifest', phase: 'Manifest', schema: BASELINE_SCHEMA }
)

const blockers = []
if (!(enabled && enabled.ok)) blockers.push('rules are not enabled — the architectural oracle is unavailable')
if (((assignment.deps || {}).undecided || []).length > 0) blockers.push('undecided dependencies need a product decision before the rules can pass')
if ((assignment.unassigned || []).length > 0) blockers.push((assignment.unassigned || []).length + ' files have no owner')
if (!(assignment.roots || {}).moduleRoot) blockers.push('moduleRoot was not decided — phase 2 computes every destination from it and will refuse to guess')
// Steps 4 and 9 of the adoption procedure are the change-radius measurement. Without
// an ordinary change there is no before-set, so the only oracle that measures whether
// the architecture actually helped cannot run — that is a blocker, not a nicety.
if (!ORDINARY) blockers.push('args.ordinaryChange was not supplied — steps 4 and 9 of the adoption procedure (change-radius before/after) cannot run')
// The census is expected to be red; every other probe is a real baseline.
for (const b of baseline) if (!b.ok && b.key !== 'census') blockers.push('baseline ' + b.key + ' is not green: ' + b.detail)

log(blockers.length === 0 ? 'Inventory complete, no blockers — pilot can start' : 'Inventory complete with ' + blockers.length + ' blocker(s)')

return {
  manifestPath: written && written.ok ? MANIFEST : null,
  capabilities: caps.map(c => ({ name: c.name, files: (byCap[c.name] || []).length, pilotScore: c.pilotScore, consumers: c.consumers })),
  pilotCandidate: manifest.pilotCandidate,
  violationCensus: violations,
  totalViolations,
  baseline: baseline.map(b => ({ key: b.key, ok: b.ok, detail: b.detail })),
  blockers,
  nextStep: blockers.length === 0
    ? 'Resolve nothing; run 20-migration-pilot with args { repo, capability: "' + manifest.pilotCandidate + '", manifestPath }'
    : 'Clear the blockers above first — a pilot measured against a red baseline proves nothing',
}
