export const TEST054_MODULES = ['industry_definition','market_size_growth','supply_demand_analysis','industry_chain_analysis','competitive_landscape','technology_evolution','company_mapping','risk_analysis'] as const
export const TEST054_PROVIDERS = ['official-disclosure-research-acquisition','gdelt-research-acquisition','miit-industry-research-acquisition','govcn-industry-research-acquisition','eastmoney-industry-research-acquisition','cpca-industry-research-acquisition','akshare-industry-research-acquisition'] as const
export const TEST054_SECTIONS = ['Executive Industry View','Industry Scope & Definition','Market Size & Growth','Demand Structure & Drivers','Supply, Capacity & Utilization','Supply-Demand Balance & Pricing','Industry Chain Map','Value Capture & Industry Economics','Competitive Landscape','Technology & Product Roadmap','Company Mapping & Exposure','Catalysts','Risks & Invalidation Conditions','Key Metrics & Monitoring','Research Gaps & Alternative Views','Methodology & Provenance'] as const
export const TEST054_CLASSIFICATIONS = ['INDUSTRY_PRODUCT_QUALITY_READY','INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE','INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EXTERNAL_PROVIDER','INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_MODEL_RUNTIME','INDUSTRY_PRODUCT_QUALITY_WORKFLOW_DEFECT','INDUSTRY_PRODUCT_QUALITY_INCONCLUSIVE'] as const
const TEST054_CANDIDATE_PROVIDER_TO_METRIC = {
  cninfo: 'official-disclosure-research-acquisition',
  gdelt: 'gdelt-research-acquisition',
  miit: 'miit-industry-research-acquisition',
  govcn: 'govcn-industry-research-acquisition',
  eastmoney: 'eastmoney-industry-research-acquisition',
  cpca: 'cpca-industry-research-acquisition',
  akshare: 'akshare-industry-research-acquisition',
} as const
export function metricProviderName(candidateProvider: unknown) {
  return TEST054_CANDIDATE_PROVIDER_TO_METRIC[String(candidateProvider ?? '') as keyof typeof TEST054_CANDIDATE_PROVIDER_TO_METRIC] ?? String(candidateProvider ?? '')
}
export function classifyTest054(i: any) {
  if (!i.parserReady || i.parserContradiction || i.waveCount > 2 || !i.gapIdsValid || i.provenance?.allDurableProposalsHaveSourceRaw === false || i.proposalBundleCount > 1 || i.gatewayCallCount > 1 || i.changeSetCount > 1 || i.writerInvocationCount > 1 || !['valid', 'passed'].includes(i.canonicalValidation)) return 'INDUSTRY_PRODUCT_QUALITY_WORKFLOW_DEFECT'
  if (i.modelRuntimeUnavailable) return 'INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_MODEL_RUNTIME'
  if (i.workflowStatus === 'blocked' && !i.definitionEvidence) return i.providers?.some((p: any) => p.boundedFailureCategory && !p.qualifiedEvidenceCount) ? 'INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EXTERNAL_PROVIDER' : 'INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE'
  if (!i.providers || i.providers.length !== 7 || new Set(i.providers.map((p: any) => p.provider)).size !== 7 || i.providers.some((p: any) => !p.attempted)) return 'INDUSTRY_PRODUCT_QUALITY_WORKFLOW_DEFECT'
  if (i.workflowStatus !== 'completed' || !i.definitionEvidence || (i.modules ?? []).length !== 8 || (i.modules ?? []).some((m: any) => m.status === 'unavailable') || i.waveCount > 1 || i.report?.generated !== true || i.report?.moduleCoverage !== true) return 'INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE'
  return 'INDUSTRY_PRODUCT_QUALITY_READY'
}
export function assembleTest054Evidence(i: any) { return { ...i, finalClassification: classifyTest054(i) } }
export function summarizeMiitManagedParser(log: readonly any[], anchorCandidateIds: ReadonlySet<string>, pdfAnchorCandidateIds: ReadonlySet<string>) {
  const isAnchor = (row: any) => anchorCandidateIds.has(String(row.candidateId ?? ''))
  const fetched = log.filter((row) => row.provider === 'miit-industry-research-acquisition' && row.phase === 'fetch' && row.succeeded && isAnchor(row))
  const normalized = log.filter((row) => row.provider === 'miit-industry-research-acquisition' && row.phase === 'normalize' && row.succeeded && isAnchor(row))
  const pdfFetched = fetched.filter((row) => pdfAnchorCandidateIds.has(String(row.candidateId ?? '')))
  return {
    fetchAttempted: fetched.length > 0,
    fetchSucceeded: fetched.length > 0,
    normalizedCount: normalized.length,
    pdfMediaType: pdfFetched.length > 0 && pdfFetched.every((row) => row.mediaType === 'application/pdf'),
    byteCount: fetched.reduce((n, row) => n + (row.byteCount ?? 0), 0),
    normalizedCharacterCount: normalized.reduce((n, row) => n + (row.contentLength ?? 0), 0),
    documents: normalized.map((row) => ({ candidateId: row.candidateId, normalized: true, contentHash: row.contentHash, publisher: row.publisher })),
    pcbIdentity: normalized.length > 0,
    scopeBoundary: normalized.length > 0,
  }
}
