# Thesis lifecycle CREATE acceptance

Date: 2026-09-24

Task: `RHL-TL-001`
Classification: isolated v0.4 source/evidence setup followed by the normal authenticated HTTP CREATE route and configured Pi Thesis Formalize operation. The temporary seed contains a company scope Entity, one live original-publisher Source/Raw, and one source-bound canonical evidence Claim. It contains no Thesis, generated proposition Claim, or `qualifies` membership edge before product CREATE.

## Result

EXECUTED / GATE_NOT_MET (process exit 1). The live acceptance gate stopped at its revision assertion.

The seed is setup only and is not counted as CREATE product E2E. CREATE was invoked with the same bounded public command accepted by the runtime HTTP API. The workflow used `zhipu-openapi/glm-5.3-flash` through `PiReasoningExecutor`; required operation: `thesis_formalize_semantic`. The disposable KB and runtime were temporary. The mounted user Knowledge Base was not touched. Evidence omits source text, extracted statements, credentials, and Raw bytes.

## Evidence stages

| Stage | Status | Evidence |
| --- | --- | --- |
| originalPublisherDiscovery | PASS | cninfo; official disclosure candidate published 2026-08-14T16:00:00.000Z |
| liveFetchNormalizeRights | PASS | CNINFO original-publisher document normalized; 832321 raw bytes; admitted for retention, AI processing and derived knowledge |
| configuredPiSourceExtraction | PASS | zhipu-openapi/glm-5.3-flash; exact returned sourceSpan matched normalized live source text (content omitted) |
| disposableGatewayEvidenceSeed | PASS | Gateway seed has 1 company scope Entity, 1 CNINFO Source/Raw and 1 source-bound canonical evidence Claim; zero Thesis/proposition Claims/edges before CREATE |
| pitRightsAndRawProof | PASS | publishedAt 2026-08-14T16:00:00.000Z <= asOf 2026-09-24T14:36:36.394Z; source rights admitted and archived Raw verified |
| createAcceptance | FAIL | CREATE_CANONICAL_REVISION_INVALID:1->1 |

## Errors / blockers

- CREATE_CANONICAL_REVISION_INVALID:1->1

## Post-run review

The HTTP CREATE workflow reached `completed`, and the script's fresh canonical
asset read passed its checks for one new active Thesis, source-bound proposition
Claims, and one active `qualifies` edge per proposition. The next assertion read
the revision from a cached `KnowledgeBaseRegistry.mount()` handle, which still
reported the seed revision. The script now uses `refresh()` for post-write
revision checks. This correction has passed typecheck, but the real run has not
been repeated after it. The recorded gate remains `GATE_NOT_MET`; Writer
revision, persisted report, identical replay, and changed-input conflict await
a fresh real acceptance run.

## Machine evidence

- `tests/validation/evidence/RHL_TL001_THESIS_LIFECYCLE_CREATE_REAL_E2E.json`
- Script: `scripts/acceptance-thesis-lifecycle-create-real.ts`
- User KB touched: `false`
- Setup seed counted as CREATE: `false`
- Secrets included: `false`
- Source body included: `false`
