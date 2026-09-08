import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { DailyBriefReport } from './contracts.ts'

export class FileDailyBriefStore {
  constructor(private readonly root: string) {}
  private path(id: string): string { if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('brief id is unsafe'); return join(resolve(this.root), `${id}.json`) }
  async get(id: string): Promise<DailyBriefReport | undefined> { try { return JSON.parse(await readFile(this.path(id), 'utf8')) as DailyBriefReport } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error } }
  async put(report: DailyBriefReport): Promise<void> { await mkdir(resolve(this.root), { recursive: true }); const path = this.path(report.reportId); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const { rename } = await import('node:fs/promises'); await rename(temp, path) }
  async list(limit = 50): Promise<readonly DailyBriefReport[]> { let names: string[]; try { names = await readdir(resolve(this.root)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }; const reports: DailyBriefReport[] = []; for (const name of names.filter((item) => item.endsWith('.json')).sort()) { const value = await this.get(name.slice(0, -5)); if (value) reports.push(value) }; return reports.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)).slice(0, Math.max(1, Math.min(limit, 200))) }
}
