import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

export type ResearchSkillCatalogStatus = 'IMPLEMENTED' | 'PARTIAL' | 'PLANNED'
export type ResearchSkillExecutionClass = 'SEMANTIC_EXECUTABLE' | 'DETERMINISTIC_EXECUTABLE' | 'NOT_INDEPENDENTLY_EXECUTABLE'

export interface ResearchSkillCatalogEntry {
  readonly canonicalSkillId: string
  readonly domain: string
  readonly purpose: string
  readonly invocationMatch: string
  readonly inputs: readonly string[]
  readonly produces: readonly string[]
  readonly status: ResearchSkillCatalogStatus
  readonly runtimeRegistered: boolean
  readonly currentSource: string
  readonly currentOwner: string
  readonly migrationAction: string
  readonly notes: string
  readonly executionClass?: ResearchSkillExecutionClass
  readonly runtimeBinding?: string
}

export const REQUIRED_RESEARCH_SKILL_SECTIONS = [
  'Purpose',
  'Invocation Match',
  'Typical Intents',
  'Inputs',
  'Produces',
  'Methodology',
  'Evidence Requirements',
  'Deterministic / Model Boundary',
  'Missing Data',
  'Validation / QC',
  'Related Skills',
] as const

const skillRoot = resolve(fileURLToPath(new URL('../../skills/', import.meta.url)))
const pathFor = (id: string): string => join(skillRoot, id, 'SKILL.md')

const EXECUTION_CLASS_BY_ID: Readonly<Partial<Record<string, ResearchSkillExecutionClass>>> = {
  business_model_map: 'SEMANTIC_EXECUTABLE',
  business_driver_analysis: 'DETERMINISTIC_EXECUTABLE',
  unit_economics: 'NOT_INDEPENDENTLY_EXECUTABLE',
  consensus_expectations_analysis: 'DETERMINISTIC_EXECUTABLE',
  earnings_variance_analysis: 'DETERMINISTIC_EXECUTABLE',
  guidance_analysis: 'DETERMINISTIC_EXECUTABLE',
  estimate_revision_analysis: 'DETERMINISTIC_EXECUTABLE',
  dcf_valuation: 'DETERMINISTIC_EXECUTABLE',
  reverse_dcf_expectation_decode: 'DETERMINISTIC_EXECUTABLE',
  scenario_valuation: 'DETERMINISTIC_EXECUTABLE',
  valuation_crosscheck: 'NOT_INDEPENDENTLY_EXECUTABLE',
  thesis_red_team: 'SEMANTIC_EXECUTABLE',
}

const RUNTIME_BINDING_BY_ID: Readonly<Partial<Record<string, string>>> = {
  business_model_map: 'ResearchDispatchService session boundary: methodology + bounded captured result',
  business_driver_analysis: 'skills/business_driver_analysis/calculations.ts:calculateBusinessDriverAnalysis',
  consensus_expectations_analysis: 'skills/earnings-review/expectations/consensus.ts:buildConsensusSnapshot',
  earnings_variance_analysis: 'skills/earnings-review/expectations/actual-vs-expectation.ts:compareActualToExpectation',
  guidance_analysis: 'skills/earnings-review/expectations/guidance.ts:buildGuidanceRevisionBridge',
  estimate_revision_analysis: 'skills/earnings-review/expectations/actual-vs-expectation.ts:buildEstimateRevisionBridge',
  dcf_valuation: 'skills/valuation/calculations/dcf.ts:calculateForwardDcf',
  reverse_dcf_expectation_decode: 'skills/valuation/calculations/dcf.ts:calculateReverseDcf',
  scenario_valuation: 'skills/valuation/financials.ts:calculateValuation',
  thesis_red_team: 'skills/thesis-red-team/skill.ts through Thesis Red Team Workflow',
}

const entry = (
  canonicalSkillId: string,
  domain: string,
  purpose: string,
  invocationMatch: string,
  inputs: readonly string[],
  produces: readonly string[],
  status: ResearchSkillCatalogStatus,
  runtimeRegistered: boolean,
  currentSource: string,
  currentOwner: string,
  migrationAction: string,
  notes: string,
): ResearchSkillCatalogEntry => ({ canonicalSkillId, domain, purpose, invocationMatch, inputs, produces, status, runtimeRegistered, currentSource, currentOwner, migrationAction, notes, executionClass: EXECUTION_CLASS_BY_ID[canonicalSkillId], runtimeBinding: RUNTIME_BINDING_BY_ID[canonicalSkillId] })

