export type Reporter = {
  capture(error: unknown, attributes: { boundary: string }): void
}

export function reportUnexpected(
  reporter: Reporter,
  error: unknown,
  boundary: string
): void {
  reporter.capture(error, { boundary })
}
