# RHL-M3B-3B-FIX-010 — Direct Eastmoney Industry Acquisition

Status: IMPLEMENTED / EASTMONEY_INDUSTRY_ACQUISITION_PASS / CTO ACCEPTANCE PENDING

## Decision and scope

DIAG-009 is accepted at `871e377da44880cad9411890e189c6029b304c0b` as CTO PASS for acquisition-failure isolation. Its aggregate classification remains `MIXED_ACQUISITION_BLOCKERS` and its next action remains `DESIGN_ADDITIONAL_FREE_INDUSTRY_ACQUISITION_PROVIDER`. The historical findings are preserved exactly: CNINFO has an intentional Industry capability absence, GDELT had a DNS/connect failure, and Python with akshare 1.18.64 imported but its production sector call failed before rows were available.

FIX-010 adds `eastmoney-industry-research-acquisition` behind the existing `ResearchAcquisitionPlugin` contract. It uses native Node `fetch` against the public Eastmoney `push2.eastmoney.com/api/qt/clist/get` family, bounded Industry and Concept board discovery, deterministic matching/ranking, and bounded identity-only constituent acquisition. It does not use accounts, cookies, credentials, private tokens, browser automation, retries, alternate hosts, scraping, or new dependencies.

The provider is additive rather than an AKShare replacement: CNINFO, GDELT, and AKShare remain unchanged and remain in their existing composition positions. An explicit `industryAcquisitionPlugins` seam is composed after general plugins and before AKShare. The internally created production runtime supplies one Eastmoney plugin by default; an injected list replaces that default for deterministic tests. Caller-owned `researchService` instances are untouched. Company Research and all non-Industry workflows continue to receive only the general plugin set.

## Evidence and rights boundary

Board membership is represented as current structured observation evidence. No `publishedAt` is fabricated and `asOf` is retained only as research context by the caller. Normalized content is deterministic JSON containing dataset identity, board identity, observation/retrieval context, and sorted six-digit constituent identity rows with bounded exchange labels. Prices, flows, rankings, and arbitrary payload fields are excluded. Rights remain public access, personal noncommercial research, retention/AI/derived knowledge allowed, and redistribution disallowed.

## Validation

Deterministic provider fixtures pass for both taxonomies, bounded pagination, PCB and 印制电路板 matching without production board-code hard-coding, generic-word exclusion, company zero-network behavior, constituent ordering and field minimization, malformed/HTTP responses, content hash/canonical URL, timeout plumbing, and rights metadata. Service/runtime tests cover the Industry-only seam and Company isolation.

Focused real validation was run once through `tests/validation/eastmoney-industry-production-acquisition.ts` using the frozen PCB target and recorded in `tests/validation/evidence/RHL_M3B_EASTMONEY_INDUSTRY_PRODUCTION_ACQUISITION.json`. It passed as `EASTMONEY_INDUSTRY_ACQUISITION_VALIDATED`: 12 bounded candidates, top candidate `印制电路板` resolved from live discovery, one constituent fetch page, 48 identity rows, and content hash `b6537323d85c684b3f42b442fe35e28762787166cd98b5a4d6cb6964bd7ff51c`. The evidence records 0 model calls, no Knowledge mutation, 0 Gateway submits, 0 Writer commits, and no full M3B gate run.

The next task is a fresh frozen M3B Real Pi E2E acceptance rerun. FIX-010 does not run that gate.

## Regression record

- `node --import tsx --test tests/plugins/research-acquisition/eastmoney-industry.test.ts tests/validation/eastmoney-industry-production-acquisition.test.ts` — PASS
- `npm run typecheck` — PASS
- `node --import tsx --test tests/app/runtime/industry-research-route.test.ts` — PASS
- Real focused Eastmoney validation — PASS; evidence written at the required path
- `npm run client:typecheck` — PASS
- `npm run test:node` — PASS (761 tests)
- `npm test` — PASS (21 client tests, 761 Node tests)
- `npm run client:build` — PASS
- `git diff --check` — PASS

No commit, push, amend, rebase, or force-push was performed by Luna.
