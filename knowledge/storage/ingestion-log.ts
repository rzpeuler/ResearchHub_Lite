import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { canonicalSerialize } from './canonical-hash.ts'
import { parseYaml } from './yaml.ts'
import { withKnowledgeBaseMutationLock } from './mutation-lock.ts'
import type { KnowledgeBaseHandle } from './handle.ts'

export interface KnowledgeIngestionLogRecord {
  workflowRunId: string
  knowledgeBaseId: string
  status: 'blocked' | 'completed' | 'completed_with_review'
  ingestionIdentity?: string
  failureStage?: string
  rawRef?: string
  errors?: Array<{ code: string; message: string }>
  [key: string]: unknown
}

function safeRunId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value.includes('..')) throw new Error(`Unsafe workflowRunId: ${value}`)
  return value
}

function logPath(handle: KnowledgeBaseHandle, workflowRunId: string): string {
  return join(resolve(handle.rootRef), 'logs', 'ingestion', `${safeRunId(workflowRunId)}.yaml`)
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

function recordContext(record: KnowledgeIngestionLogRecord | undefined): Record<string, unknown> | undefined {
  return record?.ingestionContext && typeof record.ingestionContext === 'object' && !Array.isArray(record.ingestionContext)
    ? record.ingestionContext as Record<string, unknown>
    : undefined
}

function recordField(record: KnowledgeIngestionLogRecord | undefined, field: string): unknown {
  return record?.[field] ?? recordContext(record)?.[field]
}

function reviewCaseSetHash(record: KnowledgeIngestionLogRecord | undefined): string | undefined {
  const value = recordField(record, 'reviewCaseSetHash')
  return typeof value === 'string' ? value : undefined
}

function reviewCaseIds(record: KnowledgeIngestionLogRecord | undefined): readonly string[] | undefined {
  const value = recordField(record, 'reviewCaseIds')
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...value].sort() : undefined
}

function sameReviewCaseSet(existing: KnowledgeIngestionLogRecord, incoming: KnowledgeIngestionLogRecord): boolean {
  const existingHash = reviewCaseSetHash(existing)
  const incomingHash = reviewCaseSetHash(incoming)
  if (existingHash !== undefined && incomingHash !== undefined) return existingHash === incomingHash
  const existingIds = reviewCaseIds(existing)
  const incomingIds = reviewCaseIds(incoming)
  return existingIds === undefined || incomingIds === undefined || JSON.stringify(existingIds) === JSON.stringify(incomingIds)
}

function sameAuthoritativeIdentity(existing: KnowledgeIngestionLogRecord, incoming: KnowledgeIngestionLogRecord): boolean {
  return recordField(existing, 'workflowRunId') === recordField(incoming, 'workflowRunId') &&
    recordField(existing, 'rawRef') === recordField(incoming, 'rawRef') &&
    recordField(existing, 'workflowInputFingerprint') === recordField(incoming, 'workflowInputFingerprint') &&
    sameReviewCaseSet(existing, incoming)
}

export class KnowledgeIngestionLogStore {
  async read(handle: KnowledgeBaseHandle, workflowRunId: string): Promise<KnowledgeIngestionLogRecord | undefined> {
    const path = logPath(handle, workflowRunId)
    if (!(await exists(path))) return undefined
    const value = parseYaml(await readFile(path, 'utf8'), path)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as KnowledgeIngestionLogRecord : undefined
  }

  async findSuccessfulByIdentity(handle: KnowledgeBaseHandle, ingestionIdentity: string): Promise<KnowledgeIngestionLogRecord | undefined> {
    const directory = join(resolve(handle.rootRef), 'logs', 'ingestion')
    if (!(await exists(directory))) return undefined
    const { readdir } = await import('node:fs/promises')
    for (const name of (await readdir(directory)).filter((item) => item.endsWith('.yaml')).sort()) {
      const value = parseYaml(await readFile(join(directory, name), 'utf8'), join(directory, name))
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as KnowledgeIngestionLogRecord
        const context = record.ingestionContext && typeof record.ingestionContext === 'object' && !Array.isArray(record.ingestionContext) ? record.ingestionContext as Record<string, unknown> : undefined
        if ((record.ingestionIdentity === ingestionIdentity || context?.ingestionIdentity === ingestionIdentity) && (record.status === 'completed' || record.status === 'completed_with_review')) return record
      }
    }
    return undefined
  }

  async writeBlocked(handle: KnowledgeBaseHandle, record: KnowledgeIngestionLogRecord): Promise<string> {
    const path = logPath(handle, record.workflowRunId)
    await withKnowledgeBaseMutationLock(resolve(handle.rootRef), async () => {
      if (await exists(path)) {
        const existing = parseYaml(await readFile(path, 'utf8'), path)
        const existingRecord = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing as KnowledgeIngestionLogRecord : undefined
        if (existingRecord && sameAuthoritativeIdentity(existingRecord, record)) return
        if (existingRecord && recordField(existingRecord, 'rawRef') === recordField(record, 'rawRef') && recordField(existingRecord, 'workflowInputFingerprint') === recordField(record, 'workflowInputFingerprint') && !sameReviewCaseSet(existingRecord, record)) {
          throw new Error(`Execution log conflict for workflowRunId ${record.workflowRunId}: authoritative ReviewCase set differs`)
        }
        throw new Error(`Execution log conflict for workflowRunId ${record.workflowRunId}`)
      }
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
      try {
        await writeFile(temporary, canonicalSerialize(record) + '\n', 'utf8')
        await rename(temporary, path)
        if (!(await exists(path))) throw new Error('Blocked execution record was not durably created')
      } finally {
        await unlink(temporary).catch(() => undefined)
      }
    })
    return `logs/ingestion/${safeRunId(record.workflowRunId)}.yaml`
  }
}
