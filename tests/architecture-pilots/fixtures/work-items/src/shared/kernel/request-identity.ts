// The one identity type the contract admits into shared/kernel. It carries who is asking and
// which scope they act in, never how the request arrived or which client serves it. Roles are not
// here: a role vocabulary belongs to the capability that decides with it, which resolves the
// actor's roles for its own operation.
export type RequestIdentity = {
  actorId: string
  tenantId: string
  requestId: string
}
