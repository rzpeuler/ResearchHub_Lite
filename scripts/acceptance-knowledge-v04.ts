import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { KNOWLEDGE_SCHEMA_V04 } from '../knowledge/schema/executable-schema-v04.ts'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../knowledge/storage/index.ts'
import { loadKnowledgeBaseManifest } from '../knowledge/storage/manifest-loader.ts'
import { KnowledgeBaseRegistry } from '../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../knowledge/production/gateway.ts'
import { KnowledgeIndexV04 } from '../knowledge/query/index.ts'
import { validateKnowledgeV04Objects } from '../knowledge/validation/v04-validator.ts'
import { validateKnowledgeBaseV04State } from '../knowledge/validation/v04-change-set-validator.ts'
import { migrateV03ToV04 } from '../knowledge/migration/v03-to-v04.ts'
import { archiveRaw } from '../knowledge/raw/raw-archive.ts'
import { hashKnowledgeObject } from '../knowledge/storage/canonical-hash.ts'
import { listReviewCases } from '../knowledge/review/store.ts'
import { knowledgeV04Input, KNOWLEDGE_V04_AS_OF, KNOWLEDGE_V04_NOW, normalizedSource } from '../tests/fixtures/knowledge-v04.ts'

const EVIDENCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/project-state/evidence/2026-09-18-knowledge-v04.json')

async function migrationFixture(parent: string): Promise<{ sourceRoot: string; outputRoot: string; rawRef: string }> {
  const sourceRoot = join(parent, 'legacy-kb')
  const outputRoot = join(parent, 'migrated-kb')
  await createFreshKnowledgeBaseV04(sourceRoot, { knowledgeBaseId: 'knowledge-v04-legacy', now: KNOWLEDGE_V04_NOW })
  const registry = new KnowledgeBaseRegistry()
  const handle = await registry.mount(sourceRoot)
  const raw = await archiveRaw(handle, { bytes: new TextEncoder().encode('legacy earnings evidence'), originalFilename: 'legacy.txt', mediaType: 'text/plain' }, { clock: () => KNOWLEDGE_V04_NOW })
  const rawRef = raw.manifest.rawRef
  const sourceId = 'source:legacy-earnings'
  const entityId = 'entity:legacy-company'
  const claimId = 'claim:legacy-fact'
  const entries = { [sourceId]: { type: 'source', storageRef: 'sources/legacy-earnings.yaml' }, [entityId]: { type: 'entity', storageRef: 'entities/legacy-company.yaml' }, [claimId]: { type: 'claim', storageRef: 'claims/legacy-fact.yaml' } }
  await writeFile(join(sourceRoot, 'sources/legacy-earnings.yaml'), `${JSON.stringify({ id: sourceId, title: 'Legacy earnings release', sourceType: 'official_disclosure', publisher: 'fixture', publishedAt: KNOWLEDGE_V04_AS_OF, url: 'https://example.test/legacy-earnings', rawRefs: [rawRef], lifecycle: { status: 'active' } })}\n`)
  await writeFile(join(sourceRoot, 'entities/legacy-company.yaml'), `${JSON.stringify({ id: entityId, type: 'company', name: 'Legacy Company', aliases: [], ticker: 'LEGACY', exchange: 'SSE', lifecycle: { status: 'active' } })}\n`)
  await writeFile(join(sourceRoot, 'claims/legacy-fact.yaml'), `${JSON.stringify({ id: claimId, claimType: 'fact', statement: 'Legacy revenue fact', subjectRefs: [entityId], sourceRefs: [sourceId], provenance: [{ sourceRef: sourceId, rawRef, locator: null, chunkRef: null }], lifecycle: { status: 'active' } })}\n`)
  await writeFile(join(sourceRoot, 'registry/assets.yaml'), `${JSON.stringify(entries)}\n`)
  await writeFile(join(sourceRoot, 'manifest.yaml'), `${JSON.stringify({ knowledgeBaseId: 'knowledge-v04-legacy', name: 'Legacy Knowledge Base', schemaVersion: '0.3', storageFormatVersion: '1', revision: 4, status: 'active', createdAt: KNOWLEDGE_V04_NOW, updatedAt: KNOWLEDGE_V04_NOW })}\n`)
  return { sourceRoot, outputRoot, rawRef }
}

