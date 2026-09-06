# ResearchHub Application Runtime & Client Architecture v0.1

**Status:** FROZEN  
**Version:** v0.1  
**Date:** 2026-09-06  
**Architecture Decision:** RHL-ARCH-APPLICATION-RUNTIME-CLIENT-001

---

## 1. Purpose

This document defines the normative Application Runtime and Client architecture for ResearchHub after completion of:

- Pi Host Foundation;
- Application Interaction Architecture v0.1;
- Application Service v0.1.

It specifies how the browser client connects to ResearchHub, how Pi conversation sessions are hosted, how streaming is delivered, how Application Services are exposed to both Pi and the browser, how files become Attachments, how WorkflowRun state is observed, and what is intentionally excluded from v0.1.

This document does **not** implement frontend product features. It freezes the runtime/client topology on which future homepage and research workflows will depend.

---

## 2. Current Foundation

The following architecture is already accepted:

- Pi Coding Agent is the canonical ResearchHub application host.
- Pi ModelRuntime owns provider/model/auth/runtime configuration.
- Pi is embedded programmatically in ResearchHub.
- ResearchHub Application Services provide the product-facing business boundary.
- Application Tools expose product-level actions to Pi.
- The three primary interaction classes are:
  - Free Research;
  - Knowledge Query;
  - Knowledge Production.
- Review is downstream Knowledge Production governance.
- Canonical Knowledge mutation remains governed by Workflow → Knowledge Integrity → Writer.
- Free Research is non-persistent by default.
- Upload and canonical ingestion are distinct.
- WorkflowRun state is Application-observable.
- ReviewCase is durable actionable Application state.
- Agent-host portability is not a product requirement.

---

## 3. Architecture Decision Summary

ResearchHub v0.1 adopts the following runtime topology:

```text
┌───────────────────────────────────────────────┐
│ Browser Client                                │
│ React + TypeScript + Vite SPA                 │
│                                               │
│ Conversation / Knowledge / Workflow / Review  │
│ Attachments                                   │
└──────────────────────┬────────────────────────┘
                       │
                HTTP JSON + SSE
                       │
┌──────────────────────▼────────────────────────┐
│ ResearchHub Application Runtime               │
│ Node.js / TypeScript                          │
│                                               │
│ Client API                                    │
│ Pi Session Runtime                            │
│ Attachment Service                           │
│ Application Services                         │
│ Client Event Adapter                         │
└──────────────┬────────────────┬───────────────┘
               │                │
               ▼                ▼
        Pi Coding Agent     ResearchHub Core
        AgentSessionRuntime  Workflow
        ModelRuntime         Knowledge
        Sessions             Review
        Skills               Writer
               │
               ▼
         Pi Providers / Models
```

Frozen choices:

- **Runtime topology:** local-first, single-user, one local Node.js process.
- **Pi integration:** direct SDK embedding, not RPC subprocess.
- **Conversation session lifecycle:** Pi `AgentSessionRuntime`.
- **Conversation persistence:** Pi session infrastructure.
- **Client:** React + TypeScript + Vite SPA.
- **Commands and queries:** HTTP JSON.
- **Agent streaming:** Server-Sent Events (SSE).
- **Workflow observation:** HTTP polling while active in v0.1.
- **Remote/multi-user mode:** out of scope.

---

## 4. Local-First Runtime

ResearchHub v0.1 is a local-first application.

The Application Runtime must:

- run on the user's local machine;
- bind to loopback by default;
- directly access local Pi configuration, workspace, KnowledgeBase, and Application Services;
- serve the ResearchHub browser client;
- remain single-user in v0.1.

Default network binding:

```text
127.0.0.1
```

Not:

```text
0.0.0.0
```

Remote LAN/public access is not a v0.1 capability.

Any future remote or cloud deployment requires a separate security and identity architecture.

---

## 5. One Node.js Application Runtime Process

ResearchHub v0.1 uses one Node.js / TypeScript Application Runtime process.

This process owns:

