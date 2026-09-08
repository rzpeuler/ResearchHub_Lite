# RHL Daily Intelligence v1 validation

Status: Implemented / CTO acceptance pending.

## Offline validation

- `npm run typecheck` passed.
- `npm run client:typecheck` passed.
- `npm run client:build` passed.
- `npm run test:node` passed with 324 tests, including signal-store, catalog, scheduler, and Daily Intelligence workflow coverage.
- Empty-provider workflow completed with 14 Morning sections and explicit unavailable gaps.
- Fixture workflow produced one bounded signal, zero canonical Claims, auditable report source coverage, and deterministic `already_completed` replay.

## Live public-source validation

`RHL_DAILY_INTELLIGENCE_V1.json` records the sanitized live probe on 2026-09-08. The 43-entry catalog was checked without credentials. Public institutional and community pages were usable; CNINFO and RSS returned empty for the probe; GDELT returned HTTP 429; the local AKShare Python bridge failed in the current environment. These are explicit provider outcomes, not fabricated data.

## Real Pi validation

`RHL_DAILY_INTELLIGENCE_V1_PI_E2E.json` records two runs through the actual `PiReasoningExecutor` and Pi `ModelRuntime` using a legally retained public fixture: Morning completed with 14 sections and Evening completed with 13 sections. Each run used one bounded synthesis reasoning call. No secrets or raw bodies were written to evidence. The fixture proves the Signal -> Enrich -> Cluster -> Brief -> Report path; it does not claim live provider success.

## Remaining risks

The first implementation keeps Knowledge dual-output proposals conservative and does not auto-promote news into Claims. Trading-calendar live provider integration and deeper report rendering remain bounded seams for the next iteration. M2 remains unmerged to `main`; no M3 work was started.
