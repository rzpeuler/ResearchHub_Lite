import { randomUUID } from 'node:crypto'
import type { DailyIntelligenceService } from './daily-intelligence-service.ts'
import type { ResearchService } from './research-service.ts'
import type { WorkflowService } from './workflow-service.ts'
import { ApplicationServiceError } from './contracts.ts'
import { createResearchSkillRegistry, type ResearchSkillDefinition, type ResearchSkillRegistry } from './skill-registry.ts'
import { createWorkflowDefinitionRegistry, type WorkflowDefinition, type WorkflowDefinitionRegistry } from './workflow-registry.ts'
import { normalizeResearchRequest, validateResearchDispatchDecision, type ResearchDispatchDecision, type ResearchExecutionSummary, type ResearchRequest } from './research-dispatch-contracts.ts'
import type { EventAnchor, EarningsReviewPeriod, ValuationMethod } from './contracts.ts'
import type { ResearchBundle, ResearchBundleStore } from './research-bundle.ts'
import { createResearchBundle } from './research-bundle.ts'

export interface ExtractedResearchArguments {
  readonly arguments: Readonly<Record<string, unknown>>
  readonly missingRequiredInputs: readonly string[]
  readonly diagnostics: readonly string[]
  readonly extractedKeys: readonly string[]
}

export interface ResearchDispatchStart {
  readonly request: ResearchRequest
  readonly decision: ResearchDispatchDecision
  readonly summary: ResearchExecutionSummary
  readonly status: 'started' | 'missing_input' | 'free_research' | 'skill_plan'
  readonly runId?: string
  readonly workflow?: unknown
  readonly completion?: Promise<unknown>
}

export interface ResearchDispatchServiceOptions {
  readonly researchService?: ResearchService
  readonly dailyIntelligenceService?: DailyIntelligenceService
  readonly workflowRegistry?: WorkflowDefinitionRegistry
  readonly skillRegistry?: ResearchSkillRegistry
  readonly workflowService?: WorkflowService
  readonly bundleStore?: ResearchBundleStore
}

const COMPANY_ALIASES: Readonly<Record<string, { readonly symbol: string; readonly name: string }>> = {
  '贵州茅台': { symbol: '600519', name: '贵州茅台' },
  '茅台': { symbol: '600519', name: '贵州茅台' },
  '五粮液': { symbol: '000858', name: '五粮液' },
  '宁德时代': { symbol: '300750', name: '宁德时代' },
  '比亚迪': { symbol: '002594', name: '比亚迪' },
}

const WORKFLOW_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  earnings_review: ['半年报', '上半年', '年报', '季报', '季度', '业绩', 'earnings', 'financial results', 'q1', 'h1', 'q3', 'fy'],
  valuation: ['估值', 'valuation', '市盈率', '市净率', 'ev/ebitda', 'pe', 'pb'],
  thesis_red_team: ['反驳', '反向验证', '红队', 'red team', 'red-team', 'thesis', '投资论点'],
  event_research: ['事件', '公告', '新闻', '消息', 'event', 'announcement', 'headline'],
  industry_research: ['行业', '产业', '产业链', 'industry', 'pcb', '半导体', '服务器'],
  company_research: ['公司', '个股', 'company', '股票'],
  daily_intelligence: ['日报', '盘前', '盘后', 'morning brief', 'evening brief', 'daily intelligence'],
}

function safeQuery(query: string): string { return query.toLocaleLowerCase() }
function containsTerm(text: string, term: string): boolean {
  const normalized = term.toLocaleLowerCase()
  if (/^[a-z0-9]+$/i.test(normalized) && normalized.length <= 3) return new RegExp(`\\b${normalized}\\b`, 'i').test(text)
  return text.includes(normalized)
}

function extractSymbol(query: string): { readonly symbol?: string; readonly name?: string } {
  const symbol = query.match(/\b\d{6}\b/)?.[0]
  if (symbol !== undefined) return { symbol, name: Object.values(COMPANY_ALIASES).find((item) => item.symbol === symbol)?.name }
  for (const [alias, company] of Object.entries(COMPANY_ALIASES)) if (query.includes(alias)) return company
  return {}
}

function extractFiscalYear(query: string): number | undefined {
  const match = query.match(/\b(?:fy\s*)?(20\d{2})\s*(?:年|fy|financial\s+year)?\b/i)
  return match === null ? undefined : Number(match[1])
}

