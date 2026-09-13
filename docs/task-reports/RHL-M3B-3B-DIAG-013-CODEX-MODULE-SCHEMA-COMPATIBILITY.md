# RHL-M3B-3B-DIAG-013 — Codex Module Schema Compatibility

## Result

DIAG-012 is accepted as TEST evidence only: its measured topology remains `Design=1`, `Module=16` (one bounded repair immediately after each of eight module attempts), all module calls failed pre-semantic with Codex non-zero exit, synthesis was not requested, and terminal Knowledge revision remained 0. Its acquisition limitation is recorded separately: CNINFO was empty and GDELT/Eastmoney/AKShare failed, so DIAG-012 does not establish an evidence-relevance blocker. The zero-evidence frozen Module contract was nevertheless constructed and sent.

DIAG-013 executed the approved production Industry Codex executor with `codex-cli`, `gpt-5.6-luna`, medium reasoning effort, read-only sandbox, and structured output enabled. It made exactly eight real calls, with no acquisition, ResearchService, Workflow, Knowledge, Gateway, Writer, synthesis, or repair-loop execution.

## Contract and structural evidence

The authoritative `createIndustryModuleResultContract('industry_definition', [])` was imported read-only. Its privacy-safe source fingerprint is `9d2c118931979c45` (6,341 bytes); the source was byte-identical before and after all TEST-only transformations. The current production normalizer fingerprint is `afdce2f01f414709` (4,585 bytes), with four strengthened objects.

Baseline structural counts were: 4 untyped primitive const nodes, 5 enum nodes without explicit type, 1 oneOf node, 1 anyOf node, 1 completely empty schema-object leaf, 7 object nodes with properties, and 4 currently normalized strengthened objects. No complete schema was persisted.

The TEST-only helpers are deterministic, source-immutable, and idempotent. Primitive const inference handles string, boolean, integer, finite non-integer number, and null, while refusing object/array const values. Guarded oneOf conversion acts only on strict unique discriminator const variants and only for the permitted `entity|relation|claim` set. Structured-value normalization acts only on the exact empty `structuredValue.value` leaf and supplies the validator’s finite scalar domain.

## Probe path and conclusion

The baseline full Module probe failed pre-semantic with `unknown_nonzero_exit`. The controlled minimal differential then showed untyped const failure and typed const semantic success, proving `primitiveConstTypeRequirementDifferential`. The full Module with only primitive const typing still failed pre-semantic. The controlled nested differential showed oneOf failure and equivalent anyOf success, proving `nestedOneOfDifferential`. The full Module with the proven transformations still failed pre-semantic; adding the exact structured-value leaf normalization also failed pre-semantic. No parser or authoritative Module validator success occurred for a full Module probe.

Aggregate classification: `KNOWN_MODULE_SCHEMA_DELTAS_INSUFFICIENT`.

Next action: `REVIEW_NEXT_CODEX_MODULE_SCHEMA_DELTA`. This TEST does not authorize speculative production normalization. In particular, it does not authorize treating the empty `{}` leaf as independently proven, nor combining further unproven transformations. A subsequent bounded diagnostic is required before any implementation task.

## Safety and validation

Evidence records `actualCallCount=modelCallCount=8`, `acquisitionCalls=0`, `knowledgeMutation=false`, `gatewaySubmitCount=0`, `writerCommitCount=0`, and `productionCodeMutation=false`. Prompts, full inputs, schemas, outputs, stdout/stderr, JSONL, credentials, private paths, and reasoning traces were not persisted. Only the two controlled differentials and bounded structural summaries are retained.

The DIAG-013 offline tests passed, including helper behavior, immutability/idempotence, structural counting, and bounded state-machine branches. The explicit diagnostic produced valid evidence despite non-zero Codex exits; those exits are TEST evidence, not task failure. Full deterministic repository regression results are reported in the orchestrator handoff.
