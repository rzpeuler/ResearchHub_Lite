import type { DailyBriefSection, DailyResearchSignal, DailySignalCluster, DailyBriefType, ResearchChangeAssessment } from '../../plugins/daily-intelligence/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { normalizeReasoningStructuredOutput } from './structured-output.ts'

const MORNING = ['Overnight Global', 'Macro/Policy', 'A-share Important Announcements', 'Market/Futures/Major Asset', 'AI/Technology/Industry', 'Public Institutional Views', 'IR/Institution Research', 'Watchlist', 'Community/Sentiment', 'Existing Thesis Changes', 'Catalysts', 'Risks', 'Research Gaps', "Today's Questions"]
const EVENING = ['A-share summary', 'Sector/Industry/Theme', 'Important Events', 'Announcements', 'Institutional Views', 'IR', 'Community Narrative', 'Watchlist', 'Knowledge changes', 'Thesis/Assumption impacts', 'Catalysts/Risks', 'Gaps', 'Tomorrow Watchlist']

export interface DailySynthesisProposal {
  readonly proposalId: string
  readonly kind: 'claim'
  readonly subjectKey: string
  readonly claimType: 'viewpoint' | 'risk' | 'trend'
  readonly statement: string
  readonly sourceCandidateIds: readonly string[]
  readonly assessmentRefs: readonly string[]
  readonly confidence: number
}
export interface DailySynthesisResult {
  readonly sections: readonly DailyBriefSection[]
  readonly proposals: readonly DailySynthesisProposal[]
  readonly reasoningUsed: boolean
  readonly fallbackUsed: boolean
  readonly modelDerivedItemCount: number
  readonly reasoningDiagnostics: readonly string[]
}

export class DailyBriefSynthesisSkill {
  async synthesize(type: DailyBriefType, signals: readonly DailyResearchSignal[], clusters: readonly DailySignalCluster[], assessments: readonly ResearchChangeAssessment[], executor?: ReasoningExecutor): Promise<DailySynthesisResult> {
    let lastDiagnostics: string[] = []
    if (executor) {
      try {
        const requiredSections = type === 'morning' ? MORNING : EVENING
        const result = await executor.execute({
          operation: 'daily_brief_synthesis',
          instruction: `Return exactly one compact JSON object with every required section exactly once, in the supplied order. Empty sections are correct when there is no evidence; prefer empty arrays and emit no more than three items total. For an entity-matched observation, prefer the Watchlist section; do not use a Signal to fill an unrelated section. Every non-empty item must cite supplied signalRefs; interpretations must also cite assessmentRefs or signalRefs. Proposals are only semantic drafts and must copy assessmentRefs from supplied assessments; deterministic validation decides durability. Required sections: ${requiredSections.join(' | ')}.`,
          input: { type, sections: requiredSections, signals: signals.slice(0, 40), clusters: clusters.slice(0, 20), assessments: assessments.slice(0, 20) },
          outputContract: { sections: [{ id: 'string', title: 'one required section title', items: [{ itemId: 'string', headline: 'string', markdown: 'string', signalRefs: ['supplied signal-id'], assessmentRefs: ['supplied cluster-id'], kind: 'signal|interpretation', rank: 1 }] }], proposals: [{ proposalId: 'string', subjectKey: 'watchlist-symbol-only', claimType: 'viewpoint|risk|trend', statement: 'string', sourceCandidateIds: ['supplied candidate-id'], assessmentRefs: ['supplied assessment cluster-id'], confidence: 0.0 }] },
          metadata: { workflow: 'daily-intelligence' },
        })
        const normalized = normalizeReasoningStructuredOutput(result.output)
        const parsed = validateModelOutput(normalized.value, signals, assessments, clusters, type)
        if (parsed) { const sections = finalizeSections(parsed.sections); return { ...parsed, sections, reasoningUsed: true, fallbackUsed: false, modelDerivedItemCount: sections.flatMap((section) => section.items).filter((item) => item.signalRefs.length > 0).length, reasoningDiagnostics: normalized.diagnostics.map((item) => item.code) } }
        lastDiagnostics = [...normalized.diagnostics.map((item) => item.code), ...outputShapeDiagnostics(normalized.value), 'validation_shape_or_reference_rejected']
      } catch (error) {
        lastDiagnostics = [errorCode(error)]
      }
    }
    const sections = fallbackSections(type, signals, assessments, clusters)
    const proposals = assessments.filter((assessment) => assessment.durableCandidate && assessment.relatedKnowledgeRefs.length > 0).slice(0, 5).flatMap((assessment, index) => {
      const cluster = clusters.find((item) => item.clusterId === assessment.clusterId)
      const sourceCandidateIds = cluster?.signals.filter((signal) => signal.sourceTier <= 2).map((signal) => signal.source.candidateId) ?? []
      const subjectKey = cluster?.entities.find((entity) => /^\d{6}$/.test(entity))
      return subjectKey && sourceCandidateIds.length ? [{ proposalId: `daily-proposal-${index + 1}`, kind: 'claim' as const, subjectKey, claimType: assessment.disposition === 'risk' ? 'risk' as const : assessment.disposition === 'catalyst' ? 'trend' as const : 'viewpoint' as const, statement: assessment.rationale, sourceCandidateIds, assessmentRefs: [assessment.clusterId], confidence: 0.65 }] : []
    })
    return { sections, proposals, reasoningUsed: false, fallbackUsed: true, modelDerivedItemCount: 0, reasoningDiagnostics: lastDiagnostics }
  }
}

