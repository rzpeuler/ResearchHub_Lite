import type { DailyBriefSection, DailyResearchSignal, DailySignalCluster, DailyBriefType, ResearchChangeAssessment } from '../../plugins/daily-intelligence/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

const MORNING = ['Overnight Global', 'Macro/Policy', 'A-share Important Announcements', 'Market/Futures/Major Asset', 'AI/Technology/Industry', 'Public Institutional Views', 'IR/Institution Research', 'Watchlist', 'Community/Sentiment', 'Existing Thesis Changes', 'Catalysts', 'Risks', 'Research Gaps', "Today's Questions"]
const EVENING = ['A-share summary', 'Sector/Industry/Theme', 'Important Events', 'Announcements', 'Institutional Views', 'IR', 'Community Narrative', 'Watchlist', 'Knowledge changes', 'Thesis/Assumption impacts', 'Catalysts/Risks', 'Gaps', 'Tomorrow Watchlist']
export interface DailySynthesisProposal { readonly proposalId: string; readonly kind: 'claim'; readonly subjectKey: string; readonly claimType: 'viewpoint' | 'risk' | 'trend'; readonly statement: string; readonly sourceCandidateIds: readonly string[]; readonly confidence: number }
export interface DailySynthesisResult { readonly sections: readonly DailyBriefSection[]; readonly proposals: readonly DailySynthesisProposal[]; readonly reasoningUsed: boolean; readonly modelDerivedItemCount: number }

export class DailyBriefSynthesisSkill {
  async synthesize(type: DailyBriefType, signals: readonly DailyResearchSignal[], clusters: readonly DailySignalCluster[], assessments: readonly ResearchChangeAssessment[], executor?: ReasoningExecutor): Promise<DailySynthesisResult> {
    if (executor) {
      try {
        const result = await executor.execute({ operation: 'daily_brief_synthesis', instruction: 'Create only evidence-backed sections and durable local proposals. Use only supplied IDs. Do not invent sources, canonical IDs, or facts.', input: { type, sections: type === 'morning' ? MORNING : EVENING, signals: signals.slice(0, 40), clusters: clusters.slice(0, 20), assessments: assessments.slice(0, 20) }, outputContract: { sections: [{ id: 'string', title: 'string', items: [{ itemId: 'string', headline: 'string', markdown: 'string', signalRefs: ['signal-id'], assessmentRefs: ['cluster-id'], kind: 'signal|interpretation', rank: 1 }] }], proposals: [{ proposalId: 'string', subjectKey: 'watchlist-symbol-only', claimType: 'viewpoint|risk|trend', statement: 'string', sourceCandidateIds: ['candidate-id'], confidence: 0.0 }] }, metadata: { workflow: 'daily-intelligence' } })
        const parsed = validateModelOutput(result.output, signals, assessments, clusters, type)
        if (parsed) return { ...parsed, reasoningUsed: true, modelDerivedItemCount: parsed.sections.flatMap((section) => section.items).filter((item) => item.signalRefs.length > 0).length }
      } catch { /* deterministic degraded mode below */ }
    }
    const sections = fallbackSections(type, signals, assessments, clusters)
    const proposals = assessments.filter((assessment) => assessment.durableCandidate && assessment.relatedKnowledgeRefs.length > 0).slice(0, 5).flatMap((assessment, index) => {
      const cluster = clusters.find((item) => item.clusterId === assessment.clusterId)
      const sourceCandidateIds = cluster?.signals.filter((signal) => signal.sourceTier <= 2).map((signal) => signal.source.candidateId) ?? []
      const subjectKey = cluster?.entities.find((entity) => /^\d{6}$/.test(entity))
      return subjectKey && sourceCandidateIds.length ? [{ proposalId: `daily-proposal-${index + 1}`, kind: 'claim' as const, subjectKey, claimType: assessment.disposition === 'risk' ? 'risk' as const : assessment.disposition === 'catalyst' ? 'trend' as const : 'viewpoint' as const, statement: assessment.rationale, sourceCandidateIds, confidence: 0.65 }] : []
    })
    return { sections, proposals, reasoningUsed: false, modelDerivedItemCount: 0 }
  }
}

