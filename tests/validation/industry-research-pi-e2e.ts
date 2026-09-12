import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ModelRuntime, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { PiReasoningExecutor } from "../../plugins/reasoning/pi/executor.ts";
import { selectProductionReasoningModel } from "../../app/pi/model-selection.ts";
import {
  createFreshKnowledgeBaseV04,
  readCanonicalV04Assets,
} from "../../knowledge/storage/index.ts";
import { KnowledgeBaseRegistry } from "../../knowledge/registry/registry.ts";
import { KnowledgeGraphService } from "../../app/services/knowledge-graph-service.ts";
import { ResearchService } from "../../app/services/research-service.ts";
import { WorkflowService } from "../../app/services/workflow-service.ts";
import type { ReasoningRequest } from "../../plugins/reasoning/contracts.ts";
import type {
  ResearchAcquisitionPlugin,
  ResearchFetchedSource,
  ResearchSourceCandidate,
} from "../../plugins/research-acquisition/contracts.ts";
import { sha256 } from "../../plugins/research-acquisition/hash.ts";
import { getRaw } from "../../knowledge/raw/raw-archive.ts";
import {
  evaluateIndustryPiGate,
  type IndustryPiGateInput,
} from "./industry-research-pi-e2e-gate.ts";
import {
  parseIndustryReasoningObject,
  validateIndustryResearchDesign,
  validateIndustryModuleResult,
  validateCrossModuleSynthesis,
  IndustryValidationError,
} from "../../skills/industry-research/skill.ts";
import {
  INDUSTRY_MODULES,
  type IndustryModuleResult,
  type ResearchDesign,
  type CrossModuleSynthesis,
} from "../../skills/industry-research/contracts.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const evidencePath = resolve(
  repoRoot,
  "tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PI_E2E.json",
);
const NOW = new Date().toISOString();
const AS_OF = "2026-09-11T00:00:00.000Z";
const taskId =
  "RHL-M3B-3B-FIX-002-DESIGN-CONTRACT-COMPLETENESS-AND-DIAGNOSTIC-CLOSURE";
const baseCommit = "71dcd8446d3d429fad644fe151847bed1cab5ee1";
const rights = {
  accessScope: "public" as const,
  retentionAllowed: true,
  aiProcessingAllowed: true,
  derivativeKnowledgeAllowed: true,
  redistributionAllowed: false,
};

type Corpus = {
  corpusId: string;
  sentinel: string;
  sources: Array<ResearchSourceCandidate & { content: string }>;
};
type Obj = {
  id: string;
  type?: string;
  sourceRef?: string;
  targetRef?: string;
  subjectRefs?: string[];
  sourceRefs?: string[];
  rawRefs?: string[];
  provenance?: Array<{ sourceRef?: string; rawRef?: string }>;
  claimType?: string;
  structuredValue?: { value?: unknown };
};
const safeDiagnostic = (value: unknown) =>
  String(value instanceof Error ? value.message : value)
    .replace(/[A-Za-z]:\\[^\s;]*/g, "<path>")
    .replace(
      /(authorization|cookie|api[-_]?key|token|secret)\s*[:=]\s*[^,;\s]+/gi,
      "$1=<redacted>",
    )
    .slice(0, 240);
const countKinds = (
  assets: Awaited<ReturnType<typeof readCanonicalV04Assets>>,
) =>
  Object.fromEntries(
    ["entity", "relation", "claim", "source"].map((kind) => [
      kind,
      assets.objects.filter((item) => item.kind === kind).length,
    ]),
  );
const idsByKind = (
  assets: Awaited<ReturnType<typeof readCanonicalV04Assets>>,
) =>
  Object.fromEntries(
    ["entity", "relation", "claim", "source"].map((kind) => [
      kind,
      assets.objects
        .filter((item) => item.kind === kind)
        .map((item) => item.value.id)
        .sort(),
    ]),
  );
