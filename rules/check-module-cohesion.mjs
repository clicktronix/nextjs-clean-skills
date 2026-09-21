#!/usr/bin/env node
// Advisory directory observations, not an ownership or correctness gate. Names cannot tell
// whether fixtures run in production or tests belong to a neighbouring production file.
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
// `__tests__`, `__mocks__`, `__fixtures__` conventionally name test support. Plain
// `fixtures/` or `tests/` is ambiguous, so inspect those directories file by file.
const UNAMBIGUOUS_DEV_DIRECTORY = /^__.+__$/

const posixOf = (absolute) => relativeParts(sourceRoot, absolute)?.join('/') ?? absolute

// Report the deepest observation once. hasProduction is a naming heuristic, not evidence
// of runtime use or ownership; callers must read consumers before proposing a change.
function walk(directory, findings, insideDevDirectory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  if (entries.length === 0) {
    findings.push({
      rule: 'empty-directory',
      message: `${posixOf(directory)}: empty directory — check whether it is still useful`,
    })
    return { hasProduction: false, reported: true }
  }

  const hasLibFile = entries.some((entry) => entry.isFile() && LIB_FILE.test(entry.name))
  const hasLibDirectory = entries.some((entry) => entry.isDirectory() && entry.name === 'lib')
  if (hasLibFile && hasLibDirectory) {
    findings.push({
      rule: 'lib-split',
      message: `${posixOf(directory)}: lib.ts and lib/ coexist — review their responsibilities if navigation is unclear`,
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
    // Inside a plain `fixtures/` or `tests/`, source names suggest test support, but may
    // also be runtime seeds. Unknown file kinds are not evidence for this observation.
    if (isDevelopmentArtifactFile(entry.name)) continue
    if (insideDevDirectory && SOURCE_FILE.test(entry.name)) continue
    hasProduction = true
  }

  if (!hasProduction && !childReported) {
    findings.push({
      rule: 'test-only-directory',
      message: `${posixOf(directory)}: looks like test support by naming convention — it may belong to a neighbouring file or contain runtime fixtures; inspect consumers before changing it`,
    })
  }
  return { hasProduction, reported: !hasProduction }
}

const findings = []
// Distinguish a configuration error from a successfully completed advisory walk.
if (!fs.existsSync(moduleRoot)) {
  console.error(`module cohesion: moduleRoot ${posixOf(moduleRoot)} does not exist — nothing was checked`)
  process.exit(2)
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
  for (const finding of findings) console.log(`module cohesion advice (${finding.rule}): ${finding.message}`)
} else {
  console.log(
    `module cohesion advice: no directory observations (${owners.length} owners walked; semantic cohesion was not assessed)`
  )
}
