// Expected outcomes are typed values, not exceptions: a channel maps them to its native shape
// (403, form state, a rendered empty state) without a catch block deciding what they meant.
export type Forbidden = { kind: 'forbidden' }

export const forbidden = (): Forbidden => ({ kind: 'forbidden' })

export function isForbidden(value: unknown): value is Forbidden {
  return typeof value === 'object' && value !== null && (value as Forbidden).kind === 'forbidden'
}