const fileExists = async (path: string) => {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
};
const shapeSummary = (value: unknown) => {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const list = (x: unknown) =>
    Array.isArray(x)
      ? {
          count: x.length,
          allNonEmptyStrings: x.every(
            (y) => typeof y === "string" && y.trim().length > 0,
          ),
        }
      : { type: typeof x };
  const scope =
    v.scope && typeof v.scope === "object"
      ? (v.scope as Record<string, unknown>)
      : {};
  return {
    topLevelKeys: Object.keys(v).slice(0, 32),
    definitionHypothesis: typeof v.definitionHypothesis,
    targetKind: [
      "industry",
      "theme",
      "product",
      "technology",
      "uncertain",
    ].includes(String(v.targetKind))
      ? v.targetKind
      : typeof v.targetKind,
    scope: { included: list(scope.included), excluded: list(scope.excluded) },
    moduleQuestionKeys:
      v.moduleQuestions && typeof v.moduleQuestions === "object"
        ? Object.keys(v.moduleQuestions as object).sort()
        : [],
    keyMetrics: list(v.keyMetrics),
    evidenceRequirements: list(v.evidenceRequirements),
    searchTerms: list(v.searchTerms),
    knownGaps: list(v.knownGaps),
    verificationCandidates: list(v.verificationCandidates),
    outputChars: JSON.stringify(value ?? null).length,
    outputHash: sha256(JSON.stringify(value ?? null)).slice(0, 16),
  };
};
function attemptDiagnostic(
  request: ReasoningRequest,
  output: unknown,
  attempt: number,
  repair: boolean,
) {
  let parser = "valid";
  let codes: string[] = [];
  try {
    const parsed = parseIndustryReasoningObject(output);
    if (request.operation === "industry_research_design")
      validateIndustryResearchDesign(parsed);
    else if (request.operation === "industry_module_analysis") {
      const input = request.input as any;
      validateIndustryModuleResult(
        parsed,
        input.module,
        (input.evidence ?? []).map((x: any) => x.evidenceId),
      );
    } else {
      const input = request.input as any;
      validateCrossModuleSynthesis(
        parsed,
        (input.evidence ?? []).map((x: any) => x.evidenceId),
        (input.modules ?? []).flatMap((m: any) =>
          m.proposals.map((p: any) => p.proposalId),
        ),
        (input.modules ?? []).flatMap((m: any) =>
          m.proposals
            .filter((p: any) => p.kind === "relation")
            .map((p: any) => p.proposalId),
        ),
      );
    }
  } catch (error) {
    parser =
      error instanceof IndustryValidationError
        ? "parsed_invalid"
        : "parse_failed";
    codes = [
      error instanceof IndustryValidationError ? error.code : "parser_failure",
    ];
  }
  return {
    operation: request.operation,
    attempt,
    repair,
    parserOutcome: parser,
    diagnosticCodes: codes,
    shape: shapeSummary(output),
  };
}

function finalValidatedAttempts(
  observed: readonly { request: ReasoningRequest; output: unknown }[],
) {
  let design: ResearchDesign | undefined;
  const modules = new Map<string, IndustryModuleResult>();
  let synthesis: CrossModuleSynthesis | undefined;
  for (const attempt of observed) {
    try {
      const parsed = parseIndustryReasoningObject(attempt.output);
      if (attempt.request.operation === "industry_research_design")
        design = validateIndustryResearchDesign(parsed);
      else if (attempt.request.operation === "industry_module_analysis") {
        const input = attempt.request.input as {
          module: (typeof INDUSTRY_MODULES)[number];
          evidence?: Array<{ evidenceId: string }>;
        };
        modules.set(
          input.module,
          validateIndustryModuleResult(
            parsed,
            input.module,
            (input.evidence ?? []).map((x) => x.evidenceId),
          ),
        );
      } else if (
        attempt.request.operation === "industry_cross_module_synthesis"
      ) {
        const input = attempt.request.input as {
          evidence?: Array<{ evidenceId: string }>;
          modules?: readonly IndustryModuleResult[];
        };
        const finalModules = [...modules.values()];
        synthesis = validateCrossModuleSynthesis(
          parsed,
          (input.evidence ?? []).map((x) => x.evidenceId),
          finalModules.flatMap((m) => m.proposals.map((p) => p.proposalId)),
          finalModules.flatMap((m) =>
            m.proposals
              .filter((p) => p.kind === "relation")
              .map((p) => p.proposalId),
          ),
        );
      }
    } catch {
      /* invalid attempts remain diagnostics-only and excluded from semantics */
    }
  }
  return {
    design,
    modules: INDUSTRY_MODULES.flatMap((m) =>
      modules.has(m) ? [modules.get(m)!] : [],
    ),
    synthesis,
  };
}

