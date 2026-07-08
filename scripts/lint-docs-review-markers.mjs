#!/usr/bin/env node
// The human docs promise: "When a skill rule or template pattern changes, refresh
// this document in the same PR." This check makes that promise CI-enforced: every
// "Last reviewed ... (skill version X.Y.Z)" marker must match version.json, so a
// version bump forces a docs re-review instead of silent drift (found drifted at
// 1.1.0 markers while the plugin was at 1.3.0).
import { fail, readJson, readText } from './_lib.mjs'

const { version } = readJson('version.json')
const files = ['docs/README.md', 'docs/architecture-contract.md', 'docs/agent-decision-maps.md']
// Marker-specific and exhaustive: anchor on "Last reviewed" (bounded lazy gap —
// the README marker wraps across lines) and check EVERY occurrence, so a stray
// "skill version X.Y.Z" in prose can't satisfy the check and a stale second
// marker can't hide behind a fresh first one.
const markerRe = /Last reviewed[\s\S]{0,120}?skill version (\d+\.\d+\.\d+)/g

const errors = []
for (const file of files) {
  const matches = [...readText(file).matchAll(markerRe)]
  if (matches.length === 0) errors.push(`${file}: missing "Last reviewed ... skill version X.Y.Z" review marker.`)
  for (const m of matches)
    if (m[1] !== version)
      errors.push(`${file}: review marker says ${m[1]}, version.json says ${version}. Re-review the doc and update the marker in the same PR.`)
}

fail(errors)
console.log(`docs review markers ok (${files.length} files @ ${version})`)
