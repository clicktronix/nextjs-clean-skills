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

// What a verified session yields. The resolver calls this after the provider confirmed the caller;
// a value that came from the browser never reaches it.
export type VerifiedSession = { actorId: string; tenantId: string; requestId: string }

// The type keeps a look-alike from being written by accident; it cannot stop a deliberate copy
// made with a cast or Object.assign. So an identity is frozen, and the ones issued here are
// remembered: a trusted surface asks whether the object it was handed is one of them.
const issued = new WeakSet<RequestIdentity>()

export function establishRequestIdentity(session: VerifiedSession): RequestIdentity {
  const identity = Object.freeze({
    actorId: session.actorId,
    tenantId: session.tenantId,
    requestId: session.requestId,
  }) as RequestIdentity
  issued.add(identity)
  return identity
}

export function assertIssuedIdentity(identity: RequestIdentity): void {
  if (!issued.has(identity)) throw new Error('identity was not issued by the request scope')
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
