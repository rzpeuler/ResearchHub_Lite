# ResearchHub_Lite V1 Autonomous Mission State

Updated: 2026-09-15

## Mission

Deliver a locally runnable V1 for personal A-share investment research with a
real public-data research loop, professional reports, evidence-backed
structured Knowledge, provenance, durable change, reload, and subsequent
research reuse.

## Repository checkpoint

- Branch: `main`
- HEAD: `5bb59a4e3b1dee92f76d1c2e95020c2d8209b5f5`
- Remote: `origin/main` at the same commit after Phase 0 synchronization
- Working tree: clean before this state file and the next task
- Phase 0: `ACCEPTED`
- Phase 1: `IN_PROGRESS`
- Phase 3 critical path: `PARTIAL`

## Current Capability Matrix

| Capability | State | Current evidence / gap |
| --- | --- | --- |
| Knowledge durable write, validation, revision | IMPLEMENTED_AND_VERIFIED | v0.4 Gateway, ChangeSet, Writer, stale revision/hash guards, and replay tests pass. |
| Raw/Source provenance | IMPLEMENTED_AND_VERIFIED | Content-derived Raw identity, Source-to-Raw links, rights/provenance validation, and ingestion tests pass. |
| Reload/restart/ReviewCase persistence | IMPLEMENTED_AND_VERIFIED | Runtime and storage tests cover reload and durable ReviewCase state. |
| Exact replay/idempotency | IMPLEMENTED_AND_VERIFIED | Ingestion and Industry replay tests preserve identity and avoid duplicate revisions. |
| Company Research | IMPLEMENTED_AND_VERIFIED | Company workflow, report, evidence, Gateway path, and accepted real-Pi evidence exist. |
| Earnings Review | IMPLEMENTED_AND_VERIFIED | Deterministic and real-Pi gate evidence exists, including report and replay. |
| Valuation | IMPLEMENTED_AND_VERIFIED | Deterministic calculation, scenarios, report, persistence, and route tests exist. One runtime timing test is tracked separately. |
| Event Research | IMPLEMENTED_AND_VERIFIED | Direct/second-order impact, report, Gateway/Writer, and real-Pi evidence exist. |
| Thesis Red Team | IMPLEMENTED_AND_VERIFIED | Stage A/B, invalidation, evidence binding, report, and real-Pi evidence exist. |
| Industry eight-module deterministic loop | IMPLEMENTED_AND_VERIFIED | Eight modules, bounded Wave 2, one Gateway/Writer, sixteen sections, graph and replay tests pass. |
| Industry real product-quality E2E | PARTIAL | TEST-054 is blocked at mandatory Industry Definition evidence routing despite successful Docling/MIIT normalization. |
| Industry graph projection | IMPLEMENTED_AND_VERIFIED | Existing directory/rooted graph APIs and Industry replay tests pass; full product-quality evidence remains incomplete. |
| Morning/Evening Brief engine | IMPLEMENTED_AND_VERIFIED | Signal acquisition, enrichment, assessment, synthesis, scheduling and deterministic/real-Pi fixture evidence exist. |
| Daily live-provider coverage | BLOCKED_EXTERNAL | Public providers have recorded empty, HTTP 429, and bounded bridge failure outcomes; no fabricated fallback is allowed. |
| Runtime HTTP/SSE/security/attachments | IMPLEMENTED_AND_VERIFIED | Bootstrap, loopback/origin/token controls, SSE, upload, cancellation and product route tests pass. |
| Managed Docling parser | IMPLEMENTED_AND_VERIFIED | Preflight is `READY`; MIIT PDF fetch/normalization smoke was accepted. |
| Unified Continuous Research maintenance | DESIGN_ONLY | No bounded cross-workflow maintenance state/refresh path is implemented yet. |
| First-class research UI | PARTIAL | Conversation, upload, graph, review and polling exist; direct research launch/report browsing is limited. |
| Review decision execution | DESIGN_ONLY | Review access is read-only; decision mutation remains intentionally absent. |
| Legacy Web-Chat2Codex control plane | DEPRECATED | Phase 0 removed `.web-chat2codex/**` and `docs/governance/**`; product Codex/Pi integration remains. |

## Task queue

| ID | Phase | Status | Goal / acceptance |
| --- | --- | --- | --- |
| RHL-P0-CLEANUP | 0 | ACCEPTED | Remove legacy control-plane assets, preserve product behavior, and pass post-cleanup checks. Commit `5bb59a4`. |
| RHL-P1-REALITY | 1 | ACCEPTED | Establish this matrix and backlog from current source, tests, reports, and live evidence. |
| RHL-P3-INDUSTRY-ROUTING | 3 | READY | Route authoritative MIIT PCB anchors to `industry_definition`, preserve Wave-2 search terms, and make accepted-evidence telemetry truthful; run focused tests and one fresh TEST-054. |
| RHL-P1-TEST-HEALTH | 1 | READY | Reproduce and resolve the remaining deterministic `VAL-HTTP-001` timing/status test failure without changing valuation semantics. |
| RHL-P2-DOCUMENT-STATUS | 2 | READY | Reconcile stale descriptive status documents with verified source/test reality without rewriting historical evidence. |
| RHL-P2-CONTINUOUS-RESEARCH | 8 | NOT_STARTED | Implement only the bounded maintenance behavior required by the frozen architecture after the primary production loop is stable. |
| RHL-P1-UI-EXPOSURE | 1 | NOT_STARTED | Expose stable core research/report/references through the existing UI only after research and Knowledge acceptance. |
| RHL-P2-REVIEW-DECISIONS | 5 | DEFERRED | Requires an explicit product decision for write-capable Review actions; keep current read-only boundary until then. |

## Acceptance gates

- [x] Phase 0 cleanup accepted and synchronized.
- [x] Typecheck, client typecheck, client build, and full product test suite pass after cleanup (`970/970`, client `21/21`).
- [ ] Industry real public-data E2E completes with mandatory definition evidence, report, canonical Knowledge, reload, and replay.
- [ ] Industry flow is rerun against a second distinct research target for bounded generality.
- [ ] Remaining deterministic test health is clean or explicitly reconciled.
- [ ] Continuous Research state maintenance is implemented and verified.
- [ ] Final external validation requirements are listed and either completed or explicitly deferred.

## Current decision

The next task is the Industry evidence-routing fix. Do not add providers,
relax evidence qualification, create a generic research framework, or treat
historical reports as current acceptance.
