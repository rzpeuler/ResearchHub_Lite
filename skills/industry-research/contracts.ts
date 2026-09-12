import type { NormalizedResearchSource } from "../../plugins/research-acquisition/contracts.ts";
import type { SemanticProductionProposal } from "../../knowledge/production/contracts.ts";
export const INDUSTRY_MODULES = [
  "industry_definition",
  "market_size_growth",
  "supply_demand_analysis",
  "industry_chain_analysis",
  "competitive_landscape",
  "technology_evolution",
  "company_mapping",
  "risk_analysis",
] as const;
export type IndustryResearchModule = (typeof INDUSTRY_MODULES)[number];
export type IndustryTargetKind =
  "industry" | "theme" | "product" | "technology" | "uncertain";
export const INDUSTRY_RELATION_TYPES = [
  "upstream_of",
  "business_exposure",
  "belongs_to_industry",
  "offers_product",
  "component_of",
  "develops_technology",
  "uses_technology",
  "applied_in",
  "depends_on",
  "substitutes_for",
  "competes_with",
  "supplier_of",
] as const;
export const INDUSTRY_CLAIM_TYPES = [
  "fact",
  "forecast",
  "viewpoint",
  "trend",
  "risk",
  "assumption",
  "thesis",
  "catalyst",
] as const;
export const INDUSTRY_MODEL_BOUNDS = {
  maxString: 2000,
  maxAnalysis: 6000,
  maxArray: 32,
  maxEvidence: 32,
  maxProposals: 24,
  maxGaps: 16,
  maxAlternatives: 6,
  maxExistingKnowledge: 80,
  maxEvidenceExcerpt: 2400,
  maxPriorOutput: 6000,
  maxDiagnostics: 1200,
  maxDepth: 3,
} as const;
export interface IndustryTargetInput {
  readonly name: string;
  readonly canonicalRef?: string;
  readonly aliases?: readonly string[];
  readonly geography?: string;
  readonly asOf?: string;
}
export interface ResearchGap {
  readonly gapId: string;
  readonly module: IndustryResearchModule;
  readonly question: string;
  readonly reason: string;
  readonly actionable: boolean;
  readonly searchTerms?: readonly string[];
}
export interface ResearchDesign {
  readonly definitionHypothesis: string;
  readonly targetKind: IndustryTargetKind;
  readonly scope: {
    readonly included: readonly string[];
    readonly excluded: readonly string[];
  };
  readonly moduleQuestions: Readonly<Record<IndustryResearchModule, string>>;
  readonly keyMetrics: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly searchTerms: readonly string[];
  readonly knownGaps: readonly ResearchGap[];
  readonly verificationCandidates: readonly {
    readonly name: string;
    readonly kind: "product" | "technology" | "industry" | "company";
    readonly reason: string;
  }[];
}
export interface ModuleEvidence {
  readonly evidenceId: string;
  readonly source: NormalizedResearchSource;
  readonly excerpt?: string;
}
export interface LocalReportMaterial {
  readonly markdown: string;
  readonly evidenceIds: readonly string[];
  readonly proposalIds: readonly string[];
  readonly relationProposalIds?: readonly string[];
  readonly reportOnly?: boolean;
}
export interface IndustryModuleResult {
  readonly module: IndustryResearchModule;
  readonly status: "supported" | "partial" | "unavailable";
  readonly analysis: string;
  readonly evidenceIds: readonly string[];
  readonly proposals: readonly SemanticProductionProposal[];
  readonly gaps: readonly ResearchGap[];
  readonly reportMaterial: LocalReportMaterial;
}
export interface CrossModuleSynthesis {
  readonly executiveView: string;
  readonly analysis: string;
  readonly evidenceIds: readonly string[];
  readonly proposals: readonly SemanticProductionProposal[];
  readonly gaps: readonly ResearchGap[];
  readonly alternativeViews: readonly string[];
  readonly reportMaterial: LocalReportMaterial;
}
export interface IndustryResearchSkillInput {
  readonly target: IndustryTargetInput;
  readonly designContext?: unknown;
  readonly evidence: readonly ModuleEvidence[];
  readonly existingKnowledge: readonly unknown[];
  readonly localReferences: readonly string[];
}
export const ALL_INDUSTRY_OPERATION_NAMES = [
  "industry_research_design",
  "industry_module_analysis",
  "industry_cross_module_synthesis",
] as const;
export type IndustryOperationName =
  (typeof ALL_INDUSTRY_OPERATION_NAMES)[number];
