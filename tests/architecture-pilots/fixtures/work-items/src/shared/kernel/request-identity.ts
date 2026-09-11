// The one identity type the contract admits into shared/kernel. It carries who is asking and
// which scope they act in, never how the request arrived or which client serves it. A capability's
// own domain identity (its ids, its role vocabulary) stays private to that capability.
export type RequestIdentity = {
  actorId: string
  tenantId: string
  requestId: string
  roles: string[]
}
