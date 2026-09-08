import type { DailyResearchSignal } from '../../plugins/daily-intelligence/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { normalizeReasoningStructuredOutput } from './structured-output.ts'

export interface DailySignalEnrichment { readonly signal: DailyResearchSignal; readonly entities: readonly string[]; readonly themes: readonly string[]; readonly category: DailyResearchSignal['category']; readonly rationale: string }
export interface DailyEnrichmentResult { readonly signals: readonly DailyResearchSignal[]; readonly reasoningUsed: boolean; readonly appliedCount: number; readonly fallbackCount: number; readonly reasoningDiagnostics: readonly string[] }
type EnrichmentPatch = { entities?: string[]; themes?: string[]; category?: DailyResearchSignal['category']; relevance?: number; sentiment?: number; importance?: number; narrative?: string }
const categories: readonly DailyResearchSignal['category'][] = ['announcement', 'earnings', 'performance_forecast', 'investor_relations', 'institutional_research', 'management_guidance', 'macro', 'market', 'community', 'technology', 'industry', 'news']

export class DailyIntelligenceSignalEnrichmentSkill {
  enrich(signal: DailyResearchSignal, watchlistSymbols: readonly string[], focusTags: readonly string[]): DailySignalEnrichment { const value = `${signal.title} ${signal.excerpt ?? ''}`.toLowerCase(); const entities = [...new Set([...signal.entities, ...watchlistSymbols.filter((item) => value.includes(item.toLowerCase()))])].sort(); const themes = [...new Set([...signal.themes, ...focusTags.filter((item) => value.includes(item.toLowerCase()))])].sort(); const category = signal.category === 'news' && /公告|业绩|财报|年报|季报|investor|guidance/i.test(value) ? 'earnings' : signal.category; return { signal: { ...signal, entities, themes, category }, entities, themes, category, rationale: `bounded lexical enrichment; entities=${entities.length}; themes=${themes.length}` } }
  enrichMany(signals: readonly DailyResearchSignal[], watchlistSymbols: readonly string[], focusTags: readonly string[], _executor?: ReasoningExecutor): DailyResearchSignal[] { return signals.map((signal) => this.enrich(signal, watchlistSymbols, focusTags).signal) }
  async enrichManyAsync(signals: readonly DailyResearchSignal[], watchlistSymbols: readonly string[], focusTags: readonly string[], executor?: ReasoningExecutor): Promise<DailyResearchSignal[]> { return (await this.enrichManyDetailedAsync(signals, watchlistSymbols, focusTags, executor)).signals as DailyResearchSignal[] }
  async enrichManyDetailedAsync(signals: readonly DailyResearchSignal[], watchlistSymbols: readonly string[], focusTags: readonly string[], executor?: ReasoningExecutor): Promise<DailyEnrichmentResult> {
    const lexical = signals.map((signal) => this.enrich(signal, watchlistSymbols, focusTags).signal)
    if (!executor || lexical.length === 0) return { signals: lexical, reasoningUsed: false, appliedCount: 0, fallbackCount: lexical.length, reasoningDiagnostics: [] }
    try {
      const result = await executor.execute({ operation: 'daily_signal_enrichment', instruction: 'Return a JSON object with a signals array. You may return only the signals you can classify confidently; each row must keep a supplied signalId and include at least one semantic field. Omitted or invalid semantic fields use deterministic fallback. Never modify identity, source, hashes, timestamps, or canonical IDs.', input: { signals: lexical, watchlistSymbols, focusTags }, outputContract: { signals: [{ signalId: 'string', entities: ['watchlist-symbol'], themes: ['string'], category: 'announcement|earnings|performance_forecast|investor_relations|institutional_research|management_guidance|macro|market|community|technology|industry|news', relevance: 0.0, sentiment: 0.0, importance: 0.0, narrative: 'string' }] }, metadata: { workflow: 'daily-intelligence' } })
      const normalized = normalizeReasoningStructuredOutput(result.output)
      const object = normalized.value as { signals?: unknown } | undefined
      const rows = Array.isArray(object?.signals) ? object.signals : []
      const ids = new Set(lexical.map((signal) => signal.signalId))
      const byId = new Map<string, EnrichmentPatch>()
      for (const raw of rows) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const row = raw as Record<string, unknown>
        if (typeof row.signalId !== 'string' || !ids.has(row.signalId)) continue
        const patch: EnrichmentPatch = {}
        if (Array.isArray(row.entities)) { const values = row.entities.filter((item): item is string => typeof item === 'string' && watchlistSymbols.includes(item)); if (values.length) patch.entities = [...new Set(values)] }
        if (Array.isArray(row.themes)) { const values = row.themes.filter((item): item is string => typeof item === 'string' && focusTags.includes(item)); if (values.length) patch.themes = [...new Set(values)] }
        if (typeof row.category === 'string' && categories.includes(row.category as DailyResearchSignal['category'])) patch.category = row.category as DailyResearchSignal['category']
        if (isFiniteNumber(row.relevance)) patch.relevance = bounded(row.relevance, 0, 1)
        if (isFiniteNumber(row.sentiment)) patch.sentiment = bounded(row.sentiment, -1, 1)
        if (isFiniteNumber(row.importance)) patch.importance = bounded(row.importance, 0, 1)
        if (typeof row.narrative === 'string' && row.narrative.trim()) patch.narrative = row.narrative.slice(0, 1000)
        if (Object.keys(patch).length > 0) byId.set(row.signalId, patch)
      }
      const applied = lexical.map((signal) => { const patch = byId.get(signal.signalId); if (!patch) return signal; return { ...signal, ...(patch.entities ? { entities: [...new Set([...signal.entities, ...patch.entities])] } : {}), ...(patch.themes ? { themes: [...new Set([...signal.themes, ...patch.themes])] } : {}), ...(patch.category ? { category: patch.category } : {}), ...(patch.relevance === undefined ? {} : { relevance: patch.relevance }), ...(patch.sentiment === undefined ? {} : { sentiment: patch.sentiment }), ...(patch.importance === undefined ? {} : { importance: patch.importance }), ...(patch.narrative === undefined ? {} : { narrative: patch.narrative }) } })
      return { signals: applied, reasoningUsed: true, appliedCount: byId.size, fallbackCount: lexical.length - byId.size, reasoningDiagnostics: [...normalized.diagnostics.map((item) => item.code), `output_keys_${normalized.value && typeof normalized.value === 'object' ? Object.keys(normalized.value as object).sort().join(',') : typeof normalized.value}`, `rows_count_${rows.length}`, `rows_applied_${byId.size}`] }
    } catch (error) { return { signals: lexical, reasoningUsed: false, appliedCount: 0, fallbackCount: lexical.length, reasoningDiagnostics: [errorCode(error)] } }
  }
}
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function bounded(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
function errorCode(error: unknown): string { return error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string' ? `executor_${String((error as { code: string }).code)}` : error instanceof Error && error.name ? `executor_${error.name}` : 'executor_failed' }