const boundedString = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
});
const strings = (minItems = 1, maxItems = INDUSTRY_MODEL_BOUNDS.maxArray) => ({
  type: "array",
  minItems,
  maxItems,
  uniqueItems: true,
  items: boundedString(INDUSTRY_MODEL_BOUNDS.maxString),
});
const gap = {
  type: "object",
  additionalProperties: false,
  required: ["gapId", "module", "question", "reason", "actionable"],
  properties: {
    gapId: boundedString(120),
    module: { enum: [...INDUSTRY_MODULES] },
    question: boundedString(500),
    reason: boundedString(1000),
    actionable: { type: "boolean" },
    searchTerms: strings(1, INDUSTRY_MODEL_BOUNDS.maxArray),
  },
};
const verificationCandidate = {
  type: "object",
  additionalProperties: false,
  required: ["name", "kind", "reason"],
  properties: {
    name: boundedString(300),
    kind: { enum: ["product", "technology", "industry", "company"] },
    reason: boundedString(1000),
  },
};
const localId = {
  type: "string",
  pattern: "^[A-Za-z][A-Za-z0-9._-]*$",
  maxLength: 120,
  description:
    "Local ID only; never canonical entity:, relation:, claim:, source:, raw:, changeset: or review-case:.",
};
const evidenceRefs = (allowed: readonly string[]) => ({
  type: "array",
  minItems: 0,
  maxItems: INDUSTRY_MODEL_BOUNDS.maxEvidence,
  uniqueItems: true,
  items: allowed.length ? { enum: [...allowed] } : boundedString(120),
  description: allowed.length
    ? `Exact evidence allowlist: ${allowed.join(", ")}`
    : "No evidence is available; keep this empty.",
});
const structuredValue = {
  type: "object",
  additionalProperties: false,
  required: ["metric", "value", "unit", "comparator"],
  anyOf: [{ required: ["period"] }, { required: ["fiscalPeriod"] }],
  properties: {
    metric: boundedString(200),
    value: {},
    unit: boundedString(80),
    comparator: boundedString(40),
    period: boundedString(80),
    fiscalPeriod: boundedString(80),
    geography: boundedString(200),
    measurementDefinition: boundedString(500),
    sourceMethodology: boundedString(500),
  },
};
const entityProposal = {
  type: "object",
  additionalProperties: false,
  required: ["proposalId", "kind", "subjectKey", "entityType", "entityName"],
  properties: {
    proposalId: localId,
    kind: { const: "entity" },
    subjectKey: localId,
    entityType: { enum: ["industry", "product", "technology", "company"] },
    entityName: boundedString(300),
  },
};
const relationProposal = (allowed: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "proposalId",
    "kind",
    "subjectKey",
    "targetKey",
    "relationType",
    "sourceCandidateIds",
  ],
  properties: {
    proposalId: localId,
    kind: { const: "relation" },
    subjectKey: localId,
    targetKey: localId,
    relationType: { enum: [...INDUSTRY_RELATION_TYPES] },
    sourceCandidateIds: evidenceRefs(allowed),
  },
});
const claimProposal = (allowed: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "proposalId",
    "kind",
    "subjectKey",
    "claimType",
    "statement",
    "sourceCandidateIds",
  ],
  properties: {
    proposalId: localId,
    kind: { const: "claim" },
    subjectKey: localId,
    claimType: { enum: [...INDUSTRY_CLAIM_TYPES] },
    statement: boundedString(2000),
    sourceCandidateIds: evidenceRefs(allowed),
    structuredValue,
  },
});
const proposalVariants = (allowed: readonly string[]) => ({
  oneOf: [entityProposal, relationProposal(allowed), claimProposal(allowed)],
  description: "Exactly one kind-specific proposal variant; all IDs are local.",
});
const material = (
  allowedEvidence: readonly string[],
  allowedProposals: readonly string[] = [],
) => ({
  type: "object",
  additionalProperties: false,
  required: ["markdown", "evidenceIds", "proposalIds"],
  properties: {
    markdown: boundedString(6000),
    evidenceIds: evidenceRefs(allowedEvidence),
    proposalIds: {
      type: "array",
      minItems: 0,
      maxItems: 24,
      uniqueItems: true,
      items: allowedProposals.length
        ? { enum: [...allowedProposals] }
        : localId,
    },
    relationProposalIds: {
      type: "array",
      minItems: 0,
      maxItems: 24,
      uniqueItems: true,
      items: allowedProposals.length
        ? { enum: [...allowedProposals] }
        : localId,
    },
    reportOnly: { type: "boolean" },
  },
});
export const INDUSTRY_RESEARCH_DESIGN_CONTRACT = {
  name: "IndustryResearchDesign",
  type: "object",
  additionalProperties: false,
  required: [
    "definitionHypothesis",
    "targetKind",
    "scope",
    "moduleQuestions",
    "keyMetrics",
    "evidenceRequirements",
    "searchTerms",
    "knownGaps",
    "verificationCandidates",
  ],
  bounds: INDUSTRY_MODEL_BOUNDS,
  properties: {
    definitionHypothesis: boundedString(1200),
    targetKind: {
      enum: ["industry", "theme", "product", "technology", "uncertain"],
    },
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["included", "excluded"],
      properties: { included: strings(0), excluded: strings(0) },
    },
    moduleQuestions: {
      type: "object",
      additionalProperties: false,
      required: [...INDUSTRY_MODULES],
      properties: Object.fromEntries(
        INDUSTRY_MODULES.map((m) => [m, boundedString(800)]),
      ),
    },
    keyMetrics: strings(),
    evidenceRequirements: strings(),
    searchTerms: strings(),
    knownGaps: { type: "array", minItems: 0, maxItems: 16, items: gap },
    verificationCandidates: {
      type: "array",
      minItems: 0,
      maxItems: 16,
      items: verificationCandidate,
    },
  },
};
export const createIndustryModuleResultContract = (
  module: IndustryResearchModule,
  allowedEvidence: readonly string[],
  allowedProposals: readonly string[] = [],
) => ({
  name: "IndustryModuleResult",
  type: "object",
  additionalProperties: false,
  required: [
    "module",
    "status",
    "analysis",
    "evidenceIds",
    "proposals",
    "gaps",
    "reportMaterial",
  ],
  bounds: INDUSTRY_MODEL_BOUNDS,
  properties: {
    module: { const: module },
    status: { enum: ["supported", "partial", "unavailable"] },
    analysis: boundedString(INDUSTRY_MODEL_BOUNDS.maxAnalysis),
    evidenceIds: evidenceRefs(allowedEvidence),
    proposals: {
      type: "array",
      minItems: 0,
      maxItems: 24,
      items: proposalVariants(allowedEvidence),
    },
    gaps: { type: "array", minItems: 0, maxItems: 16, items: gap },
    reportMaterial: material(allowedEvidence, allowedProposals),
  },
  allowlists: {
    evidenceIds: [...allowedEvidence],
    existingProposalIds: [...allowedProposals],
  },
  proposalRules:
    "Claim and Relation candidates require supplied evidence; Entity candidates may be evidence-free.",
});
export const INDUSTRY_MODULE_RESULT_CONTRACT =
  createIndustryModuleResultContract("industry_definition", []);
