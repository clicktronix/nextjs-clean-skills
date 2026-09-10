#!/usr/bin/env node
// Contract test for plugins/nextjs-clean-skills/workflows/*.js.
//
// Workflow scripts are never imported or executed by this repository's tooling, so
// nothing else can catch a violation of the runtime contract — the failure would
// surface as a dead workflow mid-run, after paid agents. These assertions are the
// cheap half that needs no runtime:
//
//   parse      the body must parse as an async-function body (that is how it runs)
//   meta       must be a literal that evaluates with no bindings in scope
//   phases     phase() and every opts.phase must match meta.phases titles exactly
//   forbidden  no import/require, no Date.now/Math.random/argless new Date
//
// Then each script is RUN against stubbed hooks, as scenarios rather than label counts:
//   inventory  the number of agents does not grow with the size of the inventory, and
//              no prompt carries the file list — listing is the session's job
//   verify     both judgement calls read the same check record; a missing record is
//              refused before any agent; a reviewer that returns nothing is "no
//              verdict", not a failure of the run
// The arithmetic the old scripts carried (destinations, plan screening, the gate) now
// lives in plugins/nextjs-clean-skills/bin/migration.mjs and is unit-tested directly by
// scripts/validate-migration-lib.mjs.

import * as acorn from 'acorn'
import { fail, listFiles, readText } from './_lib.mjs'

// Every node in the tree, in no particular order. acorn ships no walker of its own in
// the base package, and the forbidden-syntax check below only needs "visit everything".
function* walk(node) {
  if (!node || typeof node.type !== 'string') return
  yield node
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue
    const value = node[key]
    if (Array.isArray(value)) for (const child of value) yield* walk(child)
    else if (value && typeof value === 'object') yield* walk(value)
  }
}

const DIR = 'plugins/nextjs-clean-skills/workflows'
const errors = []
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const HOOKS = ['args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow']

const check = (ok, message) => {
  if (!ok) errors.push(message)
}

// These files are almost entirely agent prompts assembled from template literals, so `${…}` in a
// quote that does not interpolate ships the placeholder text to the agent verbatim. That is the
// failure the baseline workflow's own comment names: an agent handed a path that does not exist
// proceeds from memory instead of from the contract. Nothing else would catch it — the string is
// valid JavaScript and the prompt still reads plausibly.
function deadPlaceholders(source) {
  const found = []
  const lines = source.split('\n')
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n]
    let quote = null
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i]
      if (quote) {
        if (c === '\\') { i += 1; continue }
        if (c === quote) { quote = null; continue }
        if (quote !== '`' && c === '$' && line[i + 1] === '{') found.push(n + 1)
        continue
      }
      if (c === "'" || c === '"' || c === '`') quote = c
      else if (c === '/' && line[i + 1] === '/') break
    }
  }
  return [...new Set(found)]
}

// Through _lib, like every sibling validator: it resolves against `root` so a check
// cannot quietly look at the wrong directory.
const files = listFiles(DIR, f => f.endsWith('.js')).map(f => f.split('/').pop()).sort()
check(files.length > 0, 'no workflow scripts found under plugins/nextjs-clean-skills/workflows/')

function metaOf(source, file) {
  const marker = 'export const meta = '
  // startsWith, not indexOf: the contract says the script must BEGIN with meta, and
  // an indexOf search accepted anything before it while the message claimed otherwise.
  const start = source.startsWith(marker) ? 0 : -1
  if (start === -1) {
    errors.push(`${file}: must begin with \`export const meta = {...}\` — nothing may precede it`)
    return null
  }
  const end = source.indexOf('\n}\n', start)
  if (end === -1) {
    errors.push(`${file}: could not find the end of the meta literal`)
    return null
  }
  const expr = source.slice(start + marker.length, end + 2)
  try {
    // No bindings in scope: a variable reference, call or spread throws here, which
    // is exactly what "meta must be a pure literal" means.
    return new Function(`return (${expr})`)()
  } catch (error) {
    errors.push(`${file}: meta is not a pure literal — ${error.message}`)
    return null
  }
}

