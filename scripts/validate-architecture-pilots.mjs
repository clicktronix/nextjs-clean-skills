#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { fail, listFiles, readJson, readText, root } from './_lib.mjs'

const errors = []
const baseline = readJson('tests/architecture-pilots/baseline.json')
const candidate = readJson('tests/architecture-pilots/candidate-plan.json')
const results = readJson('tests/architecture-pilots/results.json')
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

function matchesPlannedPath(actual, planned) {
  if (!planned.includes('<timestamp>')) return actual === planned

  const [prefix, suffix] = planned.split('<timestamp>')
  const middle = actual.slice(prefix.length, actual.length - suffix.length)
  return (
    actual.startsWith(prefix) &&
    actual.endsWith(suffix) &&
    middle.length > 0 &&
    !middle.includes('/')
  )
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
if (!adr.includes('tests/architecture-pilots/RESULTS.md')) {
  errors.push('ADR 0001 must link the pilot results')
}

if (results.schemaVersion !== 1) {
  errors.push('pilot results schemaVersion must be 1')
}
if (results.controls?.sourceBaseline !== baseline.source?.commit) {
  errors.push('pilot results sourceBaseline must match the pinned baseline commit')
}
if (results.controls?.baselineReplay?.repository !== baseline.source?.repository) {
  errors.push('pilot results baseline replay repository must match the pinned baseline repository')
}
if (typeof results.controls?.baselineReplay?.branch !== 'string') {
  errors.push('pilot results baseline replay branch must be a string')
}
if (!/^[a-f0-9]{40}$/.test(results.controls?.baselineReplay?.head ?? '')) {
  errors.push('pilot results baseline replay head must be a full lowercase Git SHA')
}
if (results.pilotEvidence?.typeScriptFiles !== listFiles(
  'tests/architecture-pilots/fixtures',
  (file) => file.endsWith('.ts')
).length) {
  errors.push('pilot results typeScriptFiles does not match the fixture inventory')
}

if (!Array.isArray(results.changes)) {
  errors.push('pilot results changes must be an array')
} else {
  const resultIds = results.changes.map((change) => change.id)
  if (JSON.stringify(resultIds) !== JSON.stringify(expectedScenarioIds)) {
    errors.push(`pilot result ids must be ${expectedScenarioIds.join(', ')} in that order`)
  }

  for (const result of results.changes) {
    const candidateScenario = candidate.preregisteredChanges.find(
      (scenario) => scenario.id === result.id
    )
    const baselineScenario = baseline.preregisteredChanges.find(
      (scenario) => scenario.id === result.id
    )
    if (!candidateScenario || !baselineScenario) continue

    if (!/^[a-f0-9]{40}$/.test(result.commit ?? '')) {
      errors.push(`${result.id}: result commit must be a full lowercase Git SHA`)
      continue
    }

    let commitPaths = []
    try {
      commitPaths = execFileSync(
        'git',
        ['diff-tree', '--no-commit-id', '--name-only', '-r', result.commit],
        { cwd: root, encoding: 'utf8' }
      )
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort()
    } catch {
      errors.push(`${result.id}: cannot inspect result commit ${result.commit}`)
      continue
    }

    const recordedPaths = [...(result.candidate?.actualPaths ?? [])].sort()
    if (JSON.stringify(recordedPaths) !== JSON.stringify(commitPaths)) {
      errors.push(`${result.id}: recorded actualPaths do not match the commit diff`)
    }

    const plannedPaths = [
      ...candidateScenario.plannedCandidateTouches.existing,
      ...candidateScenario.plannedCandidateTouches.new,
    ].sort()
    const unexpected = commitPaths.filter((file) => !plannedPaths.includes(file))
    const missing = plannedPaths.filter((file) => !commitPaths.includes(file))
    const deviationPaths = (result.candidate?.deviations ?? [])
      .map((deviation) => deviation.path)
      .sort()

    if (missing.length > 0) {
      errors.push(`${result.id}: planned paths missing from result: ${missing.join(', ')}`)
    }
    if (JSON.stringify(unexpected) !== JSON.stringify(deviationPaths)) {
      errors.push(`${result.id}: deviations must name every unplanned commit path`)
    }
    if (result.candidate?.matchesPlan !== (unexpected.length === 0 && missing.length === 0)) {
      errors.push(`${result.id}: matchesPlan does not match the observed diff`)
    }

    const productionTypeScriptFiles = commitPaths.filter(
      (file) =>
        file.startsWith('tests/architecture-pilots/fixtures/') &&
        (file.endsWith('.ts') || file.endsWith('.tsx'))
    ).length
    if (result.candidate?.productionTypeScriptFiles !== productionTypeScriptFiles) {
      errors.push(`${result.id}: productionTypeScriptFiles does not match the observed diff`)
    }

    const testOrHarnessFiles = commitPaths.length - productionTypeScriptFiles
    if (result.candidate?.testOrHarnessFiles !== testOrHarnessFiles) {
      errors.push(`${result.id}: testOrHarnessFiles does not match the observed diff`)
    }

    const plannedBaselinePaths = [
      ...baselineScenario.plannedBaselineTouches.existing,
      ...baselineScenario.plannedBaselineTouches.new,
    ]
    if (result.baselineObserved?.plannedPaths !== plannedBaselinePaths.length) {
      errors.push(`${result.id}: baseline planned path count does not match baseline.json`)
    }

    const observedCommits = result.baselineObserved?.commits
    if (!Array.isArray(observedCommits) || observedCommits.length === 0) {
      errors.push(`${result.id}: baseline observed commits must be a non-empty array`)
    } else {
      const uniqueCommits = new Set(observedCommits)
      if (uniqueCommits.size !== observedCommits.length) {
        errors.push(`${result.id}: baseline observed commits contain duplicates`)
      }
      for (const commit of observedCommits) {
        if (!/^[a-f0-9]{40}$/.test(commit)) {
          errors.push(`${result.id}: invalid baseline observed commit ${commit}`)
        }
      }
    }

    const observedPaths = validateUniquePaths(
      result.baselineObserved?.actualPaths,
      `${result.id}.baselineObserved.actualPaths`
    )
    if (result.baselineObserved?.observedPaths !== observedPaths.length) {
      errors.push(`${result.id}: baseline observed path count does not match actualPaths`)
    }

    const unexpectedBaselinePaths = observedPaths.filter(
      (actual) => !plannedBaselinePaths.some((planned) => matchesPlannedPath(actual, planned))
    )
    const missingBaselinePaths = plannedBaselinePaths.filter(
      (planned) => !observedPaths.some((actual) => matchesPlannedPath(actual, planned))
    )
    const baselineDeviationPaths = (result.baselineObserved?.deviations ?? [])
      .map((deviation) => deviation.path)
      .sort()
    if (missingBaselinePaths.length > 0) {
      errors.push(
        `${result.id}: planned baseline paths missing from replay: ${missingBaselinePaths.join(', ')}`
      )
    }
    if (
      JSON.stringify(unexpectedBaselinePaths.sort()) !==
      JSON.stringify(baselineDeviationPaths)
    ) {
      errors.push(`${result.id}: baseline deviations must name every unplanned replay path`)
    }
    if (
      result.baselineObserved?.matchesPlan !==
      (unexpectedBaselinePaths.length === 0 && missingBaselinePaths.length === 0)
    ) {
      errors.push(`${result.id}: baseline matchesPlan does not match the observed replay`)
    }
  }
}

fail(errors)
console.log(
  'architecture pilots ok (SHA anchor, 3 fixtures, 4 commit-bound change results)'
)
