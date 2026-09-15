# ResearchHub_Lite V1 Autonomous Mission State

Updated: 2026-09-15

## Mission

Deliver a locally runnable V1 for personal A-share investment research with a
real public-data research loop, professional reports, evidence-backed
structured Knowledge, provenance, durable change, reload, and subsequent
research reuse.

## Repository checkpoint

- Branch: `main`
- Latest implementation commit: `ebe6a051c34d62763144c3616d1b0aa306e6fe00` (`feat: add read-only research report catalog`)
- Remote: `origin/main` synchronized through the implementation commit; this ledger reconciliation is also being committed
- Working tree: clean after the ledger reconciliation commit
- Phase 0: `ACCEPTED`
- Phase 1: `ACCEPTED`
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
| Valuation | IMPLEMENTED_AND_VERIFIED | Deterministic calculation, scenarios, report, persistence, and route tests exist. Five consecutive VAL-HTTP-001 runs passed; the earlier timing failure was not reproduced. |
| Event Research | IMPLEMENTED_AND_VERIFIED | Direct/second-order impact, report, Gateway/Writer, and real-Pi evidence exist. |
| Thesis Red Team | IMPLEMENTED_AND_VERIFIED | Stage A/B, invalidation, evidence binding, report, and real-Pi evidence exist. |
| Industry eight-module deterministic loop | IMPLEMENTED_AND_VERIFIED | Eight modules, bounded Wave 2, one Gateway/Writer, sixteen sections, graph and replay tests pass. |
| Industry bounded second-target generality | IMPLEMENTED_AND_VERIFIED | Deterministic `AI Server Hardware` validation completed eight modules, one Gateway/Writer submission, canonical reload, and stable no-new-semantic replay. |
| Industry alias evidence routing | IMPLEMENTED_AND_VERIFIED | Bounded aliases and design search terms now participate in fallback routing; focused 44-test workflow suite and a fresh TEST-054 rerun passed without changing evidence qualification or persistence boundaries. |
| Industry real product-quality E2E | BLOCKED_EXTERNAL | Fresh TEST-054 completed two waves, routed MIIT definition evidence plus one CPCA item into each of the other seven modules, executed all eight modules, submitted Gateway/Writer, reloaded canonical Knowledge, and generated the 16-section report; evidence depth remained insufficient for product-quality acceptance. The user explicitly deferred this live-data gate for now; fixtures remain test-only. |
| Industry graph projection | IMPLEMENTED_AND_VERIFIED | Existing directory/rooted graph APIs and Industry replay tests pass; full product-quality evidence remains incomplete. |
| Morning/Evening Brief engine | IMPLEMENTED_AND_VERIFIED | Fresh FIX-003 real-Pi run completed both morning/evening briefs with enrichment, change assessment, synthesis, and Knowledge seed/Gateway context; no secrets or raw bodies were included. |
| Daily live-provider coverage | BLOCKED_EXTERNAL | Public providers have recorded empty, HTTP 429, and bounded bridge failure outcomes; no fabricated fallback is allowed. |
| Runtime HTTP/SSE/security/attachments | IMPLEMENTED_AND_VERIFIED | Bootstrap, loopback/origin/token controls, SSE, upload, cancellation and product route tests pass. |
| Managed Docling parser | IMPLEMENTED_AND_VERIFIED | Preflight is `READY`; MIIT PDF fetch/normalization smoke was accepted. |
| Unified Continuous Research maintenance | PARTIAL_BOUNDED_DAILY_SLICE | Daily materiality/thesis-impact assessment, existing Claim resolution, Gateway projection, and replay/idempotency are implemented and verified; broader cross-workflow maintenance remains open. |
| First-class research UI | PARTIAL_REPORT_CATALOG | Conversation, upload, graph, review, polling, dedicated Daily Briefs, and a read-only general Research Report catalog exist; direct launch forms remain limited. |
| Review decision execution | DESIGN_ONLY | Review access is read-only; decision mutation remains intentionally absent. |
| Legacy Web-Chat2Codex control plane | DEPRECATED | Phase 0 removed `.web-chat2codex/**` and `docs/governance/**`; product Codex/Pi integration remains. |