function extractPeriod(query: string): EarningsReviewPeriod | undefined {
  if (/半年|上半年|\bh1\b/i.test(query)) return 'H1'
  if (/一季度|第一季度|\bq1\b/i.test(query)) return 'Q1'
  if (/三季度|第三季度|\bq3\b/i.test(query)) return 'Q3'
  if (/年报|全年|\bfy\b|\bfy\s*20\d{2}\b/i.test(query)) return 'FY'
  return undefined
}

function extractIndustryName(query: string): string | undefined {
  const known = ['PCB', 'AI Server Hardware', '人工智能', '半导体', '服务器', '新能源汽车']
  const lower = safeQuery(query)
  const found = known.find((item) => lower.includes(item.toLocaleLowerCase()))
  if (found !== undefined) return found
  const match = query.match(/(?:研究|分析|关注|关于)\s*([\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9 &/_-]{0,60}?)(?:行业|产业)/u)
  return match?.[1]?.trim()
}

function extractMethods(query: string): readonly ValuationMethod[] | undefined {
  const methods: ValuationMethod[] = []
  if (/市盈率|\bpe\b/i.test(query)) methods.push('PE')
  if (/市净率|\bpb\b/i.test(query)) methods.push('PB')
  if (/ev\s*[/：:]?\s*ebitda|企业价值/i.test(query)) methods.push('EV_EBITDA')
  return methods.length === 0 ? undefined : methods
}

function extractEventAnchor(query: string): EventAnchor | undefined {
  const url = query.match(/https?:\/\/[^\s)]+/i)?.[0]
  if (url !== undefined) return { kind: 'url', url }
  if (!/事件|公告|新闻|消息|event|announcement|headline/i.test(query)) return undefined
  return { kind: 'user_event', title: query.slice(0, 200), description: query.slice(0, 2_000) }
}

function extractThesisRef(query: string): string | undefined {
  return query.match(/\bclaim:[A-Za-z0-9._-]+\b/)?.[0]
}

export function extractWorkflowArguments(definition: WorkflowDefinition, query: string): ExtractedResearchArguments {
  const args: Record<string, unknown> = {}
  const diagnostics: string[] = []
  const identity = extractSymbol(query)
  if (identity.symbol !== undefined) args.symbol = identity.symbol
  if (identity.name !== undefined) args.name = identity.name
  if (definition.id === 'industry_research') {
    const name = extractIndustryName(query)
    if (name !== undefined) args.name = name
  }
  if (definition.id === 'earnings_review') {
    const fiscalYear = extractFiscalYear(query)
    const period = extractPeriod(query)
    if (fiscalYear !== undefined) args.fiscalYear = fiscalYear
    if (period !== undefined) args.period = period
  }
  if (definition.id === 'valuation') {
    const methods = extractMethods(query)
    if (methods !== undefined) args.methods = methods
    const targetFiscalYear = extractFiscalYear(query)
    if (targetFiscalYear !== undefined) args.targetFiscalYear = targetFiscalYear
  }
  if (definition.id === 'event_research') {
    const anchor = extractEventAnchor(query)
    if (anchor !== undefined) args.anchor = anchor
  }
  if (definition.id === 'thesis_red_team') {
    const thesisRef = extractThesisRef(query)
    if (thesisRef !== undefined) args.thesisRef = thesisRef
  }
  if (definition.id === 'daily_intelligence') {
    const briefType = /晚间|盘后|evening/i.test(query) ? 'evening' : /早盘|盘前|morning/i.test(query) ? 'morning' : undefined
    const tradeDate = query.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0]
    if (briefType !== undefined) args.briefType = briefType
    if (tradeDate !== undefined) args.tradeDate = tradeDate
  }
  const missingRequiredInputs = definition.requiredInputs.filter((key) => args[key] === undefined)
  if (missingRequiredInputs.length > 0) diagnostics.push(`missing_required_inputs:${missingRequiredInputs.join(',')}`)
  return { arguments: args, missingRequiredInputs, diagnostics, extractedKeys: Object.keys(args).sort() }
}

function scoreWorkflow(definition: WorkflowDefinition, query: string): number {
  const terms = WORKFLOW_KEYWORDS[definition.id]
  if (terms === undefined) return 0
  const text = safeQuery(query)
  const keywordScore = terms.reduce((score, term) => score + (containsTerm(text, term) ? (term.length > 2 ? 1 : 0.5) : 0), 0)
  return keywordScore
}

function selectedSkillIds(registry: ResearchSkillRegistry, workflowId: string): readonly string[] {
  return registry.researchCandidates().filter((skill) => skill.researchCapability === workflowId).map((skill) => skill.id)
}

