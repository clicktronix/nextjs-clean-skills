#!/usr/bin/env node
// The reference an agent reads and the table CI enforces must say the same thing.
//
// This exists because they twice did not, and neither the matrix nor any lint could tell: the
// matrix proves the CONFIG matches the TABLE, and says nothing about the prose. The worse of the
// two shipped in a CRITICAL reference whose layer row granted a use-case the union of both
// surfaces' permissions and whose "Correct" example showed an edge the rules reject — the same
// defect this release was written to fix, reintroduced in the document that teaches it.
//
// The check is deliberately one-directional: it fails when the reference grants an edge the rules
// forbid. Prose can legitimately be vaguer than the table ("factories", "technical libraries"), so
// silence about a permitted edge is fine; claiming a forbidden one is not.
import fs from 'node:fs'
import path from 'node:path'
import { fail, readJson, root } from './_lib.mjs'

const REFERENCE =
  'plugins/nextjs-clean-skills/skills/nextjs-architecture/references/placement/layers-and-imports.md'

const errors = []
const table = readJson('rules/import-table.json')
const layers = table.layers
const absolute = path.join(root, REFERENCE)

if (!fs.existsSync(absolute)) {
  fail([`${REFERENCE}: not found — the contract reference moved and this check was not updated.`])
}

// Every markdown table row, split into cells. The layer table is the one whose first column holds
// backticked paths; other tables in the file are skipped by that shape.
const rows = fs
  .readFileSync(absolute, 'utf8')
  .split('\n')
  .filter((line) => line.trim().startsWith('|'))
  .map((line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim())
  )
  .filter((cells) => cells.length >= 3 && /`[^`]+`/.test(cells[0]))

const pathsIn = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
const claimed = new Set()

for (const [name, layer] of Object.entries(layers)) {
  const anchor = layer.reference
  if (!anchor?.row || !anchor?.mention) {
    errors.push(`rules/import-table.json: layer ${name} has no "reference" anchor, so the prose that documents it cannot be checked.`)
    continue
  }

  const matches = rows.filter((cells) => pathsIn(cells[0]).includes(anchor.row))
  if (matches.length === 0) {
    errors.push(
      `${REFERENCE}: no row documents \`${anchor.row}\` (layer ${name}). A layer CI enforces but the reference never mentions is a rule no agent will follow.`
    )
    continue
  }
  if (matches.length > 1) {
    errors.push(`${REFERENCE}: \`${anchor.row}\` appears in ${matches.length} rows; a layer must be documented once.`)
    continue
  }
  matches.forEach((row) => claimed.add(row))

  const permissions = matches[0][matches[0].length - 1]
  const allowed = new Set([...layer.mayImport, name, ...Object.keys(layer.mayImportAt ?? {})])

  for (const [other, otherLayer] of Object.entries(layers)) {
    if (other === name || allowed.has(other)) continue
    const mention = otherLayer.reference?.mention
    if (!mention) continue
    const escaped = mention.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
    if (new RegExp(String.raw`\b${escaped}\b`, 'i').test(permissions)) {
      errors.push(
        `${REFERENCE}: the row for \`${anchor.row}\` lists "${mention}" among what it may import, but rules/import-table.json does not permit ${name} -> ${other}. The document an agent reads and the config CI enforces disagree; fix whichever is wrong, in this commit.`
      )
    }
  }
}

for (const row of rows) {
  if (!claimed.has(row)) {
    errors.push(
      `${REFERENCE}: the row for ${pathsIn(row[0]).map((p) => `\`${p}\``).join(' · ')} matches no layer in rules/import-table.json — a documented layer nothing enforces.`
    )
  }
}

fail(errors)
console.log(`contract sync ok (${Object.keys(layers).length} layers ↔ ${rows.length} documented rows)`)
