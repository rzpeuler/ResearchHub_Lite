import type { DailySignalCluster, ResearchChangeAssessment, ResearchChangeDisposition } from '../../plugins/daily-intelligence/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { normalizeReasoningStructuredOutput } from './structured-output.ts'

export interface ExistingKnowledgeProjection { readonly canonicalRef: string; readonly kind: string; readonly statement?: string; readonly name?: string; readonly claimType?: string; readonly type?: string; readonly subjectRefs?: readonly string[] }
export interface ChangeAssessmentResult { readonly assessment: ResearchChangeAssessment; readonly reasoningUsed: boolean; readonly applied: boolean; readonly fallbackUsed: boolean; readonly reasoningDiagnostics: readonly string[] }
const dispositions: readonly ResearchChangeDisposition[] = ['new', 'supports', 'contradicts', 'changes_assumption', 'affects_thesis', 'catalyst', 'risk', 'noise']

export class DailyChangeAssessmentSkill {
  async assess(cluster: DailySignalCluster, projection: readonly ExistingKnowledgeProjection[], watchlist: readonly string[], executor?: ReasoningExecutor): Promise<ChangeAssessmentResult> {
    const deterministic = precheck(cluster, projection, watchlist)
    if (deterministic) return { assessment: deterministic, reasoningUsed: false, applied: false, fallbackUsed: false, reasoningDiagnostics: [] }
    if (!executor) return { assessment: fallback(cluster), reasoningUsed: false, applied: false, fallbackUsed: true, reasoningDiagnostics: [] }
    try {
      const result = await executor.execute({
        operation: 'daily_change_assessment',
        instruction: 'Return exactly one JSON object. Compare this cluster with only the supplied bounded projection. disposition must be exactly one of: new, supports, contradicts, changes_assumption, affects_thesis, catalyst, risk, noise. Use relatedKnowledgeRefs only when copied exactly from existingKnowledge. For a genuinely new cluster, return an empty array and durableCandidate false. subjectKey must be one supplied watchlist symbol or may be omitted when the cluster has no single subject. Do not allocate canonical IDs.',
        input: { cluster, existingKnowledge: projection.slice(0, 40), watchlist },
        outputContract: { clusterId: cluster.clusterId, disposition: dispositions, relatedKnowledgeRefs: ['canonicalRef copied from input or []'], rationale: 'string', durableCandidate: false, subjectKey: 'watchlist symbol or omitted' },
        metadata: { workflow: 'daily-intelligence' },
      })
      const normalized = normalizeReasoningStructuredOutput(result.output)
      const value = normalized.value as Record<string, unknown> | undefined
      const refs = Array.isArray(value?.relatedKnowledgeRefs) ? value.relatedKnowledgeRefs.filter((ref): ref is string => typeof ref === 'string') : []
      const allowed = new Set(projection.map((item) => item.canonicalRef))
      const rationale = typeof value?.rationale === 'string' ? value.rationale : undefined
      const subjectKeyValid = value?.subjectKey === undefined || (typeof value.subjectKey === 'string' && watchlist.includes(value.subjectKey) && cluster.entities.includes(value.subjectKey))
      const valid = value !== undefined && value !== null && value.clusterId === cluster.clusterId && typeof value.disposition === 'string' && dispositions.includes(value.disposition as ResearchChangeDisposition) && Array.isArray(value.relatedKnowledgeRefs) && refs.length === value.relatedKnowledgeRefs.length && refs.every((ref) => allowed.has(ref)) && rationale !== undefined && rationale.trim() !== '' && typeof value.durableCandidate === 'boolean' && subjectKeyValid
      if (!valid) return { assessment: fallback(cluster), reasoningUsed: true, applied: false, fallbackUsed: true, reasoningDiagnostics: [...normalized.diagnostics.map((item) => item.code), ...assessmentShapeDiagnostics(value, refs, allowed, cluster.clusterId), 'validation_shape_or_reference_rejected'] }
      const symbols = new Set(watchlist)
      const subjectKey = typeof value.subjectKey === 'string' && symbols.has(value.subjectKey) ? value.subjectKey : undefined
      const durableEligible = value.durableCandidate === true && refs.length > 0 && cluster.signals.some((signal) => signal.sourceTier <= 2) && !cluster.signals.every((signal) => signal.kind === 'community' || signal.kind === 'social_attention') && value.disposition !== 'noise' && value.disposition !== 'new'
      return { assessment: { clusterId: cluster.clusterId, disposition: value.disposition as ResearchChangeDisposition, relatedKnowledgeRefs: refs, rationale: rationale!.slice(0, 1000), durableCandidate: durableEligible, ...(subjectKey ? { subjectKey } : {}) }, reasoningUsed: true, applied: true, fallbackUsed: false, reasoningDiagnostics: normalized.diagnostics.map((item) => item.code) }
    } catch (error) {
      return { assessment: fallback(cluster), reasoningUsed: false, applied: false, fallbackUsed: true, reasoningDiagnostics: [errorCode(error)] }
    }
  }
}

