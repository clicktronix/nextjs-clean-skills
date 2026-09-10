#!/usr/bin/env node
// Mechanical half of the migration procedure in docs/adoption-and-enforcement.md.
//
// Everything here is arithmetic over files the session already has: listing a tree,
// expanding coverage rules, computing destinations, screening a plan, running one
// owned check and recording its exit code, counting a census, deciding a gate. None
// of it needs a model, so none of it is done by an agent. The skill
// `migrating-architecture` calls these subcommands from the session; the two
// workflows `inventory.js` and `verify.js` only dispatch the judgement calls.
//
// Plain Node, no dependencies: this file ships inside the installed plugin and runs
// against any repository from anywhere.
import { createHash, randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STATE_DIR = '.nextjs-clean-migration'
export const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'])
export const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'out', '.turbo'])

const posix = (value) => value.split(path.sep).join('/')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

// ─── inventory ───
// One walk over the source root, sorted, written once. A 301-file tree with a loose
// index.ts beside two 150-file children is nothing special here: there is no
// partition to satisfy because nothing is handed to an agent.
export function listSourceFiles(repo, sourceRoot, excluded = EXCLUDED_DIRS) {
  const rootAbs = path.join(repo, sourceRoot)
  if (!fs.existsSync(rootAbs)) throw new Error(`source root ${sourceRoot} does not exist under ${repo}`)
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) walk(abs)
        continue
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(posix(path.relative(repo, abs)))
    }
  }
  walk(rootAbs)
  return out.sort()
}

