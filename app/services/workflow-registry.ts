export interface WorkflowDefinition {
  readonly id: string
  readonly label: string
  readonly intentDescription: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly requiredInputs: readonly string[]
  readonly outputContract: string
  readonly knowledgeEffects: readonly string[]
}

const stringSchema = (description: string): Readonly<Record<string, unknown>> => ({ type: 'string', description })
const integerSchema = (description: string): Readonly<Record<string, unknown>> => ({ type: 'integer', description })

const DEFINITIONS: readonly WorkflowDefinition[] = [
  { id: 'company_research', label: 'Company Research', intentDescription: 'Build an evidence-backed research profile for one A-share company.', inputSchema: { symbol: stringSchema('Six-digit A-share symbol'), name: stringSchema('Optional company name'), exchange: stringSchema('Optional exchange') }, requiredInputs: ['symbol'], outputContract: 'ResearchReport + KnowledgeProposal', knowledgeEffects: ['Company', 'Source', 'Claim', 'Relation'] },
  { id: 'industry_research', label: 'Industry Research', intentDescription: 'Run bounded multi-module research for one industry.', inputSchema: { name: stringSchema('Industry name'), aliases: { type: 'array', items: stringSchema('Target alias') } }, requiredInputs: ['name'], outputContract: 'ResearchReport + KnowledgeProposal', knowledgeEffects: ['Industry', 'Source', 'Claim', 'Relation'] },
  { id: 'earnings_review', label: 'Earnings Review', intentDescription: 'Review an exact fiscal reporting period for a covered A-share company.', inputSchema: { symbol: stringSchema('Six-digit A-share symbol'), fiscalYear: integerSchema('Fiscal year'), period: { type: 'string', enum: ['Q1', 'H1', 'Q3', 'FY'] } }, requiredInputs: ['symbol', 'fiscalYear', 'period'], outputContract: 'ResearchReport + KnowledgeProposal', knowledgeEffects: ['Source', 'Claim'] },
  { id: 'valuation', label: 'Valuation', intentDescription: 'Calculate bounded valuation scenarios for a covered A-share company.', inputSchema: { symbol: stringSchema('Six-digit A-share symbol'), methods: { type: 'array', items: { type: 'string', enum: ['PE', 'PB', 'EV_EBITDA'] } }, targetFiscalYear: integerSchema('Optional target fiscal year') }, requiredInputs: ['symbol'], outputContract: 'ResearchReport + KnowledgeProposal', knowledgeEffects: ['Source', 'Claim'] },
  { id: 'event_research', label: 'Event Research', intentDescription: 'Assess one explicit event anchor and its company-bound impacts.', inputSchema: { symbol: stringSchema('Six-digit A-share symbol'), anchor: { type: 'object', description: 'Explicit event anchor' } }, requiredInputs: ['symbol', 'anchor'], outputContract: 'ResearchReport + KnowledgeProposal', knowledgeEffects: ['Source', 'Claim', 'Relation'] },
  { id: 'thesis_red_team', label: 'Thesis Red Team', intentDescription: 'Adversarially test one active canonical Thesis Claim.', inputSchema: { symbol: stringSchema('Six-digit A-share symbol'), thesisRef: stringSchema('Canonical Claim reference'), lookbackDays: integerSchema('Optional lookback window') }, requiredInputs: ['symbol', 'thesisRef'], outputContract: 'ResearchReport + KnowledgeProposal', knowledgeEffects: ['Source', 'Claim'] },
  { id: 'daily_intelligence', label: 'Daily Intelligence', intentDescription: 'Generate a bounded morning or evening research brief from configured public signals.', inputSchema: { briefType: { type: 'string', enum: ['morning', 'evening'] }, tradeDate: stringSchema('Trading date') }, requiredInputs: ['briefType', 'tradeDate'], outputContract: 'DailyBriefReport + ResearchReport', knowledgeEffects: ['Source', 'Claim'] },
]

function clone(definition: WorkflowDefinition): WorkflowDefinition {
  return { ...definition, inputSchema: JSON.parse(JSON.stringify(definition.inputSchema)) as Readonly<Record<string, unknown>>, requiredInputs: [...definition.requiredInputs], knowledgeEffects: [...definition.knowledgeEffects] }
}

export class WorkflowDefinitionRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>()

  constructor(definitions: readonly WorkflowDefinition[] = DEFINITIONS) {
    for (const definition of definitions) this.register(definition)
  }

  register(definition: WorkflowDefinition): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(definition.id)) throw new Error(`Unsafe Workflow definition ID: ${definition.id}`)
    if (this.definitions.has(definition.id)) throw new Error(`Duplicate Workflow definition: ${definition.id}`)
    if (!definition.label.trim() || !definition.intentDescription.trim() || !definition.outputContract.trim()) throw new Error(`Incomplete Workflow definition: ${definition.id}`)
    if (definition.requiredInputs.some((item) => typeof item !== 'string' || !item.trim())) throw new Error(`Invalid required input metadata: ${definition.id}`)
    this.definitions.set(definition.id, clone(definition))
  }

  get(id: string): WorkflowDefinition | undefined {
    const value = this.definitions.get(id)
    return value === undefined ? undefined : clone(value)
  }

  list(): readonly WorkflowDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.id.localeCompare(right.id)).map(clone)
  }
}

export function createWorkflowDefinitionRegistry(): WorkflowDefinitionRegistry {
  return new WorkflowDefinitionRegistry()
}

export function listWorkflowDefinitions(): readonly WorkflowDefinition[] {
  return createWorkflowDefinitionRegistry().list()
}
