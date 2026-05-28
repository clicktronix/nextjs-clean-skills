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

  // tests_reference: "references/<file>.md#<anchor>" resolved against the first skill's dir.
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

fail(errors)
console.log(`scenarios ok (${files.length})`)
