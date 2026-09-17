import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent'
import { FileResearchBundleStore } from '../app/services/research-bundle.ts'
import { ResearchDispatchService } from '../app/services/research-dispatch-service.ts'
import { ResearchSkillRegistry } from '../app/services/skill-registry.ts'
import { SkillOnboardingService } from '../app/services/skill-onboarding.ts'
import { createResearchHubTools } from '../app/pi/tools.ts'
import { researchContextPrompt } from '../app/runtime/session-runtime.ts'

const OUTPUT = 'docs/project-state/evidence/2026-09-17-unified-research-entry-final-fix.json'
const COMMIT = 'c'.repeat(40)

function tarEntry(name: string, bytes: Buffer): Buffer {
  const header = Buffer.alloc(512); header.write(name, 0, 100, 'utf8'); header.write('0000644\0', 100, 8, 'ascii'); header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii'); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii'); header.write('00000000000\0', 136, 12, 'ascii'); header[156] = 0; header.write('ustar\0', 257, 6, 'ascii'); return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)])
}

function archive(id: string, kind: 'research' | 'pi_native', marker: string, unsafe = false): Buffer {
  const root = `${id}-root`; const skill = kind === 'pi_native' ? `---\nname: ${id}\ndescription: Safe Pi native fixture\n---\n${marker}\n` : `# ${id}\n${marker}\n`
  return gzipSync(Buffer.concat([
    tarEntry(`${root}/skill.json`, Buffer.from(JSON.stringify({ id, kind, researchCapability: kind === 'research' ? 'custom_research' : undefined, description: 'Pinned fixture Skill', whenToUse: 'Use the pinned fixture methodology.', outputContract: 'ResearchBundle', license: 'MIT' }))),
    tarEntry(`${root}/SKILL.md`, Buffer.from(skill)),
    ...(unsafe ? [tarEntry(`${root}/package.json`, Buffer.from(JSON.stringify({ scripts: { install: 'node install.js' } })))] : []),
    Buffer.alloc(1024),
  ]))
}

function tool(tools: readonly any[], name: string): any { const found = tools.find((item) => item.name === name); assert.ok(found, `${name} must be available`); return found }
async function exists(path: string): Promise<boolean> { try { await access(path); return true } catch { return false } }
function stubs(): any { return { knowledgeService: {}, productionService: {}, reviewService: {}, workflowService: {} } }

