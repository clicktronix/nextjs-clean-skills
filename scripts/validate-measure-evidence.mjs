#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { fail, root } from './_lib.mjs'

const errors = []
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nextjs-clean-evidence-'))
const script = path.join(root, 'scripts/measure-evidence.mjs')

// The fixture must not inherit the contributor's git configuration. Overriding identity alone was
// not enough: with `commit.gpgsign` set globally, `npm run validate` died on a signing key, in a
// stack trace that named neither this script nor the reason.
const ISOLATED = [
  '-c',
  'user.name=Validator',
  '-c',
  'user.email=validator@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'tag.gpgsign=false',
  '-c',
  `core.hooksPath=${path.join(repo, '.no-hooks')}`,
  '-c',
  'init.templateDir=',
]

const git = (...args) =>
  execFileSync('git', ['-C', repo, ...ISOLATED, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const run = (...args) =>
  spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
  })

try {
  fs.mkdirSync(path.join(repo, 'src/application'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'src/presentation'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'src/presentation/__tests__'), { recursive: true })
  fs.writeFileSync(
    path.join(repo, 'src/application/exports.ts'),
    [
      "import { connector } from '@/integrations/client'",
      'export const direct = () => deps.one()',
      'const listed = function () { return deps.two() }',
      'const defaulted = () => deps.three()',
      'function namedDeclaration() { return deps.four() }',
      'const typeOnly = () => deps.hidden()',
      'type typeOnly = string',
      'export type { typeOnly }',
      'export { listed, namedDeclaration }',
      'export default (defaulted)',
      'void connector',
      '',
    ].join('\n')
  )
  fs.writeFileSync(
    path.join(repo, 'src/application/default-expression.ts'),
    'export default (() => deps.five())\n'
  )
  fs.writeFileSync(
    path.join(repo, 'src/application/direct-function.ts'),
    'export function declared() { return deps.six() }\n'
  )
  fs.writeFileSync(
    path.join(repo, 'src/application/ignored.spec.ts'),
    'export const ignored = () => deps.seven()\n'
  )
  fs.writeFileSync(
    path.join(repo, 'src/presentation/view.tsx'),
    "import { api } from '@/integrations/api'\nexport const View = () => api\n"
  )
  fs.writeFileSync(
    path.join(repo, 'src/presentation/__tests__/view.test.tsx'),
    "import { api } from '@/integrations/api'\nexport const testValue = api\n"
  )
  fs.writeFileSync(
    path.join(repo, 'src/presentation/view.spec.tsx'),
    "import { api } from '@/integrations/api'\nexport const specValue = api\n"
  )

  // Everything below exists because a metric with no assertion is a metric with no test. Each of
  // these files is the smallest thing that makes exactly one filter or counter load-bearing:
  // remove the filter, and a number in docs/evidence.md moves.
  fs.mkdirSync(path.join(repo, 'src/application/__tests__'), { recursive: true })
  fs.writeFileSync(
    path.join(repo, 'src/application/deep.ts'),
    [
      // Relative spelling of the adapters root — the alias branch alone left this untested.
      "import { helper } from '../integrations/helper'",
      // `await deps.x()`: the commonest forward in an async application layer, and the form that
      // vanishes from the count if callRoot stops unwrapping AwaitExpression.
      'export const awaited = async () => await deps.seven()',
      'export function wide() {',
      '  assertValidUuid(a)',
      '  assertValidUuidOrNull(b)',
      '  parse(c)',
      '  const one = 1',
      '  const two = 2',
      '  const three = 3',
      '  const four = 4',
      '  return helper(one, two, three, four)',
      '}',
      '',
    ].join('\n')
  )
  // Excluded by name, one file per name: dropping either from the list must move a count.
  fs.writeFileSync(
    path.join(repo, 'src/application/ports.ts'),
    'export const fromPorts = () => deps.eight()\n'
  )
  fs.writeFileSync(
    path.join(repo, 'src/application/types.ts'),
    'export const fromTypes = () => deps.nine()\n'
  )
  // Deliberately not valid TypeScript for a declaration file: the parser only reads text, and the
  // point is that the `.d.ts` exclusion is what keeps this out, not the absence of a body.
  fs.writeFileSync(
    path.join(repo, 'src/application/shapes.d.ts'),
    'export const declaredOnly = () => deps.ten()\n'
  )
  // The two test filters overlapped on a single file, so neither was tested alone.
  fs.writeFileSync(
    path.join(repo, 'src/application/detached.test.ts'),
    'export const detached = () => deps.eleven()\n'
  )
  fs.writeFileSync(
    path.join(repo, 'src/application/__tests__/support.ts'),
    'export const support = () => deps.twelve()\n'
  )
  fs.writeFileSync(
    path.join(repo, 'src/presentation/standalone.test.tsx'),
    "import { api } from '@/integrations/api'\nexport const standalone = api\n"
  )
  fs.writeFileSync(
    path.join(repo, 'src/presentation/__tests__/support.tsx'),
    "import { api } from '@/integrations/api'\nexport const support = api\n"
  )

  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'fixture')

  const measured = run(
    '--use-cases-root=src/application',
    '--ui-root=src/presentation',
    '--adapters-root=src/integrations',
    '--outbound-api-root=src/integrations/api',
    `fixture=${repo}#HEAD`
  )
  if (measured.status !== 0) {
    errors.push(`measure-evidence fixture failed: ${measured.stderr.trim()}`)
  } else {
    const [result] = JSON.parse(measured.stdout)
    const expected = {
      useCasesRoot: 'src/application',
      uiRoot: 'src/presentation',
      adaptersRoot: 'src/integrations',
      outboundApiRoot: 'src/integrations/api',
      useCaseFiles: 4,
      exportedCallables: 8,
      depsForwards: 7,
      atMostTwoStatements: 7,
      moreThanSixStatements: 1,
      uuidAssertions: 2,
      schemaParses: 1,
      useCaseFilesImportingAdapters: 2,
      uiFilesImportingOutboundApi: 1,
    }
    for (const [key, value] of Object.entries(expected)) {
      if (result[key] !== value) {
        errors.push(`measure-evidence fixture: expected ${key}=${value}, received ${result[key]}`)
      }
    }
  }

  const empty = run('--use-cases-root=src/missing', `fixture=${repo}#HEAD`)
  if (empty.status === 0 || !empty.stderr.includes('no TypeScript application files found')) {
    errors.push('measure-evidence must reject an empty application inventory')
  }

  const traversal = run('--use-cases-root=../outside', `fixture=${repo}#HEAD`)
  if (
    traversal.status === 0 ||
    !traversal.stderr.includes('must be a normalized repository-relative directory')
  ) {
    errors.push('measure-evidence must reject a root outside the repository')
  }
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}

fail(errors)
console.log('evidence tool ok (configurable roots, export forms, empty-inventory guard)')
