import {
  AssistantInputError,
  GenerationCancelledError,
  GenerationDeadlineError,
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

export type AssistantJobResult =
  | { status: 'completed'; text: string }
  | { status: 'dropped'; reason: 'INVALID_PROMPT' | 'CANCELLED' }
  | { status: 'retry'; reason: 'DEADLINE' | 'PROVIDER_FAILURE' }

export async function runAssistantJob(
  input: GenerateResponseInput,
  dependencies: GenerateResponseDependencies & {
    reporter: Reporter
    reportingContext: ReportingContext
  }
): Promise<AssistantJobResult> {
  const tokens: string[] = []

  try {
    for await (const event of generateResponse(input, dependencies)) {
      if (event.type === 'token') tokens.push(event.text)
    }
    return { status: 'completed', text: tokens.join('') }
  } catch (error) {
    if (error instanceof AssistantInputError) {
      return { status: 'dropped', reason: 'INVALID_PROMPT' }
    }
    if (error instanceof GenerationCancelledError) {
      return { status: 'dropped', reason: 'CANCELLED' }
    }
    if (error instanceof GenerationDeadlineError) {
      return { status: 'retry', reason: 'DEADLINE' }
    }

    reportUnexpected(
      dependencies.reporter,
      error,
      'assistant.job',
      dependencies.reportingContext
    )
    return { status: 'retry', reason: 'PROVIDER_FAILURE' }
  }
}
