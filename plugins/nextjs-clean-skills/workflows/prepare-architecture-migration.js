export const meta = {
  name: 'prepare-architecture-migration',
  description:
    'Phase 1 of capability-first adoption: inventory a target repo, assign every source file an owner and role, classify direct dependencies, then INSTALL rules/ and a drafted architecture-contract.json into the target and amend its ESLint config, capture the behavioural baseline and the violation census, and write migration-manifest.json. Moves no product code.',
  whenToUse:
    'Run once against a Next.js repo that is adopting the capability-first architecture, before any file moves. It writes rules/, a contract and an ESLint config change into the target, so run it on a throwaway branch. args: { repo: "/abs/path", ordinaryChange: "a one-line description of a typical follow-up change", profileDecisions: { libraries, storesAndProviders, authAndTenancy, uiConventions, migrationDebt }, contractSource?: "/abs/path/to/the/plugin/root", dependencyDecisions?: { "pkg": "pure|runtime" }, fileOwners?: { "src/x.ts": "capability" } }. contractSource is resolved from the installed plugin when omitted; the decision maps answer facts inventory cannot settle.',
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

// Normalise the two invocation shapes once; the rest of the workflow expects an object.
let ARGS = args || {}
if (typeof args === 'string') {
  try {
    ARGS = JSON.parse(args)
  } catch (error) {
    return { error: 'args arrived as a string that is not valid JSON: ' + error.message }
  }
}
if (!ARGS || typeof ARGS !== 'object') return { error: 'args must be an object, got ' + typeof ARGS }

const REPO = ARGS.repo || ''
// Resolve the plugin root; never guess a maintainer checkout path.
let SRC = ARGS.contractSource || ''
const ORDINARY = ARGS.ordinaryChange || ''
const MANIFEST = REPO + '/migration-manifest.json'

if (!REPO) return { error: 'args.repo is required (absolute path to the target repository)' }
// Required before paid work because both radius measurements depend on it.
if (!ORDINARY) {
  return {
    error: 'args.ordinaryChange is required',
    detail: 'Steps 4 and 9 of docs/adoption-and-enforcement.md compare the touch set for one ordinary ' +
      'follow-up change before and after migrating. Without it the only oracle that measures whether the ' +
      'architecture helped cannot run. Pass one sentence describing a typical change, e.g. ' +
      '"add an optional field to a work item and show it in the list".',
  }
}

// ─── Contract source: resolved once, never guessed ───
// The script body has no filesystem, so locating the installed plugin costs one
// probe agent. It runs once here rather than in each of the fifteen agents that
// need the path: fifteen independent resolutions can disagree, and a subset
// reading a stale cached version is the kind of split-brain nobody notices until
// the census is wrong. Cheap first — this runs only after the argument guards.
const SOURCE_MARKERS = [
  'docs/architecture-contract.md',
  'docs/adoption-and-enforcement.md',
  'rules/architecture-contract.json',
  'skills/designing-architecture/SKILL.md',
]

if (!SRC) {
  const resolved = await agent(
    'Locate the installed `nextjs-clean-skills` plugin root and print its absolute path. Change nothing.\n\n' +
      'Try these in order and stop at the first candidate that verifies:\n' +
      '1. `$CLAUDE_PLUGIN_ROOT`, if it is set and its basename is `nextjs-clean-skills`.\n' +
      '2. The highest-versioned directory under `~/.claude/plugins/cache/nextjs-clean-skills/nextjs-clean-skills/`.\n' +
      '3. `<repo>/plugins/nextjs-clean-skills` if the current directory is inside a checkout of the ' +
      '`nextjs-clean-skills` repository itself (maintainer case).\n\n' +
      'A candidate verifies only when ALL of these exist under it:\n' +
      SOURCE_MARKERS.map((marker) => `- ${marker}`).join('\n') +
      '\n\nReturn ok=false with what you tried in `detail` when nothing verifies. Do not return a ' +
      'path you did not check, and do not create the missing files.',
    { label: 'resolve:contract-source', phase: 'Inventory', schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'path', 'detail'],
      properties: {
        ok: { type: 'boolean' },
        path: { type: 'string', description: 'absolute path to the plugin root, or empty when ok=false' },
        detail: { type: 'string', description: 'which candidate matched, or what was tried and missing' },
      },
    } }
  )
  // A dead probe agent returns null, which is not the same as "it looked and found
  // nothing" — both stop the run, but they are different failures to report.
  if (!resolved) return { error: 'could not resolve the contract source: the probe agent returned nothing' }
  if (!resolved.ok || !resolved.path) {
    return {
      error: 'could not locate the nextjs-clean-skills plugin root',
      detail: resolved.detail,
      fix: 'Pass args.contractSource explicitly: the absolute path to a directory holding ' +
        SOURCE_MARKERS.join(', ') + '. In a checkout of this repository that is <repo>/plugins/nextjs-clean-skills.',
    }
  }
  SRC = resolved.path
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
- ${SRC}/skills/designing-architecture/SKILL.md — placement decisions
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

// The roots lens already has to discover sourceRoot. It no longer enumerates the tree.
// Asking one agent to list every path turned the canonical inventory into a structured-output size
// problem: on a 2210-file repository the lens returned 808 directories while its own findings
// carried the correct count, and a summarised inventory is indistinguishable from a measured one.
// What it returns now is a partition plus an independently counted total; the enumeration is fanned
// out below. Counting is not judgement, so splitting it costs nothing the barrier protects.
const MAX_SUBTREE_FILES = 300
const SOURCE_LENS_SCHEMA = {
  ...LENS_SCHEMA,
  required: ['lens', 'findings', 'subtrees', 'rootFiles', 'totalFiles'],
  properties: {
    ...LENS_SCHEMA.properties,
    subtrees: {
      type: 'array',
      description:
        'repo-relative directories under sourceRoot that do not overlap and, together with rootFiles, ' +
        'cover every source file; no entry may exceed ' + MAX_SUBTREE_FILES + ' files — split deeper instead',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'fileCount'],
        properties: {
          path: { type: 'string' },
          fileCount: { type: 'integer', description: 'source files under this directory, counted with a command' },
        },
      },
    },
    rootFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'source files sitting directly in sourceRoot with no owning directory',
    },
    totalFiles: {
      type: 'integer',
      description: 'source files under sourceRoot in total, counted with one command over the whole root',
    },
  },
}

