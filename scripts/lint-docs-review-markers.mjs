#!/usr/bin/env node
// The human docs promise: "When a skill rule or template pattern changes, refresh
// this document in the same PR." This check makes that promise CI-enforced: every
// "Last reviewed ... (skill version X.Y.Z)" marker must match version.json, so a
// version bump forces a docs re-review instead of silent drift (found drifted at
// 1.1.0 markers while the plugin was at 1.3.0).
import { fail, readJson, readText } from './_lib.mjs'

const { version } = readJson('version.json')
const files = ['docs/README.md', 'docs/architecture-contract.md', 'docs/agent-decision-maps.md']
const markerRe = /skill version (\d+\.\d+\.\d+)/

const errors = []
for (const file of files) {
  const match = readText(file).match(markerRe)
  if (!match) errors.push(`${file}: missing "skill version X.Y.Z" review marker.`)
  else if (match[1] !== version)
    errors.push(`${file}: review marker says ${match[1]}, version.json says ${version}. Re-review the doc and update the marker in the same PR.`)
}

fail(errors)
console.log(`docs review markers ok (${files.length} @ ${version})`)
