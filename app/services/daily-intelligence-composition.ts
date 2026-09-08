import { join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import type { ResearchAcquisitionPlugin } from '../../plugins/research-acquisition/contracts.ts'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { GdeltResearchPlugin } from '../../plugins/research-acquisition/gdelt.ts'
import { RssResearchPlugin } from '../../plugins/research-acquisition/rss.ts'
import { AkshareDailyMarketAcquisition } from '../../plugins/daily-intelligence/market.ts'
import { CommunitySignalAcquisition, PublicInstitutionalViewAcquisition } from '../../plugins/daily-intelligence/acquisition.ts'
import { loadSourceCatalog } from '../../plugins/daily-intelligence/config.ts'
import { TradingCalendarService } from '../../plugins/daily-intelligence/calendar.ts'
import { DailyIntelligenceService } from './daily-intelligence-service.ts'
import { WorkflowService } from './workflow-service.ts'
import { parseYaml } from '../../knowledge/storage/yaml.ts'

export interface DailyIntelligenceCompositionOptions {
  readonly cwd: string
  readonly workflowService: WorkflowService
  readonly reasoningExecutor?: ReasoningExecutor
  readonly modelRuntime?: ModelRuntime
  readonly watchlistPath?: string
  readonly catalogPath?: string
  readonly runtimeRoot?: string
  readonly mountedKnowledgeBaseRoot?: string
}

export interface DailyIntelligenceComposition {
  readonly service: DailyIntelligenceService
  readonly calendar: TradingCalendarService
  readonly providers: readonly ResearchAcquisitionPlugin[]
  readonly watchlistPath: string
  readonly catalogPath: string
  readonly catalog: Awaited<ReturnType<typeof loadSourceCatalog>>
}

export async function createDailyIntelligenceComposition(options: DailyIntelligenceCompositionOptions): Promise<DailyIntelligenceComposition> {
  const cwd = resolve(options.cwd)
  const watchlistPath = resolve(options.watchlistPath ?? join(cwd, 'config', 'watchlist.yaml'))
  const catalogPath = resolve(options.catalogPath ?? join(cwd, 'config', 'research-sources', 'catalog.yaml'))
  const runtimeRoot = resolve(options.runtimeRoot ?? join(cwd, 'runtime-data'))
  const [catalog, akshare] = await Promise.all([
    loadSourceCatalog(catalogPath).catch(() => []),
    Promise.resolve(new AkshareDataAdapter()),
  ])
  const active = catalog.filter((entry) => entry.operationalStatus === 'active')
  const institutional = active
    .filter((entry) => entry.category === 'institution' || entry.category === 'analyst' || entry.category === 'industry_expert')
    .filter((entry) => entry.discoveryUrl || entry.evidenceUrl)
    .slice(0, 8)
    .map((entry) => new PublicInstitutionalViewAcquisition({
      provider: entry.platform,
      accountRef: `${entry.platform}:${entry.accountId}`,
      urls: [entry.discoveryUrl ?? entry.evidenceUrl],
      tier: entry.reliabilityTier,
      scope: 'broad',
    }))
  const community = active
    .filter((entry) => entry.category === 'community' && entry.platform !== 'xueqiu')
    .filter((entry) => entry.discoveryUrl || entry.evidenceUrl)
    .slice(0, 4)
    .map((entry) => new CommunitySignalAcquisition({
      provider: entry.platform,
      accountRef: `${entry.platform}:${entry.accountId}`,
      urls: [entry.discoveryUrl ?? entry.evidenceUrl],
      tier: entry.reliabilityTier,
    }))
  const activePlatforms = new Set(active.map((entry) => entry.platform))
  const core: ResearchAcquisitionPlugin[] = []
  if (activePlatforms.has('cninfo')) core.push(new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient()))
  if (activePlatforms.has('gdelt')) core.push(new GdeltResearchPlugin())
  if (activePlatforms.has('gov.cn')) core.push(new RssResearchPlugin({ feedUrls: ['https://www.gov.cn/rss/zhengce.xml'] }))
  if (activePlatforms.has('akshare')) core.push(new AkshareDailyMarketAcquisition(akshare))
  const providers: readonly ResearchAcquisitionPlugin[] = [...core, ...institutional, ...community]
  const overrides = await readCalendarOverrides(join(cwd, 'config', 'trading-calendar-overrides.yaml'))
  const calendar = new TradingCalendarService({
    cachePath: join(runtimeRoot, 'trading-calendar.json'),
    manualHolidays: overrides.manualHolidays,
    manualTradingDays: overrides.manualTradingDays,
    provider: async (date) => {
      try {
        const value = await akshare.tradingCalendar?.({ symbol: 'calendar', startDate: date, endDate: date })
        if (!Array.isArray(value)) return undefined
        return value.some((row) => row && typeof row === 'object' && Object.values(row as Record<string, unknown>).some((field) => String(field).startsWith(date)))
      } catch { return undefined }
    },
  })
  const service = new DailyIntelligenceService({
    cwd,
    workflowService: options.workflowService,
    reasoningExecutor: options.reasoningExecutor,
    mountedKnowledgeBaseRoot: options.mountedKnowledgeBaseRoot,
    providers,
    watchlistPath,
    runtimeRoot,
    calendar,
  })
  return { service, calendar, providers, watchlistPath, catalogPath, catalog }
}

interface CalendarOverrides { readonly manualHolidays: readonly string[]; readonly manualTradingDays: readonly string[] }
async function readCalendarOverrides(path: string): Promise<CalendarOverrides> {
  try {
    const value = parseYaml(await readFile(path, 'utf8'), path) as Record<string, unknown>
    return {
      manualHolidays: strings(value.manualHolidays),
      manualTradingDays: strings(value.manualTradingDays),
    }
  } catch { return { manualHolidays: [], manualTradingDays: [] } }
}
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item)) : [] }
