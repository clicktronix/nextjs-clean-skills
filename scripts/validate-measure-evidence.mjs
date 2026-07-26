#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { fail, root } from './_lib.mjs'

const errors = []
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nextjs-clean-evidence-'))
const script = path.join(root, 'scripts/measure-evidence.mjs')

const git = (...args) =>
  execFileSync('git', ['-C', repo, ...args], {
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

  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=Validator', '-c', 'user.email=validator@example.com', 'commit', '-qm', 'fixture')

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
      useCaseFiles: 3,
      exportedCallables: 6,
      depsForwards: 6,
      useCaseFilesImportingAdapters: 1,
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
