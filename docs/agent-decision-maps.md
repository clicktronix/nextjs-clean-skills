# Agent Decision Maps

Use these diagrams when prompting or reviewing coding agents. They are intentionally compact:
the goal is to force placement decisions before code changes, not to restate framework docs.

## Feature Slice Build Order

Arrows in this diagram mean implementation order, not import direction. See
[Architecture Contract](./architecture-contract.md) for dependency direction.

```mermaid
flowchart LR
  Domain["1 Domain\nschema + pure rules"] -->|build next| Ports["2 Use-case ports/types"]
  Ports -->|build next| UseCase["3 Use-case orchestration"]
  UseCase -->|build next| Outbound["4 Outbound adapter"]
  Outbound -->|build next| Inbound["5 Inbound adapter\nAction or Route Handler"]
  Inbound -->|build next| UIState["6 Server-state or local action"]
  UIState -->|build next| UI["7 UI component/page"]
  UI -->|build next| Tests["8 Tests by layer"]
```

Agent prompt guardrail:

> Implement in this order and stop if a lower layer needs to import a higher layer.

## Where Does This Code Go?

```mermaid
flowchart TD
  Need["New code needed"] --> Pure{"Pure business rule/schema?"}
  Pure -->|Yes| Domain["domain/"]
  Pure -->|No| Scenario{"Application scenario?"}
  Scenario -->|Yes| UseCase["use-cases/"]
  Scenario -->|No| Framework{"Reads cookies, headers, request, cache, formData?"}
  Framework -->|Yes| InboundOrDAL{"Read or command?"}
  InboundOrDAL -->|Read| DAL["server-only DAL/read entrypoint"]
  InboundOrDAL -->|Command| Inbound["adapters/inbound/next/"]
  Framework -->|No| Persistence{"Talks to DB/API/queue?"}
  Persistence -->|Yes| Outbound["adapters/outbound/"]
  Persistence -->|No| Presentation{"Presentation concern?"}
  Presentation -->|Yes| UI["app/ or ui/"]
  Presentation -->|No| Infra["infrastructure/ or lib/"]
```

## Server Action vs Route Handler

```mermaid
flowchart TD
  Command["Command boundary"] --> Caller{"Who calls it?"}
  Caller -->|Form/button in this Next.js UI| Action["Server Action"]
  Caller -->|Browser client needing query lifecycle| ServerState["TanStack mutation -> inbound action/API"]
  Caller -->|External service, mobile app, CLI, webhook sender| Route["Route Handler"]
  Route --> Retry{"Can the caller retry?"}
  Retry -->|Yes| Idempotency["Require Idempotency-Key or provider event id"]
  Retry -->|No| Envelope["Return JSON envelope + request id"]
```

## Review Checklist For Agent Output

```mermaid
flowchart TD
  Start["Review changed files"] --> Imports{"Use-case imports adapters/framework?"}
  Imports -->|Yes| Block["Block: dependency inversion violation"]
  Imports -->|No| Auth{"Data access re-verifies auth/authz?"}
  Auth -->|No| Block
  Auth -->|Yes| ServerData{"Server data placed in client store?"}
  ServerData -->|Yes| Block
  ServerData -->|No| Boundary{"Right boundary selected?\nRSC / Action / Route Handler / Queue"}
  Boundary -->|No| Block
  Boundary -->|Yes| Tests{"Tests match touched layer?"}
  Tests -->|No| RequestTests["Request focused tests"]
  Tests -->|Yes| Accept["Accept architecture shape"]
```

## Minimal Agent Prompt Add-on

```text
Before editing, classify the change:
- layer: domain | use-case | outbound | inbound | server-state | UI | infrastructure
- boundary: RSC read | Server Action | Route Handler | webhook | durable job
- server data owner: RSC/DAL | TanStack Query | none
- auth boundary: where auth/authz is re-verified

Then implement in layer order. Do not import outbound adapters from use-cases.
```
