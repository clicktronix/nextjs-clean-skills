import type {
  TextGenerationRequest,
  TextGenerator,
} from '../application/ports/text-generator.js'

export type ProviderStep = { token: string } | { error: Error }

export function createScriptedTextGenerator(steps: ProviderStep[]): TextGenerator {
  return {
    async *stream(request: TextGenerationRequest) {
      for (const step of steps) {
        if (request.signal.aborted) return
        if ('error' in step) throw step.error
        yield step.token
      }
    },
  }
}