- Pi ModelRuntime;
- Pi AgentSessionRuntime;
- ResearchHub Application Services;
- WorkflowService;
- KnowledgeService;
- ReviewService;
- ProductionService;
- AttachmentService;
- HTTP API;
- SSE stream;
- browser static assets in production packaging.

ResearchHub does not split these into microservices in v0.1.

Do not introduce:

- API gateway;
- service mesh;
- Redis;
- distributed queue;
- background-worker cluster;
- separate Pi service;
- separate Knowledge service process.

The objective is architectural simplicity while preserving clear internal module boundaries.

---

## 6. Pi SDK Embedding

ResearchHub embeds Pi through the Node/TypeScript SDK.

Production architecture:

```text
ResearchHub Application Runtime
        |
        v
@earendil-works/pi-coding-agent
```

Not:

```text
ResearchHub Runtime
        |
        v
spawn("pi --mode rpc")
```

Pi RPC mode remains a valid Pi capability but is not the ResearchHub v0.1 integration path.

The ResearchHub runtime and Pi run in the same Node.js process.

Benefits:

- shared ModelRuntime;
- direct AgentSession event subscription;
- no subprocess lifecycle;
- no JSONL RPC framing layer;
- direct reuse of Pi session runtime;
- simpler tool/service composition;
- easier cancellation and event translation.

---

## 7. Conversation Session Runtime

The browser requires durable conversation session lifecycle.

ResearchHub must not build a second conversation engine.

Pi `AgentSessionRuntime` is the canonical owner of:

- current active AgentSession;
- new conversation;
- resume/switch conversation;
- fork;
- imported session lifecycle where later exposed;
- Pi session replacement.

Conceptually:

```text
ResearchHub SessionRuntime Adapter
        |
        v
Pi AgentSessionRuntime
        |
        v
Pi AgentSession
```

The ResearchHub adapter may expose Application-friendly operations, but it must not recreate Pi's internal conversation state machine.

---

## 8. Conversation Persistence

Production Application Runtime must use Pi's persistent session infrastructure rather than `SessionManager.inMemory()` as the normal runtime default.

Pi session persistence remains authoritative for conversation history.

ResearchHub does not introduce:

- conversation SQL database;
- duplicate transcript store;
- custom message persistence schema;
- separate compaction history.

Application-specific state should remain separate from conversation persistence.

---

## 9. Active Conversation Model

ResearchHub v0.1 maintains one active Pi conversation runtime at a time.

Users may have multiple persisted conversations, but only the selected conversation is active in the current Application Runtime context.

Conceptually:

```text
Conversation A
Conversation B
Conversation C

Selected:
Conversation B
        |
        v
active AgentSessionRuntime session
```

Switching conversation uses Pi's session lifecycle.

v0.1 does not maintain many simultaneously active Pi Agent sessions.

Future parallel live-agent sessions require a separate architectural decision.

---

## 10. Workflow Lifetime Is Independent from Conversation Lifetime

WorkflowRun is Application state, not conversation state.

Example:

```text
Conversation A
   |
   v
start Knowledge Production
   |
   v
WorkflowRun X
```

If the user later switches to Conversation B:

```text
Conversation B active
WorkflowRun X still belongs to ResearchHub Application Runtime
```

Conversation switching must not implicitly cancel an active Workflow.

Workflow state is owned by ResearchHub Application Services, not by the current Pi message stream.

---

## 11. Dual Client Interaction Paths

The browser communicates with ResearchHub through two different product paths.

### 11.1 Conversation Path

```text
Browser
   |
   v
Conversation API
   |
   v
Pi AgentSessionRuntime
   |
   v
Pi Agent
   |
   v
Application Tools when required
   |
   v
Application Services
```

Used for:

- natural-language Free Research;
- natural-language Knowledge Query;
- natural-language Knowledge Production;
- steering/follow-up;
- Agent explanation.

### 11.2 Product UI Path

```text
Browser
   |
   v
Product API
   |
   v
Application Services
```

Used for direct product navigation:

- Knowledge search/browse;
- Knowledge object view;
- Review Inbox;
- WorkflowRun status;
- cancel Workflow;
- start explicit production action from a UI control;
- Attachment management.

