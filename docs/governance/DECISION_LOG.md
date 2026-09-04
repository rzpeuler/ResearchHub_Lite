# ResearchHub_Lite — Decision Log

This log records only architecture/product decisions that materially constrain future engineering.

---

## Temporary Reasoning Runtime Policy — 2026-09-04

ResearchHub_Lite currently requests the Codex host configuration:

- Model: `gpt-5.6-luna`
- Reasoning effort: `high`

This is a temporary host-specific runtime policy. It is not a frozen Knowledge architecture dependency and must not be copied into Workflow, Knowledge Resolution, Knowledge Schema, or Skill semantic contracts. Future model or reasoning-host changes remain supported through `CodexReasoningExecutor` options and the runtime-neutral `ReasoningExecutor` boundary.

The policy is passed explicitly on each Codex CLI invocation rather than inherited from `config.toml`.

---

## RHL-ADR-001 — No Custom Agent Runtime

**Status:** Accepted

Codex is the current execution/reasoning host.

ResearchHub_Lite does not build or migrate a custom Agent Runtime.

---

## RHL-ADR-002 — Lite v0.1 Scope

**Status:** Accepted

Lite v0.1 is limited to:

1. Raw Document → Canonical Knowledge Base ingestion.
2. Knowledge architecture and storage integrity.

Broader research product capabilities are outside current scope.

---

## RHL-ADR-003 — Workflow Is the Deterministic Control Plane

**Status:** Accepted

Workflow owns node ordering, routing, retries, blocked states, parallel scheduling, validation gates, write authorization, and completion.

The active reasoning host does not control arbitrary Workflow transitions.

---

## RHL-ADR-004 — Skill Owns Professional Semantic Methodology

**Status:** Accepted

Skill owns semantic reasoning methods such as report understanding, semantic decomposition, extraction, and reconciliation.

Skill does not own canonical persistence.

---

## RHL-ADR-005 — Plugin Owns External and Host Integration

**Status:** Accepted

External capabilities and reasoning-host-specific integration belong behind Plugin boundaries.

---

## RHL-ADR-006 — ReasoningExecutor Is an Agent Execution Abstraction

**Status:** Accepted

`ReasoningExecutor` is not defined as an LLM HTTP API wrapper.

It represents a programmatically invokable reasoning host.

---

## RHL-ADR-007 — Agent Portability Through ReasoningExecutor

**Status:** Accepted

Workflow and Skill remain host-neutral.

Codex-specific code is isolated behind a ReasoningExecutor implementation.

Future reasoning hosts should normally require only a replacement Plugin implementation.

---

## RHL-ADR-008 — Knowledge Is a Domain, Not an Execution Layer

**Status:** Accepted

Knowledge schema, validation, storage, Registry, provenance, query, ChangeSet, and Writer form deterministic domain/infrastructure code.

They are not a fourth Agent execution layer.

---

## RHL-ADR-009 — Schema 0.3 / Storage Format 1 Baseline

**Status:** Accepted

ResearchHub_Lite starts directly from Knowledge Schema 0.3 and Storage Format 1.

Legacy v0.2 compatibility and migration are excluded from initial scope.

---

## RHL-ADR-010 — Retire Fixed Chunk/Batch Extraction

**Status:** Accepted

The old `chunk → fixed batch → extraction` Workflow is retired.

Block remains useful as a provenance anchor, but does not determine reasoning-unit boundaries.

---

## RHL-ADR-011 — StructuredDocument and ExtractionUnit Are Independent

**Status:** Accepted

Section/Block represent document structure and provenance.

ExtractionUnit represents a semantic reasoning context.

ExtractionUnits may cross Section boundaries and may overlap by reference.

---

## RHL-ADR-012 — Understand + Plan Is a Semantic Operation

**Status:** Accepted

The reasoning system may jointly produce:

- `ReportMap`
- `ExtractionPlanProposal`

This is an explicitly authorized semantic decision point.

---

## RHL-ADR-013 — LLM Proposes; Deterministic Code Admits

**Status:** Accepted

The reasoning system may propose Unit count and semantic boundaries.

Deterministic code validates:

- reference existence;
- context/output budgets;
- hard Unit/concurrency limits;
- plan structure;
- execution admissibility.

Invalid but repairable plans may undergo bounded semantic repair.

---

## RHL-ADR-014 — Bounded Parallel Extraction

**Status:** Accepted

Multiple ExtractionUnits may execute in parallel under a configured concurrency limit.

Units are read-only and use only local candidate IDs.

---

## RHL-ADR-015 — One Semantic ChangeSet / One Atomic Commit

**Status:** Accepted

Each ingestion execution produces at most one semantic ChangeSet and one atomic Writer commit.

Extraction Units must never independently mutate the Knowledge Base.

---

## RHL-ADR-016 — Original Ingestion Workflow Is Reference-Only

**Status:** Accepted

The original ResearchHub monolithic ingestion `workflow.ts` is not ported wholesale.

It remains a reference for previously validated invariants such as:

- bounded retry;
- candidate isolation;
- canonical resolution discipline;
- ChangeSet safety;
- Writer exactly-once behavior;
- idempotency/replay;
- reload/full validation;
- provenance integrity.

---

## RHL-ADR-017 — Selective Migration, Not Repository Clone

**Status:** Accepted

ResearchHub_Lite selectively reuses proven assets.

Legacy runtime, compatibility, migration, and unrelated product layers must not be copied merely to satisfy old imports.

---

## RHL-ADR-018 — Knowledge Resolution Replaces Full-Set Reconciliation

**Status:** Implementation complete; CTO acceptance pending

After Candidate consolidation, deterministic infrastructure owns canonical Entity Binding, Knowledge Diff, Candidate graph reference resolution, ResolutionIntent generation, and the ResolutionIntent barrier. Reasoning may be invoked only for a bounded `EntityBindingCase`, `RelationConflictCase`, or `ClaimConflictCase` through `resolveSemanticCase`.

Reasoning receives case-local existing aliases rather than durable canonical IDs and never returns mutation actions. ChangeSet planning consumes only infrastructure-owned `ResolutionIntent` values. The historical R1/R2/R3 validation evidence remains immutable, and real R4 validation is deferred until independent CTO acceptance.

## RHL-ADR-019 — Knowledge Resolution Case Contract Hardening

**Status: Implementation complete; CTO acceptance pending**

Semantic Resolution Cases use deterministic excerpts from the already-parsed StructuredDocument and bounded incoming/existing Source metadata. Entity plausible retrieval computes complete membership before applying `maxEntityBindingCandidates`; overflow is isolated to Review. `semanticCaseCount` is independent from retry `semanticCaseCalls`, and model output rejects embedded durable canonical and RawRef tokens recursively. The mixed fresh-KB Entity/Relation/Claim regression remains zero-call and zero-Review; Schema 0.3 and Writer remain unchanged.
