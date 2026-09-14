import test from "node:test";
import assert from "node:assert/strict";
import { TEST043_MODULES, TEST043_SECTIONS, classifyTest043, classifyTest043GapCause, auditTest043Numbers, assembleTest043ProductQualityEvidence } from "./industry-product-quality-live-after-miit-definition-evidence-assembly.ts";

test("offline classifier keeps valid evidence-blocked Workflow distinct from live inconclusive", () => {
  assert.equal(classifyTest043({ workflowStatus: "blocked", mandatoryIndustryDefinitionCleared: false, validModelSemantics: true, evidenceInsufficient: true }), "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE");
  assert.equal(classifyTest043({ liveInconclusive: true }), "PRODUCT_QUALITY_LIVE_INCONCLUSIVE");
  assert.equal(classifyTest043({ modelSemanticNonconformance: true }), "PRODUCT_QUALITY_LIVE_INCONCLUSIVE");
  assert.equal(classifyTest043({ harnessError: new Error("audit") }), "PRODUCT_QUALITY_TEST_HARNESS_DEFECT");
});

test("completed sixteen-section assembly reaches ready only when invariants pass", () => {
  const result = assembleTest043ProductQualityEvidence({ workflow: { status: "completed", gatewaySubmitCount: 1, knowledgeBaseRevisionDelta: 1 }, provider: [], canonical: { validationStatus: "valid" }, report: { sections: TEST043_SECTIONS.map((title) => ({ title, canonicalReferencesResolve: true })) }, modules: TEST043_MODULES.map((module) => ({ module, status: "supported" })), reasoning: [], numericalAudit: { unsupportedNumericCount: 0 }, dimensions: TEST043_SECTIONS.slice(0, 6).map((dimension) => ({ dimension, status: "USABLE" })) });
  assert.equal(result.reportInvariants.invariantsPass, true);
  assert.equal(result.finalClassification, "PRODUCT_QUALITY_READY");
});

test("gap-cause and numeric audits remain deterministic and bounded", () => {
  assert.equal(classifyTest043GapCause({ providerEmpty: true, evidenceCount: 0 }), "PROVIDER_EMPTY");
  assert.equal(classifyTest043GapCause({ providerFailed: true, evidenceCount: 0 }), "PROVIDER_EXTERNAL_FAILURE");
  assert.equal(classifyTest043GapCause({ qualifiedEvidenceForModule: true, routedEvidenceCount: 0, evidenceCount: 0 }), "EVIDENCE_ROUTING_GAP");
  assert.equal(classifyTest043GapCause({ evidenceCount: 0 }), "NO_QUALIFIED_EVIDENCE_FOR_MODULE");
  assert.equal(auditTest043Numbers("Growth was 12%.", 0, 0).unsupportedNumericCount, 1);
  assert.equal(auditTest043Numbers("Growth was 12%.", 1, 0).unsupportedNumericCount, 0);
  assert.equal(auditTest043Numbers("Growth unavailable.", 0, 0).unsupportedNumericCount, 0);
});

test("assembly never turns a valid blocked Workflow into live inconclusive", () => {
  const result = assembleTest043ProductQualityEvidence({ workflow: { status: "blocked", gatewaySubmitCount: 0, knowledgeBaseRevisionDelta: 0 }, provider: [], canonical: { validationStatus: "valid" }, report: null, modules: [{ module: "industry_definition", status: "unavailable", evidenceIds: [] }], reasoning: [], numericalAudit: { unsupportedNumericCount: 0 }, dimensions: [] });
  assert.equal(result.finalClassification, "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE");
});