The browser must not require an LLM round-trip for deterministic UI navigation.

---

## 12. Shared Application Services

Pi Application Tools and browser Product APIs must call the same Application Services.

Normative dependency:

```text
Pi Application Tool --------+
                            |
Browser Product API --------+--> Application Service --> ResearchHub Core
```

Do not duplicate business logic into:

- route handlers;
- React components;
- Pi tool definitions.

Route handlers and Pi tools are adapters.

Application Services remain the shared product boundary.

---

## 13. Client Technology

ResearchHub v0.1 browser client uses:

```text
React
TypeScript
Vite
```

The client is a single-page application.

A full-stack React framework is not the server architecture for ResearchHub v0.1 because ResearchHub already has a dedicated long-lived Node Application Runtime that must own Pi and local filesystem state.

The client build system must remain independent from ResearchHub business logic.

---

## 14. Browser First, Desktop Shell Later

ResearchHub v0.1 runs as a browser application served by the local Application Runtime.

Expected local startup experience:

```text
start ResearchHub
        |
        v
Node Application Runtime
        |
        v
http://127.0.0.1:<port>
        |
        v
Browser Client
```

Electron or Tauri are not required in v0.1.

A future desktop package may wrap the same client/runtime architecture without changing core business boundaries.

---

## 15. Transport Split

ResearchHub v0.1 uses:

```text
HTTP JSON
+
Server-Sent Events (SSE)
```

### HTTP JSON

Used for:

- commands;
- queries;
- Knowledge reads;
- Review reads;
- Workflow reads;
- Workflow cancel;
- file upload;
- explicit production start;
- session-management commands.

### SSE

Used for:

- Pi assistant message streaming;
- tool execution lifecycle;
- Agent lifecycle;
- queue updates;
- client-safe conversation events.

WebSocket is not required in v0.1.

---

## 16. Conversation Command Semantics

Conversation commands conceptually support:

```text
prompt
steer
follow_up
abort
```

These map to Pi's session operations.

A conversation command request should not remain open until the entire LLM/Agent run completes.

Preferred behavior:

```text
POST command
   |
   v
Pi accepts command
   |
   v
HTTP 202 Accepted
   |
   v
Agent events continue through SSE
```

The exact route names remain implementation-level and are not frozen by this document.

---

## 17. Conversation Event Stream

The browser maintains one SSE connection to receive Application-normalized conversation events.

Conceptual endpoint:

```text
GET /api/events
```

The Application Runtime subscribes to Pi AgentSession events and maps them into a stable client-facing event contract.

The browser must not receive raw Pi internal event objects.

---

## 18. Client Event Adapter

A thin `ClientEventAdapter` translates Pi events into safe ResearchHub client events.

Conceptual v0.1 event taxonomy:

```text
agent.started
agent.completed

message.started
message.delta
message.completed

tool.started
tool.updated
tool.completed

queue.updated

session.changed

error
```

The purpose is **UI contract stability**, not Agent-host portability.

Do not build a generic event bus.

The adapter is a one-way translation boundary.

---

## 19. Hidden Reasoning / Thinking

Raw model internal reasoning must not be streamed to the browser as content.

Pi may expose thinking-related lifecycle events internally, but ResearchHub Client must not display or transmit raw hidden reasoning.

Client may display safe status such as:

```text
Thinking…
Analyzing…
```

but not model chain-of-thought content.

The client event stream must also avoid leaking:

- system prompt;
- credentials;
- raw stack traces;
- internal filesystem paths not needed by the product;
- unrestricted internal tool payloads.

---

## 20. Tool Event Projection

Client UI may display product-friendly tool status.

Example:

```text
tool.started
name: ingest_document
display: Adding report to KnowledgeBase
```

and:

```text
tool.completed
status: completed_with_review
reviewCount: 2
```

The client should not render arbitrary raw tool JSON by default.

Tool event projection must remain bounded and safe.

---

## 21. Workflow Status in v0.1

Workflow state remains authoritative Application state.

v0.1 does not require Workflow push events.

The browser may poll:

