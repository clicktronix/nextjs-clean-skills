#!/usr/bin/env node
// Two of the module-cohesion properties are directory shape, not import direction, so no ESLint
// import rule can see them: a folder whose only contents are test/mock/fixture artifacts is not a
// product boundary, and lib.ts/lib/ coexisting under one owner means neither was ever finished.
// See designing-architecture/references/placement/module-cohesion.md.
import fs from 'node:fs'
import path from 'node:path'

import {
  loadArchitecturePaths,
  relativeParts,
  isDevelopmentArtifactDirectory,
  isDevelopmentArtifactFile,
  SOURCE_EXTENSIONS,
} from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url)
const { moduleRoot: modulesRoot } = paths

const SOURCE = new RegExp(`\\.(${SOURCE_EXTENSIONS.join('|')})$`)
const LIB_FILE = new RegExp(`^lib\\.(${SOURCE_EXTENSIONS.join('|')})$`)

function posixOf(absolute) {
  return relativeParts(modulesRoot, absolute)?.join('/') ?? absolute
}

// Recurse once per directory and report both properties this checker owns from the same walk: a
// directory's own production content (for the test/mock-only property) and a sibling lib.ts/lib/
// pair (for the split-helpers property). Returns whether `directory` itself contains, anywhere
// beneath it, at least one production source file.
function walk(directory, findings) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  if (entries.length === 0) return false

  const hasLibFile = entries.some((entry) => entry.isFile() && LIB_FILE.test(entry.name))
  const hasLibDirectory = entries.some(
    (entry) => entry.isDirectory() && entry.name === 'lib'
  )
  if (hasLibFile && hasLibDirectory) {
    findings.push({
      rule: 'lib-split',
      message: `${posixOf(directory)}: lib.ts and lib/ coexist under one owner — promote fully to lib/ or fold back into lib.ts, never both`,
    })
  }

  let hasProduction = false
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (isDevelopmentArtifactDirectory(entry.name)) continue
      if (walk(absolute, findings)) hasProduction = true
      continue
    }
    if (SOURCE.test(entry.name) && !isDevelopmentArtifactFile(entry.name)) hasProduction = true
  }

  if (!hasProduction) {
    findings.push({
      rule: 'test-only-directory',
      message: `${posixOf(directory)}: contains only __tests__/__mocks__/fixtures or dev-suffixed files, no production file — not a product boundary, colocate with the production owner`,
    })
  }
  return hasProduction
}

const findings = []
if (fs.existsSync(modulesRoot)) {
  for (const capability of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!capability.isDirectory()) continue
    walk(path.join(modulesRoot, capability.name), findings)
  }
}

if (findings.length > 0) {
  for (const finding of findings) console.error(`module cohesion (${finding.rule}): ${finding.message}`)
  process.exitCode = 1
} else {
  console.log('module cohesion ok (no test/mock-only directories, no lib.ts/lib/ split)')
}
