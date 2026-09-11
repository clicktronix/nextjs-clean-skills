#!/usr/bin/env node
/**
 * Keeps private provenance out of the shipped surfaces.
 *
 * The evidence in this repository was measured on private repositories. Their names, and absolute
 * paths under a developer's home directory, are not part of the contract and must not travel with
 * the plugin. `CHANGELOG.md` is history and is exempt; so are the raw eval result sets, which are
 * transcripts of runs rather than authored text.
 */
import fs from 'node:fs'
import path from 'node:path'

import { fail, listFiles, root } from './_lib.mjs'

const FORBIDDEN = /stokli|marqa|smartcat|\/Users\/[a-z]+\//i
const ROOTS = ['plugins', 'docs', 'tests/scenarios', 'scripts']
const FILES = ['README.md']
const EXEMPT = [
  'CHANGELOG.md',
  'tests/architecture-evals/results',
  'scripts/lint-provenance.mjs',
]
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zst|gz|tgz|zip|woff2?)$/i

const exempt = (file) => EXEMPT.some((entry) => file === entry || file.startsWith(`${entry}/`))

const candidates = [
  ...ROOTS.flatMap((dir) => listFiles(dir)),
  ...FILES.filter((file) => fs.existsSync(path.join(root, file))),
].filter((file) => !exempt(file) && !BINARY.test(file))

const errors = []
for (const file of candidates) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n')
  lines.forEach((line, index) => {
    const match = line.match(FORBIDDEN)
    if (match) errors.push(`${file}:${index + 1}: private provenance "${match[0]}" in a shipped surface`)
  })
}

fail(errors)
console.log(`provenance ok (${candidates.length} files, no private product names or home paths)`)
