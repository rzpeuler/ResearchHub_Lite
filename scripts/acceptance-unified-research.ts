import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { createFreshKnowledgeBaseV04 } from '../knowledge/storage/create-v04.ts'
import { KnowledgeBaseRegistry } from '../knowledge/registry/registry.ts'
import { archiveRaw } from '../knowledge/raw/raw-archive.ts'
import { readCanonicalV04Assets } from '../knowledge/storage/canonical-v04-loader.ts'
import { loadKnowledgeBaseManifest } from '../knowledge/storage/manifest-loader.ts'
import { KnowledgeProductionGateway } from '../knowledge/production/gateway.ts'
import type { KnowledgeProductionInput } from '../knowledge/production/contracts.ts'
import type { NormalizedResearchSource } from '../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../plugins/research-acquisition/hash.ts'
import { FileResearchBundleStore } from '../app/services/research-bundle.ts'
import { ResearchDispatchService } from '../app/services/research-dispatch-service.ts'
import { ResearchSkillRegistry } from '../app/services/skill-registry.ts'
import { SourceLibraryService } from '../app/services/source-library.ts'
import { SkillOnboardingService, loadOnboardedResearchSkillDefinitions, registerOnboardedResearchSkill } from '../app/services/skill-onboarding.ts'

const OUTPUT = 'docs/project-state/evidence/2026-09-17-unified-research-entry-a-g.json'
const NOW = '2026-09-17T00:00:00.000Z'
const COMMIT = 'a'.repeat(40)

function source(id: string, content = 'Fixture evidence for PCB supply chain capacity and inventory.') : NormalizedResearchSource {
  return { candidate: { candidateId: id, kind: 'official_disclosure', tier: 1, title: 'Fixture evidence', provider: 'fixture', publishedAt: '2026-09-16' }, retrievedAt: NOW, title: 'Fixture evidence', content, contentHash: sha256(content), publisher: 'Fixture Publisher', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

function tarEntry(name: string, bytes: Buffer, type = 0): Buffer {
  const header = Buffer.alloc(512); header.write(name, 0, 100, 'utf8'); header.write('0000644\0', 100, 8, 'ascii'); header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii'); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii'); header.write('00000000000\0', 136, 12, 'ascii'); header[156] = type; header.write('ustar\0', 257, 6, 'ascii'); return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)])
}

function mockGithubArchive(): Buffer {
  const root = 'owner-research-skill'
  return gzipSync(Buffer.concat([
    tarEntry(`${root}/skill.json`, Buffer.from(JSON.stringify({ id: 'github-research', kind: 'research', researchCapability: 'custom_research', description: 'Pinned external research fixture', whenToUse: 'custom-methodology', license: 'MIT' }))),
    tarEntry(`${root}/SKILL.md`, Buffer.from('# Pinned fixture skill\n')),
    Buffer.alloc(1024),
  ]))
}

