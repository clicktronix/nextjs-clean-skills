#!/usr/bin/env node
import path from 'node:path'

import { fail, readJson, readText } from './_lib.mjs'

const errors = []
const baseline = readJson('tests/architecture-pilots/baseline.json')
const candidate = readJson('tests/architecture-pilots/candidate-plan.json')
const readme = readText('tests/architecture-pilots/README.md')
const adr = readText('docs/0001-capability-first-modules.md')

const expectedScenarioIds = [
  'add-due-at',
  'add-http-read-channel',
  'replace-work-item-source',
  'change-unexpected-reporting',
]

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validatePath(value, label, allowTimestampPlaceholder = false) {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${label} must be a non-empty string`)
    return
  }

  const comparable = allowTimestampPlaceholder
    ? value.replace('<timestamp>', '20000101000000')
    : value

  if (
    comparable.includes('\\') ||
    comparable.startsWith('/') ||
    comparable === '.' ||
    comparable === '..' ||
    path.posix.normalize(comparable) !== comparable ||
    comparable.split('/').includes('..')
  ) {
    errors.push(`${label} must be a normalized repository-relative path: ${value}`)
  }

  if (!allowTimestampPlaceholder && value.includes('<')) {
    errors.push(`${label} cannot contain a placeholder: ${value}`)
  }

  if (allowTimestampPlaceholder && /<.*?>/.test(value.replace('<timestamp>', ''))) {
    errors.push(`${label} contains an unsupported placeholder: ${value}`)
  }
}

function validateUniquePaths(values, label, allowTimestampPlaceholder = false) {
  if (!Array.isArray(values)) {
    errors.push(`${label} must be an array`)
    return []
  }

  const seen = new Set()
  for (const [index, value] of values.entries()) {
    validatePath(value, `${label}[${index}]`, allowTimestampPlaceholder)
    if (seen.has(value)) errors.push(`${label} contains duplicate path: ${value}`)
    seen.add(value)
  }
  return values
}

if (baseline.schemaVersion !== 1) {
  errors.push('baseline schemaVersion must be 1')
}

if (!/^[a-f0-9]{40}$/.test(baseline.source?.commit ?? '')) {
  errors.push('baseline source.commit must be a full lowercase Git SHA')
}

if (!baseline.source?.verificationCommand?.includes(baseline.source?.commit ?? '<missing>')) {
  errors.push('baseline verificationCommand must use the pinned source commit')
}

validateUniquePaths(
  baseline.workItems?.filesBeforeRoutePrivateUi,
  'workItems.filesBeforeRoutePrivateUi'
)
validateUniquePaths(baseline.workItems?.compositionRoots, 'workItems.compositionRoots')

if (!Array.isArray(baseline.preregisteredChanges)) {
  errors.push('preregisteredChanges must be an array')
} else {
  const actualIds = baseline.preregisteredChanges.map((scenario) => scenario.id)
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedScenarioIds)) {
    errors.push(
      `preregistered scenario ids must be ${expectedScenarioIds.join(', ')} in that order`
    )
  }

  for (const [index, scenario] of baseline.preregisteredChanges.entries()) {
    const label = `preregisteredChanges[${index}]`
    if (!isObject(scenario.plannedBaselineTouches)) {
      errors.push(`${label}.plannedBaselineTouches must be an object`)
      continue
    }

    const existing = validateUniquePaths(
      scenario.plannedBaselineTouches.existing,
      `${label}.plannedBaselineTouches.existing`
    )
    const added = validateUniquePaths(
      scenario.plannedBaselineTouches.new,
      `${label}.plannedBaselineTouches.new`,
      true
    )

    if (existing.length + added.length === 0) {
      errors.push(`${label} must preregister at least one touched path`)
    }

    const overlap = existing.filter((value) => added.includes(value))
    if (overlap.length > 0) {
      errors.push(`${label} lists paths as both existing and new: ${overlap.join(', ')}`)
    }

    if (!readme.includes(`\`${scenario.id}\``)) {
      errors.push(`pilot README does not name scenario id ${scenario.id}`)
    }
  }
}

if (candidate.schemaVersion !== 1 || candidate.architecture !== 'capability-first') {
  errors.push('candidate plan must use schemaVersion 1 and capability-first architecture')
}

if (!isObject(candidate.fixtures) || Object.keys(candidate.fixtures).length !== 3) {
  errors.push('candidate plan must define exactly three fixtures')
} else {
  for (const [fixtureId, fixture] of Object.entries(candidate.fixtures)) {
    validateUniquePaths(fixture.baseFiles, `candidate.fixtures.${fixtureId}.baseFiles`)
  }
}

const harnessFiles = validateUniquePaths(candidate.harnessFiles, 'candidate.harnessFiles')
const availableCandidatePaths = new Set(harnessFiles)
if (isObject(candidate.fixtures)) {
  for (const fixture of Object.values(candidate.fixtures)) {
    for (const file of fixture.baseFiles ?? []) {
      if (availableCandidatePaths.has(file)) {
        errors.push(`candidate base inventory contains duplicate path: ${file}`)
      }
      availableCandidatePaths.add(file)
    }
  }
}

if (!Array.isArray(candidate.preregisteredChanges)) {
  errors.push('candidate preregisteredChanges must be an array')
} else {
  const actualIds = candidate.preregisteredChanges.map((scenario) => scenario.id)
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedScenarioIds)) {
    errors.push(
      `candidate scenario ids must be ${expectedScenarioIds.join(', ')} in that order`
    )
  }

  for (const [index, scenario] of candidate.preregisteredChanges.entries()) {
    const label = `candidate.preregisteredChanges[${index}].plannedCandidateTouches`
    if (!isObject(scenario.plannedCandidateTouches)) {
      errors.push(`${label} must be an object`)
      continue
    }

    const existing = validateUniquePaths(
      scenario.plannedCandidateTouches.existing,
      `${label}.existing`
    )
    const added = validateUniquePaths(scenario.plannedCandidateTouches.new, `${label}.new`)
    if (existing.length + added.length === 0) {
      errors.push(`${label} must preregister at least one touched path`)
    }

    for (const file of existing) {
      if (!availableCandidatePaths.has(file)) {
        errors.push(`${label}.existing is unavailable before this change: ${file}`)
      }
    }
    for (const file of added) {
      if (availableCandidatePaths.has(file)) {
        errors.push(`${label}.new already exists before this change: ${file}`)
      }
      availableCandidatePaths.add(file)
    }
  }
}

if (!adr.includes('tests/architecture-pilots/baseline.json')) {
  errors.push('ADR 0001 must link the pinned pilot baseline')
}
if (!adr.includes('tests/architecture-pilots/candidate-plan.json')) {
  errors.push('ADR 0001 must link the preregistered candidate plan')
}

fail(errors)
console.log(
  'architecture pilots ok (SHA anchor, 3 planned fixtures, 4 preregistered changes)'
)