for (const file of files) {
  const source = readText(`${DIR}/${file}`)

  try {
    new AsyncFunction(...HOOKS, source.replace(/^export const meta = /m, 'const meta = '))
  } catch (error) {
    errors.push(`${file}: does not parse as an async-function body — ${error.message}`)
  }

  // Parsed the way the runtime runs it: an async-function body, so top-level `return`
  // and `await` are legal and `export` is not. Same `meta` rewrite the AsyncFunction
  // check above uses, and it stays on line 1, so reported line numbers still match the
  // file.
  let parsed = null
  try {
    parsed = acorn.parse(source.replace(/^export const meta = /m, 'const meta = '), {
      ecmaVersion: 'latest',
      locations: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    })
  } catch {
    parsed = null
  }

  const dead = deadPlaceholders(source)
  check(
    dead.length === 0,
    `${file}: \${...} inside a non-interpolating quote on line(s) ${dead.join(', ')} — the placeholder reaches the agent as literal text`
  )

  const meta = metaOf(source, file)
  if (meta) {
    check(typeof meta.name === 'string' && meta.name.length > 0, `${file}: meta.name is required`)
    check(typeof meta.description === 'string' && meta.description.length > 0, `${file}: meta.description is required`)
    check(meta.name === file.replace(/\.js$/, ''), `${file}: meta.name "${meta.name}" should match the filename`)

    const declared = new Set((meta.phases || []).map(p => p.title))
    const used = new Set()
    for (const m of source.matchAll(/\bphase\('([^']+)'\)/g)) used.add(m[1])
    for (const m of source.matchAll(/\bphase: '([^']+)'/g)) used.add(m[1])
    for (const title of used) {
      check(declared.has(title), `${file}: phase "${title}" is used but not declared in meta.phases`)
    }
    for (const title of declared) {
      check(used.has(title), `${file}: meta.phases declares "${title}" but nothing uses it`)
    }
  }

  // Walked over the parsed AST, not line by line. The line-scoped regexes this
  // replaced matched one exact spelling each, so anything the parser accepts and the
  // pattern does not slipped through while the check still reported green: a
  // dead-branch `await import('node:fs')` and a `new\n  Date()` split across two lines
  // both passed. A syntax rule has to be judged by the syntax tree.
  //
  // Comments carry no nodes, so a mention inside a comment explaining the rule still
  // does not trip it — the property the line-scoped version needed stripLineComment for.
  // Without this the forbidden-syntax check below would walk an empty tree and report
  // green — the shape of vacuity this file exists to prevent.
  check(parsed !== null, `${file}: could not be parsed as a module, so the forbidden-syntax check inspected nothing`)

  for (const node of walk(parsed)) {
    const where = `${file}:${node.loc.start.line}`
    if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression') {
      errors.push(`${where}: scripts cannot import — no imports, no dynamic import()`)
      continue
    }
    const callee = node.type === 'CallExpression' || node.type === 'NewExpression' ? node.callee : null
    if (!callee) continue
    const named = (object, property) =>
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object.type === 'Identifier' && callee.object.name === object &&
      callee.property.type === 'Identifier' && callee.property.name === property
    if (callee.type === 'Identifier' && callee.name === 'require') {
      errors.push(`${where}: scripts cannot import — no imports or require()`)
    }
    if (named('Date', 'now')) errors.push(`${where}: Date.now() throws at runtime (it would break resume)`)
    if (named('Math', 'random')) errors.push(`${where}: Math.random() throws at runtime (it would break resume)`)
    if (node.type === 'NewExpression' && callee.type === 'Identifier' && callee.name === 'Date' && node.arguments.length === 0) {
      errors.push(`${where}: argless new Date() throws at runtime (it would break resume)`)
    }
  }
  // No TypeScript-annotation check: the parse above already rejects TS (it does not
  // parse as JS), so a regex added nothing and false-positived on legal JS such as
  // `f(a ? b : number)`.
}

// ─── Whole-body execution with stub hooks ───
// `agent()` returns a minimal object satisfying the schema it was handed; `overrides`
// replaces the result for a given label (a function answers per call).
function stubValue(schema) {
  if (!schema || typeof schema !== 'object') return 'x'
  if (schema.enum) return schema.enum[0]
  switch (schema.type) {
    case 'array': return []
    case 'integer': case 'number': return 0
    case 'boolean': return true
    case 'object': {
      const out = {}
      for (const key of schema.required || []) out[key] = stubValue((schema.properties || {})[key])
      return out
    }
    default: return 'x'
  }
}

