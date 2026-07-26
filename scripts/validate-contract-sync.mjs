#!/usr/bin/env node
// Human docs, agent instructions, and executable rules must describe one import contract.
//
// The human layer table is generated from root, owns, mayImport, and mayImportAt; the compact agent
// table and skill block use the same roots and permissions. Hand-written labels previously let two
// prose surfaces agree while disagreeing with the paths ESLint enforced. `--fix` replaces marked
// regions only; missing markers remain a structural error.
import fs from 'node:fs'
import path from 'node:path'
import { fail, readJson, root } from './_lib.mjs'

const REFERENCE =
  'plugins/nextjs-clean-skills/skills/nextjs-architecture/references/placement/layers-and-imports.md'
const HUMAN_CONTRACT = 'docs/architecture-contract.md'
const SKILL = 'plugins/nextjs-clean-skills/skills/nextjs-architecture/SKILL.md'

const TABLE_OPEN = '<!-- contract:layer-table -->'
const TABLE_CLOSE = '<!-- /contract:layer-table -->'
const IMPORTS_OPEN = '<!-- contract:imports -->'
const IMPORTS_CLOSE = '<!-- /contract:imports -->'

const fixing = process.argv.includes('--fix')
const errors = []
const table = readJson('rules/import-table.json')
const layers = table.layers
const names = Object.keys(layers)

const label = (name) => `${layers[name].root.replace(/^src\//, '')}/**`

const permissions = (name) => {
  const layer = layers[name]
  const parts = [
    ...layer.mayImport,
    ...Object.entries(layer.mayImportAt ?? {}).map(([target, at]) => `${target} (${at.join(', ')} only)`),
  ]
  return parts.length > 0 ? parts.join(', ') : 'nothing in src/'
}

for (const name of names) {
  const owns = layers[name].owns
  if (typeof owns !== 'string' || owns.trim() === '') {
    errors.push(`rules/import-table.json: layers.${name}.owns must be a non-empty string`)
  } else if (owns.includes('|') || owns.includes('\n')) {
    errors.push(`rules/import-table.json: layers.${name}.owns must fit in one Markdown table cell`)
  }
}

const humanLayerTable = [
  TABLE_OPEN,
  '| Layer | Owns | May import |',
  '| --- | --- | --- |',
  ...names.map(
    (name) => `| \`${label(name)}\` | ${layers[name].owns} | ${permissions(name)} |`
  ),
  TABLE_CLOSE,
].join('\n')

const referenceLayerTable = [
  TABLE_OPEN,
  '| Layer | May import |',
  '| --- | --- |',
  ...names.map((name) => `| \`${label(name)}\` | ${permissions(name)} |`),
  TABLE_CLOSE,
].join('\n')

const width = Math.max(...names.map((name) => label(name).length))
const skillImports = [
  IMPORTS_OPEN,
  '```text',
  'Compile-time imports (generated from rules/import-table.json):',
  ...names.map((name) => `  ${label(name).padEnd(width + 2)}${permissions(name)}`),
  '```',
  IMPORTS_CLOSE,
].join('\n')

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, text) => fs.writeFileSync(path.join(root, file), text)
const count = (text, marker) => text.split(marker).length - 1

const replaceRegion = (file, text, open, close, expected) => {
  const openCount = count(text, open)
  const closeCount = count(text, close)
  if (openCount !== 1 || closeCount !== 1) {
    errors.push(
      `${file}: expected one ${open} and one ${close}; found ${openCount} and ${closeCount}`
    )
    return text
  }

  const start = text.indexOf(open)
  const end = text.indexOf(close, start + open.length)
  if (end === -1) {
    errors.push(`${file}: ${close} appears before ${open}`)
    return text
  }

  const actual = text.slice(start, end + close.length)
  if (actual === expected) return text
  if (!fixing) {
    errors.push(
      `${file}: generated contract does not match rules/import-table.json. Run \`node scripts/validate-contract-sync.mjs --fix\`.`
    )
    return text
  }

  return text.slice(0, start) + expected + text.slice(end + close.length)
}

const documents = [
  [REFERENCE, TABLE_OPEN, TABLE_CLOSE, referenceLayerTable],
  [HUMAN_CONTRACT, TABLE_OPEN, TABLE_CLOSE, humanLayerTable],
  [SKILL, IMPORTS_OPEN, IMPORTS_CLOSE, skillImports],
]

const updates = documents.map(([file, open, close, expected]) => {
  const current = read(file)
  return [file, current, replaceRegion(file, current, open, close, expected)]
})

fail(errors)

if (fixing) {
  for (const [file, current, next] of updates) {
    if (next !== current) write(file, next)
  }
}

console.log(
  fixing
    ? `contract sync written (${names.length} layers -> reference, human contract, skill)`
    : `contract sync ok (${names.length} layers, generated into 3 surfaces)`
)
