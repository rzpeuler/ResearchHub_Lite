# Research Report Catalog

Date: 2026-09-15
Task: RHL-P1-UI-REPORT-CATALOG

## Outcome

Implemented a read-only Research Reports destination at `/reports`. It indexes
the existing persisted Company, Industry, Earnings, Valuation, Event, and
Thesis report metadata and loads a selected report's validated sections and
provenance references. Daily Briefs continue to use their dedicated reader.

## Delivered

- Added `ResearchReportSummary` projection and bounded report-root scanning in
  `ResearchService`.
- Added `GET /api/research-reports` list route alongside the existing detail
  route.
- Added RuntimeClient list/detail methods without mutation authorization.
- Added Reports navigation and read-only list/detail UI.
- Kept malformed report artifacts isolated and excluded Daily Briefs from the
  general catalog.
- Added service, HTTP, RuntimeClient, and App regression coverage.

## Verification

Focused checks passed before the full suite:

- `npx tsx --test tests/app/services/research-service.test.ts tests/app/runtime/research-reports-route.test.ts`: 6/6 passed.
- `npm run client:test`: 25/25 passed.
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.

Final verification passed:

- `npm test`: client 25/25 and Node 979/979 passed.
- `npm run client:build`: passed.
- `npm run document-parser:check`: `READY`.
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.
- `git diff --check`: passed.

The first full-suite attempt exposed the existing VAL-HTTP-001 20ms polling
race (`running` observed before `blocked`); five independent focused reruns
and the final full suite passed. No valuation logic was changed.

## Remaining boundary

The catalog does not add direct workflow launch forms and does not upgrade
external provider coverage. Live-data gaps remain explicitly deferred or
blocked as already recorded in the mission state and external-validation
inventory.