async function runBody(source, { args: argv, overrides = {} } = {}) {
  const calls = []
  const prompts = []
  const hooks = {
    args: argv,
    budget: { total: null, spent: () => 0, remaining: () => Infinity },
    agent: async (prompt, opts = {}) => {
      calls.push(opts.label)
      prompts.push({ label: opts.label, prompt: String(prompt), schema: opts.schema })
      if (Object.prototype.hasOwnProperty.call(overrides, opts.label)) {
        const answer = overrides[opts.label]
        return typeof answer === 'function' ? answer(calls.filter(c => c === opts.label).length - 1) : answer
      }
      return stubValue(opts.schema)
    },
    parallel: thunks => Promise.all(thunks.map(t => t().catch(() => null))),
    pipeline: async (items, ...stages) => {
      const out = []
      for (let i = 0; i < items.length; i += 1) {
        let value = items[i]
        for (const stage of stages) value = await stage(value, items[i], i)
        out.push(value)
      }
      return out
    },
    phase: () => {},
    log: () => {},
    workflow: async () => null,
  }
  const body = source.replace(/^export const meta = /m, 'const meta = ')
  const fn = new AsyncFunction(...HOOKS, body)
  const result = await fn(...HOOKS.map(h => hooks[h]))
  return { result, calls, prompts }
}

const REPO = '/tmp/target'
const SRC = '/tmp/plugin-root'

// ─── inventory.js: agents bounded, file list never in a prompt ───
const INVENTORY = 'inventory.js'
check(files.includes(INVENTORY), `${INVENTORY} not found — its scenarios were skipped`)
if (files.includes(INVENTORY)) {
  const source = readText(`${DIR}/${INVENTORY}`)
  // The script has no filesystem, so the only way a file list could reach an agent is through
  // args. Hand it one — small and large — and assert it neither changes the agent count nor
  // appears in any prompt.
  const listOf = (n) => Array.from({ length: n }, (_, i) => `src/features/f${i}.ts`)
  const small = await runBody(source, { args: { repo: REPO, inventoryPath: `${REPO}/.nextjs-clean-migration/inventory.json`, contractSource: SRC, files: listOf(10), count: 10 } })
  const large = await runBody(source, { args: { repo: REPO, inventoryPath: `${REPO}/.nextjs-clean-migration/inventory.json`, contractSource: SRC, files: listOf(3000), count: 3000 } })
  check(small.calls.length > 0 && small.calls.length <= 6, `${INVENTORY}: expected 1–6 lens agents, got ${small.calls.length}`)
  check(small.calls.length === large.calls.length, `${INVENTORY}: agent count must not depend on inventory size (10 → ${small.calls.length}, 3000 → ${large.calls.length})`)
  check(large.prompts.every(p => !p.prompt.includes('src/features/f2999.ts') && !p.prompt.includes('src/features/f0.ts')), `${INVENTORY}: a file list handed in args must not be forwarded to any agent`)
  check(small.calls.every(l => typeof l === 'string' && l.startsWith('lens:')), `${INVENTORY}: every agent is a lens, got ${JSON.stringify(small.calls)}`)
  check(small.prompts.every(p => p.prompt.includes(`${REPO}/.nextjs-clean-migration/inventory.json`)), `${INVENTORY}: every lens prompt must name the inventory file`)
  check(small.prompts.every(p => !/enumerate|list the tree|partition/i.test(p.prompt.replace(/Do NOT list the tree yourself/g, ''))), `${INVENTORY}: no prompt may ask an agent to enumerate or partition the tree`)
  check(small.result && small.result.agents === small.calls.length && small.result.lenses, `${INVENTORY}: result must report lenses and the agent count`)

  const noPath = await runBody(source, { args: { repo: REPO, contractSource: SRC } })
  check(noPath.calls.length === 0 && noPath.result && typeof noPath.result.error === 'string', `${INVENTORY}: a missing inventoryPath must be refused before any agent`)
  const noSrc = await runBody(source, { args: { repo: REPO, inventoryPath: '/x/inventory.json' } })
  check(noSrc.calls.length === 0 && noSrc.result && /contractSource/.test(noSrc.result.error || ''), `${INVENTORY}: a missing contractSource must be refused before any agent`)
  const subset = await runBody(source, { args: { repo: REPO, inventoryPath: '/x/inventory.json', contractSource: SRC, lenses: ['deps', 'roots'] } })
  check(subset.calls.length === 2, `${INVENTORY}: args.lenses selects a subset, got ${subset.calls.length}`)
  const silent = await runBody(source, { args: { repo: REPO, inventoryPath: '/x/inventory.json', contractSource: SRC, lenses: ['deps', 'roots'] }, overrides: { 'lens:deps': null } })
  check(silent.result && silent.result.silent && silent.result.silent.includes('deps') && silent.result.lenses.roots, `${INVENTORY}: a silent lens is reported by name, the others still returned`)
}

