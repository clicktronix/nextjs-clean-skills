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

import { fail, listFiles, readJson, readText } from './_lib.mjs'

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

  // Line-scoped so a mention inside a comment explaining the rule does not trip it.
  const lines = source.split('\n')
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`
    // Strip a trailing line comment only when the `//` is not inside a string. The
    // blanket replace cut from the first `//` anywhere, so a real Date.now() on a
    // line that also carried a URL was invisible — and prompt strings here are full
    // of URLs.
    const code = stripLineComment(line)
    if (/^\s*import\s/.test(code) || /\brequire\(/.test(code)) errors.push(`${where}: scripts cannot import — no imports or require()`)
    if (/\bDate\.now\(/.test(code)) errors.push(`${where}: Date.now() throws at runtime (it would break resume)`)
    if (/\bMath\.random\(/.test(code)) errors.push(`${where}: Math.random() throws at runtime (it would break resume)`)
    if (/\bnew Date\(\s*\)/.test(code)) errors.push(`${where}: argless new Date() throws at runtime (it would break resume)`)
    // No TypeScript-annotation regex: the parse check above already rejects TS (it
    // does not parse as JS), so the regex added nothing and false-positived on legal
    // JS such as `f(a ? b : number)`.
  })
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
  const hooks = {
    args: argv,
    budget: { total: null, spent: () => 0, remaining: () => Infinity },
    agent: async (prompt, opts = {}) => {
      calls.push(opts.label)
      if (Object.prototype.hasOwnProperty.call(overrides, opts.label)) return overrides[opts.label]
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
  return { result, calls }
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
        'plan', 'destination', 'SURFACES', 'SEGMENTS', 'MODULE_ROOT', 'CAP', 'log',
        `${source.slice(planFrom, planTo)}; return { moving, staying, deleting, usedSurfaces, surfacesToAuthor, MOVE_TABLE, SURFACE_TABLE, AUTHOR_TABLE }`
      )
      const run = plan => screen(plan, destination, SURFACES, SEGMENTS, 'src/modules', 'work-items', () => {})

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
      ['capability still dirty', { ok: true, counts: { capability: 3, crossCapabilityInternal: 1 } }, true],
      ['capability undefined', { ok: true, counts: { crossCapabilityInternal: 1 } }, true],
      ['regression elsewhere', { ok: true, counts: { capability: 0, domainDirection: 3 } }, true],
      ['clean and improved', { ok: true, counts: { capability: 0, crossCapabilityInternal: 1 } }, false],
      ['new messageId appears', { ok: true, counts: { capability: 0, serverClient: 1 } }, true],
    ]
    // archRed returns the REASON it is red ('' when green), so the gate and the report
    // cannot disagree about why. Assert truthiness, and that a red answer explains itself.
    for (const [label, a, expected] of archCases) {
      const reason = archRed(a, census)
      check(!!reason === expected, `archRed(${label}): expected red=${expected}, got ${JSON.stringify(reason)}`)
      if (expected) check(typeof reason === 'string' && reason.length > 0, `archRed(${label}): a red verdict must name its reason`)
    }
    check(archUnmeasured(undefined) === true, 'archUnmeasured(absent): must be unmeasured')
    check(archUnmeasured({ ok: false, counts: { capability: 0 } }) === true, 'archUnmeasured(ok=false): a tool that could not run is unmeasured, not clean')
    check(archUnmeasured({ ok: true, counts: { capability: 0 } }) === false, 'archUnmeasured(measured): must be measured')

    const green = { ok: true, counts: { capability: 0 } }
    const gateCases = [
      ['behaviour agent died', { behaviour: null, architecture: green, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['review agent died', { behaviour: { ok: true }, architecture: green, review: null }, 'inconclusive'],
      ['architecture agent died', { behaviour: { ok: true }, architecture: null, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['behaviour red', { behaviour: { ok: false }, architecture: green, review: { verdict: 'sound', findings: [] } }, 'revise'],
      // "could not run" is not "found violations": it is silence, and silence is
      // never a verdict. This row previously hardcoded 'revise' and pinned the bug.
      ['architecture could not run', { behaviour: { ok: true }, architecture: { ok: false, counts: { capability: 0 } }, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['architecture reported nothing', { behaviour: { ok: true }, architecture: { ok: true, counts: {} }, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['review rejects', { behaviour: { ok: true }, architecture: green, review: { verdict: 'reject', findings: [] } }, 'reject'],
      // reject must DOMINATE. It sat after the behaviour and architecture branches, so
      // the one verdict meaning "abandon this ownership model" was downgraded to
      // `revise` in exactly the states where it is most likely correct.
      ['reject with behaviour red', { behaviour: { ok: false }, architecture: green, review: { verdict: 'reject', findings: [] } }, 'reject'],
      ['reject with architecture red', { behaviour: { ok: true }, architecture: { ok: true, counts: { capability: 4 } }, review: { verdict: 'reject', findings: [] } }, 'reject'],
      ['reject with must-fix too', { behaviour: { ok: false }, architecture: { ok: true, counts: { capability: 2 } }, review: { verdict: 'reject', findings: [{ severity: 'must-fix' }] } }, 'reject'],
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
    ['no contractSource', { repo: '/t' }],
    ['no ordinaryChange', { repo: '/t', contractSource: '/s' }],
  ]) {
    const { result } = await runBody(baseSrc, { args: argv })
    check(result && typeof result.error === 'string', `${BASELINE} (${label}): must refuse before spending an agent, got ${JSON.stringify(result)}`)
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
    'verify:architecture': { ok: true, counts: { capability: 0, crossCapabilityInternal: 1 }, detail: '' },
    'verify:review': { verdict: 'sound', findings: [] },
  }
  const pilot = over => runBody(pilotSrc, { args: pilotArgs, overrides: { ...base, ...over } })

  const happy = await pilot({})
  check(happy.result && happy.result.recommendation === 'accept', `${PILOT} (all green): expected accept, got ${JSON.stringify(happy.result && happy.result.recommendation)}`)
  check(happy.calls.includes('move:internals'), `${PILOT}: the internals mover must be called`)

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
