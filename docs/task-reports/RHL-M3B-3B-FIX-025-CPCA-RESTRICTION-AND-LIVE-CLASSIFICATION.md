# RHL-M3B-3B-FIX-025 CPCA restriction and live classification

## Baseline

Implemented from `28681734d9c16ae54f4ac1acce118d0885b0773a`. Governance revision and architecture revision set are those supplied by the task. No protected or out-of-scope paths were changed.

## Acceptance defects and changes

IMPL-024 treated any generic login, member, purchase, subscription, or sign-in token in the first 120 KiB, including candidate titles, as restriction evidence. Its live probe also counted every candidate exception as restricted and used a narrower diagnostic vocabulary than production.

The CPCA plugin now removes page chrome boundaries (script, style, navigation, header, footer, and aside) before restriction inspection and requires a local explicit access-gate phrase such as `请登录` or `登录后` together with access-control wording. Generic navigation tokens alone remain public. Redirects crossing the authorized host boundary remain explicit restricted/access-gate failures. Parser failure, empty normalized content, unsupported media, transport, timeout, and payload-read failures have distinct safe failure codes.

The probe now counts all requests during `discover()` as list/discovery requests, including pagination, and counts only candidate `fetch()`/`normalize()` processing as candidate fetches. It uses the production plugin's target vocabulary (industry name, aliases, and non-generic search terms), records bounded sanitized candidate outcome metadata, and classifies only from explicit outcomes. Restricted-only requires target-relevant candidates, no normalized public source, and every qualifying outcome to be `RESTRICTED_ACCESS_GATE` with no ambiguity.

## Validation evidence

Focused plugin tests passed 7/7. Offline classification tests passed 6/6. Typecheck passed. The bounded live probe completed with 6 list/discovery requests (three authorized routes plus pagination), 1 candidate fetch, 0 retries, and 1 normalized public source. Route relevance evidence recorded one target vocabulary match. Mutation flags remain zero for model calls, Gateway submissions, Writer commits, and Knowledge mutations. Candidate metadata contains only bounded title/hash, host/path, date availability, route, content hash, and outcome class; privacy flags are all false.

Broader validation results: the focused Industry runtime test passed 5/5; `npm run typecheck` passed; client tests passed 21/21; the full Node suite passed 840/841, with the one existing `tests/app/runtime/valuation-route.test.ts` timing assertion failing because the observed status was `running` while the test expected `blocked`. The required focused valuation rerun then passed 1/1. No valuation code was changed. `git diff --check` passed.

## Final classification and acceptance

The final live classification is `CPCA_SPECIALIST_SOURCE_PARTIAL`: one reachable public CPCA source normalized, but the two-source 2026 PCB-analysis plus 2026 market/monitoring proven bar was not met. This is not a restriction-only result.

IMPL-024 is technically accepted after this fix for its implementation and evidence defects. A real PCB Industry module rerun is not justified by this bounded acquisition result alone; the proven-source bar remains partial and should be revisited only under a separately authorized acceptance run. Any previously observed valuation-route timing failure remains test evidence only and was not expanded into valuation work.
