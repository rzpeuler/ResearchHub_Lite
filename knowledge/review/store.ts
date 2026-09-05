import { access, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { canonicalSerialize, hashKnowledgeObject } from '../storage/canonical-hash.ts'
import { withKnowledgeBaseMutationLock } from '../storage/mutation-lock.ts'
import { parseYaml } from '../storage/yaml.ts'
import type { ReviewCase, ReviewCaseProducerType, ReviewRunManifest } from './contracts.ts'
import { isSafeReviewPathSegment, validateReviewCase, validateReviewRunManifest } from './validation.ts'

type Dict = Record<string, unknown>
export interface PersistReviewCasesInput {
  readonly rootRef: string
  readonly knowledgeBaseId: string
  readonly producerRunId: string
  readonly producerType?: ReviewCaseProducerType
  readonly cases: readonly ReviewCase[]
  readonly createdAt: string
  readonly schemaVersionAtCreation?: '0.3'
  readonly knowledgeBaseRevisionAtCreation: number
  readonly failpoint?: (phase: 'before_rename') => void | Promise<void>
}
export type ReviewCasePersistenceResult = { readonly kind: 'written' | 'replay' | 'conflict'; readonly manifest?: ReviewRunManifest; readonly cases: readonly ReviewCase[]; readonly path: string; readonly message?: string }
export interface ReviewCaseListOptions { readonly producerRunId?: string; readonly openOnly?: boolean }

function isRecord(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function jsonYaml(value: unknown): string { return `${canonicalSerialize(value)}\n` }
function runPath(rootRef: string, producerRunId: string): string { if (!isSafeReviewPathSegment(producerRunId)) throw new Error(`Unsafe producerRunId: ${producerRunId}`); return join(resolve(rootRef), 'reviews', 'runs', producerRunId) }
function casePath(rootRef: string, producerRunId: string, reviewCaseId: string): string { if (!isSafeReviewPathSegment(reviewCaseId)) throw new Error(`Unsafe reviewCaseId: ${reviewCaseId}`); return join(runPath(rootRef, producerRunId), 'cases', `${reviewCaseId}.yaml`) }
async function exists(path: string): Promise<boolean> { try { await access(path); return true } catch { return false } }
async function assertNotSymlink(path: string): Promise<void> { try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`ReviewCase path cannot be a symlink: ${path}`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
async function assertReviewAncestors(rootRef: string): Promise<void> { const root = resolve(rootRef); await assertNotSymlink(join(root, 'reviews')); await assertNotSymlink(join(root, 'reviews', 'runs')) }
async function loadManifest(path: string): Promise<ReviewRunManifest> { const value = parseYaml(await readFile(path, 'utf8'), path); validateReviewRunManifest(value); return value }
async function loadRun(rootRef: string, producerRunId: string): Promise<{ manifest: ReviewRunManifest; cases: ReviewCase[] }> {
  const root = runPath(rootRef, producerRunId); await assertNotSymlink(root); const manifest = await loadManifest(join(root, 'manifest.yaml')); if (manifest.producerRunId !== producerRunId) throw new Error(`ReviewCase manifest producerRunId mismatch: ${producerRunId}`); const cases: ReviewCase[] = []
  for (const id of manifest.caseIds) { const path = casePath(rootRef, producerRunId, id); await assertNotSymlink(path); const value = parseYaml(await readFile(path, 'utf8'), path); validateReviewCase(value); if (value.reviewCaseId !== id || value.producerRunId !== producerRunId || value.knowledgeBaseId !== manifest.knowledgeBaseId) throw new Error(`ReviewCase identity mismatch in run ${producerRunId}`); cases.push(value) }
  cases.sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))
  if (hashCaseSet(cases) !== manifest.deterministicSetHash) throw new Error(`ReviewCase set hash mismatch for run ${producerRunId}`)
  return { manifest, cases }
}
function hashCaseSet(cases: readonly ReviewCase[]): string { return hashKnowledgeObject([...cases].sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))) }
function manifestFor(input: PersistReviewCasesInput, cases: readonly ReviewCase[]): ReviewRunManifest { const sorted = [...cases].sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId)); return { version: '0.1', knowledgeBaseId: input.knowledgeBaseId, producerType: input.producerType ?? sorted[0]!.producerType, producerRunId: input.producerRunId, reviewCaseCount: sorted.length, caseIds: sorted.map((item) => item.reviewCaseId), deterministicSetHash: hashCaseSet(sorted), createdAt: input.createdAt, schemaVersionAtCreation: input.schemaVersionAtCreation ?? '0.3', knowledgeBaseRevisionAtCreation: input.knowledgeBaseRevisionAtCreation } }

