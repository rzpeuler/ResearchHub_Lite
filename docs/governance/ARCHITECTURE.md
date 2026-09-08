# ResearchHub_Lite — Architecture

## 1. Architecture Status

Status: **FROZEN — Current Product Baseline**

Daily Intelligence v1 is implemented / CTO acceptance pending under `docs/architecture/PERSONAL_RESEARCH_V1_DAILY_INTELLIGENCE_ARCHITECTURE.md`; this does not change the frozen Runtime or Knowledge mutation boundaries.

This governance document summarizes the current ResearchHub_Lite architecture after adoption of Pi Coding Agent as the canonical application host and the freeze of Application Interaction Architecture v0.1.

Normative detailed architecture is maintained under `docs/architecture/`.

Key current normative documents include:

- `KNOWLEDGE_ARCHITECTURE_LITE_V0.1.md`
- `RAW_DOCUMENT_INGESTION_WORKFLOW_V0.1.md`
- `KNOWLEDGE_SCHEMA_REVIEW_REDUCTION_PATCH_V0.1.md`
- `KNOWLEDGE_PRODUCTION_ARCHITECTURE_V0.1.md`
- `REVIEW_GOVERNANCE_V0.1.md`
- `RESEARCHHUB_APPLICATION_INTERACTION_ARCHITECTURE_V0.1.md`

Historical documents remain historical evidence unless explicitly superseded.

---

## 2. Product Model

ResearchHub_Lite is now the active foundation for the ResearchHub application, not merely a migration sandbox.

The product is an **Agent-first investment research application**.

Pi Coding Agent is the canonical application host and primary user interaction entrypoint.

The user-facing interaction model is:

```text
                           User
                            |
                            v
                    Homepage / Client
                            |
                            v
                    Pi Coding Agent
                            |
          +-----------------+-----------------+
          |                 |                 |
          v                 v                 v
    Free Research     Knowledge Query   Knowledge Production
          |                 |                 |
       Pi tools         Application         Application
       / Skills           Services            Services
                                                |
                                                v
                                             Workflow
                                                |
                              +-----------------+----------------+
                              |                                  |
                              v                                  v
                       Canonical Knowledge                 Durable ReviewCase
```

Review is downstream Knowledge Production governance, not a fourth research mode.

---

## 3. Primary Architectural Responsibilities

### Pi Coding Agent

Pi owns the application Agent runtime and user-facing general Agent experience, including:

- Agent loop;
- session;
- model/provider/auth runtime;
- file-backed Pi settings;
- Skills and Extensions;
- ordinary Agent tools;
- free-form research interaction.

Pi is not the Knowledge mutation authority and is not the deterministic Workflow controller.

### Application Layer

`app/` owns application-host integration and thin product-facing services.

Conceptual direction:

```text
app/
├── pi/
└── services/
```

Pi tools and future UI/API surfaces should consume the same Application Services.

### Workflow

Workflow owns deterministic Knowledge Production execution:

- execution order;
- branching;
- bounded retry;
- bounded parallelism;
- barriers;
- validation gates;
- blocked/failed/cancelled/completed lifecycle;
- Writer entry;
- terminal status.

### Skill

ResearchHub Skills own semantic research methodology.

A Skill may reason about report structure, extraction, research scope, and semantic cases.

A Skill does not own canonical mutation or Workflow routing.

### Plugin

Plugins own external capability integration.

Current examples include:

- document parsing;
- reasoning runtime integration.

Future research-acquisition, financial-data, or market-data capability may also belong here when implemented.

### Knowledge

Knowledge owns deterministic canonical data integrity and persistence.

Knowledge is not an Agent execution layer.

---

## 4. Pi Host Decision

Pi Coding Agent is the canonical ResearchHub application host.

ResearchHub directly depends on Pi and no longer treats Agent-host portability as a product requirement.

ResearchHub reuses Pi ModelRuntime for:

- provider definitions;
- model catalog;
- authentication/OAuth/API credentials;
- model selection;
- thinking configuration;
- provider runtime behavior.

ResearchHub reuses Pi file-backed settings:

```text
<agentDir>/settings.json
<cwd>/.pi/settings.json
```

ResearchHub does not build a duplicate Provider Registry or generic Agent Runtime.

DSH / DeepSeek Harness must not be reintroduced.

---

## 5. ReasoningExecutor

`ReasoningExecutor` remains part of ResearchHub, but its role is now:

> semantic-operation boundary + deterministic test seam

It is **not** maintained as a generic Agent-host portability layer.

Production semantic reasoning may use:

```text
PiReasoningExecutor
        |
        v
Pi ModelRuntime
```

Conversation and Workflow semantic reasoning may share the same ModelRuntime, but their inference contexts remain independent:

```text
Conversation Session Context
!=
Workflow Semantic Reasoning Context
```

Historical Codex adapters may remain for historical validation/reference until deliberately retired.

---

## 6. Application Interaction

The three primary interaction classes are:

1. Free Research
2. Knowledge Query
3. Knowledge Production

### Free Research

Non-persistent by default.

Pi may use ordinary tools, Skills, files, web/research helpers, and workspace outputs.

### Knowledge Query

Read-only access to bounded canonical Knowledge projections.

### Knowledge Production

Requires explicit durable-production intent and enters a product-level Application Tool plus deterministic Workflow.

Normative persistence rule:

> **Persistence requires explicit Knowledge Production intent.**

Review is produced only when valuable production output cannot yet be safely committed.

---

## 7. Application Tools

Application Tools must expose product actions rather than low-level Knowledge mutation primitives.

Current/near-term product-level surface:

```text
researchhub_status

search_knowledge
get_knowledge_object

ingest_document

get_workflow_status
cancel_workflow

list_review_cases
get_review_case
```

Future product actions such as `build_theme`, `research_industry`, `research_company`, or `resolve_review_case` must not be exposed until the corresponding capability exists.

Forbidden Agent-facing mutation primitives include:

```text
create_entity
create_relation
create_claim
allocate_canonical_id
create_changeset
commit_changeset
write_registry
```

---

## 8. Application Service Boundary

Pi tools and future UI/API surfaces should call thin Application Services rather than independently importing broad Workflow/Knowledge/Review internals.

Conceptual direction:

```text
Pi Tool ---------+
                 |
Future UI/API ---+--> Application Service --> Workflow / Knowledge / Review
```

Do not create a generic service framework, Command Bus, Event Bus, Repository framework, or generic Workflow Engine solely for abstraction.

---

## 9. Application Context

Application sessions may track lightweight references such as:

```text
currentKnowledgeBaseId
currentKnowledgeBaseRoot
workspaceRoot
selectedObjectRef
attachments[]
activeWorkflowRunId
```

Large Knowledge payloads must not be automatically injected into the Agent context.

Knowledge details should be retrieved through bounded Knowledge query capabilities.

---

## 10. File and Attachment Boundary

User upload and canonical ingestion are distinct.

```text
Upload
  |
  v
workspace/uploads/
  |
  v
AttachmentRef
```

The attachment may be freely used by Pi.

Only explicit Knowledge Production intent triggers:

```text
AttachmentRef
  |
  v
ingest_document
  |
  v
Raw Archive
  |
  v
Workflow
```

Normative rule:

> **Upload != Ingestion.**

Free Research output is not canonical Evidence without formal provenance.

---

## 11. WorkflowRun

Workflow execution must be observable Application state.

Minimum status vocabulary:

```text
pending
running
completed
completed_with_review
blocked
cancelled
failed
```

`blocked` is a governed business/Knowledge state.

`failed` is an execution/runtime failure.

The Agent and future UI must display authoritative Workflow state rather than inventing progress.

This does not require a generic Workflow Engine.

---

## 12. Review

`ReviewSummary` is telemetry.

`ReviewCase` is durable actionable Knowledge Production state.

A user-facing ReviewCase should normally be:

```text
material + unresolved + actionable
```

Actionability classes remain:

```text
knowledge_decision
research_followup
schema_design
```

Review does not bypass Knowledge integrity.

A future ReviewDecision must still re-enter current Binding/Diff/Resolution and then use validated ChangeSet → Writer.

---

## 13. Workflow / Skill / Plugin Boundary

### Workflow

Owns deterministic lifecycle and execution control.

### Skill

Owns semantic professional methodology.

### Plugin

Owns external capability/runtime integration.

### Knowledge

Owns canonical domain integrity.

These boundaries remain active even though Agent-host portability is no longer a product goal.

---

## 14. Knowledge Production Integrity

All canonical Knowledge Producers converge on the shared integrity path.

Conceptually:

