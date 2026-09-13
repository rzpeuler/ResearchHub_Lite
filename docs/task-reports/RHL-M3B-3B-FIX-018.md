# RHL-M3B-3B-FIX-018 — GovCn Industry live-response compatibility adjustment

Status: **IMPLEMENTED / CTO ACCEPTANCE PENDING**

## Outcome

The Gov.cn Industry acquisition parser now accepts the bounded live response shape observed from the approved route:

`searchVO.catMap.gongbao.listVO`

It also accepts the live empty-page shape `data: []` so bounded pagination can terminate without treating a valid empty page as a parser failure. Existing source-policy, HTTPS `*.gov.cn` filtering, relevance filtering, candidate bounds, timeout/size guards, provenance, normalization, and fail-closed behavior remain unchanged.

## Diagnosis

The prior production evidence classified the response as `GOVCN_SEARCH_INVALID_RESPONSE` with `Gov.cn response has no bounded result array`. A minimum live diagnostic against `https://sousuo.www.gov.cn/search-gov/data` observed HTTP 200 JSON with no raw body persisted. The response had `data: null` on a result page and placed the bounded result array under `searchVO.catMap.gongbao.listVO`. Observed row field names included `title`, `url`, `fwdw`, `pubtimeStr`, and `summary`; the observed URL host was `www.gov.cn`. Empty target-query pages returned `data: []`.

No authentication challenge, CAPTCHA, anti-bot page, alternate provider, or external setup requirement was observed.

## Implementation

Changed only the GovCn acquisition parser and its focused validation path:

- Added the explicit `searchVO.catMap.gongbao.listVO` result container.
- Added live field aliases `fwdw` for publisher and `pubtimeStr`/`pubtime` for publication date.
- Accepted only the explicit empty `data: []` / empty data-object shapes as no-result pages; unknown structures still reject with the existing bounded-response error.
- Added a sanitized deterministic fixture for the live container shape and preserved malformed, HTTP, oversized, unsupported, domain, and provenance regressions.
- Updated the production evidence harness and evidence projection for FIX-018. Raw response bodies, document prose, credentials, cookies, and private headers were not recorded.

## Changed files

- `plugins/research-acquisition/govcn-industry.ts`
- `tests/plugins/research-acquisition/govcn-industry.test.ts`
- `tests/validation/govcn-industry-production-acquisition.ts`
- `tests/validation/evidence/RHL_M3B_GOVCN_INDUSTRY_PRODUCTION_ACQUISITION.json`
- `docs/task-reports/RHL-M3B-3B-FIX-018.md`

## Validation

- `npx tsx --test tests/plugins/research-acquisition/govcn-industry.test.ts` — **7/7 passed**.
- `npx tsx --test tests/validation/govcn-industry-production-acquisition.test.ts` — **2/2 passed**.
- `npm run typecheck` — **passed**.
- `npx tsx tests/validation/govcn-industry-production-acquisition.ts` — **completed**; 4 bounded live search requests, 0 document requests, no raw payload persistence, final classification `GOVCN_DISCOVERY_EMPTY`.
- `npm test` — **810/811 passed**. One unrelated existing timing-sensitive failure occurred in `tests/app/runtime/valuation-route.test.ts`: expected `blocked`, observed `running`. No GovCn test failed.
- `git diff --check` — **passed**.

The sanitized fixture proves parser compatibility and accepted-candidate construction (`acceptedCandidateCount: 1`) from the observed live structure. The real validation run did not return a valid in-policy PCB candidate at validation time, so no live candidate or normalized document was manufactured; `livePcbModuleRerunAuthorized` remains false.

## Evidence

Updated evidence: `tests/validation/evidence/RHL_M3B_GOVCN_INDUSTRY_PRODUCTION_ACQUISITION.json`.

The evidence records the structural diagnosis, accepted fixture count, policy/provenance route, live request counts, final classification, and privacy flags without raw source bodies or private authentication material.

## Residual risks and gaps

- The approved Gov.cn service returned no valid target-matching candidate during this run; a later live validation is needed to prove a real accepted candidate and document normalization against current content.
- The repository-wide test command retains the unrelated valuation-route timing failure described above.
- The task architecture snapshot names `docs/architecture/PERSONAL_RESEARCH_V1_ARCHITECTURE_V0.1.md` and `docs/architecture/REPOSITORY_LAYOUT_V1.md`, but those exact paths are absent; similarly named repository documents exist. No architecture or governance document was modified.

## Git and acceptance handoff

- Final HEAD: `e935d076d11fe1d4308915f3207f7f02c2c560a6` (unchanged; orchestrator owns synchronization).
- Branch: `codex/personal-research-v1-industry-architecture`.
- Working tree contains only the task-scoped files listed above.
- No commit, push, rebase, amend, force operation, merge, or `origin/main` modification was performed.
- CTO acceptance remains pending.
