#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { fail, root } from './_lib.mjs'

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'module-cohesion-')))
const errors = []

function run() {
  return spawnSync(process.execPath, [path.join(sandbox, 'rules', 'check-module-cohesion.mjs')], {
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

function write(relative, content) {
  const absolute = path.join(sandbox, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
}

try {
  fs.mkdirSync(path.join(sandbox, 'rules'), { recursive: true })
  fs.mkdirSync(path.join(sandbox, 'src', 'modules', 'work-items'), { recursive: true })
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')
  for (const script of ['contract-paths.mjs', 'check-module-cohesion.mjs']) {
    fs.copyFileSync(path.join(root, 'rules', script), path.join(sandbox, 'rules', script))
  }
  fs.writeFileSync(
    path.join(sandbox, 'rules', 'architecture-contract.json'),
    `${JSON.stringify(
      {
        sourceRoot: 'src',
        moduleRoot: 'src/modules',
        appRoot: 'src/app',
        sharedRoot: 'src/shared',
        importAliases: { '@/': 'src/' },
      },
      null,
      2
    )}\n`
  )
  fs.writeFileSync(path.join(sandbox, 'package.json'), '{"private":true,"type":"module"}\n')

  // Clean: a scenario folder with a production file plus its test, a lib.ts with a couple of
  // helpers, and a __mocks__ directory colocated with the production file it mocks.
  write(
    'src/modules/work-items/server/update-work-item/data.ts',
    "export const updateWorkItem = () => ({ ok: true })\n"
  )
  write(
    'src/modules/work-items/server/update-work-item/data.test.ts',
    "export {}\n"
  )
  write('src/modules/work-items/server/lib.ts', "export const mapRow = (row) => row\n")
  write(
    'src/modules/work-items/server/__mocks__/data.ts',
    "export const updateWorkItem = () => ({ ok: true })\n"
  )

  const clean = run()
  if (clean.status !== 0) {
    errors.push(`clean fixture failed: ${`${clean.stdout}${clean.stderr}`.trim()}`)
  }

  // Mutation (a): a scenario folder whose only content is its test — the production file was
  // moved or deleted and the folder never followed.
  write(
    'src/modules/work-items/client/search-work-items/__tests__/search-work-items.test.ts',
    "export {}\n"
  )
  expect(
    run(),
    'test-only directory',
    'search-work-items: contains only __tests__/__mocks__/fixtures'
  )
  fs.rmSync(path.join(sandbox, 'src/modules/work-items/client/search-work-items'), {
    recursive: true,
    force: true,
  })

  const cleanAgain = run()
  if (cleanAgain.status !== 0) {
    errors.push(
      `fixture did not return to clean after removing the mutation: ${`${cleanAgain.stdout}${cleanAgain.stderr}`.trim()}`
    )
  }

  // Mutation (b): lib.ts and lib/ both present under server/ — neither promotion finished.
  write('src/modules/work-items/server/lib/build-query.ts', "export const buildQuery = () => ({})\n")
  expect(
    run(),
    'lib.ts/lib split',
    'lib.ts and lib/ coexist under one owner'
  )
  fs.rmSync(path.join(sandbox, 'src/modules/work-items/server/lib'), {
    recursive: true,
    force: true,
  })
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

fail(errors)
console.log('module cohesion tool ok (1 clean fixture, 2 failing mutations)')