// Mechanical listing of one subtree: the agent runs a find and reports what it printed.
const ENUMERATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'files'],
  properties: {
    path: { type: 'string', description: 'the subtree it was asked to enumerate, verbatim' },
    files: { type: 'array', items: { type: 'string' }, description: 'every repo-relative source file under it' },
    notes: { type: 'string' },
  },
}

const ASSIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['capabilities', 'rules', 'unassigned'],
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
    // One decision still sees the whole tree; what changed is that it is not asked to TYPE the whole
    // tree back. A row per file made the handoff scale with file count — 2210 rows, each carrying
    // prose evidence, is a payload no single structured output returns, and the agent silently
    // covered 497 of 808 inputs rather than failing. Rules are the same judgement expressed at the
    // size of the decision instead of the size of the repository, and the script expands them.
    rules: {
      type: 'array',
      description:
        'coverage rules over the inventory. Resolution is by specificity, not by array order: a `file` ' +
        'rule beats every prefix, and among prefixes the longest match wins. Every source file must be ' +
        'covered by exactly one winner, and every rule must match at least one real file.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'kind', 'placement', 'runtime'],
        properties: {
          path: { type: 'string', description: 'repo-relative directory (kind=prefix) or file (kind=file)' },
          kind: { enum: ['prefix', 'file'] },
          placement: { enum: ['capability', 'shared', 'app', 'infrastructure', 'unclear'] },
          capability: { type: 'string' },
          segment: { enum: ['domain', 'application', 'server', 'client', 'ui'] },
          surface: { type: 'string', description: 'set only on a kind=file rule, when that file becomes a module-root public surface' },
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
    // Name exactly the counters whose zero came from having nothing to classify.
    vacuousCounters: {
      type: 'array',
      items: { type: 'string' },
      description:
        'counters that reported zero only because there was nothing under moduleRoot/sharedRoot to classify; ' +
        'a counter that genuinely found nothing does NOT belong here',
    },
    capabilityTierBinds: { type: 'boolean', description: 'for the census: true only when moduleRoot exists in the target AND contains at least one source file, so the capability-tier rules had something to classify' },
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
  {
    key: 'roots',
    text:
      'Read tsconfig.json, next.config.*, and any eslint config. Report the current source root, app root, path aliases (exact prefixes), and any existing boundary tooling already in place. ' +
      'Do NOT list the files themselves — agents after you do that, one subtree each. Partition the tree instead. ' +
      'Source files are .js, .jsx, .mjs, .cjs, .ts, .tsx, .mts, .cts, including tests and generated source, excluding dependency, build-output and coverage directories. ' +
      'In `totalFiles`: their count under sourceRoot, taken with ONE command over the whole root. ' +
      'In `rootFiles`: the ones sitting directly in sourceRoot with no owning directory. ' +
      'In `subtrees`: directories that together with rootFiles cover every one of those files. None may contain another, ' +
      'and none may hold more than ' + MAX_SUBTREE_FILES + ' files — go deeper wherever a directory is larger — and each carries its counted fileCount. ' +
      'Every count is checked against what the per-subtree listings return, so take them with commands rather than estimating.',
  },
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
    { label: 'lens:' + l.key, phase: 'Inventory', schema: l.key === 'roots' ? SOURCE_LENS_SCHEMA : LENS_SCHEMA }
  )
))
// Key position is authoritative; `lens` is descriptive free text.
const lensOuts = lensRaw
  .map((r, i) => (r ? { ...r, key: LENSES[i].key } : null))
  .filter(Boolean)

log('Inventory: ' + lensOuts.length + '/' + LENSES.length + ' lenses returned')
// A missing lens is a hole in the inventory, not an empty result.
if (lensOuts.length < LENSES.length) {
  const missing = LENSES.filter((l, i) => !lensRaw[i]).map(l => l.key)
  return {
    error: 'inventory incomplete: ' + missing.length + ' of ' + LENSES.length + ' lenses did not return',
    missingLenses: missing,
    detail: 'Each lens is the only authority over its part of the tree, so assignment and the census ' +
      'would be built on evidence that was never gathered. Re-run; agents that died are not agents that found nothing.',
  }
}
if (lensOuts.length === 0) return { error: 'every inventory lens failed — nothing to assign' }

const lensByKey = Object.create(null)
for (const o of lensOuts) lensByKey[o.key] = o
const dataLens = lensByKey.data
const sourceLens = lensByKey.roots

// ─── Enumeration: fanned out, then checked against a total nobody in the fan-out produced ───
// The partition is judgement the roots lens already had to make; listing the files under it is not.
// Splitting the listing keeps each agent's output small enough to be complete, and the lens's own
// count — taken with one command over the whole root, before any subtree was listed — is what makes
// a short answer fail instead of pass quietly.
const subtreeRows = (sourceLens && sourceLens.subtrees) || []
const rootFiles = ((sourceLens && sourceLens.rootFiles) || []).map(file => String(file).trim())
const declaredTotal = sourceLens && typeof sourceLens.totalFiles === 'number' ? sourceLens.totalFiles : -1
const subtreePaths = subtreeRows.map(row => (row && typeof row.path === 'string' ? row.path.trim() : ''))
const unsafeSubtrees = subtreePaths.filter(path => path === '' || path[0] === '/' || /(^|\/)\.\.(\/|$)/.test(path))
const overlappingSubtrees = subtreePaths.filter((path, i) =>
  subtreePaths.some((other, j) => i !== j && other !== '' && path.startsWith(other + '/'))
)
const oversizedSubtrees = subtreeRows
  .filter(row => row && typeof row.fileCount === 'number' && row.fileCount > MAX_SUBTREE_FILES)
  .map(row => ({ path: row.path, fileCount: row.fileCount }))
