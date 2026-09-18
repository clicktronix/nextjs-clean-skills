#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { fail, root } from './_lib.mjs'

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'module-cohesion-')))
const errors = []
let mutations = 0
let cleanRuns = 0

function run() {
  return spawnSync(process.execPath, [path.join(sandbox, 'rules', 'check-module-cohesion.mjs')], {
    cwd: path.join(sandbox, 'src', 'modules', 'work-items'),
    encoding: 'utf8',
  })
}

const outputOf = (result) => `${result.stdout}${result.stderr}`

function expectFailure(label, expectedText, absentText) {
  mutations += 1
  const result = run()
  const output = outputOf(result)
  if (result.status === 0 || !output.includes(expectedText)) {
    errors.push(`${label}: expected failure containing "${expectedText}", received ${output.trim()}`)
  }
  if (absentText && output.includes(absentText)) {
    errors.push(`${label}: output must not contain "${absentText}", received ${output.trim()}`)
  }
}

function expectClean(label) {
  cleanRuns += 1
  const result = run()
  if (result.status !== 0) errors.push(`${label}: expected clean, received ${outputOf(result).trim()}`)
}

function write(relative, content) {
  const absolute = path.join(sandbox, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
}
const remove = (relative) => fs.rmSync(path.join(sandbox, relative), { recursive: true, force: true })

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
  // helpers, a __mocks__ directory colocated with the production file it mocks, resource-only
  // directories (assets, messages, styles) beside a test, and runtime seed data under a plain
  // `fixtures/` next to the test support that shares the name.
  write('src/modules/work-items/server/update-work-item/data.ts', 'export const updateWorkItem = () => ({ ok: true })\n')
  write('src/modules/work-items/server/update-work-item/data.test.ts', 'export {}\n')
  write('src/modules/work-items/server/lib.ts', 'export const mapRow = (row) => row\n')
  write('src/modules/work-items/server/__mocks__/data.ts', 'export const updateWorkItem = () => ({ ok: true })\n')
  write('src/modules/work-items/ui/assets/logo.svg', '<svg/>')
  write('src/modules/work-items/ui/messages/ru.json', '{"title":"Title"}')
  write('src/modules/work-items/ui/styles/card.css', '.card { display: block }')
  write('src/modules/work-items/ui/messages/messages.test.ts', 'export {}\n')
  write('src/modules/work-items/server/fixtures/seed.json', '{"rows":[]}')
  write('src/modules/work-items/server/fixtures/build-seed.ts', 'export {}\n')
  write('src/shared/server/reporting.ts', 'export const report = () => {}\n')
  expectClean('clean fixture')

  // (a) a scenario folder whose only content is its test — the production file was moved or
  // deleted and the folder never followed. The leaf is reported; its ancestor `client/` is the
  // consequence and is not reported a second time.
  write('src/modules/work-items/client/search-work-items/__tests__/search-work-items.test.ts', 'export {}\n')
  expectFailure(
    'test-only directory',
    'client/search-work-items: holds only tests',
    'work-items/client: holds only tests'
  )
  remove('src/modules/work-items/client')
  expectClean('clean again after (a)')

  // (b) a plain `fixtures/` whose contents are all source files is test support, not production.
  write('src/modules/work-items/client/fixtures/work-items.ts', 'export const rows = []\n')
  expectFailure('source-only fixtures directory', 'client/fixtures: holds only tests')
  remove('src/modules/work-items/client')

  // (c) an empty directory is named itself, not blamed on its parent.
  fs.mkdirSync(path.join(sandbox, 'src/modules/work-items/server/empty'), { recursive: true })
  expectFailure('empty directory', 'server/empty: empty directory', 'work-items/server: holds only')
  remove('src/modules/work-items/server/empty')

  // (d) lib.ts and lib/ both present under server/ — neither promotion finished.
  write('src/modules/work-items/server/lib/build-query.ts', 'export const buildQuery = () => ({})\n')
  expectFailure('lib.ts/lib split', 'lib.ts and lib/ coexist under one owner')
  remove('src/modules/work-items/server/lib')

  // (e) the same two properties under a shared root: shared/** has owners too.
  write('src/shared/server/lib.ts', 'export {}\n')
  write('src/shared/server/lib/a.ts', 'export {}\n')
  expectFailure('shared lib split', 'shared/server: lib.ts and lib/ coexist')
  remove('src/shared/server/lib')
  remove('src/shared/server/lib.ts')
  write('src/shared/client/__tests__/events.test.ts', 'export {}\n')
  expectFailure('shared test-only directory', 'shared/client: holds only tests')
  remove('src/shared/client')
  expectClean('clean again after (e)')

  // (f) a walk over nothing is not a pass.
  fs.renameSync(path.join(sandbox, 'src/modules'), path.join(sandbox, 'src/modules-moved'))
  const missing = spawnSync(process.execPath, [path.join(sandbox, 'rules', 'check-module-cohesion.mjs')], {
    cwd: sandbox,
    encoding: 'utf8',
  })
  mutations += 1
  if (missing.status === 0 || !outputOf(missing).includes('does not exist — nothing was checked')) {
    errors.push(`missing moduleRoot: expected a failure naming the root, received ${outputOf(missing).trim()}`)
  }
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

fail(errors)
console.log(`module cohesion tool ok (${cleanRuns} clean runs, ${mutations} failing mutations)`)