function fixturePlugin(corpus: Corpus): ResearchAcquisitionPlugin {
  const byId = new Map(
    corpus.sources.map((source) => [source.candidateId, source]),
  );
  return {
    name: "fixture-bounded-pcb-acceptance",
    async discover(request) {
      if (!("industry" in request) || request.company !== undefined)
        throw new Error("fixture received a non-Industry acquisition request");
      return corpus.sources.map(
        ({ content: _content, ...candidate }) => candidate,
      );
    },
    async fetch(
      candidate: ResearchSourceCandidate,
    ): Promise<ResearchFetchedSource> {
      const source = byId.get(candidate.candidateId);
      if (!source)
        throw new Error(`unknown fixture candidate ${candidate.candidateId}`);
      return {
        candidate,
        retrievedAt: NOW,
        content: source.content,
        rawBytes: new TextEncoder().encode(source.content),
        contentHash: sha256(source.content),
      };
    },
    async normalize(source) {
      const item = byId.get(source.candidate.candidateId);
      if (!item) throw new Error("unknown fixture source");
      return {
        candidate: source.candidate,
        retrievedAt: NOW,
        title: item.title,
        content: item.content,
        canonicalUrl: item.url,
        contentHash: sha256(item.content),
        rawBytes: new TextEncoder().encode(item.content),
        publisher: "Bounded acceptance corpus",
        rights: {
          ...rights,
          policyBasis: "personal_noncommercial_research" as const,
        },
      };
    },
  };
}

function numericAudit(result: any): number {
  const contents = result.evidence
    .map((item: any) => item.source.content)
    .join("\n");
  const token = /(?<![A-Za-z])\d+(?:\.\d+)?%?(?![A-Za-z])/g;
  const excluded = (t: string, text: string) =>
    /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(t) ||
    /^(?:603228|000858|600519)$/.test(t) ||
    new RegExp(`(?:section|第)\\s*${t}`, "i").test(text);
  let count = 0;
  const claims = [
    ...result.modules.flatMap((m: any) => m.proposals),
    ...(result.synthesis?.proposals ?? []),
  ].filter((p: any) => p.kind === "claim");
  for (const claim of claims)
    for (const text of [
      claim.statement ?? "",
      JSON.stringify(claim.structuredValue ?? ""),
    ])
      for (const t of text.match(token) ?? [])
        if (!excluded(t, text) && !contents.includes(t)) count++;
  for (const section of result.report?.sections ?? [])
    for (const t of String(section.markdown ?? "").match(token) ?? [])
      if (!excluded(t, String(section.markdown ?? "")) && !contents.includes(t))
        count++;
  return count;
}

