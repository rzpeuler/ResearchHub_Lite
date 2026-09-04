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
import type { IncomingSourceContext, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import { consolidateExtractions } from './consolidation.ts'
import { planKnowledgeChangeSet } from './changeset-planner.ts'
import type { AcceptedExtractionUnit, IngestionWorkflowResult, RawDocumentKnowledgeIngestionInput, ExtractionUnitSummary, PlanAttemptSummary } from './contracts.ts'
import { ExtractionPlanValidationError, validateExtractionPlan } from './plan-validation.ts'
import { resolveKnowledge } from './knowledge-resolution.ts'
import { emptyReviewSummary, normalizeReviewSummary, reviewSummaryFromRecord, writeNoOpExecutionRecord } from './review-telemetry.ts'

const safeWorkflowId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const defaults = { maxExtractionUnits: 64, maxPlanAttempts: 2, maxExtractionAttempts: 2, maxConcurrency: 4, maxResolutionAttempts: 2, maxResolutionCases: 32, maxEntityBindingCandidates: 8 }
export type EffectiveConfig = { maxExtractionUnits: number; maxPlanAttempts: number; maxExtractionAttempts: number; maxConcurrency: number; maxResolutionAttempts?: number; maxResolutionCases?: number; maxEntityBindingCandidates?: number; maxContextTokens?: number }

function emptyResult(input: RawDocumentKnowledgeIngestionInput, errors: readonly string[] = [], planAttempts: readonly PlanAttemptSummary[] = []): IngestionWorkflowResult { return { workflowRunId: input.workflowRunId, knowledgeBaseId: input.handle.knowledgeBaseId, status: 'blocked', unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], reviewSummary: emptyReviewSummary(), planAttempts, errors } }
function counts(results: readonly ValidatedExtractKnowledgeResult[]): Record<string, number> { return { entity: results.reduce((sum, result) => sum + result.entities.length, 0), relation: results.reduce((sum, result) => sum + result.relations.length, 0), claim: results.reduce((sum, result) => sum + result.claims.length, 0), rejected: results.reduce((sum, result) => sum + result.rejected.length, 0) } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function positiveSafeInteger(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) > 0 }
export function validateIngestionConfig(config: RawDocumentKnowledgeIngestionInput['config']): string[] {
  const errors: string[] = []
  for (const [key, value] of Object.entries(config ?? {})) if (!['maxExtractionUnits', 'maxPlanAttempts', 'maxExtractionAttempts', 'maxConcurrency', 'maxContextTokens', 'maxResolutionAttempts', 'maxResolutionCases', 'maxEntityBindingCandidates'].includes(key) || !positiveSafeInteger(value)) errors.push(key + ' must be a positive safe integer')
  return errors
}
function effectiveConfig(config: RawDocumentKnowledgeIngestionInput['config']): EffectiveConfig {
  return { maxExtractionUnits: config?.maxExtractionUnits ?? defaults.maxExtractionUnits, maxPlanAttempts: config?.maxPlanAttempts ?? defaults.maxPlanAttempts, maxExtractionAttempts: config?.maxExtractionAttempts ?? defaults.maxExtractionAttempts, maxConcurrency: config?.maxConcurrency ?? defaults.maxConcurrency, maxResolutionAttempts: config?.maxResolutionAttempts ?? defaults.maxResolutionAttempts, maxResolutionCases: config?.maxResolutionCases ?? defaults.maxResolutionCases, maxEntityBindingCandidates: config?.maxEntityBindingCandidates ?? defaults.maxEntityBindingCandidates, ...(config?.maxContextTokens === undefined ? {} : { maxContextTokens: config.maxContextTokens }) }
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

export async function boundedExtract(input: RawDocumentKnowledgeIngestionInput, document: StructuredDocument, reportMap: Parameters<RawDocumentKnowledgeIngestionInput['skill']['extractKnowledge']>[0]['reportMap'], units: readonly AcceptedExtractionUnit[], concurrency: number, config: EffectiveConfig): Promise<{ results: Array<{ unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }>; summaries: ExtractionUnitSummary[]; errors: string[]; peak: number }> {
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
function replayStatus(value: unknown): 'completed' | 'completed_with_review' | 'blocked' | undefined { return value === 'completed_with_review' || value === 'completed' || value === 'blocked' ? value : undefined }
function terminalStatus(validation: { readonly status: string }, reviewSummary: ReturnType<typeof normalizeReviewSummary>): IngestionWorkflowResult['status'] { return validation.status === 'failed' ? 'blocked' : reviewSummary.total > 0 ? 'completed_with_review' : 'completed' }
function planAttemptFromError(attempt: number, error: ExtractionPlanValidationError, status: PlanAttemptSummary['status']): PlanAttemptSummary {
  const feedback = error.feedback
  return { attempt, status, validationCode: error.code, uncoveredCount: feedback.uncoveredRefs?.length, overlapCount: feedback.overlapRefs?.length, affectedUnitId: feedback.affectedUnitId, estimatedTokens: feedback.estimatedTokens, allowedTokens: feedback.allowedTokens, unitCount: feedback.unitCount, maxUnits: feedback.maxUnits }
}

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
  let acceptedPlan: IngestionWorkflowResult['acceptedPlan']
  let unitSummaries: ExtractionUnitSummary[] = []
  const planAttempts: PlanAttemptSummary[] = []
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
        const loggedFingerprint = typeof replayLog.workflowInputFingerprint === 'string' ? replayLog.workflowInputFingerprint : context.workflowInputFingerprint
        const loggedRawRef = typeof replayLog.rawRef === 'string' ? replayLog.rawRef : context.rawRef
        const same = loggedFingerprint === fingerprint && loggedRawRef === rawRef
        if (!same) return { ...emptyResult(input, ['Idempotency conflict: workflowRunId is already committed for a different rawRef or input fingerprint']), knowledgeBaseId: handle.knowledgeBaseId, rawRef, ...(typeof context.documentId === 'string' ? { documentId: context.documentId } : {}) }
        const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
        const reviewSummary = reviewSummaryFromRecord(isRecord(context.reviewSummary) ? context : replayLog)
        const status = finalValidation.status === 'failed' ? 'blocked' : replayStatus(replayLog.status)!
        return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId: typeof context.documentId === 'string' ? context.documentId : undefined, status, unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], reviewSummary, planAttempts: [], changeSetId: typeof replayLog.changeSetId === 'string' ? replayLog.changeSetId : undefined, writeStatus: 'already_committed', baseRevision: Number(replayLog.baseRevision ?? replayLog.committedRevision ?? handle.revision), committedRevision: Number(replayLog.committedRevision ?? handle.revision), validationSummary: finalValidation, errors: finalValidation.errors.map((item) => item.message) }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const document = await resolver.parse(acquired)
    documentId = document.documentId
    const capabilities = input.skill.capabilities()
    let planned: Awaited<ReturnType<typeof input.skill.understandAndPlan>> | undefined
    let planRepair: Parameters<typeof input.skill.understandAndPlan>[0]['planRepair'] | undefined
    for (let attempt = 1; attempt <= config.maxPlanAttempts; attempt += 1) {
      planAttempts.push({ attempt, status: 'proposed' })
      const proposal = await input.skill.understandAndPlan({ document, instructions: input.instructions, ...(planRepair === undefined ? {} : { planRepair }) })
      planned = proposal
      try {
        acceptedPlan = validateExtractionPlan(proposal, document, capabilities, { ...input.config, maxExtractionUnits: config.maxExtractionUnits, ...(config.maxContextTokens === undefined ? {} : { maxContextTokens: config.maxContextTokens }) }, input.instructions)
        planAttempts[planAttempts.length - 1] = { attempt, status: 'accepted' }
        break
      } catch (error) {
        if (!(error instanceof ExtractionPlanValidationError)) throw error
        const terminal = !error.repairable || attempt >= config.maxPlanAttempts
        planAttempts[planAttempts.length - 1] = planAttemptFromError(attempt, error, terminal ? 'terminal_invalid' : 'repairable_invalid')
        if (terminal) return { ...emptyResult(input, [error.message], planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, planAttempts }
        planRepair = { previousOutput: proposal, feedback: error.feedback, attempt: attempt + 1 }
      }
    }
    if (!planned || !acceptedPlan) return { ...emptyResult(input, ['No accepted extraction plan was produced'], planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, planAttempts }
    const extractionConcurrency = Math.min(config.maxConcurrency, capabilities.maxConcurrency, acceptedPlan.units.length)
    if (!Number.isSafeInteger(extractionConcurrency) || extractionConcurrency <= 0) return { ...emptyResult(input, ['maxConcurrency or accepted extraction capacity prevents execution'], planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, planAttempts }
    const extraction = await boundedExtract(input, document, planned.reportMap, acceptedPlan.units, extractionConcurrency, config)
    unitSummaries = extraction.summaries
    if (extraction.errors.length > 0) return { ...emptyResult(input, extraction.errors, planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, planAttempts, unitSummaries, extractionConcurrency, peakExtractionConcurrency: extraction.peak, candidateCounts: counts(extraction.results.map((item) => item.result)) }
    const consolidated = consolidateExtractions(extraction.results)
    const assets = await new KnowledgeBaseLoaderV03(registry).load(handle)
    const candidateIds = new Set<string>()
    for (const group of consolidated.groups) {
      if (candidateIds.has(group.candidateId)) throw new Error(`Duplicate consolidated candidateId before knowledge resolution: ${group.candidateId}`)
      candidateIds.add(group.candidateId)
    }
    const resolution = await resolveKnowledge({ assets, document, groups: consolidated.groups, reportMap: planned.reportMap, incomingSourceContext: { title: archived.manifest.suppliedMetadata.title, institution: archived.manifest.suppliedMetadata.institution, author: archived.manifest.suppliedMetadata.author, publishedAt: archived.manifest.suppliedMetadata.publishedAt, sourceType: planned.reportMap.sourceAssessment.sourceType as IncomingSourceContext['sourceType'], reliability: planned.reportMap.sourceAssessment.reliability ?? null }, plan: acceptedPlan, rawRef, skill: input.skill, instructions: input.instructions, maxResolutionAttempts: config.maxResolutionAttempts, maxResolutionCases: config.maxResolutionCases, maxEntityBindingCandidates: config.maxEntityBindingCandidates, maxContextTokens: config.maxContextTokens, consolidationReviews: consolidated.reviewConstraints, candidateSupport: consolidated.candidateSupport })
    const planning = planKnowledgeChangeSet({ knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, workflowRunId: input.workflowRunId, rawRef, rawManifest: archived.manifest, documentId: document.documentId, document: { metadata: document.metadata }, reportMap: planned.reportMap, plan: acceptedPlan, groups: consolidated.groups, intents: resolution.intents, bindings: resolution.bindings, assets, resolutionReviews: resolution.reviewItems, consolidationReviews: consolidated.reviewConstraints })
    const reviewSummary = normalizeReviewSummary({ extractionRejected: extraction.results.flatMap((item) => item.result.rejected), consolidationReviews: consolidated.reviewConstraints, resolutionReviews: [...resolution.reviewItems, ...planning.reviewItems], candidateGroups: consolidated.groups })
    if (resolution.blocked || planning.blocked) return { ...emptyResult(input, [...resolution.errors, ...(planning.errors ?? [])], planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, planAttempts, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reviewSummary, resolutionSummary: resolution.summary, potentialNewInvestmentThemes: resolution.potentialNewInvestmentThemes, recommendedNewInvestmentThemes: resolution.recommendedNewInvestmentThemes, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    if (!planning.changeSet) {
      const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
      const record = { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, workflowInputFingerprint: fingerprint, status: terminalStatus(finalValidation, reviewSummary), writeStatus: 'no_changes' as const, baseRevision: handle.revision, committedRevision: handle.revision, reviewSummary, completedAt: clock(), errors: finalValidation.errors.map((item) => item.message) }
      const noOp = await writeNoOpExecutionRecord(handle.rootRef, record)
      if (noOp.kind === 'conflict') return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, status: 'blocked', acceptedPlan, planAttempts, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reviewSummary, resolutionSummary: resolution.summary, potentialNewInvestmentThemes: resolution.potentialNewInvestmentThemes, recommendedNewInvestmentThemes: resolution.recommendedNewInvestmentThemes, writeStatus: 'no_changes', baseRevision: handle.revision, committedRevision: handle.revision, validationSummary: finalValidation, extractionConcurrency, peakExtractionConcurrency: extraction.peak, errors: [noOp.message ?? 'Execution log conflict'] }
      const persisted = noOp.record
      const persistedStatus = replayStatus(persisted.status) ?? record.status
      return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, status: persistedStatus, acceptedPlan, planAttempts, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reviewSummary: reviewSummaryFromRecord(persisted), resolutionSummary: resolution.summary, potentialNewInvestmentThemes: resolution.potentialNewInvestmentThemes, recommendedNewInvestmentThemes: resolution.recommendedNewInvestmentThemes, writeStatus: noOp.kind === 'replay' ? 'already_committed' : 'no_changes', baseRevision: Number(persisted.baseRevision ?? handle.revision), committedRevision: Number(persisted.committedRevision ?? handle.revision), validationSummary: finalValidation, extractionConcurrency, peakExtractionConcurrency: extraction.peak, errors: finalValidation.errors.map((item) => item.message) }
    }
    const changeSet = { ...planning.changeSet, ingestionContext: { ...(planning.changeSet.ingestionContext ?? {}), workflowInputFingerprint: fingerprint, workflowStatusHint: reviewSummary.total > 0 ? 'completed_with_review' as const : 'completed' as const, reviewSummary } }
    const changeSetValidation = await validateKnowledgeChangeSetV03(handle, changeSet, { mode: 'commit' })
    if (!changeSetValidation.validatedChangeSet) return { ...emptyResult(input, changeSetValidation.report.errors.map((item) => item.message), planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, planAttempts, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reviewSummary, potentialNewInvestmentThemes: resolution.potentialNewInvestmentThemes, recommendedNewInvestmentThemes: resolution.recommendedNewInvestmentThemes, validationSummary: changeSetValidation.report, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    const write = await writeKnowledgeBaseV03(handle, { receipt: changeSetValidation.validatedChangeSet, registry, clock, stagedStateValidator: async (rootRef) => { const staged = await validateKnowledgeBaseV03(rootRef); if (staged.status === 'failed') throw new Error(staged.errors.map((item) => item.message).join('; ')) } })
    if (write.status === 'rejected' || write.status === 'failed') return { ...emptyResult(input, [write.error?.message ?? 'Writer ' + write.status], planAttempts), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, planAttempts, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reviewSummary, potentialNewInvestmentThemes: resolution.potentialNewInvestmentThemes, recommendedNewInvestmentThemes: resolution.recommendedNewInvestmentThemes, changeSetId: changeSet.changeSetId, writeStatus: write.status, baseRevision: write.baseRevision, committedRevision: write.committedRevision, validationSummary: changeSetValidation.report, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    handle = await registry.refresh(handle.rootRef)
    const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
    return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, status: terminalStatus(finalValidation, reviewSummary), acceptedPlan, planAttempts, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reviewSummary, resolutionSummary: resolution.summary, potentialNewInvestmentThemes: resolution.potentialNewInvestmentThemes, recommendedNewInvestmentThemes: resolution.recommendedNewInvestmentThemes, changeSetId: changeSet.changeSetId, writeStatus: write.status, baseRevision: write.baseRevision, committedRevision: write.committedRevision, validationSummary: finalValidation, extractionConcurrency, peakExtractionConcurrency: extraction.peak, errors: finalValidation.errors.map((item) => item.message) }
  } catch (error) {
    return { ...emptyResult(input, [errorMessage(error)], planAttempts), knowledgeBaseId: handle.knowledgeBaseId, ...(rawRef === undefined ? {} : { rawRef }), ...(documentId === undefined ? {} : { documentId }), ...(acceptedPlan === undefined ? {} : { acceptedPlan }), planAttempts, unitSummaries }
  }
}
