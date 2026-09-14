import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  TEST041_MODULES,
  TEST041_SECTIONS,
  assembleTest041ProductQualityEvidence,
  auditTest041Numbers,
  classifyTest041,
  classifyTest041GapCause,
} from "./industry-product-quality-rerun-after-audit-harness-fix-assembly.ts";

const workflow = { status: "completed", gatewaySubmitCount: 1, knowledgeBaseRevisionDelta: 1 };
const sections = TEST041_SECTIONS.map((title) => ({
  title,
  markdown: "PCB manufacturing evidence supports the conclusion.",
  sourceRefs: ["source-1"],
  claimRefs: ["claim-1"],
  relationRefs: [],
  canonicalReferencesResolve: true,
}));
const base = () => assembleTest041ProductQualityEvidence({
  workflow,
  provider: [{ provider: "official", attempted: true }],
  canonical: { validationStatus: "valid", sourceToRawProvenanceComplete: true },
  report: { sections },
  modules: TEST041_MODULES.map((module) => ({ module, status: "completed" })),
  reasoning: [],
  numericalAudit: { assertions: [], unsupportedNumericCount: 0 },
  dimensions: [
    { dimension: "scope clarity", status: "USABLE" },
    { dimension: "factual evidence density", status: "USABLE" },
    { dimension: "quantitative and KPI usefulness", status: "USABLE" },
    { dimension: "industry-chain and value-capture usefulness", status: "USABLE" },
    { dimension: "company-mapping usefulness", status: "USABLE" },
    { dimension: "catalysts, risks, monitoring, and invalidation usefulness", status: "USABLE" },
  ],
});

test("complete sixteen-section success assembly has no unresolved variable", () => {
  const result = base();
  assert.equal(result.reportInvariants.invariantsPass, true);
  assert.equal(result.reportSnapshot.sectionCount, 16);
  assert.equal(result.finalClassification, "PRODUCT_QUALITY_READY");
});

test("all blocked, live-inconclusive, evidence-thin, ready, and defect paths assemble", () => {
  assert.equal(classifyTest041({ mandatoryIndustryDefinitionCleared: false, validModelSemantics: true, evidenceInsufficient: true }), "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE");
  assert.equal(classifyTest041({ liveInconclusive: true }), "PRODUCT_QUALITY_LIVE_INCONCLUSIVE");
  assert.equal(classifyTest041({ dimensions: [{ status: "THIN" }] }), "FUNCTIONAL_BUT_EVIDENCE_THIN");
  assert.equal(base().finalClassification, "PRODUCT_QUALITY_READY");
  assert.equal(classifyTest041({ defect: true }), "PRODUCT_QUALITY_DEFECT");
  assert.equal(classifyTest041({ harnessError: new Error("audit failed") }), "PRODUCT_QUALITY_TEST_HARNESS_DEFECT");
});

test("historical numericAudit naming regression is guarded before live execution", async () => {
  const source = await readFile(resolve(import.meta.dirname, "industry-product-quality-rerun-after-audit-harness-fix-assembly.ts"), "utf8");
  assert.match(source, /numericalAudit/);
  assert.doesNotMatch(source, /\bnumericAudit\b/);
  const result = base();
  assert.equal(result.numericalAudit.unsupportedNumericCount, 0);
});

test("numeric audit classifies backed, unavailable, and unsupported assertions", () => {
  assert.equal(auditTest041Numbers("Growth was 12%.", 0, 0).unsupportedNumericCount, 1);
  assert.equal(auditTest041Numbers("Growth was 12%.", 1, 0).unsupportedNumericCount, 0);
  assert.equal(auditTest041Numbers("Growth unavailable.", 0, 0).unsupportedNumericCount, 0);
});

test("gap-cause precedence and observed module causes remain bounded", () => {
  assert.equal(classifyTest041GapCause({ modelSemanticNonconformance: true, evidenceCount: 1 }), "MODEL_SEMANTIC_NONCONFORMANCE");
  assert.equal(classifyTest041GapCause({ providerEmpty: true, evidenceCount: 0 }), "PROVIDER_EMPTY");
  assert.equal(classifyTest041GapCause({ providerFailed: true, evidenceCount: 1 }), "PROVIDER_EXTERNAL_FAILURE");
  assert.equal(classifyTest041GapCause({ evidenceCount: 0 }), "NO_QUALIFIED_EVIDENCE_FOR_MODULE");
  assert.equal(classifyTest041GapCause({ evidenceCount: 1, material: "clear evidence" }), "NONE");
});
