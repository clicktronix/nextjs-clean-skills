import {
  AssistantInputError,
  GenerationCancelledError,
  GenerationDeadlineError,
  type AssistantEvent,
} from '../domain/assistant-event.js'
import type { TextGenerator } from './ports/text-generator.js'

export type Clock = {
  now(): number
}

export type GenerateResponseInput = {
  prompt: string
  signal: AbortSignal
  deadlineAt: number
}

export type GenerateResponseDependencies = {
  clock: Clock
  generator: TextGenerator
}

export async function* generateResponse(
  input: GenerateResponseInput,
  dependencies: GenerateResponseDependencies
): AsyncGenerator<AssistantEvent> {
  const prompt = input.prompt.trim()
  if (prompt.length === 0) {
    throw new AssistantInputError('prompt is required')
  }
  if (input.signal.aborted) {
    throw new GenerationCancelledError('generation cancelled')
  }
  if (dependencies.clock.now() >= input.deadlineAt) {
    throw new GenerationDeadlineError('generation deadline exceeded')
  }

  let tokenCount = 0
  for await (const rawToken of dependencies.generator.stream({
    prompt,
    signal: input.signal,
  })) {
    if (input.signal.aborted) {
      throw new GenerationCancelledError('generation cancelled')
    }
    if (dependencies.clock.now() >= input.deadlineAt) {
      throw new GenerationDeadlineError('generation deadline exceeded')
    }

    const text = rawToken.replaceAll(/\s+/g, ' ')
    if (text.length === 0) continue
    tokenCount += 1
    yield { type: 'token', text }
  }

  if (input.signal.aborted) {
    throw new GenerationCancelledError('generation cancelled')
  }
  if (dependencies.clock.now() >= input.deadlineAt) {
    throw new GenerationDeadlineError('generation deadline exceeded')
  }

  yield { type: 'complete', tokenCount }
}
