import type { ReasoningExecutor, ReasoningOperation } from '../../plugins/reasoning/contracts.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import { INDUSTRY_MODULES, type CrossModuleSynthesis, type IndustryModuleResult, type IndustryResearchModule, type IndustryResearchSkillInput, type ResearchDesign, type ResearchGap } from './contracts.ts'

type AnyRecord = Record<string, unknown>
const isObject = (v: unknown): v is AnyRecord => typeof v === 'object' && v !== null && !Array.isArray(v)
const localId = /^[A-Za-z][A-Za-z0-9._-]*$/
const canonicalId = /^(entity|relation|claim|source|raw|changeset|review-case):/i
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const arr = (v: unknown): v is readonly unknown[] => Array.isArray(v)
const stringArray = (v: unknown): v is readonly string[] => arr(v) && v.every((x) => text(x))
const localReference = (v: unknown) => typeof v === 'string' && localId.test(v) && !canonicalId.test(v)
const finiteValue = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' ? v.trim() !== '' : typeof v === 'boolean'

export function validateIndustryResearchDesign(value: unknown): ResearchDesign {
  if (!isObject(value) || !text(value.definitionHypothesis) || !['industry', 'theme', 'product', 'technology', 'uncertain'].includes(String(value.targetKind))) throw new Error('Invalid Industry Research Design target diagnosis')
  if (!isObject(value.scope) || !arr(value.scope.included) || !arr(value.scope.excluded) || value.scope.included.some((x) => !text(x)) || value.scope.excluded.some((x) => !text(x))) throw new Error('Invalid Industry Research Design scope')
  const questions = value.moduleQuestions
  if (!isObject(questions) || INDUSTRY_MODULES.some((m) => !text(questions[m]))) throw new Error('Research Design must contain all eight module questions')
  for (const key of ['keyMetrics', 'evidenceRequirements', 'searchTerms']) if (!stringArray(value[key])) throw new Error(`Research Design ${key} must be a non-empty string array`)
  if (!arr(value.knownGaps)) throw new Error('Research Design knownGaps must be an array')
  for (const gap of value.knownGaps) if (!isObject(gap) || !localReference(gap.gapId) || !INDUSTRY_MODULES.includes(gap.module as IndustryResearchModule) || !text(gap.question) || !text(gap.reason) || typeof gap.actionable !== 'boolean' || (gap.searchTerms !== undefined && !stringArray(gap.searchTerms))) throw new Error('Invalid Research Design known gap')
  if (!arr(value.verificationCandidates)) throw new Error('Research Design verificationCandidates must be an array')
  for (const candidate of value.verificationCandidates) if (!isObject(candidate) || !text(candidate.name) || !['product', 'technology', 'industry', 'company'].includes(String(candidate.kind)) || !text(candidate.reason)) throw new Error('Invalid verification candidate')
  return value as unknown as ResearchDesign
}

function validateProposal(p: unknown, evidenceIds: Set<string>, proposalIds: Set<string>, knownProposalIds = proposalIds): SemanticProductionProposal {
  if (!isObject(p) || !text(p.proposalId) || !localReference(p.proposalId) || proposalIds.has(String(p.proposalId))) throw new Error('Proposal ID must be unique and local')
  const id = String(p.proposalId); proposalIds.add(id)
  if ([p.proposalId, p.subjectKey, p.targetKey, p.existingKnowledgeRefs].flat().some((v) => typeof v === 'string' && canonicalId.test(v))) throw new Error('Model output contains a canonical-looking identifier')
  if (!['entity', 'relation', 'claim'].includes(String(p.kind))) throw new Error('Unsupported semantic proposal kind')
  if (!localReference(p.subjectKey) || (p.targetKey !== undefined && !localReference(p.targetKey))) throw new Error('Proposal local references are invalid')
  if (p.kind === 'entity' && (!['industry', 'product', 'technology', 'company'].includes(String(p.entityType)) || !text(p.entityName))) throw new Error('Unsupported Entity proposal')
  if (p.kind === 'relation' && (!text(p.relationType) || !text(p.targetKey))) throw new Error('Invalid Relation proposal')
  if (p.kind === 'claim' && (!['fact', 'forecast', 'viewpoint', 'trend', 'risk', 'assumption', 'thesis', 'catalyst'].includes(String(p.claimType)) || !text(p.statement))) throw new Error('Invalid Claim proposal')
  if (p.sourceCandidateIds !== undefined && (!arr(p.sourceCandidateIds) || p.sourceCandidateIds.some((x) => typeof x !== 'string' || !evidenceIds.has(x)))) throw new Error('Proposal references unknown evidence')
  for (const key of ['supportsProposalIds', 'dependsOnProposalIds', 'contradictsProposalIds'] as const) if (p[key] !== undefined && (!arr(p[key]) || p[key].some((x) => typeof x !== 'string' || !knownProposalIds.has(x)))) throw new Error('Proposal contains unresolved local link')
  if (p.kind === 'claim' && p.structuredValue !== undefined && p.structuredValue !== null && (!isObject(p.structuredValue) || !text(p.structuredValue.metric) || !('value' in p.structuredValue) || !finiteValue(p.structuredValue.value) || !text(p.structuredValue.unit) || !text(p.structuredValue.comparator) || (p.structuredValue.period !== undefined && !text(p.structuredValue.period)) || (p.structuredValue.fiscalPeriod !== undefined && !text(p.structuredValue.fiscalPeriod)))) throw new Error('Malformed quantitative structured value')
  return p as unknown as SemanticProductionProposal
}

