#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fail, listFiles, readJson, root } from './_lib.mjs'

// Validates tests/scenarios/**/*.json against the contract documented in
// tests/scenarios/README.md. Scenarios are maintainer/contributor scaffolding (not shipped
// to plugin consumers), but if the repo advertises a contract it must be enforced or it rots.

const skillsRoot = 'plugins/nextjs-clean-skills/skills'
const knownSkills = new Set(
  fs
    .readdirSync(path.join(root, skillsRoot), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
)

// GitHub heading-anchor slug. Matches github-slugger semantics for the ASCII headings used in
// this repo: lowercase, drop everything except [a-z0-9], spaces, and existing hyphens, then turn
// each space into a hyphen WITHOUT collapsing runs. The no-collapse rule is load-bearing: a
// heading like "RSC + Client ..." drops the "+" and leaves two spaces -> "rsc--client-..." (a
// double hyphen). A naive slugifier that collapses spaces would false-positive on that anchor.
function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')
}

function headingSlugs(absFile) {
  const slugs = new Set()
  for (const line of fs.readFileSync(absFile, 'utf8').split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line)
    if (match) slugs.add(slugify(match[1].trim()))
  }
  return slugs
}

const REQUIRED_STRINGS = ['tests_reference', 'query', 'baseline_failure']
const REQUIRED_ARRAYS = ['expected_behavior', 'anti_expectation']

const files = listFiles('tests/scenarios', (file) => file.endsWith('.json'))
const errors = []

if (files.length === 0) {
  errors.push('tests/scenarios: no scenario files found')
}

for (const file of files) {
  let data
  try {
    data = readJson(file)
  } catch (error) {
    errors.push(`${file}: invalid JSON (${error.message})`)
    continue
  }

  if (!Array.isArray(data.skills) || data.skills.length === 0) {
    errors.push(`${file}: "skills" must be a non-empty array`)
  } else {
    for (const skill of data.skills) {
      if (!knownSkills.has(skill)) errors.push(`${file}: unknown skill "${skill}"`)
    }
  }

  for (const key of REQUIRED_STRINGS) {
    if (typeof data[key] !== 'string' || data[key].trim() === '') {
      errors.push(`${file}: "${key}" must be a non-empty string`)
    }
  }

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(data[key]) || data[key].length === 0) {
      errors.push(`${file}: "${key}" must be a non-empty array`)
    }
  }

  // tests_reference: a SKILL.md or references path resolved against the first skill's dir.
  if (typeof data.tests_reference === 'string' && Array.isArray(data.skills) && data.skills[0]) {
    const [refPath, anchor] = data.tests_reference.split('#')
    const refRel = path.join(skillsRoot, data.skills[0], refPath)
    const refAbs = path.join(root, refRel)
    if (!fs.existsSync(refAbs)) {
      errors.push(`${file}: tests_reference file not found: ${refRel}`)
    } else if (anchor && !headingSlugs(refAbs).has(anchor)) {
      errors.push(`${file}: tests_reference anchor "#${anchor}" not found in ${refPath}`)
    }
  }
}

// The coverage table in tests/scenarios/README.md is the inventory this repo reports from, so it
// must agree with the files on disk. It has already carried a scenario twice — once as a
// hypothesis, once as untested — and reported a count that no longer matched.
const COVERAGE = 'tests/scenarios/README.md'
const coverageAbs = path.join(root, COVERAGE)
if (fs.existsSync(coverageAbs)) {
  const listed = new Map()
  for (const line of fs.readFileSync(coverageAbs, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
    if (cells.length < 3 || !cells[0].includes('/')) continue
    for (const name of cells[1].split(/[,\s]+/).filter((token) => /^[a-z0-9-]{4,}$/.test(token))) {
      listed.set(name, (listed.get(name) ?? 0) + 1)
    }
  }
  const onDisk = new Set(files.map((file) => path.basename(file, '.json')))
  for (const [name, count] of listed) {
    if (!onDisk.has(name)) errors.push(`${COVERAGE}: lists "${name}", which is not a scenario file`)
    else if (count > 1) errors.push(`${COVERAGE}: lists "${name}" ${count} times; a scenario belongs to one row`)
  }
  for (const name of onDisk) {
    if (!listed.has(name)) errors.push(`${COVERAGE}: scenario "${name}" exists but no row claims it`)
  }
}

fail(errors)
console.log(`scenarios ok (${files.length})`)
