import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { canonicalSerialize } from '../../knowledge/storage/canonical-hash.ts'
import type { ReconciliationDecision, ResolvedCandidateGroup } from '../../skills/knowledge-curation/contracts.ts'
import type { ReviewCategory, ReviewItem, ReviewSample, ReviewSummary } from './contracts.ts'

type Dict = Record<string, unknown>
type Event = ReviewSample & { readonly dependency: boolean; readonly key: string }
const categories: readonly ReviewCategory[] = ['invalid_reference', 'invalid_semantics', 'relation_cardinality', 'schema_gap', 'theme_creation', 'theme_ambiguity', 'reconciliation_review', 'other']
const kinds: readonly ReviewSample['kind'][] = ['entity', 'relation', 'claim', 'workflow_level']
function isRecord(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function kind(value: unknown): ReviewSample['kind'] { return value === 'entity' || value === 'relation' || value === 'claim' ? value : 'workflow_level' }
function categoryForRejection(value: unknown): ReviewCategory { return value === 'invalid_reference' ? 'invalid_reference' : value === 'invalid_semantics' ? 'invalid_semantics' : 'other' }
function categoryForRationale(value: string): ReviewCategory {
  const text = value.toLocaleLowerCase()
  if (text.includes('cardinality') || text.includes('business_exposure')) return 'relation_cardinality'
  if (text.includes('theme') && (text.includes('ambiguous') || text.includes('multiple') || text.includes('exactly one'))) return 'theme_ambiguity'
  if (text.includes('theme') && (text.includes('create') || text.includes('group'))) return 'theme_creation'
  if (text.includes('schema gap')) return 'schema_gap'
  if (text.includes('unsupported') || text.includes('invalid') || text.includes('schema')) return 'invalid_semantics'
  if (text.includes('blocked') || text.includes('endpoint') || text.includes('reference')) return 'invalid_reference'
  return 'reconciliation_review'
}
function normalized(value: string): string { return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ') }
function addEvent(events: Map<string, Event>, sample: Omit<ReviewSample, 'candidateId'> & { candidateId?: string }, dependency: boolean): void {
  const candidate = sample.candidateId ?? ''
  const key = [candidate, sample.stage, sample.category, dependency ? 'dependency' : 'root', normalized(sample.rationale)].join('|')
  if (!events.has(key)) events.set(key, { ...sample, ...(sample.candidateId === undefined ? {} : { candidateId: sample.candidateId }), dependency, key })
}
export function emptyReviewSummary(): ReviewSummary {
  const byCategory = Object.fromEntries(categories.map((value) => [value, 0])) as Record<ReviewCategory, number>
  const byCandidateKind = Object.fromEntries(kinds.map((value) => [value, 0])) as Record<ReviewSample['kind'], number>
  const samplesByCategory = Object.fromEntries(categories.map((value) => [value, [] as readonly ReviewSample[]])) as Record<ReviewCategory, readonly ReviewSample[]>
  return { total: 0, rootCount: 0, dependencyCount: 0, byCategory, byCandidateKind, samplesByCategory }
}
export interface ReviewNormalizationInput {
  readonly extractionRejected?: readonly unknown[]
  readonly consolidationReviews?: readonly { readonly candidateId: string; readonly reason: string; readonly conflictingFields?: readonly string[] }[]
  readonly reconciliationDecisions?: readonly ReconciliationDecision[]
  readonly plannerReviewItems?: readonly ReviewItem[]
  readonly candidateGroups?: readonly ResolvedCandidateGroup[]
}
export function normalizeReviewSummary(input: ReviewNormalizationInput): ReviewSummary {
  const events = new Map<string, Event>()
  const groupKinds = new Map((input.candidateGroups ?? []).map((group) => [group.candidateId, group.kind]))
  for (const raw of input.extractionRejected ?? []) {
    const item = isRecord(raw) ? raw : {}
    const candidateId = typeof item.candidateId === 'string' ? item.candidateId : undefined
    const itemKind = kind(item.kind)
    const code = typeof item.code === 'string' ? item.code : 'other'
    const rationale = typeof item.message === 'string' ? item.message : 'Extraction candidate rejected'
    addEvent(events, { ...(candidateId === undefined ? {} : { candidateId }), kind: itemKind, stage: 'extraction', category: categoryForRejection(code), rationale, dependentCandidateIds: [] }, false)
  }
  const consolidationIds = new Set<string>()
  for (const item of input.consolidationReviews ?? []) {
    if (consolidationIds.has(item.candidateId)) continue
    consolidationIds.add(item.candidateId)
    addEvent(events, { candidateId: item.candidateId, kind: kind(groupKinds.get(item.candidateId)), stage: 'consolidation', category: 'other', rationale: item.reason, dependentCandidateIds: [] }, false)
  }
  for (const decision of input.reconciliationDecisions ?? []) {
    if (decision.action !== 'user_review' && decision.action !== 'reject') continue
    addEvent(events, { candidateId: decision.candidateId, kind: kind(groupKinds.get(decision.candidateId)), stage: 'reconciliation', category: 'reconciliation_review', rationale: decision.rationale, dependentCandidateIds: [] }, false)
  }
  const plannerCandidateIds = new Set((input.plannerReviewItems ?? []).map((item) => item.candidateId))
  const reconciliationCandidateIds = new Set((input.reconciliationDecisions ?? []).filter((item) => item.action === 'user_review' || item.action === 'reject').map((item) => item.candidateId))
  for (const item of input.plannerReviewItems ?? []) {
    if (consolidationIds.has(item.candidateId)) continue
    const dependency = item.rationale.toLocaleLowerCase().includes('blocked by') || item.rationale.toLocaleLowerCase().includes('dependency isolated')
    if (!reconciliationCandidateIds.has(item.candidateId)) addEvent(events, { candidateId: item.candidateId, kind: kind(item.kind), stage: 'planner', category: categoryForRationale(item.rationale), rationale: item.rationale, dependentCandidateIds: item.dependentCandidateIds }, dependency)
    if (!dependency) for (const dependent of item.dependentCandidateIds) if (!plannerCandidateIds.has(dependent)) addEvent(events, { candidateId: dependent, kind: kind(groupKinds.get(dependent)), stage: 'planner', category: 'invalid_reference', rationale: 'Dependency isolated by review of ' + item.candidateId, dependentCandidateIds: [item.candidateId] }, true)
  }
  const ordered = [...events.values()].sort((left, right) => left.key.localeCompare(right.key))
  const byCategory = Object.fromEntries(categories.map((value) => [value, ordered.filter((item) => item.category === value).length])) as Record<ReviewCategory, number>
  const byCandidateKind = Object.fromEntries(kinds.map((value) => [value, ordered.filter((item) => item.kind === value).length])) as Record<ReviewSample['kind'], number>
  const samplesByCategory = Object.fromEntries(categories.map((value) => [value, ordered.filter((item) => item.category === value).map(({ dependency: _dependency, key: _key, ...sample }) => sample)])) as unknown as Record<ReviewCategory, readonly ReviewSample[]>
  const dependencyCount = ordered.filter((item) => item.dependency).length
  return { total: ordered.length, rootCount: ordered.length - dependencyCount, dependencyCount, byCategory, byCandidateKind, samplesByCategory }
}

export interface NoOpExecutionRecord {
  readonly workflowRunId: string
  readonly knowledgeBaseId: string
  readonly rawRef: string
  readonly documentId: string
  readonly workflowInputFingerprint: string
  readonly status: 'completed' | 'completed_with_review' | 'blocked'
  readonly writeStatus: 'no_changes'
  readonly baseRevision: number
  readonly committedRevision: number
  readonly reviewSummary: ReviewSummary
  readonly completedAt: string
  readonly errors: readonly string[]
}
export type NoOpLogResult = { readonly kind: 'written' | 'replay' | 'conflict'; readonly record: Dict; readonly path: string; readonly message?: string }
export async function writeNoOpExecutionRecord(rootRef: string, record: NoOpExecutionRecord): Promise<NoOpLogResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(record.workflowRunId) || record.workflowRunId.includes('..')) throw new Error('Unsafe workflowRunId for no-op execution record')
  const path = join(rootRef, 'logs', 'ingestion', record.workflowRunId + '.yaml')
  await mkdir(dirname(path), { recursive: true })
  const existingRecord = async (): Promise<NoOpLogResult | undefined> => {
    try {
      const existing = JSON.parse(await readFile(path, 'utf8')) as unknown
      if (!isRecord(existing)) return { kind: 'conflict', record: {}, path, message: 'Execution log already exists and is not a valid record' }
      if (existing.writeStatus === 'committed') return { kind: 'conflict', record: existing, path, message: 'A committed Writer log already exists for this workflowRunId' }
      if (existing.workflowInputFingerprint === record.workflowInputFingerprint && existing.rawRef === record.rawRef) return { kind: 'replay', record: existing, path }
      return { kind: 'conflict', record: existing, path, message: 'Execution log already exists for a different input fingerprint or rawRef' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }
  const before = await existingRecord()
  if (before) return before
  const temporary = path + '.tmp-' + record.workflowRunId
  await writeFile(temporary, canonicalSerialize(record) + '\n', 'utf8')
  const immediatelyBefore = await existingRecord()
  if (immediatelyBefore) { try { await unlink(temporary) } catch { /* preserve the existing execution log */ } return immediatelyBefore }
  try { await rename(temporary, path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    try { await unlink(temporary) } catch { /* the destination is authoritative */ }
    const raced = await existingRecord()
    if (raced) return { ...raced, message: raced.message ?? 'Execution log was concurrently created' }
    throw error
  }
  try { await access(path) } catch { throw new Error('No-op execution record was not durably created') }
  return { kind: 'written', record: record as unknown as Dict, path }
}
export function reviewSummaryFromRecord(value: unknown): ReviewSummary { return isRecord(value) && isRecord(value.reviewSummary) ? value.reviewSummary as unknown as ReviewSummary : emptyReviewSummary() }
