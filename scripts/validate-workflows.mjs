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
// Plus two layers over the pilot's safety logic, because either alone is a blind spot:
//   tables      destination(), the plan-screening region and the decision functions are
//               extracted from the script text and EXECUTED — they prove the logic is
//               correct. Anchored on section banners, not on identifiers.
//   call sites  the whole body is run against stubbed hooks — this proves the logic is
//               CALLED. Table tests alone stayed green when a guard's `if` was replaced
//               with `if (false)`; the greps they replaced stayed green on a rename.
// The workflow files remain the single source of truth for both.

import * as acorn from 'acorn'
import { fail, listFiles, readJson, readText } from './_lib.mjs'

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

// Read from the contract, never a second copy. scripts/validate-capability-pilots.mjs
// already sets this precedent, and CHANGELOG records the same fix once before:
// "Derived capability-pilot surfaces … instead of maintaining a second silent copy."
const CONTRACT = readJson('rules/architecture-contract.json')
const SEGMENTS = CONTRACT.segments
const SURFACES = CONTRACT.publicSurfaces

const DIR = 'plugins/nextjs-clean-skills/workflows'
const errors = []
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const HOOKS = ['args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow']

// Walks the line tracking quote state so `https://…` inside a string does not read as
// the start of a comment.
function stripLineComment(line) {
  let quote = null
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quote) {
      if (c === '\\') { i += 1; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}

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
// The tables above prove the pure functions are CORRECT; nothing proved they are
// CALLED. Replacing the old source-text greps with table tests removed that tie, and
// mutation showed it: `if (moveIncomplete(internals))` -> `if (false)` and
// `recommendation(...)` -> a literal both left the suite green. Running the real body
// against stubbed hooks tests the call sites instead of the source text.
//
// `agent()` returns a minimal object satisfying the schema it was handed, so no
// per-call fixture is needed; `overrides` replaces the result for a given label.
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
  // Prompts as well as labels: a resolved path is only useful if it reaches the agents that read
  // from it, and "the resolution block ran" is not the same claim as "its result was used".
  const prompts = []
  const hooks = {
    args: argv,
    budget: { total: null, spent: () => 0, remaining: () => Infinity },
    agent: async (prompt, opts = {}) => {
      calls.push(opts.label)
      // The schema as the call site actually passes it. Asserting on a schema literal read out of
      // the source proves the literal; asserting on this one proves the agent was handed it.
      prompts.push({ label: opts.label, prompt: String(prompt), schema: opts.schema })
      if (Object.prototype.hasOwnProperty.call(overrides, opts.label)) {
        const answer = overrides[opts.label]
        // A function override answers per call, indexed from zero. A fixed value cannot express
        // the state a fix loop actually produces: a probe that reported on the first pass and then
        // died on the re-verify, leaving the tree edited and the oracle watching it gone.
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

// ─── destination(): admitted, closed, injective ───
const PILOT = 'migrate-capability.js'
// Assert the file is there. Every table below was opt-in on this name, so an
// ordinary rename deleted all of it silently while the success line kept claiming
// "destination table" — the repo's own declared failure mode, "a check that passes
// because it looked nowhere".
check(files.includes(PILOT), `${PILOT} not found — every table-driven check below was skipped`)
if (files.includes(PILOT)) {
  const source = readText(`${DIR}/${PILOT}`)
  // Anchored on the section comments, not on incidental identifiers: renaming a
  // helper once silently moved this window (the check failed loudly, which is the
  // right failure mode, but a stable anchor is better than a loud one).
  const from = source.indexOf('// ─── Destination paths are computed HERE ───')
  const to = source.indexOf('// ─── Plan ───')
  if (from === -1 || to === -1) {
    errors.push(`${PILOT}: could not extract destination() — the anchors this test relies on moved`)
  } else {
    const destination = new Function('MODULE_ROOT', 'CAP', 'SEGMENTS', 'SURFACES', `${source.slice(from, to)}; return destination`)(
      'src/modules', 'work-items', SEGMENTS, SURFACES
    )

    const accepted = [
      ['segment file', { file: 'src/lib/calc.ts', role: 'domain' }, 'src/modules/work-items/domain/calc.ts'],
      ['deep source', { file: 'src/a/b/c/store.ts', role: 'server' }, 'src/modules/work-items/server/store.ts'],
      ['rename', { file: 'src/x.ts', role: 'application', basename: 'project.ts' }, 'src/modules/work-items/application/project.ts'],
      ['surface', { file: 'src/api.ts', role: 'surface', surface: 'rsc' }, 'src/modules/work-items/rsc.ts'],
      ['hyphen surface', { file: 'src/k.ts', role: 'surface', surface: 'query-cache' }, 'src/modules/work-items/query-cache.ts'],
      // Legal: SAFE_BASENAME forbids '/', so dots cannot escape the directory and a
      // separate '..' test only rejected valid filenames.
      ['dots in name', { file: 'src/x.ts', role: 'domain', basename: 'work-item..fixture.ts' }, 'src/modules/work-items/domain/work-item..fixture.ts'],
    ]
    for (const [label, move, expected] of accepted) {
      const got = destination(move)
      check(got === expected, `destination(${label}): expected ${expected}, got ${got}`)
    }

    const refused = [
      ['stay', { file: 'src/app/p.tsx', role: 'stay' }],
      ['delete', { file: 'src/dead.ts', role: 'delete' }],
      ['invented role', { file: 'src/x.ts', role: 'infrastructure' }],
      ['invented surface', { file: 'src/x.ts', role: 'surface', surface: 'repository' }],
      ['surface with no name', { file: 'src/x.ts', role: 'surface' }],
      ['parent traversal', { file: 'src/x.ts', role: 'domain', basename: '../../../evil.ts' }],
      ['nested basename', { file: 'src/x.ts', role: 'domain', basename: 'nested/deep.ts' }],
      ['absolute basename', { file: 'src/x.ts', role: 'domain', basename: '/etc/passwd' }],
    ]
    for (const [label, move] of refused) {
      check(destination(move) === null, `destination(${label}): must be refused, got ${destination(move)}`)
    }

    // No separate "closure as a property" loop: it asserted on this file's own
    // `expected` literals, so it could not fail because of the script. Closure is
    // really covered by the traversal cases in `refused` above.

    // Injectivity is enforced over the plan, not inside destination(). Grepping for
    // the rejection message was vacuous: deleting the loop that POPULATES the
    // collision list left every string in place and the check still passed. So run
    // the real screening region instead — it returns a rejection object, or
    // undefined when it accepts the plan.
    // The region now runs to the Move banner so it covers surfacesToAuthor and the
    // three tables the mover is handed — previously it stopped at the `log(` call, so
    // the newest logic on the branch sat outside every extracted window and untested.
    // Both anchors are section banners, not incidental code.
    const planFrom = source.indexOf('// ─── Plan screening and table derivation ───')
    const planTo = source.indexOf('// ─── Move: internals')
    if (planFrom === -1 || planTo === -1) {
      errors.push(`${PILOT}: could not extract the plan-screening region — the anchors this test relies on moved`)
    } else {
      const screen = new Function(
        'plan', 'destination', 'SURFACES', 'SEGMENTS', 'MODULE_ROOT', 'CAP', 'log', 'FILES', 'CONSUMERS',
        `${source.slice(planFrom, planTo)}; return { moving, staying, deleting, usedSurfaces, surfacesToAuthor, MOVE_TABLE, SURFACE_TABLE, AUTHOR_TABLE }`
      )
      // FILES and CONSUMERS are the manifest inputs the region screens the plan against.
      // By default they are derived from the plan under test so the pre-existing tables,
      // which predate that screening, still describe well-formed plans; a case that wants
      // to exercise the partition rules passes its own.
      const run = (plan, files, consumers) => screen(
        plan, destination, SURFACES, SEGMENTS, 'src/modules', 'work-items', () => {},
        files || (plan.moves || []).map(mv => ({ file: mv.file })),
        consumers || [...new Set((plan.surfaces || []).flatMap(s => s.consumers || []))]
      )

      const collidingBasenames = {
        moves: [
          { file: 'src/a/util.ts', role: 'domain' },
          { file: 'src/b/util.ts', role: 'domain' },
        ],
        surfaces: [],
      }
      const collidingSurfaces = {
        moves: [
          { file: 'src/x.ts', role: 'surface', surface: 'server' },
          { file: 'src/y.ts', role: 'surface', surface: 'server' },
        ],
        surfaces: [{ surface: 'server', consumers: ['src/app/p.tsx'], exports: ['read'] }],
      }
      const duplicateSurface = {
        moves: [{ file: 'src/a/calc.ts', role: 'domain' }],
        surfaces: [
          { surface: 'server', consumers: ['src/app/a.tsx'], exports: ['read'] },
          { surface: 'server', consumers: ['src/app/b.tsx'], exports: ['write'] },
        ],
      }
      const inventedSurface = {
        moves: [{ file: 'src/x.ts', role: 'domain' }],
        surfaces: [{ surface: 'repository', consumers: ['src/app/p.tsx'], exports: ['find'] }],
      }
      const clean = {
        moves: [
          { file: 'src/a/calc.ts', role: 'domain' },
          { file: 'src/b/store.ts', role: 'server' },
          { file: 'src/api.ts', role: 'surface', surface: 'rsc' },
        ],
        surfaces: [{ surface: 'rsc', consumers: ['src/app/p.tsx'], exports: ['read'] }],
      }

      const rejects = [
        ['two sources, same basename', collidingBasenames],
        ['two sources, same surface', collidingSurfaces],
        ['surface outside the vocabulary', inventedSurface],
        ['one surface declared twice with conflicting contracts', duplicateSurface],
        ['basename traversal', { moves: [{ file: 'src/x.ts', role: 'domain', basename: '../../evil.ts' }], surfaces: [] }],
      ]
      for (const [label, plan] of rejects) {
        const verdict = run(plan)
        check(
          verdict && typeof verdict.error === 'string',
          `plan screening (${label}): must reject before any write, got ${JSON.stringify(verdict)}`
        )
      }
      const ok = run(clean)
      check(ok && !ok.error, `plan screening (clean plan): must be accepted, got ${JSON.stringify(ok)}`)

      // A surface with consumers but no move must be AUTHORED. Announcing it to the
      // consumer agent while nothing creates it is what made "the surfaces that now
      // exist" a lie. This logic sat outside every extracted region until now.
      const authored = run({
        moves: [{ file: 'src/a/calc.ts', role: 'domain' }],
        surfaces: [{ surface: 'rsc', consumers: ['src/app/p.tsx'], exports: ['read'] }],
      })
      check(
        authored && authored.surfacesToAuthor.length === 1 && authored.AUTHOR_TABLE.includes('src/modules/work-items/rsc.ts'),
        `plan screening: a consumed surface with no move must be authored, got ${JSON.stringify(authored && authored.surfacesToAuthor)}`
      )
      const alreadyMoved = run({
        moves: [{ file: 'src/api.ts', role: 'surface', surface: 'rsc' }],
        surfaces: [{ surface: 'rsc', consumers: ['src/app/p.tsx'], exports: ['read'] }],
      })
      check(
        alreadyMoved && alreadyMoved.surfacesToAuthor.length === 0,
        'plan screening: a surface that already has a move must not be authored twice'
      )

      // A move dropped for having an unconsumed surface must still be NAMED to the
      // mover, or its file is stranded at an old path importing modules that moved.
      const dropped = run({
        moves: [{ file: 'src/a/calc.ts', role: 'domain' }, { file: 'src/lib/wi-client.ts', role: 'surface', surface: 'client' }],
        surfaces: [{ surface: 'client', consumers: [], exports: [] }],
      })
      check(
        dropped && dropped.staying.some(r => r.file === 'src/lib/wi-client.ts'),
        'plan screening: a move dropped for an unconsumed surface must appear in the leave-in-place list'
      )

      // ─── a consumer is a file, not a plausible string ───
      // The two admission rules this replaces were prefix tests, and a prefix test admits strings.
      // Anything under the capability directory passed, and so did any path deep enough under a
      // recorded app folder — so an invented consumer kept a surface alive and the mover authored
      // a public surface no code imports. `run()` derives CONSUMERS from the plan by default, so
      // each case below passes its own recorded list and assigned files.
      const FILES_IN = [{ file: 'src/lib/calc.ts' }, { file: 'src/lib/keys.ts' }]
      const RECORDED = ['src/app/(app)/work-items/page.tsx']
      const withConsumer = c => ({
        moves: [{ file: 'src/lib/calc.ts', role: 'domain' }, { file: 'src/lib/keys.ts', role: 'client' }],
        surfaces: [{ surface: 'query-cache', consumers: [c], exports: ['workItemKeys'] }],
      })
      const fabricated = [
        ['a non-existent file under the capability root', 'src/modules/work-items/client/does-not-exist.ts'],
        ['an invented path deep under a recorded app directory', 'src/app/(app)/work-items/_invented/hook.ts'],
        ['a plausible path that is neither recorded nor assigned', 'src/features/work-items/api.ts'],
      ]
      for (const [label, consumer] of fabricated) {
        const verdict = run(withConsumer(consumer), FILES_IN, RECORDED)
        check(
          verdict && typeof verdict.error === 'string' && (verdict.strayConsumers || []).length === 1,
          `plan screening (${label}): a surface must not be authored for a consumer nothing shows to exist, got ${JSON.stringify(verdict && verdict.error)}`
        )
      }
      // Controls: the three things that ARE real must still be admitted, or the guard is just a ban
      // on internal consumers — and query-cache exists precisely to have them.
      const admitted = [
        ['a recorded consumer', RECORDED[0]],
        ['a file the manifest assigned to this capability', 'src/lib/keys.ts'],
        ['a destination this script computed', 'src/modules/work-items/client/keys.ts'],
      ]
      for (const [label, consumer] of admitted) {
        const verdict = run(withConsumer(consumer), FILES_IN, RECORDED)
        check(
          verdict && !verdict.error,
          `plan screening (${label}): must be admitted as a consumer, got ${JSON.stringify(verdict && verdict.strayConsumers)}`
        )
      }

      // ─── a declared channel change is rejected, not quietly dropped ───
      // The old filter discarded a malformed entry, so a planner that reported a transport change
      // with one blank field produced a gate that said nothing about it — the report ate the
      // warning. A blank `behaviourRisk` passes the schema, because "" is a string.
      const withChannel = ch => ({ ...clean, channelChanges: [ch] })
      const badChannels = [
        ['blank behaviourRisk', { what: 'browser list read', from: 'Server Action', to: 'GET route handler', behaviourRisk: '   ' }],
        ['missing behaviourRisk', { what: 'browser list read', from: 'Server Action', to: 'GET route handler' }],
        ['missing to', { what: 'browser list read', from: 'Server Action', behaviourRisk: 'retryable 5xx per attempt' }],
      ]
      for (const [label, ch] of badChannels) {
        const verdict = run(withChannel(ch), (clean.moves || []).map(mv => ({ file: mv.file })), ['src/app/p.tsx'])
        check(
          verdict && typeof verdict.error === 'string' && (verdict.malformedChannels || []).length === 1,
          `plan screening (channel with ${label}): must be rejected, not silently dropped, got ${JSON.stringify(verdict && verdict.error)}`
        )
      }
      const goodChannel = run(
        withChannel({ what: 'browser list read', from: 'Server Action', to: 'GET route handler', behaviourRisk: 'retryable 5xx now reported per attempt' }),
        (clean.moves || []).map(mv => ({ file: mv.file })), ['src/app/p.tsx']
      )
      check(goodChannel && !goodChannel.error, `plan screening (well-formed channel change): must be accepted, got ${JSON.stringify(goodChannel && goodChannel.error)}`)
    }
  }

  // ─── moveIncomplete() and recommendation(), EXECUTED ───
  // These were grep proxies, and mutation proved them anti-correlated with the
  // invariants: gutting a guard's body while leaving its `if` line verbatim passed,
  // while a behaviour-preserving rename failed. The decision logic in the pilot is
  // pure precisely so it can be run here instead.
  const logicFrom = source.indexOf('// ─── Pure decision logic ───')
  const logicTo = source.indexOf('async function verifyAll()')
  if (logicFrom === -1 || logicTo === -1) {
    errors.push(`${PILOT}: could not extract the pure decision logic — the anchors this test relies on moved`)
  } else {
    const logic = new Function(`${source.slice(logicFrom, logicTo)}; return { moveIncomplete, archUnmeasured, archRed, recommendation }`)()
    const { moveIncomplete, archUnmeasured, archRed, recommendation } = logic

    const incomplete = [
      ['null step', null],
      ['ok=false', { ok: false, filesTouched: ['a.ts'], detail: '' }],
      ['no files touched', { ok: true, filesTouched: [], detail: '' }],
      ['filesTouched absent', { ok: true, detail: '' }],
    ]
    for (const [label, step] of incomplete) {
      check(moveIncomplete(step) === true, `moveIncomplete(${label}): must stop before Verify, got false`)
    }
    check(moveIncomplete({ ok: true, filesTouched: ['a.ts'], detail: '' }) === false, 'moveIncomplete(real move): must proceed')

    const census = { crossCapabilityInternal: 4, domainDirection: 2 }
    const archCases = [
      ['absent', undefined, true],
      ['not measured (ok=false)', { ok: false, counts: { capability: 0 } }, true],
      ['empty counts', { ok: true, counts: {} }, true],
      ['capability still dirty', { ok: true, counts: { capability: 3, crossCapabilityInternal: 1, domainDirection: 0 } }, true],
      ['capability undefined', { ok: true, counts: { crossCapabilityInternal: 1 } }, true],
      ['regression elsewhere', { ok: true, counts: { capability: 0, crossCapabilityInternal: 0, domainDirection: 3 } }, true],
      ['clean and improved', { ok: true, counts: { capability: 0, crossCapabilityInternal: 1, domainDirection: 0 } }, false],
      ['new messageId appears', { ok: true, counts: { capability: 0, crossCapabilityInternal: 0, domainDirection: 0, serverClient: 1 } }, true],
    ]
    // archRed returns the REASON it is red ('' when green), so the gate and the report
    // cannot disagree about why. Assert truthiness, and that a red answer explains itself.
    for (const [label, a, expected] of archCases) {
      const reason = archRed(a, census, new Set())
      check(!!reason === expected, `archRed(${label}): expected red=${expected}, got ${JSON.stringify(reason)}`)
      if (expected) check(typeof reason === 'string' && reason.length > 0, `archRed(${label}): a red verdict must name its reason`)
    }
    // A baseline censused before any file moved measured nothing: moduleRoot did not exist,
    // so every capability-tier rule reported zero for want of anything to classify. Compared
    // against that vacuum, the first correct pilot looks like a repo-wide regression.
    check(
      archRed(
        { ok: true, counts: { capability: 0, crossCapabilityInternal: 9, domainDirection: 0 } },
        { crossCapabilityInternal: 0, domainDirection: 0 },
        new Set(['crossCapabilityInternal', 'domainDirection'])
      ) === '',
      'archRed(named vacuous counter): a counter whose baseline zero meant "nothing to classify" cannot be regressed against'
    )
    // The waiver is per counter. Waiving the whole arm also waived counters that measured the
    // repository as it already was — unresolved imports, database ownership, pre-existing debt —
    // and a migration can genuinely regress those. Executing the gate with them newly non-zero
    // returned `accept`.
    check(
      archRed(
        { ok: true, counts: { capability: 0, crossCapabilityInternal: 0, domainDirection: 0, 'import/no-unresolved': 4 } },
        { crossCapabilityInternal: 0, domainDirection: 0, 'import/no-unresolved': 0 },
        new Set(['crossCapabilityInternal', 'domainDirection'])
      ) !== '',
      'archRed(counter outside the vacuous set): a real regression must not be waived with the vacuous ones'
    )
    // The capability's own arm never depended on the baseline.
    check(
      archRed({ ok: true, counts: { capability: 3, crossCapabilityInternal: 0, domainDirection: 0 } }, { crossCapabilityInternal: 0, domainDirection: 0 }, new Set(['crossCapabilityInternal'])) !== '',
      'archRed(vacuous baseline, capability dirty): the capability arm must not be waived with the regression arm'
    )
    check(archUnmeasured(undefined) === true, 'archUnmeasured(absent): must be unmeasured')
    check(archUnmeasured({ ok: false, counts: { capability: 0 } }) === true, 'archUnmeasured(ok=false): a tool that could not run is unmeasured, not clean')
    check(archUnmeasured({ ok: true, counts: { capability: 0 } }) === false, 'archUnmeasured(measured): must be measured')
    check(archUnmeasured({ ok: true, counts: { crossCapabilityInternal: 1 } }) === true, 'archUnmeasured(no capability counter): the burndown counter is the measurement')
    check(archUnmeasured({ ok: true, counts: { capability: 0 } }, { serverClient: 2 }) === true, 'archUnmeasured(baseline counter missing): absent is not zero')

    // Carries every census counter: a result that omits one cannot be compared against
    // its baseline, so the decision function now calls that unmeasured rather than clean.
    const green = { ok: true, counts: { capability: 0, crossCapabilityInternal: 1, domainDirection: 0 } }
    const gateCases = [
      ['behaviour agent died', { behaviour: null, architecture: green, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['review agent died', { behaviour: { ok: true }, architecture: green, review: null }, 'inconclusive'],
      ['architecture agent died', { behaviour: { ok: true }, architecture: null, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['behaviour red', { behaviour: { ok: false }, architecture: green, review: { verdict: 'sound', findings: [] } }, 'revise'],
      // "could not run" is not "found violations": it is silence, and silence is
      // never a verdict. This row previously hardcoded 'revise' and pinned the bug.
      ['architecture could not run', { behaviour: { ok: true }, architecture: { ok: false, counts: { capability: 0, crossCapabilityInternal: 1, domainDirection: 0 } }, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      // `ok` now means only "the tools ran". A red measurement must reach the human as
      // red, not as silence: reported as `inconclusive` it read as "we do not know".
      ['architecture measured and red', { behaviour: { ok: true }, architecture: { ok: true, counts: { capability: 5, crossCapabilityInternal: 1, domainDirection: 0 } }, review: { verdict: 'sound', findings: [] } }, 'revise'],
      // A counter present at baseline and absent now is not a counter at zero.
      ['architecture dropped a baseline counter', { behaviour: { ok: true }, architecture: { ok: true, counts: { capability: 0, crossCapabilityInternal: 1 } }, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['architecture reported nothing', { behaviour: { ok: true }, architecture: { ok: true, counts: {} }, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['review rejects', { behaviour: { ok: true }, architecture: green, review: { verdict: 'reject', findings: [] } }, 'reject'],
      // reject must DOMINATE. It sat after the behaviour and architecture branches, so
      // the one verdict meaning "abandon this ownership model" was downgraded to
      // `revise` in exactly the states where it is most likely correct.
      ['reject with behaviour red', { behaviour: { ok: false }, architecture: green, review: { verdict: 'reject', findings: [] } }, 'reject'],
      ['reject with architecture red', { behaviour: { ok: true }, architecture: { ok: true, counts: { capability: 4, crossCapabilityInternal: 1, domainDirection: 0 } }, review: { verdict: 'reject', findings: [] } }, 'reject'],
      ['reject with must-fix too', { behaviour: { ok: false }, architecture: { ok: true, counts: { capability: 2, crossCapabilityInternal: 1, domainDirection: 0 } }, review: { verdict: 'reject', findings: [{ severity: 'must-fix' }] } }, 'reject'],
      ['must-fix present', { behaviour: { ok: true }, architecture: green, review: { verdict: 'sound', findings: [{ severity: 'must-fix' }] } }, 'revise'],
      ['nits only', { behaviour: { ok: true }, architecture: green, review: { verdict: 'sound', findings: [{ severity: 'nit' }] } }, 'accept'],
      ['all green', { behaviour: { ok: true }, architecture: green, review: { verdict: 'sound', findings: [] } }, 'accept'],
    ]
    for (const [label, o, expected] of gateCases) {
      const decided = recommendation(o, census)
      check(decided.gate === expected, `recommendation(${label}): expected ${expected}, got ${decided.gate}`)
      // The report renders this instead of re-deriving the inputs and disagreeing.
      check(typeof decided.reason === 'string' && decided.reason.length > 0, `recommendation(${label}): must name its reason`)
    }
    // Silence is never a verdict — asserted over CONSTRUCTED inputs, not by filtering
    // the table on a label substring. That filter was a source-text grep in disguise:
    // renaming a label to anything not ending in "died" silently removed the coverage
    // and the suite stayed green.
    const sound = { verdict: 'sound', findings: [] }
    const silent = [
      ['behaviour', { behaviour: null, architecture: green, review: sound }],
      ['review', { behaviour: { ok: true }, architecture: green, review: null }],
      ['architecture', { behaviour: { ok: true }, architecture: null, review: sound }],
      ['all three', { behaviour: null, architecture: null, review: null }],
    ]
    for (const [label, o] of silent) {
      const decided = recommendation(o, census)
      check(decided.gate === 'inconclusive', `silence(${label}): expected inconclusive, got ${decided.gate}`)
      check(decided.unmeasured.length > 0, `silence(${label}): must name which oracle did not report`)
    }
  }
}

// ─── Call sites, exercised ───
const BASELINE = 'prepare-architecture-migration.js'
if (files.includes(PILOT) && files.includes(BASELINE)) {
  const pilotSrc = readText(`${DIR}/${PILOT}`)
  const baseSrc = readText(`${DIR}/${BASELINE}`)

  // Phase 1's required-args gate has never had a test of any kind.
  for (const [label, argv] of [
    ['no args', {}],
    ['repo only', { repo: '/t' }],
    ['no ordinaryChange', { repo: '/t', contractSource: '/s' }],
  ]) {
    const { result } = await runBody(baseSrc, { args: argv })
    check(result && typeof result.error === 'string', `${BASELINE} (${label}): must refuse before spending an agent, got ${JSON.stringify(result)}`)
  }

  // ─── args may arrive as a JSON string ───
  // Some invocation paths serialise `args` before the script sees it. Every field then
  // read as undefined and the run died with "args.repo is required" while pointing at a
  // request that supplied it — the error blamed the caller for the one thing they got right.
  {
    const asObject = { repo: '/t', ordinaryChange: 'add a field' }
    const asString = JSON.stringify(asObject)
    const withSrc = { 'resolve:contract-source': { ok: true, path: '/p', detail: '' } }
    const fromString = await runBody(baseSrc, { args: asString, overrides: withSrc })
    check(
      !(fromString.result && /args\.repo is required/.test(fromString.result.error || '')),
      `${BASELINE} (args as a JSON string): must parse it, not report the supplied repo as missing`
    )
    check(fromString.calls.length > 0, `${BASELINE} (args as a JSON string): no agent ran, so the run did not start`)
    // Malformed input must still fail, and say what is wrong with it.
    const broken = await runBody(baseSrc, { args: '{not json', overrides: withSrc })
    check(
      broken.result && /not valid JSON/.test(broken.result.error || ''),
      `${BASELINE} (args as a broken string): must name the real problem, got ${JSON.stringify(broken.result)}`
    )
    // Phase 2 takes the same path.
    const pilotFromString = await runBody(pilotSrc, { args: JSON.stringify({ repo: '/t', capability: 'work-items' }) })
    check(
      !(pilotFromString.result && /both required/.test(pilotFromString.result.error || '')),
      `${PILOT} (args as a JSON string): must parse it, got ${JSON.stringify(pilotFromString.result && pilotFromString.result.error)}`
    )
  }

  // ─── human decisions on undecided dependencies ───
  // Refusing to guess only helps if the answer has somewhere to go. Without this argument
  // the first live run's stop was a dead end: the operator's only route forward was to
  // hand-edit the target's contract, which is the guess the stop existed to prevent.
  {
    const ARGSD = { repo: '/t', ordinaryChange: 'add a field' }
    const withSrc = { 'resolve:contract-source': { ok: true, path: '/p', detail: '' } }
    const assigned = {
      capabilities: [{ name: 'work-items' }],
      assignments: [{ file: 'src/a.ts', capability: 'work-items' }],
      unassigned: [],
      deps: { pure: [], runtime: [], undecided: ['dayjs'] },
    }
    const over = { ...withSrc, assign: assigned }

    // Refused BEFORE the first write, not reported afterwards. Everything past phase('Enable') mutates
    // the target, so a blocker in the final report meant a half-converted repository and a message.
    const stillOpen = await runBody(baseSrc, { args: ARGSD, overrides: over })
    check(
      stillOpen.result && /must be classified before anything is written/.test(stillOpen.result.error || ''),
      `${BASELINE} (undecided, no decision): must refuse before writing, got ${JSON.stringify(stillOpen.result && (stillOpen.result.error || stillOpen.result.blockers))}`
    )
    check(
      !stillOpen.calls.includes('enable-rules'),
      `${BASELINE} (undecided, no decision): the installer ran anyway — the target was mutated before the refusal`
    )
    check(
      /dependencyDecisions/.test((stillOpen.result && stillOpen.result.fix) || ''),
      `${BASELINE} (undecided, no decision): the refusal must carry the way to answer it`
    )

    const decided = await runBody(baseSrc, {
      args: { ...ARGSD, dependencyDecisions: { dayjs: 'runtime' } },
      overrides: over,
    })
    check(
      !((decided.result && (decided.result.blockers || [])).some(b => /undecided/.test(b))),
      `${BASELINE} (decision supplied): must clear the blocker. blockers=${JSON.stringify(decided.result && decided.result.blockers)}`
    )
    // The decision has to reach the agent that writes the contract, not just the blocker list.
    check(
      decided.prompts.some(p => p.label === 'enable-rules' && /runtime:[^\n]*dayjs/.test(p.prompt)),
      `${BASELINE} (decision supplied): dayjs never reached the install prompt as a runtime package`
    )
    // And it must be recorded, so a later reader can tell an inference from a ruling.
    check(
      decided.result && (decided.result.dependencyDecisions || []).some(d => d.package === 'dayjs' && d.side === 'runtime'),
      `${BASELINE} (decision supplied): the manifest does not record who decided it`
    )

    const badSide = await runBody(baseSrc, { args: { ...ARGSD, dependencyDecisions: { dayjs: 'maybe' } }, overrides: over })
    check(
      badSide.result && /must be "pure" or "runtime"/.test(badSide.result.error || ''),
      `${BASELINE} (bad decision value): must be refused, got ${JSON.stringify(badSide.result && badSide.result.error)}`
    )
    // A decision about a package this run never raised is a stale answer to an older question.
    const stale = await runBody(baseSrc, { args: { ...ARGSD, dependencyDecisions: { lodash: 'pure' } }, overrides: over })
    check(
      stale.result && /did not report as undecided/.test(stale.result.error || ''),
      `${BASELINE} (stale decision): must be refused, got ${JSON.stringify(stale.result && stale.result.error)}`
    )
  }

  // ─── ownership decisions on the files nobody could place ───
  // The first live run blocked on five unplaceable pilot files and the only way forward was a second
  // full pass. Same dead end as the dependency decisions, and costlier.
  {
    const ARGSO = { repo: '/t', ordinaryChange: 'add a field' }
    const withSrc = { 'resolve:contract-source': { ok: true, path: '/p', detail: '' } }
    const assigned = {
      capabilities: [{ name: 'work-items' }],
      assignments: [{ file: 'src/a.ts', capability: 'work-items', placement: 'capability', runtime: 'server' }],
      unassigned: [{ file: 'src/orphan.ts', why: 'no clear owner', likelyCapability: 'work-items' }],
      deps: { pure: [], runtime: [], undecided: [] },
    }
    const over = { ...withSrc, assign: assigned }

    const blocked = await runBody(baseSrc, { args: ARGSO, overrides: over })
    const blockerText = ((blocked.result && blocked.result.blockers) || []).join(' ')
    check(/no owner/.test(blockerText), `${BASELINE} (unplaced pilot file): must block. blockers=${JSON.stringify(blocked.result && blocked.result.blockers)}`)
    // The blocker has to carry the answer, not just the complaint — that is the whole defect.
    check(/args\.fileOwners/.test(blockerText), `${BASELINE} (unplaced pilot file): the blocker must say how to answer it`)
    check(/src\/orphan\.ts/.test(blockerText), `${BASELINE} (unplaced pilot file): the blocker must name the files`)

    const answered = await runBody(baseSrc, { args: { ...ARGSO, fileOwners: { 'src/orphan.ts': 'work-items' } }, overrides: over })
    check(
      !/no owner/.test(((answered.result && answered.result.blockers) || []).join(' ')),
      `${BASELINE} (ownership supplied): must clear the blocker. blockers=${JSON.stringify(answered.result && answered.result.blockers)}`
    )
    check(
      (answered.result && answered.result.fileOwners || []).some(o => o.file === 'src/orphan.ts' && o.capability === 'work-items'),
      `${BASELINE} (ownership supplied): the decision must be recorded as the operator's, not inferred`
    )
    // The counts everything downstream reads are derived from `assignments`, so the merge has to
    // happen before they are built. It did not: capabilities[].files undercounted by exactly the
    // files the operator had just placed.
    const counted = ((answered.result && answered.result.capabilities) || []).find(c => c.name === 'work-items')
    check(
      counted && counted.files === 2,
      `${BASELINE} (ownership supplied): the placed file must be counted in its capability, got ${JSON.stringify(counted)}`
    )
    // A capability the inventory never found would create a module root nothing else knows about.
    const invented = await runBody(baseSrc, { args: { ...ARGSO, fileOwners: { 'src/orphan.ts': 'invented' } }, overrides: over })
    check(
      invented.result && /capabilities this run did not find/.test(invented.result.error || ''),
      `${BASELINE} (invented capability): must be refused, got ${JSON.stringify(invented.result && invented.result.error)}`
    )
    const stale = await runBody(baseSrc, { args: { ...ARGSO, fileOwners: { 'src/gone.ts': 'work-items' } }, overrides: over })
    check(
      stale.result && /did not report as unassigned/.test(stale.result.error || ''),
      `${BASELINE} (stale ownership answer): must be refused, got ${JSON.stringify(stale.result && stale.result.error)}`
    )
  }

  // ─── phase 1 required handoffs ───
  // A missing lens and a failed manifest writer both reported success: the lens count
  // was a log line, and `manifestPath: null` shipped next to "no blockers, pilot can start".
  {
    const ARGS1 = { repo: '/t', ordinaryChange: 'add a field' }
    const withSrc = { 'resolve:contract-source': { ok: true, path: '/p', detail: '' } }

    const lensLabels = (await runBody(baseSrc, { args: ARGS1, overrides: withSrc })).calls.filter(c => typeof c === 'string' && c.startsWith('lens:'))
    check(lensLabels.length > 0, `${BASELINE}: no inventory lens ran, so the gate below proves nothing`)
    const oneDead = await runBody(baseSrc, { args: ARGS1, overrides: { ...withSrc, [lensLabels[0]]: null } })
    check(
      oneDead.result && typeof oneDead.result.error === 'string',
      `${BASELINE} (one lens died): must stop rather than assign owners from evidence nobody gathered, got ${JSON.stringify(oneDead.result && oneDead.result.error)}`
    )

    const noManifest = await runBody(baseSrc, { args: ARGS1, overrides: { ...withSrc, 'write-manifest': { ok: false, detail: 'disk full' } } })
    check(
      noManifest.result && (noManifest.result.blockers || []).some(b => /manifest/i.test(b)),
      `${BASELINE} (manifest writer failed): must be a blocker — phase 2 reads everything from it. blockers=${JSON.stringify(noManifest.result && noManifest.result.blockers)}`
    )
  }

  // ─── contractSource resolution ───
  // Deleting the whole resolution block left every check above green, because the required-args
  // loop stops before the probe runs and nothing downstream asserted where the path came from.
  const ARGS = { repo: '/t', ordinaryChange: 'add a field' }
  const PROBE = 'resolve:contract-source'

  for (const [label, verdict] of [
    // agent() returns null when the subagent dies or the user skips it. That is not the same event
    // as "it looked and found nothing", and neither may be mistaken for a resolved path.
    ['probe died', null],
    ['probe found nothing', { ok: false, path: '', detail: 'tried three candidates' }],
    ['probe returned ok with no path', { ok: true, path: '', detail: 'x' }],
  ]) {
    const { result, calls } = await runBody(baseSrc, { args: ARGS, overrides: { [PROBE]: verdict } })
    check(
      result && typeof result.error === 'string',
      `${BASELINE} (${label}): must stop rather than run on an unresolved contract, got ${JSON.stringify(result)}`
    )
    check(calls.includes(PROBE), `${BASELINE} (${label}): the probe agent was never spawned`)
  }

  {
    const RESOLVED = '/resolved/plugin/root'
    const { result, calls, prompts } = await runBody(baseSrc, {
      args: ARGS,
      overrides: { [PROBE]: { ok: true, path: RESOLVED, detail: 'CLAUDE_PLUGIN_ROOT' } },
    })
    check(!(result && result.error), `${BASELINE} (probe resolved): must proceed, got ${JSON.stringify(result && result.error)}`)
    check(calls.includes(PROBE), `${BASELINE} (probe resolved): the probe agent was never spawned`)
    // The point of resolving is that later agents read from the resolved path. Asserting only that
    // the block ran would stay green if its result were dropped on the floor.
    const carried = prompts.filter(p => p.label !== PROBE && p.prompt.includes(`${RESOLVED}/docs/architecture-contract.md`))
    check(carried.length > 0, `${BASELINE} (probe resolved): no agent prompt carries the resolved contract path`)
  }

  // An explicit contractSource must win outright and cost no probe agent.
  {
    const { calls, prompts } = await runBody(baseSrc, { args: { ...ARGS, contractSource: '/explicit' } })
    check(!calls.includes(PROBE), `${BASELINE} (explicit contractSource): spent a probe agent anyway`)
    check(
      prompts.some(p => p.prompt.includes('/explicit/rules/architecture-contract.json')),
      `${BASELINE} (explicit contractSource): no agent prompt carries it`
    )
  }

  // The prompt hardcodes how many files to copy out of rules/. Nothing tied that literal to the
  // directory, so adding a rule would have left the mover silently copying a subset.
  {
    const nonReadme = listFiles('rules', file => !file.endsWith('README.md')).length
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
    // Off the end of the table the check would grep for "undefined non-README files" — it still
    // fails, but says nothing useful about why.
    if (nonReadme >= words.length) {
      check(false, `${BASELINE}: rules/ has ${nonReadme} non-README files, past the spelled-out range; extend words[] or write the count as a digit`)
    } else {
      // Every surface that states the count, not just the workflow. Pinning it here alone is how the
      // commit that corrected the workflow to "nine" left rules/README.md saying "seven": the check
      // that exists to catch a stale number was looking at one of the two places it appears.
      for (const [label, text] of [
        ['the copy instruction', baseSrc],
        ['rules/README.md', readText('rules/README.md')],
      ]) {
        check(
          !/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b non-README files/.test(text) ||
            text.includes(`${words[nonReadme]} non-README files`),
          `${BASELINE}: rules/ has ${nonReadme} non-README files but ${label} does not say "${words[nonReadme]}"`
        )
      }
    }
  }

  const manifest = {
    found: true,
    roots: { sourceRoot: 'src', appRoot: 'src/app', moduleRoot: 'src/modules', sharedRoot: 'src/shared' },
    segments: SEGMENTS,
    publicSurfaces: SURFACES,
    violationCensus: { crossCapabilityInternal: 2 },
    consumers: ['src/app/p.tsx'],
    assignments: [{ file: 'src/lib/calc.ts', segment: 'domain' }],
  }
  const goodPlan = { moves: [{ file: 'src/lib/calc.ts', role: 'domain' }], surfaces: [] }
  const pilotArgs = { repo: '/t', capability: 'work-items', maxFixRounds: 0 }
  const base = {
    'load-manifest': manifest,
    'plan:work-items': goodPlan,
    'move:internals': { ok: true, filesTouched: ['src/modules/work-items/domain/calc.ts'], detail: '' },
    'move:consumers': { ok: true, filesTouched: [], detail: '' },
    'verify:behaviour': { ok: true, detail: 'green' },
    'verify:architecture': { ok: true, counts: { capability: 0, crossCapabilityInternal: 1 }, detail: '' },  // census below declares only crossCapabilityInternal
    'verify:review': { verdict: 'sound', findings: [] },
  }
  const pilot = over => runBody(pilotSrc, { args: pilotArgs, overrides: { ...base, ...over } })

  // ─── the gate must name what is left and what to do ───
  // The operator of the first live run did not understand the sentence asking them to decide, and
  // separately asked why old directories were still there. Both are the same defect: the gate cited
  // the procedure instead of instructing the reader.
  {
    const withCaps = {
      ...manifest,
      capabilities: [
        { name: 'work-items', files: 28, status: 'migrated' },
        { name: 'labels', files: 9, status: 'old-layout' },
        { name: 'identity', files: 32, status: 'old-layout' },
      ],
    }
    const out = await pilot({ 'load-manifest': withCaps })
    const gateText = (out.result && out.result.humanGate) || ''
    check(
      (out.result && out.result.remainingCapabilities || []).join(',') === 'labels,identity',
      `${PILOT}: the gate must list the capabilities still on the old layout, got ${JSON.stringify(out.result && out.result.remainingCapabilities)}`
    )
    // The instruction LINES, not the bare words: asserting `includes('ACCEPT')` passed on the
    // incidental "BEFORE YOU ACCEPT" further down, so gutting the three instructions left the check
    // green. A substring assertion is only as strong as the string is unique.
    for (const phrase of ['BOTH layouts', '- ACCEPT:', '- REVISE:', '- REJECT:', 'REAL user path']) {
      check(gateText.includes(phrase), `${PILOT}: humanGate must contain "${phrase}" — it is what the reader has to act on`)
    }
    check(gateText.includes('labels'), `${PILOT}: humanGate must name the next capability by name, not "<next>"`)
    // A single-capability repository must not be told that other capabilities are waiting.
    const solo = await pilot({ 'load-manifest': { ...manifest, capabilities: [{ name: 'work-items', files: 28 }] } })
    check(
      (solo.result.humanGate || '').includes('whole tree'),
      `${PILOT}: with no other capability the gate must say so rather than implying a wave that does not exist`
    )
  }

  // ─── the wave has a position, not just a first step ───
  // `every capability except this one` is only true of the FIRST run. Said on the second it labels
  // the capability the first run migrated as old-layout; said on the last it still claims a mixed
  // tree and offers a finished capability as the next one to do. The manifest cannot answer this —
  // it is written once, before anything moves — so the layout is read from the tree per capability.
  {
    const caps = rows => ({ ...manifest, capabilities: rows })

    // Mid-wave: one done, one to go. The done one must not be offered as next.
    const mid = await pilot({ 'load-manifest': caps([
      { name: 'work-items', status: 'old-layout' },
      { name: 'labels', status: 'migrated' },
      { name: 'identity', status: 'old-layout' },
    ]) })
    const midGate = (mid.result && mid.result.humanGate) || ''
    check(
      (mid.result && mid.result.remainingCapabilities || []).join(',') === 'identity',
      `${PILOT}: a capability already on the new layout must not be reported as remaining, got ${JSON.stringify(mid.result && mid.result.remainingCapabilities)}`
    )
    check(
      /capability: "<next>" \(e\.g\. "identity"\)/.test(midGate),
      `${PILOT}: the ACCEPT line must offer a capability that is actually still on the old layout`
    )
    check(
      midGate.includes('Already migrated by earlier runs: labels'),
      `${PILOT}: the gate must say which capabilities earlier runs already finished, or the operator redoes them`
    )

    // Last run of the wave: nothing left, and no claim of a mixed tree.
    const last = await pilot({ 'load-manifest': caps([
      { name: 'work-items', status: 'migrated' },
      { name: 'labels', status: 'migrated' },
    ]) })
    const lastGate = (last.result && last.result.humanGate) || ''
    check(
      (last.result && last.result.remainingCapabilities || []).length === 0 &&
        !lastGate.includes('BOTH layouts') && lastGate.includes('completes the wave'),
      `${PILOT}: when every other capability is migrated the gate must say the wave is complete, not that the tree is mixed`
    )
    check(
      lastGate.includes('(none left'),
      `${PILOT}: with nothing left the ACCEPT line must say so instead of naming a finished capability`
    )

    // Half-migrated is a defect the contract forbids, and it is invisible unless named.
    const half = await pilot({ 'load-manifest': caps([{ name: 'labels', status: 'mixed' }]) })
    check(
      ((half.result && half.result.humanGate) || '').includes('HALF-MIGRATED: labels'),
      `${PILOT}: a capability carrying both topologies must be named — that state is what the contract forbids`
    )

    // An older manifest read by an older prompt carries no status at all. Fail closed: an
    // unclassified capability is neither counted as done nor asserted to be pending.
    const unknown = await pilot({ 'load-manifest': caps([{ name: 'labels', files: 9 }]) })
    const unknownGate = (unknown.result && unknown.result.humanGate) || ''
    check(
      (unknown.result && unknown.result.remainingCapabilities || []).length === 0 &&
        (unknown.result && unknown.result.capabilityLayout || {}).undetermined.join(',') === 'labels',
      `${PILOT}: a capability with no recorded status must be reported as undetermined, not silently counted either way`
    )
    check(
      unknownGate.includes('LAYOUT NOT DETERMINED for labels') &&
        unknownGate.includes('confirm it still needs migrating first'),
      `${PILOT}: an undetermined layout must be stated as undetermined, and any suggestion built on it must carry the caveat`
    )
  }

  // ─── why the fix loop stopped ───
  // `fixRounds: 2` cannot distinguish "the budget ran out" from "a round changed nothing", and the
  // two ask the operator for different things. The first live run hit the cap with a must-fix open.
  {
    const red = { 'verify:behaviour': { ok: false, detail: 'red' }, 'verify:review': { verdict: 'sound', findings: [{ severity: 'must-fix' }] } }
    const capped = await runBody(pilotSrc, { args: { ...pilotArgs, maxFixRounds: 1 }, overrides: { ...base, ...red } })
    check(capped.result && capped.result.fixLoopExit === 'cap-reached', `${PILOT}: exhausting maxFixRounds must be reported as cap-reached, got ${JSON.stringify(capped.result && capped.result.fixLoopExit)}`)
    check(
      (capped.result.humanGate || '').includes('RAN OUT OF ROUNDS'),
      `${PILOT}: the gate must say the budget ran out — a verdict read as final would be read wrong`
    )
    const untouched = await pilot({})
    check(untouched.result && untouched.result.fixLoopExit === 'not-entered', `${PILOT}: an all-green run never enters the loop, got ${JSON.stringify(untouched.result && untouched.result.fixLoopExit)}`)
    // Converged is a state the operator acts on differently from a cap; it needs its own line.
    const converged = await runBody(pilotSrc, {
      args: { ...pilotArgs, maxFixRounds: 3 },
      overrides: { ...base, 'verify:behaviour': { ok: false, detail: 'red' } },
    })
    check(converged.result && converged.result.fixLoopExit === 'no-progress' || (converged.result || {}).fixLoopExit === 'converged',
      `${PILOT}: a loop that ended on its own must be classified, got ${JSON.stringify(converged.result && converged.result.fixLoopExit)}`)
    check(
      !((untouched.result.humanGate || '').includes('RAN OUT OF ROUNDS')),
      `${PILOT}: a run that never needed a fix round must not claim its budget ran out`
    )
  }

  // ─── a read-only probe must not be offered a writer's vocabulary ───
  {
    const src = readText(`${DIR}/${PILOT}`)
    const radiusCall = src.slice(src.indexOf("label: 'radius'"), src.indexOf("label: 'radius'") + 120)
    check(
      radiusCall.includes('PROBE_SCHEMA'),
      `${PILOT}: the radius step measures and must not be handed the mover's schema — it filled filesTouched with a path it had only imagined`
    )
    check(
      !/filesTouched/.test(src.slice(src.indexOf('const PROBE_SCHEMA'), src.indexOf('const STEP_SCHEMA'))),
      `${PILOT}: PROBE_SCHEMA must not carry filesTouched, or it is STEP_SCHEMA under another name`
    )
  }

  // ─── the vacuous waiver is per counter, end to end ───
  // A single boolean suppressed every non-capability regression. The table above proves archRed;
  // this proves the SET actually reaches it from the manifest, which the table cannot.
  {
    const censusManifest = {
      ...manifest,
      violationCensus: { crossCapabilityInternal: 0, 'import/no-unresolved': 0 },
      vacuousCounters: ['crossCapabilityInternal'],
    }
    const regressed = await pilot({
      'load-manifest': censusManifest,
      'verify:architecture': { ok: true, counts: { capability: 0, crossCapabilityInternal: 5, 'import/no-unresolved': 3 }, detail: '' },
    })
    check(
      regressed.result && regressed.result.recommendation === 'revise',
      `${PILOT} (regression outside the vacuous set): expected revise, got ${JSON.stringify(regressed.result && regressed.result.recommendation)} — ${JSON.stringify(regressed.result && regressed.result.reason)}`
    )
    // Control: the vacuous counter alone rising is exactly what the waiver exists for.
    const waived = await pilot({
      'load-manifest': censusManifest,
      'verify:architecture': { ok: true, counts: { capability: 0, crossCapabilityInternal: 5, 'import/no-unresolved': 0 }, detail: '' },
    })
    check(
      waived.result && waived.result.recommendation === 'accept',
      `${PILOT} (only the vacuous counter rose): expected accept, got ${JSON.stringify(waived.result && waived.result.recommendation)} — ${JSON.stringify(waived.result && waived.result.reason)}`
    )
  }

  // ─── stale instruction files reach the human ───
  {
    const stale = await pilot({
      'stale-instructions': { ok: true, detail: '', entries: [{ file: 'AGENTS.md', line: 70, deadPath: 'src/use-cases/work-items' }] },
    })
    const gateText = (stale.result && stale.result.humanGate) || ''
    check(
      (stale.result && stale.result.staleInstructions && stale.result.staleInstructions.entries || []).length === 1,
      `${PILOT}: a stale instruction reference must reach the report`
    )
    check(gateText.includes('AGENTS.md:70'), `${PILOT}: the gate must name the file and line, not just a count`)
    check(gateText.includes('src/use-cases/work-items'), `${PILOT}: the gate must name the dead path`)
    // "could not run" is not "found nothing" — the report must be able to tell them apart.
    const died = await pilot({ 'stale-instructions': { ok: false, detail: 'could not read', entries: [] } })
    check(
      died.result && died.result.staleInstructions && died.result.staleInstructions.checked === false,
      `${PILOT}: a dead instruction probe must not read as a clean instruction layer`
    )
    // In the GATE, not only in the payload. Silence there is indistinguishable from a clean layer,
    // and the gate is the surface the operator actually reads.
    check(
      ((died.result && died.result.humanGate) || '').includes('DID NOT RUN'),
      `${PILOT}: a failed instruction probe must say so in the gate, not fall silent like a clean one`
    )
    const clean = await pilot({ 'stale-instructions': { ok: true, detail: '', entries: [] } })
    check(
      !((clean.result && clean.result.humanGate) || '').includes('DELETED PATHS'),
      `${PILOT}: with nothing stale the gate must stay silent about it`
    )
  }

  // ─── an agent that never reported is not an agent that reported success ───
  // `agent()` returns null when the subagent dies or is skipped, and null is falsy in exactly the
  // places these guards read a boolean off it. Each of the five below let a dead probe pass as a
  // clean one, or as a red one — both of which are claims about something nobody measured.
  {
    // A dead consumer mover was ignored whenever phase 1 had recorded no consumer — the case where
    // this agent matters most, since its own first step says the grep is authoritative.
    const noneRecorded = { ...manifest, consumers: [] }
    const dead = await pilot({ 'load-manifest': noneRecorded, 'move:consumers': null })
    check(
      dead.result && dead.result.recommendation === 'inconclusive',
      `${PILOT}: a dead consumer mover must be inconclusive even with no recorded consumers, got ${JSON.stringify(dead.result && dead.result.recommendation)}`
    )
    // Control: an empty list plus a mover that DID run and legitimately touched nothing is fine.
    const quiet = await pilot({ 'load-manifest': noneRecorded, 'move:consumers': { ok: true, filesTouched: [], detail: '' } })
    check(
      quiet.result && quiet.result.recommendation === 'accept',
      `${PILOT}: a consumer mover that ran and needed no edit must not be treated as a failure, got ${JSON.stringify(quiet.result && quiet.result.reason)}`
    )

    // A dead verify probe read as red and sent fix agents to repair failures nobody observed.
    const withFix = over => runBody(pilotSrc, { args: { ...pilotArgs, maxFixRounds: 2 }, overrides: { ...base, ...over } })
    for (const probe of ['verify:behaviour', 'verify:architecture', 'verify:review']) {
      const out = await withFix({ [probe]: null })
      check(
        !out.calls.includes('fix:round-1'),
        `${PILOT}: a dead ${probe} must not start a fix round — no edit can repair a probe that did not run`
      )
      check(
        out.result && out.result.recommendation === 'inconclusive',
        `${PILOT}: a dead ${probe} must be inconclusive, got ${JSON.stringify(out.result && out.result.recommendation)}`
      )
    }
    // Control: a probe that ran and reported red is exactly what the fix loop is for.
    const red = await withFix({ 'verify:behaviour': { ok: false, detail: 'tests fail' } })
    check(
      red.calls.includes('fix:round-1'),
      `${PILOT}: a measured red behaviour oracle must still enter the fix loop`
    )
    // And a probe that dies DURING the loop leaves it neither converged nor capped: red on the
    // first pass, gone on the re-verify. `cap-reached` there tells the operator to raise the
    // budget, which cannot help — nothing measured the tree the fix round just edited.
    const diedMidLoop = await runBody(pilotSrc, {
      args: { ...pilotArgs, maxFixRounds: 1 },
      overrides: { ...base, 'verify:behaviour': n => (n === 0 ? { ok: false, detail: 'red' } : null) },
    })
    check(
      diedMidLoop.result && diedMidLoop.result.fixLoopExit === 'unmeasured',
      `${PILOT}: a loop that stopped because an oracle stopped reporting is neither converged nor capped, got ${JSON.stringify(diedMidLoop.result && diedMidLoop.result.fixLoopExit)}`
    )
    check(
      ((diedMidLoop.result && diedMidLoop.result.humanGate) || '').includes('AN ORACLE STOPPED REPORTING'),
      `${PILOT}: the gate must say the tree was edited and then not measured`
    )
    // A post-fix `reject` leaves through the loop's own reject guard, and below the cap that read as
    // `converged` — "cleared what it was watching", printed above a verdict saying the model is wrong.
    const rejectedAfterFix = await runBody(pilotSrc, {
      args: { ...pilotArgs, maxFixRounds: 2 },
      overrides: {
        ...base,
        'verify:review': n => (n === 0 ? { verdict: 'revise', findings: [{ severity: 'must-fix' }] } : { verdict: 'reject', findings: [] }),
      },
    })
    check(
      rejectedAfterFix.result && rejectedAfterFix.result.fixLoopExit === 'rejected' &&
        (rejectedAfterFix.result.humanGate || '').includes('REJECTED THE OWNERSHIP MODEL'),
      `${PILOT}: a loop that stopped on a rejection must not report that it cleared what it was watching, got ${JSON.stringify(rejectedAfterFix.result && rejectedAfterFix.result.fixLoopExit)}`
    )
    // `no-progress` compares a serialisation, so key and finding ORDER decided whether a round had
    // moved anything. Same state, different order, twice — the loop must still call it stalled.
    const shuffled = await runBody(pilotSrc, {
      args: { ...pilotArgs, maxFixRounds: 4 },
      overrides: {
        ...base,
        'verify:architecture': n => ({
          ok: true,
          counts: n % 2 === 0 ? { capability: 1, crossCapabilityInternal: 1 } : { crossCapabilityInternal: 1, capability: 1 },
          detail: '',
        }),
        'verify:review': n => ({
          verdict: 'revise',
          findings: n % 2 === 0
            ? [{ severity: 'must-fix', detail: 'a' }, { severity: 'must-fix', detail: 'b' }]
            : [{ severity: 'must-fix', detail: 'b' }, { severity: 'must-fix', detail: 'a' }],
        }),
      },
    })
    check(
      shuffled.result && shuffled.result.fixLoopExit === 'no-progress' && shuffled.result.fixRounds === 1,
      `${PILOT}: reordered counters and findings are the same state — the loop must stop, got ${JSON.stringify(shuffled.result && [shuffled.result.fixLoopExit, shuffled.result.fixRounds])}`
    )

    // A dead instruction probe fell through the same branch as a clean instruction layer.
    const staleDead = await pilot({ 'stale-instructions': null })
    check(
      ((staleDead.result && staleDead.result.humanGate) || '').includes('DID NOT RUN'),
      `${PILOT}: an instruction probe that returned nothing must say so in the gate, like one that returned ok=false`
    )

    // A dead radius probe printed the message for a manifest that recorded no ordinary change,
    // sending the reader to fix phase 1 over a phase 2 failure.
    const radiusDead = await pilot({ 'load-manifest': { ...manifest, ordinaryChange: 'add a field to the list view' }, radius: null })
    const radiusText = (radiusDead.result && radiusDead.result.changeRadius) || ''
    check(
      typeof radiusText === 'string' && /did not report/.test(radiusText) && !/recorded no ordinaryChange/.test(radiusText),
      `${PILOT}: a dead radius probe must be reported as a dead probe, not as a missing baseline, got ${JSON.stringify(radiusText)}`
    )
  }

  // ─── declared channel changes reach the human ───
  // The first live run moved browser reads off Server Actions onto a GET route because the contract
  // requires it, which changed the error shape, the retry predicate and how often one outage reached
  // Sentry. Typecheck, lint, 988 tests and the build stayed green. Only the reviewer caught it, twice.
  {
    const planWithChannel = {
      ...goodPlan,
      channelChanges: [
        { what: 'browser list read', from: 'Server Action', to: 'GET route handler', behaviourRisk: 'retryable 5xx now reported per attempt' },
      ],
    }
    const out = await pilot({ 'plan:work-items': planWithChannel })
    const gateText = (out.result && out.result.humanGate) || ''
    check(
      (out.result && out.result.channelChanges || []).length === 1,
      `${PILOT}: a declared channel change must reach the report, got ${JSON.stringify(out.result && out.result.channelChanges)}`
    )
    check(gateText.includes('CHANNEL CHANGES'), `${PILOT}: humanGate must surface channel changes — the suite does not test them`)
    check(
      gateText.includes('reported per attempt'),
      `${PILOT}: humanGate must carry the declared behaviour risk, not just the fact that a channel moved`
    )
    // A migration that changes no channel must not manufacture a warning.
    const quiet = await pilot({})
    check(
      !((quiet.result && quiet.result.humanGate) || '').includes('CHANNEL CHANGES'),
      `${PILOT}: with no channel change the gate must stay silent about them`
    )

    // ─── the instruction and the audit are load-bearing ───
    // Deleting the planner's whole channel-changes instruction left `npm run validate` green: every
    // check read the DECLARATION, and a declaration nobody was asked for is empty in exactly the
    // same way as one honestly assessed and found empty. So assert on the call sites themselves —
    // the prompt that asks, the schema that makes the answer mandatory, and the reviewer that
    // checks the answer against the code.
    const planCall = out.prompts.find(p => p.label === 'plan:work-items')
    check(
      planCall && /Channel changes — declare them, do not smuggle them/.test(planCall.prompt) &&
        /NEVER Server Actions/.test(planCall.prompt) && /`channelChanges`/.test(planCall.prompt),
      `${PILOT}: the plan prompt must still instruct the planner to assess channels — nothing else asks`
    )
    check(
      planCall && Array.isArray(planCall.schema.required) && planCall.schema.required.includes('channelChanges'),
      `${PILOT}: channelChanges must be required, or "assessed and found none" is indistinguishable from "never asked"`
    )
    // The declaration is written before the code exists. Something has to compare it with what was
    // actually built, and only the adversarial reviewer reads the built tree.
    const reviewCall = out.prompts.find(p => p.label === 'verify:review')
    check(
      reviewCall && /CHANNELS: compare how each behaviour is transported NOW/.test(reviewCall.prompt) &&
        /is NOT in that list is a must-fix/.test(reviewCall.prompt),
      `${PILOT}: the review oracle must be asked to find transport changes the plan did not declare`
    )
    check(
      reviewCall && reviewCall.prompt.includes('browser list read: Server Action -> GET route handler'),
      `${PILOT}: the reviewer must be handed the actual declaration to check the code against`
    )
    const quietReview = quiet.prompts.find(p => p.label === 'verify:review')
    check(
      quietReview && /assessed channels and declared no change/.test(quietReview.prompt),
      `${PILOT}: with nothing declared the reviewer must be told that is a claim, not an absence of one`
    )
  }

  // ─── Plan must be a partition of the manifest's file set ───
  // Screening judged destinations only, so a plan covering a subset passed and the pilot
  // reported success over the files it happened to mention.
  {
    const twoFiles = { ...manifest, assignments: [{ file: 'src/lib/calc.ts' }, { file: 'src/lib/fmt.ts' }] }
    const partitionCases = [
      ['plan omits an assigned file', twoFiles, { moves: [{ file: 'src/lib/calc.ts', role: 'domain' }], surfaces: [] }],
      ['plan names an unassigned file', manifest, { moves: [{ file: 'src/lib/calc.ts', role: 'domain' }, { file: 'src/elsewhere/x.ts', role: 'domain' }], surfaces: [] }],
      ['one source planned twice', manifest, { moves: [{ file: 'src/lib/calc.ts', role: 'domain' }, { file: 'src/lib/calc.ts', role: 'server' }], surfaces: [] }],
      ['surface names an unrecorded consumer', manifest, { moves: [{ file: 'src/lib/calc.ts', role: 'domain' }], surfaces: [{ surface: 'server', consumers: ['src/app/invented.tsx'], exports: ['listItems'] }] }],
      ['surface with an empty export contract', manifest, { moves: [{ file: 'src/lib/calc.ts', role: 'domain' }], surfaces: [{ surface: 'server', consumers: ['src/app/p.tsx'], exports: [] }] }],
    ]
    for (const [label, mf, plan] of partitionCases) {
      const out = await pilot({ 'load-manifest': mf, 'plan:work-items': plan })
      check(
        out.result && out.result.error === 'plan rejected before any write',
        `${PILOT} (${label}): must be rejected before the first write, got ${JSON.stringify(out.result && (out.result.error || out.result.recommendation))}`
      )
      check(!out.calls.includes('move:internals'), `${PILOT} (${label}): the mover ran on a rejected plan`)
    }
  }

  // ─── reject stops before the fix loop ───
  // recommendation() puts reject first, but it runs AFTER the loop, so with rounds
  // enabled the fix agents edited the design the reviewer said to drop. maxFixRounds: 0
  // everywhere else in this file hid that entirely.
  {
    const rejected = await runBody(pilotSrc, {
      args: { ...pilotArgs, maxFixRounds: 2 },
      overrides: { ...base, 'verify:behaviour': { ok: false, detail: 'red' }, 'verify:review': { verdict: 'reject', findings: [{ severity: 'must-fix' }] } },
    })
    check(
      !rejected.calls.some(c => typeof c === 'string' && c.startsWith('fix:')),
      `${PILOT} (reject with rounds enabled): fix agents ran against a rejected ownership model — ${JSON.stringify(rejected.calls)}`
    )
    check(rejected.result && rejected.result.recommendation === 'reject', `${PILOT} (reject with rounds enabled): expected reject, got ${JSON.stringify(rejected.result && rejected.result.recommendation)}`)
    // The same shape WITHOUT a reject must still spend rounds, or the assertion above
    // would pass on a workflow that simply never fixes anything.
    const revising = await runBody(pilotSrc, {
      args: { ...pilotArgs, maxFixRounds: 2 },
      overrides: { ...base, 'verify:behaviour': { ok: false, detail: 'red' }, 'verify:review': { verdict: 'sound', findings: [{ severity: 'must-fix' }] } },
    })
    check(
      revising.calls.some(c => typeof c === 'string' && c.startsWith('fix:')),
      `${PILOT} (red without reject): no fix round ran, so the reject assertion above proves nothing`
    )
  }

  // ─── a failed consumer move is not a migrated tree ───
  {
    const stalled = await pilot({ 'move:consumers': { ok: false, filesTouched: [], detail: 'could not rewrite imports' } })
    check(
      stalled.result && stalled.result.recommendation === 'inconclusive',
      `${PILOT} (consumer move failed): expected inconclusive, got ${JSON.stringify(stalled.result && stalled.result.recommendation)}`
    )
    check(!stalled.calls.includes('verify:behaviour'), `${PILOT} (consumer move failed): verified a half-migrated tree`)
    // Zero files touched is legitimate here — consumers reaching the capability through
    // an unchanged surface path need no edit — so it must NOT be treated as a failure.
    const quiet = await pilot({ 'move:consumers': { ok: true, filesTouched: [], detail: 'no import needed rewriting' } })
    check(
      quiet.result && quiet.result.recommendation === 'accept',
      `${PILOT} (consumer move touched nothing): a correct no-op must not read as a failure, got ${JSON.stringify(quiet.result && quiet.result.recommendation)}`
    )
  }

  const happy = await pilot({})
  check(happy.result && happy.result.recommendation === 'accept', `${PILOT} (all green): expected accept, got ${JSON.stringify(happy.result && happy.result.recommendation)}`)
  check(happy.calls.includes('move:internals'), `${PILOT}: the internals mover must be called`)

  // Phase 1 records where it found the contract; phase 2 must carry that into the agents that make
  // placement decisions. Declared in the schema but never read, or read but never used, the pilot
  // silently falls back to "the repository's own docs, if present" — which for anyone running from
  // an installed plugin is nothing.
  {
    const SRC = '/plugin/root'
    const carried = await pilot({ 'load-manifest': { ...manifest, contractSource: SRC } })
    check(
      carried.prompts.some(p => p.prompt.includes(`${SRC}/skills/designing-architecture/SKILL.md`)),
      `${PILOT}: the manifest's contractSource never reaches an agent prompt`
    )
    // And the absent case must still run rather than emit a path built from an empty string.
    const bare = await pilot({})
    check(
      !bare.prompts.some(p => p.prompt.includes('/skills/designing-architecture/SKILL.md')),
      `${PILOT}: a manifest without contractSource still emitted a contract path`
    )
  }

  // The guard must be REACHED, not merely correct. This is the mutation that a
  // table test alone cannot catch: `if (moveIncomplete(internals))` -> `if (false)`.
  const deadMover = await pilot({ 'move:internals': null })
  check(
    deadMover.result && deadMover.result.recommendation === 'inconclusive',
    `${PILOT} (mover died): expected inconclusive, got ${JSON.stringify(deadMover.result && deadMover.result.recommendation)}`
  )
  check(!deadMover.calls.includes('verify:behaviour'), `${PILOT} (mover died): must stop BEFORE Verify, not measure an unchanged tree`)

  const emptyMove = await pilot({ 'move:internals': { ok: true, filesTouched: [], detail: '' } })
  check(
    emptyMove.result && emptyMove.result.recommendation === 'inconclusive',
    `${PILOT} (mover touched nothing): expected inconclusive, got ${JSON.stringify(emptyMove.result && emptyMove.result.recommendation)}`
  )

  // And that the gate is wired to `recommendation`, not to a literal.
  const rejected = await pilot({ 'verify:review': { verdict: 'reject', findings: [] }, 'verify:behaviour': { ok: false, detail: 'red' } })
  check(
    rejected.result && rejected.result.recommendation === 'reject',
    `${PILOT} (review rejects, behaviour red): expected reject to dominate, got ${JSON.stringify(rejected.result && rejected.result.recommendation)}`
  )
  check(rejected.result && typeof rejected.result.reason === 'string' && rejected.result.reason.length > 0, `${PILOT}: the returned verdict must carry its reason`)

  // Untrusted values that reach every computed path.
  const badRoot = await pilot({ 'load-manifest': { ...manifest, roots: { ...manifest.roots, moduleRoot: '../outside' } } })
  check(badRoot.result && typeof badRoot.result.error === 'string', `${PILOT}: a moduleRoot escaping the project must be refused, got ${JSON.stringify(badRoot.result)}`)
  const badVocab = await pilot({ 'load-manifest': { ...manifest, publicSurfaces: ['../../evil'] } })
  check(badVocab.result && typeof badVocab.result.error === 'string', `${PILOT}: an unsafe surface vocabulary must be refused, got ${JSON.stringify(badVocab.result)}`)
  const badCap = await runBody(pilotSrc, { args: { ...pilotArgs, capability: '../evil' }, overrides: base })
  check(badCap.result && typeof badCap.result.error === 'string', `${PILOT}: a non-kebab capability must be refused`)
}

fail(errors)
console.log(`workflow contract ok (${files.length} scripts: parse, pure meta, phase parity, forbidden globals, destination + plan-screening + gate tables, call sites exercised)`)
