# Architecture Evidence

This document records why the contract exists. It distinguishes primary-source guidance, measured
product behaviour, and project judgement. A measurement can show a failure mode; it cannot prove
that the chosen replacement is correct.

## Primary Sources

| Source | Used for | Not attributed to it |
| --- | --- | --- |
| [Alistair Cockburn, Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) | ports as purposeful conversations; database outside the application; several adapters may implement one port | a required port count; a ban on mock adapters; this project's port gate |
| [Alex Bespoyasov, Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | dependency direction; application layer as an impure context; dependencies supplied without a mandatory container | the deletion test; a rule that every effect needs a use-case |
| Next.js: [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data), [Updating Data](https://nextjs.org/docs/app/getting-started/updating-data), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [redirect](https://nextjs.org/docs/app/api-reference/functions/redirect) | framework entrypoints, Server Components, Server Actions, Route Handlers, and framework control flow | the portable layer model |

The private transportation handbook informed the documentation shape and supplied counterexamples.
It is field input, not a canonical source.

## Measured Snapshots

Measurements were refreshed on 2026-07-26 against these immutable commits:

| Product | Commit | Role |
| --- | --- | --- |
| Marqa platform | `378f278f43554d18323707856c4e77b341d6700d` | store-backed product with enforced boundaries |
| Stokli frontend | `57da6fb6a766b3ebb48afc73d696bfc709a56cd2` | service-backed product without equivalent boundary lint |
| Fullstack AI template | `0bae9739e5d688f55ebe971658ce4b533a24daf3` | reference implementation seeded from the products |

Reproduce the structural counts with:

```bash
node scripts/measure-evidence.mjs \
  marqa=/path/to/marqa/platform#378f278f43554d18323707856c4e77b341d6700d \
  stokli=/path/to/stokli/frontend#57da6fb6a766b3ebb48afc73d696bfc709a56cd2 \
  template=/path/to/fullstack-ai-template#0bae9739e5d688f55ebe971658ce4b533a24daf3
```

The script parses TypeScript with the compiler API. It counts exported function declarations,
exported arrow/function expressions, and static import declarations, so the population does not
depend on formatting.

Two of those three repositories are private, so the numbers above are not reproducible by a reader.
The script is: point it at **your own** repository and it reports the same measures over your
application layer, under the same definitions.

```bash
node scripts/measure-evidence.mjs mine=/path/to/your/repo#HEAD
```

## Findings

### The Old Application Layer Was Mostly Shallow

| Product | Exported callables | Direct `deps.*` forwards | At most two statements |
| --- | ---: | ---: | ---: |
| Marqa | 201 | 75 | 153 |
| Template | 11 | 5 | 11 |

This establishes the failure mode of the old guidance: it produced application files that held
little or no behaviour. It motivates the deletion test. It does not prove that the deletion test is
the only valid gate.

### Boundary Work Was Repeated

Marqa contains 66 direct UUID assertions and 44 direct schema `parse()` calls inside use-cases: 110
sites performing work now assigned to a declaration. Stokli's two use-case files each hand-write
their own validation, logging, call, catch, and result mapping.

This motivates one declaration contract. Whether failures are represented as returned values or
typed throws remains a design choice at the public boundary.

### Enforced Boundaries Changed Product Shape

| Product | Use-case files with static adapter imports | UI files with static outbound API imports |
| --- | ---: | ---: |
| Marqa | 0 | 5 |
| Stokli | 2 of 2 | 68 |

Marqa enforces path-scoped restrictions; Stokli does not enforce an equivalent contract. The result
supports shipping executable layer rules rather than relying on prose alone. It does not imply that
Marqa's five UI imports are correct; they remain migration debt or explicit exceptions to inspect.

## Measured, Not Scripted

Four findings the AST script does not cover, because they measure configuration and call sites
rather than function shape. Each carries the command that produced it; each justified a decision
this release makes.

**The client cache had to be carved out of its parent.** In both the template and Marqa, the
`ui/**` lint block excludes `ui/server-state/**`, and Marqa re-applies a subset to an allowlist of
**11** files (auth events, realtime, SSE transport). A sublayer excluded from every rule of its
parent, then partially re-subjected, is not a sublayer — this is why `client-cache/` is a top-level
layer.

```bash
grep -oE "src/ui/server-state/[A-Za-z0-9/._-]+\.tsx?" eslint.config.mjs | sort -u | wc -l   # 11
```

**Three template modules had no caller**, and two escaping functions with different character sets
coexisted — the tested one omitting the character that breaks filter syntax, the live one the
character that breaks the pattern. Supports the deletion test, `quality/testing-by-layer.md`, and
the single-escaper rule in `outbound/supabase-rls.md`.

```bash
grep -rnE "^\s*(import|const .*=\s*require)\b.*outbound/transport" src e2e tests \
  | grep -v "^src/adapters/outbound/transport"
grep -rA4 -E "function escape[A-Za-z]*\(" src --include='*.ts' | grep -E "replaceAll|replace\("
```

**Both products ship a transport for an owned service** — stream proxy, SSE client, keyed refresh,
error mapping — and 1.3.1 had no rule for any of it. Stokli's refresh keys by identity and never
evicts an in-flight entry; the template's copy does neither. Supports
`outbound/service-transport.md` and `inbound/streaming.md`.

```bash
ls src/adapters/outbound/transport/
grep -rn "class RefreshManager\|createRefreshManager" src --include='*.ts'
```

**What each enforcement tier can see.** With the node resolver alone, a forbidden aliased import
lints clean while only its relative spelling errors — a resolver installed but unconfigured makes
`no-restricted-paths` a check that passes everything, which is why the resolved tier ships
`import/no-unresolved` as a canary. Gitignore-style negation inside a `no-restricted-imports` group
does not exempt the negated path in any of three spellings, which is why tier one cannot express a
subpath carve-out. The canary produced zero false positives across 40 product files importing CSS
modules, package CSS, and `.json`.

## Project Judgement

These decisions are owned by this project, not by the primary sources:

| Decision | Motivation | Revisit when |
| --- | --- | --- |
| Use the deletion test before creating a use-case | forwarding modules dominated the measured application layer | a product demonstrates useful application modules that consistently fail the test |
| Default a locally runnable store to `data/**` | substitutes hid query, policy, and column drift | scenarios must run independently of the store and expose a purposeful capability |
| Use one declaration per public application entry | validation and failure handling repeated across products | different channels require guarantees that cannot share one combinator |
| Split entries from operations, as directories | nested declarations double-normalised and double-reported failures; the *directory* form was chosen because path rules are enforceable and naming conventions are not | a lint can enforce the rule without the split, or composition preserves one public contract without a second surface |
| Validate the declared output on every call | adapter and provider shapes drifted from the contract in the measured products | the runtime cost is measured and material, or the module reading the provider already guarantees the shape. **This cost has not been measured** |
| Keep DI containers optional | closures and explicit request context cover the current scale | assembly becomes untraceable or collaborator counts make manual composition error-prone |

## Evaluation Status

The repository contains 12 `nextjs-architecture` scenarios:

- 2 contain recorded baseline observations;
- 10 remain RED hypotheses;
- changed 2.0.0 guidance still requires fresh GREEN runs.

Scenario files and their coverage inventory are validated in CI. Measurements above justify
investigating a rule; RED and GREEN runs test whether the skill changes agent behaviour.

A rule with no entry in this document rests on judgement — treat it accordingly. The rules whose
only support is judgement are named in the table above; the rest cite a source or a measurement.
