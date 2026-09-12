import type { IndustryAcquisitionWaveRequest } from '../../workflows/industry-deep-research/contracts.ts'
import type { NormalizedResearchSource, ResearchAcquisitionPlugin, ResearchProviderOutcome, ResearchSourceCandidate } from './contracts.ts'

export interface IndustryAcquisitionRun { readonly sources: readonly NormalizedResearchSource[]; readonly outcomes: readonly ResearchProviderOutcome[]; readonly diagnostics: readonly string[] }
export class IndustryAcquisitionComposition {
  constructor(private readonly plugins: readonly ResearchAcquisitionPlugin[], private readonly maxCandidatesPerProvider = 6, private readonly maxSources = 24) {}
  async acquire(request: IndustryAcquisitionWaveRequest): Promise<IndustryAcquisitionRun> {
    const sources: NormalizedResearchSource[] = []; const outcomes: ResearchProviderOutcome[] = []; const diagnostics: string[] = []; const seen = new Set<string>()
    const terms = [...new Set(request.searchTerms.map((x) => x.trim()).filter(Boolean))].slice(0, 8).map((x) => x.slice(0, 120))
    const target = { name: request.target.name, aliases: (request.target.aliases ?? []).slice(0, 8), canonicalRef: request.target.canonicalRef, searchTerms: terms }
    for (const plugin of this.plugins.slice(0, 8)) {
      let candidates: readonly ResearchSourceCandidate[] = []; let failed = false; let attempted = 0; let usable = 0
      try { candidates = (await plugin.discover({ industry: target, asOf: request.target.asOf, limitPerKind: this.maxCandidatesPerProvider })).slice(0, this.maxCandidatesPerProvider) } catch { failed = true; diagnostics.push(`${plugin.name}: discovery_failed`) }
      for (const candidate of candidates) {
        if (sources.length >= this.maxSources) break
        attempted++
        try {
          const fetched = await plugin.fetch(candidate); const normalized = await plugin.normalize(fetched)
          const key = normalized.canonicalUrl ? `url:${normalized.canonicalUrl}` : `hash:${normalized.contentHash}`
          if (!normalized.content.trim() || seen.has(key)) continue
          seen.add(key); sources.push(normalized); usable++
        } catch { failed = true; diagnostics.push(`${plugin.name}:${candidate.candidateId}: candidate_failed`) }
      }
      outcomes.push({ provider: plugin.name, providerAttempted: true, providerSucceeded: usable > 0, providerEmpty: !failed && attempted > 0 && usable === 0 || !failed && attempted === 0, providerFailed: failed, usableSourceCount: usable })
    }
    return { sources, outcomes, diagnostics: diagnostics.slice(0, 32) }
  }
}
