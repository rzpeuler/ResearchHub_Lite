import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { MiitIndustryResearchPlugin, MIIT_INDUSTRY_ROUTES, validMiitUrl } from '../../plugins/research-acquisition/miit-industry.ts'

const OUT = resolve('tests/validation/evidence/RHL_M3B_MIIT_INDUSTRY_PRODUCTION_ACQUISITION.json')
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex').slice(0, 16)
const target = { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board', '印制电路板'], searchTerms: ['PCB 印制电路板', 'AI服务器 PCB HDI', '深南电路 PCB', '沪电股份 PCB', '胜宏科技 PCB', '生益科技 PCB CCL', 'PCB 产业链', 'PCB 行业 产能'], asOf: '2026-09-14T00:00:00.000Z' }
const classifications = ['MIIT_OFFICIAL_SOURCE_PROVEN', 'MIIT_OFFICIAL_SOURCE_PARTIAL', 'MIIT_DISCOVERY_EMPTY', 'MIIT_ROUTE_OR_PARSER_GAP', 'LIVE_SOURCE_INCONCLUSIVE'] as const
type RouteEvidence = Record<string, unknown>
const sizeBucket = (n: number) => n < 16 * 1024 ? '0-16KiB' : n < 256 * 1024 ? '16-256KiB' : n < 1024 * 1024 ? '256KiB-1MiB' : '1-2MiB'
const safeError = (e: unknown) => e instanceof Error ? e.name.slice(0, 40) : 'request failure'
const evidence: Record<string, unknown> = { taskId: 'RHL-M3B-3B-FIX-023-MIIT-ROUTE-BASE-AND-LIVE-EVIDENCE', generatedAt: new Date().toISOString(), target: { nameHash: hash(target.name), aliasHashes: target.aliases.map(hash), searchTermHashes: target.searchTerms.map(hash), searchTermCount: target.searchTerms.length, asOf: target.asOf }, requestCounts: { listPages: 0, candidateFetches: 0, retries: 0 }, routeEvidence: [] as RouteEvidence[], candidates: 0, normalizedSources: 0, officialHosts: [] as string[], publicationDateAvailability: 0, sources: [] as unknown[], mutation: { modelCalls: 0, gatewaySubmissions: 0, writerCommits: 0, knowledgeMutations: 0 }, privacy: { rawBodies: false, fullDocuments: false, cookies: false, credentials: false, authorizationHeaders: false, privateAbsolutePaths: false, reasoningTraces: false } }
let classification: typeof classifications[number] = 'LIVE_SOURCE_INCONCLUSIVE'
const main = async () => {
  let targetMatches = 0; let stableRoutes = 0; let liveFailure = false
  try {
    const plugin = new MiitIndustryResearchPlugin({ fetchImpl: async (input, init) => {
      const requested = new URL(String(input)); const isList = MIIT_INDUSTRY_ROUTES.some((r) => new URL(r).pathname === requested.pathname)
      const counts = evidence.requestCounts as Record<string, number>; counts[isList ? 'listPages' : 'candidateFetches']++
      const response = await fetch(input, init)
      if (isList) {
        const route = MIIT_INDUSTRY_ROUTES.find((r) => new URL(r).pathname === requested.pathname)!
        const item: RouteEvidence = { route: new URL(route).pathname, requested: { host: requested.hostname, path: requested.pathname }, final: { host: new URL(response.url || requested).hostname, path: new URL(response.url || requested).pathname }, http: response.status, finalOfficial: validMiitUrl(response.url || requested) }
        try { const clone = response.clone(); const body = await clone.arrayBuffer(); const bytes = new Uint8Array(body); const html = new TextDecoder().decode(bytes).slice(0, 2 * 1024 * 1024); const anchors = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]; const official = anchors.filter((a) => { try { return validMiitUrl(new URL(a[1]!, response.url || String(input)).toString()) } catch { return false } }); const matched = anchors.filter((a) => { const context = html.slice(Math.max(0, (a.index ?? 0) - 160), Math.min(html.length, (a.index ?? 0) + a[0].length + 160)); return target.searchTerms.some((term) => context.toLocaleLowerCase().includes(term.toLocaleLowerCase())) }); targetMatches += matched.length; Object.assign(item, { responseSize: bytes.byteLength, responseSizeBucket: sizeBucket(bytes.byteLength), anchorCount: anchors.length, officialLinkCount: official.length, targetTermAnchorOrNearbyTextMatchCount: matched.length, responseHash: hash(bytes) }); stableRoutes++ } catch { Object.assign(item, { responseSizeBucket: 'unavailable', anchorCount: 0, officialLinkCount: 0, targetTermAnchorOrNearbyTextMatchCount: 0, responseHash: null }) }
        ;(evidence.routeEvidence as RouteEvidence[]).push(item)
      }
      return response
    } })
    const candidates = await plugin.discover({ industry: target, asOf: target.asOf, limitPerKind: 8 }); evidence.candidates = candidates.length
    let pcb = false; let recentContext = false
    for (const candidate of candidates.slice(0, 4)) { try { const normalized = await plugin.normalize(await plugin.fetch(candidate)); const u = new URL(normalized.canonicalUrl!); (evidence.officialHosts as string[]).push(u.hostname); const text = `${normalized.title} ${candidate.snippet ?? ''}`; const recent = Boolean(candidate.publishedAt && /^(2025|2026)-/.test(candidate.publishedAt)); pcb ||= /pcb|印制电路板|printed circuit/i.test(text); recentContext ||= recent && /electronic|电子信息|industry|产业|policy|政策|制造/i.test(text); (evidence.sources as unknown[]).push({ titleHash: hash(normalized.title), safeTitle: normalized.title.slice(0, 160), canonicalHost: u.hostname, publishedAt: candidate.publishedAt ?? null, dateAvailable: Boolean(candidate.publishedAt), contentHash: normalized.contentHash }) } catch { /* sanitized per-candidate failure */ } }
    evidence.normalizedSources = (evidence.sources as unknown[]).length; evidence.officialHosts = [...new Set(evidence.officialHosts as string[])]; evidence.publicationDateAvailability = (evidence.sources as Array<Record<string, unknown>>).filter((x) => x.dateAvailable).length
    classification = evidence.normalizedSources as number >= 2 && pcb && recentContext ? 'MIIT_OFFICIAL_SOURCE_PROVEN' : evidence.normalizedSources as number > 0 ? 'MIIT_OFFICIAL_SOURCE_PARTIAL' : stableRoutes === MIIT_INDUSTRY_ROUTES.length && targetMatches === 0 ? 'MIIT_DISCOVERY_EMPTY' : targetMatches > 0 ? 'MIIT_ROUTE_OR_PARSER_GAP' : 'LIVE_SOURCE_INCONCLUSIVE'
  } catch (error) { liveFailure = true; evidence.failureClass = safeError(error) }
  if (liveFailure) classification = 'LIVE_SOURCE_INCONCLUSIVE'
  if (!classifications.includes(classification)) classification = 'LIVE_SOURCE_INCONCLUSIVE'
  evidence.classification = classification
  await mkdir(dirname(OUT), { recursive: true }); await writeFile(OUT, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({ classification, listPages: (evidence.requestCounts as any).listPages, candidateFetches: (evidence.requestCounts as any).candidateFetches, normalizedSources: evidence.normalizedSources }))
}
await main()