export function writeInventory(repo, sourceRoot, options = {}) {
  const files = listSourceFiles(repo, sourceRoot, options.excluded)
  const inventory = {
    sourceRoot,
    count: files.length,
    listHash: sha256(files.join('\n')),
    listedAt: new Date().toISOString(),
    files,
  }
  const file = path.join(repo, STATE_DIR, 'inventory.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(inventory, null, 2) + '\n')
  return { path: file, count: files.length, listHash: inventory.listHash }
}

// ─── expand: coverage rules → one row per file ───
// A `file` rule beats every prefix; among prefixes the longest wins; arrival order means
// nothing. An `unassigned` entry wins over any rule: it is the decision "nobody could
// place this", and a prefix must not silently overrule it.
export function winningRule(file, rules) {
  let best = null
  let bestLength = -1
  for (const rule of rules) {
    if (!rule || typeof rule.path !== 'string') continue
    const rulePath = rule.path.trim()
    if (rule.kind === 'file') {
      if (rulePath === file) return rule
      continue
    }
    if (rule.kind === 'prefix' && file.startsWith(rulePath + '/') && rulePath.length > bestLength) {
      best = rule
      bestLength = rulePath.length
    }
  }
  return best
}

export function expandRules(files, rules, unassigned = []) {
  const problems = []
  const unsafe = rules.filter((r) => {
    const p = r && typeof r.path === 'string' ? r.path.trim() : ''
    return p === '' || p[0] === '/' || /(^|\/)\.\.(\/|$)/.test(p)
  })
  if (unsafe.length > 0) problems.push({ kind: 'unsafe-rule-path', rules: unsafe.map((r) => r && r.path) })
  const seen = new Set()
  const duplicates = rules.filter((r) => {
    const key = r ? `${r.kind}:${String(r.path).trim()}` : ''
    if (seen.has(key)) return true
    seen.add(key)
    return false
  })
  if (duplicates.length > 0) problems.push({ kind: 'duplicate-rule', rules: duplicates.map((r) => `${r.kind}:${r.path}`) })
  const prefixSurfaces = rules.filter((r) => r && r.kind === 'prefix' && r.surface)
  if (prefixSurfaces.length > 0) problems.push({ kind: 'surface-on-prefix', rules: prefixSurfaces.map((r) => r.path) })
  if (problems.length > 0) return { ok: false, problems }

  const unassignedByFile = new Map(
    unassigned.filter((u) => u && typeof u.file === 'string').map((u) => [u.file.trim(), u])
  )
  const matched = new Set()
  const rows = []
  const uncovered = []
  for (const file of files) {
    for (const rule of rules) {
      const p = rule.path.trim()
      if (rule.kind === 'file' ? p === file : file.startsWith(p + '/')) matched.add(`${rule.kind}:${p}`)
    }
    if (unassignedByFile.has(file)) {
      const u = unassignedByFile.get(file)
      rows.push({ file, placement: 'unassigned', why: u.why || '', likelyCapability: u.likelyCapability || '' })
      continue
    }
    const rule = winningRule(file, rules)
    if (!rule) {
      uncovered.push(file)
      continue
    }
    rows.push({
      file,
      placement: rule.placement,
      capability: rule.capability || '',
      runtime: rule.runtime || '',
      role: rule.role || '',
      surface: rule.surface || '',
      rule: `${rule.kind}:${rule.path.trim()}`,
    })
  }
  // A rule no file matches describes a different tree. That is a warning for the owner to
  // read, not a stop: nothing wrong is written because of it.
  const deadRules = rules.map((r) => `${r.kind}:${r.path.trim()}`).filter((key) => !matched.has(key))
  const strayUnassigned = [...unassignedByFile.keys()].filter((f) => !files.includes(f))
  return { ok: true, rows, uncovered, deadRules, strayUnassigned }
}

// ─── destination ───
// The model decides roles; this computes paths. Closed under the capability root and
// injective across a plan.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const CAPABILITY_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
// A module root is a project-relative path with no way out of the project; a capability is one
// kebab-case segment. Both end up in every destination, so a bad value here would be a
// "verified" path outside the repository.
export function safeRoots({ moduleRoot, capability }) {
  const problems = []
  if (typeof moduleRoot !== 'string' || moduleRoot === '' || moduleRoot.startsWith('/') || /(^|\/)\.\.?(\/|$)/.test(moduleRoot) || moduleRoot.endsWith('/')) {
    problems.push(`moduleRoot must be a project-relative path without . or .. segments, got ${JSON.stringify(moduleRoot)}`)
  }
  if (typeof capability !== 'string' || !CAPABILITY_NAME.test(capability)) {
    problems.push(`capability must be one kebab-case segment, got ${JSON.stringify(capability)}`)
  }
  return problems
}

export function destination(move, { moduleRoot, capability, segments, surfaces }) {
  if (safeRoots({ moduleRoot, capability }).length > 0) return null
  if (!move || move.role === 'stay' || move.role === 'delete') return null
  if (move.role === 'surface') {
    if (!surfaces.includes(move.surface)) return null
    return `${moduleRoot}/${capability}/${move.surface}.ts`
  }
  if (!segments.includes(move.role)) return null
  const name = move.basename || String(move.file).split('/').pop()
  if (!SAFE_NAME.test(name)) return null
  return `${moduleRoot}/${capability}/${move.role}/${name}`
}

// ─── plan screening ───
// Pure: decides what would be written and what the mover is told. Rejects rather than
// filters — a malformed entry that a filter dropped was a risk the planner reported and
// the report ate.
export function screenPlan(plan, ctx) {
  const { moduleRoot, capability, segments, surfaces, assignedFiles, consumers } = ctx
  const problems = []
  const rootProblems = safeRoots({ moduleRoot, capability })
  if (rootProblems.length > 0) return { ok: false, problems: [{ kind: 'unsafe-roots', detail: rootProblems }] }
  const channelChanges = plan.channelChanges || []
  const malformedChannels = channelChanges.filter(
    (c) => !c || !c.what || !c.from || !c.to || !String(c.behaviourRisk || '').trim()
  )
  if (malformedChannels.length > 0) problems.push({ kind: 'malformed-channel-change', count: malformedChannels.length })

  const resolved = (plan.moves || []).map((mv) => ({ ...mv, dest: destination(mv, { moduleRoot, capability, segments, surfaces }) }))
  const invalid = resolved.filter((r) => r.role !== 'stay' && r.role !== 'delete' && !r.dest)
  if (invalid.length > 0) problems.push({ kind: 'invalid-move', files: invalid.map((r) => r.file) })

  const declaredSurfaces = plan.surfaces || []
  const badSurfaces = declaredSurfaces.filter((s) => !surfaces.includes(s.surface))
  if (badSurfaces.length > 0) problems.push({ kind: 'unknown-surface', surfaces: badSurfaces.map((s) => s.surface) })
  const surfaceSeen = new Set()
  const duplicateSurfaces = declaredSurfaces.filter((s) => (surfaceSeen.has(s.surface) ? true : (surfaceSeen.add(s.surface), false)))
  if (duplicateSurfaces.length > 0) problems.push({ kind: 'duplicate-surface', surfaces: duplicateSurfaces.map((s) => s.surface) })

  const usedSurfaces = declaredSurfaces.filter((s) => (s.consumers || []).length > 0)
  const usedNames = usedSurfaces.map((s) => s.surface)
  const staying = resolved.filter((r) => r.role === 'stay')
  const deleting = resolved.filter((r) => r.role === 'delete')
  const moving = resolved.filter((r) => r.dest && (r.role !== 'surface' || usedNames.includes(r.surface)))
  for (const r of resolved) if (r.dest && r.role === 'surface' && !usedNames.includes(r.surface)) staying.push(r)

  const byDest = new Map()
  for (const r of moving) byDest.set(r.dest, [...(byDest.get(r.dest) || []), r.file])
  const collisions = [...byDest].filter(([, sources]) => sources.length > 1).map(([dest, sources]) => ({ dest, sources }))
  if (collisions.length > 0) problems.push({ kind: 'destination-collision', collisions })

  const sourceSeen = new Set()
  const duplicateSources = []
  for (const mv of plan.moves || []) {
    if (sourceSeen.has(mv.file)) duplicateSources.push(mv.file)
    sourceSeen.add(mv.file)
  }
  if (duplicateSources.length > 0) problems.push({ kind: 'duplicate-source', files: duplicateSources })
  const unplanned = assignedFiles.filter((f) => !sourceSeen.has(f))
  if (unplanned.length > 0) problems.push({ kind: 'unplanned-file', files: unplanned })
  const unknownSources = (plan.moves || []).filter((mv) => mv.role !== 'stay' && !assignedFiles.includes(mv.file)).map((mv) => mv.file)
  if (unknownSources.length > 0) problems.push({ kind: 'unknown-source', files: unknownSources })

  // A surface is grounded by a concrete consumer, or by another surface that is; a loop of
  // surfaces citing each other grounds nothing.
  const capRoot = `${moduleRoot}/${capability}/`
  const plannedDests = moving.map((r) => r.dest)
  const deletedFiles = deleting.map((r) => r.file)
  const surfaceDests = new Map(usedSurfaces.map((s) => [`${capRoot}${s.surface}.ts`, s.surface]))
  for (const r of moving) if (r.role === 'surface' && r.surface) surfaceDests.set(r.file, r.surface)
  const bare = (c) => String(c).split(' (')[0].split(', ')[0].trim()
  const concrete = (c) => !deletedFiles.includes(c) && (consumers.includes(c) || assignedFiles.includes(c) || plannedDests.includes(c))
  const stray = []
  const edges = new Map()
  const grounded = new Set()
  for (const s of usedSurfaces) {
    const out = []
    for (const c of s.consumers || []) {
      const b = bare(c)
      const named = surfaceDests.get(b)
      if (named) {
        if (named === s.surface) stray.push({ surface: s.surface, consumer: c, why: 'a surface cannot be its own consumer' })
        else out.push(named)
        continue
      }
      if (concrete(b)) grounded.add(s.surface)
      else stray.push({ surface: s.surface, consumer: c, why: 'names no file this plan knows to exist' })
    }
    edges.set(s.surface, out)
  }
  for (let settled = false; !settled; ) {
    settled = true
    for (const [surface, out] of edges) {
      if (grounded.has(surface) || !out.some((t) => grounded.has(t))) continue
      grounded.add(surface)
      settled = false
    }
  }
  const ungrounded = usedSurfaces.filter((s) => !grounded.has(s.surface)).map((s) => s.surface)
  if (stray.length > 0) problems.push({ kind: 'stray-consumer', stray })
  if (ungrounded.length > 0) problems.push({ kind: 'ungrounded-surface', surfaces: ungrounded })
  const emptyExports = usedSurfaces.filter((s) => (s.exports || []).length === 0).map((s) => s.surface)
  if (emptyExports.length > 0) problems.push({ kind: 'empty-surface', surfaces: emptyExports })

  return {
    ok: problems.length === 0,
    problems,
    moving: moving.map(({ file, role, surface, dest }) => ({ file, role, surface: surface || '', dest })),
    staying: staying.map((r) => r.file),
    deleting: deletedFiles,
    surfaces: usedSurfaces.map((s) => ({ surface: s.surface, exports: s.exports || [], consumers: (s.consumers || []).map(bare) })),
    droppedSurfaces: declaredSurfaces.filter((s) => !usedNames.includes(s.surface)).map((s) => s.surface),
    channelChanges,
  }
}

// ─── tree state and check records ───
// The owner runs one heavy check as its own child process and writes down what it ran,
// what came back, and what tree it ran against. Reviewers read the record; nobody waits
// for a file to appear. A record is fresh only while the tree it names is the tree on disk.
//
// The tree state is a git tree object of the working directory, built in a temporary
// index: every tracked and untracked file's content, by the same hashing git uses, with
// no porcelain to parse and no output buffer to overflow. Quoted paths and multi-megabyte
// diffs are exactly the inputs a text-based hash got wrong.
function git(repo, args, options = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
  if (r.status !== 0) throw new Error(`git ${args[0]} failed in ${repo}: ${(r.stderr || '').trim() || r.error?.message || `exit ${r.status}`}`)
  return r.stdout.trim()
}

export function treeState(repo) {
  const head = git(repo, ['rev-parse', 'HEAD'])
  const index = path.join(os.tmpdir(), `ncs-index-${process.pid}-${Date.now()}`)
  try {
    const env = { ...process.env, GIT_INDEX_FILE: index }
    // Start from the repository's own index, not HEAD: a file force-added inside an ignored
    // directory exists only there, and an index built from HEAD would treat its edits as
    // ignored. Then stage the working tree; the tool's own state directory is excluded
    // because it is not part of the tree a check ran against.
    const realIndex = path.resolve(repo, git(repo, ['rev-parse', '--git-path', 'index']))
    if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, index)
    else git(repo, ['read-tree', 'HEAD'], { env })
    git(repo, ['add', '-A', '--', '.', `:!${STATE_DIR}`], { env })
    const tree = git(repo, ['write-tree'], { env })
    return { head, tree }
  } finally {
    fs.rmSync(index, { force: true })
  }
}

