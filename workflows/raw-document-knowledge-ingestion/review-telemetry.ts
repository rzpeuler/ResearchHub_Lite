import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { canonicalSerialize } from '../../knowledge/storage/canonical-hash.ts'
import { withKnowledgeBaseMutationLock } from '../../knowledge/storage/mutation-lock.ts'
import type { ReconciliationDecision, ResolvedCandidateGroup } from '../../skills/knowledge-curation/contracts.ts'
import type { ReviewCategory, ReviewItem, ReviewOrigin, ReviewSample, ReviewSummary } from './contracts.ts'

type Dict = Record<string, unknown>
type Event = ReviewSample & { readonly dependency: boolean; readonly origin: ReviewOrigin; readonly reviewKey: string }
const categories: readonly ReviewCategory[] = ['invalid_reference', 'invalid_semantics', 'relation_cardinality', 'schema_gap', 'theme_creation', 'theme_ambiguity', 'reconciliation_review', 'other']
const kinds: readonly ReviewSample['kind'][] = ['entity', 'relation', 'claim', 'workflow_level']

function isRecord(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function kind(value: unknown): ReviewSample['kind'] { return value === 'entity' || value === 'relation' || value === 'claim' ? value : 'workflow_level' }
function normalized(value: string): string { return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ') }
function categoryForRejection(value: unknown): ReviewCategory { return value === 'invalid_reference' ? 'invalid_reference' : value === 'invalid_semantics' ? 'invalid_semantics' : 'other' }
export function categoryForRationale(value: string): ReviewCategory {
  const text = normalized(value)
  if (text.includes('cardinality') || text.includes('business_exposure')) return 'relation_cardinality'
  if (text.includes('theme') && (text.includes('ambiguous') || text.includes('multiple') || text.includes('exactly one'))) return 'theme_ambiguity'
  if (text.includes('theme') && (text.includes('create') || text.includes('group'))) return 'theme_creation'
  if (text.includes('schema gap')) return 'schema_gap'
  if (text.includes('unsupported') || text.includes('invalid') || text.includes('schema')) return 'invalid_semantics'
  if (text.includes('blocked') || text.includes('endpoint') || text.includes('reference')) return 'invalid_reference'
  return 'reconciliation_review'
}
export function consolidationReviewKey(candidateId: string, reason: string, conflictingFields: readonly string[] = []): string { return ['consolidation', candidateId, normalized(reason), [...conflictingFields].sort().map(normalized).join(',')].join('|') }
export function reconciliationReviewKey(candidateId: string, action: string, rationale: string): string { return ['reconciliation', candidateId, action, normalized(rationale)].join('|') }
export function plannerReviewKey(candidateId: string, stage: string, category: ReviewCategory, rationale: string, dependency: boolean): string { return ['planner', candidateId, stage, category, dependency ? 'dependency' : 'root', normalized(rationale)].join('|') }
function addEvent(events: Map<string, Event>, sample: Omit<Event, 'reviewKey'> & { readonly reviewKey?: string }): void {
  const reviewKey = sample.reviewKey ?? plannerReviewKey(sample.candidateId ?? 'workflow', sample.stage, sample.category, sample.rationale, sample.dependency)
  if (!events.has(reviewKey)) events.set(reviewKey, { ...sample, reviewKey })
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
  const consolidationKeys = new Map<string, string[]>()
  for (const raw of input.extractionRejected ?? []) {
    const item = isRecord(raw) ? raw : {}
    const candidateId = typeof item.candidateId === 'string' ? item.candidateId : undefined
    const itemKind = kind(item.kind)
    const code = typeof item.code === 'string' ? item.code : 'other'
    const rationale = typeof item.message === 'string' ? item.message : 'Extraction candidate rejected'
    addEvent(events, { ...(candidateId === undefined ? {} : { candidateId }), kind: itemKind, stage: 'extraction', category: categoryForRejection(code), rationale, dependentCandidateIds: [], dependency: false, origin: 'extraction_rejection', reviewKey: ['extraction', candidateId ?? '', code, normalized(rationale)].join('|') })
  }
  for (const item of input.consolidationReviews ?? []) {
    const reviewKey = consolidationReviewKey(item.candidateId, item.reason, item.conflictingFields ?? [])
    consolidationKeys.set(item.candidateId, [...(consolidationKeys.get(item.candidateId) ?? []), reviewKey])
    addEvent(events, { candidateId: item.candidateId, kind: kind(groupKinds.get(item.candidateId)), stage: 'consolidation', category: 'other', rationale: item.reason, dependentCandidateIds: [], dependency: false, origin: 'consolidation', reviewKey })
  }
  const reconciliationKeys = new Map<string, string>()
  for (const decision of input.reconciliationDecisions ?? []) {
    if (decision.action !== 'user_review' && decision.action !== 'reject') continue
    const reviewKey = reconciliationReviewKey(decision.candidateId, decision.action, decision.rationale)
    reconciliationKeys.set(decision.candidateId + '|' + normalized(decision.rationale), reviewKey)
    addEvent(events, { candidateId: decision.candidateId, kind: kind(groupKinds.get(decision.candidateId)), stage: 'reconciliation', category: 'reconciliation_review', rationale: decision.rationale, dependentCandidateIds: [], dependency: false, origin: 'reconciliation', reviewKey })
  }
  const plannerCandidateIds = new Set((input.plannerReviewItems ?? []).map((item) => item.candidateId))
  for (const item of input.plannerReviewItems ?? []) {
    const rationale = normalized(item.rationale)
    const origin: ReviewOrigin = item.origin ?? 'planner'
    const category = item.category ?? (origin === 'consolidation_mirror' ? 'other' : origin === 'reconciliation_mirror' ? 'reconciliation_review' : origin === 'dependency_isolation' ? 'invalid_reference' : categoryForRationale(item.rationale))
    const dependency = item.dependency ?? (origin === 'dependency_isolation' || rationale.includes('blocked by') || rationale.includes('dependency isolated'))
    let reviewKey = item.reviewKey
    if (reviewKey === undefined && (origin === 'planner' || origin === 'consolidation_mirror') && rationale === 'consolidation conflict requires review') {
      const mirrors = consolidationKeys.get(item.candidateId) ?? []
      if (mirrors.length === 1) reviewKey = mirrors[0]
    }
    if (reviewKey === undefined && (origin === 'planner' || origin === 'reconciliation_mirror')) reviewKey = reconciliationKeys.get(item.candidateId + '|' + rationale)
    addEvent(events, { candidateId: item.candidateId, kind: kind(item.kind), stage: item.stage ?? 'planner', category, rationale: item.rationale, dependentCandidateIds: item.dependentCandidateIds, dependency, origin, reviewKey: reviewKey ?? plannerReviewKey(item.candidateId, item.stage ?? 'planner', category, item.rationale, dependency) })
    if (!dependency) for (const dependent of item.dependentCandidateIds) if (!plannerCandidateIds.has(dependent)) addEvent(events, { candidateId: dependent, kind: kind(groupKinds.get(dependent)), stage: 'planner', category: 'invalid_reference', rationale: 'Dependency isolated by review of ' + item.candidateId, dependentCandidateIds: [item.candidateId], dependency: true, origin: 'dependency_isolation', reviewKey: ['dependency', item.candidateId, dependent].join('|') })
  }
  const ordered = [...events.values()].sort((left, right) => left.reviewKey.localeCompare(right.reviewKey))
  const byCategory = Object.fromEntries(categories.map((value) => [value, ordered.filter((item) => item.category === value).length])) as Record<ReviewCategory, number>
  const byCandidateKind = Object.fromEntries(kinds.map((value) => [value, ordered.filter((item) => item.kind === value).length])) as Record<ReviewSample['kind'], number>
  const samplesByCategory = Object.fromEntries(categories.map((value) => [value, ordered.filter((item) => item.category === value)])) as unknown as Record<ReviewCategory, readonly ReviewSample[]>
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

function logFingerprint(value: Dict): string | undefined { if (typeof value.workflowInputFingerprint === 'string') return value.workflowInputFingerprint; const context = isRecord(value.ingestionContext) ? value.ingestionContext : undefined; return typeof context?.workflowInputFingerprint === 'string' ? context.workflowInputFingerprint : undefined }
function logRawRef(value: Dict): string | undefined { if (typeof value.rawRef === 'string') return value.rawRef; const context = isRecord(value.ingestionContext) ? value.ingestionContext : undefined; return typeof context?.rawRef === 'string' ? context.rawRef : undefined }
function writerAuthoritative(value: Dict): boolean { return typeof value.changeSetId === 'string' || typeof value.changeSetHash === 'string' || typeof value.ingestionLogRef === 'string' || isRecord(value.changes) }

export async function writeNoOpExecutionRecord(rootRef: string, record: NoOpExecutionRecord): Promise<NoOpLogResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(record.workflowRunId) || record.workflowRunId.includes('..')) throw new Error('Unsafe workflowRunId for no-op execution record')
  const rootPath = resolve(rootRef)
  return withKnowledgeBaseMutationLock(rootPath, async () => {
    const path = join(rootPath, 'logs', 'ingestion', record.workflowRunId + '.yaml')
    await mkdir(dirname(path), { recursive: true })
    const existingRecord = async (): Promise<NoOpLogResult | undefined> => {
      try {
        const existing = JSON.parse(await readFile(path, 'utf8')) as unknown
        if (!isRecord(existing)) return { kind: 'conflict', record: {}, path, message: 'Execution log already exists and is not a valid record' }
        const same = logFingerprint(existing) === record.workflowInputFingerprint && logRawRef(existing) === record.rawRef
        if (same) return { kind: 'replay', record: existing, path }
        return { kind: 'conflict', record: existing, path, message: writerAuthoritative(existing) ? 'Authoritative Writer execution log exists for a different input' : 'Execution log already exists for a different input fingerprint or rawRef' }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    }
    const existing = await existingRecord()
    if (existing) return existing
    const temporary = path + '.tmp-' + process.pid + '-' + randomUUID()
    try {
      await writeFile(temporary, canonicalSerialize(record) + '\n', 'utf8')
      await rename(temporary, path)
      try { await access(path) } catch { throw new Error('No-op execution record was not durably created') }
      return { kind: 'written', record: record as unknown as Dict, path }
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  })
}
export function reviewSummaryFromRecord(value: unknown): ReviewSummary { return isRecord(value) && isRecord(value.reviewSummary) ? value.reviewSummary as unknown as ReviewSummary : emptyReviewSummary() }
