import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel, PRIMARY_PRODUCTION_REASONING_MODEL } from '../../app/pi/model-selection.ts'
import { IndustryResearchSkill, parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_MODULES, INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'

export type DiagnosticClassification =
  | 'PRIMARY_PROVIDER_GENERAL_FAILURE' | 'PRIMARY_EXACT_REQUEST_NOW_EXECUTES'
  | 'PRIMARY_TARGET_SENSITIVE_BLOCK' | 'PRIMARY_DESIGN_REQUEST_CLASS_BLOCK'
  | 'PRIMARY_MODEL_COMPATIBILITY_GAP' | 'CROSS_MODEL_DESIGN_REQUEST_BLOCK'
  | 'PRIMARY_REQUEST_NONSAFETY_FAILURE' | 'INCONCLUSIVE_NO_ALTERNATIVE'

export type Observation = { readonly attempted: boolean; readonly outcome: 'success' | 'sensitive' | 'provider_error' | 'timeout' | 'empty' | 'invalid_output' | 'unavailable'; readonly safeCode?: string; readonly targetKind?: string }
export type ClassificationInput = { readonly primaryControl: Observation; readonly primaryExact: Observation; readonly primaryAlternate?: Observation; readonly alternativeModelAvailable: boolean; readonly alternativeControl?: Observation; readonly alternativeExact?: Observation }

export function classifyDiagnostic(input: ClassificationInput): DiagnosticClassification {
  if (input.primaryControl.outcome !== 'success') return 'PRIMARY_PROVIDER_GENERAL_FAILURE'
  if (input.primaryExact.outcome === 'success') return 'PRIMARY_EXACT_REQUEST_NOW_EXECUTES'
  if (input.primaryExact.outcome !== 'sensitive') return 'PRIMARY_REQUEST_NONSAFETY_FAILURE'
  if (input.primaryAlternate?.outcome === 'success') return 'PRIMARY_TARGET_SENSITIVE_BLOCK'
  if (!input.alternativeModelAvailable) return 'INCONCLUSIVE_NO_ALTERNATIVE'
  if (input.alternativeControl?.outcome === 'success' && input.alternativeExact?.outcome === 'success') return 'PRIMARY_MODEL_COMPATIBILITY_GAP'
  if (input.alternativeControl?.outcome === 'success' && input.alternativeExact?.outcome === 'sensitive') return 'CROSS_MODEL_DESIGN_REQUEST_BLOCK'
  return 'PRIMARY_DESIGN_REQUEST_CLASS_BLOCK'
}

const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_INDUSTRY_PI_PROVIDER_DIAGNOSTIC.json')
const taskId = 'RHL-M3B-3B-DIAG-001-PI-PROVIDER-SENSITIVE-ISOLATION'
const baseCommit = 'd22d10a9eef01bbd98e317806857a10cf5f4eb9f'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const size = (value: unknown) => JSON.stringify(value).length
const keys = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).slice(0, 32).sort() : []
const boundedError = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/[A-Za-z]:\\[^\s;,]*/g, '<path>').replace(/(authorization|cookie|api[-_]?key|token|secret)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>').slice(0, 160)

function observationFromError(error: unknown): Observation {
  const message = boundedError(error).toLowerCase()
  if (/timeout|timed out/.test(message)) return { attempted: true, outcome: 'timeout', safeCode: 'timeout' }
  if (/sensitive|finish.?reason/.test(message)) return { attempted: true, outcome: 'sensitive', safeCode: 'finish_reason:sensitive' }
  if (/empty completion|no text/.test(message)) return { attempted: true, outcome: 'empty', safeCode: 'empty_completion' }
  if (/invalid json|not valid json/.test(message)) return { attempted: true, outcome: 'invalid_output', safeCode: 'invalid_json' }
  return { attempted: true, outcome: 'provider_error', safeCode: 'provider_error' }
}

async function captureDesign(): Promise<ReasoningRequest> {
  let captured: ReasoningRequest | undefined
  const design: Record<string, unknown> = { definitionHypothesis: 'A bounded manufacturing industry research plan.', targetKind: 'industry', scope: { included: ['manufacturing economics'], excluded: ['unrelated sectors'] }, moduleQuestions: Object.fromEntries(INDUSTRY_MODULES.map((module) => [module, `Assess ${module}.`])), keyMetrics: ['market structure'], evidenceRequirements: ['public authoritative evidence'], searchTerms: ['PCB Manufacturing'], knownGaps: [], verificationCandidates: [] }
  const executor: ReasoningExecutor = { capabilities: () => ({ maxContextTokens: 128000, maxOutputTokens: 16384, structuredOutputSupport: true, maxConcurrency: 4 }), execute: async (request) => { captured = request; return { operation: request.operation, output: design } } }
  await new IndustryResearchSkill(executor).design({ target: { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board'] }, existingKnowledge: [] })
  if (!captured) throw new Error('Industry Skill did not produce a Design request')
  if (captured.operation !== 'industry_research_design' || JSON.stringify(captured.outputContract) !== JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT)) throw new Error('Captured request shape does not match Industry Design contract')
  return captured
}

function requestSummary(request: ReasoningRequest) {
  return { operation: request.operation, instructionHash: hash(request.instruction), instructionChars: request.instruction.length, inputHash: hash(request.input), inputChars: size(request.input), inputKeys: keys(request.input), outputContractHash: hash(request.outputContract), outputContractChars: size(request.outputContract), outputContractKeys: keys(request.outputContract) }
}

async function call(executor: PiReasoningExecutor, request: ReasoningRequest, kind: 'control' | 'design'): Promise<{ observation: Observation; summary: Record<string, unknown> }> {
  try {
    const result = await executor.execute(request)
    if (kind === 'design') {
      try {
        const parsed = validateIndustryResearchDesign(parseIndustryReasoningObject(result.output))
        return { observation: { attempted: true, outcome: 'success', targetKind: parsed.targetKind }, summary: { outcome: 'success', outputChars: result.rawOutput?.length ?? size(result.output), outputHash: hash(result.rawOutput ?? result.output), validation: 'valid', targetKind: parsed.targetKind } }
      } catch {
        return { observation: { attempted: true, outcome: 'invalid_output', safeCode: 'industry_design_invalid' }, summary: { outcome: 'invalid_output', outputChars: result.rawOutput?.length ?? size(result.output), outputHash: hash(result.rawOutput ?? result.output), validation: 'invalid' } }
      }
    }
    return { observation: { attempted: true, outcome: 'success' }, summary: { outcome: 'success', outputChars: result.rawOutput?.length ?? size(result.output), outputHash: hash(result.rawOutput ?? result.output) } }
  } catch (error) {
    const observation = observationFromError(error)
    return { observation, summary: { outcome: observation.outcome, safeCode: observation.safeCode } }
  }
}

const controlRequest = (): ReasoningRequest => ({ operation: 'understandAndPlan', instruction: 'Return one harmless JSON object with exactly the key status and value ok.', input: { task: 'health_check' }, outputContract: { type: 'object', required: ['status'], properties: { status: { const: 'ok' } }, additionalProperties: false }, metadata: { diagnostic: 'provider-control' } })
const alternateRequest = (request: ReasoningRequest): ReasoningRequest => ({ ...request, input: { ...(request.input as Record<string, unknown>), target: { name: 'Household Appliance Manufacturing' }, existingKnowledge: [] } })

export async function main(): Promise<void> {
  const calls: Array<Record<string, unknown>> = []
  let runtime: ModelRuntime | undefined
  let primaryModelId = `${PRIMARY_PRODUCTION_REASONING_MODEL.providerId}/${PRIMARY_PRODUCTION_REASONING_MODEL.modelId}`
  let alternativeModelId: string | null = null
  let classification: DiagnosticClassification = 'PRIMARY_PROVIDER_GENERAL_FAILURE'
  let nextActionCategory = 'EXTERNAL_PROVIDER_OR_RUNTIME_BLOCK'
  let captured: ReasoningRequest | undefined
  try {
    captured = await captureDesign()
    runtime = await ModelRuntime.create({ authPath: resolve(getAgentDir(), 'auth.json'), modelsPath: resolve(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
    const primary = selectProductionReasoningModel(runtime)
    const primaryExecutor = new PiReasoningExecutor({ modelRuntime: runtime, model: primary as Model<Api>, timeoutMs: 900000, maxOutputChars: 400000 })
    const control = await call(primaryExecutor, controlRequest(), 'control'); calls.push({ order: 1, model: primaryModelId, kind: 'neutral_control', ...control.summary })
    const exact = control.observation.outcome === 'success' ? await call(primaryExecutor, captured, 'design') : { observation: { attempted: false, outcome: 'unavailable' as const }, summary: { outcome: 'not_attempted', reason: 'primary_control_failed' } }
    calls.push({ order: 2, model: primaryModelId, kind: 'exact_pcb_design', ...exact.summary })
    let alternate: { observation: Observation; summary: Record<string, unknown> } | undefined
    if (control.observation.outcome === 'success' && exact.observation.outcome === 'sensitive') { alternate = await call(primaryExecutor, alternateRequest(captured), 'design'); calls.push({ order: 3, model: primaryModelId, kind: 'alternate_target_design', ...alternate.summary }) }
    const available = (runtime.getAvailableSnapshot?.() ?? runtime.getModels()).filter((model) => `${model.provider}/${model.id}` !== primaryModelId).sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`))
    alternativeModelId = available[0] ? `${available[0].provider}/${available[0].id}` : null
    let alternativeControl: { observation: Observation; summary: Record<string, unknown> } | undefined
    let alternativeExact: { observation: Observation; summary: Record<string, unknown> } | undefined
    if (control.observation.outcome === 'success' && exact.observation.outcome === 'sensitive' && available[0]) { const altExecutor = new PiReasoningExecutor({ modelRuntime: runtime, model: available[0] as Model<Api>, timeoutMs: 900000, maxOutputChars: 400000 }); alternativeControl = await call(altExecutor, controlRequest(), 'control'); calls.push({ order: calls.length + 1, model: alternativeModelId, kind: 'alternative_neutral_control', ...alternativeControl.summary }); if (alternativeControl.observation.outcome === 'success') { alternativeExact = await call(altExecutor, captured, 'design'); calls.push({ order: calls.length + 1, model: alternativeModelId, kind: 'alternative_exact_pcb_design', ...alternativeExact.summary }) } }
    classification = classifyDiagnostic({ primaryControl: control.observation, primaryExact: exact.observation, primaryAlternate: alternate?.observation, alternativeModelAvailable: Boolean(available[0]), alternativeControl: alternativeControl?.observation, alternativeExact: alternativeExact?.observation })
    nextActionCategory = classification === 'PRIMARY_EXACT_REQUEST_NOW_EXECUTES' ? 'RERUN_FULL_GATE_NO_PRODUCTION_CHANGE' : classification === 'PRIMARY_MODEL_COMPATIBILITY_GAP' ? 'REVIEW_PRODUCTION_MODEL_SELECTION' : classification === 'CROSS_MODEL_DESIGN_REQUEST_BLOCK' || classification === 'PRIMARY_DESIGN_REQUEST_CLASS_BLOCK' || classification === 'PRIMARY_TARGET_SENSITIVE_BLOCK' ? 'REVIEW_DESIGN_REQUEST_BOUNDARY' : classification === 'PRIMARY_REQUEST_NONSAFETY_FAILURE' ? 'REVIEW_NONSAFETY_MODEL_OUTPUT' : 'EXTERNAL_PROVIDER_OR_RUNTIME_BLOCK'
  } catch (error) { calls.push({ order: calls.length + 1, kind: 'setup', outcome: 'unavailable', safeCode: boundedError(error) }) }
  const evidence = { taskId, baseCommit, generatedAt: new Date().toISOString(), primaryProductionModelId: primaryModelId, alternativeModelAvailable: alternativeModelId !== null, alternativeModelId, request: captured ? requestSummary(captured) : null, alternateRequest: captured ? requestSummary(alternateRequest(captured)) : null, calls, classification, nextActionCategory, canonicalMutation: { performed: false, knowledgeBase: false, gateway: false, writer: false, researchReport: false, graph: false }, privacy: { completeRequestsPersisted: false, promptsPersisted: false, modelOutputsPersisted: false, credentialsPersisted: false, privatePathsPersisted: false } }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence, null, 2)); await Promise.resolve((runtime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined)
}

if (process.argv[1]?.endsWith('industry-research-pi-provider-diagnostic.ts')) await main()
