import { createHash } from 'node:crypto'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

export const TASK_ID = 'RHL-M3B-3B-DIAG-004-CODEX-CLI-NATIVE-STRUCTURED-OUTPUT-ISOLATION'
export const BASE_COMMIT = 'e47030644852be3091a2dc7bba913b34907d2c81'
export const MODEL = 'gpt-5.6-luna'
export const EFFORT = 'medium'
export const PROBES = ['A_NO_SCHEMA_JSON_OUTPUT_FILE_CONTROL', 'B_SCHEMA_JSON_OUTPUT_FILE', 'C_SCHEMA_HUMAN_OUTPUT_FILE', 'D_SCHEMA_JSON_NO_OUTPUT_FILE'] as const
export const MAX_REAL_MODEL_CALLS = 4
export type ProbeName = typeof PROBES[number]
export type Classification = 'NATIVE_STRUCTURED_OUTPUT_WORKS' | 'JSON_EVENT_MODE_CONFLICT' | 'OUTPUT_LAST_MESSAGE_CONFLICT' | 'JSON_AND_OUTPUT_FILE_COMBINATION_CONFLICT' | 'LUNA_STRUCTURED_OUTPUT_UNSUPPORTED_OR_SERVER_REJECTED' | 'NATIVE_STRUCTURED_OUTPUT_FAILURE_UNCLASSIFIED' | 'BACKEND_MODEL_UNAVAILABLE' | 'BACKEND_RATE_OR_QUOTA_BLOCKED' | 'BACKEND_SAFETY_OR_POLICY_BLOCKED' | 'BACKEND_TIMEOUT_OR_CANCELLED' | 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' | 'CLI_CAPABILITY_CHANGED' | 'BLOCKED_EXTERNAL_SETUP'
export type NextAction = 'REVIEW_RESEARCHHUB_ADAPTER_INVOCATION_DELTA' | 'IMPLEMENT_NARROW_CODEX_ADAPTER_JSON_EVENT_CHANGE' | 'IMPLEMENT_NARROW_CODEX_ADAPTER_OUTPUT_CAPTURE_CHANGE' | 'IMPLEMENT_NARROW_CODEX_ADAPTER_FLAG_COMBINATION_CHANGE' | 'DESIGN_NON_NATIVE_STRUCTURED_OUTPUT_TRANSPORT' | 'REVIEW_CODEX_RUNTIME_COMPATIBILITY' | 'REVIEW_BACKEND_RUNTIME_FAILURE' | 'EXTERNAL_SETUP_REQUIRED' | 'CLI_CAPABILITY_REVIEW'

export interface Flags { model: boolean; sandbox: boolean; ephemeral: boolean; json: boolean; outputSchema: boolean; outputLastMessage: boolean; skipGitRepoCheck: boolean; workingDirectory: boolean }
export interface ProbeRecord { name: ProbeName; attempted: boolean; processStarted: boolean; exitCode: number | null; exitState: string; durationMs: number; flags: Flags; schemaEnabled: boolean; jsonEventsEnabled: boolean; outputFileEnabled: boolean; model: string; reasoningEffort: string; stdoutSha256: string; stdoutBytes: number; stderrSha256: string; stderrBytes: number; finalOutputSha256: string | null; finalOutputBytes: number; validJson: boolean; schemaSatisfied: boolean; safeFailureClass: string | null; safeProviderCliCode: string | null; externalSetupRequired: boolean }

const root = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(root, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_NATIVE_STRUCTURED_OUTPUT_ISOLATION.json')
const prompt = 'Return exactly one JSON object with status set to ok. This is a harmless schema compatibility diagnostic.'
const schema = { type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'ok' } }, required: ['status'] }
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const safeFlags = (json: boolean, schemaEnabled: boolean, outputFileEnabled: boolean): Flags => ({ model: true, sandbox: true, ephemeral: true, json, outputSchema: schemaEnabled, outputLastMessage: outputFileEnabled, skipGitRepoCheck: true, workingDirectory: true })

