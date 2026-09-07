import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'
import { KnowledgeGraphService } from '../../app/services/knowledge-graph-service.ts'

async function writeGraphFixture(root: string): Promise<void> {
  const registry: Record<string, { type: string; storageRef: string }> = {}
  const put = async (directory: string, filename: string, value: Record<string, unknown>, type: string): Promise<void> => {
    const path = `${directory}/${filename}.yaml`
    await writeFile(join(root, path), JSON.stringify(value))
    registry[String(value.id)] = { type, storageRef: path }
  }
  await put('theme-groups', 'infra', { id: 'theme-group:infra', name: 'Infrastructure', aliases: [], lifecycle: { status: 'active' } }, 'theme_group')
  await put('theme-groups', 'old', { id: 'theme-group:old', name: 'Historical', aliases: [], lifecycle: { status: 'archived' } }, 'theme_group')
  await put('entities', 'theme', { id: 'entity:theme', type: 'investment_theme', name: 'AI Infrastructure', aliases: [], themeGroupRef: 'theme-group:infra', lifecycle: { status: 'active' } }, 'entity')
  await put('entities', 'industry', { id: 'entity:industry', type: 'industry', name: 'Semiconductors', aliases: [], lifecycle: { status: 'active' } }, 'entity')
  await put('entities', 'company', { id: 'entity:company', type: 'company', name: 'Acme Compute', aliases: [], ticker: 'ACME', exchange: 'NYSE', lifecycle: { status: 'active' } }, 'entity')
  await put('entities', 'product', { id: 'entity:product', type: 'product', name: 'Accelerator Board', aliases: [], lifecycle: { status: 'active' } }, 'entity')
  await put('entities', 'technology', { id: 'entity:technology', type: 'technology', name: 'High Bandwidth Memory', aliases: [], lifecycle: { status: 'active' } }, 'entity')
  await put('entities', 'inactive', { id: 'entity:inactive', type: 'company', name: 'Old Acme', aliases: [], lifecycle: { status: 'superseded' } }, 'entity')
  await put('relations', 'theme-industry', { id: 'relation:theme-industry', type: 'theme_exposure', sourceRef: 'entity:theme', targetRef: 'entity:industry', lifecycle: { status: 'active' } }, 'relation')
  await put('relations', 'company-industry', { id: 'relation:company-industry', type: 'business_exposure', sourceRef: 'entity:company', targetRef: 'entity:industry', lifecycle: { status: 'active' } }, 'relation')
  await put('relations', 'company-product', { id: 'relation:company-product', type: 'offers_product', sourceRef: 'entity:company', targetRef: 'entity:product', lifecycle: { status: 'active' } }, 'relation')
  await put('relations', 'company-tech', { id: 'relation:company-tech', type: 'develops_technology', sourceRef: 'entity:company', targetRef: 'entity:technology', lifecycle: { status: 'active' } }, 'relation')
  await put('relations', 'inactive-edge', { id: 'relation:inactive-edge', type: 'offers_product', sourceRef: 'entity:inactive', targetRef: 'entity:product', lifecycle: { status: 'expired' } }, 'relation')
  await put('claims', 'claim', { id: 'claim:fixture', claimType: 'fact', statement: 'fixture', subjectRefs: ['entity:company'], sourceRefs: [], lifecycle: { status: 'active' } }, 'claim')
  await put('sources', 'source', { id: 'source:fixture', title: 'fixture', sourceType: 'unknown', lifecycle: { status: 'active' } }, 'source')
  await writeFile(join(root, 'registry', 'assets.yaml'), JSON.stringify(registry))
}

test('KnowledgeGraphService returns bounded deterministic directory and rooted graph projections', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-graph-service' })
  try {
    await writeGraphFixture(root)
    const before = await readFile(join(root, 'registry', 'assets.yaml'), 'utf8')
    const service = new KnowledgeGraphService(root)
    const directory = await service.getDirectoryProjection(1)
    assert.deepEqual(directory.themeGroups.map((item) => item.ref), ['theme-group:infra'])
    assert.deepEqual(directory.themeGroups[0]?.themes.map((item) => item.ref), ['entity:theme'])
    assert.deepEqual(directory.companies.items.map((item) => item.ref), ['entity:company'])
    assert.equal(directory.companies.total, 1)
    assert.deepEqual(directory.companies, { items: [{ ref: 'entity:company', name: 'Acme Compute' }], total: 1, limit: 1, truncated: false })

    const theme = await service.getGraphProjection({ rootRef: 'entity:theme', depth: 2, maxNodes: 2, maxEdges: 2 })
    assert.equal(theme.profile, 'theme_context')
    assert.equal(theme.nodes[0]?.isRoot, true)
    assert.deepEqual(theme.edges.map((edge) => [edge.sourceRef, edge.targetRef]), [['entity:theme', 'entity:industry']])
    assert.equal(theme.nodes.some((node) => node.ref === 'entity:inactive'), false)
    assert.equal(theme.nodes.some((node) => node.ref === 'claim:fixture'), false)
    assert.equal(theme.nodes.some((node) => node.ref === 'source:fixture'), false)
    assert.equal(theme.truncated, true)

    const company = await service.getGraphProjection({ rootRef: 'entity:company', depth: 2 })
    assert.equal(company.profile, 'company_context')
    assert.equal(company.nodes.find((node) => node.isRoot)?.secondaryLabel, 'ACME · NYSE')
    assert.deepEqual(company.edges.map((edge) => edge.ref), ['relation:company-industry', 'relation:company-product', 'relation:company-tech', 'relation:theme-industry'])
    const repeat = await service.getGraphProjection({ rootRef: 'entity:company', depth: 2 })
    assert.deepEqual(repeat, company)
    assert.equal(await readFile(join(root, 'registry', 'assets.yaml'), 'utf8'), before)
  } finally {
    await removeKnowledgeBase(root)
  }
})

test('KnowledgeGraphService rejects unsupported or inactive roots and clamps graph bounds', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-graph-errors' })
  try {
    await writeGraphFixture(root)
    const service = new KnowledgeGraphService(root)
    await assert.rejects(() => service.getGraphProjection({ rootRef: 'theme-group:infra' }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'invalid_input')
    await assert.rejects(() => service.getGraphProjection({ rootRef: 'claim:fixture' }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'invalid_input')
    await assert.rejects(() => service.getGraphProjection({ rootRef: 'entity:inactive' }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'not_found')
    await assert.rejects(() => service.getGraphProjection({ rootRef: 'entity:company', depth: 3 as 1 | 2 }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'invalid_input')
    const bounded = await service.getGraphProjection({ rootRef: 'entity:company', maxNodes: 1, maxEdges: 1 })
    assert.equal(bounded.nodes.length, 1)
    assert.equal(bounded.nodes[0]?.isRoot, true)
    assert.equal(bounded.edges.length, 0)
    assert.equal(bounded.truncated, true)
    await assert.rejects(() => new KnowledgeGraphService().getDirectoryProjection(), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'no_kb_mounted')
  } finally {
    await removeKnowledgeBase(root)
  }
})
