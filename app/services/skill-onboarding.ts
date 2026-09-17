import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { ResearchSkillDefinition, ResearchSkillRegistry } from './skill-registry.ts'

export type OnboardedSkillKind = 'pi_native' | 'research' | 'knowledge' | 'utility' | 'unsupported' | 'unsafe'
export interface SkillOnboardingInspection {
  readonly id: string
  readonly sourcePath: string
  readonly kind: OnboardedSkillKind
  readonly license?: string
  readonly dependencies: readonly string[]
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
  readonly provenance: { readonly source: string; readonly pinnedCommit?: string }
  readonly manifest: Readonly<Record<string, unknown>>
}
export interface SkillOnboardingRecord extends SkillOnboardingInspection { readonly installedPath?: string; readonly installedAt?: string }
export interface GithubSkillSource { readonly url: string; readonly commit: string }

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const COMMIT = /^[0-9a-f]{40}$/i
const KIND_SET = new Set<OnboardedSkillKind>(['pi_native', 'research', 'knowledge', 'utility', 'unsupported', 'unsafe'])
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function idOf(value: unknown): string { if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new TypeError('Skill id must be safe'); return value }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }

export class SkillOnboardingService {
  constructor(private readonly installRoot: string, private readonly recordRoot: string) {}

  async inspectDirectory(sourcePath: string, provenance: { readonly source?: string; readonly pinnedCommit?: string } = {}): Promise<SkillOnboardingInspection> {
    const root = resolve(sourcePath); const files = await readdir(root, { recursive: true }) as string[]; const packagePath = join(root, 'package.json'); let packageJson: Record<string, unknown> = {}
    try { const parsed = JSON.parse(await readFile(packagePath, 'utf8')); if (record(parsed)) packageJson = parsed } catch { /* a package is optional */ }
    const manifestPath = files.find((file) => basename(file).toLowerCase() === 'skill.json')
    let manifest: Record<string, unknown> = packageJson
    if (manifestPath) { try { const parsed = JSON.parse(await readFile(join(root, manifestPath), 'utf8')); if (record(parsed)) manifest = parsed } catch { /* invalid manifest is reported below */ } }
    const id = idOf(manifest.id ?? basename(root)); const dependencies = Object.keys(record(packageJson.dependencies) ? packageJson.dependencies : {}).sort(); const scripts = record(packageJson.scripts) ? Object.keys(packageJson.scripts) : []
    const warnings: string[] = []; const errors: string[] = []; if (!files.some((file) => basename(file).toLowerCase() === 'skill.md')) warnings.push('SKILL.md is missing')
    if (scripts.some((name) => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))) errors.push('package lifecycle scripts require review')
    if (files.some((file) => /(^|[\\/])(?:\.env|id_rsa|credentials\.json)$/i.test(file))) errors.push('secret-like file is present')
    if (files.some((file) => /(^|[\\/])\.pi([\\/]|$)/i.test(file))) warnings.push('Pi-native content is present')
    const declaredKind = text(manifest.kind); const kind = errors.length ? 'unsafe' : declaredKind !== undefined && KIND_SET.has(declaredKind as OnboardedSkillKind) ? declaredKind as OnboardedSkillKind : files.some((file) => /(^|[\\/])\.pi([\\/]|$)/i.test(file)) ? 'pi_native' : text(manifest.researchCapability) !== undefined ? 'research' : 'unsupported'
    const license = text(manifest.license) ?? text(packageJson.license) ?? (files.some((file) => /^license(?:\.|$)/i.test(basename(file))) ? 'detected-license-file' : undefined)
    if (license === undefined) warnings.push('license is not declared')
    return { id, sourcePath: root, kind, ...(license === undefined ? {} : { license }), dependencies, warnings, errors, provenance: { source: provenance.source ?? root, ...(provenance.pinnedCommit === undefined ? {} : { pinnedCommit: provenance.pinnedCommit }) }, manifest }
  }

  async onboardDirectory(sourcePath: string, options: { readonly source?: string; readonly pinnedCommit?: string; readonly approveUnsafe?: boolean } = {}): Promise<SkillOnboardingRecord> {
    const inspection = await this.inspectDirectory(sourcePath, options); if (inspection.kind === 'unsafe' && options.approveUnsafe !== true) throw new Error(`Unsafe Skill ${inspection.id} requires explicit approval`); if (inspection.kind === 'unsupported') throw new Error(`Unsupported Skill kind: ${inspection.id}`)
    const installedPath = resolve(this.installRoot, inspection.id); await mkdir(this.installRoot, { recursive: true }); await cp(inspection.sourcePath, installedPath, { recursive: true, force: false }); const record: SkillOnboardingRecord = { ...inspection, installedPath, installedAt: new Date().toISOString() }; await mkdir(this.recordRoot, { recursive: true }); await writeFile(join(resolve(this.recordRoot), `${inspection.id}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8'); return record
  }

  inspectGithub(source: GithubSkillSource): SkillOnboardingInspection {
    const parsed = new URL(source.url); if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') throw new TypeError('GitHub Skill source must be an https://github.com URL'); if (!COMMIT.test(source.commit)) throw new TypeError('GitHub Skill onboarding requires a 40-character pinned commit')
    const parts = parsed.pathname.split('/').filter(Boolean); if (parts.length < 2) throw new TypeError('GitHub Skill URL must identify an owner and repository')
    return { id: idOf(`${parts[0]}-${parts[1].replace(/\.git$/, '')}`), sourcePath: source.url, kind: 'unsupported', dependencies: [], warnings: ['Remote source requires local inspection before installation'], errors: [], provenance: { source: source.url, pinnedCommit: source.commit }, manifest: { owner: parts[0], repository: parts[1].replace(/\.git$/, '') } }
  }
}

export function registerOnboardedResearchSkill(registry: ResearchSkillRegistry, record: SkillOnboardingRecord): ResearchSkillDefinition | undefined {
  if (record.kind !== 'research') return undefined
  const definition: ResearchSkillDefinition = { id: record.id, kind: 'research', ...(typeof record.manifest.researchCapability === 'string' ? { researchCapability: record.manifest.researchCapability } : {}), intentDescription: text(record.manifest.description) ?? `External Research Skill ${record.id}`, whenToUse: text(record.manifest.whenToUse) ?? `Use the approved external Research Skill ${record.id}.`, outputContract: text(record.manifest.outputContract) ?? 'ResearchBundle', enabled: true, scope: 'researchhub' }
  registry.register(definition); return definition
}

export async function loadOnboardedResearchSkillDefinitions(recordRoot: string): Promise<readonly ResearchSkillDefinition[]> {
  let names: string[]
  try { names = await readdir(resolve(recordRoot)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  const definitions: ResearchSkillDefinition[] = []
  for (const name of names.filter((item) => item.endsWith('.json')).sort()) {
    try { const value = JSON.parse(await readFile(join(resolve(recordRoot), name), 'utf8')) as SkillOnboardingRecord; const definition = value.kind === 'research' ? { id: value.id, kind: 'research' as const, ...(typeof value.manifest.researchCapability === 'string' ? { researchCapability: value.manifest.researchCapability } : {}), intentDescription: text(value.manifest.description) ?? `External Research Skill ${value.id}`, whenToUse: text(value.manifest.whenToUse) ?? `Use the approved external Research Skill ${value.id}.`, outputContract: text(value.manifest.outputContract) ?? 'ResearchBundle', enabled: true, scope: 'researchhub' as const } : undefined; if (definition) definitions.push(definition) } catch { /* malformed onboarding records remain excluded */ }
  }
  return definitions
}
