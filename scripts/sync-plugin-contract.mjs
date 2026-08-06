#!/usr/bin/env node
// Mirrors docs/ and rules/ into the plugin so an installed copy carries the
// normative contract the migration workflows read. The repo root stays the
// single source of truth; this tree is derived and must never be hand-edited.
//
// Relative links are rewritten because the copy sits one directory deeper and
// beside skills/ rather than beside plugins/:
//   ../plugins/nextjs-clean-skills/skills/  ->  ../skills/     (shipped)
//   ../tests/                               ->  a GitHub URL   (not shipped)
// Everything else already resolves: ./<doc>.md because all of docs/ is copied,
// and ../rules/ because rules/ is copied alongside.
import fs from 'node:fs'
import path from 'node:path'
import { fail, listFiles, root } from './_lib.mjs'

const PLUGIN = 'plugins/nextjs-clean-skills'
const BLOB = 'https://github.com/clicktronix/nextjs-clean-skills/blob/main'
const check = process.argv.includes('--check')

const rewrite = (text) =>
  text
    .replaceAll('](../plugins/nextjs-clean-skills/skills/', '](../skills/')
    .replaceAll('](../tests/', `](${BLOB}/tests/`)

const sources = [
  ...listFiles('docs', (file) => file.endsWith('.md')),
  ...listFiles('rules', () => true),
].sort()

const errors = []
let written = 0

for (const source of sources) {
  const target = path.join(PLUGIN, source)
  const absoluteSource = path.join(root, source)
  const absoluteTarget = path.join(root, target)
  const wanted = source.endsWith('.md')
    ? rewrite(fs.readFileSync(absoluteSource, 'utf8'))
    : fs.readFileSync(absoluteSource)

  if (check) {
    if (!fs.existsSync(absoluteTarget)) {
      errors.push(`${target} is missing; run \`npm run sync-plugin-contract\``)
      continue
    }
    const actual = fs.readFileSync(absoluteTarget, source.endsWith('.md') ? 'utf8' : null)
    const same = source.endsWith('.md') ? actual === wanted : Buffer.compare(actual, wanted) === 0
    if (!same) errors.push(`${target} is stale; run \`npm run sync-plugin-contract\``)
    continue
  }

  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true })
  fs.writeFileSync(absoluteTarget, wanted)
  written += 1
}

// A file deleted at the source must disappear from the copy too, or the plugin
// keeps shipping guidance the repository has already retracted.
const expected = new Set(sources.map((source) => path.join(PLUGIN, source)))
for (const directory of ['docs', 'rules']) {
  const shipped = fs.existsSync(path.join(root, PLUGIN, directory))
    ? listFiles(`${PLUGIN}/${directory}`, () => true)
    : []
  for (const file of shipped) {
    if (expected.has(file)) continue
    if (check) errors.push(`${file} has no source under ${directory}/; run \`npm run sync-plugin-contract\``)
    else fs.rmSync(path.join(root, file))
  }
}

fail(errors)
console.log(
  check
    ? `plugin contract ok (${sources.length} files mirrored into ${PLUGIN}/)`
    : `plugin contract synced (${written} files into ${PLUGIN}/)`
)
