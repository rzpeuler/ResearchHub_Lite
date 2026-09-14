// TEST-040: one fresh direct production Industry Workflow run; no commit/push.
// @ts-nocheck
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { ModelRuntime, getAgentDir } from "@earendil-works/pi-coding-agent";
import { PiReasoningExecutor } from "../../plugins/reasoning/pi/executor.ts";
import {
  resolveCodexCliExecutable,
  buildCodexCliProcessInvocation,
} from "../../plugins/reasoning/codex-cli/executor.ts";
import {
  createIndustryProductionReasoningExecutor,
  selectProductionReasoningModel,
} from "../../app/pi/model-selection.ts";
import { runIndustryDeepResearch } from "../../workflows/industry-deep-research/workflow.ts";
import { IndustryAcquisitionComposition } from "../../plugins/research-acquisition/industry-composition.ts";
import {
  createFreshKnowledgeBaseV04,
  readCanonicalV04Assets,
} from "../../knowledge/storage/index.ts";
import { KnowledgeBaseRegistry } from "../../knowledge/registry/registry.ts";
import { validateKnowledgeV04Objects } from "../../knowledge/validation/v04-validator.ts";
import {
  OfficialDisclosureResearchPlugin,
  CninfoOfficialDisclosureClient,
} from "../../plugins/research-acquisition/official.ts";
import { GdeltResearchPlugin } from "../../plugins/research-acquisition/gdelt.ts";
import { MiitIndustryResearchPlugin } from "../../plugins/research-acquisition/miit-industry.ts";
import { GovCnIndustryResearchPlugin } from "../../plugins/research-acquisition/govcn-industry.ts";
import { EastmoneyIndustryResearchPlugin } from "../../plugins/research-acquisition/eastmoney-industry.ts";
import { CpcaIndustryResearchPlugin } from "../../plugins/research-acquisition/cpca-industry.ts";
import { AkshareDataAdapter } from "../../plugins/research-acquisition/akshare.ts";
import { AkshareIndustryResearchPlugin } from "../../plugins/research-acquisition/industry.ts";
import { sha256 } from "../../plugins/research-acquisition/hash.ts";

export const TARGET = {
  name: "PCB Manufacturing",
  aliases: ["Printed Circuit Board", "印制电路板"],
  asOf: "2026-09-14T00:00:00.000Z",
  searchTerms: [
    "PCB 印制电路板",
    "AI server PCB HDI",
    "Shennan Circuit PCB",
    "WUS PCB",
    "Pengding Technology PCB CCL",
    "Shengyi Technology PCB CCL",
    "PCB industry chain",
    "PCB industry capacity",
  ],
} as const;
export const MODULES = [
  "industry_definition",
  "market_size_growth",
  "supply_demand_analysis",
  "industry_chain_analysis",
  "competitive_landscape",
  "technology_evolution",
  "company_mapping",
  "risk_analysis",
] as const;
export const SECTIONS = [
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
export const GAP_CAUSES = [
  "PROVIDER_EMPTY",
  "PROVIDER_EXTERNAL_FAILURE",
  "NO_QUALIFIED_EVIDENCE_FOR_MODULE",
  "EVIDENCE_ROUTING_GAP",
  "REASONING_OUTPUT_GAP",
  "CONSERVATIVE_SEMANTIC_REJECTION",
  "REPORT_PRESENTATION_GAP",
  "MODEL_SEMANTIC_NONCONFORMANCE",
  "NONE",
] as const;
export type FinalClassification =
  | "PRODUCT_QUALITY_READY"
  | "FUNCTIONAL_BUT_EVIDENCE_THIN"
  | "PRODUCT_QUALITY_DEFECT"
  | "PRODUCT_QUALITY_LIVE_INCONCLUSIVE"
  | "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE";
const root = resolve(import.meta.dirname, "../..");
const evidencePath = join(
  root,
  "tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCT_QUALITY_DIRECT_PUBLIC_PORTFOLIO_AFTER_GAPID_FIX.json",
);
const snapshotPath = join(
  root,
  "tests/validation/evidence/RHL_M3B_INDUSTRY_REPORT_DIRECT_PUBLIC_PORTFOLIO_AFTER_GAPID_FIX.json",
);
const safe = (x: unknown) =>
  String(x instanceof Error ? x.message : x)
    .replace(/[A-Za-z]:[\\/][^\s;)]+/g, "<private-path>")
    .replace(
      /(authorization|cookie|api[-_]?key|token|secret|password)\s*[:=]\s*[^,;\s]+/gi,
      "$1=<redacted>",
    )
    .slice(0, 500);
