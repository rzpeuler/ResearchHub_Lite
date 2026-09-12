# RHL-M3B-3B-FIX-007 — Industry Explicit Codex Production Selection

Status: IMPLEMENTED / INDUSTRY_CODEX_EXPLICIT_SELECTION_PASS / CTO ACCEPTANCE PENDING

## Scope and provenance

This implementation is based on FIX-006 at `fbeed8ce47409382e4439228f1a45e99e8b3e916`, accepted as CTO PASS for strict-required Codex transport and the PCB compatibility boundary. FIX-006 established the current normalized Design transport fingerprint `88711c17a6837ae7` at 2125 bytes, source contract fingerprint `9854f93073c44d96`, neutral Design validation, unchanged PCB first-attempt validation with `targetKind: industry` and all eight module questions, and `productionSelectionAuthorized: true`.

Sol's acceptance decision for FIX-006's bounded extra test-maintenance change is recorded here: the live regression helper in `tests/validation/codex-cli-structured-schema-compatibility-matrix.ts` calls the current production normalizer, so its expected fingerprint/size correctly moved from `95e315657e862a7e/2111` to `88711c17a6837ae7/2125`. It did not change DIAG-003 evidence/report, production behavior, or historical classification. DIAG-003's historical report/evidence remain authoritative for that historical run; the helper constant is a current-regression expectation. No DIAG-003 file was modified by FIX-007.

## Implementation

- `PRIMARY_PRODUCTION_REASONING_MODEL` remains exactly `zhipu-openapi/glm-5.3-flash`.
- `INDUSTRY_PRODUCTION_REASONING_SELECTION` explicitly identifies `codex-cli`, `gpt-5.6-luna`, and `medium`.
- `createIndustryProductionReasoningExecutor()` delegates directly to the existing Codex CLI Luna factory; no subprocess or transport logic was duplicated.
- Internally constructed Application Runtime instances inject a lazy, memoized Industry factory. Codex discovery occurs only when `startIndustryResearch()` resolves the factory.
- Research Service resolves that Industry executor before invoking `runIndustryDeepResearch()`. Factory rejection and executor failure propagate without invoking the default executor.
- Explicit caller-owned `researchService` instances remain untouched. Explicit test/caller executor injection remains compatible and does not alter the default production selection.
- Company Research, Earnings Review, Valuation, Event Research, Thesis Red Team, Daily Intelligence, document ingestion, and Pi session reasoning retain the existing executor path.

## Validation

Deterministic tests cover unchanged default metadata, explicit Industry metadata, lazy Application Runtime startup, factory rejection, safety/policy failure, technical failure, and absence of fallback calls. The dedicated real validation captures the existing PCB first-attempt request, checks instruction `7a04f3501b1d420d`, input `36c1bc2fc516f169`, and outputContract `9854f93073c44d96` before making exactly one call through the new Industry factory. It uses the unchanged parser and validator and writes privacy-safe evidence to `tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCTION_CODEX_SELECTION.json`.

Focused real validation: `INDUSTRY_CODEX_SELECTION_VALIDATED`. Exactly one real call was made through the new Industry factory. The request fingerprints matched `7a04f3501b1d420d`, `36c1bc2fc516f169`, and `9854f93073c44d96`; transport remained `88711c17a6837ae7` / 2125 bytes; runtime metadata was Codex CLI / `gpt-5.6-luna` / medium with structured output enabled; parser and validator passed; target kind was Industry; module question count was 8; fallback call count was 0.

Validation results: focused selector, runtime, service, Codex executor, and Industry Skill tests passed; `npm run typecheck`, `npm run client:typecheck`, `npm run client:build`, `npm run test:node`, `npm test`, and `git diff --check` passed. The isolated valuation-route reproduction passed after one aggregate run observed its pre-existing timing race (`running` versus expected `blocked`). The two requested aggregate paths `tests/app/pi/.test.ts` and `tests/app/services/.test.ts` do not exist in this repository and were not runnable. The frozen `industry-research-pi-e2e-gate.test.ts` was intentionally not run because the task explicitly reserves that complete acceptance gate for the next TEST task.

## Safety and mutation boundary

The focused one-call validation performs no acquisition, Gateway, Writer, ResearchReport, graph, Knowledge, Source/Raw, or canonical Knowledge mutation. It persists no raw prompts, complete requests, contracts, stdout, stderr, model output, credentials, private paths, or reasoning traces. No automatic fallback is available or exercised.

## Next step

After CTO acceptance, run the separate complete frozen M3B-3B Real Pi E2E acceptance TEST using actual production Application Runtime selection. The focused real selection validation is intentionally not part of normal `npm test`.
