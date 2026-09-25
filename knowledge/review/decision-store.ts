import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalSerialize, hashKnowledgeObject } from '../storage/canonical-hash.ts'
import { withKnowledgeBaseMutationLock } from '../storage/mutation-lock.ts'
import { parseYaml } from '../storage/yaml.ts'
import type { ReviewCase } from './contracts.ts'
import { listReviewCases, loadReviewCase } from './store.ts'
import { isSafeReviewPathSegment } from './validation.ts'

export type ReviewDecisionState = 'OPEN' | 'DEFERRED' | 'APPLYING' | 'ACCEPTED' | 'REJECTED' | 'STALE'
export type ReviewDecisionEventType = 'DEFERRED' | 'APPLYING' | 'ACCEPTED' | 'REJECTED' | 'STALE'
export interface ReviewDecisionApplyingIntent {
  readonly caseHash: string
  readonly payloadHash: string
  readonly baseKnowledgeRevision: number
  readonly writerRunId: string
  readonly expectedResultChecks: Readonly<Record<string, unknown>>
}
export interface ReviewDecisionEvent {
  readonly revision: number
  readonly type: ReviewDecisionEventType
  readonly actor: 'local_user'
  readonly at: string
  readonly note?: string
  readonly payloadHash: string
  readonly applyingIntent?: ReviewDecisionApplyingIntent
  readonly writerRunId?: string
  readonly committedRevision?: number
  readonly expectedResultChecks?: Readonly<Record<string, unknown>>
}
export interface ReviewDecisionRecord {
  readonly version: '0.1'
  readonly knowledgeBaseId: string
  readonly producerRunId: string
  readonly reviewCaseId: string
  readonly caseHash: string
  readonly state: Exclude<ReviewDecisionState, 'OPEN'>
  readonly revision: number
  readonly events: readonly ReviewDecisionEvent[]
}
export interface ReviewDecisionSnapshot {
  readonly knowledgeBaseId: string
  readonly producerRunId: string
  readonly reviewCaseId: string
  readonly case: ReviewCase
  readonly caseHash: string
  readonly state: ReviewDecisionState
  readonly revision: number
  readonly hash: string
  readonly record?: ReviewDecisionRecord
}
export interface ReviewDecisionProjection extends ReviewDecisionSnapshot {
  readonly actionable: boolean
}
export interface ReviewDecisionExpectation { readonly expectedHash: string; readonly expectedRevision: number }
export interface ReviewDecisionCommandResult { readonly kind: 'written' | 'replay' | 'conflict'; readonly snapshot: ReviewDecisionSnapshot; readonly message?: string }
export interface ReviewDecisionListOptions { readonly producerRunId?: string; readonly states?: readonly ReviewDecisionState[] }
export interface DeferReviewDecisionInput extends ReviewDecisionExpectation { readonly note?: string; readonly at: string }
export interface RejectReviewDecisionInput extends ReviewDecisionExpectation { readonly note?: string; readonly at: string }
export interface BeginReviewDecisionApplyInput extends ReviewDecisionExpectation { readonly note?: string; readonly at: string; readonly payloadHash: string; readonly baseKnowledgeRevision: number; readonly writerRunId: string; readonly expectedResultChecks: Readonly<Record<string, unknown>> }
export interface FinalizeAcceptedReviewDecisionInput extends ReviewDecisionExpectation { readonly at: string; readonly payloadHash: string; readonly writerRunId: string; readonly committedRevision: number; readonly expectedResultChecks: Readonly<Record<string, unknown>>; readonly note?: string }
export interface MarkStaleReviewDecisionInput extends ReviewDecisionExpectation { readonly at: string; readonly note: string }

const MAX_EVENTS = 128
const MAX_NOTE_LENGTH = 1000
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
type Dict = Record<string, unknown>

