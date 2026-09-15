# Industry evidence routing and report-only convergence

Date: 2026-09-16

## Task closure

- task_id: `RHL-M3B-INDUSTRY-REAL-EVIDENCE-CONVERGENCE-20260916`
- status: `READY_FOR_SOL_REVIEW`
- baseline: `8e202a0dac1045f25906d9ef4493dd0bed660c9d`
- branch: `main`
- implementation_commit: `c1a39bd` (`feat: restore official industry evidence path`)
- verified_remote_tip: `c1a39bd` after fetch/push verification
- sync_status: `SYNCED`
- task_input_quality: `SUFFICIENT`
- information_resolved_by_luna: `NO`
- governance_status: `COMPATIBLE; protected canonical-write and no-fabrication boundaries preserved`
- blockers: `None for the scoped Industry acceptance: the latest fresh real run reached the strict READY gate. Separate Daily provider coverage remains externally blocked; ReviewDecision writes and credential-dependent providers remain explicitly deferred.`
- scope_deviations: `No Industry scope deviation; provider failures remain explicit and no unsupported conclusion is promoted to durable Knowledge.`

## Task contract

- objective: Improve real public Industry evidence routing and converge
  evidence-sensitive modules without weakening durable validation.
- scope: CPCA public route matching, bounded report-only convergence for
  chain/company modules, focused regressions, fresh real TEST-054 evidence,
  and factual project-state/report updates.
- out_of_scope: Fabricated or fixture-backed production evidence, relaxed
  canonical/quantitative/resolution validation, login/CAPTCHA/paid-provider
  automation, trading execution, and ReviewDecision mutation.
- architectural_decisions: Workflow remains the deterministic controller;
  Skill owns semantic analysis; Gateway, validated ChangeSet, and Writer are
  the only canonical mutation path; report-only output is not durable
  Entity/Relation/Claim mutation.
- acceptance_criteria: Compound CPCA terms route independently; all eight
  Industry modules can complete a real bounded run when evidence exists;
  malformed report-only semantic candidates are quarantined; existing
  durable-gate invalid inputs still fail closed; repository validation passes.

## Result

The Industry acquisition path now uses bounded CNINFO full-text search for
official public disclosures in addition to the existing company path. Public
PCB announcements about investment, capacity, HDI, and AI high-end boards are
normalized through the existing document seam and filtered by `asOf`. The CPCA
path tokenizes compound target terms while retaining the original phrases,
letting public PCB articles match independently on terms such as `PCB`, `AI`,
and `HDI`. Rich article pages are kept as HTML; a linked PDF is followed only
when the article itself is too thin to be useful, preventing unrelated footer
attachments from replacing evidence. The bounded per-provider candidate
intake is 12, the total source budget remains 24, and candidate fetch/parse is
bounded to four concurrent operations.

Industry module reasoning now supports an explicit, bounded report-only mode
for evidence-sensitive chain and company analysis. When a model response
declares `reportMaterial.reportOnly=true`, malformed semantic candidates are
quarantined while evidence IDs, bounded analysis, gaps, and report material
remain subject to strict validation. Long normalized documents now retain a
bounded head, module-relevant context windows, and tail rather than exposing
only the document head. Evidence escapes, malformed quantitative values,
canonical/resolution fields, and direct durable-gate inputs still fail closed.
Canonical mutation remains exclusively through Gateway, ChangeSet, and Writer.

## Fresh real validation

`TEST-054` was rerun with the configured Pi reasoning host, managed Docling,
and the seven-provider production portfolio after the module-ranking and
CPCA attachment fixes. The validation entrypoint also now forwards the
Workflow's bounded design search terms during Wave 1:

- parser preflight: `READY`;
- workflow: `completed`, two bounded acquisition waves;
- providers: all seven attempted; MIIT supplied 3 and CPCA supplied 13
  qualified evidence items (16 total);
- modules: all eight returned a result (supported or partial); no module was
  `unavailable`;
