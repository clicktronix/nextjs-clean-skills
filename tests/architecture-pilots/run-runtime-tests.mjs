#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pilotRoot = path.join(root, 'tests/architecture-pilots')
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'nextjs-clean-pilots-'))
const tsc = path.join(root, 'node_modules/.bin/tsc')

function listTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(absolute)
    return entry.name.endsWith('.ts')
      ? [path.relative(root, absolute).split(path.sep).join('/')]
      : []
  })
}

function createReporter() {
  const calls = []
  return {
    calls,
    reporter: {
      capture(error, attributes) {
        calls.push({ error, attributes })
      },
    },
  }
}

async function collect(iterable) {
  const values = []
  for await (const value of iterable) values.push(value)
  return values
}

async function testWorkItems(load) {
  const storeModule = await load('work-items/src/modules/work-items/server/store.js')
  const serverModule = await load('work-items/src/modules/work-items/server.js')
  const rscModule = await load('work-items/src/modules/work-items/rsc.js')
  const actionsModule = await load('work-items/src/modules/work-items/actions.js')
  const clientModule = await load('work-items/src/modules/work-items/client.js')
  const uiModule = await load('work-items/src/modules/work-items/ui.js')
  const routeModule = await load('work-items/src/app/api/work-items/route.js')

  const remoteRows = [
    {
      id: 'item-a',
      tenant_id: 'tenant-a',
      title: 'Alpha',
      description: null,
      is_priority: true,
      due_at: '2026-08-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'item-b',
      tenant_id: 'tenant-b',
      title: 'Beta',
      description: null,
      is_priority: false,
      due_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  const source = storeModule.createHttpWorkItemSource({
    async request(method, pathname, body) {
      if (method === 'GET') {
        const tenantId = new URL(`https://provider.test${pathname}`).searchParams.get(
          'tenantId'
        )
        return {
          status: 200,
          body: remoteRows.filter((row) => row.tenant_id === tenantId),
        }
      }
      remoteRows.push(body)
      return { status: 201, body }
    },
  })
  const invalidated = []
  const server = serverModule.createWorkItemsServer({
    store: storeModule.createWorkItemStore(source),
    cache: {
      async invalidate(tenantId) {
        invalidated.push(tenantId)
      },
    },
  })
  const context = {
    actorId: 'actor-a',
    tenantId: 'tenant-a',
    requestId: 'request-a',
    roles: ['admin'],
  }
  const reports = createReporter()

  const rscItems = await rscModule.readWorkItemsForRsc(context, server, reports.reporter)
  assert.deepEqual(rscItems.map((item) => item.id), ['item-a'])
  assert.equal('tenant_id' in rscItems[0], false)
  assert.equal(rscItems[0].priority, true)
  assert.equal(rscItems[0].dueAt, '2026-08-01T00:00:00.000Z')

  const invalidAction = await actionsModule.createWorkItemAction(
    { title: ' ' },
    context,
    server,
    reports.reporter
  )
  assert.deepEqual(invalidAction, { ok: false, code: 'INVALID_INPUT' })
  assert.equal(reports.calls.length, 0)

  const created = await actionsModule.createWorkItemAction(
    { title: 'New item', priority: true, dueAt: '2026-08-15T00:00:00.000Z' },
    context,
    server,
    reports.reporter
  )
  assert.equal(created.ok, true)
  assert.deepEqual(invalidated, ['tenant-a'])

  const httpDependencies = {
    authenticate: async () => context,
    server,
    reporter: reports.reporter,
  }
  const response = await routeModule.getWorkItems(
    new Request('https://fixture.test/api/work-items'),
    httpDependencies
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-request-id'), 'request-a')

  const clientItems = await clientModule.fetchWorkItems((pathname) =>
    routeModule.getWorkItems(
      new Request(`https://fixture.test${pathname}`),
      httpDependencies
    )
  )
  assert.equal(clientItems.length, 2)

  const form = uiModule.createWorkItemFormModel(clientItems[0])
  assert.equal(form.initialValues.priority, true)
  assert.equal(form.initialValues.dueAt, '2026-08-01T00:00:00.000Z')
  assert.deepEqual(
    form.submit({
      title: 'Form item',
      description: '',
      priority: false,
      dueAt: '2026-09-01T00:00:00.000Z',
    }),
    {
    title: 'Form item',
    description: null,
    priority: false,
      dueAt: '2026-09-01T00:00:00.000Z',
    }
  )

  const failure = new Error('store unavailable')
  const failingReports = createReporter()
  await assert.rejects(
    () =>
      rscModule.readWorkItemsForRsc(
        context,
        {
          list: async () => {
            throw failure
          },
          create: async () => {
            throw failure
          },
        },
        failingReports.reporter
      ),
    failure
  )
  assert.equal(failingReports.calls.length, 1)
  assert.equal(failingReports.calls[0].attributes.boundary, 'work-items.rsc')
  assert.equal(failingReports.calls[0].attributes.requestId, 'request-a')

  const actionFailureReports = createReporter()
  await assert.rejects(
    () =>
      actionsModule.createWorkItemAction(
        { title: 'Valid input' },
        context,
        {
          list: server.list,
          create: async () => {
            throw failure
          },
        },
        actionFailureReports.reporter
      ),
    failure
  )
  assert.equal(actionFailureReports.calls.length, 1)
  assert.equal(actionFailureReports.calls[0].attributes.boundary, 'work-items.action')
  assert.equal(actionFailureReports.calls[0].attributes.requestId, 'request-a')

  const httpFailureReports = createReporter()
  const httpFailure = await routeModule.getWorkItems(
    new Request('https://fixture.test/api/work-items'),
    {
      authenticate: async () => context,
      server: {
        list: async () => {
          throw failure
        },
        create: server.create,
      },
      reporter: httpFailureReports.reporter,
    }
  )
  assert.equal(httpFailure.status, 500)
  assert.equal(httpFailureReports.calls.length, 1)
  assert.equal(httpFailureReports.calls[0].attributes.boundary, 'work-items.http')
  assert.equal(httpFailureReports.calls[0].attributes.requestId, 'request-a')
}

async function testAssistantStream(load) {
  const providerModule = await load(
    'assistant-stream/src/modules/assistant/server/provider.js'
  )
  const streamModule = await load('assistant-stream/src/modules/assistant/stream.js')
  const jobModule = await load('assistant-stream/src/modules/assistant/job.js')
  const clock = { now: () => 10 }
  const input = {
    prompt: 'Explain the result',
    signal: new AbortController().signal,
    deadlineAt: 100,
  }

  const successReports = createReporter()
  const success = await streamModule.openAssistantStream(input, {
    clock,
    generator: providerModule.createScriptedTextGenerator([
      { token: 'Hello ' },
      { token: 'world' },
    ]),
    reporter: successReports.reporter,
    reportingContext: { requestId: 'stream-success', actorId: 'actor-a' },
  })
  assert.equal(success.status, 200)
  assert.deepEqual(await collect(success.events), [
    { type: 'token', text: 'Hello ' },
    { type: 'token', text: 'world' },
    { type: 'complete', tokenCount: 2 },
  ])
  assert.equal(successReports.calls.length, 0)

  const beforeReports = createReporter()
  const before = await streamModule.openAssistantStream(input, {
    clock,
    generator: providerModule.createScriptedTextGenerator([
      { error: new Error('provider unavailable') },
    ]),
    reporter: beforeReports.reporter,
    reportingContext: { requestId: 'stream-before', actorId: 'actor-a' },
  })
  assert.equal(before.status, 503)
  assert.deepEqual(await collect(before.events), [
    { type: 'error', code: 'STREAM_INTERRUPTED' },
  ])
  assert.equal(beforeReports.calls[0].attributes.boundary, 'assistant.stream.before-commit')
  assert.equal(beforeReports.calls[0].attributes.requestId, 'stream-before')

  const afterReports = createReporter()
  const after = await streamModule.openAssistantStream(input, {
    clock,
    generator: providerModule.createScriptedTextGenerator([
      { token: 'partial' },
      { error: new Error('provider interrupted') },
    ]),
    reporter: afterReports.reporter,
    reportingContext: { requestId: 'stream-after', actorId: 'actor-a' },
  })
  assert.equal(after.status, 200)
  assert.deepEqual(await collect(after.events), [
    { type: 'token', text: 'partial' },
    { type: 'error', code: 'STREAM_INTERRUPTED' },
  ])
  assert.equal(afterReports.calls[0].attributes.boundary, 'assistant.stream.after-commit')

  const deadlineReports = createReporter()
  const deadline = await streamModule.openAssistantStream(
    { ...input, deadlineAt: 10 },
    {
      clock,
      generator: providerModule.createScriptedTextGenerator([{ token: 'late' }]),
      reporter: deadlineReports.reporter,
      reportingContext: { requestId: 'stream-deadline', actorId: 'actor-a' },
    }
  )
  assert.equal(deadline.status, 504)
  assert.equal(deadlineReports.calls.length, 0)

  const cancellationReports = createReporter()
  const cancellationController = new AbortController()
  const cancelled = await streamModule.openAssistantStream(
    { ...input, signal: cancellationController.signal },
    {
      clock,
      generator: {
        async *stream() {
          yield 'started'
          cancellationController.abort()
        },
      },
      reporter: cancellationReports.reporter,
      reportingContext: { requestId: 'stream-cancelled', actorId: 'actor-a' },
    }
  )
  assert.equal(cancelled.status, 200)
  assert.deepEqual(await collect(cancelled.events), [
    { type: 'token', text: 'started' },
    { type: 'error', code: 'CANCELLED' },
  ])
  assert.equal(cancellationReports.calls.length, 0)

  const jobReports = createReporter()
  const job = await jobModule.runAssistantJob(input, {
    clock,
    generator: providerModule.createScriptedTextGenerator([
      { error: new Error('provider unavailable') },
    ]),
    reporter: jobReports.reporter,
    reportingContext: { requestId: 'job-failure', actorId: 'worker' },
  })
  assert.deepEqual(job, { status: 'retry', reason: 'PROVIDER_FAILURE' })
  assert.equal(jobReports.calls[0].attributes.boundary, 'assistant.job')
  assert.equal(jobReports.calls[0].attributes.requestId, 'job-failure')

  const deadlineJobReports = createReporter()
  const deadlineJob = await jobModule.runAssistantJob(
    { ...input, deadlineAt: 10 },
    {
      clock,
      generator: providerModule.createScriptedTextGenerator([{ token: 'late' }]),
      reporter: deadlineJobReports.reporter,
      reportingContext: { requestId: 'job-deadline', actorId: 'worker' },
    }
  )
  assert.deepEqual(deadlineJob, { status: 'retry', reason: 'DEADLINE' })
  assert.equal(deadlineJobReports.calls.length, 0)
}

async function testBoardWorkflow(load) {
  const workItemsStoreModule = await load(
    'board-workflow/src/modules/work-items/server/store.js'
  )
  const workItemsServerModule = await load(
    'board-workflow/src/modules/work-items/server.js'
  )
  const labelsStoreModule = await load('board-workflow/src/modules/labels/server/store.js')
  const labelsServerModule = await load('board-workflow/src/modules/labels/server.js')
  const labelsRscModule = await load('board-workflow/src/modules/labels/rsc.js')
  const labelsRouteModule = await load('board-workflow/src/app/api/labels/route.js')
  const pageModule = await load('board-workflow/src/app/board/page.js')

  const workItems = workItemsServerModule.createWorkItemsServer(
    workItemsStoreModule.createMemoryWorkItemsStore([
      { id: 'one', title: 'Prepare', labelIds: ['urgent'], privateNotes: 'owner only' },
      { id: 'two', title: 'Review', labelIds: [], privateNotes: null },
    ])
  )
  const labels = labelsServerModule.createLabelsServer(
    labelsStoreModule.createMemoryLabelsStore([
      { id: 'urgent', name: 'Urgent', color: '#d9485f' },
    ])
  )
  const server = pageModule.composeBoardPage({ workItems, labels })
  const reports = createReporter()
  const boardContext = {
    tenantId: 'tenant-a',
    requestId: 'board-request',
    actorId: 'actor-a',
  }
  const board = await pageModule.renderBoardPage(boardContext, server, reports.reporter)

  assert.deepEqual(board, {
    cards: [
      { id: 'one', title: 'Prepare', labels: ['Urgent'] },
      { id: 'two', title: 'Review', labels: [] },
    ],
    unlabeledCount: 1,
  })
  assert.equal(reports.calls.length, 0)
  assert.deepEqual(
    await labelsRscModule.readLabelsForRsc(
      { tenantId: 'tenant-a', requestId: 'labels-rsc', actorId: 'actor-a' },
      labels,
      reports.reporter
    ),
    [{ id: 'urgent', name: 'Urgent' }]
  )
  const labelsResponse = await labelsRouteModule.getLabels(
    new Request('https://fixture.test/api/labels'),
    {
      authenticate: async () => ({ tenantId: 'tenant-a', requestId: 'labels-request' }),
      labels,
      reporter: reports.reporter,
    }
  )
  assert.equal(labelsResponse.status, 200)
  assert.equal(labelsResponse.headers.get('x-request-id'), 'labels-request')
  assert.deepEqual((await labelsResponse.json()).data, [{ id: 'urgent', name: 'Urgent' }])

  const failure = new Error('board failed')
  const failureReports = createReporter()
  await assert.rejects(
    () =>
      pageModule.renderBoardPage(
        boardContext,
        { load: async () => Promise.reject(failure) },
        failureReports.reporter
      ),
    failure
  )
  assert.equal(failureReports.calls[0].attributes.boundary, 'board.rsc')
  assert.equal(failureReports.calls[0].attributes.requestId, 'board-request')

  const labelsFailure = new Error('labels failed')
  const labelsRscReports = createReporter()
  await assert.rejects(
    () =>
      labelsRscModule.readLabelsForRsc(
        { tenantId: 'tenant-a', requestId: 'labels-rsc-failure' },
        {
          listForBoard: async () => {
            throw labelsFailure
          },
        },
        labelsRscReports.reporter
      ),
    labelsFailure
  )
  assert.equal(labelsRscReports.calls.length, 1)
  assert.equal(labelsRscReports.calls[0].attributes.boundary, 'labels.rsc')
  assert.equal(labelsRscReports.calls[0].attributes.requestId, 'labels-rsc-failure')

  const labelsHttpReports = createReporter()
  const labelsHttpFailure = await labelsRouteModule.getLabels(
    new Request('https://fixture.test/api/labels'),
    {
      authenticate: async () => ({
        tenantId: 'tenant-a',
        requestId: 'labels-http-failure',
      }),
      labels: {
        listForBoard: async () => {
          throw labelsFailure
        },
      },
      reporter: labelsHttpReports.reporter,
    }
  )
  assert.equal(labelsHttpFailure.status, 500)
  assert.equal(labelsHttpReports.calls.length, 1)
  assert.equal(labelsHttpReports.calls[0].attributes.boundary, 'labels.http')
  assert.equal(labelsHttpReports.calls[0].attributes.requestId, 'labels-http-failure')
}

try {
  const candidate = JSON.parse(
    fs.readFileSync(path.join(pilotRoot, 'candidate-plan.json'), 'utf8')
  )
  const expectedFiles = Object.values(candidate.fixtures)
    .flatMap((fixture) => fixture.baseFiles)
    .sort()
  const actualFiles = listTypeScriptFiles(path.join(pilotRoot, 'fixtures')).sort()
  const plannedNewFiles = candidate.preregisteredChanges.flatMap(
    (scenario) => scenario.plannedCandidateTouches.new
  )
  const admittedFiles = new Set([...expectedFiles, ...plannedNewFiles])
  assert.deepEqual(
    actualFiles.filter((file) => !admittedFiles.has(file)),
    [],
    'fixture inventory contains a file that was not preregistered'
  )
  assert.deepEqual(
    expectedFiles.filter((file) => !actualFiles.includes(file)),
    [],
    'fixture inventory is missing a preregistered base file'
  )

  fs.writeFileSync(path.join(output, 'package.json'), '{"type":"module"}\n')
  const compile = spawnSync(
    tsc,
    ['--project', path.join(pilotRoot, 'tsconfig.json'), '--outDir', output],
    { cwd: root, encoding: 'utf8' }
  )
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout)
    process.stderr.write(compile.stderr)
    process.exit(compile.status ?? 1)
  }

  const load = (relative) => import(pathToFileURL(path.join(output, relative)).href)
  await testWorkItems(load)
  await testAssistantStream(load)
  await testBoardWorkflow(load)
  console.log('pilot runtime ok (work-items, assistant-stream, board-workflow)')
} finally {
  fs.rmSync(output, { recursive: true, force: true })
}
