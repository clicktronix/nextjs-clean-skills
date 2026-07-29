#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { fail, root } from './_lib.mjs'

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'contract-tools-')))
const errors = []

function run(script) {
  return spawnSync(process.execPath, [path.join(sandbox, 'rules', script)], {
    cwd: path.join(sandbox, 'src', 'modules', 'work-items'),
    encoding: 'utf8',
  })
}

function expect(result, label, expectedText) {
  const output = `${result.stdout}${result.stderr}`
  if (result.status === 0 || !output.includes(expectedText)) {
    errors.push(`${label}: expected failure containing "${expectedText}", received ${output.trim()}`)
  }
}

try {
  fs.mkdirSync(path.join(sandbox, 'rules'), { recursive: true })
  fs.mkdirSync(path.join(sandbox, 'src', 'modules', 'work-items', 'server'), {
    recursive: true,
  })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')
  for (const script of [
    'check-dependency-classification.mjs',
    'check-database-resources.mjs',
  ]) {
    fs.copyFileSync(path.join(root, 'rules', script), path.join(sandbox, 'rules', script))
  }

  const contract = {
    purePackages: ['valibot'],
    runtimePackages: ['@supabase'],
    databaseResources: [
      { kind: 'table', name: 'work_items', owner: 'work-items' },
    ],
  }
  fs.writeFileSync(
    path.join(sandbox, 'rules', 'architecture-contract.json'),
    `${JSON.stringify(contract, null, 2)}\n`
  )
  fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@supabase/supabase-js': '1.0.0',
          valibot: '1.0.0',
        },
      },
      null,
      2
    )}\n`
  )
  const store = path.join(
    sandbox,
    'src',
    'modules',
    'work-items',
    'server',
    'store.ts'
  )
  fs.writeFileSync(
    store,
    "export const read = (db) => db.from('work_items')\nexport const bytes = Buffer.from('ok')\n"
  )

  for (const script of [
    'check-dependency-classification.mjs',
    'check-database-resources.mjs',
  ]) {
    const result = run(script)
    if (result.status !== 0) {
      errors.push(`${script}: clean fixture failed: ${`${result.stdout}${result.stderr}`.trim()}`)
    }
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(sandbox, 'package.json'), 'utf8'))
  packageJson.dependencies.stripe = '1.0.0'
  fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  )
  expect(
    run('check-dependency-classification.mjs'),
    'unclassified dependency',
    'stripe is unclassified'
  )
  delete packageJson.dependencies.stripe
  fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  )

  contract.purePackages.push('@supabase')
  contract.runtimePackages = ['@supabase/supabase-js']
  fs.writeFileSync(
    path.join(sandbox, 'rules', 'architecture-contract.json'),
    `${JSON.stringify(contract, null, 2)}\n`
  )
  expect(
    run('check-dependency-classification.mjs'),
    'scope and package overlap',
    '@supabase is classified as both pure and runtime-bound'
  )
  contract.purePackages.pop()
  contract.runtimePackages = ['@supabase']
  fs.writeFileSync(
    path.join(sandbox, 'rules', 'architecture-contract.json'),
    `${JSON.stringify(contract, null, 2)}\n`
  )

  fs.mkdirSync(path.join(sandbox, 'src', 'modules', 'labels', 'server'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(sandbox, 'src', 'modules', 'labels', 'server', 'store.ts'),
    "export const read = (db) => db.from('work_items')\n"
  )
  expect(
    run('check-database-resources.mjs'),
    'cross-capability table access',
    'owned by work-items'
  )
  fs.rmSync(path.join(sandbox, 'src', 'modules', 'labels'), { recursive: true })

  fs.writeFileSync(store, "export const read = (supabase, table) => supabase.from(table)\n")
  expect(
    run('check-database-resources.mjs'),
    'dynamic table access',
    'uses a dynamic Supabase table name'
  )
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

fail(errors)
console.log('contract tools ok (2 clean checks, 4 failing mutations)')