export class ResearchDispatchService {
  readonly workflowRegistry: WorkflowDefinitionRegistry
  readonly skillRegistry: ResearchSkillRegistry
  constructor(private readonly options: ResearchDispatchServiceOptions = {}) {
    this.workflowRegistry = options.workflowRegistry ?? createWorkflowDefinitionRegistry()
    this.skillRegistry = options.skillRegistry ?? createResearchSkillRegistry()
  }

  listWorkflowDefinitions(): readonly WorkflowDefinition[] { return this.workflowRegistry.list() }

  resolve(input: unknown): { readonly request: ResearchRequest; readonly decision: ResearchDispatchDecision; readonly summary: ResearchExecutionSummary } {
    const request = normalizeResearchRequest(input)
    const explicit = request.mode.type === 'workflow'
    const definition = explicit ? this.workflowRegistry.get(request.mode.workflowId) : this.bestWorkflow(request.query)
    if (definition !== undefined) {
      const extracted = extractWorkflowArguments(definition, request.query)
      const decision = validateResearchDispatchDecision({ mode: 'workflow', workflow: { id: definition.id, confidence: explicit ? 1 : Math.min(1, 0.5 + scoreWorkflow(definition, request.query) / 10), arguments: extracted.arguments }, skills: selectedSkillIds(this.skillRegistry, definition.id).map((id) => ({ id, purpose: 'selected by the authoritative Workflow definition' })), entities: this.entities(request.query), missingRequiredInputs: extracted.missingRequiredInputs, contextPolicy: request.contextPolicy, persistencePolicy: request.persistencePolicy, rationale: explicit ? 'User-selected Workflow has precedence over automatic routing.' : `Matched existing Workflow definition ${definition.id}.` })
      return { request, decision, summary: this.summary(request, decision, definition) }
    }
    if (explicit) throw new ApplicationServiceError('not_found', `Workflow definition not found: ${request.mode.workflowId}`)
    const skill = this.bestSkill(request.query)
    if (skill !== undefined) {
      const decision = validateResearchDispatchDecision({ mode: 'skill_plan', skills: [{ id: skill.id, purpose: skill.whenToUse }], entities: this.entities(request.query), missingRequiredInputs: [], contextPolicy: request.contextPolicy, persistencePolicy: request.persistencePolicy, rationale: `No suitable Workflow matched; selected Research Skill ${skill.id}.` })
      return { request, decision, summary: this.summary(request, decision) }
    }
    const decision = validateResearchDispatchDecision({ mode: 'free_research', skills: [], entities: this.entities(request.query), missingRequiredInputs: [], contextPolicy: request.contextPolicy, persistencePolicy: request.persistencePolicy, rationale: 'No suitable Workflow or enabled Research Skill matched; continue as Free Research.' })
    return { request, decision, summary: this.summary(request, decision) }
  }

  start(input: unknown, callerSignal?: AbortSignal): ResearchDispatchStart {
    const resolved = this.resolve(input)
    const { decision } = resolved
    if (decision.missingRequiredInputs.length > 0) return { ...resolved, status: 'missing_input' }
    if (decision.mode === 'free_research') return { ...resolved, status: 'free_research' }
    if (decision.mode === 'skill_plan') return { ...resolved, status: 'skill_plan' }
    const workflow = decision.workflow
    if (workflow === undefined) throw new ApplicationServiceError('failed', 'Validated workflow decision did not include a workflow')
    const definition = this.workflowRegistry.get(workflow.id)
    if (definition === undefined) throw new ApplicationServiceError('not_found', `Workflow definition not found: ${workflow.id}`)
    const runId = randomUUID()
    const started = this.startWorkflow(definition.id, workflow.arguments, runId, callerSignal, resolved.request.persistencePolicy.writeKnowledge, resolved.request.contextPolicy.structuredKnowledge)
    const completion = started.then(async (result) => { const bundle = createResearchBundle({ request: resolved.request, decision, summary: resolved.summary, workflowRunId: runId, result }); await this.options.bundleStore?.put(bundle); return result })
    completion.catch(() => undefined)
    return { ...resolved, status: 'started', runId, ...(this.options.workflowService?.getWorkflowStatus(runId) === undefined ? {} : { workflow: this.options.workflowService.getWorkflowStatus(runId) }), completion }
  }

  async getBundle(bundleId: string): Promise<ResearchBundle | undefined> { return this.options.bundleStore?.get(bundleId) }
  async listBundles(limit?: number): Promise<readonly ResearchBundle[]> { return this.options.bundleStore?.list(limit) ?? [] }

