import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import { KnowledgeIndexV04 } from '../../knowledge/query/index.ts'
import { validateKnowledgeV04Objects } from '../../knowledge/validation/v04-validator.ts'
import { validateKnowledgeBaseV04State } from '../../knowledge/validation/v04-change-set-validator.ts'
import { migrateV03ToV04 } from '../../knowledge/migration/v03-to-v04.ts'
import { archiveRaw } from '../../knowledge/raw/raw-archive.ts'
import { KnowledgeService } from '../../app/services/knowledge-service.ts'
import { knowledgeV04Input, KNOWLEDGE_V04_AS_OF, KNOWLEDGE_V04_NOW, normalizedSource } from '../fixtures/knowledge-v04.ts'

async function fresh(prefix: string): Promise<{ root: string; registry: KnowledgeBaseRegistry }> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: `${prefix}kb`, now: KNOWLEDGE_V04_NOW })
  return { root, registry: new KnowledgeBaseRegistry() }
}

test('Schema 0.4 vertical production persists typed objects, provenance, and temporal fields', async () => {
  const f = await fresh('rhl-v04-vertical-')
  try {
    const handle = await f.registry.mount(f.root)
    const outcome = await new KnowledgeProductionGateway(f.registry).submit(knowledgeV04Input(handle))
    assert.equal(outcome.status, 'committed', JSON.stringify(outcome))
    assert.ok(outcome.eventRefsByProposalId?.['event-fy25'])
    assert.ok(outcome.observationRefsByProposalId?.['revenue'])
    assert.ok(outcome.observationRefsByProposalId?.['eps-a'])
    assert.ok(outcome.observationRefsByProposalId?.['eps-consensus'])
    assert.ok(outcome.claimRefsByProposalId['earnings-claim'])
    assert.ok(outcome.thesisRefsByProposalId?.['thesis'])
    assert.ok(outcome.reasoningEdgeRefsByProposalId?.['edge-claim-thesis'])
    assert.ok(outcome.resolutionIntents.some((item) => item.proposalId === 'ambiguous-review' && item.disposition === 'review_required'))
    const assets = await readCanonicalV04Assets(f.root)
    const validation = validateKnowledgeV04Objects(assets.objects.map((item) => item.value))
    assert.equal(validation.status, 'passed', JSON.stringify(validation.errors))
    const byId = new Map<string, Record<string, unknown>>(assets.objects.map((item) => [item.value.id, item.value as unknown as Record<string, unknown>]))
    const event = byId.get(outcome.eventRefsByProposalId!['event-fy25']!)!
    assert.deepEqual(event.sourceRefs, [outcome.sourceRefsByLocalId['earnings-release']])
    assert.equal((event.temporal as Record<string, unknown>).fiscalPeriod, 'FY2025')
    const consensus = byId.get(outcome.observationRefsByProposalId!['eps-consensus']!)!
    assert.equal(consensus.observationType, 'consensus')
    assert.equal(consensus.mean, 11)
    assert.equal(consensus.count, 2)
    assert.equal((consensus.contributingObservationRefs as string[]).length, 2)
    const edge = byId.get(outcome.reasoningEdgeRefsByProposalId!['edge-claim-thesis']!)!
    assert.equal(edge.sourceRef, outcome.claimRefsByProposalId['earnings-claim'])
    assert.equal(edge.targetRef, outcome.thesisRefsByProposalId!['thesis'])
    assert.equal((await validateKnowledgeBaseV04State(f.root)).status, 'passed')
    const index = KnowledgeIndexV04.fromAssets(assets)
    assert.equal(index.search('consensus', 'observation').length, 1)
    assert.ok(index.getReferences(outcome.thesisRefsByProposalId!['thesis']! as never).some((item) => item.id === outcome.reasoningEdgeRefsByProposalId!['edge-claim-thesis']))
    assert.ok(index.getKnowledgeAsOf(KNOWLEDGE_V04_AS_OF).some((item) => item.id === outcome.eventRefsByProposalId!['event-fy25']))
    const applicationService = new KnowledgeService(f.root)
    assert.equal((await applicationService.status()).counts.observation, 4)
    assert.equal((await applicationService.searchKnowledge({ query: 'consensus' })).results[0]?.kind, 'Observation')
    assert.equal((await applicationService.getKnowledgeObject(outcome.thesisRefsByProposalId!['thesis']!)).kind, 'Thesis')
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('Schema 0.4 Gateway fails closed on denied derivative rights', async () => {
  const f = await fresh('rhl-v04-rights-')
  try {
    const handle = await f.registry.mount(f.root)
    const denied = normalizedSource('denied', 'Restricted evidence', 'Restricted evidence body.')
    const result = await new KnowledgeProductionGateway(f.registry).submit({ ...knowledgeV04Input(handle, 'rights-denied-001'), evidenceBindings: [{ localSourceId: 'denied', source: { ...denied, rights: { ...denied.rights, derivativeKnowledgeAllowed: false } } }], proposals: [{ proposalId: 'denied-claim', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'This must not be canonicalized.', sourceCandidateIds: ['denied'], structuredValue: { metric: 'revenue', value: 1, unit: 'CNY', comparator: 'eq' } }] })
    assert.equal(result.status, 'blocked')
    assert.match(result.errors.join('\n'), /rights prohibit derived canonical Knowledge/i)
    assert.equal((await readCanonicalV04Assets(f.root)).objects.length, 0)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('Schema 0.4 rejects new Thesis Claims while preserving legacy readability', async () => {
  const f = await fresh('rhl-v04-thesis-boundary-')
  try {
    const handle = await f.registry.mount(f.root)
    const rejected = await new KnowledgeProductionGateway(f.registry).submit({ ...knowledgeV04Input(handle, 'thesis-claim-rejected'), proposals: [{ proposalId: 'legacy-thesis-write', kind: 'claim', claimType: 'thesis', subjectKey: 'company', statement: 'Legacy Thesis Claim must not be newly written.', sourceCandidateIds: ['earnings-release'] }] })
    assert.equal(rejected.status, 'blocked')
    assert.match(rejected.errors.join('\n'), /legacy Thesis Claim/i)
    const source = { id: 'source:legacy-readable', title: 'Legacy source', sourceType: 'official_disclosure', rights: { accessScope: 'public', providerTermsKnown: false, derivativeKnowledgeAllowed: true }, usagePolicy: { mode: 'personal_noncommercial_research', retainRaw: false, allowAiProcessing: true, allowDerivedKnowledge: true, redistributionAllowed: false }, lifecycle: { status: 'active' } }
    const legacy = { id: 'claim:legacy-thesis', claimType: 'thesis', statement: 'Readable legacy Thesis Claim', subjectRefs: ['entity:company-test'], sourceRefs: ['source:legacy-readable'], provenance: [{ sourceRef: 'source:legacy-readable', rawRef: 'raw-sha256-' + 'a'.repeat(64), locator: null, chunkRef: null }], lifecycle: { status: 'active' } }
    const readable = validateKnowledgeV04Objects([source as never, { id: 'entity:company-test', type: 'company', name: 'Test', lifecycle: { status: 'active' } } as never, legacy as never])
    assert.equal(readable.status, 'passed', JSON.stringify(readable.errors))
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('Schema 0.4 persists typed ExternalIdentifiers without changing Company hard identity', async () => {
  const f = await fresh('rhl-v04-identifiers-')
  try {
    const handle = await f.registry.mount(f.root)
    const result = await new KnowledgeProductionGateway(f.registry).submit({ handle, producerType: 'identifier-fixture', producerRunId: 'identifier-run', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: '贵州茅台', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' }, externalIdentifiers: [{ namespace: 'exchange_ticker', value: 'SSE:600519', confidence: 1 }, { namespace: 'cninfo', value: 'company-600519', confidence: 0.9 }] }, proposals: [], evidenceBindings: [], now: () => KNOWLEDGE_V04_NOW })
    assert.equal(result.status, 'committed', JSON.stringify(result))
    const assets = await readCanonicalV04Assets(f.root)
    const company = assets.objects.find((item) => item.kind === 'entity')!.value as unknown as { ticker: string; exchange: string; externalIdentifiers: Array<{ namespace: string; value: string }> }
    assert.equal(company.ticker, '600519')
    assert.equal(company.exchange, 'SH')
    assert.deepEqual(company.externalIdentifiers.map((item) => `${item.namespace}:${item.value}`).sort(), ['cninfo:company-600519', 'exchange_ticker:SSE:600519'])
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('v0.3 to v0.4 migration is dry-run safe and apply is isolated, repeatable by source identity', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'rhl-v03-source-'))
  const outputRoot = join(await mkdtemp(join(tmpdir(), 'rhl-v04-migrated-parent-')), 'output')
  try {
    await createFreshKnowledgeBaseV04(sourceRoot, { knowledgeBaseId: 'legacy-kb', now: KNOWLEDGE_V04_NOW })
    const rawHandle = await new KnowledgeBaseRegistry().mount(sourceRoot)
    const raw = await archiveRaw(rawHandle, { bytes: new TextEncoder().encode('legacy raw evidence'), originalFilename: 'legacy.txt', mediaType: 'text/plain' }, { clock: () => KNOWLEDGE_V04_NOW })
    const rawRef = raw.manifest.rawRef
    const sourceId = 'source:legacy-release'
    const claimId = 'claim:legacy-claim'
    const registry = { [sourceId]: { type: 'source', storageRef: 'sources/legacy-release.yaml' }, [claimId]: { type: 'claim', storageRef: 'claims/legacy-claim.yaml' }, 'entity:company-legacy': { type: 'entity', storageRef: 'entities/company-legacy.yaml' } }
    await writeFile(join(sourceRoot, 'sources/legacy-release.yaml'), `${JSON.stringify({ id: sourceId, title: 'Legacy release', sourceType: 'official_disclosure', publisher: 'fixture', publishedAt: KNOWLEDGE_V04_AS_OF, url: 'https://example.test/legacy', rawRefs: [rawRef], lifecycle: { status: 'active' } })}\n`)
    await writeFile(join(sourceRoot, 'entities/company-legacy.yaml'), `${JSON.stringify({ id: 'entity:company-legacy', type: 'company', name: 'Legacy Company', aliases: ['LEGACY'], ticker: 'LEGACY', exchange: 'SSE', lifecycle: { status: 'active' } })}\n`)
    await writeFile(join(sourceRoot, 'claims/legacy-claim.yaml'), `${JSON.stringify({ id: claimId, claimType: 'fact', statement: 'Legacy fact', subjectRefs: ['entity:company-legacy'], sourceRefs: [sourceId], provenance: [{ sourceRef: sourceId, rawRef, locator: null, chunkRef: null }], lifecycle: { status: 'active' } })}\n`)
    await writeFile(join(sourceRoot, 'registry/assets.yaml'), `${JSON.stringify(registry)}\n`)
    await writeFile(join(sourceRoot, 'manifest.yaml'), `${JSON.stringify({ knowledgeBaseId: 'legacy-kb', name: 'Legacy KB', schemaVersion: '0.3', storageFormatVersion: '1', revision: 7, status: 'active', createdAt: KNOWLEDGE_V04_NOW, updatedAt: KNOWLEDGE_V04_NOW })}\n`)
    const before = await readFile(join(sourceRoot, 'manifest.yaml'), 'utf8')
    const dry = await migrateV03ToV04(sourceRoot, { mode: 'dry_run', outputRoot, now: KNOWLEDGE_V04_NOW })
    assert.equal(dry.status, 'planned')
    assert.equal(dry.preservedProvenanceCount, 1)
    assert.equal(await readFile(join(sourceRoot, 'manifest.yaml'), 'utf8'), before)
    const applied = await migrateV03ToV04(sourceRoot, { mode: 'apply', outputRoot, now: KNOWLEDGE_V04_NOW })
    assert.equal(applied.status, 'applied')
    const replay = await migrateV03ToV04(sourceRoot, { mode: 'apply', outputRoot, now: KNOWLEDGE_V04_NOW })
    assert.equal(replay.status, 'already_applied')
    const migratedManifest = JSON.parse(await readFile(join(outputRoot, 'manifest.yaml'), 'utf8')) as { schemaVersion: string; storageFormatVersion: string; revision: number }
    assert.equal(migratedManifest.schemaVersion, '0.4')
    assert.equal(migratedManifest.storageFormatVersion, '1')
    assert.equal(migratedManifest.revision, 0)
    const migrated = await readCanonicalV04Assets(outputRoot)
    assert.ok(migrated.objects.some((item) => item.value.id === claimId))
    assert.equal((migrated.objects.find((item) => item.value.id === claimId)!.value as { provenance: Array<{ rawRef: string }> }).provenance[0]!.rawRef, rawRef)
    assert.equal((await validateKnowledgeBaseV04State(outputRoot)).status, 'passed')
    assert.deepEqual(applied.objectIds, [claimId, 'entity:company-legacy', sourceId].sort())
  } finally {
    await rm(sourceRoot, { recursive: true, force: true })
    await rm(join(outputRoot, '..'), { recursive: true, force: true })
  }
})