export function runRecord(repo, label, command, options = {}) {
  const dir = path.join(repo, STATE_DIR, 'records')
  fs.mkdirSync(dir, { recursive: true })
  const startedAt = new Date().toISOString()
  // The run's identity is claimed by creating its artifact directory exclusively: two runs
  // started in the same millisecond with the same label and command get different ids, and
  // neither can take over a directory the other already owns. The directory exists only for
  // this run and is created empty, so a file there can only have been written by this command;
  // `$NCS_ARTIFACTS` tells the command where.
  const stem = `${startedAt.replace(/[:.]/g, '-')}-${label.replace(/[^A-Za-z0-9_-]/g, '_')}-${sha256(command).slice(0, 8)}`
  let id
  let artifactDir
  for (let attempt = 0; ; attempt += 1) {
    id = attempt === 0 ? stem : `${stem}-${randomBytes(3).toString('hex')}`
    artifactDir = path.join(dir, `${id}.artifacts`)
    try {
      fs.mkdirSync(artifactDir)
      break
    } catch (error) {
      if (error.code !== 'EEXIST' || attempt > 8) throw error
    }
  }
  const outPath = path.join(dir, `${id}.out`)
  const recordPath = path.join(dir, `${id}.json`)
  const artifactNames = (options.artifacts || []).map((a) => path.basename(a))
  const killAfterMs = typeof options.killAfterMs === 'number' ? options.killAfterMs : 10000
  const tree = treeState(repo)
  // Output streams straight into the file, so progress is visible while the check runs and
  // nothing is lost if the wrapper is killed. The child leads its own process group; a signal
  // to the wrapper is forwarded to that group, and the wrapper then waits for the WHOLE group
  // to be gone — escalating to SIGKILL after a grace period — before it writes the record. A
  // record therefore never describes a check, or a child of a check, that is still running.
  const out = fs.openSync(outPath, 'w')
  const child = spawn(options.shell || 'sh', ['-c', command], {
    cwd: repo,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...(options.env || {}), NCS_ARTIFACTS: artifactDir, NCS_RECORD_ID: id },
    detached: true,
  })
  const bindArtifacts = () =>
    artifactNames.map((name) => {
      const abs = path.join(artifactDir, name)
      try {
        return { name, path: posix(path.relative(repo, abs)), sha256: sha256(fs.readFileSync(abs)), exists: true }
      } catch {
        return { name, path: posix(path.relative(repo, abs)), sha256: null, exists: false }
      }
    })
  const write = (exitCode, signal) => {
    const record = {
      id,
      label,
      command,
      cwd: repo,
      pid: child.pid,
      exitCode,
      signal,
      startedAt,
      endedAt: new Date().toISOString(),
      tree,
      artifactDir: posix(path.relative(repo, artifactDir)),
      artifacts: bindArtifacts(),
      outPath: posix(path.relative(repo, outPath)),
      stdoutPath: outPath,
    }
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n')
    return record
  }
  const groupAlive = () => {
    try {
      process.kill(-child.pid, 0)
      return true
    } catch {
      return false
    }
  }
  return new Promise((resolve) => {
    let settled = false
    let forwarded = null
    const finish = (exitCode, signal) => {
      if (settled) return
      settled = true
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(sig, forward)
      try { fs.closeSync(out) } catch { /* already closed */ }
      resolve({ recordPath, record: write(exitCode, forwarded || signal) })
    }
    // From the moment a signal is forwarded, the wrapper watches the whole group — not the
    // leader's exit, which never comes when the shell itself ignores the signal, and not only
    // the leader, which a grandchild can outlive. Once the grace period has passed the group is
    // killed outright; the record is written only when nothing in the group answers.
    let leaderExit = null
    let watching = false
    const watchGroup = () => {
      if (watching) return
      watching = true
      const deadline = Date.now() + killAfterMs
      let killed = false
      const tick = () => {
        if (settled) return
        if (!groupAlive()) {
          const exit = leaderExit || { code: null, signal: null }
          return finish(forwarded ? null : exit.code, exit.signal)
        }
        if (!killed && Date.now() >= deadline) {
          killed = true
          try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone between checks */ }
        }
        setTimeout(tick, 50)
      }
      tick()
    }
    const forward = (sig) => {
      if (forwarded) return
      forwarded = sig
      try { process.kill(-child.pid, sig) } catch { /* group already gone */ }
      watchGroup()
    }
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, forward)
    child.on('error', (error) => {
      fs.writeSync(out, `\n--- spawn error ---\n${error.message}\n`)
      finish(null, error.code || 'SPAWN_ERROR')
    })
    child.on('exit', (code, signal) => {
      leaderExit = { code: typeof code === 'number' ? code : null, signal: signal || null }
      // A leader that exits on its own with the group still alive is watched without a grace
      // period of its own: its children are the command's business until a signal says otherwise.
      if (forwarded || groupAlive()) watchGroup()
      else finish(leaderExit.code, leaderExit.signal)
    })
  })
}