## Task queue

| ID | Phase | Status | Goal / acceptance |
| --- | --- | --- | --- |
| RHL-P0-CLEANUP | 0 | ACCEPTED | Remove legacy control-plane assets, preserve product behavior, and pass post-cleanup checks. Commit `5bb59a4`. |
| RHL-P1-REALITY | 1 | ACCEPTED | Establish this matrix and backlog from current source, tests, reports, and live evidence. |
| RHL-P3-INDUSTRY-ROUTING | 3 | ACCEPTED_IMPLEMENTATION_PARTIAL_PRODUCT | Route authoritative MIIT PCB anchors to `industry_definition`, preserve Wave-2 search terms, make accepted-evidence telemetry truthful, and record fresh TEST-054. Commit `852162e`; the product-quality gate remains open for seven-module evidence coverage. |
| RHL-P3-INDUSTRY-GENERALITY | 3 | ACCEPTED_BOUNDED | Rerun the Industry flow against `AI Server Hardware`; eight modules, one Gateway/Writer submission, canonical reload, and stable no-new-semantic replay passed. |
| RHL-P3-INDUSTRY-ALIAS-ROUTING | 3 | ACCEPTED | Include bounded target aliases in Industry evidence routing; focused regression and fresh TEST-054 rerun passed, while the live seven-module evidence gap remains. |
| RHL-P1-TEST-HEALTH | 1 | ACCEPTED_RECONCILED | Five consecutive `VAL-HTTP-001` runs passed; no valuation semantic change was made and the prior timing failure was not reproduced. |
| RHL-P2-DOCUMENT-STATUS | 2 | ACCEPTED | Reconcile current entry documents with verified source/test reality while preserving historical architecture and task-report evidence. |
| RHL-P2-CONTINUOUS-RESEARCH | 8 | ACCEPTED_BOUNDED_DAILY_SLICE | Implement and verify the bounded Daily maintenance path through existing Claim projection, Gateway/Writer, reload, and replay; broader unified maintenance remains open. |
| RHL-P1-UI-EXPOSURE | 1 | ACCEPTED_DAILY_BRIEF_READER | Expose the existing bounded Daily Brief list/detail API as a read-only UI route; general report catalog and direct launch forms remain open. |
| RHL-P1-UI-REPORT-CATALOG | 1 | ACCEPTED_IMPLEMENTED | Add a read-only general report list/detail route over existing persisted Research Reports without adding workflow launch forms or mutation paths. |
| RHL-P2-REVIEW-DECISIONS | 5 | DEFERRED | Requires an explicit product decision for write-capable Review actions; keep current read-only boundary until then. |

## Acceptance gates

- [x] Phase 0 cleanup accepted and synchronized.
- [x] Typecheck, client typecheck, client build, parser preflight, and full product test suite pass after continuous maintenance (`977/977`, client `23/23`).
- [ ] Industry real public-data E2E completes with eight-module evidence coverage, report, canonical Knowledge, reload, and replay. Current TEST-054 completed the persistence/report path but is evidence-limited.
- [x] Industry flow is rerun against a second distinct research target for bounded generality.
- [x] Remaining deterministic test health is explicitly reconciled; five consecutive VAL-HTTP-001 runs passed.
- [x] The bounded Daily Continuous Research maintenance slice is implemented and verified; unified cross-workflow maintenance remains open.
- [x] The read-only general Research Report catalog is implemented, validated, committed, and synchronized.
- [x] Final external validation requirements are listed with completed, external-blocked, and explicitly deferred boundaries in `docs/task-reports/2026-09-15-final-external-validation-inventory.md`.

## Current decision

The Industry routing implementation and bounded second-target generality are
accepted. The live Industry product-quality gate is explicitly deferred by
the user for now because no additional stable source is available. Continue
using fixtures only for deterministic tests; never present placeholders as
real evidence or persist them as production research output.
Do not add providers without a demonstrated source gap, relax evidence
qualification, create a generic research framework, or treat historical
reports as current acceptance.
