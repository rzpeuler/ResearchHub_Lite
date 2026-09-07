# ResearchHub_Lite Changelog

## 2026-09-07

- Corrected the CTO-reviewed classification of `RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-001` to `VALIDATION_HARNESS_DEFECT`: its Free Research oracle incorrectly required a fixed marker in serialized SSE after a valid assistant completion. The old evidence remains immutable; no production defect was established.
- Added the validation-only Free Research oracle and deterministic regression coverage, and prepared independent `RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-002` evidence paths. The corrected oracle validates lifecycle completion, safe normalized SSE, assistant deltas, persisted current-request nonce, and non-empty persisted assistant content without fixed wording.
- Executed `RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-002` against real `zhipu-openapi/glm-5.3-flash`, real Pi ModelRuntime/PiReasoningExecutor, Docling 2.116.0, and a fresh Knowledge Base. Provider preflights, Application boot, Free Research, attachment upload, and the upload-only canonical-boundary check passed. The real Production Workflow then returned terminal status `failed`; the original evidence did not retain enough diagnostics for root-cause classification, so governance is `VALIDATION_HARNESS_DEFECT / CTO reviewed`. No production implementation was modified after the failure and downstream API, Graph, Review, browser smoke, and replay stages were not run.
- Executed `RHL-DIAGNOSE-PRODUCTION-WORKFLOW-FAILURE-001` with a fresh KB and the real Attachment -> `/api/production/ingest` -> `/api/workflows/:runId` path. The terminal error was safely retained as `workspaceFile must remain inside workspaceRoot and outside the canonical Knowledge Base`; path forensics showed the AttachmentService canonical path differed from the ProductionService lexical boundary on Windows. Failure phase is `INPUT_RESOLUTION`, reasoning calls/Raw/log/canonical revision are all zero, and the root cause is classified `PRODUCT_DEFECT / CTO acceptance pending`. No production fix was implemented.

- `RHL-CONFIGURE-PI-MULTI-PROVIDER-001` is now recorded as `PASS / CLOSED` by CTO decision; both configured provider gates remain cleared.

- Executed `RHL-CONFIGURE-PI-MULTI-PROVIDER-001`: configured local Pi `zhipu-openapi/glm-5.3-flash` and Pi-native `openai-codex` OAuth without writing credentials to the repository. Both providers passed the Native Pi and PiReasoningExecutor gates; the multi-provider result is `MULTI_PROVIDER_GATE_CLEARED / CTO acceptance pending`. The full Production Application E2E remains intentionally not run.

- Implemented Knowledge Graph Projection v0.1 and admitted the frozen architecture artifact byte-for-byte.
- Added bounded deterministic Directory and rooted graph read APIs.
- Replaced the `/graph` placeholder with a read-only React Flow + Dagre page with search, filters, depth, focus/re-root, URL state, and canonical Inspector detail.
- Added service, runtime, client, and regression coverage without changing canonical Knowledge mutation authority.

Graph Page v0.1 status: PASS / CLOSED by CTO decision.

- Executed `RHL-VALIDATE-PRODUCTION-E2E-001` with a validation-only harness and fresh-KB/real-Docling preflight.
- Recorded `ENVIRONMENT_BLOCKED` at real Pi provider completion preflight; no production implementation was modified and no faux/mock component was used to claim success.

Production Application E2E status: ENVIRONMENT_BLOCKED / CTO reviewed; rerun requires official Pi-native authorization for the configured real DeepSeek credential.

- Executed `RHL-DIAGNOSE-PI-PROVIDER-ENVIRONMENT-001` without rerunning full E2E. ModelRuntime exposed `deepseek/deepseek-v4-flash`, but the minimal native Pi completion returned sanitized HTTP 401 `authentication_failed`; PiReasoningExecutor was correctly not run above the failed native layer.
- Added diagnosis evidence and corrected the validation harness to preserve sanitized error categories/codes/status instead of blanket-auth attribution. Graph Page and Graph FIX governance are recorded as `PASS / CLOSED` by CTO decision.
