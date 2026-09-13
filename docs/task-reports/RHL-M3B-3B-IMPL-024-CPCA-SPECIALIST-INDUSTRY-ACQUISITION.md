# RHL-M3B-3B-IMPL-024 — CPCA specialist Industry acquisition

## Baseline and design

Baseline: `23760a0220dc8af030c43be7a746cab05e9f6a34`. The implementation adds `CpcaIndustryResearchPlugin` behind the existing acquisition contract. It is Industry-only, uses Tier 4, ranks title and nearby list text deterministically, and uses `DocumentInputResolver` for HTML and supported attachments.

Authorized route families are exactly `/industry-287.html` (industry analysis reports), `/industry-279.html` (market analysis), and `/industry.html` (weekly industry information). Traversal is capped at three families, two list pages per family, and eight candidates per call. Only HTTPS `cpca.org.cn` and `www.cpca.org.cn` URLs are accepted; redirects outside those hosts fail closed.

## Safeguards and composition

The plugin applies explicit timeout and payload bounds, rejects unsupported media, login/member/purchase/subscription/CAPTCHA or teaser-only content, and does not send credentials, cookies, browser automation, or private requests. Normalized output carries the CPCA publisher, canonical URL, content hash, Tier-4 provenance, and personal-noncommercial rights with redistribution disabled. The default order is MIIT, Gov.cn, Eastmoney, CPCA; Company acquisition remains unchanged.

## Validation

Deterministic tests cover all route families, pagination and relative URLs, ranking, dates/asOf filtering, duplicate suppression, URL boundaries, HTML/PDF normalization, restricted content, bounds, empty discovery, Company isolation, contract compatibility, and runtime provider ordering. The live probe is bounded to six list-page requests and four candidate fetches, with no retries, model calls, Gateway submissions, Writer commits, or Knowledge mutations. It writes sanitized evidence to `tests/validation/evidence/RHL_M3B_CPCA_INDUSTRY_PRODUCTION_ACQUISITION.json` and uses only the six permitted classifications. The probe ran with 3 list-page requests, 4 candidate fetches, 1 candidate, 0 normalized sources, and classified `CPCA_RESTRICTED_ONLY`; it exposed target-relevant material but the qualifying candidate was restricted/teaser-only.

Validation results: focused CPCA tests passed (6/6); runtime Industry route tests passed (5/5); `npm run typecheck` passed; `git diff --check` passed; the required `npm test` completed with 833 passed and 1 failed, an unrelated pre-existing valuation-route timing assertion (`tests/app/runtime/valuation-route.test.ts`, observed `running` vs expected `blocked`). A direct rerun of that valuation test passed (1/1).

A subsequent PCB Industry module rerun is not justified by this probe because the proven bar was not met; the existing public-source evidence gap remains.

## Residual limitations

The public CPCA site may expose no target-relevant material, may require a parser supported by the existing resolver, or may return restricted/unstable content. The probe intentionally does not follow private or guessed endpoints and does not persist source bodies.
