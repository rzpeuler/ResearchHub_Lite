import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DailyResearchSignal, DailySignalStore } from './contracts.ts'

export class FileDailySignalStore implements DailySignalStore {
  constructor(private readonly path: string) {}
  async appendMany(signals: readonly DailyResearchSignal[]): Promise<{ readonly appended: number; readonly skipped: number }> { await mkdir(dirname(this.path), { recursive: true }); const existing = new Set((await this.read()).map((signal) => signal.signalId)); const batch = new Set<string>(); const fresh = signals.filter((signal) => { if (existing.has(signal.signalId) || batch.has(signal.signalId)) return false; batch.add(signal.signalId); return true }); if (fresh.length > 0) await appendFile(this.path, fresh.map((signal) => `${JSON.stringify(signal)}\n`).join(''), 'utf8'); return { appended: fresh.length, skipped: signals.length - fresh.length } }
  async listWindow(from: string, to: string, limit = 500): Promise<readonly DailyResearchSignal[]> { return (await this.read()).filter((signal) => { const date = signal.publishedAt ?? signal.discoveredAt; return date >= from && date <= to }).sort((left, right) => (right.publishedAt ?? right.discoveredAt).localeCompare(left.publishedAt ?? left.discoveredAt) || left.signalId.localeCompare(right.signalId)).slice(0, Math.max(1, Math.min(limit, 5_000))) }
  private async read(): Promise<readonly DailyResearchSignal[]> { try { return (await readFile(this.path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as DailyResearchSignal) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error } }
}
