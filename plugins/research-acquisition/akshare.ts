import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export interface AkshareDataRequest { readonly symbol: string; readonly startDate?: string; readonly endDate?: string }
export interface AkshareDataClient { companyBasic(request: AkshareDataRequest): Promise<unknown>; financialData(request: AkshareDataRequest): Promise<unknown>; historicalMarketData(request: AkshareDataRequest): Promise<unknown>; indexDaily?(request: AkshareDataRequest): Promise<unknown>; sectorPerformance?(request: AkshareDataRequest): Promise<unknown>; tradingCalendar?(request: AkshareDataRequest): Promise<unknown> }
export interface AkshareClientOptions { readonly pythonCommand?: string; readonly timeoutMs?: number; readonly runner?: (script: string, args: readonly string[]) => Promise<string> }

const BRIDGE = `import json,sys,akshare as ak
kind,symbol,start_date,end_date=sys.argv[1:]
if kind=='basic': value=ak.stock_individual_info_em(symbol=symbol)
elif kind=='financial': value=ak.stock_financial_analysis_indicator(symbol=symbol)
elif kind=='index': value=ak.stock_zh_index_daily(symbol=symbol)
elif kind=='sector': value=ak.stock_board_industry_name_em()
elif kind=='calendar': value=ak.tool_trade_date_hist_sina()
else: value=ak.stock_zh_a_hist(symbol=symbol,period='daily',start_date=start_date or None,end_date=end_date or None,adjust='')
print(value.to_json(orient='records',force_ascii=False))`

export class AkshareDataAdapter implements AkshareDataClient {
  private readonly runner: (script: string, args: readonly string[]) => Promise<string>
  constructor(options: AkshareClientOptions = {}) { this.runner = options.runner ?? (async (script, args) => (await execFileAsync(options.pythonCommand ?? 'python', ['-c', script, ...args], { timeout: options.timeoutMs ?? 60_000, maxBuffer: 8_000_000 })).stdout) }
  companyBasic(request: AkshareDataRequest): Promise<unknown> { return this.run('basic', request) }
  financialData(request: AkshareDataRequest): Promise<unknown> { return this.run('financial', request) }
  historicalMarketData(request: AkshareDataRequest): Promise<unknown> { return this.run('market', request) }
  indexDaily(request: AkshareDataRequest): Promise<unknown> { return this.run('index', request) }
  sectorPerformance(request: AkshareDataRequest): Promise<unknown> { return this.run('sector', request) }
  tradingCalendar(request: AkshareDataRequest): Promise<unknown> { return this.run('calendar', request) }
  private async run(kind: string, request: AkshareDataRequest): Promise<unknown> { const output = await this.runner(BRIDGE, [kind, request.symbol, request.startDate ?? '', request.endDate ?? '']); try { return JSON.parse(output) as unknown } catch (error) { throw new Error(`AKShare bridge returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`) } }
}
