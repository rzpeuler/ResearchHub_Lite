# EXPECTATION-SOURCE-001C-ENV-001 — Parser and Financial Source Unblock

Status: `IMPLEMENTED / SOL ACCEPTANCE PENDING`

Baseline: `455bfacdb72e6ac06ffb0a13ca66a5f27f1e9f0d` from `origin/codex/expectation-source-001c-fix-001-evidence-e2e-unblock`.

## Result

The parser setup is now reproducible on this Windows host. Its dependency probe requires Docling `2.116.0`, `torch`, and `torchvision`; `systemSitePackages` remains disabled; and the bridge smoke remains the final readiness authority. Install telemetry stores a bounded, sanitized failure reason. The setup detects the configured local SOCKS5 proxy, bootstraps `PySocks==1.7.1`, installs exact official CPU wheels (`torch==2.14.0+cpu`, `torchvision==0.29.0+cpu`) from the official CPU index, installs Docling requirements from PyPI, and uses a short temporary staging path to avoid Windows Long Path extraction failures.

Initial direct and HTTP-proxy experiments reproduced official-index TLS/EOF failures. The final bounded setup path recovered through the detected SOCKS5 proxy and completed promotion. `npm run document-parser:check` returned `READY` with Docling `2.116.0`, Torch `2.14.0+cpu`, torchvision `0.29.0+cpu`, CUDA unavailable, CPU-only true, and bridge smoke passing. No CUDA, GPU, ROCm, or synthetic parser success was introduced.

The exact 001C real acceptance completed against the freshly created managed environment: primary 600519 Workflow completed with 14 sections, 22 estimate revisions, 22 valuation impacts, valuation refresh required, 22 critical Thesis dependency findings, PIT determinism, replay, and degradation checks all passed. This proves the production path and AKShare fix end to end.

AKShare `1.18.64` diagnostics showed the old `stock_financial_analysis_indicator` call returning zero rows for both `600519` and `300750`, classified as `TRUE_UPSTREAM_EMPTY`. The alternative `stock_financial_analysis_indicator_em` succeeded with `600519.SH` and `300750.SZ`, returned 2026-H1 rows, and supplied usable revenue, net profit, gross margin, and EPS fields after a narrow ASCII-alias mapping. The adapter now uses that verified Eastmoney endpoint and exchange suffix; it does not fall back to fabricated or stale data.

Other relevant Eastmoney statement APIs were probed but returned a provider-side float/schema `TypeError` in this environment. They were not selected because the indicator endpoint already produced sufficient exact-period data.

## Validation

- Parser contract and failure/telemetry tests: `42/42` passed.
- AKShare adapter plus parser focused tests: `42/42` passed.
- Real adapter diagnostic: both symbols normalized to usable exact `2026-H1` rows.
- Full 001C real E2E passed with the clean repository-managed CPU-only environment.
- No valuation arithmetic, expectation methodology, Thesis state, Knowledge schema, or canonical mutation was changed.

Evidence: `docs/project-state/evidence/2026-09-21-expectation-source-001c-env-001.json`.
