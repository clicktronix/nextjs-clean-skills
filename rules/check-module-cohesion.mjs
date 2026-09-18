#!/usr/bin/env node
// Two of the module-cohesion properties are directory shape, not import direction, so no ESLint
// import rule can see them: a folder whose only contents are test/mock/fixture artifacts is not a
// product boundary, and lib.ts/lib/ coexisting under one owner means neither was ever finished.
// The walk covers every owner the contract names — capabilities under moduleRoot and the admitted
// shared roots — because the property is about ownership, and shared/** has owners too.
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
const { moduleRoot, sharedRoot, sourceRoot } = paths

const LIB_FILE = new RegExp(`^lib\\.(${SOURCE_EXTENSIONS.join('|')})$`)
const SOURCE_FILE = new RegExp(`\\.(${SOURCE_EXTENSIONS.join('|')})$`)
// `__tests__`, `__mocks__`, `__fixtures__` hold nothing but test support by convention, so their
// contents are never production. A plain `fixtures/` or `tests/` is ambiguous: `fixtures/seed.json`
// is often the runtime seed, so those directories are entered and judged file by file.
const UNAMBIGUOUS_DEV_DIRECTORY = /^__.+__$/

const posixOf = (absolute) => relativeParts(sourceRoot, absolute)?.join('/') ?? absolute

// One recursion reports both properties. Returns whether `directory` holds production content
// anywhere beneath it. A directory is reported as test-only when nothing beneath it is production
// AND no child was already reported for the same reason: the leaf is the finding, its ancestors
// are the consequence, and repeating the message per ancestor buries the one place to fix.
function walk(directory, findings, insideDevDirectory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  if (entries.length === 0) {
    findings.push({
      rule: 'empty-directory',
      message: `${posixOf(directory)}: empty directory — not a product boundary, delete it`,
    })
    return { hasProduction: false, reported: true }
  }

  const hasLibFile = entries.some((entry) => entry.isFile() && LIB_FILE.test(entry.name))
  const hasLibDirectory = entries.some((entry) => entry.isDirectory() && entry.name === 'lib')
  if (hasLibFile && hasLibDirectory) {
    findings.push({
      rule: 'lib-split',
      message: `${posixOf(directory)}: lib.ts and lib/ coexist under one owner — promote fully to lib/ or fold back into lib.ts, never both`,
    })
  }

  let hasProduction = false
  let childReported = false
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (UNAMBIGUOUS_DEV_DIRECTORY.test(entry.name) && isDevelopmentArtifactDirectory(entry.name)) {
        continue
      }
      const child = walk(
        absolute,
        findings,
        insideDevDirectory || isDevelopmentArtifactDirectory(entry.name)
      )
      if (child.hasProduction) hasProduction = true
      if (child.reported) childReported = true
      continue
    }
    // A symlink is followed for what it points at; a dangling one is nothing.
    if (entry.isSymbolicLink()) {
      try {
        if (fs.statSync(absolute).isDirectory()) {
          hasProduction = true // not recursed: a linked tree is owned where it really lives
          continue
        }
      } catch {
        continue
      }
    }
    // Inside a plain `fixtures/` or `tests/`, source files are test support; data, assets, styles
    // and message catalogues are production wherever they sit. Only known development artifacts
    // establish a test-only directory; unknown file kinds do not.
    if (isDevelopmentArtifactFile(entry.name)) continue
    if (insideDevDirectory && SOURCE_FILE.test(entry.name)) continue
    hasProduction = true
  }

  if (!hasProduction && !childReported) {
    findings.push({
      rule: 'test-only-directory',
      message: `${posixOf(directory)}: holds only tests, mocks, fixtures or dev-suffixed files, no production file — not a product boundary, colocate them with the production owner`,
    })
  }
  return { hasProduction, reported: !hasProduction }
}

const findings = []
// A check that walked nothing must not report success: a mistyped moduleRoot would otherwise
// turn every later run green.
if (!fs.existsSync(moduleRoot)) {
  console.error(`module cohesion: moduleRoot ${posixOf(moduleRoot)} does not exist — nothing was checked`)
  process.exit(1)
}
const owners = fs
  .readdirSync(moduleRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(moduleRoot, entry.name))
if (fs.existsSync(sharedRoot)) {
  for (const entry of fs.readdirSync(sharedRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) owners.push(path.join(sharedRoot, entry.name))
  }
}
for (const owner of owners) walk(owner, findings, false)

if (findings.length > 0) {
  for (const finding of findings) console.error(`module cohesion (${finding.rule}): ${finding.message}`)
  process.exitCode = 1
} else {
  console.log(
    `module cohesion ok (${owners.length} owners walked; no test/mock-only or empty directories, no lib.ts/lib/ split)`
  )
}
