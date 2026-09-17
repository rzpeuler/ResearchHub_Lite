import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getRaw, readRaw } from '../../knowledge/raw/raw-archive.ts'
import { parseYaml } from '../../knowledge/storage/yaml.ts'
import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'

export interface SourceLibraryHit {
  readonly sourceLibraryRef: string
  readonly rawRef: string
  readonly title: string
  readonly excerpt: string
  readonly contentHash: string
  readonly chunkIndex: number
  readonly provenance: { readonly rawRef: string }
  readonly sourceRef?: string
  readonly page?: number
  readonly section?: string
  readonly parserVersion?: string
  readonly chunkerVersion?: string
}

interface SourceLibraryChunk extends SourceLibraryHit { readonly normalizedText: string }
interface SourceLibraryIndex { readonly version: 1; readonly knowledgeBaseId: string; readonly builtAt: string; readonly chunks: readonly SourceLibraryChunk[] }
export interface SourceLibrarySearchInput { readonly query: string; readonly limit?: number }

function tokens(value: string): string[] { return [...new Set(value.toLocaleLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}\p{Script=Han}]+/u).filter((item) => item.length > 0))] }
function chunkText(text: string): readonly string[] { const normalized = text.replace(/\r\n?/g, '\n').trim(); if (!normalized) return []; const chunks: string[] = []; for (let start = 0; start < normalized.length; start += 900) chunks.push(normalized.slice(start, start + 1_200)); return chunks }
function safeLimit(value: number | undefined): number { return value === undefined ? 20 : Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100) : 20 }

export class SourceLibraryService {
  private readonly indexRoot: string
  private index?: SourceLibraryIndex
  constructor(indexRoot: string) { this.indexRoot = resolve(indexRoot) }

  async rebuild(handle: KnowledgeBaseHandle): Promise<{ readonly sourceCount: number; readonly chunkCount: number; readonly builtAt: string }> {
    const rawRegistryPath = join(handle.rootRef, 'registry', 'raw.yaml')
    let parsed: unknown
    try { parsed = parseYaml(await readFile(rawRegistryPath, 'utf8'), rawRegistryPath) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') parsed = {}; else throw error }
    const refs = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).sort() : []
    const chunks: SourceLibraryChunk[] = []
    const sourceRefsByRaw = new Map<string, string>()
    try { for (const item of (await readCanonicalV04Assets(handle.rootRef)).objects.filter((item) => item.kind === 'source')) { const value = item.value as { id?: unknown; rawRefs?: unknown }; if (typeof value.id === 'string' && Array.isArray(value.rawRefs)) for (const rawRef of value.rawRefs) if (typeof rawRef === 'string') sourceRefsByRaw.set(rawRef, value.id) } } catch { /* Source Library remains usable when canonical Source metadata is unavailable. */ }
    for (const rawRef of refs) {
      try {
        const raw = await getRaw(handle, rawRef); const content = (await readRaw(handle, rawRef)).toString('utf8'); const title = raw.manifest.suppliedMetadata.title ?? raw.manifest.originalFilename ?? rawRef
        chunkText(content).forEach((chunk, chunkIndex) => { const normalizedText = chunk.toLocaleLowerCase().normalize('NFKC'); const sourceRef = sourceRefsByRaw.get(rawRef); chunks.push({ sourceLibraryRef: `source-library:${rawRef}:${chunkIndex}`, rawRef, title, excerpt: chunk.slice(0, 500), contentHash: raw.manifest.contentHash, chunkIndex, provenance: { rawRef }, ...(sourceRef === undefined ? {} : { sourceRef }), chunkerVersion: 'source-library-lexical-v1', normalizedText }) })
      } catch { /* malformed raw entries do not become searchable evidence */ }
    }
    const builtAt = new Date().toISOString(); this.index = { version: 1, knowledgeBaseId: handle.knowledgeBaseId, builtAt, chunks }; await mkdir(this.indexRoot, { recursive: true }); await writeFile(join(this.indexRoot, `${handle.knowledgeBaseId}.json`), `${JSON.stringify(this.index, null, 2)}\n`, 'utf8'); return { sourceCount: new Set(chunks.map((chunk) => chunk.rawRef)).size, chunkCount: chunks.length, builtAt }
  }

  async search(handle: KnowledgeBaseHandle, input: SourceLibrarySearchInput): Promise<readonly SourceLibraryHit[]> {
    if (typeof input.query !== 'string' || input.query.trim() === '') return []
    if (!this.index || this.index.knowledgeBaseId !== handle.knowledgeBaseId) await this.rebuild(handle)
    const queryTokens = tokens(input.query); if (!queryTokens.length) return []
    return this.index!.chunks.map((chunk) => ({ chunk, score: queryTokens.reduce((score, token) => score + (chunk.normalizedText.includes(token) ? 1 : 0), 0) })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.chunk.rawRef.localeCompare(right.chunk.rawRef) || left.chunk.chunkIndex - right.chunk.chunkIndex).slice(0, safeLimit(input.limit)).map(({ chunk }) => { const { normalizedText: _normalizedText, ...hit } = chunk; return hit })
  }
}
