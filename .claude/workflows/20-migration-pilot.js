export const meta = {
  name: '20-migration-pilot',
  description:
    'Phase 2 of capability-first adoption: migrate ONE capability end-to-end against three independent oracles (behaviour unchanged, architecture violations to zero, adversarial review), measure the change radius, and stop at the human accept/revise/reject gate.',
  whenToUse:
    'Run after 10-migration-inventory, once per capability, starting with the pilot. args: { repo, capability, manifestPath, moduleRoot?, sharedRoot?, maxFixRounds? }.',
  phases: [
    { title: 'Load', detail: 'read migration-manifest.json and the rows for this capability' },
    { title: 'Plan', detail: 'per-file role decisions; the target paths are computed here, not by an agent' },
    { title: 'Move', detail: 'internals first, then external consumers onto the new public surfaces' },
    { title: 'Verify', detail: 'three oracles in parallel — behaviour, architecture, adversarial review' },
    { title: 'Fix', detail: 'bounded fix rounds while the architectural oracle is red' },
    { title: 'Radius', detail: 'touch set for the same ordinary change, after vs before' },
  ],
}

// Phase 2 of the program in ./README.md. Executes docs/adoption-and-enforcement.md
// "Adopt In An Existing Project" steps 3-10 for a single capability, and honours
// its "Incremental Migration" rules: one capability never carries both physical
// topologies, and its obsolete old paths go in the same change.
//
// The oracles are not invented here. They already exist in this repository:
// behaviour = the target's own typecheck/tests/production build; architecture =
// rules/ (16 named messageIds + the cycle, ownership and dependency checks);
// review = the properties docs/adoption-and-enforcement.md says static rules
// cannot prove. A pilot is accepted only when all three agree.

const REPO = (args && args.repo) || ''
const CAP = (args && args.capability) || ''
const MANIFEST = (args && args.manifestPath) || (REPO ? REPO + '/migration-manifest.json' : '')
const MAX_FIX = Math.max(0, (args && args.maxFixRounds) || 2)

if (!REPO || !CAP) return { error: 'args.repo and args.capability are both required' }

const SCOPE_GUARDS = `
## Scope guards (do not violate, even if it looks like an improvement)
- Do NOT migrate or replace any framework or library. Preserve the existing schema, form, UI,
  cache, notification and provider libraries exactly as they are.
- Do NOT create a compatibility \`lib\`, \`services\`, \`utils\` or \`common\` bucket.
- Do NOT touch another capability's internals. Cross-capability access goes through public surfaces.
- Do NOT leave the capability half-migrated: one capability never carries both the old and the new
  physical topology, and its obsolete old paths are deleted in this same change.
- Do NOT rename product concepts, reformat untouched code, or fix unrelated defects.
- A re-export does not launder an illegal dependency. If a boundary fails, report it — do not tunnel
  around it with a deep relative import, a barrel, or a broader shared folder.
`.trim()

const MANIFEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'assignments'],
  properties: {
    found: { type: 'boolean' },
    roots: { type: 'object', additionalProperties: false, properties: { sourceRoot: { type: 'string' }, appRoot: { type: 'string' }, moduleRoot: { type: 'string' }, sharedRoot: { type: 'string' } } },
    segments: { type: 'array', items: { type: 'string' } },
    publicSurfaces: { type: 'array', items: { type: 'string' } },
    ordinaryChange: { type: 'string' },
    baselineRadius: { type: 'string', description: 'the before touch set recorded by phase 1, verbatim' },
    violationCensus: { type: 'object', additionalProperties: { type: 'integer' } },
    consumers: { type: 'array', items: { type: 'string' }, description: 'app routes and other capabilities that use this capability today' },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file'],
        properties: {
          file: { type: 'string' },
          segment: { type: 'string' },
          surface: { type: 'string' },
          runtime: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['moves', 'surfaces'],
  properties: {
    moves: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'role'],
        properties: {
          file: { type: 'string', description: 'repo-relative current path' },
          role: { enum: ['domain', 'application', 'server', 'client', 'ui', 'surface', 'stay', 'delete'] },
          surface: { type: 'string', description: 'required when role=surface; must be an admitted surface name' },
          basename: { type: 'string', description: 'file name at the destination, without directories' },
          why: { type: 'string' },
        },
      },
    },
    surfaces: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['surface', 'consumers', 'exports'],
        properties: {
          surface: { type: 'string' },
          consumers: { type: 'array', items: { type: 'string' }, description: 'the REAL consumers that need it; a surface with none is not created' },
          exports: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    emptySegmentsAvoided: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const STEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'detail'],
  properties: {
    ok: { type: 'boolean' },
    command: { type: 'string' },
    counts: { type: 'object', additionalProperties: { type: 'integer' } },
    filesTouched: { type: 'array', items: { type: 'string' } },
    detail: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'findings'],
  properties: {
    verdict: { enum: ['sound', 'revise', 'reject'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['property', 'detail', 'severity'],
        properties: {
          property: { type: 'string', description: 'the named property or review question at stake' },
          file: { type: 'string' },
          detail: { type: 'string' },
          fix: { type: 'string' },
          severity: { enum: ['must-fix', 'should-fix', 'nit'] },
        },
      },
    },
  },
}

