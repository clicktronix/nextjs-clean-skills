# Architecture Contract

This document is the human-readable model behind the `nextjs-architecture` and
`react-component-creator` skills. The skills are short operational guardrails; this document is
the rationale and visual map for teams.

## Purpose

The architecture combines Next.js App Router with ports-and-adapters discipline:

- Next.js owns routing, rendering, Server Actions, Route Handlers, and cache APIs.
- The application owns domain rules, use-cases, ports, adapters, and authorization decisions.
- Framework entrypoints compose dependencies; use-cases do not import framework or adapter code.

## Layer Dependency Graph

```mermaid
flowchart LR
  RSC["app/ server entrypoints\npages + layouts + RSC"] --> DAL["server-only DAL/read entrypoints"]
  ClientUI["client UI components"] --> ServerState["ui/server-state/\nTanStack Query hooks"]
  ClientUI --> LocalActions["feature-local actions.ts\nthin form/action wrappers"]
  SharedUI["shared ui/components\npresentation only"] -. "no data access" .-> ClientUI
  ServerState --> Inbound["adapters/inbound/next/\nServer Actions + Route Handlers"]
  LocalActions --> Inbound
  DAL --> UseCases["use-cases/\napplication orchestration + ports"]
  Inbound --> UseCases
  Inbound --> OutboundFactories["outbound factories\ncomposition root"]
  OutboundFactories --> Outbound["adapters/outbound/\nSupabase, APIs, queues"]
  Outbound --> Domain["domain/\nValibot schemas + pure rules"]
  UseCases --> Domain
  Outbound -. implements ports .-> UseCases
```

The important distinction: inbound adapters may create outbound implementations at runtime, but
use-cases must not import those implementations at compile time.

Forbidden imports:

- `domain/` must not import `app/`, `ui/`, use-cases, adapters, infrastructure, or framework APIs.
- `use-cases/` must not import inbound adapters, outbound adapters, Supabase clients, React,
  TanStack Query, or Next.js request/cache APIs.
- Client Components must not import server-only DAL modules, server Supabase clients, service-role
  clients, or secret-bearing env helpers.

## Runtime Flow vs Import Direction

```mermaid
flowchart TB
  subgraph Runtime["Runtime call flow"]
    Form["User submits form"] --> Action["Server Action"]
    Action --> BuildRepo["create repository"]
    BuildRepo --> UseCase["call use-case"]
    UseCase --> Port["call port interface"]
    Port --> Repo["Supabase repository"]
  end

  subgraph CompileTime["Compile-time imports"]
    ActionFile["server-actions/*.ts"] --> UseCaseFile["use-cases/*.ts"]
    ActionFile --> RepoFile["adapters/outbound/*.repository.ts"]
    RepoFile --> PortFile["use-cases/*/ports.ts"]
    UseCaseFile --> PortFile
    UseCaseFile --> DomainFile["domain/*"]
  end
```

This is why "inbound can call use-cases" is correct. The violation is the opposite direction:
use-cases importing inbound adapters, outbound repositories, Supabase clients, React, TanStack
Query, or Next.js request/cache APIs.

## Command And Query Boundaries

```mermaid
flowchart TD
  Need["Need data or mutation?"] --> ReadWrite{"Read or command?"}
  ReadWrite -->|Read-heavy UI| RSC["Server Component\nserver-only DAL/read entrypoint"]
  ReadWrite -->|Client interactive read| Query["ui/server-state\nTanStack Query opt-in"]
  ReadWrite -->|User form/button command| Action["Server Action\nvalidated inbound boundary"]
  ReadWrite -->|External API / service client| Route["Route Handler\nJSON envelope + request id"]
  ReadWrite -->|Webhook| Webhook["Route Handler\nraw body + signature verification"]
  ReadWrite -->|Long-running work| Queue["Durable job/queue\nprovider adapter"]
```

Server Actions are for UI commands. Route Handlers are for service APIs, webhooks, external
clients, mobile apps, integrations, and retryable HTTP commands.

## Security Boundary

```mermaid
flowchart LR
  Proxy["src/proxy.ts\nrefresh session, redirect, headers"] --> App["app/ route"]
  App --> DAL["server-only DAL / inbound adapter"]
  DAL --> Verify["verify auth + role + tenant"]
  Verify --> UseCase["use-case"]
  UseCase --> Repo["outbound repository"]
  Repo --> DTO["DTO / safe response"]

  Proxy -. "not enough for authorization" .-> UseCase
```

`proxy.ts` is not the authorization boundary. Data access paths must re-check auth and return
DTOs rather than leaking raw database rows or service-role data.

## Persistence Boundary

```mermaid
flowchart LR
  UseCase["use-case"] --> Port["Repository port"]
  Adapter["Supabase repository"] --> Port
  Adapter --> SQL["Postgres + RLS"]
  SQL --> Policy["RLS policies\n(select auth.uid())\nwith check authority columns"]
```

Use-cases describe what persistence capability they need. Outbound adapters decide how Supabase,
RPCs, transactions, queues, or external APIs implement that capability.

## UI State Ownership

```mermaid
flowchart TD
  State["What kind of state?"] --> URL{"Shareable/bookmarkable?"}
  URL -->|Yes| SearchParams["URL search params"]
  URL -->|No| Server{"Server-owned data?"}
  Server -->|Read-heavy| RSCProps["RSC props"]
  Server -->|Realtime/polling/optimistic/infinite| TanStack["TanStack Query"]
  Server -->|No| Scope{"Scope?"}
  Scope -->|One component| Local["useState/useReducer"]
  Scope -->|One route| FeatureHook["feature-local hook"]
  Scope -->|Global static config| Context["React Context"]
  Scope -->|Hot shared dynamic state| Zustand["External store opt-in\nwhen justified"]
```

Do not put server data in Context, Zustand, or local state. Client stores own UI behavior, not
backend truth.

## What Belongs In Skills vs Docs

| Content | Put in skill references | Put in human docs |
| --- | --- | --- |
| Layer import contract | Yes | Yes |
| Decision tables used while coding | Yes | Yes |
| Rationale and diagrams | No | Yes |
| External API syntax | No | No, link to official docs |
| Long implementation walkthroughs | No | Sometimes, if onboarding needs it |
| Historical audit notes | No | Archive outside the plugin |