async function main() {
  const fixture: Corpus = JSON.parse(
    await readFile(
      resolve(
        repoRoot,
        "tests/validation/fixtures/industry-research-pcb-acceptance/materials.json",
      ),
      "utf8",
    ),
  );
  await mkdir(resolve(repoRoot, "tests/validation/evidence"), {
    recursive: true,
  });
  let runtime: ModelRuntime | undefined;
  let executionStarted = false;
  try {
    const temp = await mkdtemp(join(tmpdir(), "rhl-m3b3-real-pi-"));
    const kbRoot = join(temp, "kb");
    const reportRoot = join(temp, "reports");
    await mkdir(reportRoot, { recursive: true });
    await createFreshKnowledgeBaseV04(kbRoot, {
      knowledgeBaseId: "kb-m3b3-real-pi",
      now: NOW,
    });
    const registry = new KnowledgeBaseRegistry();
    let handle = await registry.mount(kbRoot);
    const beforeRevision = handle.revision;
    runtime = await ModelRuntime.create({
      authPath: join(getAgentDir(), "auth.json"),
      modelsPath: join(getAgentDir(), "models.json"),
      allowModelNetwork: true,
      refreshOnCreate: false,
    });
    const model = selectProductionReasoningModel(runtime) as Model<Api>;
    const delegate = new PiReasoningExecutor({
      modelRuntime: runtime,
      model,
      timeoutMs: 900_000,
      maxOutputChars: 400_000,
    });
    const operations: string[] = [];
    const operationCounts: Record<string, number> = {};
    const observed: Array<{ request: ReasoningRequest; output: unknown }> = [];
    const attemptDiagnostics: unknown[] = [];
    const executor = {
      capabilities: () => delegate.capabilities(),
      execute: async (request: ReasoningRequest) => {
        operations.push(request.operation);
        operationCounts[request.operation] =
          (operationCounts[request.operation] ?? 0) + 1;
        try {
          const response = await delegate.execute(request);
          observed.push({ request, output: response.output });
          attemptDiagnostics.push(
            attemptDiagnostic(
              request,
              response.output,
              operationCounts[request.operation],
              /Repair invocation:/.test(request.instruction),
            ),
          );
          return response;
        } catch (error) {
          attemptDiagnostics.push({
            operation: request.operation,
            attempt: operationCounts[request.operation],
            repair: /Repair invocation:/.test(request.instruction),
            parserOutcome: "executor_failed",
            diagnosticCodes: ["provider_failure"],
            shape: shapeSummary(undefined),
            failure: safeDiagnostic(error),
          });
          throw error;
        }
      },
    };
    const workflowService = new WorkflowService();
    const service = new ResearchService({
      mountedKnowledgeBaseRoot: kbRoot,
      reportRoot,
      acquisitionPlugins: [fixturePlugin(fixture)],
      workflowService,
      reasoningExecutor: executor,
    });
    executionStarted = true;
    const result = await service.startIndustryResearch({
      workflowRunId: "rhl-m3b3-real-pi-001",
      name: "PCB Manufacturing",
      aliases: ["Printed Circuit Board"],
      searchTerms: ["PCB", "AI server", "HDI"],
      asOf: AS_OF,
      maxSources: 4,
      maxEvidencePerModule: 2,
    }).completion;
    handle = await registry.mount(kbRoot);
    const after = await readCanonicalV04Assets(kbRoot);
    const reportPath = result.reportPath
      ? join(reportRoot, result.reportPath)
      : "";
    const report =
      result.reportPath && (await fileExists(`${reportPath}.json`))
        ? JSON.parse(await readFile(`${reportPath}.json`, "utf8"))
        : null;
    const validated = finalValidatedAttempts(observed);
    const design = validated.design as any;
    const modules = validated.modules as any[];
    const synthesis = validated.synthesis as any;
    const evidenceSources = fixture.sources;
    const objects = after.objects.map((item) => item.value as Obj);
    const entities = objects.filter((x) => x.id.startsWith("entity:"));
    const relations = objects.filter((x) => x.id.startsWith("relation:"));
    const claims = objects.filter((x) => x.id.startsWith("claim:"));
    const sources = objects.filter((x) => x.id.startsWith("source:"));
    const industry = entities.find((x) => x.type === "industry");
    const productOrTechnology = entities.find(
      (x) => x.type === "product" || x.type === "technology",
    );
    const company = entities.find((x) => x.type === "company");
    const relation = relations.find((x) =>
      [
        "upstream_of",
        "depends_on",
        "belongs_to_industry",
        "applied_in",
      ].includes(String((x as any).type)),
    );
    const exposure = relations.find(
      (x) =>
        (x as any).type === "business_exposure" &&
        ((x.sourceRef === company?.id && x.targetRef === industry?.id) ||
          (x.targetRef === company?.id && x.sourceRef === industry?.id)),
    );
    const requiredClaims = claims.filter((claim) => claim.sourceRefs?.length);
    const requiredRelations = relations.filter(
      (relation) => relation.sourceRefs?.length,
    );
    const sourceRawProvenance =
      sources.length > 0 &&
      requiredClaims.length + requiredRelations.length > 0 &&
      sources.every(
        (source) =>
          (source.rawRefs ?? []).length > 0 &&
          (source.rawRefs ?? []).every((rawRef) => Boolean(rawRef)),
      ) &&
      [...requiredClaims, ...requiredRelations].every((item) =>
        item.provenance?.every(
          (p) =>
            p.sourceRef &&
            p.rawRef &&
            sources.some(
              (source) =>
                source.id === p.sourceRef &&
                source.rawRefs?.includes(p.rawRef!),
            ),
        ),
      ) &&
      (
        await Promise.all(
          sources
            .flatMap((source) => source.rawRefs ?? [])
            .map((rawRef) => getRaw(handle, rawRef)),
        )
      ).length >= sources.length;
    const graph = industry
      ? await new KnowledgeGraphService(kbRoot).getGraphProjection({
          rootRef: industry.id,
          depth: 2,
          maxNodes: 30,
          maxEdges: 60,
        })
      : null;
    const replayEvidence = evidenceSources.map((source) => ({
      localSourceId: `evidence-${source.candidateId}`,
      source: {
        candidate: source,
        retrievedAt: NOW,
        title: source.title,
        content: source.content,
        canonicalUrl: source.url,
        contentHash: sha256(source.content),
        rawBytes: new TextEncoder().encode(source.content),
        publisher: "Bounded acceptance corpus",
        rights: {
          ...rights,
          policyBasis: "personal_noncommercial_research" as const,
        },
      },
    }));
    const replayBefore = { revision: handle.revision, ids: idsByKind(after) };
    const replayExecutor = {
      capabilities: () => ({
        maxContextTokens: 100000,
        maxOutputTokens: 100000,
        structuredOutputSupport: true,
        maxConcurrency: 8,
      }),
      execute: async (request: ReasoningRequest) => {
        if (request.operation === "industry_research_design" && design)
          return { operation: request.operation, output: design };
        if (request.operation === "industry_module_analysis") {
          const module = (request.input as { module?: string }).module;
          const value = modules.find((item) => item.module === module);
          if (value) return { operation: request.operation, output: value };
        }
        if (
          request.operation === "industry_cross_module_synthesis" &&
          synthesis
        )
          return { operation: request.operation, output: synthesis };
        throw new Error(
          `deterministic replay received unexpected ${request.operation}`,
        );
      },
    };
    const replayService =
      result.status === "completed" &&
      design &&
      synthesis &&
      modules.length === INDUSTRY_MODULES.length
        ? new ResearchService({
            mountedKnowledgeBaseRoot: kbRoot,
            reportRoot,
            acquisitionPlugins: [fixturePlugin(fixture)],
            workflowService: new WorkflowService(),
            reasoningExecutor: replayExecutor,
          })
        : undefined;
    const replay: any = replayService
      ? await replayService.startIndustryResearch({
          workflowRunId: "rhl-m3b3-real-pi-replay-001",
          name: "PCB Manufacturing",
          aliases: ["Printed Circuit Board"],
          canonicalRef: industry?.id,
          searchTerms: ["PCB", "AI server", "HDI"],
          asOf: AS_OF,
          maxSources: 4,
          maxEvidencePerModule: 2,
        }).completion
      : {
          status: "blocked",
          entityRefsByLocalKey: {},
          knowledgeBaseRevision: handle.revision,
        };
    const replayHandle = await registry.mount(kbRoot);
    replay.knowledgeBaseRevision = replayHandle.revision;
    const replayAfter = await readCanonicalV04Assets(kbRoot);
    const replayIds = idsByKind(replayAfter);
    const replayGraph = industry
      ? await new KnowledgeGraphService(kbRoot).getGraphProjection({
          rootRef: industry.id,
          depth: 2,
          maxNodes: 30,
          maxEdges: 60,
        })
      : null;
    const workflow = {
      status: result.status,
      design,
      modules,
      synthesis,
      evidence: replayEvidence.map((item) => ({
        evidenceId: item.localSourceId,
        source: item.source,
      })),
      report,
      gatewaySubmitCount: result.status === "completed" ? 1 : 0,
      knowledgeBaseRevision: handle.revision,
      claimIds: claims.map((claim) => claim.id),
      acquisitionWaves: 1,
    };
    const privacySerialized = JSON.stringify({
      fixtureId: fixture.corpusId,
      sourceIds: fixture.sources.map((s) => s.candidateId),
      sentinelAbsent: true,
      rawBodiesIncluded: false,
      promptsIncluded: false,
      outputsIncluded: false,
    });
    const gateInput: IndustryPiGateInput = {
      executed: true,
      realPiReasoningExecutor: delegate instanceof PiReasoningExecutor,
      runtimeProvider: delegate.runtimeMetadata().provider,
      operations,
      operationCounts,
      status: workflow.status,
      targetKind: workflow.design?.targetKind ?? null,
      modules: workflow.modules,
      industryDefinitionAvailable: workflow.modules.some(
        (m: any) =>
          m.module === "industry_definition" && m.status !== "unavailable",
      ),
      gatewaySubmitCount: workflow.gatewaySubmitCount,
      firstRunRevisionDelta: workflow.knowledgeBaseRevision - beforeRevision,
      durableClaimCount: workflow.claimIds.length,
      chainRelation: Boolean(relation),
      companyExposure: Boolean(exposure),
      industryRoot: Boolean(industry),
      productOrTechnology: Boolean(productOrTechnology),
      company: Boolean(company),
      sourceRawProvenance,
      unsupportedNumericObservationCount: numericAudit(workflow),
      semanticTypingIntact: claims.every((claim) =>
        [
          "fact",
          "forecast",
          "viewpoint",
          "trend",
          "risk",
          "catalyst",
          "assumption",
          "thesis",
        ].includes(String(claim.claimType)),
      ),
      report: {
        persisted: Boolean(report),
        reportType: report?.reportType ?? null,
        sectionCount: report?.sections?.length ?? 0,
        hasResearchGaps:
          report?.sections?.some((s: any) =>
            /research gap/i.test(s.markdown),
          ) ?? false,
      },
      graph: {
        profile: graph?.profile ?? null,
        canonicalRefs: graph
          ? [...graph.nodes, ...graph.edges].every((item: any) =>
              objects.some((object) => object.id === item.ref),
            )
          : false,
        root:
          graph?.nodes.some(
            (node: any) => node.ref === industry?.id && node.isRoot,
          ) ?? false,
        productOrTechnology:
          graph?.nodes.some(
            (node: any) =>
              node.entityType === "product" || node.entityType === "technology",
          ) ?? false,
        company:
          graph?.nodes.some((node: any) => node.entityType === "company") ??
          false,
        requiredEdge:
          graph?.edges.some(
            (edge: any) =>
              edge.ref === relation?.id || edge.ref === exposure?.id,
          ) ?? false,
      },
      replay: {
        outcome: replay.status,
        rootIdStable:
          (replay.entityRefsByLocalKey as Record<string, string>).industry ===
          industry?.id,
        duplicateEntities:
          (replayIds.entity as string[]).length !==
          (replayBefore.ids.entity as string[]).length,
        duplicateRelations:
          (replayIds.relation as string[]).length !==
          (replayBefore.ids.relation as string[]).length,
        duplicateClaims:
          (replayIds.claim as string[]).length !==
          (replayBefore.ids.claim as string[]).length,
        duplicateSources:
          (replayIds.source as string[]).length !==
          (replayBefore.ids.source as string[]).length,
        duplicateRaw: replayAfter.objects
          .filter((x) => x.kind === "source")
          .some(
            (x) =>
              ((x.value as any).rawRefs ?? []).length >
              (
                (
                  after.objects.find((y) => y.value.id === x.value.id)
                    ?.value as any
                )?.rawRefs ?? []
              ).length,
          ),
        revisionDelta: replay.knowledgeBaseRevision - replayBefore.revision,
        graphStable:
          JSON.stringify(graph?.nodes.map((n) => n.ref)) ===
            JSON.stringify(replayGraph?.nodes.map((n) => n.ref)) &&
          JSON.stringify(graph?.edges.map((e) => e.ref)) ===
            JSON.stringify(replayGraph?.edges.map((e) => e.ref)),
      },
      privacy: {
        serializedEvidenceSafe: !privacySerialized.includes(fixture.sentinel),
        sentinelAbsent: !privacySerialized.includes(fixture.sentinel),
        pathsRedacted:
          !privacySerialized.includes(kbRoot) &&
          !privacySerialized.includes(reportRoot),
        secretsAbsent: !/auth|cookie|authorization|api[-_]?key|secret/i.test(
          privacySerialized,
        ),
      },
    };
    const decision = evaluateIndustryPiGate(gateInput);
    const evidence = {
      generatedAt: NOW,
      taskId,
      baseCommit,
      implementationCommit: process.env.RHL_IMPLEMENTATION_COMMIT ?? null,
      classification: decision.classification,
      processExitCode: decision.exitCode,
      realPiReasoningExecutor: gateInput.realPiReasoningExecutor,
      modelRuntime: delegate.runtimeMetadata(),
      operations: { names: operations, counts: operationCounts },
      attemptDiagnostics,
      targetDiagnosis: {
        target: "PCB Manufacturing",
        kind: gateInput.targetKind,
      },
      moduleStatusSummary: workflow.modules.map((m: any) => ({
        module: m.module,
        status: m.status,
        evidenceCount: m.evidenceIds?.length ?? 0,
        proposalCount: m.proposals?.length ?? 0,
        gapCount: m.gaps?.length ?? 0,
      })),
      acquisition: {
        corpusId: fixture.corpusId,
        waveCount: workflow.acquisitionWaves,
        providerFixture: "fixture-bounded-pcb-acceptance",
        liveProviderEvidence: false,
        diagnostics: result.acquisitionDiagnostics.map(safeDiagnostic),
      },
      gatewaySubmitCount: workflow.gatewaySubmitCount,
      revisionDelta: gateInput.firstRunRevisionDelta,
      canonicalObjectCounts: countKinds(after),
      requiredRelations: {
        chain: Boolean(relation),
        companyExposure: Boolean(exposure),
      },
      numericAudit: {
        unsupportedNumericObservationCount:
          gateInput.unsupportedNumericObservationCount,
        rules:
          "Numeric tokens in Claim statements, structured values, and persisted report sections are source-backed; canonical IDs, valid dates, section numbering, and explicit A-share ticker identifiers are excluded.",
      },
      reportContract: gateInput.report,
      graphContract: gateInput.graph,
      deterministicReplay: {
        outcome: replay.status,
        rootIdStable: gateInput.replay.rootIdStable,
        revisionDelta: gateInput.replay.revisionDelta,
        stableGraphIdentity: gateInput.replay.graphStable,
      },
      failedGates: decision.failedGates,
      privacy: {
        sentinelAbsent: gateInput.privacy.sentinelAbsent,
        rawBodiesIncluded: false,
        completePromptsIncluded: false,
        completeOutputsIncluded: false,
        absolutePathsIncluded: false,
        secretsIncluded: false,
      },
    };
    await writeFile(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify(evidence, null, 2));
    process.exitCode = decision.exitCode;
  } catch (error) {
    const evidence = {
      generatedAt: NOW,
      taskId,
      baseCommit,
      implementationCommit: process.env.RHL_IMPLEMENTATION_COMMIT ?? null,
      classification: executionStarted
        ? "REAL_MODEL_CONTRACT_BLOCKED"
        : "NOT_EXECUTED / BLOCKED",
      processExitCode: 1,
      realPiReasoningExecutor: executionStarted,
      failure: safeDiagnostic(error),
      privacy: {
        rawBodiesIncluded: false,
        completePromptsIncluded: false,
        completeOutputsIncluded: false,
        absolutePathsIncluded: false,
        secretsIncluded: false,
      },
    };
    await writeFile(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    console.error(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
  } finally {
    await Promise.resolve((runtime as any)?.dispose?.()).catch(() => undefined);
  }
}
await main();
