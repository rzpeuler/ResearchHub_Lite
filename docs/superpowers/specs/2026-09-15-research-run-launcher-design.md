# Research Run Launcher

Date: 2026-09-15
Status: Approved by standing autonomous mission authorization

## Goal

Add a small `/run` page so a user can start the existing Company, Industry,
Earnings, Valuation, Event, or Thesis Research workflows without typing raw
API requests or relying on a Pi tool call.

## Boundary

- The page is an input and launch surface, not a second Workflow engine.
- Each form maps directly to the existing validated HTTP endpoint and its
  Application Service contract.
- The client sends mutations only through the existing RuntimeClient token
  path. The server remains responsible for UUIDs, input limits, background
  tracking, and Workflow registration.
- Missing providers or weak evidence remain normal Workflow outcomes. The
  launcher reports the accepted run and hands status back to the existing
  Research workspace polling path.
- No new provider, canonical write path, placeholder evidence, or direct
  frontend Knowledge mutation is introduced.

## UI

The top navigation gains `Run Research` and routes to `/run`. A compact
operation selector shows one bounded form at a time. Shared fields are symbol,
exchange, name, and optional as-of where applicable. Operation-specific fields
are constrained to the same enums and limits already enforced by the server.
Event anchors use an explicit kind selector; Thesis requires a canonical
`claim:` reference. On success the page displays the accepted run ID and
navigates to Research so the existing Workflow panel can poll it.

## Error handling and verification

Validation errors returned by the RuntimeClient are shown inline and do not
clear user input. Successful launch responses are treated as asynchronous;
the page does not wait for real data or claim that the run completed. Tests
cover every client endpoint mapping, token use, route rendering, form submit,
and the existing full suite.
