# Component Testing

**Impact: MEDIUM** · **Scope: stack (Next.js + React)**

A UI test asserts what a user can perceive and do. If it breaks when internals are refactored
without changing behavior, it was testing internals.

| Subject | Test |
| --- | --- |
| formatter, reducer, validator, pure helper | plain unit test, no rendering |
| extracted View | props in, rendered output and accessible names out |
| controller component | interaction, state transitions, and the states it can reach |
| capability browser lifecycle | the `client/` surface with a faked transport, not the component |
| journey across pages with real data | end to end |

Prefer role and accessible name, label, or visible text. Use a test id when no stable user-facing
selector exists. Semantic queries exercise accessible output but do not replace accessibility
testing.

Assert reachable states, not only call logs. Cover every state the component renders. A mock call
can support a behavior assertion; it is not the behavior.

Do not duplicate framework tests. Verify the route, fallback, or action contract your code adds.

A synchronous Server Component can be unit-tested. Vitest does not yet support async Server
Components, so Next.js recommends E2E coverage through the route. Test their capability logic
directly.

Reference: [Testing with Vitest](https://nextjs.org/docs/app/guides/testing/vitest),
[Testing Library queries](https://testing-library.com/docs/queries/about/).
