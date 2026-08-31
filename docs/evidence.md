# Architecture Evidence

This document records why the contract exists. It separates primary sources, observed product
failures, controlled pilots, agent evaluations, and project judgement. Evidence motivates a
decision; it does not make that decision universally true.

## Primary Sources

| Source | Used for | Not attributed to it |
| --- | --- | --- |
| [Alistair Cockburn, Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) | inside/outside distinction; purposeful ports; several adapters may implement one port | a required port count, a ban on mocks, or this project's port gate |
| [Alex Bespoyasov, Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | dependency direction, application policy around effects, explicit dependency supply | the deletion test or mandatory use-cases |
| Next.js official docs: [Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [`use server`](https://nextjs.org/docs/app/api-reference/directives/use-server), [Authentication](https://nextjs.org/docs/app/guides/authentication) | direct RSC reads, queued Server Actions, Route Handler HTTP ownership, per-entrypoint authorization | the capability topology |
| React official rule: [React calls Components and Hooks](https://react.dev/reference/rules/react-calls-components-and-hooks) | call Hooks directly; never pass Hooks as regular values | the controller/view file split |

The private transportation handbook informed documentation shape and supplied production
counterexamples. It is field input, not a canonical source.

## Product Snapshot

Structural measurements were anchored on 2026-07-26:

| Product | Commit | Role |
| --- | --- | --- |
| Marqa platform | `378f278f43554d18323707856c4e77b341d6700d` | store-backed product with layer rules |
| Stokli frontend | `57da6fb6a766b3ebb48afc73d696bfc709a56cd2` | service-backed product without equivalent rules |
| Fullstack AI template | `0bae9739e5d688f55ebe971658ce4b533a24daf3` | reference implementation |

Reproduce callable and import-shape measurements with `scripts/measure-evidence.mjs`. The script
reads the named commit and rejects an empty application inventory.

### Forwarding Application Modules

| Product | Exported callables | Direct dependency forwards | At most two statements |
| --- | ---: | ---: | ---: |
| Marqa | 201 | 75 | 153 |
| Template | 11 | 5 | 11 |

This establishes the old failure mode: mandatory application files frequently held no policy. It
motivates the deletion test. It does not prove that deletion is the only valid test.

### Boundary Duplication

Marqa contained 66 direct UUID assertions and 44 direct schema parses inside use-cases. Stokli's two
use-case files each hand-wrote validation, logging, catch, and failure mapping.

This supports stable validation and failure semantics. It does not support one universal wrapper:
the later stream/job pilots showed that native channel outcomes differ.

### Layer Rules And Product Shape

| Product | Use-case files importing concrete adapters | UI files importing outbound API code |
| --- | ---: | ---: |
| Marqa | 0 | 2 |
| Stokli | 2 of 2 | 42 |

The products differ in more than enforcement, so this is correlation, not causal proof. It supports
shipping executable import rules while requiring project-specific runtime and ownership review.

## Capability Pilot Baseline

The immutable template baseline is
[`tests/architecture-pilots/baseline.json`](../tests/architecture-pilots/baseline.json), anchored to
`0bae9739e5d688f55ebe971658ce4b533a24daf3`.

For `work-items` it recorded:

- 13 architecture files across six global roots before route-private UI;
- six exported use-case callables, four direct forwards, all at most two statements;
- RSC prefetch and browser queries using a Server Action read;
- provider row names in the domain model;
- repeated repository construction and cache wiring.

Four changes were preregistered before the candidate implementation:

1. add an entity field;
2. add an HTTP read channel;
3. replace a data source;
4. change unexpected-error reporting policy.

## Pilot Results

Three strict TypeScript fixtures cover:

- store-backed CRUD without a speculative application operation;
- remote streaming plus a job over one provider-neutral operation;
- board orchestration over independent work-items and labels capabilities.

The fixtures contain 33 TypeScript files. Runtime tests cover tenant scope, row mapping, cache
ownership, action and HTTP outcomes, stream commit/cancellation/deadline behavior, job retries,
report-once behavior, and cross-capability policy.

The original acceptance pilots encode six architecture properties as ten historical mutations.
Current portable tooling expands the seven-property enforcement floor into 12 mutation-covered
rule codes with 19 capability mutations, plus 29 boundary mutations and 13
resolver/cycle/portability canaries. These are coverage counts, not competing architecture
taxonomies. A real Next.js 16.2.10 pilot at `fullstack-ai-template@0a3eeca` passes its production
build and 990 tests. A deliberate Client Component import of `server.ts` fails that build through
`server-only`.

Change comparison:

| Change | Capability candidate production files | Layer-first observed paths | Result |
| --- | ---: | ---: | --- |
| add `dueAt` | 3 | 9 | candidate more local |
| add labels HTTP GET | 1 | 3 | route-only channel addition |
| replace work-item source | 2 | 10 | candidate callers unchanged |
| request-aware reporting | 12 | 11 | not directly comparable; candidate also covers stream and job |

The provider comparison is valid only after adding a production composition surface. The original
one-file result selected its provider in the test harness and is retained as superseded evidence.

### Live Migration Workflow

Both migration phases were run end to end against a layer-first Next.js repository with 321 source
files. Phase 1 installed the floor without changing `src/**`. Phase 2 migrated one capability with
five moves, removed nine obsolete paths, authored five surfaces for named consumers, ran two fix
rounds, and stopped at `revise` with one must-fix still open.

The run exposed defects that static reading had missed: JSON-string arguments, a write outside the
workflow's permission, enforcement requested where it could not bind, structural zeros read as a
clean baseline, unanswered ownership and dependency questions with no resume path, one capability
left in two topologies, a channel change that duplicated failure reporting, and instructions that
still named deleted paths. These observations motivated workflow fixes; they do not make one pilot a
general proof of the migration program.

Full details are in
[`tests/architecture-pilots/RESULTS.md`](../tests/architecture-pilots/RESULTS.md) and
[`results.json`](../tests/architecture-pilots/results.json).

## Agent Evaluation

The focused inventory contains 17 `designing-architecture` scenarios:

- 5 contain recorded baseline observations;
- 12 remain RED hypotheses;

Those counts describe the reference-level inventory, not the comparative release matrix below.

The first capability-first release gate failed. Its cross-capability instruction allowed meaningful
board policy to remain under `app/**`, omitted report-once in one cell, and contradicted its own
dependent-call sequencing.

Candidate v3 corrected ownership and passed the frozen replay:

| Arm | Mean | Minimum | Negative violations |
| --- | ---: | ---: | ---: |
| capability-first v3 | 9.958 | 9 | 0 |
| no skill | 7.833 | 4 | 8 |
| released v1.3.2 | 7.917 | 4 | 8 |
| layer-first checkpoint | 7.625 | 4 | 10 |

The candidate led every control overall and in all three scenarios. It tied or beat released
`v1.3.2` and layer-first in every paired cell.

Manual review still found:

1. one speculative generation-store port;
2. one response that could make a job inherit stream idle timeout;
3. one perfect-scoring board response that contradicted rejection with silent label omission.

These are release regressions in the canonical contract. Blind score is not architecture proof.
See
[`RELEASE_V3_RESULTS.md`](../tests/architecture-evals/RELEASE_V3_RESULTS.md).

A later simplification smoke found one regression the aggregate score hid: both simple-CRUD answers
added forwarding application operations. After the direct local-store default was restored to the
model-visible skill, both focused repeats scored 10/10 without operations or speculative ports. The
one-model, one-framing result is targeted evidence rather than a new release gate; see
[`SIMPLIFIED_V4_RESULTS.md`](../tests/architecture-evals/SIMPLIFIED_V4_RESULTS.md).

## Project Judgement

| Decision | Motivation | Revisit when |
| --- | --- | --- |
| capability root is the primary physical unit | layer-first scatter and uncontrolled cross-slice imports | a product pilot shows lower locality or weaker ownership |
| optional reserved segments | avoid empty scaffolding while retaining recognizable dependency roles | optionality causes persistent placement ambiguity in agent evals |
| deletion test for application operations | measured forwarding modules | useful operations consistently fail the test |
| local store defaults to a private server adapter | substitutes hid query, policy, and row drift | policy must run independently of the store |
| runtime-specific public root surfaces | channel semantics differ and generic `api/` becomes a barrel | package subpath exports prove clearer with equal enforcement |
| shared code needs admission and demotion | capability-first otherwise recreates a generic `lib` bucket | another governance mechanism proves cheaper and equally effective |
| channel-native failure carriers | streams, jobs, RSC, actions, and HTTP have different lifecycle | one abstraction preserves every native contract without leakage |

## Limits

- Pilot fixtures are intentionally small.
- Two measured products are private; readers reproduce the tool on their own codebase.
- Static checks cannot prove semantic depth, authorization policy, report-once behavior, or cache
  ownership.
- Agent evaluations measure responses under a fixed scenario/model/framing matrix, not long-term
  maintainability.
- The template migration is complete. Product migrations still require separate, product-owned PRs.