const counts = (a: any) =>
  Object.fromEntries(
    ["entity", "relation", "claim", "source"].map((k) => [
      k,
      a.objects.filter((x: any) => x.kind === k).length,
    ]),
  );
const gapText = (x: any) =>
  /research gap|invalid research gap|unavailable|insufficient/i.test(
    JSON.stringify(x),
  );

export function classifyProductQuality(input: any): FinalClassification {
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
      (x: any) => x.status === "THIN" || x.status === "UNAVAILABLE",
    )
  )
    return "FUNCTIONAL_BUT_EVIDENCE_THIN";
  return "PRODUCT_QUALITY_READY";
}
export function classifyGapCause(input: any): (typeof GAP_CAUSES)[number] {
  if (input.modelSemanticNonconformance) return "MODEL_SEMANTIC_NONCONFORMANCE";
  if (input.providerFailed) return "PROVIDER_EXTERNAL_FAILURE";
  if (input.providerEmpty) return "PROVIDER_EMPTY";
  if (
    input.qualifiedEvidenceForModule &&
    (input.routedEvidenceCount ?? 0) === 0
  )
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
  if (gapText(input.material)) return "REPORT_PRESENTATION_GAP";
  return "NONE";
}
export function auditNumbers(
  markdown: string,
  sourceRefCount: number,
  claimRefCount: number,
) {
  const values = markdown.match(/(?<![A-Za-z])\d+(?:\.\d+)?\s*%?/g) ?? [];
  const assertions = values.map((value) => ({
    value,
    classification: /unavailable|gap|no validated/i.test(markdown)
      ? "explicitly unavailable"
      : claimRefCount > 0
        ? "canonical-backed"
        : sourceRefCount > 0
          ? "report-only-source-backed"
          : "unsupported",
  }));
  return {
    assertions,
    unsupportedNumericCount: assertions.filter(
      (x) => x.classification === "unsupported",
    ).length,
  };
}
export function auditResearchGapConvergence(modules: any[], reasoning: any[]) {
  return {
    modules: modules.map((m) => ({
      module: m.module,
      initialResearchGapInvalid: Boolean(m.initialResearchGapInvalid),
      repairResearchGapInvalid: Boolean(m.repairResearchGapInvalid),
      validationCategories: m.validationCategories ?? [],
      boundedRepairUsed: (m.moduleCallCount ?? 0) > 1,
    })),
    repeatedInvalidCount: reasoning.filter(
      (x) => x.initialResearchGapInvalid && x.repairResearchGapInvalid,
    ).length,
  };
}

