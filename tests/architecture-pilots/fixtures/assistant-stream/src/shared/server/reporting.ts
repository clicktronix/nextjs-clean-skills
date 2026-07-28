export type Reporter = {
  capture(
    error: unknown,
    attributes: {
      boundary: string
      requestId: string
      actorId?: string
      tenantId?: string
    }
  ): void
}

export type ReportingContext = {
  requestId: string
  actorId?: string
  tenantId?: string
}

export function reportUnexpected(
  reporter: Reporter,
  error: unknown,
  boundary: string,
  context: ReportingContext
): void {
  reporter.capture(error, {
    boundary,
    requestId: context.requestId,
    actorId: context.actorId,
    tenantId: context.tenantId,
  })
}
