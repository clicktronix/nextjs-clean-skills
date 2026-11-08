import {
  AssistantInputError,
  GenerationCancelledError,
  GenerationDeadlineError,
  isExpectedGenerationError,
  type AssistantEvent,
} from './domain/assistant-event.js'
import {
  generateResponse,
  type GenerateResponseDependencies,
  type GenerateResponseInput,
} from './application/generate-response.js'
import {
  reportUnexpected,
  type Reporter,
  type ReportingContext,
} from '../../shared/server/reporting.js'

export type AssistantStreamResponse = {
  status: number
  events: AsyncIterable<AssistantEvent>
}

function expectedErrorEvent(error: unknown): AssistantEvent {
  if (error instanceof AssistantInputError) return { type: 'error', code: 'INVALID_PROMPT' }
  if (error instanceof GenerationDeadlineError) return { type: 'error', code: 'DEADLINE' }
  if (error instanceof GenerationCancelledError) return { type: 'error', code: 'CANCELLED' }
  return { type: 'error', code: 'STREAM_INTERRUPTED' }
}

function statusBeforeCommit(error: unknown): number {
  if (error instanceof AssistantInputError) return 400
  if (error instanceof GenerationDeadlineError) return 504
  if (error instanceof GenerationCancelledError) return 499
  return 503
}

async function* oneEvent(event: AssistantEvent): AsyncGenerator<AssistantEvent> {
  yield event
}

async function* committedEvents(
  first: AssistantEvent,
  iterator: AsyncIterator<AssistantEvent>,
  reporter: Reporter,
  reportingContext: ReportingContext
): AsyncGenerator<AssistantEvent> {
  try {
    yield first
    while (true) {
      const next = await iterator.next()
      if (next.done) return
      yield next.value
    }
  } catch (error) {
    if (!isExpectedGenerationError(error)) {
      reportUnexpected(reporter, error, 'assistant.stream.after-commit', reportingContext)
    }
    yield expectedErrorEvent(error)
  } finally {
    await iterator.return?.()
  }
}

// An async generator closed before its first read never runs its body or its `finally`, yet the
// provider is already running here; this close reaches the provider either way.
function closingProvider(
  events: AsyncGenerator<AssistantEvent>,
  provider: AsyncIterator<AssistantEvent>,
  cancel: () => void
): AsyncIterableIterator<AssistantEvent> {
  return {
    next: () => events.next(),
    return: async () => {
      // return() queues behind a pending next(); abort first so that next() can finish.
      cancel()
      try {
        return await events.return(undefined)
      } finally {
        await provider.return?.()
      }
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}

export async function openAssistantStream(
  input: GenerateResponseInput,
  dependencies: GenerateResponseDependencies & {
    reporter: Reporter
    reportingContext: ReportingContext
  }
): Promise<AssistantStreamResponse> {
  const controller = new AbortController()
  const iterator = generateResponse(
    { ...input, signal: AbortSignal.any([input.signal, controller.signal]) },
    dependencies
  )

  try {
    const first = await iterator.next()
    if (first.done) {
      return { status: 200, events: oneEvent({ type: 'complete', tokenCount: 0 }) }
    }
    return {
      status: 200,
      events: closingProvider(
        committedEvents(first.value, iterator, dependencies.reporter, dependencies.reportingContext),
        iterator,
        () => controller.abort(new GenerationCancelledError('stream closed'))
      ),
    }
  } catch (error) {
    if (!isExpectedGenerationError(error)) {
      reportUnexpected(
        dependencies.reporter,
        error,
        'assistant.stream.before-commit',
        dependencies.reportingContext
      )
    }
    return {
      status: statusBeforeCommit(error),
      events: oneEvent(expectedErrorEvent(error)),
    }
  }
}
