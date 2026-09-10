export const meta = {
  name: 'inventory',
  description:
    'Read-only inventory lenses over a Next.js repository whose file list the session already produced with bin/migration.mjs inventory. Dispatches at most six agents, one per lens, in parallel; none of them lists the tree. args: { repo, inventoryPath, contractSource, lenses? }.',
  whenToUse:
    'Called by the migrating-architecture skill after `migration.mjs inventory` wrote .nextjs-clean-migration/inventory.json. Not for listing files — that is mechanical and already done.',
  phases: [{ title: 'Inventory', detail: 'six read-only lenses: routes, capabilities, runtime, data, deps, roots' }],
}

// The file list is an input here, never an output: an agent asked to enumerate a tree
// answers with a summary, and a summary is indistinguishable from a measurement at the
// receiving end. The session listed the files with one command; every lens reads that
// list and reports findings over it.

let ARGS = args || {}
if (typeof args === 'string') {
  try {
    ARGS = JSON.parse(args)
  } catch (error) {
    return { error: 'args is not valid JSON: ' + error.message }
  }
}
if (!ARGS || typeof ARGS !== 'object') return { error: 'args must be an object' }

const REPO = ARGS.repo || ''
const INVENTORY = ARGS.inventoryPath || ''
const SRC = ARGS.contractSource || ''
if (!REPO) return { error: 'args.repo is required (absolute path to the target repository)' }
if (!INVENTORY) return { error: 'args.inventoryPath is required: run `node <plugin>/bin/migration.mjs inventory --repo <repo>` first and pass the path it printed' }
if (!SRC) return { error: 'args.contractSource is required: the absolute path of the installed plugin root (the skill resolves it before calling this workflow)' }

const LENS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'findings', 'cannotDecide'],
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' }, description: 'one finding per line, each citing a repo-relative path or a command output' },
    cannotDecide: { type: 'array', items: { type: 'string' }, description: 'questions the sources do not settle; never guessed' },
  },
}

const ALL_LENSES = [
  { key: 'routes', text: 'Map every entry point: files under the app router (pages, layouts, route handlers, middleware or proxy), plus any server entry (instrumentation, workers, cron). For each, name what product behaviour it exposes.' },
  { key: 'capabilities', text: 'Name the PRODUCT capabilities this codebase implements, from the domain vocabulary used in code and UI copy — not from folder names. A capability is a thing the product does that a user or another system asks for. For each, list the files from the inventory that implement it, wherever they currently live, and its real consumers.' },
  { key: 'runtime', text: "Map the server/client boundary as it exists today: every 'use client' and 'use server' directive, every server-only import (node builtins, secrets, DB clients, server-only), and every place browser code reaches server code. Name each crossing and whether it is currently safe." },
  { key: 'data', text: 'Map data access and outbound effects: database clients and the identifiers they are bound to, every literal table/rpc/collection name and the file that touches it, cache wiring, queues, and third-party providers. Note where the same table is touched from more than one area, and which calls write.' },
  { key: 'deps', text: 'Read package.json. For every DIRECT dependency decide whether it is pure (no runtime, no I/O, safe in domain code) or runtime-bound (framework, I/O, provider, telemetry). Put the ones you cannot decide from the package alone in cannotDecide — do not guess.' },
  { key: 'roots', text: 'Read tsconfig.json, next.config.*, any eslint config and the lockfile. Report the source root, app root, path aliases (exact prefixes), the package manager the lockfile names, whether tsconfig.json exists, and any boundary tooling already in place. Do not list files.' },
]
const wanted = Array.isArray(ARGS.lenses) && ARGS.lenses.length > 0 ? ARGS.lenses : ALL_LENSES.map(l => l.key)
const LENSES = ALL_LENSES.filter(l => wanted.includes(l.key))
if (LENSES.length === 0) return { error: 'args.lenses names no known lens; known: ' + ALL_LENSES.map(l => l.key).join(', ') }

phase('Inventory')
const results = await parallel(LENSES.map(l => () =>
  agent(
    `You are a read-only inventory lens over the repository at ${REPO}.\n\n` +
    `## The file list\nThe complete source inventory is at ${INVENTORY} (JSON: { sourceRoot, count, files[] }). Read it. ` +
    'Do NOT list the tree yourself, and do NOT paste the file list back: cite paths from it.\n\n' +
    `## Your lens — ${l.key}\n${l.text}\n\n` +
    `## The contract\nRead ${SRC}/docs/architecture-contract.md before reporting; your findings feed a migration to it.\n\n` +
    '## Rules\nRead and Grep only. Do NOT write, edit, move, or delete anything. Do NOT run builds, installs, or git commands. ' +
    'Cite a repo-relative path or a command output for every finding. Report absence explicitly rather than assuming.\n\nStructured output only.',
    { label: 'lens:' + l.key, phase: 'Inventory', schema: LENS_SCHEMA }
  )
))

const lenses = {}
const silent = []
LENSES.forEach((l, i) => {
  if (results[i]) lenses[l.key] = results[i]
  else silent.push(l.key)
})
log('Inventory: ' + Object.keys(lenses).length + '/' + LENSES.length + ' lenses returned' + (silent.length > 0 ? '; silent: ' + silent.join(', ') : ''))

return { inventoryPath: INVENTORY, lenses, silent, agents: LENSES.length }
