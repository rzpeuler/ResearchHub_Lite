# RHL-M3B-3B-DIAG-012 — Industry Module Evidence and Validation Isolation

## Result

**COMPLETED / MODULE_TRANSPORT_BLOCKER_PROVEN / CTO REVIEW PENDING**

Evidence: [RHL_M3B_INDUSTRY_MODULE_EVIDENCE_VALIDATION_ISOLATION.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_MODULE_EVIDENCE_VALIDATION_ISOLATION.json).

The live diagnostic used the unchanged `ResearchService.startIndustryResearch()` entrypoint, the production `createIndustryProductionReasoningExecutor()` factory, `codex-cli`, `gpt-5.6-luna`, medium effort, and the current structured-output normalization. No production file was changed.

## TEST-011 acceptance and caveat

TEST-011 remains accepted as valid TEST evidence only, with final classification `REAL_MODEL_CONTRACT_BLOCKED`: production backend `codex-cli`, model `gpt-5.6-luna`, medium effort, zero automatic fallback, Eastmoney's prior rerun outcome of 12 usable normalized sources, no synthesis, blocked Application status, terminal Knowledge Base revision 0, and no canonical objects, report, or graph.

Its observability caveat is preserved. TEST-011 read `first.workflow?.modules` and `first.workflow?.gatewaySubmitCount` even though the public `startIndustryResearch()` result does not expose the internal Workflow result. Its serialized `modules: []` is not proof that no valid module ever existed. Likewise, `replay.modelCalls: 17` counts deterministic replay queue invocations; `operations.replayRealModelCalls: 0` is the authoritative real-model counter.

## Diagnostic execution

The frozen target was PCB Manufacturing / Printed Circuit Board, as of `2026-09-12T00:00:00.000Z`, with the established eight search terms. A fresh temporary Schema 0.4 / Storage Format 1 Knowledge Base and temporary report/runtime roots were used.

Provider order was CNINFO official disclosure, GDELT, Eastmoney Industry-only, and AKShare Industry acquisition. In this diagnostic environment CNINFO was empty; GDELT, Eastmoney, and AKShare failed. This is a measured provider outcome for this run and does not overwrite TEST-011's accepted prior Eastmoney result.

The real reasoning topology was one `industry_research_design` call followed by sixteen `industry_module_analysis` calls. Each of the eight modules received one non-repair call immediately followed by one existing bounded repair call. There were no non-repair Wave-2 reruns, no unknown module operations, and the 24-call cap was not approached. Synthesis was not requested because Industry Definition remained unavailable after its transport failures.

Every module request was captured at the wrapped ReasoningExecutor boundary. Both first and repair requests supplied zero evidence. No module response reached independent parser/validator success: every module call threw before a result returned with the safe category `executor_throw` and bounded message `Codex CLI returned a non-zero exit code`. This measured result proves the module transport blocker in this run; it does not prove an evidence-relevance filter blocker because Eastmoney did not produce a successful normalized source during this diagnostic.

## Failure matrix and classification

All eight modules had call count 2, repair count 1, rerun count 0, evidence counts `[0, 0]`, strong-target evidence counts `[0, 0]`, validator/parser failure counts 0, transport failure count 2, and final diagnostic state `transport_failed`. Industry Definition therefore received no evidence in either non-repair attempt, but request construction was not prevented; the transport failure is the measured dominant cause.

The aggregate classification is `MODULE_TRANSPORT_BLOCKER_PROVEN`, with next action `FIX_CODEX_MODULE_STRUCTURED_OUTPUT_TRANSPORT`. No production fix is authorized by this TEST evidence alone. If a future run again acquires strong-target sources, the classification must use the actual module request evidence list rather than acquisition availability alone.

## Mutation and privacy checks

The temporary Knowledge Base revision remained 0. `knowledgeMutation=false`, `gatewaySubmitCount=0`, `writerCommitCount=0`, and `productionCodeMutation=false`. Diagnostic termination occurred before synthesis; no Gateway, Writer, report, or graph execution was reached. No raw prompts, instructions, model prose, complete outputs, provider bodies, credentials, cookies, private absolute paths, or reasoning traces were persisted. Provider and model evidence is limited to bounded hashes, sizes, structural counters, safe IDs/hashes, and safe error summaries.

## Validation record

Focused DIAG-012 offline tests passed 7/7. `npm run typecheck` passed. The explicit live diagnostic completed with exit code 0 and wrote the evidence JSON; its measured result is a completed diagnostic, not a frozen M3B acceptance pass. Focused Skill/provider/gate/Codex tests passed 15/15, 5/5, 19/19, and 11/11; client typecheck and client build passed; `git diff --check` passed. `npm run test:node` recorded one existing Windows timing-sensitive `EBUSY` cleanup failure in `tests/plugins/reasoning/reasoning.test.ts` (775 passed, 1 failed). The subsequent full `npm test` passed client 21/21 and Node 776/776. No unrelated timing-sensitive test was edited.
