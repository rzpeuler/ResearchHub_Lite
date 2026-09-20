# EXPECTATION-SOURCE-001C-ENV-001 — Parser and Financial Source Unblock

Status: `BLOCKED / EXTERNAL_SOURCE_BLOCKED`

Baseline: `455bfacdb72e6ac06ffb0a13ca66a5f27f1e9f0d` from `origin/codex/expectation-source-001c-fix-001-evidence-e2e-unblock`.

## Result

The parser setup is now governed by a real CPU-only Torch install attempt. Its dependency probe requires Docling `2.116.0`, `torch`, and `torchvision`; `systemSitePackages` remains disabled; and the bridge smoke remains the final readiness authority. Install telemetry stores a bounded, sanitized failure reason.

The fresh standard Docling install experiment stalled during dependency resolution. The official CPU PyTorch index then failed with repeated `SSLEOFError` / `UNEXPECTED_EOF_WHILE_READING` responses. A bounded `trusted-host` retry reproduced the same failure. No CUDA, GPU, ROCm, or synthetic parser success was introduced. `npm run document-parser:setup` therefore stopped before promotion, and the subsequent read-only check reported `MANAGED_PYTHON_MISSING`.

AKShare `1.18.64` diagnostics showed the old `stock_financial_analysis_indicator` call returning zero rows for both `600519` and `300750`, classified as `TRUE_UPSTREAM_EMPTY`. The alternative `stock_financial_analysis_indicator_em` succeeded with `600519.SH` and `300750.SZ`, returned 2026-H1 rows, and supplied usable revenue, net profit, gross margin, and EPS fields after a narrow ASCII-alias mapping. The adapter now uses that verified Eastmoney endpoint and exchange suffix; it does not fall back to fabricated or stale data.

Other relevant Eastmoney statement APIs were probed but returned a provider-side float/schema `TypeError` in this environment. They were not selected because the indicator endpoint already produced sufficient exact-period data.

## Validation

- Parser contract and failure/telemetry tests: `38/38` passed.
- AKShare adapter plus parser focused tests: `41/41` passed.
- Real adapter diagnostic: both symbols normalized to usable exact `2026-H1` rows.
- Full 001C real E2E was not rerun because the managed parser could not reach READY.
- No valuation arithmetic, expectation methodology, Thesis state, Knowledge schema, or canonical mutation was changed.

Evidence: `docs/project-state/evidence/2026-09-21-expectation-source-001c-env-001.json`.
