# RHL-M3B-3B-IMPL-022 MIIT Official Industry Acquisition

## Baseline

- Base commit: `7d9aee7d0289415337a936c113e0de2c472e3bec`.
- Governance revision: `docs/governance/governance-manifest.yaml@cf06beb7f337c56d68cb1ff347d6dc8e9f6345a0`.
- Architecture revision: `PERSONAL_RESEARCH_V1_INDUSTRY_DEEP_RESEARCH_ARCHITECTURE_V0.1.md@52bfac41c04b639abe8fad96c9d1a91bb51e9370`.
- No commit, push, amend, rebase, or force-push performed.

## Files changed

- `plugins/research-acquisition/miit-industry.ts`: bounded MIIT Industry-only plugin.
- `plugins/research-acquisition/index.ts`: export.
- `app/runtime/application-runtime.ts`: default Industry composition order MIIT, Gov.cn, Eastmoney.
- `tests/plugins/research-acquisition/miit-industry.test.ts`: deterministic fixture coverage.
- `tests/app/runtime/industry-research-route.test.ts`: updated default-order assertion.
- `tests/validation/miit-industry-production-acquisition.ts`: bounded live probe.
- `tests/validation/evidence/RHL_M3B_MIIT_INDUSTRY_PRODUCTION_ACQUISITION.json`: sanitized live evidence.

## Production design and boundaries

`MiitIndustryResearchPlugin` implements the existing `ResearchAcquisitionPlugin` contract and returns no candidates for Company requests. Discovery uses only the three authorized HTTPS MIIT route families, at most two pages per family, and eight ranked candidates per call. Relevance is deterministic from Industry name, aliases, and search terms; duplicates are URL-keyed; future reliable publication dates are rejected. Candidate fetches accept only MIIT HTTPS HTML/XHTML/plain text or directly linked PDF resources, enforce timeout and byte bounds, and reject cross-domain redirects. HTML and PDF normalization both go through the existing `DocumentInputResolver.parse` seam. Normalized sources carry canonical URL, content hash, Ministry publisher, Tier-1 candidate provenance, and public personal-research rights with redistribution disabled.

The default Industry composition is now MIIT first, followed by the existing Gov.cn and Eastmoney fallbacks. Company composition and the plugin contract are unchanged. No registry, source manager, planner, workflow, or Knowledge mutation path was added.

## Validation

- `npx tsx --test tests/plugins/research-acquisition/miit-industry.test.ts`: PASSED (5/5).
- Application Industry runtime focused tests: PASSED (5/5).
- `node --import tsx tests/validation/miit-industry-production-acquisition.ts`: completed with classification `MIIT_ROUTE_OR_PARSER_GAP`; 3 list-page requests, 0 candidate fetches, 0 normalized sources, no retries or mutations. Evidence is sanitized and contains no raw response bodies.
- `npm run typecheck`: PASSED.
- `npm test`: PASSED (825/825; client 21/21).
- `git diff --check`: PASSED.

## Live-probe result and limitations

The live probe did not establish official-source proof. The authorized MIIT pages were reachable as list requests, but the production parser exposed no safely selectable relevant candidate in this run, so the required two-source condition was not met. Classification is exactly `MIIT_ROUTE_OR_PARSER_GAP`, not `MIIT_OFFICIAL_SOURCE_PROVEN`. The remaining limitation is the conservative HTML list parser's dependence on explicit anchor/title structure and the current live route presentation. No raw content was retained.

## Rerun decision

A real PCB Industry module rerun is not justified by this probe alone. It may be reconsidered after a separately bounded route/parser follow-up proves relevant MIIT candidates and at least two normalized sources, including a PCB-specific source and a 2025/2026 broader electronic-information operating or policy source.
