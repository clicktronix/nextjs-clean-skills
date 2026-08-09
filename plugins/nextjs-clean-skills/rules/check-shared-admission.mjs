#!/usr/bin/env node
/**
 * Enforces the countable half of the shared-admission rule the architecture states:
 *
 *   "Promote code to shared/** only when at least two real capabilities share identical meaning
 *    and lifecycle, no capability is the natural owner, and coordination is cheaper than
 *    duplication."
 *
 * Only the number of real consumers is decidable here. Identical meaning, identical lifecycle and
 * coordination cost stay a review judgement, and this check never claims otherwise — see
 * docs/adoption-and-enforcement.md § What Static Rules Cannot Prove, which forbids adding a
 * syntactic proxy in order to claim a semantic property is linted.
 *
 * A consumer is an OWNER, not a file: a capability, `app`, or another shared root. Two files of one
 * capability importing a helper is one consumer, and that capability is its natural owner.
 *
 * Verdicts per file under sharedRoot:
 *   unused        nothing imports it -> delete
 *   demote        its only owner is one capability -> that capability is the natural home
 *   speculative   exactly one importing file and no capability to demote into -> written for a
 *                 second consumer that never arrived
 *   private       imported only from inside its own shared root -> that root's implementation
 *                 detail rather than an admitted surface, which the rule does not govern
 *   ok            everything else
 *
 * `app` is deliberately not treated the way a capability is. Route composition is not somewhere to
 * demote infrastructure into, so an app-only owner fails only when exactly one file imports it.
 *
 * Tests are not consumers: a helper kept alive only by its own test is dead code with a test.
 */
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import {
  loadArchitecturePaths,
  isWithin,
  relativeParts,
  resolveToExistingFile,
  SOURCE_EXTENSIONS,
} from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url, process.argv[2])
const { contract, projectRoot, sourceRoot, moduleRoot, appRoot, sharedRoot } = paths

/**
 * The budget and the exemptions live in the CONTRACT, not in this file.
 *
 * The rule is an absolute, but no repository adopting it grew up under it, so the check ships as a
 * ratchet: a count may fall and never rise. Those numbers describe one repository's debt — put them
 * in the script and the first target to vendor it edits the script, which forks it from this source
 * and ends its ability to be re-synced. That is not hypothetical: it is what happened to the copy
 * this check was ported from.
 *
 * Absent from the contract, the budget is zero on every count: a repository that has never run the
 * check learns its real numbers from the first failure and records them deliberately.
 */
const budget = {
  unused: 0,
  demote: 0,
  speculative: 0,
  ...(contract.sharedAdmissionBudget ?? {}),
}

/**
 * Project-relative paths the rule cannot apply to, each admitted WITH ITS REASON. Read as a plain
 * list of paths, there was no value an author could write that both matched a path and carried the
 * rationale this file's own failure message demands — so the requirement was unsatisfiable and
 * every exemption was silently reasonless. An object is the representable form; a bare array is
 * still accepted so an existing contract keeps working, and is reported as what it is.
 */
const sharedRoots = new Set(contract.sharedRoots ?? [])
const exemptions = contract.sharedAdmissionExempt ?? {}
const exempt = new Set(Array.isArray(exemptions) ? exemptions : Object.keys(exemptions))
const reasonless = [...exempt].filter(
  (file) => !String((Array.isArray(exemptions) ? '' : exemptions[file]) ?? '').trim()
)

// Every extension inventory in this file comes from the one exported list. Written out by hand they
// drifted apart, and each drift is the same defect wearing a different hat: the scan restricted to
// `.ts`/`.tsx` did not narrow the check, it broke it — an importer the scan never opened is an
// importer that does not exist, a file with no importers is `unused`, and `unused` prints as
// "delete it". The exclusions drifted the other way: `.test.js` was not recognised as a test, so a
// test counted as a real owner, and `button.stories.js` was not recognised as a story, so a file
// nothing imports by design was judged deletable.
const EXT = SOURCE_EXTENSIONS.join('|')
const SOURCE = new RegExp(`\\.(${EXT})$`)
/**
 * Development artifacts: tests, mocks and stories. None of them ships, and the rule they feed is
 * "at least two real capabilities" — so none of them is an owner. They were treated three different
 * ways: tests skipped both as subjects and as importers, `__mocks__` skipped nowhere, and stories
 * skipped as subjects while still counting as importers, which let one production capability plus
 * one story satisfy the two-owner threshold. Symmetric now, in both directions.
 *
 * A shared file whose only importer is a story is therefore `unused`, and that verdict is honest:
 * shared code exists for two product consumers, and a story is not one of them.
 *
 * `.stories.mdx` is deliberately absent — `listSources()` never opens an `.mdx` file, so naming it
 * here would have been a rule about files this check cannot see.
 */
