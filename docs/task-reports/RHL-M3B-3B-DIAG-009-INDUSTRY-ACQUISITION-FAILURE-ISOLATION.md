# RHL-M3B-3B DIAG-009 — Industry Acquisition Failure Isolation

Status: COMPLETED as TEST evidence. No production code was changed and no model was invoked.

## Acceptance context

TEST-008 at `af6d7bba9daa568c5a2003b985e6335117c6a93c` is accepted as valid completed TEST evidence. Its frozen-gate classification remains `REAL_MODEL_CONTRACT_BLOCKED`: first-run revision delta `0`, Gateway submit count `0`, Writer commit count `0`, and no report, graph, or canonical objects. The reasoning boundary was not the blocker: runtime provider `pi-coding-agent`, completion backend `codex-cli`, model `gpt-5.6-luna`, effort `medium`, structured output enabled, automatic fallback calls `0`, one Design call, and bounded module calls.

DIAG-009 did not rerun the Real Pi gate and did not invoke a model. It constructed the read-only production `ResearchAcquisitionRequest` with target `PCB Manufacturing`, alias `Printed Circuit Board`, `asOf` `2026-09-12T00:00:00.000Z`, the eight TEST-008 search terms, and `limitPerKind: 24`.

## Isolated provider results

- CNINFO (`CNINFO_INDUSTRY_CAPABILITY`): `INTENTIONAL_CAPABILITY_ABSENCE`. The public `OfficialDisclosureResearchPlugin` interface returned an empty array for the Industry request; the fake client's `list()` was not called. This is intentional capability absence, not a network failure or provider-empty result.
- GDELT (`GDELT_INDUSTRY_DISCOVERY`): exactly one real `discover()` call, with no `fetch()` or `normalize()`. It returned no candidates and was classified `DNS_OR_CONNECT_FAILURE`; the endpoint host was `api.gdeltproject.org`. No complete URLs, bodies, or retries were persisted.
- AKShare (`AKSHARE_RUNTIME_CAPABILITY` / `AKSHARE_INDUSTRY_MATCHING`): Python was discovered and `akshare` imported successfully (`1.18.64`). The single production `sectorPerformance()` call was attempted; it returned no usable sector rows because execution failed, classified `AKSHARE_RUNTIME_FAILURE`. The current static path exposes only `sectorPerformance()` for Industry acquisition and its bridge calls `stock_board_industry_name_em()`. Probe D was therefore not eligible; no matching candidate was selected or fabricated.

The evidence file records bounded hashes/counts and sanitized classifications only. It contains no credentials, auth data, cookies, private absolute paths, raw provider bodies, full AKShare rows, complete article bodies, or model data.

## Aggregate diagnosis

Aggregate classification: `MIXED_ACQUISITION_BLOCKERS`.

`CNINFO` is intentionally unavailable for Industry, GDELT has a reproducible transport-level failure in this run, and AKShare reaches the installed runtime but its production sector call fails before producing rows. The evidence does not prove an AKShare exact-name matching blocker, because the prerequisite real sector rows were not available. The narrow next action is `DESIGN_ADDITIONAL_FREE_INDUSTRY_ACQUISITION_PROVIDER`; this diagnostic does not authorize implementation, provider fallback, direct Eastmoney access, fuzzy matching, or any weakening of source-quality, rights, provenance, or M3B acceptance rules.

## Validation and mutation checks

The scoped offline tests passed, including CNINFO fake-client non-invocation, aggregate classifications, deterministic bounded board-name relevance analysis, and exact request semantics. The diagnostic script completed and wrote `tests/validation/evidence/RHL_M3B_INDUSTRY_ACQUISITION_FAILURE_ISOLATION.json`.

Recorded mutation flags are all false: `modelCallCount: 0`, `knowledgeMutation: false`, `productionCodeMutation: false`, `gatewaySubmitCount: 0`, `writerCommitCount: 0`, no report/graph/canonical objects, no production file changes, and no Git synchronization. The only real external acquisition calls were one GDELT discovery and one conditional AKShare sector call; CNINFO client calls, GDELT fetch/normalize calls, and model calls were zero.

Full repository validation commands remain evidence-only under the TEST contract. This report and the scoped tests/evidence are the required DIAG-009 result; no commit, push, amend, rebase, or force-push was performed.

The first parallel standalone `npm run test:node` attempt observed one timing-sensitive `VAL-HTTP-001 HTTP valuation route starts authoritative Workflow` failure while the remaining output passed. A complete subsequent `npm test` rerun passed all 21 client tests and all 753 Node tests, so the transient first result is retained as evidence and is not treated as a DIAG-009 implementation failure.
