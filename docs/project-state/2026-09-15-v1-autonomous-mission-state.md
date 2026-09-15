# ResearchHub_Lite V1 Autonomous Mission State

Updated: 2026-09-15

## Mission

Deliver a locally runnable V1 for personal A-share investment research with a
real public-data research loop, professional reports, evidence-backed
structured Knowledge, provenance, durable change, reload, and subsequent
research reuse.

## Repository checkpoint

- Branch: `main`
- Latest implementation commit: `eb049e13db85854b8193107cad412a320020f683` (`feat: add governed research run launcher`)
- Remote: `origin/main` synchronized; latest implementation commit is recorded above
- Working tree: clean
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
| Industry alias evidence routing | IMPLEMENTED_AND_VERIFIED | Bounded aliases and compound design search terms now participate in independent fallback routing; focused CPCA tests and fresh TEST-054 runs show CPCA evidence reaching all seven non-definition modules without changing evidence qualification or persistence boundaries. |
| Industry real product-quality E2E | BLOCKED_EXTERNAL_EVIDENCE_DEPTH | Fresh TEST-054 completed two bounded waves, routed MIIT and CPCA evidence into all eight modules, returned all eight modules without `unavailable`, submitted one Gateway/Writer ChangeSet, reloaded canonical Knowledge, and generated the validated 16-section report. The strict product-quality classifier remains blocked by 19 explicit evidence gaps and the need for a second-wave evidence-depth gate; fixtures remain test-only. |
| Industry graph projection | IMPLEMENTED_AND_VERIFIED | Existing directory/rooted graph APIs and Industry replay tests pass; full product-quality evidence remains incomplete. |
| Morning/Evening Brief engine | IMPLEMENTED_AND_VERIFIED | Fresh FIX-003 real-Pi run completed both morning/evening briefs with enrichment, change assessment, synthesis, and Knowledge seed/Gateway context; no secrets or raw bodies were included. |
| Daily live-provider coverage | BLOCKED_EXTERNAL | Public providers have recorded empty, HTTP 429, and bounded bridge failure outcomes; no fabricated fallback is allowed. |
| Runtime HTTP/SSE/security/attachments | IMPLEMENTED_AND_VERIFIED | Bootstrap, loopback/origin/token controls, SSE, upload, cancellation and product route tests pass. |
| Managed Docling parser | IMPLEMENTED_AND_VERIFIED | Preflight is `READY`; MIIT PDF fetch/normalization smoke was accepted. |
| Unified Continuous Research maintenance | PARTIAL_BOUNDED_DAILY_SLICE | Daily materiality/thesis-impact assessment, existing Claim resolution, Gateway projection, and replay/idempotency are implemented and verified; broader cross-workflow maintenance remains open. |
| First-class research UI | PARTIAL_RUN_LAUNCHER | Conversation, upload, graph, review, polling, dedicated Daily Briefs, report catalog, and governed launch forms for six research workflows exist; Review decisions remain read-only. |
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
| RHL-P1-UI-RESEARCH-RUN-LAUNCHER | 1 | ACCEPTED_IMPLEMENTED | Add a governed `/run` surface for the six existing research Workflow endpoints; preserve Runtime token, server validation, and asynchronous polling boundaries. |
| RHL-P2-REVIEW-DECISIONS | 5 | DEFERRED | Requires an explicit product decision for write-capable Review actions; keep current read-only boundary until then. |

## Acceptance gates

- [x] Phase 0 cleanup accepted and synchronized.
- [x] Typecheck, client typecheck, client build, parser preflight, and full product test suite pass after continuous maintenance and UI slices (`979/979`, client `27/27`).
- [ ] Industry strict product-quality evidence gate completes without material evidence gaps. Current TEST-054 completes the eight-module/report/canonical/reload path but remains evidence-depth limited.
- [x] Industry flow is rerun against a second distinct research target for bounded generality.
- [x] Remaining deterministic test health is explicitly reconciled; five consecutive VAL-HTTP-001 runs passed.
- [x] The bounded Daily Continuous Research maintenance slice is implemented and verified; unified cross-workflow maintenance remains open.
- [x] The read-only general Research Report catalog is implemented, validated, committed, and synchronized.
- [x] Final external validation requirements are listed with completed, external-blocked, and explicitly deferred boundaries in `docs/task-reports/2026-09-15-final-external-validation-inventory.md`.

## Current decision

The Industry routing implementation and bounded second-target generality are
accepted. The live Industry workflow now completes all eight module calls and
the canonical/report path with real MIIT and CPCA evidence, but the strict
product-quality gate remains open because the current public portfolio does
not close the recorded evidence gaps. Continue using fixtures only for
deterministic tests; never present placeholders as real evidence or persist
them as production research output.
Do not add providers without a demonstrated source gap, relax evidence
qualification, create a generic research framework, or treat historical
reports as current acceptance.