function validateModelOutput(value: unknown, signals: readonly DailyResearchSignal[], assessments: readonly ResearchChangeAssessment[], clusters: readonly DailySignalCluster[], type: DailyBriefType): Omit<DailySynthesisResult, 'reasoningUsed' | 'fallbackUsed' | 'modelDerivedItemCount' | 'reasoningDiagnostics'> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const object = value as Record<string, unknown>
  if (!Array.isArray(object.sections) || !Array.isArray(object.proposals)) return undefined
  const signalById = new Map(signals.map((signal) => [signal.signalId, signal]))
  const assessmentIds = new Set(assessments.map((assessment) => assessment.clusterId))
  const expected = type === 'morning' ? MORNING : EVENING
  const sections: DailyBriefSection[] = []
  const seenTitles = new Set<string>()
  const seenItemIds = new Set<string>()
  let modelItemCount = 0
  for (const [sectionIndex, raw] of object.sections.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const section = raw as Record<string, unknown>
    if (typeof section.id !== 'string' || typeof section.title !== 'string' || !Array.isArray(section.items)) return undefined
    const suppliedTitle = section.title
    const expectedTitle = expected[sectionIndex]
    if (!expectedTitle || suppliedTitle.toLowerCase() !== expectedTitle.toLowerCase() || seenTitles.has(expectedTitle)) return undefined
    seenTitles.add(expectedTitle)
    const items: Array<DailyBriefSection['items'][number]> = []
    let rejectedItem = false
    for (const item of section.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { rejectedItem = true; continue }
      const row = item as Record<string, unknown>
      const signalRefs: string[] | undefined = Array.isArray(row.signalRefs) && row.signalRefs.every((id) => typeof id === 'string' && signalById.has(id)) ? row.signalRefs.filter((id): id is string => typeof id === 'string') : undefined
      const assessmentRefsValid = !('assessmentRefs' in row) || (Array.isArray(row.assessmentRefs) && row.assessmentRefs.every((id) => typeof id === 'string' && assessmentIds.has(id)))
      const assessmentRefs: string[] = Array.isArray(row.assessmentRefs) && row.assessmentRefs.every((id) => typeof id === 'string' && assessmentIds.has(id)) ? row.assessmentRefs.filter((id): id is string => typeof id === 'string') : []
      const sectionTitle = String(section.title)
      const requiresAssessmentRef = /thesis|assumption|knowledge changes/.test(sectionTitle.toLowerCase())
      const kind = row.kind === undefined ? 'signal' : row.kind === 'interpretation' || row.kind === 'signal' ? row.kind : undefined
      const itemId = typeof row.itemId === 'string' ? row.itemId : undefined
      const headline = typeof row.headline === 'string' ? row.headline : undefined
      const markdown = typeof row.markdown === 'string' ? row.markdown : undefined
      const rank = row.rank === undefined ? items.length + 1 : row.rank
      const validText = headline !== undefined && headline.trim() !== '' && headline.length <= 300 && markdown !== undefined && markdown.trim() !== '' && markdown.length <= 4000
      if (!signalRefs || signalRefs.length === 0 || !assessmentRefsValid || (requiresAssessmentRef && assessmentRefs.length === 0) || !kind || itemId === undefined || itemId.trim() === '' || seenItemIds.has(itemId) || !validText || typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > 3 || modelItemCount >= 3 || (kind === 'interpretation' && assessmentRefs.length === 0 && signalRefs.length === 0) || signalRefs.some((id) => !sectionMatches(sectionTitle, signalById.get(id)!, assessments, clusters, assessmentRefs)) || assessmentRefs.some((ref) => !clusters.some((cluster) => cluster.clusterId === ref && signalRefs.some((id) => cluster.signalRefs.includes(id))))) { rejectedItem = true; continue }
      if (headline === undefined || markdown === undefined) { rejectedItem = true; continue }
      seenItemIds.add(itemId)
      modelItemCount += 1
      items.push({ itemId, headline, markdown, signalRefs, assessmentRefs, sourceRefs: [], kind, rank })
    }
    if (rejectedItem && items.length === 0) return undefined
    sections.push({ id: section.id, title: expectedTitle, items })
  }
  if (sections.length !== expected.length || seenTitles.size !== expected.length) return undefined
  const proposals = object.proposals.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const proposal = raw as Record<string, unknown>
    const sourceIds = Array.isArray(proposal.sourceCandidateIds) && proposal.sourceCandidateIds.length > 0 && proposal.sourceCandidateIds.every((id) => typeof id === 'string' && signals.some((signal) => signal.source.candidateId === id))
    const assessmentRefs = Array.isArray(proposal.assessmentRefs) && proposal.assessmentRefs.length > 0 && proposal.assessmentRefs.every((id) => typeof id === 'string' && assessmentIds.has(id)) ? proposal.assessmentRefs.filter((id): id is string => typeof id === 'string') : undefined
    if (typeof proposal.proposalId !== 'string' || typeof proposal.subjectKey !== 'string' || typeof proposal.statement !== 'string' || !sourceIds || !assessmentRefs || !['viewpoint', 'risk', 'trend'].includes(String(proposal.claimType))) return []
    return [{ proposalId: proposal.proposalId, kind: 'claim' as const, subjectKey: proposal.subjectKey, claimType: proposal.claimType as DailySynthesisProposal['claimType'], statement: proposal.statement, sourceCandidateIds: proposal.sourceCandidateIds as string[], assessmentRefs, confidence: typeof proposal.confidence === 'number' ? Math.max(0, Math.min(1, proposal.confidence)) : 0.5 }]
  }).slice(0, 5)
  return { sections, proposals }
}

