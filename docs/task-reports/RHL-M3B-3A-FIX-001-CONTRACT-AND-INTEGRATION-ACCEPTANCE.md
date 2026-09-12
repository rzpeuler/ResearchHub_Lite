# RHL-M3B-3A-FIX-001 — Contract and Integration Acceptance

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

Baseline: `ff58f5a7db0e9cc2889d12db867eaf12cd11b730`  
Governance: `docs/governance/governance-manifest.yaml` version 1, template version 2.  
No commit, amend, rebase, push, or force-push was performed.

## Findings addressed

The independent review findings were:

1. The Industry acquisition request was not type-safe: `company` remained required and Industry composition fabricated `{ company: { symbol: 'INDUSTRY' } }`.
2. The claimed integration completion lacked the required Application, Pi, runtime, and graph acceptance evidence.

The acquisition contract is now a Company-versus-Industry union. Existing Company request literals remain compatible; Industry requests contain only `industry`. The fabricated placeholder and the `as unknown as ResearchAcquisitionPlugin` escape are removed. `AkshareIndustryResearchPlugin` now formally implements `ResearchAcquisitionPlugin`.

## Implementation evidence

- GDELT narrows both request variants and preserves bounded terms, query length, and result count.
- CNINFO and RSS return empty for Industry without reading a Company field. Existing Company paths remain green.
- AKShare uses one exact board match and returns zero for no-match or multiple-match results, with public rights and bounded structured metadata.
- Industry composition uses deterministic plugin order, finite provider/candidate/source limits, Industry-only requests, URL/content-hash deduplication, independent provider failure handling, and redacted bounded diagnostics. Partial provider success retains both success and failure flags.
- `ResearchService.startIndustryResearch` validates reasoning availability before registration, delegates to the accepted Workflow, aggregates bounded Wave 1 and Wave 2 outcomes/diagnostics, and keeps report paths relative.
- Default runtime composition remains unchanged because it already supplies Schema 0.4 / Storage 1-compatible Industry Research dependencies when a valid mounted KB is present.
- Runtime acceptance coverage was added for both `/api/production/research-industry` and `/api/research-industry`, runtime token/origin security, generated run IDs, 202 semantics, registration, bounded invalid-input rejection, and no-registration failures.
- The deterministic M3B-2 Workflow and existing graph-service boundedness/replay tests remain green. Real Pi Industry E2E was not run.

## Focused evidence

- Acquisition/Application/Pi focused matrix: 31 passed.
- Industry Workflow plus graph service: 41 passed.
- New runtime Industry route matrix: 2 passed.
- Missing-ReasoningExecutor pre-registration test: passed in the repository Node suite.
- Real provider smoke: acquisition-only, bounded and safe. GDELT and AKShare were `unavailable_or_degraded` under bounded timeout; CNINFO and RSS were `empty`. No provider success was fabricated and no raw response body, credential, cookie, header, or private path was written.

## Full validation

- `npm run typecheck` — PASSED.
- `npm run client:typecheck` — PASSED.
- `npm run test:node` — PASSED, 645 tests.
- `npm test` — PASSED, client 21 tests and Node 645 tests.
- `npm run client:build` — PASSED.
- `git diff --check` — PASSED.
- `node --import tsx tests/validation/industry-research-provider-smoke.ts` — PASSED as acquisition-only degraded/empty evidence described above.

## Acceptance boundary and remaining limitations

This report deliberately remains CTO ACCEPTANCE PENDING: the implementation and regression matrix are green, but not every row in the supplied acceptance list has a new direct test artifact in this fix, particularly the complete Application-through-Industry graph projection/replay matrix and expanded direct Pi `research_industry` envelope assertions. Existing graph-service and Workflow replay evidence passed unchanged. No KnowledgeGraphService, schema, storage, Gateway, Resolution, Writer, or real Pi reasoning code was changed.

Real Pi Industry E2E, PCB/AI-server/HDI execution, final semantic replay under real reasoning, and the final 8-module/16-section evidence gate remain M3B-3B.

Governance gaps: none observed. Blockers: none external; CTO acceptance remains pending only for the explicitly identified evidence rows above.
