# Thesis lifecycle CREATE acceptance

Date: 2026-09-25

Task: `RHL-TL-001`

Classification: isolated v0.4 source/evidence setup followed by the normal authenticated HTTP CREATE route and configured Pi Thesis Formalize operation. The temporary seed contains a company scope Entity, one live original-publisher Source/Raw, and one source-bound canonical evidence Claim. It contains no Thesis, generated proposition Claim, or `qualifies` membership edge before product CREATE.

## Result

EXECUTED / PASS GATE (process exit 0). Workflow `tl001-create-1790307598048` ended `completed`. Thesis thesis:96a196f509ff522a; 1 generated proposition Claim(s), 1 `qualifies` edge(s); Writer run tl001-create-1790307598048; revision 1 -> 2. Identical replay: true; changed-input conflict: true.

The seed is setup only and is not counted as CREATE product E2E. CREATE was invoked with the same bounded public command accepted by the runtime HTTP API. The workflow used `zhipu-openapi/glm-5.3-flash` through `PiReasoningExecutor`; required operation: `thesis_formalize_semantic`. The disposable KB and runtime were temporary. The mounted user Knowledge Base was not touched. Evidence omits source text, extracted statements, credentials, and Raw bytes.

## Evidence stages

| Stage | Status | Evidence |
| --- | --- | --- |
| originalPublisherDiscovery | PASS | cninfo; official disclosure candidate published 2026-08-14T16:00:00.000Z |
| liveFetchNormalizeRights | PASS | CNINFO original-publisher document normalized; 832321 raw bytes; admitted for retention, AI processing and derived knowledge |
| configuredPiSourceExtraction | PASS | zhipu-openapi/glm-5.3-flash; exact returned sourceSpan matched normalized live source text (content omitted) |
| disposableGatewayEvidenceSeed | PASS | Gateway seed has 1 company scope Entity, 1 CNINFO Source/Raw and 1 source-bound canonical evidence Claim; zero Thesis/proposition Claims/edges before CREATE |
| pitRightsAndRawProof | PASS | publishedAt 2026-08-14T16:00:00.000Z <= asOf 2026-09-25T03:39:57.894Z; source rights admitted and archived Raw verified |
| normalHttpCreateWithPi | PASS | POST /api/production/thesis-lifecycle/create completed workflow tl001-create-1790307598048; configured Pi executed thesis_formalize_semantic |
| canonicalThesisClaimsAndMembership | PASS | fresh reload contains Thesis thesis:96a196f509ff522a, 1 new active source-bound Claim(s), and one active qualifies edge per proposition |
| gatewayWriterRevision | PASS | Gateway/Writer advanced revision 1 -> 2; workflow run tl001-create-1790307598048 |
| durableReport | PASS | thesis_lifecycle report thesis-lifecycle-tl001-create-1790307598048 validated via service and reloaded from its persisted JSON file |
| identicalReplay | PASS | same run ID and identical input returned the completed result; no second Pi call or canonical revision change |
| changedInputConflict | PASS | same run ID with a changed narrative returned HTTP 409 and left canonical state unchanged |

## Errors / blockers

- None.

## Machine evidence

- `tests/validation/evidence/RHL_TL001_THESIS_LIFECYCLE_CREATE_REAL_E2E.json`
- Script: `scripts/acceptance-thesis-lifecycle-create-real.ts`
- User KB touched: `false`
- Setup seed counted as CREATE: `false`
- Secrets included: `false`
- Source body included: `false`
