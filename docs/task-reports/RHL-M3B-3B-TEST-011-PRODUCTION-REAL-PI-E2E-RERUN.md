# RHL-M3B-3B-TEST-011 — Production Real Pi E2E Rerun

## Conclusion

**M3B-3B REAL PI ACCEPTANCE: NOT PASS.** TEST-011 is COMPLETED with valid live evidence and the unchanged frozen evaluator classification `REAL_MODEL_CONTRACT_BLOCKED`. FIX-010 is accepted only for its additive Eastmoney provider boundary; this rerun does not support CTO acceptance of the complete M3B-3B gate.

Evidence: [RHL_M3B_INDUSTRY_PRODUCTION_REAL_PI_E2E_RERUN.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCTION_REAL_PI_E2E_RERUN.json).

## Baseline and scope

The tested baseline is FIX-010 `8a3a84ac7edbcf489d37633c6ad4dd9df4db23e5`. No production code, frozen evaluator, governance, architecture, or Git synchronization was changed. Temporary Schema 0.4 / Storage Format 1 Knowledge Base, report root, workspace, and runtime roots were used.

## Live production-equivalent execution

The first run used the Application Runtime boundary with a caller-owned ResearchService whose composition was proven equivalent to the current runtime Industry composition, in this exact order: CNINFO official disclosure, GDELT, Eastmoney Industry-only, and AKShare Industry acquisition. The reasoning path used the actual Pi boundary and `createIndustryProductionReasoningExecutor()` with `codex-cli`, `gpt-5.6-luna`, medium effort, structured output, and no fallback.

The live model started (`firstRunRealModel: true`) and made one design call plus sixteen module-analysis calls. No second real model call was made for replay (`replayRealModelCalls: 0`); the replay semantic queue consumed captured outputs only. The frozen operation bound was not completed because synthesis was never reached.

Provider outcomes were independently recorded: CNINFO empty, GDELT failed, Eastmoney succeeded with 12 usable normalized sources, and AKShare failed. Eastmoney returned the expected additive structured-data sources, including one industry board and lower-ranked concept candidates. No Eastmoney candidate became a canonical Source because Workflow stopped before Gateway. Consequently, the measured canonical Eastmoney board list is empty; the acquisition-quality caveat remains open and no unrelated concept board is counted as PCB durable evidence.

## Measured first run

Workflow status was `blocked`; revision stayed `0` (delta `0`), Gateway submissions were `0`, derived Writer commits were `0`, and canonical Entity/Relation/Claim/Source counts remained zero. No persisted report or accepted graph was produced. The measured failed frozen gates are recorded in the evidence evaluator result and are limited to the incomplete synthesis/workflow, eight module completion, Industry Definition availability, Gateway/Writer mutation, durable semantic objects, provenance, report, and graph requirements.

The numeric audit found zero unsupported observations because no structured canonical Claims were persisted. This is not treated as a semantic pass. Empty-source provenance is false. Privacy checks passed: no sentinel, raw bodies, complete prompts/outputs, credentials, cookies, private absolute paths, or reasoning traces were serialized.

## Deterministic replay

Replay used the exact captured first-run normalized source sequence through an in-memory fail-closed adapter and the ordered captured ReasoningResult queue. The queue asserted operation order; unexpected operations and waves reject. Measured replay live-network calls were `0`, and measured replay real-model calls were `0` (17 semantic queue consumptions are separately recorded). Because the first run never produced canonical semantics, replay terminal status was blocked; no canonical duplicates or revision delta were observed. This is evidence of a blocked first run, not a passing idempotency acceptance.

## Frozen evaluator and CTO recommendation

`evaluateIndustryPiGate()` was used unchanged. It returned `REAL_MODEL_CONTRACT_BLOCKED`; no gate was skipped, renamed, relaxed, or inferred. The narrowest next diagnostic is to determine why the real Industry Codex module outputs did not yield eight available validated modules and synthesis after Eastmoney evidence was admitted. If future evidence shows relevant Eastmoney data reaches canonical semantics but breadth remains insufficient, use `ADD_HIGHER_BREADTH_PUBLIC_INDUSTRY_EVIDENCE_PROVIDER`. If unrelated Eastmoney boards become sole PCB support, use `TIGHTEN_EASTMONEY_TARGET_RELEVANCE`. Do not weaken the frozen gate or add fallback model selection.

## Validation record

TEST-011 offline tests passed 8/8 and `npm run typecheck` passed. The explicit live command executed and produced the evidence above with non-zero status because the frozen acceptance failed. Focused frozen/provider/selection/Codex/Skill tests, client typecheck, client build, and `git diff --check` passed. Aggregate `npm test` passed 769/769 (the standalone `npm run test:node` run had one pre-existing Windows EBUSY timing failure in `tests/plugins/reasoning/reasoning.test.ts`; the aggregate rerun passed). No unrelated timing-sensitive test was edited.
