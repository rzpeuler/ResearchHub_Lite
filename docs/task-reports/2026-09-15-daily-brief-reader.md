# Daily Brief Reader

Date: 2026-09-15
Task: RHL-P1-UI-EXPOSURE

The existing read-only Daily Brief API is now exposed as a small client route
at `/briefs`. This is a UI exposure change only: it does not add a research
engine, change canonical Knowledge rules, or create a frontend mutation path.

## Delivered

- Added a `Daily Briefs` navigation destination.
- Added bounded list loading through `GET /api/daily-briefs?limit=20`.
- Added selected-brief loading through `GET /api/daily-briefs/:reportId`.
- Rendered Morning/Evening identity, date, revision, quality counts,
  section-level content, explicit Unavailable sections, and item Source refs.
- Kept the page explicitly read-only and preserved no-Knowledge-Base behavior.
- Added RuntimeClient and App coverage for the new read-only route and API
  calls; no runtime authorization token is sent for these GET requests.

## Verification

- `npm run client:typecheck`: passed.
- `npm run client:test`: 23/23 passed.
- `npm run client:build`: passed.

## Remaining UI scope

The reader covers persisted Daily Briefs. A general Research Report catalog or
direct launch forms for Company/Industry/Earnings/Valuation/Event/Thesis work
remain separate UI backlog items because the current runtime exposes report
lookup by ID, not a general report index, and research starts are intentionally
owned by the Agent/API contracts.
