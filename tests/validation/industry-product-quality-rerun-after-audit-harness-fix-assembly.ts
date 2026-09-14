export const TEST041_CLASSIFICATIONS = [
  "PRODUCT_QUALITY_READY",
  "FUNCTIONAL_BUT_EVIDENCE_THIN",
  "PRODUCT_QUALITY_DEFECT",
  "PRODUCT_QUALITY_LIVE_INCONCLUSIVE",
  "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE",
  "PRODUCT_QUALITY_TEST_HARNESS_DEFECT",
] as const;

export type Test041Classification = (typeof TEST041_CLASSIFICATIONS)[number];

export const TEST041_MODULES = [
  "industry_definition",
  "market_size_growth",
  "supply_demand_analysis",
  "industry_chain_analysis",
  "competitive_landscape",
  "technology_evolution",
  "company_mapping",
  "risk_analysis",
] as const;

export const TEST041_SECTIONS = [
  "Executive Industry View",
  "Industry Scope & Definition",
  "Market Size & Growth",
  "Demand Structure & Drivers",
  "Supply, Capacity & Utilization",
  "Supply-Demand Balance & Pricing",
  "Industry Chain Map",
  "Value Capture & Industry Economics",
  "Competitive Landscape",
  "Technology & Product Roadmap",
  "Company Mapping & Exposure",
  "Catalysts",
  "Risks & Invalidation Conditions",
  "Key Metrics & Monitoring",
  "Research Gaps & Alternative Views",
  "Methodology & Provenance",
] as const;

export function classifyTest041(input: {
  harnessError?: unknown;
  liveInconclusive?: boolean;
  modelSemanticNonconformance?: boolean;
  defect?: boolean;
  unsupportedNumericCount?: number;
  mandatoryIndustryDefinitionCleared?: boolean;
  validModelSemantics?: boolean;
  evidenceInsufficient?: boolean;
  dimensions?: Array<{ status: string }>;
}): Test041Classification {
  if (input.harnessError) return "PRODUCT_QUALITY_TEST_HARNESS_DEFECT";
  if (input.liveInconclusive || input.modelSemanticNonconformance)
    return "PRODUCT_QUALITY_LIVE_INCONCLUSIVE";
  if (input.defect || (input.unsupportedNumericCount ?? 0) > 0)
    return "PRODUCT_QUALITY_DEFECT";
  if (
    input.mandatoryIndustryDefinitionCleared === false &&
    input.validModelSemantics &&
    input.evidenceInsufficient
  )
    return "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE";
  if (
    (input.dimensions ?? []).some(
      (dimension) =>
        dimension.status === "THIN" || dimension.status === "UNAVAILABLE",
    )
  )
    return "FUNCTIONAL_BUT_EVIDENCE_THIN";
  return "PRODUCT_QUALITY_READY";
}

export function classifyTest041GapCause(input: {
  modelSemanticNonconformance?: boolean;
  providerFailed?: boolean;
  providerEmpty?: boolean;
  qualifiedEvidenceForModule?: boolean;
  routedEvidenceCount?: number;
  evidenceCount: number;
  status?: string;
  proposals?: number;
  material?: string;
}): string {
  if (input.modelSemanticNonconformance) return "MODEL_SEMANTIC_NONCONFORMANCE";
  if (input.providerFailed) return "PROVIDER_EXTERNAL_FAILURE";
  if (input.providerEmpty) return "PROVIDER_EMPTY";
  if (input.qualifiedEvidenceForModule && (input.routedEvidenceCount ?? 0) === 0)
    return "EVIDENCE_ROUTING_GAP";
  if (
    input.qualifiedEvidenceForModule &&
    input.evidenceCount > 0 &&
    input.status === "unavailable"
  )
    return "REASONING_OUTPUT_GAP";
  if (
    input.evidenceCount > 0 &&
    input.proposals === 0 &&
    /supported|evidence|insight/i.test(input.material ?? "")
  )
    return "CONSERVATIVE_SEMANTIC_REJECTION";
  if (input.evidenceCount === 0) return "NO_QUALIFIED_EVIDENCE_FOR_MODULE";
  if (/research gap|unavailable|insufficient/i.test(input.material ?? ""))
    return "REPORT_PRESENTATION_GAP";
  return "NONE";
}

export function auditTest041Numbers(markdown: string, sourceRefs: number, claimRefs: number) {
  const values = markdown.match(/(?<![A-Za-z])\d+(?:\.\d+)?\s*%?/g) ?? [];
  const assertions = values.map((value) => ({
    value,
    classification: /unavailable|gap|no validated/i.test(markdown)
      ? "explicitly unavailable"
      : claimRefs > 0
        ? "canonical-backed"
        : sourceRefs > 0
          ? "report-only-source-backed"
          : "unsupported",
  }));
  return {
    assertions,
    unsupportedNumericCount: assertions.filter((x) => x.classification === "unsupported").length,
  };
}

export function assembleTest041ProductQualityEvidence(input: {
  workflow: Record<string, unknown>;
  provider: unknown[];
  canonical: Record<string, unknown>;
  report: { sections: unknown[] } | null;
  modules: unknown[];
  reasoning: unknown[];
  numericalAudit: Record<string, unknown>;
  dimensions: unknown[];
  reportSnapshot?: Record<string, unknown>;
  testHarnessError?: unknown;
}) {
  const reportSections = input.report?.sections ?? [];
  const reportSectionCount = reportSections.length;
  const workflowStatus = input.workflow.status;
  const workflowComplete = workflowStatus === "completed" || workflowStatus === "succeeded";
  const referencesResolve = reportSections.every((section: any) => section.canonicalReferencesResolve !== false);
  const invariantsPass = workflowComplete &&
    input.workflow.gatewaySubmitCount === 1 &&
    Number(input.workflow.knowledgeBaseRevisionDelta ?? 0) <= 1 &&
    input.canonical.validationStatus === "valid" &&
    reportSectionCount === 16 &&
    referencesResolve;
  const finalClassification = classifyTest041({
    harnessError: input.testHarnessError,
    liveInconclusive: !workflowComplete,
    modelSemanticNonconformance: input.reasoning.some((x: any) => x.modelSemanticNonconformance),
    defect: !invariantsPass,
    unsupportedNumericCount: Number(input.numericalAudit.unsupportedNumericCount ?? 0),
    dimensions: input.dimensions as Array<{ status: string }>,
    mandatoryIndustryDefinitionCleared: input.modules.some((x: any) => x.module === "industry_definition" && x.status !== "unavailable"),
    validModelSemantics: !input.reasoning.some((x: any) => x.modelSemanticNonconformance),
    evidenceInsufficient: input.modules.some((x: any) => x.module === "industry_definition" && x.status === "unavailable"),
  });
  return {
    workflow: input.workflow,
    providerCoverage: input.provider,
    canonical: input.canonical,
    reportSnapshot: input.reportSnapshot ?? { status: input.report ? "PRODUCED" : "NOT_PRODUCED", sectionCount: reportSectionCount },
    moduleMatrix: input.modules,
    reasoningAudit: input.reasoning,
    dimensions: input.dimensions,
    numericalAudit: input.numericalAudit,
    reportInvariants: { workflowComplete, reportSectionCount, referencesResolve, invariantsPass },
    testHarnessError: input.testHarnessError ? String(input.testHarnessError) : undefined,
    finalClassification,
  };
}