if (declaredTotal < 0 || unsafeSubtrees.length > 0 || overlappingSubtrees.length > 0 || oversizedSubtrees.length > 0) {
  return {
    error: 'the roots lens did not return a usable partition of the source tree',
    unsafe: [...new Set(unsafeSubtrees)],
    overlapping: [...new Set(overlappingSubtrees)],
    oversized: oversizedSubtrees,
    totalFiles: declaredTotal,
    detail: 'Subtrees must be safe repo-relative directories, must not nest inside one another, and must each ' +
      'stay under ' + MAX_SUBTREE_FILES + ' files so one agent can list them completely. Nothing has been written.',
  }
}

const enumeratedRaw = await parallel(subtreeRows.map(row => () =>
  agent(
    `List every JavaScript or TypeScript source file under ${REPO}/${row.path}.\n\n` +
    '## Rules\n' +
    'Run one command (for example `find` or `git ls-files`) rooted at that directory and report exactly what it printed.\n' +
    'Extensions: .js, .jsx, .mjs, .cjs, .ts, .tsx, .mts, .cts. Include tests and generated source. ' +
    'Exclude dependency, build-output and coverage directories.\n' +
    'Paths must be repo-relative and must all start with `' + row.path + '/`.\n' +
    'This is a listing, not a summary: do NOT collapse directories, do NOT omit files that look unimportant, ' +
    'and do NOT stop early. The count is checked against an independent total — a short list fails the run.\n' +
    'Do not write, edit or move anything.\n\n' +
    'Structured output only.',
    { label: 'enumerate:' + row.path, phase: 'Inventory', schema: ENUMERATE_SCHEMA }
  )
))
const silentSubtrees = subtreeRows.filter((row, i) => !enumeratedRaw[i]).map(row => row.path)
if (silentSubtrees.length > 0) {
  return {
    error: 'enumeration incomplete: ' + silentSubtrees.length + ' of ' + subtreeRows.length + ' subtrees did not return',
    missingSubtrees: silentSubtrees,
    detail: 'An agent that died is not an agent that found no files. Re-run; nothing has been written.',
  }
}

// Key position is authoritative here too: the agent's own `path` is descriptive.
const strayEnumerations = []
const sourceInventory = rootFiles.slice()
enumeratedRaw.forEach((out, i) => {
  const prefix = subtreePaths[i] + '/'
  for (const raw of (out && out.files) || []) {
    const file = String(raw).trim()
    if (!file.startsWith(prefix)) strayEnumerations.push({ subtree: subtreePaths[i], file })
    else sourceInventory.push(file)
  }
})
const invalidInventoryFiles = sourceInventory.filter(
  file => file === '' || file[0] === '/' || /(^|\/)\.\.(\/|$)/.test(file)
)
const inventorySeen = new Set()
const duplicateInventoryFiles = sourceInventory.filter(file => {
  if (inventorySeen.has(file)) return true
  inventorySeen.add(file)
  return false
})
if (invalidInventoryFiles.length > 0 || duplicateInventoryFiles.length > 0 || strayEnumerations.length > 0) {
  return {
    error: 'source inventory is not a unique set of safe repo-relative files',
    invalid: [...new Set(invalidInventoryFiles)],
    duplicates: [...new Set(duplicateInventoryFiles)],
    outsideItsSubtree: strayEnumerations.slice(0, 50),
    detail: 'Each enumerating agent is authoritative only over its own subtree. Nothing has been written.',
  }
}
// The one check the fan-out cannot fake: a total counted over the whole root before it ran.
if (sourceInventory.length !== declaredTotal) {
  return {
    error: 'enumeration does not account for every source file the roots lens counted',
    counted: declaredTotal,
    enumerated: sourceInventory.length,
    perSubtree: subtreeRows.map((row, i) => ({
      path: row.path,
      declared: row.fileCount,
      returned: ((enumeratedRaw[i] && enumeratedRaw[i].files) || []).length,
    })),
    detail: 'A listing shorter than the count is a summarised inventory, which would make every later ' +
      'verdict a statement about files nobody looked at. Nothing has been written.',
  }
}
log('Inventory: ' + sourceInventory.length + ' source files across ' + subtreeRows.length + ' subtrees')

const LENS_BLOCK = lensOuts
  .map(o =>
    '### ' + o.key + '\n' +
    (o.findings || []).map(f => '- ' + f).join('\n') +
    (o.notes ? '\n' + o.notes : '') +
    // Assign uses each lens's authoritative file set as evidence.
    ((o.files || []).length > 0 ? '\nfiles this lens is authoritative about: ' + o.files.join(', ') : '')
  )
  .join('\n\n')

// The whole inventory still reaches the single Assign decision — a prompt carries what a structured
// output could not. Grouped by subtree so the shape of the tree survives the listing.
const INVENTORY_BLOCK =
  (rootFiles.length > 0 ? '#### (loose files at the source root)\n' + rootFiles.join('\n') + '\n\n' : '') +
  subtreePaths
    .map((path, i) => '#### ' + path + '\n' + (((enumeratedRaw[i] && enumeratedRaw[i].files) || []).join('\n')))
    .join('\n\n')

// ─── Assign: the barrier is load-bearing ───
// One agent decides ownership for the WHOLE file set, because two files can only
// be given one owner each if a single decision sees both. Fanning this out
// produces contested files and duplicate capabilities.
phase('Assign')