```text
GET WorkflowRun
```

while the run is active.

Recommended behavior:

```text
status == running
→ poll periodically

terminal status
→ stop polling
```

A one-second-scale polling interval is acceptable for local v0.1 UX.

Workflow progress must not be fabricated.

---

## 22. Workflow Push Events Deferred

Do not add a Workflow event emitter solely for UI real-time animation in v0.1.

Future producer workflows may expose meaningful structured stage progress such as:

```text
Industry discovery
Evidence acquisition
Company mapping
Completeness review
```

At that point Workflow push events may be introduced.

The current architecture keeps this deferred.

---

## 23. Production Start vs Completion

Application Service v0.1 currently allows an ingestion call to await Workflow completion.

The browser needs an immediate-start pattern.

Preferred evolution:

```text
startIngestDocument(...)
        |
        +--> runId
        |
        +--> completion Promise
```

Pi Application Tool may:

```text
start
await completion
return final result to Agent
```

Browser Product API may:

```text
start
return HTTP 202 + runId
observe via Workflow API
```

This must reuse the same ProductionService implementation.

It must not create a parallel "web workflow" path.

---

## 24. Attachment Model

Browser uploads are managed by an Application Runtime `AttachmentService`.

Upload lifecycle:

```text
Browser file
   |
   v
multipart upload
   |
   v
AttachmentService
   |
   v
workspace/uploads/
   |
   v
AttachmentRef
```

Conceptual `AttachmentRef`:

```text
AttachmentRef {
  attachmentId
  filename
  mediaType
  size
  sha256
  workspaceRelativePath
  createdAt
}
```

The browser uses `attachmentId`, not arbitrary local filesystem paths.

---

## 25. Upload Is Not Canonical Ingestion

The frozen rule remains:

> **Upload != Ingestion**

An uploaded file belongs to the Application workspace.

It may be used by Pi for Free Research.

Only explicit Knowledge Production intent may pass the attachment into formal ingestion.

```text
AttachmentRef
    |
    v
explicit Add to Knowledge
    |
    v
ProductionService
    |
    v
Document Plugin
    |
    v
Raw Archive
    |
    v
Workflow
```

Attachment identity and canonical Raw identity are distinct.

---

## 26. Workspace Layout

Recommended v0.1 runtime workspace layout:

```text
workspace/
└── uploads/
    └── <attachmentId>/
        ├── <original filename>
        └── metadata.json
```

Other future workspace subdirectories such as `scratch/`, `exports/`, or `downloads/` should only be created when implemented capability needs them.

Do not create empty scaffolding solely to match documentation.

---

## 27. Attachment File Safety

Browser APIs must never accept arbitrary host filesystem paths as attachment identity.

The runtime maps:

```text
attachmentId
→ controlled workspace path
```

The existing ProductionService workspace boundary remains authoritative for formal ingestion.

AttachmentService must:

- prevent path traversal;
- prevent canonical KnowledgeBase targeting;
- prevent symlink escape;
- keep browser-visible references independent from absolute local paths.

---

## 28. Images and Other Files

Image uploads may later be supplied to Pi using supported Pi image prompt input while also remaining workspace Attachments.

PDF, spreadsheet, text, and other files remain workspace Attachments and may be inspected by Pi through supported file/document capabilities.

The same uploaded file may serve both:

- Free Research;
- later formal Knowledge Production.

No duplicate user upload is required.

---

## 29. Application Context Distribution

Application Context is distributed rather than stored in one large central object.

### Runtime-owned

- mounted KnowledgeBase;
- workspace root;
- active Pi session runtime;
- WorkflowService;
- AttachmentService.

### Client-owned / URL state

- selected Knowledge object;
- selected ReviewCase;
- selected conversation;
- selected attachment;
- current visible WorkflowRun.

The client may include lightweight references in a conversation command, e.g.:

```text
selectedObjectRef
attachmentIds
```

The runtime validates these references.

Large Knowledge payloads must not be injected automatically.

---

## 30. Selected Knowledge Object

Selected Knowledge state should primarily be represented by client route/state.

Example:

