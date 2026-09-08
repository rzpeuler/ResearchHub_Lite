import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseYaml } from '../../knowledge/storage/yaml.ts'
import type { DailySourceAccount, DailyWatchlist } from './contracts.ts'

const safePath = (value: string): string => resolve(value)
export async function loadSourceCatalog(path = 'config/research-sources/catalog.yaml'): Promise<readonly DailySourceAccount[]> { const value = parseYaml(await readFile(safePath(path), 'utf8'), path); if (!Array.isArray(value)) throw new TypeError('Source catalog must be an array'); return value as DailySourceAccount[] }
export async function loadDailyWatchlist(path = 'config/watchlist.yaml'): Promise<DailyWatchlist> { const value = parseYaml(await readFile(safePath(path), 'utf8'), path) as Partial<DailyWatchlist>; return { companies: Array.isArray(value.companies) ? value.companies as DailyWatchlist['companies'] : [], themes: Array.isArray(value.themes) ? value.themes.filter((item): item is string => typeof item === 'string') : [], industries: Array.isArray(value.industries) ? value.industries.filter((item): item is string => typeof item === 'string') : [] } }
