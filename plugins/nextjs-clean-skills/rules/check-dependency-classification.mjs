#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function findProjectRoot(start) {
  let current = start
  while (true) {
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'rules', 'architecture-contract.json'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('Cannot find package.json and rules/architecture-contract.json')
    }
    current = parent
  }
}

const packageRoot = (name) => name.split('/')[0]

function matchesClassification(name, admitted) {
  return admitted.has(name) || admitted.has(packageRoot(name))
}

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : findProjectRoot(path.dirname(fileURLToPath(import.meta.url)))
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'rules', 'architecture-contract.json'), 'utf8')
)
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const errors = []

function stringSet(name) {
  const values = contract[name]
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    errors.push(`${name} must be an array of strings`)
    return new Set()
  }
  if (new Set(values).size !== values.length) errors.push(`${name} contains duplicate values`)
  return new Set(values)
}

const purePackages = stringSet('purePackages')
const runtimePackages = stringSet('runtimePackages')

for (const pureName of purePackages) {
  for (const runtimeName of runtimePackages) {
    if (
      pureName === runtimeName ||
      packageRoot(pureName) === runtimeName ||
      packageRoot(runtimeName) === pureName
    ) {
      errors.push(`${pureName} is classified as both pure and runtime-bound`)
    }
  }
}

const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.optionalDependencies,
  ...packageJson.peerDependencies,
}

for (const name of Object.keys(dependencies).sort()) {
  if (
    !matchesClassification(name, purePackages) &&
    !matchesClassification(name, runtimePackages)
  ) {
    errors.push(
      `${name} is unclassified; add its exact package name or scope to purePackages or runtimePackages`
    )
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`dependency classification ok (${Object.keys(dependencies).length} direct packages)`)
