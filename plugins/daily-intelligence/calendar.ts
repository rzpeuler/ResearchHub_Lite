import { readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

export interface TradingDayResult { readonly tradeDate: string; readonly isTradingDay: boolean; readonly calendarConfidence: 'provider' | 'cache' | 'manual' | 'fallback' }
export interface TradingCalendarOptions { readonly cachePath: string; readonly manualHolidays?: readonly string[]; readonly manualTradingDays?: readonly string[]; readonly provider?: (date: string) => Promise<boolean | undefined> }
export class TradingCalendarService {
  constructor(private readonly options: TradingCalendarOptions) {}
  async isTradingDay(date: string): Promise<TradingDayResult> { if (this.options.provider) { try { const value = await this.options.provider(date); if (value !== undefined) { await this.save(date, value); return { tradeDate: date, isTradingDay: value, calendarConfidence: 'provider' } } } catch { /* fall through */ } } const cached = await this.load(date); if (cached !== undefined) return { tradeDate: date, isTradingDay: cached, calendarConfidence: 'cache' }; if (this.options.manualHolidays?.includes(date)) return { tradeDate: date, isTradingDay: false, calendarConfidence: 'manual' }; if (this.options.manualTradingDays?.includes(date)) return { tradeDate: date, isTradingDay: true, calendarConfidence: 'manual' }; const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); return { tradeDate: date, isTradingDay: weekday !== 0 && weekday !== 6, calendarConfidence: 'fallback' } }
  private async load(date: string): Promise<boolean | undefined> { try { const data = JSON.parse(await readFile(this.options.cachePath, 'utf8')) as Record<string, boolean>; return typeof data[date] === 'boolean' ? data[date] : undefined } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; return undefined } }
  private async save(date: string, value: boolean): Promise<void> { await mkdir(dirname(this.options.cachePath), { recursive: true }); let data: Record<string, boolean> = {}; try { data = JSON.parse(await readFile(this.options.cachePath, 'utf8')) as Record<string, boolean> } catch { /* create cache */ } data[date] = value; await writeFile(this.options.cachePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8') }
}
