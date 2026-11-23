#!/usr/bin/env node
// The plugin installs the rules into a consumer itself: a version-keyed plugin cache cannot be
// imported by the project's lint or its CI, so the files have to be in the repository. This runs
// the real installer against a project that has nothing from this repository and then uses what it
// wrote the way a consumer and an agent without the plugin do.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { fail, root } from './_lib.mjs'

const cli = path.join(root, 'plugins/nextjs-clean-skills/bin/migration.mjs')
const errors = []
const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-install-')))
const write = (relative, source) => {
  fs.mkdirSync(path.dirname(path.join(repo, relative)), { recursive: true })
  fs.writeFileSync(path.join(repo, relative), source)
}
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8')
const install = () => {
  const result = spawnSync(process.execPath, [cli, 'install-rules', '--repo', repo], { encoding: 'utf8' })
  let value = null
  try {
    value = JSON.parse(result.stdout)
  } catch {
    errors.push(`install-rules printed no JSON: ${result.stdout}${result.stderr}`.trim())
  }
  return { status: result.status, value }
}
const snapshot = () =>
  Object.fromEntries(
    fs.readdirSync(path.join(repo, 'rules'), { recursive: true })
      .map(String)
      .filter((file) => fs.statSync(path.join(repo, 'rules', file)).isFile())
      .sort()
      .map((file) => [file, read(path.join('rules', file))])
  )

