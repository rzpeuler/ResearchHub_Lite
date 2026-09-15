# Research Run Launcher

Date: 2026-09-15
Task: RHL-P1-UI-RESEARCH-RUN-LAUNCHER

## Outcome

Added a `/run` page that starts the existing Company, Industry, Earnings,
Valuation, Event, and Thesis workflows through their governed HTTP endpoints.
After acceptance, the page returns to Research with the existing workflow
polling path. It does not wait for provider completion or claim that evidence
quality is sufficient.

## Delivered

- Added a dedicated `ResearchRunPage` with one bounded operation form at a
  time.
- Added RuntimeClient mutation methods for all six existing research routes.
- Reused server-side validation, UUID creation, background tracking, and
  runtime mutation-token enforcement.
- Added operation-specific fields for Industry aliases/search terms, Earnings
  period, Valuation methods, Event anchor kinds, and Thesis claim refs.
- Added client endpoint-mapping and launcher-route regression coverage.
- Added design documentation before implementation.

## Verification

- `npm test`: client 27/27 and Node 979/979 passed.
- `npm run client:build`: passed.
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.
- `git diff --check`: passed.

## Boundary

The launcher only starts existing Workflows. It adds no research provider,
canonical Knowledge write path, placeholder evidence, Review decision action,
or direct frontend canonical mutation. External data gaps continue to follow
the deferred/blocked policy already recorded in the mission state.