const isDevArtifact = (file) =>
  new RegExp(`\\.(test|spec|stories)\\.(${EXT})$`).test(file) ||
  ['__tests__', '__mocks__'].some((directory) => file.includes(`${path.sep}${directory}${path.sep}`))

function listSources(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSources(absolute)
    return SOURCE.test(entry.name) ? [absolute] : []
  })
}


function specifiersOf(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const found = []
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments
      if (argument && ts.isStringLiteral(argument)) found.push(argument.text)
    }
    // `require('x')` and `import x = require('x')`. A repository mid-migration has both, and either
    // one missed is an uncounted importer — which this file turns into advice to delete a live file.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text)
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      found.push(node.moduleReference.expression.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const capabilities = new Set(
  fs.existsSync(moduleRoot)
    ? fs.readdirSync(moduleRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : []
)

/**
 * Which owner does an importing file belong to, or null when the contract cannot name one?
 *
 * The null case is the pre-migration tree: files under sourceRoot but outside moduleRoot, appRoot
 * and sharedRoot belong to a layout the contract does not describe. An earlier version answered
 * 'app' for those, which is how two files in `src/lib/` came to look like a legitimate consumer set
 * and a shared helper was reported "admitted" on the evidence of nothing. That is the audience this
 * check exists for — before migration almost every file is one of these — so guessing there is worse
 * than declining.
 */
function ownerOf(file) {
  const inModules = relativeParts(moduleRoot, file)
  // A capability is a DIRECTORY under moduleRoot. A file sitting directly there — `src/modules/
  // index.ts` — was answered with its own filename, and that string then counted as a distinct
  // owner: paired with one real capability it satisfied the two-owner threshold on the strength of
  // a file that belongs to no capability at all. It is a structurally invalid location, so the
  // honest answer is that the contract names no owner for it.
  if (inModules) return inModules.length > 1 && capabilities.has(inModules[0]) ? inModules[0] : null
  const inShared = relativeParts(sharedRoot, file)
  // Only an ADMITTED shared root is an owner. Any first component was accepted, so an importer
  // under an unadmitted root — the very shape `invalidSharedRoot` exists to reject — counted
  // towards the two-owner threshold, and one real capability plus one illegal folder read as ok.
  if (inShared) {
    return inShared.length > 1 && sharedRoots.has(inShared[0]) ? `shared/${inShared[0]}` : null
  }
  if (isWithin(appRoot, file)) return 'app'
  if (!isWithin(sourceRoot, file)) return 'root'
  return null
}

/**
 * Importers are not confined to sourceRoot. Instrumentation and observability wiring commonly sits
 * at the repository root and imports shared/server/**; scanning only the source tree reported those
 * files as having no importer, which would have deleted live wiring.
 */
function listOuterImporters() {
  const rootFiles = fs
    .readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE.test(entry.name))
    .map((entry) => path.join(projectRoot, entry.name))
  return [...rootFiles, ...listSources(path.join(projectRoot, 'scripts'))]
}

const importers = new Map()
for (const file of [...listSources(sourceRoot), ...listOuterImporters()]) {
  if (isDevArtifact(file)) continue
  for (const specifier of specifiersOf(file)) {
    const target = resolveToExistingFile(paths, file, specifier)
    if (!target) continue
    if (!importers.has(target)) importers.set(target, new Set())
    importers.get(target).add(file)
  }
}

const unused = []
const demote = []
const speculative = []
const unattributable = []
let privateCount = 0
let okCount = 0

for (const file of listSources(sharedRoot)) {
  if (isDevArtifact(file)) continue
  const relative = path.relative(projectRoot, file)
  if (exempt.has(relative) || exempt.has(relative.split(path.sep).join('/'))) continue

  const own = importers.get(file) ?? new Set()
  if (own.size === 0) {
    unused.push(relative)
    continue
  }

  const ownSharedRoot = ownerOf(file)
  const external = [...own].filter((importer) => ownerOf(importer) !== ownSharedRoot)
  const named = external.filter((importer) => ownerOf(importer) !== null)
  const owners = new Set(named.map(ownerOf))

  // Fail closed on ANY importer the contract cannot attribute, not only when every importer is one.
  // `named.length === 0` discarded the unattributable ones the moment a single named owner existed,
  // so one capability plus one importer from the undescribed layout was reported `demote` — "used
  // only by the X capability", which was not true, about a file the check could not see all of.
  // Two proven owners is the threshold the rule states, so below it an unknown importer decides
  // nothing; at or above it the verdict is `ok` on the named evidence alone.
  if (external.length > named.length && owners.size < 2) {
    unattributable.push({ file: relative, importers: external.length })
  } else if (owners.size === 0) privateCount += 1
  else if (owners.size === 1 && capabilities.has([...owners][0])) {
    demote.push({ file: relative, owner: [...owners][0] })
  } else if (owners.size === 1) {
    // One owner, and no capability to demote into. Counting FILES here made two routes under the
    // same `app` owner read as a shared consumer set: the rule is "at least two real capabilities",
    // and files belonging to one owner are one consumer however many of them there are.
    speculative.push({
      file: relative,
      importer: path.relative(projectRoot, named[0]),
      owner: [...owners][0],
      importers: named.length,
    })
  } else okCount += 1
}

// An exemption is a claim that the rule cannot apply here, and a claim without a reason is one
// nobody can review later. Failing on it is the point: the failure message has always required the
// reason, and until now there was nowhere to put one.
if (reasonless.length > 0) {
  for (const file of reasonless) {
    console.error(`shared admission: ${file} is exempt with no reason recorded`)
  }
  console.error(
    '\n`sharedAdmissionExempt` maps each project-relative path to the reason the rule cannot apply ' +
      'to it, for example { "src/shared/kernel/env.ts": "read by the build, never imported" }. An ' +
      'exemption nobody has to justify is a way to switch this check off one file at a time.'
  )
  process.exitCode = 1
}

const counts = { unused: unused.length, demote: demote.length, speculative: speculative.length }
const over = Object.keys(budget).filter((kind) => counts[kind] > budget[kind])
const under = Object.keys(budget).filter((kind) => counts[kind] < budget[kind])

if (over.length > 0) {
  for (const file of unused) {
    console.error(`shared admission: ${file} has no importer at all — delete it`)
  }
  for (const { file, owner } of demote) {
    console.error(
      `shared admission: ${file} is used only by the "${owner}" capability — that is its natural owner, move it there`
    )
  }
  for (const { file, importer, owner, importers } of speculative) {
    console.error(
      importers > 1
        ? `shared admission: ${file} is imported by ${importers} file(s) that all belong to one owner ("${owner}") — that is one consumer, not two`
        : `shared admission: ${file} has exactly one importer (${importer}) — not shared yet, keep it with its caller`
    )
  }
  console.error(
    `\nover budget: ${over.map((k) => `${k} ${counts[k]} > ${budget[k]}`).join(', ')}.\n` +
      'Shared code needs two real consumers with identical meaning and lifecycle. Delete it, demote it ' +
      'into its consumer, or — when a file genuinely cannot have importers — add it to ' +
      '`sharedAdmissionExempt` in rules/architecture-contract.json with the reason. Do not raise the budget.'
  )
  process.exitCode = 1
} else if (under.length > 0) {
  // A ratchet that only ever fails upward is a ratchet that never tightens: the budget would keep
  // describing debt that has already been paid, and the next regression would fit under it unnoticed.
  console.error(
    `shared admission improved: ${under.map((k) => `${k} ${counts[k]} < ${budget[k]}`).join(', ')}.\n` +
      'Lower `sharedAdmissionBudget` in rules/architecture-contract.json so the improvement cannot regress.'
  )
  process.exitCode = 1
} else {
  // The unattributable count is printed even on success. Silently rolling it into "admitted" is how
  // a pre-migration repository would read a clean line over a tree the check could not judge.
  if (unattributable.length > 0) {
    for (const { file, importers } of unattributable) {
      console.log(
        `shared admission: ${file} could not be judged — its ${importers} importer(s) all sit outside ` +
          'moduleRoot, appRoot and sharedRoot, so the contract names no owner for them'
      )
    }
  }
  console.log(
    `shared admission ok (${okCount} admitted, ${privateCount} private, ${unattributable.length} unattributable; ` +
      `at budget: ${counts.unused} unused, ${counts.demote} to demote, ${counts.speculative} speculative)`
  )
}
