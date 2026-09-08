import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ResearchSignal, ResearchSignalStore } from './contracts.ts'

export class FileResearchSignalStore implements ResearchSignalStore {
  constructor(private readonly path: string) {}
  async append(signal: ResearchSignal): Promise<void> { await mkdir(dirname(this.path), { recursive: true }); await appendFile(this.path, `${JSON.stringify(signal)}\n`, 'utf8') }
  async listForCompany(symbol: string): Promise<readonly ResearchSignal[]> {
    let text: string
    try { text = await readFile(this.path, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ResearchSignal).filter((signal) => signal.source.metadata?.companySymbol === symbol)
  }
}