// ─── Load ───
phase('Load')

const m = await agent(
  `Read ${MANIFEST} and return the slice that describes the capability "${CAP}".\n\n` +
  '## What to return\n' +
  '- roots: sourceRoot, appRoot, and moduleRoot/sharedRoot if the manifest or the target\'s rules/architecture-contract.json records them.\n' +
  `- segments and publicSurfaces: the admitted vocabulary, read from ${REPO}/rules/architecture-contract.json.\n` +
  `- assignments: every entry whose capability is "${CAP}", verbatim.\n` +
  `- consumers: that capability's recorded consumers.\n` +
  '- ordinaryChange, and baselineRadius: the before touch set the change-radius baseline probe recorded (copy its detail verbatim).\n' +
  '- violationCensus: the recorded counts.\n\n' +
  'Read only. Write nothing. If the manifest is missing, return found=false.\n\nStructured output only.',
  { label: 'load-manifest', phase: 'Load', schema: MANIFEST_SCHEMA }
)

if (!m || !m.found) return { error: 'could not load ' + MANIFEST + ' — run 10-migration-inventory first' }

const roots = m.roots || {}
const SOURCE = roots.sourceRoot || 'src'
const MODULE_ROOT = (args && args.moduleRoot) || roots.moduleRoot || SOURCE + '/modules'
const SHARED_ROOT = (args && args.sharedRoot) || roots.sharedRoot || SOURCE + '/shared'
const SEGMENTS = m.segments && m.segments.length > 0 ? m.segments : ['domain', 'application', 'server', 'client', 'ui']
const SURFACES = m.publicSurfaces && m.publicSurfaces.length > 0 ? m.publicSurfaces : ['server', 'rsc', 'actions', 'client', 'ui', 'query-cache', 'stream', 'job']
const FILES = m.assignments || []
const CONSUMERS = m.consumers || []
const CENSUS = m.violationCensus || {}
const CENSUS_TOTAL = Object.keys(CENSUS).reduce((n, k) => n + (CENSUS[k] || 0), 0)

if (FILES.length === 0) return { error: 'the manifest has no files assigned to capability "' + CAP + '"' }
log('Pilot ' + CAP + ': ' + FILES.length + ' files, ' + CONSUMERS.length + ' recorded consumers, ' + CENSUS_TOTAL + ' violations at baseline')

// ─── Destination paths are computed HERE ───
// The agent decides the ROLE of a file; the layout is contract-derived arithmetic
// and is never a model judgement. Whatever a mover claims it wrote, the path it
// was told to write is the one this workflow verifies — so a plausible-looking
// alternative layout cannot enter the tree.
const base = f => {
  const parts = String(f).split('/')
  return parts[parts.length - 1]
}
function destination(move) {
  if (!move || move.role === 'stay' || move.role === 'delete') return null
  if (move.role === 'surface') {
    if (SURFACES.indexOf(move.surface) === -1) return null
    return MODULE_ROOT + '/' + CAP + '/' + move.surface + '.ts'
  }
  if (SEGMENTS.indexOf(move.role) === -1) return null
  return MODULE_ROOT + '/' + CAP + '/' + move.role + '/' + (move.basename || base(move.file))
}

