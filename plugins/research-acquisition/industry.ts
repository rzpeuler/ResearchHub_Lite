import { sha256 } from './hash.ts'
import type { AkshareDataClient } from './akshare.ts'
import type { NormalizedResearchSource, ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate } from './contracts.ts'

const text = (row: Record<string, unknown>, keys: string[]) => keys.map((key) => row[key]).find((value): value is string => typeof value === 'string' && value.trim() !== '')?.trim()
export class AkshareIndustryResearchPlugin implements ResearchAcquisitionPlugin {
  readonly name = 'akshare-industry-research-acquisition'
  constructor(private readonly client: AkshareDataClient, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    if ('company' in request || !this.client.sectorPerformance) return []
    const target = request.industry; if (!target) return []; const names = new Set([target.name, ...(target.aliases ?? [])].map((x) => x.trim().toLocaleLowerCase()))
    const rows = await this.client.sectorPerformance({ symbol: '', startDate: request.asOf, endDate: request.asOf }); if (!Array.isArray(rows)) return []
    const matches = rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')).map((row) => ({ row, name: text(row, ['板块名称', '行业名称', 'name', 'sectorName']) })).filter((x) => x.name && names.has(x.name.toLocaleLowerCase()))
    if (matches.length !== 1) return []
    const match = matches[0]; const id = `akshare-industry-${sha256(match.name!).slice(0, 16)}`
    return [{ candidateId: id, kind: 'structured_data', tier: 2, title: `${match.name} industry board observation`, provider: 'akshare', metadata: { industryName: match.name, boardDefinition: 'AKShare stock_board_industry_name_em', observationPeriod: request.asOf ?? this.now(), structuredRow: match.row } }]
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { const content = JSON.stringify(candidate.metadata?.structuredRow ?? {}, Object.keys((candidate.metadata?.structuredRow ?? {}) as object).sort()); return { candidate, retrievedAt: this.now(), content, contentHash: sha256(content) } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, contentHash: source.contentHash ?? sha256(source.content), publisher: 'AKShare', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
}
