# Research Report Catalog

Date: 2026-09-15
Status: Implemented

## Scope

Expose existing persisted research reports through a read-only catalog. The
catalog covers Company, Industry, Earnings, Valuation, Event, and Thesis
reports. Daily Briefs remain on their dedicated route and store.

## Boundaries

- The service scans only the configured report root and only direct
  `*.md.json` metadata files.
- Every candidate is passed through the existing `ResearchReport` validator;
  malformed or partially-written files are skipped so one damaged artifact
  does not take down the reader.
- List responses contain metadata and counts only. Detail responses reuse the
  existing validated report contract. No write endpoint, frontend mutation, or
  real provider dependency is added.
- Filesystem paths are not rendered by the UI. GET requests do not carry the
  runtime mutation token.

## Flow

`GET /api/research-reports?limit=N` → `ResearchService.listResearchReports()`
→ validated summaries sorted by `generatedAt` descending → read-only Reports
page. Selecting an item calls `GET /api/research-reports/:reportId` and renders
the persisted sections and canonical provenance references.

## Acceptance

- Missing report roots return an empty catalog.
- Daily Brief metadata is not duplicated in the general catalog.
- Limits are positive and bounded to 200.
- Invalid report metadata is isolated and skipped.
- Service, HTTP, RuntimeClient, and App tests cover the list/detail path.
