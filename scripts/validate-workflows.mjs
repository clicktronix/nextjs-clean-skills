#!/usr/bin/env node
// Contract test for .claude/workflows/*.js.
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
// Plus table-driven checks of the two pure functions the pilot's safety rests on:
// destination() (admitted, closed, injective) and the recommendation gate. Both are
// extracted from the script text, so the workflow stays the single source of truth.

import fs from 'node:fs'
import path from 'node:path'

import { fail, readJson, root } from './_lib.mjs'

// Read from the contract, never a second copy. scripts/validate-capability-pilots.mjs
// already sets this precedent, and CHANGELOG records the same fix once before:
// "Derived capability-pilot surfaces … instead of maintaining a second silent copy."
const CONTRACT = readJson('rules/architecture-contract.json')
const SEGMENTS = CONTRACT.segments
const SURFACES = CONTRACT.publicSurfaces

const DIR = path.join(root, '.claude', 'workflows')
const errors = []
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const HOOKS = ['args', 'budget', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow']

const check = (ok, message) => {
  if (!ok) errors.push(message)
}

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter(f => f.endsWith('.js')).sort()
  : []
check(files.length > 0, 'no workflow scripts found under .claude/workflows/')

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
  const source = fs.readFileSync(path.join(DIR, file), 'utf8')

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
    const code = line.replace(/\/\/.*$/, '')
    if (/^\s*import\s/.test(code) || /\brequire\(/.test(code)) errors.push(`${where}: scripts cannot import — no imports or require()`)
    if (/\bDate\.now\(/.test(code)) errors.push(`${where}: Date.now() throws at runtime (it would break resume)`)
    if (/\bMath\.random\(/.test(code)) errors.push(`${where}: Math.random() throws at runtime (it would break resume)`)
    if (/\bnew Date\(\s*\)/.test(code)) errors.push(`${where}: argless new Date() throws at runtime (it would break resume)`)
    // No TypeScript-annotation regex: the parse check above already rejects TS (it
    // does not parse as JS), so the regex added nothing and false-positived on legal
    // JS such as `f(a ? b : number)`.
  })
}

// ─── destination(): admitted, closed, injective ───
const PILOT = '20-migration-pilot.js'
if (files.includes(PILOT)) {
  const source = fs.readFileSync(path.join(DIR, PILOT), 'utf8')
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
      ['dotdot in name', { file: 'src/x.ts', role: 'domain', basename: 'a..b.ts' }],
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
    const planFrom = source.indexOf('const resolved = (plan.moves')
    const planTo = source.indexOf("log(\n  'Plan: ")
    if (planFrom === -1 || planTo === -1) {
      errors.push(`${PILOT}: could not extract the plan-screening region — the anchors this test relies on moved`)
    } else {
      const screen = new Function('plan', 'destination', 'SURFACES', 'SEGMENTS', source.slice(planFrom, planTo))
      const run = plan => screen(plan, destination, SURFACES, SEGMENTS)

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
        ['basename traversal', { moves: [{ file: 'src/x.ts', role: 'domain', basename: '../../evil.ts' }], surfaces: [] }],
      ]
      for (const [label, plan] of rejects) {
        const verdict = run(plan)
        check(
          verdict && typeof verdict.error === 'string',
          `plan screening (${label}): must reject before any write, got ${JSON.stringify(verdict)}`
        )
      }
      check(run(clean) === undefined, `plan screening (clean plan): must be accepted, got ${JSON.stringify(run(clean))}`)
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
    const logic = new Function(`${source.slice(logicFrom, logicTo)}; return { moveIncomplete, archRed, recommendation }`)()
    const { moveIncomplete, archRed, recommendation } = logic

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
    for (const [label, a, expected] of archCases) {
      check(archRed(a, census) === expected, `archRed(${label}): expected ${expected}`)
    }

    const green = { ok: true, counts: { capability: 0 } }
    const gateCases = [
      ['behaviour agent died', { behaviour: null, architecture: green, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['review agent died', { behaviour: { ok: true }, architecture: green, review: null }, 'inconclusive'],
      ['architecture agent died', { behaviour: { ok: true }, architecture: null, review: { verdict: 'sound', findings: [] } }, 'inconclusive'],
      ['behaviour red', { behaviour: { ok: false }, architecture: green, review: { verdict: 'sound', findings: [] } }, 'revise'],
      ['architecture not measured', { behaviour: { ok: true }, architecture: { ok: false, counts: { capability: 0 } }, review: { verdict: 'sound', findings: [] } }, 'revise'],
      ['review rejects', { behaviour: { ok: true }, architecture: green, review: { verdict: 'reject', findings: [] } }, 'reject'],
      ['must-fix present', { behaviour: { ok: true }, architecture: green, review: { verdict: 'sound', findings: [{ severity: 'must-fix' }] } }, 'revise'],
      ['nits only', { behaviour: { ok: true }, architecture: green, review: { verdict: 'sound', findings: [{ severity: 'nit' }] } }, 'accept'],
      ['all green', { behaviour: { ok: true }, architecture: green, review: { verdict: 'sound', findings: [] } }, 'accept'],
    ]
    for (const [label, o, expected] of gateCases) {
      const got = recommendation(o, census).gate
      check(got === expected, `recommendation(${label}): expected ${expected}, got ${got}`)
    }
    // The one verdict silence must never produce, stated separately because it is the
    // consequential one: `reject` means reject the architecture.
    for (const [label, o] of gateCases.filter(([l]) => l.endsWith('died'))) {
      check(recommendation(o, census).gate !== 'reject', `recommendation(${label}): silence must never read as reject`)
      check(recommendation(o, census).gate !== 'accept', `recommendation(${label}): silence must never read as accept`)
    }
  }
}

fail(errors)
console.log(`workflow contract ok (${files.length} scripts: parse, pure meta, phase parity, forbidden globals, destination table)`)
