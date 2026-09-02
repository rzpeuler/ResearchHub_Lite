# ResearchHub_Lite — Architecture

## 1. Architecture Status

Status: **Frozen for Lite v0.1 implementation**

This document defines the current architectural boundary of ResearchHub_Lite.

## 2. System Model

```text
User / Application
        |
        v
+------------------------------+
| Workflow                     |
| deterministic control plane  |
+---------------+--------------+
                |
       +--------+---------+
       |                  |
       v                  v
+-------------+      +-------------+
| Skill       |      | Plugin      |
| semantics   |      | integration |
+------+------+      +------+------+
       |                    |
       v                    |
ReasoningExecutor            |
       |                    |
       v                    |
Codex / Future Host          |
       |                    |
       +----------+---------+
                  |
                  v
        +-------------------+
        | Knowledge Domain  |
        | deterministic     |
        +---------+---------+
                  |
                  v
        Knowledge Base Data
```

## 3. Workflow Boundary

Workflow is the deterministic control plane.

Workflow owns:

- node sequence;
- conditional edges;
- bounded retry;
- validation gates;
- blocked states;
- extraction concurrency limits;
- consolidation barrier;
- ChangeSet lifecycle;
- write authorization;
- reload/verification;
- terminal status.

The reasoning host must not choose arbitrary Workflow nodes.

The reasoning host must not bypass validation or write gates.

## 4. Skill Boundary

Skill owns professional semantic methodology.

For Lite v0.1, the principal Skill is Knowledge Curation.

The Skill may perform or define:

- report understanding;
- semantic topic mapping;
- extraction-unit planning proposals;
- entity/relation/claim extraction;
- reconciliation;
- semantic repair after deterministic rejection.

A Skill must not:

- directly mutate the Knowledge Base;
- allocate canonical Knowledge IDs;
- select arbitrary Workflow transitions;
- import Codex-specific libraries.

## 5. Plugin Boundary

Plugin owns external capability integration.

Initial Plugin families:

### Document Plugin

Responsible for:

- input resolution;
- document parsing;
- Docling integration;
- conversion into the canonical StructuredDocument contract.

### Reasoning Plugin

Responsible for implementing the runtime-neutral `ReasoningExecutor` contract.

Current first implementation:

```text
plugins/reasoning/codex/
```

Future implementations may target other coding/reasoning agents.

Codex-specific dependencies must not leak into Workflow, Skill, or Knowledge Domain code.

## 6. ReasoningExecutor

Conceptual contract:

```text
ReasoningExecutor
├── capabilities()
└── execute()
```

Minimum capability information:

- `maxContextTokens`
- `maxOutputTokens`
- `structuredOutputSupport`
- `maxConcurrency`

The contract describes executable reasoning capability.

It does not require direct model HTTP APIs.

## 7. Knowledge Domain

Knowledge Domain owns deterministic data integrity.

Initial conceptual subdomains:

```text
knowledge/
├── schema/
├── raw/
├── storage/
├── registry/
├── query/
├── provenance/
├── changeset/
├── validation/
└── writer/
```

Responsibilities include:

- Schema 0.3 canonical model;
- Raw identity;
- Raw archive;
- Source/provenance;
- canonical hash;
- Manifest;
- Registry;
- canonical loader;
- querying/indexing;
- ID allocation;
- ChangeSet;
- staged/full-state validation;
- mutation lock;
- atomic root transaction;
- writer;
- replay/idempotency;
- final reload verification.

## 8. Runtime Data

Final Knowledge Base instance data must not live under source-code directories.

Conceptual location:

```text
runtime-data/
└── knowledge-bases/
```

The code that operates on a Knowledge Base belongs to the Knowledge Domain.

The actual Knowledge Base instance is runtime data.

## 9. Structured Document Model

The previous chunk-driven reasoning model is retired.

The new canonical document model is:

```text
StructuredDocument
├── metadata
├── sections[]
└── blocks[]
```

A Block is the minimum stable provenance anchor.

Expected Block categories include:

- heading;
- paragraph;
- table;
- list;
- caption.

A Section is a document-structure unit.

An ExtractionUnit is a semantic reasoning context.

These are intentionally decoupled.

## 10. Extraction Planning Architecture

There is one extraction path.

```text
StructuredDocument
        ↓
Understand + Plan
        ↓
ReportMap + ExtractionPlanProposal
        ↓
Deterministic Plan Validation
        ↓
Accepted ExtractionPlan
        ↓
One or more ExtractionUnits
```

There is no fixed page-count routing and no mandatory fixed batching.

One accepted Unit naturally means whole-document extraction.

Multiple Units naturally mean segmented extraction.

Unit count and semantic grouping may be proposed by the reasoning system.

Deterministic code owns whether the proposal is admissible.

## 11. Parallelism

ExtractionUnits may execute with bounded parallelism.

Every Unit is read-only.

Every Unit uses local candidate IDs.

No Unit may:

- allocate canonical IDs;
- mutate the Knowledge Base;
- create its own committed ChangeSet.

All required Units meet at a consolidation barrier.

Exactly one semantic ChangeSet is produced per ingestion execution.

Exactly one atomic Writer commit is permitted.

## 12. Knowledge Safety Invariants

The following are non-negotiable:

- Knowledge provenance follows `Knowledge → Source → Raw`.
- Final semantic write requires a validated ChangeSet.
- Updates require stale-target protection.
- Writes require revision protection.
- Writer uses staged next state before commit.
- Staged state must pass full validation.
- Mutation is atomic.
- Replay/idempotency must prevent duplicate semantic commits.
- Canonical ID allocation is deterministic infrastructure, not LLM behavior.

## 13. Portability Rule

ResearchHub_Lite portability is achieved by keeping host-specific behavior behind narrow plugin seams.

The target is not zero adaptation.

The target is:

> Workflow, Skill methodology, Knowledge Schema, validation, storage, and Writer remain unchanged when the reasoning host changes.

Only the Reasoning Plugin should normally require replacement.