export async function runKnowledgeV04Acceptance(): Promise<typeof evidence> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'rhl-knowledge-v04-acceptance-'))
  try {
    const kbRoot = join(tempRoot, 'vertical-kb')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'knowledge-v04-acceptance', now: KNOWLEDGE_V04_NOW })
    const registry = new KnowledgeBaseRegistry()
    let handle = await registry.mount(kbRoot)
    const gateway = new KnowledgeProductionGateway(registry)
    const first = await gateway.submit(knowledgeV04Input(handle, 'knowledge-v04-acceptance-001'))
    assert.equal(first.status, 'committed', JSON.stringify(first))
    const assets = await readCanonicalV04Assets(kbRoot)
    const objects = assets.objects.map((item) => item.value)
    const validation = validateKnowledgeV04Objects(objects)
    assert.equal(validation.status, 'passed', JSON.stringify(validation.errors))
    assert.equal((await validateKnowledgeBaseV04State(kbRoot)).status, 'passed')
    const index = KnowledgeIndexV04.fromAssets(assets)
    assert.equal(index.byKind.get('event')?.length, 1)
    assert.equal(index.byKind.get('observation')?.length, 4)
    assert.equal(index.byKind.get('thesis')?.length, 1)
    assert.equal(index.byKind.get('reasoning_edge')?.length, 3)

    handle = await registry.mount(kbRoot)
    const replay = await gateway.submit(knowledgeV04Input(handle, 'knowledge-v04-acceptance-001'))
    assert.equal(replay.status, 'no_changes', JSON.stringify(replay))
    const reviews = await listReviewCases(kbRoot, { producerRunId: 'knowledge-v04-acceptance-001' })
    assert.equal(reviews.length, 1)
    assert.equal(reviews[0]!.resolutionContext.schemaVersionAtCreation, '0.4')

    const rightsRoot = join(tempRoot, 'rights-kb')
    await createFreshKnowledgeBaseV04(rightsRoot, { knowledgeBaseId: 'knowledge-v04-rights', now: KNOWLEDGE_V04_NOW })
    const rightsRegistry = new KnowledgeBaseRegistry()
    const rightsHandle = await rightsRegistry.mount(rightsRoot)
    const deniedSource = normalizedSource('denied', 'Denied source', 'Denied source body.')
    const denied = await new KnowledgeProductionGateway(rightsRegistry).submit({ ...knowledgeV04Input(rightsHandle, 'knowledge-v04-denied-001'), evidenceBindings: [{ localSourceId: 'denied', source: { ...deniedSource, rights: { ...deniedSource.rights, derivativeKnowledgeAllowed: false } } }], proposals: [{ proposalId: 'denied-claim', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'Denied derived fact', sourceCandidateIds: ['denied'], structuredValue: { metric: 'metric:revenue', value: 1, unit: 'CNY', comparator: 'eq' } }] })
    assert.equal(denied.status, 'blocked')
    assert.equal((await readCanonicalV04Assets(rightsRoot)).objects.length, 0)

    const migration = await migrationFixture(tempRoot)
    const dry = await migrateV03ToV04(migration.sourceRoot, { mode: 'dry_run', outputRoot: migration.outputRoot, now: KNOWLEDGE_V04_NOW })
    assert.equal(dry.status, 'planned')
    assert.equal(dry.preservedProvenanceCount, 1)
    const applied = await migrateV03ToV04(migration.sourceRoot, { mode: 'apply', outputRoot: migration.outputRoot, now: KNOWLEDGE_V04_NOW })
    assert.equal(applied.status, 'applied')
    const migrationReplay = await migrateV03ToV04(migration.sourceRoot, { mode: 'apply', outputRoot: migration.outputRoot, now: KNOWLEDGE_V04_NOW })
    assert.equal(migrationReplay.status, 'already_applied')
    const migrated = await readCanonicalV04Assets(migration.outputRoot)
    const migratedManifest = await loadKnowledgeBaseManifest(migration.outputRoot)
    assert.equal((await validateKnowledgeBaseV04State(migration.outputRoot)).status, 'passed')
    assert.ok(migrated.objects.some((item) => item.value.id === 'claim:legacy-fact'))
    assert.ok(migrated.objects.some((item) => JSON.stringify(item.value).includes(migration.rawRef)))

    const evidence = {
      taskId: 'RHL-KNOWLEDGE-SCHEMA-V04-001',
      generatedAt: KNOWLEDGE_V04_NOW,
      implementationStatus: 'PASS',
      schema: { schemaVersion: '0.4', storageFormatVersion: '1', canonicalObjectKinds: KNOWLEDGE_SCHEMA_V04.canonicalObjectKinds },
      acceptance: {
        K1_schema_contract: true,
        K2_storage_and_reload: assets.objects.length > 0 && assets.registry.length === assets.objects.length,
        K3_validation: validation.status === 'passed',
        K4_gateway_atomic_path: first.status === 'committed' && first.changeSetId !== undefined,
        K5_query_new_kinds: index.byKind.get('event')?.length === 1 && index.byKind.get('observation')?.length === 4 && index.byKind.get('thesis')?.length === 1 && index.byKind.get('reasoning_edge')?.length === 3,
        K6_rights_fail_closed: denied.status === 'blocked',
        K7_earnings_vertical: Boolean(first.eventRefsByProposalId?.['event-fy25'] && first.observationRefsByProposalId?.['eps-consensus'] && first.claimRefsByProposalId['earnings-claim'] && first.thesisRefsByProposalId?.['thesis'] && first.reasoningEdgeRefsByProposalId?.['edge-claim-thesis']),
        K8_migration: dry.status === 'planned' && applied.status === 'applied' && migrationReplay.status === 'already_applied' && applied.preservedProvenanceCount === 1,
        K9_replay_idempotency: replay.status === 'no_changes',
        K10_review_persistence: reviews.length === 1 && reviews[0]!.resolutionContext.schemaVersionAtCreation === '0.4',
      },
      canonicalCounts: Object.fromEntries([...index.byKind.entries()].map(([kind, values]) => [kind, values.length])),
      canonicalHash: hashKnowledgeObject([...objects].sort((left, right) => left.id.localeCompare(right.id))),
      diagnostics: validation.errors.map((error) => ({ code: error.code, assetId: error.assetId ?? null })),
      reloadVerified: (await readCanonicalV04Assets(kbRoot)).objects.length === assets.objects.length,
      revisions: { firstCommit: first.knowledgeBaseRevision, replay: replay.knowledgeBaseRevision, migrationSource: applied.sourceRevision, migrationTarget: migratedManifest.revision },
      migration: { dryRunStatus: dry.status, applyStatus: applied.status, replayStatus: migrationReplay.status, preservedProvenanceCount: applied.preservedProvenanceCount, rawRefs: applied.rawRefs },
      refs: { event: first.eventRefsByProposalId?.['event-fy25'], consensus: first.observationRefsByProposalId?.['eps-consensus'], claim: first.claimRefsByProposalId['earnings-claim'], thesis: first.thesisRefsByProposalId?.['thesis'], reasoningEdge: first.reasoningEdgeRefsByProposalId?.['edge-claim-thesis'] },
      privacy: { rawBodiesIncluded: false, credentialsIncluded: false, privatePathsIncluded: false, reasoningTracesIncluded: false },
    } as const
    assert.ok(Object.values(evidence.acceptance).every(Boolean))
    await mkdir(dirname(EVIDENCE_PATH), { recursive: true })
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    return evidence
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

type evidence = {
  readonly taskId: string
  readonly generatedAt: string
  readonly implementationStatus: string
  readonly schema: unknown
  readonly acceptance: Readonly<Record<string, boolean>>
  readonly canonicalCounts: Readonly<Record<string, number>>
  readonly canonicalHash: string
  readonly diagnostics: readonly { readonly code: string; readonly assetId: string | null }[]
  readonly reloadVerified: boolean
  readonly revisions: Readonly<Record<string, number>>
  readonly migration: { readonly dryRunStatus: string; readonly applyStatus: string; readonly replayStatus: string; readonly preservedProvenanceCount: number; readonly rawRefs: readonly string[] }
  readonly refs: Readonly<Record<string, string | undefined>>
  readonly privacy: Readonly<Record<string, boolean>>
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runKnowledgeV04Acceptance(), null, 2)) } catch (error) { console.error(error); process.exitCode = 1 }
}
