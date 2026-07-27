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
import { reportUnexpected, type Reporter } from '../../shared/server/reporting.js'

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
  reporter: Reporter
): AsyncGenerator<AssistantEvent> {
  yield first
  try {
    while (true) {
      const next = await iterator.next()
      if (next.done) return
      yield next.value
    }
  } catch (error) {
    if (!isExpectedGenerationError(error)) {
      reportUnexpected(reporter, error, 'assistant.stream.after-commit')
    }
    yield expectedErrorEvent(error)
  }
}

export async function openAssistantStream(
  input: GenerateResponseInput,
  dependencies: GenerateResponseDependencies & { reporter: Reporter }
): Promise<AssistantStreamResponse> {
  const iterator = generateResponse(input, dependencies)

  try {
    const first = await iterator.next()
    if (first.done) {
      return { status: 200, events: oneEvent({ type: 'complete', tokenCount: 0 }) }
    }
    return {
      status: 200,
      events: committedEvents(first.value, iterator, dependencies.reporter),
    }
  } catch (error) {
    if (!isExpectedGenerationError(error)) {
      reportUnexpected(dependencies.reporter, error, 'assistant.stream.before-commit')
    }
    return {
      status: statusBeforeCommit(error),
      events: oneEvent(expectedErrorEvent(error)),
    }
  }
}
