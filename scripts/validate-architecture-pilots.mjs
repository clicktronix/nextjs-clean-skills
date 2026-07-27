#!/usr/bin/env node
import path from 'node:path'

import { fail, readJson, readText } from './_lib.mjs'

const errors = []
const baseline = readJson('tests/architecture-pilots/baseline.json')
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

if (!adr.includes('tests/architecture-pilots/baseline.json')) {
  errors.push('ADR 0001 must link the pinned pilot baseline')
}

fail(errors)
console.log('architecture pilots ok (SHA anchor, 4 preregistered changes, normalized paths)')
