export const meta = {
  name: 'verify',
  description:
    'The two judgement calls of a capability migration, in parallel, over one check record the session already produced: an adversarial review of the properties static rules cannot prove, and an advisory change-radius estimate. Behaviour and architecture verdicts are not agents — bin/migration.mjs computes them from the same record. args: { repo, capability, recordPath, diffBase, contractSource, ordinaryChange?, baselineRadius?, reviewerBudget? }.',
  whenToUse:
    'Called by the migrating-architecture skill after it moved a capability and ran the owned check (`migration.mjs record`). Never call it on a stale record: run `migration.mjs record-fresh` first.',
  phases: [{ title: 'Verify', detail: 'review and radius, both read the owner\'s check record' }],
}

// One record, two readers. The check command was run once by the session as its own
// child process; its command, exit code and tree state are in the record. Neither agent
// here runs the check again, waits for a file to appear, or judges from a file it did
// not see written — the record is the evidence, and a record that no longer matches the
// tree is refused before any agent is paid.

let ARGS = args || {}
if (typeof args === 'string') {
  try {
    ARGS = JSON.parse(args)
  } catch (error) {
    return { error: 'args is not valid JSON: ' + error.message }
  }
}
if (!ARGS || typeof ARGS !== 'object') return { error: 'args must be an object' }

const REPO = ARGS.repo || ''
const CAP = ARGS.capability || ''
const RECORD = ARGS.recordPath || ''
const DIFF_BASE = ARGS.diffBase || ''
const SRC = ARGS.contractSource || ''
const ORDINARY = ARGS.ordinaryChange || ''
const BASELINE_RADIUS = ARGS.baselineRadius || ''
const BUDGET = typeof ARGS.reviewerBudget === 'number' && ARGS.reviewerBudget > 0 ? ARGS.reviewerBudget : 60
if (!REPO) return { error: 'args.repo is required' }
if (!CAP || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(CAP)) return { error: 'args.capability is required and must be kebab-case' }
if (!RECORD) return { error: 'args.recordPath is required: the JSON written by `migration.mjs record` for this tree state' }
if (!DIFF_BASE) return { error: 'args.diffBase is required: the commit the migration diff is read against' }
if (!SRC) return { error: 'args.contractSource is required: the installed plugin root' }

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'findings', 'recordId', 'budgetExhausted'],
  properties: {
    verdict: { type: 'string', enum: ['sound', 'revise', 'reject'] },
    budgetExhausted: { type: 'boolean', description: 'true when the turn budget ran out before every property was checked; the verdict then covers only what was verified' },
    recordId: { type: 'string', description: 'the id field of the record you read; proves which evidence this verdict is about' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'property', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
          property: { type: 'string' },
          detail: { type: 'string', description: 'file:line and what is wrong; never a restatement of the property' },
        },
      },
    },
  },
}

const RADIUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'direction', 'detail'],
  properties: {
    ok: { type: 'boolean' },
    direction: { type: 'string', enum: ['shrunk', 'same', 'grew', 'unknown'] },
    detail: { type: 'string' },
  },
}

const RECORD_BLOCK =
  `## The check record\n${RECORD} — JSON with { id, command, exitCode, tree, stdoutPath }. Read it first and cite its \`id\` in your answer. ` +
  'Its stdoutPath holds the full output of the target\'s own typecheck, lint, tests and production build. ' +
  'Do NOT run those commands yourself, do NOT wait for any file, and do NOT infer a result from a file you did not see this record name.\n'

phase('Verify')
const tasks = [
  () => agent(
    `Adversarial review of the migration of "${CAP}" in ${REPO}, read against \`git diff ${DIFF_BASE}\`.\n\n` +
    RECORD_BLOCK + '\n' +
    `## Review exactly the properties static rules cannot prove\nThey are listed in ${SRC}/docs/adoption-and-enforcement.md under "What Static Rules Cannot Prove" and in ${SRC}/rules/README.md. ` +
    'For each: does the migrated capability satisfy it, with file:line evidence? A finding restates nothing; it names a place and what is wrong.\n\n' +
    '## Also check\n- every moved file lost its obsolete old path in this same change;\n- no compatibility bucket, re-export tunnel, or eslint-disable was introduced;\n' +
    '- a declared channel change (Server Action → GET, etc.) has its behaviour risk named.\n\n' +
    '## Module cohesion audit\n' +
    '- no directory is justified only by tests, mocks, fixtures, or a lone type;\n' +
    '- test-only probes and fixtures remain behind test boundaries and production surfaces do not export them;\n' +
    '- helpers sit with their owning behavior (`lib.ts` or `lib/`), and presentation formatting sits under `ui/`;\n' +
    '- runtime schemas and TypeScript types do not duplicate the same shape without an intentional contract distinction;\n' +
    '- every root `query-cache.ts` has a named server prefetch/hydration consumer and browser query consumer; otherwise its keys are private to the owning runtime;\n' +
    '- root surfaces keep policy, IO and substantial channel implementations private; small public-contract translation, runtime composition and admitted neutral behavior (such as query-key factories) have one owner;\n' +
    '- no test registers `mock.module` on a path that does not resolve on disk after a move — a stale mock leaves the real module live and the test green for the wrong reason.\n\n' +
    '## Verdict\n`sound` = nothing must-fix. `revise` = this migration needs work, the model is fine. `reject` = the ownership model is wrong for this codebase — reserve it for that.\n' +
    'A should-fix is a real finding the owner must verify; do not downgrade a defect to should-fix to avoid a verdict.\n\n' +
    `Budget: ${BUDGET} turns. If you run out, set budgetExhausted=true and return only what you verified; never guess the rest.\n\nStructured output only.`,
    { label: 'review', phase: 'Verify', schema: REVIEW_SCHEMA }
  ),
]
if (ORDINARY) {
  tasks.push(() => agent(
    `Estimate the change radius AFTER the migration of "${CAP}" in ${REPO}, for comparison with the recorded before-estimate. This is an estimate and is reported as advice.\n\n` +
    RECORD_BLOCK + '\n' +
    '## The ordinary follow-up change\n' + ORDINARY + '\n\n' +
    '## Before (recorded, verbatim)\n' + (BASELINE_RADIUS || '(not recorded — then answer direction "unknown")') + '\n\n' +
    '## Now\nDo NOT implement the change. Determine the touch set it would require in the migrated tree: every file that would have to be edited and how many distinct areas they span. ' +
    'Compare with the before set; say whether the radius shrank, stayed the same, or grew, and count forwarding wrappers the migration introduced plus any auth or error-reporting logic now duplicated. ' +
    'A radius that grew is a real result — report it. Read only.\n\nStructured output only.',
    { label: 'radius', phase: 'Verify', schema: RADIUS_SCHEMA }
  ))
}
const [review, radius] = await parallel(tasks)

// A reviewer that returned nothing, or ran out of budget before finishing, is "no verdict"
// for that axis: its partial findings are kept for the owner, but no verdict is derived from
// an unfinished review. The owner decides whether to re-run it or verify the axis itself. It
// is not a failed migration.
const reviewComplete = !!review && review.budgetExhausted !== true
log('Verify: review ' + (reviewComplete ? review.verdict : 'no verdict') + (ORDINARY ? '; radius ' + (radius ? radius.direction : 'not reported') : ''))
return {
  recordPath: RECORD,
  review: reviewComplete ? review : null,
  partialReview: review && !reviewComplete ? review : null,
  radius: ORDINARY ? radius || null : null,
  noVerdict: [...(reviewComplete ? [] : ['review']), ...(ORDINARY && !radius ? ['radius'] : [])],
}
