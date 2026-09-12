import { writeFile } from 'node:fs/promises'
import { GdeltResearchPlugin } from '../../plugins/research-acquisition/gdelt.ts'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { RssResearchPlugin } from '../../plugins/research-acquisition/rss.ts'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'
import { AkshareIndustryResearchPlugin } from '../../plugins/research-acquisition/industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'

const target = { name: 'PCB', aliases: ['印制电路板'], searchTerms: ['PCB', '印制电路板', 'HDI'] }
const request = { company: { symbol: 'INDUSTRY' }, industry: target, asOf: new Date().toISOString(), limitPerKind: 3 }
const timeout = async <T>(work: () => Promise<T>, ms = 8_000): Promise<T> => await Promise.race([work(), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
async function probe(provider: string, work: () => Promise<unknown>) {
  try { const value = await timeout(work); const candidates = Array.isArray(value) ? value : []; return { provider, status: candidates.length ? 'usable' : 'empty', candidateCount: candidates.length, candidates: candidates.slice(0, 3).map((x: any) => ({ title: typeof x.title === 'string' ? x.title.slice(0, 160) : undefined, url: typeof x.url === 'string' ? x.url.slice(0, 300) : undefined, candidateHash: sha256(JSON.stringify(x)).slice(0, 16), rights: { accessScope: 'public', derivativeKnowledgeAllowed: true } })) } } catch (error) { const message = String(error); return { provider, status: /timeout|fetch|network|connect|command failed|python/i.test(message) ? 'unavailable_or_degraded' : 'failed', candidateCount: 0, diagnostics: /timeout/i.test(message) ? 'bounded timeout' : 'external provider unavailable or degraded' } }
}
const results = [
  await probe('gdelt', () => new GdeltResearchPlugin().discover(request)),
  await probe('cninfo', () => new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient()).discover(request)),
  await probe('rss:gov.cn', () => new RssResearchPlugin({ feedUrls: ['https://www.gov.cn/rss/zhengce.xml'] }).discover(request)),
  await probe('akshare:industry', async () => new AkshareIndustryResearchPlugin(new AkshareDataAdapter()).discover(request)),
]
const evidence = { schemaVersion: 1, generatedAt: new Date().toISOString(), target: { name: target.name, aliases: target.aliases, searchTerms: target.searchTerms }, acquisitionOnly: true, providers: results }
await writeFile('tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PROVIDER_SMOKE.json', JSON.stringify(evidence, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(evidence, null, 2))