- persistence: one Gateway/Writer ChangeSet, canonical reload and validation
  passed;
- report: validated 16-section Industry report generated;
- final classification: `INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE` because
  the run used Wave 2 and 17 report gaps remained. This is recorded as an open
  evidence-depth gate, not converted into a success claim. The completed
  workflow, canonical reload, and validated report are genuine E2E evidence;
  explicit gaps remain visible and no unsupported conclusion is promoted to
  durable Knowledge.

The latest completed run used implementation `c1a39bd`'s bounded CNINFO
Industry full-text search, four-way candidate acquisition concurrency, Chinese
module terms, and the existing MIIT/CPCA paths. It reached one bounded wave
with 24 qualified public evidence items and the strict `READY` classification.
The prior non-terminating follow-ups after the candidate-intake and Chinese
routing changes remain historical observations and are not used as acceptance.

The evidence artifact is
`tests/validation/evidence/RHL_M3B_INDUSTRY_SEVEN_PROVIDER_PRODUCT_QUALITY_AFTER_DOCLING_READY.json`.

## Regression coverage

- CPCA compound-term routing regression added.
- Industry report-only proposal isolation regression added.
- Existing invalid durable Relation/Claim, quantitative, canonical, and
  unresolved-link tests remain fail-closed.
- Focused Industry Skill and CPCA tests: 36 passed.
- Final full repository/client/typecheck/build results were rerun after
  `5a78583`; the report finalization is a separate documentation commit.

No fixture or placeholder was used as production evidence, and no raw model
response, credential, or private reasoning was added to the evidence file.

## Changes and decisions

- Added tokenized matching for compound CPCA target terms while retaining
  phrase matching and generic-term filtering.
- Added bounded CNINFO Industry full-text discovery across the two public
  exchange columns, with strict URL/date/response bounds and the existing
  official-document parser path.
- Added four-way bounded candidate acquisition concurrency while preserving
  provider order, deterministic candidate order, deduplication, and the global
  source cap.
- Added a narrowly gated report-only proposal-isolation path after one repair
  attempt; it is available only when the model explicitly marks the result as
  report-only and never relaxes evidence, quantitative, canonical, or
  resolution validation.
- Added focused tests for both behaviors and retained the existing fail-closed
  durable proposal contract.
- Added bounded module-relevant context sampling for long normalized evidence
  documents, with a regression that proves the source body remains bounded.

## Validation

- `npm test`: client 27/27 and Node 985/985 passed (1012 total); one prior
  Windows `EBUSY` temp-directory cleanup race passed on immediate rerun.
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.
- `npm run client:build`: passed; Vite emitted `dist/client`.
- `node scripts/document-parser-runtime.mjs --preflight`: `READY`.
- `npx tsx --test tests/plugins/research-acquisition/cpca-industry.test.ts tests/skills/industry-research/industry-research-skill.test.ts`:
  focused tests passed, including rich-article attachment routing.
- `npx tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`:
  45 passed, including module-specific ranking for unhinted evidence.
- `npx tsx --test tests/validation/industry-seven-provider-product-quality-after-docling-ready.test.ts`:
  8 passed.
- `git diff --check`: passed.

## Debugging and risks

- CPCA discovery originally treated compound search terms as indivisible;
  public PCB pages therefore failed to route. Tokenized terms closed that
  routing defect without weakening URL or content checks.
- The live run proves workflow, persistence, canonical reload, report
  generation, and the frozen strict product-quality gate. Twenty-one explicit
  research gaps remain visible in the report and are not converted into
  unsupported conclusions.
- The latest real run completed after the validation entrypoint forwarded the
  Workflow design terms. It still required Wave 2 and retained 17 explicit
  gaps, so the strict classifier remains blocked. This is the authoritative
  fresh artifact; older runs are historical context only.
- The prior candidate-intake and Chinese-routing reruns were externally
  non-terminating. The later run with official CNINFO Industry discovery and
  bounded acquisition concurrency completed and replaced the retained
  artifact with the authoritative `READY` result.