// ─── Plan ───
phase('Plan')

const FILE_BLOCK = FILES.map(a =>
  '- ' + a.file + (a.segment ? ' [assigned segment: ' + a.segment + ']' : '') + (a.surface ? ' [assigned surface: ' + a.surface + ']' : '') +
  (a.runtime ? ' [runtime: ' + a.runtime + ']' : '') + (a.evidence ? ' — ' + a.evidence : '')
).join('\n')

const plan = await agent(
  `Plan the capability-first migration of ONE capability, "${CAP}", in ${REPO}.\n\n` +
  '## Normative sources (read them; every rule below is load-bearing)\n' +
  `- ${m.roots && m.roots.sourceRoot ? '' : ''}${(args && args.contractSource) || REPO}/rules/architecture-contract.json — admitted segments and surfaces\n` +
  '- The repository\'s own architecture docs and the designing-nextjs-capabilities skill, if present.\n\n' +
  '## Files phase 1 assigned to this capability\n' + FILE_BLOCK + '\n\n' +
  '## Recorded consumers of this capability today\n' + (CONSUMERS.length > 0 ? CONSUMERS.map(c => '- ' + c).join('\n') : '- (none recorded)') + '\n\n' +
  '## What to decide — and only this\n' +
  'For each file, its ROLE: one of ' + SEGMENTS.join(' | ') + ' | surface | stay | delete. Re-derive it from the code; the assigned segment above is phase 1\'s opinion, not a instruction, and you may correct it with evidence.\n' +
  'For role=surface, name an admitted surface from: ' + SURFACES.join(', ') + '.\n' +
  'Optionally a `basename` if the destination file should be renamed for clarity.\n' +
  'Then the surface list: for each surface you propose, the REAL consumers that need it and the exports it publishes.\n\n' +
  '## Hard rules\n' +
  '- Do NOT propose destination directories or paths. This workflow computes them from the contract. Give roles only.\n' +
  '- Create a surface ONLY for a named consumer in the list above. A surface nobody imports is a defect, not future-proofing.\n' +
  '- Do NOT propose a segment that would end up empty. List the ones you deliberately avoided.\n' +
  '- Route-private UI stays under the app root: that is role=stay, not a capability file.\n' +
  '- `export *` is never allowed on a surface. Action values are local async functions, not value re-exports.\n\n' +
  SCOPE_GUARDS + '\n\n' +
  'Read and Grep only in this phase — change nothing yet.\n\nStructured output only.',
  { label: 'plan:' + CAP, phase: 'Plan', schema: PLAN_SCHEMA }
)

if (!plan) return { error: 'plan agent returned no result' }

const resolved = (plan.moves || []).map(mv => ({ ...mv, dest: destination(mv) }))
const invalid = resolved.filter(r => r.role !== 'stay' && r.role !== 'delete' && !r.dest)
const moving = resolved.filter(r => r.dest)
const staying = resolved.filter(r => r.role === 'stay')
const deleting = resolved.filter(r => r.role === 'delete')
const usedSurfaces = (plan.surfaces || []).filter(s => (s.consumers || []).length > 0)
const unusedSurfaces = (plan.surfaces || []).filter(s => (s.consumers || []).length === 0)

if (invalid.length > 0) {
  return {
    error: 'plan rejected: ' + invalid.length + ' file(s) got a role outside the admitted vocabulary',
    invalid: invalid.map(r => ({ file: r.file, role: r.role, surface: r.surface })),
    admitted: { segments: SEGMENTS, surfaces: SURFACES },
  }
}
log('Plan: ' + moving.length + ' moves, ' + staying.length + ' stay, ' + deleting.length + ' delete, ' + usedSurfaces.length + ' surfaces' + (unusedSurfaces.length > 0 ? ' (' + unusedSurfaces.length + ' proposed with no consumer — dropped)' : ''))