export async function persistReviewCases(input: PersistReviewCasesInput): Promise<ReviewCasePersistenceResult> {
  if (input.cases.length === 0) throw new Error('ReviewCase persistence requires at least one actionable case')
  const producerType = input.producerType ?? input.cases[0]?.producerType ?? 'raw_document_knowledge_ingestion'
  for (const reviewCase of input.cases) { validateReviewCase(reviewCase); if (reviewCase.knowledgeBaseId !== input.knowledgeBaseId || reviewCase.producerRunId !== input.producerRunId || reviewCase.producerType !== producerType) throw new Error(`ReviewCase identity does not match run ${input.producerRunId}`) }
  const manifest = manifestFor(input, input.cases); validateReviewRunManifest(manifest); const run = runPath(input.rootRef, input.producerRunId); const parent = dirname(run); const temporary = `${run}.tmp-${manifest.deterministicSetHash.slice(7, 23)}`
  return withKnowledgeBaseMutationLock(resolve(input.rootRef), async () => {
    await assertReviewAncestors(input.rootRef)
    await mkdir(parent, { recursive: true }); await assertNotSymlink(parent); await assertNotSymlink(run)
    if (await exists(run)) {
      try { const existing = await loadRun(input.rootRef, input.producerRunId); if (existing.manifest.knowledgeBaseId === manifest.knowledgeBaseId && existing.manifest.producerType === manifest.producerType && existing.manifest.deterministicSetHash === manifest.deterministicSetHash) return { kind: 'replay', manifest: existing.manifest, cases: existing.cases, path: run }
      } catch (error) { return { kind: 'conflict', cases: [], path: run, message: error instanceof Error ? error.message : String(error) } }
      return { kind: 'conflict', cases: [], path: run, message: `ReviewCase producerRunId already exists with a different deterministic set: ${input.producerRunId}` }
    }
    await rm(temporary, { recursive: true, force: true }); await mkdir(join(temporary, 'cases'), { recursive: true });
    try {
      await writeFile(join(temporary, 'manifest.yaml'), jsonYaml(manifest), 'utf8')
      for (const reviewCase of [...input.cases].sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))) await writeFile(join(temporary, 'cases', `${reviewCase.reviewCaseId}.yaml`), jsonYaml(reviewCase), 'utf8')
      await input.failpoint?.('before_rename')
      await rename(temporary, run)
      if (!(await exists(join(run, 'manifest.yaml')))) throw new Error('ReviewCase run was not durably created')
      return { kind: 'written', manifest, cases: [...input.cases].sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId)), path: run }
    } finally { await rm(temporary, { recursive: true, force: true }) }
  })
}

export async function loadReviewCase(rootRef: string, reviewCaseId: string, producerRunId?: string): Promise<ReviewCase | undefined> {
  if (!isSafeReviewPathSegment(reviewCaseId)) throw new Error(`Unsafe reviewCaseId: ${reviewCaseId}`)
  if (producerRunId !== undefined) { const path = casePath(rootRef, producerRunId, reviewCaseId); if (!(await exists(path))) return undefined; await assertNotSymlink(path); const value = parseYaml(await readFile(path, 'utf8'), path); validateReviewCase(value); return value }
  for (const reviewCase of await listReviewCases(rootRef, { openOnly: false })) if (reviewCase.reviewCaseId === reviewCaseId) return reviewCase
  return undefined
}