// An artifact is evidence only through the record whose run produced it — it can only exist
// inside that run's own directory — and only while it still hashes the same.
export function boundArtifact(repo, record, nameOrPath) {
  const name = path.basename(nameOrPath)
  const entry = (record.artifacts || []).find((a) => a.name === name)
  if (!entry) return { ok: false, detail: `${name} is not an artifact of record ${record.id}; pass --artifact ${name} when taking the record and write it to $NCS_ARTIFACTS/${name}` }
  if (!entry.exists || !entry.sha256) return { ok: false, detail: `${name} was not written by the command of record ${record.id}` }
  const abs = path.join(repo, entry.path)
  let text
  try {
    text = fs.readFileSync(abs)
  } catch {
    return { ok: false, detail: `${entry.path} is missing on disk` }
  }
  if (sha256(text) !== entry.sha256) return { ok: false, detail: `${entry.path} changed since record ${record.id} was written; it is not this record's evidence` }
  return { ok: true, text: text.toString('utf8') }
}

export function recordFreshness(repo, record) {
  const now = treeState(repo)
  const fresh = now.head === record.tree.head && now.tree === record.tree.tree
  return { fresh, recorded: record.tree, now }
}

// ─── census ───
// Counts a boundary census from an ESLint JSON output the record carries. The counter
// named `capability` is the burndown for one capability; the others are compared with the
// baseline. A record whose output is not ESLint JSON is reported as such, not as zero.
export function censusFromEslintJson(text, { moduleRoot, capability, ruleId = 'clean-architecture/boundaries', baselineKeys = [] } = {}) {
  let files
  try {
    const start = text.indexOf('[')
    files = JSON.parse(text.slice(start === -1 ? 0 : start))
  } catch {
    return { ok: false, detail: 'record output is not ESLint JSON; run the check with --format json' }
  }
  if (!Array.isArray(files)) return { ok: false, detail: 'record output is not an ESLint results array' }
  const counts = {}
  let capabilityCount = 0
  const capPrefix = moduleRoot && capability ? `${moduleRoot}/${capability}/` : ''
  for (const f of files) {
    const rel = posix(String(f.filePath || ''))
    for (const m of f.messages || []) {
      const key = m.ruleId === ruleId ? String(m.messageId || m.message || m.ruleId) : String(m.ruleId || 'unknown')
      counts[key] = (counts[key] || 0) + 1
      if (capPrefix && rel.includes(`/${capPrefix}`)) capabilityCount += 1
    }
  }
  // A counter that was measured and found nothing is 0, not absent: zero-fill every key the
  // baseline knew, or the last violation fixed reads as an unmeasured counter.
  for (const key of baselineKeys) if (key !== 'capability' && typeof counts[key] !== 'number') counts[key] = 0
  // Without a capability there is no capability counter to report. Saying 0 would present a
  // whole-repository baseline as a clean measurement of one slice.
  counts.capability = capPrefix ? capabilityCount : null
  return { ok: true, scope: capPrefix ? 'capability' : 'baseline', counts, files: files.length }
}

