# Industry evidence routing and report-only convergence

Date: 2026-09-16

## Task closure

task_id: RHL-M3B-INDUSTRY-REAL-EVIDENCE-CONVERGENCE-20260916
status: READY_FOR_SOL_REVIEW
baseline: 8e202a0dac1045f25906d9ef4493dd0bed660c9d
branch: main
implementation_commit: c1a39bd3d716f1369e3c65211878e8a0d9c59d4e
verified_remote_tip: c1a39bd3d716f1369e3c65211878e8a0d9c59d4e
sync_status: SYNCED
- implementation_commit_note: c1a39bd (`feat: restore official industry evidence path`); report finalization is the separate documentation commit `cdac781`.
- task_input_quality: `SUFFICIENT`
- information_resolved_by_luna: `NO`
summary: Official CNINFO Industry discovery, bounded acquisition, and real seven-provider Industry validation now reach the strict READY gate with durable report and Knowledge output.
tests: npm test, typechecks, client build, parser preflight, focused regressions, and git diff check passed.
acceptance_criteria: Compound CPCA terms route independently; all eight Industry modules complete a real bounded run; malformed report-only candidates are quarantined; durable invalid inputs fail closed; repository validation passes.
governance_status: COMPATIBLE; protected canonical-write and no-fabrication boundaries preserved
blockers: None for scoped Industry acceptance; separate Daily provider coverage remains externally limited, while ReviewDecision writes and credential-dependent providers remain explicitly deferred.
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
and the seven-provider production portfolio after the module-ranking, CPCA
attachment, and official CNINFO Industry discovery fixes. The validation
entrypoint also forwards the Workflow's bounded design search terms during
Wave 1:

- parser preflight: `READY`;
- workflow: `completed`, one bounded acquisition wave;
- providers: all seven attempted; official CNINFO supplied 10, MIIT supplied 3,
  and CPCA supplied 11 qualified evidence items (24 total);
- modules: all eight returned a result (supported or partial); no module was
  `unavailable`;
- persistence: one Gateway/Writer ChangeSet, canonical reload and validation
  passed;
- report: validated 16-section Industry report generated;
- final classification: `INDUSTRY_PRODUCT_QUALITY_READY`. The report retains 21
  explicit research gaps, and no unsupported conclusion is promoted to durable
  Knowledge.

The latest completed run used implementation `c1a39bd`'s bounded CNINFO
Industry full-text search, four-way candidate acquisition concurrency, Chinese
module terms, and the existing MIIT/CPCA paths. It reached one bounded wave
with 24 qualified public evidence items and the strict `READY` classification.
The prior two-wave blocked run and non-terminating follow-ups after the
candidate-intake and Chinese-routing changes remain historical observations;
they are not used as current acceptance.

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

- `npm test`: client 27/27 and Node 987/987 passed (1014 total).
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.
- `npm run client:build`: passed; Vite emitted `dist/client`.
- `node scripts/document-parser-runtime.mjs --preflight`: `READY`.
- `npx tsx --test tests/plugins/research-acquisition/official-fix.test.ts
  tests/plugins/research-acquisition/industry.test.ts`: official Industry
  discovery/fallback and bounded candidate acquisition regressions passed
  (3/3 and 4/4).
- CPCA/Industry Skill focused tests: 36 passed, including rich-article
  attachment routing.
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
  Workflow design terms and the official CNINFO Industry route was restored.
  It reached one bounded wave and the strict classifier is READY; older
  blocked or non-terminating runs are historical context only.
- The prior candidate-intake and Chinese-routing reruns were externally
  non-terminating. The later run with official CNINFO Industry discovery and
  bounded acquisition concurrency completed and replaced the retained
  artifact with the authoritative `READY` result.