function validateModelOutput(value: unknown, signals: readonly DailyResearchSignal[], assessments: readonly ResearchChangeAssessment[], clusters: readonly DailySignalCluster[], type: DailyBriefType): Omit<DailySynthesisResult, 'reasoningUsed' | 'modelDerivedItemCount'> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const object = value as Record<string, unknown>
  if (!Array.isArray(object.sections) || !Array.isArray(object.proposals)) return undefined
  const signalById = new Map(signals.map((signal) => [signal.signalId, signal]))
  const assessmentIds = new Set(assessments.map((assessment) => assessment.clusterId))
  const sections: DailyBriefSection[] = []
  for (const raw of object.sections) {
    if (!raw || typeof raw !== 'object') return undefined
    const section = raw as Record<string, unknown>
    if (typeof section.id !== 'string' || typeof section.title !== 'string' || !Array.isArray(section.items)) return undefined
    const items: Array<DailyBriefSection['items'][number]> = []
    for (const item of section.items) {
      if (!item || typeof item !== 'object') return undefined
      const row = item as Record<string, unknown>
      const signalRefs: string[] | undefined = Array.isArray(row.signalRefs) && row.signalRefs.every((id) => typeof id === 'string' && signalById.has(id)) ? row.signalRefs.filter((id): id is string => typeof id === 'string') : undefined
      const assessmentRefs: string[] = Array.isArray(row.assessmentRefs) && row.assessmentRefs.every((id) => typeof id === 'string' && assessmentIds.has(id)) ? row.assessmentRefs.filter((id): id is string => typeof id === 'string') : []
      if (!signalRefs || typeof row.itemId !== 'string' || typeof row.headline !== 'string' || typeof row.markdown !== 'string' || signalRefs.some((id: string) => !sectionMatches(String(section.title), signalById.get(String(id))!, assessments, clusters, assessmentRefs))) return undefined
      items.push({ itemId: row.itemId, headline: row.headline, markdown: row.markdown, signalRefs, assessmentRefs, sourceRefs: [], kind: row.kind === 'interpretation' ? 'interpretation' : 'signal', rank: typeof row.rank === 'number' ? row.rank : items.length + 1 })
    }
    sections.push({ id: section.id, title: section.title, items })
  }
  if (sections.length !== (type === 'morning' ? MORNING.length : EVENING.length)) return undefined
  const proposals = object.proposals.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const p = raw as Record<string, unknown>
    const ids = Array.isArray(p.sourceCandidateIds) && p.sourceCandidateIds.every((id) => typeof id === 'string' && signals.some((signal) => signal.source.candidateId === id))
    if (typeof p.proposalId !== 'string' || typeof p.subjectKey !== 'string' || typeof p.statement !== 'string' || !ids || !['viewpoint', 'risk', 'trend'].includes(String(p.claimType))) return []
    return [{ proposalId: p.proposalId, kind: 'claim' as const, subjectKey: p.subjectKey, claimType: p.claimType as DailySynthesisProposal['claimType'], statement: p.statement, sourceCandidateIds: p.sourceCandidateIds as string[], confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5 }]
  }).slice(0, 5)
  return { sections, proposals }
}

function fallbackSections(type: DailyBriefType, signals: readonly DailyResearchSignal[], assessments: readonly ResearchChangeAssessment[], clusters: readonly DailySignalCluster[]): DailyBriefSection[] {
  const names = type === 'morning' ? MORNING : EVENING
  return names.map((title, index) => {
    const selected = signals.filter((signal) => sectionMatches(title, signal, assessments, clusters)).slice(0, 5)
    const items: DailyBriefSection['items'] = selected.length ? selected.map((signal, rank) => ({ itemId: `item-${index + 1}-${rank + 1}`, headline: signal.title, markdown: `${signal.narrative ?? signal.excerpt ?? signal.title}\n\nEvidence: ${signal.source.url ?? 'public provider item'}.`, signalRefs: [signal.signalId], sourceRefs: [], kind: 'signal' as const, rank: rank + 1 })) : [{ itemId: `gap-${index + 1}`, headline: 'Unavailable / no usable public signal', markdown: 'Unavailable: no usable configured public signal was available for this section.', signalRefs: [], sourceRefs: [], kind: 'gap' as const, rank: 1 }]
    return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`, title, items, ...(selected.length ? {} : { unavailable: true }) }
  })
}

function sectionMatches(section: string, signal: DailyResearchSignal, assessments: readonly ResearchChangeAssessment[] = [], clusters: readonly DailySignalCluster[] = [], assessmentRefs: readonly string[] = []): boolean {
  const s = section.toLowerCase()
  if (/announcement|公告|events/.test(s)) return signal.kind === 'announcement' || ['announcement', 'earnings', 'performance_forecast'].includes(signal.category)
  if (/institution|ir/.test(s)) return signal.kind === 'institutional_view' || signal.category === 'institutional_research' || signal.category === 'investor_relations'
  if (/community|narrative|sentiment/.test(s)) return signal.kind === 'community' || signal.kind === 'social_attention'
  if (/market|summary|sector|industry|theme|futures|major asset|macro|global|policy/.test(s)) return signal.kind === 'market' || ['market', 'industry', 'macro', 'technology'].includes(signal.category)
  if (/catalyst/.test(s)) return signal.category === 'technology' || signal.category === 'industry'
  if (/risk/.test(s)) return signal.sentiment !== undefined && signal.sentiment < 0
  if (/watchlist/.test(s)) return signal.entities.length > 0
  if (/thesis|assumption|knowledge changes/.test(s)) return assessmentRefs.length > 0 || assessments.some((assessment) => assessment.relatedKnowledgeRefs.length > 0 && clusters.some((cluster) => cluster.clusterId === assessment.clusterId && cluster.signalRefs.includes(signal.signalId)))
  return false
}
