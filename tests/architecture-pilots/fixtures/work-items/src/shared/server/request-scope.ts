import type { RequestIdentity } from '../kernel/request-identity.js'
import type { Reporter } from './reporting.js'

// A Server Action receives only what the browser sent. Identity, the reporter and the cache
// primitive come from the request the framework is serving — `cookies()`, `headers()`,
// `updateTag` in Next.js. The fixtures are framework-free, so this module is the stand-in for
// that request scope: the application's root composition binds a resolver once; the test binds a
// fake. Nothing else in the tree may hold identity or effects at module level.
export type RequestScope = {
  identity: RequestIdentity | null
  reporter: Reporter
  invalidate(tag: string): Promise<void>
}

export type RequestScopeResolver = () => Promise<RequestScope>

let resolver: RequestScopeResolver | null = null

export function bindRequestScope(next: RequestScopeResolver): void {
  resolver = next
}

export async function currentRequestScope(): Promise<RequestScope> {
  if (!resolver) throw new Error('request scope resolver is not bound')
  return resolver()
}
