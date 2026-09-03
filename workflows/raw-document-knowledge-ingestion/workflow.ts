import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import type { RawSuppliedMetadata } from '../../knowledge/raw/raw-archive.ts'
import { archiveRaw, getRaw } from '../../knowledge/raw/raw-archive.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { writeKnowledgeBaseV03 } from '../../knowledge/writer/writer-v03.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { validateKnowledgeChangeSetV03 } from '../../knowledge/validation/v03-change-set-validator.ts'
import { parseYaml } from '../../knowledge/storage/yaml.ts'
import type { ResolvedCandidateGroup, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import { consolidateExtractions } from './consolidation.ts'
import { planKnowledgeChangeSet } from './changeset-planner.ts'
import type { AcceptedExtractionUnit, IngestionWorkflowResult, RawDocumentKnowledgeIngestionInput, ExtractionUnitSummary } from './contracts.ts'
import { validateExtractionPlan } from './plan-validation.ts'
import { retrieveFocusedKnowledge } from './retrieval.ts'

const safeWorkflowId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const defaults = { maxExtractionUnits: 64, maxExtractionAttempts: 2, maxConcurrency: 4 }

function emptyResult(input: RawDocumentKnowledgeIngestionInput, errors: readonly string[] = []): IngestionWorkflowResult { return { workflowRunId: input.workflowRunId, knowledgeBaseId: input.handle.knowledgeBaseId, status: 'blocked', unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], errors } }
function counts(results: readonly ValidatedExtractKnowledgeResult[]): Record<string, number> { return { entity: results.reduce((sum, result) => sum + result.entities.length, 0), relation: results.reduce((sum, result) => sum + result.relations.length, 0), claim: results.reduce((sum, result) => sum + result.claims.length, 0), rejected: results.reduce((sum, result) => sum + result.rejected.length, 0) } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

async function boundedExtract(input: RawDocumentKnowledgeIngestionInput, document: NonNullable<IngestionWorkflowResult['documentId']> extends never ? never : Parameters<RawDocumentKnowledgeIngestionInput['skill']['extractKnowledge']>[0]['document'], reportMap: Parameters<RawDocumentKnowledgeIngestionInput['skill']['extractKnowledge']>[0]['reportMap'], units: readonly AcceptedExtractionUnit[], concurrency: number): Promise<{ results: Array<{ unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }>; summaries: ExtractionUnitSummary[]; errors: string[]; peak: number }> {
  const maxAttempts = input.config?.maxExtractionAttempts ?? defaults.maxExtractionAttempts
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
      for (attempts = 1; attempts <= maxAttempts; attempts += 1) {
        try { result = await input.skill.extractKnowledge({ document, reportMap, unit, instructions: input.instructions }); break } catch (error) { lastError = errorMessage(error) }
      }
      active -= 1
      if (result) {
        results[index] = { unit, result }
        summaries[index] = { unitId: unit.unitId, proposedUnitId: unit.proposedUnitId, attempts, status: 'completed', candidateCounts: { entity: result.entities.length, relation: result.relations.length, claim: result.claims.length }, rejectedCount: result.rejected.length }
      } else {
        summaries[index] = { unitId: unit.unitId, proposedUnitId: unit.proposedUnitId, attempts: Math.max(0, attempts - 1), status: 'failed', candidateCounts: {}, rejectedCount: 0, error: lastError }
        errors.push(`Extraction unit ${unit.unitId} exhausted ${maxAttempts} attempt(s): ${lastError}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, units.length)) }, () => worker()))
  return { results: results.filter((item): item is { unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult } => item !== undefined), summaries: summaries.filter((item): item is ExtractionUnitSummary => item !== undefined), errors, peak }
}

export async function runRawDocumentKnowledgeIngestion(input: RawDocumentKnowledgeIngestionInput): Promise<IngestionWorkflowResult> {
  if (!safeWorkflowId.test(input.workflowRunId)) return emptyResult(input, ['workflowRunId must be a safe deterministic identifier'])
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
    try {
      const replayLog = parseYaml(await readFile(join(handle.rootRef, 'logs', 'ingestion', `${input.workflowRunId}.yaml`), 'utf8'), 'ingestion-log')
      if (isRecord(replayLog) && (replayLog.status === 'completed' || replayLog.status === 'completed_with_review') && typeof replayLog.changeSetId === 'string') {
        const context = isRecord(replayLog.ingestionContext) ? replayLog.ingestionContext : {}
        const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
        const replayStatus = replayLog.status === 'completed_with_review' ? 'completed_with_review' : 'completed'
        return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef: typeof context.rawRef === 'string' ? context.rawRef : undefined, documentId: typeof context.documentId === 'string' ? context.documentId : undefined, status: finalValidation.status === 'failed' ? 'blocked' : replayStatus, unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], changeSetId: replayLog.changeSetId, writeStatus: 'already_committed', baseRevision: Number(replayLog.committedRevision ?? handle.revision), committedRevision: Number(replayLog.committedRevision ?? handle.revision), validationSummary: finalValidation, errors: finalValidation.errors.map((item) => item.message) }
      }
    } catch { /* no prior ingestion log: continue with a new execution */ }
    const acquired = await resolver.acquire(input.documentInput)
    const suppliedMetadata: RawSuppliedMetadata = { title: input.sourceMetadata?.title ?? acquired.filename, institution: input.sourceMetadata?.institution ?? null, author: input.sourceMetadata?.author ?? null, publishedAt: input.sourceMetadata?.publishedAt ?? null, sourceUrl: input.sourceMetadata?.sourceUrl ?? null }
    const raw = await archiveRaw(handle, { bytes: acquired.bytes, originalFilename: acquired.filename, mediaType: acquired.mediaType, suppliedMetadata })
    rawRef = raw.manifest.rawRef
    const archived = await getRaw(handle, rawRef)
    const document = await resolver.parse(acquired)
    documentId = document.documentId
    const planned = await input.skill.understandAndPlan({ document, instructions: input.instructions })
    const capabilities = input.skill.capabilities()
    acceptedPlan = validateExtractionPlan(planned, document, capabilities, { ...input.config, maxExtractionUnits: input.config?.maxExtractionUnits ?? defaults.maxExtractionUnits }, input.instructions)
    const configuredConcurrency = input.config?.maxConcurrency ?? defaults.maxConcurrency
    const extractionConcurrency = Math.min(configuredConcurrency, capabilities.maxConcurrency, acceptedPlan.units.length)
    const extraction = await boundedExtract(input, document, planned.reportMap, acceptedPlan.units, extractionConcurrency)
    unitSummaries = extraction.summaries
    if (extraction.errors.length > 0) return { ...emptyResult(input, extraction.errors), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, extractionConcurrency, peakExtractionConcurrency: extraction.peak, candidateCounts: counts(extraction.results.map((item) => item.result)) }
    const consolidated = consolidateExtractions(extraction.results)
    const assets = await new KnowledgeBaseLoaderV03(registry).load(handle)
    const focused = retrieveFocusedKnowledge(assets, consolidated)
    const reconciliation = await input.skill.reconcileKnowledge({ candidateGroups: focused.groups as readonly ResolvedCandidateGroup[], existingKnowledge: focused.groups.flatMap((group) => group.existingKnowledge ?? []), reportMap: planned.reportMap, sourceAssessment: planned.reportMap.sourceAssessment, instructions: input.instructions })
    const planning = planKnowledgeChangeSet({ knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, workflowRunId: input.workflowRunId, rawRef, rawManifest: archived.manifest, documentId: document.documentId, document: { metadata: document.metadata }, reportMap: planned.reportMap, plan: acceptedPlan, groups: focused.groups as readonly ResolvedCandidateGroup[], decisions: reconciliation.decisions, assets })
    if (!planning.changeSet) return { ...emptyResult(input, ['ChangeSet planning produced no safe ChangeSet']), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    const changeSetValidation = await validateKnowledgeChangeSetV03(handle, planning.changeSet, { mode: 'commit' })
    if (!changeSetValidation.validatedChangeSet) return { ...emptyResult(input, changeSetValidation.report.errors.map((item) => item.message)), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, validationSummary: changeSetValidation.report, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    const write = await writeKnowledgeBaseV03(handle, { receipt: changeSetValidation.validatedChangeSet, registry, clock, stagedStateValidator: async (rootRef) => { const staged = await validateKnowledgeBaseV03(rootRef); if (staged.status === 'failed') throw new Error(staged.errors.map((item) => item.message).join('; ')) } })
    if (write.status === 'rejected' || write.status === 'failed') return { ...emptyResult(input, [write.error?.message ?? `Writer ${write.status}`]), knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, changeSetId: planning.changeSet.changeSetId, writeStatus: write.status, baseRevision: write.baseRevision, committedRevision: write.committedRevision, validationSummary: changeSetValidation.report, extractionConcurrency, peakExtractionConcurrency: extraction.peak }
    handle = await registry.refresh(handle.rootRef)
    const finalValidation = await validateKnowledgeBaseV03(handle.rootRef)
    const actionSummary = Object.fromEntries([...new Set(reconciliation.decisions.map((decision) => decision.action))].sort().map((action) => [action, reconciliation.decisions.filter((decision) => decision.action === action).length]))
    const hasReview = planning.reviewItems.length > 0 || consolidated.rejected.length > 0
    return { workflowRunId: input.workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, rawRef, documentId, status: finalValidation.status === 'failed' ? 'blocked' : hasReview ? 'completed_with_review' : 'completed', acceptedPlan, unitSummaries, candidateCounts: consolidated.candidateCounts, rejectedCandidates: consolidated.rejected, reviewItems: planning.reviewItems, reconciliationSummary: actionSummary, changeSetId: planning.changeSet.changeSetId, writeStatus: write.status, baseRevision: write.baseRevision, committedRevision: write.committedRevision, validationSummary: finalValidation, extractionConcurrency, peakExtractionConcurrency: extraction.peak, errors: finalValidation.errors.map((item) => item.message) }
  } catch (error) {
    return { ...emptyResult(input, [errorMessage(error)]), knowledgeBaseId: handle.knowledgeBaseId, ...(rawRef === undefined ? {} : { rawRef }), ...(documentId === undefined ? {} : { documentId }), ...(acceptedPlan === undefined ? {} : { acceptedPlan }), unitSummaries }
  }
}
