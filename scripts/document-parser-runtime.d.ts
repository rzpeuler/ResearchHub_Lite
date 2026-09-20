export declare const DOCLING_VERSION: string
export declare const CPU_TORCH_INDEX: string
export declare const CPU_TORCH_PACKAGES: readonly string[]
export declare const MODEL_FAMILIES: readonly string[]
export declare const STAGE_TIMEOUTS: Readonly<Record<'basePythonProbe' | 'venvCreation' | 'pipInstall' | 'dependencyVerify' | 'modelDownload' | 'bridgeSmoke' | 'finalVerification', number>>
export declare const SETUP_STAGES: readonly ['PRECHECK', 'BASE_PYTHON_PROBE', 'VENV_CREATE', 'PIP_INSTALL', 'DEPENDENCY_VERIFY', 'MODEL_DOWNLOAD', 'BRIDGE_SMOKE', 'PROMOTION', 'FINAL_VERIFY', 'READY']
export interface Candidate { executable: string; args: string[]; platform: string }
export interface CommandResult { ok: boolean; stdout: string; stderr: string; timedOut?: boolean }
export interface CommandOptions { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number }
export type Execute = (executable: string, args: string[], options?: CommandOptions) => Promise<CommandResult>
export declare function runCommand(executable: string, args: string[], options?: CommandOptions): Promise<CommandResult>
export interface SetupTimeouts { basePythonProbe?: number; venvCreation?: number; pipInstall?: number; dependencyVerify?: number; modelDownload?: number; bridgeSmoke?: number; finalVerification?: number }
export interface SetupResult { status: string; reason?: string; pythonReady?: boolean; dependencyReady?: boolean; artifactsReady?: boolean; bridgeReady?: boolean }
export type SetupStage = typeof SETUP_STAGES[number]
export type SetupTelemetryStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT'
export interface SetupTelemetry { schemaVersion: 1; attemptId: string; stage: SetupStage; status: SetupTelemetryStatus; lastCompletedStage: SetupStage | null; reason?: string; elapsedBucket: 'LT_1S' | '1_5S' | '5_30S' | '30_120S' | 'GTE_120S'; updatedAt: string }
export declare function candidatePlan(platform?: string, explicitPython?: string): Candidate[]
export declare function bootstrapPlan(platform?: string, paths?: { venv: string; models: string }, basePython?: Candidate): { venv: { executable: string; args: string[]; systemSitePackages: boolean }; install: { executable: string; args: string[] }; models: { executable: string; args: string[] } }
export declare function preflight(options?: { root?: string; platform?: string; execute?: Execute }): Promise<SetupResult>
export declare function setup(options?: { root?: string; platform?: string; explicitPython?: string; execute?: Execute; move?: (source: string, destination: string) => Promise<void>; timeouts?: SetupTimeouts }): Promise<SetupResult>
