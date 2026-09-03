import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'
import type { RawSuppliedMetadata } from '../../knowledge/raw/raw-archive.ts'
import { archiveRaw, getRaw } from '../../knowledge/raw/raw-archive.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { writeKnowledgeBaseV03 } from '../../knowledge/writer/writer-v03.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { validateKnowledgeChangeSetV03 } from '../../knowledge/validation/v03-change-set-validator.ts'
import { parseYaml } from '../../knowledge/storage/yaml.ts'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { KnowledgeCurationError } from '../../skills/knowledge-curation/errors.ts'
import type { ResolvedCandidateGroup, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import { consolidateExtractions } from './consolidation.ts'
import { planKnowledgeChangeSet } from './changeset-planner.ts'
import type { AcceptedExtractionUnit, IngestionWorkflowResult, RawDocumentKnowledgeIngestionInput, ExtractionUnitSummary } from './contracts.ts'
import { validateExtractionPlan } from './plan-validation.ts'
import { retrieveFocusedKnowledge } from './retrieval.ts'

const safeWorkflowId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const defaults = { maxExtractionUnits: 64, maxExtractionAttempts: 2, maxConcurrency: 4 }
type EffectiveConfig = { maxExtractionUnits: number; maxExtractionAttempts: number; maxConcurrency: number; maxContextTokens?: number }

function emptyResult(input: RawDocumentKnowledgeIngestionInput, errors: readonly string[] = []): IngestionWorkflowResult { return { workflowRunId: input.workflowRunId, knowledgeBaseId: input.handle.knowledgeBaseId, status: 'blocked', unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], errors } }
function counts(results: readonly ValidatedExtractKnowledgeResult[]): Record<string, number> { return { entity: results.reduce((sum, result) => sum + result.entities.length, 0), relation: results.reduce((sum, result) => sum + result.relations.length, 0), claim: results.reduce((sum, result) => sum + result.claims.length, 0), rejected: results.reduce((sum, result) => sum + result.rejected.length, 0) } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function positiveSafeInteger(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) > 0 }
export function validateIngestionConfig(config: RawDocumentKnowledgeIngestionInput['config']): string[] {
  const errors: string[] = []
  for (const [key, value] of Object.entries(config ?? {})) if (!['maxExtractionUnits', 'maxExtractionAttempts', 'maxConcurrency', 'maxContextTokens'].includes(key) || !positiveSafeInteger(value)) errors.push(key + ' must be a positive safe integer')
  return errors
}
function effectiveConfig(config: RawDocumentKnowledgeIngestionInput['config']): EffectiveConfig {
  return { maxExtractionUnits: config?.maxExtractionUnits ?? defaults.maxExtractionUnits, maxExtractionAttempts: config?.maxExtractionAttempts ?? defaults.maxExtractionAttempts, maxConcurrency: config?.maxConcurrency ?? defaults.maxConcurrency, ...(config?.maxContextTokens === undefined ? {} : { maxContextTokens: config.maxContextTokens }) }
}
function normalizedMetadata(metadata: RawSuppliedMetadata): RawSuppliedMetadata { return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value])) as unknown as RawSuppliedMetadata }
function inputFingerprint(rawRef: string, metadata: RawSuppliedMetadata, instructions: string | undefined, config: EffectiveConfig): string { return hashKnowledgeObject({ rawRef, sourceMetadata: normalizedMetadata(metadata), instructions: instructions?.trim() ?? null, config }) }
function retryable(error: unknown): boolean {
  if (error instanceof KnowledgeCurationError) {
    if (error.code === 'invalid_model_output') return true
    if (error.code !== 'reasoning_failed') return false
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause
    const code = cause?.code ?? ''
    return code === 'reasoning_timeout' || /timeout|timed out|transient|temporar|retry/i.test(error.message + ' ' + (cause?.message ?? ''))
  }
  return false
}