export async function listReviewCases(rootRef: string, options: ReviewCaseListOptions = {}): Promise<readonly ReviewCase[]> {
  const runsRoot = join(resolve(rootRef), 'reviews', 'runs'); await assertReviewAncestors(rootRef); if (!(await exists(runsRoot))) return []; await assertNotSymlink(runsRoot)
  const runIds = options.producerRunId === undefined ? (await readdir(runsRoot)).filter((name) => !name.includes('.tmp-')).sort() : [options.producerRunId]
  const result: ReviewCase[] = []
  for (const runId of runIds) { if (!isSafeReviewPathSegment(runId)) throw new Error(`Unsafe producerRunId: ${runId}`); if (!(await exists(runPath(rootRef, runId)))) continue; const run = await loadRun(rootRef, runId); result.push(...run.cases.filter((item) => !options.openOnly || item.state.status === 'open')) }
  return result.sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))
}
export async function listOpenReviewCases(rootRef: string, options: Omit<ReviewCaseListOptions, 'openOnly'> = {}): Promise<readonly ReviewCase[]> { return listReviewCases(rootRef, { ...options, openOnly: true }) }

export class ReviewCaseStore {
  constructor(private readonly rootRef: string) {}
  persist(input: Omit<PersistReviewCasesInput, 'rootRef'>): Promise<ReviewCasePersistenceResult> { return persistReviewCases({ ...input, rootRef: this.rootRef }) }
  load(reviewCaseId: string, producerRunId?: string): Promise<ReviewCase | undefined> { return loadReviewCase(this.rootRef, reviewCaseId, producerRunId) }
  list(options?: ReviewCaseListOptions): Promise<readonly ReviewCase[]> { return listReviewCases(this.rootRef, options) }
  listOpen(options: Omit<ReviewCaseListOptions, 'openOnly'> = {}): Promise<readonly ReviewCase[]> { return listOpenReviewCases(this.rootRef, options) }
}

export async function recoverReviewCasesFromExecutionLog(rootRef: string, logValue: unknown): Promise<readonly ReviewCase[]> {
  if (!isRecord(logValue)) return []
  const context = isRecord(logValue.ingestionContext) ? logValue.ingestionContext : logValue
  if (!Array.isArray(context.reviewCases) || context.reviewCases.length === 0) return []
  const cases = context.reviewCases as unknown[]
  for (const value of cases) validateReviewCase(value)
  const knowledgeBaseId = typeof context.knowledgeBaseId === 'string' ? context.knowledgeBaseId : typeof logValue.knowledgeBaseId === 'string' ? logValue.knowledgeBaseId : undefined
  const producerRunId = typeof context.producerRunId === 'string' ? context.producerRunId : typeof logValue.workflowRunId === 'string' ? logValue.workflowRunId : undefined
  if (!knowledgeBaseId || !producerRunId) throw new Error('ReviewCase execution log recovery lacks identity')
  const createdAt = typeof context.reviewCasesCreatedAt === 'string' ? context.reviewCasesCreatedAt : typeof logValue.completedAt === 'string' ? logValue.completedAt : new Date(0).toISOString()
  const expectedSetHash = typeof context.reviewCaseSetHash === 'string' ? context.reviewCaseSetHash : undefined
  if (expectedSetHash !== undefined && expectedSetHash !== hashCaseSet(cases as ReviewCase[])) throw new Error('ReviewCase execution log set hash mismatch')
  const revision = Number(context.knowledgeBaseRevisionAtCreation ?? logValue.committedRevision ?? 0)
  const producerType = typeof context.producerType === 'string' ? context.producerType : typeof logValue.producerType === 'string' ? logValue.producerType : (cases[0] as ReviewCase).producerType
  const result = await persistReviewCases({ rootRef, knowledgeBaseId, producerRunId, producerType, cases: cases as ReviewCase[], createdAt, knowledgeBaseRevisionAtCreation: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0 })
  if (result.kind === 'conflict') throw new Error(result.message ?? 'ReviewCase recovery conflict')
  return result.cases
}
