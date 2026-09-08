import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { DailyBriefType } from './contracts.ts'
import { TradingCalendarService } from './calendar.ts'

export interface DailySchedulerState { readonly lastSuccessfulRun?: Readonly<Partial<Record<DailyBriefType, string>>>; readonly lastCheckedAt?: string }
export interface DailyBriefSchedulerOptions { readonly statePath: string; readonly calendar: TradingCalendarService; readonly now?: () => string; readonly run: (type: DailyBriefType, tradeDate: string, forceRefresh?: boolean) => Promise<{ readonly status: string }> }
export class DailyBriefScheduler {
  constructor(private readonly options: DailyBriefSchedulerOptions) {}
  async tick(tradeDate: string): Promise<readonly { readonly briefType: DailyBriefType; readonly status: string }[]> {
    const now = this.options.now ?? (() => new Date().toISOString()); const state = await this.read(); const next: Array<{ readonly briefType: DailyBriefType; readonly status: string }> = []; const day = await this.options.calendar.isTradingDay(tradeDate); if (!day.isTradingDay) { await this.write({ ...state, lastCheckedAt: now() }); return next }
    let current = state
    for (const type of ['morning', 'evening'] as const) { if (current.lastSuccessfulRun?.[type] === tradeDate) { next.push({ briefType: type, status: 'already_completed' }); continue } const result = await this.options.run(type, tradeDate); next.push({ briefType: type, status: result.status }); if (result.status === 'completed' || result.status === 'already_completed') { current = { ...current, lastCheckedAt: now(), lastSuccessfulRun: { ...(current.lastSuccessfulRun ?? {}), [type]: tradeDate } }; await this.write(current) } }
    return next
  }
  private async read(): Promise<DailySchedulerState> { try { return JSON.parse(await readFile(resolve(this.options.statePath), 'utf8')) as DailySchedulerState } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error } }
  private async write(state: DailySchedulerState): Promise<void> { const path = resolve(this.options.statePath); await mkdir(dirname(path), { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); const { rename } = await import('node:fs/promises'); await rename(temp, path) }
}
