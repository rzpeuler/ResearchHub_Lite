# RHL-M3B-2 Industry Research Skill and Workflow

Status: **IMPLEMENTED / CTO ACCEPTANCE PENDING**

## Baseline and scope

- Baseline requested and verified: `65eb55d0f9d2b4e19368b67468e0fd891557d7da`.
- Working tree was synchronized with that baseline before implementation; commit, push, amend, rebase, and force-push were not performed because the orchestrator owns Git synchronization.
- Changes are limited to the approved Skill, Workflow, report service/tests, and this report.

## Implementation

One `skills/industry-research/` Skill contains exactly these eight modules: Industry Definition, Market Size & Growth, Supply Demand Analysis, Industry Chain Analysis, Competitive Landscape, Technology Evolution, Company Mapping, and Risk Analysis. Its exact bounded operations are `industry_research_design`, `industry_module_analysis`, and `industry_cross_module_synthesis`. Model output uses local proposal/evidence keys only; canonical IDs, ChangeSets, Writer actions, paths, and storage mutations remain outside the Skill.

`workflows/industry-deep-research/` implements the frozen sixteen stages in order. Acquisition is a narrow injected wave seam returning normalized sources. Wave 1 is once; Wave 2 is once and only for actionable gaps; only affected modules are rerun. Evidence is qualified for usable content, rights, deduplication, and `asOf`. Existing Knowledge is projected shallowly and bounded. The workflow consolidates candidates, applies deterministic admissibility checks, submits one producer-neutral Gateway bundle, and assembles the report from canonical mappings.

The report service now accepts `industry_research`, renders `Industry Research`, and validates optional canonical `relationRefs` while preserving existing report types.

## Contract and safety evidence

- Research Design includes target diagnosis, scope, all eight questions, metrics, evidence requirements, bounded search terms, gaps, and verification candidates.
- Theme, Product, Technology, and uncertain diagnoses fail closed before acquisition or Gateway submission.
- Module outputs reject canonical-looking IDs, unknown evidence IDs, malformed quantitative values, unsupported proposal kinds, and unresolved local links. A module receives at most one repair attempt; repeated invalid output becomes unavailable with an explicit gap.
- Durable candidates are deduplicated; invalid/weak relation and quantitative candidates are dropped with diagnostics. `supplier_of` requires tier-1/2 evidence containing direct supplier/manufacturing language.
- Gateway remains the only canonical mutation authority. Relation and Claim mappings are surfaced through the result and report material.

## Validation evidence

Focused tests cover exact operations, eight modules, bounded validation, target diagnosis, repair bounds, report title/provenance, eight-module execution, no-gap Wave-2 skip, cancellation, one Gateway submission, and exactly sixteen code-owned report sections.

Exact validation results in this worktree:

- `node --import tsx --test tests/skills/industry-research/industry-research-skill.test.ts`: **3 passed**.
- `node --import tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`: **2 passed**.
- `node --import tsx --test tests/app/services/research-report.test.ts`: **3 passed**.
- `npm run typecheck`: **passed**.
- `npm run client:typecheck`: **passed**.
- `npm run test:node`: **594 passed, 0 failed**.
- `npm test`: **client 21 passed, Node 594 passed, 0 failed**.
- `npm run client:build`: **passed**.
- `git diff --check`: **passed**; Git emitted only normal LF/CRLF working-copy warnings.

## M3B-3 boundary and limitations

Live/free acquisition composition, Application/Pi actions, Real Pi E2E, and Graph acceptance remain M3B-3. No Plugin contract, Application Service endpoint, Pi integration, schema migration, Graph integration, nested Company Research, or new provider architecture was added. The implementation uses the existing Gateway contract; deeper adversarial gate coverage and CTO acceptance remain pending review.

## Governance gaps and blockers

No governance conflict or external setup blocker was encountered. The existing ReasoningExecutor union does not yet register the three Industry operation literals, so the implementation passes them as a bounded runtime operation string without changing the out-of-scope Plugin/reasoning contract. Orchestrator-owned commit and remote synchronization remain pending.
