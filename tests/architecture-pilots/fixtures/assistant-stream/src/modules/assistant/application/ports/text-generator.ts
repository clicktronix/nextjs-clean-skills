export type TextGenerationRequest = {
  prompt: string
  signal: AbortSignal
}

export type TextGenerator = {
  stream(request: TextGenerationRequest): AsyncIterable<string>
}