```text
/knowledge/<encoded canonical ref>
```

When a user sends a message while an object is selected, the client may provide the selected canonical ref as contextual metadata.

The runtime may supply a lightweight context hint to the Agent.

The Agent must still use bounded Knowledge tools when it needs object details.

---

## 31. Local Runtime Security

Although v0.1 is local-only, localhost is not treated as automatically trusted.

Runtime requirements:

- bind loopback only;
- same-origin browser client;
- no permissive `Access-Control-Allow-Origin: *`;
- validate Host/Origin where practical;
- use a random runtime nonce/token for mutating browser API requests;
- do not expose canonical KnowledgeBase files as static assets.

This nonce is a local application protection mechanism, not user authentication.

---

## 32. No User Identity System in v0.1

ResearchHub v0.1 does not implement:

- login;
- JWT;
- OAuth user identity;
- RBAC;
- organizations;
- tenancy;
- cloud account permissions.

Runtime assumption:

```text
single machine
single user
single Application Runtime
single mounted KnowledgeBase
```

A future remote/cloud architecture must introduce proper identity/security boundaries.

---

## 33. Static File Exposure

Canonical KnowledgeBase data must never be exposed through static file serving.

Forbidden:

```text
/static/runtime-data/knowledge-bases/**
```

Knowledge reads must use:

```text
Browser
→ Product API
→ KnowledgeService
```

Workspace attachments must also be served only through controlled attachment APIs when download/preview is needed.

---

## 34. Runtime Directory Direction

Conceptual runtime directory:

```text
app/
├── pi/
├── services/
└── runtime/
    ├── server.ts
    ├── session-runtime.ts
    ├── client-events.ts
    ├── attachment-service.ts
    ├── security.ts
    └── routes/
```

Exact file names may evolve during implementation.

The architectural boundary is:

- `app/pi/` = Pi integration;
- `app/services/` = product business boundary;
- `app/runtime/` = local Application Runtime and client transport.

---

## 35. Client Directory Direction

Conceptual browser client:

```text
client/
├── src/
│   ├── app/
│   ├── features/
│   │   ├── conversation/
│   │   ├── knowledge/
│   │   ├── workflows/
│   │   ├── reviews/
│   │   └── attachments/
│   └── components/
```

The feature structure is directional, not a requirement to create empty directories.

React components must not import ResearchHub core server code.

---

## 36. Browser Product Areas

The first homepage shell should eventually expose:

- Conversation;
- Attachments;
- Knowledge search/browse;
- Active Workflow state;
- Review Inbox.

Theme, Industry, and Company specialized views are later product projections built on canonical Knowledge.

This document does not freeze final visual layout.

---

## 37. Application Runtime API Categories

The client transport should expose five conceptual API categories:

### Session / Conversation

- list/resume/new/switch conversation;
- send prompt;
- steer;
- follow-up;
- abort;
- read current state/messages where needed.

### Knowledge

- search;
- get object.

### Production / Workflow

- start ingestion;
- get WorkflowRun;
- cancel WorkflowRun.

### Review

- list open ReviewCases;
- get ReviewCase.

### Attachments

- upload;
- list session/recent attachments where needed;
- retrieve metadata;
- controlled preview/download where later required.

Exact route strings are implementation details.

---

## 38. API Response Discipline

Browser APIs return structured data from Application Services or dedicated runtime DTOs.

Do not return internal objects wholesale when smaller projections are sufficient.

Do not expose:

- Writer implementation;
- registry internals;
- arbitrary absolute filesystem paths;
- raw Error stacks;
- Pi internal runtime objects;
- ModelRuntime credentials/config secrets.

---

## 39. Failure Semantics

Client-visible errors should distinguish at least:

```text
invalid_input
not_found
cancelled
failed
conflict
unauthorized_runtime_token
```

This is an Application transport concern.

Do not create a broad enterprise error framework.

Server logs may retain richer diagnostics than browser responses.

---

## 40. Process Restart Semantics

Conversation persistence is recovered through Pi's persistent sessions.

Canonical Knowledge and Durable Review persist independently.