export function schemaFingerprint(): { sha256: string; bytes: number } { const serialized = JSON.stringify(schema); return { sha256: hash(serialized), bytes: Buffer.byteLength(serialized) } }

export function parseFinalAssistantEvent(stdout: string): string | null {
  let final: string | null = null
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string; content?: Array<{ type?: string; text?: string }> } }
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') final = event.item.text ?? event.item.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('') ?? null
    } catch { return null }
  }
  return final?.trim() ? final : null
}

export function satisfiesMinimalSchema(value: unknown): boolean { const object = value as Record<string, unknown>; return !!object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === 1 && object.status === 'ok' }

function classifyText(stdout: string, stderr: string): { failure: string; code: string | null; external: boolean } {
  const text = `${stdout}\n${stderr}`.toLowerCase()
  if (/otp|login required|log in|authentication required|unauthorized|not authenticated/.test(text)) return { failure: 'authentication_required', code: null, external: true }
  if (/model.*(not found|unavailable)|unknown model/.test(text)) return { failure: 'model_unavailable', code: null, external: false }
  if (/quota|rate.?limit|too many requests/.test(text)) return { failure: 'rate_or_quota', code: null, external: false }
  if (/safety|policy|refus/.test(text)) return { failure: 'safety_or_policy', code: null, external: false }
  if (/timeout|timed out|cancel/.test(text)) return { failure: 'timeout_or_cancelled', code: null, external: false }
  if (/schema|structured output|json schema/.test(text)) return { failure: 'structured_output_unsupported_for_model', code: null, external: false }
  if (/conflict|incompatible|unknown option|unexpected argument/.test(text)) return { failure: 'cli_flag_conflict', code: null, external: false }
  if (/server|service|transport|network|connect/.test(text)) return { failure: 'transport_or_service', code: null, external: false }
  return { failure: 'unknown_nonzero_exit', code: null, external: false }
}