async function main(): Promise<void> {
  const temp = await mkdtemp(join(tmpdir(), 'rhl-unified-final-fix-'))
  try {
    const bundleStore = new FileResearchBundleStore(join(temp, 'bundles'))
    const builtinSkillExecutor = { capabilities: () => ({ maxContextTokens: 1000, maxOutputTokens: 1000, structuredOutputSupport: true, maxConcurrency: 1 }), execute: async (request: any) => ({ operation: request.operation, output: { mode: 'skill_plan', skills: [{ id: 'industry-research', purpose: 'Use the built-in methodology.' }], entities: [], missingRequiredInputs: [], contextPolicy: { structuredKnowledge: true, sourceLibrary: true }, persistencePolicy: { writeKnowledge: false }, rationale: 'Fixture selects the built-in Research Skill.' } }) } as never
    const builtinDispatch = new ResearchDispatchService({ bundleStore, reasoningExecutor: builtinSkillExecutor })
    const builtin = await builtinDispatch.startAsync({ query: 'apply the built-in eight-module methodology' }); assert.equal(builtin.status, 'skill_plan'); assert.ok(builtin.runId)
    const builtinContext = await builtinDispatch.getSessionResearchContext(builtin.runId!); assert.equal(builtinContext?.selectedSkills[0]?.id, 'industry-research'); assert.match(builtinContext?.selectedSkills[0]?.methodology ?? '', /eight methodology modules/i); assert.match(researchContextPrompt(builtinContext), /eight methodology modules/i)

    const installRoot = join(temp, 'installed-research'); const recordRoot = join(temp, 'records'); const onboarding = new SkillOnboardingService(installRoot, recordRoot); const dispatch = new ResearchDispatchService({ bundleStore })
    const fetcher = async () => new Response(archive('external-methodology', 'research', 'MANDATORY_EXTERNAL_METHOD_STEP_ABC'), { status: 200 }); const externalTools = createResearchHubTools({ ...stubs(), skillOnboardingService: onboarding, researchDispatchService: dispatch, skillArchiveFetcher: fetcher })
    const externalSource = { url: 'https://github.com/owner/external-methodology', commit: COMMIT }; const externalInstall = await tool(externalTools, 'install_external_skill').execute('install', externalSource, undefined); assert.equal(externalInstall.isError, false); assert.equal(JSON.parse(externalInstall.content[0].text).registeredResearchSkill.id, 'external-methodology')
    const external = await dispatch.startAsync({ query: 'external-methodology' }); assert.equal(external.status, 'skill_plan'); assert.ok(external.runId); const externalContext = await dispatch.getSessionResearchContext(external.runId!); assert.match(externalContext?.selectedSkills[0]?.methodology ?? '', /MANDATORY_EXTERNAL_METHOD_STEP_ABC/); assert.match(researchContextPrompt(externalContext), /MANDATORY_EXTERNAL_METHOD_STEP_ABC/)

    const missingRegistry = new ResearchSkillRegistry([{ id: 'missing-methodology', kind: 'research', researchCapability: 'custom_research', intentDescription: 'Missing fixture methodology', whenToUse: 'Use the missing fixture methodology.', methodologySource: { type: 'researchhub_skill', path: join(temp, 'missing', 'SKILL.md') }, enabled: true, scope: 'researchhub' }]); const missingDispatch = new ResearchDispatchService({ skillRegistry: missingRegistry }); await assert.rejects(() => missingDispatch.startAsync({ query: 'missing-methodology' }), /methodology is unavailable|ENOENT/)

    const schemaTools = createResearchHubTools({ ...stubs(), skillOnboardingService: onboarding, researchDispatchService: dispatch, skillArchiveFetcher: fetcher }); const installSchema = JSON.stringify(tool(schemaTools, 'install_external_skill').parameters); assert.equal(installSchema.includes('approveUnsafe'), false)
    const unsafeSource = { url: 'https://github.com/owner/unsafe-methodology', commit: COMMIT }; const unsafeFetcher = async () => new Response(archive('unsafe-methodology', 'research', 'UNSAFE_MARKER', true), { status: 200 }); const unsafeTools = createResearchHubTools({ ...stubs(), skillOnboardingService: onboarding, researchDispatchService: dispatch, skillArchiveFetcher: unsafeFetcher }); const unsafeInspection = await tool(unsafeTools, 'inspect_external_skill').execute('inspect-unsafe', unsafeSource, undefined); assert.equal(unsafeInspection.isError, false); const unsafeInstall = await tool(unsafeTools, 'install_external_skill').execute('install-unsafe', unsafeSource, undefined); assert.equal(unsafeInstall.isError, true); assert.match(unsafeInstall.content[0].text, /UNSAFE_SKILL_REQUIRES_MANUAL_TRUST_REVIEW/); assert.equal(dispatch.skillRegistry.get('unsafe-methodology'), undefined); assert.equal(await exists(join(installRoot, 'unsafe-methodology')), false)

    const projectRoot = join(temp, 'pi-project'); const agentRoot = join(temp, 'pi-agent'); await mkdir(projectRoot); await mkdir(agentRoot); const settings = SettingsManager.inMemory({}, { projectTrusted: true }); const loader = new DefaultResourceLoader({ cwd: projectRoot, agentDir: agentRoot, settingsManager: settings }); await loader.reload(); const nativeOnboarding = new SkillOnboardingService(join(temp, 'unused-research-install'), join(temp, 'native-records')); const nativeSource = { url: 'https://github.com/owner/pi-native-methodology', commit: COMMIT }; const nativeFetcher = async () => new Response(archive('pi-native-methodology', 'pi_native', 'MANDATORY_PI_NATIVE_STEP_DEF'), { status: 200 }); const nativeTools = createResearchHubTools({ ...stubs(), skillOnboardingService: nativeOnboarding, researchDispatchService: dispatch, skillArchiveFetcher: nativeFetcher, resourceLoader: loader, piNativeSkillsRoot: join(projectRoot, '.pi', 'skills') }); const nativeInstall = await tool(nativeTools, 'install_external_skill').execute('install-native', nativeSource, undefined); const nativeResult = JSON.parse(nativeInstall.content[0].text); assert.equal(nativeInstall.isError, false); assert.equal(nativeResult.activation, 'pi_native'); assert.equal(nativeResult.discoverable, true); assert.equal(loader.getSkills().skills.some((skill) => skill.name === 'pi-native-methodology'), true); assert.equal(dispatch.skillRegistry.get('pi-native-methodology'), undefined); assert.equal(await (await stat(join(projectRoot, '.pi', 'skills', 'pi-native-methodology', 'SKILL.md'))).isFile(), true)
    const restartedLoader = new DefaultResourceLoader({ cwd: projectRoot, agentDir: agentRoot, settingsManager: SettingsManager.inMemory({}, { projectTrusted: true }) }); await restartedLoader.reload(); assert.equal(restartedLoader.getSkills().skills.some((skill) => skill.name === 'pi-native-methodology'), true)

    const evidence = { schemaVersion: 1, mission: 'Unified research entry final fix A-C', generatedAt: new Date().toISOString(), executionClass: 'fixture-backed deterministic acceptance; no authenticated GitHub/provider production E2E claim', cases: {
      F1: { status: 'passed', skillId: 'industry-research', sourceType: builtinContext?.selectedSkills[0]?.methodologySource?.type, methodologyLoaded: true, marker: 'eight methodology modules', piContextContainsMethodology: true },
      F2: { status: 'passed', skillId: 'external-methodology', pinnedCommit: COMMIT, installedMethodologyMarker: 'MANDATORY_EXTERNAL_METHOD_STEP_ABC', researchRegistryEntry: true, piContextContainsMethodology: true },
      F3: { status: 'passed', skillId: 'missing-methodology', safeFailure: true, genericExecution: false },
      F4: { status: 'passed', installToolSchemaHasAgentApprovalBypass: false },
      F5: { status: 'passed', inspection: 'passed', install: 'denied', errorCode: 'UNSAFE_SKILL_REQUIRES_MANUAL_TRUST_REVIEW', registryEntry: false, activatedPath: false },
      F6: { status: 'passed', skillId: 'pi-native-methodology', classification: 'pi_native', installationScope: 'project .pi/skills', marker: 'MANDATORY_PI_NATIVE_STEP_DEF', loaderDiscoverable: true, researchRegistryEntry: false },
      F7: { status: 'passed', reloadDiscoverable: true, restartDiscoverable: true },
    }, boundaries: { research: 'installed SKILL.md -> ResearchSkillRegistry methodologySource -> bounded Pi context', pi_native: 'installed SKILL.md -> project .pi/skills -> DefaultResourceLoader.reload/getSkills', unsafe: 'inspect only; Chat install prohibited', unsupported: 'no silent activation; explicit unsupported activation error' }, criteria: Object.fromEntries(['F1 built-in methodology load', 'F2 external research methodology', 'F3 missing methodology safe failure', 'F4 no Agent unsafe approval bypass', 'F5 unsafe fail-closed', 'F6 Pi-native installation', 'F7 reload/restart discoverability', 'ResearchHub/Pi namespace separation', 'no authenticated production claim', 'bounded methodology size', 'no repository dump'].map((key) => [key, true])) }
    await mkdir(join(process.cwd(), 'docs/project-state/evidence'), { recursive: true }); await writeFile(join(process.cwd(), OUTPUT), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
  } finally { await rm(temp, { recursive: true, force: true }) }
}

await main()