export const CANONICAL_RESEARCH_SKILL_CATALOG: readonly ResearchSkillCatalogEntry[] = [
  entry('evidence_normalization', 'Evidence', 'Normalize supplied evidence into bounded, attributable inputs.', 'Use when a Workflow must normalize evidence before peer Skills; do not use as a standalone conclusion.', ['raw/source candidates', 'asOf', 'source class'], ['normalized evidence set', 'availability diagnostics'], 'PARTIAL', false, 'Existing acquisition/provider normalizers', 'Workflow + Plugin', 'Keep as helper/Workflow responsibility until independently callable.', 'No separate stable Skill result contract yet.'),
  entry('document_change_analysis', 'Evidence', 'Identify attributable changes between two documents.', 'Use only when two comparable, attributable document versions are supplied; do not infer changes from one document.', ['prior document', 'current document', 'asOf', 'source refs'], ['change set', 'unchanged regions', 'gaps'], 'PLANNED', false, 'None', 'Future Wave', 'Implement a point-in-time document-diff method.', 'No runtime registration.'),
  entry('business_model_map', 'Company Economics', 'Explain how a company makes money and how its segments fit together.', 'Use for how-the-company-makes-money questions; do not use for consolidated driver attribution or unit economics.', ['company identity', 'segments/products', 'source refs', 'asOf'], ['business model map', 'segment relationships', 'source refs'], 'IMPLEMENTED', true, 'Company Research Business Model section', 'Company Research Workflow', 'Register the extracted bounded methodology.', 'The standalone contract preserves the existing evidence-only section boundary.'),
  entry('business_driver_analysis', 'Company Economics', 'Attribute consolidated revenue and profit changes to supplied business drivers.', 'Use for volume/price/mix/segment driver questions; do not use for a generic business model description.', ['period-aligned financials', 'segment/KPI data', 'source refs'], ['driver decomposition', 'contribution diagnostics', 'gaps'], 'IMPLEMENTED', true, 'skills/business_driver_analysis/calculations.ts', 'Company Research Workflow', 'Register the independently callable deterministic driver implementation.', 'Code owns period alignment, supported multiplicative pairs, additive contributions, and residuals.'),
  entry('unit_economics', 'Company Economics', 'Analyze a measurable underlying economic unit and its economics.', 'Use when the user names an economic unit such as customer, shipment, or site; do not use for consolidated financial drivers.', ['unit definition', 'unit counts', 'revenue/cost data', 'period', 'source refs'], ['unit metrics', 'cohort/trend diagnostics', 'gaps'], 'PARTIAL', false, 'New bounded methodology extracted from the Company Economics requirement', 'Company Economics Workflow', 'Promote after an independently callable deterministic unit-economics implementation exists.', 'The methodology declares code-owned arithmetic, but no direct canonical execution binding exists.'),
  entry('management_execution', 'Company Economics', 'Assess management execution against attributable prior commitments.', 'Use only when dated commitments and outcomes are supplied; do not infer execution quality from generic management prose.', ['dated commitments', 'outcomes', 'company identity', 'source refs'], ['commitment-to-outcome assessment', 'gaps'], 'PLANNED', false, 'Management narrative section only', 'Future Wave', 'Require historical commitment/result evidence.', 'No independent implementation.'),
  entry('capital_allocation_review', 'Company Economics', 'Review capital allocation decisions and attributable outcomes.', 'Use for capital allocation questions with dated transaction and outcome evidence; do not treat a report heading as an implementation.', ['capital actions', 'financial context', 'outcomes', 'source refs'], ['allocation assessment', 'evidence map', 'gaps'], 'PARTIAL', false, 'Company Research Management / Capital Allocation section', 'Company Research Workflow', 'Extract a stable source/period contract.', 'Current behavior is narrative-only.'),
  entry('market_structure_analysis', 'Industry', 'Define the market boundary, participants, and structural relationships.', 'Use for market definition and structure questions; do not use for a full supply-demand cycle or competitive ranking.', ['industry target', 'scope', 'market evidence', 'asOf'], ['market boundary', 'participant map', 'gaps'], 'PARTIAL', false, 'Industry eight-module definition/landscape modules', 'Industry Workflow', 'Extract module-level result contract.', 'Existing Skill is an eight-module composite.'),
  entry('industry_supply_demand_cycle', 'Industry', 'Assess industry capacity, demand, inventory, pricing, and cycle evidence.', 'Use for cycle/inflection questions only when the relevant series are supplied; do not fill missing inventory or pricing data.', ['industry target', 'capacity/demand series', 'inventory/pricing evidence', 'asOf'], ['cycle assessment', 'inflection diagnostics', 'gaps'], 'PARTIAL', false, 'Industry Supply Demand module', 'Industry Workflow', 'Complete only in a future Wave 3 slice.', 'Wave 3 depth is intentionally deferred.'),
  entry('competitive_market_map', 'Industry', 'Map competitors and relative positioning from attributable evidence.', 'Use for competitor landscape questions; do not infer market share or ranking without evidence.', ['industry target', 'competitor set', 'positioning evidence', 'asOf'], ['competitive map', 'positioning evidence', 'gaps'], 'PARTIAL', false, 'Industry Competitive Landscape and Company Mapping modules', 'Industry Workflow', 'Extract bounded map contract.', 'No standalone runtime Skill yet.'),
  entry('consensus_expectations_analysis', 'Earnings / Expectations', 'Describe the current point-in-time consensus state.', 'Use for current consensus questions; do not explain a reported beat or old-to-new estimate change.', ['metric', 'fiscal period', 'asOf', 'consensus observations', 'source refs'], ['qualified consensus state', 'PIT diagnostics', 'gaps'], 'IMPLEMENTED', true, 'skills/earnings-review/expectations/consensus.ts', 'Earnings Workflow', 'Register canonical methodology and preserve PIT gates.', 'Runtime methodology is independently invokable.'),
  entry('earnings_variance_analysis', 'Earnings / Expectations', 'Explain reported actual versus eligible expectation or prior comparable period.', 'Use for beat/miss and segment-driver questions; do not use for forward guidance changes.', ['actuals', 'prior actuals', 'consensus', 'segments/KPIs', 'source refs'], ['variance analysis', 'driver diagnostics', 'gaps'], 'IMPLEMENTED', true, 'skills/earnings-review/expectations/actual-vs-expectation.ts', 'Earnings Workflow', 'Register canonical methodology and collision tests.', 'Arithmetic remains code-owned.'),
  entry('guidance_analysis', 'Earnings / Expectations', 'Analyze current and prior forward management guidance.', 'Use for guidance level/change and guidance-vs-consensus questions; do not use for reported actual variance.', ['current/prior guidance', 'consensus', 'period', 'publication times', 'source refs'], ['guidance deltas', 'relationship labels', 'gaps'], 'IMPLEMENTED', true, 'skills/earnings-review/expectations/guidance.ts', 'Earnings Workflow', 'Register canonical methodology and preserve range rules.', 'Missing consensus remains unavailable.'),
  entry('earnings_call_analysis', 'Earnings / Expectations', 'Analyze transcript and Q&A content by speaker and topic.', 'Use only when an attributable transcript and Q&A are supplied; do not claim implementation from earnings filings alone.', ['transcript', 'speaker roles', 'Q&A', 'period', 'source refs'], ['call analysis', 'commentary deltas', 'gaps'], 'PLANNED', false, 'None', 'Future Wave', 'Implement transcript-specific method.', 'No transcript implementation exists.'),
  entry('estimate_revision_analysis', 'Earnings / Expectations', 'Describe old-to-new attributable estimate changes.', 'Use for estimate revision questions; do not use for the current consensus level alone.', ['old/new estimates', 'period', 'contributors', 'publication times', 'source refs'], ['revision deltas', 'direction diagnostics', 'gaps'], 'IMPLEMENTED', true, 'Earnings expectations revision integration', 'Earnings Workflow', 'Register canonical methodology and PIT links.', 'Pairing remains deterministic.'),
  entry('financial_quality_analysis', 'Financial', 'Assess earnings quality, accruals, working capital, and cash conversion from supplied facts.', 'Use when explicit quality inputs are supplied; do not infer quality from a report section or missing data.', ['period facts', 'cash flow', 'working capital', 'accruals', 'source refs'], ['quality metrics', 'diagnostics', 'gaps'], 'PARTIAL', false, 'skills/earnings-review/financial-quality/', 'Earnings Workflow', 'Promote after an independent multi-consumer contract.', 'Current implementation is report-only.'),
  entry('financial_model_build_update', 'Financial', 'Build or update a complete period-aligned forecast model.', 'Use only with a complete model contract and explicit assumptions; do not create a partial model from narrative.', ['historical series', 'assumptions', 'periods', 'source refs'], ['forecast model', 'assumption set', 'QC'], 'PLANNED', false, 'None', 'Future Wave', 'Implement a governed model contract.', 'No complete model implementation.'),
  entry('model_audit', 'Financial', 'Check model structure, inputs, formulas, and outputs for internal consistency.', 'Use when a structured model is supplied; do not audit a narrative report as though it were a model.', ['model graph', 'formulas', 'inputs', 'outputs'], ['audit findings', 'severity', 'repro steps'], 'PLANNED', false, 'None', 'Future Wave', 'Implement after model build/update exists.', 'No runtime registration.'),
  entry('dcf_valuation', 'Valuation', 'Calculate forward intrinsic value from explicit FCFF forecasts.', 'Use for forward intrinsic-value questions; do not use to decode what the current price implies.', ['FCFF forecast', 'WACC inputs', 'terminal growth', 'debt/cash/shares', 'source refs'], ['DCF result', 'EV-equity bridge', 'sensitivity', 'QC'], 'IMPLEMENTED', true, 'skills/valuation/calculations/dcf.ts, fcff.ts, discount-rate.ts', 'Valuation Workflow', 'Register canonical methodology; preserve product readiness gate.', 'Deterministic primitives are tested; product DCF remains explicitly deferred.'),
  entry('reverse_dcf_expectation_decode', 'Valuation', 'Decode future performance implied by current price or enterprise value.', 'Use for price-in expectation questions; do not use for forward intrinsic value from user forecasts.', ['price/EV', 'shares', 'debt/cash', 'FCFF forecast', 'discount/growth', 'source refs'], ['implied terminal FCFF/revenue/CAGR', 'assumption diagnostics'], 'IMPLEMENTED', true, 'skills/valuation/calculations/dcf.ts:calculateReverseDcf', 'Valuation Workflow', 'Register canonical methodology and routing collision tests.', 'Requires explicit positive terminal economics.'),
  entry('comps_valuation', 'Valuation', 'Calculate an attributable peer-set valuation comparison.', 'Use only when a real peer set and metric basis are supplied; do not use synthetic/default multiples.', ['peer set', 'metrics', 'target basis', 'source refs'], ['peer multiples', 'implied value', 'rejections'], 'PARTIAL', false, 'skills/valuation/calculations/comps.ts', 'Valuation Workflow', 'Close peer-set contract before runtime promotion.', 'Helper arithmetic exists; standalone evidence contract is incomplete.'),
  entry('scenario_valuation', 'Valuation', 'Calculate Bear/Base/Bull value from explicit assumptions.', 'Use for scenario and sensitivity questions; do not substitute defaults for missing assumptions.', ['valuation basis', 'method', 'three scenarios', 'target year', 'source refs'], ['scenario results', '9-cell sensitivity', 'QC'], 'IMPLEMENTED', true, 'skills/valuation/financials.ts', 'Valuation Workflow', 'Register canonical methodology and preserve code arithmetic.', 'Existing scenario engine is deterministic.'),
  entry('valuation_crosscheck', 'Valuation', 'Compare independently calculated valuation methods.', 'Use to explain convergence/divergence; do not calculate primary method outputs here.', ['validated method results', 'shared basis', 'assumptions', 'source refs'], ['comparison', 'divergence diagnostics', 'gaps'], 'PARTIAL', false, 'Valuation secondary-method and QC logic', 'Valuation Workflow', 'Promote after a directly callable cross-check implementation exists.', 'Workflow has comparison/report logic, but no direct canonical execution binding exists.'),
  entry('expectation_gap', 'Thesis', 'Locate disagreement between market expectations and company/thesis evidence.', 'Use when the question asks where views differ; do not formalize or attack a thesis.', ['consensus', 'company evidence', 'thesis context', 'asOf'], ['gap propositions', 'evidence map', 'gaps'], 'PARTIAL', false, 'Earnings valuation-impact/thesis filter', 'Earnings / Thesis Workflow', 'Extract a stable disagreement contract.', 'Current output is a bounded filter, not a standalone Skill.'),
  entry('thesis_formalize', 'Thesis', 'State explicit thesis propositions, dependencies, and falsification conditions.', 'Use to formalize a thesis; do not perform adversarial testing or mutate canonical Thesis state.', ['company', 'claims', 'evidence', 'assumptions'], ['thesis propositions', 'dependencies', 'falsification conditions'], 'PARTIAL', false, 'Existing Thesis claims and Workflow context', 'Thesis Workflow', 'Extract without direct Knowledge mutation.', 'No independent entrypoint.'),
  entry('thesis_red_team', 'Thesis', 'Adversarially test one active thesis with bounded evidence.', 'Use when the user asks where a thesis may be wrong or what would falsify it; do not run a full Thesis Lifecycle.', ['company', 'thesis ref', 'dependencies', 'signals', 'sources', 'lookback'], ['attack vectors', 'challenge assessments', 'bounded proposals', 'gaps'], 'IMPLEMENTED', true, 'skills/thesis-red-team/', 'Thesis Red Team Workflow', 'Normalize legacy path/ID and retain Workflow boundary.', 'Existing independent methodology and tests exist.'),
  entry('catalyst_map', 'Thesis', 'Map attributable events that could change a thesis.', 'Use for catalyst questions with explicit event evidence; do not infer catalysts from generic news.', ['thesis', 'event evidence', 'dates', 'source refs'], ['catalyst map', 'timing/status', 'gaps'], 'PARTIAL', false, 'Event/Daily/Thesis report sections', 'Event / Thesis Workflow', 'Extract event-linked contract later.', 'No standalone implementation.'),
  entry('thesis_refresh', 'Thesis', 'Assess what changed in an existing thesis since its prior review.', 'Use only with a prior thesis snapshot and new point-in-time evidence; do not formalize a new thesis.', ['prior thesis', 'new evidence', 'asOf', 'source refs'], ['changed propositions', 'status', 'gaps'], 'PLANNED', false, 'None', 'Future Wave', 'Implement lifecycle refresh after formalization exists.', 'No runtime registration.'),
  entry('research_qc', 'Cross-domain QC', 'Check research result integrity, evidence coverage, and internal consistency.', 'Use as a final Workflow gate over bounded results; do not replace domain methodology.', ['peer results', 'source bindings', 'contract metadata'], ['QC findings', 'pass/block status', 'gaps'], 'PARTIAL', false, 'Existing validators and Workflow terminal gates', 'Workflow', 'Consolidate pure QC rules only.', 'Workflow remains the gate owner.'),
]

export const CANONICAL_RESEARCH_SKILL_IDS = new Set(CANONICAL_RESEARCH_SKILL_CATALOG.map((item) => item.canonicalSkillId))
export const RUNTIME_CANONICAL_RESEARCH_SKILLS = CANONICAL_RESEARCH_SKILL_CATALOG.filter((item) => item.runtimeRegistered)

export function getCanonicalResearchSkill(id: string): ResearchSkillCatalogEntry | undefined {
  return CANONICAL_RESEARCH_SKILL_CATALOG.find((item) => item.canonicalSkillId === id)
}

export function canonicalResearchSkillMdPath(id: string): string {
  if (!CANONICAL_RESEARCH_SKILL_IDS.has(id)) throw new Error(`Unknown canonical Research Skill: ${id}`)
  return pathFor(id)
}