Generic WorkflowRun state remains process-scoped in v0.1 unless a concrete requirement justifies durable Application Workflow state.

After runtime restart:

- completed canonical mutations remain in Knowledge;
- Durable ReviewCases remain;
- Pi conversations remain resumable;
- an in-flight generic WorkflowRun is not assumed resumable.

A future durable workflow execution architecture is a separate decision.

---

## 41. Frontend and Agent Consistency

The browser and Pi Agent are two interaction surfaces over one product.

They must not disagree about:

- current canonical Knowledge;
- ReviewCase state;
- WorkflowRun state;
- production actions.

Both surfaces consume the same Application Service layer.

This is a core architectural invariant.

---

## 42. Non-Goals

Application Runtime & Client v0.1 does **not** include:

- Next.js server runtime;
- WebSocket transport;
- Electron;
- Tauri;
- remote access;
- cloud deployment;
- multi-user access;
- RBAC;
- authentication system;
- SQL database;
- Redis;
- queue service;
- distributed jobs;
- microservices;
- generic Event Bus;
- generic Workflow Engine;
- raw model thinking display;
- Pi RPC subprocess integration;
- durable generic WorkflowRun persistence;
- Theme Framework Workflow implementation;
- Industry Deep Research;
- Company Deep Research;
- ReviewDecision execution.

---

## 43. Frozen Invariants

The following principles are frozen for Application Runtime & Client Architecture v0.1:

1. **ResearchHub v0.1 is local-first and single-user.**
2. **ResearchHub uses one local Node.js Application Runtime process.**
3. **Pi is embedded through the Node/TypeScript SDK, not an RPC subprocess.**
4. **Pi AgentSessionRuntime owns conversation-session lifecycle.**
5. **Pi session infrastructure owns conversation persistence; ResearchHub does not create a second chat database.**
6. **Only one Pi conversation is active in the v0.1 Application Runtime at a time.**
7. **WorkflowRun lifetime is independent from conversation lifetime.**
8. **Browser Client uses React + TypeScript + Vite.**
9. **Browser never directly accesses Pi ModelRuntime, filesystem, canonical Knowledge storage, or Writer.**
10. **Pi Agent Tools and browser Product APIs share the same Application Services.**
11. **HTTP JSON carries commands and queries.**
12. **SSE carries normalized Agent streaming events.**
13. **WebSocket is not required in v0.1.**
14. **WorkflowRun is polled while active in v0.1 unless a later Workflow progress architecture is approved.**
15. **Workflow progress must be authoritative, never LLM-invented.**
16. **The browser receives normalized safe client events, not raw Pi event objects.**
17. **Raw model hidden reasoning is not streamed to the browser.**
18. **Upload creates an AttachmentRef, not canonical Raw.**
19. **Browser APIs use Attachment IDs, not arbitrary filesystem paths.**
20. **Explicit Knowledge Production intent remains required before formal ingestion.**
21. **Canonical KnowledgeBase files are never statically exposed to the browser.**
22. **Runtime binds loopback-only by default.**
23. **Local mutation APIs use same-origin checks plus a runtime nonce/token.**
24. **Remote/multi-user deployment requires a separate future security architecture.**
25. **Frontend visual layout remains unfrozen.**

Any future change to these invariants requires an explicit architecture decision.

---

## 44. Immediate Engineering Sequence

After this freeze, implementation should proceed in two independently verifiable phases:

```text
RHL-IMPLEMENT-APPLICATION-RUNTIME-001
        |
        v
Node local runtime
Pi persistent session runtime
HTTP API
SSE
AttachmentService
runtime security
Production start semantics
        |
        v
RHL-IMPLEMENT-HOMEPAGE-SHELL-001
        |
        v
React + Vite SPA
Conversation
Knowledge
Workflow
Review
Attachments
```

Do not combine both phases into one oversized implementation task.

---

## 45. Final Rule

The core runtime/client principle is:

> **Pi owns the conversation Agent runtime, ResearchHub owns product state and Knowledge authority, and the browser is a safe local client over one shared Application Service boundary.**
