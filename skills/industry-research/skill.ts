// @ts-nocheck
import type {
  ReasoningExecutor,
  ReasoningOperation,
} from "../../plugins/reasoning/contracts.ts";
import type { SemanticProductionProposal } from "../../knowledge/production/contracts.ts";
import {
  INDUSTRY_MODULES,
  INDUSTRY_CLAIM_TYPES,
  INDUSTRY_RELATION_TYPES,
  INDUSTRY_RESEARCH_DESIGN_CONTRACT,
  createIndustryModuleResultContract,
  createIndustrySynthesisContract,
  type CrossModuleSynthesis,
  type IndustryModuleResult,
  type IndustryResearchModule,
  type IndustryResearchSkillInput,
  type LocalReportMaterial,
  type ResearchDesign,
  type ResearchGap,
} from "./contracts.ts";
type R = Record<string, unknown>;
const obj = (v: unknown): v is R =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const canon = /^(entity|relation|claim|source|raw|changeset|review-case):/i,
  ident = /^[A-Za-z][A-Za-z0-9._-]*$/;
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";
const arr = (v: unknown): v is readonly unknown[] => Array.isArray(v);
const uniq = (v: unknown): v is readonly string[] =>
  arr(v) && v.every(text) && new Set(v).size === v.length;
const local = (v: unknown): v is string =>
  typeof v === "string" && ident.test(v) && !canon.test(v);
const finite = (v: unknown) =>
  typeof v === "number"
    ? Number.isFinite(v)
    : typeof v === "string"
      ? v.trim() !== ""
      : typeof v === "boolean";
export type IndustryDiagnosticCode =
  | "target_diagnosis_invalid"
  | "scope_invalid"
  | "module_question_set_invalid"
  | "module_question_value_invalid"
  | "key_metrics_invalid"
  | "evidence_requirements_invalid"
  | "search_terms_invalid"
  | "known_gap_invalid"
  | "verification_candidate_invalid"
  | "module_shape_invalid"
  | "module_evidence_invalid"
  | "proposal_invalid"
  | "report_material_invalid"
  | "synthesis_shape_invalid"
  | "synthesis_evidence_invalid";
export class IndustryValidationError extends Error {
  constructor(
    readonly code: IndustryDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = "IndustryValidationError";
  }
}
const fail = (code: IndustryDiagnosticCode, message: string): never => {
  throw new IndustryValidationError(code, message);
};
const boundedText = (v: unknown, max: number) => text(v) && v.length <= max;
const boundedArray = (v: unknown, max: number, min = 0) =>
  arr(v) && v.length >= min && v.length <= max;
