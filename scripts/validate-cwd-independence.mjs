#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { root } from './_lib.mjs'

const probe = `
  const lib = await import(${JSON.stringify(pathToFileURL(path.join(root, 'scripts/_lib.mjs')).href)})
  const skills = lib.listFiles('plugins/nextjs-clean-skills/skills', (file) => file.endsWith('SKILL.md'))
  process.stdout.write(JSON.stringify({ root: lib.root, skills }))
`

const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
  cwd: path.join(root, 'docs'),
  encoding: 'utf8',
})

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

let observed
try {
  observed = JSON.parse(result.stdout)
} catch {
  console.error('cwd probe returned invalid JSON')
  process.exit(1)
}

const expectedSkills = [
  'plugins/nextjs-clean-skills/skills/nextjs-architecture/SKILL.md',
  'plugins/nextjs-clean-skills/skills/react-component-creator/SKILL.md',
]
const observedSkills = observed.skills.map((file) => file.split(path.sep).join('/'))

if (path.resolve(observed.root) !== root) {
  console.error(`cwd probe resolved ${observed.root}; expected ${root}`)
  process.exit(1)
}

for (const file of expectedSkills) {
  if (!observedSkills.includes(file) || !fs.existsSync(path.join(root, file))) {
    console.error(`cwd probe did not inventory ${file}`)
    process.exit(1)
  }
}

console.log(`cwd independence ok (${expectedSkills.length} skills from docs/)`)