  private bestWorkflow(query: string): WorkflowDefinition | undefined {
    const candidates = this.workflowRegistry.list().map((definition) => ({ definition, score: scoreWorkflow(definition, query) }))
    const specializedMatch = candidates.some((item) => item.definition.id !== 'company_research' && item.definition.id !== 'daily_intelligence' && item.score > 0)
    return candidates.map((item) => item.definition.id === 'company_research' && !specializedMatch && extractSymbol(query).symbol !== undefined ? { ...item, score: item.score + 2 } : item).sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id)).find((item) => item.score > 0)?.definition
  }

  private bestSkill(query: string): ResearchSkillDefinition | undefined {
    const text = safeQuery(query)
    return this.skillRegistry.researchCandidates().map((skill) => {
      const workflowScore = WORKFLOW_KEYWORDS[skill.researchCapability ?? '']?.reduce((score, term) => score + (containsTerm(text, term) ? 1 : 0), 0) ?? 0
      const explicitSkillScore = containsTerm(text, skill.id) ? 2 : 0
      const usageScore = containsTerm(text, skill.whenToUse) ? 1 : 0
      return { skill, score: workflowScore + explicitSkillScore + usageScore }
    }).sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id)).find((item) => item.score > 0)?.skill
  }

  private entities(query: string) {
    const identity = extractSymbol(query)
    return identity.symbol === undefined ? [] : [{ type: 'company', value: identity.name ?? identity.symbol, confidence: 0.95 }]
  }

  private summary(request: ResearchRequest, decision: ResearchDispatchDecision, definition?: WorkflowDefinition): ResearchExecutionSummary {
    const workflow = decision.workflow
    return { mode: request.mode.type === 'workflow' ? 'Explicit Workflow' : 'Free Research', ...(workflow === undefined ? {} : { workflowId: workflow.id, workflowLabel: definition?.label }), selectedSkillIds: decision.skills.map((skill) => skill.id), argumentsStatus: decision.missingRequiredInputs.length > 0 ? 'missing' : workflow === undefined ? 'not_required' : 'extracted', argumentKeys: workflow === undefined ? [] : Object.keys(workflow.arguments).sort(), contextPolicy: request.contextPolicy, persistencePolicy: request.persistencePolicy }
  }

  private startWorkflow(workflowId: string, args: Readonly<Record<string, unknown>>, runId: string, callerSignal?: AbortSignal, writeKnowledge = false, useStructuredKnowledge = true): Promise<unknown> {
    const research = this.options.researchService
    if (workflowId === 'daily_intelligence') {
      const daily = this.options.dailyIntelligenceService
      if (daily === undefined) throw new ApplicationServiceError('failed', 'Daily Intelligence service is not configured')
      return daily.startBrief({ workflowRunId: runId, briefType: args.briefType as 'morning' | 'evening', tradeDate: args.tradeDate as string, writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    }
    if (research === undefined) throw new ApplicationServiceError('failed', 'Research service is not configured')
    if (workflowId === 'company_research') return research.startResearchCompany({ workflowRunId: runId, symbol: args.symbol as string, ...(typeof args.name === 'string' ? { name: args.name } : {}), writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    if (workflowId === 'industry_research') return research.startIndustryResearch({ workflowRunId: runId, name: args.name as string, writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    if (workflowId === 'earnings_review') return research.startEarningsReview({ workflowRunId: runId, symbol: args.symbol as string, name: args.name as string | undefined, fiscalYear: args.fiscalYear as number, period: args.period as EarningsReviewPeriod, writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    if (workflowId === 'valuation') return research.startValuation({ workflowRunId: runId, symbol: args.symbol as string, name: args.name as string | undefined, methods: args.methods as readonly ValuationMethod[] | undefined, targetFiscalYear: args.targetFiscalYear as number | undefined, writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    if (workflowId === 'event_research') return research.startEventResearch({ workflowRunId: runId, symbol: args.symbol as string, name: args.name as string | undefined, anchor: args.anchor as EventAnchor, writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    if (workflowId === 'thesis_red_team') return research.startThesisRedTeam({ workflowRunId: runId, symbol: args.symbol as string, name: args.name as string | undefined, thesisRef: args.thesisRef as string, writeKnowledge, useStructuredKnowledge }, callerSignal).completion
    throw new ApplicationServiceError('not_found', `Workflow definition has no adapter: ${workflowId}`)
  }
}
