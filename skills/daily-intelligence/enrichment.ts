import type { DailyResearchSignal } from '../../plugins/daily-intelligence/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

export interface DailySignalEnrichment { readonly signal: DailyResearchSignal; readonly entities: readonly string[]; readonly themes: readonly string[]; readonly category: DailyResearchSignal['category']; readonly rationale: string }

export class DailyIntelligenceSignalEnrichmentSkill {
  enrich(signal: DailyResearchSignal, watchlistSymbols: readonly string[], focusTags: readonly string[]): DailySignalEnrichment {
    const text = `${signal.title} ${signal.excerpt ?? ''}`.toLowerCase(); const entities = [...new Set([...signal.entities, ...watchlistSymbols.filter((symbol) => text.includes(symbol.toLowerCase()))])].sort(); const themes = [...new Set([...signal.themes, ...focusTags.filter((tag) => text.includes(tag.toLowerCase()))])].sort();
    const category = signal.category === 'news' && /公告|业绩|财报|年报|季报|investor|guidance/i.test(text) ? 'earnings' : signal.category
    return { signal: { ...signal, entities, themes, category }, entities, themes, category, rationale: `bounded lexical enrichment; entities=${entities.length}; themes=${themes.length}` }
  }
  enrichMany(signals: readonly DailyResearchSignal[], watchlistSymbols: readonly string[], focusTags: readonly string[], executor?: ReasoningExecutor): DailyResearchSignal[] {
    const lexical = signals.map((signal) => this.enrich(signal, watchlistSymbols, focusTags).signal)
    if (!executor || lexical.length === 0) return lexical
    // The executor is deliberately optional and synchronous callers retain a deterministic fallback.
    // Workflow uses this method's lexical result; async model application is provided by enrichManyAsync.
    return lexical
  }
  async enrichManyAsync(signals: readonly DailyResearchSignal[], watchlistSymbols: readonly string[], focusTags: readonly string[], executor?: ReasoningExecutor): Promise<DailyResearchSignal[]> {
    const lexical = signals.map((signal) => this.enrich(signal, watchlistSymbols, focusTags).signal)
    if (!executor || !lexical.length) return lexical
    try { const result = await executor.execute({ operation: 'daily_signal_enrichment', instruction: 'Return one bounded object per signal. Use only supplied signal IDs and watchlist symbols; do not create canonical IDs.', input: { signals: lexical, watchlistSymbols, focusTags }, outputContract: { signals: [{ signalId: 'string', entities: ['watchlist-symbol'], themes: ['string'], category: 'string', relevance: 0.0, sentiment: 0.0, importance: 0.0, narrative: 'string' }] }, metadata: { workflow: 'daily-intelligence' } }); const rows = Array.isArray((result.output as { signals?: unknown })?.signals) ? (result.output as { signals: unknown[] }).signals : []; const byId = new Map(rows.flatMap((row) => { if (!row || typeof row !== 'object') return []; const value = row as Record<string, unknown>; if (typeof value.signalId !== 'string' || !lexical.some((signal) => signal.signalId === value.signalId)) return []; const entities = Array.isArray(value.entities) ? value.entities.filter((item): item is string => typeof item === 'string' && watchlistSymbols.includes(item)) : []; const themes = Array.isArray(value.themes) ? value.themes.filter((item): item is string => typeof item === 'string' && focusTags.includes(item)) : []; const category = typeof value.category === 'string' && ['announcement', 'earnings', 'performance_forecast', 'investor_relations', 'institutional_research', 'management_guidance', 'macro', 'market', 'community', 'technology', 'industry', 'news'].includes(value.category) ? value.category as DailyResearchSignal['category'] : undefined; return category ? [[value.signalId, { entities, themes, category, relevance: boundedNumber(value.relevance), sentiment: boundedOptional(value.sentiment), importance: boundedNumber(value.importance), narrative: typeof value.narrative === 'string' ? value.narrative.slice(0, 1000) : undefined }]] : [] })); return lexical.map((signal) => { const value = byId.get(signal.signalId); return value ? { ...signal, entities: [...new Set(value.entities)], themes: [...new Set(value.themes)], category: value.category, relevance: value.relevance, ...(value.sentiment === undefined ? {} : { sentiment: value.sentiment }), importance: value.importance, ...(value.narrative ? { narrative: value.narrative } : {}) } : signal }) } catch { return lexical }
  }
}
function boundedNumber(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5 }
function boundedOptional(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : undefined }
