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

  const controller = new AbortController()
  const cancel = () => controller.abort(new GenerationCancelledError('generation cancelled'))
  input.signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(
    () => controller.abort(new GenerationDeadlineError('generation deadline exceeded')),
    input.deadlineAt - dependencies.clock.now()
  )
  let iterator: AsyncIterator<string> | undefined
  let pending = false
  try {
    iterator = dependencies.generator.stream({ prompt, signal: controller.signal })[Symbol.asyncIterator]()
    let tokenCount = 0
    while (true) {
      if (controller.signal.aborted) throw controller.signal.reason
      if (dependencies.clock.now() >= input.deadlineAt) throw new GenerationDeadlineError('generation deadline exceeded')
      pending = true
      const next = iterator.next()
      void next.then(() => { pending = false }, () => { pending = false })
      let onAbort = () => {}
      let result: IteratorResult<string>
      try {
        result = await Promise.race([
          next,
          new Promise<never>((_, reject) => {
            onAbort = () => reject(controller.signal.reason)
            controller.signal.addEventListener('abort', onAbort, { once: true })
            if (controller.signal.aborted) onAbort()
          }),
        ])
      } finally {
        controller.signal.removeEventListener('abort', onAbort)
      }
      if (controller.signal.aborted) throw controller.signal.reason
      if (dependencies.clock.now() >= input.deadlineAt) throw new GenerationDeadlineError('generation deadline exceeded')
      if (result.done) break
      const text = result.value.replaceAll(/\s+/g, ' ')
      if (text.length === 0) continue
      tokenCount += 1
      yield { type: 'token', text }
    }
    yield { type: 'complete', tokenCount }
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener('abort', cancel)
    controller.abort(new GenerationCancelledError('generation closed'))
    const closing = iterator?.return?.()
    // An adapter must honor AbortSignal to stop its IO. A non-cooperative pending next()
    // must not hold the channel past its deadline; observe its eventual cleanup rejection.
    if (pending) void closing?.catch(() => {})
    else await closing
  }
}
