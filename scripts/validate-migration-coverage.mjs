#!/usr/bin/env node
// Real ESLint + recorded CLI census: omitted files and disabled rules must stay unmeasured.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root } from './_lib.mjs'
import { writeInventory, expandRules, screenPlan, recommend } from '../plugins/nextjs-clean-skills/bin/migration.mjs'

const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ncs-coverage-')))
const lib = path.join(root, 'plugins/nextjs-clean-skills/bin/migration.mjs')
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  fs.writeFileSync(path.join(repo, file), text)
}
const cli = (...args) => {
  const result = spawnSync(process.execPath, [lib, ...args, '--repo', repo], { encoding: 'utf8', cwd: repo })
  assert.ok(result.stdout, result.stderr)
  return { status: result.status, value: JSON.parse(result.stdout) }
}
const config = (override = '') => write('eslint.config.mjs', `
import parser from '@typescript-eslint/parser';
import boundaries from './rules/eslint-boundaries.mjs';
import resolved from './rules/eslint-boundaries-resolved.mjs';
export default [{ files: ['**/*.ts', '**/*.tsx'], languageOptions: { parser } }, ...boundaries, ...resolved, ${override}];
`)
const census = () => {
  // runRecord owns the shell; use a fixed command with no interpolated source text.
  const result = spawnSync(process.execPath, [lib, 'record', '--repo', repo, '--artifact', 'lint.json', '--', 'node lint.mjs'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const record = JSON.parse(result.stdout)
  return cli('census', '--record', record.recordPath, '--lint-json', 'lint.json', '--contract', 'rules/architecture-contract.json', '--capability', 'orders')
}

try {
  fs.cpSync(path.join(root, 'rules'), path.join(repo, 'rules'), { recursive: true })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(repo, 'node_modules'), 'dir')
  write('package.json', '{"type":"module"}')
  write('tsconfig.json', '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","baseUrl":".","paths":{"@/*":["src/*"]}},"include":["src"]}')
  write('src/app/page.ts', 'export default function Page() { return null }')
  write('src/modules/orders/domain/bad.ts', "import fs from 'node:fs'; export const read = fs.readFileSync")
  write('lint.mjs', `import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, [${JSON.stringify(lib)}, 'lint', '--repo', process.cwd(),
  '--contract', 'rules/architecture-contract.json', '--output-file', process.env.NCS_ARTIFACTS + '/lint.json'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;`)
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0)
  assert.equal(spawnSync('git', ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-qm', 'Initialize fixture']).status, 0)

  config("{ ignores: ['src/modules/orders/**'] }")
  // The unversioned inventory cannot exempt ignored code from proof of coverage.
  write('.nextjs-clean-migration/inventory.json', JSON.stringify({ excludedDirectories: ['orders'] }))
  const ignored = census()
  assert.equal(ignored.status, 1)
  assert.equal(ignored.value.ok, false)
  assert.ok(ignored.value.missing.includes('src/modules/orders/domain/bad.ts'))
  assert.equal(recommend({ behaviour: { ok: true }, architecture: ignored.value, review: { verdict: 'sound' } }).gate, 'inconclusive')

  write('src/modules/orders/domain/visible.ts', 'export const visible = true')
  config("{ ignores: ['src/modules/orders/domain/bad.ts'] }")
  const partial = census()
  assert.equal(partial.value.ok, false)
  assert.ok(partial.value.missing.includes('src/modules/orders/domain/bad.ts'))

  for (const rule of ['clean-architecture/boundaries', 'import/no-unresolved', 'import/no-cycle', 'import/no-dynamic-require', 'clean-runtime/runtime-markers']) {
    config(`{ rules: { '${rule}': 'off' } }`)
    const disabled = census()
    assert.equal(disabled.value.ok, false, rule)
    assert.ok(disabled.value.inactive.some(entry => entry.ruleId === rule), rule)
  }
  config()
  const broken = census()
  assert.equal(broken.status, 0)
  assert.equal(broken.value.counts.domainDirection, 1)
  assert.equal(broken.value.counts.capability, 1)

  write('src/modules/orders/domain/bad.ts', "/* eslint-disable clean-architecture/boundaries */\nimport fs from 'node:fs'; export const read = fs.readFileSync")
  assert.equal(census().value.ok, false, 'suppressed architecture errors are unmeasured')
  write('src/modules/orders/domain/bad.ts', 'export const =')
  assert.equal(census().value.ok, false, 'parse failures are unmeasured')

  write('src/modules/orders/domain/bad.ts', 'export const value = 1')
  write('src/modules/orders/domain/value.test.ts', 'export const testValue = 1')
  const fixed = census()
  assert.equal(fixed.status, 0, JSON.stringify(fixed.value))
  assert.equal(fixed.value.counts.capability, 0)
  assert.equal(recommend({ behaviour: { ok: true }, architecture: fixed.value, review: { verdict: 'sound' } }).gate, 'accept')

  write('src/modules/orders/domain/alias.ts', "import { value } from '@/modules/orders/domain/bad'; export const alias = value")
  const outside = spawnSync(process.execPath, [lib, 'lint', '--repo', repo, '--output-file', path.join(repo, 'outside.json')], { encoding: 'utf8', cwd: root })
  assert.equal(outside.status, 0, outside.stdout + outside.stderr)

  // Assets and nested folders survive the same inventory -> assignments -> plan used by agents.
  for (const name of ['Form/index.tsx', 'List/index.tsx', 'Form/Form.module.css', 'Form/messages.json', 'Form/icon.svg', 'List/help.mdx']) write('src/features/orders/' + name, '')
  const inventory = JSON.parse(fs.readFileSync(writeInventory(repo, 'src').path, 'utf8'))
  const expanded = expandRules(inventory.files, [{ kind: 'prefix', path: 'src', placement: 'capability', capability: 'orders' }])
  assert.deepEqual(expanded.uncovered, [])
  const files = expanded.rows.map(row => row.file).filter(file => file.startsWith('src/features/orders/'))
  assert.equal(files.length, 6)
  const contract = JSON.parse(fs.readFileSync(path.join(repo, 'rules/architecture-contract.json'), 'utf8'))
  const context = { moduleRoot: contract.moduleRoot, segments: contract.segments, surfaces: contract.publicSurfaces, capability: 'orders', assignedFiles: files, consumers: [] }
  const plan = { moves: files.map(file => ({ file, role: 'ui', relativePath: file.slice('src/features/orders/'.length) })) }
  const checked = screenPlan(plan, context)
  assert.equal(checked.ok, true, JSON.stringify(checked.problems))
  assert.equal(new Set(checked.moving.map(move => move.dest)).size, 6)
  plan.moves[1].relativePath = plan.moves[0].relativePath
  assert.ok(screenPlan(plan, context).problems.some(problem => problem.kind === 'destination-collision'))
  console.log('migration coverage ok (real ESLint ignores, five disabled rules, violation, clean control, assets and nested plans)')
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}