function fallbackSections(type: DailyBriefType, signals: readonly DailyResearchSignal[], assessments: readonly ResearchChangeAssessment[], clusters: readonly DailySignalCluster[]): DailyBriefSection[] {
  const names = type === 'morning' ? MORNING : EVENING
  return names.map((title, index) => {
    const selected = signals.filter((signal) => sectionMatches(title, signal, assessments, clusters)).slice(0, 5)
    const items: DailyBriefSection['items'] = selected.length ? selected.map((signal, rank) => { const refs = assessmentRefsForSignal(title, signal, assessments, clusters); return { itemId: `item-${index + 1}-${rank + 1}`, headline: signal.title, markdown: `${signal.narrative ?? signal.excerpt ?? signal.title}\n\nEvidence: ${signal.source.url ?? 'public provider item'}.`, signalRefs: [signal.signalId], ...(refs.length ? { assessmentRefs: refs } : {}), sourceRefs: [], kind: 'signal' as const, rank: rank + 1 } }) : [{ itemId: `gap-${index + 1}`, headline: 'Unavailable / no usable public signal', markdown: 'Unavailable: no usable configured public signal was available for this section.', signalRefs: [], sourceRefs: [], kind: 'gap' as const, rank: 1 }]
    return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`, title, items, ...(selected.length ? {} : { unavailable: true }) }
  })
}

function finalizeSections(sections: readonly DailyBriefSection[]): DailyBriefSection[] { return sections.map((section) => section.items.length > 0 ? section : { ...section, items: [{ itemId: `gap-${section.id}`, headline: 'Unavailable / no usable public signal', markdown: 'Unavailable: no usable configured public signal was available for this section.', signalRefs: [], sourceRefs: [], kind: 'gap' as const, rank: 1 }], unavailable: true }) }

function sectionMatches(section: string, signal: DailyResearchSignal, assessments: readonly ResearchChangeAssessment[] = [], clusters: readonly DailySignalCluster[] = [], assessmentRefs: readonly string[] = []): boolean {
  const s = section.toLowerCase()
  if (/overnight global/.test(s)) return signal.category === 'news' && signal.kind === 'market'
  if (/macro\/policy/.test(s)) return signal.category === 'macro'
  if (/a-share important announcements|^announcements$|important events/.test(s)) return signal.kind === 'announcement' || ['announcement', 'earnings', 'performance_forecast'].includes(signal.category)
  if (/institution|ir/.test(s)) return signal.kind === 'institutional_view' || signal.category === 'institutional_research' || signal.category === 'investor_relations'
  if (/community|narrative|sentiment/.test(s)) return signal.kind === 'community' || signal.kind === 'social_attention'
  if (/market\/futures\/major asset|^a-share summary$/.test(s)) return signal.kind === 'market' || signal.category === 'market'
  if (/ai\/technology\/industry|sector\/industry\/theme/.test(s)) return ['technology', 'industry'].includes(signal.category)
  if (/catalyst/.test(s)) return assessmentMatches(signal, assessments, clusters, ['catalyst'])
  if (/risk/.test(s)) return assessmentMatches(signal, assessments, clusters, ['risk', 'contradicts', 'changes_assumption', 'affects_thesis'])
  if (/watchlist/.test(s)) return signal.entities.length > 0
  if (/thesis|assumption|knowledge changes/.test(s)) return assessmentRefs.length > 0 || assessmentMatches(signal, assessments, clusters, ['supports', 'contradicts', 'changes_assumption', 'affects_thesis'])
  return false
}

function assessmentMatches(signal: DailyResearchSignal, assessments: readonly ResearchChangeAssessment[], clusters: readonly DailySignalCluster[], dispositions: readonly string[]): boolean { return assessments.some((assessment) => dispositions.includes(assessment.disposition) && clusters.some((cluster) => cluster.clusterId === assessment.clusterId && cluster.signalRefs.includes(signal.signalId))) }
function assessmentRefsForSignal(section: string, signal: DailyResearchSignal, assessments: readonly ResearchChangeAssessment[], clusters: readonly DailySignalCluster[]): string[] { const s = section.toLowerCase(); const dispositions = /catalyst/.test(s) ? ['catalyst'] : /risk/.test(s) ? ['risk', 'contradicts', 'changes_assumption', 'affects_thesis'] : /thesis|assumption|knowledge changes/.test(s) ? ['supports', 'contradicts', 'changes_assumption', 'affects_thesis'] : []; return assessments.filter((assessment) => dispositions.includes(assessment.disposition) && clusters.some((cluster) => cluster.clusterId === assessment.clusterId && cluster.signalRefs.includes(signal.signalId))).map((assessment) => assessment.clusterId) }
function outputShapeDiagnostics(value: unknown): string[] { if (value === null) return ['output_type_null']; if (Array.isArray(value)) return ['output_type_array', `output_array_count_${value.length}`]; if (typeof value !== 'object') return [`output_type_${typeof value}`]; const object = value as Record<string, unknown>; const diagnostics = [`output_keys_${Object.keys(object).sort().join(',')}`]; if (Array.isArray(object.sections)) { diagnostics.push(`sections_count_${object.sections.length}`); const sections = object.sections.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)); diagnostics.push(`section_object_count_${sections.length}`, `section_items_array_count_${sections.filter((item) => Array.isArray(item.items)).length}`, `section_item_total_${sections.reduce((total, item) => total + (Array.isArray(item.items) ? item.items.length : 0), 0)}`) } if (Array.isArray(object.proposals)) diagnostics.push(`proposals_count_${object.proposals.length}`); return diagnostics }
function errorCode(error: unknown): string { return error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string' ? `executor_${String((error as { code: string }).code)}` : error instanceof Error && error.name ? `executor_${error.name}` : 'executor_failed' }
