# RHL-M3B-3B-DIAG-001 — Pi Provider Sensitive Isolation

## CTO decision

FIX-002 at `d22d10a9eef01bbd98e317806857a10cf5f4eb9f` is accepted for its deterministic Industry contract and diagnostic-harness hardening scope. The current Research Design, module, and synthesis contracts; stable validation diagnostics; explicit repair path; evidence metadata correction; numeric audit correction; and non-vacuous provenance gate were not modified by this diagnostic.

M3B-3B final Real Pi acceptance remains **NOT CTO PASS**. This bounded diagnostic did not execute the Workflow, module wave, Gateway/Writer, report, graph, or deterministic replay, and therefore cannot establish those acceptance predicates.

## Bounded execution

The script captured the first `IndustryResearchSkill.design()` request through a deterministic executor seam, verified its operation and contract against the current Industry exports, and persisted only hashes, sizes, and key summaries. The target was PCB Manufacturing with alias Printed Circuit Board and empty Existing Knowledge. The alternate request changed only the target identity to Household Appliance Manufacturing.

Actual call order was:

1. Primary `zhipu-openapi/glm-5.3-flash` neutral JSON control: `success`.
2. Primary exact PCB Design request: `sensitive`, sanitized as `finish_reason:sensitive`.
3. Primary alternate-target Design request: valid JSON and valid Industry Design, with `targetKind: industry`.

No alternative model was currently available in the local ModelRuntime snapshot, so no alternative calls were made. The maximum five-call bound was respected; three calls occurred and no repair, acquisition, Gateway, Writer, report, graph, or Knowledge operation was invoked.

## Classification and next action

Final classification: `PRIMARY_TARGET_SENSITIVE_BLOCK`.

The neutral control proves the primary runtime completed a harmless request in this session, so this is not classified as a general provider outage. The exact PCB request was safety-terminated, while the ordinary benign alternate target completed and validated under the same primary model and session. This isolates the observed failure as target/request-sensitive, while the absence of an available alternative prevents narrowing the model/provider dimension further.

`nextActionCategory`: `REVIEW_DESIGN_REQUEST_BOUNDARY`.

This is diagnostic evidence only. It does not authorize model selection, failover, prompt-boundary, contract, or acceptance-gate changes. If a later bounded run obtains a valid exact Design completion, the existing full M3B-3B Real Pi gate should be rerun without production changes.

## Privacy and mutation checks

The generated evidence contains no complete requests, prompts, contracts, model responses, credentials, authorization material, cookies, user-home paths, or private local paths. It contains bounded provider/model identifiers, outcome classes, hashes, sizes, and public enum/key summaries only.

No canonical Knowledge Base, Gateway, Writer, ResearchReport, or graph mutation was performed. The frozen M3B-3B Real Pi evidence file was not overwritten.

Evidence: `tests/validation/evidence/RHL_M3B_INDUSTRY_PI_PROVIDER_DIAGNOSTIC.json`.

## Validation

The diagnostic unit tests passed 7/7; Industry Skill tests passed 15/15; the frozen M3B-3B gate tests passed 19/19; repository typecheck, client typecheck, client build, and `git diff --check` passed. The focused valuation-route rerun passed 1/1. A parallel full regression observation had one timing-sensitive valuation-route failure (`running` versus expected `blocked`), while the subsequent focused rerun passed; no diagnostic or production behavior was changed for it.