export function decide(outcomes: readonly ProbeRecord[]): { classification: Classification; nextActionCategory: NextAction; stopReason: string } {
  const a = outcomes.find((x) => x.name === PROBES[0]); const b = outcomes.find((x) => x.name === PROBES[1]); const c = outcomes.find((x) => x.name === PROBES[2]); const d = outcomes.find((x) => x.name === PROBES[3])
  if (!a || !a.attempted) return { classification: 'NATIVE_STRUCTURED_OUTPUT_FAILURE_UNCLASSIFIED', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', stopReason: 'Probe A was not attempted' }
  if (a.externalSetupRequired) return { classification: 'BLOCKED_EXTERNAL_SETUP', nextActionCategory: 'EXTERNAL_SETUP_REQUIRED', stopReason: 'External setup prevented Probe A' }
  if (!a.schemaSatisfied && !a.validJson && a.safeFailureClass && a.safeFailureClass !== 'unknown_nonzero_exit') {
    const map: Record<string, Classification> = { model_unavailable: 'BACKEND_MODEL_UNAVAILABLE', rate_or_quota: 'BACKEND_RATE_OR_QUOTA_BLOCKED', safety_or_policy: 'BACKEND_SAFETY_OR_POLICY_BLOCKED', timeout_or_cancelled: 'BACKEND_TIMEOUT_OR_CANCELLED', transport_or_service: 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' }
    if (map[a.safeFailureClass]) return { classification: map[a.safeFailureClass], nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', stopReason: `Probe A failed: ${a.safeFailureClass}` }
  }
  if (b?.schemaSatisfied) return { classification: 'NATIVE_STRUCTURED_OUTPUT_WORKS', nextActionCategory: 'REVIEW_RESEARCHHUB_ADAPTER_INVOCATION_DELTA', stopReason: 'Probe B returned schema-conformant JSON' }
  if (c?.schemaSatisfied) return { classification: 'JSON_EVENT_MODE_CONFLICT', nextActionCategory: 'IMPLEMENT_NARROW_CODEX_ADAPTER_JSON_EVENT_CHANGE', stopReason: 'Probe C passed after Probe B failed' }
  if (d?.schemaSatisfied) return { classification: 'OUTPUT_LAST_MESSAGE_CONFLICT', nextActionCategory: 'IMPLEMENT_NARROW_CODEX_ADAPTER_OUTPUT_CAPTURE_CHANGE', stopReason: 'Probe D passed after Probes B and C failed' }
  const structured = [b, c, d].every((x) => x?.attempted === true && x.safeFailureClass === 'structured_output_unsupported_for_model')
  if (structured) return { classification: 'LUNA_STRUCTURED_OUTPUT_UNSUPPORTED_OR_SERVER_REJECTED', nextActionCategory: 'DESIGN_NON_NATIVE_STRUCTURED_OUTPUT_TRANSPORT', stopReason: 'All structured forms had the same sanitized structured-output rejection' }
  return { classification: 'NATIVE_STRUCTURED_OUTPUT_FAILURE_UNCLASSIFIED', nextActionCategory: 'REVIEW_CODEX_RUNTIME_COMPATIBILITY', stopReason: 'Structured-output probes failed without consistent attribution' }
}

async function discover(): Promise<string> { const command = process.platform === 'win32' ? 'where.exe' : 'which'; const result = await promisify(execFileCallback)(command, ['codex'], { windowsHide: true, maxBuffer: 8000 }); const found = result.stdout.split(/\r?\n/).map((x) => x.trim()).find(Boolean); if (!found) throw new Error('codex executable not discovered'); return found }
async function metadata(executable: string): Promise<{ version: string; flags: Flags; supported: boolean }> { const version = (await promisify(execFileCallback)(executable, ['--version'], { windowsHide: true, maxBuffer: 8000 })).stdout.trim().split(/\r?\n/)[0] ?? 'unknown'; const help = (await promisify(execFileCallback)(executable, ['exec', '--help'], { windowsHide: true, maxBuffer: 32000 })).stdout; const flags = { model: help.includes('--model'), sandbox: help.includes('--sandbox') && help.includes('read-only'), ephemeral: help.includes('--ephemeral'), json: help.includes('--json'), outputSchema: help.includes('--output-schema'), outputLastMessage: help.includes('--output-last-message') || help.includes(' -o'), skipGitRepoCheck: help.includes('--skip-git-repo-check'), workingDirectory: help.includes(' -C') || help.includes('--cd') } satisfies Flags; return { version, flags, supported: Object.values(flags).every(Boolean) } }

async function runProbe(executable: string, name: ProbeName): Promise<ProbeRecord> {
  const dir = await mkdtemp(join(tmpdir(), 'rhl-diag-004-')); const outputPath = join(dir, 'final-output.txt'); const schemaPath = join(dir, 'schema.json'); const withSchema = name !== PROBES[0]; const json = name !== PROBES[2]; const withOutput = name !== PROBES[3]; const args = ['exec', '--model', MODEL, '-c', `model_reasoning_effort="${EFFORT}"`, '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', dir]; if (withSchema) args.push('--output-schema', schemaPath); if (json) args.push('--json'); if (withOutput) args.push('-o', outputPath); args.push('-'); const started = Date.now(); let stdout = ''; let stderr = ''; let processStarted = false; let exitCode: number | null = null; let exitState = 'not_started'; try { await writeFile(schemaPath, JSON.stringify(schema), { flag: 'wx' }); await new Promise<void>((resolvePromise, reject) => { const child = spawn(executable, args, { cwd: dir, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); child.once('spawn', () => { processStarted = true; exitState = 'started' }); child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data', (x) => { stdout += x }); child.stderr.on('data', (x) => { stderr += x }); child.once('error', reject); child.once('close', (code) => { exitCode = code; exitState = code === 0 ? 'normal_exit' : 'nonzero_exit'; resolvePromise() }); child.stdin.end(prompt) }); let final = ''; try { final = await readFile(outputPath, 'utf8') } catch { final = json ? parseFinalAssistantEvent(stdout) ?? '' : '' } let parsed: unknown = null; let validJson = false; try { parsed = JSON.parse(final); validJson = true } catch {} const safe = exitCode === 0 ? null : classifyText(stdout, stderr); return { name, attempted: true, processStarted, exitCode, exitState, durationMs: Date.now() - started, flags: safeFlags(json, withSchema, withOutput), schemaEnabled: withSchema, jsonEventsEnabled: json, outputFileEnabled: withOutput, model: MODEL, reasoningEffort: EFFORT, stdoutSha256: hash(stdout), stdoutBytes: Buffer.byteLength(stdout), stderrSha256: hash(stderr), stderrBytes: Buffer.byteLength(stderr), finalOutputSha256: final ? hash(final) : null, finalOutputBytes: Buffer.byteLength(final), validJson, schemaSatisfied: validJson && withSchema && satisfiesMinimalSchema(parsed), safeFailureClass: safe?.failure ?? null, safeProviderCliCode: safe?.code ?? null, externalSetupRequired: safe?.external ?? false } } finally { await rm(dir, { recursive: true, force: true }) } }

export async function main(): Promise<void> { const generatedAt = new Date().toISOString(); const fingerprint = schemaFingerprint(); let cliVersion = 'unavailable'; let outcomes: ProbeRecord[] = []; let capability: any = null; let classification: Classification; let nextActionCategory: NextAction; let stopReason = ''; try { const executable = await discover(); capability = await metadata(executable); cliVersion = capability.version; if (!capability.supported) { classification = 'CLI_CAPABILITY_CHANGED'; nextActionCategory = 'CLI_CAPABILITY_REVIEW'; stopReason = 'Required CLI flag support was not present' } else { for (const name of PROBES) { const result = await runProbe(executable, name); outcomes.push(result); if (name === PROBES[0] && (!result.processStarted || result.externalSetupRequired || result.safeFailureClass && result.safeFailureClass !== 'unknown_nonzero_exit')) break; if (result.schemaSatisfied) break } const decision = decide(outcomes); classification = decision.classification; nextActionCategory = decision.nextActionCategory; stopReason = decision.stopReason } } catch (error) { classification = /not discovered|ENOENT/i.test(String(error)) ? 'BLOCKED_EXTERNAL_SETUP' : 'CLI_CAPABILITY_CHANGED'; nextActionCategory = classification === 'BLOCKED_EXTERNAL_SETUP' ? 'EXTERNAL_SETUP_REQUIRED' : 'CLI_CAPABILITY_REVIEW'; stopReason = classification === 'BLOCKED_EXTERNAL_SETUP' ? 'Codex executable was not discovered' : 'CLI metadata checks failed' } const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt, cli: { executable: 'codex', version: cliVersion, capability }, model: MODEL, effort: EFFORT, minimalStrictSchema: fingerprint, actualCallCount: outcomes.filter((x) => x.attempted).length, probes: outcomes, classification, nextActionCategory, stopReason, mutation: { pcbCall: false, industryRequest: false, knowledge: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, productionModelSelection: false, productionAdapter: false, schemaNormalizer: false }, privacy: { rawPrompt: false, rawStdout: false, rawStderr: false, rawJsonl: false, rawFinalModelOutput: false, completeSchema: false, credentials: false, authData: false, privatePaths: false, reasoningTraces: false } }; const { mkdir } = await import('node:fs/promises'); await mkdir(resolve(root, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2)); if (classification === 'BLOCKED_EXTERNAL_SETUP') process.exitCode = 2 }

if (process.argv[1]?.endsWith('codex-cli-native-structured-output-isolation.ts')) void main()
