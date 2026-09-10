#!/usr/bin/env node
/**
 * Proves that an eval cell cannot read the author's agent configuration.
 *
 * Before 2026-09-10 every cell ran with `{ ...process.env, CODEX_HOME: codexHome }`, so `HOME`
 * stayed the author's and the "no skill" arm could still resolve `~/.agents/skills`. The cases
 * below build the cell environment through the same `buildCellEnv()` the two runners use, with a
 * stand-in author home that holds a canary skill, and assert the canary is unreachable. The last
 * case runs the unsanitized environment on purpose: if it did not leak, the check would be
 * passing for the wrong reason.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildCellEnv, USER_CONFIG_ENV_KEYS } from './eval-env.mjs'
import { fail } from './_lib.mjs'

const errors = []
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nextjs-eval-isolation-'))

// The author's account, as a stand-in: a home directory with an architecture skill installed.
const authorHome = path.join(base, 'author-home')
const canary = path.join(authorHome, '.agents', 'skills', 'canary', 'SKILL.md')
fs.mkdirSync(path.dirname(canary), { recursive: true })
fs.writeFileSync(canary, '---\nname: canary\n---\n\nCanary skill that no eval arm may read.\n')

// The throwaway home a cell gets, shaped like `createEvalSandbox()`.
const cellHome = path.join(base, 'cell-home')
const cellCodexHome = path.join(cellHome, '.codex')
fs.mkdirSync(path.join(cellHome, 'tmp'), { recursive: true })
fs.mkdirSync(cellCodexHome, { recursive: true })

const baseEnv = {
  ...process.env,
  HOME: authorHome,
  CODEX_HOME: path.join(authorHome, '.codex'),
  CLAUDE_CONFIG_DIR: path.join(authorHome, '.claude'),
  XDG_CONFIG_HOME: path.join(authorHome, '.config'),
  AGENT_SKILLS_DIR: path.join(authorHome, '.agents', 'skills'),
  SOME_TOOL_CACHE: path.join(authorHome, '.cache', 'tool'),
  PATH: `${path.join(authorHome, '.local', 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
}

const cellEnv = buildCellEnv({ home: cellHome, codexHome: cellCodexHome, base: baseEnv })

// (a) the cell does not inherit a home directory.
if (cellEnv.HOME === baseEnv.HOME || cellEnv.HOME === process.env.HOME) {
  errors.push('cell HOME must not be the author home')
}
if (cellEnv.HOME !== cellHome || cellEnv.CODEX_HOME !== cellCodexHome) {
  errors.push('cell HOME/CODEX_HOME must point at the throwaway sandbox')
}

// (b) nothing left in the environment names a real home directory, PATH entries included.
for (const [key, value] of Object.entries(cellEnv)) {
  for (const home of [authorHome, process.env.HOME, os.homedir()].filter(Boolean)) {
    if (value.includes(home)) errors.push(`cell env ${key} still contains ${home}`)
  }
}
for (const key of USER_CONFIG_ENV_KEYS) {
  if (key === 'CODEX_HOME') continue
  if (key in cellEnv) errors.push(`cell env must not carry ${key}`)
}

// (c) a stub standing in for `codex` writes an events file that never names the canary.
const stub = path.join(base, 'stub-codex.mjs')
fs.writeFileSync(
  stub,
  `import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = process.env.HOME ?? os.homedir()
const found = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(child)
    else found.push(child)
  }
}
try {
  walk(path.join(home, '.agents', 'skills'))
} catch {}
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string' && value.includes('.agents')) found.push(\`env:\${key}=\${value}\`)
}
process.stdout.write(\`\${JSON.stringify({ type: 'skills_seen', home, found })}\\n\`)
`,
)

function runStub(env, eventsPath) {
  const result = spawnSync(process.execPath, [stub], { encoding: 'utf8', env, cwd: base })
  if (result.status !== 0) throw new Error(`stub failed: ${result.stderr}`)
  fs.writeFileSync(eventsPath, result.stdout)
  return fs.readFileSync(eventsPath, 'utf8')
}

const isolatedEvents = runStub(cellEnv, path.join(base, 'events.jsonl'))
if (isolatedEvents.includes(canary) || isolatedEvents.includes(authorHome)) {
  errors.push('events.jsonl produced under the isolated env names the canary skill')
}

// The mutation: the pre-2026-09-10 environment. It must leak, or case (c) proves nothing.
const leakyEnv = { ...baseEnv, CODEX_HOME: cellCodexHome }
const leakedEvents = runStub(leakyEnv, path.join(base, 'events.leaky.jsonl'))
if (!leakedEvents.includes(canary)) {
  errors.push('the inherited-HOME mutation did not leak the canary; the isolation case is vacuous')
}

fs.rmSync(base, { recursive: true, force: true })

fail(errors)
console.log('eval isolation ok (fresh HOME/CODEX_HOME, no author paths in env, canary unreachable)')
