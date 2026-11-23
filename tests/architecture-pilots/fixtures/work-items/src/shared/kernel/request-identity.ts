// The one identity type the contract admits into shared/kernel. It carries who is asking and
// which scope they act in, never how the request arrived or which client serves it. Roles are not
// here: a role vocabulary belongs to the capability that decides with it, which resolves the
// actor's roles for its own operation.
//
// The type is nominal. A private member cannot be written in an object literal and is dropped by
// a spread, so neither a look-alike nor a copy of a real identity with another tenant is a
// RequestIdentity: shared/server/request-scope.ts holds the one cast, and its callers are every
// place trust enters. The class is declared, never constructed, and emits no code.
export declare abstract class RequestIdentity {
  private readonly established: true
  readonly actorId: string
  readonly tenantId: string
  readonly requestId: string
}
