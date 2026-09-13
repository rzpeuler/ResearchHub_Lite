# RHL-M3B-3B-DIAG-019 — GovCn PCB query coverage isolation

Status: **COMPLETED / TEST evidence; CTO acceptance pending**

## Baseline and scope

The accepted FIX-018 baseline is commit `9ffe341df5f41fdee437b3b68b7b154d912b5dd2`, verified as the current HEAD before work. FIX-018's four synchronized non-report files outside its report—its production plugin, focused plugin test, production acquisition validation script, and sanitized evidence—are accepted as task-scoped and reasonable because they are the bounded parser-compatibility implementation and its direct validation artifacts. This diagnostic does not modify them.

The unrelated valuation-route timing failure recorded by FIX-018 does not invalidate FIX-018: the active LUNA_TASK result contract treats test status as evidence-only, and the FIX-018 commit changed no valuation-route file.

## Diagnostic method

The TEST-only diagnostic captured the exact queries emitted by the current `GovCnIndustryResearchPlugin.discover()` for the frozen PCB request, then issued one bounded request for each of the eight existing frozen terms. Both paths used only `https://sousuo.www.gov.cn/search-gov/data`, HTTPS `*.gov.cn` policy, category `zhengcelibrary_gw_bm_gb`, fields `title:content:summary`, `RELEVANCE` ordering, page size 10, and a 2 MiB response bound. No retries, alternate hosts/providers, browser automation, credentials, CAPTCHA handling, document requests, model calls, or Knowledge/Gateway/Writer operations were used.

The production path made 4 search requests and selected these exact bounded queries: `Printed Circuit Board`, `PCB Manufacturing`, `AI服务器 PCB HDI`, and `生益科技 PCB CCL`. Of the eight frozen terms, `pcb-term-02` and `pcb-term-06` were included; the other six were omitted. The exact query set and per-term hashes are in `tests/validation/evidence/RHL_M3B_GOVCN_QUERY_COVERAGE.json`.

## Live findings

All eight individual probes made one request and returned HTTP 200 with a bounded parse. No probe produced an HTTPS `*.gov.cn` candidate or a PCB-target match after the existing relevance vocabulary. Bounded result counts by term were:

| Term ID | Request | HTTP/parse | Bounded rows | HTTPS gov.cn | PCB match | Production selected |
|---|---:|---|---:|---:|---:|---|
| pcb-term-01 | 1 | 200 / parsed | 1 | 0 | 0 | no |
| pcb-term-02 | 1 | 200 / parsed | 0 | 0 | 0 | yes |
| pcb-term-03 | 1 | 200 / parsed | 1 | 0 | 0 | no |
| pcb-term-04 | 1 | 200 / parsed | 0 | 0 | 0 | no |
| pcb-term-05 | 1 | 200 / parsed | 0 | 0 | 0 | no |
| pcb-term-06 | 1 | 200 / parsed | 0 | 0 | 0 | yes |
| pcb-term-07 | 1 | 200 / parsed | 0 | 0 | 0 | no |
| pcb-term-08 | 1 | 200 / parsed | 1 | 0 | 0 | no |

## Classification and recommendation

Final classification: **SOURCE_COVERAGE_GAP**.

None of the eight frozen terms produced a valid PCB-target candidate at the approved Gov.cn policy-library source during this bounded run. The evidence therefore does not support a production four-query selection change. The next narrow task should be a repeat of this same bounded diagnostic after a materially different live-source observation, or a separately authorized source/parser investigation; this task makes no production recommendation beyond retaining the classification.

## Files changed

- `tests/validation/govcn-query-coverage.ts`
- `tests/validation/govcn-query-coverage.test.ts`
- `tests/validation/evidence/RHL_M3B_GOVCN_QUERY_COVERAGE.json`
- `docs/task-reports/RHL-M3B-3B-DIAG-019-GOVCN-QUERY-COVERAGE.md`

No production source, governance, architecture, application, origin/main, or protected path was changed.

## Validation evidence

- `npx tsx --test tests/validation/govcn-query-coverage.test.ts` — **passed 2/2**.
- `node --import tsx tests/validation/govcn-query-coverage.ts` — **completed**, 4 production search requests plus 8 individual probes; final classification `SOURCE_COVERAGE_GAP`.
- `npm run typecheck` — **passed**.
- `git diff --check` — **passed**.

The offline regression separates classification correctness from live-network variability and covers selected-hit precedence, omitted-term selection gap, source gap, and live inconclusive handling. Evidence contains only bounded identifiers, hashes, counts, statuses, query strings, and boolean privacy/mutation confirmations; it contains no complete response bodies, document text, cookies, headers, credentials, private paths, or reasoning traces.

No blocker was observed. Git synchronization remains owned by the orchestrator; no commit, push, amend, rebase, or force-push was performed.