const MOVE_TABLE = moving.map(r => '- ' + r.file + '  ->  ' + r.dest + (r.why ? '   (' + r.why + ')' : '')).join('\n')
const SURFACE_TABLE = usedSurfaces.map(s =>
  '- ' + MODULE_ROOT + '/' + CAP + '/' + s.surface + '.ts  exports: ' + (s.exports || []).join(', ') + '  for: ' + (s.consumers || []).join(', ')
).join('\n')

// ─── Move: internals, then consumers. Two agents, in order. ───
// Not parallel and not one agent: the internal rewrite must settle before the
// external rewrite can point at a stable surface, and an agent doing both at
// once reliably leaves the capability importing its own old paths.
phase('Move')

const internals = await agent(
  `Migrate the internals of capability "${CAP}" in ${REPO} to the paths below. Nothing else.\n\n` +
  '## Moves — these destinations are final, computed from the contract. Use them EXACTLY.\n' + MOVE_TABLE + '\n\n' +
  (deleting.length > 0 ? '## Delete after their content has moved\n' + deleting.map(r => '- ' + r.file).join('\n') + '\n\n' : '') +
  (staying.length > 0 ? '## Leave in place (route-private or not this capability\'s)\n' + staying.map(r => '- ' + r.file).join('\n') + '\n\n' : '') +
  '## Steps\n' +
  '1. Move each file to its destination and rewrite the imports INSIDE this capability so they resolve.\n' +
  '2. Point private code inward: a private segment imports its own capability\'s segments, the admitted shared roots, and classified pure packages — not another capability\'s internals.\n' +
  '3. Delete the obsolete old paths in this same change. Leaving both topologies in place is a failure of this phase.\n' +
  '4. Do NOT yet touch files outside this capability — the next agent does that.\n\n' +
  SCOPE_GUARDS + '\n\n' +
  'Report every file you touched in filesTouched. If a move is impossible, stop and report it rather than improvising a different layout.\n\nStructured output only.',
  { label: 'move:internals', phase: 'Move', schema: STEP_SCHEMA }
)
log('Move internals: ' + (internals && internals.ok ? (internals.filesTouched || []).length + ' files touched' : 'FAILED — ' + ((internals && internals.detail) || 'no result')))

const external = internals && internals.ok
  ? await agent(
      `Point every consumer of capability "${CAP}" in ${REPO} at its new public surfaces.\n\n` +
      '## The surfaces that now exist\n' + (SURFACE_TABLE || '- (none — this capability has no external consumers)') + '\n\n' +
      '## Consumers to update\n' + (CONSUMERS.length > 0 ? CONSUMERS.map(c => '- ' + c).join('\n') : '- (none recorded; verify with Grep before concluding there are none)') + '\n\n' +
      '## Steps\n' +
      `1. Grep the whole source root for imports of this capability's OLD paths. The recorded consumer list may be incomplete — the grep is authoritative.\n` +
      '2. Rewrite each to import from the matching public surface. If a consumer needs something no surface publishes, either add it to the right surface\'s exports or report that the boundary is genuinely wrong — do NOT reach into internals.\n' +
      '3. Publish only what a real consumer imports. Remove any export nothing uses.\n\n' +
      SCOPE_GUARDS + '\n\n' +
      'Report every file you touched.\n\nStructured output only.',
      { label: 'move:consumers', phase: 'Move', schema: STEP_SCHEMA }
    )
  : null
if (external) log('Move consumers: ' + (external.ok ? (external.filesTouched || []).length + ' files touched' : 'FAILED — ' + external.detail))

// ─── Verify: three independent oracles ───
const ARCH_PROBE =
  `Measure the architectural oracle in ${REPO} after the migration of "${CAP}".\n\n` +
  '## Run all of these and report faithfully\n' +
  '- ESLint with the installed boundary configs over the source root.\n' +
  '- `node rules/check-module-cycles.mjs`\n' +
  '- `node rules/check-dependency-classification.mjs`\n' +
  '- `node rules/check-database-resources.mjs` if the contract declares database resources.\n\n' +
  '## Report\n' +
  '`counts` keyed by ESLint messageId plus one key per non-ESLint tool, over the WHOLE source root. ' +
  `Additionally include the key \`capability\` with the number of violations whose file is under ${MODULE_ROOT}/${CAP}/.\n\n` +
  'Baseline census for comparison (do NOT try to make the numbers look good — report what the tools say):\n' +
  '```json\n' + JSON.stringify(CENSUS, null, 2) + '\n```\n\n' +
  'Set ok=true only when the capability key is 0 and no total exceeds its baseline. Fix nothing.\n\nStructured output only.'