try {
  write('package.json', '{"private":true,"type":"module"}\n')
  write('AGENTS.md', '# Project rules\n\nKeep handlers small.\n')
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(repo, 'node_modules'), 'dir')
  write(
    'tsconfig.json',
    `${JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] }, module: 'esnext', moduleResolution: 'bundler' }, include: ['src'] })}\n`
  )
  write('src/modules/orders/server/store.ts', 'export const listOrders = () => []\n')
  write('src/modules/orders/server.ts', "export { listOrders } from './server/store'\n")
  write('src/app/bad/page.ts', "import { listOrders } from '@/modules/orders/server/store'\nexport default listOrders\n")
  write(
    'eslint.config.mjs',
    [
      "import parser from '@typescript-eslint/parser'",
      // The config a project that copied the 4.7.3 rules already has: an update must keep it loading.
      "import boundaries from './rules/eslint-boundaries.mjs'",
      "import resolved from './rules/eslint-boundaries-resolved.mjs'",
      "import { censusScope } from './rules/census-scope.mjs'",
      "if (typeof censusScope !== 'function') throw new Error('censusScope is not exported')",
      "export default [{ files: ['src/**/*.ts'], languageOptions: { parser } }, ...boundaries, ...resolved]",
      '',
    ].join('\n')
  )

  // A rule file the project copied by hand and changed, from before the installer kept a record.
  write('rules/check-module-cycles.mjs', '// local change\n')
  // The same, kept elsewhere and linked into rules/: the file that changes is the link's target.
  write('linked/census-scope.mjs', '// linked local change\n')
  fs.symlinkSync(path.join(repo, 'linked/census-scope.mjs'), path.join(repo, 'rules/census-scope.mjs'))
  const first = install()
  if (first.status !== 0) errors.push(`install-rules failed on a fresh project: ${JSON.stringify(first.value)}`)
  if (JSON.stringify(first.value?.replaced) !== JSON.stringify(['linked/census-scope.mjs', 'rules/check-module-cycles.mjs'])) {
    errors.push(`install-rules did not name the hand-copied file it replaced: ${JSON.stringify(first.value?.replaced)}`)
  }
  const again = install()
  if (again.value?.replaced?.length !== 0) {
    errors.push(`a second install reported files it installed itself as replaced: ${JSON.stringify(again.value?.replaced)}`)
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version
  if (first.value?.version !== version) errors.push(`install-rules reported version ${first.value?.version}; expected ${version}`)

  const contract = JSON.parse(read('rules/architecture-contract.json'))
  if (contract.contractVersion !== version) errors.push('a fresh contract does not carry the installed version')

  // Every relative link in what was installed must lead somewhere a reader without the plugin can
  // open: a file in the repository, or an absolute URL.
  const markdown = Object.keys(snapshot()).filter((file) => file.endsWith('.md'))
  for (const required of ['README.md', 'docs/architecture-contract.md', 'docs/runtime-boundaries.md', 'docs/frontend-composition.md', 'docs/adoption-and-enforcement.md']) {
    if (!markdown.includes(required)) errors.push(`install-rules did not write rules/${required}`)
  }
  let links = 0
  for (const file of markdown) {
    for (const match of read(path.join('rules', file)).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      links += 1
      const resolvedTarget = path.resolve(repo, 'rules', path.dirname(file), target.split('#')[0])
      if (!fs.existsSync(resolvedTarget)) errors.push(`rules/${file} links to ${target}, which does not exist in the project`)
    }
  }
  if (links === 0) errors.push('no relative link was checked: the installed documents were not read')

  // The pointer an agent without the plugin reads: one block, beside what the project wrote.
  const agents = read('AGENTS.md')
  if (!agents.includes('Keep handlers small.')) errors.push('install-rules overwrote the existing AGENTS.md content')
  for (const named of ['rules/docs/architecture-contract.md', 'rules/architecture-contract.json', 'node rules/check-module-cycles.mjs']) {
    if (!agents.includes(named)) errors.push(`the AGENTS.md block does not name ${named}`)
  }
  for (const match of agents.matchAll(/`((?:rules|node rules)\/[^`\s]+)`/g)) {
    const file = match[1].replace(/^node /, '')
    if (!fs.existsSync(path.join(repo, file))) errors.push(`the AGENTS.md block names ${file}, which was not installed`)
  }

  // An update is the same command: the project's contract and instructions survive, the rule files
  // are replaced, and running it twice changes nothing.
  const edited = { ...contract, sourceRoot: 'src', purePackages: ['valibot', 'zod'] }
  write('rules/architecture-contract.json', `${JSON.stringify(edited, null, 2)}\n`)
  write('rules/eslint-boundaries.mjs', 'export default []\n')
  const before = (() => { install(); return { rules: snapshot(), agents: read('AGENTS.md') } })()
  const second = install()
  const after = { rules: snapshot(), agents: read('AGENTS.md') }
  if (JSON.stringify(before) !== JSON.stringify(after)) errors.push('install-rules is not idempotent')
  if (JSON.stringify(JSON.parse(read('rules/architecture-contract.json')).purePackages) !== '["valibot","zod"]') {
    errors.push("install-rules overwrote the project's contract")
  }
  if (read('rules/eslint-boundaries.mjs').length < 1000) errors.push('install-rules did not replace a stale rule file')
  if ((after.agents.match(/nextjs-clean-skills:start/g) ?? []).length !== 1) errors.push('AGENTS.md carries the block more than once')
  if (second.status !== 0) errors.push(`install-rules failed on an update: ${JSON.stringify(second.value)}`)

  // A file a later release no longer ships is removed, because the installer recorded that it
  // wrote it; a file the project put beside the rules is not the installer's to delete.
  const manifest = JSON.parse(read('rules/.installed.json'))
  write('rules/retired-check.mjs', 'export {}\n')
  write('rules/own-check.mjs', 'export {}\n')
  write('rules/.installed.json', `${JSON.stringify({ ...manifest, files: [...manifest.files, 'rules/retired-check.mjs'] }, null, 2)}\n`)
  install()
  if (fs.existsSync(path.join(repo, 'rules/retired-check.mjs'))) errors.push('install-rules left a file an earlier release installed and this one does not ship')
  if (!fs.existsSync(path.join(repo, 'rules/own-check.mjs'))) errors.push("install-rules deleted the project's own file under rules/")
  fs.rmSync(path.join(repo, 'rules/own-check.mjs'))

  // A contract the new rules would refuse stops the update before anything is written: the
  // project keeps a working lint and is told what its contract lacks. The check is the loader's
  // own, so a malformed list is refused here exactly as lint would refuse it.
  const { channelSurfaces: _removed, ...older } = edited
  for (const [label, refused, problem] of [
    ['a missing key', { ...older, contractVersion: '4.0.0' }, 'channelSurfaces must be an array of strings'],
    ['a malformed list', { ...edited, providerPackages: [false], contractVersion: '4.0.0' }, 'providerPackages must be an array of strings'],
  ]) {
    write('rules/architecture-contract.json', `${JSON.stringify(refused, null, 2)}\n`)
    write('rules/eslint-boundaries.mjs', 'export default []\n')
    const stale = install()
    if (stale.status === 0 || !stale.value?.contractProblems?.includes(problem)) {
      errors.push(`install-rules accepted a contract with ${label}: ${JSON.stringify(stale.value)}`)
    }
    if (JSON.parse(read('rules/architecture-contract.json')).contractVersion !== '4.0.0') {
      errors.push(`install-rules stamped a contract with ${label}`)
    }
    if (read('rules/eslint-boundaries.mjs') !== 'export default []\n') {
      errors.push(`install-rules replaced the rule files over a contract with ${label}`)
    }
  }
  // An older contract usually lacks several lists at once; one run names them all.
  {
    const { channelSurfaces: _channel, serverPackages: _server, providerPackages: _provider, ...oldest } = edited
    write('rules/architecture-contract.json', `${JSON.stringify({ ...oldest, contractVersion: '4.0.0' }, null, 2)}\n`)
    const named = install().value?.contractProblems ?? []
    for (const list of ['providerPackages', 'serverPackages', 'channelSurfaces']) {
      if (!named.includes(`${list} must be an array of strings`)) {
        errors.push(`install-rules did not name ${list} among the missing lists: ${JSON.stringify(named)}`)
      }
    }
  }
  // The refusal is the loader's whole validation, not a part of it: a contract that is not an
  // object, or whose roots overlap, would be stamped and then rejected by the first lint run.
  for (const [label, text, problem] of [
    ['a contract that is not an object', 'null\n', 'the contract must be a JSON object'],
    ['overlapping roots', `${JSON.stringify({ ...edited, moduleRoot: 'src', contractVersion: '4.0.0' }, null, 2)}\n`, 'must not overlap'],
    ['a surface list that is not a list', `${JSON.stringify({ ...edited, segments: 42, contractVersion: '4.0.0' }, null, 2)}\n`, 'segments must be an array of strings'],
  ]) {
    write('rules/architecture-contract.json', text)
    const refused = install()
    if (refused.status === 0 || !refused.value?.contractProblems?.some((message) => message.includes(problem))) {
      errors.push(`install-rules accepted ${label}: ${JSON.stringify(refused.value)}`)
    }
    if (read('rules/architecture-contract.json') !== text) errors.push(`install-rules rewrote ${label}`)
  }
  write('rules/architecture-contract.json', `${JSON.stringify(edited, null, 2)}\n`)
  install()

  // A project whose source root is the repository root lints its whole tree, the installed rules
  // included. They are tooling, not product source without an owner.
  const flat = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-install-flat-')))
  try {
    fs.writeFileSync(path.join(flat, 'package.json'), '{"private":true,"type":"module"}\n')
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(flat, 'node_modules'), 'dir')
    fs.mkdirSync(path.join(flat, 'rules'))
    fs.writeFileSync(
      path.join(flat, 'rules/architecture-contract.json'),
      `${JSON.stringify({ ...contract, sourceRoot: '.', moduleRoot: 'modules', appRoot: 'app', sharedRoot: 'shared', importAliases: { '@/': './' } }, null, 2)}\n`
    )
    spawnSync(process.execPath, [cli, 'install-rules', '--repo', flat], { encoding: 'utf8' })
    fs.writeFileSync(
      path.join(flat, 'eslint.config.mjs'),
      "import parser from '@typescript-eslint/parser'\nimport boundaries from './rules/eslint-boundaries.mjs'\nexport default [{ files: ['**/*.ts'], languageOptions: { parser } }, ...boundaries]\n"
    )
    fs.mkdirSync(path.join(flat, 'modules/orders/server'), { recursive: true })
    fs.mkdirSync(path.join(flat, 'app'))
    fs.writeFileSync(path.join(flat, 'modules/orders/server/store.ts'), 'export const listOrders = () => []\n')
    fs.writeFileSync(path.join(flat, 'app/page.ts'), 'export default 1\n')
    const lintFlat = () => {
      const result = spawnSync(process.execPath, [path.join(flat, 'node_modules/eslint/bin/eslint.js'), '--format', 'json', '.'], { cwd: flat, encoding: 'utf8' })
      return JSON.parse(result.stdout).flatMap((file) =>
        file.messages.map((message) => `${path.relative(flat, file.filePath)}:${message.messageId ?? message.message}`)
      )
    }
    // The whole tree, as `eslint .` lints it: the config file and the installed rules are tooling.
    const reported = lintFlat()
    if (reported.length > 0) errors.push(`a clean root-level project fails its lint: ${reported.join(', ')}`)
    // Tooling is still read: a file under rules/ that re-exports a private store is a deep import.
    fs.writeFileSync(path.join(flat, 'rules/bridge.ts'), "export { listOrders } from '../modules/orders/server/store'\n")
    if (!lintFlat().includes('rules/bridge.ts:appInternal')) errors.push('a bridge under rules/ carried a deep import unreported')
    // Nor is tooling a way round a rule that only names its target: product code does not import it.
    fs.writeFileSync(path.join(flat, 'rules/bridge.ts'), 'export const helper = 1\n')
    fs.writeFileSync(path.join(flat, 'modules/orders/server/uses-tooling.ts'), "import { helper } from '../../../rules/bridge'\nexport default helper\n")
    if (!lintFlat().includes('modules/orders/server/uses-tooling.ts:toolingImport')) errors.push('product code imported a tooling file unreported')
  } catch (error) {
    errors.push(`root-level layout: ${error.message}`)
  } finally {
    fs.rmSync(flat, { recursive: true, force: true })
  }

  // What was installed runs: the lint through the copied entry points, a checker from a nested
  // directory.
  const lint = spawnSync(process.execPath, [path.join(repo, 'node_modules/eslint/bin/eslint.js'), '--format', 'json', 'src'], { cwd: repo, encoding: 'utf8' })
  let results = []
  try {
    results = JSON.parse(lint.stdout)
  } catch {
    errors.push(`eslint did not run through the installed rules: ${lint.stdout}${lint.stderr}`.trim())
  }
  const messagesOf = (relative) => results.find((result) => result.filePath === path.join(repo, relative))?.messages ?? []
  if (!messagesOf('src/app/bad/page.ts').some((message) => message.messageId === 'appInternal')) {
    errors.push('the installed boundary rule did not report a deep import from app/**')
  }
  if (!messagesOf('src/modules/orders/server.ts').some((message) => message.ruleId === 'clean-runtime/runtime-markers')) {
    errors.push('the installed resolved tier did not require the server-only marker')
  }
  const cycles = spawnSync(process.execPath, [path.join(repo, 'rules/check-module-cycles.mjs')], { cwd: path.join(repo, 'src/modules/orders'), encoding: 'utf8' })
  if (cycles.status !== 0 || !cycles.stdout.includes('module graph ok')) {
    errors.push(`the installed cycle checker failed: ${cycles.stdout}${cycles.stderr}`.trim())
  }
} catch (error) {
  errors.push(error.message)
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}

fail(errors)
console.log('rules install ok (fresh install, resolvable links, AGENTS.md pointer, idempotent update, stale contract reported, lint and checker run)')
