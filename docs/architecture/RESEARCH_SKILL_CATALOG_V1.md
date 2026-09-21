# ResearchHub Lite — Research Skill Catalog v1

This is the canonical roadmap for the single-level Research Skill architecture.
`Runtime` means currently executable and registered. `PARTIAL` and `PLANNED`
entries are intentionally not runtime registered.

| Skill | Domain | Research question | Status | Runtime | Existing source / owner | Migration action |
| --- | --- | --- | --- | --- | --- | --- |
| `evidence_normalization` | Evidence | How should supplied evidence be normalized and bounded? | PARTIAL | No | Existing provider/workflow normalization | Keep as Workflow/helper responsibility until independent contract is extracted |
| `document_change_analysis` | Evidence | What changed between two attributable documents? | PLANNED | No | No stable implementation | Future document-diff wave |
| `business_model_map` | Company Economics | How does the company make money? | IMPLEMENTED | Yes | Company Research Business Model section | Evidence-gated standalone methodology |
| `business_driver_analysis` | Company Economics | What drives consolidated revenue/profit? | IMPLEMENTED | Yes | `skills/business_driver_analysis/calculations.ts` | Direct period-aligned driver decomposition with explicit residuals |
| `unit_economics` | Company Economics | What measurable economic unit explains the business? | IMPLEMENTED | Yes | `skills/unit_economics/calculations.ts` | Direct explicit-unit, per-unit, growth, and operating-leverage calculations |
| `management_execution` | Company Economics | How has management executed against commitments? | IMPLEMENTED | Yes | `skills/management_execution/` | Explicit commitment-to-outcome comparison; no personality scoring |
| `capital_allocation_review` | Company Economics | How has capital been allocated and with what result? | IMPLEMENTED | Yes | `skills/capital_allocation_review/` | Explicit capital metrics and return/hurdle assessment |
| `market_structure_analysis` | Industry | What is the structure and boundary of the market? | IMPLEMENTED | Yes | `skills/market_structure_analysis/` | Explicit boundary, segmentation, sizing methodology, and value-chain result |
| `industry_supply_demand_cycle` | Industry | What drives capacity, inventory, pricing, and cycle? | PARTIAL | No | Industry Supply Demand module | Preserve missing cycle depth; do not claim Wave 3 completion |
| `competitive_market_map` | Industry | Who competes and how is the market positioned? | PARTIAL | No | Industry Competitive Landscape and Company Mapping modules | Extract bounded map later |
| `consensus_expectations_analysis` | Earnings / Expectations | What is the current point-in-time consensus state? | IMPLEMENTED | Yes | `skills/earnings-review/expectations/consensus.ts`; Earnings Workflow | Register canonical metadata and preserve PIT gate |
| `earnings_variance_analysis` | Earnings / Expectations | Why did reported actuals differ from expectation/prior? | IMPLEMENTED | Yes | `actual-vs-expectation.ts`, segment KPI logic; Earnings Workflow | Register canonical metadata and collision tests |
| `guidance_analysis` | Earnings / Expectations | How did forward management guidance compare with prior/consensus? | IMPLEMENTED | Yes | `guidance.ts`; Earnings Workflow | Register canonical metadata and preserve unavailable behavior |
| `earnings_call_analysis` | Earnings / Expectations | What did the transcript/Q&A reveal? | PLANNED | No | No transcript speaker/Q&A implementation | Future transcript wave |
| `estimate_revision_analysis` | Earnings / Expectations | How did estimates change from old to new? | IMPLEMENTED | Yes | `estimate-revision` logic and expectation integration | Register canonical metadata and preserve PIT links |
| `financial_quality_analysis` | Financial | What is the quality of reported earnings/cash conversion? | IMPLEMENTED | Yes | `skills/financial_quality_analysis/` plus Wave 1 deterministic calculations | Shared report-level diagnostic with explicit partial/unavailable behavior |
| `financial_model_build_update` | Financial | How should a complete forecast model be built or updated? | PLANNED | No | No complete model implementation | Future financial-model wave |
| `model_audit` | Financial | Are model formulas, inputs, and outputs internally consistent? | PLANNED | No | No independent model-audit implementation | Future model wave |
| `dcf_valuation` | Valuation | What is forward intrinsic value from explicit FCFF forecasts? | IMPLEMENTED | Yes | `skills/valuation/calculations/dcf.ts`, `fcff.ts`, `discount-rate.ts` | Register methodology; keep product DCF readiness gate |
| `reverse_dcf_expectation_decode` | Valuation | What future performance is implied by price/EV? | IMPLEMENTED | Yes | `calculateReverseDcf` in valuation calculations | Register methodology; require all explicit inputs |
| `comps_valuation` | Valuation | What does an attributable peer set imply? | PARTIAL | No | `skills/valuation/calculations/comps.ts`; product path has bounded multiples | Separate peer-set contract before runtime promotion |
| `scenario_valuation` | Valuation | How do Bear/Base/Bull assumptions change value? | IMPLEMENTED | Yes | `skills/valuation/financials.ts`; Valuation Workflow | Register methodology and reuse code arithmetic |
| `valuation_crosscheck` | Valuation | Do independent valuation methods agree or diverge? | PARTIAL | No | Valuation secondary-method and QC logic | Promote after a directly callable cross-check binding exists |
| `expectation_gap` | Thesis | Where do market/company views differ? | PARTIAL | No | Earnings valuation-impact/thesis filter | Extract a stable disagreement contract |
| `thesis_formalize` | Thesis | What are the explicit thesis propositions and dependencies? | PARTIAL | No | Existing Thesis claims and Workflow context | Extract without mutating Knowledge from Skill |
| `thesis_red_team` | Thesis | How could an active thesis be wrong? | IMPLEMENTED | Yes | `skills/thesis-red-team/`; Thesis Red Team Workflow | Normalize legacy ID and retain Workflow composition |
| `catalyst_map` | Thesis | Which attributable events could change the thesis? | PARTIAL | No | Event/Daily/Thesis report sections | Extract event-linked catalyst contract later |
| `thesis_refresh` | Thesis | What changed in an existing thesis since last review? | PLANNED | No | No independent refresh implementation | Future thesis lifecycle wave |
| `research_qc` | Cross-domain QC | Is the assembled research result internally/evidentially valid? | PARTIAL | No | Existing validators and Workflow terminal gates | Consolidate only pure QC rules; keep Workflow gate owner |

## Runtime registration policy

The runtime set is the fifteen `IMPLEMENTED` entries with an independently
executable boundary. `business_model_map` and `thesis_red_team` are
`SEMANTIC_EXECUTABLE` through the existing bounded session/Workflow reasoning
boundaries. Consensus expectations, earnings variance, guidance, estimate
revisions, forward DCF, reverse DCF, and scenario valuation are
`DETERMINISTIC_EXECUTABLE` and bind directly to the existing authoritative
calculation functions. Business driver, unit economics, financial quality,
management execution, and capital allocation bind to their new deterministic
contracts. `valuation_crosscheck` is `PARTIAL` because its SKILL.md
contract declares code-owned work but no direct canonical execution binding
exists. `comps_valuation` remains `PARTIAL` for its previously recorded
peer-evidence gap.

Every runtime entry records an execution class and binding in the catalog. A
deterministic entry must also expose a callable `runtimeExecutor`; a methodology
source alone is not evidence of deterministic runtime execution.

The existing composite Workflows remain the product execution boundary while
their canonical skill metadata is introduced. Their mapped skill IDs are
documented in the migration matrix and are not evidence that an unimplemented
Skill is runtime available.
