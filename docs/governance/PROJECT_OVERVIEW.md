# ResearchHub_Lite — Project Overview

## 1. Project Positioning

ResearchHub_Lite is a lightweight research knowledge application focused on transforming raw research material into durable, canonical investment knowledge.

The project is intentionally narrower than the original ResearchHub.

The original repository proved a full Knowledge v0.3 ingestion and persistence pipeline, but accumulated additional runtime, orchestration, compatibility, and product concerns. ResearchHub_Lite separates the valuable Knowledge assets from that surrounding complexity.

## 2. v0.1 Product Goal

ResearchHub_Lite v0.1 has exactly two primary product goals:

### Goal A — Raw Document → Canonical Knowledge Base

A user or application provides a research document.

The system must:

1. resolve and archive the raw material;
2. parse it into a structured document;
3. understand the report and plan semantic extraction;
4. extract candidate knowledge;
5. validate and consolidate candidates;
6. retrieve relevant existing knowledge;
7. reconcile new and existing knowledge;
8. create one semantic ChangeSet;
9. validate that ChangeSet and the staged next state;
10. atomically write the Knowledge Base;
11. reload and verify the committed result.

### Goal B — Knowledge Architecture

The project must maintain a portable and deterministic Knowledge domain covering:

- Schema;
- canonical IDs;
- Raw identity and archive;
- Source and provenance;
- Registry;
- canonical loading;
- querying/indexing;
- ChangeSet;
- validation;
- mutation locking;
- atomic persistence;
- ingestion logs;
- revision and idempotency semantics.

## 3. Product Non-Goals

The following are explicitly outside v0.1 scope unless separately approved:

- custom Agent Runtime;
- DSH / DeepSeek Harness runtime;
- ResearchManager;
- Planner layer;
- Capability layer;
- Provider layer;
- multi-agent orchestration;
- broad equity/company/industry research workflows;
- financial/news/market provider integration;
- frontend application;
- Research Artifact system;
- Memory;
- Evaluation;
- Graph Database;
- Vector Database;
- RAG;
- automatic Knowledge schema migration;
- legacy Knowledge v0.2 compatibility;
- large historical product-validation harnesses.

## 4. Execution Model

ResearchHub_Lite keeps the Workflow / Skill / Plugin logical separation.

### Workflow

Workflow owns execution order, conditional routing, retries, blocking, parallel scheduling, write authorization, and completion.

### Skill

Skill owns professional semantic methodology, such as:

- report understanding;
- semantic decomposition;
- candidate extraction;
- knowledge reconciliation.

### Plugin

Plugin owns external capabilities and host-specific integration, including:

- document parsing;
- filesystem/external I/O;
- reasoning host integration.

### Knowledge Domain

Knowledge is not an execution layer.

It owns deterministic domain rules and persistence integrity.

## 5. Reasoning Host Strategy

Codex is the first active reasoning host.

ResearchHub_Lite must not assume that Codex is permanent.

Workflow and Skill must not import Codex-specific implementation details.

Reasoning-host differences are isolated behind a narrow `ReasoningExecutor` contract.

`ReasoningExecutor` is an Agent Execution abstraction, not an HTTP model API abstraction.

A host implementation may use:

- an authenticated coding agent;
- CLI execution;
- an SDK;
- an app server;
- another programmatically invokable agent surface;
- a direct model API only if explicitly chosen later.

## 6. Initial Knowledge Baseline

ResearchHub_Lite starts from:

- Knowledge Schema: `0.3`
- Storage Format: `1`

This baseline comes from the accepted Knowledge v0.3 work in the original ResearchHub.

ResearchHub_Lite does not initially carry historical schema migration requirements.

## 7. Runtime Data Boundary

Knowledge Base instance data is runtime data.

It must be separated from source code.

Conceptual default:

```text
runtime-data/
└── knowledge-bases/
```

Runtime Knowledge Base data should be Git-ignored by default.

## 8. Source Baseline

Initial migration reference:

- Original repository: `https://github.com/rzpeuler/ResearchHub`
- Baseline commit: `4c141172d6ba4123e909f0d8b9481072912e3ef2`

The migration policy is selective reuse, not repository cloning.