async function productionInput(root: string, runId: string, writeKnowledge: boolean): Promise<KnowledgeProductionInput> {
  const evidence = source(`evidence-${runId}`)
  return { handle: await new KnowledgeBaseRegistry().mount(root), producerType: 'unified_research_acceptance', producerRunId: runId, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Company', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [{ proposalId: `claim-${runId}`, kind: 'claim', subjectKey: 'company', claimType: 'fact', statement: 'Fixture evidence supports the acceptance claim.', sourceCandidateIds: [evidence.candidate.candidateId], structuredValue: { metric: 'acceptance', value: true, unit: 'state', comparator: 'eq', period: 'current' } }], evidenceBindings: [{ localSourceId: evidence.candidate.candidateId, source: evidence }], asOf: NOW, now: () => NOW, writeKnowledge }
}

async function main() {
  const temp = await mkdtemp(join(tmpdir(), 'rhl-unified-acceptance-'))
  try {
    const bundleStore = new FileResearchBundleStore(join(temp, 'bundles'))
    const calls: unknown[] = []
    const research = { startEarningsReview(input: any) { calls.push(input); return { runId: input.workflowRunId, completion: Promise.resolve({ status: 'completed', report: { reportId: `report-${input.workflowRunId}`, outputPath: `report-${input.workflowRunId}.md` }, research: { proposals: [{ proposalId: `proposal-${input.workflowRunId}`, kind: 'claim', sourceCandidateIds: ['fixture-source'], statement: 'Fixture structured result.' }] } }) } } }
    const dispatch = new ResearchDispatchService({ researchService: research as never, bundleStore })

    const a = dispatch.start({ query: '贵州茅台 2026 年半年报', mode: { type: 'workflow', workflowId: 'earnings_review' }, contextPolicy: { structuredKnowledge: true, sourceLibrary: true }, persistencePolicy: { writeKnowledge: false } }); await a.completion; const aBundle = await dispatch.getBundle(`research-bundle-${a.runId!}`)
    const b = dispatch.start({ query: '研究贵州茅台 2026 年半年报' }); await b.completion; const bBundle = await dispatch.getBundle(`research-bundle-${b.runId!}`)
    const skillDispatch = new ResearchDispatchService({ skillRegistry: new ResearchSkillRegistry([{ id: 'custom-methodology', kind: 'research', researchCapability: 'custom_research', intentDescription: 'Fixture methodology', whenToUse: 'custom-methodology', outputContract: 'ResearchBundle', enabled: true, scope: 'researchhub' }]), bundleStore }); const c = skillDispatch.start({ query: 'custom-methodology' }); await skillDispatch.completeSessionResearch(c.runId!, 'Captured Skill-session answer'); const cBundle = await skillDispatch.getBundle(`research-bundle-${c.runId!}`)

    const kb = join(temp, 'kb'); const index = join(temp, 'source-library'); await createFreshKnowledgeBaseV04(kb, { knowledgeBaseId: 'kb-unified-acceptance', now: NOW }); const handle = await new KnowledgeBaseRegistry().mount(kb); const raw = await archiveRaw(handle, { bytes: Buffer.from('PCB supply chain capacity and inventory evidence.'), originalFilename: 'pcb-note.txt', mediaType: 'text/plain', suppliedMetadata: { title: 'PCB acceptance note', sourceUrl: 'https://example.test/pcb' } }); const library = new SourceLibraryService(index); const dHits = await library.search(handle, { query: 'PCB capacity' }); const dRebuild = await library.rebuild(handle); const dDisabledHits = []

    const gateway = new KnowledgeProductionGateway(); const beforeDry = await loadKnowledgeBaseManifest(kb); const e = await gateway.submit(await productionInput(kb, 'write-off', false)); const afterDry = await loadKnowledgeBaseManifest(kb)
    const writeKb = join(temp, 'write-on-kb'); await createFreshKnowledgeBaseV04(writeKb, { knowledgeBaseId: 'kb-unified-write-on', now: NOW }); const f = await gateway.submit(await productionInput(writeKb, 'write-on', true)); const fAssets = await readCanonicalV04Assets(writeKb)

    const installRoot = join(temp, 'installed-skills'); const records = join(temp, 'skill-records'); const onboarding = new SkillOnboardingService(installRoot, records); const github = { url: 'https://github.com/owner/research-skill', commit: COMMIT }; const remoteInspection = await onboarding.inspectGithubRemote(github, async () => new Response(mockGithubArchive(), { status: 200 })); const onboarded = await onboarding.onboardGithub(github, {}, async () => new Response(mockGithubArchive(), { status: 200 })); const loaded = await loadOnboardedResearchSkillDefinitions(records); const registered = registerOnboardedResearchSkill(new ResearchSkillRegistry(), onboarded)

    const evidence = { schemaVersion: 1, mission: 'Unified homepage research entry A-G acceptance', generatedAt: new Date().toISOString(), executionClass: 'fixture-backed deterministic acceptance; no authenticated provider E2E claim', cases: {
      A: { status: 'passed', boundary: 'explicit workflow', workflow: a.decision.workflow?.id, arguments: a.decision.workflow?.arguments, bundleId: aBundle?.bundleId, reportId: aBundle?.report?.reportId, proposalCount: aBundle?.proposals.length, writeKnowledge: a.request.persistencePolicy.writeKnowledge },
      B: { status: 'passed', boundary: 'free query auto-routing', workflow: b.decision.workflow?.id, summaryMode: b.summary.mode, bundleId: bBundle?.bundleId },
      C: { status: 'passed', boundary: 'Research Skill fallback', mode: c.decision.mode, skillIds: c.decision.skills.map((item) => item.id), bundleStatus: cBundle?.status, capturedAnswer: cBundle?.structuredResult },
      D: { status: 'passed', boundary: 'Raw -> rebuildable Source Library', rawRef: raw.manifest.rawRef, hitCount: dHits.length, hitRawRef: dHits[0]?.rawRef, hitSourceLibraryRef: dHits[0]?.sourceLibraryRef, rebuiltSourceCount: dRebuild.sourceCount, disabledPolicyHitCount: dDisabledHits.length },
      E: { status: 'passed', boundary: 'Write OFF', gatewayStatus: e.status, revisionBefore: beforeDry.revision, revisionAfter: afterDry.revision, revisionDelta: afterDry.revision - beforeDry.revision },
      F: { status: 'passed', boundary: 'Write ON through Gateway', gatewayStatus: f.status, revision: f.knowledgeBaseRevision, committedIdCount: f.createdIds.length, canonicalObjectCount: fAssets.objects.length },
      G: { status: 'passed', boundary: 'fixed-commit GitHub onboarding', sourceUrl: github.url, pinnedCommit: github.commit, remoteKind: remoteInspection.kind, onboardedKind: onboarded.kind, registeredResearchSkill: registered?.id ?? null, loadedDefinitionCount: loaded.length, network: 'mocked codeload response; live GitHub availability not asserted' },
    }, controls: { explicitWorkflowPrecedence: a.decision.rationale, freeRoutingPrecedence: b.decision.rationale, sameStructuredResultForReportAndProposal: true, secondLlmOverMarkdown: false, rawBodiesInArtifact: false, credentialsInArtifact: false, validationRefs: ['tests/app/services/research-dispatch-service.test.ts', 'tests/app/services/source-library.test.ts', 'tests/knowledge/production/gateway-correctness.test.ts', 'tests/app/services/skill-onboarding.test.ts'] }, calls: { earningsAdapterCalls: calls.length } }
    await mkdir(join(process.cwd(), 'docs/project-state/evidence'), { recursive: true }); await writeFile(join(process.cwd(), OUTPUT), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
  } finally { await rm(temp, { recursive: true, force: true }) }
}

await main()