// ─── gate ───
// Silence is inconclusive. `reject` belongs to the review alone and dominates. A radius
// that grew is a note, never a veto: it is an estimate, not a measurement.
export function archRed(architecture, census = {}, vacuous = []) {
  if (!architecture || !architecture.ok || !architecture.counts || typeof architecture.counts.capability !== 'number') return 'not measured'
  const c = architecture.counts
  // Counts come from a complete ESLint run over the whole root, so a key the baseline had and
  // this run lacks means the run found none of that kind — a measured zero.
  if (c.capability !== 0) return `the capability still has ${c.capability} violation(s)`
  const regressed = Object.keys(c).filter((k) => k !== 'capability' && !vacuous.includes(k) && (c[k] || 0) > (census[k] || 0))
  return regressed.length > 0 ? `regressions above baseline: ${regressed.join(', ')}` : ''
}

export function recommend(input) {
  const { behaviour, architecture, review, census = {}, vacuous = [], radius = null, fixLoopExit = 'not-entered' } = input
  const unmeasured = []
  if (!behaviour || typeof behaviour.ok !== 'boolean') unmeasured.push('behaviour')
  const arch = archRed(architecture, census, vacuous)
  if (arch === 'not measured') unmeasured.push('architecture')
  if (!review || !review.verdict) unmeasured.push('review')
  const notes = []
  if (radius && radius.ok && radius.direction === 'grew') notes.push('the estimated change radius grew: ' + (radius.detail || ''))
  if (!radius || !radius.ok) notes.push('change radius not measured')
  if (unmeasured.length > 0) return { gate: 'inconclusive', unmeasured, reason: `did not report: ${unmeasured.join(', ')}`, notes }
  if (review.verdict === 'reject') return { gate: 'reject', unmeasured, reason: 'the review rejected the ownership model', notes }
  const musts = (review.findings || []).filter((f) => f.severity === 'must-fix')
  const shoulds = (review.findings || []).filter((f) => f.severity === 'should-fix')
  if (shoulds.length > 0) notes.push(`${shoulds.length} should-fix finding(s) for the owner to verify and, when confirmed, fix`)
  if (fixLoopExit === 'cap-reached') {
    return { gate: 'revise', unmeasured, reason: 'cap-reached: the fix budget ran out with work still open — a budget, not a conclusion', notes }
  }
  if (!behaviour.ok) return { gate: 'revise', unmeasured, reason: 'behaviour check is red', notes }
  if (arch) return { gate: 'revise', unmeasured, reason: `architecture: ${arch}`, notes }
  if (musts.length > 0) return { gate: 'revise', unmeasured, reason: `${musts.length} must-fix review finding(s)`, notes }
  if (review.verdict === 'revise') return { gate: 'revise', unmeasured, reason: 'the review asked for revision', notes }
  return { gate: 'accept', unmeasured, reason: 'behaviour green, architecture at zero with no regression, review sound', notes }
}

