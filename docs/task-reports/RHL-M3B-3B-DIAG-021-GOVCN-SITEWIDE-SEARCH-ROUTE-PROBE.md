# RHL-M3B-3B-DIAG-021 — Gov.cn sitewide search route probe

Status: `COMPLETED / SITEWIDE_ROUTE_CONTRACT_UNRESOLVED`

## Baseline and relation to DIAG-020

- Task: `RHL-M3B-3B-DIAG-021-GOVCN-SITEWIDE-SEARCH-ROUTE-PROBE`
- Base commit: `26dae86de8b9cce02c2d2ca1b4906b9936433f5a`
- Frozen target: PCB Manufacturing / Printed Circuit Board, as-of `2026-09-12T00:00:00.000Z`, using the same eight DIAG-019/020 search terms.
- DIAG-020 reached the older control route but found its alternate route families unavailable. This follow-up tested the currently supplied official discovery root `https://sousuo.www.gov.cn/` and candidate sitewide family `https://sousuo.www.gov.cn/sousuo/search.shtml`.

## Bounded derivation method

The diagnostic made native HTTPS `fetch` requests only to the supplied official root, the supplied official search page, and six explicitly referenced same-host public static assets. It inspected only bounded HTML form metadata, public URL references, and response hashes. A sitewide query was attempted only if the official search page exposed a public form action, method, query parameter, and fixed values. No endpoint, parameter, token, dynamic sign, or client contract was guessed or emulated.

The root and search page both returned HTTP 200. The page did not expose a safely derivable public form contract in ordinary page data. The referenced assets were bounded and returned HTTP 404; no asset supplied an actionable public contract. Therefore no search requests and no candidate-document requests were made.

## Exact classification and sanitized evidence

Final classification: `SITEWIDE_ROUTE_CONTRACT_UNRESOLVED`.

The evidence file is [RHL_M3B_GOVCN_SITEWIDE_SEARCH_ROUTE_PROBE.json](../../tests/validation/evidence/RHL_M3B_GOVCN_SITEWIDE_SEARCH_ROUTE_PROBE.json). It records the official hosts and paths, hashed discovery responses and asset responses, the null discovered contract, request outcomes, bounded counts, classification, request limits, and mutation/privacy flags. It contains no raw response bodies, full HTML/JavaScript, document text, cookies, credentials, authorization headers, private absolute paths, or reasoning traces.

Observed counts:

- Total requests: 8 / maximum 24; retries: 0.
- Static assets: 6 bounded references; document fetches: 0 / maximum 2.
- Search probes: 0; bounded result rows: 0; official candidates: 0; PCB matches: 0; normalized documents: 0.

`SITEWIDE_OFFICIAL_ROUTE_PROVEN` was not reached. `SITEWIDE_ROUTE_REACHABLE_NO_PCB_MATCH` was not eligible because the route contract was not safely derived. `LIVE_SOURCE_INCONCLUSIVE` was not used because the official root and search page were reachable and stable enough to establish the narrower contract-unresolved result.

## Validation

- `npx tsx --test tests/validation/govcn-sitewide-search-route-probe.test.ts` — passed 4/4.
- `node --import tsx tests/validation/govcn-sitewide-search-route-probe.ts` — completed; 8 total requests, 0 document requests; `SITEWIDE_ROUTE_CONTRACT_UNRESOLVED`.
- `npx tsx --test tests/validation/govcn-official-source-route-isolation.test.ts` — passed 3/3.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

## Changed paths and mutation confirmation

Changed paths are limited to:

- `tests/validation/govcn-sitewide-search-route-probe.ts`
- `tests/validation/govcn-sitewide-search-route-probe.test.ts`
- `tests/validation/evidence/RHL_M3B_GOVCN_SITEWIDE_SEARCH_ROUTE_PROBE.json`
- `docs/task-reports/RHL-M3B-3B-DIAG-021-GOVCN-SITEWIDE-SEARCH-ROUTE-PROBE.md`

No production code, model configuration, Knowledge Production Gateway, Writer, canonical Knowledge, or persisted research artifact was modified. No production change is authorized for this classification.

## Residual limitation and next step

The official page is reachable, but its public result contract is not safely derivable without client execution or bypass-like emulation. This probe therefore does not determine sitewide PCB coverage. The single next step is a separately authorized review of a currently published official page/static asset that exposes an ordinary public search contract; until then, retain the existing `ResearchAcquisitionPlugin` route.
