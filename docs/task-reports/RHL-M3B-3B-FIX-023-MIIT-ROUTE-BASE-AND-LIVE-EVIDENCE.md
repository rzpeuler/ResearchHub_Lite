# RHL-M3B-3B-FIX-023 — MIIT route base and live evidence

Status: **COMPLETED / technical acceptance evidence**

## Baseline and scope

The verified baseline was `802bdf2049b2e8fc032660194f406c2e3c7b21d4` on branch `codex/personal-research-v1-industry-architecture`. Changes remain within the approved MIIT plugin, its focused tests, the production acquisition probe/evidence, and this report. No commit or remote synchronization was performed.

## Acceptance defects and fix

IMPL-022 had two defects:

1. `parseList` resolved every relative article, attachment, and pagination link against `MIIT_INDUSTRY_ROUTES[0]`, so route families 2 and 3 could resolve into the wrong directory.
2. The live probe classified zero discovered candidates as `MIIT_ROUTE_OR_PARSER_GAP` without proving that relevant material was exposed, and did not retain sanitized per-route observations.

The production fix passes the actual validated final response URL into list parsing. Discovery validates the final URL as HTTPS on `miit.gov.cn` or a subdomain before parsing, and follows only an explicit current-page pagination link on the route family's original host, for at most two pages. Document redirect validation remains unchanged in effect and continues to reject off-domain final URLs.

The probe now uses the frozen PCB vocabulary of eight terms, invokes `MiitIndustryResearchPlugin`, stays within six list requests and four candidate fetches with zero retries, and records only route/path, final route/path, HTTP result, official-domain status, bounded size/counts, response hash, bounded normalized-source metadata, classification, mutation flags, and privacy flags.

## Tests added and validation

Focused deterministic tests cover route-family 2 and 3 relative article links, relative pagination from the current page, off-domain discovery redirects before parsing, on-domain redirected list bases, existing document off-domain rejection, and timeout/AbortSignal behavior.

Validation results:

- `npx tsx --test tests/plugins/research-acquisition/miit-industry.test.ts` — 8 passed.
- `node --import tsx tests/validation/miit-industry-production-acquisition.ts` — completed; 3 list pages, 0 candidate fetches, 0 normalized sources.
- `npm run typecheck` — passed.
- `npm test` — 828 passed (21 client, 807 Node).
- `git diff --check` — passed; only Git's normal LF/CRLF conversion warnings were emitted.

## Live evidence and classification

The evidence file records all three authorized routes as HTTP 200, official final URLs, response sizes in the `0-16KiB` bucket, 11–18 anchors, all anchors official, and zero target-term anchor/nearby-text matches. The response hashes are retained without raw bodies. Candidate count is 0, normalized source count is 0, publication-date availability is 0, and mutation counts for model, Gateway, Writer, and Knowledge are all 0.

Final classification: **`MIIT_DISCOVERY_EMPTY`**. The authorized list pages were stably reachable and observed, but exposed no bounded target-relevant material. `MIIT_ROUTE_OR_PARSER_GAP` was not used because the sanitized evidence does not prove relevant official material was exposed.

## Acceptance conclusion

IMPL-022 is now technically accepted for the two FIX-023 defects, subject to ordinary orchestrator/CTO review. A real PCB Industry module rerun is not justified by this probe: it produced no MIIT evidence, and FIX-023 does not authorize or include a module rerun. Any future rerun should follow a separately authorized live-source observation that supplies qualifying evidence.