let assignment = await agent(
  `Assign a single owner and role to every source file in ${REPO}.\n\n` +
  '## Inventory from six independent lenses\n' + LENS_BLOCK + '\n\n' +
  '## The source inventory — ' + sourceInventory.length + ' files, and the complete set you must cover\n' +
  INVENTORY_BLOCK + '\n\n' +
  CONTRACT_DOCS + '\n\n' +
  '## What to produce\n' +
  '1. The capability list. Merge the lenses\' candidates into capabilities named from domain vocabulary. Give each a pilotScore: a good pilot is one COMPLETE capability with real consumers and few things depending on it.\n' +
  '2. Coverage `rules` that place every file above. A rule is `kind: "prefix"` (a directory) or `kind: "file"` (one path), and carries placement (capability | shared | app | infrastructure | unclear), and when placement is `capability`, the target segment (domain | application | server | client | ui). Route-private UI stays under the app root — that is placement `app`, not a capability file. A public surface is named with `surface` on a `kind: "file"` rule only.\n' +
  '   Resolution is by specificity, not by the order you write them in: a `file` rule beats every prefix, and among prefixes the longest match wins. So cover a directory once and then carve out the exceptions.\n' +
  '   Write a rule per real decision, not per file: a directory whose files share an owner, a role and a runtime is ONE prefix rule. Split it only where the answer actually differs.\n' +
  '3. runtime class on every rule: server-only, browser-safe, neutral, or unclear. This is the fact a per-capability agent cannot derive on its own, so be exact and cite evidence. Where a directory mixes runtimes, that is a reason to split the rule, not to average it.\n' +
  '4. Direct dependency classification: pure / runtime / undecided. `undecided` is a real answer; the product decides those, not you.\n' +
  '5. Anything you cannot place, in `unassigned`, with why — and `likelyCapability`, your best guess at which capability it would belong to. The pilot gate reads that field, so omitting it hides the file from the gate. An unassigned file is an exception to a prefix rule, so leave the prefix rule in place and list the file here.\n' +
  '6. roots: the repo\'s real sourceRoot and appRoot, plus the moduleRoot and sharedRoot the capabilities WILL live under. Phase 2 computes every destination path from moduleRoot, so pick it deliberately and consistently with this repo\'s existing layout (do not default to src/modules if that is not where this repo would put them).\n\n' +
  '## Rules\n' +
  'Verify against the code before assigning — Read or Grep the files a rule covers, do not infer ownership from a directory name alone.\n' +
  'Every file must be covered, and every rule must match at least one real file: a rule over a path that does not exist is a decision about a tree that is not this one.\n' +
  'Prefer `unclear` over a guess; an unclear file is a review item, a wrong assignment is a silent architecture defect.\n' +
  'Do NOT propose a segment that would be empty, and do NOT invent a surface no consumer needs.\n' +
  'Read and Grep only — write nothing.\n\n' +
  'Structured output only.',
  { label: 'assign', phase: 'Assign', schema: ASSIGN_SCHEMA }
)

if (!assignment) return { error: 'assignment agent returned no result' }

// ASSIGN_SCHEMA validates row shape, not the handoff as a set. Phase 2 can prove only that a plan
// covers the manifest rows it receives, so omissions and duplicates have to stop here.
const capabilityRows = assignment.capabilities || []
const capabilityNamesRaw = capabilityRows.map(capability => capability && capability.name)
const invalidCapabilityNames = capabilityNamesRaw.filter(
  name => typeof name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)
)
const capabilitySeen = new Set()
const duplicateCapabilityNames = capabilityNamesRaw.filter(name => {
  if (capabilitySeen.has(name)) return true
  capabilitySeen.add(name)
  return false
})
const unknownDependencyNames = capabilityRows.flatMap(capability =>
  (capability.dependsOn || []).filter(name => !capabilitySeen.has(name)).map(name => ({ capability: capability.name, dependsOn: name }))
)
if (invalidCapabilityNames.length > 0 || duplicateCapabilityNames.length > 0 || unknownDependencyNames.length > 0) {
  return {
    error: 'capability inventory is not executable by phase 2',
    invalidNames: [...new Set(invalidCapabilityNames)],
    duplicateNames: [...new Set(duplicateCapabilityNames)],
    unknownDependencies: unknownDependencyNames,
    detail: 'Capability names must be unique kebab-case values and dependsOn may name only capabilities in this run.',
  }
}

// ─── Rules are expanded HERE ───
// Which file a rule wins is arithmetic, so it belongs to the script: an agent asked to apply its own
// precedence would be free to disagree with itself between two files. A `file` rule beats every
// prefix; among prefixes the longest wins. Nothing depends on the order the rules arrived in.
function winningRule(file, rules) {
  let best = null
  let bestLength = -1
  for (const rule of rules) {
    if (!rule || typeof rule.path !== 'string') continue
    const path = rule.path.trim()
    if (rule.kind === 'file') {
      if (path === file) return rule
      continue
    }
    if (file.startsWith(path + '/') && path.length > bestLength) {
      best = rule
      bestLength = path.length
    }
  }
  return best
}

const ruleRows = assignment.rules || []
const unassignedRows = assignment.unassigned || []
const unassignedFiles = unassignedRows.map(row => (row && typeof row.file === 'string' ? row.file.trim() : ''))
const unassignedSeen = new Set(unassignedFiles)

const unsafeRulePaths = ruleRows
  .map(rule => (rule && typeof rule.path === 'string' ? rule.path.trim() : ''))
  .filter(path => path === '' || path[0] === '/' || /(^|\/)\.\.(\/|$)/.test(path))
const ruleKeySeen = new Set()
const duplicateRules = ruleRows
  .map(rule => (rule ? rule.kind + ':' + String(rule.path).trim() : ''))
  .filter(key => {
    if (ruleKeySeen.has(key)) return true
    ruleKeySeen.add(key)
    return false
  })
// A surface names one file. On a prefix it would publish a whole directory under one public name.
const prefixSurfaces = ruleRows
  .filter(rule => rule && rule.kind === 'prefix' && rule.surface)
  .map(rule => ({ path: rule.path, surface: rule.surface }))