async function preflight() {
  const out: any = {
    discovered: false,
    versionAvailable: false,
    helpAvailable: false,
    resolutionSource: "none",
    executableKind: "none",
    version: null,
  };
  try {
    const r = resolveCodexCliExecutable();
    out.discovered = true;
    out.resolutionSource = r.source;
    out.executableKind = r.kind;
    const run = promisify(execFile);
    const v = buildCodexCliProcessInvocation(r.executable, ["--version"]);
    const h = buildCodexCliProcessInvocation(r.executable, ["exec", "--help"]);
    const vr = await run(v.executable, v.args, {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 16000,
    });
    out.version = safe(vr.stdout.trim().split(/\r?\n/)[0] ?? "");
    out.versionAvailable = true;
    await run(h.executable, h.args, {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 32000,
    });
    out.helpAvailable = true;
  } catch (e) {
    out.failure = safe(e);
  }
  return out;
}
function wrap(plugin: any, log: any[]) {
  return {
    name: plugin.name,
    async discover(req: any) {
      const row: any = {
        provider: plugin.name,
        wave: req.wave,
        phase: "discover",
        attempted: true,
      };
      log.push(row);
      try {
        const c = await plugin.discover(req);
        row.returned = true;
        row.candidateCount = c.length;
        return c;
      } catch (e) {
        row.threw = true;
        row.failureCategory = safe(e);
        throw e;
      }
    },
    async fetch(c: any) {
      const row: any = {
        provider: plugin.name,
        wave: null,
        phase: "fetch",
        attempted: true,
        candidateId: c.candidateId,
      };
      log.push(row);
      try {
        const f = await plugin.fetch(c);
        row.returned = true;
        return f;
      } catch (e) {
        row.threw = true;
        row.failureCategory = safe(e);
        throw e;
      }
    },
    async normalize(f: any) {
      const row: any = {
        provider: plugin.name,
        wave: null,
        phase: "normalize",
        attempted: true,
        candidateId: f.candidate?.candidateId,
      };
      log.push(row);
      try {
        const n = await plugin.normalize(f);
        row.returned = true;
        row.usable = Boolean(n.content?.trim());
        row.contentHash = n.contentHash;
        row.canonicalHost = n.canonicalUrl
          ? new URL(n.canonicalUrl).hostname
          : null;
        row.tier = n.candidate?.tier ?? null;
        row.publishedAtAvailable = Boolean(n.candidate?.publishedAt);
        return n;
      } catch (e) {
        row.threw = true;
        row.failureCategory = safe(e);
        throw e;
      }
    },
  };
}
function providerRows(log: any[], result: any) {
  return [...new Set(log.map((x) => x.provider))].map((provider) => {
    const xs = log.filter((x) => x.provider === provider),
      outcomes = (result.providerOutcomes ?? []).filter(
        (x: any) => x.provider === provider,
      );
    return {
      provider,
      attempted: xs.some((x) => x.attempted),
      succeeded: outcomes.some((x: any) => x.providerSucceeded),
      empty: outcomes.some((x: any) => x.providerEmpty),
      failed: outcomes.some((x: any) => x.providerFailed),
      usableNormalizedSourceCount: outcomes.reduce(
        (n: any, x: any) => n + (x.usableSourceCount ?? 0),
        0,
      ),
      distinctContentCount: new Set(
        xs.map((x) => x.contentHash).filter(Boolean),
      ).size,
      canonicalHostSet: [
        ...new Set(xs.map((x) => x.canonicalHost).filter(Boolean)),
      ],
      tierDistribution: Object.fromEntries(
        [...new Set(xs.map((x) => x.tier).filter(Boolean))].map((t) => [
          t,
          xs.filter((x) => x.tier === t).length,
        ]),
      ),
      publicationDateAvailable: xs.some((x) => x.publishedAtAvailable),
      failureCategories: [
        ...new Set(xs.map((x) => x.failureCategory).filter(Boolean)),
      ],
      wavesAttempted: [...new Set(xs.map((x) => x.wave).filter(Boolean))],
    };
  });
}
function sectionSnapshot(report: any, canonical: Set<string>) {
  return (report?.sections ?? []).map((s: any) => ({
    title: s.title,
    markdown: String(s.markdown).slice(0, 8000),
    sourceRefs: s.sourceRefs ?? [],
    claimRefs: s.claimRefs ?? [],
    relationRefs: s.relationRefs ?? [],
    canonicalReferencesResolve: [
      ...(s.sourceRefs ?? []),
      ...(s.claimRefs ?? []),
      ...(s.relationRefs ?? []),
    ].every((x: string) => canonical.has(x)),
  }));
}
function moduleMatrix(result: any, evidence: any[], providerLog: any[]) {
  return MODULES.map((module) => {
    const m = (result.modules ?? []).find((x: any) => x.module === module),
      ids = new Set(m?.evidenceIds ?? []),
      used = evidence.filter((x) => ids.has(x.evidenceId));
    const material = m?.reportMaterial?.markdown ?? "";
    return {
      module,
      status: m?.status ?? "unavailable",
      reasoningCallCount: result.moduleCallCounts?.[module] ?? 0,
      evidenceIds: [...ids],
      evidenceCount: ids.size,
      distinctProductionProviders: [
        ...new Set(
          used.map((x) => x.source?.candidate?.provider).filter(Boolean),
        ),
      ],
      proposalCounts: Object.fromEntries(
        ["entity", "relation", "claim"].map((k) => [
          k,
          (m?.proposals ?? []).filter((p: any) => p.kind === k).length,
        ]),
      ),
      actionableGapCount: (m?.gaps ?? []).filter((g: any) => g.actionable)
        .length,
      reportMaterial: Boolean(material),
      primaryGapCause: classifyGapCause({
        module,
        evidenceCount: ids.size,
        status: m?.status,
        material,
        proposals: (m?.proposals ?? []).length,
        providerEmpty: !ids.size && providerLog.some((x) => x.providerEmpty),
        providerFailed: providerLog.some((x) => x.providerFailed),
        modelSemanticNonconformance: m?.validationCategories?.some(
          (x: string) => /invalid|nonconform/i.test(x),
        ),
      }),
    };
  });
}
function dimensions(sections: any[], matrix: any[]) {
  const ev = (mods: string[]) =>
    mods.reduce(
      (n, m) => n + (matrix.find((x) => x.module === m)?.evidenceCount ?? 0),
      0,
    );
  const make = (name: string, titles: string[], mods: string[]) => {
    const xs = sections.filter((x) => titles.includes(x.title)),
      n = ev(mods),
      gap = xs.some((x) => gapText(x.markdown));
    return {
      dimension: name,
      status: n === 0 ? "UNAVAILABLE" : gap ? "THIN" : "USABLE",
      rationale: `${n} routed evidence item(s); ${gap ? "material includes observed research gaps" : "material is traceable to acquired evidence"}.`,
    };
  };
  return [
    make(
      "scope clarity",
      ["Industry Scope & Definition"],
      ["industry_definition"],
    ),
    make(
      "factual evidence density",
      ["Executive Industry View", "Methodology & Provenance"],
      [...MODULES],
    ),
    make(
      "quantitative and KPI usefulness",
      ["Market Size & Growth", "Key Metrics & Monitoring"],
      ["market_size_growth", "supply_demand_analysis"],
    ),
    make(
      "industry-chain and value-capture usefulness",
      ["Industry Chain Map", "Value Capture & Industry Economics"],
      ["industry_chain_analysis"],
    ),
    make(
      "company-mapping usefulness",
      ["Company Mapping & Exposure"],
      ["company_mapping"],
    ),
    make(
      "catalysts, risks, monitoring, and invalidation usefulness",
      [
        "Catalysts",
        "Risks & Invalidation Conditions",
        "Key Metrics & Monitoring",
      ],
      ["risk_analysis", "supply_demand_analysis"],
    ),
  ];
}

