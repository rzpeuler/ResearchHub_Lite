export type ResearchHubSkillKind = 'research' | 'knowledge' | 'utility'

export interface ResearchSkillDefinition {
  readonly id: string
  readonly kind: ResearchHubSkillKind
  readonly researchCapability?: string
  readonly intentDescription: string
  readonly whenToUse: string
  readonly inputSchema?: Readonly<Record<string, unknown>>
  readonly outputContract?: string
  readonly enabled: boolean
  readonly scope: 'researchhub'
}

const CORE_SKILLS: readonly ResearchSkillDefinition[] = [
  { id: 'company-research', kind: 'research', researchCapability: 'company_research', intentDescription: 'Evidence-backed A-share company research.', whenToUse: 'Use for a bounded company research request.', outputContract: 'Company research sections and proposals', enabled: true, scope: 'researchhub' },
  { id: 'industry-research', kind: 'research', researchCapability: 'industry_research', intentDescription: 'Eight-module industry research.', whenToUse: 'Use for a bounded industry research request.', outputContract: 'Industry module report and proposals', enabled: true, scope: 'researchhub' },
  { id: 'earnings-review', kind: 'research', researchCapability: 'earnings_review', intentDescription: 'Exact-period earnings review.', whenToUse: 'Use for a fiscal-period earnings comparison.', outputContract: 'Earnings review report and proposals', enabled: true, scope: 'researchhub' },
  { id: 'event-research', kind: 'research', researchCapability: 'event_research', intentDescription: 'Company-bound event research.', whenToUse: 'Use when a request names an event anchor.', outputContract: 'Event research report and proposals', enabled: true, scope: 'researchhub' },
  { id: 'valuation', kind: 'research', researchCapability: 'valuation', intentDescription: 'Bounded valuation analysis.', whenToUse: 'Use when a request asks for valuation scenarios.', outputContract: 'Valuation report and proposals', enabled: true, scope: 'researchhub' },
  { id: 'thesis-red-team', kind: 'research', researchCapability: 'thesis_red_team', intentDescription: 'Adversarial thesis testing.', whenToUse: 'Use when a request asks to challenge an active thesis.', outputContract: 'Thesis red-team report and proposals', enabled: true, scope: 'researchhub' },
  { id: 'daily-intelligence', kind: 'research', researchCapability: 'daily_intelligence', intentDescription: 'Daily public-signal intelligence synthesis.', whenToUse: 'Use for a bounded morning or evening intelligence request.', outputContract: 'Daily Brief report', enabled: true, scope: 'researchhub' },
  { id: 'knowledge-curation', kind: 'knowledge', intentDescription: 'Knowledge extraction and semantic resolution.', whenToUse: 'Use only inside governed Knowledge Production.', outputContract: 'Validated Knowledge candidates', enabled: true, scope: 'researchhub' },
]

function clone(definition: ResearchSkillDefinition): ResearchSkillDefinition {
  return { ...definition, ...(definition.inputSchema === undefined ? {} : { inputSchema: JSON.parse(JSON.stringify(definition.inputSchema)) as Readonly<Record<string, unknown>> }) }
}

export class ResearchSkillRegistry {
  private readonly definitions = new Map<string, ResearchSkillDefinition>()

  constructor(definitions: readonly ResearchSkillDefinition[] = CORE_SKILLS) {
    for (const definition of definitions) this.register(definition)
  }

  register(definition: ResearchSkillDefinition): void {
    if (definition.scope !== 'researchhub') throw new Error(`Only ResearchHub skills may enter this registry: ${definition.id}`)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(definition.id)) throw new Error(`Unsafe Skill definition ID: ${definition.id}`)
    if (this.definitions.has(definition.id)) throw new Error(`Duplicate Skill definition: ${definition.id}`)
    if (!definition.intentDescription.trim() || !definition.whenToUse.trim()) throw new Error(`Incomplete Skill definition: ${definition.id}`)
    this.definitions.set(definition.id, clone(definition))
  }

  get(id: string): ResearchSkillDefinition | undefined {
    const value = this.definitions.get(id)
    return value === undefined ? undefined : clone(value)
  }

  list(): readonly ResearchSkillDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.id.localeCompare(right.id)).map(clone)
  }

  researchCandidates(): readonly ResearchSkillDefinition[] {
    return this.list().filter((definition) => definition.enabled && definition.kind === 'research')
  }
}

export function createResearchSkillRegistry(): ResearchSkillRegistry {
  return new ResearchSkillRegistry()
}