if (unsafeRulePaths.length > 0 || duplicateRules.length > 0 || prefixSurfaces.length > 0) {
  return {
    error: 'coverage rules are not a usable decision set',
    unsafe: [...new Set(unsafeRulePaths)],
    duplicates: [...new Set(duplicateRules)],
    surfaceOnPrefix: prefixSurfaces,
    detail: 'Rule paths must be safe and unique per kind, and a public surface names exactly one file. Nothing has been written.',
  }
}

const ruleKey = rule => rule.kind + ':' + String(rule.path).trim()
// Matched, not won. Covering a directory and then carving out the exceptions is the shape the
// prompt asks for, so a broad prefix that every longer rule overrides is doing its job — it is the
// answer for the files nobody carved out. Only a rule no file matches at all describes another tree.
const matchedRules = new Set()
for (const file of sourceInventory) {
  for (const rule of ruleRows) {
    if (!rule || typeof rule.path !== 'string') continue
    const path = rule.path.trim()
    if (rule.kind === 'file' ? path === file : file.startsWith(path + '/')) matchedRules.add(ruleKey(rule))
  }
}

const assignmentRows = []
const uncoveredFiles = []
for (const file of sourceInventory) {
  if (unassignedSeen.has(file)) continue
  const rule = winningRule(file, ruleRows)
  if (!rule) {
    uncoveredFiles.push(file)
    continue
  }
  const row = { file, placement: rule.placement, runtime: rule.runtime }
  if (rule.capability) row.capability = rule.capability
  if (rule.segment) row.segment = rule.segment
  if (rule.sharedRoot) row.sharedRoot = rule.sharedRoot
  if (rule.surface) row.surface = rule.surface
  if (rule.evidence) row.evidence = rule.evidence
  assignmentRows.push(row)
}
// A rule matching nothing was written about a tree that is not this one.
const deadRules = ruleRows
  .filter(rule => rule && !matchedRules.has(ruleKey(rule)))
  .map(rule => ({ path: rule.path, kind: rule.kind }))
// A `file` rule over an unassigned file is NOT a contradiction. "Here is where it would go, and I
// still cannot commit to it" carries more than either half alone, and the first live run produced
// exactly that for a module mixing a generic wrapper with one capability's contracts. Unassigned
// wins — the expansion above skips those files — so the placement stays a note, never an owner.
const suggestedForUnassigned = ruleRows
  .filter(rule => rule && rule.kind === 'file' && unassignedSeen.has(String(rule.path).trim()))
  .map(rule => ({ file: String(rule.path).trim(), wouldBe: rule.placement || null, capability: rule.capability || null }))
const unknownUnassignedFiles = unassignedFiles.filter(file => !inventorySeen.has(file))
const duplicateUnassigned = unassignedFiles.filter((file, i) => unassignedFiles.indexOf(file) !== i)
const unknownAssignmentCapabilities = assignmentRows
  .filter(row => row && row.placement === 'capability' && !capabilitySeen.has(row.capability))
  .map(row => ({ file: row.file, capability: row.capability || null }))
if (
  uncoveredFiles.length > 0 || deadRules.length > 0 ||
  unknownUnassignedFiles.length > 0 || duplicateUnassigned.length > 0 || unknownAssignmentCapabilities.length > 0
) {
  return {
    error: 'source inventory is not partitioned exactly once between assignments and unassigned',
    uncovered: uncoveredFiles.slice(0, 100),
    uncoveredCount: uncoveredFiles.length,
    rulesMatchingNothing: deadRules,
    unassignedOutsideInventory: [...new Set(unknownUnassignedFiles)],
    duplicateUnassigned: [...new Set(duplicateUnassigned)],
    unknownAssignmentCapabilities,
    detail: 'Every inventory file must be covered by exactly one rule or listed as unassigned, every rule must ' +
      'match a real file, and a capability placement must name a capability this run found. Nothing has been written.',
  }
}
if (suggestedForUnassigned.length > 0) {
  log('Assign: ' + suggestedForUnassigned.length + ' unassigned file(s) carry a suggested placement')
}
// Downstream — the pilot gate, the shared-placement check, the manifest — reads rows, not rules.
assignment.assignments = assignmentRows

// ─── Human decisions on the files nobody could place ───
// Human answers resolve the exact unassigned rows from this run.
const OWNERS = ARGS.fileOwners || {}
const ownedByHuman = []
if (Object.keys(OWNERS).length > 0) {
  const open = (assignment.unassigned || []).map(u => u && u.file).filter(Boolean)
  const capabilityNames = new Set((assignment.capabilities || []).map(c => c && c.name).filter(Boolean))
  const unknownFiles = Object.keys(OWNERS).filter(f => open.indexOf(f) === -1)
  if (unknownFiles.length > 0) {
    return {
      error: 'args.fileOwners names files this run did not report as unassigned',
      offending: unknownFiles,
      unassigned: open,
      detail: 'Ownership decisions answer THIS run\'s question. A stale answer would place a file by a ' +
        'judgement made about a different tree.',
    }
  }
  // The capability has to exist. Inventing one here would create a module root nothing else knows
  // about, and phase 2 computes every destination from a capability name.
  const unknownCaps = [...new Set(Object.values(OWNERS))].filter(c => !capabilityNames.has(c))
  if (unknownCaps.length > 0) {
    return {
      error: 'args.fileOwners names capabilities this run did not find',
      offending: unknownCaps,
      capabilities: [...capabilityNames],
      detail: 'Assign the file to a capability the inventory found, or re-run so the inventory can find the new one.',
    }
  }
  // Build a new assignment so replayed cached results remain immutable.
  const placed = []
  for (const file of open) {
    const capability = OWNERS[file]
    if (!capability) continue
    // Same shape ASSIGN_SCHEMA requires and phase 2's file table reads. `runtime` is genuinely
    // unknown here — the operator answered ownership, not runtime — and saying so beats inventing a
    // hint the planner would treat as evidence.
    placed.push({
      file,
      capability,
      placement: 'capability',
      runtime: 'unclear',
      evidence: 'placed by the operator; runtime and segment were not inferred',
    })
    ownedByHuman.push({ file, capability })
  }
  assignment = {
    ...assignment,
    assignments: (assignment.assignments || []).concat(placed),
    unassigned: (assignment.unassigned || []).filter(u => !OWNERS[u && u.file]),
  }
  log('Ownership decisions applied: ' + ownedByHuman.map(o => o.file + '→' + o.capability).join(', ') +
    ((assignment.unassigned || []).length > 0 ? ' · ' + assignment.unassigned.length + ' still unplaced' : ''))
}

