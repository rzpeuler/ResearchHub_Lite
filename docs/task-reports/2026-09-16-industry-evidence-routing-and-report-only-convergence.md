# Industry evidence routing and report-only convergence

Date: 2026-09-16

## Task closure

- task_id: `RHL-M3B-INDUSTRY-REAL-EVIDENCE-CONVERGENCE-20260916`
- status: `READY_FOR_SOL_REVIEW`
- baseline: `8e202a0dac1045f25906d9ef4493dd0bed660c9d`
- branch: `main`
- implementation_commit: `pending`
- verified_remote_tip: `pending`
- sync_status: `READY_TO_SYNC`
- task_input_quality: `SUFFICIENT`
- information_resolved_by_luna: `NO`
- governance_status: `COMPATIBLE; protected canonical-write and no-fabrication boundaries preserved`
- blockers: `Strict Industry product-quality evidence depth remains open: the fresh real run has 19 explicit gaps and provider results include rate limits or bounded bridge failures. No safe code-only change can invent the missing public evidence.`
- scope_deviations: `The requested full mission is not claimed complete while the external Industry evidence gate remains open; ReviewDecision writes remain design-only and credential-dependent providers remain deferred.`

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

The CPCA Industry acquisition path now tokenizes compound target terms while
retaining the original phrases. This lets public PCB articles match
independently on terms such as `PCB`, `AI`, and `HDI` instead of requiring one
article title to contain an entire compound query.

Industry module reasoning now supports an explicit, bounded report-only mode
for evidence-sensitive chain and company analysis. When a model response
declares `reportMaterial.reportOnly=true`, malformed semantic candidates are
quarantined while evidence IDs, bounded analysis, gaps, and report material
remain subject to strict validation. Evidence escapes, malformed quantitative
values, canonical/resolution fields, and direct durable-gate inputs still fail
closed. Canonical mutation remains exclusively through Gateway, ChangeSet,
and Writer.

## Fresh real validation

`TEST-054` was rerun with the configured Pi reasoning host, managed Docling,
and the seven-provider production portfolio:

- parser preflight: `READY`;
- workflow: `completed`, two bounded acquisition waves;
- providers: all seven attempted; MIIT and CPCA supplied qualified evidence;
- modules: all eight returned, with no `unavailable` module;
- persistence: one Gateway/Writer ChangeSet, canonical reload and validation
  passed;
- report: validated 16-section Industry report generated;
- final classification: `INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE` because
  19 explicit evidence gaps remain. This is recorded as an open evidence
  depth gate, not converted into a success claim.

The evidence artifact is
`tests/validation/evidence/RHL_M3B_INDUSTRY_SEVEN_PROVIDER_PRODUCT_QUALITY_AFTER_DOCLING_READY.json`.

## Regression coverage

- CPCA compound-term routing regression added.
- Industry report-only proposal isolation regression added.
- Existing invalid durable Relation/Claim, quantitative, canonical, and
  unresolved-link tests remain fail-closed.
- Focused Industry Skill tests: 25 passed.
- Final full repository/client/typecheck/build results are recorded with the
  commit that contains this report.

No fixture or placeholder was used as production evidence, and no raw model
response, credential, or private reasoning was added to the evidence file.

## Changes and decisions

- Added tokenized matching for compound CPCA target terms while retaining
  phrase matching and generic-term filtering.
- Added a narrowly gated report-only proposal-isolation path after one repair
  attempt; it is available only when the model explicitly marks the result as
  report-only and never relaxes evidence, quantitative, canonical, or
  resolution validation.
- Added focused tests for both behaviors and retained the existing fail-closed
  durable proposal contract.

## Validation

- `npm test`: 981 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.
- `npm run client:build`: passed; Vite emitted `dist/client`.
- `node scripts/document-parser-runtime.mjs --preflight`: `READY`.
- `npx tsx --test tests/plugins/research-acquisition/cpca-industry.test.ts`:
  8 passed.
- `npx tsx --test tests/skills/industry-research/industry-research-skill.test.ts`:
  25 passed.
- `git diff --check`: passed.

## Debugging and risks

- CPCA discovery originally treated compound search terms as indivisible;
  public PCB pages therefore failed to route. Tokenized terms closed that
  routing defect without weakening URL or content checks.
- The live run proves workflow, persistence, canonical reload, and report
  generation, but not strict product-quality completeness. The remaining
  evidence-depth gaps are an external data-coverage risk and must stay visible.
