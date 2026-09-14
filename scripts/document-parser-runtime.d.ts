export declare const DOCLING_VERSION: string
export declare const MODEL_FAMILIES: readonly string[]
export interface Candidate { executable: string; args: string[]; platform: string }
export interface CommandResult { ok: boolean; stdout: string; stderr: string }
export type Execute = (executable: string, args: string[], options?: { cwd?: string; env?: Record<string, string | undefined> }) => Promise<CommandResult>
export declare function candidatePlan(platform?: string, explicitPython?: string): Candidate[]
export declare function bootstrapPlan(platform?: string, paths?: { venv: string; models: string }, basePython?: Candidate): { venv: { executable: string; args: string[]; systemSitePackages: boolean }; install: { executable: string; args: string[] }; models: { executable: string; args: string[] } }
export declare function preflight(options?: { root?: string; platform?: string; execute?: Execute }): Promise<{ status: string; pythonReady: boolean; dependencyReady: boolean; artifactsReady: boolean; bridgeReady: boolean }>
export declare function setup(options?: { root?: string; platform?: string; explicitPython?: string; execute?: Execute; move?: (source: string, destination: string) => Promise<void> }): Promise<{ status: string; reason?: string; pythonReady?: boolean; dependencyReady?: boolean; artifactsReady?: boolean; bridgeReady?: boolean }>