const byCap = Object.create(null)
for (const a of assignment.assignments || []) {
  if (a.placement === 'capability' && a.capability) (byCap[a.capability] ||= []).push(a)
}
// fileCount is derived from the rows phase 2 will actually receive, not trusted from agent prose.
const caps = capabilityRows
  .map(capability => ({ ...capability, fileCount: (byCap[capability.name] || []).length }))
  .sort((a, b) => (b.pilotScore || 0) - (a.pilotScore || 0))
log(
  'Assign: ' + caps.length + ' capabilities, ' + (assignment.assignments || []).length + ' files placed, ' +
  (assignment.unassigned || []).length + ' unassigned, ' + ((assignment.deps && assignment.deps.undecided) || []).length + ' undecided deps'
)

// ─── Human decisions on the undecided dependencies ───
// Apply explicit dependency decisions before Enable and record their authority in the manifest.
const DECISIONS = ARGS.dependencyDecisions || {}
const deps = assignment.deps || {}
const decidedByHuman = []
if (Object.keys(DECISIONS).length > 0) {
  const bad = Object.keys(DECISIONS).filter(k => DECISIONS[k] !== 'pure' && DECISIONS[k] !== 'runtime')
  if (bad.length > 0) {
    return {
      error: 'args.dependencyDecisions values must be "pure" or "runtime"',
      offending: bad.map(k => k + ': ' + JSON.stringify(DECISIONS[k])),
    }
  }
  // Decisions answer only the undecided packages reported by this run.
  const open = deps.undecided || []
  const unknown = Object.keys(DECISIONS).filter(k => open.indexOf(k) === -1)
  if (unknown.length > 0) {
    return {
      error: 'args.dependencyDecisions names packages this run did not report as undecided',
      offending: unknown,
      undecided: open,
      detail: 'Decisions are answers to THIS run\'s question. Drop the stale entries, or re-read the undecided list above.',
    }
  }
  for (const name of open) {
    if (!DECISIONS[name]) continue
    deps[DECISIONS[name]] = (deps[DECISIONS[name]] || []).concat(name)
    decidedByHuman.push({ package: name, side: DECISIONS[name] })
  }
  deps.undecided = open.filter(name => !DECISIONS[name])
  assignment.deps = deps
  log('Dependency decisions applied: ' + decidedByHuman.map(d => d.package + '→' + d.side).join(', ') +
    (deps.undecided.length > 0 ? ' · ' + deps.undecided.length + ' still undecided' : ''))
}

// ─── Product profile: target-owned decisions, before the first write ───
const PROFILE_FIELDS = {
  libraries: 'schema, form, cache and notification libraries',
  storesAndProviders: 'store and remote-provider ownership',
  authAndTenancy: 'auth and tenancy model',
  uiConventions: 'route-private and shared UI conventions',
  migrationDebt: 'accepted migration debt with owner and removal condition',
}
const PROFILE = ARGS.profileDecisions || {}
const unknownProfileKeys = Object.keys(PROFILE).filter(key => !Object.prototype.hasOwnProperty.call(PROFILE_FIELDS, key))
const invalidProfileValues = Object.keys(PROFILE).filter(
  key => typeof PROFILE[key] !== 'string' || PROFILE[key].trim() === ''
)
if (unknownProfileKeys.length > 0 || invalidProfileValues.length > 0) {
  return {
    error: 'args.profileDecisions contains unknown keys or empty decisions',
    unknown: unknownProfileKeys,
    empty: invalidProfileValues,
    admitted: Object.keys(PROFILE_FIELDS),
  }
}
const pendingProfile = Object.keys(PROFILE_FIELDS).filter(key => !Object.prototype.hasOwnProperty.call(PROFILE, key))
if (pendingProfile.length > 0) {
  return {
    error: 'target profile decisions are required before the architecture floor writes to the repository',
    pending: pendingProfile.map(key => ({ key, question: PROFILE_FIELDS[key] })),
    evidence: lensOuts.map(output => ({ lens: output.key, findings: output.findings || [] })),
    fix: 'Re-run with args.profileDecisions containing one non-empty string for every pending key; add resumeFromRunId so inventory and assignment replay from cache.',
  }
}
const profile = {
  decisions: Object.fromEntries(Object.keys(PROFILE_FIELDS).map(key => [key, PROFILE[key].trim()])),
}

// Phase 2 is capability-scoped and has no shared-file mover. A file already under sharedRoot needs
// no migration; one outside it would otherwise remain outside the enforcement floor after every
// capability reported complete.
const configuredSharedRoot = ((assignment.roots || {}).sharedRoot || '').replace(/\/$/, '')
const misplacedShared = assignmentRows.filter(row =>
  row && row.placement === 'shared' &&
  (!configuredSharedRoot || !(row.file === configuredSharedRoot || row.file.startsWith(configuredSharedRoot + '/')))
)
if (misplacedShared.length > 0) {
  return {
    error: 'shared placements outside sharedRoot are not supported by the capability migration workflow',
    files: misplacedShared.map(row => row.file),
    sharedRoot: configuredSharedRoot || null,
    detail: 'No later workflow moves these rows. Place them under the configured sharedRoot in a separate reviewed change, or assign them to a capability, then re-run. Nothing has been written.',
  }
}

