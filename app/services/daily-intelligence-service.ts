import { join, resolve } from 'node:path'
import { loadDailyWatchlist } from '../../plugins/daily-intelligence/config.ts'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import { FileDailyBriefStore } from '../../plugins/daily-intelligence/brief-store.ts'
import { runDailyIntelligence } from '../../workflows/daily-intelligence/workflow.ts'
import type { DailyBriefReport, DailyBriefType, DailyIntelligenceResult } from '../../plugins/daily-intelligence/contracts.ts'
import type { ResearchAcquisitionPlugin } from '../../plugins/research-acquisition/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { ApplicationServiceError } from './contracts.ts'
import { WorkflowService, type WorkflowOutcome } from './workflow-service.ts'
import { TradingCalendarService } from '../../plugins/daily-intelligence/calendar.ts'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'

export interface DailyBriefInput { readonly workflowRunId: string; readonly briefType: DailyBriefType; readonly tradeDate: string; readonly asOf?: string; readonly forceRefresh?: boolean }
export interface DailyIntelligenceServiceOptions { readonly cwd: string; readonly providers: readonly ResearchAcquisitionPlugin[]; readonly workflowService: WorkflowService; readonly reasoningExecutor?: ReasoningExecutor; readonly watchlistPath?: string; readonly runtimeRoot?: string; readonly mountedKnowledgeBaseRoot?: string; readonly calendar?: TradingCalendarService }
export class DailyIntelligenceService {
  constructor(private readonly options: DailyIntelligenceServiceOptions) {}
  startBrief(input: DailyBriefInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<DailyIntelligenceResult> } {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate)) throw new ApplicationServiceError('invalid_input', 'daily brief input is invalid')
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: `${input.briefType}_brief`, objective: `${input.briefType} daily intelligence ${input.tradeDate}` })
    const root = resolve(this.options.runtimeRoot ?? join(this.options.cwd, 'runtime-data')); const combined = new AbortController(); const workflow = this.options.workflowService.start(input.workflowRunId, async (signal): Promise<WorkflowOutcome & { readonly dailyResult: DailyIntelligenceResult }> => { const abort = () => combined.abort(); signal.addEventListener('abort', abort, { once: true }); callerSignal?.addEventListener('abort', abort, { once: true }); try { const result = await runDailyIntelligence({ workflowRunId: input.workflowRunId, briefType: input.briefType, tradeDate: input.tradeDate, asOf: input.asOf, forceRefresh: input.forceRefresh, watchlist: await loadDailyWatchlist(this.options.watchlistPath), providers: this.options.providers, signal: combined.signal, signalStore: new FileDailySignalStore(join(root, 'daily-signals.jsonl')), briefRoot: join(root, 'daily-briefs'), reportRoot: join(root, 'reports'), reasoningExecutor: this.options.reasoningExecutor, knowledgeBaseRoot: this.options.mountedKnowledgeBaseRoot, calendar: this.options.calendar ?? new TradingCalendarService({ cachePath: join(root, 'trading-calendar.json'), provider: async (date) => { try { const value = await new AkshareDataAdapter().tradingCalendar?.({ symbol: 'calendar', startDate: date, endDate: date }); if (!Array.isArray(value)) return undefined; return value.some((row) => row && typeof row === 'object' && Object.values(row as Record<string, unknown>).some((field) => String(field).startsWith(date))) } catch { return undefined } } }) }); return { status: result.status === 'completed' || result.status === 'already_completed' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : result.status === 'blocked' ? 'blocked' : 'failed', summary: `${input.briefType} brief ${input.tradeDate}`, errorSummary: result.errors.join('; '), dailyResult: result } } finally { signal.removeEventListener('abort', abort); callerSignal?.removeEventListener('abort', abort) } }); const completion = workflow.then((outcome) => outcome.dailyResult); completion.catch(() => undefined); return { runId: input.workflowRunId, completion }
  }
  async getBrief(reportId: string): Promise<DailyBriefReport> { if (!/^[A-Za-z0-9._-]+$/.test(reportId)) throw new ApplicationServiceError('invalid_input', 'reportId is invalid'); const value = await new FileDailyBriefStore(resolve(this.options.runtimeRoot ?? join(this.options.cwd, 'runtime-data'), 'daily-briefs')).get(reportId); if (!value) throw new ApplicationServiceError('not_found', 'Daily brief not found'); return value }
  async listBriefs(limit?: number): Promise<readonly DailyBriefReport[]> { return new FileDailyBriefStore(resolve(this.options.runtimeRoot ?? join(this.options.cwd, 'runtime-data'), 'daily-briefs')).list(limit) }
}
