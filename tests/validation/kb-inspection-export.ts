import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { parseYaml } from '../../knowledge/storage/yaml.ts'

type Dict = Record<string, unknown>

const repoRoot = resolve(import.meta.dirname, '../..')
const kbId = 'kb-rhl-semantic-quality-001'
const kbRoot = resolve(repoRoot, 'runtime-data', 'knowledge-bases', kbId)
const outputJson = resolve(repoRoot, 'tests/validation/evidence/rhl-semantic-quality-001-kb-inspection.json')
const outputMarkdown = resolve(repoRoot, 'tests/validation/evidence/RHL_SEMANTIC_QUALITY_001_KB_INSPECTION.md')
const ingestionLogPath = join(kbRoot, 'logs', 'ingestion', 'rhl-semantic-quality-001-primary.yaml')

function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function asString(value: unknown): string | null { return typeof value === 'string' ? value : value == null ? null : String(value) }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function sortById<T extends Dict>(items: T[]): T[] { return [...items].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''))) }
function mdCell(value: unknown): string {
  const rendered = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  return rendered.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

async function parseFile(path: string): Promise<Dict> {
  const parsed = parseYaml(await readFile(path, 'utf8'), path)
  if (!isDict(parsed)) throw new Error(`Expected object in ${path}`)
  return parsed
}

async function loadAssets(): Promise<{ entities: Dict[]; relations: Dict[]; claims: Dict[]; sources: Dict[] }> {
  const registry = await parseFile(join(kbRoot, 'registry', 'assets.yaml'))
  const buckets: Record<string, Dict[]> = { entity: [], relation: [], claim: [], source: [] }
  for (const [knowledgeId, descriptor] of Object.entries(registry)) {
    if (!isDict(descriptor)) continue
    const type = asString(descriptor.type)
    if (!type || !(type in buckets)) continue
    const storageRef = asString(descriptor.storageRef)
    if (!storageRef) continue
    const object = await parseFile(join(kbRoot, storageRef))
    object.id ??= knowledgeId
    buckets[type].push(object)
  }
  return { entities: sortById(buckets.entity), relations: sortById(buckets.relation), claims: sortById(buckets.claim), sources: sortById(buckets.source) }
}

function entityExport(entity: Dict): Dict {
  const type = asString(entity.type)
  const company = type === 'company' ? { ticker: entity.ticker ?? null, exchange: entity.exchange ?? null, legalName: entity.legalName ?? null } : undefined
  return { id: entity.id, type, name: entity.name ?? null, aliases: asArray(entity.aliases), description: entity.description ?? null, ...(company ? { company } : {}) }
}

function relationExport(relation: Dict, entityById: Map<string, Dict>): Dict {
  const sourceRef = asString(relation.sourceRef)
  const targetRef = asString(relation.targetRef)
  return { id: relation.id, relationType: relation.type ?? relation.relationType ?? null, sourceRef, sourceEntityName: sourceRef ? entityById.get(sourceRef)?.name ?? null : null, targetRef, targetEntityName: targetRef ? entityById.get(targetRef)?.name ?? null : null, attributes: relation.attributes ?? {} }
}

function claimExport(claim: Dict, entityById: Map<string, Dict>): Dict {
  const subjectRefs = asArray(claim.subjectRefs).filter((value): value is string => typeof value === 'string')
  return { id: claim.id, claimType: claim.claimType ?? null, statement: claim.statement ?? null, subjectRefs, subjectNames: subjectRefs.map((ref) => entityById.get(ref)?.name ?? null), temporal: claim.temporal ?? null, sourceRefs: asArray(claim.sourceRefs).filter((value): value is string => typeof value === 'string') }
}

function reviewRecords(log: Dict): { records: Dict[]; completeness: Dict } {
  const summary = isDict(log.ingestionContext) && isDict(log.ingestionContext.reviewSummary) ? log.ingestionContext.reviewSummary : {}
  const samples = isDict(summary.samplesByCategory) ? summary.samplesByCategory : {}
  const records: Dict[] = []
  const seen = new Set<string>()
  for (const [category, values] of Object.entries(samples)) for (const value of asArray(values)) {
    if (!isDict(value)) continue
    const record = { category: value.category ?? category, stage: value.stage ?? null, candidateId: value.candidateId ?? null, rationale: value.rationale ?? null, dependency: value.dependency ?? false, dependentCandidateIds: asArray(value.dependentCandidateIds), kind: value.kind ?? null, origin: value.origin ?? null, reviewKey: value.reviewKey ?? null }
    const key = asString(record.reviewKey) ?? `${record.category}|${record.stage}|${record.candidateId}|${record.rationale}`
    if (!seen.has(key)) { seen.add(key); records.push(record) }
  }
  return { records: records.sort((a, b) => String(a.reviewKey).localeCompare(String(b.reviewKey))), completeness: { authoritativeTotal: Number(summary.total ?? 0), authoritativeRoot: Number(summary.rootCount ?? 0), authoritativeDependency: Number(summary.dependencyCount ?? 0), authoritativeByCategory: summary.byCategory ?? {}, authoritativeByCandidateKind: summary.byCandidateKind ?? {}, availablePersistedRecords: records.length, completeListPersisted: false, source: 'logs/ingestion/rhl-semantic-quality-001-primary.yaml ingestionContext.reviewSummary.samplesByCategory', limitation: 'The runtime log persists bounded samplesByCategory rather than the full Review item list.' } }
}

function qualityAudit(entities: Dict[]): Dict {
  const placeholder = /^(item|entity|company|product|industry|technology|unknown|unnamed|n\/?a|na|tbd|other|公司|企业|产品|行业|技术|材料)([-_ ]?\d+)?$/i
  const rows = entities.map((entity) => {
    const name = asString(entity.name) ?? ''
    const id = asString(entity.id) ?? ''
    const idContainsItem = /-item-/i.test(id)
    const exactOrNearPlaceholder = placeholder.test(name.trim())
    const shortName = [...name.trim()].length <= 2
    const assessment = exactOrNearPlaceholder ? 'placeholder-like-name' : shortName ? 'short-name-review' : 'name-present'
    return { id, entityType: entity.type ?? null, name: entity.name ?? null, idContainsItem, exactOrNearPlaceholder, shortName, assessment }
  })
  const count = (predicate: (row: Dict) => boolean) => rows.filter(predicate).length
  const byEntityType = Object.fromEntries([...new Set(rows.map((row) => String(row.entityType ?? 'unknown')))].sort().map((type) => [type, { total: rows.filter((row) => String(row.entityType ?? 'unknown') === type).length, placeholderLikeName: rows.filter((row) => String(row.entityType ?? 'unknown') === type && row.exactOrNearPlaceholder).length, shortNameReview: rows.filter((row) => String(row.entityType ?? 'unknown') === type && row.shortName).length, idContainsItem: rows.filter((row) => String(row.entityType ?? 'unknown') === type && row.idContainsItem).length }]))
  return { totalEntities: entities.length, criteria: { placeholderLikeName: placeholder.source, shortName: '<= 2 Unicode code points after trim', idContainsItem: 'durable id contains -item-; not an issue by itself' }, totals: { placeholderLikeName: count((row) => row.exactOrNearPlaceholder === true), shortNameReview: count((row) => row.shortName === true), idContainsItem: count((row) => row.idContainsItem === true) }, byEntityType, representativeSamples: { placeholderLikeName: rows.filter((row) => row.exactOrNearPlaceholder).slice(0, 30), shortNameReview: rows.filter((row) => row.shortName).slice(0, 30), idContainsItemWithNormalName: rows.filter((row) => row.idContainsItem && !row.exactOrNearPlaceholder && !row.shortName).slice(0, 30) }, interpretation: 'An -item- durable ID is reported separately and is not treated as an Entity quality defect unless the actual Entity.name also meets a flagged criterion.' }
}

function themeReview(records: Dict[], entities: Dict[], relations: Dict[], claims: Dict[]): Dict {
  const theme = records.find((record) => record.category === 'theme_creation' || /potential new investmenttheme/i.test(String(record.rationale)))
  const candidateId = asString(theme?.candidateId)
  const dependentReviews = records.filter((record) => candidateId && asArray(record.dependentCandidateIds).includes(candidateId))
  const persistedEntity = candidateId ? entities.find((entity) => entity.id === candidateId) : undefined
  const dependentPersistedRelations = relations.filter((relation) => relation.sourceRef === candidateId || relation.targetRef === candidateId)
  const dependentPersistedClaims = claims.filter((claim) => asArray(claim.subjectRefs).includes(candidateId ?? ''))
  return { potentialNewInvestmentThemeCount: theme ? 1 : 0, candidateId, persisted: Boolean(persistedEntity), name: persistedEntity?.name ?? null, aliases: persistedEntity?.aliases ?? null, description: persistedEntity?.description ?? null, support: null, recommendationReason: theme?.rationale ?? null, dependentReviewItems: dependentReviews, dependentPersistedRelations: dependentPersistedRelations.map((relation) => relation.id), dependentPersistedClaims: dependentPersistedClaims.map((claim) => claim.id), unavailableFields: ['name', 'aliases', 'description', 'support details', 'dependent Relation/Claim candidate content'], unavailableReason: 'The potential-new theme was Review-only and therefore did not receive a durable Entity record; the runtime ingestion log persists only bounded ReviewSummary samples and dependency IDs.' }
}

function relationConflict(records: Dict[], relations: Dict[], entityById: Map<string, Dict>): Dict {
  const review = records.find((record) => String(record.rationale) === 'Relation attributes conflict across extraction units')
  const candidateId = asString(review?.candidateId)
  const persisted = relations.find((relation) => relation.id === candidateId)
  const reviewKey = asString(review?.reviewKey) ?? ''
  const fields = reviewKey.split('|').at(-1)?.split(',').filter(Boolean) ?? []
  const relation = persisted ? relationExport(persisted, entityById) : null
  return { found: Boolean(review), candidateId, category: review?.category ?? null, stage: review?.stage ?? null, rationale: review?.rationale ?? null, relation, conflictingFields: fields, conflictingValues: null, persisted: Boolean(persisted), unavailableReason: persisted ? null : 'The Relation was Review-only and did not receive a durable Relation record; the runtime log preserves the conflicting field names in reviewKey but not both attribute values or local endpoint projections.' }
}

function markdown(exported: Dict): string {
  const kb = exported.knowledgeBase as Dict
  const counts = exported.counts as Dict
  const lines = ['# RHL Semantic Quality 001 — KB Inspection', '', `- KB: \`${kb.id}\``, `- Root: \`${kb.root}\``, `- Revision: ${kb.revision}`, `- Schema / Storage: ${kb.schemaVersion} / ${kb.storageFormatVersion}`, `- Read-only: yes`, `- Model/Docling/Workflow/Writer/Replay invoked by inspection: no`, '', '## Counts', '', `- Entity: ${counts.entities}`, `- Relation: ${counts.relations}`, `- Claim: ${counts.claims}`, `- Source: ${counts.sources}`, '', '## Entity List', '', '<details><summary>All Entities</summary>', '', '| id | type | name | aliases | description | Company fields |', '|---|---|---|---|---|---|']
  for (const entity of exported.entities as Dict[]) lines.push(`| ${mdCell(entity.id)} | ${mdCell(entity.type)} | ${mdCell(entity.name)} | ${mdCell(entity.aliases)} | ${mdCell(entity.description)} | ${mdCell(entity.company)} |`)
  lines.push('', '</details>', '', '## Relation List', '', '<details><summary>All Relations</summary>', '', '| id | relationType | sourceRef | source Entity name | targetRef | target Entity name | attributes |', '|---|---|---|---|---|---|---|')
  for (const relation of exported.relations as Dict[]) lines.push(`| ${mdCell(relation.id)} | ${mdCell(relation.relationType)} | ${mdCell(relation.sourceRef)} | ${mdCell(relation.sourceEntityName)} | ${mdCell(relation.targetRef)} | ${mdCell(relation.targetEntityName)} | ${mdCell(relation.attributes)} |`)
  lines.push('', '</details>', '', '## Claim List', '', '<details><summary>All Claims</summary>', '', '| id | claimType | statement | subjectRefs | subject names | temporal | sourceRefs |', '|---|---|---|---|---|---|---|')
  for (const claim of exported.claims as Dict[]) lines.push(`| ${mdCell(claim.id)} | ${mdCell(claim.claimType)} | ${mdCell(claim.statement)} | ${mdCell(claim.subjectRefs)} | ${mdCell(claim.subjectNames)} | ${mdCell(claim.temporal)} | ${mdCell(claim.sourceRefs)} |`)
  lines.push('', '</details>', '', '## Review Inventory', '', `- Authoritative Review total: ${(exported.reviewCompleteness as Dict).authoritativeTotal}`, `- Authoritative by category: ${mdCell((exported.reviewCompleteness as Dict).authoritativeByCategory)}`, `- Authoritative by candidate kind: ${mdCell((exported.reviewCompleteness as Dict).authoritativeByCandidateKind)}`, `- Available persisted Review records: ${(exported.reviewCompleteness as Dict).availablePersistedRecords}`, `- Complete Review list persisted: no`, '', '<details><summary>All available Review records</summary>', '', '| category | stage | candidateId | rationale | dependency | dependentCandidateIds |', '|---|---|---|---|---|---|')
  for (const review of exported.reviews as Dict[]) lines.push(`| ${mdCell(review.category)} | ${mdCell(review.stage)} | ${mdCell(review.candidateId)} | ${mdCell(review.rationale)} | ${mdCell(review.dependency)} | ${mdCell(review.dependentCandidateIds)} |`)
  lines.push('', '</details>', '', '## Entity Quality Audit', '', '```json', JSON.stringify(exported.entityQualityAudit, null, 2), '```', '', '## InvestmentTheme Review', '', '```json', JSON.stringify(exported.investmentThemeReview, null, 2), '```', '', '## Relation Conflict', '', '```json', JSON.stringify(exported.relationConflict, null, 2), '```', '', '## Read-only Boundary', '', '- The export reads only the target KB and its persisted ingestion log.', '- No KB file was written or changed.', '- No production code, historical evidence, architecture document, or product policy was changed by the inspection.', '')
  return lines.join('\n')
}

async function main(): Promise<void> {
  const manifest = await parseFile(join(kbRoot, 'manifest.yaml'))
  const log = await parseFile(ingestionLogPath)
  const assets = await loadAssets()
  const entityById = new Map(assets.entities.map((entity) => [String(entity.id), entity]))
  const entities = assets.entities.map(entityExport)
  const relations = assets.relations.map((relation) => relationExport(relation, entityById))
  const claims = assets.claims.map((claim) => claimExport(claim, entityById))
  const review = reviewRecords(log)
  const inspection: Dict = { inspectionTask: 'RHL-VALIDATION-SEMANTIC-QUALITY-001-KB-INSPECTION', generatedAt: new Date().toISOString(), readOnly: true, modelInvoked: false, doclingInvoked: false, workflowInvoked: false, writerInvoked: false, replayInvoked: false, knowledgeBase: { id: manifest.knowledgeBaseId, root: kbRoot, revision: manifest.revision, schemaVersion: manifest.schemaVersion, storageFormatVersion: manifest.storageFormatVersion, status: manifest.status, manifestPath: relative(repoRoot, join(kbRoot, 'manifest.yaml')) }, counts: { entities: entities.length, relations: relations.length, claims: claims.length, sources: assets.sources.length }, entities, relations, claims, reviews: review.records, reviewCompleteness: review.completeness, entityQualityAudit: qualityAudit(assets.entities), investmentThemeReview: themeReview(review.records, assets.entities, assets.relations, assets.claims), relationConflict: relationConflict(review.records, assets.relations, entityById), sources: assets.sources.map((source) => ({ id: source.id, type: source.type ?? null, title: source.title ?? null, rawRefs: source.rawRefs ?? [], publishedAt: source.publishedAt ?? null })), ingestionLog: { path: relative(repoRoot, ingestionLogPath), workflowRunId: log.workflowRunId, status: log.status, writeStatus: log.writeStatus, committedRevision: log.committedRevision, changeSetId: log.changeSetId } }
  await writeFile(outputJson, JSON.stringify(inspection, null, 2) + '\n')
  await writeFile(outputMarkdown, markdown(inspection))
  console.log(JSON.stringify({ outputJson, outputMarkdown, counts: inspection.counts, reviewCompleteness: inspection.reviewCompleteness, theme: inspection.investmentThemeReview, relationConflict: inspection.relationConflict }))
}

await main()
