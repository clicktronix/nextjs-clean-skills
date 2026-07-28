export type AssistantEvent =
  | { type: 'token'; text: string }
  | { type: 'complete'; tokenCount: number }
  | { type: 'error'; code: 'INVALID_PROMPT' | 'DEADLINE' | 'CANCELLED' | 'STREAM_INTERRUPTED' }

export class AssistantInputError extends Error {}
export class GenerationDeadlineError extends Error {}
export class GenerationCancelledError extends Error {}

export function isExpectedGenerationError(error: unknown): boolean {
  return (
    error instanceof AssistantInputError ||
    error instanceof GenerationDeadlineError ||
    error instanceof GenerationCancelledError
  )
}
