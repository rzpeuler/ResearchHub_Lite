export const TEST043_CLASSIFICATIONS = ["PRODUCT_QUALITY_READY", "FUNCTIONAL_BUT_EVIDENCE_THIN", "PRODUCT_QUALITY_DEFECT", "PRODUCT_QUALITY_LIVE_INCONCLUSIVE", "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE", "PRODUCT_QUALITY_TEST_HARNESS_DEFECT"] as const;
export type Test043Classification = (typeof TEST043_CLASSIFICATIONS)[number];
export const TEST043_MODULES = ["industry_definition", "market_size_growth", "supply_demand_analysis", "industry_chain_analysis", "competitive_landscape", "technology_evolution", "company_mapping", "risk_analysis"] as const;
export const TEST043_SECTIONS = ["Executive Industry View", "Industry Scope & Definition", "Market Size & Growth", "Demand Structure & Drivers", "Supply, Capacity & Utilization", "Supply-Demand Balance & Pricing", "Industry Chain Map", "Value Capture & Industry Economics", "Competitive Landscape", "Technology & Product Roadmap", "Company Mapping & Exposure", "Catalysts", "Risks & Invalidation Conditions", "Key Metrics & Monitoring", "Research Gaps & Alternative Views", "Methodology & Provenance"] as const;
export const TEST043_PROVIDERS = ["official-disclosure-research-acquisition", "gdelt-research-acquisition", "miit-industry-research-acquisition", "govcn-industry-research-acquisition", "eastmoney-industry-research-acquisition", "cpca-industry-research-acquisition", "akshare-industry-research-acquisition"] as const;
export const TEST043_GAP_CAUSES = ["PROVIDER_EMPTY", "PROVIDER_EXTERNAL_FAILURE", "NO_QUALIFIED_EVIDENCE_FOR_MODULE", "EVIDENCE_ROUTING_GAP", "REASONING_OUTPUT_GAP", "CONSERVATIVE_SEMANTIC_REJECTION", "REPORT_PRESENTATION_GAP", "MODEL_SEMANTIC_NONCONFORMANCE", "NONE"] as const;

export function classifyTest043(input: {
  harnessError?: unknown; liveInconclusive?: boolean; modelSemanticNonconformance?: boolean; defect?: boolean;
  unsupportedNumericCount?: number; mandatoryIndustryDefinitionCleared?: boolean; validModelSemantics?: boolean;
  evidenceInsufficient?: boolean; workflowStatus?: string; dimensions?: Array<{ status: string }>;
}): Test043Classification {
  if (input.harnessError) return "PRODUCT_QUALITY_TEST_HARNESS_DEFECT";
  if (input.defect || (input.unsupportedNumericCount ?? 0) > 0) return "PRODUCT_QUALITY_DEFECT";
  if (input.modelSemanticNonconformance || input.liveInconclusive) return "PRODUCT_QUALITY_LIVE_INCONCLUSIVE";
  if (input.workflowStatus === "blocked" && input.mandatoryIndustryDefinitionCleared === false && input.validModelSemantics && input.evidenceInsufficient) return "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE";
  if ((input.dimensions ?? []).some((x) => x.status === "THIN" || x.status === "UNAVAILABLE")) return "FUNCTIONAL_BUT_EVIDENCE_THIN";
  return "PRODUCT_QUALITY_READY";
}

export function classifyTest043GapCause(input: { modelSemanticNonconformance?: boolean; providerFailed?: boolean; providerEmpty?: boolean; qualifiedEvidenceForModule?: boolean; routedEvidenceCount?: number; evidenceCount: number; status?: string; proposals?: number; material?: string }): string {
  if (input.modelSemanticNonconformance) return "MODEL_SEMANTIC_NONCONFORMANCE";
  if (input.providerFailed) return "PROVIDER_EXTERNAL_FAILURE";
  if (input.providerEmpty) return "PROVIDER_EMPTY";
  if (input.qualifiedEvidenceForModule && (input.routedEvidenceCount ?? 0) === 0) return "EVIDENCE_ROUTING_GAP";
  if (input.qualifiedEvidenceForModule && input.evidenceCount > 0 && input.status === "unavailable") return "REASONING_OUTPUT_GAP";
  if (input.evidenceCount > 0 && input.proposals === 0 && /supported|evidence|insight/i.test(input.material ?? "")) return "CONSERVATIVE_SEMANTIC_REJECTION";
  if (input.evidenceCount === 0) return "NO_QUALIFIED_EVIDENCE_FOR_MODULE";
  if (/research gap|unavailable|insufficient/i.test(input.material ?? "")) return "REPORT_PRESENTATION_GAP";
  return "NONE";
}

export function auditTest043Numbers(markdown: string, sourceRefs: number, claimRefs: number) {
  const assertions = (markdown.match(/(?<![A-Za-z])\d+(?:\.\d+)?\s*%?/g) ?? []).map((value) => ({ value, classification: /unavailable|gap|no validated/i.test(markdown) ? "explicitly unavailable" : claimRefs > 0 ? "canonical-backed" : sourceRefs > 0 ? "report-only-source-backed" : "unsupported" }));
  return { assertions, unsupportedNumericCount: assertions.filter((x) => x.classification === "unsupported").length };
}

export function assembleTest043ProductQualityEvidence(input: { workflow: Record<string, any>; provider: any[]; canonical: Record<string, any>; report: { sections: any[] } | null; modules: any[]; reasoning: any[]; numericalAudit: Record<string, any>; dimensions: any[]; reportSnapshot?: Record<string, any>; testHarnessError?: unknown }) {
  const sections = input.report?.sections ?? [], complete = input.workflow.status === "completed" || input.workflow.status === "succeeded";
  const referencesResolve = sections.every((s) => s.canonicalReferencesResolve !== false);
  const reportInvariants = { workflowComplete: complete, reportSectionCount: sections.length, referencesResolve, invariantsPass: complete && input.workflow.gatewaySubmitCount === 1 && Number(input.workflow.knowledgeBaseRevisionDelta ?? 0) <= 1 && input.canonical.validationStatus === "valid" && sections.length === 16 && referencesResolve };
  const def = input.modules.find((m) => m.module === "industry_definition");
  const classification = classifyTest043({ harnessError: input.testHarnessError, defect: complete && !reportInvariants.invariantsPass, unsupportedNumericCount: Number(input.numericalAudit.unsupportedNumericCount ?? 0), liveInconclusive: !complete && input.workflow.status !== "blocked", modelSemanticNonconformance: input.reasoning.some((x) => x.modelSemanticNonconformance), workflowStatus: input.workflow.status, mandatoryIndustryDefinitionCleared: def?.status !== "unavailable", validModelSemantics: !input.reasoning.some((x) => x.modelSemanticNonconformance), evidenceInsufficient: def?.status === "unavailable", dimensions: input.dimensions });
  return { workflow: input.workflow, providerCoverage: input.provider, canonical: input.canonical, reportSnapshot: input.reportSnapshot ?? { status: input.report ? "PRODUCED" : "NOT_PRODUCED", sectionCount: sections.length }, moduleMatrix: input.modules, reasoningAudit: input.reasoning, dimensions: input.dimensions, numericalAudit: input.numericalAudit, reportInvariants, ...(input.testHarnessError ? { testHarnessError: String(input.testHarnessError) } : {}), finalClassification: classification };
}
