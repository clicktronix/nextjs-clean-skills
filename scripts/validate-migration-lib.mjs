#!/usr/bin/env node
// Unit tests for plugins/nextjs-clean-skills/bin/migration.mjs — the mechanical half of
// the migration. Every function is exercised with a case that passes and a case that
// must fail for the intended reason; the inventory case is the tree the old partition
// contract could not represent (a loose file beside two children over the cap).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fail, root } from './_lib.mjs'

const LIB = path.join(root, 'plugins/nextjs-clean-skills/bin/migration.mjs')
const lib = await import(pathToFileURL(LIB).href)
const errors = []
const check = (ok, message) => {
  if (!ok) errors.push(message)
}
const contract = JSON.parse(fs.readFileSync(path.join(root, 'rules/architecture-contract.json'), 'utf8'))
const CTX = { moduleRoot: 'src/modules', capability: 'work-items', segments: contract.segments, surfaces: contract.publicSurfaces }

// ─── inventory: 301 files, no partition, no agent ───
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ncs-migration-'))
try {
  const mk = (rel, body = 'export {}\n') => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
    fs.writeFileSync(path.join(repo, rel), body)
  }
  mk('src/features/index.ts')
  for (let i = 0; i < 150; i += 1) mk(`src/features/a/f${i}.ts`)
  for (let i = 0; i < 150; i += 1) mk(`src/features/b/g${i}.tsx`)
  mk('src/features/a/readme.md')
  mk('src/node_modules/dep/index.js')
  mk('src/.next/cache.js')
  const inv = lib.writeInventory(repo, 'src')
  check(inv.count === 301, `inventory: expected 301 source files, got ${inv.count}`)
  const written = JSON.parse(fs.readFileSync(inv.path, 'utf8'))
  check(written.files.includes('src/features/index.ts') && !written.files.some((f) => f.includes('node_modules') || f.includes('.next') || f.endsWith('.md')), 'inventory: loose file kept, excluded dirs and non-source dropped')
  check(written.files.join() === [...written.files].sort().join(), 'inventory: files are sorted')
  let threw = false
  try { lib.listSourceFiles(repo, 'nope') } catch { threw = true }
  check(threw, 'inventory: a missing source root throws rather than reporting an empty tree')

  // ─── expand ───
  const rules = [
    { kind: 'prefix', path: 'src/features', placement: 'capability', capability: 'features', runtime: 'neutral' },
    { kind: 'prefix', path: 'src/features/b', placement: 'shared', runtime: 'browser-safe' },
    { kind: 'file', path: 'src/features/b/g1.tsx', placement: 'app', runtime: 'browser-safe' },
    { kind: 'prefix', path: 'src/legacy', placement: 'app' },
  ]
  const unassigned = [{ file: 'src/features/a/f3.ts', why: 'contested', likelyCapability: 'features' }, { file: 'src/gone.ts', why: 'x' }]
  const ex = lib.expandRules(written.files, rules, unassigned)
  check(ex.ok && ex.rows.length === 301 && ex.uncovered.length === 0, 'expand: every file gets one row')
  const row = (f) => ex.rows.find((r) => r.file === f)
  check(row('src/features/index.ts').capability === 'features', 'expand: broad prefix covers the loose file')
  check(row('src/features/b/g0.tsx').placement === 'shared', 'expand: the longer prefix wins over the shorter')
  check(row('src/features/b/g1.tsx').placement === 'app', 'expand: a file rule beats every prefix')
  check(row('src/features/a/f3.ts').placement === 'unassigned', 'expand: unassigned wins over a matching prefix')
  check(ex.deadRules.length === 1 && ex.deadRules[0] === 'prefix:src/legacy', `expand: a rule matching nothing is reported as dead, not fatal: ${JSON.stringify(ex.deadRules)}`)
  check(ex.strayUnassigned.length === 1 && ex.strayUnassigned[0] === 'src/gone.ts', 'expand: an unassigned entry naming no inventory file is reported')
  const shuffled = lib.expandRules(written.files, [...rules].reverse(), unassigned)
  check(JSON.stringify(shuffled.rows) === JSON.stringify(ex.rows), 'expand: rule order changes nothing')
  const partial = lib.expandRules(written.files, rules.slice(1), [])
  check(partial.ok && partial.uncovered.includes('src/features/index.ts') && partial.uncovered.length === 151, `expand: uncovered files are listed, not invented: ${partial.uncovered.length}`)
  const bad = lib.expandRules(written.files, [{ kind: 'prefix', path: '../etc', placement: 'app' }, { kind: 'prefix', path: 'src/features', surface: 'server' }], [])
  check(!bad.ok && bad.problems.some((p) => p.kind === 'unsafe-rule-path') && bad.problems.some((p) => p.kind === 'surface-on-prefix'), 'expand: unsafe paths and surfaces on prefixes are refused')

  // ─── destination ───
  const d = (m) => lib.destination(m, CTX)
  check(d({ role: 'surface', surface: 'server', file: 'x' }) === 'src/modules/work-items/server.ts', 'destination: surface path')
  check(d({ role: 'domain', file: 'src/old/work-item.ts' }) === 'src/modules/work-items/domain/work-item.ts', 'destination: segment keeps the basename')
  check(d({ role: 'domain', file: 'src/old/x.ts', basename: 'renamed.ts' }) === 'src/modules/work-items/domain/renamed.ts', 'destination: explicit basename')
  check(d({ role: 'stay', file: 'x' }) === null && d({ role: 'delete', file: 'x' }) === null, 'destination: stay and delete have none')
  check(d({ role: 'surface', surface: 'lib', file: 'x' }) === null, 'destination: an unknown surface is refused')
  check(d({ role: 'services', file: 'x.ts' }) === null, 'destination: an unknown segment is refused')
  check(d({ role: 'domain', file: 'x', basename: '../escape.ts' }) === null && d({ role: 'domain', file: 'x', basename: 'a/b.ts' }) === null, 'destination: a basename cannot leave the directory')
  check(lib.destination({ role: 'domain', file: 'src/a.ts' }, { ...CTX, capability: '../../../outside' }) === null, 'destination: a capability that is not one kebab-case segment is refused')
  check(lib.destination({ role: 'domain', file: 'src/a.ts' }, { ...CTX, moduleRoot: '/etc' }) === null && lib.destination({ role: 'domain', file: 'src/a.ts' }, { ...CTX, moduleRoot: 'src/../..' }) === null, 'destination: a module root outside the project is refused')
  check(!lib.screenPlan({ moves: [], surfaces: [] }, { ...CTX, capability: 'Bad_Cap', assignedFiles: [], consumers: [] }).ok, 'screen: unsafe roots are the first problem reported')

  // ─── plan screening ───
  const assigned = ['src/old/a.ts', 'src/old/b.ts', 'src/old/c.ts']
  const consumers = ['src/app/page.tsx']
  const good = {
    moves: [
      { file: 'src/old/a.ts', role: 'domain' },
      { file: 'src/old/b.ts', role: 'surface', surface: 'server' },
      { file: 'src/old/c.ts', role: 'delete' },
    ],
    surfaces: [{ surface: 'server', exports: ['listWorkItems'], consumers: ['src/app/page.tsx'] }, { surface: 'ui', exports: ['X'], consumers: [] }],
    channelChanges: [],
  }
  const s = lib.screenPlan(good, { ...CTX, assignedFiles: assigned, consumers })
  check(s.ok && s.moving.length === 2 && s.deleting.length === 1 && s.droppedSurfaces.includes('ui'), `screen: a sound plan passes and an unused surface is dropped: ${JSON.stringify(s.problems)}`)
  const kinds = (plan, extra = {}) => lib.screenPlan(plan, { ...CTX, assignedFiles: assigned, consumers, ...extra }).problems.map((p) => p.kind)
  check(kinds({ ...good, moves: [...good.moves, { file: 'src/old/d.ts', role: 'domain', basename: 'a.ts' }] }).includes('unknown-source'), 'screen: a move of an unassigned file is refused')
  check(kinds({ ...good, moves: good.moves.slice(0, 2) }).includes('unplanned-file'), 'screen: an assigned file the plan forgot is refused')
  check(kinds({ ...good, moves: [good.moves[0], { file: 'src/old/b.ts', role: 'domain', basename: 'a.ts' }, good.moves[2]] }).includes('destination-collision'), 'screen: two files at one destination collide')
  check(kinds({ ...good, surfaces: [{ surface: 'server', exports: [], consumers: ['src/app/page.tsx'] }] }).includes('empty-surface'), 'screen: a surface with no exports is refused')
  check(kinds({ ...good, surfaces: [{ surface: 'server', exports: ['x'], consumers: ['src/modules/work-items/server.ts'] }] }).includes('stray-consumer'), 'screen: a surface cannot be its own consumer')
  check(kinds({ ...good, surfaces: [{ surface: 'server', exports: ['x'], consumers: ['src/nowhere.ts'] }] }).includes('stray-consumer'), 'screen: a consumer nobody knows is refused')
  const loop = {
    ...good,
    surfaces: [
      { surface: 'server', exports: ['x'], consumers: ['src/modules/work-items/rsc.ts'] },
      { surface: 'rsc', exports: ['y'], consumers: ['src/modules/work-items/server.ts'] },
    ],
  }
  check(kinds(loop).includes('ungrounded-surface'), 'screen: surfaces that only cite each other ground nothing')
  check(kinds({ ...good, channelChanges: [{ what: 'reads', from: 'action', to: 'GET', behaviourRisk: '' }] }).includes('malformed-channel-change'), 'screen: a channel change with a blank risk is rejected, not filtered')
  check(kinds({ ...good, surfaces: [...good.surfaces, { surface: 'lib', exports: ['x'], consumers: ['src/app/page.tsx'] }] }).includes('unknown-surface'), 'screen: an unknown surface name is refused')

  // ─── records ───
  spawnSync('git', ['-C', repo, 'init', '-q'])
  spawnSync('git', ['-C', repo, 'add', '.'])
  spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'])
  const rec = await lib.runRecord(repo, 'check', `${JSON.stringify(process.execPath)} -e "console.log('hello'); process.exit(3)"`)
  check(rec.record.exitCode === 3, `record: the exit code is the child's, got ${rec.record.exitCode}`)
  check(fs.existsSync(rec.recordPath) && fs.readFileSync(rec.record.stdoutPath, 'utf8').includes('hello'), 'record: output and record are written')
  check(rec.record.tree.head.length >= 7 && /^[0-9a-f]{40}$/.test(rec.record.tree.tree), 'record: the tree state is a git tree object')
  check(lib.recordFreshness(repo, rec.record).fresh, 'record: fresh right after it was taken')
  fs.writeFileSync(path.join(repo, 'src/features/index.ts'), 'export const changed = 1\n')
  check(!lib.recordFreshness(repo, rec.record).fresh, 'record: a changed tree makes the record stale')
  fs.writeFileSync(path.join(repo, 'src/features/index.ts'), 'export {}\n')
  check(lib.recordFreshness(repo, rec.record).fresh, 'record: restoring the tree restores freshness')
  // The two inputs a text-based hash got wrong: an untracked file git quotes in porcelain output
  // (its content then never reached the hash), and a diff larger than a child-process buffer.
  const quoted = path.join(repo, 'src', '\u0434\u0430\u043d\u043d\u044b\u0435.ts')
  fs.writeFileSync(quoted, 'export const a = 1\n')
  const withQuoted = await lib.runRecord(repo, 'check', 'true')
  fs.writeFileSync(quoted, 'export const a = 2\n')
  check(!lib.recordFreshness(repo, withQuoted.record).fresh, 'record: editing an untracked file with a non-ASCII name makes the record stale')
  fs.rmSync(quoted)
  fs.writeFileSync(path.join(repo, 'src/features/a/f0.ts'), `export const big = "${'x'.repeat(2 * 1024 * 1024)}"\n`)
  const withBig = await lib.runRecord(repo, 'check', 'true')
  fs.writeFileSync(path.join(repo, 'src/features/a/f0.ts'), `export const big = "${'y'.repeat(2 * 1024 * 1024)}"\n`)
  check(!lib.recordFreshness(repo, withBig.record).fresh, 'record: a further edit behind a multi-megabyte diff makes the record stale')
  fs.writeFileSync(path.join(repo, 'src/features/a/f0.ts'), 'export {}\n')
  const rec2 = await lib.runRecord(repo, 'check', 'true')
  check(rec2.recordPath !== rec.recordPath, 'record: each run gets its own artefact')
  // A signal to the wrapper reaches the check and the wrapper waits for it to end — even when
  // the check ignores the signal — before a record is written. Nothing here searches the machine
  // for processes by name: the record carries the child's pid, and that is what is checked.
  const token = `ncs-${process.pid}-${Date.now()}`
  const slow = spawn(process.execPath, [LIB, 'record', '--repo', repo, '--label', 'slow', '--kill-after', '500', '--', `trap '' TERM; sleep 30; echo ${token}`], { stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((r) => setTimeout(r, 700))
  const beforeSignal = fs.readdirSync(path.join(repo, '.nextjs-clean-migration/records')).filter((f) => f.includes('-slow-') && f.endsWith('.json'))
  check(beforeSignal.length === 0, 'record: no record exists while the check is still running')
  slow.kill('SIGTERM')
  const slowExit = await new Promise((r) => slow.on('exit', (code, sig) => r({ code, sig })))
  const slowRecords = fs.readdirSync(path.join(repo, '.nextjs-clean-migration/records')).filter((f) => f.includes('-slow-') && f.endsWith('.json'))
  check(slowRecords.length === 1, `record: the wrapper writes exactly one record after a signal (wrapper exit ${JSON.stringify(slowExit)})`)
  const slowRecord = slowRecords.length === 1 ? JSON.parse(fs.readFileSync(path.join(repo, '.nextjs-clean-migration/records', slowRecords[0]), 'utf8')) : null
  const childAlive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
  const groupAliveByPid = (pid) => { try { process.kill(-pid, 0); return true } catch { return false } }
  check(slowRecord && slowRecord.signal === 'SIGTERM' && slowRecord.exitCode === null, 'record: a killed check is recorded as killed, not as an exit code')
  check(slowRecord && typeof slowRecord.pid === 'number' && !childAlive(slowRecord.pid), 'record: the check that ignored SIGTERM is gone when the record exists (escalated within kill-after)')
  const slowMs = slowRecord ? new Date(slowRecord.endedAt) - new Date(slowRecord.startedAt) : -1
  check(slowMs >= 500 && slowMs < 5000, `record: the wrapper waited for the grace period and then escalated — not for the check to finish on its own (${slowMs} ms)`)

  // The leader itself ignoring the signal is the case a leader-exit trigger never reaches.
  const lead = spawn(process.execPath, [LIB, 'record', '--repo', repo, '--label', 'lead', '--kill-after', '500', '--', "trap '' TERM; sleep 30"], { stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((r) => setTimeout(r, 700))
  const leadStart = Date.now()
  lead.kill('SIGTERM')
  await Promise.race([new Promise((r) => lead.on('exit', () => r())), new Promise((r) => setTimeout(r, 6000))])
  const leadMs = Date.now() - leadStart
  const leadRecords = fs.readdirSync(path.join(repo, '.nextjs-clean-migration/records')).filter((f) => f.includes('-lead-') && f.endsWith('.json'))
  const leadRecord = leadRecords.length === 1 ? JSON.parse(fs.readFileSync(path.join(repo, '.nextjs-clean-migration/records', leadRecords[0]), 'utf8')) : null
  check(leadRecord && leadMs < 5000 && !groupAliveByPid(leadRecord.pid), `record: a leader that ignores SIGTERM is killed after the grace period and recorded (${leadMs} ms)`)
  if (!leadRecord) { try { lead.kill('SIGKILL') } catch { /* gone */ } }

  // A file force-added inside an ignored directory lives only in the index; its edits must count.
  fs.writeFileSync(path.join(repo, '.gitignore'), 'gen/\n')
  spawnSync('git', ['-C', repo, 'add', '.gitignore'])
  spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'ignore'])
  fs.mkdirSync(path.join(repo, 'gen'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'gen/x.ts'), 'a\n')
  spawnSync('git', ['-C', repo, 'add', '-f', 'gen/x.ts'])
  const withForced = await lib.runRecord(repo, 'check', 'true')
  fs.writeFileSync(path.join(repo, 'gen/x.ts'), 'b\n')
  check(!lib.recordFreshness(repo, withForced.record).fresh, 'record: editing a force-added ignored file makes the record stale')
  fs.writeFileSync(path.join(repo, 'gen/x.ts'), 'a\n')

  // An artifact is evidence only through the record whose run wrote it into that run's own
  // directory. A file that existed before the command ran cannot be there; a file the command
  // did not write is recorded as absent.
  const withArtifact = await lib.runRecord(repo, 'check', 'echo "[]" > "$NCS_ARTIFACTS/lint.json"', { artifacts: ['lint.json'] })
  const bound = withArtifact.record.artifacts[0]
  check(bound && bound.exists && /^[0-9a-f]{64}$/.test(bound.sha256) && bound.path.includes(`${withArtifact.record.id}.artifacts/`), 'record: an artifact written to $NCS_ARTIFACTS is hashed into the record under the run directory')
  check(lib.boundArtifact(repo, withArtifact.record, 'lint.json').ok, 'artifact: readable while its hash matches')
  fs.writeFileSync(path.join(repo, bound.path), '[{"filePath":"x","messages":[]}]')
  check(!lib.boundArtifact(repo, withArtifact.record, 'lint.json').ok, 'artifact: a replaced file is refused, even though the tree state is unchanged')
  check(!lib.boundArtifact(repo, withArtifact.record, 'other.json').ok, 'artifact: a file the record never bound is refused')
  const skipped = await lib.runRecord(repo, 'check', 'echo lint stage skipped', { artifacts: ['lint.json'] })
  check(skipped.record.artifacts[0].exists === false && !lib.boundArtifact(repo, skipped.record, 'lint.json').ok, 'artifact: a command that did not write the file leaves no evidence — a stale file elsewhere cannot stand in')
  const twins = await Promise.all([lib.runRecord(repo, 'twin', 'true'), lib.runRecord(repo, 'twin', 'true')])
  check(twins[0].recordPath !== twins[1].recordPath && twins[0].record.artifactDir !== twins[1].record.artifactDir, 'record: two runs started together get distinct ids and artifact directories')
  const unbound = await lib.runRecord(repo, 'check', 'true')
  check(!lib.boundArtifact(repo, unbound.record, 'lint.json').ok, 'artifact: a record taken without --artifact binds nothing')

  // A grandchild that ignores the signal outlives the shell leader; the record waits for the
  // whole group, escalating to SIGKILL, and is written only once nothing in the group answers.
  const gcToken = `ncs-gc-${process.pid}-${Date.now()}`
  const gc = spawn(process.execPath, [LIB, 'record', '--repo', repo, '--label', 'gc', '--kill-after', '500', '--', `${JSON.stringify(process.execPath)} -e "process.on('SIGTERM',()=>{});setTimeout(()=>{},20000)" & wait`], { stdio: ['ignore', 'pipe', 'pipe'] })
  void gcToken
  await new Promise((r) => setTimeout(r, 700))
  gc.kill('SIGTERM')
  await new Promise((r) => gc.on('exit', () => r()))
  const gcRecords = fs.readdirSync(path.join(repo, '.nextjs-clean-migration/records')).filter((f) => f.includes('-gc-') && f.endsWith('.json'))
  const gcRecord = gcRecords.length === 1 ? JSON.parse(fs.readFileSync(path.join(repo, '.nextjs-clean-migration/records', gcRecords[0]), 'utf8')) : null
  const groupAlive = (pid) => { try { process.kill(-pid, 0); return true } catch { return false } }
  check(gcRecord && gcRecord.signal === 'SIGTERM', 'record: the grandchild case still records the forwarded signal')
  check(gcRecord && !groupAlive(gcRecord.pid), 'record: when the record exists, no process of the group — leader or grandchild — is alive')

  // ─── census ───
  const eslintJson = JSON.stringify([
    { filePath: `${repo}/src/modules/work-items/domain/a.ts`, messages: [{ ruleId: 'clean-architecture/boundaries', messageId: 'domainDirection' }] },
    { filePath: `${repo}/src/app/page.tsx`, messages: [{ ruleId: 'clean-architecture/boundaries', messageId: 'appInternal' }, { ruleId: 'import/no-cycle', message: 'cycle' }] },
    { filePath: `${repo}/src/modules/other/server.ts`, messages: [] },
  ])
  const c = lib.censusFromEslintJson(`$ eslint\n${eslintJson}`, { moduleRoot: 'src/modules', capability: 'work-items' })
  check(c.ok && c.counts.domainDirection === 1 && c.counts.appInternal === 1 && c.counts['import/no-cycle'] === 1 && c.counts.capability === 1, `census: counts per messageId and the capability counter: ${JSON.stringify(c.counts)}`)
  const notJson = lib.censusFromEslintJson('42 problems', {})
  check(!notJson.ok, 'census: non-JSON output is reported, not counted as zero')
  const baselineScope = lib.censusFromEslintJson(eslintJson, { moduleRoot: 'src/modules' })
  check(baselineScope.ok && baselineScope.scope === 'baseline' && baselineScope.counts.capability === null, 'census: without a capability the capability counter is null, never a clean zero')
  const zeroFilled = lib.censusFromEslintJson('[]', { moduleRoot: 'src/modules', capability: 'work-items', baselineKeys: ['domainDirection', 'appInternal', 'capability'] })
  check(zeroFilled.counts.domainDirection === 0 && zeroFilled.counts.appInternal === 0 && zeroFilled.counts.capability === 0, 'census: a baseline key with no diagnostics left is a measured zero')
  const fixedLast = lib.recommend({ ...{ behaviour: { ok: true }, review: { verdict: 'sound', findings: [] }, census: { domainDirection: 1 } }, architecture: { ok: true, counts: { capability: 0 } } })
  check(fixedLast.gate === 'accept', `gate: fixing the last violation of a kind is 1 → 0, not an unmeasured counter: ${fixedLast.gate} ${fixedLast.reason}`)

  // ─── gate ───
  const green = { behaviour: { ok: true }, architecture: { ok: true, counts: { capability: 0, domainDirection: 2 } }, review: { verdict: 'sound', findings: [] }, census: { domainDirection: 2 } }
  check(lib.recommend(green).gate === 'accept', 'gate: all green accepts')
  check(lib.recommend({ ...green, radius: { ok: true, direction: 'grew', detail: '+3' } }).gate === 'accept', 'gate: a grown radius is a note, never a veto')
  check(lib.recommend({ ...green, radius: { ok: true, direction: 'grew', detail: '+3' } }).notes.some((n) => n.includes('grew')), 'gate: the grown radius is reported')
  check(lib.recommend({ ...green, review: { verdict: 'reject', findings: [] } }).gate === 'reject', 'gate: reject belongs to the review')
  check(lib.recommend({ ...green, behaviour: { ok: false } }).gate === 'revise', 'gate: red behaviour revises')
  check(lib.recommend({ ...green, architecture: { ok: true, counts: { capability: 0, domainDirection: 3 } } }).reason.includes('regressions'), 'gate: a counter above baseline is a regression')
  check(lib.recommend({ ...green, review: null }).gate === 'inconclusive', 'gate: silence is inconclusive')
  const capped = lib.recommend({ ...green, behaviour: { ok: false }, fixLoopExit: 'cap-reached' })
  check(capped.gate === 'revise' && capped.reason.startsWith('cap-reached'), 'gate: an exhausted budget is named as such, not as a red verdict')
  check(lib.recommend({ ...green, review: { verdict: 'sound', findings: [{ severity: 'should-fix', property: 'auth', detail: 'x' }] } }).notes.some((n) => n.includes('should-fix')), 'gate: should-fix findings reach the owner as notes')
  check(lib.recommend({ ...green, review: { verdict: 'sound', findings: [{ severity: 'must-fix', property: 'auth', detail: 'x' }] } }).gate === 'revise', 'gate: a must-fix revises')

  // ─── CLI round trip ───
  const cli = (...argv) => spawnSync(process.execPath, [LIB, ...argv], { encoding: 'utf8' })
  const r1 = cli('inventory', '--repo', repo, '--source-root', 'src')
  check(r1.status === 0 && JSON.parse(r1.stdout).count === 301, `cli inventory: status=${r1.status} out=${JSON.stringify(r1.stdout.slice(0, 400))} err=${r1.stderr.slice(0, 300)}`)
  const rulesFile = path.join(repo, 'rules.json')
  fs.writeFileSync(rulesFile, JSON.stringify({ rules, unassigned: [] }))
  const r2 = cli('expand', '--repo', repo, '--rules', rulesFile)
  check(r2.status === 0 && JSON.parse(r2.stdout).rows === 301, `cli expand: ${r2.stderr}`)
  fs.writeFileSync(rulesFile, JSON.stringify({ rules: rules.slice(1), unassigned: [] }))
  const r3 = cli('expand', '--repo', repo, '--rules', rulesFile)
  check(r3.status === 2, 'cli expand: uncovered files exit 2 so the owner decides them')
  const r4 = cli('record', '--repo', repo, '--label', 'lint', '--', 'echo', 'ok')
  check(r4.status === 0 && JSON.parse(r4.stdout).exitCode === 0, `cli record: ${r4.stderr}`)
  const r5 = cli('record-fresh', '--repo', repo, '--record', JSON.parse(r4.stdout).recordPath)
  check(r5.status === 0, 'cli record-fresh: fresh record exits 0')
  const r6 = cli('nonsense')
  check(r6.status === 1, 'cli: unknown command exits 1')
  // The hand-off expand → plan-check, as the skill runs it: the file expand wrote is what
  // plan-check reads, filtered to this capability's rows.
  fs.writeFileSync(rulesFile, JSON.stringify({ rules, unassigned: [] }))
  cli('expand', '--repo', repo, '--rules', rulesFile)
  const planFile = path.join(repo, 'plan.json')
  const featureRows = JSON.parse(fs.readFileSync(path.join(repo, '.nextjs-clean-migration/assignments.json'), 'utf8')).rows.filter((r) => r.capability === 'features')
  fs.writeFileSync(planFile, JSON.stringify({ moves: featureRows.map((r) => ({ file: r.file, role: 'domain' })), surfaces: [] }))
  const r7 = cli('plan-check', '--repo', repo, '--contract', path.join(root, 'rules/architecture-contract.json'), '--capability', 'features', '--plan', planFile, '--assignments', path.join(repo, '.nextjs-clean-migration/assignments.json'))
  check(r7.status === 0 && JSON.parse(r7.stdout).ok && JSON.parse(r7.stdout).assignedFiles === featureRows.length, `cli plan-check reads what expand wrote: ${r7.stderr.slice(0, 200)}`)
  const r8 = cli('destination', '--repo', repo, '--contract', path.join(root, 'rules/architecture-contract.json'), '--capability', '../../../outside', '--role', 'domain', '--file', 'src/a.ts')
  check(r8.status === 1 && JSON.parse(r8.stdout).dest === null, 'cli destination: a path-shaped capability is refused')
  const lintCmd = `printf '%s' ${JSON.stringify(JSON.stringify([{ filePath: `${repo}/src/features/a/f1.ts`, messages: [{ ruleId: 'clean-architecture/boundaries', messageId: 'appInternal' }] }]))} > "$NCS_ARTIFACTS/lint.json"`
  const r10 = cli('record', '--repo', repo, '--label', 'lint', '--artifact', 'lint.json', '--', lintCmd)
  const r10path = JSON.parse(r10.stdout).recordPath
  const r11 = cli('census', '--repo', repo, '--record', r10path, '--lint-json', 'lint.json', '--module-root', 'src/modules', '--capability', 'features')
  check(r11.status === 0 && JSON.parse(r11.stdout).counts.appInternal === 1, `cli census reads the bound artifact: ${r11.stdout.slice(0, 200)} ${r11.stderr.slice(0, 200)}`)
  fs.writeFileSync(path.join(repo, JSON.parse(fs.readFileSync(r10path, 'utf8')).artifacts[0].path), '[]')
  const r12 = cli('census', '--repo', repo, '--record', r10path, '--lint-json', 'lint.json', '--module-root', 'src/modules', '--capability', 'features')
  check(r12.status === 1 && /changed since record/.test(r12.stdout), 'cli census refuses a swapped JSON under the same record id')
  const r13 = cli('record', '--repo', repo, '--label', 'lint', '--artifact', 'lint.json', '--', 'echo lint stage skipped')
  const r14 = cli('census', '--repo', repo, '--record', JSON.parse(r13.stdout).recordPath, '--lint-json', 'lint.json', '--module-root', 'src/modules', '--capability', 'features')
  check(r14.status === 1 && /was not written by the command/.test(r14.stdout), 'cli census refuses a record whose command wrote no lint JSON')
  const link = path.join(repo, 'bin-link')
  fs.symlinkSync(path.dirname(LIB), link)
  const r9 = spawnSync(process.execPath, [path.join(link, path.basename(LIB)), 'tree-state', '--repo', repo], { encoding: 'utf8' })
  check(r9.status === 0 && r9.stdout.includes('"tree"'), 'cli: invoked through a symlinked path it still runs')
  fs.rmSync(link)
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}

fail(errors)
console.log('migration lib ok (inventory 301 files without an agent, coverage rules, destinations, plan screening, owned records, census, gate)')