function isRecord(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function assertTimestamp(value: string): void { if (!ISO_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('ReviewDecision event time must be an ISO UTC timestamp') }
function assertNote(value: string | undefined): void { if (value !== undefined && (typeof value !== 'string' || value.length > MAX_NOTE_LENGTH)) throw new Error(`ReviewDecision note must be at most ${MAX_NOTE_LENGTH} characters`) }
function assertHash(value: string, name: string): void { if (!HASH_PATTERN.test(value)) throw new Error(`${name} must be a sha256 hash`) }
function decisionDirectory(rootRef: string, producerRunId: string): string {
  assertSegment(producerRunId, 'producerRunId')
  return join(resolve(rootRef), 'reviews', 'runs', producerRunId, 'decisions')
}
function decisionFile(rootRef: string, producerRunId: string, reviewCaseId: string): string {
  assertSegment(reviewCaseId, 'reviewCaseId')
  return join(decisionDirectory(rootRef, producerRunId), `${reviewCaseId}.yaml`)
}
function assertSegment(value: string, label: string): void { if (!isSafeReviewPathSegment(value)) throw new Error(`Unsafe ${label}: ${value}`) }
async function assertNoSymlink(path: string): Promise<void> {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`ReviewDecision path cannot be a symlink: ${path}`) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
async function assertSafeDirectoryChain(rootRef: string, producerRunId: string, includeDecisionDirectory: boolean): Promise<void> {
  const root = resolve(rootRef)
  await assertNoSymlink(root)
  const paths = [join(root, 'reviews'), join(root, 'reviews', 'runs'), join(root, 'reviews', 'runs', producerRunId)]
  if (includeDecisionDirectory) paths.push(join(root, 'reviews', 'runs', producerRunId, 'decisions'))
  for (const path of paths) await assertNoSymlink(path)
}
function serialize(value: unknown): string { return `${canonicalSerialize(value)}\n` }
function cloneJsonObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { return JSON.parse(canonicalSerialize(value)) as Readonly<Record<string, unknown>> }
function defaultRecord(reviewCase: ReviewCase): Omit<ReviewDecisionRecord, 'state'> & { readonly state?: never } {
  return { version: '0.1', knowledgeBaseId: reviewCase.knowledgeBaseId, producerRunId: reviewCase.producerRunId, reviewCaseId: reviewCase.reviewCaseId, caseHash: hashKnowledgeObject(reviewCase), revision: 0, events: [] }
}
function stateOf(record: ReviewDecisionRecord | undefined): ReviewDecisionState { return record?.state ?? 'OPEN' }
function validateJsonValue(value: unknown, depth = 0): void {
  if (depth > 6) throw new Error('ReviewDecision expectedResultChecks exceeds maximum nesting')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) { if (value.length > 64) throw new Error('ReviewDecision expectedResultChecks array exceeds bound'); for (const item of value) validateJsonValue(item, depth + 1); return }
  if (isRecord(value)) { const keys = Object.keys(value); if (keys.length > 64) throw new Error('ReviewDecision expectedResultChecks object exceeds bound'); for (const item of Object.values(value)) validateJsonValue(item, depth + 1); return }
  throw new Error('ReviewDecision expectedResultChecks must contain JSON values')
}
function validateIntent(value: unknown): asserts value is ReviewDecisionApplyingIntent {
  if (!isRecord(value) || typeof value.caseHash !== 'string' || !HASH_PATTERN.test(value.caseHash) || typeof value.payloadHash !== 'string' || !HASH_PATTERN.test(value.payloadHash) || !Number.isSafeInteger(value.baseKnowledgeRevision) || (value.baseKnowledgeRevision as number) < 0 || typeof value.writerRunId !== 'string' || !isSafeReviewPathSegment(value.writerRunId) || !isRecord(value.expectedResultChecks)) throw new Error('Malformed ReviewDecision APPLYING intent')
  validateJsonValue(value.expectedResultChecks)
}
function validateRecord(value: unknown, reviewCase: ReviewCase): asserts value is ReviewDecisionRecord {
  if (!isRecord(value) || value.version !== '0.1' || value.knowledgeBaseId !== reviewCase.knowledgeBaseId || value.producerRunId !== reviewCase.producerRunId || value.reviewCaseId !== reviewCase.reviewCaseId || value.caseHash !== hashKnowledgeObject(reviewCase) || !['DEFERRED', 'APPLYING', 'ACCEPTED', 'REJECTED', 'STALE'].includes(String(value.state)) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || !Array.isArray(value.events) || value.events.length === 0 || value.events.length > MAX_EVENTS || value.revision !== value.events.length) throw new Error('Malformed ReviewDecision record identity, state, revision, or event bound')
  const states: ReviewDecisionState[] = ['OPEN']
  let activeIntent: ReviewDecisionApplyingIntent | undefined
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index]
    if (!isRecord(event) || event.revision !== index + 1 || event.actor !== 'local_user' || typeof event.at !== 'string' || !ISO_PATTERN.test(event.at) || !Number.isFinite(Date.parse(event.at)) || typeof event.payloadHash !== 'string' || !HASH_PATTERN.test(event.payloadHash)) throw new Error('Malformed ReviewDecision event')
    if (event.note !== undefined && (typeof event.note !== 'string' || event.note.length > MAX_NOTE_LENGTH)) throw new Error('Malformed ReviewDecision event note')
    const previous = states.at(-1)!
    if (event.type === 'DEFERRED') {
      if (previous !== 'OPEN' && previous !== 'DEFERRED') throw new Error('Invalid ReviewDecision transition to DEFERRED')
      states.push('DEFERRED')
    } else if (event.type === 'APPLYING') {
      if (previous !== 'OPEN' && previous !== 'DEFERRED') throw new Error('Invalid ReviewDecision transition to APPLYING')
      validateIntent(event.applyingIntent)
      if (event.applyingIntent.caseHash !== value.caseHash || event.applyingIntent.payloadHash !== event.payloadHash) throw new Error('ReviewDecision APPLYING intent does not match its event')
      activeIntent = event.applyingIntent
      states.push('APPLYING')
    } else if (event.type === 'ACCEPTED') {
      if (previous !== 'APPLYING' || !activeIntent || event.writerRunId !== activeIntent.writerRunId || event.payloadHash !== activeIntent.payloadHash || !isRecord(event.expectedResultChecks) || hashKnowledgeObject(event.expectedResultChecks) !== hashKnowledgeObject(activeIntent.expectedResultChecks) || !Number.isSafeInteger(event.committedRevision) || (event.committedRevision as number) < activeIntent.baseKnowledgeRevision) throw new Error('Invalid ReviewDecision transition to ACCEPTED')
      states.push('ACCEPTED')
    } else if (event.type === 'REJECTED') {
      if (previous !== 'OPEN' && previous !== 'DEFERRED') throw new Error('Invalid ReviewDecision transition to REJECTED')
      states.push('REJECTED')
    } else if (event.type === 'STALE') {
      if (previous !== 'OPEN' && previous !== 'DEFERRED' && previous !== 'APPLYING') throw new Error('Invalid ReviewDecision transition to STALE')
      states.push('STALE')
    } else throw new Error('Unknown ReviewDecision event type')
  }
  if (states.at(-1) !== value.state) throw new Error('ReviewDecision state does not match event history')
}
async function readDecision(rootRef: string, reviewCase: ReviewCase): Promise<ReviewDecisionRecord | undefined> {
  const path = decisionFile(rootRef, reviewCase.producerRunId, reviewCase.reviewCaseId)
  await assertSafeDirectoryChain(rootRef, reviewCase.producerRunId, true)
  await assertNoSymlink(path)
  try {
    const value = parseYaml(await readFile(path, 'utf8'), path)
    validateRecord(value, reviewCase)
    return value
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
async function loadSnapshot(rootRef: string, producerRunId: string, reviewCaseId: string): Promise<ReviewDecisionSnapshot | undefined> {
  assertSegment(producerRunId, 'producerRunId'); assertSegment(reviewCaseId, 'reviewCaseId')
  await assertSafeDirectoryChain(rootRef, producerRunId, false)
  const reviewCase = await loadReviewCase(rootRef, reviewCaseId, producerRunId)
  if (!reviewCase) return undefined
  await assertSafeDirectoryChain(rootRef, producerRunId, true)
  const record = await readDecision(rootRef, reviewCase)
  const base = record ?? defaultRecord(reviewCase)
  return { knowledgeBaseId: reviewCase.knowledgeBaseId, producerRunId, reviewCaseId, case: reviewCase, caseHash: hashKnowledgeObject(reviewCase), state: stateOf(record), revision: base.revision, hash: hashKnowledgeObject(base), ...(record ? { record } : {}) }
}
async function writeRecord(rootRef: string, record: ReviewDecisionRecord): Promise<void> {
  const directory = decisionDirectory(rootRef, record.producerRunId)
  await assertSafeDirectoryChain(rootRef, record.producerRunId, false)
  await mkdir(directory, { recursive: false }).catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    await assertNoSymlink(directory)
  })
  await assertSafeDirectoryChain(rootRef, record.producerRunId, true)
  const destination = decisionFile(rootRef, record.producerRunId, record.reviewCaseId)
  await assertNoSymlink(destination)
  const temporary = join(directory, `.${record.reviewCaseId}.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx')
  try { await handle.writeFile(serialize(record), 'utf8'); await handle.sync() }
  finally { await handle.close() }
  try { await rename(temporary, destination) }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error }
}
function result(kind: ReviewDecisionCommandResult['kind'], snapshot: ReviewDecisionSnapshot, message?: string): ReviewDecisionCommandResult { return { kind, snapshot, ...(message ? { message } : {}) } }
function checkExpectation(snapshot: ReviewDecisionSnapshot, input: ReviewDecisionExpectation): boolean { return snapshot.revision === input.expectedRevision && snapshot.hash === input.expectedHash }
function eventPayloadHash(type: string, note?: string): string { return hashKnowledgeObject({ type, note: note ?? null }) }
function currentPayloadHash(snapshot: ReviewDecisionSnapshot): string | undefined { return snapshot.record?.events.at(-1)?.payloadHash }
function withEvent(snapshot: ReviewDecisionSnapshot, event: ReviewDecisionEvent, state: ReviewDecisionRecord['state']): ReviewDecisionRecord {
  const base = snapshot.record ?? { ...defaultRecord(snapshot.case), state: undefined }
  const record: ReviewDecisionRecord = { ...base, state, revision: event.revision, events: [...base.events, event] }
  validateRecord(record, snapshot.case)
  return record
}
async function mutate(rootRef: string, producerRunId: string, reviewCaseId: string, input: ReviewDecisionExpectation, create: (snapshot: ReviewDecisionSnapshot) => Promise<{ readonly replay?: boolean; readonly event?: ReviewDecisionEvent; readonly state?: ReviewDecisionRecord['state']; readonly message?: string }>): Promise<ReviewDecisionCommandResult> {
  return withKnowledgeBaseMutationLock(resolve(rootRef), async () => {
    await assertSafeDirectoryChain(rootRef, producerRunId, false)
    const snapshot = await loadSnapshot(rootRef, producerRunId, reviewCaseId)
    if (!snapshot) throw new Error(`ReviewCase not found: ${producerRunId}/${reviewCaseId}`)
    const mutation = await create(snapshot)
    if (mutation.replay) return result('replay', snapshot)
    if (!checkExpectation(snapshot, input)) return result('conflict', snapshot, 'ReviewDecision revision or hash changed')
    if (!mutation.event || !mutation.state) return result('conflict', snapshot, mutation.message ?? 'ReviewDecision transition is not allowed')
    const record = withEvent(snapshot, mutation.event, mutation.state)
    await writeRecord(rootRef, record)
    const updated = await loadSnapshot(rootRef, producerRunId, reviewCaseId)
    if (!updated) throw new Error('ReviewCase disappeared after ReviewDecision write')
    return result('written', updated)
  })
}
function baseEvent(snapshot: ReviewDecisionSnapshot, type: ReviewDecisionEventType, at: string, note: string | undefined, payloadHash: string): ReviewDecisionEvent {
  assertTimestamp(at); assertNote(note)
  return { revision: snapshot.revision + 1, type, actor: 'local_user', at, ...(note !== undefined ? { note } : {}), payloadHash }
}

export async function loadReviewDecision(rootRef: string, producerRunId: string, reviewCaseId: string): Promise<ReviewDecisionSnapshot | undefined> { return loadSnapshot(rootRef, producerRunId, reviewCaseId) }

export async function listReviewDecisionProjections(rootRef: string, options: ReviewDecisionListOptions = {}): Promise<readonly ReviewDecisionProjection[]> {
  if (options.producerRunId !== undefined) assertSegment(options.producerRunId, 'producerRunId')
  const casesRoot = join(resolve(rootRef), 'reviews', 'runs')
  await assertSafeDirectoryChain(rootRef, options.producerRunId ?? 'safe-placeholder', false)
  const runIds = options.producerRunId ? [options.producerRunId] : await readdir(casesRoot).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error })
  const projections: ReviewDecisionProjection[] = []
  for (const runId of runIds.filter((item) => !item.includes('.tmp-')).sort()) {
    assertSegment(runId, 'producerRunId')
    const runPath = join(casesRoot, runId)
    await assertNoSymlink(runPath)
    const cases = await listReviewCases(rootRef, { producerRunId: runId })
    for (const reviewCase of cases) {
      const snapshot = await loadSnapshot(rootRef, runId, reviewCase.reviewCaseId)
      if (!snapshot) continue
      const projection: ReviewDecisionProjection = { ...snapshot, actionable: snapshot.state === 'OPEN' || snapshot.state === 'DEFERRED' }
      if (!options.states || options.states.includes(projection.state)) projections.push(projection)
    }
  }
  return projections.sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))
}

export async function deferReviewCase(rootRef: string, producerRunId: string, reviewCaseId: string, input: DeferReviewDecisionInput): Promise<ReviewDecisionCommandResult> {
  const payloadHash = eventPayloadHash('DEFERRED', input.note)
  return mutate(rootRef, producerRunId, reviewCaseId, input, async (snapshot) => {
    if (snapshot.state === 'DEFERRED' && currentPayloadHash(snapshot) === payloadHash) return { replay: true }
    if (snapshot.state !== 'OPEN' && snapshot.state !== 'DEFERRED') return { message: `Cannot defer ReviewDecision in ${snapshot.state}` }
    return { event: baseEvent(snapshot, 'DEFERRED', input.at, input.note, payloadHash), state: 'DEFERRED' }
  })
}

export async function rejectReviewCase(rootRef: string, producerRunId: string, reviewCaseId: string, input: RejectReviewDecisionInput): Promise<ReviewDecisionCommandResult> {
  const payloadHash = eventPayloadHash('REJECTED', input.note)
  return mutate(rootRef, producerRunId, reviewCaseId, input, async (snapshot) => {
    if (snapshot.state === 'REJECTED' && currentPayloadHash(snapshot) === payloadHash) return { replay: true }
    if (snapshot.state !== 'OPEN' && snapshot.state !== 'DEFERRED') return { message: `Cannot reject ReviewDecision in ${snapshot.state}` }
    return { event: baseEvent(snapshot, 'REJECTED', input.at, input.note, payloadHash), state: 'REJECTED' }
  })
}

export async function beginApplyingReviewCase(rootRef: string, producerRunId: string, reviewCaseId: string, input: BeginReviewDecisionApplyInput): Promise<ReviewDecisionCommandResult> {
  assertHash(input.payloadHash, 'Decision payloadHash')
  if (!Number.isSafeInteger(input.baseKnowledgeRevision) || input.baseKnowledgeRevision < 0) throw new Error('ReviewDecision base Knowledge revision must be a non-negative integer')
  assertSegment(input.writerRunId, 'writerRunId'); validateJsonValue(input.expectedResultChecks)
  const expectedResultChecks = cloneJsonObject(input.expectedResultChecks)
  const intent: ReviewDecisionApplyingIntent = { caseHash: '', payloadHash: input.payloadHash, baseKnowledgeRevision: input.baseKnowledgeRevision, writerRunId: input.writerRunId, expectedResultChecks }
  return mutate(rootRef, producerRunId, reviewCaseId, input, async (snapshot) => {
    const existingIntent = snapshot.record?.events.at(-1)?.applyingIntent
    if (snapshot.state === 'APPLYING' && existingIntent?.caseHash === snapshot.caseHash && existingIntent.payloadHash === input.payloadHash && existingIntent.baseKnowledgeRevision === input.baseKnowledgeRevision && existingIntent.writerRunId === input.writerRunId && hashKnowledgeObject(existingIntent.expectedResultChecks) === hashKnowledgeObject(expectedResultChecks)) return { replay: true }
    if (snapshot.state !== 'OPEN' && snapshot.state !== 'DEFERRED') return { message: `Cannot begin ACCEPT in ${snapshot.state}` }
    const applyingIntent: ReviewDecisionApplyingIntent = { ...intent, caseHash: snapshot.caseHash }
    const event = baseEvent(snapshot, 'APPLYING', input.at, input.note, input.payloadHash)
    return { event: { ...event, applyingIntent }, state: 'APPLYING' }
  })
}

export async function finalizeAcceptedReviewCase(rootRef: string, producerRunId: string, reviewCaseId: string, input: FinalizeAcceptedReviewDecisionInput): Promise<ReviewDecisionCommandResult> {
  assertSegment(input.writerRunId, 'writerRunId')
  assertHash(input.payloadHash, 'Decision payloadHash'); validateJsonValue(input.expectedResultChecks)
  const expectedResultChecks = cloneJsonObject(input.expectedResultChecks)
  if (!Number.isSafeInteger(input.committedRevision) || input.committedRevision < 0) throw new Error('ReviewDecision committed revision must be a non-negative integer')
  return mutate(rootRef, producerRunId, reviewCaseId, input, async (snapshot) => {
    const last = snapshot.record?.events.at(-1)
    if (snapshot.state === 'ACCEPTED' && last?.payloadHash === input.payloadHash && last.writerRunId === input.writerRunId && last.committedRevision === input.committedRevision && hashKnowledgeObject(last.expectedResultChecks) === hashKnowledgeObject(expectedResultChecks)) return { replay: true }
    if (snapshot.state !== 'APPLYING' || last?.applyingIntent?.writerRunId !== input.writerRunId || last.applyingIntent.payloadHash !== input.payloadHash || hashKnowledgeObject(last.applyingIntent.expectedResultChecks) !== hashKnowledgeObject(expectedResultChecks)) return { message: `Cannot finalize ACCEPT in ${snapshot.state} or APPLYING intent mismatch` }
    const event = baseEvent(snapshot, 'ACCEPTED', input.at, input.note, input.payloadHash)
    return { event: { ...event, writerRunId: input.writerRunId, committedRevision: input.committedRevision, expectedResultChecks }, state: 'ACCEPTED' }
  })
}

export async function markReviewCaseStale(rootRef: string, producerRunId: string, reviewCaseId: string, input: MarkStaleReviewDecisionInput): Promise<ReviewDecisionCommandResult> {
  return mutate(rootRef, producerRunId, reviewCaseId, input, async (snapshot) => {
    if (snapshot.state === 'STALE' && currentPayloadHash(snapshot) === eventPayloadHash('STALE', input.note)) return { replay: true }
    if (snapshot.state !== 'OPEN' && snapshot.state !== 'DEFERRED' && snapshot.state !== 'APPLYING') return { message: `Cannot mark ReviewDecision stale in ${snapshot.state}` }
    const payloadHash = eventPayloadHash('STALE', input.note)
    return { event: baseEvent(snapshot, 'STALE', input.at, input.note, payloadHash), state: 'STALE' }
  })
}

export class ReviewDecisionStore {
  constructor(private readonly rootRef: string) {}
  load(producerRunId: string, reviewCaseId: string): Promise<ReviewDecisionSnapshot | undefined> { return loadReviewDecision(this.rootRef, producerRunId, reviewCaseId) }
  list(options?: ReviewDecisionListOptions): Promise<readonly ReviewDecisionProjection[]> { return listReviewDecisionProjections(this.rootRef, options) }
  defer(producerRunId: string, reviewCaseId: string, input: DeferReviewDecisionInput): Promise<ReviewDecisionCommandResult> { return deferReviewCase(this.rootRef, producerRunId, reviewCaseId, input) }
  reject(producerRunId: string, reviewCaseId: string, input: RejectReviewDecisionInput): Promise<ReviewDecisionCommandResult> { return rejectReviewCase(this.rootRef, producerRunId, reviewCaseId, input) }
  beginApplying(producerRunId: string, reviewCaseId: string, input: BeginReviewDecisionApplyInput): Promise<ReviewDecisionCommandResult> { return beginApplyingReviewCase(this.rootRef, producerRunId, reviewCaseId, input) }
  finalizeAccepted(producerRunId: string, reviewCaseId: string, input: FinalizeAcceptedReviewDecisionInput): Promise<ReviewDecisionCommandResult> { return finalizeAcceptedReviewCase(this.rootRef, producerRunId, reviewCaseId, input) }
  markStale(producerRunId: string, reviewCaseId: string, input: MarkStaleReviewDecisionInput): Promise<ReviewDecisionCommandResult> { return markReviewCaseStale(this.rootRef, producerRunId, reviewCaseId, input) }
}