// ─── Enable: install the executable floor, then census ───
// Order matters and is not ours to choose: rules/README.md requires every direct
// dependency classified BEFORE the rules are enabled, because a newly installed
// package fails closed.
// Everything past this point writes; unresolved dependency ownership must stop before it.
if (((assignment.deps || {}).undecided || []).length > 0) {
  return {
    error: 'undecided dependencies must be classified before anything is written to the target',
    undecided: assignment.deps.undecided,
    detail: 'The architecture floor cannot pass with an unclassified direct dependency, and this phase writes ' +
      'rules/, a contract and an ESLint change into ' + REPO + '. Nothing has been written.',
    fix: 'Re-run with args.dependencyDecisions { "<package>": "pure" | "runtime" } for each package above — ' +
      'add resumeFromRunId so the inventory and assignment replay from cache instead of costing a second full pass.',
  }
}

phase('Enable')

const enabled = await agent(
  `Install the executable architecture floor into ${REPO}. This is the only phase of this workflow allowed to write, and only these files.\n\n` +
  '## Steps\n' +
  // Before anything is written, not after. The copied rules import `typescript` and
  // `eslint-plugin-import` and resolve through `eslint-import-resolver-typescript`
  // (see rules/README.md); without them the checks die with ERR_MODULE_NOT_FOUND
  // after the contract and the ESLint amendment are already on disk, leaving the
  // target half-converted and the census unmeasurable.
  `0. Check that ${REPO} can resolve \`typescript\`, \`eslint-plugin-import\` and \`eslint-import-resolver-typescript\`, ` +
  'and separately that each is DECLARED in its package.json. Resolving is not the same as depending: one of these ' +
  'commonly arrives transitively through eslint-config-next, so the floor would rest on a package the repo never ' +
  'asked for and a dependency bump could remove. Install or promote the missing ones with the package manager this ' +
  'repository already uses (read its lockfile — bun, pnpm, yarn or npm) as devDependencies, and report what you changed. ' +
  'If you cannot install them, STOP and report that: writing the rules without them leaves the target half-converted and the census unmeasurable.\n' +
  `1. Copy the rule files from ${SRC}/rules/ into ${REPO}/rules/.\n` +
  `2. Write ${REPO}/rules/architecture-contract.json: start from ${SRC}/rules/architecture-contract.json, then set sourceRoot/appRoot/moduleRoot/sharedRoot and importAliases to this repo's real values (alias prefixes MUST end with '/'), and fill purePackages / runtimePackages from the classification below. Leave databaseClientIdentifiers and databaseResources as the inventory found them (empty arrays are fine).\n` +
  `3. Spread the two ESLint configs after the existing flat configs, per ${SRC}/rules/README.md, in a way that does not disturb the existing config.\n` +
  '   Note for the record: the document scopes this to the pilot ("Enable module-boundary and server/client checks for the pilot"), while this installs them repo-wide so the violation census can be measured. That deviation is recorded in the manifest, not hidden.\n' +
  // The vendored files are this repository's, written to its style, and they land in a
  // target with its own lint and formatter rules. Reformatting them would fork them from
  // the plugin source and break the next re-sync; leaving them to be linted breaks the
  // target's own gates, which the burndown then reads as migration debt that was never
  // ours. Excluding the directory is the only option that keeps both true — and it needs
  // to be sanctioned here, because these ignore files sit outside the writable set above.
  `3a. Keep the target's OWN gates exactly as green as they were before this step. \`rules/\` holds vendored files: exclude that directory from the target's linter and formatter — an \`{ ignores: ['rules/**'] }\` entry in the ESLint config, plus \`rules/\` AND \`migration-manifest.json\` in .prettierignore or the equivalent for whichever formatter ${REPO} runs — the manifest is written by a later phase of this same workflow and fails the target's formatter for the same reason the vendored files do. ` +
  'You may write those ignore files and only those, in addition to the files listed above. Do NOT reformat or edit the vendored files themselves: they must stay byte-identical to the source so the copy can be re-synced. ' +
  `Then re-run the target's own lint and format commands and confirm both still pass. If installing the floor changed either verdict, say so — a floor that breaks the repository's existing gates is not installed, it is imposed.\n` +
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
  // "It must exit 0" was unsatisfiable by construction. The checker derives the accessing
  // subject from moduleRoot / sharedRoot / appRoot, and before migration every data-access
  // file sits outside all three — so the subject is null and no consumers list can admit it.
  // Demanding green here asks phase 1 to prove a property only phase 2 can create, and the
  // only way to satisfy it is to declare roots that describe a layout the repo does not have.
  'Then run `node rules/check-database-resources.mjs` and report its exit code and errors verbatim.\n' +
  '**A non-zero exit here is expected and is NOT an install failure.** Before migration the data-access files ' +
  `live outside moduleRoot, sharedRoot and appRoot, so the checker cannot attribute a subject to them; the property ` +
  'turns green by moving code in phase 2, not by editing the contract. Count those errors as a burndown item and ' +
  'carry on. Do NOT redefine moduleRoot or sharedRoot to make this check pass: roots that cover the pre-migration ' +
  'layout describe a structure the repository does not have, and every later count would measure the mis-declaration ' +
  'instead of the code. Report separately any error whose cause is NOT the missing subject — that one is real.\n' +
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

// One ESLint pass is the single authoritative boundary census.
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
      'List in `vacuousCounters` every counter whose zero means "nothing to classify" rather than "nothing found" — the capability, segment and surface messageIds when moduleRoot is empty, and nothing else. A counter that ran over real files and found none is NOT vacuous: phase 2 waives regressions only for the ones named here, and naming a counter that works hides a regression the migration caused.\n' +
  'Also set `capabilityTierBinds`: true only if moduleRoot (from the contract you just wrote) exists in the target AND holds at least one source file. If it does not, every capability, segment and surface messageId will report zero because there is nothing under those roots to classify — say so plainly in `detail` rather than presenting the zeros as a clean result.\n' +
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

// Key probes by position and run them sequentially because their tools share build artifacts.
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
// Carry whether capability-tier zero meant clean or nothing-to-classify.
const capabilityTierBinds = !!(census && census.capabilityTierBinds)
// Named counters, not a global switch. Empty when the tier bound, which is the same thing as
// "waive nothing".
const vacuousCounters = (census && census.vacuousCounters) || []
const totalViolations = Object.keys(violations).reduce((n, k) => n + (violations[k] || 0), 0)
log('Baseline: ' + baseline.filter(b => b.ok).length + '/' + baseline.length + ' probes ok, ' + totalViolations + ' violations censused')

// ─── Manifest ───
phase('Manifest')

const manifest = {
  repo: REPO,
  contractSource: SRC,
  roots: assignment.roots || {},
  capabilities: caps,
  // Persist only target-owned decisions; lens evidence is phase-1 working data.
  profile,
  // Who decided what, and by what authority. A contract saying `dayjs` is a runtime
  // package does not say whether static analysis inferred that or a human ruled on it,
  // and only the second is something a later reader can go back and question.
  dependencyDecisions: decidedByHuman,
  fileOwners: ownedByHuman,
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
      step: 'Adopt In An Existing Project, step 8',
      says: 'exercise the capability\'s real user workflow',
      does: 'neither phase runs it, and neither compares runtime behaviour beyond the behaviour oracle\'s pass/fail',
      why: 'no agent here drives the running application; the oracles are static and test-suite level',
      needs: 'a human to exercise the workflow by hand before accepting the pilot',
    },
    {
      step: 'Enforcement Floor, property 7 (declared database resources)',
      says: 'declared database resources carry owners and consumers, and the check enforces it',
      does: 'records the check as red at baseline instead of requiring it to pass, whenever its errors are all "no subject"',
      why: 'the checker attributes an accessing subject from moduleRoot/sharedRoot/appRoot, and before migration every ' +
        'data-access file is outside all three — the property is unsatisfiable until phase 2 moves code, and the only ' +
        'way to force it green is to declare roots describing a layout the repository does not have',
      needs: 'it to go green during the pilot; if it does not, the roots or the ownership map are wrong',
    },
  ],
  pilotCandidate: caps.length > 0 ? caps[0].name : null,
  assignments: assignment.assignments || [],
  unassigned: assignment.unassigned || [],
  deps: assignment.deps || {},
  baseline: baseline,
  violationCensus: violations,
  capabilityTierBinds,
  vacuousCounters,
  ordinaryChange: ORDINARY || null,
  rulesInstalled: !!(enabled && enabled.ok),
}

