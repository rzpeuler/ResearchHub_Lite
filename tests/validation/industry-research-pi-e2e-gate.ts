export type IndustryPiGateClassification =
  | "EXECUTED / PASS GATE"
  | "REAL_MODEL_CONTRACT_BLOCKED"
  | "NOT_EXECUTED / BLOCKED";

export interface IndustryPiGateInput {
  readonly executed: boolean;
  readonly realPiReasoningExecutor: boolean;
  readonly runtimeProvider: string;
  readonly operations: readonly string[];
  readonly operationCounts: Readonly<Record<string, number>>;
  readonly status: string;
  readonly targetKind: string | null;
  readonly modules: readonly {
    readonly module: string;
    readonly status: string;
  }[];
  readonly industryDefinitionAvailable: boolean;
  readonly gatewaySubmitCount: number;
  readonly firstRunRevisionDelta: number;
  readonly durableClaimCount: number;
  readonly chainRelation: boolean;
  readonly companyExposure: boolean;
  readonly industryRoot: boolean;
  readonly productOrTechnology: boolean;
  readonly company: boolean;
  readonly sourceRawProvenance: boolean;
  readonly unsupportedNumericObservationCount: number;
  readonly semanticTypingIntact: boolean;
  readonly report: {
    readonly persisted: boolean;
    readonly reportType: string | null;
    readonly sectionCount: number;
    readonly hasResearchGaps: boolean;
  };
  readonly graph: {
    readonly profile: string | null;
    readonly canonicalRefs: boolean;
    readonly root: boolean;
    readonly productOrTechnology: boolean;
    readonly company: boolean;
    readonly requiredEdge: boolean;
  };
  readonly replay: {
    readonly outcome: string;
    readonly rootIdStable: boolean;
    readonly duplicateEntities: boolean;
    readonly duplicateRelations: boolean;
    readonly duplicateClaims: boolean;
    readonly duplicateSources: boolean;
    readonly duplicateRaw: boolean;
    readonly revisionDelta: number;
    readonly graphStable: boolean;
  };
  readonly privacy: {
    readonly serializedEvidenceSafe: boolean;
    readonly sentinelAbsent: boolean;
    readonly pathsRedacted: boolean;
    readonly secretsAbsent: boolean;
  };
}

export interface IndustryPiGateResult {
  readonly pass: boolean;
  readonly classification: IndustryPiGateClassification;
  readonly exitCode: 0 | 1;
  readonly failedGates: readonly string[];
}

const REQUIRED_MODULES = [
  "industry_definition",
  "market_size_growth",
  "supply_demand_analysis",
  "industry_chain_analysis",
  "competitive_landscape",
  "technology_evolution",
  "company_mapping",
  "risk_analysis",
] as const;

export function evaluateIndustryPiGate(
  input: IndustryPiGateInput,
): IndustryPiGateResult {
  if (!input.executed)
    return {
      pass: false,
      classification: "NOT_EXECUTED / BLOCKED",
      exitCode: 1,
      failedGates: ["real Pi execution did not start"],
    };
  const failures: string[] = [];
  if (
    !input.realPiReasoningExecutor ||
    input.runtimeProvider !== "pi-coding-agent"
  )
    failures.push("actual PiReasoningExecutor proof");
  const counts = input.operationCounts;
  if (
    !input.operations.includes("industry_research_design") ||
    (counts.industry_research_design ?? 0) < 1 ||
    (counts.industry_research_design ?? 0) > 2
  )
    failures.push("operation industry_research_design bounded count 1-2");
  if (
    !input.operations.includes("industry_module_analysis") ||
    (counts.industry_module_analysis ?? 0) < 8 ||
    (counts.industry_module_analysis ?? 0) > 32
  )
    failures.push("operation industry_module_analysis bounded count 8-32");
  if (
    !input.operations.includes("industry_cross_module_synthesis") ||
    (counts.industry_cross_module_synthesis ?? 0) < 1 ||
    (counts.industry_cross_module_synthesis ?? 0) > 2
  )
    failures.push(
      "operation industry_cross_module_synthesis bounded count 1-2",
    );
  if (input.status !== "completed") failures.push("completed Workflow status");
  if (input.targetKind !== "industry")
    failures.push("Industry target diagnosis");
  const moduleNames = input.modules.map((item) => item.module);
  if (
    moduleNames.length !== 8 ||
    new Set(moduleNames).size !== 8 ||
    REQUIRED_MODULES.some((module) => !moduleNames.includes(module))
  )
    failures.push("all eight methodology modules exactly once");
  if (!input.industryDefinitionAvailable)
    failures.push("Industry Definition available");
  if (input.gatewaySubmitCount !== 1) failures.push("one Gateway submission");
  if (input.firstRunRevisionDelta !== 1)
    failures.push("first-run revision delta equals one");
  if (input.durableClaimCount < 1) failures.push("durable Claim admitted");
  if (!input.chainRelation)
    failures.push("evidence-backed chain Relation admitted");
  if (!input.companyExposure)
    failures.push("evidence-backed Company exposure admitted");
  if (!input.industryRoot || !input.productOrTechnology || !input.company)
    failures.push("canonical Industry/Product-or-Technology/Company objects");
  if (!input.sourceRawProvenance) failures.push("Source/Raw provenance");
  if (input.unsupportedNumericObservationCount !== 0)
    failures.push("unsupported numeric audit");
  if (!input.semanticTypingIntact) failures.push("semantic Claim typing");
  if (
    !input.report.persisted ||
    input.report.reportType !== "industry_research" ||
    input.report.sectionCount !== 16 ||
    !input.report.hasResearchGaps
  )
    failures.push("industry report contract");
  if (
    input.graph.profile !== "industry_context" ||
    !input.graph.canonicalRefs ||
    !input.graph.root ||
    !input.graph.productOrTechnology ||
    !input.graph.company ||
    !input.graph.requiredEdge
  )
    failures.push("canonical industry graph contract");
  const replay = input.replay;
  if (replay.outcome !== "no_changes" && replay.outcome !== "already_committed")
    failures.push("deterministic replay non-mutating outcome");
  if (
    !replay.rootIdStable ||
    replay.duplicateEntities ||
    replay.duplicateRelations ||
    replay.duplicateClaims ||
    replay.duplicateSources ||
    replay.duplicateRaw ||
    replay.revisionDelta !== 0 ||
    !replay.graphStable
  )
    failures.push("deterministic semantic-bundle replay");
  if (
    !input.privacy.serializedEvidenceSafe ||
    !input.privacy.sentinelAbsent ||
    !input.privacy.pathsRedacted ||
    !input.privacy.secretsAbsent
  )
    failures.push("telemetry/privacy boundary");
  return {
    pass: failures.length === 0,
    classification:
      failures.length === 0
        ? "EXECUTED / PASS GATE"
        : "REAL_MODEL_CONTRACT_BLOCKED",
    exitCode: failures.length === 0 ? 0 : 1,
    failedGates: failures,
  };
}