export const createIndustrySynthesisContract = (
  allowedEvidence: readonly string[],
  allowedProposals: readonly string[] = [],
  allowedRelations: readonly string[] = [],
) => ({
  name: "CrossModuleSynthesis",
  type: "object",
  additionalProperties: false,
  required: [
    "executiveView",
    "analysis",
    "evidenceIds",
    "proposals",
    "gaps",
    "alternativeViews",
    "reportMaterial",
  ],
  bounds: INDUSTRY_MODEL_BOUNDS,
  properties: {
    executiveView: boundedString(3000),
    analysis: boundedString(INDUSTRY_MODEL_BOUNDS.maxAnalysis),
    evidenceIds: evidenceRefs(allowedEvidence),
    proposals: {
      type: "array",
      minItems: 0,
      maxItems: 24,
      items: proposalVariants(allowedEvidence),
    },
    gaps: { type: "array", minItems: 0, maxItems: 16, items: gap },
    alternativeViews: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: boundedString(1200),
    },
    reportMaterial: {
      ...material(allowedEvidence, [...allowedProposals, ...allowedRelations]),
      properties: {
        ...material(allowedEvidence, [...allowedProposals, ...allowedRelations])
          .properties,
        relationProposalIds: {
          type: "array",
          minItems: 0,
          maxItems: 24,
          uniqueItems: true,
          items: allowedRelations.length
            ? { enum: [...allowedRelations] }
            : localId,
        },
      },
    },
  },
  allowlists: {
    evidenceIds: [...allowedEvidence],
    existingProposalIds: [...allowedProposals],
    existingRelationProposalIds: [...allowedRelations],
  },
  proposalRules:
    "New proposal IDs are local; references are restricted to the supplied validated sets.",
});
export const INDUSTRY_SYNTHESIS_CONTRACT = createIndustrySynthesisContract(
  [],
  [],
  [],
);