function precheck(cluster: DailySignalCluster, projection: readonly ExistingKnowledgeProjection[], watchlist: readonly string[]): ResearchChangeAssessment | undefined { const text = cluster.signals.map((signal) => `${signal.title} ${signal.excerpt ?? ''}`).join(' ').toLowerCase(); const relevant = projection.filter((item) => item.statement && overlap(text, item.statement.toLowerCase())).map((item) => item.canonicalRef); if (cluster.signals.every((signal) => signal.kind === 'community' || signal.kind === 'social_attention')) return { clusterId: cluster.clusterId, disposition: 'noise', relatedKnowledgeRefs: relevant, rationale: 'Community-only low-confidence signal.', durableCandidate: false }; if (!relevant.length) return undefined; const matched = projection.filter((item) => relevant.includes(item.canonicalRef)); const labels = matched.map((item) => `${item.kind} ${item.claimType ?? ''} ${item.type ?? ''}`).join(' '); let disposition: ResearchChangeDisposition = 'supports'; if (/指引|下调|下降|延迟|库存|恶化|违约|取消|down|cut|delay|decline/.test(text) && /assumption|thesis|claim/i.test(labels)) disposition = /assumption/i.test(labels) ? 'changes_assumption' : /thesis/i.test(labels) ? 'affects_thesis' : 'contradicts'; else if (/风险|下滑|下降|减产|亏损|处罚|诉讼|risk|down|cut|delay|decline/.test(text)) disposition = 'risk'; else if (/订单|扩产|增长|突破|合作|利好|order|expand|growth|breakthrough/.test(text)) disposition = 'catalyst'; const subjectKey = cluster.entities.find((entity) => watchlist.includes(entity)); return { clusterId: cluster.clusterId, disposition, relatedKnowledgeRefs: relevant, rationale: `Deterministic comparison against ${relevant.length} relevant projection item(s).`, durableCandidate: cluster.signals.some((signal) => signal.sourceTier <= 2) && !cluster.signals.every((signal) => signal.kind === 'community' || signal.kind === 'social_attention'), ...(subjectKey ? { subjectKey } : {}) } }
function overlap(text: string, statement: string): boolean { const tokens = statement.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2); return tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length) }
function fallback(cluster: DailySignalCluster): ResearchChangeAssessment { return { clusterId: cluster.clusterId, disposition: cluster.signals.every((signal) => signal.kind === 'community' || signal.kind === 'social_attention') ? 'noise' : 'new', relatedKnowledgeRefs: [], rationale: 'No deterministic match; no durable semantic conclusion was made.', durableCandidate: false } }
function errorCode(error: unknown): string { return error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string' ? `executor_${String((error as { code: string }).code)}` : error instanceof Error && error.name ? `executor_${error.name}` : 'executor_failed' }
function assessmentShapeDiagnostics(value: Record<string, unknown> | undefined, refs: readonly string[], allowed: ReadonlySet<string>, clusterId: string): string[] { if (!value) return ['output_type_missing']; return [`output_keys_${Object.keys(value).sort().join(',')}`, `cluster_id_match_${value.clusterId === clusterId}`, `disposition_valid_${typeof value.disposition === 'string' && dispositions.includes(value.disposition as ResearchChangeDisposition)}`, `refs_array_${Array.isArray(value.relatedKnowledgeRefs)}`, `refs_count_${refs.length}`, `refs_allowed_${refs.every((ref) => allowed.has(ref))}`, `rationale_valid_${typeof value.rationale === 'string' && value.rationale.trim() !== ''}`, `durable_flag_${typeof value.durableCandidate === 'boolean'}`] }
