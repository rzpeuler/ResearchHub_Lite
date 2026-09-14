# TEST-031 — Production Portfolio Real Pi E2E After Synthesis Fix

## Result

Final classification: `PORTFOLIO_E2E_PARTIAL_EVIDENCE_ACCEPTED`.

Baseline: `a613a3bdce22053a2c24a679097765118120c1a4`.

The single fresh production run completed through the real Pi/Codex path. It reached the Knowledge Production Gateway, one Writer revision, and the sixteen-section `industry_research` report. The two-call synthesis path was observed, consistent with one bounded repair. The milestone is functionally complete, but current public-source availability yielded only CPCA coverage and no non-root durable semantic object, so the stronger accepted classification is not met.

## Codex preflight and production composition

Preflight passed in the same fresh process: sanitized resolver source `environment`, executable kind `native`, discovered `true`, version available `true` (`codex-cli 0.154.0`), and help available `true`. No executable path, environment dump, credentials, cookies, tokens, or authentication state was persisted.

The frozen provider order was exercised: official disclosure, GDELT, MIIT, Gov.cn, Eastmoney, CPCA, and AKShare. Official disclosure, MIIT, and Gov.cn were empty; GDELT returned HTTP 429; Eastmoney and AKShare had bounded fetch failures; CPCA succeeded with two usable normalized results. These upstream outcomes are evidence scarcity/external transport conditions, not a project-controlled defect.

## Live run and synthesis audit

The live run used the production Industry reasoning backend with GPT-5.6 Luna medium reasoning. Sanitized operation counts were: one `industry_research_design`, nine `industry_module_analysis` calls (eight modules with one bounded gap rerun), and two `industry_cross_module_synthesis` calls. No third synthesis call occurred. Acquisition used two bounded waves. All eight frozen module identities were represented in the final audit.

## Gateway, Knowledge, and provenance

The run completed with one Gateway submission, one Writer commit, and revision delta one. The canonical store contains one Industry root and one Source; no module independently persisted canonical Knowledge. The Source has Raw provenance and the Raw audit resolved successfully. Unsupported durable numeric assertions: zero. The graph is intentionally conservative: no durable Relation or Claim was promoted from the available evidence.

## Report audit

The persisted report type is `industry_research` and contains exactly sixteen frozen sections: Executive Industry View; Industry Scope & Definition; Market Size & Growth; Demand Structure & Drivers; Supply, Capacity & Utilization; Supply-Demand Balance & Pricing; Industry Chain Map; Value Capture & Industry Economics; Competitive Landscape; Technology & Product Roadmap; Company Mapping & Exposure; Catalysts; Risks & Invalidation Conditions; Key Metrics & Monitoring; Research Gaps & Alternative Views; Methodology & Provenance.

The report exposes gaps, unavailable evidence, alternative views, methodology, and provenance rather than filling missing areas with unsupported facts.

## Deterministic replay

Exactly one replay was performed using captured normalized acquisition data and captured structured reasoning outputs. Replay made zero additional model calls and zero additional live acquisition-provider calls, kept revision delta at zero, preserved the Industry root identity, and introduced no semantic duplicate Entity, Relation, Claim, or Source. Replay status was `completed` and the graph projection hash remained stable.

## Privacy and validation

Evidence is sanitized: raw bodies, complete prompts, complete model outputs, reasoning traces, private paths, credentials, cookies, and tokens are not persisted. Temporary Knowledge Base and report directories were created outside the repository and were not committed.

The offline TEST-031 suite passed all five tests. The live evidence JSON is [RHL_M3B_INDUSTRY_PRODUCTION_PORTFOLIO_REAL_PI_E2E_AFTER_SYNTHESIS_FIX.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCTION_PORTFOLIO_REAL_PI_E2E_AFTER_SYNTHESIS_FIX.json).

## Residual gaps

The run does not establish multi-provider durable semantic density: only CPCA supplied usable evidence, and the conservative Gateway persisted no non-root Claim or Relation. This is an explicit evidence-coverage limitation, not a synthesis convergence failure.

## Recommended next step

Accept the functional milestone with the explicit evidence-coverage limitation, then perform product-quality/module-gap review before authorizing additional source work.
