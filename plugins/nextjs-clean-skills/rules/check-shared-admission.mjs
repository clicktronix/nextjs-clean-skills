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
 * A consumer is an OWNER, not a file, and the threshold counts CAPABILITIES — the document says "at
 * least two real capability consumers" in those words. `app`, another shared root and
 * repository-root wiring are scanned and named, because an importer the scan never opens is an
 * importer that does not exist and a file with no importers is told to delete itself; but none of
 * them is a capability, so none of them can satisfy admission. Counting owner strings instead
 * admitted combinations the contract does not, and one of them had a fixture defending it.
 *
 * Verdicts per file under sharedRoot:
 *   unused        nothing imports it -> delete
 *   demote        its only owner is one capability -> that capability is the natural home
 *   speculative   below two capability consumers for some other reason -> the message says which
 *   private       imported only from inside its own shared root -> that root's implementation
 *                 detail rather than an admitted surface, which the rule does not govern
 *   unattributable  an importer the contract cannot name, with the threshold unmet -> undecided
 *   ok            two or more capability consumers
 *
 * Development artifacts are not consumers: a helper kept alive only by its own test, mock or story
 * is dead code with a test, a mock or a story.
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
  moduleSpecifiers,
  developmentArtifactPredicate,
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
  // `unattributable` is a count like the others. Recorded but left out of the ratchet, it printed on
  // the SUCCESS path — so a tree the check openly could not judge exited zero under the line
  // "shared admission ok", and when another count was over budget those rows were not printed at
  // all. That is the pre-migration shape passing on the strength of an admission of ignorance.
  unattributable: 0,
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
// One predicate, shared with check-neutral-surfaces.mjs and overridable in the contract. Each check
// used to carry its own list and they disagreed about mocks and about module-local `test/`
// directories, so a mock could supply the second owner the rule requires.
const isDevArtifact = developmentArtifactPredicate(paths)

function listSources(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSources(absolute)
    return SOURCE.test(entry.name) ? [absolute] : []
  })
}


// EVERY edge, type-only included. A shared type used by two capabilities is used by two
// capabilities; erasing that edge reported a live types file as "no importer at all — delete it".
// Runtime erasure belongs to the runtime question, which is check-neutral-surfaces.mjs.
const specifiersOf = (file) =>
  moduleSpecifiers(ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true))

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
  // The threshold is two CAPABILITIES, in the contract's own words: "Admission requires: 1. at least
  // two real capability consumers". Counting owner strings admitted combinations the document does
  // not — one capability plus `app`, plus another shared root, plus repository-root wiring — and the
  // root case was pinned by a fixture, so the check disagreed with its own normative source and had
  // a test defending the disagreement. Non-capability importers still count for LIVENESS, which is
  // why they are scanned at all: they keep a live file out of `unused`, whose advice is "delete it".
  const capabilityOwners = new Set([...owners].filter((owner) => capabilities.has(owner)))

  if (external.length > named.length && capabilityOwners.size < 2) {
    unattributable.push({ file: relative, importers: external.length })
  } else if (owners.size === 0) privateCount += 1
  else if (capabilityOwners.size >= 2) okCount += 1
  else if (capabilityOwners.size === 1 && owners.size === 1) {
    demote.push({ file: relative, owner: [...capabilityOwners][0] })
  } else {
    // Below the threshold, and the reason differs. Counting FILES here made two routes under the
    // same `app` owner read as a shared consumer set: files belonging to one owner are one consumer
    // however many of them there are, and an owner that is not a capability is not a consumer the
    // rule counts at all. The message is built here because only here is the shape known — a
    // "move it into its owner" instruction is wrong when something outside that owner imports it too.
    const others = [...owners].filter((owner) => !capabilities.has(owner)).sort().join(', ')
    speculative.push({
      file: relative,
      message:
        capabilityOwners.size === 1
          ? `${relative} is imported by one capability ("${[...capabilityOwners][0]}") and by non-capability code ("${others}") — admission counts capability consumers, and one is not two`
          : owners.size > 0
            ? `${relative} is imported only by non-capability code ("${others}") — admission counts capability consumers, and it has none`
            : `${relative} has exactly one importer (${path.relative(projectRoot, named[0])}) — not shared yet, keep it with its caller`,
    })
  }
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

const counts = {
  unused: unused.length,
  demote: demote.length,
  speculative: speculative.length,
  unattributable: unattributable.length,
}
const over = Object.keys(budget).filter((kind) => counts[kind] > budget[kind])
const under = Object.keys(budget).filter((kind) => counts[kind] < budget[kind])

if (over.length > 0) {
  for (const { file, importers } of unattributable) {
    console.error(
      `shared admission: ${file} could not be judged — its ${importers} importer(s) all sit outside ` +
        'moduleRoot, appRoot and sharedRoot, so the contract names no owner for them'
    )
  }
  for (const file of unused) {
    console.error(`shared admission: ${file} has no importer at all — delete it`)
  }
  for (const { file, owner } of demote) {
    console.error(
      `shared admission: ${file} is used only by the "${owner}" capability — that is its natural owner, move it there`
    )
  }
  for (const { message } of speculative) console.error(`shared admission: ${message}`)
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
