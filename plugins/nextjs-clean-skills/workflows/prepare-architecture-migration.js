export const meta = {
  name: 'prepare-architecture-migration',
  description:
    'Phase 1 of capability-first adoption: inventory a target repo, assign every source file an owner and role, classify direct dependencies, then INSTALL rules/ and a drafted architecture-contract.json into the target and amend its ESLint config, capture the behavioural baseline and the violation census, and write migration-manifest.json. Moves no product code.',
  whenToUse:
    'Run once against a Next.js repo that is adopting the capability-first architecture, before any file moves. It writes rules/, a contract and an ESLint config change into the target, so run it on a throwaway branch. args: { repo: "/abs/path", ordinaryChange: "a one-line description of a typical follow-up change", contractSource?: "/abs/path/to/the/plugin/root", dependencyDecisions?: { "pkg": "pure|runtime" }, fileOwners?: { "src/x.ts": "capability" } }. contractSource is resolved from the installed plugin when omitted; dependencyDecisions and fileOwners answer the packages and files a previous run reported as undecided or unplaced.',
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

// `args` does not always arrive as an object. Several invocation paths hand the script
// the JSON *string* instead, and every field then reads as undefined — so a run with a
// perfectly good `repo` failed with "args.repo is required", blaming the caller for the
// one thing they had got right. Parsed here, once, so the rest of the file can assume a
// plain object. A string that is not JSON still fails, but says so.
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
// The plugin root, which carries docs/, rules/ and skills/ side by side. Resolved
// below when the caller does not pass it. No home-directory fallback and no guess:
// hardcoding the author's checkout meant that on any other machine every agent
// silently received paths to normative documents that do not exist, and proceeded
// from memory instead of from the contract.
let SRC = ARGS.contractSource || ''
const ORDINARY = ARGS.ordinaryChange || ''
const MANIFEST = REPO + '/migration-manifest.json'

if (!REPO) return { error: 'args.repo is required (absolute path to the target repository)' }
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
    // The capability-tier rules key off positions under moduleRoot/sharedRoot. Before the
    // first move those directories do not exist, so every one of them reports zero — a
    // structural vacuum, not a clean bill of health. Phase 2 has to know which it got.
    // WHICH counters were vacuous, not merely that some were. A single boolean made phase 2 waive
    // every non-capability regression — including counters that never needed moduleRoot to exist,
    // like unresolved imports, database ownership and pre-existing lint debt. Those measure the
    // repository as it already is, and waiving them let a migration introduce them unnoticed.
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
// A missing lens is a hole in the census, not a smaller census. Each one is the only
// authority over its slice of the tree, so a run built on four of six assigns owners
// from evidence nobody gathered — and the log line above was the only trace of it.
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

let assignment = await agent(
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

// ─── Human decisions on the files nobody could place ───
// Same shape, same reason as the dependency decisions above. The first live run stopped on five
// unplaceable files in the pilot — correctly — and the operator's only way forward was to run the
// whole phase again: fourteen agents to answer a question five strings would have answered. Costlier
// than the dependency dead-end, and identical in kind.
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
  // Built, not mutated in place. `assignment` is what the agent returned, and a result you were
  // handed is not yours to edit — the runtime replays cached results on resume, so an in-place edit
  // is a value that differs depending on how many times something ran.
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
      runtime: 'unknown',
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

const caps = (assignment.capabilities || []).slice().sort((a, b) => (b.pilotScore || 0) - (a.pilotScore || 0))
const byCap = Object.create(null)
for (const a of assignment.assignments || []) {
  if (a.placement === 'capability' && a.capability) (byCap[a.capability] ||= []).push(a)
}
log(
  'Assign: ' + caps.length + ' capabilities, ' + (assignment.assignments || []).length + ' files placed, ' +
  (assignment.unassigned || []).length + ' unassigned, ' + ((assignment.deps && assignment.deps.undecided) || []).length + ' undecided deps'
)

// ─── Human decisions on the undecided dependencies ───
// Refusing to guess is only half a design. The first live run stopped on one unclassified
// package — correctly — and left the operator nowhere to put the answer: the only way
// forward was to hand-edit the target's contract, which is exactly the guess the stop
// existed to prevent, made by hand and unrecorded. `dependencyDecisions` is that channel.
// Applied here rather than in the Enable prompt so the classification the agent is handed
// is already complete, and so the manifest can record who decided what.
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
  // Only the ones this run actually reported as undecided. A decision about a package the
  // inventory never raised is a stale copy of a previous run's question, and silently
  // classifying on it would put the operator's old answer into a new repository's contract.
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

// ─── Enable: install the executable floor, then census ───
// Order matters and is not ours to choose: rules/README.md requires every direct
// dependency classified BEFORE the rules are enabled, because a newly installed
// package fails closed.
// Everything past this point WRITES into the target: rules/, a drafted contract, the ESLint config,
// ignore files. An unclassified dependency makes the floor unable to pass, and the Enable prompt's
// own step 4 requires it to exit 0 — so the run used to mutate the target and only afterwards report
// that a package was undecided, leaving a half-converted repository behind a blocker in a report.
// Refusing here costs the operator one argument; refusing there cost them a dirty working tree.
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
  `1. Copy the nine non-README files from ${SRC}/rules/ into ${REPO}/rules/.\n` +
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
      'Also run `node rules/check-module-cycles.mjs`, `node rules/check-shared-admission.mjs`, `node rules/check-neutral-surfaces.mjs` and, if the contract declares database resources, `node rules/check-database-resources.mjs`.\n' +
      'The admission and neutrality checks are expected to be RED before migration for the same structural reason the database check is: nothing lives under moduleRoot or sharedRoot yet. Count them, do not treat them as install failures.\n\n' +
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
// Whether the capability-tier rules had anything to bind to when this census was taken.
// On a repository that has not moved a file yet they do not: moduleRoot does not exist, so
// every capability, segment and surface messageId reports zero. Phase 2 compares its
// post-migration counts against this census, and against a vacuum ANY count reads as a
// regression — so a correct pilot would be told to revise. The flag travels with the
// numbers because the numbers alone cannot say which kind of zero they are.
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
      step: 'Incremental Migration',
      says: 'old and new capabilities may coexist behind an explicit boundary',
      does: 'no workflow migrates files assigned placement="shared"; phase 2 is capability-scoped and its role vocabulary has no shared role',
      why: 'shared admission is a separate gate with its own criteria',
      needs: 'a shared-admission pass before those files move',
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
    {
      step: 'Product Profile',
      says: 'record the profile before migrating',
      does: 'records the six lenses\' findings and lists the fields still outstanding under profile.pending',
      why: 'the remaining fields are product decisions no inventory agent can settle by reading the tree',
      needs: 'a human to fill profile.pending, or an explicit decision that the defaults stand',
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
if (!(assignment.roots || {}).moduleRoot) blockers.push('moduleRoot was not decided — phase 2 computes every destination from it and will refuse to guess')
// Unassigned files block the PILOT only when they belong to the pilot capability.
// The procedure asks to inventory the repo (step 1) and pick one capability (step 3);
// gating the pilot on having placed every file in the target was our own addition.
const pilotName = caps.length > 0 ? caps[0].name : null
const unassigned = assignment.unassigned || []
const unassignedInPilot = pilotName ? unassigned.filter(u => u.likelyCapability === pilotName) : []
if (unassignedInPilot.length > 0) {
  blockers.push(
    unassignedInPilot.length + ' file(s) in the pilot capability have no owner: ' +
      unassignedInPilot.map(u => u.file).join(', ') +
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
// The manifest IS the handoff. Without it phase 2 has no assignments, no census and no
// contract path — yet `manifestPath: null` shipped alongside "no blockers, pilot can
// start", which is an invitation to run phase 2 against nothing.
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
  profilePending: manifest.profile.pending,
  nextStep: blockers.length === 0
    ? 'Run migrate-capability with args { repo, capability: "' + manifest.pilotCandidate + '", manifestPath }. ' +
      'Read `deviations` and `profilePending` first — both are things this phase could not settle for you.'
    : 'Clear the blockers above first — a pilot measured against a red baseline proves nothing',
}