async function verifyAll() {
  const probes = [
    { key: 'behaviour', text: `Run the target's typecheck, full test suite, and PRODUCTION build in ${REPO}. Report each command and its result in detail, and set ok=true only if all three pass. A production build is what proves server/client separation — do not substitute a dev server. Fix nothing.` },
    { key: 'architecture', text: ARCH_PROBE },
  ]
  const out = await parallel(
    probes.map(p => () => agent(p.key === 'architecture' ? p.text : 'Measure one oracle after the migration.\n\n' + p.text, { label: 'verify:' + p.key, phase: 'Verify', schema: STEP_SCHEMA }))
      .concat([() => agent(
        `Adversarially review the migration of capability "${CAP}" in ${REPO}. Your job is to find where it is WRONG, not to agree.\n\n` +
        '## Review exactly the properties static rules cannot prove\n' +
        'For each, decide from the code and say which files settle it:\n' +
        '- does each operation pass the deletion test?\n' +
        '- does each port speak application language rather than provider language?\n' +
        '- does each public surface actually NARROW, or is it a barrel with a new name?\n' +
        '- are shared semantics genuinely identical wherever shared code is used?\n' +
        '- is auth policy correct at the new boundary?\n' +
        '- is one failure reported exactly once?\n' +
        '- is cache ownership singular?\n' +
        '- do streams handle commit, cancellation and resume?\n\n' +
        '## Also check the migration rules themselves\n' +
        '- Does the capability carry BOTH topologies anywhere, or are obsolete old paths still present?\n' +
        '- Is there a new compatibility `lib`/`services`/`utils` bucket?\n' +
        '- Was an illegal dependency laundered through a re-export, barrel, or deep relative import?\n' +
        '- Does any surface exist that no consumer imports?\n' +
        '- Was any library, schema tool, or UI kit swapped as a side effect? That is out of scope and is a must-fix.\n\n' +
        '## Verdict\n' +
        'Default to `revise` if you find any must-fix. Reserve `reject` for a migration whose ownership model is wrong at the root, not for fixable defects. ' +
        'Do NOT flag: unresolved imports that the next capability will provide, formatting, or anything the architecture docs explicitly defer.\n' +
        'Read only — change nothing.\n\nStructured output only.',
        { label: 'verify:review', phase: 'Verify', schema: REVIEW_SCHEMA }
      )])
  )
  return { behaviour: out[0], architecture: out[1], review: out[2] }
}

phase('Verify')
let v = await verifyAll()

// ─── Fix: bounded rounds, only while the architectural oracle is red ───
let fixRounds = 0
while (
  fixRounds < MAX_FIX &&
  ((v.architecture && !v.architecture.ok) || (v.behaviour && !v.behaviour.ok) ||
   (v.review && (v.review.findings || []).some(f => f.severity === 'must-fix')))
) {
  fixRounds += 1
  phase('Fix')
  const musts = ((v.review && v.review.findings) || []).filter(f => f.severity !== 'nit')
  const fixed = await agent(
    `Fix round ${fixRounds} for the migration of "${CAP}" in ${REPO}. Apply these findings and nothing else.\n\n` +
    '## Behaviour oracle\n' + ((v.behaviour && v.behaviour.detail) || '(no result)') + '\n\n' +
    '## Architecture oracle\n' + ((v.architecture && v.architecture.detail) || '(no result)') +
    '\ncounts: ' + JSON.stringify((v.architecture && v.architecture.counts) || {}) + '\n\n' +
    '## Review findings to apply\n' + (musts.length > 0 ? JSON.stringify(musts, null, 2) : '(none)') + '\n\n' +
    '## Rules\n' +
    'Surgical edits. Do NOT re-plan the migration and do NOT move files to different destinations than the ones already used.\n' +
    'If a finding is wrong, skip it and say so in detail rather than damaging correct code to satisfy it.\n' +
    'A violation is fixed by correcting the dependency, not by silencing the rule: no eslint-disable, no widening the contract, no re-export tunnel.\n\n' +
    SCOPE_GUARDS + '\n\nStructured output only.',
    { label: 'fix:round-' + fixRounds, phase: 'Fix', schema: STEP_SCHEMA }
  )
  log('Fix round ' + fixRounds + ': ' + (fixed && fixed.ok ? (fixed.filesTouched || []).length + ' files touched' : 'no result'))
  phase('Verify')
  v = await verifyAll()
}