// Code builds the manifest; the writer persists and parses the exact payload without re-authoring it.
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
if (!(assignment.roots || {}).moduleRoot) blockers.push('moduleRoot was not decided — phase 2 computes every destination from it and will refuse to guess')
// Only pilot-owned and unrouteable unassigned rows block the pilot.
const pilotName = caps.length > 0 ? caps[0].name : null
const unassigned = assignment.unassigned || []
const unassignedInPilot = pilotName
  ? unassigned.filter(u => typeof u.likelyCapability === 'string' && u.likelyCapability.trim() === pilotName)
  : []
// A row with no known likely capability has no later run that can own its refusal.
const found = new Set(caps.map(c => c.name))
// Blank paths are unanswerable because fileOwners is keyed by path.
const unrouteable = unassigned.filter(u => {
  if (typeof u.file !== 'string' || u.file.trim() === '') return true
  const named = typeof u.likelyCapability === 'string' ? u.likelyCapability.trim() : ''
  return named === '' || !found.has(named)
})
const stuck = unassignedInPilot.concat(unrouteable.filter(u => unassignedInPilot.indexOf(u) === -1))
if (stuck.length > 0) {
  blockers.push(
    stuck.length + ' file(s) have no owner and cannot wait for a later capability: ' +
      stuck.map(u => u.file + (u.likelyCapability ? ' (guessed: ' + u.likelyCapability + ')' : ' (no capability guessed)')).join(', ') +
      '. Answer with args.fileOwners { "<file>": "<capability>" } and re-run — add resumeFromRunId so the ' +
      'inventory and assignment replay from cache instead of costing a second full pass.'
  )
}
const warnings = []
if (!capabilityTierBinds) {
  warnings.push('the capability-tier census is a structural vacuum: moduleRoot does not exist yet, so every ' +
    'capability, segment and surface rule reported zero because it had nothing to classify. Those zeros are not a ' +
    'clean baseline, and phase 2 must not read the counts that appear after the first move as regressions above it.')
}
if (unassigned.length > stuck.length) {
  warnings.push((unassigned.length - stuck.length) + ' file(s) outside the pilot have no owner but DO name a capability this inventory found — they block that capability when its own run reads them')
}
// A red measured census is valid; a missing census makes every later comparison meaningless.
for (const b of baseline) if (!b.ok) blockers.push('baseline ' + b.key + ' did not complete: ' + b.detail)
if (Object.keys(violations).length === 0) {
  blockers.push('the violation census is empty — phase 2 measures its burndown against it and would read every count as a regression')
}
const radiusProbe = baseline.find(b => b.key === 'change-radius')
if (radiusProbe && !radiusProbe.ok) blockers.push('the change-radius before-set was not established: ' + radiusProbe.detail)
// The manifest is the executable handoff to phase 2.
if (!written || !written.ok) {
  blockers.push('migration-manifest.json was not written: ' + ((written && written.detail) || 'the writer agent returned nothing') +
    ' — phase 2 reads every assignment, the census and the contract path from it')
}

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
  // Surfaced in the run result, not only buried in the manifest: this is the one part of
  // the contract the operator supplied rather than the analysis inferred, and the run
  // report is what they actually read.
  dependencyDecisions: decidedByHuman,
  fileOwners: ownedByHuman,
  deviations: manifest.deviations,
  profile: manifest.profile.decisions,
  nextStep: blockers.length === 0
    ? 'Run migrate-capability with args { repo, capability: "' + manifest.pilotCandidate + '", manifestPath }. ' +
      'Read `deviations` first — they name the remaining limits this phase cannot settle for you.'
    : 'Clear the blockers above first — a pilot measured against a red baseline proves nothing',
}