async function boundedExtract(input: RawDocumentKnowledgeIngestionInput, document: StructuredDocument, reportMap: Parameters<RawDocumentKnowledgeIngestionInput['skill']['extractKnowledge']>[0]['reportMap'], units: readonly AcceptedExtractionUnit[], concurrency: number, config: EffectiveConfig): Promise<{ results: Array<{ unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }>; summaries: ExtractionUnitSummary[]; errors: string[]; peak: number }> {
  const results: Array<{ unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }> = []
  const summaries: ExtractionUnitSummary[] = []
  const errors: string[] = []
  let next = 0
  let active = 0
  let peak = 0
  async function worker(): Promise<void> {
    while (true) {
      const index = next++
      if (index >= units.length) return
      const unit = units[index]!
      active += 1; peak = Math.max(peak, active)
      let lastError = ''
      let result: ValidatedExtractKnowledgeResult | undefined
      let attempts = 0
      while (attempts < config.maxExtractionAttempts) {
        attempts += 1
        try { result = await input.skill.extractKnowledge({ document, reportMap, unit, instructions: input.instructions }); break }
        catch (error) { lastError = errorMessage(error); if (!retryable(error)) break }
      }
      active -= 1
      if (result) {
        results[index] = { unit, result }
        summaries[index] = { unitId: unit.unitId, proposedUnitId: unit.proposedUnitId, attempts, status: 'completed', candidateCounts: { entity: result.entities.length, relation: result.relations.length, claim: result.claims.length }, rejectedCount: result.rejected.length }
      } else {
        summaries[index] = { unitId: unit.unitId, proposedUnitId: unit.proposedUnitId, attempts, status: 'failed', candidateCounts: {}, rejectedCount: 0, error: lastError }
        errors.push('Extraction unit ' + unit.unitId + ' failed after ' + String(attempts) + ' attempt(s): ' + lastError)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, () => worker()))
  return { results: results.filter((item): item is { unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult } => item !== undefined), summaries: summaries.filter((item): item is ExtractionUnitSummary => item !== undefined), errors, peak }
}
function actionSummary(decisions: readonly { action: string }[]): Record<string, number> { return Object.fromEntries([...new Set(decisions.map((decision) => decision.action))].sort().map((action) => [action, decisions.filter((decision) => decision.action === action).length])) }
function replayStatus(value: unknown): 'completed' | 'completed_with_review' | undefined { return value === 'completed_with_review' ? value : value === 'completed' ? value : undefined }

export async function runRawDocumentKnowledgeIngestion(input: RawDocumentKnowledgeIngestionInput): Promise<IngestionWorkflowResult> {
  const configErrors = validateIngestionConfig(input.config)
  if (!safeWorkflowId.test(input.workflowRunId)) return emptyResult(input, ['workflowRunId must be a safe deterministic identifier'])
  if (configErrors.length > 0) return emptyResult(input, configErrors)
  const config = effectiveConfig(input.config)
  const clock = input.clock ?? (() => new Date().toISOString())
  const resolver = new DocumentInputResolver()
  const registry = new KnowledgeBaseRegistry()
  let handle = input.handle
  let rawRef: string | undefined
  let documentId: string | undefined
  let acceptedPlan
  let unitSummaries: ExtractionUnitSummary[] = []
  try {
    handle = await registry.mount(input.handle.rootRef)
    const acquired = await resolver.acquire(input.documentInput)
    const suppliedMetadata = normalizedMetadata({ title: input.sourceMetadata?.title ?? acquired.filename, institution: input.sourceMetadata?.institution ?? null, author: input.sourceMetadata?.author ?? null, publishedAt: input.sourceMetadata?.publishedAt ?? null, sourceUrl: input.sourceMetadata?.sourceUrl ?? null })
    const raw = await archiveRaw(handle, { bytes: acquired.bytes, originalFilename: acquired.filename, mediaType: acquired.mediaType, suppliedMetadata }, { clock })
    rawRef = raw.manifest.rawRef
    const archived = await getRaw(handle, rawRef)
    const fingerprint = inputFingerprint(rawRef, suppliedMetadata, input.instructions, config)
    try {
      const replayLog = parseYaml(await readFile(join(handle.rootRef, 'logs', 'ingestion', input.workflowRunId + '.yaml'), 'utf8'), 'ingestion-log')
      if (isRecord(replayLog) && replayStatus(replayLog.status)) {
        const context = isRecord(replayLog.ingestionContext) ? replayLog.ingestionContext : {}
        const same = context.workflowInputFingerprint === fingerprint && context.rawRef === rawRef
        if (!same) return { ...emptyResult(input, ['Idempotency conflict: workflowRunId is already committed for a different rawRef or input fingerprint']), knowledgeBaseId: handle.knowledgeBaseId, rawRef, ...(typeof context.documentId === 'string' ? { documentId: context.documentId } : {}) }
        const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
        const status = finalValidation.status === 'failed' ? 'blocked' : replayStatus(replayLog.status)!
        return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId: typeof context.documentId === 'string' ? context.documentId : undefined, status, unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], changeSetId: typeof replayLog.changeSetId === 'string' ? replayLog.changeSetId : undefined, writeStatus: 'already_committed', baseRevision: Number(replayLog.committedRevision ?? handle.revision), committedRevision: Number(replayLog.committedRevision ?? handle.revision), validationSummary: finalValidation, errors: finalValidation.errors.map((item) => item.message) }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const document = await resolver.parse(acquired)
    documentId = document.documentId
    const planned = await input.skill.understandAndPlan({ document, instructions: input.instructions })
    const capabilities = input.skill.capabilities()
    acceptedPlan = validateExtractionPlan(planned, document, capabilities, { ...input.config, maxExtractionUnits: config.maxExtractionUnits, ...(config.maxContextTokens === undefined ? {} : { maxContextTokens: config.maxContextTokens }) }, input.instructions)
    const extractionConcurrency = Math.min(config.maxConcurrency, capabilities.maxConcurrency, acceptedPlan.units.length)
    if (!Number.isSafeInteger(extractionConcurrency) || extractionConcurrency <= 0) return { ...emptyResult(input, ['maxConcurrency or accepted extraction capacity prevents execution']), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan }
    const extraction = await boundedExtract(input, document, planned.reportMap, acceptedPlan.units, extractionConcurrency, config)
    unitSummaries = extraction.summaries
    if (extraction.errors.length > 0) return { ...emptyResult(input, extraction.errors), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, extractionConcurrency, peakExtractionConcurrency: extraction.peak, candidateCounts: counts(extraction.results.map((item) => item.result)) }
    const consolidated = consolidateExtractions(extraction.results)
    const assets = await new KnowledgeBaseLoaderV03(registry).load(handle)
    const focused = retrieveFocusedKnowledge(assets, consolidated)
    const reconciliation = await input.skill.reconcileKnowledge({ candidateGroups: focused.groups as readonly ResolvedCandidateGroup[], existingKnowledge: focused.groups.flatMap((group) => group.existingKnowledge ?? []), reportMap: planned.reportMap, sourceAssessment: planned.reportMap.sourceAssessment, instructions: input.instructions })
    const reviewHint = consolidated.reviewConstraints.length > 0 || consolidated.rejected.length > 0 ? 'completed_with_review' : 'completed'
    const planning = planKnowledgeChangeSet({ knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, workflowRunId: input.workflowRunId, rawRef, rawManifest: archived.manifest, documentId: document.documentId, document: { metadata: document.metadata }, reportMap: planned.reportMap, plan: acceptedPlan, groups: focused.groups as readonly ResolvedCandidateGroup[], decisions: reconciliation.decisions, assets, consolidationReviews: consolidated.reviewConstraints, workflowInputFingerprint: fingerprint, reviewItemCount: consolidated.reviewConstraints.length, rejectedCandidateCount: consolidated.rejected.length, workflowStatusHint: reviewHint })
    const reviewStatus = planning.reviewItems.length > 0 || consolidated.rejected.length > 0 || consolidated.reviewConstraints.length > 0
    if (!planning.changeSet) {
      const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
      return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, status: finalValidation.status === 'failed' ? 'blocked' : reviewStatus ? 'completed_with_review' : 'completed', acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reconciliationSummary: actionSummary(reconciliation.decisions), writeStatus: 'no_changes', baseRevision: handle.revision, committedRevision: handle.revision, validationSummary: finalValidation, extractionConcurrency, peakExtractionConcurrency: extraction.peak, errors: finalValidation.errors.map((item) => item.message) }
    }
    const changeSetValidation = await validateKnowledgeChangeSetV03(handle, planning.changeSet, { mode: 'commit' })
    if (!changeSetValidation.validatedChangeSet) return { ...emptyResult(input, changeSetValidation.report.errors.map((item) => item.message)), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, validationSummary: changeSetValidation.report, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    const write = await writeKnowledgeBaseV03(handle, { receipt: changeSetValidation.validatedChangeSet, registry, clock, stagedStateValidator: async (rootRef) => { const staged = await validateKnowledgeBaseV03(rootRef); if (staged.status === 'failed') throw new Error(staged.errors.map((item) => item.message).join('; ')) } })
    if (write.status === 'rejected' || write.status === 'failed') return { ...emptyResult(input, [write.error?.message ?? 'Writer ' + write.status]), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, changeSetId: planning.changeSet.changeSetId, writeStatus: write.status, baseRevision: write.baseRevision, committedRevision: write.committedRevision, validationSummary: changeSetValidation.report, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    handle = await registry.refresh(handle.rootRef)
    const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
    const status = finalValidation.status === 'failed' ? 'blocked' : reviewStatus ? 'completed_with_review' : 'completed'
    return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, status, acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reconciliationSummary: actionSummary(reconciliation.decisions), changeSetId: planning.changeSet.changeSetId, writeStatus: write.status, baseRevision: write.baseRevision, committedRevision: write.committedRevision, validationSummary: finalValidation, extractionConcurrency, peakExtractionConcurrency: extraction.peak, errors: finalValidation.errors.map((item) => item.message) }
  } catch (error) {
    return { ...emptyResult(input, [errorMessage(error)]), knowledgeBaseId: handle.knowledgeBaseId, ...(rawRef === undefined ? {} : { rawRef }), ...(documentId === undefined ? {} : { documentId }), ...(acceptedPlan === undefined ? {} : { acceptedPlan }), unitSummaries }
  }
}