function validateGaps(value: unknown, module: IndustryResearchModule): ResearchGap[] {
  if (!arr(value)) throw new Error('gaps must be an array')
  const ids = new Set<string>(); return value.map((g) => { if (!isObject(g) || !localReference(g.gapId) || ids.has(String(g.gapId)) || g.module !== module || !text(g.question) || !text(g.reason) || typeof g.actionable !== 'boolean' || (g.searchTerms !== undefined && !stringArray(g.searchTerms))) throw new Error('Invalid Research Gap'); ids.add(String(g.gapId)); return g as unknown as ResearchGap })
}

export function validateIndustryModuleResult(value: unknown, module: IndustryResearchModule, suppliedEvidence: readonly string[]): IndustryModuleResult {
  if (!isObject(value) || value.module !== module || !['supported', 'partial', 'unavailable'].includes(String(value.status)) || !text(value.analysis) || !arr(value.evidenceIds) || value.evidenceIds.some((x) => typeof x !== 'string' || !suppliedEvidence.includes(x))) throw new Error('Invalid bounded module result or evidence escape')
  const proposals: SemanticProductionProposal[] = []; const ids = new Set<string>(); const evidence = new Set(suppliedEvidence)
  if (!arr(value.proposals)) throw new Error('Module proposals must be an array')
  for (const p of value.proposals) if (isObject(p) && text(p.proposalId)) ids.add(String(p.proposalId))
  const seen = new Set<string>(); for (const p of value.proposals) { const checked = validateProposal(p, evidence, seen, ids); proposals.push(checked) }
  const gaps = validateGaps(value.gaps, module)
  const material = isObject(value.reportMaterial) ? value.reportMaterial : undefined
  if (!material || !text(material.markdown) || !arr(material.evidenceIds) || material.evidenceIds.some((x) => typeof x !== 'string' || !evidence.has(x))) throw new Error('Invalid local report material')
  return { ...value, proposals, gaps, reportMaterial: material as never } as unknown as IndustryModuleResult
}

export function validateCrossModuleSynthesis(value: unknown, suppliedEvidence: readonly string[], moduleProposalIds: readonly string[]): CrossModuleSynthesis {
  if (!isObject(value) || !text(value.executiveView) || !text(value.analysis) || !arr(value.evidenceIds) || value.evidenceIds.some((x) => typeof x !== 'string' || !suppliedEvidence.includes(x))) throw new Error('Invalid cross-module synthesis evidence')
  const ids = new Set<string>(moduleProposalIds); const proposals: SemanticProductionProposal[] = []; const evidence = new Set(suppliedEvidence)
  if (!arr(value.proposals)) throw new Error('Synthesis proposals must be an array')
  for (const p of value.proposals) if (isObject(p) && text(p.proposalId)) { if (ids.has(String(p.proposalId))) throw new Error('Duplicate synthesis proposal ID'); ids.add(String(p.proposalId)) }
  const seen = new Set<string>(); for (const p of value.proposals) { const checked = validateProposal(p, evidence, seen, ids); proposals.push(checked) }
  if (!arr(value.gaps) || value.gaps.some((g) => !isObject(g) || !text(g.gapId) || !INDUSTRY_MODULES.includes(g.module as IndustryResearchModule) || !text(g.question) || !text(g.reason) || typeof g.actionable !== 'boolean')) throw new Error('Invalid synthesis Research Gap')
  if (!arr(value.alternativeViews) || value.alternativeViews.some((x) => !text(x))) throw new Error('Invalid alternative views')
  return value as unknown as CrossModuleSynthesis
}

export class IndustryResearchSkill {
  constructor(private readonly executor: ReasoningExecutor) {}
  private async call(operation: ReasoningOperation, input: unknown, outputContract: unknown, repairContext?: unknown): Promise<unknown> {
    const result = await this.executor.execute({ operation, instruction: repairContext === undefined ? `Perform bounded ${operation} using only supplied evidence.` : `Repair the invalid bounded ${operation} output. Return only a corrected object. Validation error: ${String(repairContext)}`, input, outputContract })
    return result.output
  }
  async design(input: { readonly target: IndustryResearchSkillInput['target']; readonly existingKnowledge: readonly unknown[] }): Promise<ResearchDesign> { try { return validateIndustryResearchDesign(await this.call('industry_research_design', input, 'ResearchDesign')) } catch (first) { return validateIndustryResearchDesign(await this.call('industry_research_design', input, 'ResearchDesign', first instanceof Error ? first.message : String(first))) } }
  async analyze(module: IndustryResearchModule, input: IndustryResearchSkillInput): Promise<IndustryModuleResult> {
    try { return validateIndustryModuleResult(await this.call('industry_module_analysis', { module, ...input }, 'IndustryModuleResult'), module, input.evidence.map((x) => x.evidenceId)) }
    catch (first) { try { return validateIndustryModuleResult(await this.call('industry_module_analysis', { module, ...input }, 'IndustryModuleResult', first instanceof Error ? first.message : String(first)), module, input.evidence.map((x) => x.evidenceId)) } catch (second) { return { module, status: 'unavailable', analysis: 'Module reasoning failed after one bounded repair attempt.', evidenceIds: [], proposals: [], gaps: [{ gapId: `${module}-failure`, module, question: 'What evidence is required?', reason: second instanceof Error ? second.message : String(second), actionable: true }], reportMaterial: { markdown: 'Module unavailable.', evidenceIds: [], proposalIds: [] } } } }
  }
  async synthesize(input: { readonly modules: readonly IndustryModuleResult[]; readonly evidence: readonly IndustryResearchSkillInput['evidence'][number][] }): Promise<CrossModuleSynthesis> { const evidenceIds = input.evidence.map((x) => x.evidenceId); const ids = input.modules.flatMap((m) => m.proposals.map((p) => p.proposalId)); return validateCrossModuleSynthesis(await this.call('industry_cross_module_synthesis', input, 'CrossModuleSynthesis'), evidenceIds, ids) }
}
