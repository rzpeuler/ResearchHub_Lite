import assert from "node:assert/strict";
import test from "node:test";
import {
  IndustryResearchSkill,
  INDUSTRY_MODULES,
  validateIndustryModuleResult,
  validateIndustryResearchDesign,
  validateCrossModuleSynthesis,
} from "../../../skills/industry-research/index.ts";
import type { ReasoningExecutor } from "../../../plugins/reasoning/contracts.ts";
import {
  INDUSTRY_RESEARCH_DESIGN_CONTRACT,
  INDUSTRY_MODULE_RESULT_CONTRACT,
  INDUSTRY_SYNTHESIS_CONTRACT,
  createIndustryModuleResultContract,
  createIndustrySynthesisContract,
} from "../../../skills/industry-research/contracts.ts";
const design = {
  definitionHypothesis: "A bounded manufacturing industry.",
  targetKind: "industry",
  scope: { included: ["manufacturing"], excluded: ["broad theme"] },
  moduleQuestions: Object.fromEntries(
    INDUSTRY_MODULES.map((m) => [m, `Question for ${m}`]),
  ),
  keyMetrics: ["capacity"],
  evidenceRequirements: ["official"],
  searchTerms: ["fixture industry"],
  knownGaps: [],
  verificationCandidates: [],
};
const source = {
  candidate: {
    candidateId: "s1",
    kind: "official_disclosure" as const,
    tier: 1 as const,
    title: "Official",
    provider: "fixture",
    publishedAt: "2026-09-01",
  },
  retrievedAt: "2026-09-01",
  title: "Official",
  content: "The industry supplies products.",
  contentHash: "a".repeat(64),
  publisher: "Fixture",
  rights: {
    accessScope: "public" as const,
    retentionAllowed: true,
    aiProcessingAllowed: true,
    derivativeKnowledgeAllowed: true,
    redistributionAllowed: false,
  },
};
function executor(output: unknown): ReasoningExecutor {
  return {
    capabilities: () => ({
      maxContextTokens: 1000,
      maxOutputTokens: 1000,
      structuredOutputSupport: true,
      maxConcurrency: 2,
    }),
    execute: async (r) => ({ operation: r.operation, output }),
  };
}
function moduleOutput(module: (typeof INDUSTRY_MODULES)[number]) {
  return {
    module,
    status: "supported",
    analysis: "Bounded analysis.",
    evidenceIds: ["e1"],
    proposals: [],
    gaps: [],
    reportMaterial: {
      markdown: "Evidence-backed.",
      evidenceIds: ["e1"],
      proposalIds: [],
    },
  };
}
test("Industry Skill emits structured operation contracts and operation-specific bounded instructions", async () => {
  const requests: any[] = [];
  const fake: ReasoningExecutor = {
    capabilities: () => ({
      maxContextTokens: 1000,
      maxOutputTokens: 1000,
      structuredOutputSupport: true,
      maxConcurrency: 1,
    }),
    execute: async (r) => {
      requests.push(r);
      return {
        operation: r.operation,
        output:
          r.operation === "industry_research_design"
            ? design
            : r.operation === "industry_module_analysis"
              ? {
                  ...moduleOutput("risk_analysis"),
                  evidenceIds: [],
                  reportMaterial: {
                    markdown: "x",
                    evidenceIds: [],
                    proposalIds: [],
                  },
                }
              : {
                  executiveView: "view",
                  analysis: "analysis",
                  evidenceIds: [],
                  proposals: [],
                  gaps: [],
                  alternativeViews: [],
                  reportMaterial: {
                    markdown: "x",
                    evidenceIds: [],
                    proposalIds: [],
                  },
                },
      };
    },
  };
  const skill = new IndustryResearchSkill(fake);
  await skill.design({ target: { name: "x" }, existingKnowledge: [] });
  await skill.analyze("risk_analysis", {
    target: { name: "x" },
    evidence: [],
    existingKnowledge: [],
    localReferences: [],
  });
  await skill.synthesize({ modules: [], evidence: [] });
  assert.equal(typeof requests[0].outputContract, "object");
  assert.deepEqual(
    requests.map((r) => r.outputContract.name),
    ["IndustryResearchDesign", "IndustryModuleResult", "CrossModuleSynthesis"],
  );
  assert.match(requests[0].instruction, /ontology/i);
  assert.match(requests[1].instruction, /allowlist/i);
  assert.match(requests[2].instruction, /validated modules/i);
  assert.equal(INDUSTRY_RESEARCH_DESIGN_CONTRACT.type, "object");
  assert.equal(INDUSTRY_MODULE_RESULT_CONTRACT.type, "object");
  assert.equal(INDUSTRY_SYNTHESIS_CONTRACT.type, "object");
});
test("Industry Skill repair carries bounded prior candidate and diagnostics, and parses benign JSON wrappers", async () => {
  const requests: any[] = [];
  let n = 0;
  const fake: ReasoningExecutor = {
    capabilities: () => ({
      maxContextTokens: 1000,
      maxOutputTokens: 1000,
      structuredOutputSupport: true,
      maxConcurrency: 1,
    }),
    execute: async (r) => {
      requests.push(r);
      n++;
      return {
        operation: r.operation,
        output:
          n === 1
            ? { output: { invalid: true } }
            : JSON.stringify({ result: design }),
      };
    },
  };
  const result = await new IndustryResearchSkill(fake).design({
    target: { name: "x" },
    existingKnowledge: [],
  });
  assert.equal(result.targetKind, "industry");
  assert.equal(requests.length, 2);
  assert.match(requests[1].instruction, /Prior:/);
  assert.match(requests[1].instruction, /Diagnostics:/);
});
test("Industry Skill exposes exact operations and all eight modules", async () => {
  const skill = new IndustryResearchSkill(executor(design));
  assert.equal(
    (await skill.design({ target: { name: "Fixture" }, existingKnowledge: [] }))
      .targetKind,
    "industry",
  );
  for (const module of INDUSTRY_MODULES)
    assert.equal(
      (
        await new IndustryResearchSkill(executor(moduleOutput(module))).analyze(
          module,
          {
            target: { name: "Fixture" },
            evidence: [{ evidenceId: "e1", source }],
            existingKnowledge: [],
            localReferences: [],
          },
        )
      ).module,
      module,
    );
});
test("Industry Skill rejects canonical IDs, unknown evidence, and bounded evidence escape", () => {
  assert.throws(
    () =>
      validateIndustryModuleResult(
        { ...moduleOutput("market_size_growth"), evidenceIds: ["unknown"] },
        "market_size_growth",
        ["e1"],
      ),
    /evidence/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [
            {
              proposalId: "p",
              kind: "claim",
              subjectKey: "entity:bad",
              claimType: "fact",
              statement: "bad",
              sourceCandidateIds: ["e1"],
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /canonical/,
  );
});
test("Industry Skill performs at most one repair attempt and marks repeated invalid output unavailable", async () => {
  let calls = 0;
  const bad: ReasoningExecutor = {
    capabilities: () => ({
      maxContextTokens: 1,
      maxOutputTokens: 1,
      structuredOutputSupport: true,
      maxConcurrency: 1,
    }),
    execute: async (r) => {
      calls++;
      return { operation: r.operation, output: { invalid: true } };
    },
  };
  const result = await new IndustryResearchSkill(bad).analyze("risk_analysis", {
    target: { name: "Fixture" },
    evidence: [],
    existingKnowledge: [],
    localReferences: [],
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "unavailable");
});
test("Industry Skill validates design gaps, candidates, string arrays and quantitative values", () => {
  assert.throws(
    () =>
      validateIndustryResearchDesign({
        ...design,
        knownGaps: [
          {
            gapId: "entity:bad",
            module: "market_size_growth",
            question: "q",
            reason: "r",
            actionable: true,
          },
        ],
      }),
    /known gap/,
  );
  assert.throws(
    () =>
      validateIndustryResearchDesign({
        ...design,
        verificationCandidates: [{ name: "x", kind: "person", reason: "r" }],
      }),
    /candidate/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [
            {
              proposalId: "p",
              kind: "claim",
              subjectKey: "local",
              claimType: "fact",
              statement: "q",
              sourceCandidateIds: ["e1"],
              structuredValue: {
                metric: "m",
                value: NaN,
                unit: "u",
                comparator: "eq",
                period: "2026",
              },
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /quantitative/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [
            {
              proposalId: "p",
              kind: "claim",
              subjectKey: "local",
              claimType: "unknown",
              statement: "q",
              sourceCandidateIds: ["e1"],
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /Claim/,
  );
});
test("Industry Skill rejects producer-owned canonical bindings and malformed local report material", () => {
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [
            {
              proposalId: "p",
              kind: "claim",
              subjectKey: "local",
              claimType: "fact",
              statement: "q",
              sourceCandidateIds: ["e1"],
              existingKnowledgeRefs: ["claim:canonical"],
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /canonical resolution/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          reportMaterial: {
            markdown: "x",
            evidenceIds: ["e1"],
            proposalIds: [],
            relationProposalIds: ["p"],
          },
        },
        "market_size_growth",
        ["e1"],
      ),
    /local report material/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          gaps: [
            {
              gapId: "g",
              module: "market_size_growth",
              question: "q",
              reason: "r",
              actionable: true,
              searchTerms: ["x", "x"],
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /Research Gap/,
  );
});
test("CrossModuleSynthesis validates module Relation report references separately from proposal IDs", () => {
  const relation = {
    proposalId: "rel",
    kind: "relation",
    subjectKey: "company",
    targetKey: "product",
    relationType: "offers_product",
    sourceCandidateIds: ["e1"],
  };
  const base = {
    executiveView: "view",
    analysis: "analysis",
    evidenceIds: ["e1"],
    proposals: [],
    gaps: [],
    alternativeViews: [],
  };
  assert.doesNotThrow(() =>
    validateCrossModuleSynthesis(
      {
        ...base,
        reportMaterial: {
          markdown: "relation-backed",
          evidenceIds: ["e1"],
          proposalIds: ["rel"],
          relationProposalIds: ["rel"],
        },
      },
      ["e1"],
      ["rel"],
      ["rel"],
    ),
  );
  assert.throws(
    () =>
      validateCrossModuleSynthesis(
        {
          ...base,
          proposals: [relation],
          reportMaterial: {
            markdown: "bad",
            evidenceIds: ["e1"],
            proposalIds: ["rel"],
            relationProposalIds: ["company"],
          },
        },
        ["e1"],
        [],
        ["rel"],
      ),
    /local report material/,
  );
});

test("Industry Skill target diagnosis accepts exactly the five contract kinds and rejects others", () => {
  for (const targetKind of [
    "industry",
    "theme",
    "product",
    "technology",
    "uncertain",
  ] as const)
    assert.equal(
      validateIndustryResearchDesign({ ...design, targetKind }).targetKind,
      targetKind,
    );
  assert.throws(
    () => validateIndustryResearchDesign({ ...design, targetKind: "company" }),
    /target diagnosis/,
  );
});

test("Industry Skill rejects duplicate or malformed ResearchDesign arrays and gap IDs", () => {
  for (const key of [
    "keyMetrics",
    "evidenceRequirements",
    "searchTerms",
  ] as const) {
    assert.throws(
      () => validateIndustryResearchDesign({ ...design, [key]: ["x", "x"] }),
      /non-empty string array/,
    );
    assert.throws(
      () => validateIndustryResearchDesign({ ...design, [key]: [""] }),
      /non-empty string array/,
    );
  }
  const gap = {
    gapId: "gap",
    module: "market_size_growth",
    question: "q",
    reason: "r",
    actionable: true,
  };
  assert.throws(
    () => validateIndustryResearchDesign({ ...design, knownGaps: [gap, gap] }),
    /known gap/,
  );
  assert.throws(
    () =>
      validateIndustryResearchDesign({
        ...design,
        knownGaps: [{ ...gap, searchTerms: ["x", "x"] }],
      }),
    /known gap/,
  );
});

test("Industry Skill rejects invalid verification kind, canonical IDs, resolution fields, links, and quantitative values", () => {
  assert.throws(
    () =>
      validateIndustryResearchDesign({
        ...design,
        verificationCandidates: [{ name: "x", kind: "person", reason: "r" }],
      }),
    /candidate/,
  );
  const base = {
    proposalId: "p",
    kind: "claim",
    subjectKey: "local",
    claimType: "fact",
    statement: "q",
    sourceCandidateIds: ["e1"],
  };
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [{ ...base, proposalId: "entity:bad" }],
        },
        "market_size_growth",
        ["e1"],
      ),
    /canonical/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [{ ...base, existingKnowledgeRefs: ["x"] }],
        },
        "market_size_growth",
        ["e1"],
      ),
    /canonical resolution/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [{ ...base, supportsProposalIds: ["missing"] }],
        },
        "market_size_growth",
        ["e1"],
      ),
    /unresolved/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          proposals: [
            {
              ...base,
              structuredValue: {
                metric: "m",
                value: NaN,
                unit: "u",
                comparator: "eq",
                period: "2026",
              },
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /quantitative/,
  );
});

test("Industry Skill validates module and synthesis report material, references, gaps, and relation-only IDs", () => {
  const badMaterial = {
    ...moduleOutput("market_size_growth"),
    reportMaterial: {
      markdown: "x",
      evidenceIds: ["e1"],
      proposalIds: ["missing"],
    },
  };
  assert.throws(
    () =>
      validateIndustryModuleResult(badMaterial, "market_size_growth", ["e1"]),
    /local report material/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        {
          ...moduleOutput("market_size_growth"),
          gaps: [
            {
              gapId: "g",
              module: "risk_analysis",
              question: "q",
              reason: "r",
              actionable: true,
            },
          ],
        },
        "market_size_growth",
        ["e1"],
      ),
    /Research Gap/,
  );
  const base = {
    executiveView: "view",
    analysis: "analysis",
    evidenceIds: ["e1"],
    proposals: [],
    gaps: [],
    alternativeViews: [],
  };
  assert.throws(
    () =>
      validateCrossModuleSynthesis(
        {
          ...base,
          reportMaterial: {
            markdown: "x",
            evidenceIds: ["e1"],
            proposalIds: ["missing"],
          },
        },
        ["e1"],
        [],
        [],
      ),
    /local report material/,
  );
  const relation = {
    proposalId: "rel",
    kind: "relation",
    subjectKey: "company",
    targetKey: "product",
    relationType: "offers_product",
    sourceCandidateIds: ["e1"],
  };
  assert.doesNotThrow(() =>
    validateCrossModuleSynthesis(
      {
        ...base,
        proposals: [relation],
        reportMaterial: {
          markdown: "x",
          evidenceIds: ["e1"],
          proposalIds: [],
          relationProposalIds: ["rel"],
        },
      },
      ["e1"],
      [],
      ["rel"],
    ),
  );
});

test("Industry contracts expose complete design item schemas and accept empty scope arrays", () => {
  assert.deepEqual(
    INDUSTRY_RESEARCH_DESIGN_CONTRACT.properties.scope.properties.included
      .minItems,
    0,
  );
  assert.equal(
    INDUSTRY_RESEARCH_DESIGN_CONTRACT.properties.moduleQuestions.properties
      .industry_definition.type,
    "string",
  );
  assert.equal(
    INDUSTRY_RESEARCH_DESIGN_CONTRACT.properties.verificationCandidates.items
      .additionalProperties,
    false,
  );
  assert.doesNotThrow(() =>
    validateIndustryResearchDesign({
      ...design,
      scope: { included: [], excluded: [] },
    }),
  );
});

test("Industry module and synthesis contracts bind exact modules and allowlists", () => {
  const moduleContract = createIndustryModuleResultContract(
    "risk_analysis",
    ["e1"],
    ["existing"],
  );
  assert.deepEqual(moduleContract.properties.module.const, "risk_analysis");
  assert.deepEqual(moduleContract.allowlists.evidenceIds, ["e1"]);
  assert.throws(
    () =>
      validateIndustryModuleResult(
        { ...moduleOutput("market_size_growth") },
        "risk_analysis",
        ["e1"],
      ),
    /module/,
  );
  assert.throws(
    () =>
      validateIndustryModuleResult(
        { ...moduleOutput("risk_analysis"), evidenceIds: ["unknown"] },
        "risk_analysis",
        ["e1"],
      ),
    /evidence/,
  );
  const synthesis = createIndustrySynthesisContract(["e1"], ["p1"], ["r1"]);
  assert.deepEqual(synthesis.allowlists.existingRelationProposalIds, ["r1"]);
  assert.equal(
    (
      synthesis.properties.reportMaterial.properties.relationProposalIds
        .items as any
    ).enum[0],
    "r1",
  );
});

test("Industry proposal variants and quantitative claims state evidence and period requirements", () => {
  const variants = createIndustryModuleResultContract("risk_analysis", ["e1"])
    .properties.proposals.items.oneOf;
  assert.deepEqual(
    variants.map((variant: any) => variant.required),
    [
      ["proposalId", "kind", "subjectKey", "entityType", "entityName"],
      [
        "proposalId",
        "kind",
        "subjectKey",
        "targetKey",
        "relationType",
        "sourceCandidateIds",
      ],
      [
        "proposalId",
        "kind",
        "subjectKey",
        "claimType",
        "statement",
        "sourceCandidateIds",
      ],
    ],
  );
  const quantitative = {
    ...moduleOutput("risk_analysis"),
    proposals: [
      {
        proposalId: "p",
        kind: "claim",
        subjectKey: "local",
        claimType: "fact",
        statement: "q",
        sourceCandidateIds: ["e1"],
        structuredValue: { metric: "m", value: 1, unit: "u", comparator: "eq" },
      },
    ],
  };
  assert.equal((variants[2] as any).properties.structuredValue.anyOf.length, 2);
  assert.doesNotThrow(() =>
    validateIndustryModuleResult(quantitative, "risk_analysis", ["e1"]),
  );
});
