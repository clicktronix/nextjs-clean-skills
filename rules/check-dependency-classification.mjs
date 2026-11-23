#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

import { isClassified, sameFamily } from './contract-keys.mjs'
import { loadArchitecturePaths } from './contract-paths.mjs'

const { contract, projectRoot: root } = loadArchitecturePaths(import.meta.url, process.argv[2])
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
    if (sameFamily(pureName, runtimeName)) {
      errors.push(`${pureName} is classified as both pure and runtime-bound`)
    }
  }
  for (const serverName of stringSet('serverPackages')) {
    if (sameFamily(pureName, serverName)) {
      errors.push(`${pureName} is classified as both pure and server-only`)
    }
  }
}

for (const provider of stringSet('providerPackages')) {
  if (!isClassified(provider, runtimePackages)) {
    errors.push(`${provider} is a provider package but is not classified in runtimePackages`)
  }
}

const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.optionalDependencies,
  ...packageJson.peerDependencies,
}

for (const name of Object.keys(dependencies).sort()) {
  if (
    !isClassified(name, purePackages) &&
    !isClassified(name, runtimePackages)
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