```text
Semantic Proposal
        |
        v
Binding / Diff
        |
        v
bounded Semantic Resolution where needed
        |
        v
deterministic Resolution Policy
        |
        v
ResolutionIntent
        |
        v
ChangeSet
        |
        v
Validation
        |
        v
Writer
```

Knowledge Producers may differ in research strategy.

Canonical mutation authority remains unique.

---

## 15. Raw Document Ingestion

The current deterministic ingestion direction remains:

```text
Intake & Raw Archive
        |
        v
Parse Structured Document
        |
        v
Understand + Plan
        |
        v
Deterministic Plan Validation
        |
        v
Bounded Parallel Extraction + Per-Unit Validation
        |
        v
Candidate Consolidation
        |
        v
Entity Binding / Knowledge Diff
        |
        v
bounded Semantic Resolution Cases
        |
        v
ResolutionIntent / ChangeSet Planning
        |
        v
Final Deterministic Validation
        |
        v
Atomic Writer
        |
        v
Reload & Verify
```

LLM owns semantic decomposition.

Workflow owns execution.

Deterministic infrastructure owns admissibility and canonical integrity.

---

## 16. Knowledge Safety Invariants

The following remain non-negotiable:

- Knowledge provenance follows `Knowledge → Source → Raw`.
- Canonical IDs are deterministic infrastructure, not LLM authority.
- Final persistence requires a validated ChangeSet.
- Updates require stale-target protection.
- Writes require revision protection.
- Writer stages the next state before commit.
- Staged state must pass full validation.
- Mutation is atomic.
- Replay/idempotency prevents duplicate semantic commits.
- Raw ingestion does not automatically create new InvestmentTheme or ThemeGroup.
- Review does not bypass Writer authority.

---

## 17. Runtime Data

Canonical KnowledgeBase instance data remains runtime data.

Default conceptual location:

```text
runtime-data/
└── knowledge-bases/
```

Workspace files are non-canonical Agent/application files.

Conceptual direction:

```text
workspace/
├── uploads/
├── downloads/
├── scratch/
└── exports/
```

Canonical Knowledge storage and general Agent workspace must remain distinct.

---

## 18. Directory Direction

Current high-level architecture direction:

```text
ResearchHub_Lite/
├── app/
│   ├── pi/
│   └── services/
├── workflows/
├── skills/
├── plugins/
├── knowledge/
├── workspace/
├── runtime-data/
├── .pi/
├── docs/
└── tests/
```

Only implemented/needed directories should be created.

Do not restore the old `dsh/`, `capabilities/`, `providers/`, `planner/`, or generic `agents/` architecture.

---

## 19. Pi Skills vs ResearchHub Skills

The terms are distinct:

```text
.pi/skills/
= Pi Host / Agent Skills

skills/
= ResearchHub semantic research Skills
```

A Pi Skill may improve free-form Agent capability.

A Pi Skill does not gain canonical Knowledge mutation authority.

---

## 20. Personal Research v1 Company Research Slice

The first additional Knowledge Producer is the bounded A-share `research_company` path described in [`PERSONAL_RESEARCH_V1_ARCHITECTURE.md`](../architecture/PERSONAL_RESEARCH_V1_ARCHITECTURE.md). It uses an explicit Schema 0.4 / Storage 1 fresh-KB lane, preserves the v0.3 path, and keeps Report, ResearchSignal, Source, and canonical Knowledge as separate boundaries. Company Research enters the producer-neutral Knowledge Production Gateway; the Gateway performs canonical binding, Knowledge State Diff, bounded semantic resolution policy, ChangeSet planning/validation, and dispatches only through the shared Writer authority.

## 21. Current Non-Goals / Deferred Architecture

Unless separately approved, do not introduce:

- DSH / DeepSeek Harness;
- generic Agent Runtime abstraction;
- Agent-host portability framework;
- multi-agent orchestration;
- Capability layer;
- Provider layer;
- Planner layer;
- generic Workflow Engine;
- Graph DB;
- Vector DB;
- RAG;
- automatic Knowledge schema migration;
- legacy Knowledge v0.2 compatibility;
- multi-user permission system;
- distributed job infrastructure.

Frontend development is no longer categorically excluded from the product direction, but the frontend framework and transport architecture remain unfrozen until Application Services and product contracts justify a choice.

---

## 21. Current Architecture Principle

The current top-level principle is:

> **Pi owns the user-facing Agent experience; ResearchHub owns deterministic research production and canonical Knowledge authority.**
