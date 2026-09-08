import type { DailyResearchSignal } from '../../plugins/daily-intelligence/contracts.ts'

export interface DailySignalEnrichment { readonly signal: DailyResearchSignal; readonly entities: readonly string[]; readonly themes: readonly string[]; readonly category: DailyResearchSignal['category']; readonly rationale: string }

export class DailyIntelligenceSignalEnrichmentSkill {
  enrich(signal: DailyResearchSignal, watchlistSymbols: readonly string[], focusTags: readonly string[]): DailySignalEnrichment {
    const text = `${signal.title} ${signal.excerpt ?? ''}`.toLowerCase(); const entities = [...new Set([...signal.entities, ...watchlistSymbols.filter((symbol) => text.includes(symbol.toLowerCase()))])].sort(); const themes = [...new Set([...signal.themes, ...focusTags.filter((tag) => text.includes(tag.toLowerCase()))])].sort();
    const category = signal.category === 'news' && /公告|业绩|财报|年报|季报|investor|guidance/i.test(text) ? 'earnings' : signal.category
    return { signal: { ...signal, entities, themes, category }, entities, themes, category, rationale: `bounded lexical enrichment; entities=${entities.length}; themes=${themes.length}` }
  }
}
