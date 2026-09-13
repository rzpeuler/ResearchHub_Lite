import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { MiitIndustryResearchPlugin } from '../../plugins/research-acquisition/miit-industry.ts'

const OUT = resolve('tests/validation/evidence/RHL_M3B_MIIT_INDUSTRY_PRODUCTION_ACQUISITION.json')
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)
const target = { name: 'PCB manufacturing', aliases: ['printed circuit board', '印制电路板'], searchTerms: ['PCB', '电子信息制造业'], asOf: '2026-09-14T00:00:00.000Z' }
const evidence: Record<string, unknown> = { taskId: 'RHL-M3B-3B-IMPL-022-MIIT-OFFICIAL-INDUSTRY-ACQUISITION', generatedAt: new Date().toISOString(), target: { nameHash: hash(target.name), aliasHashes: target.aliases.map(hash), asOf: target.asOf }, requestCounts: { listPages: 0, candidateFetches: 0, retries: 0 }, candidates: 0, normalizedSources: 0, officialHosts: [] as string[], sources: [] as unknown[], mutation: { modelCalls: 0, gatewaySubmissions: 0, writerCommits: 0, knowledgeMutations: 0 }, privacy: { rawBodies: false, fullDocuments: false, cookies: false, credentials: false, authorizationHeaders: false, privateAbsolutePaths: false, reasoningTraces: false } }
let classification = 'LIVE_SOURCE_INCONCLUSIVE'
try {
  const plugin = new MiitIndustryResearchPlugin({ fetchImpl: async (input, init) => { const url = new URL(String(input)); const list = ['/jgsj/dzs/wjfb/', '/zwgk/zcwj/wjfb/gg/', '/jgsj/yxj/xxfb/'].includes(url.pathname); const counts = evidence.requestCounts as Record<string, unknown>; counts[list ? 'listPages' : 'candidateFetches'] = (counts[list ? 'listPages' : 'candidateFetches'] as number) + 1; return fetch(input, init) } })
  const candidates = await plugin.discover({ industry: target, asOf: target.asOf, limitPerKind: 8 }); evidence.candidates = candidates.length
  let pcb = false; let recentContext = false
  for (const candidate of candidates.slice(0, 4)) { try { const normalized = await plugin.normalize(await plugin.fetch(candidate)); const u = new URL(normalized.canonicalUrl!); (evidence.officialHosts as string[]).push(u.hostname); const title = normalized.title.toLowerCase(); const recent = Boolean(candidate.publishedAt && /^(2025|2026)-/.test(candidate.publishedAt)); pcb ||= /pcb|印制电路板|printed circuit/.test(`${title} ${candidate.snippet ?? ''}`); recentContext ||= recent && /electronic|电子信息|industry|产业|policy|政策|制造/.test(`${title} ${candidate.snippet ?? ''}`); (evidence.sources as unknown[]).push({ titleHash: hash(normalized.title), safeTitle: normalized.title.slice(0, 160), canonicalHost: u.hostname, publishedAt: candidate.publishedAt ?? null, dateAvailable: Boolean(candidate.publishedAt), contentHash: normalized.contentHash }) } catch { /* sanitized per-candidate failure */ } }
  evidence.normalizedSources = (evidence.sources as unknown[]).length; evidence.officialHosts = [...new Set(evidence.officialHosts as string[])]; classification = evidence.normalizedSources as number >= 2 && pcb && recentContext ? 'MIIT_OFFICIAL_SOURCE_PROVEN' : evidence.normalizedSources as number > 0 ? 'MIIT_OFFICIAL_SOURCE_PARTIAL' : 'MIIT_ROUTE_OR_PARSER_GAP'
} catch (error) { evidence.failure = error instanceof Error ? error.message.slice(0, 160) : 'transport failure' }
evidence.classification = classification
await mkdir(dirname(OUT), { recursive: true }); await writeFile(OUT, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ classification, listPages: (evidence.requestCounts as any).listPages, candidateFetches: (evidence.requestCounts as any).candidateFetches, normalizedSources: evidence.normalizedSources }))
