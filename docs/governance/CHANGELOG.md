# ResearchHub_Lite Changelog

## 2026-09-07

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
