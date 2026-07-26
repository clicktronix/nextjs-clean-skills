#!/usr/bin/env node
// The documents an agent reads and the contract CI enforces must say the same thing.
//
// Version one of this check compared two hand-written labels — a `reference.row` in the table and
// a row in the prose — so it proved they matched each other and nothing about the enforced root or
// permissions. Renaming a layer in both places passed; documenting "same as inbound" while the
// permissions diverged passed. Both were found by mutation, so the labels are gone: the expected
// text is now GENERATED from `root` and `mayImport`, and the documents must contain it verbatim.
//
// `--fix` writes the generated text into both documents, which is how they are meant to be edited:
// change the table, run the fixer, review the diff.
import fs from 'node:fs'
import path from 'node:path'
import { fail, readJson, root } from './_lib.mjs'

const REFERENCE =
  'plugins/nextjs-clean-skills/skills/nextjs-architecture/references/placement/layers-and-imports.md'
const SKILL = 'plugins/nextjs-clean-skills/skills/nextjs-architecture/SKILL.md'
const OPEN = '<!-- contract:imports -->'
const CLOSE = '<!-- /contract:imports -->'

const fixing = process.argv.includes('--fix')
const errors = []
const table = readJson('rules/import-table.json')
const layers = table.layers
const names = Object.keys(layers)

/** The layer's documented label, derived from the root it is actually enforced at. */
const label = (name) => `${layers[name].root.replace(/^src\//, '')}/**`

/** What the layer may import, in the table's own vocabulary. Names, not prose. */
const permissions = (name) => {
  const layer = layers[name]
  const parts = [
    ...layer.mayImport,
    ...Object.entries(layer.mayImportAt ?? {}).map(([target, at]) => `${target} (${at.join(', ')} only)`),
  ]
  return parts.length > 0 ? parts.join(', ') : 'nothing in src/'
}

// ---------------------------------------------------------------- the reference's layer table

const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, text) => fs.writeFileSync(path.join(root, file), text)

const referenceText = readText(REFERENCE)
const referenceRows = referenceText
  .split('\n')
  .map((line, index) => ({ line, index }))
  .filter(({ line }) => line.trim().startsWith('|') && /`[^`]+`/.test(line))
  .map(({ line, index }) => ({
    index,
    cells: line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()),
  }))
  .filter(({ cells }) => cells.length >= 3)

const pathsIn = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
const claimed = new Set()
const referenceLines = referenceText.split('\n')

for (const name of names) {
  const expected = permissions(name)
  const matches = referenceRows.filter((row) => pathsIn(row.cells[0]).includes(label(name)))
  if (matches.length === 0) {
    errors.push(
      `${REFERENCE}: no row documents \`${label(name)}\` — a layer CI enforces that the reference never mentions is a rule no agent will follow.`
    )
    continue
  }
  if (matches.length > 1) {
    errors.push(`${REFERENCE}: \`${label(name)}\` appears in ${matches.length} rows; document it once.`)
    continue
  }
  const row = matches[0]
  claimed.add(row.index)
  const actual = row.cells[row.cells.length - 1]
  if (actual === expected) continue
  if (fixing) {
    const cells = [...row.cells]
    cells[cells.length - 1] = expected
    referenceLines[row.index] = `| ${cells.join(' | ')} |`
  } else {
    errors.push(
      `${REFERENCE}: the row for \`${label(name)}\` documents "${actual}" but rules/import-table.json permits "${expected}". Run \`node scripts/validate-contract-sync.mjs --fix\` after deciding which is right.`
    )
  }
}

for (const row of referenceRows) {
  if (!claimed.has(row.index) && !/^\s*-+\s*$/.test(row.cells[0]) && pathsIn(row.cells[0]).length > 0) {
    errors.push(
      `${REFERENCE}: the row for ${pathsIn(row.cells[0]).map((p) => `\`${p}\``).join(' · ')} matches no layer root in rules/import-table.json — a documented layer nothing enforces.`
    )
  }
}

if (fixing) write(REFERENCE, referenceLines.join('\n'))

// ------------------------------------------------- the always-loaded compile-time contract block

const width = Math.max(...names.map((name) => label(name).length))
const block = [
  OPEN,
  '```text',
  'Compile-time imports (generated from rules/import-table.json):',
  ...names.map((name) => `  ${label(name).padEnd(width + 2)}${permissions(name)}`),
  '```',
  CLOSE,
].join('\n')

const skillText = readText(SKILL)
const start = skillText.indexOf(OPEN)
const end = skillText.indexOf(CLOSE)
if (start === -1 || end === -1) {
  errors.push(
    `${SKILL}: no ${OPEN} … ${CLOSE} region. The always-loaded contract must be generated from the table, not restated by hand — that is how it came to require behaviour the references had already replaced.`
  )
} else {
  const actual = skillText.slice(start, end + CLOSE.length)
  if (actual !== block) {
    if (fixing) write(SKILL, skillText.slice(0, start) + block + skillText.slice(end + CLOSE.length))
    else
      errors.push(
        `${SKILL}: the compile-time block does not match rules/import-table.json. Run \`node scripts/validate-contract-sync.mjs --fix\`.`
      )
  }
}

fail(errors)
console.log(
  fixing
    ? `contract sync written (${names.length} layers -> ${REFERENCE}, ${SKILL})`
    : `contract sync ok (${names.length} layers, generated from root + mayImport)`
)
