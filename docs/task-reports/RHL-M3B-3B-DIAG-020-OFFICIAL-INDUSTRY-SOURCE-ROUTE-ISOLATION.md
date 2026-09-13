# RHL-M3B-3B-DIAG-020 — Official Industry source-route isolation

Status: COMPLETED / LIVE_SOURCE_INCONCLUSIVE

## Baseline and scope

- Task: `RHL-M3B-3B-DIAG-020-OFFICIAL-INDUSTRY-SOURCE-ROUTE-ISOLATION`
- Base commit: `ad33be25273f73beb645b5ba3f6a7bb6e2e5e250`
- Frozen target: PCB Manufacturing / Printed Circuit Board, as-of `2026-09-12T00:00:00.000Z`, reusing DIAG-019's eight search terms.
- Only the two requested validation files, the evidence JSON, and this report were changed. No production path was changed.

## Bounded method

The diagnostic performed one native `fetch` per frozen term against the DIAG-019 control route, `https://sousuo.www.gov.cn/search-gov/data`, and one native `fetch` per term against each of two public official route families: `www.gov.cn/search.htm` and `sousuo.www.gov.cn/search-gov/search.htm`. All routes were HTTPS and `gov.cn` hosts. The live budget was 24 search/route requests of a maximum 30, with no retries. It allowed at most two document fetches; no document candidate was produced, so zero document requests were made.

The control parser accepts only the known bounded JSON result containers. The alternate parser accepts only bounded HTTPS-government anchors from an HTML result page. Unknown structures remain inconclusive. No third-party search engine, login, CAPTCHA handling, anti-bot bypass, browser automation, model call, Knowledge Production Gateway, Writer, or Knowledge mutation was used.

## Observed evidence

The control route returned HTTP 200 and parsed for all eight terms, with zero bounded rows, zero valid official candidates, and zero PCB target matches. Both alternate route families returned HTTP 404 for all eight terms. No valid official candidate was available for document normalization.

The sanitized machine evidence is [RHL_M3B_GOVCN_OFFICIAL_SOURCE_ROUTE_ISOLATION.json](../../tests/validation/evidence/RHL_M3B_GOVCN_OFFICIAL_SOURCE_ROUTE_ISOLATION.json). It records route identifiers and hosts, query hashes, HTTP/parse outcomes, bounded counts, candidate metadata, request counts, and privacy/mutation flags; it does not contain raw response bodies, full document text, cookies, credentials, authorization headers, private absolute paths, or reasoning traces.

## Classification and recommendation

Final classification: `LIVE_SOURCE_INCONCLUSIVE`.

The alternate routes were unavailable (HTTP 404), so this run cannot determine whether DIAG-019's coverage gap is specific to the current policy-library route. No production change is authorized. The single next step is to run one separately authorized bounded probe after identifying a currently published, reachable official search/document route family from an official page or response metadata; retain the existing `ResearchAcquisitionPlugin` route until that evidence exists.

## Validation

- `npx tsx --test tests/validation/govcn-official-source-route-isolation.test.ts` — passed 3/3.
- `node --import tsx tests/validation/govcn-official-source-route-isolation.ts` — completed; 24 route requests, 0 document requests; `LIVE_SOURCE_INCONCLUSIVE`.
- `npx tsx --test tests/validation/govcn-query-coverage.test.ts` — passed 2/2.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

## Residual limitations

The two alternate URL families were not reachable in this run, and no alternate candidate could be fetched or normalized. Consequently, the run proves neither an alternate route nor a persistent official-source coverage gap. The HTML parser is intentionally conservative and is not evidence that an unknown HTML structure is empty.