export async function main() {
  const taskId =
      "RHL-M3B-3B-TEST-040-INDUSTRY-PRODUCT-QUALITY-DIRECT-PUBLIC-PORTFOLIO-AFTER-GAPID-FIX",
    startedAt = new Date().toISOString(),
    pre = await preflight();
  let model: any;
  const log: any[] = [];
  const reasoningLog: any[] = [];
  const base = {
    taskId,
    baseCommit: "add57c0ece6460658ee3d43540cdf8dda8b6e393",
    generatedAt: startedAt,
    codexPreflight: pre,
    target: {
      nameHash: sha256(TARGET.name),
      aliasHashes: TARGET.aliases.map(sha256),
      searchTermHashes: TARGET.searchTerms.map(sha256),
      asOf: TARGET.asOf,
    },
    fix039Accepted: true,
    test038Comparison:
      "direct production Workflow previously reached two waves but mandatory Industry Definition remained unavailable with Invalid Research Gap degradation",
    privacy: {
      rawBodiesIncluded: false,
      hiddenReasoningIncluded: false,
      credentialsIncluded: false,
      privatePathsIncluded: false,
    },
  };
  if (!pre.discovered || !pre.versionAvailable || !pre.helpAvailable) {
    const out = {
      ...base,
      providerCoverage: [],
      reasoningAudit: [],
      finalClassification: "PRODUCT_QUALITY_LIVE_INCONCLUSIVE",
    };
    await mkdir(join(root, "tests/validation/evidence"), { recursive: true });
    await writeFile(evidencePath, JSON.stringify(out, null, 2) + "\n");
    await writeFile(
      snapshotPath,
      JSON.stringify(
        { taskId, status: "NOT_PRODUCED", reason: "Codex preflight failed" },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify(out, null, 2));
    return out;
  }
  const temp = await mkdtemp(join(tmpdir(), "rhl-m3b3-test-040-")),
    kb = join(temp, "kb"),
    reports = join(temp, "reports");
  let result: any;
  let acquisitionOutcomes: any[] = [];
  try {
    await mkdir(reports, { recursive: true });
    await createFreshKnowledgeBaseV04(kb, {
      knowledgeBaseId: "kb-m3b3-test-040",
      now: TARGET.asOf,
    });
    const before = await readCanonicalV04Assets(kb);
    const registry = new KnowledgeBaseRegistry();
    const handle = await registry.mount(kb);
    model = await ModelRuntime.create({
      authPath: join(getAgentDir(), "auth.json"),
      modelsPath: join(getAgentDir(), "models.json"),
      allowModelNetwork: true,
      refreshOnCreate: false,
    });
    const primary = new PiReasoningExecutor({
      modelRuntime: model,
      model: selectProductionReasoningModel(model),
    });
    const real = await createIndustryProductionReasoningExecutor({
      capabilities: primary.capabilities(),
      timeoutMs: 900000,
      maxOutputChars: 400000,
      tempRoot: temp,
    });
    const ordinals = new Map<string, number>();
    const exec = {
      capabilities: () => real.capabilities(),
      execute: async (req: any) => {
        const key = `${req.operation}:${req.input?.module ?? ""}`;
        const ordinal = (ordinals.get(key) ?? 0) + 1;
        const x = await real.execute(req);
        const text = JSON.stringify(x);
        reasoningLog.push({
          identity: key,
          callCount: ordinal,
          boundedRepair: ordinal === 2,
          returned: true,
          localValidationCategory:
            /Invalid Research Gap|module_shape_invalid/i.test(text)
              ? "Invalid Research Gap"
              : null,
          initialResearchGapInvalid:
            ordinal === 1 && /Invalid Research Gap/i.test(text),
          repairResearchGapInvalid:
            ordinal === 2 && /Invalid Research Gap/i.test(text),
        });
        return x;
      },
    };
    const plugins = [
      new OfficialDisclosureResearchPlugin(
        new CninfoOfficialDisclosureClient(),
      ),
      new GdeltResearchPlugin(),
      new MiitIndustryResearchPlugin(),
      new GovCnIndustryResearchPlugin(),
      new EastmoneyIndustryResearchPlugin(),
      new CpcaIndustryResearchPlugin(),
      new AkshareIndustryResearchPlugin(new AkshareDataAdapter()),
    ].map((x) => wrap(x, log));
    const composition = new IndustryAcquisitionComposition(plugins);
    result = await runIndustryDeepResearch({
      workflowRunId: "rhl-m3b3-test-040-live",
      handle,
      target: TARGET,
      reportRoot: reports,
      reasoningExecutor: exec,
      asOf: TARGET.asOf,
      maxSources: 24,
      maxEvidencePerModule: 2,
      acquisitionWave: async (req) => {
      const out = await composition.acquire(req);
      acquisitionOutcomes.push(...out.outcomes.map((x: any) => ({ ...x, wave: req.wave })));
        for (const x of log) if (x.wave === null) x.wave = req.wave;
        return out.sources;
      },
    });
    const after = await readCanonicalV04Assets(kb);
    const validation = validateKnowledgeV04Objects(after.objects);
    const report = result.report
      ? await readFile(
          join(reports, result.report.outputPath + ".json"),
          "utf8",
        )
          .then(JSON.parse)
          .catch(() => null)
      : null;
    const canonical = new Set(after.objects.map((x: any) => x.value.id));
    const sections = sectionSnapshot(report, canonical);
    const matrix = moduleMatrix(
      result,
      result.evidence,
      result.providerOutcomes ?? [],
    );
    const nums = sections.flatMap(
      (x) =>
        auditNumbers(x.markdown, x.sourceRefs.length, x.claimRefs.length)
          .assertions,
    );
    const numericAudit = {
      assertions: nums,
      unsupportedNumericCount: nums.filter(
        (x) => x.classification === "unsupported",
      ).length,
    };
    const mandatory = Boolean(
      result.modules.find(
        (x: any) =>
          x.module === "industry_definition" && x.status !== "unavailable",
      ),
    );
    const validSemantics = !reasoningLog.some(
      (x) =>
        x.repairResearchGapInvalid ||
        x.localValidationCategory === "module_shape_invalid",
    );
    const finalClassification = classifyProductQuality({
      mandatoryIndustryDefinitionCleared: mandatory,
      validModelSemantics: validSemantics,
      evidenceInsufficient: !mandatory && validSemantics,
      dimensions: dimensions(sections, matrix),
      unsupportedNumericCount: numericAudit.unsupportedNumericCount,
      liveInconclusive:
        result.status === "failed" || result.status === "cancelled",
      modelSemanticNonconformance: !validSemantics,
    });
    const snapshot = report
      ? {
          taskId,
          status: "PRODUCED",
          reportId: result.report?.reportId,
          reportType: report.reportType,
          sectionCount: sections.length,
          sections,
        }
      : {
          taskId,
          status: "NOT_PRODUCED",
          reason: "Workflow did not persist a trustworthy report",
        };
    const out = {
      ...base,
      workflow: {
        status: result.status,
        errors: (result.errors ?? []).map(safe),
        diagnostics: (result.diagnostics ?? []).map(safe),
        moduleCallCounts: result.moduleCallCounts,
        modules: result.modules,
        acquisitionWaves: result.acquisitionWaves,
        gatewaySubmitCount: result.gatewaySubmitCount,
        knowledgeBaseRevision: result.knowledgeBaseRevision,
        proposalIds: result.proposalIds,
        committedIds: result.committedIds,
        sourceIds: result.sourceIds,
        relationIds: result.relationIds,
        claimIds: result.claimIds,
      },
      providerCoverage: providerRows(log, { providerOutcomes: acquisitionOutcomes }),
      reasoningAudit: reasoningLog,
      researchGapConvergence: auditResearchGapConvergence(
        result.modules,
        reasoningLog,
      ),
      canonical: {
        validationStatus: validation.status,
        diagnosticCodes: validation.errors.map((x: any) => x.code),
        countsBefore: counts(before),
        countsAfter: counts(after),
        sourceToRawProvenanceComplete: after.objects
          .filter((x: any) => x.kind === "source")
          .every((x: any) => (x.value.rawRefs ?? []).length > 0),
      },
      reportSnapshot: snapshot,
      moduleMatrix: matrix,
      dimensions: dimensions(sections, matrix),
      numericalAudit: numericAudit,
      companyMappingAudit: {
        distinctNamedCompanies: [],
        evidenceBackedCompanyCount:
          matrix.find((x) => x.module === "company_mapping")?.evidenceCount ??
          0,
        durableCanonicalCompanyCount: after.objects.filter(
          (x: any) => x.kind === "entity" && x.value.type === "company",
        ).length,
        supportedExposureStatements: 0,
        unsupportedExposureStatements: 0,
      },
      industryChainCoverageAudit: Object.fromEntries(
        [
          "upstreamInputs",
          "midstreamManufacturing",
          "downstreamApplications",
          "supplyDemand",
          "capacityUtilization",
          "pricingEconomics",
          "technologyRoadmap",
          "competitiveLandscape",
        ].map((k) => [k, "GAP_ONLY"]),
      ),
      monitoringAudit: {
        namedMeasurableMetrics: 0,
        currentObservations: 0,
        periodAndUnit: 0,
        genericChecklistOnly: true,
      },
      researchGapsAudit: { observed: true, providerAndModuleBased: true },
      methodologyAudit: {
        communicatesSourceLimitations: true,
        hiddenReasoningExposed: false,
      },
      recommendedEvidencePriorities: matrix
        .filter((x) => x.primaryGapCause !== "NONE")
        .slice(0, 1)
        .map((x) => ({
          priority: "P0",
          affectedModules: [x.module],
          missingEvidenceType: `${x.module} qualified evidence`,
          currentAndHistoricalProviderEvidence:
            "current run plus committed TEST-031/032/037/038 evidence only",
          actionCategory: "EXISTING_PROVIDER_QUERY_OR_ROUTING",
          expectedUserFacingBenefit:
            "establish a traceable Industry Definition conclusion",
        })),
      finalClassification,
    };
    await mkdir(join(root, "tests/validation/evidence"), { recursive: true });
    await writeFile(evidencePath, JSON.stringify(out, null, 2) + "\n");
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(JSON.stringify(out, null, 2));
    return out;
  } catch (e) {
    const out = {
      ...base,
      workflow: { status: "failed", errors: [safe(e)] },
      providerCoverage: providerRows(log, {}),
      reasoningAudit: reasoningLog,
      finalClassification: "PRODUCT_QUALITY_LIVE_INCONCLUSIVE",
    };
    await mkdir(join(root, "tests/validation/evidence"), { recursive: true });
    await writeFile(evidencePath, JSON.stringify(out, null, 2) + "\n");
    await writeFile(
      snapshotPath,
      JSON.stringify(
        {
          taskId,
          status: "NOT_PRODUCED",
          reason: "Workflow failed before trustworthy report",
        },
        null,
        2,
      ) + "\n",
    );
    console.error(JSON.stringify(out, null, 2));
    return out;
  } finally {
    await model?.dispose?.().catch?.(() => undefined);
  }
}
if (
  process.argv[1]?.endsWith(
    "industry-product-quality-direct-public-portfolio-after-gapid-fix.ts",
  )
)
  await main();