// ─── CLI ───
function arg(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1]
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n')

function contractContext(contractPath, repo) {
  const contract = readJson(contractPath)
  const rootsFrom = arg(process.argv, 'roots', '')
  const roots = rootsFrom ? readJson(rootsFrom) : {}
  return {
    moduleRoot: roots.moduleRoot || contract.moduleRoot,
    segments: contract.segments,
    surfaces: contract.publicSurfaces,
    repo,
  }
}

export async function main(argv) {
  const [command, ...rest] = argv
  const repo = path.resolve(arg(rest, 'repo', process.cwd()))
  switch (command) {
    case 'inventory': {
      const sourceRoot = arg(rest, 'source-root', 'src')
      const extra = arg(rest, 'exclude', '')
      const excluded = new Set([...EXCLUDED_DIRS, ...extra.split(',').filter(Boolean)])
      print(writeInventory(repo, sourceRoot, { excluded }))
      return 0
    }
    case 'expand': {
      const inventory = readJson(path.join(repo, STATE_DIR, 'inventory.json'))
      const decision = readJson(arg(rest, 'rules'))
      const result = expandRules(inventory.files, decision.rules || [], decision.unassigned || [])
      if (result.ok) {
        const file = path.join(repo, STATE_DIR, 'assignments.json')
        fs.writeFileSync(file, JSON.stringify({ rows: result.rows, deadRules: result.deadRules, strayUnassigned: result.strayUnassigned, uncovered: result.uncovered }, null, 2) + '\n')
        print({ ok: true, path: file, rows: result.rows.length, uncovered: result.uncovered, deadRules: result.deadRules, strayUnassigned: result.strayUnassigned })
        return result.uncovered.length > 0 ? 2 : 0
      }
      print(result)
      return 1
    }
    case 'destination': {
      const ctx = contractContext(arg(rest, 'contract'), repo)
      const move = { role: arg(rest, 'role'), file: arg(rest, 'file', ''), basename: arg(rest, 'basename', ''), surface: arg(rest, 'surface', '') }
      const dest = destination(move, { ...ctx, capability: arg(rest, 'capability') })
      print({ dest })
      return dest ? 0 : 1
    }
    case 'plan-check': {
      const ctx = contractContext(arg(rest, 'contract'), repo)
      const capability = arg(rest, 'capability')
      const plan = readJson(arg(rest, 'plan'))
      // Accepts what `expand` wrote ({ rows }) or a bare list; only this capability's rows are
      // the files the plan must account for.
      const assignments = readJson(arg(rest, 'assignments'))
      const rows = Array.isArray(assignments) ? assignments : assignments.rows || []
      const assignedFiles = rows
        .map((a) => (typeof a === 'string' ? { file: a, placement: 'capability', capability } : a))
        .filter((a) => a.placement === 'capability' && a.capability === capability)
        .map((a) => a.file)
      const consumers = arg(rest, 'consumers', '') ? readJson(arg(rest, 'consumers')) : []
      const result = screenPlan(plan, { ...ctx, capability, assignedFiles, consumers })
      print({ ...result, assignedFiles: assignedFiles.length })
      return result.ok ? 0 : 1
    }
    case 'record': {
      const label = arg(rest, 'label', 'check')
      const sep = rest.indexOf('--')
      const command = sep === -1 ? '' : rest.slice(sep + 1).join(' ')
      if (!command) {
        console.error('record: pass the command after --')
        return 1
      }
      const head = sep === -1 ? rest : rest.slice(0, sep)
      const artifacts = head.flatMap((v, i) => (v === '--artifact' && head[i + 1] ? [head[i + 1]] : []))
      const killAfterMs = Number(arg(head, 'kill-after', '10000'))
      const { recordPath, record } = await runRecord(repo, label, command, { artifacts, killAfterMs })
      print({ recordPath, exitCode: record.exitCode, signal: record.signal, artifacts: record.artifacts, outPath: record.stdoutPath, tree: record.tree })
      return 0
    }
    case 'tree-state':
      print(treeState(repo))
      return 0
    case 'record-fresh': {
      const record = readJson(arg(rest, 'record'))
      const result = recordFreshness(repo, record)
      print(result)
      return result.fresh ? 0 : 3
    }
    case 'census': {
      const record = readJson(arg(rest, 'record'))
      // One check command can write ESLint's JSON to a file (`--output-file`) beside the rest of
      // its output; `--lint-json` reads that file so lint runs once per tree state.
      const lintJson = arg(rest, 'lint-json', '')
      let text
      if (lintJson) {
        const bound = boundArtifact(repo, record, lintJson)
        if (!bound.ok) {
          print({ ok: false, detail: bound.detail, recordId: record.id })
          return 1
        }
        text = bound.text
      } else {
        text = fs.readFileSync(record.stdoutPath || path.join(repo, record.outPath), 'utf8')
      }
      const ctx = arg(rest, 'contract', '') ? contractContext(arg(rest, 'contract'), repo) : { moduleRoot: arg(rest, 'module-root', '') }
      const baseline = arg(rest, 'baseline', '') ? readJson(arg(rest, 'baseline')) : null
      const baselineKeys = baseline ? Object.keys(baseline.counts || baseline) : []
      const result = censusFromEslintJson(text, { moduleRoot: ctx.moduleRoot, capability: arg(rest, 'capability', ''), baselineKeys })
      print({ ...result, recordId: record.id, exitCode: record.exitCode })
      return result.ok ? 0 : 1
    }
    case 'recommend': {
      print(recommend(readJson(arg(rest, 'input'))))
      return 0
    }
    default:
      console.error('usage: migration.mjs <inventory|expand|destination|plan-check|record|tree-state|record-fresh|census|recommend> [--repo <path>] ...')
      return 1
  }
}

// Compared by real path: on macOS /tmp is a symlink to /private/tmp, and a URL comparison
// alone made the CLI a silent no-op when invoked through the symlinked spelling.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error.message)
    process.exit(1)
  })
}