// ─── Radius: the quality oracle ───
phase('Radius')

const radius = m.ordinaryChange
  ? await agent(
      `Measure the change radius AFTER the migration, for comparison with the recorded before-measurement.\n\n` +
      '## The ordinary follow-up change\n' + m.ordinaryChange + '\n\n' +
      '## Before (recorded by phase 1, verbatim)\n' + (m.baselineRadius || '(not recorded)') + '\n\n' +
      `## Now\n` +
      'Do NOT implement the change. Determine the touch set it would require in the migrated tree: every file that would have to be edited, and how many distinct areas they span. ' +
      'Then compare with the before set and state plainly whether the radius shrank, stayed the same, or grew — and count any forwarding wrappers the migration introduced, plus any auth or error-reporting logic that is now duplicated.\n\n' +
      'A radius that grew is a real result and must be reported as such. Read only.\n\nStructured output only.',
      { label: 'radius', phase: 'Radius', schema: STEP_SCHEMA }
    )
  : null

const archCounts = (v.architecture && v.architecture.counts) || {}
const archTotal = Object.keys(archCounts).filter(k => k !== 'capability').reduce((n, k) => n + (archCounts[k] || 0), 0)
const capViolations = archCounts.capability
const regressions = Object.keys(archCounts).filter(k => k !== 'capability' && (archCounts[k] || 0) > (CENSUS[k] || 0))
const mustFix = ((v.review && v.review.findings) || []).filter(f => f.severity === 'must-fix')

const gate =
  !(v.behaviour && v.behaviour.ok) ? 'reject'
  : capViolations !== 0 || regressions.length > 0 ? 'revise'
  : v.review && v.review.verdict === 'reject' ? 'reject'
  : mustFix.length > 0 ? 'revise'
  : 'accept'

log('Pilot ' + CAP + ': oracles → behaviour=' + (v.behaviour && v.behaviour.ok ? 'green' : 'RED') +
    ' capabilityViolations=' + (capViolations === undefined ? '?' : capViolations) +
    ' review=' + ((v.review && v.review.verdict) || '?') + ' → recommendation ' + gate)

return {
  capability: CAP,
  recommendation: gate,
  humanGate:
    'docs/adoption-and-enforcement.md requires a human decision here: accept, revise, or reject the ' +
    'architecture BEFORE migrating another capability. This workflow does not migrate the next one.',
  plan: { moves: moving.length, stayed: staying.length, deleted: deleting.length, surfaces: usedSurfaces.map(s => s.surface), surfacesDroppedForNoConsumer: unusedSurfaces.map(s => s.surface), emptySegmentsAvoided: plan.emptySegmentsAvoided || [], risks: plan.risks || [] },
  oracles: {
    behaviour: v.behaviour ? { ok: v.behaviour.ok, detail: v.behaviour.detail } : null,
    architecture: v.architecture ? { ok: v.architecture.ok, capabilityViolations: capViolations, totalNow: archTotal, totalAtBaseline: CENSUS_TOTAL, regressions, counts: archCounts } : null,
    review: v.review ? { verdict: v.review.verdict, mustFix: mustFix.length, findings: v.review.findings } : null,
  },
  changeRadius: radius ? { ok: radius.ok, detail: radius.detail } : 'not measured — phase 1 recorded no ordinaryChange',
  fixRounds,
  filesTouched: []
    .concat((internals && internals.filesTouched) || [])
    .concat((external && external.filesTouched) || []),
}