// ─── verify.js: one record, two readers ───
const VERIFY = 'verify.js'
check(files.includes(VERIFY), `${VERIFY} not found — its scenarios were skipped`)
if (files.includes(VERIFY)) {
  const source = readText(`${DIR}/${VERIFY}`)
  const recordA = `${REPO}/.nextjs-clean-migration/records/2026-09-10-check-abc123.json`
  const recordB = `${REPO}/.nextjs-clean-migration/records/2026-09-10-check-def456.json`
  const base = { repo: REPO, capability: 'work-items', diffBase: 'abc1234', contractSource: SRC }

  const full = await runBody(source, { args: { ...base, recordPath: recordA, ordinaryChange: 'add a field', baselineRadius: '7 files' } })
  check(full.calls.length === 2 && full.calls.includes('review') && full.calls.includes('radius'), `${VERIFY}: review and radius run, nothing else; got ${JSON.stringify(full.calls)}`)
  check(full.prompts.every(p => p.prompt.includes(recordA)), `${VERIFY}: both readers must be handed the same record path`)
  check(full.prompts.every(p => !/bun run|npm run|npx |eslint |tsc /.test(p.prompt.replace(/Do NOT run those commands yourself/g, ''))), `${VERIFY}: no prompt may tell an agent to run the heavy check`)
  const other = await runBody(source, { args: { ...base, recordPath: recordB, ordinaryChange: 'add a field' } })
  check(other.prompts.every(p => p.prompt.includes(recordB) && !p.prompt.includes(recordA)), `${VERIFY}: a different record reaches both readers and the old one reaches neither`)

  const noRadius = await runBody(source, { args: { ...base, recordPath: recordA } })
  check(noRadius.calls.length === 1 && noRadius.calls[0] === 'review' && noRadius.result.radius === null, `${VERIFY}: without ordinaryChange only the review runs and radius is null, not guessed`)

  const stale = await runBody(source, { args: { ...base } })
  check(stale.calls.length === 0 && stale.result && /recordPath/.test(stale.result.error || ''), `${VERIFY}: a missing record is refused before any agent`)
  const badCap = await runBody(source, { args: { ...base, capability: 'Work_Items', recordPath: recordA } })
  check(badCap.calls.length === 0 && badCap.result && typeof badCap.result.error === 'string', `${VERIFY}: a non-kebab capability is refused`)

  const dead = await runBody(source, { args: { ...base, recordPath: recordA, ordinaryChange: 'x' }, overrides: { review: null } })
  check(dead.result && dead.result.review === null && dead.result.noVerdict.includes('review') && !dead.result.error, `${VERIFY}: a reviewer that returns nothing is "no verdict", not an error of the run`)
  check(dead.result.radius && dead.result.radius.direction, `${VERIFY}: the other reader's answer survives a dead reviewer`)
  const exhausted = await runBody(source, { args: { ...base, recordPath: recordA }, overrides: { review: { verdict: 'sound', findings: [], recordId: 'r', budgetExhausted: true } } })
  check(exhausted.result.review === null && exhausted.result.noVerdict.includes('review') && exhausted.result.partialReview && exhausted.result.partialReview.verdict === 'sound', `${VERIFY}: an exhausted reviewer yields no verdict; its partial findings are kept, its "sound" is not`)
  check(exhausted.prompts[0].schema.required.includes('budgetExhausted'), `${VERIFY}: the reviewer must declare budget exhaustion in its structured output`)
}

fail(errors)
console.log(`workflow contract ok (${files.length} scripts: parse, pure meta, phase parity, forbidden globals; inventory bounded and list-free; verify reads one record)`)
