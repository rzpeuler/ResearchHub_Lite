# RHL-VALIDATION-001-R5 Real E2E Validation

## Validation Outcome

- Classification: `PRODUCT_DEFECT`
- Failure stage: deterministic ChangeSet validation, before Writer
- Reason: three real extracted Claims were rejected with `Claim temporal scope is not valid`. The invalid Claim data reached ChangeSet validation instead of being rejected at the earlier admissibility boundary.
- CTO acceptance: pending

## Product Baseline

- Commit: `9cc9911ba8ca0bf3001e62766e6bcc6b4e0de802`
- HEAD and `origin/main` matched before validation.
- Production paths were unchanged during validation.

## Frozen PDF

- Path: `20260805-西部证券-AI算力行业：AI算力上游材料产业链研究报告.pdf`
- Bytes: `3209114`
- SHA256: `998703cef102300518bb2edcbcc3e9bc26fa374f157b0714f3986c5028d78d63`
- Exact: yes

## Environment

- OS: Windows (`process.platform=win32`)
- Docling: `docling-local 2.116.0`
- Codex CLI: `0.152.1`
- Provider: Codex CLI
- Requested model: `gpt-5.6-luna`
- Requested reasoning effort: `high`
- Capabilities: context `100000`, output `20000`, structured output `true`, concurrency `1`
- maxOutputChars: `400000`
- timeoutMs: `900000`
- terminationGraceMs: `5000`
- forcedTerminationWaitMs: `1500`
- Windows termination strategy: bounded `taskkill /PID <pid> /T /F`

## Initial KB

- ID: `kb-rhl-validation-001-r5`
- Schema: `0.3`
- Storage: `1`
- Revision: `0`
- Validation: passed
- Initial counts: ThemeGroups `0`, Entities `0`, Relations `0`, Claims `0`, Sources `0`, Modules `0`
- No R1–R4 Knowledge was seeded.

## Parse

- Pages: `103`
- Sections: `159`
- Blocks: `1523`
- Characters: `97784`
- Tables: `44`
- Headings: `158`
- Lists: `27`
- Captions: `63`
- Warnings: `0`
- Duration: `106578ms`

## Plan

- Attempts: `1`
- Accepted attempt: `1`
- Units: `18`
- Primary blocks: `1441` (`94.62%`)
- Excluded blocks: `82` (`5.38%`)
- Primary/excluded overlap count: `0`
- Coverage: passed; primary ∪ excluded covered all `1523` blocks
- Capacity: passed
- Context refs: `19`; context blocks: `129`

## Extraction

- Units: `18`
- Completed: `18`
- Failed: `0`
- Retries: `0`
- Raw Entities: `562`
- Raw Relations: `502`
- Raw Claims: `235`
- Rejected: `53`
- Plan reasoning calls: `1`
- Extraction reasoning calls: `18`
- All Plan/Extraction calls completed with requested Luna High configuration.
- Peak concurrency: `1`

## Timeout Observations

- Timed-out calls: `0`
- No R4-style timeout occurred.
- All 19 recorded real reasoning calls completed within `900000ms`.
- Timeout contract was not exercised by a real timeout in this run; offline timeout/process-tree regressions remain passed.

## Consolidation

- Consolidated Entities: `562`
- Consolidated Relations: `502`
- Consolidated Claims: `235`
- Total consolidated candidates: `1195`
- Candidate outputs were passed into Knowledge Resolution.
- Full duplicate/alias anomaly report was not completed because ChangeSet validation blocked before final evidence assembly.

## Knowledge Resolution

- Consolidated candidates reaching Knowledge Resolution: `1195`
- Fresh-KB BoundExisting target: `0`
- Semantic case count: `0`
- Semantic case calls: `0`
- Semantic case ratio: `0%`
- EntityBindingCase / RelationConflictCase / ClaimConflictCase: `0 / 0 / 0`
- No post-extraction semantic reasoning was required for the empty KB.

## ResolutionIntent / ChangeSet

- ResolutionIntent barrier: no barrier error was observed.
- ChangeSet validation: failed with `3` errors, all `Claim temporal scope is not valid`.
- Unresolved planned-ref leak count: not evaluated after validation failure.
- Writer invocation count: `0`
- No canonical mutation was persisted; KB revision remained `0`.

## ReviewSummary

- Total: `301`
- Root: `111`
- Dependency: `190`
- By category: invalid_reference `50`, invalid_semantics `1`, reconciliation_review `229`, other `21`; relation_cardinality/schema_gap/theme_creation/theme_ambiguity `0`
- By kind: Entity `84`, Relation `140`, Claim `77`, workflow-level `0`

## Reload / Provenance / Final Validation

- Reload after primary commit: not reached because Writer was not invoked.
- Final full KB validation: not reached.
- Claim provenance chain validation: not reached.
- Relation provenance validation: not reached.
- Final KB remained the validated empty initial KB.

## Density

- Raw Entity candidates / 100 Blocks: `36.9`
- Raw Relation candidates / 100 Blocks: `33.0`
- Raw Claim candidates / 100 Blocks: `15.4`
- Consolidated candidates / 100 Blocks: `78.46`
- Final durable-object density: not applicable because Writer did not execute.
- R2/R3/R4 raw-count differences are comparison-only and do not establish semantic quality.

## Replay

- Executed: no
- Reason: primary validation stopped before a successful commit; exact replay was not authorized.
- Reasoning deltas: not applicable
- Writer mutation delta: not applicable

## Ten Mandatory Answers

- Q1: Yes. Luna High completed the single accepted Plan call and all 18 Extraction calls.
- Q2: No. No real Reasoning call timed out.
- Q3: `1195` consolidated candidates reached Knowledge Resolution.
- Q4: `0` Semantic Resolution Cases were required.
- Q5: `0 / 1195 = 0%`.
- Q6: Not evaluated after ChangeSet validation failed; no successful ChangeSet was available for final planned-ref accounting.
- Q7: No. Writer executed `0` times because ChangeSet validation failed.
- Q8: Initial full KB validation passed; final post-write validation was not reached.
- Q9: Not evaluated because no durable Claims were written.
- Q10: No. Exact Replay was not executed because primary did not commit.

## Historical Evidence

- R1 unchanged: yes
- R2 unchanged: yes
- R3 unchanged: yes
- R4 unchanged: yes
- Timeout smoke unchanged: yes

## Governance / Architecture

- Governance status updated to record R5 as executed / `PRODUCT_DEFECT` / CTO acceptance pending.
- Frozen architecture unchanged.
- No production code was modified by the R5 validation task.

## Next Recommended Task

Do not begin automatically. CTO should authorize a separate remediation task for the Claim temporal-scope admissibility contract before any new R5 attempt.