export function validateIndustryResearchDesign(v: unknown): ResearchDesign {
  if (
    !obj(v) ||
    !boundedText(v.definitionHypothesis, 1200) ||
    !["industry", "theme", "product", "technology", "uncertain"].includes(
      String(v.targetKind),
    )
  )
    fail(
      "target_diagnosis_invalid",
      "Invalid Industry Research Design target diagnosis",
    );
  if (
    !obj(v.scope) ||
    !boundedArray(v.scope.included, 32) ||
    !boundedArray(v.scope.excluded, 32) ||
    v.scope.included.some((x) => !boundedText(x, 2000)) ||
    v.scope.excluded.some((x) => !boundedText(x, 2000))
  )
    fail("scope_invalid", "Invalid Industry Research Design scope");
  const questions = obj(v.moduleQuestions) ? v.moduleQuestions : {};
  if (
    !obj(v.moduleQuestions) ||
    Object.keys(questions).some(
      (k) => !INDUSTRY_MODULES.includes(k as IndustryResearchModule),
    ) ||
    INDUSTRY_MODULES.some((m) => !(m in questions))
  )
    fail(
      "module_question_set_invalid",
      "Research Design must contain all eight module questions",
    );
  if (INDUSTRY_MODULES.some((m) => !boundedText(questions[m], 800)))
    fail(
      "module_question_value_invalid",
      "Research Design module question must be a bounded non-empty string",
    );
  for (const k of [
    "keyMetrics",
    "evidenceRequirements",
    "searchTerms",
  ] as const)
    if (
      !uniq(v[k]) ||
      !(v[k] as unknown[]).length ||
      (v[k] as unknown[]).length > 32 ||
      (v[k] as unknown[]).some((x) => x.length > 2000)
    )
      fail(
        `${k === "keyMetrics" ? "key_metrics" : k === "evidenceRequirements" ? "evidence_requirements" : "search_terms"}_invalid` as IndustryDiagnosticCode,
        `Research Design ${k} must be a non-empty string array`,
      );
  if (!boundedArray(v.knownGaps, 16))
    fail(
      "known_gap_invalid",
      "Research Design knownGaps must be a bounded array",
    );
  const gs = new Set<string>();
  for (const g of v.knownGaps) {
    if (
      !obj(g) ||
      !local(g.gapId) ||
      gs.has(String(g.gapId)) ||
      !INDUSTRY_MODULES.includes(g.module as IndustryResearchModule) ||
      !boundedText(g.question, 500) ||
      !boundedText(g.reason, 1000) ||
      typeof g.actionable !== "boolean" ||
      (g.searchTerms !== undefined &&
        (!uniq(g.searchTerms) ||
          (g.searchTerms as readonly string[]).length > 32 ||
          (g.searchTerms as readonly string[]).some((x) => x.length > 2000)))
    )
      fail("known_gap_invalid", "Invalid Research Design known gap");
    gs.add(String(g.gapId));
  }
  if (
    !boundedArray(v.verificationCandidates, 16) ||
    v.verificationCandidates.some(
      (c) =>
        !obj(c) ||
        !boundedText(c.name, 300) ||
        !["product", "technology", "industry", "company"].includes(
          String(c.kind),
        ) ||
        !boundedText(c.reason, 1000),
    )
  )
    fail("verification_candidate_invalid", "Invalid verification candidate");
  return v as unknown as ResearchDesign;
}
function proposal(
  v: unknown,
  ev: Set<string>,
  seen: Set<string>,
): SemanticProductionProposal {
  if (
    !obj(v) ||
    !local(v.proposalId) ||
    seen.has(v.proposalId) ||
    [v.proposalId, v.subjectKey, v.targetKey].some(
      (x) => x !== undefined && canon.test(String(x)),
    )
  )
    fail(
      "proposal_invalid",
      "Proposal contains canonical-looking identifier or duplicate local ID",
    );
  if (
    !["entity", "relation", "claim"].includes(String(v.kind)) ||
    !local(v.subjectKey) ||
    (v.targetKey !== undefined && !local(v.targetKey))
  )
    fail("proposal_invalid", "Unsupported or unsafe semantic proposal");
  if (
    v.kind === "entity" &&
    (!["industry", "product", "technology", "company"].includes(
      String(v.entityType),
    ) ||
      !text(v.entityName))
  )
    fail("proposal_invalid", "Unsupported Entity proposal");
  if (v.kind === "relation" && (!text(v.relationType) || !text(v.targetKey)))
    fail("proposal_invalid", "Invalid Relation proposal");
  if (
    v.kind === "claim" &&
    (!INDUSTRY_CLAIM_TYPES.includes(v.claimType as any) || !text(v.statement))
  )
    fail("proposal_invalid", "Invalid Claim proposal");
  if (
    v.sourceCandidateIds !== undefined &&
    (!uniq(v.sourceCandidateIds) ||
      v.sourceCandidateIds.some((x) => !ev.has(x)))
  )
    fail("module_evidence_invalid", "Proposal references unknown evidence");
  if (
    v.existingKnowledgeRefs !== undefined ||
    ["update", "supersede", "contradict", "review"].includes(
      String(v.resolution),
    )
  )
    fail(
      "proposal_invalid",
      "Industry Skill cannot own canonical resolution or existing-Knowledge references",
    );
  for (const k of [
    "supportsProposalIds",
    "dependsOnProposalIds",
    "contradictsProposalIds",
  ] as const)
    if (v[k] !== undefined && (!uniq(v[k]) || v[k].some((x) => !local(x))))
      fail("proposal_invalid", "Proposal contains invalid local link");
  if (v.kind === "claim" && v.structuredValue != null) {
    const x = v.structuredValue;
    if (
      !obj(x) ||
      !text(x.metric) ||
      !("value" in x) ||
      !finite(x.value) ||
      !text(x.unit) ||
      !text(x.comparator) ||
      (x.period !== undefined && !text(x.period)) ||
      (x.fiscalPeriod !== undefined && !text(x.fiscalPeriod))
    )
      fail("proposal_invalid", "Malformed quantitative structured value");
  }
  seen.add(v.proposalId);
  return v as unknown as SemanticProductionProposal;
}
function gapList(v: unknown, module?: IndustryResearchModule): ResearchGap[] {
  if (!arr(v) || v.length > 16)
    fail("module_shape_invalid", "gaps must be a bounded array");
  const s = new Set<string>();
  return v.map((g) => {
    if (
      !obj(g) ||
      !local(g.gapId) ||
      s.has(String(g.gapId)) ||
      (module !== undefined && g.module !== module) ||
      !INDUSTRY_MODULES.includes(g.module as IndustryResearchModule) ||
      !text(g.question) ||
      !text(g.reason) ||
      typeof g.actionable !== "boolean" ||
      (g.searchTerms !== undefined &&
        (!uniq(g.searchTerms) ||
          (g.searchTerms as readonly string[]).length > 32))
    )
      fail("module_shape_invalid", "Invalid Research Gap");
    s.add(String(g.gapId));
    return g as unknown as ResearchGap;
  });
}
function material(
  v: unknown,
  ev: Set<string>,
  ps: Set<string>,
  rs: Set<string>,
): LocalReportMaterial {
  if (
    !obj(v) ||
    !text(v.markdown) ||
    v.markdown.length > 6000 ||
    !uniq(v.evidenceIds) ||
    v.evidenceIds.some((x) => !ev.has(x)) ||
    !uniq(v.proposalIds) ||
    v.proposalIds.some((x) => !ps.has(x)) ||
    (v.relationProposalIds !== undefined &&
      (!uniq(v.relationProposalIds) ||
        v.relationProposalIds.some((x) => !rs.has(x))))
  )
    fail("report_material_invalid", "Invalid local report material");
  return v as unknown as LocalReportMaterial;
}
function links(
  ps: readonly SemanticProductionProposal[],
  allowed: Set<string>,
) {
  for (const p of ps)
    for (const k of [
      "supportsProposalIds",
      "dependsOnProposalIds",
      "contradictsProposalIds",
    ] as const)
      if ((p[k] ?? []).some((x) => x === p.proposalId || !allowed.has(x)))
        fail("proposal_invalid", "Proposal contains unresolved local link");
}
export function validateIndustryModuleResult(
  v: unknown,
  module: IndustryResearchModule,
  supplied: readonly string[],
): IndustryModuleResult {
  if (
    !obj(v) ||
    v.module !== module ||
    !["supported", "partial", "unavailable"].includes(String(v.status)) ||
    !boundedText(v.analysis, 6000) ||
    !uniq(v.evidenceIds) ||
    v.evidenceIds.some((x) => !supplied.includes(x)) ||
    !arr(v.proposals) ||
    v.proposals.length > 24
  )
    fail(
      "module_shape_invalid",
      "Invalid bounded module result or evidence escape",
    );
  const ev = new Set(supplied),
    seen = new Set<string>(),
    ps = v.proposals.map((x) => proposal(x, ev, seen));
  links(ps, seen);
  const ids = new Set(ps.map((x) => x.proposalId)),
    rs = new Set(
      ps.filter((x) => x.kind === "relation").map((x) => x.proposalId),
    );
  return {
    module,
    status: v.status as IndustryModuleResult["status"],
    analysis: v.analysis,
    evidenceIds: v.evidenceIds as string[],
    proposals: ps,
    gaps: gapList(v.gaps, module),
    reportMaterial: material(v.reportMaterial, ev, ids, rs),
  };
}
export function validateCrossModuleSynthesis(
  v: unknown,
  supplied: readonly string[],
  moduleIds: readonly string[],
  moduleRelationIds: readonly string[] = [],
): CrossModuleSynthesis {
  if (
    !obj(v) ||
    !boundedText(v.executiveView, 3000) ||
    !boundedText(v.analysis, 6000) ||
    !uniq(v.evidenceIds) ||
    v.evidenceIds.some((x) => !supplied.includes(x)) ||
    !arr(v.proposals) ||
    v.proposals.length > 24 ||
    !uniq(v.alternativeViews) ||
    v.alternativeViews.length > 6 ||
    v.alternativeViews.some((x) => x.length > 1200)
  )
    fail("synthesis_shape_invalid", "Invalid cross-module synthesis evidence");
  const ev = new Set(supplied),
    seen = new Set(moduleIds),
    ps = v.proposals.map((x) => proposal(x, ev, seen));
  links(ps, seen);
  const rs = new Set([
      ...moduleRelationIds,
      ...ps.filter((p) => p.kind === "relation").map((p) => p.proposalId),
    ]),
    all = new Set([...moduleIds, ...ps.map((p) => p.proposalId)]);
  return {
    executiveView: v.executiveView,
    analysis: v.analysis,
    evidenceIds: v.evidenceIds as string[],
    proposals: ps,
    gaps: gapList(v.gaps),
    alternativeViews: v.alternativeViews as string[],
    reportMaterial: material(v.reportMaterial, ev, all, rs),
  };
}
export function parseIndustryReasoningObject(
  x: unknown,
): Record<string, unknown> {
  let v = x;
  for (let i = 0; i < 3; i++) {
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        throw new Error("Industry semantic output is not JSON");
      }
    }
    if (!obj(v))
      throw new Error("Industry semantic output must be a JSON object");
    const record = v as R;
    const k = ["result", "output", "data", "structuredOutput", "response"].find(
      (key) => Object.keys(record).length === 1 && key in record,
    );
    if (!k) return record;
    v = record[k];
  }
  throw new Error("Industry semantic output wrapper depth exceeded");
}
const unwrap = parseIndustryReasoningObject;
function boundedJson(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[bounded]";
  if (typeof value === "string") return value.slice(0, 2000);
  if (Array.isArray(value))
    return value
      .slice(0, depth === 0 ? 80 : 32)
      .map((x) => boundedJson(x, depth + 1));
  if (obj(value))
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 32)
        .map(([k, v]) => [k.slice(0, 120), boundedJson(v, depth + 1)]),
    );
  return value;
}
function knowledge(k: readonly unknown[]) {
  return boundedJson(k.slice(0, 80));
}
function evidence(
  es: readonly IndustryResearchSkillInput["evidence"][number][],
): Array<{ evidenceId: string }> {
  return es.slice(0, 32).map((e) => ({
    evidenceId: e.evidenceId,
    title: e.source.title.slice(0, 300),
    publisher: e.source.publisher.slice(0, 300),
    provider: e.source.candidate.provider,
    sourceKind: e.source.candidate.kind,
    tier: e.source.candidate.tier,
    publishedAt: e.source.candidate.publishedAt,
    metadata: boundedJson(e.source.candidate.metadata),
    excerpt: (e.excerpt ?? e.source.content).slice(0, 2400),
  }));
}
const instruction = {
  design:
    "Return exactly the bounded IndustryResearchDesign object. Ontology: independently researchable economic/industrial-chain activity=industry; broad cross-industry concept=theme; commercial category/component=product; technical route/process/architecture=technology; insufficiently resolvable=uncertain. Use all eight exact module keys and the explicit property schemas. This is a plan only: no canonical IDs, Knowledge writes, unsupported numbers, or durable proposals.",
  module:
    "Return exactly the bounded IndustryModuleResult for the requested module. The contract fixes module to the requested module and exposes the exact evidence allowlist. Copy evidence IDs exactly; if empty, keep evidenceIds/proposals empty and use partial/unavailable plus explicit gaps. Use local IDs only; industry is the reserved root key. Relations use only frozen names. Claim/Relation candidates require evidence; quantitative claims require metric, finite value, unit, comparator and period or fiscalPeriod. Never invent unsupported numbers. supplier_of requires direct authoritative evidence. No canonical writes.",
  synthesis:
    "Return exactly the bounded CrossModuleSynthesis using only validated modules and supplied evidence. Copy evidence and existing proposal/Relation IDs only from the explicit allowlists; new IDs are local. Keep concrete gap and alternative-view item schemas bounded. No new facts, unsupported numbers, canonical IDs, resolution ownership, or Knowledge writes.",
};
export class IndustryResearchSkill {
  constructor(private readonly executor: ReasoningExecutor) {}
  private async call(
    op: ReasoningOperation,
    input: unknown,
    contract: unknown,
    repair = false,
    prior?: unknown,
    diagnostic?: unknown,
  ) {
    const context = repair
      ? ` Repair invocation: Prior: correct the candidate. Diagnostics: ${JSON.stringify(diagnostic)}.${prior === undefined ? " No usable prior object was parsed." : ` Prior: ${JSON.stringify(boundedJson(prior)).slice(0, 6000)}`}`
      : "";
    const text =
      op === "industry_research_design"
        ? instruction.design
        : op === "industry_module_analysis"
          ? instruction.module
          : instruction.synthesis;
    return unwrap(
      (
        await this.executor.execute({
          operation: op,
          instruction: text + context,
          input,
          outputContract: contract,
        })
      ).output,
    );
  }
  async design(input: {
    target: IndustryResearchSkillInput["target"];
    existingKnowledge: readonly unknown[];
  }) {
    const inputBound = {
      target: input.target,
      existingKnowledge: knowledge(input.existingKnowledge),
    };
    let prior: unknown;
    try {
      prior = await this.call(
        "industry_research_design",
        inputBound,
        INDUSTRY_RESEARCH_DESIGN_CONTRACT,
      );
      return validateIndustryResearchDesign(prior);
    } catch (e) {
      const codes = [
        e instanceof IndustryValidationError ? e.code : "parser_failure",
      ];
      try {
        prior = await this.call(
          "industry_research_design",
          inputBound,
          INDUSTRY_RESEARCH_DESIGN_CONTRACT,
          true,
          prior,
          codes,
        );
        return validateIndustryResearchDesign(prior);
      } catch (second) {
        throw second;
      }
    }
  }
  async analyze(
    module: IndustryResearchModule,
    input: IndustryResearchSkillInput,
  ): Promise<IndustryModuleResult> {
    const ev = evidence(input.evidence),
      bound = {
        module,
        target: input.target,
        evidence: ev,
        existingKnowledge: knowledge(input.existingKnowledge),
        localReferences: input.localReferences.slice(0, 32),
      },
      contract = createIndustryModuleResultContract(
        module,
        ev.map((x) => x.evidenceId),
        input.localReferences.slice(0, 32),
      );
    let prior: unknown;
    try {
      prior = await this.call("industry_module_analysis", bound, contract);
      return validateIndustryModuleResult(
        prior,
        module,
        ev.map((x) => x.evidenceId),
      );
    } catch (e) {
      try {
        return validateIndustryModuleResult(
          await this.call(
            "industry_module_analysis",
            bound,
            contract,
            true,
            prior,
            [e instanceof IndustryValidationError ? e.code : "parser_failure"],
          ),
          module,
          ev.map((x) => x.evidenceId),
        );
      } catch (second) {
        return {
          module,
          status: "unavailable",
          analysis: "Module reasoning failed after one bounded repair attempt.",
          evidenceIds: [],
          proposals: [],
          gaps: [
            {
              gapId: `${module}-failure`,
              module,
              question: "What evidence is required?",
              reason:
                second instanceof Error ? second.message : "validation failed",
              actionable: true,
            },
          ],
          reportMaterial: {
            markdown: "Module unavailable.",
            evidenceIds: [],
            proposalIds: [],
          },
        };
      }
    }
  }
  async synthesize(input: {
    modules: readonly IndustryModuleResult[];
    evidence: readonly IndustryResearchSkillInput["evidence"][number][];
    existingKnowledge?: readonly unknown[];
  }) {
    const bound = {
      modules: input.modules,
      evidence: evidence(input.evidence),
      existingKnowledge: knowledge(input.existingKnowledge ?? []),
    };
    const ev = input.evidence.map((x) => x.evidenceId),
      ids = input.modules.flatMap((m) => m.proposals.map((p) => p.proposalId)),
      rels = input.modules.flatMap((m) =>
        m.proposals
          .filter((p) => p.kind === "relation")
          .map((p) => p.proposalId),
      ),
      contract = createIndustrySynthesisContract(ev, ids, rels);
    let prior: unknown;
    try {
      prior = await this.call(
        "industry_cross_module_synthesis",
        bound,
        contract,
      );
      return validateCrossModuleSynthesis(prior, ev, ids, rels);
    } catch (e) {
      return validateCrossModuleSynthesis(
        await this.call(
          "industry_cross_module_synthesis",
          bound,
          contract,
          true,
          prior,
          [e instanceof IndustryValidationError ? e.code : "parser_failure"],
        ),
        ev,
        ids,
        rels,
      );
    }
  }
}
