# ResearchHub Lite Production Baseline v1

**Status:** ESTABLISHED / CTO decision

**Established:** 2026-09-08

ResearchHub Lite Production Baseline v1 is the accepted compositional Production baseline. It records the independently accepted Provider, Application, Knowledge Production, persistence, read-model, and security contracts that jointly establish the current product state.

This baseline is not a claim that one single monolithic full Production E2E was rerun on the final repository commit. The accepted validation chain consists of separate authoritative tasks, with their historical evidence and limitations preserved.

## 1. Baseline Status

Production Baseline v1 is **ESTABLISHED**. The Production stabilization phase is closed. The next phase is Knowledge Production / Knowledge Architecture iteration.

## 2. Repository Baseline

- Product implementation baseline: `5319d130952f4c784f5829890591b64dcd5f72a4`
- Accepted pre-freeze repository/governance baseline: `3d6f0212b7500b11d806b444dadbf550af1e80de`
- Freeze decision commit: `0697dee129b539857b9104ffffef85693a4382e5`
- The freeze task changes governance documentation only.

## 3. Product Implementation Baseline

Baseline v1 includes the Pi-hosted local Application Runtime, React + TypeScript + Vite client, HTTP JSON + SSE transport, Attachment/Production boundary, Raw Document Knowledge Ingestion Workflow, Schema 0.3 / Storage Format 1 Knowledge Core, deterministic Writer path, read-only Knowledge/Graph/Review APIs, and durable ReviewCase persistence/replay behavior.

## 4. Architecture Scope

The freeze adopts the existing frozen architecture and does not amend it.

- Pi Coding Agent is the canonical application host.
- Pi ModelRuntime owns provider, model, authentication, OAuth, catalog, and thinking authority.
- Workflow owns deterministic execution control, routing, lifecycle, validation, and Writer entry.
- Skill owns professional semantic methodology.
- Plugin owns external capability and host-specific integration.
- Knowledge owns canonical integrity and persistence.
- The Runtime embeds Pi directly in one local Node process and binds to loopback by default.
- The browser uses shared Application Services through HTTP JSON + SSE and does not access filesystem, canonical Knowledge storage, or Writer directly.

## 5. Production Capability Matrix

| Capability | Baseline status | Authority / boundary |
|---|---|---|
| Application host | Accepted | Pi Coding Agent / Pi ModelRuntime |
| Primary Production reasoning | Accepted | `PiReasoningExecutor` → Pi ModelRuntime |
| Primary provider | Accepted | `zhipu-openapi/glm-5.3-flash` |
| Secondary provider | Verified | Pi-native `openai-codex` |
| Knowledge Production | Accepted | ProductionService → Workflow → Validation → Writer |
| Canonical Knowledge | Accepted | Schema 0.3 / Storage Format 1 |
| Raw Archive | Persistent authority | Knowledge storage |
| ReviewCase | Persistent authority | Review store/log and Review API |
| Knowledge API | Read-only accepted | search / object / directory |
| Graph | Read-only accepted | bounded canonical projection |
| Review surface | Phase 1 read-only accepted | list / detail; no ReviewDecision mutation |
| Runtime restart | PASS / CLOSED | fresh Runtime B cold reads same persistent roots |

## 6. Accepted Validation Chain

The following records form the accepted chain:

- `RHL-CONFIGURE-PI-MULTI-PROVIDER-001` — PASS / CLOSED
- `RHL-DIAGNOSE-PRODUCTION-WORKFLOW-FAILURE-001` — PASS / CLOSED
- `RHL-FIX-ATTACHMENT-PRODUCTION-PATH-BOUNDARY-001` — PASS / CLOSED
- `RHL-FIX-REVIEW-TERMINAL-CASE-INVARIANT-001` — PASS / CLOSED
- `RHL-VALIDATE-RUNTIME-RESTART-PERSISTENCE-001` — PASS / CLOSED
- `RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-003` — `VALIDATION_HARNESS_DEFECT / CTO reviewed`

RERUN-003's real Production Application stages through browser smoke succeeded, but its replay remained in the same Runtime and executed a second Production workflow. It demonstrated duplicate-ingestion canonical stability, not Runtime restart persistence, and is not promoted to PASS.

`RHL-VALIDATE-RESTART-REVIEW-PERSISTENCE-001` remains `PRODUCT_DEFECT / CTO reviewed`. Its historical evidence is immutable. The later terminal-case fix and the separate Runtime restart validation must not be conflated with that historical run.

## 7. Persistence Authority

Raw Archive, Canonical Knowledge, and durable ReviewCase are authoritative persistent state. Pi session infrastructure remains authoritative for Pi conversation persistence. Runtime memory is not canonical authority. Generic in-flight WorkflowRun recovery is not included in Baseline v1.

The accepted restart contract is:

```text
Runtime A close
    → new Runtime B
    → same persistent Knowledge/workspace roots
    → cold reads succeed
    → canonical revision and persisted projections remain unchanged
```

## 8. Security Boundaries

Baseline v1 retains the frozen local security boundaries:

- loopback-only Runtime binding;
- Host/Origin validation and runtime nonce/token protection for mutation APIs;
- controlled workspace attachment IDs and validated workspace-relative references;
- canonical Knowledge exclusion from attachment paths and static serving;
- bounded safe Knowledge, Graph, Review, and conversation projections;
- no browser exposure of credentials, prompts, raw model output, hidden reasoning, raw stacks, or unrestricted internal payloads.

## 9. Known Non-Goals

Baseline v1 does not include:

- ReviewDecision or Review mutation/execution;
- automated Curation execution;
- Theme creation Workflow;
- Graph mutation;
- multi-user collaboration or enterprise authorization;
- cloud, distributed, or multi-process Runtime architecture;
- automatic provider failover;
- generalized Agent, Capability, or Provider framework;
- a single monolithic full Production E2E claim.

## 10. Historical Validation Notes

Historical raw validation evidence remains immutable. RERUN-001 and RERUN-002 retain their reviewed harness classifications. RERUN-003 retains its reviewed harness classification because its restart/replay stage was not a real Runtime restart. The prior restart-review task retains its Product defect interpretation because the Review terminal/list inconsistency stopped it before Runtime B. The terminal-case fix and Runtime restart persistence validation are separate accepted records.

## 11. Exit Criteria Achieved

- Primary Provider and verified secondary Pi provider accepted.
- Real Docling 2.116.0 and real Production Application path validated.
- Attachment boundary and canonical Knowledge isolation validated.
- Raw, Canonical, and ReviewCase persistence authority validated.
- Runtime A hard close and fresh Runtime B cold-read persistence validated.
- Read-only Knowledge, Graph, and Review projections validated.
- Offline regression and secret-hygiene evidence recorded.
- Freeze task made no Production implementation changes.

## 12. Next Phase

Continue with:

1. Raw Document → Canonical Knowledge product quality;
2. Knowledge Production Workflow capability;
3. Knowledge Architecture;
4. Knowledge content quality and usability.

Do not automatically continue Production E2E reruns, Provider architecture, Runtime refactors, or validation-harness expansion. Restore those tracks only when a real new defect is identified and separately authorized.
